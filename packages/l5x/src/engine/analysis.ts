import type { L5xDocument, L5xRoutine, L5xTag } from '../model/types.ts'
import { controllerElementOf } from '../model/parse.ts'
import { elementChildren, firstChild, type XmlElement } from '../model/xml.ts'
import { memberOf } from './details.ts'
import { resolveTag } from './tag-resolution.ts'
import type { ProjectSnapshot } from '../session.ts'

export type Access = 'read' | 'write' | 'read_write' | 'call' | 'unknown'
export interface Evidence {
  readonly scope: string
  readonly routine: string
  readonly language: string
  readonly rung?: number
  readonly line?: number
  readonly sheet?: number
  readonly nodeId?: string
  readonly symbol: string
  readonly resolved?: string
  readonly access: Access
  readonly confidence: 'high' | 'medium' | 'low'
  readonly context: string
}

const TOKEN = /[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z0-9_]+)*(?:\[[^\]]+\])?(?:\.[A-Za-z0-9_]+(?:\[[^\]]+\])?)*/gu
const LADDER = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([^()]*)\)/gu
const READ_OPS = new Set(['XIC', 'XIO', 'EQU', 'EQ', 'NEQ', 'NE', 'GRT', 'GT', 'GEQ', 'GE', 'LES', 'LT', 'LEQ', 'LE', 'LIM', 'LIMIT', 'CMP'])
const WRITE_OPS = new Set(['OTE', 'OTL', 'OTU', 'CLR'])
const SOURCE_DEST_OPS = new Set(['MOV', 'MOVE', 'FLL', 'COP', 'ADD', 'SUB', 'MUL', 'DIV'])
const READ_WRITE_OPS = new Set(['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES'])
const KEYWORDS = new Set(['IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF', 'FOR', 'TO', 'DO', 'END_FOR', 'WHILE', 'END_WHILE', 'RETURN', 'TRUE', 'FALSE', 'AND', 'OR', 'NOT', 'MOD'])
const BUILTIN_MEMBERS: Readonly<Record<string, ReadonlySet<string>>> = {
  TIMER: new Set(['EN', 'TT', 'DN', 'PRE', 'ACC']),
  TIMER_T: new Set(['EN', 'TT', 'DN', 'PRE', 'ACC']),
  COUNTER: new Set(['CU', 'CD', 'DN', 'OV', 'UN', 'PRE', 'ACC']),
}
/** Integer types that expose bit addresses as `Tag.bit`. */
const INTEGER_TYPES = new Set(['SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT'])

/**
 * Split instruction operands on top-level commas.
 *
 * A two-dimensional subscript such as `Alarm_Timer[0,0].DN` contains a comma
 * that is not an operand separator; splitting blindly turned that operand into
 * `Alarm_Timer[0` and `0].DN`, which is where hundreds of false `DN`
 * references came from.
 */
function splitArguments(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote = ''
  let start = 0
  for (let index = 0; index < text.length; index++) {
    const char = text[index]!
    if (quote !== '') { if (char === quote) quote = ''; continue }
    if (char === '"' || char === "'") { quote = char; continue }
    if (char === '[') depth += 1
    else if (char === ']') depth = Math.max(0, depth - 1)
    else if (char === ',' && depth === 0) { parts.push(text.slice(start, index)); start = index + 1 }
  }
  parts.push(text.slice(start))
  return parts.map(part => part.trim())
}

interface SymbolTable {
  readonly tags: ReadonlyMap<string, L5xTag>
  readonly aliases: ReadonlyMap<string, string>
}
const tables = new WeakMap<L5xDocument, SymbolTable>()
const evidenceCache = new WeakMap<ProjectSnapshot, readonly Evidence[]>()

function tagKey(scope: string, name: string): string { return `${scope}::${name.toLowerCase()}` }

function aliasElements(container: XmlElement | undefined, scope: string, aliases: Map<string, string>): void {
  const tags = container === undefined ? undefined : firstChild(container, 'Tags')
  if (tags === undefined) return
  for (const tag of elementChildren(tags, 'Tag')) {
    const name = tag.attrs['Name']
    const target = tag.attrs['AliasFor']
    if (name !== undefined && target !== undefined) aliases.set(tagKey(scope, name), target)
  }
}

function tableOf(document: L5xDocument): SymbolTable {
  const cached = tables.get(document)
  if (cached !== undefined) return cached
  const tags = new Map(document.tags.map(tag => [tagKey(tag.scope, tag.name), tag]))
  const aliases = new Map<string, string>()
  const controller = controllerElementOf(document)
  aliasElements(controller, 'controller', aliases)
  const programs = firstChild(controller, 'Programs')
  if (programs !== undefined) for (const program of elementChildren(programs, 'Program')) {
    aliasElements(program, program.attrs['Name'] ?? '', aliases)
  }
  const table = { tags, aliases }
  tables.set(document, table)
  return table
}

