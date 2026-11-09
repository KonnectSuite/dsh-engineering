/**
 * Read an RSLogix 5 (PLC-5) `.RSP` project headlessly through the vendor's
 * own automation server.
 *
 * RSLogix 5 exposes a COM automation server (`RSLogix5.Application`) registered
 * as an out-of-process LocalServer32. The server is driven from the 32-bit
 * Windows PowerShell: the project opens hidden, the walk reads the object model
 * — `ProgramFiles`, `NumberOfRungs()`, `GetRungAsNeutralText(i)` for mnemonic
 * ladder text, `AddrSymRecords` for the symbol table, `DataFiles` for the data
 * table, `Channels`/`GetChannelViaIndex`/`GetChassis` for the I/O
 * configuration, and `Processor` for the controller identity — and the app
 * quits with `Quit(0, …)`, the do-not-save flag, so nothing is ever written.
 *
 * Read-only by design: a headless save was observed to block on a dialog, and
 * PLC-5 is a legacy platform — the engineering answer is to read the old
 * program with evidence, not to edit it blind.
 */

import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { statSync } from 'node:fs'
import { readFile, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Drop repeated chassis rows.
 *
 * `Channel.ChassisCount` can promise one more chassis than `GetChassis` returns,
 * and the index fallback in the read script then reads the last chassis a second
 * time (observed on channel `7` of `F00607.RSP`: `Chassis_14` appeared twice).
 * A row is the same chassis only when every recorded attribute agrees.
 *
 * @param rows - the chassis rows as the server enumerated them.
 * @returns the rows with repeats removed, in their original order.
 */
export function dedupeChassis(rows: readonly Plc5Chassis[]): Plc5Chassis[] {  const seen = new Set<string>()
  const unique: Plc5Chassis[] = []
  for (const row of rows) {
    if (row.name === '' && row.part === '') continue
    const key = [row.channel, row.name, row.part, row.slots, row.startingRack, row.endingRack, row.startingGroup, row.endingGroup, row.adapter].join('|')
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  return unique
}

/** One program file in the PLC-5 project. */
export interface Plc5File {
  readonly number: number
  readonly name: string
  /** The RSLogix 5 file type; 1 is a ladder file. */
  readonly type: number
  readonly rungs: number
  /** The text of the last rung, when the read asked for rungs. */
  readonly lastRung?: string
}

/** One rung read from a ladder file, in neutral (mnemonic) text. */
export interface Plc5Rung {
  readonly file: string
  readonly rung: number
  readonly text: string
}

/** One address/symbol record from the PLC-5 database. */
export interface Plc5Symbol {
  readonly address: string
  readonly symbol: string
  readonly description: string
  readonly scope: number
}

/** One integer, float, binary, timer, counter, control, structured or I/O data file. */
export interface Plc5DataFile {
  readonly number: number
  readonly type: string
  readonly name: string
  readonly elements: number
}

/** One chassis in the I/O configuration, with its adapter part number. */
export interface Plc5Chassis {
  readonly name: string
  readonly part: string
  readonly slots: number
  readonly startingRack: number
  readonly endingRack: number
  readonly startingGroup: number
  readonly endingGroup: number
  readonly adapter: number
  readonly channel: string
}

/** What the processor object reports. */
export interface Plc5Processor {
  readonly typeCode: number
  readonly series: number
  readonly memoryWords: number
  readonly driverName: string
  readonly online: boolean
  readonly faulted: boolean
  readonly editsPresent: boolean
  readonly passwordPrivileges: boolean
}

/** What a headless read returned. */
export interface Plc5Project {
  readonly path: string
  readonly appVersion: string
  readonly projectName: string
  readonly revision: number | undefined
  readonly files: readonly Plc5File[]
  readonly totalRungs: number
  readonly rungs: readonly Plc5Rung[]
  /** How many address/symbol records the database holds, whether or not they were read. */
  readonly symbolCount: number
  readonly symbols: readonly Plc5Symbol[]
  /** How many data files the project declares, whether or not they were read. */
  readonly dataFileCount: number
  readonly dataFiles: readonly Plc5DataFile[]
  readonly chassis: readonly Plc5Chassis[]
  readonly processor: Plc5Processor | undefined
  /** True when a requested limit stopped the walk before the end. */
  readonly truncated: boolean
}

/** A failure with a code and a fix, like every other tool in this bundle. */
export class Plc5Error extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'Plc5Error'
    this.code = code
    this.fix = fix
  }
}

