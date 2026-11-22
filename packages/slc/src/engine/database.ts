/**
 * Reader for the RSLogix 500 documentation exports (`.EAS`, `.ERP`, `.EIC`,
 * `.ESG`, `.CSV`).
 *
 * The documentation export is the highest-fidelity offline path we have: it is
 * machine-readable, it survives without an installed RSLogix 500, and it is not
 * the `.SLC` project text (which truncates symbols to 15 characters). The field
 * order is documented in the authored corpus, so a header row is accepted when
 * it names the address; a headerless export is accepted only when the first
 * cell of the first row already looks like an address.
 *
 * @module dsh-engineering-slc/engine/database
 */

/** One documentation row. */
export interface DatabaseRow {
  address: string
  symbol: string
  description: string
  scope: string
  raw: string[]
}

/** The parsed documentation export. */
export interface DatabaseExport {
  path: string
  format: 'csv' | 'tab' | 'pipe'
  /** How the columns were recognised: a header row or one of the vendor layouts. */
  layout: 'header' | 'eas' | 'erp' | 'headerless'
  header: string[]
  rows: DatabaseRow[]
  warnings: string[]
}

/** The failure a documentation export reports. */
export class SlcDatabaseError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'SlcDatabaseError'
    this.code = code
    this.fix = fix
  }
}

/** Aliases that name the address column. */
const ADDRESS_ALIASES = ['address', 'addr', 'tag', 'tag_name', 'tagname', 'operand']
/** Aliases that name the symbol column. */
const SYMBOL_ALIASES = ['symbol', 'name', 'sym', 'symbol_name']
/** Aliases that name the description column. */
const DESCRIPTION_ALIASES = ['description', 'comment', 'desc', 'note', 'notes']
/** Aliases that name the scope/file column. */
const SCOPE_ALIASES = ['scope', 'file', 'program', 'program_file', 'routine']

/** An SLC address in the forms the documentation exports use. */
const ADDRESS_LIKE = /^(?:[A-Za-z]{1,2}\d+(?:[:.]\d+)?(?:[/.][\dA-Za-z]+)?|[A-Za-z]{1,2}:\d+(?:\.\d+)?(?:\/[\dA-Za-z]+)?)$/u

/**
 * Split the export into records. The vendor writes quoted fields that may hold
 * a comma or a newline (the `.ERP` description does), so a line-by-line split
 * would cut a row in half; the quote state is tracked across newlines.
 */
