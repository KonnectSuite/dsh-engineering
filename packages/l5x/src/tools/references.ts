/**
 * The reference cluster: find logic, follow a symbol, resolve an address, map
 * one tag's element usage.
 *
 * The old surface answered "where is this used" with five tools. This module
 * answers it with three names that state their intent — `find_references`,
 * `trace_dependencies`, `resolve_tag` — plus `usage_map` for element/bit
 * allocation, and `search_logic` for text that is not a symbol.
 *
 * @module dsh-engineering-l5x/tools/references
 */

import type { L5xDocument } from '../model/index.ts'
import { findReferences } from '../engine/analysis.ts'
import { traceDependencies } from '../engine/project-analysis.ts'
import { resolveTag } from '../engine/tag-resolution.ts'
import { usageMap } from '../engine/usage.ts'
import { L5xError } from '../core/errors.ts'
import { success, type Coverage } from '../core/result.ts'
import { choice, integer, object, string } from '../core/params.ts'
import type { ToolDefinition } from '../core/tool.ts'
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
      async run(args, signal) {
        const project = await projectOf(session, args, signal)
        const query = requiredString(args, 'query')
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        const matches = logicMatches(project.document, query)
        const page = matches.slice(0, limit)
        const first = page[0]
        return success(
          `${matches.length} ${matches.length === 1 ? 'match' : 'matches'} for ${JSON.stringify(query)} in routine logic.`,
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
      description: 'Find where one symbol is read or written in exported logic, with scope, access and confidence. Use trace_dependencies for what feeds a symbol.',
      parameters: object({
        symbol: string('Symbol to follow, as declared or as written in logic. Example: "Motor_1" or "Program:MainProgram.Motor_1".'),
        scope: string('Program scope to search. Omit to search every scope.'),
        detail: choice('How much evidence to return.', ['summary', 'evidence'], { default: 'summary' }),
        limit: integer('Maximum evidence rows when detail is "evidence".', { minimum: 1, maximum: 100, default: 20 }),
        project_id: PROJECT_ID,
      }, ['symbol']),
      async run(args, signal) {
        const project = await projectOf(session, args, signal)
        const symbol = requiredString(args, 'symbol')
        const scope = optionalString(args, 'scope')
        const detail = optionalString(args, 'detail') ?? 'summary'
        const limit = Math.min(Math.max(integerArg(args, 'limit', 20), 1), 100)
        const evidence = findReferences(project, symbol, scope)
        const byAccess = countAccess(evidence)
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
        }))
        const first = evidence[0]
        return success(
          `${evidence.length} ${evidence.length === 1 ? 'reference' : 'references'} to ${symbol}: ${byAccess.read} read, ${byAccess.write + byAccess.read_write} write, ${byAccess.unknown} unknown.`,
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
        symbol: string('Symbol to trace. Example: "Conveyor_Run".'),
        scope: string('Program scope of the symbol. Omit for controller scope.'),
        direction: choice('Which way to follow the graph.', ['upstream', 'downstream'], { default: 'upstream' }),
        depth: integer('Maximum graph depth to follow. Default 3.', { minimum: 1, maximum: 6, default: 3 }),
        project_id: PROJECT_ID,
      }, ['symbol']),
      async run(args, signal) {
        const project = await projectOf(session, args, signal)
        const symbol = requiredString(args, 'symbol')
        const scope = optionalString(args, 'scope') ?? 'controller'
        const direction = optionalString(args, 'direction') === 'downstream' ? 'downstream' : 'upstream'
        const depth = Math.min(Math.max(integerArg(args, 'depth', 3), 1), 6)
        const graph = traceDependencies(project, symbol, scope, direction, {
          depth,
          nodes: 50,
          edges: 100,
          analysis: { references: 5000, edges: 5000 },
        })
        const nodes = graph.nodes as readonly unknown[]
        const edges = graph.edges as readonly unknown[]
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
          `${nodes.length} ${nodes.length === 1 ? 'symbol' : 'symbols'} and ${edges.length} ${edges.length === 1 ? 'edge' : 'edges'} ${direction} of ${symbol}${graph.truncated === true ? ' (truncated)' : ''}.`,
          graph,
          [
            { tool: 'find_references', args: { symbol }, why: 'See every occurrence rather than the dependency graph.' },
            { tool: 'usage_map', args: { tag: symbol, scope }, why: 'Map element and bit usage for this tag.' },
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
      async run(args, signal) {
        const project = await projectOf(session, args, signal)
        const address = requiredString(args, 'address')
        const resolution = resolveTag(project.document, optionalString(args, 'scope') ?? 'controller', address)
        const canonical = resolution.canonical
        return success(
          resolution.resolved
            ? `${address} resolves to ${canonical ?? 'its declared type'}${resolution.data_type === undefined ? '' : ` (${resolution.data_type})`}.`
            : `${address} does not resolve: ${resolution.reason ?? 'not declared in this export'}.`,
          resolution,
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
      async run(args, signal) {
        const project = await projectOf(session, args, signal)
        const tag = requiredString(args, 'tag')
        const scope = optionalString(args, 'scope') ?? 'controller'
        const declared = project.document.tags.find(entry => entry.name.toLowerCase() === tag.toLowerCase() && entry.scope.toLowerCase() === scope.toLowerCase())
        if (declared === undefined) {
          const declaredHere = project.document.tags
            .filter(entry => entry.scope.toLowerCase() === scope.toLowerCase())
            .map(entry => entry.name)
          throw new L5xError(
            'COMPONENT_NOT_FOUND',
            `Tag ${JSON.stringify(tag)} is not declared in scope ${JSON.stringify(scope)}.`,
            'Call list_components with kind "tag" to see the declared names in this scope.',
            declaredHere.slice(0, 5),
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
          `${declared.name}: ${indexes.length} indexed ${indexes.length === 1 ? 'element' : 'elements'} used${map.whole_element ? ', plus whole-tag use' : ''}.`,
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
async function projectOf(session: ProjectSession, args: Readonly<Record<string, unknown>>, signal?: AbortSignal): Promise<ProjectSnapshot> {
  return await session.require(optionalString(args, 'project_id'), signal)
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