/**
 * How long one headless open may take before the tool gives up.
 *
 * A cold start of the vendor application is the slow part — a large project can
 * take a minute or two before the first property reads — and a server that
 * cannot start at all makes Windows wait about two minutes before it reports
 * `CO_E_SERVER_EXEC_FAILURE`. A shorter budget would turn that diagnosis into a
 * bare timeout, so this sits above both.
 */
const DEFAULT_TIMEOUT_MS = 300_000

/** The timeout, overridable for a machine with a slower cold start. */
function timeoutMs(): number {
  const raw = Number(process.env.DSH_PLC5_TIMEOUT_MS)
  return Number.isFinite(raw) && raw >= 10_000 ? raw : DEFAULT_TIMEOUT_MS
}

/** The 32-bit Windows PowerShell, the safe host for the vendor object model. */
function powershell32(): string {
  const windir = process.env.WINDIR ?? 'C:\\Windows'
  return `${windir}\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe`
}

/**
 * The script the 32-bit host runs.
 *
 * The path and the switches travel as environment variables, so a path with
 * quotes or spaces cannot become code. Every exit path quits with `Quit(0, …)`
 * — 0 is `olDoNotSaveChanges`; passing `$true` there means SAVE changes.
 */
const READ_SCRIPT = String.raw`
$ErrorActionPreference = 'Continue'
# The answer leaves through a file, not the console: PS 5.1 encodes redirected
# console output with the OEM code page, which mangles °, µ and other characters
# that appear in rung text, and the JSON is written by ConvertTo-Json — the
# framework's own escaper — instead of by hand.
function Emit($value) {
  $json = ConvertTo-Json -InputObject $value -Depth 6 -Compress
  Set-Content -LiteralPath $env:DSH_PLC5_OUT -Value $json -Encoding UTF8
}
function Fail($code, $message) {
  Emit @{ ok = $false; code = $code; message = $message }
  exit 0
}
$path = $env:DSH_PLC5_PATH
$limit = [int]$env:DSH_PLC5_LIMIT
$withRungs = $env:DSH_PLC5_RUNGS -eq '1'
$symbolLimit = [int]$env:DSH_PLC5_SYMBOLS
$withData = $env:DSH_PLC5_DATA -eq '1'
$withIo = $env:DSH_PLC5_IO -eq '1'
$withProc = $env:DSH_PLC5_PROC -eq '1'

# Nothing is piped back, so an unexpected terminating error must still leave an
# answer behind: report it the same way an expected failure reports itself.
trap {
  try { Emit @{ ok = $false; code = 'PLC5_SCRIPT_FAILED'; message = $_.Exception.Message } } catch {}
  exit 0
}

function S($obj, $name) {
  try {
    $v = $obj.$name
    if ($null -eq $v) { return '' }
    $t = [string]$v
    if ($t -eq '<Empty>') { return '' }
    return $t
  } catch { return '' }
}

try {
  $app = New-Object -ComObject 'RSLogix5.Application'
} catch {
  Fail 'PLC5_COM_UNAVAILABLE' ($_.Exception.Message)
}
try { $app.Visible = $false } catch {}
try { $app.PromptForRevNote = $false } catch {}

try {
  $project = $app.FileOpen($path, $false, $false, $false, $false, $null)
} catch {
  try { $app.Quit(0, $false) } catch {}
  Fail 'PLC5_OPEN_FAILED' ($_.Exception.Message)
}

if ($null -eq $project) {
  try { $project = $app.GetActiveProject() } catch {}
}
if ($null -eq $project) {
  try { $app.Quit(0, $false) } catch {}
  Fail 'PLC5_NO_PROJECT' 'RSLogix 5 opened no project. The file may not be an .RSP it can read, or the open may have been refused.'
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
  try { $app.Quit(0, $false) } catch {}
  Fail 'PLC5_READ_FAILED' ($_.Exception.Message)
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

$chassis = @()
if ($withIo) {
  try {
    $local = $project.LocalChassis
    if ($null -ne $local) {
      $chassis += @{
        name = (S $local 'Name'); part = (S $local 'TypeString'); slots = (S $local 'SlotCount')
        startingRack = (S $local 'StartingRack'); endingRack = (S $local 'EndingRack')
        startingGroup = (S $local 'StartingGroup'); endingGroup = (S $local 'EndingGroup')
        adapter = (S $local 'Adapter'); channel = 'Local'
      }
    }
  } catch {}
  try {
    $channels = $project.Channels
    $channelCount = 0
    try { $channelCount = [int]$channels.Count() } catch {}
    for ($c = 1; $c -le $channelCount; $c++) {
      $channel = $null
      try { $channel = $channels.GetChannelViaIndex($c) } catch { continue }
      if ($null -eq $channel) { continue }
      $channelType = S $channel 'Type'
      $chassisCount = 0
      try { $chassisCount = [int]$channel.ChassisCount } catch {}
      for ($k = 1; $k -le $chassisCount; $k++) {
        $ch = $null
        try { $ch = $channel.GetChassis($k) } catch {}
        if ($null -eq $ch) {
          try { $ch = $channel.GetChassis($k - 1) } catch {}
        }
        if ($null -eq $ch) { continue }
        $chassis += @{
          name = (S $ch 'Name'); part = (S $ch 'TypeString'); slots = (S $ch 'SlotCount')
          startingRack = (S $ch 'StartingRack'); endingRack = (S $ch 'EndingRack')
          startingGroup = (S $ch 'StartingGroup'); endingGroup = (S $ch 'EndingGroup')
          adapter = (S $ch 'Adapter'); channel = $channelType
        }
      }
    }
  } catch {}
}

$processor = $null
if ($withProc) {
  try {
    $p = $project.Processor
    if ($null -ne $p) {
      $memWords = 0
      try { $memWords = [int]$p.CurrentPLC5MemSize } catch {}
      $typeCode = 0
      try { $typeCode = [int]$p.Type } catch {}
      $series = 0
      try { $series = [int]$p.Series } catch {}
      $processor = @{
        typeCode = $typeCode; series = $series; memoryWords = $memWords
        driverName = (S $p 'DriverName')
        online = [bool]($p.Online)
        faulted = [bool]($p.Faulted)
        editsPresent = [bool]($p.EditsPresent)
        passwordPrivileges = [bool]($p.HasPasswordPrivileges)
      }
    }
  } catch {}
}

$revision = $null
try { $revision = [int]$project.Revision } catch {}
$projectName = ''
try { $projectName = [string]$project.Name } catch {}
$appVersion = ''
try { $appVersion = [string]$app.Version } catch {}

try { $app.Quit(0, $false) } catch {}

Emit @{
  ok = $true
  appVersion = $appVersion
  projectName = $projectName
  revision = $revision
  files = @($files)
  totalRungs = $total
  rungs = @($rungs)
  symbolCount = $symbolCount
  symbols = @($symbols)
  dataFileCount = $dataFileCount
  dataFiles = @($dataFiles)
  chassis = @($chassis)
  processor = $processor
  truncated = $truncated
}
`

