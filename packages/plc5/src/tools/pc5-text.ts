/**
 * The six read-only tools for `.PC5` text exports.
 *
 * Every tool here reads one local text export, parses it with the engine in
 * `../engine/pc5-text.ts`, and returns a deterministic answer in the row's envelope
 * shape: a summary, a data object, suggested next tools, and a coverage block. They
 * never write and never need RSLogix 5 installed.
 *
 * The failure envelope mirrors the binary readers: `{ error: { code, message, fix,
 * candidates } }`, with fixes written to be actionable.
 *
 * @module dsh-engineering-plc5/tools/pc5-text
 */

import { jsonText, type FsService, type SandboxPolicyResolver, type ToolDefinition, type ToolExec } from '../core/tool.ts'
import {
  BRANCH_TOKENS,
  KNOWN_INSTRUCTIONS,
  MAX_TEXT_BYTES,
  PC5_TEXT_EXTENSIONS,
  Pc5TextError,
  decodePc5Text,
  parsePc5Text,
  sniffPc5Bytes,
  type Pc5Export,
  type Pc5Issue,
  type Pc5ProgramFile,
} from '../engine/pc5-text.ts'

/** The capability statement every text answer carries. */
const TEXT_COVERAGE = {
  complete: false,
  unverified: [
    'the binary project the text was produced from — the export is a derived artifact, not the project',
    'processor behaviour the text does not model: program scheduling, interrupts and I/O update timing',
    'operands that only resolve at run time (indirect addressing and placeholder operands)',
  ],
} as const

/** How many issue rows one report prints before folding the rest into a count. */
const MAX_ISSUE_ROWS = 60

/** How many mnemonic rows the inventory prints before folding the rest. */
const MAX_MNEMONIC_ROWS = 120

/** How many indirect sites the census prints before folding the rest. */
const MAX_SITES = 200

/** How many entries of each diff category are printed before folding the rest. */
const MAX_DIFF_ENTRIES = 50

/** A failure this tool family returns as a typed envelope. */
class TextToolError extends Error {
  readonly code: string
  readonly fix: string
  readonly candidates: readonly string[]

  constructor(code: string, message: string, fix: string, candidates: readonly string[] = []) {
    super(message)
    this.name = 'TextToolError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

function failure(error: unknown): unknown {
  if (error instanceof TextToolError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, candidates: error.candidates } }
  }
  if (error instanceof Pc5TextError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, candidates: error.candidates } }
  }
  return {
    error: {
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : 'The tool failed without an error message.',
      fix: 'Read the .PC5 export again; if the failure repeats, the export or the reader is damaged.',
      candidates: [],
    },
  }
}

function stringArg(args: Readonly<Record<string, unknown>>, name: string, example: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new TextToolError(
      'INVALID_ARGUMENT',
      `${name} is required and must be a file path.`,
      `Pass ${name}, for example ${example}.`,
    )
  }
  return value
}

function extensionOf(path: string): string {
  const name = path.split(/[\\/]/u).pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot <= 0 ? '' : name.slice(dot).toLowerCase()
}

/** Read the bytes of a text export, with the row's typed failures. */
async function readExportText(fs: FsService, path: string, exec: ToolExec): Promise<{ displayPath: string; text: string }> {
  const extension = extensionOf(path)
  if (!PC5_TEXT_EXTENSIONS.includes(extension)) {
    throw new TextToolError(
      'UNSUPPORTED_FORMAT',
      `The path ends in "${extension || '(no extension)'}"; the text readers read .pc5 or .txt exports.`,
      'Pass the .PC5 text export (or the same text saved as .txt). A .RSP/.RSS/.ACH belongs to the binary readers; a .L5X belongs to Studio.',
    )
  }
  let target: Awaited<ReturnType<FsService['resolve']>>
  try {
    target = await fs.resolve(path, { signal: exec.signal, cwd: exec.cwd })
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      throw new TextToolError(
        'FILE_MISSING',
        `No file at ${path}.`,
        'Pass an existing .PC5 text export; these tools do not create files.',
      )
    }
    throw error
  }
  let stat: Awaited<ReturnType<FsService['stat']>>
  try {
    stat = await fs.stat(target, exec.signal)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      throw new TextToolError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .PC5 text export; these tools do not create files.')
    }
    throw error
  }
  if (stat === undefined) {
    throw new TextToolError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .PC5 text export; these tools do not create files.')
  }
  if (stat.type !== 'file') {
    throw new TextToolError('NOT_A_FILE', `${path} is not a regular file.`, 'Pass the export file itself, not its folder or a device.')
  }
  let bytes: Uint8Array
  try {
    bytes = await fs.readBytes(target, exec.signal, MAX_TEXT_BYTES)
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === 'ENOENT') {
      throw new TextToolError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .PC5 text export; these tools do not create files.')
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new TextToolError(
        'ACCESS_DENIED',
        `The filesystem provider refused to read ${path}.`,
        'Choose a file this chat can read, or move the export into the workspace.',
      )
    }
    throw error
  }
  const kind = sniffPc5Bytes(bytes)
  if (kind === 'binary-project') {
    throw new TextToolError(
      'SOURCE_NOT_INSTALLED',
      `${path} holds a compound-file project container (.RSP bytes), not the text export.`,
      'Open the project in RSLogix 5 and save the text export, then pass that file; or read the .RSP directly with plc5_open.',
    )
  }
  if (kind === 'binary') {
    throw new TextToolError(
      'UNSUPPORTED_FORMAT',
      `${path} contains NUL bytes, so it is binary rather than the text export.`,
      'Pass the .PC5 text export; a binary project or a renamed container is not a text file.',
    )
  }
  return { displayPath: target.displayPath, text: decodePc5Text(bytes) }
}

