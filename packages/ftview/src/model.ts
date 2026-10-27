/**
 * FactoryTalk View ME export scanning and parsing.
 *
 * Only documented text exports are read: display XML and the semicolon-separated
 * HMI tag CSV. Native MER/MED databases are not decoded or rewritten. A display
 * contributes its root identity and its named objects; the tag CSV contributes
 * typed rows, and its structural problems are reported rather than hidden.
 *
 * @module dsh-engineering-ftview/model
 */

import { createHash } from 'node:crypto'
import { readdir } from 'node:fs/promises'
import { XMLParser } from 'fast-xml-parser'
import { EngineeringError, type DirEntry, type FsService, type FsTarget } from './core.ts'

/** One row of the HMI tag CSV, keyed by its canonical columns. */
export interface TagRow {
  readonly name: string
  readonly description: string
  readonly type: string
  readonly raw: Readonly<Record<string, string>>
}

/** One named object inside a display. */
export interface DisplayObject {
  readonly type: string
  readonly name?: string
  readonly attributes: Readonly<Record<string, string>>
}

/** One parsed display file. */
export interface DisplayFile {
  readonly file: string
  readonly name: string
  readonly objects: readonly DisplayObject[]
  readonly parseError?: string
}

/** One file the scan read, with its content hash. */
export interface ScannedFile {
  readonly file: string
  readonly bytes: number
  readonly sha256: string
}

/** One export folder, scanned once and read by every later call. */
export interface Application {
  readonly root: string
  readonly name: string
  readonly displays: readonly DisplayFile[]
  readonly tags: readonly TagRow[]
  readonly tagFiles: readonly string[]
  readonly tagErrors: readonly string[]
  readonly diagnostics: readonly string[]
  readonly files: readonly ScannedFile[]
}

/** Parsed tag CSV: rows plus the structural errors found while reading it. */
export interface TagCsv {
  readonly rows: readonly TagRow[]
  readonly errors: readonly string[]
}

/** Attribute prefix the XML parser uses. */
const ATTRIBUTE = '@_'

/**
 * Pick the field separator of one line.
 *
 * A Studio ME tag export is comma-separated and uses a leading `;` as a comment
 * prefix; older/semicolon exports exist too. Splitting on a fixed `;` turned every
 * real row into one cell, so a genuine export parsed as zero tags.
 */
function delimiterOf(line: string): ',' | ';' {
  let commas = 0
  let semicolons = 0
  let quoted = false
  for (const character of line) {
    if (character === '"') quoted = !quoted
    else if (!quoted && character === ',') commas += 1
    else if (!quoted && character === ';') semicolons += 1
  }
  return commas >= semicolons ? ',' : ';'
}

/** Split one CSV line, honouring double quotes and the line's own separator. */
export function splitCsv(line: string): string[] {
  const delimiter = delimiterOf(line)
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] as string
    if (quoted) {
      if (character === '"') {
        if (line[index + 1] === '"') {
          current += '"'
          index += 1
        } else {
          quoted = false
        }
      } else {
        current += character
      }
    } else if (character === '"') {
      quoted = true
    } else if (character === delimiter) {
      cells.push(current)
      current = ''
    } else {
      current += character
    }
  }
  cells.push(current)
  return cells
}

/** Decode bytes as UTF-8 or UTF-16, dropping a byte-order mark. */
function decode(bytes: Uint8Array): string {
  // Studio writes most exports as UTF-8, but some generated files (BatchImport) are
  // UTF-16LE. Decoding those as UTF-8 produced a root element of "\0g\0f\0x".
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2))
  const text = new TextDecoder('utf-8').decode(bytes)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * Parse the HMI tag CSV.
 *
 * The ME export writes an optional header first, then a `###002` version line, then
 * `;` comment/section lines and the data rows. Earlier builds assumed the header
 * followed the version line and treated `;Folders Section` as the header, so a real
 * export parsed as zero tags.
 *
 * @param text - Whole CSV file.
 * @returns Rows plus structural errors; a file with no `###002` marker yields no rows.
 */
