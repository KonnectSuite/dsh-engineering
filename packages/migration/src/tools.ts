/**
 * The two migration tools: assess a legacy export, and lint the `.L5K` a
 * migration wizard produced.
 *
 * They are deliberately thin readers. Nothing here contacts a controller, runs
 * RSLogix 500, or claims a migration is correct: the tools describe what the
 * file says and what will stop Studio from importing it, so the engineer decides
 * with evidence in hand.
 *
 * @module dsh-engineering-migration/tools
 */

import { decodeL5k, lintL5k, type L5kFacts, type L5kFinding } from './engine/l5k.ts'
import { readSlcProject, SlcError, type SlcProject } from './engine/rslogix500.ts'
import { compareSides, readLogix, type LegacySide } from './engine/compare.ts'
import {
  createPlan,
  currentStage,
  nextAction,
  openQuestions,
  parsePlan,
  planState,
  readDecisions,
  summarize,
  withDecisions,
  withException,
  withStage,
  type MigrationPlan,
  type PlanSource,
  type StageId,
  type StageStatus,
} from './engine/plan.ts'
import { jsonText, type FsService, type ToolDefinition, type ToolExec } from './core/tool.ts'

/** The largest file these tools will read. */
const MAX_BYTES = 64 * 1024 * 1024

/** How a recorded exception stands. */
type PlanExceptionStatus = 'open' | 'accepted' | 'fixed'

/** How many findings one answer carries before it summarises the rest. */
const MAX_FINDINGS = 50

/** A failure the tool reports as a code, a message and a fix. */
class MigrationError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'MigrationError'
    this.code = code
    this.fix = fix
  }
}

/** The failure envelope every engineering tool returns. */
function failure(error: unknown): unknown {
  const structural = typeof error === 'object' && error !== null ? error as { code?: unknown; fix?: unknown } : {}
  const code = typeof structural.code === 'string'
    ? structural.code
    : 'INTERNAL'
  const message = error instanceof Error ? error.message : String(error)
  const fix = typeof structural.fix === 'string'
    ? structural.fix
    : 'Correct the path and retry; these tools read local files only.'
  return { error: { code, message, fix, candidates: [] } }
}

/** The coverage every answer carries: what a text reader cannot see. */
const COVERAGE = {
  complete: false,
  unverified: [
    'whether the migrated logic behaves like the original at runtime',
    'I/O wiring, module replacements and HMI bindings not present in the file',
    'the Studio import result until the file is actually imported',
  ],
}

/** Read one command-line argument as a non-empty string. */
function stringArg(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MigrationError('INVALID_ARGUMENT', `${name} is required and must be a file path.`, `Pass ${name}, for example the .L5K or .SLC file to read.`)
  }
  return value
}

/** The lower-case extension of a path, without the dot. */
function extensionOf(path: string): string {
  const name = path.replaceAll('\\', '/').split('/').pop() ?? ''
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase()
}

/** The model-facing name of a path. */
function baseName(path: string): string {
  return path.replaceAll('\\', '/').split('/').pop() ?? path
}

/** Read the bytes of one file through the filesystem provider. */
async function readFile(fs: FsService, path: string, exec: ToolExec): Promise<Uint8Array> {
  const target = await fs.resolve(path, { cwd: exec.cwd })
  const stat = await fs.stat(target, exec.signal)
  if (stat === undefined) {
    throw new MigrationError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .L5K or legacy export path; this tool does not create files.')
  }
  if (stat.type !== 'file') {
    throw new MigrationError('NOT_A_FILE', `${path} is not a file.`, 'Pass the file itself, not the folder that holds it.')
  }
  try {
    return await fs.readBytes(target, exec.signal, MAX_BYTES)
  } catch (error) {
    const code = typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string' ? (error as { code: string }).code : ''
    if (code === 'ENOENT') {
      throw new MigrationError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .L5K or legacy export path; this tool does not create files.')
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new MigrationError('ACCESS_DENIED', `The filesystem provider refused to read ${path}.`, 'Choose a file this chat can read, or move the export into the workspace.')
    }
    throw error
  }
}

/** What an `.SLC` text export says, as far as its sections can be counted. */
interface SlcFacts {
  readonly processor: string | undefined
  readonly racks: number
  readonly ladderFiles: number
  readonly rungs: number
  readonly dataFiles: readonly string[]
  readonly lineCount: number
}

