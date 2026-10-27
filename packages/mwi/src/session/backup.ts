/**
 * Pre-edit backups shared by the automation surfaces.
 *
 * Editing happens on the real workspace project. The first write takes one
 * complete, hash-verified copy under
 * `<workspace>/backups/motionworks/<project>/<UTC stamp>`, writes a manifest
 * beside it and records the project identity in
 * `<workspace>/.motionworks/attached/records`.
 *
 * `<workspace>/backups/<product>/…` is the one backup tree every engineering
 * product writes under, so "back up this project" means the same place whichever
 * product is in front of you. MotionWorks keeps its identity records private
 * under `.motionworks`, and both the shipped bridge (`Get-DirectIdentity`) and
 * the read-only engine (`assert_direct_attached`) verify a record before they
 * open, read or write a real project. A copy outside that tree is not evidence:
 * those guards refuse it, so the tools must write exactly this shape. Records
 * written before 0.4.21 that point at `.motionworks/attached/backups` stay valid.
 *
 * @module dsh-engineering-mwi/session/backup
 */

import { createHash, randomUUID } from 'node:crypto'
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { MwiError } from '../core/errors.ts'
import { isInside } from './workspace.ts'

/** One file in a backup manifest. */
export interface BackupFile {
  /** Path relative to the project's parent directory. */
  readonly path: string
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

/** The on-disk identity record; its field names are the guards' contract. */
interface AttachmentRecord {
  mode: 'direct'
  workspace: string
  mwt: string
  directory: string
  session_id: string | null
  backup: string
  backup_manifest: string
  backup_manifest_sha256: string
  attached_at: string
}

/**
 * The workspace backup root every engineering product writes under:
 * `<workspace>/backups/<product>/<subject>/<UTC stamp>/`.
 *
 * MotionWorks is the `motionworks` product. Keeping the copies in one visible
 * tree is what makes "back up this project" mean the same place for every
 * product; the identity records stay product-private under `.motionworks`.
 */
export function backupRootOf(workspace: string): string {
  return join(workspace, 'backups', 'motionworks')
}

/**
 * The pre-0.4.21 backup root. Records written by earlier builds point here and
 * stay valid: a shipped record is evidence, so it is accepted, never rewritten.
 */
export function legacyBackupRootOf(workspace: string): string {
  return join(workspace, '.motionworks', 'attached', 'backups')
}

/** The identity record directory of one workspace. */
export function recordRootOf(workspace: string): string {
  return join(workspace, '.motionworks', 'attached', 'records')
}

function digest(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function same(left: string, right: string): boolean {
  return resolve(left).toLowerCase() === resolve(right).toLowerCase()
}

/** Refuse a link anywhere in a tree the backup will copy. */
function assertPlainTree(path: string, workspace: string): void {
  if (!isInside(workspace, path)) {
    throw new MwiError('OUTSIDE_WORKSPACE', `${path} is outside ${workspace}.`, 'Back up a project from the calling workspace.')
  }
  if (lstatSync(path).isSymbolicLink()) {
    throw new MwiError('LINKED_PROJECT', `The project contains a link: ${path}.`, 'Back up a project whose files are all local; links are refused.')
  }
  if (!statSync(path).isDirectory()) return
  for (const entry of readdirSync(path)) assertPlainTree(join(path, entry), workspace)
}

/** Every file under a directory, in stable order. */
function tree(path: string, files: string[]): void {
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) tree(child, files)
    else files.push(child)
  }
}

/** Read and fully validate one identity record. */
function valid(workspace: string, record: AttachmentRecord): boolean {
  try {
    if (record.mode !== 'direct' || typeof record.mwt !== 'string' || typeof record.directory !== 'string') return false
    if (!same(record.workspace, workspace)) return false
    if (!isInside(workspace, record.mwt) || !isInside(workspace, record.directory)) return false
    if (!same(record.directory, record.mwt.slice(0, -4))) return false
    const root = backupRootOf(workspace)
    const legacy = legacyBackupRootOf(workspace)
    if (!isInside(root, record.backup) && !isInside(legacy, record.backup)) return false
    if (!isInside(record.backup, record.backup_manifest)) return false
    if (!existsSync(record.mwt) || !existsSync(record.directory) || !existsSync(record.backup_manifest)) return false
    if (digest(record.backup_manifest) !== record.backup_manifest_sha256) return false
    const manifest = JSON.parse(readFileSync(record.backup_manifest, 'utf8')) as { files?: unknown }
    if (!Array.isArray(manifest.files)) return false
    for (const file of manifest.files as BackupFile[]) {
      if (typeof file?.path !== 'string') return false
      const member = join(record.backup, file.path)
      if (!isInside(record.backup, member) || !existsSync(member)) return false
    }
    assertPlainTree(record.directory, workspace)
    return true
  } catch {
    return false
  }
}