export function parseTagCsv(text: string): TagCsv {
  const lines = text.split(/\r?\n/)
  const isComment = (line: string): boolean => line.trimStart().startsWith(';')
  const versionLine = lines.findIndex(line => line.includes('###002'))
  if (versionLine < 0) {
    return { rows: [], errors: ['Unsupported tag CSV: the `###002` version line is missing.'] }
  }
  const headerCells = (line: string): string[] => splitCsv(line).map((cell, index) => {
    const trimmed = cell.trim()
    return index === 0 ? trimmed.replace(/^;/u, '').trim() : trimmed
  })
  // Prefer a real header before the version line; fall back to the first non-comment
  // line after it for files that put the header last.
  const before = lines.slice(0, versionLine).findIndex(line => headerCells(line).includes('Tag Name'))
  const after = lines.findIndex((line, index) => index > versionLine && line.trim() !== '' && !isComment(line) && headerCells(line).includes('Tag Name'))
  const headerIndex = before >= 0 ? before : after
  if (headerIndex < 0) {
    return { rows: [], errors: ['Unsupported tag CSV: no header row with a `Tag Name` column was found.'] }
  }
  const header = headerCells(lines[headerIndex] as string)
  const nameIndex = header.indexOf('Tag Name')
  const descriptionIndex = header.indexOf('Tag Description')
  const typeIndex = header.indexOf('Tag Type')
  const rows: TagRow[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index] as string
    if (line.trim() === '' || isComment(line)) continue
    if (index < versionLine) continue
    const cells = splitCsv(line)
    // Studio omits trailing empty columns, so a data row is legitimately shorter
    // than the header; only a longer row is malformed.
    if (cells.length > header.length) {
      errors.push(`Row ${index + 1}: expected at most ${header.length} columns, found ${cells.length}.`)
      continue
    }
    const raw: Record<string, string> = {}
    header.forEach((column, columnIndex) => {
      if (column !== '') raw[column] = (cells[columnIndex] ?? '').trim()
    })
    const name = (cells[nameIndex] ?? '').trim()
    if (name === '') {
      errors.push(`Row ${index + 1}: empty Tag Name.`)
      continue
    }
    if (seen.has(name)) errors.push(`Row ${index + 1}: duplicate tag name ${JSON.stringify(name)}.`)
    seen.add(name)
    rows.push({
      name,
      description: descriptionIndex >= 0 ? (cells[descriptionIndex] ?? '').trim() : '',
      type: typeIndex >= 0 ? (cells[typeIndex] ?? '').trim() : '',
      raw,
    })
  }
  return { rows, errors }
}

/** The parser used for display XML, preserving attributes and order-independent names. */
const PARSER = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: ATTRIBUTE,
  trimValues: true,
  parseTagValue: false,
  isArray: () => false,
})

/** Strip the attribute prefix from one attribute bag. */
function attributesOf(node: Readonly<Record<string, unknown>>): Record<string, string> {
  const attributes: Record<string, string> = {}
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith(ATTRIBUTE) && typeof value === 'string') attributes[key.slice(ATTRIBUTE.length)] = value
    if (key.startsWith(ATTRIBUTE) && typeof value === 'number') attributes[key.slice(ATTRIBUTE.length)] = String(value)
  }
  return attributes
}

/** Collect one element and its descendants as display objects. */
function collectObjects(node: unknown, type: string, out: DisplayObject[], depth: number): void {
  if (depth > 8 || node === null || typeof node !== 'object' || Array.isArray(node)) return
  const record = node as Record<string, unknown>
  const attributes = attributesOf(record)
  const named = attributes.name ?? attributes.Name
  out.push({ type, ...(named === undefined ? {} : { name: named }), attributes })
  for (const [key, value] of Object.entries(record)) {
    if (key.startsWith(ATTRIBUTE) || key === '#text') continue
    if (Array.isArray(value)) {
      for (const item of value) collectObjects(item, key, out, depth + 1)
    } else {
      collectObjects(value, key, out, depth + 1)
    }
  }
}

/**
 * Parse one display XML file.
 *
 * @param file - Relative path inside the export folder.
 * @param text - Whole XML file.
 * @returns The display, or the parse error with a synthetic entry.
 */
export function parseDisplay(file: string, text: string): DisplayFile {
  const fallbackName = file.replace(/\\/gu, '/').split('/').pop()?.replace(/\.xml$/iu, '') ?? file
  try {
    const parsed = PARSER.parse(text) as Record<string, unknown>
    const rootKey = Object.keys(parsed).find(key => !key.startsWith('?'))
    if (rootKey === undefined) return { file, name: fallbackName, objects: [], parseError: 'The file has no root element.' }
    const rootNode = parsed[rootKey]
    // ME display files use <gfx> (Gfx-ME17.xsd) in a Studio export; some hand-made
    // or older files use a <display> root. Both are display files.
    if (!/display/iu.test(rootKey) && !/^gfx$/iu.test(rootKey)) {
      return { file, name: fallbackName, objects: [], parseError: `Root element ${rootKey} is not an ME display.` }
    }
    const root = (rootNode ?? {}) as Record<string, unknown>
    const attributes = attributesOf(root)
    const objects: DisplayObject[] = []
    for (const [key, value] of Object.entries(root)) {
      if (key.startsWith(ATTRIBUTE) || key === '#text') continue
      if (Array.isArray(value)) {
        for (const item of value) collectObjects(item, key, objects, 1)
      } else {
        collectObjects(value, key, objects, 1)
      }
    }
    const name = attributes.name ?? attributes.Name ?? fallbackName
    return { file, name, objects }
  } catch (error) {
    return { file, name: fallbackName, objects: [], parseError: error instanceof Error ? error.message : String(error) }
  }
}

