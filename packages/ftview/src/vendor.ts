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
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

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
 * Export one application's displays and globals into a new folder.
 *
 * @param application - Application name as listed.
 * @param destination - Folder to create and fill.
 * @returns Files written, relative to the destination.
 */
export async function exportApplication(application: string, destination: string): Promise<VendorResult<readonly string[]>> {
  if (existsSync(destination)) return { error: `A file or folder already exists at ${destination}. Export into a new folder.` }
  const result = await runPowerShell('powershell.exe', EXPORT_SCRIPT, { clsid: EXPORT_CLSID, app: application, dest: destination })
  if (result.code !== 0) return { error: `Export failed: ${result.stderr.trim() || `exit ${result.code}`}` }
  if (!existsSync(destination)) return { error: 'The engine reported success but wrote no folder.' }
  const files: string[] = []
  const walk = (directory: string, prefix: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
      if (entry.isDirectory()) walk(join(directory, entry.name), relative)
      else files.push(relative)
    }
  }
  walk(destination, '')
  return { value: files.sort() }
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