/** Load and parse one export, guarding the header-only case as EMPTY_EXPORT. */
async function loadExport(
  fs: FsService,
  path: string,
  exec: ToolExec,
): Promise<{ displayPath: string; parsed: Pc5Export }> {
  const { displayPath, text } = await readExportText(fs, path, exec)
  const parsed = parsePc5Text(text)
  if (parsed.files.length === 0 && parsed.dataFiles.length === 0) {
    throw new TextToolError(
      'EMPTY_EXPORT',
      `The export at ${path} has a header but no program file and no data file.`,
      'Confirm the export scope covered the program files, then regenerate the export from the project.',
    )
  }
  return { displayPath, parsed }
}

const countInstructions = (file: Pc5ProgramFile): number =>
  file.rungs.reduce((total, rung) => total + rung.instructions.length, 0)

const countBranches = (file: Pc5ProgramFile): number =>
  file.rungs.reduce((total, rung) => total + rung.branches, 0)

function issueRows(issues: readonly Pc5Issue[]): { shown: readonly Pc5Issue[]; folded: number } {
  return issues.length <= MAX_ISSUE_ROWS
    ? { shown: issues, folded: 0 }
    : { shown: issues.slice(0, MAX_ISSUE_ROWS), folded: issues.length - MAX_ISSUE_ROWS }
}

/** The parameters every single-file text tool declares. */
const PATH_PARAMETERS = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'Path to the .PC5 text export (or the same text saved as .txt).',
    },
  },
  required: ['path'],
  additionalProperties: false,
} as const

/** Census one export's mnemonics, per file and in total. */
function instructionCensus(parsed: Pc5Export): {
  rows: { mnemonic: string; count: number; files: number[]; known: boolean }[]
  unknown: { mnemonic: string; count: number; sites: { file: number; rung: number; line: number }[] }[]
  totalInstructions: number
  distinct: number
  branchTotal: number
} {
  const counts = new Map<string, { count: number; files: Set<number> }>()
  const unknownSites = new Map<string, { file: number; rung: number; line: number }[]>()
  let totalInstructions = 0
  let branchTotal = 0
  for (const file of parsed.files) {
    branchTotal += countBranches(file)
    for (const rung of file.rungs) {
      for (const token of rung.instructions) {
        totalInstructions += 1
        const current = counts.get(token.mnemonic) ?? { count: 0, files: new Set<number>() }
        current.count += 1
        current.files.add(file.number)
        counts.set(token.mnemonic, current)
        if (!KNOWN_INSTRUCTIONS.includes(token.mnemonic)) {
          const sites = unknownSites.get(token.mnemonic) ?? []
          sites.push({ file: file.number, rung: rung.number, line: rung.line })
          unknownSites.set(token.mnemonic, sites)
        }
      }
    }
  }
  const rows = [...counts.entries()]
    .map(([mnemonic, value]) => ({
      mnemonic,
      count: value.count,
      files: [...value.files].sort((left, right) => left - right),
      known: KNOWN_INSTRUCTIONS.includes(mnemonic),
    }))
    .sort((left, right) => (left.mnemonic < right.mnemonic ? -1 : left.mnemonic > right.mnemonic ? 1 : 0))
  const unknown = [...unknownSites.entries()]
    .map(([mnemonic, sites]) => ({
      mnemonic,
      count: counts.get(mnemonic)?.count ?? sites.length,
      sites: sites.slice(0, 20),
    }))
    .sort((left, right) => (left.mnemonic < right.mnemonic ? -1 : left.mnemonic > right.mnemonic ? 1 : 0))
  return { rows, unknown, totalInstructions, distinct: rows.length, branchTotal }
}

