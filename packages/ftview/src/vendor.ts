/**
 * Drive the installed FactoryTalk View ME engine.
 *
 * Studio ships two scriptable COM servers that matter here: `MEExportSvr`
 * (list applications, export displays) and `AppMgrServer` (backup and restore).
 * The export server runs out of process and works from a 64-bit host; the
 * application manager is a 32-bit in-process server, so it is reached through
 * the 32-bit PowerShell. Nothing here edits a project: export reads, backup
 * copies.
 *
 * @module dsh-engineering-ftview/vendor
 */

import { spawn } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { alarmXmlBytes, readAlarmDatabase, renderAlarmXml } from './alarmdb.ts'
import { exportTagSnapshot } from './tagdb.ts'

/** CLSID of the ME export server (`MEExport.exe`). */
export const EXPORT_CLSID = '9d882577-aa92-466b-a749-6d6b5093b623'
/** CLSID of the application manager (`ApplicationManagerServer.dll`). */
export const APP_MANAGER_CLSID = '4fead81a-cd72-42da-b659-f1a41499f0f9'

/** One installed ME application. */
export interface MeApplication {
  /** Application name as Studio stores it. */
  readonly name: string
  /** Target platform when the engine reports one. */
  readonly platform?: string
  /** Version string when the engine reports one. */
  readonly version?: string
}

/** Result of one vendor call. */
export interface VendorResult<T> {
  /** Parsed value on success. */
  readonly value?: T
  /** Human-readable failure. */
  readonly error?: string
}

/** Where the 32-bit PowerShell lives on this host. */
function powershell32(): string {
  const path = join(process.env.WINDIR ?? 'C:/Windows', 'SysWOW64/WindowsPowerShell/v1.0/powershell.exe')
  return existsSync(path) ? path : 'powershell.exe'
}

/** Run a PowerShell script with a JSON payload on stdin. */
function runPowerShell(executable: string, script: string, payload: unknown): Promise<{ code: number; stdout: string; stderr: string }> {
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise(resolvePromise => {
    const child = spawn(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true })
    let stdout = ''
    let stderr = ''
    child.stdout?.setEncoding('utf8').on('data', chunk => { stdout += chunk })
    child.stderr?.setEncoding('utf8').on('data', chunk => { stderr += chunk })
    child.on('error', error => resolvePromise({ code: -1, stdout, stderr: stderr || error.message }))
    child.on('close', code => resolvePromise({ code: code ?? -1, stdout, stderr }))
    child.stdin?.end(JSON.stringify(payload), 'utf8')
  })
}

/** Script that lists applications through the export server. */
const LIST_SCRIPT = `
$ErrorActionPreference = 'Stop'
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$t = [Type]::GetTypeFromCLSID([guid]$p.clsid)
$o = [Activator]::CreateInstance($t)
$names = @($o.GetMEAppNames())
$apps = @()
foreach ($name in $names) {
  $platform = $null; $version = $null
  try { $info = @($o.GetAppInfo([string]$name)); if ($info.Count -gt 0) { $platform = [string]$info[0] }; if ($info.Count -gt 1) { $version = [string]$info[1] } } catch { }
  $apps += [pscustomobject]@{ name = [string]$name; platform = $platform; version = $version }
}
[pscustomobject]@{ apps = $apps } | ConvertTo-Json -Depth 4 -Compress
`

/** Script that exports one application's displays. */
const EXPORT_SCRIPT = `
$ErrorActionPreference = 'Stop'
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$t = [Type]::GetTypeFromCLSID([guid]$p.clsid)
$o = [Activator]::CreateInstance($t)
$o.LoadMEApp([string]$p.app)
try { $o.ExportAll([string]$p.dest) } finally { $o.UnloadMEApp() }
[pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
`

/** Script that backs one application up to a zip through the application manager. */
const BACKUP_SCRIPT = `
$ErrorActionPreference = 'Stop'
$p = [Console]::In.ReadToEnd() | ConvertFrom-Json
$t = [Type]::GetTypeFromCLSID([guid]$p.clsid)
$o = [Activator]::CreateInstance($t)
$o.BackupLocal([string]$p.app, [string]$p.zip, '', 'ME')
[pscustomobject]@{ ok = $true } | ConvertTo-Json -Compress
`

