/**
 * The reference cluster: find logic, follow a symbol, resolve an address, map
 * one tag's element usage.
 *
 * The old surface answered "where is this used" with five tools. This module
 * answers it with three names that state their intent - `find_references`,
 * `trace_dependencies`, `resolve_tag` - plus `usage_map` for element/bit
 * allocation, and `search_logic` for text that is not a symbol.
 *
 * @module dsh-engineering-l5x/tools/references
 */

import type { L5xDocument } from '../model/index.ts'
import { declaringScopes, findReferences } from '../engine/analysis.ts'
import { traceDependencies } from '../engine/project-analysis.ts'
import { resolveTag } from '../engine/tag-resolution.ts'
import { usageMap } from '../engine/usage.ts'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ExecContext, ToolDefinition } from '../core/tool.ts'
import type { ProjectSession, ProjectSnapshot } from '../session.ts'
import { COVERAGE, PROJECT_ID, integerArg, optionalString, requiredString, tool } from './common.ts'

/** One match in routine logic. */
interface LogicMatch {
  readonly program: string
  readonly routine: string
  readonly language: string
  readonly rung?: number
  readonly line?: number
  readonly sheet?: number
  readonly text: string
  readonly comment?: string
}

/**
 * The reference tools, bound to one chat's project store.
 *
 * @param session - Project handles for the calling chat.
 * @returns Tool definitions in registration order.
 */
