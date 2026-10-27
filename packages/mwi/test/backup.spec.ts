/**
 * Pre-edit backups: one verified copy under <workspace>/backups, reused on the
 * next attach, and refused for links or incomplete projects.
 */
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { backupRootOf, ensureBackup, findBackup, listBackups } from '../src/session/backup.ts'

function project(): string {
  const workspace = mkdtempSync(join(tmpdir(), 'mwi-backup-'))
  mkdirSync(join(workspace, 'Line', 'plans'), { recursive: true })
  writeFileSync(join(workspace, 'Line.mwt'), 'wrapper')
  writeFileSync(join(workspace, 'Line', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM')
  writeFileSync(join(workspace, 'Line', 'plans', 'notes.txt'), 'project notes')
  return workspace
}

describe('pre-edit backups', () => {
  it('copies the wrapper and the expanded project with a hash manifest', () => {
    const workspace = project()
    const record = ensureBackup(workspace, join(workspace, 'Line.mwt'))
    expect(record.backup.startsWith(backupRootOf(workspace))).toBe(true)
    expect(JSON.parse(readFileSync(record.manifest, 'utf8')).files).toHaveLength(3)
    expect(findBackup(workspace, join(workspace, 'Line'))).toMatchObject({ name: 'Line' })
    expect(listBackups(workspace)).toHaveLength(1)
  })

  it('reuses a valid backup instead of taking a second one', () => {
    const workspace = project()
    const first = ensureBackup(workspace, join(workspace, 'Line.mwt'))
    const second = ensureBackup(workspace, join(workspace, 'Line'))
    expect(second.backup).toBe(first.backup)
    expect(listBackups(workspace)).toHaveLength(1)
  })

  it('accepts a workspace folder and resolves its sibling .mwt', () => {
    const workspace = project()
    const record = ensureBackup(workspace, join(workspace, 'Line'))
    expect(record.mwt).toBe(join(workspace, 'Line.mwt'))
  })

  it('refuses an incomplete project and a project outside the workspace', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mwi-backup-'))
    writeFileSync(join(workspace, 'Only.mwt'), 'wrapper')
    expect(() => ensureBackup(workspace, join(workspace, 'Only.mwt'))).toThrow(/no expanded project directory/i)
    const outside = project()
    expect(() => ensureBackup(workspace, join(outside, 'Line.mwt'))).toThrow(/outside/i)
  })
})
