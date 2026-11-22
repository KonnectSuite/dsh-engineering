/**
 * Reader for the RSLogix 500 project text export we document.
 *
 * The vendor `.SLC` section grammar is not published; this reader accepts the
 * documented subset the authored corpus describes (`[PROJECT]`, `[PROCESSOR]`,
 * `[FILES]`, `[DATA FILES]`, `[LADDER <file>]`, `[DATA <file>]`, `[IO]`,
 * `[SYMBOLS]`) and reports every line it did not understand as a warning rather
 * than guessing. The subset is pinned by committed fixtures; a vendor export
 * that carries other sections loses those sections, not the whole answer.
 *
 * @module dsh-engineering-slc/engine/slc-text
 */

/** One rung of neutral-text ladder. */
export interface SlcRung {
  file: string
  rung: number
  text: string
}

/** One program file and the rungs read under it. */
export interface SlcFile {
  name: string
  /** The rung count the export declares, or the parsed count when it declares none. */
  declaredRungs: number
  rungs: SlcRung[]
}

/** One data file: a name such as `N7`, its type letter, and the values the export carries. */
export interface SlcDataFile {
  name: string
  typeLetter: string
  values: Map<number, string>
}

/** One symbol row: an address, the symbol, and its description. */
export interface SlcSymbol {
  address: string
  symbol: string
  description: string
}

/** One configured I/O module row. */
export interface SlcIoModule {
  slot: number
  module: string
}

/** The processor identity the export records. */
export interface SlcProcessorIdentity {
  type: string
  family: string
  series: string
  firmware: string
  memoryWords: number | undefined
}

/** A parsed project text export. */
export interface SlcProject {
  path: string
  name: string
  processor: SlcProcessorIdentity
  files: SlcFile[]
  dataFiles: SlcDataFile[]
  symbols: SlcSymbol[]
  ioModules: SlcIoModule[]
  warnings: string[]
}

/** The failure a text parser reports: a code, a message and a fix. */
export class SlcTextError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'SlcTextError'
    this.code = code
    this.fix = fix
  }
}

/** The documented section names. */
const SECTION = /^\[([^\]]+)\]$/u

/** A rung line: `RUNG 3: <neutral text>` or `RUNG 3 <neutral text>`. */
const RUNG_LINE = /^RUNG\s+(\d+)\s*[:\-]?\s*(.*)$/iu

/** Split `a = b` at the first equals sign. */
function splitPair(line: string): { key: string; value: string } | undefined {
  const at = line.indexOf('=')
  if (at < 0) return undefined
  return { key: line.slice(0, at).trim(), value: line.slice(at + 1).trim() }
}

/** Strip an inline `;` comment. */
function stripComment(value: string): string {
  const at = value.indexOf(';')
  return (at < 0 ? value : value.slice(0, at)).trim()
}

/** The path stem, used when the export records no project name. */
function stemOf(path: string): string {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? name : name.slice(0, dot)
}

/** The type letter of a data file name: `N7` -> `N`, `R6` -> `R`, `S` -> `S`. */
function typeLetterOf(name: string): string {
  const match = /^([A-Za-z])/u.exec(name)
  return match === null ? '' : match[1]!.toUpperCase()
}

/** Decode a text export; NUL bytes mean this is not the text format. */
export function decodeSlcText(bytes: Uint8Array): string {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  if (text.includes('\u0000')) {
    throw new SlcTextError(
      'PARSE_FAILED',
      'The file carries NUL bytes, so it is a binary container, not a text export.',
      'Pass a text export saved from RSLogix 500 (File > Save As a text export) or an .SLC file, not the .RSS project.',
    )
  }
  return text
}