/** Gather every operand site that is not a plain address. */
function indirectSitesOf(parsed: Pc5Export): {
  sites: {
    file: number
    rung: number
    line: number
    mnemonic: string
    operand: string
    kind: 'bracket' | 'file-indirect' | 'placeholder'
  }[]
  counts: { bracket: number; fileIndirect: number; placeholder: number }
  rungs: number
} {
  const sites: {
    file: number
    rung: number
    line: number
    mnemonic: string
    operand: string
    kind: 'bracket' | 'file-indirect' | 'placeholder'
  }[] = []
  const counts = { bracket: 0, fileIndirect: 0, placeholder: 0 }
  const rungKeys = new Set<string>()
  for (const file of parsed.files) {
    for (const rung of file.rungs) {
      for (const token of rung.instructions) {
        for (const operand of token.operands) {
          if (operand === '') continue
          let kind: 'bracket' | 'file-indirect' | 'placeholder' | null = null
          if (operand.includes('[')) kind = 'bracket'
          else if (operand.startsWith('#')) kind = 'file-indirect'
          else if (operand.includes('?')) kind = 'placeholder'
          if (kind === null) continue
          if (kind === 'bracket') counts.bracket += 1
          else if (kind === 'file-indirect') counts.fileIndirect += 1
          else counts.placeholder += 1
          rungKeys.add(`${file.number}:${rung.number}`)
          sites.push({ file: file.number, rung: rung.number, line: rung.line, mnemonic: token.mnemonic, operand, kind })
        }
      }
    }
  }
  return { sites, counts, rungs: rungKeys.size }
}

/** Operands that name a data file: ADDRESS like N7:0, T4:0.PRE, or ST9:0. */
const DATA_REFERENCE = /^([A-Za-z]{1,2})(\d{1,4})(?=[:/])/u

function dataFileReferences(parsed: Pc5Export): { type: string; number: number; sites: { file: number; rung: number; line: number }[] }[] {
  const refs = new Map<string, { type: string; number: number; sites: { file: number; rung: number; line: number }[] }>()
  for (const file of parsed.files) {
    for (const rung of file.rungs) {
      for (const token of rung.instructions) {
        for (const operand of token.operands) {
          if (operand.startsWith('#') || operand.includes('[') || operand.includes('?')) continue
          const match = DATA_REFERENCE.exec(operand)
          if (match === null) continue
          const type = match[1].toUpperCase()
          if (type === 'I' || type === 'O' || type === 'S') continue
          const number = Number(match[2])
          const key = `${type}${number}`
          const current = refs.get(key) ?? { type, number, sites: [] }
          current.sites.push({ file: file.number, rung: rung.number, line: rung.line })
          refs.set(key, current)
        }
      }
    }
  }
  return [...refs.values()].sort((left, right) =>
    left.type === right.type ? left.number - right.number : left.type < right.type ? -1 : 1,
  )
}

