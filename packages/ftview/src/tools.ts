/**
 * The FTView read surface: six intents over one opened export folder.
 *
 * @module dsh-engineering-ftview/tools
 */

import { EngineeringError, choice, integer, object, optionalInteger, optionalString, requiredString, string, success, tool, type Coverage, type ToolDefinition } from './core.ts'
import type { DisplayFile, TagRow } from './model.ts'
import { findingsOf } from './checks.ts'
import { liveMapOf } from './live.ts'
import { ELEMENT_TYPES, TYPE_GUIDE, observeObjects } from './catalog.ts'
import { designFindings } from './design.ts'
import { acceptAsset, prepareAlarmExport, prepareDisplayImport, prepareTagExport } from './studio-assets.ts'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ViewSession } from './session.ts'

/** What this surface cannot prove. */
const COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'vendor XSD schema validation',
    'PLC binding and runtime behavior',
    'visual rendering',
    'displays or tags absent from the supplied export',
  ],
}

/** The view handle parameter, described once. */
const VIEW_ID = string('View handle returned by ftview_open. Omit when exactly one export is open in this chat.')

/** Page parameters shared by the list-shaped tools. */
const PAGE = {
  offset: integer('Number of rows to skip. Default 0.', { minimum: 0, default: 0 }),
  limit: integer('Most rows to return. Default 50, maximum 200.', { minimum: 1, maximum: 200, default: 50 }),
}

/** Slice one page. */
function page<T>(rows: readonly T[], offset: number, limit: number): { rows: readonly T[]; offset: number; limit: number; total: number; truncated: boolean } {
  return { rows: rows.slice(offset, offset + limit), offset, limit, total: rows.length, truncated: offset + limit < rows.length }
}

/** Display rows shared by list and compare. */
function displayRows(displays: readonly DisplayFile[]): readonly Record<string, unknown>[] {
  return displays.map(display => ({ name: display.name, file: display.file, objects: display.objects.length }))
}

/** Tag rows shared by list and compare. */
function tagRows(tags: readonly TagRow[]): readonly Record<string, unknown>[] {
  return tags.map(tag => ({ name: tag.name, type: tag.type, description: tag.description }))
}

/** The closest names for a not-found failure. */
function nearest(names: readonly string[], wanted: string): readonly string[] {
  const lower = wanted.toLowerCase()
  return names.filter(name => name.toLowerCase().includes(lower)).slice(0, 5)
}

