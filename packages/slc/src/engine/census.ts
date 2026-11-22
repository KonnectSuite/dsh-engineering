/**
 * I/O address census over the neutral-text ladder.
 *
 * The SLC 500 addresses I/O by slot: `I:1/0` is bit 0 of the input word in
 * slot 1, `O:0/5` bit 5 of the output word in slot 0. MicroLogix can carry a
 * second word width (`I:1.0/3`); the census keeps the word qualifier distinct
 * from the bit so both forms are counted from the same rungs. No module type is
 * inferred from an address: a slot is reported as referenced, nothing more.
 *
 * @module dsh-engineering-slc/engine/census
 */

import type { SlcProject, SlcRung } from './slc-text.ts'

/** One reference to an I/O address found in rung text. */
export interface IoReference {
  address: string
  kind: 'I' | 'O'
  slot: number
  word: number | undefined
  bit: number | undefined
  file: string
  rung: number
}

/** References grouped by slot and kind. */
export interface IoCell {
  kind: 'I' | 'O'
  slot: number
  words: number[]
  bits: number[]
  references: number
  highestBit: number | undefined
  firstReference: { file: string; rung: number } | undefined
}

/** The census result. */
export interface IoCensus {
  cells: IoCell[]
  references: IoReference[]
  /** Text that looked like an I/O address but did not parse; reported, not guessed. */
  unparsed: string[]
}

/** A bit form: `I:1/0`, `I:1.0/3`, `O:0/17`. */
const BIT_FORM = /\b([IO]):(\d+)(?:\.(\d+))?\/(\d+)\b/giu

/** A word form without a bit: `I:1`, `I:1.0`, `O:0`. */
const WORD_FORM = /\b([IO]):(\d+)(?:\.(\d+))?\b(?!\s*\/)/giu

/** Census the I/O references of one project's ladder. */
export function censusIo(project: SlcProject): IoCensus {
  const references: IoReference[] = []
  const unparsed = new Set<string>()

  const visit = (file: string, rung: SlcRung): void => {
    const text = rung.text
    const bitSpans: Array<{ start: number; end: number }> = []
    for (const match of text.matchAll(BIT_FORM)) {
      const kind = match[1]?.toUpperCase() === 'O' ? 'O' : 'I'
      const slot = Number(match[2])
      const word = match[3] === undefined ? undefined : Number(match[3])
      const bit = match[4] === undefined ? undefined : Number(match[4])
      if (!Number.isFinite(slot) || !Number.isFinite(bit)) {
        unparsed.add(match[0])
        continue
      }
      const start = match.index ?? 0
      bitSpans.push({ start, end: start + match[0].length })
      references.push({ address: match[0], kind, slot, word, bit, file, rung: rung.rung })
    }
    for (const match of text.matchAll(WORD_FORM)) {
      const start = match.index ?? 0
      const end = start + match[0].length
      if (bitSpans.some(span => start >= span.start && end <= span.end)) continue
      const kind = match[1]?.toUpperCase() === 'O' ? 'O' : 'I'
      const slot = Number(match[2])
      const word = match[3] === undefined ? undefined : Number(match[3])
      if (!Number.isFinite(slot)) {
        unparsed.add(match[0])
        continue
      }
      references.push({ address: match[0], kind, slot, word, bit: undefined, file, rung: rung.rung })
    }
  }

  for (const file of project.files) {
    for (const rung of file.rungs) visit(file.name, rung)
  }

  const byCell = new Map<string, IoCell>()
  for (const reference of references) {
    const key = `${reference.kind}:${reference.slot}`
    let cell = byCell.get(key)
    if (cell === undefined) {
      cell = { kind: reference.kind, slot: reference.slot, words: [], bits: [], references: 0, highestBit: undefined, firstReference: undefined }
      byCell.set(key, cell)
    }
    cell.references += 1
    if (cell.firstReference === undefined) cell.firstReference = { file: reference.file, rung: reference.rung }
    if (reference.word !== undefined && !cell.words.includes(reference.word)) cell.words.push(reference.word)
    if (reference.bit !== undefined) {
      if (!cell.bits.includes(reference.bit)) cell.bits.push(reference.bit)
      cell.highestBit = cell.highestBit === undefined ? reference.bit : Math.max(cell.highestBit, reference.bit)
    }
  }

  const cells = [...byCell.values()]
  for (const cell of cells) {
    cell.words.sort((left, right) => left - right)
    cell.bits.sort((left, right) => left - right)
  }
  cells.sort((left, right) => left.kind.localeCompare(right.kind, 'en') || left.slot - right.slot)
  return { cells, references, unparsed: [...unparsed] }
}

/** One line per referenced slot, in slot order, for the console answer. */
export function censusLines(census: IoCensus): string[] {
  return census.cells.map(cell => {
    const wordText = cell.words.length > 0 ? `word ${cell.words.join(',')}` : 'word not named'
    const bitText = cell.highestBit === undefined ? 'no bit references' : `${cell.bits.length} bits, highest ${cell.highestBit}`
    return `${cell.kind}:${cell.slot} — ${wordText}; ${bitText}; ${cell.references} references`
  })
}
