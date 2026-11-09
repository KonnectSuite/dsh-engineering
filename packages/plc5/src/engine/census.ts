/**
 * The I/O footprint a PLC-5 program actually references.
 *
 * The program's rung text carries every chassis address it touches —
 * `I:104/7`, `O:012/15`, word/group form and, when wired, bit form
 * `I:104/7.3`. Reducing those references to rack/slot cells gives the
 * hardware footprint: which racks the program addresses, which slots it
 * writes, and the highest bit seen per cell.
 *
 * This is a census of the PROGRAM's references, not of the installed cards:
 * the project's I/O configuration covers only the configured chassis, and a
 * block-transfer machine can address far more racks than it configures.
 */

/** One rack/slot cell the program references. */
export interface IoCell {
  readonly type: 'I' | 'O'
  readonly rack: number
  readonly slot: number
  readonly refs: number
  readonly bitRefs: number
  readonly maxBit: number | undefined
}

/** The footprint scan of a set of rung texts. */
export interface IoCensus {
  readonly references: number
  readonly cells: readonly IoCell[]
  readonly racks: readonly number[]
  readonly inputCells: number
  readonly outputCells: number
}

/** The chassis-address pattern: `I:104/7`, `O:012/15`, optional `.3` bit. */
const ADDRESS = /\b([IO]):(\d{1,3})\/(\d{1,2})(?:\.(\d{1,2}))?\b/gu

/**
 * Scan rung texts for chassis references and reduce them to rack/slot cells.
 *
 * @param rungs - the rung texts, each with its program-file name.
 * @returns the reference count, the cells sorted by type/rack/slot, and the rack list.
 */
export function scanIoFootprint(rungs: readonly { readonly file: string; readonly rung: number; readonly text: string }[]): IoCensus {
  const cells = new Map<string, { type: 'I' | 'O'; rack: number; slot: number; refs: number; bitRefs: number; maxBit: number | undefined }>()
  let references = 0
  for (const entry of rungs) {
    for (const match of entry.text.matchAll(ADDRESS)) {
      references += 1
      const type = match[1] === 'O' ? 'O' : 'I'
      const rack = Number(match[2])
      const slot = Number(match[3])
      const bit = match[4] === undefined ? undefined : Number(match[4])
      const key = `${type}:${rack}/${slot}`
      const cell = cells.get(key)
      if (cell === undefined) {
        cells.set(key, { type, rack, slot, refs: 1, bitRefs: bit === undefined ? 0 : 1, maxBit: bit })
        continue
      }
      cell.refs += 1
      if (bit !== undefined) {
        cell.bitRefs += 1
        if (cell.maxBit === undefined || bit > cell.maxBit) cell.maxBit = bit
      }
    }
  }
  const sorted = [...cells.values()].sort((a, b) =>
    a.type === b.type ? (a.rack - b.rack || a.slot - b.slot) : a.type === 'I' ? -1 : 1)
  const racks = [...new Set(sorted.map(cell => cell.rack))].sort((a, b) => a - b)
  return {
    references,
    cells: sorted,
    racks,
    inputCells: sorted.filter(cell => cell.type === 'I').length,
    outputCells: sorted.filter(cell => cell.type === 'O').length,
  }
}

/**
 * Which referenced cells sit inside a configured chassis.
 *
 * @param census - the program's footprint scan.
 * @param chassis - the configured chassis from the I/O configuration.
 * @returns the coverage split: configured racks versus program-only racks.
 */
export function coverageAgainst(
  census: IoCensus,
  chassis: readonly { readonly startingRack: number; readonly endingRack: number }[],
): { readonly configuredRacks: readonly number[]; readonly programOnlyRacks: readonly number[] } {
  const configured = new Set<number>()
  for (const row of chassis) {
    for (let rack = row.startingRack; rack <= row.endingRack; rack++) configured.add(rack)
  }
  return {
    configuredRacks: census.racks.filter(rack => configured.has(rack)),
    programOnlyRacks: census.racks.filter(rack => !configured.has(rack)),
  }
}