/**
 * The read tools, bound to one chat's view store.
 *
 * @param session - View handles for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function ftviewTools(session: ViewSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'ftview_open',
      description: 'Open one FactoryTalk View ME export folder and return its application summary: displays, tag rows, structural diagnostics and coverage. Read-only; does not decode MER, contact a terminal, or change files.',
      parameters: object({
        root: string('Export folder containing the display XML files and the HMI tag CSV. Example: "C:/Projects/Line/ME Export".'),
      }, ['root']),
      async run(args, exec) {
        const view = await session.open(requiredString(args, 'root'), exec)
        const { app } = view
        return success(
          `${app.name}: ${app.displays.length} displays, ${app.tags.length} tags, ${app.diagnostics.length + app.tagErrors.length} diagnostic(s).`,
          {
            view_id: view.id,
            root: app.root,
            name: app.name,
            displays: app.displays.length,
            tags: app.tags.length,
            tag_files: app.tagFiles,
            diagnostics: app.diagnostics,
            tag_errors: app.tagErrors,
            files: app.files.length,
          },
          [
            { tool: 'ftview_list', args: { view_id: view.id, kind: 'display' }, why: 'List the displays you can read.' },
            { tool: 'ftview_check', args: { view_id: view.id }, why: 'See the structural findings before reporting.' },
          ],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_list',
      description: 'List the displays or the HMI tags in one opened export, with a name filter and paging.',
      parameters: object({
        view_id: VIEW_ID,
        kind: choice('What to list: the display files or the HMI tag rows.', ['display', 'tag']),
        filter: string('Optional case-insensitive substring for the display or tag name.'),
        ...PAGE,
      }, ['kind']),
      async run(args, exec) {
        const { app } = session.require(optionalString(args, 'view_id'), exec)
        const kind = requiredString(args, 'kind')
        const filter = optionalString(args, 'filter')?.toLowerCase()
        const rows = kind === 'tag'
          ? tagRows(filter === undefined ? app.tags : app.tags.filter(tag => tag.name.toLowerCase().includes(filter) || tag.description.toLowerCase().includes(filter)))
          : displayRows(filter === undefined ? app.displays : app.displays.filter(display => display.name.toLowerCase().includes(filter) || display.file.toLowerCase().includes(filter)))
        const sliced = page(rows, optionalInteger(args, 'offset') ?? 0, optionalInteger(args, 'limit') ?? 50)
        return success(
          `${sliced.total} ${kind === 'tag' ? 'tags' : 'displays'}${sliced.truncated ? `; showing ${sliced.offset + 1}-${sliced.offset + sliced.rows.length}` : ''}.`,
          { kind, ...sliced },
          [{ tool: 'ftview_get', args: { view_id: optionalString(args, 'view_id'), kind, name: 'NAME' }, why: 'Read one row in full.' }],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_get',
      description: 'Read one display or one HMI tag in full: a display exposes its named objects; a tag exposes its CSV row.',
      parameters: object({
        view_id: VIEW_ID,
        kind: choice('What to read: one display file or one HMI tag row.', ['display', 'tag']),
        name: string('Exact display name or tag name. Example: "Main" or "StartPB".'),
      }, ['kind', 'name']),
      async run(args, exec) {
        const { app } = session.require(optionalString(args, 'view_id'), exec)
        const kind = requiredString(args, 'kind')
        const name = requiredString(args, 'name')
        if (kind === 'tag') {
          const tag = app.tags.find(candidate => candidate.name === name)
          if (tag === undefined) {
            const candidates = nearest(app.tags.map(candidate => candidate.name), name)
            throw new EngineeringError('COMPONENT_NOT_FOUND', `No tag is named ${JSON.stringify(name)} in this export.`, candidates.length > 0 ? `Pass one of: ${candidates.join(', ')}.` : 'Call ftview_list with kind "tag" to see the exported tag names.', candidates)
          }
          return success(`Tag ${tag.name}.`, tag, [], COVERAGE)
        }
        const display = app.displays.find(candidate => candidate.name === name)
        if (display === undefined) {
          const candidates = nearest(app.displays.map(candidate => candidate.name), name)
          throw new EngineeringError('COMPONENT_NOT_FOUND', `No display is named ${JSON.stringify(name)} in this export.`, candidates.length > 0 ? `Pass one of: ${candidates.join(', ')}.` : 'Call ftview_list with kind "display" to see the exported display names.', candidates)
        }
        return success(
          `Display ${display.name}: ${display.objects.length} objects.`,
          { name: display.name, file: display.file, objects: display.objects.slice(0, 200), object_count: display.objects.length },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_find',
      description: 'Search one opened export by name or text across displays, display objects and HMI tags.',
      parameters: object({
        view_id: VIEW_ID,
        query: string('Text to search for, case-insensitive. Example: "StartPB".'),
        limit: integer('Most matches to return. Default 50, maximum 200.', { minimum: 1, maximum: 200, default: 50 }),
      }, ['query']),
      async run(args, exec) {
        const { app } = session.require(optionalString(args, 'view_id'), exec)
        const query = requiredString(args, 'query').toLowerCase()
        const matches: { kind: string; where: string; text: string }[] = []
        for (const display of app.displays) {
          if (display.name.toLowerCase().includes(query) || display.file.toLowerCase().includes(query)) {
            matches.push({ kind: 'display', where: display.file, text: display.name })
          }
          for (const object of display.objects) {
            const named = object.name ?? ''
            const values = Object.values(object.attributes)
            const hit = named.toLowerCase().includes(query) || values.some(value => value.toLowerCase().includes(query))
            if (hit) matches.push({ kind: 'object', where: display.file, text: named === '' ? object.type : `${object.type} ${named}` })
          }
        }
        for (const tag of app.tags) {
          if (tag.name.toLowerCase().includes(query) || tag.description.toLowerCase().includes(query)) {
            matches.push({ kind: 'tag', where: 'tag CSV', text: `${tag.name}${tag.description === '' ? '' : ` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${tag.description}`}` })
          }
        }
        const limit = optionalInteger(args, 'limit') ?? 50
        return success(
          `${matches.length} match(es) for ${JSON.stringify(requiredString(args, 'query'))}${matches.length > limit ? `; showing ${limit}` : ''}.`,
          { query: requiredString(args, 'query'), total: matches.length, matches: matches.slice(0, limit) },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_check',
      description: 'Run structural checks over one opened export: tag CSV integrity, duplicate names within displays and the tag file, and files that did not parse. Vendor XSD validation and PLC binding are not performed.',
      parameters: object({ view_id: VIEW_ID }, []),
      async run(args, exec) {
        const { app } = session.require(optionalString(args, 'view_id'), exec)
        const findings = findingsOf(app)
        const byRule: Record<string, number> = {}
        for (const finding of findings) byRule[finding.rule] = (byRule[finding.rule] ?? 0) + 1
        return success(
          `${findings.length} finding(s) in ${app.name}.`,
          { total: findings.length, by_rule: byRule, findings, coverage: { schema: 'not run', plc_binding: 'not run' } },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_compare',
      description: 'Compare two opened exports by display name, tag name and file content hash.',
      parameters: object({
        before_id: string('View id of the earlier export.'),
        after_id: string('View id of the later export.'),
        ...PAGE,
      }, ['before_id', 'after_id']),
      async run(args, exec) {
        const before = session.require(requiredString(args, 'before_id'), exec).app
        const after = session.require(requiredString(args, 'after_id'), exec).app
        const names = (app: { displays: readonly DisplayFile[]; tags: readonly TagRow[] }) => ({
          displays: new Map(app.displays.map(display => [display.name, display.file])),
          tags: new Map(app.tags.map(tag => [tag.name, tag.type])),
        })
        const oldNames = names(before)
        const newNames = names(after)
        const diff = (left: Map<string, string>, right: Map<string, string>) => ({
          added: [...right.keys()].filter(name => !left.has(name)),
          removed: [...left.keys()].filter(name => !right.has(name)),
        })
        const hashOf = new Map(before.files.map(file => [file.file, file.sha256]))
        const changedFiles = after.files.filter(file => hashOf.get(file.file) !== file.sha256).map(file => file.file)
        const limit = optionalInteger(args, 'limit') ?? 50
        return success(
          `${diff(oldNames.displays, newNames.displays).added.length + diff(oldNames.displays, newNames.displays).removed.length} display change(s), ${diff(oldNames.tags, newNames.tags).added.length + diff(oldNames.tags, newNames.tags).removed.length} tag change(s), ${changedFiles.length} changed file(s).`,
          {
            displays: diff(oldNames.displays, newNames.displays),
            tags: diff(oldNames.tags, newNames.tags),
            files_changed: changedFiles.slice(0, limit),
            truncated: changedFiles.length > limit,
          },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_object_types',
      description: 'Catalog the object types the export uses, with each type’s attributes, how often they occur and example values. Read-only; the answer agents need before authoring an object.',
      parameters: object({
        view_id: VIEW_ID,
        type: string('Optional exact element type, e.g. "momentaryButton", to list its attributes.'),
        all: string('Pass "true" to list every element type drafting accepts, including ones this export does not use.'),
        limit: integer('Most types to return. Defaults to 20.', { minimum: 1, maximum: 200 }),
      }, []),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const catalog = observeObjects(view.app)
        const wanted = optionalString(args, 'type')
        const limit = optionalInteger(args, 'limit') ?? 20
        if (optionalString(args, 'all') === 'true') {
          return success(
            `${ELEMENT_TYPES.size} element types are drawable; ${catalog.length} occur in this export.`,
            {
              all_types: [...ELEMENT_TYPES].sort(),
              guide: TYPE_GUIDE,
              used_types: catalog.map(entry => entry.type),
              unused_types: [...ELEMENT_TYPES].filter(type => !catalog.some(entry => entry.type === type)).sort(),
            },
            [],
            COVERAGE,
          )
        }
        if (wanted !== undefined) {
          const entry = catalog.find(candidate => candidate.type === wanted)
          if (entry === undefined) {
            throw new EngineeringError('COMPONENT_NOT_FOUND', `No ${wanted} objects are present in this export.`, 'Call ftview_object_types without a type to see what the export uses, or with all="true" for every drawable type.')
          }
          return success(
            `${entry.type}: ${entry.used} object(s); ${entry.attributes.length} attribute(s).`,
            { type: entry.type, used: entry.used, names: entry.names, attributes: entry.attributes },
            [],
            COVERAGE,
          )
        }
        return success(
          `${catalog.length} object type(s) observed; top: ${catalog.slice(0, 5).map(entry => `${entry.type} (${entry.used})`).join(', ')}.`,
          { types: catalog.slice(0, limit), truncated: catalog.length > limit },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_design_check',
      description: 'Rule-based HMI design checks from the engineering corpus: touch targets (VIEW-HPM-02), missing captions (VIEW-HPM-01), text contrast (VIEW-COLOR-01) and reachability (VIEW-NAV-01).',
      parameters: object({
        view_id: VIEW_ID,
        limit: integer('Most findings to return. Defaults to 40.', { minimum: 1, maximum: 200 }),
      }, []),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const limit = optionalInteger(args, 'limit') ?? 40
        const findings = designFindings(view.app)
        const count = (severity: string): number => findings.filter(finding => finding.severity === severity).length
        return success(
          `${findings.length} design finding(s): ${count('error')} error, ${count('warning')} warning, ${count('info')} info.`,
          { findings: findings.slice(0, limit), truncated: findings.length > limit },
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_live_map',
      description: 'Map the export’s HMI tags to controller tags using the tag CSV Address column, and report how many can be live. Read-only: no controller contact and no invented values.',
      parameters: object({
        view_id: VIEW_ID,
        limit: integer('Most tag rows to return. Defaults to 40.', { minimum: 1, maximum: 500 }),
        live_only: string('Pass "true" to return only controller-backed tags.'),
      }, []),
      async run(args, exec) {
        const view = session.require(optionalString(args, 'view_id'), exec)
        const map = liveMapOf(view.app)
        const limit = optionalInteger(args, 'limit') ?? 40
        const liveOnly = optionalString(args, 'live_only') === 'true'
        const rows = (liveOnly ? map.tags.filter(tag => tag.live) : map.tags).slice(0, limit)
        const summary = `${map.totals.live} of ${map.totals.all} tag(s) name a controller tag; ${map.totals.memory} are memory, ${map.totals.direct} use a direct address; topics: ${map.topics.join(', ') || 'none'}.`
        return success(
          summary,
          {
            application: map.application,
            totals: map.totals,
            topics: map.topics,
            devices: map.devices,
            tags: rows,
            truncated: rows.length < (liveOnly ? map.tags.filter(tag => tag.live).length : map.tags.length),
          },
          [
            {
              tool: 'ftview_live_map',
              args: { view_id: optionalString(args, 'view_id') ?? '', live_only: 'true' },
              why: 'A live preview reads these controller tags over EtherNet/IP once a route is configured; memory tags are shown as not-live rather than made up.',
            },
          ],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_studio_export_prepare',
      description: 'Plan a fresh tag-database export for one application: resolve its .med, confirm Rockwell’s Tag Import and Export Wizard is installed, and return the exact wizard steps and destination file. Does not click anything.',
      parameters: object({
        application: string('Application name as ftview_apps lists it.'),
        kind: choice('Asset kind to prepare: tags or alarms. Defaults to tags.', ['tags', 'alarms']),
      }, ['application']),
      async run(args) {
        const application = requiredString(args, 'application')
        const kind = optionalString(args, 'kind') ?? 'tags'
        try {
          const plan = kind === 'alarms' ? prepareAlarmExport(application) : prepareTagExport(application)
          return success(
            `Prepared tag export for ${application}: run the wizard, then accept ${plan.destination}.`,
            plan,
            [],
            COVERAGE,
          )
        } catch (error) {
          throw new EngineeringError('EXPORT_PREPARE_FAILED', error instanceof Error ? error.message : String(error), 'Check the application name with ftview_apps and that the host has FactoryTalk View installed.')
        }
      },
    }),
    tool({
      name: 'ftview_studio_export_accept',
      description: 'Validate a tag CSV or alarm XML produced by Rockwell’s wizards, count its contents and optionally copy it into an export folder. Refuses empty or wrong-shaped files.',
      parameters: object({
        kind: choice('Asset kind to accept: tags (CSV) or alarms (XML).', ['tags', 'alarms']),
        source: string('File the wizard wrote.'),
        destination: string('Optional export folder, or an exact .csv/.xml target.'),
      }, ['kind', 'source']),
      async run(args) {
        const kind = requiredString(args, 'kind') as 'tags' | 'alarms'
        const source = requiredString(args, 'source')
        try {
          const accepted = acceptAsset(kind, source, optionalString(args, 'destination'))
          return success(
            `Accepted ${kind}: ${accepted.entries} entr(ies), ${accepted.bytes} byte(s) from ${accepted.modified}${accepted.copiedTo === undefined ? '' : `, copied to ${accepted.copiedTo}`}.`,
            accepted,
            [],
            COVERAGE,
          )
        } catch (error) {
          throw new EngineeringError('EXPORT_ACCEPT_FAILED', error instanceof Error ? error.message : String(error), 'Point source at the file the wizard wrote; tags need the ";Tag Type, Tag Name" header, alarms need an <alarms> root.')
        }
      },
    }),
    tool({
      name: 'ftview_studio_import_prepare',
      description: 'Package displays from an applied export for Studio’s Graphics Import Export Wizard: copies the selected <gfx> display XML files and writes the gfxImport batch file, then returns the wizard steps. Does not import by itself.',
      parameters: object({
        export_root: string('Applied export folder that contains Displays/.'),
        displays: string('Display names to import, separated by commas, without .xml.'),
        output_root: string('Optional new folder for the package; defaults to a folder under the system temp directory.'),
      }, ['export_root', 'displays']),
      async run(args) {
        const exportRoot = requiredString(args, 'export_root')
        const names = requiredString(args, 'displays').split(',').map(name => name.trim()).filter(name => name !== '')
        const outputRoot = optionalString(args, 'output_root') ?? join(tmpdir(), `ftview-import-${Date.now().toString(36)}`)
        try {
          const plan = prepareDisplayImport(exportRoot, names, outputRoot)
          return success(
            `Packaged ${plan.displays.length} display(s) for import: batch file ${plan.manifest}.`,
            plan,
            [],
            COVERAGE,
          )
        } catch (error) {
          throw new EngineeringError('IMPORT_PREPARE_FAILED', error instanceof Error ? error.message : String(error), 'Pass an applied export folder and display names it actually contains; each display file must be a <gfx> document.')
        }
      },
    }),
  ]
}

