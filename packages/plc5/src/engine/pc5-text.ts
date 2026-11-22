/**
 * The `.PC5` text-export reader.
 *
 * A text export is a line-oriented, human-reviewable description of an RSLogix 5
 * program: a header, program files full of rungs in neutral instruction text, a
 * data-file table, and a closing `END`. This module owns the grammar, the format
 * sniffing and the deterministic issue list; the tools in `../tools/pc5-text.ts`
 * turn the parsed structure into census, digest, verify and diff answers.
 *
 * The grammar is the one authored in this bundle's knowledge collection
 * (`knowledge/plc5-program-text/pages/pc5-export.md`). It is deliberately small and
 * strict: an unknown directive is a line-numbered issue, never a silent skip, because
 * a reader that guessed would make a verify verdict claim structure the file does not
 * have.
 *
 * Nothing here reads the filesystem, writes a file, or looks at the clock.
 *
 * @module dsh-engineering-plc5/engine/pc5-text
 */

/** The file extensions the text readers accept. */
export const PC5_TEXT_EXTENSIONS: readonly string[] = ['.pc5', '.txt']

/** Compound-file magic: the first bytes of a binary `.RSP` project container. */
export const COMPOUND_FILE_MAGIC: readonly number[] = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]

/** The read cap, shared with the binary readers. */
export const MAX_TEXT_BYTES = 64 * 1024 * 1024

/** How many structure issues one parse keeps before folding the rest into a count. */
export const MAX_ISSUES = 200

/** The schema number this reader understands. */
export const SUPPORTED_EXPORT_SCHEMA = 1

/** The branch-delimiter mnemonics of the neutral rung text. */
export const BRANCH_TOKENS: readonly string[] = ['BST', 'NXB', 'BND']

/**
 * The PLC-5 instruction mnemonics the census recognises.
 *
 * The list is the authored instruction set of this bundle's knowledge collection. A
 * mnemonic outside it is reported as unknown, not guessed at; an export may carry a
 * newer instruction than this catalogue.
 */
export const KNOWN_INSTRUCTIONS: readonly string[] = [
  'ADD', 'AFI', 'AND', 'BSL', 'BSR', 'BTW', 'BTR', 'CLR', 'COP', 'CPT', 'CTD', 'CTU',
  'DIV', 'DTR', 'EQU', 'FLL', 'FOR', 'GEQ', 'GRT', 'HSC', 'IIM', 'IOM', 'JMP', 'JSR',
  'LBL', 'LEQ', 'LES', 'LIM', 'MEQ', 'MOV', 'MSG', 'MUL', 'MVM', 'NEG', 'NEQ', 'NOT',
  'NXB', 'NXT', 'OR', 'OTE', 'OTL', 'OTU', 'PID', 'RES', 'RET', 'RTO', 'SBR', 'SQI',
  'SQC', 'SQO', 'SQR', 'SUB', 'SVC', 'TND', 'TOF', 'TON', 'TOD', 'UID', 'UIE', 'XIC',
  'XIO', 'XOR',
]

/** One issue the parser found, with a line number and an actionable fix. */
export interface Pc5Issue {
  /** 1-based line in the exported text. */
  readonly line: number
  readonly severity: 'error' | 'warning'
  /** A stable code such as `UNKNOWN_RECORD` or `DUPLICATE_PROGRAM_FILE`. */
  readonly code: string
  readonly message: string
  readonly fix: string
}

/** One `MNEMONIC(operands)` token lifted from a rung's neutral text. */
export interface Pc5InstructionToken {
  readonly mnemonic: string
  readonly operands: readonly string[]
}

/** One parsed `RUNG` record. */
export interface Pc5Rung {
  readonly fileNumber: number
  readonly number: number
  readonly line: number
  readonly text: string
  readonly instructions: readonly Pc5InstructionToken[]
  /** Number of `BST`/`NXB`/`BND` delimiters in this rung. */
  readonly branches: number
  /** Text the reader could not attribute to a known token, empty when clean. */
  readonly residual: string
}

