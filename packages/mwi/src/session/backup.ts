/**
 * Pre-edit backups shared by the automation surfaces.
 *
 * Every mutating pass over a real project takes one complete copy first, under
 * `<workspace>/backups/<project>/<timestamp>`, with a hash manifest. The copy is
 * verified after it is written, and a valid copy is reused for the session
 * instead of taking a second one.
 *
 * @module dsh-engineering-mwi/session/backup
 */

import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, statSync, writeFileSync } from 'node:fs'
import { basename, join, relative, resolve, sep } from 'node:path'
import { MwiError } from '../core/errors.ts'
import { isInside } from './workspace.ts'

/** One file in a backup manifest. */
export interface BackupFile {
  /** Path relative to the project root. */
  readonly path: string
  /** Byte length at backup time. */
  readonly bytes: number
  /** SHA-256 of the copied bytes. */
  readonly sha256: string
}

/** One verified pre-edit backup. */
export interface BackupRecord {
  /** Project name, the `.mwt` basename. */
  readonly name: string
  /** Workspace that owns the backup. */
  readonly workspace: string
  /** The real `.mwt` the backup was taken from. */
  readonly mwt: string
  /** The real expanded directory. */
  readonly directory: string
  /** Directory holding the copy. */
  readonly backup: string
  /** Manifest path inside the backup directory. */
  readonly manifest: string
  /** When the copy was written. */
  readonly created_at: string
}

/** The shared backup root of one workspace. */
export function backupRootOf(workspace: string): string {
  return join(workspace, 'backups')
}

/** The record directory inside the workspace state folder. */
function recordRootOf(workspace: string): string {
  return join(workspace, '.motionworks', 'backups')
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function plainTree(path: string, workspace: string): void {
  if (!isInside(workspace, path)) throw new MwiError('OUTSIDE_WORKSPACE', `${path} is outside ${workspace}.`, 'Back up a project from the calling workspace.')
  const info = lstatSync(path)
  if (info.isSymbolicLink()) throw new MwiError('LINKED_PROJECT', `The project contains a link: ${path}.`, 'Back up a project whose files are all local; links are refused.')
  if (!statSync(path).isDirectory()) return
  for (const entry of readdirSync(path)) plainTree(join(path, entry), workspace)
}

function walk(from: string, to: string, files: BackupFile[], base: string): void {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name)
    const target = join(to, entry.name)
    if (entry.isSymbolicLink()) throw new MwiError('LINKED_PROJECT', `The project contains a link: ${source}.`, 'Back up a project whose files are all local; links are refused.')
    if (entry.isDirectory()) {
      mkdirSync(target, { recursive: true })
      walk(source, target, files, base)
      continue
    }
    copyFileSync(source, target)
    files.push({ path: relative(base, target).replace(/\\/g, '/'), bytes: statSync(target).size, sha256: digest(target) })
  }
}

function verify(record: BackupRecord): boolean {
  try {
    if (!existsSync(record.manifest) || !existsSync(record.backup) || !existsSync(record.mwt)) return false
    const manifest = JSON.parse(readFileSync(record.manifest, 'utf8')) as { files?: BackupFile[] }
    if (!Array.isArray(manifest.files) || manifest.files.length === 0) return false
    for (const file of manifest.files) {
      if (typeof file.path !== 'string' || typeof file.sha256 !== 'string') return false
      const path = join(record.backup, file.path)
      if (!isInside(record.backup, path) || !existsSync(path)) return false
      if (digest(path) !== file.sha256) return false
    }
    return true
  } catch {
    return false
  }
}

/** Read the record for a project, when a valid backup exists. */
export function findBackup(workspace: string, path: string): BackupRecord | undefined {
  const target = resolve(path).toLowerCase().replace(/\.mwt$/u, '')
  let names: string[] = []
  try {
    names = readdirSync(recordRootOf(workspace)).filter(name => name.endsWith('.json'))
  } catch {
    return undefined
  }
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(recordRootOf(workspace), name), 'utf8')) as BackupRecord
      const directory = resolve(record.directory).toLowerCase()
      const mwt = resolve(record.mwt).toLowerCase()
      if (directory !== target && mwt !== `${target}.mwt`) continue
      if (!isInside(backupRootOf(workspace), record.backup) || !isInside(record.backup, record.manifest)) continue
      if (verify(record)) return record
    } catch {
      continue
    }
  }
  return undefined
}

/** Every project with a valid backup in this workspace. */
export function listBackups(workspace: string): BackupRecord[] {
  let names: string[] = []
  try {
    names = readdirSync(recordRootOf(workspace)).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
  const records: BackupRecord[] = []
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(recordRootOf(workspace), name), 'utf8')) as BackupRecord
      if (isInside(backupRootOf(workspace), record.backup) && verify(record)) records.push(record)
    } catch {
      continue
    }
  }
  return records
}

/**
 * Back up one real project, or return the valid backup already recorded.
 *
 * @param workspace - Absolute workspace root.
 * @param path - Real `.mwt` or its expanded directory.
 * @returns The verified backup record.
 */
export function ensureBackup(workspace: string, path: string): BackupRecord {
  const asked = resolve(path)
  const mwt = asked.toLowerCase().endsWith('.mwt') ? asked : `${asked}.mwt`
  const directory = mwt.slice(0, -4)
  if (!existsSync(mwt) || !existsSync(directory)) {
    throw new MwiError('PROJECT_INCOMPLETE', `${mwt} has no expanded project directory beside it.`, 'Open a complete project: the .mwt and its sibling folder.')
  }
  if (!isInside(workspace, mwt) || !isInside(workspace, directory)) {
    throw new MwiError('OUTSIDE_WORKSPACE', `${mwt} is outside ${workspace}.`, 'Work on a project inside the calling workspace.')
  }
  const existing = findBackup(workspace, mwt)
  if (existing !== undefined) return existing

  plainTree(directory, workspace)
  const name = basename(mwt, '.mwt')
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const target = join(backupRootOf(workspace), name, stamp)
  const files: BackupFile[] = []
  mkdirSync(target, { recursive: true })
  copyFileSync(mwt, join(target, `${name}.mwt`))
  files.push({ path: `${name}.mwt`, bytes: statSync(join(target, `${name}.mwt`)).size, sha256: digest(join(target, `${name}.mwt`)) })
  const copied = join(target, name)
  mkdirSync(copied, { recursive: true })
  walk(directory, copied, files, target)
  const manifest = join(target, 'backup-manifest.json')
  writeFileSync(manifest, JSON.stringify({ name, mwt, directory, created_at: new Date().toISOString(), files }, null, 2))

  const record: BackupRecord = {
    name,
    workspace: realpathSync(workspace),
    mwt,
    directory,
    backup: target,
    manifest,
    created_at: new Date().toISOString(),
  }
  if (!verify(record)) {
    throw new MwiError('BACKUP_UNVERIFIED', `The backup at ${target} did not verify.`, 'Keep the folder for inspection and take a fresh copy of an unchanged project.')
  }
  mkdirSync(recordRootOf(workspace), { recursive: true })
  writeFileSync(join(recordRootOf(workspace), `${name}.json`), JSON.stringify(record, null, 2))
  return record
}