/**
 * Resolve a written symbol to a canonical declaration.
 *
 * The fast path walks the declaration and alias tables. It stops where the
 * operand behind an alias is not a declared `<Tag>` — module I/O such as
 * `FanFold_StraightCut_AENTR:2:I.7` — which is common in a real project: those
 * references are proven by the export, not missing. Fall back to the canonical
 * resolver (the one behind `resolve_tag`) before declaring a symbol unresolved.
 */
/**
 * Scopes in which one symbol resolves.
 *
 * A refusal that says a symbol is "absent from the export" when it is declared in another scope
 * sends a reader looking for a missing declaration that is not missing. This answers where it is.
 *
 * @param document - The open project.
 * @param symbol - The symbol as written.
 * @returns Declaring scopes, controller first, then programs, then AOIs.
 */
export function declaringScopes(document: L5xDocument, symbol: string): string[] {
  const found: string[] = []
  if (resolveSymbol(document, 'controller', symbol) !== undefined) found.push('controller')
  for (const program of document.programs) {
    if (resolveSymbol(document, program.name, symbol) !== undefined) found.push(program.name)
  }
  for (const aoi of document.aois) {
    if (resolveSymbol(document, aoi.name, symbol) !== undefined) found.push(`AOI ${aoi.name}`)
  }
  return found
}

export function resolveSymbol(document: L5xDocument, scope: string, symbol: string): string | undefined {
  const direct = resolveSymbolDirect(document, scope, symbol)
  if (direct !== undefined) return direct
  const resolution = resolveTag(document, scope, symbol)
  return resolution.resolved ? resolution.canonical : undefined
}

/** Resolve only declarations proven by the export. Never guess an absent member. */
function resolveSymbolDirect(document: L5xDocument, scope: string, symbol: string): string | undefined {
  const table = tableOf(document)
  const aoi = document.aois.find(entry => entry.name === scope)
  const parts = symbol.replace(/\[[^\]]+\]/gu, '').split('.')
  const base = parts.shift()
  if (base === undefined) return undefined
  if (aoi !== undefined && (aoi.parameters.some(p => p.name.toLowerCase() === base.toLowerCase()) || aoi.localTags.some(t => t.name.toLowerCase() === base.toLowerCase()))) {
    return `${scope}::${symbol}`
  }
  let tag = table.tags.get(tagKey(scope, base)) ?? table.tags.get(tagKey('controller', base))
  if (tag === undefined) return undefined
  const declared = tag
  let resolvedBase = tag.name
  const seen = new Set<string>()
  while (tag !== undefined) {
    const key = tagKey(tag.scope, tag.name)
    const alias = table.aliases.get(key)
    if (alias === undefined) break
    if (seen.has(key)) return undefined
    seen.add(key)
    resolvedBase = alias
    const aliasBase = alias.split('.')[0]
    if (aliasBase === undefined) break
    tag = table.tags.get(tagKey(tag.scope, aliasBase)) ?? table.tags.get(tagKey('controller', aliasBase))
    // A module I/O operand (`Local:1:I.Data[0].5`) is not a declared <Tag>: the
    // export proves the alias, not the operand behind it. Resolving to the alias
    // is what stops 315 real references being reported as unresolved, while
    // resolveTag still canonicalises the operand for callers that ask to resolve.
    if (tag === undefined) return `${declared.scope}::${declared.name}${parts.length > 0 ? `.${parts.join('.')}` : ''}`
  }
  const path = [...resolvedBase.split('.').slice(1), ...parts]
  if (path.length > 0) {
    let type = tag?.dataType
    for (const [index, part] of path.entries()) {
      if (/^\d+$/u.test(part)) {
        // `Alarm[8].12` is bit 12 of an integer element; nothing may follow it.
        // Module I/O data carries no builtin DataType in the export, so an empty
        // type with a trailing numeric part is still a bit of that module data.
        const known = type === undefined || type === '' ? undefined : type.toUpperCase()
        if (index !== path.length - 1 || (known !== undefined && !INTEGER_TYPES.has(known))) return undefined
        type = 'BOOL'
        continue
      }
      if (type !== undefined && BUILTIN_MEMBERS[type.toUpperCase()]?.has(part.toUpperCase())) {
        if (index !== path.length - 1) return undefined
        continue
      }
      const aoiDefinition = document.aois.find(entry => entry.name.toLowerCase() === type?.toLowerCase())
      if (aoiDefinition !== undefined) {
        const member = aoiDefinition.parameters.find(entry => entry.name.toLowerCase() === part.toLowerCase())
          ?? aoiDefinition.localTags.find(entry => entry.name.toLowerCase() === part.toLowerCase())
        if (member === undefined) return undefined
        type = member.dataType
        continue
      }
      const member = memberOf(document, type ?? '', part)
      if (member === undefined) return undefined
      type = member.dataType
    }
  }
  return `${tag?.scope ?? scope}::${resolvedBase}${parts.length > 0 ? `.${parts.join('.')}` : ''}`
}

