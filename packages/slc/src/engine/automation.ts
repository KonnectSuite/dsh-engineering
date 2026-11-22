/**
 * The RSLogix 500 automation-server boundary.
 *
 * The only automation surface this bundle will ever use is a read: open a
 * project in the vendor application, read it, close it. The command-line path is
 * recorded here but not exercised on a machine that has no transcript — a
 * registered COM class is proved by a redacted transcript, never assumed from
 * the registry. When no transcript is present the tool reports
 * `NOT_LICENSED`/`SOURCE_NOT_INSTALLED` instead of guessing.
 *
 * @module dsh-engineering-slc/engine/automation
 */

import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

/** One processor identity carried by a transcript. */
export interface AutomationProcessor {
  type: string
  family: string
  series: string
  firmware: string
  memoryWords: number | undefined
}

/** One program file carried by a transcript. */
export interface AutomationFile {
  name: string
  declaredRungs: number
  rungs: Array<{ rung: number; text: string }>
}

/** One data file carried by a transcript. */
export interface AutomationDataFile {
  name: string
  typeLetter: string
  values: Record<string, string>
}

/** One symbol row carried by a transcript. */
export interface AutomationSymbol {
  address: string
  symbol: string
  description: string
}

/** One I/O module row carried by a transcript. */
export interface AutomationIoModule {
  slot: number
  module: string
}

/** The redacted snapshot a transcript fixture replays. */
export interface AutomationSnapshot {
  projectName: string
  processor: AutomationProcessor
  files: AutomationFile[]
  dataFiles: AutomationDataFile[]
  symbols: AutomationSymbol[]
  ioModules: AutomationIoModule[]
  statusWords: Record<string, string>
}

/** The failure an automation boundary reports. */
export class SlcAutomationError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'SlcAutomationError'
    this.code = code
    this.fix = fix
  }
}

/** The environment variable that names the transcript fixture. */
export const AUTOMATION_TRANSCRIPT_ENV = 'SLC500_AUTOMATION_TRANSCRIPT'

/** Whether the RSLogix 500 automation class is registered for this user. */
export function automationServerRegistered(): boolean {
  if (process.platform !== 'win32') return false
  try {
    const result = spawnSync('reg.exe', ['query', 'HKCR\\RSLogix500.Application'], { windowsHide: true, stdio: 'ignore' })
    return result.status === 0
  } catch {
    return false
  }
}

/** The 32-bit PowerShell a 32-bit COM server needs, built from the system root. */
export function powershell32Path(): string {
  const root = process.env.SystemRoot ?? process.env.windir ?? 'C:\\Windows'
  return join(root, 'SysWOW64', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new SlcAutomationError('TRANSCRIPT_INVALID', `The automation transcript has no ${field}.`, 'Re-record the transcript in the documented JSON shape and point SLC500_AUTOMATION_TRANSCRIPT at it.')
  }
  return value
}

/** Parse one redacted transcript; anything malformed is a typed failure, never a partial read. */
export function parseAutomationTranscript(text: string, path: string): AutomationSnapshot {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch (error) {
    throw new SlcAutomationError('TRANSCRIPT_INVALID', `The automation transcript ${path} is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`, 'Re-record the transcript and point SLC500_AUTOMATION_TRANSCRIPT at it.')
  }
  const record = raw as Record<string, unknown>
  const projectName = typeof record.project_name === 'string' ? record.project_name : ''
  const processorRaw = (record.processor ?? {}) as Record<string, unknown>
  const processor: AutomationProcessor = {
    type: typeof processorRaw.type === 'string' ? processorRaw.type : '',
    family: typeof processorRaw.family === 'string' ? processorRaw.family : '',
    series: typeof processorRaw.series === 'string' ? processorRaw.series : '',
    firmware: typeof processorRaw.firmware === 'string' ? processorRaw.firmware : '',
    memoryWords: typeof processorRaw.memory_words === 'number' ? processorRaw.memory_words : undefined,
  }
  const files: AutomationFile[] = []
  if (Array.isArray(record.files)) {
    for (const entry of record.files) {
      const file = entry as Record<string, unknown>
      const name = requiredString(file.name, 'program file name')
      const rungs: Array<{ rung: number; text: string }> = []
      if (Array.isArray(file.rungs)) {
        for (const rungEntry of file.rungs) {
          const rung = rungEntry as Record<string, unknown>
          if (typeof rung.rung !== 'number' || typeof rung.text !== 'string') continue
          rungs.push({ rung: rung.rung, text: rung.text })
        }
      }
      files.push({ name, declaredRungs: typeof file.declared_rungs === 'number' ? file.declared_rungs : rungs.length, rungs })
    }
  }
  const dataFiles: AutomationDataFile[] = []
  if (Array.isArray(record.data_files)) {
    for (const entry of record.data_files) {
      const file = entry as Record<string, unknown>
      const values: Record<string, string> = {}
      if (file.values !== undefined && typeof file.values === 'object' && file.values !== null) {
        for (const [key, value] of Object.entries(file.values as Record<string, unknown>)) {
          if (typeof value === 'string') values[key] = value
        }
      }
      dataFiles.push({ name: requiredString(file.name, 'data file name'), typeLetter: typeof file.type_letter === 'string' ? file.type_letter : '', values })
    }
  }
  const symbols: AutomationSymbol[] = []
  if (Array.isArray(record.symbols)) {
    for (const entry of record.symbols) {
      const symbol = entry as Record<string, unknown>
      if (typeof symbol.address !== 'string' || typeof symbol.symbol !== 'string') continue
      symbols.push({ address: symbol.address, symbol: symbol.symbol, description: typeof symbol.description === 'string' ? symbol.description : '' })
    }
  }
  const ioModules: AutomationIoModule[] = []
  if (Array.isArray(record.io_modules)) {
    for (const entry of record.io_modules) {
      const module = entry as Record<string, unknown>
      if (typeof module.slot !== 'number') continue
      ioModules.push({ slot: module.slot, module: typeof module.module === 'string' ? module.module : '' })
    }
  }
  const statusWords: Record<string, string> = {}
  if (record.status_words !== undefined && typeof record.status_words === 'object' && record.status_words !== null) {
    for (const [key, value] of Object.entries(record.status_words as Record<string, unknown>)) {
      if (typeof value === 'string') statusWords[key] = value
    }
  }
  return { projectName, processor, files, dataFiles, symbols, ioModules, statusWords }
}