/** Compare two exports and describe what changed. */
function diffExports(first: Pc5Export, second: Pc5Export): {
  header: { field: string; before: string | number | null; after: string | number | null }[]
  programFiles: {
    onlyInFirst: { number: number; name: string; kind: string }[]
    onlyInSecond: { number: number; name: string; kind: string }[]
    changed: { number: number; nameFirst: string; nameSecond: string; kindFirst: string; kindSecond: string; rungsFirst: number; rungsSecond: number }[]
  }
  dataFiles: {
    onlyInFirst: { file: string; name: string; elements: number }[]
    onlyInSecond: { file: string; name: string; elements: number }[]
    changed: { file: string; nameFirst: string; nameSecond: string; elementsFirst: number; elementsSecond: number }[]
  }
  rungs: {
    added: { file: number; number: number; text: string }[]
    removed: { file: number; number: number; text: string }[]
    changed: { file: number; number: number; before: string; after: string }[]
  }
  totals: { added: number; removed: number; changed: number }
} {
  const header: { field: string; before: string | number | null; after: string | number | null }[] = []
  const headerFields: (keyof Pc5Export['header'])[] = ['exportVersion', 'processor', 'project', 'revision']
  for (const field of headerFields) {
    if (first.header[field] !== second.header[field]) {
      header.push({ field, before: first.header[field], after: second.header[field] })
    }
  }

  const firstByNumber = new Map(first.files.map(file => [file.number, file]))
  const secondByNumber = new Map(second.files.map(file => [file.number, file]))
  const onlyInFirst = first.files
    .filter(file => !secondByNumber.has(file.number))
    .map(file => ({ number: file.number, name: file.name, kind: file.kind }))
    .sort((left, right) => left.number - right.number)
  const onlyInSecond = second.files
    .filter(file => !firstByNumber.has(file.number))
    .map(file => ({ number: file.number, name: file.name, kind: file.kind }))
    .sort((left, right) => left.number - right.number)
  const changedFiles: {
    number: number
    nameFirst: string
    nameSecond: string
    kindFirst: string
    kindSecond: string
    rungsFirst: number
    rungsSecond: number
  }[] = []
  const addedRungs: { file: number; number: number; text: string }[] = []
  const removedRungs: { file: number; number: number; text: string }[] = []
  const changedRungs: { file: number; number: number; before: string; after: string }[] = []
  for (const file of first.files) {
    const other = secondByNumber.get(file.number)
    if (other === undefined) continue
    if (file.name !== other.name || file.kind !== other.kind || file.rungs.length !== other.rungs.length) {
      changedFiles.push({
        number: file.number,
        nameFirst: file.name,
        nameSecond: other.name,
        kindFirst: file.kind,
        kindSecond: other.kind,
        rungsFirst: file.rungs.length,
        rungsSecond: other.rungs.length,
      })
    }
    const firstRungs = new Map<number, string[]>()
    for (const rung of file.rungs) {
      const texts = firstRungs.get(rung.number) ?? []
      texts.push(rung.text)
      firstRungs.set(rung.number, texts)
    }
    const secondRungs = new Map<number, string[]>()
    for (const rung of other.rungs) {
      const texts = secondRungs.get(rung.number) ?? []
      texts.push(rung.text)
      secondRungs.set(rung.number, texts)
    }
    const numbers = new Set([...firstRungs.keys(), ...secondRungs.keys()])
    for (const number of [...numbers].sort((left, right) => left - right)) {
      const beforeTexts = firstRungs.get(number)
      const afterTexts = secondRungs.get(number)
      if (beforeTexts === undefined) {
        addedRungs.push({ file: file.number, number, text: (afterTexts ?? []).join(' | ').slice(0, 400) })
        continue
      }
      if (afterTexts === undefined) {
        removedRungs.push({ file: file.number, number, text: beforeTexts.join(' | ').slice(0, 400) })
        continue
      }
      const before = beforeTexts.join('\n')
      const after = afterTexts.join('\n')
      if (before !== after) {
        changedRungs.push({ file: file.number, number, before: before.slice(0, 400), after: after.slice(0, 400) })
      }
    }
  }
  for (const file of second.files) {
    const other = firstByNumber.get(file.number)
    if (other === undefined) {
      for (const rung of file.rungs) {
        addedRungs.push({ file: file.number, number: rung.number, text: rung.text.slice(0, 400) })
      }
    }
  }
  for (const file of first.files) {
    const other = secondByNumber.get(file.number)
    if (other === undefined) {
      for (const rung of file.rungs) {
        removedRungs.push({ file: file.number, number: rung.number, text: rung.text.slice(0, 400) })
      }
    }
  }

  const keyOf = (type: string, number: number): string => `${type}${number}`
  const firstData = new Map(first.dataFiles.map(file => [keyOf(file.type, file.number), file]))
  const secondData = new Map(second.dataFiles.map(file => [keyOf(file.type, file.number), file]))
  const dataOnlyInFirst = first.dataFiles
    .filter(file => !secondData.has(keyOf(file.type, file.number)))
    .map(file => ({ file: keyOf(file.type, file.number), name: file.name, elements: file.elements }))
  const dataOnlyInSecond = second.dataFiles
    .filter(file => !firstData.has(keyOf(file.type, file.number)))
    .map(file => ({ file: keyOf(file.type, file.number), name: file.name, elements: file.elements }))
  const dataChanged: { file: string; nameFirst: string; nameSecond: string; elementsFirst: number; elementsSecond: number }[] = []
  for (const file of first.dataFiles) {
    const key = keyOf(file.type, file.number)
    const other = secondData.get(key)
    if (other === undefined) continue
    if (file.name !== other.name || file.elements !== other.elements) {
      dataChanged.push({
        file: key,
        nameFirst: file.name,
        nameSecond: other.name,
        elementsFirst: file.elements,
        elementsSecond: other.elements,
      })
    }
  }

  addedRungs.sort((left, right) =>
    left.file === right.file ? left.number - right.number : left.file - right.file,
  )
  removedRungs.sort((left, right) =>
    left.file === right.file ? left.number - right.number : left.file - right.file,
  )
  changedRungs.sort((left, right) =>
    left.file === right.file ? left.number - right.number : left.file - right.file,
  )
  return {
    header,
    programFiles: { onlyInFirst, onlyInSecond, changed: changedFiles },
    dataFiles: { onlyInFirst: dataOnlyInFirst, onlyInSecond: dataOnlyInSecond, changed: dataChanged },
    rungs: { added: addedRungs, removed: removedRungs, changed: changedRungs },
    totals: { added: addedRungs.length, removed: removedRungs.length, changed: changedRungs.length },
  }
}

/** The definition shape shared by the six tools. */
function define(
  name: string,
  description: string,
  parameters: Readonly<Record<string, unknown>>,
  execute: (args: Readonly<Record<string, unknown>>, exec: ToolExec) => Promise<unknown>,
): ToolDefinition {
  return {
    name,
    description,
    parameters,
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        return await execute(args, exec)
      } catch (error) {
        return failure(error)
      }
    },
  }
}

/**
 * Build the six text-export tools.
 *
 * @param fs - The host filesystem service; the tools only read.
 * @param _policy - Accepted for symmetry with the binary tools; no write is ever made.
 * @returns The six definitions, in review order.
 */