/** The JSON shape the PowerShell side writes. */
interface RawAnswer {
  readonly ok?: boolean
  readonly code?: string
  readonly message?: string
  readonly appVersion?: string
  readonly projectName?: string
  readonly revision?: number | null
  readonly files?: readonly { readonly number?: number; readonly name?: string; readonly type?: number; readonly rungs?: number; readonly lastRung?: string }[]
  readonly totalRungs?: number
  readonly rungs?: readonly { readonly file?: string; readonly rung?: number; readonly text?: string }[]
  readonly symbolCount?: number
  readonly symbols?: readonly { readonly address?: string; readonly symbol?: string; readonly description?: string; readonly scope?: number }[]
  readonly dataFileCount?: number
  readonly dataFiles?: readonly { readonly number?: number; readonly type?: string; readonly name?: string; readonly elements?: number }[]
  readonly chassis?: readonly Record<string, unknown>[]
  readonly processor?: Record<string, unknown> | null
  readonly truncated?: boolean
}

/** Run the read script in the 32-bit host and return its answer. */
async function runRead(
  path: string,
  options: { readonly rungs: number; readonly withRungs: boolean; readonly symbols: number; readonly withData: boolean; readonly withIo: boolean; readonly withProc: boolean; readonly timeoutMs: number },
): Promise<RawAnswer> {
  const encoded = Buffer.from(READ_SCRIPT, 'utf16le').toString('base64')
  // The answer travels as a UTF-8 JSON file rather than a console line: the
  // console would re-encode it to the OEM code page, and a 700 KB single line is
  // not what the console pipeline is for.
  const answerPath = join(tmpdir(), `dsh-plc5-${process.pid}-${randomUUID()}.json`)
  return await new Promise<RawAnswer>((resolvePromise, rejectPromise) => {
    const child = (() => {
      try {
        return spawn(
      powershell32(),
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      {
        windowsHide: true,
        // No pipes: the answer comes back in a file, and a sandboxed host can
        // refuse to create the pipes a `pipe` stdio would need.
        stdio: 'ignore',
        env: {
          ...process.env,
          DSH_PLC5_PATH: path,
          DSH_PLC5_OUT: answerPath,
          DSH_PLC5_LIMIT: String(options.rungs),
          DSH_PLC5_RUNGS: options.withRungs ? '1' : '0',
          DSH_PLC5_SYMBOLS: String(options.symbols),
          DSH_PLC5_DATA: options.withData ? '1' : '0',
          DSH_PLC5_IO: options.withIo ? '1' : '0',
          DSH_PLC5_PROC: options.withProc ? '1' : '0',
        },
      },
      )
    } catch (error) {
      rejectPromise(new Plc5Error(
        'PLC5_POWERSHELL_MISSING',
        `The 32-bit Windows PowerShell could not be started: ${error instanceof Error ? error.message : String(error)}`,
        'This tool needs Windows PowerShell in SysWOW64 on the engineering PC that runs RSLogix 5.',
      ))
      return undefined
    }
    })()
    if (child === undefined) return
    let settled = false
    const cleanup = (): void => {
      void unlink(answerPath).catch(() => undefined)
    }
    const finish = (value: RawAnswer | undefined, error?: Plc5Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      cleanup()
      if (error !== undefined) rejectPromise(error)
      else resolvePromise(value ?? {})
    }
    const timer = setTimeout(() => {
      child.kill()
      finish(undefined, new Plc5Error(
        'PLC5_TIMEOUT',
        `RSLogix 5 did not answer within ${Math.round(options.timeoutMs / 1000)} seconds for ${path}.`,
        'Close any RSLogix 5 window (including a hidden instance from an earlier attempt), then retry; a first open of a large project can take a minute. A hidden RSLGX5.exe holds the single-instance server and blocks every new activation — end it (Stop-Process -Name RSLGX5) and retry. If the vendor application cannot start at all, Windows takes about two minutes to say CO_E_SERVER_EXEC_FAILURE — open RSLogix 5 by hand once to prove the installation starts, then retry.',
      ))
    }, options.timeoutMs)
    child.on('error', (error: Error) => {
      finish(undefined, new Plc5Error(
        'PLC5_POWERSHELL_MISSING',
        `The 32-bit Windows PowerShell could not be started: ${error.message}`,
        'This tool needs Windows PowerShell in SysWOW64 on the engineering PC that runs RSLogix 5.',
      ))
    })
    child.on('close', () => {
      void (async () => {
        let body = ''
        try {
          // `Set-Content -Encoding UTF8` on PS 5.1 writes a BOM, which JSON.parse rejects.
          body = (await readFile(answerPath, 'utf8')).replace(/^\uFEFF/u, '').trim()
        } catch {}
        if (body === '') {
          finish(undefined, new Plc5Error(
            'PLC5_NO_ANSWER',
            'RSLogix 5 produced no answer.',
            'Check that RSLogix 5 is installed and activated, that the file opens in it, and that no dialog is waiting behind the hidden window.',
          ))
          return
        }
        try {
          finish(JSON.parse(body) as RawAnswer)
        } catch (error) {
          finish(undefined, new Plc5Error(
            'PLC5_BAD_ANSWER',
            `The answer could not be read: ${error instanceof Error ? error.message : String(error)}`,
            'Retry once; if it persists, open the project in RSLogix 5 and check it reads there.',
          ))
        }
      })()
    })
  })
}