function tokens(text: string): string[] {
  const found: string[] = []
  // A string literal is not a tag: MOVE('C',Dest) handed back C as an unresolved reference on a real
  // project, eight times over. Mask the literal so its letters never match; indices stay aligned.
  const masked = text.replace(/'(?:[^']|'')*'/gu, literal => ' '.repeat(literal.length))
  for (const match of masked.matchAll(TOKEN)) {
    const at = match.index ?? 0
    // A radix literal — 16#F000, 2#1010, 8#777 — must not hand back the digits after the #
    // as a symbol. On a real project every hex mask became an unresolved reference.
    if (at > 0 && text.charAt(at - 1) === '#') continue
    const token = match[0]
    if (KEYWORDS.has(token.toUpperCase()) || /^\d/u.test(token)) continue
    found.push(token)
  }
  return found
}

function add(out: Evidence[], document: L5xDocument, routine: L5xRoutine, symbol: string, access: Access, context: string, location: { rung?: number; line?: number; sheet?: number; nodeId?: string }, confidence: Evidence['confidence']): void {
  const resolved = resolveSymbol(document, routine.program, symbol)
  out.push({ scope: routine.program, routine: routine.name, language: routine.type, ...location, symbol, ...(resolved === undefined ? {} : { resolved }), access, confidence, context })
}

function ladderEvidence(out: Evidence[], document: L5xDocument, routine: L5xRoutine, text: string, rung: number): void {
  for (const match of text.matchAll(LADDER)) {
    const op = match[1]?.toUpperCase() ?? ''
    const args = splitArguments(match[2] ?? '')
    if (op === 'JSR') {
      const target = args[0] ?? ''
      const called = document.routines.find(entry => entry.program === routine.program && entry.name.toLowerCase() === target.toLowerCase())
      out.push({ scope: routine.program, routine: routine.name, language: routine.type, rung, symbol: target, ...(called === undefined ? {} : { resolved: `${called.program}::${called.name}` }), access: 'call', confidence: called === undefined ? 'low' : 'high', context: text })
      continue
    }
    const aoi = document.aois.find(entry => entry.name.toUpperCase() === op)
    if (aoi !== undefined) {
      out.push({ scope: routine.program, routine: routine.name, language: routine.type, rung, symbol: aoi.name, resolved: `AOI::${aoi.name}`, access: 'call', confidence: 'high', context: text })
      const visible = aoi.parameters.filter(parameter => parameter.visible !== false && parameter.name !== 'EnableIn' && parameter.name !== 'EnableOut')
      const positional = args.length === visible.length + 1
      for (const [index, arg] of args.entries()) {
        const usage = positional && index > 0 ? visible[index - 1]?.usage : undefined
        const access: Access = index === 0 ? 'read_write' : usage === 'Input' ? 'read' : usage === 'Output' ? 'write' : usage === 'InOut' ? 'read_write' : 'unknown'
        for (const symbol of tokens(arg ?? '')) add(out, document, routine, symbol, access, text, { rung }, usage === undefined ? 'low' : 'medium')
      }
      continue
    }
    for (const [index, arg] of args.entries()) {
      const destination = op === 'COP' || op === 'FLL' ? 1 : args.length - 1
      const access: Access = READ_OPS.has(op) ? 'read' : WRITE_OPS.has(op) ? 'write' : SOURCE_DEST_OPS.has(op) ? (index === destination ? 'write' : 'read') : READ_WRITE_OPS.has(op) ? 'read_write' : 'unknown'
      for (const symbol of tokens(arg ?? '')) add(out, document, routine, symbol, access, text, { rung }, access === 'unknown' ? 'low' : 'medium')
    }
  }
}

