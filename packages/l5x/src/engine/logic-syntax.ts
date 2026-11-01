/** Source-positioned Logix tokens and NeutralText structure for static analysis. */

import { alternateMnemonic } from './mnemonics.ts'

/** Offsets refer to UTF-16 positions in the original source, with an exclusive end. */
export interface LogicToken {
  readonly kind: 'identifier' | 'number' | 'string' | 'punctuation'
  readonly text: string
  readonly start: number
  readonly end: number
  readonly line: number
}

/** An unsupported or malformed source region; partial analysis retains its location. */
export interface SyntaxIssue { readonly offset: number; readonly message: string }

/** A ladder instruction or parallel branch retains its exact source extent. */
export type LadderNode =
  | { readonly kind: 'instruction'; readonly name: string; readonly operands: readonly (readonly LogicToken[])[]; readonly start: number; readonly end: number }
  | { readonly kind: 'branch'; readonly paths: readonly (readonly LadderNode[])[]; readonly start: number; readonly end: number }

/** Tokenize Logix source without treating comments or quoted literals as symbols.
 * @param source - Original routine or rung text.
 * @returns Source tokens and lexical issues; newlines in comments and literals retain their positions.
 */
export function lexLogic(source: string): { tokens: readonly LogicToken[]; issues: readonly SyntaxIssue[] } {
  const tokens: LogicToken[] = []
  const issues: SyntaxIssue[] = []
  let cursor = 0
  let line = 0
  const advance = (): void => { if (source[cursor] === '\n') line++; cursor++ }
  while (cursor < source.length) {
    const char = source[cursor]!
    if (/\s/u.test(char)) { advance(); continue }
    if (source.startsWith('//', cursor)) { while (cursor < source.length && source[cursor] !== '\n') advance(); continue }
    if (source.startsWith('(*', cursor) || source.startsWith('/*', cursor)) {
      const start = cursor
      const close = source.startsWith('(*', cursor) ? '*)' : '*/'
      advance(); advance()
      while (cursor < source.length && !source.startsWith(close, cursor)) advance()
      if (cursor === source.length) issues.push({ offset: start, message: 'Unterminated block comment' })
      else { advance(); advance() }
      continue
    }
    const start = cursor
    const firstLine = line
    let kind: LogicToken['kind'] = 'punctuation'
    if (char === "'" || char === '"') {
      kind = 'string'
      advance()
      let closed = false
      while (cursor < source.length) {
        if (source[cursor] === '$') { advance(); if (cursor < source.length) advance(); continue }
        if (source[cursor] === char) {
          advance()
          if (source[cursor] === char) { advance(); continue }
          closed = true; break
        }
        advance()
      }
      if (!closed) issues.push({ offset: start, message: 'Unterminated string literal' })
    } else if (/[A-Za-z_]/u.test(char)) {
      kind = 'identifier'
      while (cursor < source.length && /[A-Za-z0-9_]/u.test(source[cursor]!)) advance()
    } else if (/[0-9]/u.test(char)) {
      kind = 'number'
      while (cursor < source.length && /[0-9A-Fa-f_#]/u.test(source[cursor]!)) advance()
    } else {
      advance()
      if ([':=', '<=', '>=', '<>', '**'].includes(source.slice(start, cursor + 1))) advance()
    }
    tokens.push({ kind, text: source.slice(start, cursor), start, end: cursor, line: firstLine })
  }
  return { tokens, issues }
}

/** Parse standard NeutralText instructions and nested parallel branches.
 * @param source - One complete rung, including its terminator.
 * @returns Parsed nodes and located issues; malformed structure is never silently complete.
 */
export function parseLadder(source: string): { nodes: readonly LadderNode[]; issues: readonly SyntaxIssue[] } {
  const lexical = lexLogic(source)
  const tokens = lexical.tokens
  const issues = [...lexical.issues]
  let cursor = 0
  const sequence = (depth: number): LadderNode[] => {
    const nodes: LadderNode[] = []
    if (depth > 128) { issues.push({ offset: tokens[cursor]?.start ?? source.length, message: 'Branch nesting exceeds the parser limit' }); cursor = tokens.length; return nodes }
    while (cursor < tokens.length) {
      const token = tokens[cursor]!
      if (token.text === ']' || token.text === ',') break
      if (token.kind === 'identifier' && ['NXB', 'BND'].includes(token.text.toUpperCase())) break
      if (token.text === ';') { cursor++; if (cursor < tokens.length) issues.push({ offset: token.start, message: 'Content after rung terminator' }); break }
      if (token.text === '[') {
        cursor++
        const paths: LadderNode[][] = []
        paths.push(sequence(depth + 1))
        while (tokens[cursor]?.text === ',') { cursor++; paths.push(sequence(depth + 1)) }
        const close = tokens[cursor]
        if (close?.text !== ']') { issues.push({ offset: token.start, message: 'Unterminated ladder branch' }); break }
        cursor++
        if (paths.length < 2 || paths.some(path => path.length === 0)) issues.push({ offset: token.start, message: 'Branch requires nonempty parallel paths' })
        nodes.push({ kind: 'branch', paths, start: token.start, end: close.end })
        continue
      }
      if (token.kind === 'identifier' && token.text.toUpperCase() === 'BST') {
        cursor++
        const paths: LadderNode[][] = [sequence(depth + 1)]
        while (tokens[cursor]?.text.toUpperCase() === 'NXB') { cursor++; paths.push(sequence(depth + 1)) }
        const close = tokens[cursor]
        if (close?.text.toUpperCase() !== 'BND') { issues.push({ offset: token.start, message: 'Unterminated BST branch' }); break }
        cursor++
        if (paths.length < 2 || paths.some(path => path.length === 0)) issues.push({ offset: token.start, message: 'Branch requires nonempty parallel paths' })
        nodes.push({ kind: 'branch', paths, start: token.start, end: close.end })
        continue
      }
      if (token.kind !== 'identifier' || tokens[cursor + 1]?.text !== '(') {
        issues.push({ offset: token.start, message: `Unsupported ladder token ${token.text}` }); cursor++; continue
      }
      cursor += 2
      const operands: LogicToken[][] = [[]]
      let parentheses = 1
      let brackets = 0
      let end = token.end
      while (cursor < tokens.length) {
        const operand = tokens[cursor++]!
        if (operand.text === '(') parentheses++
        if (operand.text === ')') parentheses--
        if (parentheses === 0) { end = operand.end; break }
        if (operand.text === '[') brackets++
        if (operand.text === ']') brackets--
        if (operand.text === ',' && parentheses === 1 && brackets === 0) operands.push([])
        else operands[operands.length - 1]!.push(operand)
      }
      if (parentheses !== 0 || brackets !== 0) issues.push({ offset: token.start, message: 'Unbalanced instruction operands' })
      nodes.push({ kind: 'instruction', name: token.text, operands: operands.length === 1 && operands[0]!.length === 0 ? [] : operands, start: token.start, end })
    }
    return nodes
  }
  const nodes = sequence(0)
  if (cursor !== tokens.length) issues.push({ offset: tokens[cursor]!.start, message: 'Unexpected branch delimiter' })
  if (tokens[tokens.length - 1]?.text !== ';') issues.push({ offset: source.length, message: 'Missing rung terminator' })
  return { nodes, issues }
}

/**
 * Instructions that read the rung condition and never drive the right power rail.
 *
 * Studio rejects a rung whose last instruction is one of these — the audit raises
 * `RxCMP_E_AUDIT_OUTPUTS` at build time, long after the draft was accepted. The
 * parser can see the same thing from the node tree.
 */
const RAIL_READERS: ReadonlySet<string> = new Set([
  'AFI', 'ONS', 'XIC', 'XIO',
  'ISINF', 'ISNAN', 'DTR',
  'AND', 'OR', 'XOR', 'NOT', 'BTD',
  'EQU', 'GEQ', 'GRT', 'LEQ', 'LES', 'LIM', 'MEQ', 'NEQ',
])

/**
 * Name the instruction that leaves a rung without an output.
 *
 * The right power rail must be driven by an output instruction; a branch at the
 * end is fine when every path ends in one.
 *
 * @param nodes - Parsed nodes of one rung.
 * @returns The read-only mnemonic at the rail, or undefined when the rung ends in an output.
 */
export function rightRailReader(nodes: readonly LadderNode[]): string | undefined {
  const last = nodes[nodes.length - 1]
  if (last === undefined) return undefined
  if (last.kind === 'branch') {
    for (const path of last.paths) {
      const reader = rightRailReader(path)
      if (reader !== undefined) return reader
    }
    return undefined
  }
  const upper = last.name.toUpperCase()
  if (RAIL_READERS.has(upper)) return upper
  // Logix Designer 36 renamed several of these (EQU to EQ, …). The rail rule is about
  // the instruction, not the spelling, so either published form counts: a v36 project
  // ending a rung in EQ( leaves the rail undriven exactly as EQU( does.
  const alternate = alternateMnemonic(upper)
  return alternate !== undefined && RAIL_READERS.has(alternate) ? alternate : undefined
}

/** One address token sequence, including indices and its source occurrence. */export interface AddressOccurrence { readonly text: string; readonly start: number; readonly end: number; readonly line: number; readonly indexTokens: readonly LogicToken[] }

/** Read an identifier with optional program qualification, member paths and indices.
 * @param tokens - Source-positioned tokens.
 * @param offset - Index of the address's first identifier.
 * @returns The address and next token index, or undefined for malformed indices.
 */
export function addressAt(tokens: readonly LogicToken[], offset: number): { address: AddressOccurrence; next: number } | undefined {
  const first = tokens[offset]
  if (first?.kind !== 'identifier') return undefined
  let cursor = offset + 1
  let text = first.text
  const indexTokens: LogicToken[] = []
  if (first.text.toLowerCase() === 'program' && tokens[cursor]?.text === ':' && tokens[cursor + 1]?.kind === 'identifier' && tokens[cursor + 2]?.text === '.') {
    text += `:${tokens[cursor + 1]!.text}.`; cursor += 3
    if (tokens[cursor]?.kind !== 'identifier') return undefined
    text += tokens[cursor++]!.text
  }
  while (cursor < tokens.length) {
    if (tokens[cursor]?.text === '[') {
      let depth = 1
      text += tokens[cursor++]!.text
      while (cursor < tokens.length && depth > 0) {
        const token = tokens[cursor++]!
        if (token.text === '[') depth++
        if (token.text === ']') depth--
        text += token.text
        if (depth > 0) indexTokens.push(token)
      }
      if (depth !== 0) return undefined
    } else if (tokens[cursor]?.text === '.' && ['identifier', 'number'].includes(tokens[cursor + 1]?.kind ?? '')) {
      text += `.${tokens[cursor + 1]!.text}`; cursor += 2
    } else break
  }
  return { address: { text, start: first.start, end: tokens[cursor - 1]!.end, line: first.line, indexTokens }, next: cursor }
}
