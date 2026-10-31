/**
 * Read an RSLogix 500 `.RSS`/`.ACH` or RSLogix 5 `.RSP` project headlessly.
 *
 * Both products expose a 32-bit COM automation server (`RSLogix500.Application`
 * and `RSLogix5.Application`). A 64-bit process cannot activate either, so this
 * module starts the 32-bit Windows PowerShell, opens the project hidden, walks
 * `ProgramFiles` and asks each ladder file for its rung text, then quits. No
 * window is shown and nothing is saved.
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
  /**
   * The text of the last rung, when the read asked for rungs.
   *
   * SLC ladder files end in a terminal `END` rung that the migration does not
   * reproduce, so counting it as a lost rung would be a false alarm.
   */
  readonly lastRung?: string
}

/** One rung read from a ladder file. */
export interface SlcRung {
  readonly file: string
  readonly rung: number
  readonly text: string
}

/** One address/symbol record from the RSLogix 500 database. */
export interface SlcSymbol {
  readonly address: string
  readonly symbol: string
  readonly description: string
  readonly scope: number
}

/** One integer, timer, counter, control, bit, float or I/O data file. */
export interface SlcDataFile {
  readonly number: number
  readonly type: string
  readonly name: string
  readonly elements: number
}

/** What a headless read returned. */
export interface SlcProject {
  readonly path: string
  readonly version: string
  readonly product: string
  readonly projectName: string
  readonly revision: number | undefined
  readonly files: readonly SlcFile[]
  readonly totalRungs: number
  readonly rungs: readonly SlcRung[]
  /** How many address/symbol records the database holds, whether or not they were read. */
  readonly symbolCount: number
  readonly symbols: readonly SlcSymbol[]
  /** How many data files the project declares, whether or not they were read. */
  readonly dataFileCount: number
  readonly dataFiles: readonly SlcDataFile[]
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
$symbolLimit = [int]$env:DSH_SLC_SYMBOLS
$withData = $env:DSH_SLC_DATA -eq '1'

try {
  $progId = [string]$env:DSH_SLC_PROGID
  if ($progId -eq '') { $progId = 'RSLogix500.Application' }
  $app = New-Object -ComObject $progId
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
    $lastRung = ''
    if ($rungCount -gt 0) {
      try { $lastRung = ([string]$file.GetRungAsNeutralText($rungCount - 1)).Trim() } catch { $lastRung = '' }
    }
    $files += @{ number = $number; name = $name; type = $type; rungs = $rungCount; lastRung = $lastRung }
    if ($withRungs -and -not $budgetSpent -and $rungCount -gt 0) {
      for ($rung = 0; $rung -lt $rungCount; $rung++) {
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

$symbolCount = 0
$symbols = @()
try {
  $records = $project.AddrSymRecords
  $symbolCount = [int]$records.Count()
  if ($symbolLimit -gt 0) {
    $take = [Math]::Min($symbolLimit, $symbolCount)
    for ($index = 1; $index -le $take; $index++) {
      $record = $records.GetRecordViaIndex($index)
      $address = ''
      $symbol = ''
      $description = ''
      $scope = 0
      try { $address = [string]$record.Address() } catch {}
      try { $symbol = [string]$record.Symbol() } catch {}
      try { $description = [string]$record.Description() } catch {}
      try { $scope = [int]$record.Scope() } catch {}
      if ($address -ne '' -or $symbol -ne '' -or $description -ne '') {
        $symbols += @{ address = $address; symbol = $symbol; description = $description; scope = $scope }
      }
    }
  }
} catch {}

$dataFileCount = 0
$dataFiles = @()
if ($withData) {
  try {
    $dataTable = $project.DataFiles
    $dataFileCount = [int]$dataTable.Count()
    for ($index = 1; $index -le $dataFileCount; $index++) {
      $file = $dataTable.Item($index)
      $number = 0
      $type = ''
      $name = ''
      $elements = 0
      try { $number = [int]$file.FileNumber } catch {}
      try { $type = [string]$file.TypeAsString } catch {}
      try { $name = [string]$file.Name } catch {}
      try { $elements = [int]$file.NumberOfElements } catch {}
      $dataFiles += @{ number = $number; type = $type; name = $name; elements = $elements }
    }
  } catch {}
} else {
  try { $dataFileCount = [int]$project.DataFiles.Count() } catch {}
}

$revision = $null
try { $revision = [int]$project.Revision } catch {}$projectName = ''
try { $projectName = [string]$project.Name } catch {}
$version = ''
try { $version = [string]$app.Version } catch {}
$productName = ''
try { $productName = [string]$app.Name } catch {}

try { $app.Quit($true, $false) } catch {}

Emit @{
  ok = $true
  version = $version
  projectName = $projectName
  revision = $revision
  files = @($files)
  totalRungs = $total
  rungs = @($rungs)
  symbolCount = $symbolCount
  symbols = @($symbols)
  dataFileCount = $dataFileCount
  dataFiles = @($dataFiles)
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
  readonly files?: readonly { readonly number?: number; readonly name?: string; readonly type?: number; readonly rungs?: number; readonly lastRung?: string }[]
  readonly totalRungs?: number
  readonly rungs?: readonly { readonly file?: string; readonly rung?: number; readonly text?: string }[]
  readonly symbolCount?: number
  readonly symbols?: readonly { readonly address?: string; readonly symbol?: string; readonly description?: string; readonly scope?: number }[]
  readonly dataFileCount?: number
  readonly dataFiles?: readonly { readonly number?: number; readonly type?: string; readonly name?: string; readonly elements?: number }[]
  readonly truncated?: boolean
}

/** The automation ProgID for the legacy product that owns this file. */
function progIdOf(path: string): string {
  return /\.rsp$/iu.test(path) ? 'RSLogix5.Application' : 'RSLogix500.Application'
}

/** Run the read script in the 32-bit host and return its answer. */
async function runRead(
  path: string,
  limit: number,
  withRungs: boolean,
  symbolLimit: number,
  withData: boolean,
  timeoutMs: number,
): Promise<RawAnswer> {
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
          DSH_SLC_PROGID: progIdOf(path),
          DSH_SLC_LIMIT: String(limit),
          DSH_SLC_RUNGS: withRungs ? '1' : '0',
          DSH_SLC_SYMBOLS: String(symbolLimit),
          DSH_SLC_DATA: withData ? '1' : '0',
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
        `The legacy editor did not answer within ${Math.round(timeoutMs / 1000)} seconds for ${path}.`,
        'Close any legacy-editor window (including a hidden instance from an earlier attempt), then retry; a first open of a large project can take a minute.',
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
  options: { readonly rungs?: number; readonly symbols?: number; readonly dataFiles?: boolean; readonly timeoutMs?: number } = {},
): Promise<SlcProject> {
  // The rung text a caller asks for is bounded by the tool schema, not here: a
  // conversion audit needs the whole ladder (a PLC-5 file can run past 300
  // rungs), while `slc_read` keeps its own summary-sized limit.
  const limit = Math.max(0, Math.min(options.rungs ?? 0, 100_000))
  const withRungs = limit > 0
  const symbolLimit = Math.max(0, Math.min(options.symbols ?? 0, 5000))
  const withData = options.dataFiles === true
  try {
    if (!statSync(path).isFile()) throw new Error('not a file')
  } catch {
    throw new SlcError(
      'SLC_FILE_MISSING',
      `No file at ${path}.`,
      'Pass the path of an existing .RSS, .ACH or .RSP project; the reader only opens that file.',
    )
  }
  const answer = await runRead(path, limit, withRungs, symbolLimit, withData, options.timeoutMs ?? DEFAULT_TIMEOUT_MS)
  if (answer.ok !== true) {
    const code = typeof answer.code === 'string' ? answer.code : 'SLC_READ_FAILED'
    const message = typeof answer.message === 'string' ? answer.message : 'The legacy editor could not read the project.'
    const fix = code === 'SLC_COM_UNAVAILABLE'
      ? 'Install and activate RSLogix 500 or RSLogix 5 on this 32-bit automation host; without it, Save As .SLC (or run the migration wizard) and read that output instead.'
      : code === 'SLC_NO_PROJECT'
        ? 'Check that the file is a project this installation can open (an .RSS/.ACH for RSLogix 500, an .RSP for RSLogix 5), and that no legacy-editor dialog is waiting.'
        : code === 'SLC_OPEN_FAILED'
          ? 'Close any RSLogix window, check the file is not locked or corrupt, then retry.'
          : 'Correct the path and retry; the reader only opens the project and never saves it.'
    throw new SlcError(code, message, fix)
  }
  const files = (answer.files ?? []).map(file => ({
    number: file.number ?? 0,
    name: file.name ?? '',
    type: file.type ?? 0,
    rungs: file.rungs ?? 0,
    lastRung: file.lastRung ?? '',
  }))
  const rungs = (answer.rungs ?? []).map(rung => ({
    file: rung.file ?? '',
    rung: rung.rung ?? 0,
    text: rung.text ?? '',
  }))
  const symbols = (answer.symbols ?? []).map(symbol => ({
    address: symbol.address ?? '',
    symbol: symbol.symbol ?? '',
    description: symbol.description ?? '',
    scope: symbol.scope ?? 0,
  }))
  const dataFiles = (answer.dataFiles ?? []).map(file => ({
    number: file.number ?? 0,
    type: file.type ?? '',
    name: file.name ?? '',
    elements: file.elements ?? 0,
  }))
  return {
    path,
    version: answer.version ?? '',
    product: progIdOf(path) === 'RSLogix5.Application' ? 'RSLogix 5' : 'RSLogix 500',
    projectName: answer.projectName ?? '',
    revision: typeof answer.revision === 'number' ? answer.revision : undefined,
    files,
    totalRungs: answer.totalRungs ?? files.reduce((sum, file) => sum + file.rungs, 0),
    rungs,
    symbolCount: answer.symbolCount ?? symbols.length,
    symbols,
    dataFileCount: answer.dataFileCount ?? dataFiles.length,
    dataFiles,
    truncated: answer.truncated === true,
  }
}