/** One parsed `PROGRAM_FILE` section. */
export interface Pc5ProgramFile {
  readonly number: number
  readonly kind: 'LADDER' | 'SFC'
  readonly name: string
  readonly line: number
  readonly rungs: Pc5Rung[]
}

/** One parsed top-level `DATA_FILE` record. */
export interface Pc5DataFile {
  readonly type: string
  readonly number: number
  readonly name: string
  readonly elements: number
  readonly line: number
}

/** The header fields the export may carry. */
export interface Pc5Header {
  readonly exportVersion: number | null
  readonly processor: string | null
  readonly project: string | null
  readonly revision: string | null
}

/** One parsed export. */
export interface Pc5Export {
  readonly header: Pc5Header
  readonly files: readonly Pc5ProgramFile[]
  readonly dataFiles: readonly Pc5DataFile[]
  readonly issues: readonly Pc5Issue[]
  readonly issuesOmitted: number
  readonly lineCount: number
  /** True when the `END` record was seen. */
  readonly ended: boolean
  /** 1-based line of the last non-comment, non-blank record. */
  readonly lastRecordLine: number
}

/** A format or content failure the text tools report as a typed envelope. */
export class Pc5TextError extends Error {
  readonly code: string
  readonly fix: string
  readonly candidates: readonly string[]

