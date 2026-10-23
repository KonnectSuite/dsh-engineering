/** Shared static source analysis. Connections express dependencies, never runtime causality. */
import type { L5xRoutine } from '../model/types.ts'
import type { ProjectSnapshot } from '../session.ts'
import { resolveTag } from './tag-resolution.ts'
import { addressAt, lexLogic, parseLadder, type LadderNode, type LogicToken } from './logic-syntax.ts'

/** Stable location within the source snapshot identified by its project hash. */
export interface SourceLocation {
  readonly scope: string
  readonly routine: string
  readonly language: string
  readonly rung?: number
  readonly line?: number
  readonly start: number
  readonly end: number
}

/** One source occurrence, with an operand classification and declaration resolution. */
export interface ParsedReference extends SourceLocation {
  readonly symbol: string
  readonly canonical?: string
  readonly access: 'read' | 'write' | 'read_write' | 'call' | 'unknown'
  readonly instruction?: string
  readonly indices_verified: boolean
  readonly context: string
}

/** A located limitation that prevents a claim of complete static coverage. */
export interface AnalysisLimitation { readonly scope: string; readonly routine: string; readonly rung?: number; readonly offset?: number; readonly reason: string }
/** Edge evidence uses indices into the containing analysis's reference array. */
export interface DependencyEdge { readonly from: string; readonly to: string; readonly kind: 'operand' | 'condition_candidate'; readonly evidence: readonly number[] }
/** Shared result for model tools and other consumers. */
export interface ProjectAnalysis {
  readonly project_id: string
  readonly source_sha256: string
  readonly references: readonly ParsedReference[]
  readonly dependencies: readonly DependencyEdge[]
  readonly limitations: readonly AnalysisLimitation[]
  readonly static_complete: boolean
  readonly runtime_causality_verified: false
}

/** Deployment limits prevent dense logic from producing unbounded reference and edge arrays. */
export interface AnalysisBounds { readonly references: number; readonly edges: number }

type Role = ParsedReference['access']
/** Registry version changes when operand roles change. It does not certify controller availability. */
export const SEMANTICS_VERSION = 1
const roles: Readonly<Record<string, readonly Role[]>> = {
  XIC: ['read'], XIO: ['read'], OTE: ['write'], OTL: ['write'], OTU: ['write'], CLR: ['write'],
  MOV: ['read', 'write'], MOVE: ['read', 'write'], COP: ['read', 'write', 'read'], CPS: ['read', 'write', 'read'], FLL: ['read', 'write', 'read'],
  ADD: ['read', 'read', 'write'], SUB: ['read', 'read', 'write'], MUL: ['read', 'read', 'write'], DIV: ['read', 'read', 'write'],
  EQU: ['read', 'read'], EQ: ['read', 'read'], NEQ: ['read', 'read'], NE: ['read', 'read'], GRT: ['read', 'read'], GT: ['read', 'read'],
  GEQ: ['read', 'read'], GE: ['read', 'read'], LES: ['read', 'read'], LT: ['read', 'read'], LEQ: ['read', 'read'], LE: ['read', 'read'],
  LIM: ['read', 'read', 'read'], LIMIT: ['read', 'read', 'read'], TON: ['read_write', 'read', 'read'], TOF: ['read_write', 'read', 'read'], RTO: ['read_write', 'read', 'read'],
  CTU: ['read_write', 'read', 'read'], CTD: ['read_write', 'read', 'read'], RES: ['read_write'], ONS: ['read_write'], NOP: [], AFI: [],
}
const keywords = new Set('IF THEN ELSE ELSIF END_IF FOR TO BY DO END_FOR WHILE END_WHILE REPEAT UNTIL END_REPEAT CASE OF END_CASE RETURN EXIT TRUE FALSE NOT AND OR XOR MOD'.split(' '))
const cache = new WeakMap<ProjectSnapshot, Map<string, ProjectAnalysis>>()

/** Build source-positioned references and conservative local dependency edges once per snapshot.
 * @param project - Immutable export snapshot.
 * @param bounds - Inclusive reference and edge limits; truncation makes coverage incomplete.
 * @returns Shared analysis with located limitations and source identity.
 */
