/**
 * Reading without a project name: an attached direct project is the default,
 * and a leftover stage must not make that call ambiguous.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ensureBackup } from '../src/session/backup.ts'
import { defaultProject } from '../src/session/project.ts'

function project(name: string): { workspace: string; mwt: string } {
  const workspace = mkdtempSync(join(tmpdir(), 'mwi-default-'))
  mkdirSync(join(workspace, name), { recursive: true })
  const mwt = join(workspace, `${name}.mwt`)
  writeFileSync(mwt, 'wrapper')
  writeFileSync(join(workspace, name, 'Main.st'), 'PROGRAM Main\nEND_PROGRAM')
  return { workspace, mwt }
}

describe('defaultProject', () => {
  it('uses the single attached project when there is no stage', () => {
    const { workspace, mwt } = project('Line')
    ensureBackup(workspace, mwt)
    const ref = defaultProject(workspace)
    expect(ref.name).toBe('Line')
    expect(ref.directory).toBe(join(workspace, 'Line'))
  })

  it('names the attached projects when more than one is open', () => {
    const first = project('LineA')
    const workspace = first.workspace
    mkdirSync(join(workspace, 'LineB'), { recursive: true })
    writeFileSync(join(workspace, 'LineB.mwt'), 'wrapper')
    writeFileSync(join(workspace, 'LineB', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM')
    ensureBackup(workspace, first.mwt)
    ensureBackup(workspace, join(workspace, 'LineB.mwt'))
    expect(() => defaultProject(workspace)).toThrowError(/AMBIGUOUS_PROJECT|projects have a pre-edit backup/)
  })

  it('keeps a stale stage from shadowing the attached project', () => {
    const { workspace, mwt } = project('Line')
    ensureBackup(workspace, mwt)
    const stage = join(workspace, '.motionworks', 'stage')
    mkdirSync(join(stage, 'Stale'), { recursive: true })
    writeFileSync(join(stage, 'Stale.mwt'), 'wrapper')
    writeFileSync(join(stage, 'Stale', 'Main.st'), 'PROGRAM Main\nEND_PROGRAM')
    expect(defaultProject(workspace).name).toBe('Line')
  })
})
