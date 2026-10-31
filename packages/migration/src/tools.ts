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
import { jsonText, type FsService, type ToolDefinition, type ToolExec } from './core/tool.ts'

/** The largest file these tools will read. */
const MAX_BYTES = 64 * 1024 * 1024

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
  const code = error instanceof MigrationError
    ? error.code
    : typeof error === 'object' && error !== null && typeof (error as { code?: unknown }).code === 'string'
      ? (error as { code: string }).code
      : 'INTERNAL'
  const message = error instanceof Error ? error.message : String(error)
  const fix = error instanceof MigrationError
    ? error.fix
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
          throw new MigrationError('UNSUPPORTED_FORMAT', `${baseName(path)} is not an .L5K file.`, 'Call migration_assess for an .SLC or .RSS file; l5k_lint reads only the text Studio imports.')
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
      'Assess one legacy export before a migration: for an .L5K it returns the lint verdict and the controller facts; for an RSLogix 500 .SLC text export it counts ladder files, rungs, racks and data files; for an .RSS or .ACH container it states what the binary needs (RSLogix 500, then Save As .SLC or the migration wizard). It never edits the file and never contacts a controller.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path to the legacy file to assess (.l5k, .slc, .rss or .ach).' },
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

        if (extension === 'rss' || extension === 'ach') {
          const bytes = await readFile(fs, path, exec)
          return {
            summary: `${name}: RSLogix 500 container, ${bytes.length} bytes. RSLogix 500 owns this format; save it as .SLC or run the migration wizard to get text this package can read.`,
            data: {
              file: path,
              format: extension.toUpperCase(),
              facts: { bytes: bytes.length },
              checks: { text_readable: false, needs_rslogix_500: true },
            },
            next: [
              { tool: 'migration_assess', why: 'Assess the .SLC or .L5K once RSLogix 500 has written it.' },
            ],
            coverage: COVERAGE,
          }
        }

        if (extension === 'l5x') {
          throw new MigrationError('ALREADY_LOGIX', `${name} is a Logix L5X export, not a legacy file.`, 'Open it with open_project; this row reads the source side and the .L5K the wizard writes.')
        }

        throw new MigrationError(
          'UNSUPPORTED_FORMAT',
          `${name} is not an .L5K, .SLC, .RSS or .ACH file.`,
          'Pass the file the migration writes (.L5K) or the RSLogix 500 export (.SLC, .RSS, .ACH).',
        )
      } catch (error) {
        return failure(error)
      }
    },
  }

  return [assessTool, lintTool]
}