function structuredEvidence(out: Evidence[], document: L5xDocument, routine: L5xRoutine, code: string): void {
  // Keep offsets and line positions while excluding strings and multiline comments.
  const text = code.replace(/\(\*[\s\S]*?\*\)|\/\*[\s\S]*?\*\/|\/\/[^\n]*|'(?:\$[\s\S]|''|[^'])*'|"(?:\$[\s\S]|""|[^"])*"/gu,
    value => value.replace(/[^\n]/gu, ' '))
  let start = 0
  for (const statement of text.split(';')) {
    const assignment = statement.indexOf(':=')
    const target = assignment < 0 ? undefined : /([A-Za-z_][A-Za-z0-9_.]*(?:\[[^\]]+\])?)\s*$/u.exec(statement.slice(0, assignment))
    const targetStart = target === undefined || target === null ? -1 : target.index
    const ambiguous = assignment >= 0 && statement.indexOf(':=', assignment + 2) >= 0
    for (const match of statement.matchAll(TOKEN)) {
      const symbol = match[0]
      if (KEYWORDS.has(symbol.toUpperCase()) || /^(?:BY|END_FOR|REPEAT|UNTIL|END_REPEAT|CASE|OF|END_CASE|EXIT|END_WHILE)$/iu.test(symbol)) continue
      const call = /^\s*\(/u.test(statement.slice(match.index + symbol.length))
      const indexed = symbol.includes('[')
      const access: Access = ambiguous || call || indexed ? 'unknown'
        : assignment >= 0 && match.index === targetStart ? 'write' : 'read'
      const line = text.slice(0, start + match.index).split('\n').length - 1
      add(out, document, routine, symbol, access, code.split('\n')[line]?.trim() ?? '', { line }, access === 'unknown' ? 'low' : 'medium')
    }
    start += statement.length + 1
  }
}

export function evidenceOf(project: ProjectSnapshot): readonly Evidence[] {
  const cached = evidenceCache.get(project)
  if (cached !== undefined) return cached
  const out: Evidence[] = []
  const routines = [...project.document.routines, ...project.document.aois.flatMap(aoi => aoi.routines)]
  for (const routine of routines) {
    if (routine.body.type === 'RLL') {
      for (const rung of routine.body.rungs) ladderEvidence(out, project.document, routine, rung.text, rung.number)
    } else if (routine.body.type === 'ST') {
      structuredEvidence(out, project.document, routine, routine.body.code)
    } else if (routine.body.type === 'FBD' || routine.body.type === 'SFC') {
      for (const node of routine.body.nodes) {
        const expression = node.operand ?? (node.kind === 'Line' ? node.text : undefined)
        if (expression === undefined) continue
        const access: Access = node.kind === 'IRef' ? 'read' : node.kind === 'ORef' ? 'write' : 'unknown'
        for (const symbol of tokens(expression)) add(out, project.document, routine, symbol, access, `${node.kind} sheet ${node.sheet} id ${node.id ?? '?'}`, { sheet: node.sheet, ...(node.id === undefined ? {} : { nodeId: node.id }) }, access === 'unknown' ? 'low' : 'medium')
      }
    }
  }
  evidenceCache.set(project, out)
  return out
}

export function findReferences(project: ProjectSnapshot, symbol: string, scope?: string): readonly Evidence[] {
  const query = symbol.toLowerCase()
  return evidenceOf(project).filter(entry => (scope === undefined || entry.scope === scope) && (
    entry.symbol.toLowerCase() === query || entry.symbol.toLowerCase().startsWith(`${query}.`) ||
    entry.resolved?.toLowerCase() === query || entry.resolved?.toLowerCase().endsWith(`::${query}`) ||
    entry.resolved?.toLowerCase().includes(`::${query}.`)
  ))
}

export function traceSymbol(project: ProjectSnapshot, symbol: string, scope?: string): object {
  const references = findReferences(project, symbol, scope)
  const writers = references.filter(r => r.access === 'write' || r.access === 'read_write')
  const all = evidenceOf(project)
  const originCandidates = writers.map(writer => ({
    writer,
    inputsAtLocation: all.filter(ref => ref.scope === writer.scope && ref.routine === writer.routine && ref.rung === writer.rung && ref.line === writer.line && ref.sheet === writer.sheet && ref.access === 'read'),
  }))
  return {
    symbol, references, writers, originCandidates,
    readers: references.filter(r => r.access === 'read' || r.access === 'read_write'),
    complete: false,
    classification_complete: references.length > 0 && references.every(r => r.access !== 'unknown' && r.resolved !== undefined) && project.features.functionBlock !== 'partial' && project.features.sequentialFunctionChart !== 'partial',
    note: 'Inputs at a writer location are candidates, not proven causal or runtime data flow. External controller behavior is not analyzed.',
  }
}
