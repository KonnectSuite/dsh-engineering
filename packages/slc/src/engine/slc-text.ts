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
  /** The file title the export declares, when it carries one. */
  title?: string
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

/**
 * Does this text look like the RSLogix 500 Library (*.SLC) export? That
 * dialect starts with a `START <processor>` line and writes program files as
 * `LADDER <n>` blocks whose rungs are `SOR ... EOR` lines, unlike the
 * documented [SECTION] subset below.
 */
function looksLikeApsText(text: string): boolean {
  return /^\s*START\s+\S+/mu.test(text) && /^\s*LADDER\s+\d+\s*$/mu.test(text)
}

/** A base data-file name and element index from an APS address or data header. */
function apsAddress(cell: string): { file: string; element: number } | undefined {
  const address = cell.trim().replaceAll(/\s+/gu, '')
  const io = /^([IO]):(\d+)(?:[.:](\d+))?$/iu.exec(address)
  if (io !== null) {
    return { file: `${io[1]!.toUpperCase()}:${Number(io[2])}`, element: io[3] === undefined ? 0 : Number(io[3]) }
  }
  const file = /^([A-Za-z]+\d+):(\d+)(?:[.:](\d+))?$/u.exec(address)
  if (file !== null) return { file: file[1]!.toUpperCase(), element: Number(file[2]) }
  const status = /^([A-Za-z]):(\d+)$/u.exec(address)
  if (status !== null) return { file: status[1]!.toUpperCase(), element: Number(status[2]) }
  const bare = /^([A-Za-z]+\d+)$/u.exec(address)
  if (bare !== null) return { file: bare[1]!.toUpperCase(), element: 0 }
  return undefined
}

/**
 * Parse the RSLogix 500 Library (*.SLC) text dialect measured from a real
 * vendor export (Studio 15.0 / RSLogix 500 12.00.00): a processor line, rack
 * and slot configuration, numbered program files with titles, neutral-text
 * rungs wrapped in `SOR ... EOR`, and data-file value blocks. Documentation
 * (symbols, descriptions) is written by the vendor to separate .EAS/.ERP
 * exports and .SY5/.SY6 files, so this parser reports rungs and values only.
 */