export function analyzeProject(project: ProjectSnapshot, bounds: AnalysisBounds): ProjectAnalysis {
  const cacheKey = `${bounds.references}:${bounds.edges}`
  const cached = cache.get(project)?.get(cacheKey)
  if (cached !== undefined) return cached
  const references: ParsedReference[] = []
  const dependencies: DependencyEdge[] = []
  const limitations: AnalysisLimitation[] = []
  const truncated = new Set<string>()
  const location = (routine: L5xRoutine, token: LogicToken, rung?: number): SourceLocation => ({ scope: routine.program, routine: routine.name, language: routine.type, ...(rung === undefined ? { line: token.line } : { rung }), start: token.start, end: token.end })
  const limit = (routine: L5xRoutine, reason: string, rung?: number, offset?: number): void => {
    if (limitations.length < bounds.references) limitations.push({ scope: routine.program, routine: routine.name, ...(rung === undefined ? {} : { rung }), ...(offset === undefined ? {} : { offset }), reason })
    else truncated.add('Limitation report limit reached')
  }
  const addAddresses = (routine: L5xRoutine, tokens: readonly LogicToken[], access: Role, source: string, rung?: number, instruction?: string): number[] => {
    const indices: number[] = []
    for (let cursor = 0; cursor < tokens.length;) {
      if (references.length >= bounds.references) { truncated.add('Reference analysis limit reached'); break }
      const token = tokens[cursor]!
      if (token.kind !== 'identifier' || keywords.has(token.text.toUpperCase())) { cursor++; continue }
      const found = addressAt(tokens, cursor)
      if (found === undefined) { limit(routine, 'Malformed symbol address', rung, token.start); cursor++; continue }
      cursor = found.next
      const call = tokens[cursor]?.text === '('
      const resolution = resolveTag(project.document, routine.program, found.address.text)
      const role = call ? 'unknown' : access
      const index = references.length
      references.push({ ...location(routine, token, rung), end: found.address.end, symbol: found.address.text,
        ...(resolution.canonical === undefined ? {} : { canonical: resolution.canonical }), access: role,
        ...(instruction === undefined ? {} : { instruction }), indices_verified: resolution.indices_verified,
        context: rung === undefined ? source.split('\n')[token.line] ?? '' : source })
      indices.push(index)
      if (!resolution.resolved) limit(routine, `${found.address.text}: ${resolution.reason}`, rung, token.start)
      if (!resolution.indices_verified) limit(routine, `Dynamic subscript in ${found.address.text}`, rung, token.start)
      if (role === 'unknown') limit(routine, `Unresolved operand effects for ${found.address.text}`, rung, token.start)
      if (found.address.indexTokens.length > 0) indices.push(...addAddresses(routine, found.address.indexTokens, 'read', source, rung, instruction))
    }
    return indices
  }
  const connect = (indices: readonly number[], kind: DependencyEdge['kind']): void => {
    const reads = indices.filter(index => ['read', 'read_write'].includes(references[index]!.access))
    const writes = indices.filter(index => ['write', 'read_write'].includes(references[index]!.access))
    for (const read of reads) for (const write of writes) {
      const from = references[read]!.canonical
      const to = references[write]!.canonical
      if (from !== undefined && to !== undefined) {
        if (dependencies.length >= bounds.edges) { truncated.add('Dependency analysis limit reached'); return }
        dependencies.push({ from, to, kind, evidence: [read, write] })
      }
    }
  }
  const analyzeLadder = (routine: L5xRoutine, source: string, rung: number): void => {
    const parsed = parseLadder(source)
    for (const issue of parsed.issues) limit(routine, issue.message, rung, issue.offset)
    const rungIndices: number[] = []
    const visit = (nodes: readonly LadderNode[]): void => {
      for (const node of nodes) {
        if (references.length >= bounds.references) { truncated.add('Reference analysis limit reached'); break }
        if (node.kind === 'branch') { for (const path of node.paths) visit(path); continue }
        const name = node.name.toUpperCase()
        if (name === 'JSR') {
          const target = node.operands[0]?.map(token => token.text).join('') ?? ''
          const called = routines.find(entry => entry.program.toLowerCase() === routine.program.toLowerCase() && entry.name.toLowerCase() === target.toLowerCase())
          references.push({ scope: routine.program, routine: routine.name, language: routine.type, rung, start: node.start, end: node.end, symbol: target, ...(called === undefined ? {} : { canonical: `routine::${called.program}::${called.name}` }), access: 'call', instruction: node.name, indices_verified: true, context: source })
          limit(routine, 'JSR parameter transfer and called-routine effects require interprocedural analysis', rung, node.start)
          for (const operand of node.operands.slice(1)) rungIndices.push(...addAddresses(routine, operand, 'unknown', source, rung, node.name))
          continue
        }
        const aoi = project.document.aois.find(entry => entry.name.toUpperCase() === name)
        let operandRoles = roles[name]
        if (aoi !== undefined) {
          references.push({ scope: routine.program, routine: routine.name, language: routine.type, rung, start: node.start, end: node.end, symbol: aoi.name, canonical: `AOI::${aoi.name}`, access: 'call', instruction: node.name, indices_verified: true, context: source })
          const parameters = aoi.parameters.filter(parameter => parameter.visible !== false && !['EnableIn', 'EnableOut'].includes(parameter.name))
          operandRoles = ['read_write', ...parameters.map(parameter => parameter.usage === 'Input' ? 'read' as const : parameter.usage === 'Output' ? 'write' as const : parameter.usage === 'InOut' ? 'read_write' as const : 'unknown' as const)]
          limit(routine, 'AOI parameter usage is known; instance execution effects remain partial', rung, node.start)
        }
        if (operandRoles === undefined || operandRoles.length !== node.operands.length) {
          limit(routine, `Unsupported instruction or operand count: ${node.name}`, rung, node.start)
          operandRoles = node.operands.map(() => 'unknown')
        }
        const instructionIndices = node.operands.flatMap((operand, index) => addAddresses(routine, operand, operandRoles[index]!, source, rung, node.name))
        rungIndices.push(...instructionIndices)
        connect(instructionIndices, 'operand')
      }
    }
    visit(parsed.nodes)
    connect(rungIndices, 'condition_candidate')
  }
  const analyzeSt = (routine: L5xRoutine, source: string): void => {
    const parsed = lexLogic(source)
    for (const issue of parsed.issues) limit(routine, issue.message, undefined, issue.offset)
    let statement: LogicToken[] = []
    const visit = (): void => {
      if (statement.length === 0) return
      const assignment = statement.findIndex(token => token.text === ':=')
      const hasControl = statement.some(token => keywords.has(token.text.toUpperCase()) && !['TRUE', 'FALSE', 'AND', 'OR', 'XOR', 'NOT', 'MOD'].includes(token.text.toUpperCase()))
      if (hasControl) limit(routine, 'ST control-flow dependencies are partial', undefined, statement[0]!.start)
      if (assignment < 0) { addAddresses(routine, statement, 'read', source); return }
      const prefix = statement.slice(0, assignment)
      let targetOffset = -1
      for (let cursor = 0; cursor < prefix.length; cursor++) {
        const target = addressAt(prefix, cursor)
        if (target?.next === prefix.length && !keywords.has(prefix[cursor]!.text.toUpperCase())) { targetOffset = cursor; break }
      }
      if (targetOffset < 0 || statement.slice(assignment + 1).some(token => token.text === ':=')) {
        addAddresses(routine, statement, 'unknown', source); limit(routine, 'Unsupported assignment target or chained assignment', undefined, statement[0]!.start); return
      }
      const inputs = addAddresses(routine, prefix.slice(0, targetOffset), 'read', source)
      const outputs = addAddresses(routine, prefix.slice(targetOffset), 'write', source)
      const sources = addAddresses(routine, statement.slice(assignment + 1), 'read', source)
      connect([...inputs, ...outputs, ...sources], 'operand')
    }
    for (const token of parsed.tokens) {
      if (token.text === ';') { visit(); statement = [] }
      else statement.push(token)
    }
    if (statement.length > 0) { visit(); limit(routine, 'Source ends without a statement terminator', undefined, statement[0]!.start) }
  }
  const routines = [...project.document.routines, ...project.document.aois.flatMap(aoi => aoi.routines.map(routine => ({ ...routine, program: `AOI::${aoi.name}` })))]
  for (const routine of routines) {
    if (routine.body.type === 'RLL') for (const rung of routine.body.rungs) analyzeLadder(routine, rung.text, rung.number)
    else if (routine.body.type === 'ST') analyzeSt(routine, routine.body.code)
    else limit(routine, `${routine.type} execution analysis is unsupported`)
  }
  if (project.features.protectedContent === 'unsupported') limitations.push({ scope: 'controller', routine: '', reason: 'Protected content is not analyzed' })
  for (const reason of truncated) limitations.push({ scope: 'controller', routine: '', reason })
  const result: ProjectAnalysis = { project_id: project.id, source_sha256: project.sha256, references, dependencies, limitations, static_complete: limitations.length === 0, runtime_causality_verified: false }
  const ownedCache = cache.get(project) ?? new Map<string, ProjectAnalysis>()
  ownedCache.set(cacheKey, result)
  cache.set(project, ownedCache)
  return result
}

