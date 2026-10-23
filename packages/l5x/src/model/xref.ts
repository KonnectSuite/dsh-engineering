/**
 * Cross-reference search — which symbols a project's logic references, and where.
 *
 * The index is built from decoded ladder NeutralText and Structured Text lines,
 * not from the raw XML, so a symbol is reported the way a reader of the logic
 * would write it: `Motor_1.Running` is one symbol and `Motor_1` is also its own
 * entry, because a caller asking "where is Motor_1 used" expects the dotted
 * references too.
 *
 * Instruction mnemonics and language keywords are excluded — `XIC`, `OTE`, `IF`,
 * and `AND` are not tags, and reporting them would bury every real answer. The
 * index is cached per parsed document, so asking one project several questions
 * scans its logic once.
 */

import type { L5xDocument, L5xSymbolReference, L5xSymbolUsage } from './types.ts'
import { splitLines } from './routines.ts'

/** The index of one document: each symbol and the places it appears. */
type XrefIndex = ReadonlyMap<string, readonly L5xSymbolReference[]>

/** Ladder instruction mnemonics, which are operators rather than tags. */
const INSTRUCTION_MNEMONICS = new Set([
  'XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'TON', 'TOF', 'RTO', 'CTU', 'CTD',
  'RES', 'MOV', 'ADD', 'SUB', 'MUL', 'DIV', 'NEG', 'CMP', 'EQU', 'NEQ',
  'GRT', 'GEQ', 'LES', 'LEQ', 'JSR', 'RET', 'SBR', 'AFI', 'NOP', 'MSG',
  'GSV', 'SSV', 'COP', 'FLL', 'CLR', 'BTD', 'SWPB', 'SIZE',
])

/** Structured Text keywords, which are syntax rather than tags. */
const STRUCTURED_TEXT_KEYWORDS = new Set([
  'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF', 'FOR', 'TO', 'DO', 'END_FOR',
  'WHILE', 'END_WHILE', 'REPEAT', 'UNTIL', 'END_REPEAT', 'CASE', 'OF',
  'END_CASE', 'RETURN', 'EXIT', 'NOT', 'AND', 'OR', 'XOR', 'MOD', 'TRUE', 'FALSE',
])

/** Identifiers, including their dotted member paths. */
const IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g

/** Indices already built, keyed by the document they describe. */
const indices = new WeakMap<L5xDocument, XrefIndex>()

/**
 * Search the project's logic for symbols matching a pattern.
 *
 * The pattern is a regular expression, evaluated case-insensitively. A pattern
 * that is not a valid expression is searched for literally instead, so a tag
 * whose name contains regex punctuation still finds its uses.
 *
 * @param document - The parsed project to search.
 * @param pattern - Regular expression, or literal text when it does not compile.
 * @returns One entry per matching symbol, in the order the symbols were first
 * seen, each with every reference to it and an empty result when nothing matched.
 */
export function searchLogic(document: L5xDocument, pattern: string): readonly L5xSymbolUsage[] {
  const matcher = compile(pattern)
  const results: L5xSymbolUsage[] = []
  for (const [symbol, references] of indexOf(document)) {
    if (matcher.test(symbol)) results.push({ symbol, references })
  }
  return results
}

/** Compile the pattern, falling back to a literal search when it is invalid. */
function compile(pattern: string): RegExp {
  try {
    return new RegExp(pattern, 'i')
  } catch {
    return new RegExp(escapeRegExp(pattern), 'i')
  }
}

/** Escape a string so a regular expression matches it literally. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The index for a document, building and caching it on first use. */
function indexOf(document: L5xDocument): XrefIndex {
  const cached = indices.get(document)
  if (cached !== undefined) return cached
  const built = build(document)
  indices.set(document, built)
  return built
}

/** Scan every routine of every program, and each add-on instruction's ladder, for referenced symbols. */
function build(document: L5xDocument): XrefIndex {
  const index = new Map<string, L5xSymbolReference[]>()
  for (const routine of document.routines) {
    if (routine.body.type === 'RLL') {
      for (const rung of routine.body.rungs) {
        if (rung.text === '') continue
        for (const symbol of symbolsOf(rung.text, INSTRUCTION_MNEMONICS)) {
          add(index, symbol, {
            program: routine.program,
            routine: routine.name,
            rung: rung.number,
            context: rung.text,
          })
        }
      }
      continue
    }
    if (routine.body.type !== 'ST') continue
    for (const line of splitLines(routine.body.code)) {
      const text = line.text.trim()
      if (text === '' || text.startsWith('//')) continue
      for (const symbol of symbolsOf(line.text, STRUCTURED_TEXT_KEYWORDS)) {
        add(index, symbol, { program: routine.program, routine: routine.name, line: line.number, context: text })
      }
    }
  }
  // An add-on instruction's ladder is logic a program runs, so its references
  // belong in the same index. Its Structured Text is not indexed, matching the
  // reference engine, which scans only RLL inside an AOI.
  for (const aoi of document.aois) {
    for (const routine of aoi.routines) {
      if (routine.body.type !== 'RLL') continue
      for (const rung of routine.body.rungs) {
        if (rung.text === '') continue
        for (const symbol of symbolsOf(rung.text, INSTRUCTION_MNEMONICS)) {
          add(index, symbol, { aoi: aoi.name, routine: routine.name, rung: rung.number, context: rung.text })
        }
      }
    }
  }
  return index
}

/** Record one reference under its symbol. */
function add(index: Map<string, L5xSymbolReference[]>, symbol: string, reference: L5xSymbolReference): void {
  const references = index.get(symbol)
  if (references === undefined) index.set(symbol, [reference])
  else references.push(reference)
}

/**
 * The symbols one piece of logic references.
 *
 * A dotted reference contributes both the full path and its base tag, so
 * searching either finds the use.
 *
 * @param text - Ladder NeutralText or one Structured Text line.
 * @param excluded - Mnemonics or keywords that are not tags.
 * @returns The symbols, without duplicates.
 */
function symbolsOf(text: string, excluded: ReadonlySet<string>): ReadonlySet<string> {
  const symbols = new Set<string>()
  for (const match of text.matchAll(IDENTIFIER)) {
    const token = match[0]
    const base = token.split('.')[0]
    if (base === undefined || excluded.has(base.toUpperCase())) continue
    symbols.add(token)
    if (token.includes('.')) symbols.add(base)
  }
  return symbols
}