/** Count the sections of an RSLogix 500 `.SLC` text export. */
function readSlc(text: string): SlcFacts {
  const lines = text.split(/\r?\n/u)
  const dataFiles: string[] = []
  let racks = 0
  let ladderFiles = 0
  let rungs = 0
  let processor: string | undefined
  for (const line of lines) {
    const start = /^START[ \t]+(\S+)/u.exec(line)
    if (start?.[1] !== undefined) processor = start[1]
    if (/^[ \t]*\d+[ \t]+1746-A\d+/u.test(line)) racks += 1
    if (/^LADDER[ \t]+\d+/u.test(line)) ladderFiles += 1
    if (/^%[ \t]*Rung[ \t]*:/u.test(line)) rungs += 1
    const data = /^DATA[ \t]+([A-Z]\d+):/u.exec(line)
    if (data?.[1] !== undefined && !dataFiles.includes(data[1])) dataFiles.push(data[1])
  }
  return { processor, racks, ladderFiles, rungs, dataFiles, lineCount: lines.length }
}

/** Keep one answer's findings bounded, and say how many were left out. */
function bounded(findings: readonly L5kFinding[]): { findings: readonly L5kFinding[]; omitted: number } {
  return findings.length <= MAX_FINDINGS
    ? { findings, omitted: 0 }
    : { findings: findings.slice(0, MAX_FINDINGS), omitted: findings.length - MAX_FINDINGS }
}

/** The facts worth repeating in an answer, without every tag name. */
function factsOf(facts: L5kFacts): Readonly<Record<string, unknown>> {
  return {
    controller: facts.controllerName,
    processor: facts.processorType,
    revision: facts.revision,
    encoding: facts.encoding === 'utf8' ? 'UTF-8' : facts.encoding === 'utf16le' ? 'UTF-16LE' : 'UTF-16BE',
    tags: facts.tagCount,
    routines: facts.routineCount,
    rungs: facts.rungCount,
    modules: facts.modules.length,
    indirect_references: facts.indirectReferences.length,
    lines: facts.lineCount,
  }
}

/** Count findings by severity. */
function severities(findings: readonly L5kFinding[]): { error: number; warning: number; info: number } {
  let error = 0
  let warning = 0
  let info = 0
  for (const finding of findings) {
    if (finding.severity === 'error') error += 1
    else if (finding.severity === 'warning') warning += 1
    else info += 1
  }
  return { error, warning, info }
}

/** Instructions whose behaviour a migration changes or cannot carry over directly. */
const LEGACY_ONLY = ['MSG', 'SVC', 'IIM', 'IOM', 'BSL', 'BSR', 'SQO', 'SQC', 'SQI', 'COP', 'FLL', 'PID', 'TOD', 'DTR', 'DCD', 'HSC', 'AFI'] as const

/** One risk the assessment reports. */
interface SlcRisk {
  readonly rule: string
  readonly severity: 'error' | 'warning' | 'info'
  readonly count: number
  readonly detail: string
  readonly evidence: readonly string[]
}

/** The sample bound for evidence in an assessment. */
const EVIDENCE = 3

