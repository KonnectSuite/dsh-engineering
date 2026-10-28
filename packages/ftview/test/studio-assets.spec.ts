import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptAsset, prepareAlarmExport, prepareDisplayImport, prepareTagExport } from '../src/studio-assets.ts'

/** A fake Public Documents tree with one application and one wizard. */
function fixture(): { root: string; wizard: string; app: string; med: string } {
  const root = mkdtempSync(join(tmpdir(), 'ftview-assets-'))
  const app = 'App'
  const store = join(root, 'RSView Enterprise/ME/HMI projects', app)
  mkdirSync(store, { recursive: true })
  const med = join(store, `${app}.med`)
  writeFileSync(med, 'database')
  const wizard = join(root, 'DatabaseConverter.exe')
  writeFileSync(wizard, 'stub')
  return { root, wizard, app, med }
}

const TAG_CSV = ';Tag Type, Tag Name, Tag Description\n' +
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!\n' +
  'D, Run, , F, D\n' +
  'A, Speed, , F, D\n'

describe('preparing a tag export', () => {
  it('names the med, the wizard and the file to produce', () => {
    const { root, wizard, app, med } = fixture()
    const plan = prepareTagExport(app, root, wizard)
    expect(plan.med).toBe(med)
    expect(plan.destination).toBe(join(root, 'RSView Enterprise/ME/HMI projects', app, `${app}-Tags.CSV`))
    expect(plan.steps.join(' ')).toContain('Export FactoryTalk View tag database')
    expect(plan.steps.join(' ')).toContain('ftview_studio_export_accept')
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses an application without a database', () => {
    const { root, wizard } = fixture()
    expect(() => prepareTagExport('Absent', root, wizard)).toThrow(/project store/)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('accepting an export', () => {
  it('counts tag rows and copies into the export', () => {
    const { root } = fixture()
    const source = join(root, 'Tags.csv')
    writeFileSync(source, TAG_CSV)
    const accepted = acceptAsset('tags', source, join(root, 'export', 'Tags', 'App.csv'))
    expect(accepted.entries).toBe(2)
    expect(accepted.copiedTo).toBe(join(root, 'export', 'Tags', 'App.csv'))
    expect(readFileSync(accepted.copiedTo, 'utf8')).toBe(TAG_CSV)
    rmSync(root, { recursive: true, force: true })
  })

  it('accepts an alarm XML and counts its alarms', () => {
    const { root } = fixture()
    const source = join(root, 'Alarms.xml')
    writeFileSync(source, '<alarms><alarm name="A"/><alarm name="B"/></alarms>')
    expect(acceptAsset('alarms', source).entries).toBe(2)
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses a wrong-shaped file instead of copying it', () => {
    const { root } = fixture()
    const source = join(root, 'not.csv')
    writeFileSync(source, 'hello')
    expect(() => acceptAsset('tags', source)).toThrow(/not a FactoryTalk tag CSV/)
    expect(() => acceptAsset('alarms', source)).toThrow(/not an alarm XML/)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('preparing an alarm export', () => {
  it('points at the Studio wizard and Alarms.xml', () => {
    const { root, app } = fixture()
    const plan = prepareAlarmExport(app, root)
    expect(plan.kind).toBe('alarms')
    expect(plan.destination.endsWith('Alarms.xml')).toBe(true)
    expect(plan.steps.join(' ')).toContain('Alarm Setup')
    rmSync(root, { recursive: true, force: true })
  })
})
describe('packaging a display import', () => {
  it('writes the display and the gfxImport batch file', () => {
    const { root } = fixture()
    const exportRoot = join(root, 'export')
    mkdirSync(join(exportRoot, 'Displays'), { recursive: true })
    writeFileSync(join(exportRoot, 'Displays', 'Arya Proof.xml'), '<?xml version="1.0"?>\n<gfx><displaySettings width="800" height="600"/></gfx>')
    const out = join(root, 'import')
    const plan = prepareDisplayImport(exportRoot, ['Arya Proof'], out)
    expect(plan.displays).toEqual(['Arya Proof'])
    expect(readFileSync(join(out, 'Arya Proof.xml'), 'utf8')).toContain('<gfx>')
    expect(readFileSync(plan.manifest, 'utf8')).toContain('importFile="Arya Proof.xml" importType="create"')
    expect(plan.steps.join(' ')).toContain('Import and Export')
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses a file that is not a gfx display', () => {
    const { root } = fixture()
    const exportRoot = join(root, 'export')
    mkdirSync(join(exportRoot, 'Displays'), { recursive: true })
    writeFileSync(join(exportRoot, 'Displays', 'Bad.xml'), '<display/>')
    expect(() => prepareDisplayImport(exportRoot, ['Bad'], join(root, 'import'))).toThrow(/not a <gfx>/)
    rmSync(root, { recursive: true, force: true })
  })
})