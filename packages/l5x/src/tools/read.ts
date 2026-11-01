/**
 * The offline read surface: open, look, and read one component.
 *
 * Every tool answers with the same document — `summary`, `data`, optional
 * `coverage`, and concrete `next` calls — and every expected failure answers
 * with a code, a message and a fix. The tool descriptions name the one intent
 * each tool serves; parameters carry their own meaning and an example.
 *
 * @module dsh-engineering-l5x/tools/read
 */

import type { L5xDocument, L5xTag } from '../model/index.ts'
import { getAoi, getRoutine, getUdt, listAois, listModules, listRoutines, listTags } from '../model/index.ts'
import { L5xError } from '../core/errors.ts'
import { success, type NextStep } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
import type { ProjectSession } from '../session.ts'
import { COVERAGE, PROJECT_ID, integerArg, optionalString, requiredString, tool } from './common.ts'

/** Component kinds the reader can list and open. */
const KINDS = ['program', 'task', 'tag', 'udt', 'routine', 'aoi', 'module', 'alarm'] as const
type Kind = typeof KINDS[number]

/** One row in a component listing. */
interface ComponentRow {
  readonly name: string
  readonly [field: string]: unknown
}


/**
 * The offline tools, bound to one chat's project store.
 *
 * @param session - Project handles for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function readTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'open_project',
      description: 'Open one Studio 5000 L5X export for this chat. Returns a project_id and a structure summary; every other tool reads this project.',
      parameters: object({
        path: string('Path to the .L5X export, absolute or relative to the workspace root. Example: "C:/Projects/Line/Line.L5X"'),
      }, ['path']),
      async run(args, exec) {
        const project = await session.open(requiredString(args, 'path'), exec)
        const document = project.document
        return success(
          `${document.controller.name}: ${document.programs.length} programs, ${document.tags.length} tags, ${document.routines.length} routines${(project.protectedRoutines ?? 0) === 0 ? '' : ` (${project.protectedRoutines} source-protected, bodies not readable)`}.`,
          {
            project_id: project.id,
            path: project.requestedPath,
            sha256: project.sha256,
            revision: revisionOf(document),
            export_revision: project.softwareRevision,
            verification: project.verification,
            controller: document.controller,
            counts: countsOf(document, project.protectedRoutines ?? 0),
            programs: document.programs.map(program => ({ name: program.name, mainRoutine: program.mainRoutine })),
            tasks: document.tasks.map(task => ({ name: task.name, type: task.type, rate: task.rate, programs: task.programs })),
          },
          [{ tool: 'project_overview', why: 'Confirm tasks, programs and coverage before reading components.' }],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'project_overview',
      description: 'Structure and coverage of the open project: controller, revision, tasks, programs and component counts.',
      parameters: object({ project_id: PROJECT_ID }, []),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const document = project.document
        // Limits belong in the first call: a caller who does not know the export is partly unreadable
        // will read every later empty result as bad news about their project.
        const limits: string[] = []
        if (document.protectedRoutines.length > 0) limits.push(`${document.protectedRoutines.length} source-protected routine(s): bodies are encrypted and cannot be read`)
        if (document.vendorTypes.length > 0) limits.push(`${document.vendorTypes.length} vendor-owned data type(s) are not modelled`)
        const safetyTasks = document.tasks.filter(task => task.safety).map(task => task.name)
        if (safetyTasks.length > 0) limits.push(`safety task(s) ${safetyTasks.join(', ')}: safety logic cannot be edited`)
        return success(
          `${document.controller.name} (${document.controller.processorType}, revision ${revisionOf(document)}).${limits.length === 0 ? '' : ` Limits: ${limits.join('; ')}.`}`,
          {
            project_id: project.id,
            controller: document.controller,
            revision: revisionOf(document),
            export_revision: project.softwareRevision,
            verification: project.verification,
            counts: countsOf(document, project.protectedRoutines ?? 0),
            programs: document.programs,
            tasks: document.tasks,
            ...(limits.length === 0 ? {} : { limits }),
          },
          [
            { tool: 'list_components', args: { kind: 'routine' }, why: 'List the routines you can read next.' },
            { tool: 'list_components', args: { kind: 'tag' }, why: 'List tags before tracing or reading one.' },
          ],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'list_components',
      description: 'List one component kind in the open project, paginated. Use it to find the exact name get_component expects.',
      parameters: object({
        kind: choice('Component kind to list.', KINDS),
        scope: string('Program name for a program-scoped tag or routine. Omit for controller scope.'),
        filter: string('Case-insensitive substring matched against the component name.'),
        offset: integer('Zero-based index of the first row to return.', { minimum: 0, default: 0 }),
        limit: integer('Maximum rows to return.', { minimum: 1, maximum: 200, default: 50 }),
        project_id: PROJECT_ID,
      }, ['kind']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const kind = requiredKind(args)
        const filter = optionalString(args, 'filter') ?? ''
        const offset = integerArg(args, 'offset', 0)
        const limit = Math.min(Math.max(integerArg(args, 'limit', 50), 1), 200)
        const rows = selectRows(project.document, kind, optionalString(args, 'scope'), filter)
        const page = rows.slice(offset, offset + limit)
        return success(
          `${rows.length} ${rows.length === 1 ? kind : `${kind}s`}${filter === '' ? '' : ` matching ${JSON.stringify(filter)}`}${kind !== 'udt' ? '' : (project.document.vendorTypes.length === 0 ? '' : `, plus ${project.document.vendorTypes.length} vendor-owned not listed`)}${kind !== 'routine' ? '' : (() => { const protectedCount = project.document.protectedRoutines.filter(entry => optionalString(args, 'scope') === undefined || entry.program === optionalString(args, 'scope')).length; return protectedCount === 0 ? '' : `, ${protectedCount} source-protected` })()}.`,
          { kind, total: rows.length, offset, limit, rows: page },
          pageNext(kind, page, offset, limit, rows.length, filter),
        )
      },
    }),
    tool({
      name: 'get_component',
      description: 'Read one component in full by exact name: a tag, UDT, routine, AOI, module, program, task or alarm.',
      parameters: object({
        kind: choice('Component kind to read.', KINDS),
        name: string('Exact component name as the export declares it.'),
        scope: string('Program name when the component is program-scoped.'),
        project_id: PROJECT_ID,
      }, ['kind', 'name']),
      async run(args, exec) {
        const project = await session.require(optionalString(args, 'project_id'), exec)
        const kind = requiredKind(args)
        const name = requiredString(args, 'name')
        const scope = optionalString(args, 'scope')
        const component = readComponent(project.document, kind, name, scope)
        return success(
          `${kind} ${name}${scope === undefined ? '' : ` in ${scope}`}.`,
          { kind, component },
          [{ tool: 'list_components', args: { kind }, why: 'List the siblings of this component.' }],
          COVERAGE,
        )
      },
    }),
  ]
}

/** A required component kind. */
function requiredKind(args: Readonly<Record<string, unknown>>): Kind {
  const value = requiredString(args, 'kind')
  if (!(KINDS as readonly string[]).includes(value)) {
    throw new L5xError('INVALID_ARGUMENT', `Unknown component kind ${JSON.stringify(value)}.`, `Pass one of: ${KINDS.join(', ')}.`, KINDS)
  }
  return value as Kind
}

