import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { harness } from './harness.ts'
import { COMPONENT_CATEGORIES, COMPONENT_FORBIDDEN, prepareComponentPackage } from '../src/studio-assets.ts'

const DISPLAY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '  <displaySettings width="1280" height="1024"/>',
  '  <panel name="Panel17" left="402" top="292"/>',
  '</gfx>',
  '',
].join('\n')

/** A real export folder on disk with Displays/<name>.xml fixtures. */
function exportOnDisk(names: readonly string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'ftview-comp-'))
  mkdirSync(join(root, 'Displays'), { recursive: true })
  for (const name of names) writeFileSync(join(root, 'Displays', `${name}.xml`), DISPLAY, 'utf8')
  return root
}

describe('component package', () => {
  it('writes the list file, copies the components, and returns the command', () => {
    const exportRoot = exportOnDisk(['Main', 'Alarm'])
    const out = join(exportRoot, 'package')
    const plan = prepareComponentPackage('CC019_Main', exportRoot, ['Main', 'Alarm'], out)
    expect(plan.command).toBe(`SEAddComponent CC019_Main ME / "${join(out, 'CC019_Main-Components.xml')}"`)
    expect(plan.logFile).toBe(join(out, '$AddComponent.txt'))
    const list = readFileSync(plan.listFile, 'utf8')
    expect(list).toContain('<hmi>')
    expect(list).toContain(`    <category type="Graphics;Displays" folder="${out}">`)
    expect(list).toContain('        <component file="Main.xml"/>')
    expect(list).toContain('        <component file="Alarm.xml"')
    expect(list).not.toContain('folder="\\"')
    expect(list).toContain('</hmi>')
    expect(readFileSync(join(out, 'Main.xml'), 'utf8')).toContain('<gfx')
    expect(plan.components).toEqual([
      { file: 'Main.xml', category: 'Graphics;Displays', folder: '' },
      { file: 'Alarm.xml', category: 'Graphics;Displays', folder: '' },
    ])
    expect(plan.steps.join('\n')).toContain('$AddComponent.txt')
    expect(plan.steps.join('\n')).toContain('exit code 0 means installed, 1 means refused')
  })

  it('appends overwrite and honours category and target folder', () => {
    const exportRoot = exportOnDisk(['Main'])
    const plan = prepareComponentPackage('App', exportRoot, ['Main'], join(exportRoot, 'p2'), 'Graphics;Global Objects', '\\Global', true)
    expect(plan.command).toContain(' overwrite')
    const list = readFileSync(plan.listFile, 'utf8')
    expect(list).toContain('<category type="Graphics;Global Objects"')
    expect(list).toContain('<component file="Main.xml" folder="Global"/>')
  })

  it('leaves the folder attribute off at the root, and drops a leading separator', () => {
    const exportRoot = exportOnDisk(['Main'])
    for (const [index, target] of ['', '\\', '/', '  '].entries()) {
      const plan = prepareComponentPackage('App', exportRoot, ['Main'], join(exportRoot, `root-${index}`), 'Graphics;Displays', target)
      const list = readFileSync(plan.listFile, 'utf8')
      expect(list, target).toContain('        <component file="Main.xml"/>')
      expect(list, target).not.toContain('folder="\\"')
      expect(plan.components[0]?.folder, target).toBe('')
    }
    // A separator at the front is not part of a folder name: the tool would make a
    // nameless folder (measured: folder="\" produced an unnamed node in the Explorer).
    const named = prepareComponentPackage('App', exportRoot, ['Main'], join(exportRoot, 'named'), 'Graphics;Displays', '\\Imported')
    expect(readFileSync(named.listFile, 'utf8')).toContain('<component file="Main.xml" folder="Imported"/>')
  })

  it('refuses names the Add Component Tool forbids, unknown categories, and missing files', () => {
    const exportRoot = exportOnDisk(['Main'])
    expect(() => prepareComponentPackage('App', exportRoot, ['Main:1'], join(exportRoot, 'a'))).toThrow(/refuses: :/)
    expect(() => prepareComponentPackage('App', exportRoot, [], join(exportRoot, 'b'))).toThrow(/at least one component/)
    expect(() => prepareComponentPackage('App', exportRoot, ['Main'], join(exportRoot, 'c'), 'Graphics;Nope')).toThrow(/not one of them/)
    expect(() => prepareComponentPackage('App', exportRoot, ['Ghost'], join(exportRoot, 'd'))).toThrow(/no component file/)
    expect(() => prepareComponentPackage('App', exportRoot, ['Main'], exportRoot)).toThrow(/already exists/)
    // The forbidden set covers exactly the characters the tool documents.
    for (const char of ['%', '.', '"', ':', '?', '*', '<', '>', '#', '{', '}', '-', '[', ']', "'", '\\', '/', ';', '=', '&', '+']) {
      expect(COMPONENT_FORBIDDEN.test(char), char).toBe(true)
    }
    expect(COMPONENT_FORBIDDEN.test('Main_1')).toBe(false)
    expect(COMPONENT_CATEGORIES).toContain('Graphics;DisplayFolders')
  })

  it('refuses a file Studio would refuse', () => {
    const root = exportOnDisk([])
    writeFileSync(join(root, 'Displays', 'Broken.xml'), '<Display><Object/></Display>', 'utf8')
    expect(() => prepareComponentPackage('App', root, ['Broken'], join(root, 'e'))).toThrow(/not a <gfx> display document/)
  })

  it('runs as a tool over a real export folder', async () => {
    const exportRoot = exportOnDisk(['Main'])
    const out = join(exportRoot, 'tool-package')
    const l5x = harness(new Map(), {})
    const packaged = await l5x.call('ftview_component_package', {
      application: 'CC019_Main',
      export_root: exportRoot,
      components: 'Main',
      output_root: out,
      overwrite: 'yes',
    })
    expect(packaged.error).toBeUndefined()
    expect(packaged.summary).toContain('Packaged 1 component(s) for CC019_Main into Graphics;Displays')
    expect(packaged.summary).toContain('SEAddComponent CC019_Main ME')
    expect(packaged.summary).toContain('overwrite')
    expect(readFileSync(join(out, 'CC019_Main-Components.xml'), 'utf8')).toContain('<component file="Main.xml"')
    const refused = await l5x.call('ftview_component_package', {
      application: 'CC019_Main',
      export_root: exportRoot,
      components: 'Main:2',
      output_root: join(exportRoot, 'tool-refused'),
    })
    expect(refused.error?.code).toBe('COMPONENT_PACKAGE_FAILED')
    expect(refused.error?.fix).toContain('cannot carry')
  })
})
