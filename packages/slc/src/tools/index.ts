/**
 * The ten read-only `slc500_` tools.
 *
 * Every tool is offline: it reads a file the operator points at (a text export,
 * a documentation export, or a redacted automation transcript) and never writes,
 * starts a vendor application, or reaches the network. The one boundary that
 * would need the vendor application — the automation server — is proved by a
 * transcript fixture, so a missing transcript reports `NOT_LICENSED` /
 * `SOURCE_NOT_INSTALLED` instead of a guessed answer.
 *
 * @module dsh-engineering-slc/tools
 */

import {
  AUTOMATION_TRANSCRIPT_ENV,
  automationServerRegistered,
  parseAutomationTranscript,
  powershell32Path,
  SlcAutomationError,
  type AutomationSnapshot,
} from '../engine/automation.ts'
import { censusIo, censusLines } from '../engine/census.ts'
import { databaseFormatName, parseDatabaseExport, SlcDatabaseError } from '../engine/database.ts'
import {
  dataFileByName,
  decodeSlcText,
  logicRungs,
  parseSlcText,
  programFileByName,
  SlcTextError,
  totalRungs,
  type SlcProject,
} from '../engine/slc-text.ts'
import { jsonText, type FsService, type PluginContext, type ToolDefinition, type ToolExec } from '../core/tool.ts'

/** The largest file the reader will open. */
const MAX_BYTES = 64 * 1024 * 1024

/** The row cap for a search answer. */
const MAX_ROWS = 200

/** The status-word addresses the processor tool names, with no bit meanings. */
const STATUS_WORDS = ['S:1', 'S:2', 'S:3', 'S:5', 'S:13', 'S:24'] as const

/** A tool failure with the fix a caller can act on. */
class SlcToolError extends Error {
  readonly code: string
  readonly fix: string
  readonly candidates: string[] | undefined

  constructor(code: string, message: string, fix: string, candidates?: string[]) {
    super(message)
    this.name = 'SlcToolError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

function failure(error: unknown): Record<string, unknown> {
  if (error instanceof SlcToolError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, ...(error.candidates === undefined ? {} : { candidates: error.candidates }) } }
  }
  if (error instanceof SlcTextError) {
    return { error: { code: error.code, message: error.message, fix: error.fix } }
  }
  if (error instanceof SlcDatabaseError) {
    return { error: { code: error.code, message: error.message, fix: error.fix } }
  }
  if (error instanceof SlcAutomationError) {
    return { error: { code: error.code, message: error.message, fix: error.fix } }
  }
  const message = error instanceof Error ? error.message : String(error)
  return { error: { code: 'INTERNAL', message, fix: 'Report the file and the call shape; the reader did not name a specific failure.' } }
}

function stringArg(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function requiredStringArg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = stringArg(args, name)
  if (value === undefined) throw new SlcToolError('ARGUMENT_REQUIRED', `The "${name}" argument is required.`, `Pass a ${name === 'path' ? 'file path' : 'query string'} for this call.`)
  return value
}

function numberArg(args: Readonly<Record<string, unknown>>, name: string, fallback: number): number {
  const value = args[name]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) return Number(value)
  return fallback
}

function extensionOf(path: string): string {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? path
  const dot = name.lastIndexOf('.')
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase()
}

function fileError(error: unknown, path: string): SlcToolError {
  const code = (error as { code?: unknown })?.code
  if (code === 'ENOENT' || code === 'ENOTDIR') {
    return new SlcToolError('FILE_MISSING', `The file ${path} does not exist or cannot be reached.`, 'Pass the path to an existing text export, .SLC export, or documentation export; the answer names the read path it used.')
  }
  if (code === 'EACCES' || code === 'EPERM') {
    return new SlcToolError('ACCESS_DENIED', `The file ${path} cannot be read by this process.`, 'Grant the session read access to the file (it is read-only; nothing is written), or copy it to a folder the session can read.')
  }
  return new SlcToolError('FILE_UNREADABLE', `The file ${path} could not be read: ${error instanceof Error ? error.message : String(error)}.`, 'Confirm the path is a regular file, not a folder or an unreachable share.')
}