/** Controller revision as a readable string. */
function revisionOf(document: L5xDocument): string {
  const { majorRev, minorRev } = document.controller
  return majorRev === '' ? '' : `${majorRev}.${minorRev}`
}

/** Component counts for a summary. */
function countsOf(document: L5xDocument, protectedRoutines = 0): Readonly<Record<string, number>> {
  return {
    programs: document.programs.length,
    tasks: document.tasks.length,
    tags: document.tags.length,
    udts: document.udts.length,
    routines: document.routines.length,
    protected_routines: protectedRoutines,
    aois: document.aois.length,
    modules: document.modules.length,
    alarms: document.alarms.length,
  }
}

/** One kind's rows, filtered and in export order. */
function selectRows(document: L5xDocument, kind: Kind, scope: string | undefined, filter: string): readonly ComponentRow[] {
  const rows: readonly ComponentRow[] = kind === 'program'
    ? document.programs.map(program => ({ name: program.name, mainRoutine: program.mainRoutine, description: program.description, safety: program.safety === true }))
    : kind === 'task'
      ? document.tasks.map(task => ({ name: task.name, type: task.type, rate: task.rate, programs: task.programs, safety: task.safety === true }))
      : kind === 'tag'
        ? listTags(document, scope ?? '').map(tag => ({ name: tag.name, scope: tag.scope, dataType: tag.dataType, description: tag.description ?? '', externalAccess: tag.externalAccess ?? '', ...(tag.tagType === undefined ? {} : { tagType: tag.tagType }), ...(tag.consumerOf === undefined ? {} : { consumerOf: tag.consumerOf }), ...(tag.aliasFor === undefined ? {} : { aliasFor: tag.aliasFor }) }))
        : kind === 'udt'
          ? document.udts.map(udt => ({ name: udt.name, members: udt.members.length, description: udt.description }))
          : kind === 'routine'
            ? [
                ...listRoutines(document, scope ?? '').map(routine => ({ name: routine.name, program: routine.program, type: routine.type, rungCount: routine.rungCount ?? null, lineCount: routine.lineCount ?? null, description: routine.description })),
                // An AOI carries its own routines; omitting them made a 3-routine AOI list as empty.
                ...(document.aois.find(aoi => aoi.name.toUpperCase() === (scope ?? '').toUpperCase())?.routines ?? []).map(routine => ({ name: routine.name, program: scope ?? '', type: routine.type, rungCount: routine.body.type === 'RLL' ? routine.body.rungs.length : null, lineCount: routine.body.type === 'ST' ? (routine.body.code.split('\n').length) : null, description: routine.description })),
                // A protected routine exists; listing nothing tells an engineer the program is empty.
                ...document.protectedRoutines
                  .filter(entry => scope === undefined || entry.program === scope)
                  .map(entry => ({ name: entry.name, program: entry.program, type: 'PROTECTED', rungCount: null, lineCount: null, description: 'Source-protected: the body is encrypted in this export' })),
              ]
            : kind === 'aoi'
              ? listAois(document).map(aoi => ({ name: aoi.name, revision: aoi.revision, description: aoi.description, safety: aoi.safety === true }))
              : kind === 'module'
                ? listModules(document).map(module => ({ name: module.name, catalogNumber: module.catalogNumber, slot: module.slot ?? '', parentModule: module.parentModule, inhibited: module.inhibited === true, majorFault: module.majorFault === true, safetyEnabled: module.safetyEnabled === true }))
                : document.alarms.map(alarm => ({ name: alarm.name, kind: alarm.kind, description: alarm.description }))
  const needle = filter.toLowerCase()
  return needle === '' ? rows : rows.filter(row => row.name.toLowerCase().includes(needle))
}