function splitRecords(text: string, delimiter: string): string[][] {
  if (delimiter === '\t') {
    return text
      .split(/\r?\n/u)
      .map(line => line.split('\t').map(cell => cell.trim()))
      .filter(cells => cells.some(cell => cell !== ''))
  }
  const records: string[][] = []
  let cells: string[] = []
  let current = ''
  let quoted = false
  const endCell = () => {
    cells.push(current.trim())
    current = ''
  }
  const endRecord = () => {
    if (cells.some(cell => cell !== '')) records.push(cells)
    cells = []
  }
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? ''
    if (character === '"') {
      if (quoted && text[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (character === delimiter && !quoted) {
      endCell()
      continue
    }
    if (!quoted && (character === '\n' || character === '\r')) {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      endCell()
      endRecord()
      continue
    }
    current += character
  }
  endCell()
  endRecord()
  return records
}

function detectFormat(text: string): 'csv' | 'tab' | 'pipe' {
  const firstLine = text.split(/\r?\n/u).find(line => line.trim() !== '') ?? ''
  const counts = {
    tab: (firstLine.match(/\t/gu) ?? []).length,
    pipe: (firstLine.match(/\|/gu) ?? []).length,
    csv: (firstLine.match(/,/gu) ?? []).length,
  }
  if (counts.tab > counts.pipe && counts.tab > 0) return 'tab'
  if (counts.pipe > counts.csv && counts.pipe > 0) return 'pipe'
  return 'csv'
}

function indexOfAlias(header: readonly string[], aliases: readonly string[]): number {
  const lowered = header.map(cell => cell.toLowerCase().replaceAll(/[\s_-]+/gu, '_'))
  for (const alias of aliases) {
    const at = lowered.indexOf(alias)
    if (at >= 0) return at
  }
  return -1
}

/** Join the non-empty cells between two indexes, preserving their order. */
function joinCells(raw: readonly string[], from: number, to: number): string {
  const cells: string[] = []
  for (let index = Math.max(0, from); index <= Math.min(to, raw.length - 1); index += 1) {
    const cell = (raw[index] ?? '').trim()
    if (cell !== '') cells.push(cell)
  }
  return cells.join(' ')
}

/** True when the address cell is an SLC operand or a .ERP rung reference. */
function addressOrRung(cell: string): boolean {
  return ADDRESS_LIKE.test(cell) || /^RUNG\d+(?:-\d+)?$/iu.test(cell)
}

/** Parse one documentation export; an unrecognised format is a typed failure. */
export function parseDatabaseExport(text: string, path: string): DatabaseExport {
  const cleaned = text.replace(/^\uFEFF/u, '')
  if (cleaned.includes('\u0000')) {
    throw new SlcDatabaseError('DATABASE_FORMAT_UNSUPPORTED', `${path} carries NUL bytes, so it is a binary container, not a documentation export.`, 'Save the program with Save As… and check Export database (or export the documentation from RSLogix 500) as .EAS/.ERP/.EIC/.ESG or a comma-separated file, then pass that file.')
  }
  const format = detectFormat(cleaned)
  const delimiter = format === 'tab' ? '\t' : format === 'pipe' ? '|' : ','
  const records = splitRecords(cleaned, delimiter)
  if (records.length === 0) {
    throw new SlcDatabaseError('DATABASE_FORMAT_UNSUPPORTED', `${path} is empty.`, 'RSLogix 500 writes an empty documentation export when that documentation kind is not recorded; save the program with Save As… and check Export database, then pass the export that carries rows.')
  }
  const extension = path.toLowerCase().match(/\.([a-z0-9]+)$/u)?.[1] ?? ''
  let header = records[0] ?? []
  let addressAt = indexOfAlias(header, ADDRESS_ALIASES)
  let symbolAt = indexOfAlias(header, SYMBOL_ALIASES)
  let descriptionAt = indexOfAlias(header, DESCRIPTION_ALIASES)
  let scopeAt = indexOfAlias(header, SCOPE_ALIASES)
  let layout: DatabaseExport['layout'] = 'header'
  let start = 1
  let descriptionFrom = -1
  let descriptionTo = -1
  if (addressAt < 0) {
    // The vendor .EAS and .ERP exports carry no header: find the first row of
    // the data block, then map the vendor layout by extension and width.
    let firstData = -1
    for (let index = 0; index < Math.min(records.length, 8); index += 1) {
      const cells = records[index] ?? []
      if (addressOrRung((cells[0] ?? '').trim()) && cells.length >= 2) {
        firstData = index
        break
      }
    }
    if (firstData < 0) {
      throw new SlcDatabaseError(
        'DATABASE_FORMAT_UNSUPPORTED',
        `${path} has no address column (first row: ${header.join(' | ')}).`,
        'Pass an RSLogix 500 documentation export (.EAS/.ERP/.EIC/.ESG/.CSV) whose header names the address column, or a headerless vendor export whose first column is an address such as N7:0 or I:1/0.',
      )
    }
    addressAt = 0
    start = firstData
    header = []
    if (extension === 'eas' || (records[firstData] ?? []).length >= 10) {
      // .EAS: address, reserved, symbol, then the description split over up to
      // four cells, then flags. Keep the symbol and join the description cells.
      layout = 'eas'
      symbolAt = 2
      descriptionAt = -1
      descriptionFrom = 3
      descriptionTo = Math.min(6, (records[firstData] ?? []).length - 1)
    } else if (extension === 'erp') {
      // .ERP: address (or RUNG reference), title, then the description text.
      layout = 'erp'
      symbolAt = -1
      descriptionAt = -1
      descriptionFrom = 1
      descriptionTo = 2
    } else {
      layout = 'headerless'
      symbolAt = -1
      descriptionAt = -1
      descriptionFrom = 1
      descriptionTo = Math.min(3, (records[firstData] ?? []).length - 1)
    }
  }
  const warnings: string[] = []
  const rows: DatabaseRow[] = []
  let skippedRungs = 0
  for (let index = start; index < records.length; index += 1) {
    const raw = records[index] ?? []
    const address = (raw[addressAt] ?? '').trim()
    if (address === '') {
      if (warnings.length < 20) warnings.push(`row ${index + 1} has no address and was skipped.`)
      continue
    }
    if (layout === 'erp' && /^RUNG/iu.test(address)) {
      skippedRungs += 1
      continue
    }
    if (!ADDRESS_LIKE.test(address) && warnings.length < 20) {
      warnings.push(`row ${index + 1} address "${address}" is not a documented SLC address; kept as written.`)
    }
    rows.push({
      address,
      symbol: symbolAt < 0 ? '' : (raw[symbolAt] ?? '').trim(),
      description: descriptionFrom < 0 ? (raw[descriptionAt] ?? '').trim() : joinCells(raw, descriptionFrom, descriptionTo),
      scope: scopeAt < 0 ? '' : (raw[scopeAt] ?? '').trim(),
      raw,
    })
  }
  if (skippedRungs > 0) {
    warnings.push(`${skippedRungs} rung-description row(s) in the report are not SLC addresses and were not listed.`)
  }
  return { path, format, layout, header, rows, warnings }
}

/** The format name the answer reports. */
export function databaseFormatName(format: DatabaseExport['format']): string {
  if (format === 'tab') return 'tab-separated documentation export'
  if (format === 'pipe') return 'pipe-separated documentation export'
  return 'comma-separated documentation export'
}