async function readText(fs: FsService, path: string, exec: ToolExec): Promise<{ text: string; displayPath: string }> {
  let target
  try {
    target = await fs.resolve(path, { signal: exec.signal, cwd: exec.cwd })
  } catch (error) {
    throw fileError(error, path)
  }
  let stat
  try {
    stat = await fs.stat(target, exec.signal)
  } catch (error) {
    throw fileError(error, path)
  }
  if (stat === undefined) throw new SlcToolError('FILE_MISSING', `The file ${path} does not exist or cannot be reached.`, 'Pass the path to an existing text export, .SLC export, or documentation export.')
  if (stat.type !== 'file') throw new SlcToolError('NOT_A_FILE', `${path} is a ${stat.type}, not a file.`, 'Pass a file path, not a folder.')
  let bytes: Uint8Array
  try {
    bytes = await fs.readBytes(target, exec.signal, MAX_BYTES)
  } catch (error) {
    throw fileError(error, path)
  }
  return { text: new TextDecoder('utf-8', { fatal: false }).decode(bytes), displayPath: target.displayPath || path }
}

/** A project loaded from either read path, with the path that produced it. */
interface LoadedProject {
  project: SlcProject
  source: 'text' | 'automation'
  warnings: string[]
  snapshot: AutomationSnapshot | undefined
  displayPath: string
}

function projectFromSnapshot(snapshot: AutomationSnapshot, displayPath: string): SlcProject {
  return {
    path: displayPath,
    name: snapshot.projectName !== '' ? snapshot.projectName : displayPath.replaceAll('\\', '/').split('/').pop()?.replace(/\.rss$/iu, '') ?? displayPath,
    processor: { ...snapshot.processor },
    files: snapshot.files.map(file => ({
      name: file.name,
      declaredRungs: file.declaredRungs,
      rungs: file.rungs.map(rung => ({ file: file.name, rung: rung.rung, text: rung.text })),
    })),
    dataFiles: snapshot.dataFiles.map(file => ({
      name: file.name,
      typeLetter: file.typeLetter,
      values: new Map(Object.entries(file.values).map(([key, value]) => [Number(key), value])),
    })),
    symbols: snapshot.symbols.map(symbol => ({ ...symbol })),
    ioModules: snapshot.ioModules.map(module => ({ ...module })),
    warnings: [],
  }
}

