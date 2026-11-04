import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runChecks } from '../src/engine/index.ts'
import { entity, layer, layout, profile, sheetModel, text, titleBlock, ok } from './helpers.mjs'

const LAYERS = [layer('0'), layer('TITLE_BLOCK'), layer('TAGS'), layer('WIRES')]

/** A profile whose layer lists are known. */
function testProfile(overrides = {}) {
  return {
    ...profile(),
    titleBlockLayers: ['TITLE_BLOCK'],
    tagLayers: ['TAGS'],
    wireLayers: ['WIRES'],
    standardLayers: ['0', 'TITLE_BLOCK', 'TAGS', 'WIRES'],
    ...overrides
  }
}

/** Build one check sheet. */
function checkSheet({ path, model, fields = {}, index }) {
  return { path, model, titleBlock: titleBlock(fields), ...(index ? { index } : {}) }
}

/** A minimal clean model: one recognised title block, standard layers, normal text. */
function cleanModel(path) {
  return sheetModel({
    path,
    layers: LAYERS,
    layouts: [
      layout('Model', [
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-1', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 }),
        text('t3', 'TITLE', { x: 10, y: 4, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t4', 'MAIN PANEL', { x: 10.2, y: 3.5, layer: 'TITLE_BLOCK', h: 0.15 }),
        text('t5', 'M1', { x: 2, y: 2, layer: 'TAGS', h: 0.125 })
      ])
    ]
  })
}

test('a clean sheet produces no warning or critical finding, only the scope note', () => {
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-1.dxf', model: cleanModel('SET-1.dxf'), fields: { sheetNumber: 'SET-1', title: 'MAIN PANEL' } })], profile: testProfile() })
  const actionable = findings.filter(finding => finding.severity !== 'info')
  assert.deepEqual(actionable, [])
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, 'ECAD-SCOPE')
  ok(findings[0].message.includes('do not prove'))
})

test('ECAD-TB-MISSING fires when no title-block field was recognised', () => {
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-2.dxf', model: cleanModel('SET-2.dxf') })], profile: testProfile() })
  assert.equal(findings.filter(finding => finding.rule === 'ECAD-TB-MISSING').length, 1)
})

test('ECAD-TB-BLANK names the label with no paired value', () => {
  const model = sheetModel({
    path: 'SET-3.dxf',
    layers: LAYERS,
    layouts: [
      layout('Model', [
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-3', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 }),
        text('t3', 'REVISION LEVEL:', { x: 10, y: 4, layer: 'TITLE_BLOCK', h: 0.08 })
      ])
    ]
  })
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-3.dxf', model, fields: { sheetNumber: 'SET-3' } })], profile: testProfile() })
  const blanks = findings.filter(finding => finding.rule === 'ECAD-TB-BLANK')
  assert.equal(blanks.length, 1)
  ok(blanks[0].message.includes('REVISION LEVEL:'))
})

test('ECAD-SHEET-MISMATCH compares the file name with the title block sheet number', () => {
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-7.dxf', model: cleanModel('SET-7.dxf'), fields: { sheetNumber: 'SET-8', title: 'PANEL' } })], profile: testProfile() })
  const mismatch = findings.filter(finding => finding.rule === 'ECAD-SHEET-MISMATCH')
  assert.equal(mismatch.length, 1)
  ok(mismatch[0].message.includes('sheet 7') && mismatch[0].message.includes('8'))
  // SET-7.dxf also is not in the index, but there is no index in this input.
})

test('ECAD-INDEX-MISMATCH reports missing files and unlisted files, and skips spares', () => {
  const index = {
    layout: 'Model',
    heading: 'SHEET INDEX',
    entries: [
      { raw: '1 21036-001 POWER', sheetNumber: '21036-001', title: 'POWER' },
      { raw: '2 21036-002 PANEL', sheetNumber: '21036-002', title: 'PANEL' },
      { raw: '3 SPARE SHEET', sheetNumber: '3', title: 'SPARE SHEET' },
      { raw: '4', sheetNumber: '4' },
      { raw: '5 21036-005 MISSING', sheetNumber: '21036-005', title: 'MISSING' }
    ]
  }
  const sheets = [
    checkSheet({ path: 'SET-001.dxf', model: cleanModel('SET-001.dxf'), fields: { sheetNumber: '001', title: 'POWER' } }),
    checkSheet({ path: 'SET-002.dxf', model: cleanModel('SET-002.dxf'), fields: { sheetNumber: '002', title: 'PANEL' } }),
    checkSheet({ path: 'SET-009.dxf', model: cleanModel('SET-009.dxf'), fields: { sheetNumber: '009', title: 'EXTRA' } })
  ]
  const findings = runChecks({ sheets, profile: testProfile(), index })
  const mismatch = findings.filter(finding => finding.rule === 'ECAD-INDEX-MISMATCH')
  assert.equal(mismatch.filter(finding => finding.message.includes('lists')).length, 1)
  ok(mismatch.some(finding => finding.message.includes('MISSING')))
  assert.equal(mismatch.filter(finding => finding.message.includes('not listed')).length, 1)
  ok(mismatch.some(finding => finding.message.includes('SET-009.dxf')))
})

test('ECAD-DEVICE-DUPLICATE and ECAD-WIRE-DUPLICATE are candidates, not verdicts', () => {
  const model = sheetModel({
    path: 'SET-4.dxf',
    layers: LAYERS,
    layouts: [
      layout('Model', [
        text('d1', 'M1', { x: 1, y: 1, layer: 'TAGS', h: 0.125 }),
        text('d2', 'M1', { x: 2, y: 1, layer: 'TAGS', h: 0.125 }),
        text('w1', '7', { x: 1, y: 3, layer: 'WIRES', h: 0.125 }),
        text('w2', '7', { x: 2, y: 3, layer: 'WIRES', h: 0.125 }),
        text('w3', '7', { x: 3, y: 3, layer: 'WIRES', h: 0.125 }),
        text('w4', '7', { x: 4, y: 3, layer: 'WIRES', h: 0.125 }),
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-4', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 })
      ])
    ]
  })
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-4.dxf', model, fields: { sheetNumber: 'SET-4', title: 'PANEL' } })], profile: testProfile() })
  const device = findings.filter(finding => finding.rule === 'ECAD-DEVICE-DUPLICATE')
  assert.equal(device.length, 1)
  ok(device[0].message.includes('M1'))
  ok(device[0].fix.includes('candidate'))
  const wire = findings.filter(finding => finding.rule === 'ECAD-WIRE-DUPLICATE')
  assert.equal(wire.length, 1)
  ok(wire[0].fix.includes('not a connectivity result'))
})

test('ECAD-TEXT-TOO-SMALL aggregates by layer and height', () => {
  const model = sheetModel({
    path: 'SET-5.dxf',
    layers: LAYERS,
    layouts: [
      layout('Model', [
        text('s1', 'tiny one', { x: 1, y: 1, layer: '0', h: 0.01 }),
        text('s2', 'tiny two', { x: 2, y: 1, layer: '0', h: 0.01 }),
        text('ok', 'normal', { x: 3, y: 1, layer: '0', h: 0.125 }),
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-5', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 })
      ])
    ]
  })
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-5.dxf', model, fields: { sheetNumber: 'SET-5', title: 'PANEL' } })], profile: testProfile() })
  const small = findings.filter(finding => finding.rule === 'ECAD-TEXT-TOO-SMALL')
  assert.equal(small.length, 1)
  ok(small[0].message.includes('2 text entities'))
  ok(small[0].message.includes('0.01'))
})

test('ECAD-LAYER-UNKNOWN warns about a layer outside the profile standard', () => {
  const model = sheetModel({
    path: 'SET-6.dxf',
    layers: [...LAYERS, layer('WEIRD')],
    layouts: [
      layout('Model', [
        text('x1', 'M2', { x: 1, y: 1, layer: 'WEIRD', h: 0.125 }),
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-6', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 })
      ])
    ]
  })
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-6.dxf', model, fields: { sheetNumber: 'SET-6', title: 'PANEL' } })], profile: testProfile() })
  const unknown = findings.filter(finding => finding.rule === 'ECAD-LAYER-UNKNOWN')
  assert.equal(unknown.length, 1)
  assert.equal(unknown[0].layer, 'WEIRD')
})

test('ECAD-SHEET-REF-UNRESOLVED reports a reference the set cannot answer', () => {
  const model = sheetModel({
    path: 'SET-7.dxf',
    layers: LAYERS,
    layouts: [
      layout('Model', [
        text('r1', 'SEE SHEET 44', { x: 1, y: 1, layer: '0', h: 0.125 }),
        text('t1', 'SHEET NUMBER:', { x: 10, y: 2, layer: 'TITLE_BLOCK', h: 0.08 }),
        text('t2', 'SET-7', { x: 10.5, y: 1.5, layer: 'TITLE_BLOCK', h: 0.15 })
      ])
    ]
  })
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-7.dxf', model, fields: { sheetNumber: 'SET-7', title: 'PANEL' } })], profile: testProfile() })
  const unresolved = findings.filter(finding => finding.rule === 'ECAD-SHEET-REF-UNRESOLVED')
  assert.equal(unresolved.length, 1)
  ok(unresolved[0].message.includes('SHEET 44'))
})

test('findings are in stable rule order and the scope note is unique', () => {
  const model = cleanModel('SET-1.dxf')
  const findings = runChecks({ sheets: [checkSheet({ path: 'SET-1.dxf', model, fields: { sheetNumber: 'SET-1', title: 'MAIN' } })], profile: testProfile() })
  const scope = findings.filter(finding => finding.rule === 'ECAD-SCOPE')
  assert.equal(scope.length, 1)
  assert.equal(findings[findings.length - 1].rule, 'ECAD-SCOPE')
})

test('the finding cap keeps the scope note', () => {
  const model = cleanModel('SET-1.dxf')
  const modelWithProblem = {
    ...model,
    layouts: [layout('Model', [...model.layouts[0].entities, text('x1', 'M2', { x: 1, y: 1, layer: 'WEIRD', h: 0.125 })])],
    layers: [...model.layers, layer('WEIRD')]
  }
  const findings = runChecks(
    { sheets: [checkSheet({ path: 'SET-1.dxf', model: modelWithProblem, fields: { sheetNumber: 'SET-1', title: 'MAIN' } })], profile: testProfile() },
    { maxFindings: 1 }
  )
  assert.equal(findings.length, 1)
  assert.equal(findings[0].rule, 'ECAD-SCOPE')
})

test('helpers numericSuffix normalises sheet numbers', async () => {
  const { numericSuffix, profileFields } = await import('../src/engine/index.ts')
  assert.equal(numericSuffix('FC1000495-031'), 31)
  assert.equal(numericSuffix('031'), 31)
  assert.equal(numericSuffix('no digits'), undefined)
  assert.equal(profileFields(testProfile()).length, 10)
  ok(entity('x', 'line').k === 'line')
})
