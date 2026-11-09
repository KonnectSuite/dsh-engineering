/**
 * The RSLogix 5 (PLC-5) tools: open a `.RSP` project headlessly, read its
 * ladder in neutral text, search it, census the I/O footprint it references,
 * list the configured chassis, read the data-file table, and name the
 * processor.
 *
 * They are deliberately thin readers. Every one of them opens the project
 * hidden through the RSLogix 5 automation server and quits with the
 * do-not-save flag; none writes a file, none contacts a controller, and the
 * container reader answers from the file itself when RSLogix 5 is not on the
 * machine.
 *
 * @module dsh-engineering-plc5/tools
 */

import { existsSync, statSync } from 'node:fs'
import { spawn } from 'node:child_process'

import { readPlc5Project, Plc5Error, type Plc5Project } from './engine/rslogix5.ts'
import { parseCfbf, readContainerIdentity, CfbfError } from './engine/container.ts'
import { scanIoFootprint, coverageAgainst } from './engine/census.ts'
import { jsonText, type FsService, type SandboxPolicyResolver, type ToolDefinition, type ToolExec } from './core/tool.ts'

/** The largest file these tools will read. */
const MAX_BYTES = 64 * 1024 * 1024

/** How many rung texts one answer carries before it reports the rest as counted. */
const MAX_RUNGS = 200

/** A failure the tool reports as a code, a message and a fix. */
class Plc5ToolError extends Error {
  readonly code: string
  readonly fix: string
  readonly candidates: readonly string[]

  constructor(code: string, message: string, fix: string, candidates: readonly string[] = []) {
    super(message)
    this.name = 'Plc5ToolError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

/** The failure envelope every engineering tool returns. */
function failure(error: unknown): unknown {
  const structural = typeof error === 'object' && error !== null ? error as { code?: unknown; fix?: unknown; candidates?: unknown } : {}
  const code = typeof structural.code === 'string'
    ? structural.code
    : 'INTERNAL'
  const message = error instanceof Error ? error.message : String(error)
  const fix = typeof structural.fix === 'string'
    ? structural.fix
    : 'Correct the path and retry; these tools read local files only.'
  const candidates = Array.isArray(structural.candidates)
    ? structural.candidates.filter((entry): entry is string => typeof entry === 'string')
    : []
  return { error: { code, message, fix, candidates } }
}

/** The coverage every answer carries: what a headless reader cannot see. */
const COVERAGE = {
  complete: false,
  unverified: [
    'the installed point cards — the project records chassis and adapters, not the cards in the slots',
    'register contents inside the packed data streams',
    'the controller state until the project is read online, which these tools never do',
  ],
}

/** Read one command-line argument as a non-empty string. */
function stringArg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Plc5ToolError('INVALID_ARGUMENT', `${name} is required and must be a file path.`, `Pass ${name}, the .RSP project to read.`)
  }
  return value
}

