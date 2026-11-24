/**
 * Validate display XML against the installed FactoryTalk View schema.
 *
 * The vendor ships `Gfx-ME*.xsd` with Studio. Rather than re-implement an XSD
 * engine, this module asks .NET (through PowerShell) to validate in process,
 * which is exact and needs no third-party package. When the schema or the host
 * is unavailable the caller gets a clear `schema_unavailable` result instead of
 * a silent pass.
 *
 * @module dsh-engineering-ftview/schema
 */

import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { EngineeringError, type Coverage } from './core.ts'
import { parseSchemaModel, type SchemaModel, type SchemaSnapshot } from './xsd.ts'

/** Where Studio installs its display schemas. */
const SCHEMA_ROOTS = [
  'C:/Program Files (x86)/Rockwell Software/RSView Enterprise/Schemas',
  'C:/Program Files/Rockwell Software/RSView Enterprise/Schemas',
]

/** One file's validation outcome. */
export interface SchemaFinding {
  /** File or display name the finding belongs to. */
  readonly file: string
  /** Schema message, already rendered by .NET. */
  readonly message: string
  /** True when the schema rejected the document. */
  readonly error: boolean
}

/** One validation run. */
export interface SchemaValidation {
  /** Schema file used, or the reason validation could not run. */
  readonly schema?: string
  /** Findings across every document. */
  readonly findings: readonly SchemaFinding[]
  /** True when validation actually ran. */
  readonly ran: boolean
  /** Why it could not run, when it did not. */
  readonly unavailable?: string
}

/** Coverage note shared by every schema-dependent operation. */
export const SCHEMA_COVERAGE: Coverage = {
  complete: false,
  unverified: [
    'sequence order and occurrence counts are enforced by Studio, not by this check',
    'Studio import and runtime behaviour',
    'semantic intent of the logic behind a display',
  ],
}

/** The schema directory, or undefined when Studio is not installed here. */
export function schemaDirectory(): string | undefined {
  const override = process.env.FTVIEW_SCHEMA_DIR
  if (override !== undefined && override !== '') return existsSync(override) ? override : undefined
  return SCHEMA_ROOTS.find(root => existsSync(root))
}

/** Every installed schema version, newest last. */
export function schemaVersions(): readonly string[] {
  const directory = schemaDirectory()
  if (directory === undefined) return []
  const version = (name: string): number => Number.parseInt(name.replace(/\D+/gu, ''), 10)
  return readdirSync(directory)
    .filter(name => /^Gfx-ME\d+\.xsd$/iu.test(name))
    .sort((left, right) => version(left) - version(right))
}

/** The declared schema of one display, from `xsi:noNamespaceSchemaLocation`. */
export function declaredSchema(xml: string): string | undefined {
  const match = /xsi:noNamespaceSchemaLocation\s*=\s*"([^"]+)"/u.exec(xml)
  return match?.[1]
}

/**
 * Pick the schema file for one document.
 *
 * A display names its schema; if that file is not installed, the newest
 * installed schema is used and the caller is told which one ran.
 *
 * @param xml - Display XML, used only for its declared schema.
 * @returns Absolute schema path and its file name, or undefined.
 */
export function schemaFor(xml: string): { path: string; name: string } | undefined {
  const directory = schemaDirectory()
  if (directory === undefined) return undefined
  const declared = declaredSchema(xml)
  if (declared !== undefined && existsSync(join(directory, declared))) return { path: join(directory, declared), name: declared }
  const versions = schemaVersions()
  if (versions.length === 0) return undefined
  const newest = versions[versions.length - 1] as string
  return { path: join(directory, newest), name: newest }
}

/** The vocabulary a draft is written against, and where it came from. */
export interface Vocabulary {
  /** The resolved model: element types, their attributes and their children. */
  readonly model: SchemaModel
  /** `installed` when it came from this host's Studio, `bundled` otherwise. */
  readonly source: 'installed' | 'bundled'
  /** The schema file name the vocabulary came from. */
  readonly schema: string
}

/** Parsed installed schemas by file name, so one XSD is read once per process. */
const installedCache = new Map<string, SchemaModel | undefined>()