/** What the headless read suggests a migration will still have to change. */
function slcRisks(project: SlcProject): SlcRisk[] {
  const risks: SlcRisk[] = []
  const texts = project.rungs.map(rung => rung.text)
  const indirect = texts.flatMap(text => text.match(/\b[A-Z]{1,2}\d*\[\s*[A-Za-z_][\w]*\s*\]/gu) ?? [])
  if (indirect.length > 0) {
    risks.push({
      rule: 'INDIRECT_ADDRESS',
      severity: 'error',
      count: indirect.length,
      detail: 'A rung indexes a data file with another tag. Logix cannot express that, so each one is engineering work.',
      evidence: indirect.slice(0, EVIDENCE),
    })
  }
  const instructionHits = new Map<string, number>()
  for (const text of texts) {
    for (const match of text.matchAll(/\b([A-Z]{2,3})\b/gu)) {
      const mnemonic = match[1] ?? ''
      if ((LEGACY_ONLY as readonly string[]).includes(mnemonic)) instructionHits.set(mnemonic, (instructionHits.get(mnemonic) ?? 0) + 1)
    }
  }
  if (instructionHits.size > 0) {
    const ordered = [...instructionHits.entries()].sort((a, b) => b[1] - a[1])
    risks.push({
      rule: 'LEGACY_INSTRUCTION',
      severity: 'warning',
      count: ordered.reduce((sum, entry) => sum + entry[1], 0),
      detail: `SLC-specific instructions appear in the sampled rungs: ${ordered.map(([name, count]) => `${name} x${count}`).join(', ')}. Each needs its Logix replacement chosen, not assumed.`,
      evidence: ordered.slice(0, EVIDENCE).map(([name, count]) => `${name} x${count}`),
    })
  }
  const longSymbols = project.symbols.filter(symbol => symbol.symbol.trim() !== '' && symbol.symbol.trim().length > 15)
  if (longSymbols.length > 0) {
    risks.push({
      rule: 'SYMBOL_TOO_LONG',
      severity: 'warning',
      count: longSymbols.length,
      detail: 'RSLogix 500 stores at most 15 characters in a symbol; the migrated tag name was cut, so the old and new names must be mapped before a comparison can mean anything.',
      evidence: longSymbols.slice(0, EVIDENCE).map(symbol => symbol.symbol),
    })
  }
  const named = project.symbols.filter(symbol => symbol.symbol.trim() !== '')
  if (project.symbols.length > 0 && named.length === 0) {
    risks.push({
      rule: 'ADDRESS_ONLY_DATABASE',
      severity: 'info',
      count: project.symbolCount,
      detail: 'The symbol database carries descriptions but no symbolic names; the wizard will migrate addresses and comments, and every reference in the new program is address-based.',
      evidence: project.symbols.slice(0, EVIDENCE).map(symbol => `${symbol.address}: ${symbol.description.split(/\r?\n/u)[0] ?? ''}`),
    })
  }
  if (project.dataFileCount > 0) {
    risks.push({
      rule: 'DATA_FILES_CARRIED',
      severity: 'info',
      count: project.dataFileCount,
      detail: `The project declares ${project.dataFileCount} data file(s); Logix carries them as tag arrays or individual tags, and the mapping must be checked element by element.`,
      evidence: project.dataFiles.slice(0, EVIDENCE).map(file => `${file.type}${file.number} ${file.name} (${file.elements})`),
    })
  }
  if (project.truncated) {
    risks.push({
      rule: 'RUNGS_SAMPLED',
      severity: 'info',
      count: project.rungs.length,
      detail: `Only ${project.rungs.length} rung text(s) were read out of ${project.totalRungs}; the instruction and indirect-address counts are a sample, not a census.`,
      evidence: [],
    })
  }
  return risks
}

/** Build the legacy side of a comparison from a headless read. */
function legacySideOf(project: SlcProject): LegacySide {
  const files = project.files
    .filter(file => file.type === 1)
    .map(file => ({ name: file.name, rungs: file.rungs, lastRung: file.lastRung }))
  // A file's terminal `END` rung is not logic; leave it out of the rung total.
  const totalRungs = files.reduce(
    (sum, file) => sum + Math.max(0, file.rungs - (/^END\b/iu.test(file.lastRung ?? '') ? 1 : 0)),
    0,
  )
  return {
    project: project.projectName,
    controller: '',
    files,
    totalRungs,
    symbols: project.symbols,
    symbolCount: project.symbolCount,
    dataFiles: project.dataFiles,
    dataFileCount: project.dataFileCount,
  }
}

/** Where the plan lives when the caller does not say. */
const DEFAULT_PLAN = '.migration/plan.json'

/** Resolve the plan path against the caller's working directory. */
function planPathOf(args: Readonly<Record<string, unknown>>, exec: ToolExec): string {
  const supplied = typeof args.path === 'string' ? args.path.trim() : ''
  if (supplied !== '') return supplied
  const cwd = exec.cwd ?? '.'
  return `${cwd.replace(/[\\/]+$/u, '')}/${DEFAULT_PLAN}`
}

/** Read the plan document from the filesystem. */
async function readPlanFile(fs: FsService, path: string, exec: ToolExec): Promise<MigrationPlan> {
  const target = await fs.resolve(path, { cwd: exec.cwd })
  const stat = await fs.stat(target, exec.signal)
  if (stat === undefined) {
    throw new MigrationError(
      'PLAN_MISSING',
      `No migration plan at ${path}.`,
      'Run migration_plan with action "create" first; the plan is the record every later stage adds evidence to.',
    )
  }
  const bytes = await fs.readBytes(target, exec.signal, MAX_BYTES)
  try {
    return parsePlan(new TextDecoder('utf-8').decode(bytes))
  } catch (error) {
    throw new MigrationError(
      'PLAN_UNREADABLE',
      `The plan at ${path} could not be read: ${error instanceof Error ? error.message : String(error)}`,
      'Restore the plan from version control, or create a new one; do not hand-edit it into a shape this tool cannot read.',
    )
  }
}

/** Write the plan document back. */
async function writePlanFile(fs: FsService, path: string, plan: MigrationPlan, exec: ToolExec): Promise<void> {
  const target = await fs.resolve(path, { cwd: exec.cwd })
  try {
    await fs.writeText(target, `${JSON.stringify(plan, undefined, 2)}\n`, exec.signal)
  } catch (error) {
    const code = typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
    throw new MigrationError(
      'PLAN_UNWRITABLE',
      `The plan could not be written to ${path}${code === undefined ? '' : ` (${String(code)})`}.`,
      'Choose a path inside the workspace the chat can write, for example ".migration/plan.json".',
    )
  }
}

