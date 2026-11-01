/**
 * Mnemonic spellings across Logix Designer revisions.
 *
 * Logix Designer 36 aligned a group of ladder mnemonics with IEC 61131-3: `EQU`
 * became `EQ`, `SQR` became `SQRT`, and so on. An export states the revision it
 * was written by (`Controller MajorRev`), so a rung composed into a v36-or-later
 * project can be written in the spelling that project already uses instead of
 * the pre-v36 one.
 *
 * Two rules keep this honest:
 *
 * - **Lookup accepts either spelling at any revision.** A hand-written rung, an
 *   imported Add-On Instruction or a v35 export may carry the legacy name inside
 *   a v36 project, and refusing to resolve it would be wrong.
 * - **The catalog keeps one name per instruction.** That is the name the viewer
 *   labels a block with (`packages/viewer`), so composed text, parsed text and a
 *   rendered block all agree. This table decides only which of the two published
 *   spellings a *composed* rung emits, and what the review reports when one
 *   project mixes them.
 *
 * The table is the published rename set, not a guess: every pair below appears in
 * both spellings across shipped Studio 5000 exports.
 *
 * @module dsh-engineering-l5x/engine/mnemonics
 */

/** One instruction's two published spellings. */
export interface MnemonicPair {
  /** Spelling used before Logix Designer 36. */
  readonly legacy: string
  /** Spelling introduced in Logix Designer 36. */
  readonly modern: string
}

/** The first Logix Designer major revision that publishes the modern spellings. */
export const MNEMONIC_RENAME_MAJOR = 36

/** Every instruction Logix Designer 36 renamed, pre-v36 spelling first. */
export const MNEMONIC_PAIRS: readonly MnemonicPair[] = [
  { legacy: 'ACS', modern: 'ACOS' },
  { legacy: 'ASN', modern: 'ASIN' },
  { legacy: 'ATN', modern: 'ATAN' },
  { legacy: 'EQU', modern: 'EQ' },
  { legacy: 'FRD', modern: 'BCD_TO' },
  { legacy: 'GEQ', modern: 'GE' },
  { legacy: 'GRT', modern: 'GT' },
  { legacy: 'LEQ', modern: 'LE' },
  { legacy: 'LES', modern: 'LT' },
  { legacy: 'LIM', modern: 'LIMIT' },
  { legacy: 'MOV', modern: 'MOVE' },
  { legacy: 'NEQ', modern: 'NE' },
  { legacy: 'SQR', modern: 'SQRT' },
  { legacy: 'TOD', modern: 'TO_BCD' },
  { legacy: 'TRN', modern: 'TRUNC' },
  { legacy: 'XPY', modern: 'EXPT' },
]

const BY_LEGACY: ReadonlyMap<string, MnemonicPair> = new Map(MNEMONIC_PAIRS.map(pair => [pair.legacy, pair]))
const BY_MODERN: ReadonlyMap<string, MnemonicPair> = new Map(MNEMONIC_PAIRS.map(pair => [pair.modern, pair]))