/** The record shape the tools return, from an on-disk identity record. */
function toBackup(record: AttachmentRecord): BackupRecord {
  return {
    name: basename(record.mwt, '.mwt'),
    workspace: record.workspace,
    mwt: record.mwt,
    directory: record.directory,
    backup: record.backup,
    manifest: record.backup_manifest,
    created_at: record.attached_at,
  }
}

/** Read every identity record in the workspace, valid or not. */
function records(workspace: string): AttachmentRecord[] {
  let names: string[] = []
  try {
    names = readdirSync(recordRootOf(workspace)).filter(name => name.endsWith('.json'))
  } catch {
    return []
  }
  const found: AttachmentRecord[] = []
  for (const name of names) {
    try {
      const record = JSON.parse(readFileSync(join(recordRootOf(workspace), name), 'utf8')) as AttachmentRecord
      if (typeof record?.mwt === 'string' && typeof record?.directory === 'string') found.push(record)
    } catch {
      continue
    }
  }
  return found
}

/** Read the record for a project, when a valid backup exists. */
export function findBackup(workspace: string, path: string): BackupRecord | undefined {
  for (const record of records(workspace)) {
    if (!same(path, record.mwt) && !same(path, record.directory)) continue
    if (!valid(workspace, record)) continue
    return toBackup(record)
  }
  return undefined
}

/** Every project with a valid backup in this workspace, one row per project. */
export function listBackups(workspace: string): BackupRecord[] {
  const found: BackupRecord[] = []
  for (const record of records(workspace)) {
    if (!valid(workspace, record)) continue
    if (found.some(existing => same(existing.mwt, record.mwt))) continue
    found.push(toBackup(record))
  }
  return found
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
  if (isInside(join(workspace, '.motionworks'), mwt)) {
    throw new MwiError('REFUSED', `${mwt} lives under .motionworks.`, 'Use the staged-project path for a project in the stage.')
  }
  assertPlainTree(mwt, workspace)
  assertPlainTree(directory, workspace)

  const existing = findBackup(workspace, mwt)
  if (existing !== undefined) return existing
  // A record that no longer validates must be inspected, not silently replaced:
  // a missing or altered backup member is the evidence a restore would need.
  for (const record of records(workspace)) {
    if (same(record.mwt, mwt)) {
      throw new MwiError(
        'BACKUP_INVALID',
        `The existing backup identity for ${mwt} does not verify.`,
        `Inspect ${record.backup} and its manifest before attaching again; a tampered or incomplete backup is not replaced automatically.`,
      )
    }
  }

  const id = randomUUID()
  const name = basename(mwt, '.mwt')
  const stamp = new Date().toISOString().replace(/[:.]/gu, '-')
  const target = join(backupRootOf(workspace), name, stamp)
  const files: BackupFile[] = []
  const sources: string[] = [mwt]
  tree(directory, sources)
  const before = sources.map(source => ({ source, sha256: digest(source) }))
  mkdirSync(target, { recursive: true })
  try {
    for (const item of before) {
      const rel = relative(dirname(mwt), item.source)
      const destination = join(target, rel)
      mkdirSync(dirname(destination), { recursive: true })
      copyFileSync(item.source, destination)
      if (digest(destination) !== item.sha256 || digest(item.source) !== item.sha256) {
        throw new MwiError('BACKUP_UNSTABLE', `The project changed while it was being copied: ${item.source}.`, `Keep ${target} for inspection and retry on an unchanged project.`)
      }
      files.push({ path: rel, sha256: item.sha256 })
    }
    for (const item of before) {
      if (digest(item.source) !== item.sha256) {
        throw new MwiError('BACKUP_UNSTABLE', `The project changed after it was copied: ${item.source}.`, `Keep ${target} for inspection and retry on an unchanged project.`)
      }
    }
  } catch (error) {
    if (error instanceof MwiError) throw error
    throw new MwiError('BACKUP_FAILED', (error as Error).message, `Keep ${target} for inspection; no identity was written.`)
  }

  const manifest = join(target, 'backup-manifest.json')
  writeFileSync(manifest, JSON.stringify({ workspace, mwt, directory, files }, null, 2))
  const record: AttachmentRecord = {
    mode: 'direct',
    workspace,
    mwt,
    directory,
    session_id: null,
    backup: target,
    backup_manifest: manifest,
    backup_manifest_sha256: digest(manifest),
    attached_at: new Date().toISOString(),
  }
  mkdirSync(recordRootOf(workspace), { recursive: true })
  const pending = join(recordRootOf(workspace), `${id}.json.tmp`)
  const final = join(recordRootOf(workspace), `${id}.json`)
  writeFileSync(pending, JSON.stringify(record, null, 2))
  renameSync(pending, final)

  if (!valid(workspace, record)) {
    throw new MwiError('BACKUP_UNVERIFIED', `The backup at ${target} did not verify.`, `Keep ${target} for inspection and take a fresh copy of an unchanged project.`)
  }
  return toBackup(record)
}