/** The lower-case extension of a path, without the dot. */
function extensionOf(path: string): string {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** Files in the same folder whose stem matches the missing file's stem. */
async function suggestFiles(fs: FsService, path: string, exec: ToolExec): Promise<string[]> {
  if (fs.list === undefined) return []
  const normalized = path.replaceAll('\\', '/')
  const slash = normalized.lastIndexOf('/')
  if (slash <= 0) return []
  const stem = (normalized.slice(slash + 1).split('.')[0] ?? '').toLowerCase()
  if (stem === '') return []
  try {
    const folder = await fs.resolve(normalized.slice(0, slash), { cwd: exec.cwd })
    const entries = await fs.list(folder, exec.signal)
    return entries
      .filter(entry => entry.type === 'file')
      .map(entry => entry.name)
      .filter(name => (name.split('.')[0] ?? '').toLowerCase() === stem)
      .slice(0, 3)
  } catch {
    return []
  }
}

/** A FILE_MISSING failure naming the same-stem files the folder does hold. */
async function fileMissing(fs: FsService, path: string, exec: ToolExec, fix: string): Promise<Plc5ToolError> {
  const candidates = await suggestFiles(fs, path, exec)
  const hint = candidates.length === 0 ? '.' : ` — the folder holds ${candidates.join(', ')}.`
  return new Plc5ToolError('FILE_MISSING', `No file at ${path}${hint}`, fix, candidates)
}

/** Resolve a project path through the filesystem provider and prove it is an .RSP. */
async function projectPath(fs: FsService, path: string, exec: ToolExec): Promise<string> {
  const extension = extensionOf(path)
  if (extension !== 'rsp') {
    throw new Plc5ToolError(
      'NOT_AN_RSP',
      `${path} is a .${extension === '' ? 'file without an extension' : extension} file, not an .RSP project.`,
      'Pass the RSLogix 5 project file (.RSP). RSLogix 500 .RSS/.ACH files belong to the migration surface, not this one.',
    )
  }
  const target = await fs.resolve(path, { cwd: exec.cwd })
  let stat: Awaited<ReturnType<FsService['stat']>>
  try {
    stat = await fs.stat(target, exec.signal)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
    if (code === 'ENOENT') {
      throw await fileMissing(fs, path, exec, 'Pass an existing .RSP project path; this tool does not create files.')
    }
    throw error
  }
  if (stat === undefined) {
    throw await fileMissing(fs, path, exec, 'Pass an existing .RSP project path; this tool does not create files.')
  }
  if (stat.type !== 'file') {
    throw new Plc5ToolError('NOT_A_FILE', `${path} is not a file.`, 'Pass the project file itself, not the folder that holds it.')
  }
  return target.displayPath
}

/** Read the bytes of one file through the filesystem provider. */
async function readFile(fs: FsService, path: string, exec: ToolExec): Promise<Uint8Array> {
  const target = await fs.resolve(path, { cwd: exec.cwd })
  try {
    return await fs.readBytes(target, exec.signal, MAX_BYTES)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
    if (code === 'ENOENT') {
      throw await fileMissing(fs, path, exec, 'Pass an existing .RSP project path; this tool does not create files.')
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Plc5ToolError('ACCESS_DENIED', `The filesystem provider refused to read ${path}.`, 'Choose a file this chat can read, or move the project into the workspace.')
    }
    throw error
  }
}

/** Ask the registry whether the RSLogix 5 automation server is installed. */
function comRegistered(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    let child: ReturnType<typeof spawn>
    try {
      // Only the exit code is wanted, and a sandboxed host can refuse to create
      // the pipes a piped stdio would need.
      child = spawn('reg.exe', ['query', 'HKCR\\RSLogix5.Application'], { windowsHide: true, stdio: 'ignore' })
    } catch {
      resolvePromise(false)
      return
    }
    let settled = false
    const settle = (value: boolean): void => {
      if (settled) return
      settled = true
      resolvePromise(value)
    }
    child.on('error', () => settle(false))
    child.on('close', (code: number | null) => settle(code === 0))
  })
}

