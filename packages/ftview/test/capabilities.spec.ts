import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { capabilities } from '../src/capabilities.ts'

/** A fake host with Studio, the tag wizard, two schemas and one application. */
function host(): { programFiles: string; documentsRoot: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'ftview-capabilities-'))
  const programFiles = join(root, 'Program Files (x86)')
  const documentsRoot = join(root, 'Documents')
  mkdirSync(join(programFiles, 'Rockwell Software/RSView Enterprise/Schemas'), { recursive: true })
  writeFileSync(join(programFiles, 'Rockwell Software/RSView Enterprise/VStudio.exe'), 'stub')
  writeFileSync(join(programFiles, 'Rockwell Software/RSView Enterprise/DatabaseConverter.exe'), 'stub')
  writeFileSync(join(programFiles, 'Rockwell Software/RSView Enterprise/Schemas/Gfx-ME16.xsd'), 'stub')
  writeFileSync(join(programFiles, 'Rockwell Software/RSView Enterprise/Schemas/Gfx-ME17.xsd'), 'stub')
  mkdirSync(join(documentsRoot, 'RSView Enterprise/ME/HMI projects/AppA'), { recursive: true })
  return { programFiles, documentsRoot, root }
}

describe('host capabilities', () => {
  it('reports installed wizards, schemas and applications', () => {
    const { programFiles, documentsRoot, root } = host()
    const report = capabilities({ programFiles, documentsRoot })
    expect(report.tagWizard).toContain('DatabaseConverter.exe')
    expect(report.studio).toContain('VStudio.exe')
    expect(report.schemas).toEqual(['16', '17'])
    expect(report.applications).toBe(1)
    expect(report.tags).toBe('available')
    expect(report.alarms).toBe('requires-studio')
    expect(report.import).toBe('requires-studio')
    rmSync(root, { recursive: true, force: true })
  })

  it('reports missing wizards instead of guessing', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-capabilities-empty-'))
    const report = capabilities({ programFiles: join(root, 'none'), documentsRoot: join(root, 'none') })
    expect(report.tags).toBe('missing')
    expect(report.alarms).toBe('missing')
    expect(report.schemas).toEqual([])
    rmSync(root, { recursive: true, force: true })
  })
})