export function pc5TextTools(fs: FsService, _policy?: SandboxPolicyResolver): readonly ToolDefinition[] {
  const structureTool = define(
    'plc5_pc5',
    'Read one .PC5 text export and report its structure: header (schema, processor, project, revision), one row per program file with rung and instruction counts, the data-file table, and every structure issue the parser found with line numbers and fixes. Read-only and offline; call this first on an unknown export to confirm it is the file you meant. Does not read the binary .RSP container (a compound-file container fails with SOURCE_NOT_INSTALLED) and does not model processor behaviour beyond the text.',
    PATH_PARAMETERS,
    async (args, exec) => {
      const { displayPath, parsed } = await loadExport(fs, stringArg(args, 'path', 'C:\\\\exports\\\\line3.pc5'), exec)
      const errors = parsed.issues.filter(issue => issue.severity === 'error')
      const warnings = parsed.issues.filter(issue => issue.severity === 'warning')
      const rows = issueRows(parsed.issues)
      const programFiles = parsed.files.map(file => ({
        number: file.number,
        kind: file.kind,
        name: file.name,
        line: file.line,
        rungs: file.rungs.length,
        instructions: countInstructions(file),
        branches: countBranches(file),
      }))
      return {
        summary: `Text export with ${programFiles.length} program file(s), ${programFiles.reduce((total, file) => total + file.rungs, 0)} rung(s) and ${parsed.dataFiles.length} data file(s); ${errors.length} error(s) and ${warnings.length} warning(s).${parsed.ended ? '' : ' It has no closing END, so it is truncated.'}`,
        data: {
          path: displayPath,
          schema: parsed.header.exportVersion,
          header: {
            processor: parsed.header.processor,
            project: parsed.header.project,
            revision: parsed.header.revision,
          },
          ended: parsed.ended,
          lineCount: parsed.lineCount,
          lastRecordLine: parsed.lastRecordLine,
          programFiles,
          dataFiles: parsed.dataFiles.map(file => ({
            file: `${file.type}${file.number}`,
            type: file.type,
            number: file.number,
            name: file.name,
            elements: file.elements,
            line: file.line,
          })),
          issues: {
            total: parsed.issues.length,
            errors: errors.length,
            warnings: warnings.length,
            shown: rows.shown,
            folded: rows.folded + parsed.issuesOmitted,
          },
        },
        next: [
          { tool: 'plc5_verify', why: 'Turn those structure issues into one verdict before trusting any count.' },
          { tool: 'plc5_instruction_inventory', why: 'Scope the instruction census once the file is confirmed well-formed.' },
          { tool: 'plc5_docs', why: 'Read the .PC5 grammar and the pitfall pages when the issues name a record you do not recognize.' },
        ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  const inventoryTool = define(
    'plc5_instruction_inventory',
    'Count every instruction in one .PC5 text export by mnemonic, with a per-program-file distribution and the list of mnemonics this bundle does not know. Sorted and deterministic; caps the mnemonic rows and reports how many were folded. Read-only and offline. A mnemonic outside the catalogue is reported as unknown, not guessed at.',
    PATH_PARAMETERS,
    async (args, exec) => {
      const { displayPath, parsed } = await loadExport(fs, stringArg(args, 'path', 'C:\\\\exports\\\\line3.pc5'), exec)
      const census = instructionCensus(parsed)
      const shown = census.rows.slice(0, MAX_MNEMONIC_ROWS)
      const folded = census.rows.length - shown.length
      const files = parsed.files.map(file => ({
        number: file.number,
        name: file.name,
        kind: file.kind,
        rungs: file.rungs.length,
        instructions: countInstructions(file),
        branches: countBranches(file),
      }))
      return {
        summary: `${census.totalInstructions} instruction(s) in ${census.distinct} distinct mnemonic(s) across ${files.length} program file(s); ${census.unknown.length} unknown mnemonic(s) and ${census.branchTotal} branch token(s).${folded > 0 ? ` ${folded} more mnemonic row(s) were folded into the totals.` : ''}`,
        data: {
          path: displayPath,
          totals: {
            rungs: files.reduce((total, file) => total + file.rungs, 0),
            instructions: census.totalInstructions,
            distinctMnemonics: census.distinct,
            knownMnemonics: census.distinct - census.unknown.length,
            unknownMnemonics: census.unknown.length,
            branchTokens: census.branchTotal,
            branchTokenKinds: [...BRANCH_TOKENS],
          },
          files,
          mnemonics: shown,
          foldedMnemonics: folded,
          unknown: census.unknown,
        },
        next: [
          { tool: 'plc5_indirect_census', why: 'Pull the operands that need a decision before converting the instructions.' },
          { tool: 'plc5_rung_digest', why: 'Find the heavy program files behind the instruction count.' },
          { tool: 'plc5_docs', why: 'Look up a mnemonic family and its neutral text form.' },
        ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  const digestTool = define(
    'plc5_rung_digest',
    'Summarise the shape of each program file in one .PC5 text export: rung count, instruction count, instructions per rung, branch token count, first and last rung number, numbered gaps, duplicate rung numbers and the longest rung. Deterministic and bounded; read-only and offline. Use it to find a "small" file with hundreds of rungs or a file that is mostly branches.',
    PATH_PARAMETERS,
    async (args, exec) => {
      const { displayPath, parsed } = await loadExport(fs, stringArg(args, 'path', 'C:\\\\exports\\\\line3.pc5'), exec)
      const files = parsed.files.map(file => {
        const numbers = file.rungs.map(rung => rung.number).sort((left, right) => left - right)
        const unique = new Set(numbers)
        const firstRung = numbers.length === 0 ? null : numbers[0]
        const lastRung = numbers.length === 0 ? null : numbers[numbers.length - 1]
        const gaps = firstRung === null || lastRung === null ? 0 : lastRung - firstRung + 1 - unique.size
        let longest = { number: null as number | null, instructions: 0 }
        let previous = -1
        let backwards = 0
        for (const rung of file.rungs) {
          if (rung.number < previous) backwards += 1
          previous = rung.number
          if (rung.instructions.length > longest.instructions) {
            longest = { number: rung.number, instructions: rung.instructions.length }
          }
        }
        const seen = new Set<number>()
        let duplicates = 0
        for (const number of numbers) {
          if (seen.has(number)) duplicates += 1
          seen.add(number)
        }
        const instructionTotal = countInstructions(file)
        return {
          number: file.number,
          name: file.name,
          kind: file.kind,
          line: file.line,
          rungs: file.rungs.length,
          instructions: instructionTotal,
          instructionsPerRung: file.rungs.length === 0 ? 0 : Math.round((instructionTotal / file.rungs.length) * 100) / 100,
          branchTokens: countBranches(file),
          emptyRungs: file.rungs.filter(rung => rung.text === '').length,
          duplicateRungNumbers: duplicates,
          rungNumbersBackwards: backwards,
          firstRung,
          lastRung,
          gaps,
          longestRung: longest.number === null ? null : longest,
        }
      })
      const rungTotal = files.reduce((total, file) => total + file.rungs, 0)
      return {
        summary: `${rungTotal} rung(s) across ${files.length} program file(s); ${files.filter(file => file.gaps > 0).length} file(s) with numbered gaps and ${files.filter(file => file.branchTokens > 0).length} file(s) with branches.`,
        data: { path: displayPath, files },
        next: [
          { tool: 'plc5_verify', why: 'Confirm the rung numbering and the record structure are consistent.' },
          { tool: 'plc5_indirect_census', why: 'List the operands in the heavy files that need a decision.' },
          { tool: 'plc5_diff', why: 'Compare this export with the previous one after an edit.' },
        ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  const indirectTool = define(
    'plc5_indirect_census',
    'List every operand in one .PC5 text export that is not a plain address: bracket indirect addressing (N7:[N10:0]), leading-# file operands, and ? placeholders. Each site carries its program file, rung number, instruction and operand text. Deterministic, bounded, read-only and offline. An indirect site is a decision that must be recorded, never silently ignored.',
    PATH_PARAMETERS,
    async (args, exec) => {
      const { displayPath, parsed } = await loadExport(fs, stringArg(args, 'path', 'C:\\\\exports\\\\line3.pc5'), exec)
      const census = indirectSitesOf(parsed)
      const shown = census.sites.slice(0, MAX_SITES)
      const folded = census.sites.length - shown.length
      return {
        summary: census.sites.length === 0
          ? `No indirect or placeholder operand in the export: ${census.rungs} of the rungs were scanned.`
          : `${census.sites.length} indirect/placeholder site(s) across ${census.rungs} rung(s): ${census.counts.bracket} bracket, ${census.counts.fileIndirect} file-indirect, ${census.counts.placeholder} placeholder.${folded > 0 ? ` ${folded} site(s) were folded into the totals.` : ''}`,
        data: {
          path: displayPath,
          totals: {
            sites: census.sites.length,
            rungs: census.rungs,
            bracket: census.counts.bracket,
            fileIndirect: census.counts.fileIndirect,
            placeholder: census.counts.placeholder,
          },
          sites: shown,
          foldedSites: folded,
        },
        next: [
          { tool: 'plc5_verify', why: 'Treat unknown mnemonics and ? operands as unresolved in the consistency verdict.' },
          { tool: 'plc5_docs', why: 'Read what each indirect form means and how to record the conversion decision.' },
          { tool: 'plc5_diff', why: 'Prove an edit changed exactly the operands it was meant to change.' },
        ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  const verifyTool = define(
    'plc5_verify',
    'Run the structural checks on one .PC5 text export and return one verdict: ok, warnings, or errors. Checks cover the header and schema, the closing END and closed program files, duplicate program-file and data-file declarations, rung numbers unique and increasing, operands that reference declared data files, unknown mnemonics, ? operands, and empty program files. Deterministic, bounded, read-only and offline. The verdict is about consistency, not logic correctness.',
    PATH_PARAMETERS,
    async (args, exec) => {
      const { displayPath, parsed } = await loadExport(fs, stringArg(args, 'path', 'C:\\\\exports\\\\line3.pc5'), exec)
      const census = instructionCensus(parsed)
      const refs = dataFileReferences(parsed)
      const declared = new Set(parsed.dataFiles.map(file => `${file.type}${file.number}`))
      const undeclared = refs.filter(ref => !declared.has(`${ref.type}${ref.number}`))
      const issues = parsed.issues
      const errors = issues.filter(issue => issue.severity === 'error')
      const warnings = issues.filter(issue => issue.severity === 'warning')
      const placeholderCount = census.rows.length === 0 ? 0 : indirectSitesOf(parsed).counts.placeholder

      const programNumbers = new Set<number>()
      let duplicateProgramFiles = 0
      for (const file of parsed.files) {
        if (programNumbers.has(file.number)) duplicateProgramFiles += 1
        programNumbers.add(file.number)
      }
      const dataKeys = new Set<string>()
      let duplicateDataFiles = 0
      for (const file of parsed.dataFiles) {
        const key = `${file.type}${file.number}`
        if (dataKeys.has(key)) duplicateDataFiles += 1
        dataKeys.add(key)
      }
      const duplicateRung = issues.some(issue => issue.code === 'DUPLICATE_RUNG_NUMBER')
      const backwardsRung = issues.some(issue => issue.code === 'RUNG_NUMBER_BACKWARDS')
      const truncated = issues.some(issue => issue.code === 'TRUNCATED_EXPORT')
      const emptyProgramFiles = parsed.files.filter(file => file.rungs.length === 0).length

      type CheckStatus = 'pass' | 'warn' | 'fail'
      const checks: { id: string; title: string; status: CheckStatus; detail: string }[] = [
        {
          id: 'header',
          title: 'Header present and schema supported',
          status: 'pass',
          detail: `PC5 EXPORT ${parsed.header.exportVersion}${parsed.header.processor === null ? '' : `, processor ${parsed.header.processor}`}`,
        },
        {
          id: 'closing-end',
          title: 'END present and program files closed',
          status: truncated ? 'fail' : 'pass',
          detail: truncated ? 'The export stops before END or before a program file closes.' : `END on line ${parsed.lastRecordLine}; ${parsed.files.length} program file(s) closed.`,
        },
        {
          id: 'unique-program-files',
          title: 'No duplicate program-file numbers or data-file declarations',
          status: duplicateProgramFiles > 0 || duplicateDataFiles > 0 ? 'fail' : 'pass',
          detail: `${parsed.files.length} program file(s), ${parsed.dataFiles.length} data file declaration(s); ${duplicateProgramFiles} duplicate program number(s), ${duplicateDataFiles} duplicate data file(s).`,
        },
        {
          id: 'rung-numbering',
          title: 'Rung numbers unique and increasing per program file',
          status: duplicateRung || backwardsRung ? 'warn' : 'pass',
          detail: `${duplicateRung ? 'duplicate rung numbers; ' : ''}${backwardsRung ? 'rung numbers out of order; ' : ''}${duplicateRung || backwardsRung ? 'renumber in the exporter' : 'each file is in program order with unique numbers'}`,
        },
        {
          id: 'data-file-references',
          title: 'Operands that reference data files resolve',
          status: undeclared.length > 0 ? 'warn' : 'pass',
          detail: undeclared.length > 0
            ? `${undeclared.length} referenced data file(s) have no DATA_FILE declaration: ${undeclared.map(ref => `${ref.type}${ref.number}`).slice(0, 10).join(', ')}${undeclared.length > 10 ? ' …' : ''}`
            : refs.length === 0 || parsed.dataFiles.length === 0
              ? 'No data-file operand could be resolved against a declaration; declare the files if the ladder references them.'
              : `${refs.length} referenced data file(s) all resolve against the declaration table.`,
        },
        {
          id: 'unknown-mnemonics',
          title: 'Unknown mnemonics and ? operands are reported',
          status: census.unknown.length > 0 || placeholderCount > 0 ? 'warn' : 'pass',
          detail: `${census.unknown.length} unknown mnemonic(s), ${placeholderCount} placeholder site(s).`,
        },
        {
          id: 'empty-program-files',
          title: 'No empty program files',
          status: emptyProgramFiles > 0 ? 'warn' : 'pass',
          detail: `${parsed.files.length} program file(s); ${emptyProgramFiles} carry no rungs.`,
        },
      ]
      const verdict: 'ok' | 'warnings' | 'errors' = errors.length > 0
        ? 'errors'
        : warnings.length > 0 || checks.some(check => check.status === 'warn')
          ? 'warnings'
          : 'ok'
      const rows = issueRows(issues)
      return {
        summary: `verdict: ${verdict} — ${errors.length} error(s), ${warnings.length} warning(s) across ${checks.length} checks.${verdict === 'ok' ? ' The export is structurally consistent; that says nothing about whether the logic is right.' : ''}`,
        data: {
          path: displayPath,
          verdict,
          checks,
          errors: { total: errors.length, shown: rows.shown.filter(issue => issue.severity === 'error') },
          warnings: { total: warnings.length, shown: rows.shown.filter(issue => issue.severity === 'warning') },
          foldedIssues: parsed.issues.length - rows.shown.length + parsed.issuesOmitted,
        },
        next: [
          { tool: 'plc5_pc5', why: 'Show the parsed records and issue lines behind the verdict.' },
          { tool: 'plc5_instruction_inventory', why: 'Scope the known and unknown instruction families.' },
          { tool: 'plc5_indirect_census', why: 'List the operands a clean structure verdict does not resolve.' },
        ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  const diffTool = define(
    'plc5_diff',
    'Compare two .PC5 text exports of the same program and report the header fields that changed, program files added, removed or renamed, data-file declarations added, removed or changed, and rungs added, removed or changed keyed by program file and rung number. Deterministic and bounded: the number of reported entries is capped and the totals are reported. Read-only and offline; use it to review a hand edit or confirm a comment-only change is really comment-only.',
    {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the first (before) .PC5 text export.' },
        otherPath: { type: 'string', description: 'Path to the second (after) .PC5 text export.' },
      },
      required: ['path', 'otherPath'],
      additionalProperties: false,
    },
    async (args, exec) => {
      const firstPath = stringArg(args, 'path', 'C:\\\\exports\\\\line3.before.pc5')
      const secondPath = stringArg(args, 'otherPath', 'C:\\\\exports\\\\line3.after.pc5')
      if (firstPath === secondPath) {
        throw new TextToolError(
          'INVALID_ARGUMENT',
          'path and otherPath are the same file, so there is nothing to compare.',
          'Pass the older export as path and the newer one as otherPath.',
        )
      }
      const first = await loadExport(fs, firstPath, exec)
      const second = await loadExport(fs, secondPath, exec)
      const diff = diffExports(first.parsed, second.parsed)
      const identical =
        diff.header.length === 0 &&
        diff.programFiles.onlyInFirst.length === 0 &&
        diff.programFiles.onlyInSecond.length === 0 &&
        diff.programFiles.changed.length === 0 &&
        diff.dataFiles.onlyInFirst.length === 0 &&
        diff.dataFiles.onlyInSecond.length === 0 &&
        diff.dataFiles.changed.length === 0 &&
        diff.totals.added === 0 &&
        diff.totals.removed === 0 &&
        diff.totals.changed === 0
      const caps = <T>(items: readonly T[]): { shown: readonly T[]; folded: number } =>
        items.length <= MAX_DIFF_ENTRIES
          ? { shown: items, folded: 0 }
          : { shown: items.slice(0, MAX_DIFF_ENTRIES), folded: items.length - MAX_DIFF_ENTRIES }
      const added = caps(diff.rungs.added)
      const removed = caps(diff.rungs.removed)
      const changed = caps(diff.rungs.changed)
      return {
        summary: identical
          ? 'The two exports match: header, program files, data files and every rung text are unchanged.'
          : `Exports differ: ${diff.header.length} header field(s), ${diff.programFiles.onlyInFirst.length + diff.programFiles.onlyInSecond.length} program file(s) added/removed, ${diff.programFiles.changed.length} program file(s) changed, ${diff.dataFiles.onlyInFirst.length + diff.dataFiles.onlyInSecond.length + diff.dataFiles.changed.length} data-file change(s), ${diff.totals.added} rung(s) added, ${diff.totals.removed} removed, ${diff.totals.changed} changed.`,
        data: {
          path: first.displayPath,
          otherPath: second.displayPath,
          identical,
          header: diff.header,
          programFiles: {
            onlyInFirst: caps(diff.programFiles.onlyInFirst),
            onlyInSecond: caps(diff.programFiles.onlyInSecond),
            changed: caps(diff.programFiles.changed),
          },
          dataFiles: {
            onlyInFirst: caps(diff.dataFiles.onlyInFirst),
            onlyInSecond: caps(diff.dataFiles.onlyInSecond),
            changed: caps(diff.dataFiles.changed),
          },
          rungs: {
            added,
            removed,
            changed,
            totals: diff.totals,
          },
        },
        next: identical
          ? [{ tool: 'plc5_verify', why: 'Confirm both exports are structurally consistent before treating the match as evidence.' }]
          : [
              { tool: 'plc5_verify', why: 'Confirm the newer export is well-formed before trusting the change list.' },
              { tool: 'plc5_indirect_census', why: 'Check whether an operand edit introduced or removed an indirect site.' },
            ],
        coverage: TEXT_COVERAGE,
      }
    },
  )

  return [structureTool, verifyTool, inventoryTool, digestTool, indirectTool, diffTool]
}