function transcriptPath(): string | undefined {
  const value = process.env[AUTOMATION_TRANSCRIPT_ENV]
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

async function loadSnapshot(fs: FsService, exec: ToolExec): Promise<{ snapshot: AutomationSnapshot; displayPath: string } | undefined> {
  const path = transcriptPath()
  if (path === undefined) return undefined
  let read: { text: string; displayPath: string }
  try {
    read = await readText(fs, path, exec)
  } catch (error) {
    if (error instanceof SlcToolError && (error.code === 'FILE_MISSING' || error.code === 'NOT_A_FILE')) return undefined
    throw error
  }
  return { snapshot: parseAutomationTranscript(read.text, read.displayPath), displayPath: read.displayPath }
}

/** Load a project from whichever read path the file extension selects. */
async function loadProject(fs: FsService, path: string, exec: ToolExec): Promise<LoadedProject> {
  const extension = extensionOf(path)
  if (extension === 'slc') {
    const read = await readText(fs, path, exec)
    const text = read.text.replace(/^\uFEFF/u, '')
    const project = parseSlcText(decodeSlcText(new TextEncoder().encode(text)), read.displayPath)
    return { project, source: 'text', warnings: project.warnings, snapshot: undefined, displayPath: read.displayPath }
  }
  if (extension === 'rss') {
    const loaded = await loadSnapshot(fs, exec)
    if (loaded === undefined) {
      if (automationServerRegistered()) {
        throw new SlcToolError(
          'NOT_LICENSED',
          'The RSLogix 500 automation class is registered, but no transcript proves this session may use it and the edition is not recorded on this host, so reading the .RSS project was not attempted.',
          'Export the project as a text export (File > Save As) or a documentation export from RSLogix 500 and open that file; or record a redacted automation transcript (the JSON shape is documented in the SLC knowledge collection) and set SLC500_AUTOMATION_TRANSCRIPT for a licensed Professional/Developer edition.',
        )
      }
      throw new SlcToolError(
        'SOURCE_NOT_INSTALLED',
        'Reading a .RSS project needs the RSLogix 500 automation server, and this machine does not have the RSLogix 500 application class registered.',
        'Export the project from RSLogix 500 as a text export (File > Save As) or a documentation export and open that file; the text reader needs no vendor install.',
      )
    }
    return { project: projectFromSnapshot(loaded.snapshot, loaded.displayPath), source: 'automation', warnings: [], snapshot: loaded.snapshot, displayPath: loaded.displayPath }
  }
  if (extension === 'ach' || extension === 'apa') {
    throw new SlcToolError('UNSUPPORTED_FILE', `${path} is an APS-era .ACH project, which RSLogix 500 opens only as a legacy conversion and this reader does not parse.`, 'Open the .ACH in RSLogix 500 and re-save it as an .RSS project or a text export, then pass that file. Parsing the APS/DOS-era format would be a guess and is out of scope.')
  }
  if (extension === 'rs1') {
    throw new SlcToolError('UNSUPPORTED_FILE', `${path} is an .RS1 archive wrapper; the archive and the project formats inside it are not documented, so the reader does not parse it.`, 'Open the archive in RSLogix 500 and export the project as a text export or documentation export, then pass that file.')
  }
  if (['eas', 'erp', 'eic', 'esg', 'csv', 'ctd', 'txt'].includes(extension)) {
    throw new SlcToolError('USE_DATABASE_TOOL', `${path} is a documentation or report export, not a project export.`, 'Call slc500_database with this path; it parses the documentation export field by field.')
  }
  throw new SlcToolError('FILE_UNSUPPORTED', `The reader does not know the .${extension === '' ? '(no extension)' : extension} format of ${path}.`, 'Pass a text export, an .SLC export, a documentation export, or a .RSS project (with a local transcript or the installed automation server).')
}

/** Compare two read paths for the dual-source conflict rule. */
function compareSources(left: SlcProject, right: SlcProject): { fields: Array<{ field: string; primary: string; secondary: string }> } {
  const fields: Array<{ field: string; primary: string; secondary: string }> = []
  const check = (field: string, primary: string, secondary: string): void => {
    if (primary !== secondary) fields.push({ field, primary, secondary })
  }
  check('project name', left.name, right.name)
  check('processor type', left.processor.type, right.processor.type)
  check('program file count', String(left.files.length), String(right.files.length))
  check('total rung count', String(totalRungs(left)), String(totalRungs(right)))
  check('symbol count', String(left.symbols.length), String(right.symbols.length))
  check('data file count', String(left.dataFiles.length), String(right.dataFiles.length))
  return { fields }
}

function projectInventory(project: SlcProject): Record<string, unknown> {
  return {
    name: project.name,
    processor: {
      type: project.processor.type,
      family: project.processor.family,
      series: project.processor.series,
      firmware: project.processor.firmware,
      memory_words: project.processor.memoryWords ?? null,
    },
    files: project.files.map(file => ({ name: file.name, rungs: file.declaredRungs > 0 ? file.declaredRungs : file.rungs.length, logic_rungs: logicRungs(file).length })),
    data_files: project.dataFiles.map(file => ({ name: file.name, type_letter: file.typeLetter, declared_elements: file.values.get(-1) === undefined ? null : Number(file.values.get(-1)), values: file.values.size - (file.values.has(-1) ? 1 : 0) })),
    symbols: project.symbols.length,
    io_modules: project.ioModules.length,
    total_rungs: totalRungs(project),
  }
}

function coverage(unverified: string[] = []): { complete: boolean; unverified: string[] } {
  return { complete: unverified.length === 0, unverified }
}

/** Build the tool definitions for the host registry. */
export function slc500Tools(fs: FsService, _sandboxPolicy?: unknown): ToolDefinition[] {
  const definitions: ToolDefinition[] = []

  definitions.push({
    name: 'slc500_capabilities',
    description: 'Probe this machine for the RSLogix 500 read paths: installed application, installed help trees, the automation class registration, the 32-bit PowerShell, and the offline text parser. Read-only; no project is opened and no vendor application is started.',
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(_args, exec) {
      try {
        const roots = ['C:\\Program Files (x86)\\Rockwell Software\\RSLogix 500 English', 'C:\\Program Files\\Rockwell Software\\RSLogix 500 English']
        const installs: Array<{ root: string; present: boolean; help: Record<string, boolean> }> = []
        for (const root of roots) {
          let present = false
          const help: Record<string, boolean> = {}
          try {
            const target = await fs.resolve(root, { signal: exec.signal, cwd: exec.cwd })
            const stat = await fs.stat(target, exec.signal)
            present = stat !== undefined
            for (const tree of ['Help\\RSLX500', 'Help\\SLCINST', 'Help\\MICROINSET', 'Help\\RSMicro']) {
              try {
                const helpTarget = await fs.resolve(`${root}\\${tree}`, { signal: exec.signal, cwd: exec.cwd })
                const helpStat = await fs.stat(helpTarget, exec.signal)
                help[tree.replace('Help\\', '')] = helpStat !== undefined
              } catch {
                help[tree.replace('Help\\', '')] = false
              }
            }
          } catch {
            present = false
          }
          installs.push({ root, present, help })
        }
        const installed = installs.find(install => install.present) ?? null
        const registered = automationServerRegistered()
        const snapshot = transcriptPath()
        return {
          summary: installed === null
            ? 'RSLogix 500 is not installed here. The offline reader (text export, .SLC export, documentation export) works without it; reading a .RSS project needs a transcript.'
            : `RSLogix 500 is installed at ${installed.root}. The offline reader works without it; reading a .RSS project needs a local transcript and a Professional/Developer edition.`,
          data: {
            installed_root: installed?.root ?? null,
            installs,
            help_trees: installed?.help ?? {},
            automation: {
              class_registered: registered,
              transcript: snapshot ?? null,
              edition: 'not recorded in the registry (blank serial); Professional or Developer needed for the automation server',
              powershell_32: powershell32Path(),
            },
            read_paths: {
              text_export: true,
              slc_export: true,
              documentation_export: true,
              rss_automation: registered,
              ach: 'detect and refuse',
              rs1: 'refuse',
            },
            status_words: [...STATUS_WORDS],
          },
          next: [
            { tool: 'slc500_open', args: { path: '<project.slc>' }, why: 'open a text export and inventory it before any deeper read.' },
            { tool: 'slc500_docs', args: { action: 'search', query: 'addressing' }, why: 'look up the data-file and addressing rules before explaining an address.' },
          ],
          coverage: coverage(installed === null ? ['the vendor application is not installed, so no .RSS project can be read on this machine'] : registered ? [] : ['the automation class is not registered, so .RSS reads are not available']),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_open',
    description: 'Open a project export and report its identity and inventory: project name, processor type/family/series/firmware, program files with rung counts, data files, symbol count and I/O modules. Reads a text export or an .SLC export offline; a .RSS project needs the RSLogix 500 automation server plus a local transcript, and an .ACH/.RS1 is refused by name. Read-only: nothing is written.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export, .SLC export, or .RSS project.' },
        export: { type: 'string', description: 'Optional path to a text export to compare against the project (dual-source conflict check).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const loaded = await loadProject(fs, path, exec)
        const data: Record<string, unknown> = {
          source: loaded.source,
          project: projectInventory(loaded.project),
          warnings: loaded.warnings,
        }
        const exportPath = stringArg(args, 'export')
        if (exportPath !== undefined) {
          const exported = await loadProject(fs, exportPath, exec)
          const comparison = compareSources(loaded.project, exported.project)
          data.dual_source = { source: loaded.source, export: exported.source, conflicts: comparison.fields }
          if (comparison.fields.length > 0) {
            data.conflict_summary = `${comparison.fields.length} field(s) disagree between the two read paths; both values are named and neither is preferred.`
          }
        }
        return {
          summary: `${loaded.project.name}: ${loaded.project.files.length} program file(s), ${totalRungs(loaded.project)} rung(s), ${loaded.project.symbols.length} symbol(s), via ${loaded.source === 'automation' ? 'the automation transcript' : 'the text export'}.`,
          data,
          next: [
            { tool: 'slc500_ladder', args: { path, file: loaded.project.files[0]?.name ?? 'LAD 2' }, why: 'read the ladder in neutral text.' },
            { tool: 'slc500_io_census', args: { path }, why: 'census the I/O addresses the ladder references.' },
            { tool: 'slc500_processor', args: { path }, why: 'name the processor and the status words.' },
          ],
          coverage: coverage(loaded.warnings),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_ladder',
    description: 'Read neutral-text ladder from one program file, with the rung text exactly as the export reports it. The terminal END rung is not counted as logic. Read-only and offline.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export or .SLC export.' },
        file: { type: 'string', description: 'Program file name, such as "LAD 2". Defaults to the first program file.' },
        start: { type: 'number', description: 'First rung number to return (default 0).' },
        limit: { type: 'number', description: 'Maximum rungs to return (1-200, default 20).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const loaded = await loadProject(fs, path, exec)
        const fileArg = stringArg(args, 'file')
        const file = fileArg === undefined ? loaded.project.files[0] : programFileByName(loaded.project, fileArg)
        if (loaded.project.files.length === 0) throw new SlcToolError('NO_LADDER', `${loaded.project.name} carries no ladder sections.`, 'Open a text export that includes the ladder (the .SLC export does); a documentation-only export has no rungs.')
        if (file === undefined) throw new SlcToolError('PROGRAM_FILE_NOT_FOUND', `The project has no program file named "${fileArg}".`, `Pass one of: ${loaded.project.files.map(entry => entry.name).join(', ')}.`, loaded.project.files.map(entry => entry.name))
        const start = Math.max(0, Math.trunc(numberArg(args, 'start', 0)))
        const limit = Math.min(200, Math.max(1, Math.trunc(numberArg(args, 'limit', 20))))
        const rungs = logicRungs(file).filter(rung => rung.rung >= start).slice(0, limit)
        return {
          summary: `${file.name}: ${rungs.length} rung(s) from rung ${start}; the file declares ${file.declaredRungs > 0 ? file.declaredRungs : file.rungs.length} rung(s) and ${logicRungs(file).length} count as logic.`,
          data: {
            path: loaded.displayPath,
            source: loaded.source,
            file: file.name,
            declared_rungs: file.declaredRungs,
            logic_rungs: logicRungs(file).length,
            start,
            rungs: rungs.map(rung => ({ rung: rung.rung, text: rung.text })),
            note: 'Rung text is reproduced exactly as the export reports it; the terminal END is not logic.',
          },
          next: [
            { tool: 'slc500_find', args: { path, query: '<symbol or address>' }, why: 'find the symbol or address the rung references.' },
            { tool: 'slc500_docs', args: { action: 'search', query: 'ladder instructions' }, why: 'look up what an instruction does before explaining the rung.' },
          ],
          coverage: coverage(loaded.warnings),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_find',
    description: 'Search one project for a tag, address, description, mnemonic or rung text. Scopes: symbols, data, ladder, all. Returns addresses with symbols and descriptions, matching data-file elements, and matching rungs. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export or .SLC export.' },
        query: { type: 'string', description: 'Tag, address, description fragment, instruction mnemonic, or rung text to find.' },
        scope: { type: 'string', enum: ['symbols', 'data', 'ladder', 'all'], description: 'Where to search (default all).' },
        limit: { type: 'number', description: 'Maximum rows returned (1-200, default 50).' },
      },
      required: ['path', 'query'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const query = requiredStringArg(args, 'query')
        const scope = stringArg(args, 'scope') ?? 'all'
        const limit = Math.min(MAX_ROWS, Math.max(1, Math.trunc(numberArg(args, 'limit', 50))))
        const loaded = await loadProject(fs, path, exec)
        const needle = query.toLowerCase()
        const symbols = loaded.project.symbols
          .filter(symbol => symbol.address.toLowerCase().includes(needle) || symbol.symbol.toLowerCase().includes(needle) || symbol.description.toLowerCase().includes(needle))
          .slice(0, limit)
          .map(symbol => ({ ...symbol }))
        const data: Array<{ file: string; elements: number; sample: string[] }> = []
        if (scope === 'data' || scope === 'all') {
          for (const file of loaded.project.dataFiles) {
            const hits = [...file.values.entries()].filter(([element, value]) => element >= 0 && (value.toLowerCase().includes(needle) || file.name.toLowerCase().includes(needle)))
            if (hits.length > 0 || file.name.toLowerCase().includes(needle)) {
              data.push({ file: file.name, elements: hits.length, sample: hits.slice(0, 5).map(([element, value]) => `${file.name}:${element} = ${value}`) })
            }
          }
        }
        const ladder: Array<{ file: string; rung: number; text: string }> = []
        if (scope === 'ladder' || scope === 'all') {
          for (const file of loaded.project.files) {
            for (const rung of logicRungs(file)) {
              if (rung.text.toLowerCase().includes(needle)) ladder.push({ file: file.name, rung: rung.rung, text: rung.text })
              if (ladder.length >= limit) break
            }
          }
        }
        const total = symbols.length + data.length + ladder.length
        return {
          summary: total === 0
            ? `No symbol, data-file value or rung contains "${query}" in ${loaded.project.name}; the search covered ${loaded.project.symbols.length} symbol(s) and ${loaded.project.files.length} program file(s).`
            : `${total} match(es) for "${query}" in ${loaded.project.name}.`,
          data: { query, scope, source: loaded.source, total, symbols, data, ladder: ladder.slice(0, limit), note: 'Matches are reported, not interpreted; slc500_docs explains an instruction or address form.' },
          next: [
            { tool: 'slc500_docs', args: { action: 'lookup', term: query }, why: 'resolve an exact identifier or mnemonic to the authored page.' },
            { tool: 'slc500_ladder', args: { path, file: ladder[0]?.file ?? loaded.project.files[0]?.name ?? 'LAD 2' }, why: 'read around the matching rung.' },
          ],
          coverage: coverage(loaded.warnings),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_io_census',
    description: 'Census the I/O addresses the ladder references: input and output slots (I:1/0, O:0/5, I:1.0/3, word-only forms), the words and bits each slot references, the highest bit, and the reference count. A slot is reported as referenced; no module type is inferred from an address. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export or .SLC export.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const loaded = await loadProject(fs, path, exec)
        const census = censusIo(loaded.project)
        return {
          summary: census.cells.length === 0
            ? `${loaded.project.name}: the ladder references no I/O address in the documented forms (I:slot/bit, O:slot/bit, I:slot.word/bit, or a word-only form).`
            : `${loaded.project.name}: ${census.cells.length} I/O slot(s) referenced, ${census.references.length} address reference(s).`,
          data: {
            source: loaded.source,
            cells: census.cells.map(cell => ({
              address_form: `${cell.kind}:${cell.slot}`,
              kind: cell.kind,
              slot: cell.slot,
              words: cell.words,
              bits: cell.bits,
              highest_bit: cell.highestBit ?? null,
              references: cell.references,
              first_reference: cell.firstReference ?? null,
            })),
            lines: censusLines(census),
            unparsed: census.unparsed,
            note: 'The census reports references in the ladder; it does not prove the slot is configured or that a module is present.',
          },
          next: [
            { tool: 'slc500_io_config', args: { path }, why: 'read the configured chassis and modules when the read path carries them.' },
            { tool: 'slc500_docs', args: { action: 'search', query: 'I/O addressing slot' }, why: 'look up the slot/addressing rule before explaining the count.' },
          ],
          coverage: coverage([...loaded.warnings, ...(census.unparsed.length > 0 ? [`${census.unparsed.length} address-like token(s) did not parse and were not counted: ${census.unparsed.join(', ')}`] : [])]),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_io_config',
    description: 'Read the processor chassis and I/O modules as RSLogix 500 holds them (slot and module identity). The text export does not carry module types, so the answer states that limitation instead of inventing point-card part numbers. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export, .SLC export, or .RSS project read through a transcript.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const loaded = await loadProject(fs, path, exec)
        const hasConfig = loaded.project.ioModules.length > 0
        return {
          summary: hasConfig
            ? `${loaded.project.name}: ${loaded.project.ioModules.length} I/O module row(s) in the project.`
            : `${loaded.project.name}: the ${loaded.source === 'automation' ? 'transcript' : 'text export'} carries no I/O module rows, so the module identities are not answerable from this file.`,
          data: {
            source: loaded.source,
            rows: loaded.project.ioModules.map(module => ({ slot: module.slot, module: module.module })),
            limitation: hasConfig ? null : 'The documented text export carries I/O addresses, not the module identity or the point-card part number; report the slot as referenced and send the operator to RSLogix 500 for the module type rather than inventing one.',
          },
          next: [
            { tool: 'slc500_io_census', args: { path }, why: 'census the addresses the ladder uses in those slots.' },
            { tool: 'slc500_docs', args: { action: 'search', query: 'I/O configuration' }, why: 'look up what the configured module family supports.' },
          ],
          coverage: coverage(hasConfig ? [] : ['module identity is not carried by the text export; only the ladder addresses are proved']),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_data_read',
    description: 'Read one data file: its type letter, the element count the export declares, and the element values the export carries. Never invents a value the export does not carry; the answer states the limitation. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export or .SLC export.' },
        file: { type: 'string', description: 'Data file name, such as N7, F8, B3, T4, C5, S2, I1, O0.' },
        element: { type: 'number', description: 'First element to show (default 0).' },
        count: { type: 'number', description: 'Maximum elements to show (1-200, default 20).' },
      },
      required: ['path', 'file'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const fileArg = requiredStringArg(args, 'file')
        const loaded = await loadProject(fs, path, exec)
        const file = dataFileByName(loaded.project, fileArg)
        if (file === undefined) {
          const names = loaded.project.dataFiles.map(entry => entry.name)
          throw new SlcToolError('DATA_FILE_NOT_FOUND', `The project has no data file named "${fileArg}".`, names.length === 0 ? 'The export carries no [DATA] sections; a text export saved without data values still answers the census and the ladder.' : `Pass one of: ${names.join(', ')}.`, names)
        }
        const first = Math.max(0, Math.trunc(numberArg(args, 'element', 0)))
        const count = Math.min(200, Math.max(1, Math.trunc(numberArg(args, 'count', 20))))
        const declared = file.values.get(-1)
        const elements = [...file.values.entries()].filter(([element]) => element >= first).sort(([left], [right]) => left - right).slice(0, count)
        return {
          summary: `${file.name} (${file.typeLetter} file): ${declared === undefined ? `${file.values.size} element(s) carried` : `${declared} element(s) declared, ${file.values.size - 1} carried`}; showing ${elements.length} from element ${first}.`,
          data: {
            file: file.name,
            type_letter: file.typeLetter,
            declared_elements: declared === undefined ? null : Number(declared),
            elements: elements.map(([element, value]) => ({ element, value })),
            note: 'Values are reproduced from the export; a missing value means the export did not carry it, not that the value is zero.',
          },
          next: [
            { tool: 'slc500_find', args: { path, query: file.name, scope: 'data' }, why: 'find the symbols and rungs that reference this file.' },
            { tool: 'slc500_docs', args: { action: 'search', query: `${file.typeLetter} data file` }, why: 'look up the data-file type and its element rules.' },
          ],
          coverage: coverage(loaded.warnings),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_processor',
    description: 'Name the processor (type, family, series, firmware, memory) and report the status-file addresses this reader can point at. Bit meanings are looked up in the authored corpus, not hard-coded here. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the project text export, .SLC export, or .RSS project read through a transcript.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const loaded = await loadProject(fs, path, exec)
        const status = loaded.snapshot?.statusWords ?? {}
        const hasStatus = Object.keys(status).length > 0
        return {
          summary: `${loaded.project.name}: ${loaded.project.processor.type || 'processor type not recorded'}${loaded.project.processor.firmware === '' ? '' : `, firmware ${loaded.project.processor.firmware}`}; ${hasStatus ? `${Object.keys(status).length} status word(s) carried by the transcript` : 'status-file values are not carried by this text export'}.`,
          data: {
            source: loaded.source,
            processor: {
              type: loaded.project.processor.type,
              family: loaded.project.processor.family,
              series: loaded.project.processor.series,
              firmware: loaded.project.processor.firmware,
              memory_words: loaded.project.processor.memoryWords ?? null,
            },
            status_words: status,
            status_addresses: [...STATUS_WORDS],
            note: hasStatus ? 'Status values are reproduced from the transcript; bit meanings come from slc500_docs.' : 'A text export carries the processor identity, not the status-file values; open a transcript-capable read path or read the values in RSLogix 500 before interpreting a fault.',
          },
          next: [
            { tool: 'slc500_docs', args: { action: 'search', query: 'processor status S:1 S:2 S:3' }, why: 'look up the status-word meaning before explaining a fault.' },
            { tool: 'slc500_database', args: { path }, why: 'read symbol and comment documentation for the faulted addresses.' },
          ],
          coverage: coverage(hasStatus ? [] : ['status-file values are not carried by the text export']),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  definitions.push({
    name: 'slc500_database',
    description: 'Parse an RSLogix 500 documentation export (.EAS/.ERP/.EIC/.ESG/.CSV): one row per documented address with symbol, description and scope, field by field. This is the offline documentation path that works with no vendor install and does not lose the 15-character symbol truncation the .SLC export has. Read-only.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the documentation export.' },
        query: { type: 'string', description: 'Optional text filter over address, symbol, description and scope.' },
        limit: { type: 'number', description: 'Maximum rows returned (1-200, default 100).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = requiredStringArg(args, 'path')
        const query = stringArg(args, 'query')
        const limit = Math.min(MAX_ROWS, Math.max(1, Math.trunc(numberArg(args, 'limit', 100))))
        const read = await readText(fs, path, exec)
        const parsed = parseDatabaseExport(read.text, read.displayPath)
        const needle = query?.toLowerCase()
        const rows = parsed.rows.filter(row => needle === undefined || row.address.toLowerCase().includes(needle) || row.symbol.toLowerCase().includes(needle) || row.description.toLowerCase().includes(needle) || row.scope.toLowerCase().includes(needle))
        return {
          summary: `${parsed.path}: ${parsed.rows.length} documented row(s), ${rows.length} shown${needle === undefined ? '' : ` for "${query}"`} (${databaseFormatName(parsed.format)}; ${parsed.layout} column layout).`,
          data: {
            format: parsed.format,
            layout: parsed.layout,
            columns: parsed.header,
            total: parsed.rows.length,
            rows: rows.slice(0, limit),
            warnings: parsed.warnings,
            note: 'A documentation export documents addresses; it does not prove the ladder uses them. Cross-check with slc500_find.',
          },
          next: [
            { tool: 'slc500_find', args: { path: '<project.slc>', query: rows[0]?.symbol || rows[0]?.address || '<symbol>' }, why: 'find where the exported tag is used in the ladder.' },
            { tool: 'slc500_docs', args: { action: 'search', query: 'documentation export fields' }, why: 'look up what each documentation export field means.' },
          ],
          coverage: coverage(parsed.warnings),
        }
      } catch (error) {
        return failure(error)
      }
    },
  })

  return definitions
}

/** Register the ten tools on a plugin context. */
export function registerSlc500Tools(ctx: PluginContext): void {
  for (const definition of slc500Tools(ctx.fs, ctx.get?.('sandboxPolicy'))) ctx.tools.register(definition)
}
