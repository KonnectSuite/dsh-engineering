import { describe, expect, it } from 'vitest'
import { observeObjects } from '../src/catalog.ts'
import { contrastRatio, designFindings } from '../src/design.ts'
import type { Application, DisplayFile, DisplayObject } from '../src/model.ts'

/** One object with attributes. */
function object(type: string, name: string, attributes: Record<string, string>): DisplayObject {
  return { type, name, attributes }
}

/** One display. */
function display(name: string, objects: readonly DisplayObject[]): DisplayFile {
  return { file: `Displays/${name}.xml`, name, objects }
}

/** The minimum application the checks read. */
function appWith(displays: readonly DisplayFile[]): Application {
  return { root: 'C:/export', name: 'App', displays, tags: [], tagFiles: [], tagErrors: [], diagnostics: [], files: [] }
}

describe('the object catalog', () => {
  it('counts usage and keeps example values', () => {
    const app = appWith([display('Main', [
      object('momentaryButton', 'Start', { width: '120', height: '50', caption: 'Start' }),
      object('momentaryButton', 'Stop', { width: '120', height: '50', caption: 'Stop' }),
      object('text', 'Title', { caption: 'Line', fontSize: '20' }),
    ])])
    const catalog = observeObjects(app)
    expect(catalog[0]).toMatchObject({ type: 'momentaryButton', used: 2 })
    const width = catalog[0].attributes.find(attribute => attribute.name === 'width')
    expect(width).toMatchObject({ used: 2, examples: ['120'] })
    expect(catalog.find(entry => entry.type === 'text')?.used).toBe(1)
  })
})

describe('design checks', () => {
  it('computes a contrast ratio', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeGreaterThan(20)
    expect(contrastRatio('#777777', '#888888')).toBeLessThan(1.5)
  })

  it('reports small touch targets, low contrast and unreachable displays', () => {
    const app = appWith([
      display('Main', [
        object('gotoButton', 'ToSetup', { width: '120', height: '60', display: 'Setup' }),
        object('momentaryButton', 'Tiny', { width: '20', height: '20', caption: 'x' }),
        object('text', 'Dim', { color: '#777777', backColor: '#888888', caption: 'hard to read' }),
      ]),
      display('Setup', []),
      display('Orphan', []),
    ])
    const findings = designFindings(app)
    const rules = findings.map(finding => finding.rule)
    expect(rules).toContain('VIEW-HPM-02')
    expect(rules).toContain('VIEW-COLOR-01')
    expect(rules).toContain('VIEW-NAV-01')
    expect(findings.some(finding => finding.message.includes('Tiny'))).toBe(true)
    expect(findings.some(finding => finding.message.includes('Orphan'))).toBe(true)
    expect(findings.filter(finding => finding.rule === 'VIEW-NAV-01' && (finding.evidence as { display?: string }).display === 'Setup')).toEqual([])
  })
})
