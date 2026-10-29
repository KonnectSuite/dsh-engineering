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
import { defaultTagCsv, exportTagSnapshot } from './tagdb.ts'
import { defaultAlarmXml, exportAlarmSnapshot } from './alarmdb.ts'
import { capabilities } from './capabilities.ts'
import { crossReference, readL5x } from './cross.ts'
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
export function ftviewTools(session: ViewSession, read?: (path: string) => Promise<string>): readonly ToolDefinition[] {
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
      name: 'ftview_cross_reference',
      description: 'Join the HMI tags of one opened export to the tags and logic of a Studio 5000 L5X: device address to PLC tag, display usage, logic usage, and the tags that exist on only one side.',
      parameters: object({
        view_id: VIEW_ID,
        l5x_path: string('Path to the .L5X export the HMI talks to. Example: "C:/Projects/Line/Line.L5X".'),
        include_memory: choice('Include HMI memory tags as rows.', ['yes', 'no']),
        limit: integer('Most rows and findings to return. Default 50, maximum 200.', { minimum: 1, maximum: 200, default: 50 }),
      }, ['l5x_path']),
      async run(args, exec) {
        const { app } = session.require(optionalString(args, 'view_id'), exec)
        const path = requiredString(args, 'l5x_path')
        const limit = optionalInteger(args, 'limit') ?? 50
        if (read === undefined) {
          throw new EngineeringError('UNAVAILABLE', 'This host exposes no filesystem reader, so the L5X cannot be opened.', 'Run inside a chat that provides a filesystem service.')
        }
        let plc
        try {
          plc = readL5x(await read(path))
        } catch (cause) {
          throw new EngineeringError('FILE_UNREADABLE', `Cannot read an L5X at ${path}: ${cause instanceof Error ? cause.message : String(cause)}.`, 'Pass the path of a Studio 5000 L5X export on this host.')
        }
        const displays = new Map<string, string>()
        const base = app.root.replace(/[\\/]+$/u, '')
        for (const display of app.displays) {
          try {
            const target = display.file.startsWith(`${base}/`) ? display.file : `${base}/${display.file}`
            displays.set(display.file, await read(target))
          } catch {
            // A display the scan read but the filesystem no longer serves adds no usage.
          }
        }
        const report = crossReference(app, plc, { limit, includeMemory: optionalString(args, 'include_memory') === 'yes', displays })
        const { counts } = report
        return success(
          `${counts.linked} of ${counts.hmiTags} HMI tags resolve to ${counts.plcTags} PLC tags: ${counts.unlinked} unlinked, ${counts.memory} memory, ${counts.unsupported} data-table; ${counts.plcUnreferencedByHmi} PLC tags are neither referenced by logic nor pointed at.`,
          report,
          [
            { tool: 'ftview_cross_reference', args: { view_id: optionalString(args, 'view_id'), l5x_path: path, include_memory: 'yes' }, why: 'Include the memory tags to see every HMI tag at once.' },
            { tool: 'find_references', args: { symbol: 'PLC_TAG' }, why: 'Read the rungs behind one PLC tag in the L5X project.' },
          ],
          {
            complete: false,
            unverified: [
              'PLC read/write direction: the L5X text is counted, not typed, so a tag can be both read and written.',
              'Device address shortcuts are not resolved to a controller; only the tag path after the brackets is compared.',
              'Members and array elements join to their root tag; no member-level typing is verified.',
              'AOI-internal tags and Add-On Instruction parameters are not expanded.',
            ],
          },
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
            matches.push({ kind: 'tag', where: 'tag CSV', text: `${tag.name}${tag.description === '' ? '' : ` ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ${tag.description}`}` })
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
      description: 'Catalog the object types the export uses, with each typeâ€™s attributes, how often they occur and example values. Read-only; the answer agents need before authoring an object.',
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
      description: 'Map the exportâ€™s HMI tags to controller tags using the tag CSV Address column, and report how many can be live. Read-only: no controller contact and no invented values.',
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
      description: 'Plan a fresh tag-database or alarm export for one application: resolve its .med, confirm the vendor wizard, and return the exact wizard steps and destination file. Pass export_root to have the wizard write the snapshot straight into an export folder (Tags/ or Alarms/) instead of the project store. Does not click anything.',
      parameters: object({
        application: string('Application name as ftview_apps lists it.'),
        kind: choice('Asset kind to prepare: tags or alarms. Defaults to tags.', ['tags', 'alarms']),
        export_root: string('Optional export folder to write the snapshot into directly (Tags/ or Alarms/), instead of the project store.'),
      }, ['application']),
      async run(args) {
        const application = requiredString(args, 'application')
        const kind = optionalString(args, 'kind') ?? 'tags'
        const exportRoot = optionalString(args, 'export_root')
        try {
          const plan = kind === 'alarms' ? prepareAlarmExport(application, undefined, exportRoot) : prepareTagExport(application, undefined, undefined, exportRoot)
          return success(
            `Prepared ${kind === 'alarms' ? 'alarm' : 'tag'} export for ${application}: run the wizard, then accept ${plan.destination}.`,
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
      description: 'Validate a tag CSV or alarm XML produced by Rockwellâ€™s wizards, count its contents and optionally copy it into an export folder. Refuses empty or wrong-shaped files.',
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
      name: 'ftview_tag_snapshot',
      description: 'Write the application tag CSV without the tag wizard: attaches a copy of the application tag database (TAG\\<app>.MDF) to the local SQL Server instance and renders the wizard-identical CSV, including folder rows, ordering, labels and embedded newlines. Use instead of ftview_studio_export_prepare for tags; the wizard remains the fallback when no SQL Server client tools or instance exist.',
      parameters: object({
        application: string('Application name as ftview_apps lists it.'),
        output: string('Optional CSV path to write. Defaults to <project store>\\<application>\\<application>-Tags.CSV.'),
      }, ['application']),
      async run(args) {
        const application = requiredString(args, 'application')
        const output = optionalString(args, 'output') ?? defaultTagCsv(application)
        const snapshot = exportTagSnapshot(application, output)
        return success(
          `Tag snapshot for ${application}: ${snapshot.tags} tag(s), ${snapshot.folders} folder(s), ${snapshot.bytes} byte(s) at ${snapshot.path}, read from ${snapshot.instance}.`,
          snapshot,
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_alarm_snapshot',
      description: 'Write the alarm configuration XML without the Alarm Import Export Wizard: decodes M_Alarms\\MachineAlarms.mal (OLE2 compound file) into the wizard-identical <alarms> document, including triggers, messages, colours, flags and the settings block. Use instead of ftview_studio_export_prepare for alarms; the wizard remains the fallback for older database versions or when decoding is refused.',
      parameters: object({
        application: string('Application name as ftview_apps lists it.'),
        output: string('Optional XML path to write. Defaults to <project store>\\<application>\\<application>-Alarms.xml.'),
      }, ['application']),
      async run(args) {
        const application = requiredString(args, 'application')
        const output = optionalString(args, 'output') ?? defaultAlarmXml(application)
        const snapshot = exportAlarmSnapshot(application, output)
        return success(
          `Alarm snapshot for ${application}: ${snapshot.triggers} trigger(s), ${snapshot.messages} message(s), ${snapshot.bytes} byte(s) at ${snapshot.path}, decoded from ${snapshot.mal}.`,
          snapshot,
          [],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'ftview_studio_import_prepare',
      description: 'Package displays from an applied export for Studioâ€™s Graphics Import Export Wizard: copies the selected <gfx> display XML files and writes the gfxImport batch file, then returns the wizard steps. Does not import by itself.',
      parameters: object({
        export_root: string('Applied export folder that contains Displays/.'),
        displays: string('Display names to import, separated by commas, without .xml.'),
        output_root: string('Optional new folder for the package; defaults to a folder under the system temp directory.'),
        mode: choice('Import mode: create new displays, or update existing ones.', ['create', 'update']),
      }, ['export_root', 'displays']),
      async run(args) {
        const exportRoot = requiredString(args, 'export_root')
        const names = requiredString(args, 'displays').split(',').map(name => name.trim()).filter(name => name !== '')
        const outputRoot = optionalString(args, 'output_root') ?? join(tmpdir(), `ftview-import-${Date.now().toString(36)}`)
        try {
          const mode = optionalString(args, 'mode') === 'update' ? 'update' : 'create'
          const plan = prepareDisplayImport(exportRoot, names, outputRoot, mode)
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
    tool({
      name: 'ftview_capabilities',
      description: 'Report what this host can do with FactoryTalk View: Studio and tag-wizard presence, installed Gfx schema versions, application count, and which steps need a running Studio. Read-only.',
      parameters: object({}, []),
      async run() {
        const report = capabilities()
        return success(
          `FTView host: ${report.applications} application(s); schemas ${report.schemas.length === 0 ? 'none' : report.schemas.join(', ')}; tags ${report.tags}, alarms ${report.alarms}, import ${report.import}.`,
          report,
          [],
          COVERAGE,
        )
      },
    }),
  ]
}


