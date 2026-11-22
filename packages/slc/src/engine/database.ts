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
const ADDRESS_LIKE = /^(?:[A-Za-z]{1,2}\d+(?:[:.]\d+)?(?:[/.]\d+)?|[IO]:\d+(?:\.\d+)?\/\d+)$/u

function splitLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') return line.split('\t').map(cell => cell.trim())
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? ''
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"'
        index += 1
      } else {
        quoted = !quoted
      }
      continue
    }
    if (character === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  cells.push(current.trim())
  return cells
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

/** Parse one documentation export; an unrecognised format is a typed failure. */
export function parseDatabaseExport(text: string, path: string): DatabaseExport {
  const cleaned = text.replace(/^\uFEFF/u, '')
  if (cleaned.includes('\u0000')) {
    throw new SlcDatabaseError('DATABASE_FORMAT_UNSUPPORTED', `${path} carries NUL bytes, so it is a binary container, not a documentation export.`, 'Export the documentation from RSLogix 500 (File > Export > Documentation) as .EAS/.ERP/.EIC/.ESG or a comma-separated file, then pass that file.')
  }
  const format = detectFormat(cleaned)
  const delimiter = format === 'tab' ? '\t' : format === 'pipe' ? '|' : ','
  const lines = cleaned.split(/\r?\n/u).filter(line => line.trim() !== '')
  if (lines.length === 0) {
    throw new SlcDatabaseError('DATABASE_FORMAT_UNSUPPORTED', `${path} is empty.`, 'Export the documentation from RSLogix 500 and pass the exported file.')
  }
  const header = splitLine(lines[0] ?? '', delimiter)
  let addressAt = indexOfAlias(header, ADDRESS_ALIASES)
  const symbolAt = indexOfAlias(header, SYMBOL_ALIASES)
  const descriptionAt = indexOfAlias(header, DESCRIPTION_ALIASES)
  const scopeAt = indexOfAlias(header, SCOPE_ALIASES)
  let start = 1
  if (addressAt < 0) {
    // No addressed header: accept a headerless export only when the first data
    // row already starts with something address-like.
    const firstRow = splitLine(lines[0] ?? '', delimiter)
    if (firstRow.length >= 2 && ADDRESS_LIKE.test(firstRow[0] ?? '')) {
      addressAt = 0
      start = 0
    } else {
      throw new SlcDatabaseError(
        'DATABASE_FORMAT_UNSUPPORTED',
        `${path} has no address column (header: ${header.join(' | ')}).`,
        'Pass an RSLogix 500 documentation export (.EAS/.ERP/.EIC/.ESG/.CSV) whose header names the address column, or a headerless export whose first column is an address such as N7:0 or I:1/0.',
      )
    }
  }
  const warnings: string[] = []
  const rows: DatabaseRow[] = []
  for (let index = start; index < lines.length; index += 1) {
    const raw = splitLine(lines[index] ?? '', delimiter)
    const address = (raw[addressAt] ?? '').trim()
    if (address === '') {
      if (warnings.length < 20) warnings.push(`row ${index + 1} has no address and was skipped.`)
      continue
    }
    if (!ADDRESS_LIKE.test(address) && warnings.length < 20) {
      warnings.push(`row ${index + 1} address "${address}" is not a documented SLC address; kept as written.`)
    }
    rows.push({
      address,
      symbol: (raw[symbolAt] ?? '').trim(),
      description: (raw[descriptionAt] ?? '').trim(),
      scope: (raw[scopeAt] ?? '').trim(),
      raw,
    })
  }
  return { path, format, header, rows, warnings }
}

/** The format name the answer reports. */
export function databaseFormatName(format: DatabaseExport['format']): string {
  if (format === 'tab') return 'tab-separated documentation export'
  if (format === 'pipe') return 'pipe-separated documentation export'
  return 'comma-separated documentation export'
}