function parseApsText(text: string, path: string): SlcProject {
  const project: SlcProject = {
    path,
    name: '',
    processor: { type: '', family: 'SLC 500', series: '', firmware: '', memoryWords: undefined },
    files: [],
    dataFiles: [],
    symbols: [],
    ioModules: [],
    warnings: [],
  }

  const noteWarning = (message: string): void => {
    if (project.warnings.length < 20 && !project.warnings.includes(message)) project.warnings.push(message)
  }

  const findFile = (number: number): SlcFile => {
    const name = `LAD ${number}`
    let file = project.files.find(entry => entry.name.toUpperCase() === name.toUpperCase())
    if (file === undefined) {
      file = { name, declaredRungs: 0, rungs: [] }
      project.files.push(file)
    }
    return file
  }

  const findDataFile = (name: string): SlcDataFile => {
    const normalized = name.toUpperCase()
    let file = project.dataFiles.find(entry => entry.name.toUpperCase() === normalized)
    if (file === undefined) {
      file = { name, typeLetter: typeLetterOf(name), values: new Map() }
      project.dataFiles.push(file)
    }
    return file
  }

  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u)
  let mode: 'files' | 'ladder' | 'data' | 'force' | '' = ''
  let currentFile: SlcFile | undefined
  let currentRung: number | undefined
  let rungParts: string[] = []
  let currentDataFile: SlcDataFile | undefined
  let skipDescription = false

  const flushRung = (): void => {
    if (currentFile === undefined || currentRung === undefined || rungParts.length === 0) {
      rungParts = []
      return
    }
    const text = rungParts
      .join(' ')
      .replaceAll(/\s+/gu, ' ')
      .replace(/^SOR\s+/iu, '')
      .replace(/\s+EOR$/iu, '')
      .trim()
    if (text !== '') currentFile.rungs.push({ file: currentFile.name, rung: currentRung, text })
    rungParts = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue

    if (line.startsWith('%')) {
      const rungMarker = /^%\s*Rung:\s*(\d+)\s*%/iu.exec(line)
      if (mode === 'ladder' && rungMarker !== null) {
        flushRung()
        currentRung = Number(rungMarker[1])
        continue
      }
      if (line.startsWith('% TITLE')) {
        skipDescription = true
        continue
      }
      if (skipDescription) {
        if (line === '%') skipDescription = false
        continue
      }
      // A value row below still begins with `% <address> %`; do not skip it.
      if (mode === 'data' && currentDataFile !== undefined) {
        const values = /^%\s*([^%]+?)\s*%\s*(.*)$/u.exec(line)
        if (values !== null && values[2]!.trim() !== '') {
          const base = apsAddress(values[1]!)
          if (base !== undefined) {
            const tokens = values[2]!.trim().split(/\s+/u)
            tokens.forEach((token, offset) => {
              currentDataFile!.values.set(base.element + offset, token)
            })
            continue
          }
        }
        const tripletHeader = /^%\s*\.(?:CTL|LEN)\b/iu.test(line)
        if (tripletHeader) continue
      }
      continue
    }

    if (mode === 'data' && currentDataFile !== undefined) {
      const triplet = /^(0X[0-9A-Fa-f]+)\s+(-?\d+)\s+(-?\d+)\s+%\s*([^%]+?)\s*%$/u.exec(line)
      if (triplet !== null) {
        const base = apsAddress(triplet[4]!)
        if (base !== undefined) {
          const letter = currentDataFile.typeLetter
          const value =
            letter === 'T' || letter === 'C'
              ? `PRE ${triplet[2]} ACC ${triplet[3]}`
              : letter === 'R'
                ? `LEN ${triplet[2]} POS ${triplet[3]}`
                : `${triplet[1]} ${triplet[2]} ${triplet[3]}`
          currentDataFile.values.set(base.element, value)
        }
        continue
      }
    }

    if (skipDescription) {
      if (line === '%') skipDescription = false
      continue
    }

    const start = /^START\s+(\S+)\s+%\s*(.*?)\s*%?$/u.exec(line)
    if (start !== null) {
      const description = start[2] ?? ''
      const series = /(\d+)\/(\d+)\s+CPU/u.exec(description)
      const memory = /(\d+)\s*K\s*Mem/iu.exec(description)
      project.processor = {
        type: start[1]!.toUpperCase(),
        family: 'SLC 500',
        series: series === null ? '' : `${series[1]}/${series[2]}`,
        firmware: '',
        memoryWords: memory === null ? undefined : Number(memory[1]) * 1024,
      }
      continue
    }

    const slot = /^SLOT\s+(\d+)\s+(\S+)/iu.exec(line)
    if (slot !== null) {
      project.ioModules.push({ slot: Number(slot[1]), module: slot[2]!.toUpperCase() })
      continue
    }

    const projectName = /^PROJECT\s+"([^"]*)"/u.exec(line)
    if (projectName !== null) {
      project.name = projectName[1] ?? ''
      mode = 'files'
      continue
    }

    const fileDeclaration = /^(\d+)\s+"([^"]+)"$/u.exec(line)
    if (mode === 'files' && fileDeclaration !== null) {
      const file = findFile(Number(fileDeclaration[1]))
      file.title = fileDeclaration[2] ?? ''
      continue
    }

    const ladder = /^LADDER\s+(\d+)$/u.exec(line)
    if (ladder !== null) {
      flushRung()
      currentFile = findFile(Number(ladder[1]))
      mode = 'ladder'
      currentRung = undefined
      continue
    }

    const data = /^DATA\s+(\S+)$/u.exec(line)
    if (data !== null) {
      flushRung()
      const base = apsAddress(data[1]!)
      if (base !== undefined) {
        currentDataFile = findDataFile(base.file)
        mode = 'data'
      } else {
        noteWarning(`the DATA section "${data[1]}" names no SLC data file and was ignored.`)
        mode = ''
      }
      continue
    }

    if (/^FORCE\b/iu.test(line)) {
      flushRung()
      mode = 'force'
      continue
    }

    if (mode === 'ladder' && currentRung !== undefined) {
      if (/^(?:TITLE:|RUNG DESCRIPTION:)/iu.test(line)) continue
      rungParts.push(line.replace(/^\s*SOR\s+/iu, ''))
      if (/\bEOR\s*$/iu.test(line)) flushRung()
      continue
    }

    if (mode === 'force' || mode === 'ladder') continue
    if (mode === 'files') continue
  }

  flushRung()
  for (const file of project.files) {
    if (file.declaredRungs === 0) file.declaredRungs = file.rungs.length
  }
  if (project.name === '') project.name = stemOf(path)
  project.dataFiles.sort((left, right) => left.name.localeCompare(right.name, 'en'))
  project.ioModules.sort((left, right) => left.slot - right.slot)
  return project
}

/** Parse one project text export. */
export function parseSlcText(text: string, path: string): SlcProject {
  const source = text.replace(/^\uFEFF/u, '')
  if (looksLikeApsText(source)) return parseApsText(source, path)
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
