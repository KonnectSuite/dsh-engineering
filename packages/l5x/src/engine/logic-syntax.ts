/** Source-positioned Logix tokens and NeutralText structure for static analysis. */

import { alternateMnemonic } from './mnemonics.ts'
import { instructionByName } from './instructions.ts'

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

/** Tokens that continue an expression instead of ending an operand. */
const OPERATOR_TOKENS: ReadonlySet<string> = new Set(['+', '-', '*', '/', '%', '&', '|', '^', '~', '!', '<', '>', '=', '<>', '<=', '>=', ':='])

/**
 * Whether an identifier names an instruction rather than an operand.
 *
 * Studio's copy format has no parentheses to separate a mnemonic from its operands, so the
 * instruction catalog is the only reliable boundary: a catalogued mnemonic starts the next
 * instruction, and anything else continues the operand being read.
 *
 * @param name - Identifier text as written.
 * @returns The catalog entry, or undefined when the name is not a known instruction.
 */
function instructionMnemonic(name: string): boolean {
  const alternate = alternateMnemonic(name)
  return instructionByName(name) !== undefined || (alternate !== undefined && instructionByName(alternate) !== undefined)
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
      if (token.kind !== 'identifier') {
        issues.push({ offset: token.start, message: `Unsupported ladder token ${token.text}` }); cursor++; continue
      }
      if (tokens[cursor + 1]?.text === '(') {
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
        continue
      }
      if (!instructionMnemonic(token.text)) {
        issues.push({ offset: token.start, message: `Unsupported ladder token ${token.text}` }); cursor++; continue
      }
      // Studio's copy format: the mnemonic, then its operands separated by spaces, with no
      // parentheses. A whitespace gap ends an operand unless an operator token carries the
      // expression on, so `Local:1:I.Pt12.Data` and `Tag1 + Tag2` each stay one operand.
      cursor++
      const operands: LogicToken[][] = []
      let group: LogicToken[] | undefined
      let previous: LogicToken | undefined
      let end = token.end
      while (cursor < tokens.length) {
        const next = tokens[cursor]!
        if (next.text === ';' || next.text === ',' || next.text === ']') break
        if (next.kind === 'identifier') {
          const upper = next.text.toUpperCase()
          if (upper === 'BST' || upper === 'NXB' || upper === 'BND' || instructionMnemonic(next.text)) break
        }
        const gap = previous !== undefined && next.start > previous.end
        const continues = previous !== undefined && (OPERATOR_TOKENS.has(previous.text) || OPERATOR_TOKENS.has(next.text))
        if (group === undefined || (gap && !continues)) { if (group !== undefined) operands.push(group); group = [] }
        group.push(next)
        previous = next
        end = next.end
        cursor++
      }
      if (group !== undefined) operands.push(group)
      nodes.push({ kind: 'instruction', name: token.text, operands, start: token.start, end })
    }
    return nodes
  }
  const nodes = sequence(0)
  if (cursor !== tokens.length) issues.push({ offset: tokens[cursor]!.start, message: 'Unexpected branch delimiter' })
  if (tokens[tokens.length - 1]?.text !== ';') issues.push({ offset: source.length, message: 'Missing rung terminator' })
  return { nodes, issues }
}

/**
 * Read one rung written in either format.
 *
 * Studio's ladder clipboard carries no rung terminator, and a paste out of a routine is exactly
 * what an engineer hands this plugin, so a missing `;` is completed rather than refused. A block
 * of several rungs is refused with a message that names the tool which does take a block.
 *
 * @param source - One rung: NeutralText, or text copied straight out of a Studio routine.
 * @returns Parsed nodes, located issues, and the rung text with its terminator made explicit.
 */
export function parseRung(source: string): { nodes: readonly LadderNode[]; issues: readonly SyntaxIssue[]; text: string } {
  const trimmed = source.trim()
  if (/;\s*$/u.test(trimmed)) return { ...parseLadder(trimmed), text: trimmed }
  const lines = trimmed.split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '' && !line.startsWith('//'))
  if (lines.length > 1 && lines.every(line => parseLadder(`${line} ;`).issues.length === 0)) {
    return { nodes: [], issues: [{ offset: 0, message: `The text holds ${lines.length} rungs` }], text: trimmed }
  }
  const text = `${lines.length === 1 ? trimmed : lines.join(' ')} ;`
  return { ...parseLadder(text), text }
}