/** Read exported task scheduling, program entry routines and parsed JSR/AOI call locations.
 * @param project - Immutable selected export.
 * @param limits - Deployment bounds for graph size and source analysis.
 * @returns A bounded execution graph; declared scheduling is not observed scan execution.
 */
export function executionGraph(project: ProjectSnapshot, limits: TraceLimits) {
  const analysis = analyzeProject(project, limits.analysis)
  const nodes = new Map<string, { identity: string; kind: 'task' | 'program' | 'routine' | 'aoi'; declared: boolean }>()
  const edges: { from: string; to: string; kind: 'schedules' | 'entry' | 'call'; evidence?: ParsedReference }[] = []
  let truncated = false
  const add = (identity: string, kind: 'task' | 'program' | 'routine' | 'aoi', declared: boolean): boolean => {
    if (nodes.has(identity)) return true
    if (nodes.size >= limits.nodes) { truncated = true; return false }
    nodes.set(identity, { identity, kind, declared }); return true
  }
  const edge = (from: string, to: string, kind: 'schedules' | 'entry' | 'call', evidence?: ParsedReference): void => {
    if (!nodes.has(from) || !nodes.has(to) || edges.length >= limits.edges) { truncated = true; return }
    edges.push({ from, to, kind, ...(evidence === undefined ? {} : { evidence }) })
  }
  for (const program of project.document.programs) {
    const id = `program::${program.name}`; add(id, 'program', true)
    if (program.mainRoutine !== '') {
      const entry = project.document.routines.find(routine => routine.program === program.name && routine.name.toLowerCase() === program.mainRoutine.toLowerCase())
      const target = `routine::${program.name}::${entry?.name ?? program.mainRoutine}`
      add(target, 'routine', entry !== undefined); edge(id, target, 'entry')
    }
  }
  for (const task of project.document.tasks) {
    const id = `task::${task.name}`; add(id, 'task', true)
    for (const scheduled of task.programs) {
      const program = project.document.programs.find(program => program.name.toLowerCase() === scheduled.toLowerCase())
      const target = `program::${program?.name ?? scheduled}`
      add(target, 'program', program !== undefined); edge(id, target, 'schedules')
    }
  }
  for (const reference of analysis.references) if (reference.access === 'call') {
    const caller = `routine::${reference.scope}::${reference.routine}`
    add(caller, 'routine', true)
    const target = reference.canonical ?? `routine::${reference.scope}::${reference.symbol}`
    add(target, target.startsWith('AOI::') ? 'aoi' : 'routine', reference.canonical !== undefined)
    edge(caller, target, 'call', reference)
  }
  return { project_id: project.id, source_sha256: project.sha256, nodes: [...nodes.values()], edges, truncated,
    unscheduled_programs: project.document.programs.filter(program => !project.document.tasks.some(task => task.programs.some(name => name.toLowerCase() === program.name.toLowerCase()))).slice(0, limits.nodes).map(program => program.name),
    static_complete: analysis.static_complete && !truncated && [...nodes.values()].every(node => node.declared), runtime_execution_verified: false }
}

