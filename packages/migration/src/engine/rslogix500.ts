/**
 * Read an RSLogix 500 `.RSS` / `.ACH` project headlessly.
 *
 * RSLogix 500 exposes a 32-bit COM automation server (`RSLogix500.Application`).
 * A 64-bit process cannot activate it, so this module starts the 32-bit Windows
 * PowerShell, opens the project hidden, walks `ProgramFiles` and asks each ladder
 * file for its rung text, then quits. No window is shown and nothing is saved.
 *
 * Read-only by design: `SaveAs` and the insert methods exist, but a migration is
 * proved by reading the old program and comparing it with the new one, and a
 * headless save was observed to block on a dialog.
 */

import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'

/** One program file in the legacy project. */
export interface SlcFile {
  readonly number: number
  readonly name: string
  /** The RSLogix 500 file type; 1 is a ladder file. */
  readonly type: number
  readonly rungs: number
}

/** One rung read from a ladder file. */
export interface SlcRung {
  readonly file: string
  readonly rung: number
  readonly text: string
}

/** What a headless read returned. */
export interface SlcProject {
  readonly path: string
  readonly version: string
  readonly projectName: string
  readonly revision: number | undefined
  readonly files: readonly SlcFile[]
  readonly totalRungs: number
  readonly rungs: readonly SlcRung[]
  /** True when the rung limit stopped the walk before every requested rung. */
  readonly truncated: boolean
}

/** A failure with a code and a fix, like every other tool in this bundle. */
export class SlcError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'SlcError'
    this.code = code
    this.fix = fix
  }
}

/** How long one headless open may take before the tool gives up. */
const DEFAULT_TIMEOUT_MS = 120_000

/** The marker the PowerShell side writes before its JSON answer. */
const MARKER = '###SLC_JSON###'

/** The 32-bit Windows PowerShell, which is the only host that sees the COM server. */
function powershell32(): string {
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  return `${windir}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/**
 * The script the 32-bit host runs.
 *
 * The path, the rung budget and the rung switch travel as environment variables,
 * so a path with quotes or spaces cannot become code.
 */
const READ_SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
function Emit($value) {
  $json = $value | ConvertTo-Json -Depth 8 -Compress
  [Console]::Out.WriteLine('###SLC_JSON###' + $json)
  [Console]::Out.Flush()
}
function Fail($code, $message) {
  Emit @{ ok = $false; code = $code; message = $message }
  exit 0
}
$path = $env:DSH_SLC_PATH
$limit = [int]$env:DSH_SLC_LIMIT
$withRungs = $env:DSH_SLC_RUNGS -eq '1'

try {
  $app = New-Object -ComObject RSLogix500.Application
} catch {
  Fail 'SLC_COM_UNAVAILABLE' ($_.Exception.Message)
}
try { $app.Visible = $false } catch {}

try {
  $project = $app.FileOpen($path, $false, $false, $false, $false, $null)
} catch {
  try { $app.Quit($true, $false) } catch {}
  Fail 'SLC_OPEN_FAILED' ($_.Exception.Message)
}

if ($null -eq $project) {
  try {
    $project = $app.GetActiveProject()
  } catch {
    try { $app.Quit($true, $false) } catch {}
    Fail 'SLC_NO_PROJECT' ($_.Exception.Message)
  }
}
if ($null -eq $project) {
  try { $app.Quit($true, $false) } catch {}
  Fail 'SLC_NO_PROJECT' 'RSLogix 500 opened no project. The file may not be one it can read, or the open may have been refused.'
}

$files = @()
$rungs = @()
$total = 0
$truncated = $false
$budgetSpent = $false
try {
  $collection = $project.ProgramFiles
  $count = $collection.Count()
  for ($index = 1; $index -le $count; $index++) {
    $file = $collection.Item($index)
    $type = 0
    $number = 0
    $name = ''
    try { $type = [int]$file.Type } catch {}
    try { $number = [int]$file.FileNumber } catch {}
    try { $name = [string]$file.Name } catch {}
    $rungCount = 0
    try { $rungCount = [int]$file.NumberOfRungs() } catch {}
    $total = $total + $rungCount
    $files += @{ number = $number; name = $name; type = $type; rungs = $rungCount }
    if ($withRungs -and -not $budgetSpent -and $rungCount -gt 0) {
      for ($rung = 1; $rung -le $rungCount; $rung++) {
        if ($limit -ge 0 -and $rungs.Count -ge $limit) { $truncated = $true; $budgetSpent = $true; break }
        $text = ''
        try { $text = [string]$file.GetRungAsNeutralText($rung) } catch { $text = '' }
        $rungs += @{ file = $name; rung = $rung; text = $text.Trim() }
      }
    }
  }
} catch {
  try { $app.Quit($true, $false) } catch {}
  Fail 'SLC_READ_FAILED' ($_.Exception.Message)
}

$revision = $null
try { $revision = [int]$project.Revision } catch {}
$projectName = ''
try { $projectName = [string]$project.Name } catch {}
$version = ''
try { $version = [string]$app.Version } catch {}

try { $app.Quit($true, $false) } catch {}

Emit @{
  ok = $true
  version = $version
  projectName = $projectName
  revision = $revision
  files = @($files)
  totalRungs = $total
  rungs = @($rungs)
  truncated = $truncated
}
`

/** The JSON shape the PowerShell side writes. */
interface RawAnswer {
  readonly ok?: boolean
  readonly code?: string
  readonly message?: string
  readonly version?: string
  readonly projectName?: string
  readonly revision?: number | null
  readonly files?: readonly { readonly number?: number; readonly name?: string; readonly type?: number; readonly rungs?: number }[]
  readonly totalRungs?: number
  readonly rungs?: readonly { readonly file?: string; readonly rung?: number; readonly text?: string }[]
  readonly truncated?: boolean
}

/** Run the read script in the 32-bit host and return its answer. */
async function runRead(path: string, limit: number, withRungs: boolean, timeoutMs: number): Promise<RawAnswer> {
  const executable = powershell32()
  const script = path
  const encoded = Buffer.from(READ_SCRIPT, 'utf16le').toString('base64')
  return await new Promise<RawAnswer>((resolvePromise, rejectPromise) => {
    const child = spawn(
      executable,
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        env: {
          ...process.env,
          DSH_SLC_PATH: script,
          DSH_SLC_LIMIT: String(limit),
          DSH_SLC_RUNGS: withRungs ? '1' : '0',
        },
      },
    )
    let stdout = ''
    let stderr = ''
    let settled = false
    const finish = (value: RawAnswer | undefined, error?: SlcError): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (error !== undefined) rejectPromise(error)
      else resolvePromise(value ?? {})
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(undefined, new SlcError(
        'SLC_TIMEOUT',
        `RSLogix 500 did not answer within ${Math.round(timeoutMs / 1000)} seconds for ${path}.`,
        'Close any RSLogix 500 window (including a hidden instance from an earlier attempt), then retry; a first open of a large project can take a minute.',
      ))
    }, timeoutMs)
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString('utf8') })
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString('utf8') })
    child.on('error', (error: Error) => {
      finish(undefined, new SlcError(
        'SLC_POWERSHELL_MISSING',
        `The 32-bit Windows PowerShell could not be started: ${error.message}`,
        'This tool needs a 32-bit Windows host with Windows PowerShell (SysWOW64). Run it on the engineering PC, or Save As .SLC in RSLogix 500 and read that file instead.',
      ))
    })
    child.on('close', () => {
      const line = stdout.split(/\r?\n/u).reverse().find(entry => entry.startsWith(MARKER))
      if (line === undefined) {
        finish(undefined, new SlcError(
          'SLC_NO_ANSWER',
          `RSLogix 500 produced no answer.${stderr.trim() === '' ? '' : ` ${stderr.trim().slice(0, 300)}`}`,
          'Check that RSLogix 500 is installed and activated, that the file opens in it, and that no dialog is waiting behind the hidden window.',
        ))
        return
      }
      try {
        finish(JSON.parse(line.slice(MARKER.length)) as RawAnswer)
      } catch (error) {
        finish(undefined, new SlcError(
          'SLC_BAD_ANSWER',
          `The answer could not be read: ${error instanceof Error ? error.message : String(error)}`,
          'Retry once; if it persists, read the file in RSLogix 500 and Save As .SLC.',
        ))
      }
    })
  })
}