/** List one directory through the provider, or Node when the provider cannot list. */
async function listDirectory(fs: FsService, path: string, signal: AbortSignal | undefined): Promise<readonly DirEntry[]> {
  if (fs.listDir !== undefined) return await fs.listDir(path, signal)
  const entries = await readdir(path, { withFileTypes: true })
  return entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
}

/** Walk the export folder, calling `visit` for every regular file. */
async function walk(
  fs: FsService,
  root: string,
  relative: string,
  signal: AbortSignal | undefined,
  visit: (file: string, absolute: string) => Promise<void>,
  budget: { count: number; max: number },
): Promise<void> {
  signal?.throwIfAborted()
  const path = relative === '' ? root : `${root.replace(/[\\/]$/u, '')}/${relative}`
  let entries: readonly DirEntry[]
  try {
    entries = await listDirectory(fs, path, signal)
  } catch (error) {
    throw new EngineeringError('VIEW_UNREADABLE', `Cannot list ${path}: ${error instanceof Error ? error.message : String(error)}`, 'Pass an existing export folder the session can read.')
  }
  for (const entry of [...entries].sort((left, right) => left.name.localeCompare(right.name))) {
    signal?.throwIfAborted()
    const child = relative === '' ? entry.name : `${relative}/${entry.name}`
    if (entry.type === 'directory') {
      await walk(fs, root, child, signal, visit, budget)
      continue
    }
    if (!/\.(xml|csv)$/iu.test(entry.name)) continue
    budget.count += 1
    if (budget.count > budget.max) {
      throw new EngineeringError('VIEW_TOO_LARGE', `The export has more than ${budget.max} display and tag files.`, 'Point ftview_open at one application export folder, not a whole drive.')
    }
    await visit(child, `${root.replace(/[\\/]$/u, '')}/${child}`)
  }
}

/**
 * Scan one export folder.
 *
 * @param fs - Filesystem provider.
 * @param root - Resolved export folder.
 * @param signal - Cancellation.
 * @param maxFiles - Largest number of display/tag files accepted.
 * @returns The scanned application.
 */
export async function scanApplication(fs: FsService, root: string | FsTarget, signal: AbortSignal | undefined, maxFiles: number): Promise<Application> {
  // The host's `fs.resolve` returns an FsTarget, while the walk below composes
  // string paths for `listDir`/`readBytes`. Normalise once here: passing the target
  // straight into the walker crashed every open on a host that returns one.
  const base = typeof root === 'string' ? root : root.displayPath
  const displays: DisplayFile[] = []
  const tags: TagRow[] = []
  const tagFiles: string[] = []
  const tagErrors: string[] = []
  const diagnostics: string[] = []
  const files: ScannedFile[] = []
  await walk(fs, base, '', signal, async (file, absolute) => {
    const bytes = await fs.readBytes(absolute, signal, 32 * 1024 * 1024)
    const text = decode(bytes)
    files.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
    if (/\.csv$/iu.test(file)) {
      const csv = parseTagCsv(text)
      if (csv.rows.length === 0 && csv.errors.length > 0) {
        diagnostics.push(`${file}: ${csv.errors.join(' ')}`)
        return
      }
      tagFiles.push(file)
      tags.push(...csv.rows)
      for (const error of csv.errors) tagErrors.push(`${file}: ${error}`)
      return
    }
    const display = parseDisplay(file, text)
    if (display.parseError !== undefined) {
      diagnostics.push(`${file}: ${display.parseError}`)
      return
    }
    displays.push(display)
  }, { count: 0, max: maxFiles })
  const name = base.replace(/[\\/]$/u, '').split(/[\\/]/u).pop() ?? base
  return { root: base, name, displays, tags, tagFiles, tagErrors, diagnostics, files }
}
