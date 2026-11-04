/**
 * Sheet-index detection.
 *
 * An index sheet is a layout that carries a `SHEET INDEX` heading and a table of
 * drawing numbers, sheet numbers and titles. The rows are recognised by their
 * columns rather than by reading order: a row is part of the table when one of
 * its cells sits in a column the table's own drawing-number rows established.
 * That is what lets the parser skip the title block on the same sheet, whose
 * cells never line up with the index columns.
 *
 * The table is an index, not a contract: a row without a drawing number is a
 * placeholder the checks must not treat as a missing drawing.
 *
 * @module dsh-engineering-ecad/engine/index-sheet
 */

import type { EcadIndexEntry, EcadIndexSheet, EcadPoint, EcadProfile, EcadSheetModel } from './types.ts'
import { singleLine } from './text.ts'

/** Titles an index sheet is known by. */
const HEADING_PATTERN = /^(?:SHEET\s+INDEX|INDEX\s+(?:OF\s+)?SHEETS?|DRAWING\s+INDEX|SHEET\s+LIST)\b/i

/** A drawing number: a set prefix, a dash, and a sheet number (`21036-051`, `FC1000495-031`). */
const DRAWING_NUMBER_PATTERN = /^[A-Za-z0-9]{2,14}-\d{1,4}$/

/** A bare sheet number from the index column. */
const SHEET_NUMBER_PATTERN = /^\d{1,4}$/

/** Options of {@link detectIndexSheet}. */
export interface DetectIndexSheetOptions {
  /** Cap on parsed rows. Defaults to 500. */
  readonly maxEntries?: number
  /** Override the heading pattern (for a set whose index uses another word). */
  readonly headingPattern?: RegExp
}

/** One text cell of the layout, reduced to what table parsing needs. */
interface Cell {
  readonly id: string
  readonly text: string
  readonly p: EcadPoint
  readonly h: number
  readonly layer: string
}

/** One visual row. */
interface Row {
  readonly y: number
  readonly cells: Cell[]
}

/**
 * Detect the index sheet in a drawing, if it has one.
 *
 * @param model - the sheet model to search (every layout is inspected).
 * @param profile - optional profile; title-block layers are excluded from table cells.
 * @param options - cap and heading pattern overrides.
 * @returns the index sheet, or `undefined` when the model has no index heading.
 */
export function detectIndexSheet(model: EcadSheetModel, profile?: EcadProfile, options: DetectIndexSheetOptions = {}): EcadIndexSheet | undefined {
  const headingPattern = options.headingPattern ?? HEADING_PATTERN
  const maxEntries = Math.max(1, Math.trunc(options.maxEntries ?? 500))
  const titleLayers = new Set((profile?.titleBlockLayers ?? []).map(name => name.toUpperCase()))

  for (const layout of model.layouts) {
    const cells: Cell[] = []
    let heading = ''
    for (const entity of layout.entities) {
      if (entity.k !== 'text' && entity.k !== 'mtext') continue
      if (!entity.p) continue
      const text = singleLine(entity.t ?? '')
      if (text.length === 0) continue
      if (heading.length === 0 && headingPattern.test(text)) {
        heading = text
      }
      if (titleLayers.has(entity.layer.toUpperCase())) continue
      cells.push({ id: entity.id, text, p: entity.p, h: Math.max(entity.h ?? 0, 1e-9), layer: entity.layer })
    }
    if (heading.length === 0) continue
    const entries = parseIndexRows(cells, maxEntries)
    return { layout: layout.id, heading, entries }
  }
  return undefined
}

/**
 * Parse the table rows of an index layout.
 *
 * @param cells - text cells of the layout, already free of title-block text.
 * @param maxEntries - row cap.
 */