/**
 * Build the migration tools.
 *
 * @param fs - The filesystem provider the composition supplies.
 * @returns The two tool definitions, in registration order.
 */
export function migrationTools(fs: FsService): readonly ToolDefinition[] {
  const lintTool: ToolDefinition = {
    name: 'l5k_lint',
    description:
      'Lint a Logix .L5K file before Studio imports it: report every import blocker (trailing comma in an attribute list, duplicate tag, name over 40 characters, stray routine parenthesis, unbalanced ROUTINE blocks) with its line number, plus what a text reader can count (tags, routines, rungs, modules, indirect addresses, controller revision). Reads UTF-16LE and UTF-8, because the migration wizard and a hand repair write different encodings.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the .L5K file, for example "PLC/Upgraded/SLITTER8_IMPORTED.l5k".' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        if (extensionOf(path) !== 'l5k') {
          throw new MigrationError('UNSUPPORTED_FORMAT', `${baseName(path)} is not an .L5K file.`, 'Call migration_assess for an .SLC, .RSS or .RSP file; l5k_lint reads only the text Studio imports.')
        }
        const bytes = await readFile(fs, path, exec)
        const { text, encoding } = decodeL5k(bytes)
        const report = lintL5k(text, encoding)
        const counts = severities(report.findings)
        const { findings, omitted } = bounded(report.findings)
        const name = baseName(path)
        const verdict = counts.error > 0
          ? 'Studio will reject the import until the errors are fixed.'
          : 'Studio should accept the file; the warnings are behaviour, not syntax.'
        return {
          summary: `Linted ${name}: ${counts.error} error(s), ${counts.warning} warning(s), ${counts.info} info. ${verdict}`,
          data: {
            file: path,
            format: 'L5K',
            encoding,
            facts: factsOf(report.facts),
            counts,
            findings,
            ...(omitted === 0 ? {} : { omitted }),
            import_ready: counts.error === 0,
          },
          next: [
            { tool: 'migration_assess', why: 'Assess the same file for what a migration still has to change.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const assessTool: ToolDefinition = {
    name: 'migration_assess',
    description:
      'Assess one legacy export before a migration: for an .L5K it returns the lint verdict and the controller facts; for an RSLogix 500 .SLC text export it counts ladder files, rungs, racks and data files; for an .RSS, .ACH or .RSP container it states what the binary needs (RSLogix 500 or RSLogix 5, then Save As .SLC or the migration wizard). It never edits the file and never contacts a controller.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the legacy file to assess (.l5k, .slc, .rss, .ach or .rsp).' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const extension = extensionOf(path)
        const name = baseName(path)

        if (extension === 'l5k') {
          const bytes = await readFile(fs, path, exec)
          const { text, encoding } = decodeL5k(bytes)
          const report = lintL5k(text, encoding)
          const counts = severities(report.findings)
          const { findings, omitted } = bounded(report.findings)
          return {
            summary: `${name}: L5K for ${report.facts.controllerName ?? 'an unnamed controller'} (${report.facts.processorType ?? 'type unstated'}, revision ${report.facts.revision ?? 'unstated'}) — ${report.facts.tagCount} tags, ${report.facts.routineCount} routines, ${report.facts.rungCount} rungs, ${counts.error} import error(s).`,
            data: {
              file: path,
              format: 'L5K',
              facts: factsOf(report.facts),
              counts,
              findings,
              ...(omitted === 0 ? {} : { omitted }),
              import_ready: counts.error === 0,
              build_gate: report.facts.revision !== undefined && report.facts.revision >= 37
                ? 'offline build can prove the import'
                : 'only an import can be proven here; the build gate needs revision 37 or newer',
            },
            next: [{ tool: 'l5k_lint', why: 'Get the full finding list with line numbers before repairing the text.' }],
            coverage: COVERAGE,
          }
        }

        if (extension === 'slc') {
          const bytes = await readFile(fs, path, exec)
          const text = new TextDecoder('utf-8').decode(bytes)
          const facts = readSlc(text)
          return {
            summary: `${name}: SLC export for ${facts.processor ?? 'an unnamed processor'} — ${facts.ladderFiles} ladder file(s), ${facts.rungs} rung(s), ${facts.dataFiles.length} data file(s), ${facts.racks} rack(s). Read-only: edits need RSLogix 500.`,
            data: {
              file: path,
              format: 'SLC',
              facts: {
                processor: facts.processor,
                ladder_files: facts.ladderFiles,
                rungs: facts.rungs,
                racks: facts.racks,
                data_files: facts.dataFiles,
                lines: facts.lineCount,
              },
              checks: {
                edits_possible_here: false,
                needs_rslogix_500: true,
              },
            },
            next: [
              { tool: 'migration_assess', why: 'Assess the .L5K once the migration wizard has written it.' },
            ],
            coverage: COVERAGE,
          }
        }

        if (extension === 'rss' || extension === 'ach' || extension === 'rsp') {
          const bytes = await readFile(fs, path, exec)
          const target = await fs.resolve(path, { cwd: exec.cwd })
          try {
            const project = await readSlcProject(target.displayPath, { rungs: 200, symbols: 500, dataFiles: true })
            const ladder = project.files.filter(file => file.type === 1)
            const risks = slcRisks(project)
            const blocking = risks.filter(risk => risk.severity === 'error')
            return {
              summary: `${name}: read headlessly — ${project.files.length} program file(s) (${ladder.length} ladder), ${project.totalRungs} rung(s), ${project.symbolCount} symbol record(s), ${project.dataFileCount} data file(s); ${blocking.length} blocking risk(s) in the sampled rungs.`,
              data: {
                file: path,
                format: extension.toUpperCase(),
                host: { product: 'RSLogix 500', version: project.version },
                facts: {
                  project: project.projectName,
                  program_files: project.files.length,
                  ladder_files: ladder.length,
                  rungs: project.totalRungs,
                  symbols: project.symbolCount,
                  data_files: project.dataFileCount,
                  sampled_rungs: project.rungs.length,
                },
                risks,
                checks: { headless: true, read_only: true, saved: false, sampled_rungs: project.rungs.length },
              },
              next: [
                { tool: 'migration_plan', why: 'Record the target, I/O strategy and acceptance before converting, and keep the plan with the evidence.' },
                { tool: 'slc_read', why: 'Read the rung text and symbol table when you are ready to compare.' },
              ],
              coverage: COVERAGE,
            }
          } catch (error) {
            const reason = error instanceof SlcError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : String(error)
            return {
              summary: `${name}: RSLogix 500 container, ${bytes.length} bytes. Headless read did not run here (${reason}), so save it as .SLC or run the migration wizard to get text this package can read.`,
              data: {
                file: path,
                format: extension.toUpperCase(),
                facts: { bytes: bytes.length },
                checks: { text_readable: false, needs_rslogix_500: true, headless: false, headless_error: reason },
              },
              next: [
                { tool: 'slc_read', why: 'Retry the headless read on the engineering PC with RSLogix 500 installed and activated.' },
                { tool: 'migration_assess', why: 'Assess the .SLC or .L5K once RSLogix 500 has written it.' },
              ],
              coverage: COVERAGE,
            }
          }
        }

        if (extension === 'l5x') {
          throw new MigrationError('ALREADY_LOGIX', `${name} is a Logix L5X export, not a legacy file.`, 'Open it with open_project; this row reads the source side and the .L5K the wizard writes.')
        }

        throw new MigrationError(
          'UNSUPPORTED_FORMAT',
          `${name} is not an .L5K, .SLC, .RSS, .ACH or .RSP file.`,
          'Pass the file the migration writes (.L5K) or the legacy export (.SLC, .RSS, .ACH, .RSP).',
        )
      } catch (error) {
        return failure(error)
      }
    },
  }

  const slcReadTool: ToolDefinition = {
    name: 'slc_read',
    description:
      'Read an RSLogix 500 .RSS/.ACH or RSLogix 5 .RSP project headlessly through its 32-bit automation server: program files with rung counts, the controller revision, optionally rung text, the symbol table and the data-file table. The project is opened hidden, read only and closed without saving, so no window appears and no click is needed. Requires RSLogix 500 or RSLogix 5 on the 32-bit host.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Absolute path to the legacy project, for example "RSS 500 Programs\\Slitter8.RSS" or "RSS 5 Programs\\EN-032.RSP".' },
        rungs: { type: 'integer', description: 'How many rung texts to include, 0 to 200. Defaults to 0 for counts only.', minimum: 0, maximum: 200 },
        symbols: { type: 'integer', description: 'How many symbol records to include, 0 to 5000. Defaults to 0 for the count only.', minimum: 0, maximum: 5000 },
        data_files: { type: 'boolean', description: 'Include the data-file table (number, type, name, element count). Defaults to false.' },
      },
      required: ['path'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const path = stringArg(args, 'path')
        const extension = extensionOf(path)
        if (extension !== 'rss' && extension !== 'ach' && extension !== 'rsp') {
          throw new MigrationError(
            'UNSUPPORTED_FORMAT',
            `${baseName(path)} is not an .RSS, .ACH or .RSP file.`,
            'Pass the RSLogix 500 project itself; a saved .SLC text export is read by migration_assess, and the .L5K the wizard writes by l5k_lint.',
          )
        }
        const target = await fs.resolve(path, { cwd: exec.cwd })
        const stat = await fs.stat(target, exec.signal)
        if (stat === undefined) {
          throw new MigrationError('FILE_MISSING', `No file at ${path}.`, 'Pass an existing .RSS, .ACH or .RSP path; this tool does not create files.')
        }
        const requested = typeof args.rungs === 'number' ? args.rungs : 0
        const symbolsRequested = typeof args.symbols === 'number' ? args.symbols : 0
        const withData = args.data_files === true
        const project = await readSlcProject(target.displayPath, { rungs: requested, symbols: symbolsRequested, dataFiles: withData })
        const name = baseName(path)
        const ladderFiles = project.files.filter(file => file.type === 1)
        const host = project.version === '' ? 'an unknown legacy-editor version' : `${project.product === '' ? 'a legacy editor' : project.product} ${project.version}`
        return {
          summary: `${name}: ${project.projectName === '' ? 'unnamed project' : project.projectName} on ${host} — ${project.files.length} program file(s) (${ladderFiles.length} ladder), ${project.totalRungs} rung(s), ${project.symbolCount} symbol record(s), ${project.dataFileCount} data file(s)${project.truncated ? ', rung text truncated' : ''}. Opened hidden, read-only, not saved.`,
          data: {
            file: path,
            format: extension.toUpperCase(),
            host: { product: 'RSLogix 500', version: project.version },
            project: { name: project.projectName, revision: project.revision },
            program_files: project.files,
            ladder_files: ladderFiles.length,
            total_rungs: project.totalRungs,
            rungs: project.rungs,
            truncated: project.truncated,
            symbol_count: project.symbolCount,
            symbols: project.symbols,
            data_file_count: project.dataFileCount,
            data_files: project.dataFiles,
            checks: { headless: true, read_only: true, saved: false, symbols_requested: symbolsRequested, data_tables: withData },
          },
          next: [
            { tool: 'l5k_lint', why: 'Lint the .L5K the migration wizard writes from this project before Studio imports it.' },
            { tool: 'migration_assess', why: 'Compare the source counts with the migrated project.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const compareTool: ToolDefinition = {
    name: 'migration_compare',
    description:
      'Compare an RSLogix 500 project read headlessly with the Logix .L5X export the migration produced: matched ladder files and routines, rung totals, symbol and data-file coverage, indirect addressing that survived, and every difference classified expected, real or cosmetic. Read-only; it does not claim runtime equivalence.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'The legacy .RSS, .ACH or .RSP project.' },
        logix: { type: 'string', description: 'The .L5X Studio exported after importing the migrated project.' },
      },
      required: ['source', 'logix'],
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const source = stringArg(args, 'source')
        const logixPath = stringArg(args, 'logix')
        const extension = extensionOf(source)
        if (extension !== 'rss' && extension !== 'ach' && extension !== 'rsp') {
          throw new MigrationError(
            'UNSUPPORTED_FORMAT',
            `${baseName(source)} is not an .RSS or .ACH file.`,
            'Pass the RSLogix 500 project itself; the comparison reads it headlessly.',
          )
        }
        if (extensionOf(logixPath) !== 'l5x') {
          throw new MigrationError(
            'UNSUPPORTED_FORMAT',
            `${baseName(logixPath)} is not an .L5X export.`,
            'Pass the .L5X Studio exported after the import, not the .L5K; the .L5K is checked by l5k_lint.',
          )
        }
        const sourceTarget = await fs.resolve(source, { cwd: exec.cwd })
        const sourceStat = await fs.stat(sourceTarget, exec.signal)
        if (sourceStat === undefined) {
          throw new MigrationError('FILE_MISSING', `No file at ${source}.`, 'Pass an existing .RSS, .ACH or .RSP path; this tool does not create files.')
        }
        const logixBytes = await readFile(fs, logixPath, exec)
        let logixText = new TextDecoder('utf-8').decode(logixBytes)
        if (logixText.startsWith('\uFEFF')) logixText = logixText.slice(1)
        const project = await readSlcProject(sourceTarget.displayPath, { rungs: 200, symbols: 500, dataFiles: true })
        const logix = readLogix(logixText)
        const comparison = compareSides(legacySideOf(project), logix)
        const real = comparison.differences.filter(difference => difference.kind === 'real')
        const expected = comparison.differences.filter(difference => difference.kind === 'expected')
        const cosmetic = comparison.differences.filter(difference => difference.kind === 'cosmetic')
        return {
          summary: `${baseName(source)} vs ${baseName(logixPath)}: ${comparison.matched.length} file(s) matched, ${comparison.rungTotals.matchedLegacy}/${comparison.rungTotals.legacy} legacy rung(s) accounted for; ${real.length} real, ${expected.length} expected, ${cosmetic.length} cosmetic difference(s).`,
          data: {
            source: { file: source, project: project.projectName },
            logix: { file: logixPath, controller: logix.controller, revision: logix.revision, routines: logix.routines.length, tags: logix.tags.length },
            matched: comparison.matched,
            rung_totals: comparison.rungTotals,
            missing_in_logix: comparison.missingInLogix,
            extra_routines: comparison.extraRoutines,
            symbols: comparison.symbols,
            data_files: comparison.dataFiles,
            indirect_in_logix: comparison.indirectReferencesInLogix,
            differences: comparison.differences,
            checks: { real: real.length, expected: expected.length, cosmetic: cosmetic.length },
          },
          next: [
            { tool: 'migration_plan', why: 'Record each real difference as an exception, and the build that proves the fix as evidence.' },
            { tool: 'draft_rung', why: 'Rewrite the rungs a real difference points at, one rung at a time, then build to prove it.' },
          ],
          coverage: COVERAGE,
        }
      } catch (error) {
        return failure(error)
      }
    },
  }

  const planTool: ToolDefinition = {
    name: 'migration_plan',
    description:
      'Record and read the resumable migration plan: the five decisions the intake interview must answer, the eight gated stages, the exceptions that remain and the evidence for each claim. Actions: create, read (default), answer, stage, exception. Writes only the plan JSON.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'read', 'answer', 'stage', 'exception'], description: 'What to do with the plan. Defaults to read.' },
        path: { type: 'string', description: 'Plan path. Defaults to .migration/plan.json under the workspace.' },
        source: { type: 'string', description: 'For create: the legacy project path the plan is about.' },
        family: { type: 'string', enum: ['slc500', 'plc5', 'unknown'], description: 'For create: which legacy family the source is.' },
        target_cpu: { type: 'string', description: 'Target Logix controller, for example 5069-L330ER.' },
        target_revision: { type: 'integer', minimum: 1, maximum: 40, description: 'Target firmware revision; 37 or newer can be proved by an offline build.' },
        io_strategy: { type: 'string', description: 'Keep the 1746 chassis behind a 1747-AENTR bridge, or replace the modules.' },
        hmi_scope: { type: 'string', description: 'Whether the HMI is in scope now or recorded for later.' },
        acceptance: { type: 'string', description: 'What proves the migration is accepted.' },
        stage: { type: 'string', enum: ['intake', 'assess', 'convert', 'lint', 'import', 'compare', 'engineer', 'commission'], description: 'For stage: which stage to set.' },
        status: { type: 'string', enum: ['pending', 'active', 'done', 'blocked'], description: 'For stage: the state to record. Defaults to done.' },
        evidence: { type: 'string', description: 'For stage: one line of evidence per entry, newline separated.' },
        note: { type: 'string', description: 'For stage: a short note that survives with the stage.' },
        id: { type: 'string', description: 'For exception: a stable id, for example "indirect-N7-130".' },
        kind: { type: 'string', description: 'For exception: what class of difference it is.' },
        description: { type: 'string', description: 'For exception: the difference in one sentence.' },
        rationale: { type: 'string', description: 'For exception: why it is accepted or how it was fixed.' },
        exception_status: { type: 'string', enum: ['open', 'accepted', 'fixed'], description: 'For exception: its state. Defaults to open.' },
      },
      additionalProperties: false,
    },
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        const action = typeof args.action === 'string' && args.action !== '' ? args.action : 'read'
        const path = planPathOf(args, exec)
        const decisions = (): ReturnType<typeof readDecisions> => {
          try {
            return readDecisions(args)
          } catch (error) {
            throw new MigrationError(
              'INVALID_DECISION',
              error instanceof Error ? error.message : String(error),
              'Answer in sentences: target_cpu, io_strategy, hmi_scope and acceptance need text, target_revision a whole number 1..40.',
            )
          }
        }
        if (action === 'create') {
          const source = stringArg(args, 'source')
          const family = typeof args.family === 'string' && (['slc500', 'plc5', 'unknown'] as const).includes(args.family as PlanSource['family'])
            ? args.family as PlanSource['family']
            : 'unknown'
          let plan = createPlan({ project: baseName(source).replace(/\.[^.]+$/u, ''), source: { family, path: source } })
          plan = withDecisions(plan, decisions())
          await writePlanFile(fs, path, plan, exec)
          return {
            summary: `Created ${path} for ${plan.project}: ${openQuestions(plan).length} interview question(s) remain before the plan is unblocked.`,
            data: { path, plan, state: planState(plan), next: nextAction(plan) },
            next: [{ tool: 'migration_plan', why: 'Answer the open decisions with action "answer"; the plan stays blocked until all five are recorded.' }],
            coverage: COVERAGE,
          }
        }
        const plan = await readPlanFile(fs, path, exec)
        if (action === 'read') {
          return {
            summary: `${summarize(plan)} ${nextAction(plan)}`,
            data: { path, plan, state: planState(plan), stage: currentStage(plan), next: nextAction(plan), open_questions: openQuestions(plan) },
            next: [{ tool: 'migration_plan', why: 'Answer a decision or move a stage with its evidence.' }],
            coverage: COVERAGE,
          }
        }
        if (action === 'answer') {
          const answered = withDecisions(plan, decisions())
          await writePlanFile(fs, path, answered, exec)
          return {
            summary: `Recorded the decisions in ${path}; ${openQuestions(answered).length} question(s) still open. ${nextAction(answered)}`,
            data: { path, plan: answered, state: planState(answered), open_questions: openQuestions(answered) },
            next: [{ tool: 'migration_plan', why: 'Read the plan, then move the stage you just finished.' }],
            coverage: COVERAGE,
          }
        }
        if (action === 'stage') {
          const stage = typeof args.stage === 'string' ? args.stage as StageId : undefined
          if (stage === undefined || !['intake', 'assess', 'convert', 'lint', 'import', 'compare', 'engineer', 'commission'].includes(stage)) {
            throw new MigrationError(
              'INVALID_ARGUMENT',
              'stage is required for action "stage".',
              'Pass one of intake, assess, convert, lint, import, compare, engineer, commission.',
            )
          }
          const status = typeof args.status === 'string' ? args.status as StageStatus : 'done'
          if (!['pending', 'active', 'done', 'blocked'].includes(status)) {
            throw new MigrationError('INVALID_ARGUMENT', `Unknown stage status ${status}.`, 'Pass pending, active, done or blocked.')
          }
          const evidence = typeof args.evidence === 'string' ? args.evidence.split(/\r?\n/u).map(line => line.trim()).filter(line => line !== '') : []
          const note = typeof args.note === 'string' && args.note.trim() !== '' ? args.note.trim() : undefined
          const staged = withStage(plan, stage, status, evidence, note)
          await writePlanFile(fs, path, staged, exec)
          return {
            summary: `Stage ${stage} recorded as ${status} in ${path}${evidence.length === 0 ? '' : `, with ${evidence.length} evidence line(s)`}. ${nextAction(staged)}`,
            data: { path, plan: staged, state: planState(staged), stage: currentStage(staged) },
            next: [{ tool: 'migration_plan', why: 'Move the next gate, or record the difference that blocks this one as an exception.' }],
            coverage: COVERAGE,
          }
        }
        if (action === 'exception') {
          const id = stringArg(args, 'id')
          const kind = stringArg(args, 'kind')
          const description = stringArg(args, 'description')
          const rationale = stringArg(args, 'rationale')
          const exceptionStatus = typeof args.exception_status === 'string' && ['open', 'accepted', 'fixed'].includes(args.exception_status)
            ? args.exception_status as PlanExceptionStatus
            : 'open'
          const excepted = withException(plan, { id, kind, description, rationale, status: exceptionStatus })
          await writePlanFile(fs, path, excepted, exec)
          const open = excepted.exceptions.filter(entry => entry.status === 'open').length
          return {
            summary: `Recorded exception ${id} as ${exceptionStatus} in ${path}; ${open} exception(s) remain open. ${nextAction(excepted)}`,
            data: { path, plan: excepted, state: planState(excepted), open_exceptions: open },
            next: [{ tool: 'migration_compare', why: 'Re-run the comparison after a fix, and record the build as evidence.' }],
            coverage: COVERAGE,
          }
        }
        throw new MigrationError(
          'INVALID_ARGUMENT',
          `Unknown action ${action}.`,
          'Pass create, read, answer, stage or exception.',
        )
      } catch (error) {
        return failure(error)
      }
    },
  }

  return [assessTool, lintTool, slcReadTool, compareTool, planTool]
}