/**
 * Read a legacy RSLogix 500 project headlessly.
 *
 * @param path - absolute path to the `.RSS` or `.ACH` file.
 * @param options - rung budget and timeout.
 * @returns the project summary and the requested rung text.
 * @throws SlcError when the host, the project or the answer is unusable.
 */
export async function readSlcProject(
  path: string,
  options: { readonly rungs?: number; readonly timeoutMs?: number } = {},
): Promise<SlcProject> {
  const limit = Math.max(0, Math.min(options.rungs ?? 0, 200))
  const withRungs = limit > 0
  try {
    if (!statSync(path).isFile()) throw new Error('not a file')
  } catch {
    throw new SlcError(
      'SLC_FILE_MISSING',
      `No file at ${path}.`,
      'Pass the path of an existing .RSS or .ACH project; the reader only opens that file.',
    )
  }
  const answer = await runRead(path, limit, withRungs, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  if (answer.ok !== true) {
    const code = typeof answer.code === 'string' ? answer.code : 'SLC_READ_FAILED'
    const message = typeof answer.message === 'string' ? answer.message : 'RSLogix 500 could not read the project.'
    const fix = code === 'SLC_COM_UNAVAILABLE'
      ? 'Install and activate RSLogix 500 on this 32-bit automation host; without it, Save As .SLC in the application and read the text export instead.'
      : code === 'SLC_NO_PROJECT'
        ? 'Check that the file is an RSLogix 500 project this installation can open, and that no RSLogix 500 dialog is waiting.'
        : code === 'SLC_OPEN_FAILED'
          ? 'Close any RSLogix 500 window, check the file is not locked or corrupt, then retry.'
          : 'Correct the path and retry; the reader only opens the project and never saves it.'
    throw new SlcError(code, message, fix)
  }
  const files = (answer.files ?? []).map(file => ({
    number: file.number ?? 0,
    name: file.name ?? '',
    type: file.type ?? 0,
    rungs: file.rungs ?? 0,
  }))
  const rungs = (answer.rungs ?? []).map(rung => ({
    file: rung.file ?? '',
    rung: rung.rung ?? 0,
    text: rung.text ?? '',
  }))
  return {
    path,
    version: answer.version ?? '',
    projectName: answer.projectName ?? '',
    revision: typeof answer.revision === 'number' ? answer.revision : undefined,
    files,
    totalRungs: answer.totalRungs ?? files.reduce((sum, file) => sum + file.rungs, 0),
    rungs,
    truncated: answer.truncated === true,
  }
}
