import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PHANTOM_HINTS, TYPE_GUIDE, isPressTarget, observeObjects } from '../src/catalog.ts'
import { contrastRatio, designFindings } from '../src/design.ts'
import type { Application, DisplayFile, DisplayObject } from '../src/model.ts'

/** The snapshot the package ships, read the way the runtime reads it when no Studio is installed. */
const snapshot = JSON.parse(readFileSync(join(__dirname, '..', 'schema', 'me-schema.json'), 'utf8')) as {
  schema: string
  displayChildren: string[]
  types: Record<string, { attributes: Record<string, { required: boolean }> }>
}

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
  return { root: 'C:/export', name: 'App', displays, tags: [], tagFiles: [], tagErrors: [], alarmFiles: [], manifestFiles: [], diagnostics: [], files: [] }
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

  it('keeps the schema parts out of the type list when a vocabulary is passed', () => {
    const app = appWith([display('Main', [
      object('momentaryButton', 'Start', { width: '120' }),
      object('caption', 'leaked', {}),
      object('state', 'leaked', {}),
    ])])
    const catalog = observeObjects(app, new Set(['momentaryButton', 'text']))
    expect(catalog.map(entry => entry.type)).toEqual(['momentaryButton'])
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

describe('the element vocabulary comes from the schema', () => {
  it('ships a snapshot with the display elements the vendor declares', () => {
    expect(snapshot.displayChildren.length).toBeGreaterThan(80)
    // The vendor's own vocabulary, not a hand-kept list: these are real and were once refused.
    for (const type of ['maintainedButton', 'closeButton', 'macroButton', 'numericInputEnable', 'stringInputEnable', 'interlockedButton', 'displayListSelector', 'controlListSelector', 'pilotedControlListSelector', 'recipePlusTable', 'scale', 'listIndicator']) {
      expect(snapshot.displayChildren).toContain(type)
    }
  })

  it('names no element the schema does not declare', () => {
    for (const phantom of Object.keys(PHANTOM_HINTS)) {
      expect(snapshot.displayChildren).not.toContain(phantom)
      expect(PHANTOM_HINTS[phantom]).toMatch(/is|are/)
    }
    // The eight names the old contract invented, each with the real counterpart in its hint.
    expect(Object.keys(PHANTOM_HINTS).sort()).toEqual(['globalObject', 'listSelector', 'maintainButton', 'numericInput', 'recipe', 'referenceObject', 'stringInput', 'trend'])
  })

  it('documents only elements the schema declares', () => {
    for (const type of Object.keys(TYPE_GUIDE)) {
      expect(snapshot.displayChildren).toContain(type)
      expect(TYPE_GUIDE[type]?.required.length ?? 0).toBeGreaterThan(0)
      expect(typeof TYPE_GUIDE[type]?.note).toBe('string')
    }
    expect(TYPE_GUIDE.momentaryButton?.children).toContain('states')
    expect(TYPE_GUIDE.image?.required).toContain('imageName')
    // The corrected craft claims: a caption child where the schema has one, and none where it does not.
    expect(TYPE_GUIDE.gotoButton?.children).toContain('caption')
    expect(TYPE_GUIDE.text?.children ?? []).not.toContain('caption')
    expect(TYPE_GUIDE.rampButton?.children ?? []).not.toContain('states')
  })

  it('treats every press target as one the schema declares', () => {
    for (const type of ['momentaryButton', 'maintainedButton', 'gotoButton', 'acknowledgeAlarmButton', 'silenceAlarmsButton', 'loginButton', 'moveUpKey', 'enterKey']) {
      expect(isPressTarget(type)).toBe(true)
    }
    for (const type of ['text', 'panel', 'numericDisplay', 'multistateIndicator', 'alarmList']) {
      expect(isPressTarget(type)).toBe(false)
    }
  })
})