/** Bounds for a breadth-first static dependency traversal. */
export interface TraceLimits { readonly depth: number; readonly nodes: number; readonly edges: number; readonly analysis: AnalysisBounds }

/** Trace dependencies or dependents, returning every stopping reason.
 * @param project - Immutable selected source.
 * @param symbol - Selected tag address.
 * @param scope - Its resolution scope.
 * @param direction - Upstream sources or downstream impact.
 * @param limits - Validated deployment bounds.
 * @returns Bounded graph with source-linked edges, coverage and truncation indicators.
 */
export function traceDependencies(project: ProjectSnapshot, symbol: string, scope: string, direction: 'upstream' | 'downstream', limits: TraceLimits) {
  const analysis = analyzeProject(project, limits.analysis)
  const resolution = resolveTag(project.document, scope, symbol)
  const root = resolution.canonical
  const coverage = { limitations: analysis.limitations.slice(0, limits.edges), limitations_total: analysis.limitations.length, limitations_truncated: analysis.limitations.length > limits.edges }
  if (root === undefined) return { project_id: project.id, source_sha256: project.sha256, resolution, nodes: [], edges: [], ...coverage, truncated: false, static_complete: false, runtime_causality_verified: false }
  const nodes = new Map<string, number>([[root, 0]])
  const queue = [root]
  const edges: DependencyEdge[] = []
  const seenEdges = new Set<DependencyEdge>()
  const adjacency = new Map<string, DependencyEdge[]>()
  for (const edge of analysis.dependencies) {
    const key = direction === 'upstream' ? edge.to : edge.from
    const existing = adjacency.get(key)
    if (existing === undefined) adjacency.set(key, [edge])
    else existing.push(edge)
  }
  let truncated = false
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const current = queue[cursor]!
    const depth = nodes.get(current)!
    for (const edge of adjacency.get(current) ?? []) {
      const next = direction === 'upstream' ? edge.from : edge.to
      if (seenEdges.has(edge)) continue
      if (depth >= limits.depth || edges.length >= limits.edges || (!nodes.has(next) && nodes.size >= limits.nodes)) { truncated = true; continue }
      seenEdges.add(edge); edges.push(edge)
      if (!nodes.has(next)) { nodes.set(next, depth + 1); queue.push(next) }
    }
  }
  return { project_id: project.id, source_sha256: project.sha256, resolution, direction, nodes: [...nodes].map(([symbol, depth]) => ({ symbol, depth })), edges: edges.map(edge => ({ ...edge, evidence: edge.evidence.map(index => analysis.references[index]) })), ...coverage, truncated, static_complete: analysis.static_complete && !truncated, runtime_causality_verified: false }
}