/**
 * List every ME application the engine knows.
 *
 * @returns Applications, or the reason the engine could not be reached.
 */
export async function listApplications(): Promise<VendorResult<readonly MeApplication[]>> {
  const result = await runPowerShell('powershell.exe', LIST_SCRIPT, { clsid: EXPORT_CLSID })
  if (result.code !== 0) return { error: `The ME export server is unavailable: ${result.stderr.trim() || `exit ${result.code}`}` }
  try {
    const parsed = JSON.parse(result.stdout) as { apps?: readonly MeApplication[] }
    return { value: parsed.apps ?? [] }
  } catch {
    return { error: 'The ME export server returned an unreadable answer.' }
  }
}

/**
 * Export one application's displays and global objects into a new folder.
 *
 * The export server covers displays, global objects and project settings. The
 * alarm setup and the tag database live in Studio's editors, **not** in a normal
 * application folder. If the user has exported a snapshot of either into the
 * project store, this copies that snapshot as-is; a normal application export
 * therefore has no tags to bind and no alarms to review.
 *
 * Those two files are snapshots Studio writes when it exports them from their
 * editors, not live views of the database, so each copy is checked against the
 * application database's timestamp and a stale one is reported rather than
 * silently handed over as current.
 *
 * @param application - Application name as listed.
 * @param destination - Folder to create and fill.
 * @param documentsRoot - Public Documents folder, injectable for tests.
 * @returns Files written and any freshness warnings.
 */
export async function exportApplication(application: string, destination: string, documentsRoot?: string): Promise<VendorResult<ExportResult>> {
  if (existsSync(destination)) return { error: `A file or folder already exists at ${destination}. Export into a new folder.` }
  // The vendor exporter returns "Value does not fall within the expected range"
  // when the destination's parent folder is absent, so create it first.
  mkdirSync(dirname(destination), { recursive: true })
  const result = await runPowerShell('powershell.exe', EXPORT_SCRIPT, { clsid: EXPORT_CLSID, app: application, dest: destination })
  if (result.code !== 0) return { error: `Export failed: ${result.stderr.trim() || `exit ${result.code}`}` }
  if (!existsSync(destination)) return { error: 'The engine reported success but wrote no folder.' }
  const extras = copyProjectExtras(application, destination, documentsRoot)
  const files: string[] = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(join(directory, entry.name), relative)
      else files.push(relative)
    }
  }
  walk(destination, '')
  return { value: { files: files.sort(), warnings: extras.warnings, assets: extras.status } }
}

/** One export run's files and freshness warnings. */
/** Whether the store snapshot for one asset is usable. */
  export type AssetFreshness = 'fresh' | 'stale' | 'missing'

/** One export run's files, freshness warnings and asset status. */
export interface ExportResult {
  /** Files written, relative to the destination. */
  readonly files: readonly string[]
  /** Components that are missing or older than the application database. */
  readonly warnings: readonly string[]
  /** Tags and alarms: fresh, older than the .med, or not exported at all. */
  readonly assets: { readonly tags: AssetFreshness; readonly alarms: AssetFreshness }
}

/** What the project store contributed to an export. */
export interface ProjectExtras {
  /** Export-relative paths copied from the store. */
  readonly copied: readonly string[]
  /** Why a component is missing or possibly stale. */
  readonly warnings: readonly string[]
  /** Freshness of each asset snapshot. */
  readonly status: { readonly tags: AssetFreshness; readonly alarms: AssetFreshness }
}

/** The Studio project store that holds one application's alarms and tags. */
export function projectFolder(application: string, documentsRoot = join(process.env.PUBLIC ?? 'C:/Users/Public', 'Documents')): string | undefined {
  const folder = join(documentsRoot, 'RSView Enterprise/ME/HMI projects', application)
  return existsSync(folder) ? folder : undefined
}

/** A readable date for one file's timestamp. */
function modifiedOn(path: string): string {
  try {
    return statSync(path).mtime.toISOString().slice(0, 10)
  } catch {
    return 'unknown'
  }
}