export function referenceTools(session: ProjectSession): readonly ToolDefinition[] {
  return [
    tool({
      name: 'search_logic',
      description: 'Find literal text in routine logic. Use it to locate a rung, ST line or operand when you do not know the exact symbol name; use find_references when you do.',
      parameters: object({
        query: string('Case-insensitive text to find, matched literally inside rung text, ST lines and diagram node labels. Example: "OTE(Motor_Run)".'),
        limit: integer('Maximum matches to return.', { minimum: 1, maximum: 100, default: 20 }),
        project_id: PROJECT_ID,
      }, ['query']),
      async run(args, exec) {
        const project = await projectOf(session, args, exec)
        const query = requiredString(args, 'query')
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        const matches = logicMatches(project.document, query)
        // A match inside a safety program or a safety AOI is safety code; say so.
        // Search reports an AOI as "AOI::Name"; keep the plain-name form working too.
        const isSafety = (scopeName: string): boolean => {
          const plain = scopeName.startsWith('AOI::') ? scopeName.slice('AOI::'.length) : scopeName
          const instruction = project.document.aois.find(entry => entry.name.toUpperCase() === plain.toUpperCase())
          if (instruction !== undefined) return instruction.safety === true
          return project.document.programs.some(entry => entry.name.toUpperCase() === plain.toUpperCase() && entry.safety === true)
        }
        const page = matches.slice(0, limit).map(match => ({ ...match, ...(isSafety(match.program) ? { safety: true } : {}) }))
        const first = page[0]
        return success(
          `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for ${JSON.stringify(query)} in routine logic.${project.document.protectedRoutines.length === 0 ? '' : ` ${project.document.protectedRoutines.length} source-protected routine(s) were not searched.`}`,
          {
            query,
            total: matches.length,
            returned: page.length,
            truncated: matches.length > page.length,
            matches: page,
          },
          [
            ...(first === undefined || first.program.startsWith('AOI::')
              ? []
              : [{ tool: 'get_component', args: { kind: 'routine', name: first.routine, scope: first.program }, why: 'Read the routine that contains the first match.' }]),
            { tool: 'find_references', args: { symbol: query }, why: 'See every read and write of this name.' },
          ],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'find_references',
      description: 'Find where one symbol is read or written in exported logic, with scope, access, confidence and whether the site is safety code. Use trace_dependencies for what feeds a symbol.',
      parameters: object({
        symbol: string('Symbol to follow, as declared or as written in logic. Example: "Motor_1" or "Program:MainProgram.Motor_1".'),
        scope: string('Program scope to search. Omit to search every scope.'),
        detail: choice('How much evidence to return.', ['summary', 'evidence'], { default: 'summary' }),
        limit: integer('Maximum evidence rows when detail is "evidence".', { minimum: 1, maximum: 100, default: 20 }),
        project_id: PROJECT_ID,
      }, ['symbol']),
      async run(args, exec) {
        const project = await projectOf(session, args, exec)
        const symbol = requiredString(args, 'symbol')
        const scope = optionalString(args, 'scope')
        const detail = optionalString(args, 'detail') ?? 'summary'
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        const evidence = findReferences(project, symbol, scope)
        const byAccess = countAccess(evidence)
        // A reference inside a safety program or a safety AOI is safety code; say so per row.
        // Search reports an AOI as "AOI::Name"; the reference scan reports its plain name.
        const isSafetyScope = (scopeName: string): boolean => {
          const plain = scopeName.startsWith('AOI::') ? scopeName.slice('AOI::'.length) : scopeName
          const instruction = project.document.aois.find(entry => entry.name.toUpperCase() === plain.toUpperCase())
          if (instruction !== undefined) return instruction.safety === true
          return project.document.programs.some(entry => entry.name.toUpperCase() === plain.toUpperCase() && entry.safety === true)
        }
        const rows = evidence.slice(0, limit).map(reference => ({
          scope: reference.scope,
          routine: reference.routine,
          ...(reference.rung === undefined ? {} : { rung: reference.rung }),
          ...(reference.line === undefined ? {} : { line: reference.line }),
          symbol: reference.symbol,
          ...(reference.resolved === undefined ? {} : { resolved: reference.resolved }),
          access: reference.access,
          confidence: reference.confidence,
          context: reference.context,
          ...(isSafetyScope(reference.scope) ? { safety: true } : {}),
        }))
        // A consumed tag's writer is another controller; a produced tag's readers are remote too.
        const declared = project.document.tags.find(tag => tag.name.toLowerCase() === (symbol.split('.')[0] ?? symbol).toLowerCase())
        const tagNote = declared === undefined
          ? ''
          : declared.tagType === 'Consumed'
            ? ` Consumed tag: written by ${declared.consumerOf ?? 'an unnamed producer'}${declared.remoteTag === undefined ? '' : ` as ${declared.remoteTag}`}.`
            : declared.tagType === 'Produced'
              ? ` Produced tag: ${declared.produceCount ?? 0} consumer(s) declared.`
              : ''
        const first = evidence[0]
        return success(
          `${evidence.length} ${evidence.length === 1 ? 'reference' : 'references'} to ${symbol}: ${byAccess.read} read, ${byAccess.write + byAccess.read_write} write, ${byAccess.unknown} unknown.${project.document.protectedRoutines.length === 0 ? '' : ` ${project.document.protectedRoutines.length} source-protected routine(s) were not searched.`}${tagNote}`,
          {
            symbol,
            total: evidence.length,
            by_access: byAccess,
            routines: [...new Set(evidence.map(reference => `${reference.scope}/${reference.routine}`))],
            ...(detail === 'evidence' ? { returned: rows.length, truncated: evidence.length > rows.length, evidence: rows } : {}),
          },
          [
            { tool: 'trace_dependencies', args: { symbol }, why: 'See what feeds this symbol, not just where it appears.' },
            ...(first === undefined
              ? []
              : [{ tool: 'get_component', args: { kind: 'routine', name: first.routine, scope: first.scope }, why: 'Read the routine holding the first reference.' }]),
          ],
          COVERAGE,
        )
      },
    }),
    tool({
      name: 'trace_dependencies',
      description: 'Follow what feeds a symbol (upstream) or what it feeds (downstream) through parsed operands. Static evidence only; it does not establish runtime causality.',
      parameters: object({
        symbol: string('Symbol to trace. Example: "Conveyor_Run" or "AOI_EncoderScale::Out_FPM".'),
        scope: string('Program or AOI name that declares the symbol. Omit for controller scope; an AOI::Member symbol resolves against that AOI automatically.'),
        direction: choice('Which way to follow the graph.', ['upstream', 'downstream'], { default: 'upstream' }),
        depth: integer('Maximum graph depth to follow. Default 3.', { minimum: 1, maximum: 6, default: 3 }),
        project_id: PROJECT_ID,
      }, ['symbol']),
      async run(args, exec) {
        const project = await projectOf(session, args, exec)
        const requested = requiredString(args, 'symbol')
        const explicitScope = optionalString(args, 'scope')
        const parts = requested.split('::')
        const qualified = parts.length > 1 && parts[0] !== ''
        const scope = explicitScope === undefined
          ? (qualified ? normalizeScope(project.document, parts[0] as string) : 'controller')
          : normalizeScope(project.document, explicitScope)
        const symbol = qualified ? parts.slice(1).join('::') : requested
        const direction = optionalString(args, 'direction') === 'downstream' ? 'downstream' : 'upstream'
        const depth = Math.min(Math.max(integerArg(args, 'depth', 3), 1), 6)
        // A tag declared in exactly one program is unambiguous: adopt that scope rather than make the
        // caller retry. find_references already searches every scope; tracing should not be stricter.
        let effectiveScope = scope
        let adoptedFrom = ''
        if (explicitScope === undefined && !qualified && scope === 'controller') {
          const elsewhere = [...new Set(declaringScopes(project.document, symbol))].filter(name => name !== 'controller')
          if (elsewhere.length === 1 && elsewhere[0] !== undefined) {
            effectiveScope = elsewhere[0]
            adoptedFrom = elsewhere[0]
          }
        }
        const graph = traceDependencies(project, symbol, effectiveScope, direction, {
          depth,
          nodes: 50,
          edges: 100,
          analysis: { references: 5000, edges: 5000 },
        })
        const resolution = graph.resolution as { readonly resolved?: boolean; readonly reason?: string } | undefined
        if (resolution !== undefined && resolution.resolved === false) {
        const declarations = [...project.document.aois.map(aoi => aoi.name), ...project.document.programs.map(program => program.name)]
        // Say where it does resolve, when it resolves somewhere: on a real project a
        // program-scoped tag read in controller scope was reported as absent from the export.
        const elsewhere = declaringScopes(project.document, requested).filter(name => name !== scope)
        const where = elsewhere.length === 0 ? null : elsewhere.slice(0, 3).join(', ')
        throw new L5xError(
          'UNRESOLVED_SYMBOL',
          where === null
            ? `${requested} does not resolve in scope ${scope}: ${resolution.reason ?? 'not declared in this export'}.`
            : `${requested} is not declared in scope ${scope}; it is declared in ${where}.`,
          where === null
            ? 'Pass scope with the declaring program or AOI. For an AOI member, write "AOI_Name::Member" or pass scope "AOI_Name" with the member name.'
            : `Pass scope: "${elsewhere[0]}", or the program that declares it.`,
          elsewhere.length === 0 ? declarations.slice(0, 5) : elsewhere,
        )
        }
        const nodes = graph.nodes as readonly unknown[]
        const edges = graph.edges as readonly unknown[]
        // A consumed tag's feed is another controller and a produced tag's reader is remote: say so,
        // or an empty graph reads as "nothing feeds this".
        const base = symbol.split('.')[0] ?? symbol
        const declared = project.document.tags.find(tag => tag.name.toLowerCase() === base.toLowerCase()
          && (tag.scope === effectiveScope || tag.scope === 'controller' || effectiveScope === 'controller'))
        const networkNote = declared?.tagType === 'Consumed'
          ? ` Value arrives from ${declared.consumerOf ?? 'the network'}${declared.remoteTag === undefined ? '' : ` as ${declared.remoteTag}`}; no upstream logic in this export.`
          : declared?.tagType === 'Produced'
            ? ` Value leaves to ${declared.produceCount ?? 0} consumer(s); no downstream logic in this export.`
            : ''
        const coverage: Coverage = {
          complete: graph.static_complete === true,
          unverified: [
            'runtime causality',
            'external HMI, produced/consumed and driver consumers',
            'dynamic indices',
            ...(graph.truncated === true ? ['the graph was truncated at the configured depth or edge bound'] : []),
          ],
        }
        return success(
          `${nodes.length} ${nodes.length === 1 ? 'symbol' : 'symbols'} and ${edges.length} ${edges.length === 1 ? 'edge' : 'edges'} ${direction} of ${requested}${adoptedFrom === '' ? '' : ` (declared in ${adoptedFrom}; scope adopted)`}${graph.truncated === true ? ' (truncated)' : ''}.${networkNote}`,
          graph,
          [
            { tool: 'find_references', args: { symbol: requested }, why: 'See every occurrence rather than the dependency graph.' },
            ...(requested.includes('::') ? [] : [{ tool: 'usage_map', args: { tag: requested, scope }, why: 'Map element and bit usage for this tag.' }]),
          ],
          coverage,
        )
      },
    }),
    tool({
      name: 'resolve_tag',
      description: 'Resolve one Logix address against exported declarations: alias chain, member, integer bit and array subscript, with the evidence that remains unverified.',
      parameters: object({
        address: string('Address as written in logic. Example: "Motor_1.Speed" or "Alarms[2].3".'),
        scope: string('Program scope for a local tag. Omit for controller scope.'),
        project_id: PROJECT_ID,
      }, ['address']),
      async run(args, exec) {
        const project = await projectOf(session, args, exec)
        const address = requiredString(args, 'address')
        const requestedScope = optionalString(args, 'scope')
        let resolution = resolveTag(project.document, requestedScope ?? 'controller', address)
        // Omitting the scope means "find it". Adopt the one program that declares the name; an explicit
        // or ambiguous scope is still reported unresolved.
        let adoptedFrom = ''
        if (requestedScope === undefined && resolution.resolved === false) {
          const scopes = (resolution as { readonly scopes?: readonly string[] }).scopes ?? []
          if (scopes.length === 1 && scopes[0] !== undefined) {
            adoptedFrom = scopes[0]
            resolution = resolveTag(project.document, adoptedFrom, address)
          }
        }
        const canonical = resolution.canonical
        return success(
          resolution.resolved
            ? `${address} resolves to ${canonical ?? 'its declared type'}${resolution.data_type === undefined ? '' : ` (${resolution.data_type})`}${adoptedFrom === '' ? '' : ` (declared in ${adoptedFrom}; scope adopted)`}.`
            : `${address} does not resolve: ${resolution.reason ?? 'not declared in this export'}.`,
          adoptedFrom === '' ? resolution : { ...resolution, adopted_from: adoptedFrom },
          [
            { tool: 'find_references', args: { symbol: address }, why: 'See where this address is used.' },
            ...(canonical === undefined
              ? []
              : [{ tool: 'find_references', args: { symbol: canonical.split(/[.[]/u)[0] ?? canonical }, why: 'Follow the base declaration this address resolves to.' }]),
          ],
          resolution.indices_verified
            ? COVERAGE
            : { complete: false, unverified: ['a dynamic subscript was not expanded', ...COVERAGE.unverified] },
        )
      },
    }),
    tool({
      name: 'usage_map',
      description: 'Map how one declared tag is used: which array elements and bits are read or written, which remain free, and where each appears.',
      parameters: object({
        tag: string('Declared tag name. Example: "Alarm_Bits".'),
        scope: string('Declaring scope: "controller" or a program name. Defaults to controller.'),
        project_id: PROJECT_ID,
      }, ['tag']),
      async run(args, exec) {
        const project = await projectOf(session, args, exec)
        const tag = requiredString(args, 'tag')
        const requestedScope = optionalString(args, 'scope')
        let scope = requestedScope ?? 'controller'
        let adoptedFrom = ''
        let declared = project.document.tags.find(entry => entry.name.toLowerCase() === tag.toLowerCase() && entry.scope.toLowerCase() === scope.toLowerCase())
        // Omitting the scope means "find it", not "only look in the controller". Adopt a scope when
        // exactly one program declares the name; an explicit wrong scope still refuses.
        if (declared === undefined && requestedScope === undefined) {
          const elsewhere = [...new Set(project.document.tags
            .filter(entry => entry.name.toLowerCase() === tag.toLowerCase())
            .map(entry => entry.scope))]
          if (elsewhere.length === 1 && elsewhere[0] !== undefined) {
            scope = elsewhere[0]
            adoptedFrom = scope
            declared = project.document.tags.find(entry => entry.name.toLowerCase() === tag.toLowerCase() && entry.scope.toLowerCase() === scope.toLowerCase())
          }
        }
      // An AOI parameter or local tag is a symbol, but usage_map maps declared tags.
      const aoiOwner = declared === undefined
        ? project.document.aois.find(aoi => aoi.name.toUpperCase() === scope.toUpperCase()
          && [...aoi.parameters, ...aoi.localTags].some(member => String(member.name).toLowerCase() === tag.toLowerCase()))
        : undefined
      if (aoiOwner !== undefined) {
        throw new L5xError(
          'INVALID_ARGUMENT',
          `${tag} is a member of add-on instruction ${aoiOwner.name}; usage_map maps declared tags, not AOI internals.`,
          `Use find_references with symbol "${aoiOwner.name}::${tag}" to see where it is read and written.`,
          [`${aoiOwner.name}::${tag}`],
        )
      }
      if (declared === undefined) {
        const declaredHere = project.document.tags
          .filter(entry => entry.scope.toLowerCase() === scope.toLowerCase())
          .map(entry => entry.name)
        // The same tag can be declared in another scope. On a real project a program-scoped read
        // said "not declared in scope X" for a tag that trace_dependencies had just resolved.
        const elsewhere = [...new Set(project.document.tags
          .filter(entry => entry.name.toLowerCase() === tag.toLowerCase())
          .map(entry => entry.scope))]
        throw new L5xError(
          'COMPONENT_NOT_FOUND',
          elsewhere.length === 0
            ? `Tag ${JSON.stringify(tag)} is not declared in scope ${JSON.stringify(scope)}.`
            : `Tag ${JSON.stringify(tag)} is not declared in scope ${JSON.stringify(scope)}; it is declared in ${elsewhere.slice(0, 3).join(', ')}.`,
          elsewhere.length === 0
            ? 'Call list_components with kind "tag" to see the declared names in this scope.'
            : `Pass scope: ${JSON.stringify(elsewhere[0])}.`,
          elsewhere.length === 0 ? declaredHere.slice(0, 5) : elsewhere,
        )
      }
        const map = usageMap(project, scope, tag) as {
          indexes?: readonly unknown[]
          whole_element?: unknown
          element_bit_width?: unknown
          note?: string
        }
        const indexes = map.indexes ?? []
        return success(
          `${declared.name}: ${indexes.length} indexed ${indexes.length === 1 ? 'element' : 'elements'} used${map.whole_element ? ', plus whole-tag use' : ''}${adoptedFrom === '' ? '' : ` (declared in ${adoptedFrom}; scope adopted)`}.`,
          map,
          [{ tool: 'find_references', args: { symbol: declared.name, scope }, why: 'See every occurrence behind these counts.' }],
          {
            complete: false,
            unverified: ['external HMI, produced/consumed and driver consumers', 'dynamic indices are not expanded'],
          },
        )
      },
    }),
  ]
}

/** Resolve the calling project. */
async function projectOf(session: ProjectSession, args: Readonly<Record<string, unknown>>, exec?: ExecContext): Promise<ProjectSnapshot> {
  return await session.require(optionalString(args, 'project_id'), exec)
}

/** The declaration scope a symbol resolves against: an AOI name becomes `AOI::Name`. */
function normalizeScope(document: L5xDocument, scope: string): string {
  if (scope.startsWith('AOI::')) return scope
  return document.aois.some(aoi => aoi.name === scope) ? `AOI::${scope}` : scope
}

/** Count evidence by access kind. */
function countAccess(evidence: readonly { readonly access: string }[]): { read: number; write: number; read_write: number; call: number; unknown: number } {
  const counts = { read: 0, write: 0, read_write: 0, call: 0, unknown: 0 }
  for (const entry of evidence) {
    if (entry.access === 'read') counts.read += 1
    else if (entry.access === 'write') counts.write += 1
    else if (entry.access === 'read_write') counts.read_write += 1
    else if (entry.access === 'call') counts.call += 1
    else counts.unknown += 1
  }
  return counts
}

/** Literal, case-insensitive matches across routine logic. */
function logicMatches(document: L5xDocument, query: string): readonly LogicMatch[] {
  const needle = query.toLowerCase()
  const matches: LogicMatch[] = []
  const routines = [...document.routines, ...document.aois.flatMap(aoi => aoi.routines.map(routine => ({ ...routine, program: `AOI::${aoi.name}` })))]
  for (const routine of routines) {
    if (routine.body.type === 'RLL') {
      for (const rung of routine.body.rungs) {
        if (!rung.text.toLowerCase().includes(needle)) continue
        matches.push({
          program: routine.program,
          routine: routine.name,
          language: 'RLL',
          rung: rung.number,
          text: rung.text,
          ...(rung.comment === undefined ? {} : { comment: rung.comment }),
        })
      }
    } else if (routine.body.type === 'ST') {
      routine.body.code.split(/\r?\n/u).forEach((line, index) => {
        if (line.toLowerCase().includes(needle)) {
          matches.push({ program: routine.program, routine: routine.name, language: 'ST', line: index + 1, text: line.trim() })
        }
      })
    } else if (routine.body.type === 'FBD' || routine.body.type === 'SFC') {
      for (const node of routine.body.nodes) {
        const text = node.text ?? node.operand ?? ''
        if (text.toLowerCase().includes(needle)) {
          matches.push({ program: routine.program, routine: routine.name, language: routine.body.type, sheet: node.sheet, text })
        }
      }
    }
  }
  return matches
}