/**
 * The model of one installed schema, newest when no version is named.
 *
 * @param version - ME major version, e.g. 16. Omit for the newest installed.
 * @returns The resolved model, or undefined when no matching schema is installed.
 */
export function installedSchema(version?: number): SchemaModel | undefined {
  const directory = schemaDirectory()
  if (directory === undefined) return undefined
  const files = schemaVersions()
  if (files.length === 0) return undefined
  const wanted = version === undefined
    ? (files[files.length - 1] as string)
    : files.find(name => Number.parseInt(name.replace(/\D+/gu, ''), 10) === version)
  if (wanted === undefined) return undefined
  const hit = installedCache.get(wanted)
  if (hit !== undefined) return hit
  let model: SchemaModel | undefined
  try {
    model = parseSchemaModel(wanted, readFileSync(join(directory, wanted), 'utf8'))
  } catch {
    model = undefined
  }
  installedCache.set(wanted, model)
  return model
}

/** Where the bundled snapshot sits beside this build, in dev and in the payload. */
function bundledPath(): string {
  return fileURLToPath(new URL('../schema/me-schema.json', import.meta.url))
}

let bundledCache: SchemaSnapshot | undefined
let bundledTried = false

/**
 * The snapshot committed with the bundle, used when no Studio schema is here.
 *
 * @returns The snapshot, or undefined when it is missing or unreadable.
 */
export function bundledSchema(): SchemaSnapshot | undefined {
  if (bundledTried) return bundledCache
  bundledTried = true
  try {
    const raw = JSON.parse(readFileSync(bundledPath(), 'utf8')) as SchemaSnapshot
    if (!Array.isArray(raw.displayChildren) || raw.types === undefined) bundledCache = undefined
    else bundledCache = raw
  } catch {
    bundledCache = undefined
  }
  return bundledCache
}

/**
 * The vocabulary to draft against: this host's schema when Studio is installed,
 * the bundled snapshot otherwise. Reads and drafts work without Studio, so the
 * fallback is not an error — but the caller is told which one answered.
 *
 * @param version - ME major version to prefer, usually the export's own. When
 * that version is not installed the newest installed schema answers, because
 * the vendor software on this host is the authority for what it will accept.
 * @returns The model and its source.
 * @throws EngineeringError when neither the host nor the bundle can answer.
 */
export function vocabulary(version?: number): Vocabulary {
  const installed = installedSchema(version) ?? installedSchema()
  if (installed !== undefined) return { model: installed, source: 'installed', schema: installed.schema }
  const bundled = bundledSchema()
  if (bundled !== undefined) return { model: bundled, source: 'bundled', schema: bundled.schema }
  throw new EngineeringError(
    'SCHEMA_UNAVAILABLE',
    'No FactoryTalk View display vocabulary is available: no Gfx-ME*.xsd is installed and the bundled snapshot cannot be read.',
    `Install FactoryTalk View Studio, set FTVIEW_SCHEMA_DIR to the folder holding Gfx-ME*.xsd, or regenerate the snapshot with pnpm schema:ftview. Looked for the snapshot at ${bundledPath()}.`,
  )
}

/**
 * The ME major version a new display should declare, as the export writes it.
 *
 * The hard-coded `17` this module once defaulted to is a defect: Studio's Add
 * Component Tool resolves the schema name against the schemas its own release
 * installed, so a display tagged for a release the host never installed imports
 * as an empty display. The answer is the newest schema this machine can see,
 * falling back to the bundled snapshot's version when no Studio is installed.
 *
 * @returns The major version as a decimal string, e.g. "16".
 */
export function defaultSchemaVersion(): string {
  return String(vocabulary().model.version)
}

/** The newest ME major version this host can draft against, when one is installed. */
export function installedSchemaVersion(): number | undefined {
  const directory = schemaDirectory()
  if (directory === undefined) return undefined
  const files = schemaVersions()
  if (files.length === 0) return undefined
  return Number.parseInt((files[files.length - 1] as string).replace(/\D+/gu, ''), 10)
}