/** Parse one project text export. */
export function parseSlcText(text: string, path: string): SlcProject {
  const project: SlcProject = {
    path,
    name: '',
    processor: { type: '', family: '', series: '', firmware: '', memoryWords: undefined },
    files: [],
    dataFiles: [],
    symbols: [],
    ioModules: [],
    warnings: [],
  }

  const noteWarning = (message: string): void => {
    if (project.warnings.length < 20 && !project.warnings.includes(message)) project.warnings.push(message)
  }

  const findFile = (name: string): SlcFile => {
    // `[LADDER 2]` names the same program file as `LAD 2 = 3` under [FILES];
    // the export writer sometimes uses the bare number and sometimes the
    // declared file name. Treat them as one file so rungs and the declared
    // count meet in one place.
    const canonical = /^\d+$/u.test(name.trim()) ? `LAD ${name.trim()}` : name.trim()
    const normalized = canonical.replaceAll(/\s+/gu, ' ').toUpperCase()
    let file = project.files.find(entry => entry.name.trim().replaceAll(/\s+/gu, ' ').toUpperCase() === normalized)
    if (file === undefined) {
      file = { name: canonical, declaredRungs: 0, rungs: [] }
      project.files.push(file)
      noteWarning(`the export uses file "${canonical}" in a ladder section but does not declare it under [FILES]; its rung count is the parsed one.`)
    }
    return file
  }

  const findDataFile = (name: string): SlcDataFile => {
    const normalized = name.trim().toUpperCase()
    let file = project.dataFiles.find(entry => entry.name.toUpperCase() === normalized)
    if (file === undefined) {
      file = { name: name.trim(), typeLetter: typeLetterOf(name), values: new Map() }
      project.dataFiles.push(file)
      noteWarning(`the export carries values for data file "${name.trim()}" but does not declare it under [DATA FILES]; the elements are the parsed ones.`)
    }
    return file
  }

  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u)
  let section = ''
  let sectionArg = ''

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index] ?? ''
    const line = raw.trim()
    if (line === '' || line.startsWith(';')) continue

    const header = SECTION.exec(line)
    if (header !== null) {
      const headerText = (header[1] ?? '').trim()
      const parts = headerText.split(/\s+/u)
      section = (parts[0] ?? '').toUpperCase()
      sectionArg = parts.slice(1).join(' ')
      if (section === 'DATA' && sectionArg.toUpperCase() === 'FILES') {
        section = 'DATAFILES'
        sectionArg = ''
      }
      if (!['PROJECT', 'PROCESSOR', 'FILES', 'DATAFILES', 'DATA', 'LADDER', 'IO', 'SYMBOLS'].includes(section)) {
        noteWarning(`section [${headerText}] is not part of the documented export subset and was ignored.`)
      } else if ((section === 'LADDER' || section === 'DATA') && sectionArg === '') {
        noteWarning(`section [${headerText}] names no file and was ignored.`)
        section = ''
      }
      continue
    }

    if (section === 'LADDER') {
      const rung = RUNG_LINE.exec(line)
      if (rung === null) {
        noteWarning(`line ${index + 1} in [LADDER ${sectionArg}] is not a RUNG line and was ignored.`)
        continue
      }
      const projectFile = findFile(sectionArg)
      projectFile.rungs.push({ file: projectFile.name, rung: Number(rung[1]), text: (rung[2] ?? '').trim() })
      continue
    }

    const pair = splitPair(line)
    if (pair === undefined) {
      noteWarning(`line ${index + 1} is neither a section header nor a key = value row and was ignored.`)
      continue
    }

    if (section === 'PROJECT') {
      if (pair.key.toLowerCase() === 'name') project.name = stripComment(pair.value)
    } else if (section === 'PROCESSOR') {
      const key = pair.key.toLowerCase().replaceAll(/[\s-]+/gu, '_')
      const value = stripComment(pair.value)
      if (key === 'type' || key === 'processor' || key === 'processor_type') project.processor.type = value
      else if (key === 'family') project.processor.family = value
      else if (key === 'series') project.processor.series = value
      else if (key === 'firmware' || key === 'firmware_version') project.processor.firmware = value
      else if (key === 'memory_words' || key === 'memory') {
        const words = Number.parseInt(value.replaceAll(/[^0-9]/gu, ''), 10)
        project.processor.memoryWords = Number.isFinite(words) ? words : undefined
      }
    } else if (section === 'FILES') {
      const declared = Number.parseInt(pair.value, 10)
      const projectFile = findFile(pair.key)
      projectFile.declaredRungs = Number.isFinite(declared) && declared >= 0 ? declared : projectFile.rungs.length
    } else if (section === 'DATAFILES') {
      const declared = Number.parseInt(pair.value, 10)
      const dataFile = findDataFile(pair.key)
      if (Number.isFinite(declared) && declared >= 0) {
        // The declared element count is a census fact; the reader keeps the
        // values it actually parsed and reports both.
        dataFile.values.set(-1, String(declared))
      }
    } else if (section === 'DATA') {
      const dataFile = findDataFile(sectionArg)
      const rawKey = pair.key.includes(':') ? (pair.key.split(':').pop() ?? pair.key) : pair.key
      const element = Number.parseInt(rawKey.trim(), 10)
      if (!Number.isFinite(element) || element < 0) {
        noteWarning(`element key "${pair.key}" in [DATA ${sectionArg}] is not a number and was ignored.`)
        continue
      }
      dataFile.values.set(element, stripComment(pair.value))
    } else if (section === 'IO') {
      const slotText = pair.key.toLowerCase().startsWith('slot ') ? pair.key.slice(5).trim() : pair.key.trim()
      const slot = Number.parseInt(slotText.replaceAll(/[^0-9]/gu, ''), 10)
      if (!Number.isFinite(slot) || slot < 0) {
        noteWarning(`[IO] row "${pair.key}" names no slot and was ignored.`)
        continue
      }
      project.ioModules.push({ slot, module: stripComment(pair.value) })
    } else if (section === 'SYMBOLS') {
      const commentAt = pair.value.indexOf(';')
      const symbol = stripComment(pair.value)
      const description = commentAt < 0 ? '' : pair.value.slice(commentAt + 1).trim()
      if (pair.key === '' || symbol === '') {
        noteWarning(`symbol row "${line}" is missing an address or a symbol and was ignored.`)
        continue
      }
      project.symbols.push({ address: pair.key, symbol, description })
    }
  }

  if (project.name === '') project.name = stemOf(path)
  project.dataFiles.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  project.ioModules.sort((left, right) => left.slot - right.slot)
  return project
}

/** The rungs of a file that count as logic: a terminal END is not included. */
export function logicRungs(file: SlcFile): readonly SlcRung[] {
  return file.rungs.filter(rung => rung.text.trim().toUpperCase() !== 'END')
}

/** The total rung count the export declares, falling back to the parsed count. */
export function totalRungs(project: SlcProject): number {
  return project.files.reduce((sum, file) => sum + (file.declaredRungs > 0 ? file.declaredRungs : file.rungs.length), 0)
}

/** Case-insensitive file lookup by the name the user typed (`LAD 2`, `lad2`). */
export function programFileByName(project: SlcProject, name: string): SlcFile | undefined {
  const normalized = name.trim().replaceAll(/\s+/gu, '').toUpperCase()
  return project.files.find(file => file.name.trim().replaceAll(/\s+/gu, '').toUpperCase() === normalized)
}

/** Case-insensitive data-file lookup by name (`N7`, `n7`). */
export function dataFileByName(project: SlcProject, name: string): SlcDataFile | undefined {
  const normalized = name.trim().toUpperCase()
  return project.dataFiles.find(file => file.name.toUpperCase() === normalized)
}