function parseIndexRows(cells: readonly Cell[], maxEntries: number): EcadIndexEntry[] {
  if (cells.length === 0) return []
  const rows = groupRows(cells)
  if (rows.length === 0) return []

  // Anchor rows carry a drawing number. The largest cluster sharing one column
  // is the table; a lone dash-number elsewhere (a title-block file name, say)
  // never forms a cluster.
  const anchorRows: Array<{ row: Row; drawingCell: Cell }> = []
  for (const row of rows) {
    const drawingCell = row.cells.find(cell => DRAWING_NUMBER_PATTERN.test(cell.text))
    if (drawingCell) anchorRows.push({ row, drawingCell })
  }
  if (anchorRows.length < 2) return []

  const clusters = new Map<number, Array<{ row: Row; drawingCell: Cell }>>()
  for (const anchor of anchorRows) {
    const key = columnKey(anchor.drawingCell.p[0])
    const cluster = clusters.get(key) ?? []
    cluster.push(anchor)
    clusters.set(key, cluster)
  }
  let table = [...clusters.values()].sort((a, b) => b.length - a.length)[0] ?? []
  if (table.length < 2) return []
  table = table.sort((a, b) => a.row.y - b.row.y)

  // Columns: the drawing number, a numeric sheet index, and the title. The
  // index may sit left or right of the drawing number, so the cells are
  // classified by content, not by order.
  const drawingX = median(table.map(anchor => anchor.drawingCell.p[0]))
  let indexX: number | undefined
  let titleX: number | undefined
  for (const anchor of table) {
    const others = anchor.row.cells.filter(cell => cell !== anchor.drawingCell)
    if (indexX === undefined) {
      const numeric = others.find(cell => SHEET_NUMBER_PATTERN.test(cell.text))
      if (numeric) indexX = numeric.p[0]
    }
    if (titleX === undefined) {
      const titleCell = others.find(cell => /[A-Za-z]{2,}/.test(cell.text) && !DRAWING_NUMBER_PATTERN.test(cell.text))
      if (titleCell) titleX = titleCell.p[0]
    }
  }
  const columnXs = [drawingX, indexX, titleX].filter((value): value is number => typeof value === 'number')
  const columnTolerance = Math.max(0.12, 2.2 * median(cells.map(cell => cell.h)))

  // Expand the table's vertical span while neighbouring rows still align to a
  // column, so the placeholder rows above the first drawing join the table and
  // the title block below it does not.
  const sorted = [...rows].sort((a, b) => a.y - b.y)
  const rowTolerance = Math.max(0.05, 1.2 * median(cells.map(cell => cell.h)))
  const aligned = (row: Row): boolean => row.cells.some(cell => columnXs.some(columnX => Math.abs(cell.p[0] - columnX) <= columnTolerance))
  let lowIndex = sorted.indexOf(table[0]!.row)
  let highIndex = sorted.indexOf(table[table.length - 1]!.row)
  let growLow = true
  let growHigh = true
  while (growLow || growHigh) {
    growLow = false
    growHigh = false
    if (lowIndex > 0) {
      const candidate = sorted[lowIndex - 1]!
      if (aligned(candidate) && sorted[lowIndex]!.y - candidate.y <= rowTolerance * 6) {
        lowIndex -= 1
        growLow = true
      }
    }
    if (highIndex < sorted.length - 1) {
      const candidate = sorted[highIndex + 1]!
      if (aligned(candidate) && candidate.y - sorted[highIndex]!.y <= rowTolerance * 6) {
        highIndex += 1
        growHigh = true
      }
    }
  }
  const tableRows = sorted.slice(lowIndex, highIndex + 1)

  const entries: EcadIndexEntry[] = []
  for (const row of tableRows) {
    if (entries.length >= maxEntries) break
    const cellsInRow = [...row.cells].sort((a, b) => a.p[0] - b.p[0])
    if (cellsInRow.length === 0) continue
    const drawingCell = cellsInRow.find(cell => DRAWING_NUMBER_PATTERN.test(cell.text))
    const indexCell = cellsInRow.find(cell => cell !== drawingCell && SHEET_NUMBER_PATTERN.test(cell.text))
    // A row with no numeric cell is a column header or footer ("FILENAME SHT
    // DESCRIPTION"), not a sheet entry.
    if (!drawingCell && !indexCell) continue
    const titleCell = cellsInRow.find(cell => cell !== drawingCell && cell !== indexCell && /[A-Za-z]{2,}/.test(cell.text))
    const sheetNumber = drawingCell?.text ?? indexCell?.text
    const title = titleCell?.text
    const raw = cellsInRow.map(cell => cell.text).join(' ')
    entries.push(sheetNumber !== undefined ? { raw, sheetNumber, title } : title !== undefined ? { raw, title } : { raw })
  }
  // Rows are printed top-down from the highest sheet number; a sheet list reads
  // in ascending order, so sort by the numeric sheet number where one exists.
  entries.sort((a, b) => sortNumberOf(a) - sortNumberOf(b))
  return entries
}

/**
 * Numeric sheet number of one entry, for ordering.
 *
 * @param entry - index entry.
 */
function sortNumberOf(entry: EcadIndexEntry): number {
  const value = entry.sheetNumber ?? entry.raw
  const match = /(\d{1,4})\s*$/.exec(value)
  if (!match) return Number.MAX_SAFE_INTEGER
  return Number(match[1])
}

/**
 * Bucket cells into visual rows by their y position.
 *
 * @param cells - text cells.
 */
function groupRows(cells: readonly Cell[]): Row[] {
  const sorted = [...cells].sort((a, b) => b.p[1] - a.p[1] || a.p[0] - b.p[0])
  const tolerance = Math.max(0.03, 0.6 * median(sorted.map(cell => cell.h)))
  const rows: Row[] = []
  for (const cell of sorted) {
    const last = rows[rows.length - 1]
    if (last && Math.abs(last.y - cell.p[1]) <= tolerance) {
      ;(last.cells as Cell[]).push(cell)
      continue
    }
    rows.push({ y: cell.p[1], cells: [cell] })
  }
  return rows
}

/**
 * Stable bucket key for a column position.
 *
 * @param x - column x.
 */
function columnKey(x: number): number {
  return Math.round(x * 10)
}

/**
 * Median of a numeric list, `0` for an empty list.
 *
 * @param values - numbers.
 */
function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? ((sorted[middle - 1]! + sorted[middle]!) / 2) : sorted[middle]!
}