/**
 * Instructions carrying Studio's `?` operand placeholder.
 *
 * Studio writes `?` for an operand the engineer left unconnected, so a rung pasted out of a
 * routine can carry one. Writing `?` into an export hands the engineer a build error, so the
 * draft path refuses it instead.
 *
 * @param nodes - Parsed nodes of one rung.
 * @returns The mnemonics that have a `?` as one of their operands.
 */
export function placeholderOperands(nodes: readonly LadderNode[]): string[] {
  const found: string[] = []
  const walk = (items: readonly LadderNode[]): void => {
    for (const node of items) {
      if (node.kind === 'branch') { for (const path of node.paths) walk(path); continue }
      if (node.operands.some(operand => operand.length === 1 && operand[0]?.text === '?')) found.push(node.name)
    }
  }
  walk(nodes)
  return found
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

/**
 * Render parsed rungs in the text Studio 5000 itself writes when a routine is copied.
 *
 * Studio's ladder clipboard is a flat token stream: the mnemonic, then its operands, space
 * separated, with no parentheses and no rung terminator, and a parallel branch wrapped in
 * `BST` … `NXB` … `BND`. The bracket form this plugin composes (`[path1,path2]`) parses here
 * but is not what a Studio paste expects, so a rung the plugin wrote could not be pasted into
 * a routine — which is exactly what the engineer tried to do and reported as broken.
 *
 * @param source - The rung text the nodes were parsed from; operand tokens are sliced from it.
 * @param nodes - Parsed nodes of one rung.
 * @returns The same rung in Studio's copy format, without its terminator.
 */
export function studioText(source: string, nodes: readonly LadderNode[]): string {
  const operandText = (tokens: readonly LogicToken[]): string => tokens.length === 0
    ? ''
    : source.slice(tokens[0]!.start, tokens[tokens.length - 1]!.end).trim()
  const series = (items: readonly LadderNode[]): string[] => {
    const parts: string[] = []
    for (const node of items) {
      if (node.kind === 'branch') {
        const paths = node.paths.map(path => series(path).join(' ')).filter(path => path !== '')
        if (paths.length === 0) continue
        parts.push(['BST', ...paths.flatMap((path, index) => index === 0 ? [path] : ['NXB', path]), 'BND'].join(' '))
        continue
      }
      const operands = node.operands.map(operandText).filter(text => text !== '')
      parts.push([node.name, ...operands].join(' '))
    }
    return parts
  }
  return series(nodes).join(' ')
}

/**
 * One rung in this plugin's NeutralText, from text written in either format.
 *
 * A rung copied out of Studio carries no parentheses, so it cannot be written straight back
 * into an export: the file must carry NeutralText. This is the emitter that keeps that promise,
 * and it is why a pasted rung can be drafted without the engineer rewriting it first.
 *
 * @param source - The rung text the nodes were parsed from; operand tokens are sliced from it.
 * @param nodes - Parsed nodes of one rung.
 * @returns The rung in NeutralText, with its terminator.
 */
export function neutralText(source: string, nodes: readonly LadderNode[]): string {
  const operandText = (tokens: readonly LogicToken[]): string => tokens.length === 0
    ? ''
    : source.slice(tokens[0]!.start, tokens[tokens.length - 1]!.end).trim()
  const series = (items: readonly LadderNode[]): string => items.map(node => {
    if (node.kind === 'branch') return `[${node.paths.map(path => series(path)).join(',')}]`
    // A zero-operand instruction must keep its parentheses: the series is concatenated with no
    // separator, so a bare name would fuse with the next instruction (`AFIOTE(Run)`), which is
    // neither parseable here nor importable by Studio.
    return node.operands.length === 0 ? `${node.name}()` : `${node.name}(${node.operands.map(operandText).join(',')})`
  }).join('')
  return `${series(nodes)};`
}

/**
 * One rung in Studio's copy format, from text written in either format.
 *
 * @param source - One rung: this plugin's NeutralText, or text already copied out of Studio.
 * @returns The Studio copy form, or undefined when the rung does not parse.
 */
export function studioForm(source: string): string | undefined {
  const parsed = parseRung(source)
  return parsed.issues.length === 0 ? studioText(parsed.text, parsed.nodes) : undefined
}

/** One address token sequence, including indices and its source occurrence. */
export interface AddressOccurrence { readonly text: string; readonly start: number; readonly end: number; readonly line: number; readonly indexTokens: readonly LogicToken[] }

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