/** The bytes of one file, hashed for the snapshot's provenance. */
export function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** PowerShell that validates a batch of XML strings against one schema. */
const VALIDATOR = `
$ErrorActionPreference = 'Stop'
$payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
$schemas = New-Object System.Xml.Schema.XmlSchemaSet
$null = $schemas.Add('', [string]$payload.schema)
$results = New-Object System.Collections.ArrayList
foreach ($item in $payload.items) {
  $messages = New-Object 'System.Collections.Generic.List[string]'
  $settings = New-Object System.Xml.XmlReaderSettings
  $settings.ValidationType = [System.Xml.ValidationType]::Schema
  $settings.Schemas = $schemas
  $settings.ValidationFlags = $settings.ValidationFlags -bor [System.Xml.Schema.XmlSchemaValidationFlags]::ReportValidationWarnings
  $handler = [System.Xml.Schema.ValidationEventHandler]{ param($sender, $eventArgs) $messages.Add("$($eventArgs.Severity): $($eventArgs.Message)") }
  $settings.add_ValidationEventHandler($handler)
  $reader = [System.Xml.XmlReader]::Create((New-Object System.IO.StringReader([string]$item.xml)), $settings)
  try { while ($reader.Read()) { } } catch { $messages.Add("error: $($_.Exception.Message)") } finally { $reader.Dispose() }
  [void]$results.Add([pscustomobject]@{ file = [string]$item.file; messages = @($messages) })
}
$results | ConvertTo-Json -Depth 4 -Compress
`

/** One item handed to the validator. */
export interface SchemaDocument {
  /** Name reported in findings. */
  readonly file: string
  /** Display XML. */
  readonly xml: string
}

/**
 * Validate one batch of display documents against the installed schema.
 *
 * @param documents - Documents to check; an empty list runs nothing.
 * @param executable - PowerShell to use; defaults to `powershell.exe`.
 * @returns Findings, whether validation ran, and the schema used.
 */
export async function validateSchema(documents: readonly SchemaDocument[], executable = 'powershell.exe'): Promise<SchemaValidation> {
  if (documents.length === 0) return { findings: [], ran: true }
  // Only Studio documents declare a schema. A hand-made <display> file is not
  // one, and validating it against Gfx-ME would report a root element the
  // fixture never claimed to be. Such files are skipped, with a reason.
  const declared = documents.filter(document => declaredSchema(document.xml) !== undefined)
  if (declared.length === 0) {
    return {
      findings: [],
      ran: false,
      unavailable: 'None of the changed documents declares xsi:noNamespaceSchemaLocation, so there is no vendor schema to validate against. Studio exports and authored displays always declare one.',
    }
  }
  const first = declared[0] as SchemaDocument
  const schema = schemaFor(first.xml)
  if (schema === undefined) {
    return {
      findings: [],
      ran: false,
      unavailable: 'No Gfx-ME*.xsd schema is installed on this host. Install FactoryTalk View Studio, or set FTVIEW_SCHEMA_DIR to the folder that holds Gfx-ME*.xsd.',
    }
  }
  const payload = JSON.stringify({ schema: schema.path, items: declared })
  const encoded = Buffer.from(VALIDATOR, 'utf16le').toString('base64')
  const output = await runPowerShell(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], payload)
  if (output.code !== 0) {
    return {
      findings: [],
      ran: false,
      schema: schema.name,
      unavailable: `The schema validator did not run: ${output.stderr.trim() || `exit ${output.code}`}`,
    }
  }
  const parsed = JSON.parse(output.stdout) as readonly { file: string; messages: readonly string[] }[]
  const findings: SchemaFinding[] = []
  for (const result of Array.isArray(parsed) ? parsed : [parsed]) {
    for (const message of result.messages ?? []) {
      findings.push({ file: result.file, message, error: message.startsWith('Error') || message.startsWith('error:') })
    }
  }
  return { findings, ran: true, schema: schema.name }
}

/** Run one process with stdin and collect its output. */
function runPowerShell(executable: string, args: readonly string[], stdin: string): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise(resolvePromise => {
    const child = spawn(executable, args, { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr?.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', error => resolvePromise({ code: -1, stdout, stderr: stderr || error.message }))
    child.on('close', code => resolvePromise({ code: code ?? -1, stdout, stderr }))
    child.stdin?.end(stdin, 'utf8')
  })
}
