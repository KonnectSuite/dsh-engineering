/**
 * The FTView read surface: six intents over one opened export folder.
 *
 * @module dsh-engineering-ftview/tools
 */

import { EngineeringError, choice, integer, object, optionalInteger, optionalString, requiredString, string, success, tool, type Coverage, type ToolDefinition } from './core.ts'
import type { DisplayFile, TagRow } from './model.ts'
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

/** One finding the check reports. */
interface Finding {
  readonly rule: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly message: string
  readonly evidence: unknown
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

/** Structural checks over one application. */
function findingsOf(app: { displays: readonly DisplayFile[]; tags: readonly TagRow[]; tagErrors: readonly string[]; diagnostics: readonly string[] }): Finding[] {
  const findings: Finding[] = []
  for (const error of app.tagErrors) findings.push({ rule: 'TAG_CSV', severity: 'warning', message: error, evidence: { file: 'tag CSV' } })
  for (const diagnostic of app.diagnostics) findings.push({ rule: 'UNPARSED_FILE', severity: 'warning', message: diagnostic, evidence: { file: diagnostic.split(':')[0] } })
  const displayNames = new Set<string>()
  for (const display of app.displays) {
    if (displayNames.has(display.name)) findings.push({ rule: 'DUPLICATE_DISPLAY_NAME', severity: 'warning', message: `Two displays are named ${JSON.stringify(display.name)}.`, evidence: { display: display.name, file: display.file } })
    displayNames.add(display.name)
    const objectNames = new Set<string>()
    for (const object of display.objects) {
      if (object.name === undefined) continue
      if (objectNames.has(object.name)) findings.push({ rule: 'DUPLICATE_OBJECT_NAME', severity: 'warning', message: `Display ${JSON.stringify(display.name)} has more than one object named ${JSON.stringify(object.name)}.`, evidence: { display: display.name, object: object.name } })
      objectNames.add(object.name)
    }
  }
  const tagNames = new Set<string>()
  for (const tag of app.tags) {
    if (tagNames.has(tag.name)) findings.push({ rule: 'DUPLICATE_TAG_NAME', severity: 'error', message: `The tag CSV declares ${JSON.stringify(tag.name)} more than once.`, evidence: { tag: tag.name } })
    tagNames.add(tag.name)
  }
  return findings
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
            matches.push({ kind: 'tag', where: 'tag CSV', text: `${tag.name}${tag.description === '' ? '' : ` Ã¢â‚¬â€ ${tag.description}`}` })
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
  ]
}