function num(value: unknown): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Read an RSLogix 5 (PLC-5) `.RSP` project headlessly.
 *
 * @param path - absolute path to the `.RSP` file.
 * @param options - what to walk: rung text budget, symbol budget, data table,
 * I/O configuration, processor properties.
 * @returns the project census with the requested detail.
 * @throws Plc5Error when the host, the project or the answer is unusable.
 */
export async function readPlc5Project(
  path: string,
  options: { readonly rungs?: number; readonly symbols?: number; readonly dataFiles?: boolean; readonly io?: boolean; readonly processor?: boolean; readonly timeoutMs?: number } = {},
): Promise<Plc5Project> {
  // The rung text a caller asks for is bounded by the tool schema, not here: a
  // PLC-5 program runs past 2,000 rungs and a full census needs them all.
  const limit = Math.max(0, Math.min(options.rungs ?? 0, 100_000))
  const withRungs = limit > 0
  const symbolLimit = Math.max(0, Math.min(options.symbols ?? 0, 5000))
  try {
    if (!statSync(path).isFile()) throw new Error('not a file')
  } catch {
    throw new Plc5Error(
      'PLC5_FILE_MISSING',
      `No file at ${path}.`,
      'Pass the path of an existing .RSP project; the reader only opens that file.',
    )
  }
  const answer = await runRead(path, {
    rungs: limit,
    withRungs,
    symbols: symbolLimit,
    withData: options.dataFiles === true,
    withIo: options.io === true,
    withProc: options.processor === true,
    timeoutMs: options.timeoutMs ?? timeoutMs(),
  })
  if (answer.ok !== true) {
    const code = typeof answer.code === 'string' ? answer.code : 'PLC5_READ_FAILED'
    const message = typeof answer.message === 'string' ? answer.message : 'RSLogix 5 could not read the project.'
    const fix = code === 'PLC5_COM_UNAVAILABLE'
      ? 'Install and activate RSLogix 5 on this machine; the reader drives its automation server and has no substitute. If it is installed, look for a hidden RSLGX5.exe left by an earlier attempt — it holds the single-instance server and a new activation then waits and fails; end it (Stop-Process -Name RSLGX5) and retry.'
      : code === 'PLC5_NO_PROJECT'
        ? 'Check that the file is an .RSP project RSLogix 5 can open, and that no RSLogix 5 dialog is waiting.'
        : code === 'PLC5_OPEN_FAILED'
          ? 'Close any RSLogix 5 window, check the file is not locked or corrupt, then retry.'
          : 'Correct the path and retry; the reader only opens the project and never saves it.'
    throw new Plc5Error(code, message, fix)
  }
  const files = (answer.files ?? []).map(file => ({
    number: num(file.number),
    name: str(file.name),
    type: num(file.type),
    rungs: num(file.rungs),
    lastRung: str(file.lastRung),
  }))
  const rungs = (answer.rungs ?? []).map(rung => ({
    file: str(rung.file),
    rung: num(rung.rung),
    text: str(rung.text),
  }))
  const symbols = (answer.symbols ?? []).map(symbol => ({
    address: str(symbol.address),
    symbol: str(symbol.symbol),
    description: str(symbol.description),
    scope: num(symbol.scope),
  }))
  const dataFiles = (answer.dataFiles ?? []).map(file => ({
    number: num(file.number),
    type: str(file.type),
    name: str(file.name),
    elements: num(file.elements),
  }))
  const chassis = dedupeChassis((answer.chassis ?? []).map(row => ({
    name: str(row.name),
    part: str(row.part),
    slots: num(row.slots),
    startingRack: num(row.startingRack),
    endingRack: num(row.endingRack),
    startingGroup: num(row.startingGroup),
    endingGroup: num(row.endingGroup),
    adapter: num(row.adapter),
    channel: str(row.channel),
  })))
  const processor = answer.processor !== null && typeof answer.processor === 'object'
    ? {
        typeCode: num(answer.processor.typeCode),
        series: num(answer.processor.series),
        memoryWords: num(answer.processor.memoryWords),
        driverName: str(answer.processor.driverName),
        online: answer.processor.online === true,
        faulted: answer.processor.faulted === true,
        editsPresent: answer.processor.editsPresent === true,
        passwordPrivileges: answer.processor.passwordPrivileges === true,
      }
    : undefined
  return {
    path,
    appVersion: str(answer.appVersion),
    projectName: str(answer.projectName),
    revision: typeof answer.revision === 'number' ? answer.revision : undefined,
    files,
    totalRungs: answer.totalRungs ?? files.reduce((sum, file) => sum + file.rungs, 0),
    rungs,
    symbolCount: answer.symbolCount ?? symbols.length,
    symbols,
    dataFileCount: answer.dataFileCount ?? dataFiles.length,
    dataFiles,
    chassis,
    processor,
    truncated: answer.truncated === true,
  }
}
