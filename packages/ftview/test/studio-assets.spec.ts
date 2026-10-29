import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acceptAsset, displayNamesIn, prepareAlarmExport, prepareDisplayImport, prepareTagExport } from '../src/studio-assets.ts'

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

  it('writes the import type the caller asked for', () => {
    const { root } = fixture()
    const exportRoot = join(root, 'export')
    mkdirSync(join(exportRoot, 'Displays'), { recursive: true })
    writeFileSync(join(exportRoot, 'Displays', 'Arya Proof.xml'), '<?xml version="1.0"?>\n<gfx><displaySettings width="800" height="600"/></gfx>')
    const out = join(root, 'import-update')
    const plan = prepareDisplayImport(exportRoot, ['Arya Proof'], out, 'update')
    const manifest = readFileSync(plan.manifest, 'utf8')
    expect(manifest).toContain('importType="update"')
    expect(manifest).not.toContain('importType="create"')
    expect(plan.steps.join(' ')).toContain('0 create, 1 update')
    rmSync(root, { recursive: true, force: true })
  })

  it('writes create for a new display and update for one the application already holds', () => {
    const { root } = fixture()
    const exportRoot = join(root, 'export')
    const currentRoot = join(root, 'current')
    mkdirSync(join(exportRoot, 'Displays'), { recursive: true })
    mkdirSync(join(currentRoot, 'Displays'), { recursive: true })
    for (const name of ['Arya Proof', 'Arya New']) {
      writeFileSync(join(exportRoot, 'Displays', `${name}.xml`), '<?xml version="1.0"?>\n<gfx><displaySettings width="800" height="600"/></gfx>')
    }
    writeFileSync(join(currentRoot, 'Displays', 'Arya Proof.xml'), '<?xml version="1.0"?>\n<gfx><displaySettings width="800" height="600"/></gfx>')
    const out = join(root, 'import-mixed')
    const plan = prepareDisplayImport(exportRoot, ['Arya Proof', 'Arya New'], out, 'create', displayNamesIn(currentRoot))
    const manifest = readFileSync(plan.manifest, 'utf8')
    expect(manifest).toContain('importFile="Arya Proof.xml" importType="update"')
    expect(manifest).toContain('importFile="Arya New.xml" importType="create"')
    expect(plan.created).toBe(1)
    expect(plan.updated).toBe(1)
    expect(plan.decisions.map(decision => decision.action)).toEqual(['update', 'create'])
    expect(plan.steps.join(' ')).toContain('1 create, 1 update')
    rmSync(root, { recursive: true, force: true })
  })

  it('refuses a gfx file that does not parse instead of handing it to the wizard', () => {
    const { root } = fixture()
    const exportRoot = join(root, 'export')
    mkdirSync(join(exportRoot, 'Displays'), { recursive: true })
    writeFileSync(join(exportRoot, 'Displays', 'Broken.xml'), '<gfx><screen')
    expect(() => prepareDisplayImport(exportRoot, ['Broken'], join(root, 'import-broken'))).toThrow(/does not parse as a display/)
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
describe('writing snapshots straight into the export', () => {
  it('targets Tags/<application>.csv inside the export root', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-assets-target-'))
    const programFiles = join(root, 'Program Files (x86)')
    const documentsRoot = join(root, 'Documents')
    const wizard = join(programFiles, 'Rockwell Software/RSView Enterprise/DatabaseConverter.exe')
    mkdirSync(join(programFiles, 'Rockwell Software/RSView Enterprise'), { recursive: true })
    writeFileSync(wizard, 'stub')
    mkdirSync(join(documentsRoot, 'RSView Enterprise/ME/HMI projects/AppA'), { recursive: true })
    writeFileSync(join(documentsRoot, 'RSView Enterprise/ME/HMI projects/AppA/AppA.med'), 'stub')
    const plan = prepareTagExport('AppA', documentsRoot, wizard, join(root, 'Export'))
    expect(plan.destination).toBe(join(root, 'Export', 'Tags', 'AppA.csv'))
    expect(plan.steps.join(' ')).toContain('validate it in place')
    rmSync(root, { recursive: true, force: true })
  })

  it('targets Alarms/Alarms.xml inside the export root', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-alarms-target-'))
    const documentsRoot = join(root, 'Documents')
    mkdirSync(join(documentsRoot, 'RSView Enterprise/ME/HMI projects/AppA'), { recursive: true })
    writeFileSync(join(documentsRoot, 'RSView Enterprise/ME/HMI projects/AppA/AppA.med'), 'stub')
    const plan = prepareAlarmExport('AppA', documentsRoot, join(root, 'Export'))
    expect(plan.destination).toBe(join(root, 'Export', 'Alarms', 'Alarms.xml'))
    expect(plan.steps.join(' ')).toContain('browse')
    rmSync(root, { recursive: true, force: true })
  })

  it('accepts a file already in place without copying it', () => {
    const root = mkdtempSync(join(tmpdir(), 'ftview-assets-inplace-'))
    const file = join(root, 'Alarms', 'Alarms.xml')
    mkdirSync(join(root, 'Alarms'), { recursive: true })
    writeFileSync(file, '<?xml version="1.0"?><alarms version="1.0"><alarm name="A"/></alarms>')
    const accepted = acceptAsset('alarms', file, file)
    expect(accepted.entries).toBe(1)
    expect(accepted.copiedTo).toBe(file)
    rmSync(root, { recursive: true, force: true })
  })
})