/** An instruction call as it appears in one rung. */
const MNEMONIC_CALL = /(?:^|[^A-Za-z0-9_])([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(/gu

/**
 * True when a major revision publishes the modern spellings.
 *
 * An export that does not state its revision is treated as pre-v36: the modern
 * spellings are the newer claim, and the legacy name is the safe assumption.
 *
 * @param majorRev - `Controller MajorRev`, or the empty string when absent.
 * @returns True when the revision is at or past the rename.
 */
export function usesModernMnemonics(majorRev: string): boolean {
  const parsed = Number.parseInt(majorRev, 10)
  return Number.isFinite(parsed) && parsed >= MNEMONIC_RENAME_MAJOR
}

/**
 * The pair a mnemonic belongs to, in either spelling.
 *
 * @param name - One instruction mnemonic.
 * @returns The pair, or undefined for an instruction that was never renamed.
 */
export function mnemonicPair(name: string): MnemonicPair | undefined {
  const upper = name.toUpperCase()
  return BY_LEGACY.get(upper) ?? BY_MODERN.get(upper)
}

/**
 * The other published spelling of a mnemonic.
 *
 * @param name - One instruction mnemonic.
 * @returns The alternate spelling, or undefined when it has only one.
 */
export function alternateMnemonic(name: string): string | undefined {
  const upper = name.toUpperCase()
  const pair = mnemonicPair(upper)
  if (pair === undefined) return undefined
  return pair.legacy === upper ? pair.modern : pair.legacy
}

/**
 * The spelling a revision publishes.
 *
 * @param name - One instruction mnemonic, in either spelling.
 * @param majorRev - `Controller MajorRev`.
 * @returns The spelling that revision uses; the input, upper-cased, when the
 *   instruction was never renamed.
 */
export function preferredMnemonic(name: string, majorRev: string): string {
  const pair = mnemonicPair(name)
  if (pair === undefined) return name.toUpperCase()
  return usesModernMnemonics(majorRev) ? pair.modern : pair.legacy
}

/** One rung written in the spelling its export's revision no longer prefers. */
export interface MnemonicMismatch {
  /** The spelling the rung uses. */
  readonly used: string
  /** The spelling the export's revision publishes. */
  readonly preferred: string
  /** The export's `MajorRev`, echoed so a report can name it. */
  readonly majorVersion: string
}

/**
 * Report one mnemonic written in the other revision's spelling.
 *
 * @param used - The mnemonic the rung writes.
 * @param majorRev - `Controller MajorRev`.
 * @returns The mismatch, or undefined when the spelling already matches.
 */
export function mnemonicMismatch(used: string, majorRev: string): MnemonicMismatch | undefined {
  const upper = used.toUpperCase()
  const pair = mnemonicPair(upper)
  if (pair === undefined) return undefined
  const preferred = usesModernMnemonics(majorRev) ? pair.modern : pair.legacy
  return preferred === upper ? undefined : { used: upper, preferred, majorVersion: majorRev }
}

/**
 * Every distinct mnemonic in one piece of rung text.
 *
 * @param text - One rung, in neutral text (branches and all).
 * @returns The distinct mnemonics, upper case, in first-seen order.
 */
export function mnemonicsIn(text: string): readonly string[] {
  const names = new Set<string>()
  // A safety-function operand can read "CABLE (ROPE) PULL SWITCH", and a plain scan reported CABLE as
  // an uncatalogued instruction on a production project. Skip each instruction's argument list.
  let at = 0
  while (at < text.length) {
    MNEMONIC_CALL.lastIndex = at
    const match = MNEMONIC_CALL.exec(text)
    if (match === null) break
    const name = match[1]
    if (name !== undefined) names.add(name.toUpperCase())
    const open = (match.index ?? 0) + match[0].length - 1
    let depth = 0
    let close = open + 1
    for (let index = open; index < text.length; index += 1) {
      const character = text.charAt(index)
      if (character === '(') depth += 1
      else if (character === ')') {
        depth -= 1
        if (depth === 0) { close = index + 1; break }
      }
    }
    // Leave the closing parenthesis in place: it is the non-word prefix the pattern needs for the
    // next instruction, as in XIC(A)OTE(B).
    at = close > open ? close - 1 : open + 1
  }
  MNEMONIC_CALL.lastIndex = 0
  return [...names]
}

/**
 * The spelling a rung composed into one project should use.
 *
 * A project reads consistently: if its existing rungs already write `MOVE`, a new
 * rung should say `MOVE` too, whatever revision the controller is. When the export
 * uses neither spelling, the catalog name is emitted, which is what every project
 * that has never used the instruction already got.
 *
 * @param name - The catalog mnemonic.
 * @param used - Every mnemonic the export's ladder routines already write, upper case.
 * @returns The spelling to emit.
 */
export function spellingForProject(name: string, used: ReadonlySet<string>, majorRev = ''): string {
  const pair = MNEMONIC_PAIRS.find(entry => entry.legacy.toUpperCase() === name.toUpperCase() || entry.modern.toUpperCase() === name.toUpperCase())
  if (pair === undefined) return name
  const legacyUsed = used.has(pair.legacy.toUpperCase())
  const modernUsed = used.has(pair.modern.toUpperCase())
  if (legacyUsed && !modernUsed) return pair.legacy
  if (modernUsed && !legacyUsed) return pair.modern
  // The project uses neither spelling, so follow the revision it publishes: a v36+ project has no
  // MOV, EQU or SQR, and a build of a fresh 37 project refused all three.
  const revision = Number.parseInt(majorRev, 10)
  return Number.isFinite(revision) && revision >= 36 ? pair.modern : pair.legacy
}

/**
 * The mismatches one rung carries.
 *
 * @param text - One rung, in neutral text.
 * @param majorRev - `Controller MajorRev`.
 * @returns One entry per distinct mismatched mnemonic, in first-seen order.
 */
export function mnemonicMismatchesIn(text: string, majorRev: string): readonly MnemonicMismatch[] {
  const found = new Map<string, MnemonicMismatch>()
  for (const name of mnemonicsIn(text)) {
    const mismatch = mnemonicMismatch(name, majorRev)
    if (mismatch !== undefined) found.set(mismatch.used, mismatch)
  }
  return [...found.values()]
}