/** A warning when one copied snapshot predates the application database. */
function freshness(file: string, relative: string, database: string | undefined): string | undefined {
  if (database === undefined) return undefined
  try {
    if (statSync(file).mtimeMs + 60_000 >= statSync(database).mtimeMs) return undefined
    return `${relative} was written ${modifiedOn(file)}, older than the application database (${modifiedOn(database)}). This is the last snapshot Studio wrote for that component, not a fresh export: run the application export in FactoryTalk View Studio once to refresh it, then reopen that folder.`
  } catch {
    return undefined
  }
}

/**
 * Copy the alarm setup and the tag CSV from the project store into an export.
 *
 * The file names and layout match what Studio writes when it exports the whole
 * application (`Alarms/Alarms.xml`, `Tags/<application>.csv`), so a reader
 * cannot tell this export from a hand-made one.
 *
 * @param application - Application name.
 * @param destination - Export folder that already exists.
 * @param documentsRoot - Public Documents folder, injectable for tests.
 * @returns Paths copied and any staleness warnings.
 */
export function copyProjectExtras(application: string, destination: string, documentsRoot?: string): ProjectExtras {
  const source = projectFolder(application, documentsRoot)
  if (source === undefined) {
    return { copied: [], warnings: [`No Studio project folder was found for ${application}, so alarms and tags were not exported.`], status: { tags: 'missing', alarms: 'missing' } }
  }
  const database = join(source, `${application}.med`)
  const copied: string[] = []
  const warnings: string[] = []
  const status: { tags: AssetFreshness; alarms: AssetFreshness } = { tags: 'missing', alarms: 'missing' }
  const alarms = join(source, 'Alarms.xml')
  const alarmTarget = join(destination, 'Alarms')
  let decodedAlarms = false
  let alarmDecodeFailure = ''
  if (existsSync(join(source, 'M_Alarms', 'MachineAlarms.mal'))) {
    // The alarm database decodes without Studio, so the export carries the
    // application's current alarms instead of whatever snapshot was last
    // written by the wizard. Stream layouts this decoder does not know throw
    // and fall back to the snapshot, with the reason kept for the caller.
    try {
      const database = readAlarmDatabase(application, source)
      mkdirSync(alarmTarget, { recursive: true })
      writeFileSync(join(alarmTarget, 'Alarms.xml'), alarmXmlBytes(renderAlarmXml(database)))
      copied.push('Alarms/Alarms.xml')
      status.alarms = 'fresh'
      decodedAlarms = true
    } catch (error) {
      decodedAlarms = false
      alarmDecodeFailure = error instanceof Error ? error.message : String(error)
    }
  }
  if (!decodedAlarms && existsSync(alarms)) {
    mkdirSync(alarmTarget, { recursive: true })
    copyFileSync(alarms, join(alarmTarget, 'Alarms.xml'))
    copied.push('Alarms/Alarms.xml')
    const warning = freshness(alarms, 'Alarms/Alarms.xml', existsSync(database) ? database : undefined)
    status.alarms = warning === undefined ? 'fresh' : 'stale'
    if (warning !== undefined) warnings.push(warning)
    if (alarmDecodeFailure !== '') {
      warnings.push(`Alarms/Alarms.xml is the last wizard snapshot because the alarm database could not be decoded: ${alarmDecodeFailure}`)
    }
  } else if (!decodedAlarms) {
    warnings.push(`No Alarms.xml in the application store and no decodable alarm database${alarmDecodeFailure === '' ? '' : ` (${alarmDecodeFailure})`}. Alarms are not part of a normal ME application export; if you need them, export Alarm Setup from Studio into the store first.`)
  }
  // Studio names the tag file `<application>-Tags.CSV`; match the suffix
  // case-insensitively because older applications used `.csv`.
  const entries = readdirSync(source, { withFileTypes: true })
  const tags = entries.find(entry => entry.isFile() && /-tags\.csv$/iu.test(entry.name))
  const tagsTarget = join(destination, 'Tags')
  let tagDecodeFailure = ''
  restamp: {
    if (!existsSync(join(source, 'TAG', `${application}.MDF`))) break restamp
    // The tag database reads without Studio too, so a missing or older snapshot
    // is replaced by a fresh decode instead of being copied and flagged.
    const snapshotWarning = tags === undefined
      ? 'missing'
      : freshness(join(source, tags.name), `Tags/${application}.csv`, existsSync(database) ? database : undefined)
    if (snapshotWarning === undefined) break restamp
    try {
      mkdirSync(tagsTarget, { recursive: true })
      exportTagSnapshot(application, join(tagsTarget, `${application}.csv`), source)
      const index = copied.indexOf(`Tags/${application}.csv`)
      if (index === -1) copied.push(`Tags/${application}.csv`)
      status.tags = 'fresh'
      break restamp
    } catch (error) {
      // No local SQL tools or a locked database: fall through to the snapshot
      // copy below, which keeps the old warning behaviour.
      tagDecodeFailure = error instanceof Error ? error.message : String(error)
    }
  }
  if (tags !== undefined) {
    const target = join(destination, 'Tags')
    mkdirSync(target, { recursive: true })
    if (status.tags !== 'fresh') {
      copyFileSync(join(source, tags.name), join(target, `${application}.csv`))
      copied.push(`Tags/${application}.csv`)
      const warning = freshness(join(source, tags.name), `Tags/${application}.csv`, existsSync(database) ? database : undefined)
      status.tags = warning === undefined ? 'fresh' : 'stale'
      if (warning !== undefined) warnings.push(warning)
      if (tagDecodeFailure !== '') {
        warnings.push(`Tags/${application}.csv is the last wizard snapshot because the tag database could not be read: ${tagDecodeFailure}`)
      }
    }
  } else if (status.tags !== 'fresh') {
    warnings.push(`No tag CSV in the application store and no readable tag database${tagDecodeFailure === '' ? '' : ` (${tagDecodeFailure})`}. Tags are not part of a normal ME application export; if you need them, export the tag database from Studio into the store first.`)
  }
  // Display objects can reference bitmaps by name, and the export engine does not
  // copy them: without this folder every image object draws as an empty box.
  const images = join(source, 'Images')
  if (existsSync(images) && statSync(images).isDirectory()) {
    const target = join(destination, 'Images')
    mkdirSync(target, { recursive: true })
    const copy = (directory: string, prefix: string): void => {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        if (entry.isDirectory()) copy(join(directory, entry.name), relative)
        else {
          copyFileSync(join(directory, entry.name), join(destination, 'Images', relative))
          copied.push(`Images/${relative}`)
        }
      }
    }
    copy(images, '')
  } else {
    // Only a display that actually references an image makes the missing folder a
    // problem; warning on every application without bitmaps would be noise.
    const displays = join(destination, 'Displays')
    const referencesImage = existsSync(displays) && readdirSync(displays).some(file => {
      if (!/\.xml$/iu.test(file)) return false
      try {
        return /<image[\s>]/iu.test(readFileSync(join(displays, file), 'utf8'))
      } catch {
        return false
      }
    })
    if (referencesImage) {
      warnings.push('The exported displays reference images, but the application store has no Images folder, so those objects cannot render. Add the bitmaps in Studio or attach a folder that has them.')
    }
  }
  return { copied, warnings, status }
}

/**
 * Back one application up to a zip.
 *
 * @param application - Application name.
 * @param zipPath - Destination zip; must not exist.
 * @returns The zip path on success.
 */
export async function backupApplication(application: string, zipPath: string): Promise<VendorResult<string>> {
  if (existsSync(zipPath)) return { error: `A file already exists at ${zipPath}.` }
  const result = await runPowerShell(powershell32(), BACKUP_SCRIPT, { clsid: APP_MANAGER_CLSID, app: application, zip: zipPath })
  if (result.code !== 0) return { error: `Backup failed: ${result.stderr.trim() || `exit ${result.code}`}` }
  if (!existsSync(zipPath)) return { error: 'The application manager reported success but wrote no zip.' }
  return { value: zipPath }
}

/** Size of one file, for reports. */
export function fileSize(path: string): number {
  try { return statSync(path).size } catch { return 0 }
}