/** The 32-bit Windows PowerShell, the safe host for the vendor object model. */
function powershell32Path(): string {
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  return `${windir}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/** The census a headless COM read returns, shaped for the model. */
function censusOf(project: Plc5Project): Record<string, unknown> {
  const ladder = project.files.filter(file => file.type === 1)
  return {
    project: project.projectName,
    revision: project.revision,
    app_version: project.appVersion,
    program_files: project.files.length,
    ladder_files: ladder.length,
    rungs: project.totalRungs,
    symbols: project.symbolCount,
    data_files: project.dataFileCount,
  }
}

/**
 * The RSLogix 5 tool set.
 *
 * @param fs - the filesystem service from the composition.
 * @param _sandboxPolicy - accepted for interface parity; these tools write nothing.
 * @returns the eight tool definitions.
 */
export function plc5Tools(fs: FsService, _sandboxPolicy?: SandboxPolicyResolver): readonly ToolDefinition[] {
  const capabilitiesTool: ToolDefinition = {
    name: 'plc5_capabilities',
    description:
      'Check what this machine can read of an RSLogix 5 (PLC-5) .RSP project: whether the 32-bit automation host and the RSLogix 5 COM server are present, and — when a project path is given — the container census (streams, sizes, which payloads are packed). Read-only; it opens no project and contacts no controller.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Optional .RSP project to census the container of, for example "PLC\\F00607.RSP".' },
      },
      required: [],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = typeof args.path === 'string' && args.path.trim() !== '' ? args.path : undefined
        const powershell = powershell32Path()
        const answer: Record<string, unknown> = {
          powershell32: existsSync(powershell),
          com_server: await comRegistered(),
        }
        if (path !== undefined) {
          const resolved = await projectPath(fs, path, exec)
          const bytes = await readFile(fs, resolved, exec)
          const file = parseCfbf(bytes)
          answer.container = {
            sector_size: file.sectorSize,
            streams: file.streams.map(stream => ({
              name: stream.name,
              bytes: stream.size,
              packed: stream.packed,
              unpacked_bytes: stream.unpackedSize,
            })),
          }
          const identity = readContainerIdentity(bytes)
          answer.container_identity = {
            project_name: identity.projectName,
            processor_type: identity.processorType,
            author: identity.author,
            route: identity.route,
            program_files: identity.programFiles.length,
          }
        }
        return {
          summary: `RSLogix 5 ${answer.com_server === true && answer.powershell32 === true ? 'is registered here and the 32-bit host is present — whether the server can actually launch is proven by opening a project, not by this probe' : 'is not usable on this machine: its automation server is not registered, or the 32-bit host is missing'}${path === undefined ? '' : '; the container itself is readable without it'}.`,
          data: answer,
          next: [
            { tool: 'plc5_open', why: 'Open the project headlessly for the program census.' },
            { tool: 'plc5_processor', why: 'Name the controller from the project.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const openTool: ToolDefinition = {
    name: 'plc5_open',
    description:
      'Open an RSLogix 5 (PLC-5) .RSP project headlessly through the vendor automation server — hidden, read-only, closed with the do-not-save flag — and return the program census: program files with type and rung counts, total rungs, symbol and data-file counts, project revision and app version. When RSLogix 5 is not on the machine, it falls back to the container reader and says which facts came from the file alone.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project, for example "PLC\\F00607.RSP".' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const resolved = await projectPath(fs, path, exec)
        try {
          const project = await readPlc5Project(resolved, { symbols: 0 })
          return {
            summary: `${project.projectName} rev ${project.revision ?? '?'}: ${project.files.length} program files (${project.files.filter(file => file.type === 1).length} ladder), ${project.totalRungs} rungs, ${project.symbolCount} symbols, ${project.dataFileCount} data files, read headlessly by RSLogix 5 ${project.appVersion}.`,
            data: {
              ...censusOf(project),
              files: project.files.map(file => ({ number: file.number, name: file.name, type: file.type, rungs: file.rungs })),
              source: 'automation server',
            },
            next: [
              { tool: 'plc5_ladder', why: 'Read the rung text of one program file.' },
              { tool: 'plc5_io_census', why: 'Census the chassis references the ladder makes.' },
            ],
            coverage: COVERAGE,
          }
        } catch (error) {
          if (!(error instanceof Plc5Error) || (error.code !== 'PLC5_COM_UNAVAILABLE' && error.code !== 'PLC5_POWERSHELL_MISSING')) throw error
          const bytes = await readFile(fs, resolved, exec)
          const identity = readContainerIdentity(bytes)
          const file = parseCfbf(bytes)
          const named = identity.programFiles.length
          return {
            summary: `${identity.projectName === '' ? baseNameOf(resolved) : identity.projectName} read from the container alone (RSLogix 5 did not start): ${named} ladder program files${identity.processorType === '' ? '' : `, processor ${identity.processorType}`}${identity.route === '' ? '' : `, route ${identity.route}`}; rung counts and text, symbols, data-file values and the I/O configuration need the automation server.`,
            data: {
              project_name: identity.projectName,
              program_files: identity.programFiles,
              processor_type: identity.processorType,
              author: identity.author,
              route: identity.route,
              ip: identity.ip,
              revision_notes: identity.revisionNotes,
              stream_count: file.streams.length,
              source: 'container reader',
            },
            next: [
              { tool: 'plc5_capabilities', why: 'See exactly what this machine can read.' },
              { tool: 'plc5_processor', why: 'The container carries the processor identity without RSLogix 5.' },
            ],
            coverage: {
              complete: false,
              unverified: [
                'rung counts and rung text — the container stores instructions as opcodes, not text',
                'the symbol table and data-file values',
                'the I/O configuration',
              ],
            },
          }
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const ladderTool: ToolDefinition = {
    name: 'plc5_ladder',
    description:
      'Read the ladder of one PLC-5 program file in neutral (mnemonic) text through the RSLogix 5 automation server: XIC/XIO/OTE/TON/CTU/JSR form, one line per rung, with the rung numbers. Hidden, read-only, do-not-save. Up to 200 rungs per call; ask for a file by name, and the census lists the names.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
        file: { type: 'string', description: 'The program file to read, for example "PWR_FAULTS". Omit for the first rungs across all files.' },
        limit: { type: 'integer', description: 'Most rungs to return, 1 to 200. Defaults to 50.' },
        offset: { type: 'integer', description: 'Rung index to start at within the file. Defaults to 0.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const file = typeof args.file === 'string' ? args.file : undefined
        const limit = Math.max(1, Math.min(args.limit === undefined ? 50 : Number(args.limit), MAX_RUNGS))
        const offset = Math.max(0, args.offset === undefined ? 0 : Number(args.offset))
        if (!Number.isFinite(limit) || !Number.isFinite(offset)) {
          throw new Plc5ToolError('INVALID_ARGUMENT', 'limit and offset must be integers.', 'Pass limit 1-200 and offset 0 or more, or omit both.')
        }
        const resolved = await projectPath(fs, path, exec)
        const project = await readPlc5Project(resolved, { rungs: 100_000 })
        const wanted = file === undefined ? project.rungs : project.rungs.filter(rung => rung.file === file)
        const page = wanted.slice(offset, offset + limit)
        return {
          summary: `${file === undefined ? 'All files' : `File ${file}`}: ${page.length} rung text(s) shown of ${wanted.length} in range, from ${project.projectName} rev ${project.revision ?? '?'} (${project.totalRungs} rungs total).`,
          data: {
            project: project.projectName,
            file: file ?? '(all files)',
            offset,
            rungs: page,
            rungs_in_range: wanted.length,
            files: project.files.map(entry => ({ name: entry.name, rungs: entry.rungs })),
          },
          next: [
            { tool: 'plc5_find', why: 'Search the whole ladder for an address, symbol or mnemonic.' },
            { tool: 'plc5_io_census', why: 'Reduce the chassis references in the rung text to a footprint.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const findTool: ToolDefinition = {
    name: 'plc5_find',
    description:
      'Search a PLC-5 program for an operand, address, mnemonic or symbol across every rung: literal text or a regular expression, with the program file and rung number of each hit, plus matching entries from the address/symbol table. Reads the whole ladder headlessly through RSLogix 5; reads nothing else.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
        pattern: { type: 'string', description: 'Text to find, for example "B23/477", "I:104", "JSR" or "PWR_BLKXFR".' },
        limit: { type: 'integer', description: 'Most hits to return, 1 to 200. Defaults to 50.' },
      },
      required: ['path', 'pattern'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const pattern = stringArg(args, 'pattern')
        const limit = Math.max(1, Math.min(args.limit === undefined ? 50 : Number(args.limit), MAX_RUNGS))
        const resolved = await projectPath(fs, path, exec)
        const project = await readPlc5Project(resolved, { rungs: 100_000, symbols: 5000 })
        let matcher: RegExp
        try {
          matcher = new RegExp(pattern, 'iu')
        } catch {
          matcher = new RegExp(escapeForSearch(pattern), 'iu')
        }
        const hits: { file: string; rung: number; text: string }[] = []
        for (const rung of project.rungs) {
          if (matcher.test(rung.text)) hits.push({ file: rung.file, rung: rung.rung, text: rung.text.slice(0, 240) })
          if (hits.length >= limit) break
        }
        const symbols = project.symbols
          .filter(symbol => matcher.test(symbol.address) || matcher.test(symbol.symbol) || matcher.test(symbol.description))
          .slice(0, limit)
        return {
          summary: `"${pattern}": ${hits.length} rung hit(s)${hits.length >= limit ? ' (more counted)' : ''} and ${symbols.length} symbol match(es) across ${project.files.length} program files.`,
          data: {
            project: project.projectName,
            pattern,
            hits: hits.map(hit => ({ ...hit, truncated: hit.text.length >= 240 })),
            hits_at_limit: hits.length >= limit,
            symbols,
          },
          next: [
            { tool: 'plc5_ladder', why: 'Read the whole file a hit sits in.' },
            { tool: 'plc5_io_census', why: 'For an I: / O: pattern, the footprint scan answers rack by rack.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const ioCensusTool: ToolDefinition = {
    name: 'plc5_io_census',
    description:
      'Census the I/O footprint a PLC-5 program references: scan every rung for I:/O: chassis addresses, reduce them to rack/slot cells with reference counts and the highest bit seen, and split the racks into those inside the configured chassis and those the program addresses without configuring (the block-transfer case). Read-only through the automation server.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const resolved = await projectPath(fs, path, exec)
        const project = await readPlc5Project(resolved, { rungs: 100_000, io: true })
        const census = scanIoFootprint(project.rungs)
        const coverage = coverageAgainst(census, project.chassis)
        return {
          summary: `${census.references} chassis reference(s) reduce to ${census.cells.length} rack/slot cells across ${census.racks.length} racks (${census.inputCells} input, ${census.outputCells} output); ${coverage.configuredRacks.length} rack(s) sit in a configured chassis, ${coverage.programOnlyRacks.length} are addressed by the program only.`,
          data: {
            project: project.projectName,
            references: census.references,
            cells: census.cells,
            racks: census.racks,
            configured_racks: coverage.configuredRacks,
            program_only_racks: coverage.programOnlyRacks,
            chassis_configured: project.chassis.length,
            note: 'The project records chassis and adapters, not the point cards in the slots; card part numbers come from an online read, the panel drawings, or the nameplate.',
          },
          next: [
            { tool: 'plc5_io_config', why: 'List the configured chassis with their adapter part numbers.' },
            { tool: 'plc5_processor', why: 'The route for an online read of the real configuration.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const ioConfigTool: ToolDefinition = {
    name: 'plc5_io_config',
    description:
      'List the I/O configuration an RSLogix 5 project carries: every chassis with its adapter part number (1771-A4B, 1794 Flex adapter, …), slot count, rack and group ranges, adapter address and channel. Read headlessly and read-only; it reports what the project configures, and says plainly that the point cards in the slots are not recorded in the project.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const resolved = await projectPath(fs, path, exec)
        const project = await readPlc5Project(resolved, { io: true })
        return {
          summary: `${project.chassis.length} chassis configured in ${project.projectName}: ${project.chassis.map(row => `${row.name} (${row.part === '' ? 'part not recorded' : row.part}, ${row.slots} slots, racks ${row.startingRack}-${row.endingRack})`).join('; ')}.`,
          data: {
            project: project.projectName,
            chassis: project.chassis,
            note: 'Modules in the slots return empty through the automation server — the project records chassis and adapters, not the cards. An online read of the controller, the panel drawings, or the physical racks carry the card numbers.',
          },
          next: [
            { tool: 'plc5_io_census', why: 'Compare the configured racks with the racks the ladder references.' },
            { tool: 'plc5_processor', why: 'The RSWho route an online read would use.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const dataReadTool: ToolDefinition = {
    name: 'plc5_data_read',
    description:
      'Read the data-file table of a PLC-5 project through the RSLogix 5 automation server: every data file with its number, type (N integer, F float, B binary, O output, I input, S status, T timer, C counter, R control, G structured), name and element count. The table is the census; register values live in the packed DATA FILES stream and are not claimed from the file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
        limit: { type: 'integer', description: 'Most data files to list, 1 to 500. Defaults to 200.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const limit = Math.max(1, Math.min(args.limit === undefined ? 200 : Number(args.limit), 500))
        const resolved = await projectPath(fs, path, exec)
        const project = await readPlc5Project(resolved, { dataFiles: true })
        const byType: Record<string, number> = {}
        for (const file of project.dataFiles) byType[file.type] = (byType[file.type] ?? 0) + 1
        // An RSLogix 5 data file can carry no type letter at all; the raw key stays
        // empty for the data, and the summary says "untyped" rather than nothing.
        const tally = Object.entries(byType).map(([type, count]) => `${count} ${type === '' ? 'untyped' : type}`).join(', ')
        return {
          summary: `${project.dataFiles.length} of ${project.dataFileCount} data file(s) listed from ${project.projectName}: ${tally}.`,
          data: {
            project: project.projectName,
            data_files: project.dataFiles.slice(0, limit),
            listed: Math.min(project.dataFiles.length, limit),
            total: project.dataFileCount,
            by_type: byType,
          },
          next: [
            { tool: 'plc5_find', why: 'Find the rungs that touch a data file, for example "N21:".' },
            { tool: 'plc5_capabilities', why: 'The container census shows which streams are packed.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const processorTool: ToolDefinition = {
    name: 'plc5_processor',
    description:
      'Name the controller a PLC-5 project was written for: the processor type string, RSLogix 5 author string, memory size, type code and series, the network driver and RSWho route with its IP, and the online/faulted flags — merged from the automation server and the container, each fact labelled with its source. Read-only; it never goes online.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the .RSP project.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const resolved = await projectPath(fs, path, exec)
        const bytes = await readFile(fs, resolved, exec)
        const identity = readContainerIdentity(bytes)
        let online: Plc5Project | undefined
        let comCode = ''
        try {
          online = await readPlc5Project(resolved, { processor: true })
        } catch (error) {
          comCode = error instanceof Plc5Error ? error.code : 'PLC5_READ_FAILED'
        }
        const processor = online?.processor
        return {
          summary: `Processor ${identity.processorType === '' ? (processor === undefined ? 'not recorded' : `code ${processor.typeCode} series ${processor.series}`) : identity.processorType}${processor === undefined ? '' : `, ${processor.memoryWords} words`}${identity.route === '' ? '' : `, route ${identity.route}`}.`,
          data: {
            project: online?.projectName ?? identity.projectName,
            revision: online?.revision,
            processor_type: identity.processorType,
            author: identity.author,
            ip: identity.ip,
            route: identity.route,
            memory_words: processor?.memoryWords,
            type_code: processor?.typeCode,
            series: processor?.series,
            driver_name: processor?.driverName,
            online: processor?.online,
            faulted: processor?.faulted,
            edits_present: processor?.editsPresent,
            sources: {
              container: ['processor_type', 'author', 'ip', 'route'],
              automation_server: processor === undefined ? [] : ['memory_words', 'type_code', 'series', 'driver_name', 'online', 'faulted', 'edits_present'],
            },
            automation_server: processor === undefined ? `not used (${comCode})` : 'used',
            note: 'The catalog number is not stored in the project — the type string is what RSLogix 5 records. The nameplate, panel drawings, or an online read carry the catalog.',
          },
          next: [
            { tool: 'plc5_io_config', why: 'The chassis configuration belongs to the same controller.' },
            { tool: 'plc5_open', why: 'The program census for the same project.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  return [capabilitiesTool, openTool, ladderTool, findTool, ioCensusTool, ioConfigTool, dataReadTool, processorTool]
}

/** The model-facing name of a path. */
function baseNameOf(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() ?? path
}

/** Escape a literal search pattern for the rung-text matcher. */
function escapeForSearch(pattern: string): string {
  return pattern.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}