/** Next calls for one listing page. */
function pageNext(kind: Kind, page: readonly ComponentRow[], offset: number, limit: number, total: number, filter: string): readonly NextStep[] {
  const next: NextStep[] = []
  const first = page[0]
  if (first !== undefined) {
    const scope = first.scope ?? first.program
    next.push({
      tool: 'get_component',
      args: scope === undefined ? { kind, name: first.name } : { kind, name: first.name, scope },
      why: 'Read the first row in full.',
    })
  }
  if (offset + limit < total) {
    next.push({
      tool: 'list_components',
      args: { kind, filter, offset: offset + limit, limit },
      why: `Read the next ${Math.min(limit, total - offset - limit)} rows.`,
    })
  }
  return next
}

/** One component by exact name, with candidates when the name does not resolve. */
function readComponent(document: L5xDocument, kind: Kind, name: string, scope: string | undefined): unknown {
  if (kind === 'tag') {
    const matches = listTags(document, scope ?? '').filter(tag => tag.name === name)
    const first = matches[0]
    if (first === undefined) throw notFound(kind, name, listTags(document, scope ?? '').map(tag => tag.name))
    if (matches.length > 1) {
      throw new L5xError(
        'AMBIGUOUS_COMPONENT',
        `${name} is declared in ${matches.length} scopes.`,
        'Pass scope to choose one.',
        matches.map(tag => tag.scope),
      )
    }
    return first as L5xTag
  }
  if (kind === 'udt') {
    const matches = getUdt(document, name)
    const first = matches[0]
    if (first === undefined) {
      // A built-in family type exists in the export; "not found" is the wrong sentence.
      const vendor = document.vendorTypes.find(entry => entry.toLowerCase() === name.toLowerCase())
      if (vendor !== undefined) {
        throw new L5xError(
          'PROTECTED_TARGET',
          `Data type ${vendor} is vendor-owned; this tool models user-defined types, not the built-in families.`,
          'Read the vendor documentation for that family, or add a user-defined type.',
          [vendor],
        )
      }
      throw notFound(kind, name, document.udts.map(udt => udt.name))
    }
    return first
  }
  if (kind === 'routine') {
    const matches = listRoutines(document, scope ?? '').filter(routine => routine.name === name)
    // An AOI owns routines too: EnableInFalse, Logic, Prescan.
    const aoiOwned = document.aois.find(aoi => aoi.name.toUpperCase() === (scope ?? '').toUpperCase())?.routines.find(routine => routine.name === name)
    if (aoiOwned !== undefined) return aoiOwned
    const first = matches[0]
    if (first === undefined) {
      // The export may carry the routine as an encrypted body. Saying "no routine named" sends a
      // reader looking for a name that is right there in the export.
      const protectedHit = document.protectedRoutines.filter(entry =>
        entry.name.toLowerCase() === name.toLowerCase() && (scope === undefined || entry.program === scope))
      if (protectedHit.length > 0) {
        throw new L5xError(
          'PROTECTED_TARGET',
          `Routine ${name}${scope === undefined ? '' : ` in ${scope}`} is source-protected in this export; its body cannot be read.`,
          'Obtain an unprotected export or the source project from the vendor.',
          protectedHit.map(entry => entry.program),
        )
      }
      throw notFound(kind, name, listRoutines(document, scope ?? '').map(routine => routine.name))
    }
    if (matches.length > 1) {
      throw new L5xError(
        'AMBIGUOUS_COMPONENT',
        `${name} exists in ${matches.length} programs.`,
        'Pass scope with the program name.',
        matches.map(routine => routine.program),
      )
    }
    return getRoutine(document, first.program, name)
  }
  if (kind === 'aoi') {
    const aoi = getAoi(document, name)
    if (aoi === undefined) throw notFound(kind, name, document.aois.map(entry => entry.name))
    return aoi
  }
  if (kind === 'module') {
    const module = document.modules.find(entry => entry.name === name)
    if (module === undefined) throw notFound(kind, name, document.modules.map(entry => entry.name))
    return module
  }
  if (kind === 'program') {
    const program = document.programs.find(entry => entry.name === name)
    if (program === undefined) throw notFound(kind, name, document.programs.map(entry => entry.name))
    return program
  }
  if (kind === 'task') {
    const task = document.tasks.find(entry => entry.name === name)
    if (task === undefined) throw notFound(kind, name, document.tasks.map(entry => entry.name))
    return task
  }
  const alarm = document.alarms.find(entry => entry.name === name)
  if (alarm === undefined) throw notFound(kind, name, document.alarms.map(entry => entry.name))
  return alarm
}

/** The failure for a name that does not resolve, with near candidates. */
function notFound(kind: Kind, name: string, names: readonly string[]): L5xError {
  const near = names.filter(candidate => candidate.toLowerCase().includes(name.toLowerCase())).slice(0, 5)
  const candidates = near.length > 0 ? near : names.slice(0, 5)
  return new L5xError(
    'COMPONENT_NOT_FOUND',
    `No ${kind} named ${JSON.stringify(name)} in this export.`,
    candidates.length === 0
      ? `Call list_components with kind "${kind}" to see what exists.`
      : `Call list_components with kind "${kind}", or retry with one of the candidates.`,
    candidates,
  )
}