  constructor(code: string, message: string, fix: string, candidates: readonly string[] = []) {
    super(message)
    this.name = 'Pc5TextError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

/** The three kinds a byte sample can be. */
export type Pc5ByteKind = 'text' | 'binary-project' | 'binary'

/**
 * Classify bytes before decoding: the reader refuses a decode it cannot trust.
 *
 * @param bytes - The file content.
 * @returns `binary-project` for compound-file magic, `binary` for NUL bytes, else `text`.
 */
export function sniffPc5Bytes(bytes: Uint8Array): Pc5ByteKind {
  if (bytes.length >= COMPOUND_FILE_MAGIC.length) {
    let matches = true
    for (let index = 0; index < COMPOUND_FILE_MAGIC.length; index += 1) {
      if (bytes[index] !== COMPOUND_FILE_MAGIC[index]) {
        matches = false
        break
      }
    }
    if (matches) return 'binary-project'
  }
  const sample = Math.min(bytes.length, 4096)
  for (let index = 0; index < sample; index += 1) {
    if (bytes[index] === 0x00) return 'binary'
  }
  return 'text'
}

/**
 * Decode a text export, stripping a UTF-8 byte-order mark.
 *
 * A file that is not valid UTF-8 is a content failure, not a best-effort decode: the
 * message names the line of the first bad byte so the caller can convert the file.
 *
 * @param bytes - The file content, already classified as text.
 * @returns The decoded text with a trailing `\r` normalisation left for the parser.
 */
export function decodePc5Text(bytes: Uint8Array): string {
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    const loose = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    const bad = loose.search(/\uFFFD/u)
    const line = bad < 0 ? 1 : loose.slice(0, bad).split('\n').length
    throw new Pc5TextError(
      'PARSE_ERROR',
      `The export is not valid UTF-8; the first byte the decoder could not read is on line ${line}.`,
      'Convert the export to UTF-8 (a Windows code-page export is the usual cause) and retry; the reader does not guess at characters.',
    )
  }
  return decoded.charCodeAt(0) === 0xfeff ? decoded.slice(1) : decoded
}

/** Find the index of the `)` that balances the `(` at `open`, quote-aware. */
function matchingParen(text: string, open: number): number {
  let depth = 0
  let quote = false
  for (let index = open; index < text.length; index += 1) {
    const character = text[index]
    if (character === '"') quote = !quote
    if (quote) continue
    if (character === '(') depth += 1
    if (character === ')') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  return -1
}

/** Split an operand list on commas that are not inside a quoted string. */
function splitOperands(inner: string): string[] {
  const operands: string[] = []
  let current = ''
  let quote = false
  for (const character of inner) {
    if (character === '"') {
      quote = !quote
      current += character
      continue
    }
    if (character === ',' && !quote) {
      operands.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  const last = current.trim()
  if (last !== '' || operands.length > 0) operands.push(last)
  return operands.filter(operand => operand !== '')
}

/**
 * Lift the instruction tokens out of one rung's neutral text.
 *
 * Branch delimiters (`BST(...)`, `NXB(...)`, `BND()`) are counted, not returned as
 * instructions, and their contents are scanned so the instructions inside a branch are
 * still censused. Text that cannot be attributed is returned as `residual`.
 *
 * @param text - The rung text after the `RUNG <n>` field.
 * @returns The instruction tokens, the branch count and the residual text.
 */
export function parseRungText(text: string): {
  instructions: Pc5InstructionToken[]
  branches: number
  residual: string
} {
  const instructions: Pc5InstructionToken[] = []
  const mask = new Array<boolean>(text.length).fill(false)
  let branches = 0
  let index = 0
  const isWord = (character: string | undefined): boolean => character !== undefined && /[A-Za-z0-9_]/u.test(character)
  const isStart = (character: string | undefined): boolean => character !== undefined && /[A-Za-z_]/u.test(character)

  while (index < text.length) {
    if (!isStart(text[index])) {
      index += 1
      continue
    }
    if (index > 0 && isWord(text[index - 1])) {
      index += 1
      continue
    }
    let end = index + 1
    while (end < text.length && isWord(text[end])) end += 1
    const raw = text.slice(index, end).toUpperCase()
    let cursor = end
    while (cursor < text.length && /\s/u.test(text[cursor])) cursor += 1
    if (text[cursor] === '(') {
      const close = matchingParen(text, cursor)
      if (close < 0) {
        // An unclosed token means the rung was cut while being written.
        break
      }
      for (let mark = index; mark <= close; mark += 1) mask[mark] = true
      if (BRANCH_TOKENS.includes(raw)) {
        branches += 1
        // Scan inside the branch zone so nested instructions are still counted.
        index = cursor + 1
        continue
      }
      instructions.push({ mnemonic: raw, operands: splitOperands(text.slice(cursor + 1, close)) })
      index = close + 1
      continue
    }
    if (KNOWN_INSTRUCTIONS.includes(raw)) {
      for (let mark = index; mark < end; mark += 1) mask[mark] = true
      instructions.push({ mnemonic: raw, operands: [] })
      index = end
      continue
    }
    index = end
  }

  let residual = ''
  for (let position = 0; position < text.length; position += 1) {
    if (!mask[position] && /[A-Za-z0-9_]/u.test(text[position])) {
      let runEnd = position
      while (runEnd < text.length && !mask[runEnd] && /[A-Za-z0-9_.:[\]#?/]/u.test(text[runEnd])) runEnd += 1
      const run = text.slice(position, runEnd)
      residual = residual === '' ? run : `${residual} ${run}`
      position = runEnd
    }
  }
  return { instructions, branches, residual: residual.slice(0, 160) }
}

const HEADER_PROCESSOR = /^PROCESSOR\s+(.+)$/iu
const HEADER_PROJECT = /^PROJECT\s+(.+)$/iu
const HEADER_REVISION = /^REVISION\s+(.+)$/iu
const PROGRAM_FILE_RECORD = /^PROGRAM_FILE\s+(\d{1,3})\s+(LADDER|SFC)\s+"([^"]*)"$/iu
const RUNG_RECORD = /^RUNG\s+(\d{1,5})\s+(.+)$/u
const RUNG_PREFIX = /^RUNG\b/iu
const DATA_FILE_RECORD = /^DATA_FILE\s+([A-Z]{1,2})(\d{1,3})\s+"([^"]*)"\s+(\d{1,5})$/iu
const EXPORT_RECORD = /^PC5\s+EXPORT\s+(\d{1,3})$/iu

/** Strip one layer of matching double quotes a directive value may carry. */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parse one text export.
 *
 * Fatal content failures throw {@link Pc5TextError}: an empty file, a file whose first
 * record is not `PC5 EXPORT <n>`, or an export schema this reader does not know.
 * Everything else — an unknown record, a missing `END`, a duplicate number — is an
 * issue in the returned structure so a report can show what the file actually holds.
 *
 * @param text - The decoded export text.
 * @returns The parsed structure and its issues.
 */
export function parsePc5Text(text: string): Pc5Export {
  const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
  const issues: Pc5Issue[] = []
  let issuesOmitted = 0

  const addIssue = (
    line: number,
    severity: 'error' | 'warning',
    code: string,
    message: string,
    fix: string,
  ): void => {
    if (issues.length >= MAX_ISSUES) {
      issuesOmitted += 1
      return
    }
    issues.push({ line, severity, code, message, fix })
  }

  const significant = lines
    .map((line, index) => ({ line: line.trim(), number: index + 1 }))
    .filter(entry => entry.line !== '' && !entry.line.startsWith(';'))

  if (significant.length === 0) {
    throw new Pc5TextError(
      'EMPTY_EXPORT',
      'The file holds no text-export records.',
      'Pass the .PC5 text export written by RSLogix 5; an empty file is not an export.',
    )
  }

  const first = significant[0]
  const exportMatch = EXPORT_RECORD.exec(first.line)
  if (exportMatch === null) {
    throw new Pc5TextError(
      'UNSUPPORTED_FORMAT',
      `The first record (line ${first.number}) is not \`PC5 EXPORT <n>\`, so this is not the text export the reader knows.`,
      'Pass a .pc5/.txt export that starts with `PC5 EXPORT <n>`. A .L5X, .RSS, .ACH or .RSP belongs to a different tool.',
    )
  }
  const exportVersion = Number(exportMatch[1])
  if (exportVersion !== SUPPORTED_EXPORT_SCHEMA) {
    throw new Pc5TextError(
      'UNSUPPORTED_FORMAT',
      `The export declares schema ${exportVersion}; this reader understands schema ${SUPPORTED_EXPORT_SCHEMA}.`,
      'Regenerate the export with a tool that writes schema 1, or upgrade the bundle for a newer export schema.',
    )
  }

  const files: Pc5ProgramFile[] = []
  const dataFiles: Pc5DataFile[] = []
  let processor: string | null = null
  let project: string | null = null
  let revision: string | null = null
  let current: Pc5ProgramFile | null = null
  let ended = false
  let lastRecordLine = first.number

  for (const entry of significant.slice(1)) {
    const { line, number } = entry
    if (ended) {
      addIssue(
        number,
        'warning',
        'CONTENT_AFTER_END',
        `Line ${number} follows the closing END: ${line.slice(0, 80)}`,
        'Remove the records after END (or regenerate the export); the reader stops at END and does not guess what belongs after it.',
      )
      continue
    }
    lastRecordLine = number

    const programMatch = PROGRAM_FILE_RECORD.exec(line)
    if (programMatch !== null) {
      if (current !== null) {
        addIssue(
          number,
          'error',
          'PROGRAM_FILE_NESTED',
          `Line ${number} opens a program file while program file ${current.number} "${current.name}" is still open.`,
          'Close the previous section with END_PROGRAM_FILE, or regenerate the exported project.',
        )
        const closed: Pc5ProgramFile = current
        files.push(closed)
      }
      current = {
        number: Number(programMatch[1]),
        kind: /^LADDER$/iu.test(programMatch[2]) ? 'LADDER' : 'SFC',
        name: programMatch[3],
        line: number,
        rungs: [],
      }
      if (files.some(file => file.number === current!.number)) {
        addIssue(
          number,
          'error',
          'DUPLICATE_PROGRAM_FILE',
          `Two program files carry number ${current.number}; the later declaration would shadow the earlier one.`,
          'Correct the program-file numbers in the exporter, or remove the duplicate section from the export.',
        )
      }
      continue
    }

    if (EXPORT_RECORD.exec(line) !== null) {
      addIssue(
        number,
        'error',
        'UNEXPECTED_EXPORT_HEADER',
        `Line ${number} repeats the PC5 EXPORT header after the first record.`,
        'Keep exactly one export header as the first record, or regenerate the export.',
      )
      continue
    }

    const rungMatch = RUNG_RECORD.exec(line)
    if (rungMatch !== null) {
      if (current === null) {
        addIssue(
          number,
          'error',
          'RUNG_OUTSIDE_PROGRAM_FILE',
          `Line ${number} is a RUNG before any PROGRAM_FILE opens.`,
          'Move the rung inside a PROGRAM_FILE section, or regenerate the export.',
        )
        continue
      }
      const rungNumber = Number(rungMatch[1])
      const rungText = rungMatch[2].trim()
      const parse = parseRungText(rungText)
      current.rungs.push({
        fileNumber: current.number,
        number: rungNumber,
        line: number,
        text: rungText,
        instructions: parse.instructions,
        branches: parse.branches,
        residual: parse.residual,
      })
      if (rungText === '') {
        addIssue(
          number,
          'warning',
          'EMPTY_RUNG',
          `Line ${number} is rung ${rungNumber} with no instruction text.`,
          'Regenerate the export; an empty rung usually means the rung was cut while writing.',
        )
      } else {
        const openParens = (rungText.match(/\(/gu) ?? []).length
        const closeParens = (rungText.match(/\)/gu) ?? []).length
        if (openParens !== closeParens) {
          addIssue(
            number,
            'error',
            'UNBALANCED_PARENS',
            `Line ${number} has ${openParens} "(" and ${closeParens} ")", so a token is cut.`,
            'Regenerate the export; a hand-patched rung no longer demonstrates what the project contains.',
          )
        } else if (parse.residual !== '') {
          addIssue(
            number,
            'warning',
            'RUNG_TEXT_UNPARSED',
            `Line ${number} carries text the reader could not attribute: ${parse.residual}`,
            'Check the rung text against the neutral-text grammar on the rung grammar page, or regenerate the export.',
          )
        }
      }
      continue
    }

    if (RUNG_PREFIX.test(line) && rungMatch === null) {
      addIssue(
        number,
        'error',
        'RUNG_MALFORMED',
        `Line ${number} starts with RUNG but does not carry a rung number and instruction text.`,
        'Write `RUNG <number> <instruction text>`, or regenerate the export.',
      )
      continue
    }

    if (/^END_PROGRAM_FILE$/iu.test(line)) {
      if (current === null) {
        addIssue(
          number,
          'warning',
          'STRAY_END_PROGRAM_FILE',
          `Line ${number} closes a program file that is not open.`,
          'Remove the stray END_PROGRAM_FILE or regenerate the export.',
        )
        continue
      }
      files.push(current)
      current = null
      continue
    }

    if (/^END$/iu.test(line)) {
      ended = true
      if (current !== null) {
        addIssue(
          number,
          'error',
          'TRUNCATED_EXPORT',
          `The END record on line ${number} arrives while program file ${current.number} "${current.name}" is still open.`,
          'Close every PROGRAM_FILE with END_PROGRAM_FILE and regenerate the export.',
        )
        files.push(current)
        current = null
      }
      continue
    }

    const dataMatch = DATA_FILE_RECORD.exec(line)
    if (dataMatch !== null) {
      const record: Pc5DataFile = {
        type: dataMatch[1].toUpperCase(),
        number: Number(dataMatch[2]),
        name: dataMatch[3],
        elements: Number(dataMatch[4]),
        line: number,
      }
      if (current !== null) {
        addIssue(
          number,
          'error',
          'DATA_FILE_INSIDE_PROGRAM_FILE',
          `Line ${number} declares data file ${record.type}${record.number} inside program file ${current.number}.`,
          'Move the DATA_FILE records to the top level, after END_PROGRAM_FILE.',
        )
        continue
      }
      if (dataFiles.some(file => file.type === record.type && file.number === record.number)) {
        addIssue(
          number,
          'error',
          'DUPLICATE_DATA_FILE',
          `Two data files declare ${record.type}${record.number}; the later declaration would shadow the earlier one.`,
          'Correct the data-file declarations, or remove the duplicate from the export.',
        )
      }
      if (record.elements < 1) {
        addIssue(
          number,
          'error',
          'DATA_FILE_ELEMENTS',
          `Data file ${record.type}${record.number} declares ${record.elements} elements; a positive count is required.`,
          'Correct the element count and regenerate the export.',
        )
      }
      dataFiles.push(record)
      continue
    }

    const processorMatch = HEADER_PROCESSOR.exec(line)
    if (processorMatch !== null) {
      if (processor !== null) {
        addIssue(number, 'warning', 'DUPLICATE_HEADER', `Line ${number} repeats the PROCESSOR directive.`, 'Keep one PROCESSOR directive, or remove the duplicate line.')
      } else {
        processor = unquote(processorMatch[1])
      }
      continue
    }
    const projectMatch = HEADER_PROJECT.exec(line)
    if (projectMatch !== null) {
      if (project !== null) {
        addIssue(number, 'warning', 'DUPLICATE_HEADER', `Line ${number} repeats the PROJECT directive.`, 'Keep one PROJECT directive, or remove the duplicate line.')
      } else {
        project = unquote(projectMatch[1])
      }
      continue
    }
    const revisionMatch = HEADER_REVISION.exec(line)
    if (revisionMatch !== null) {
      if (revision !== null) {
        addIssue(number, 'warning', 'DUPLICATE_HEADER', `Line ${number} repeats the REVISION directive.`, 'Keep one REVISION directive, or remove the duplicate line.')
      } else {
        revision = unquote(revisionMatch[1])
      }
      continue
    }

    addIssue(
      number,
      'error',
      'UNKNOWN_RECORD',
      `Line ${number} is not a record this reader knows: ${line.slice(0, 80)}`,
      'Correct the line to a known directive, or regenerate the export; the reader reports the line instead of guessing.',
    )
  }

  if (current !== null) {
    addIssue(
      lastRecordLine,
      'error',
      'TRUNCATED_EXPORT',
      `The export ends on line ${lastRecordLine} with program file ${current.number} "${current.name}" still open.`,
      'Regenerate the export from the project; a section that never closes is a truncated export.',
    )
    files.push(current)
  }
  if (!ended) {
    addIssue(
      lastRecordLine,
      'error',
      'TRUNCATED_EXPORT',
      `The export ends on line ${lastRecordLine} without the closing END record.`,
      'Regenerate the export from the project; a file that stops before END is incomplete.',
    )
  }

  for (const file of files) {
    checkRungOrder(file, addIssue)
    if (file.rungs.length === 0) {
      addIssue(
        file.line,
        'warning',
        'EMPTY_PROGRAM_FILE',
        `Program file ${file.number} "${file.name}" has no rungs.`,
        'Confirm the export scope included the file, or remove the empty section.',
      )
    }
  }

  return {
    header: { exportVersion, processor, project, revision },
    files,
    dataFiles,
    issues,
    issuesOmitted,
    lineCount: lines.length,
    ended,
    lastRecordLine,
  }
}

/** Report duplicate and going-backwards rung numbers inside one program file. */
function checkRungOrder(
  file: Pc5ProgramFile,
  addIssue: (line: number, severity: 'error' | 'warning', code: string, message: string, fix: string) => void,
): void {
  const seen = new Set<number>()
  let previousNumber = -1
  for (const rung of file.rungs) {
    if (seen.has(rung.number)) {
      addIssue(
        rung.line,
        'warning',
        'DUPLICATE_RUNG_NUMBER',
        `Program file ${file.number} uses rung number ${rung.number} more than once.`,
        'Renumber the rungs in the exporter; a consumer that assumes unique numbers would misreport the file.',
      )
    }
    seen.add(rung.number)
    if (rung.number < previousNumber) {
      addIssue(
        rung.line,
        'warning',
        'RUNG_NUMBER_BACKWARDS',
        `Rung ${rung.number} on line ${rung.line} comes after rung ${previousNumber}; the export is out of order.`,
        'Regenerate the export in program order, or renumber the rungs.',
      )
    }
    previousNumber = rung.number
  }
}
