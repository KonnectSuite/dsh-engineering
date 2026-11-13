/**
 * The ECAD conversation card model.
 *
 * The tool answers are the contract here: each case pins the fields an ECAD
 * tool documents to the compact card the transcript draws, and the failure cases
 * pin the card's honesty — a payload it cannot read prints the text it saw, never
 * a card that invents counts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cardOfContent,
  cardOfValue,
  ECAD_TOOL_NAMES,
  sheetSetOf,
  sheetSetVisible,
  textOfContent,
} from '../../src/client/toolCards.ts'

/** One tool answer as the host carries it: the JSON document in one text block. */
function contentOf(value) {
  return [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, undefined, 2) }]
}

/** One ECAD success answer. */
function answer(summary, data) {
  return contentOf({ summary, data, next: [], coverage: { complete: true, unverified: [] } })
}

const OPEN = {
  path: 'Prints/DXF/FC1000495-002.dxf',
  requestedPath: 'Prints/DXF/FC1000495-002.dxf',
  sourceBytes: 409_600,
  version: 'sha-1',
  dxfVersion: 'AC1027',
  layouts: [
    { id: 'Model', name: 'Model', kind: 'model', entities: 996 },
    { id: 'Layout1', name: 'Layout1', kind: 'paper', entities: 1 },
  ],
  entities: 996,
  unsupported: {},
  unsupportedTotal: 0,
  approximate: 3,
  truncated: false,
  layers: 4,
  blocks: 2,
  titleBlock: { fields: { sheetNumber: '002', title: '480VAC POWER DIST.' } },
  modelPath: '.ecad/previews/abc.json',
  profileSource: 'workspace',
  writes: true,
}

test('content text is read only from text blocks, never from other kinds', () => {
  assert.equal(textOfContent([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }]), 'a\nb')
  assert.equal(textOfContent(undefined), '')
})

test('an ecad_open DXF answer becomes the opened-drawing card', () => {
  const card = cardOfContent('ecad_open', answer('Opened Prints/DXF/FC1000495-002.dxf: 996 primitives in 2 layout(s).', OPEN))
  assert.equal(card.kind, 'open')
  assert.equal(card.path, 'Prints/DXF/FC1000495-002.dxf')
  assert.equal(card.format, 'dxf')
  assert.equal(card.converted, false)
  assert.equal(card.dwgWarnings, 0)
  assert.equal(card.entities, 996)
  assert.equal(card.layouts, 2)
  assert.equal(card.unsupported, 0)
  assert.equal(card.approximate, 3)
  assert.equal(card.truncated, false)
  assert.equal(card.titleBlock, true)
  assert.equal(card.modelPath, '.ecad/previews/abc.json')
  assert.match(card.summary, /Opened Prints/u)
})

test('an ecad_open DWG answer carries the conversion and its warning count', () => {
  const card = cardOfContent('ecad_open', answer('Opened Prints/DWG/20136-002.dwg.', {
    ...OPEN,
    path: 'Prints/DWG/20136-002.dwg',
    format: 'dwg',
    converted: { converter: 'acadrust/0.6.8', sourceVersion: 'AC1027', warnings: ['font substituted', 'block renamed'] },
  }))
  assert.equal(card.kind, 'open')
  assert.equal(card.format, 'dwg')
  assert.equal(card.converted, true)
  assert.equal(card.dwgWarnings, 2)
})

test('a DWG path is recognised even when the answer omits the format', () => {
  const card = cardOfValue('ecad_open', { summary: 's', data: { ...OPEN, path: 'Prints/DWG/x.dwg' } })
  assert.equal(card.kind, 'open')
  assert.equal(card.format, 'dwg')
})

test('an ecad_scan answer becomes the index card', () => {
  const card = cardOfContent('ecad_scan', answer('Indexed 33 drawing(s) in 4 set(s), 1 skipped.', {
    indexPath: '.ecad/index.json',
    root: 'C:/workspace',
    sheets: 33,
    sets: { '480V': 12, '24VDC': 21 },
    formats: { dxf: 30, dwg: 3 },
    unsupported: 7,
    skipped: [{ path: 'x.dwg', reason: 'converter unavailable' }],
    truncated: false,
  }))
  assert.equal(card.kind, 'scan')
  assert.equal(card.indexPath, '.ecad/index.json')
  assert.equal(card.sheets, 33)
  assert.equal(card.sets, 2)
  assert.deepEqual(card.formats, { dxf: 30, dwg: 3 })
  assert.equal(card.skipped, 1)
  assert.equal(card.unsupported, 7)
  assert.equal(card.truncated, false)
})

test('an ecad_checks answer counts findings by severity and bounds the rows', () => {
  const findings = [
    { rule: 'ECAD-TB-MISSING', severity: 'critical', message: 'title block missing', sheet: 'Prints/a.dxf' },
    { rule: 'ECAD-WIRE-DUPLICATE', severity: 'warning', message: 'wire 12 appears twice' },
    { rule: 'ECAD-SCOPE', severity: 'info', message: 'static checks only' },
    ...Array.from({ length: 10 }, (_, index) => ({ rule: 'ECAD-LAYER-UNKNOWN', severity: 'info', message: `layer ${index}` })),
  ]
  const card = cardOfContent('ecad_checks', answer('13 finding(s) from 2 drawing(s): 2 warning/critical.', {
    sheets: 2,
    findings,
    counts: { bySeverity: { critical: 1, warning: 1, info: 11 } },
    scope: 'These checks do not prove connectivity.',
  }))
  assert.equal(card.kind, 'checks')
  assert.equal(card.total, 13)
  assert.equal(card.critical, 1)
  assert.equal(card.warning, 1)
  assert.equal(card.info, 11)
  assert.equal(card.findings.length, 8, 'the card bounds its rows')
  assert.equal(card.findings[0].sheet, 'Prints/a.dxf')
  assert.match(card.scope, /connectivity/u)
})

test('an ecad_cross_reference answer bounds candidates and counts statuses', () => {
  const rows = Array.from({ length: 12 }, (_, index) => ({
    kind: index % 2 === 0 ? 'device-tag' : 'wire-label',
    value: `-${index}${index % 2 === 0 ? 'K1' : 'W12'}`,
    status: index === 0 ? 'duplicate' : index === 1 ? 'one-sided' : index === 2 ? 'unresolved' : 'ok',
    confidence: 0.75,
    occurrences: 2,
    note: index === 0 ? 'same tag on two sheets' : undefined,
  }))
  const card = cardOfContent('ecad_cross_reference', answer('12 cross-reference candidate(s) from 3 drawing(s).', {
    sheets: 3,
    rows,
    totals: { byKind: { 'device-tag': 6, 'wire-label': 6 }, byStatus: { 'device-tag:duplicate': 1, 'device-tag:ok': 5, 'wire-label:one-sided': 1, 'wire-label:unresolved': 1, 'wire-label:ok': 4 } },
  }))
  assert.equal(card.kind, 'crossReference')
  assert.equal(card.total, 12)
  assert.equal(card.sheets, 3)
  assert.equal(card.rows.length, 8)
  assert.equal(card.duplicate, 1)
  assert.equal(card.oneSided, 1)
  assert.equal(card.unresolved, 1)
  assert.equal(card.rows[0].confidence, 0.75)
  assert.equal(card.rows[0].occurrences, 2)
  assert.equal(card.rows[0].note, 'same tag on two sheets')
})

test('an ecad_render answer becomes the rendered-SVG card', () => {
  const card = cardOfContent('ecad_render', answer('Rendered Prints/a.dxf layout Model.', {
    path: 'Prints/a.dxf',
    layout: 'Model',
    kind: 'model',
    svgPath: '.ecad/renders/a-Model.svg',
    characters: 51_200,
    entities: 120,
    drawn: 118,
    unsupported: 2,
    approximate: 1,
    truncated: false,
  }))
  assert.equal(card.kind, 'render')
  assert.equal(card.path, 'Prints/a.dxf')
  assert.equal(card.layout, 'Model')
  assert.equal(card.svgPath, '.ecad/renders/a-Model.svg')
  assert.equal(card.characters, 51_200)
  assert.equal(card.entities, 120)
  assert.equal(card.supported, 118)
  assert.equal(card.unsupported, 2)
  assert.equal(card.approximate, 1)
})

test('the tool error envelope becomes an error card with code, message and fix', () => {
  const card = cardOfContent('ecad_document', contentOf({
    error: { code: 'ECAD_WRITES_DISABLED', message: 'writes are off', fix: 'Enable writes, then apply again.', candidates: [] },
  }))
  assert.equal(card.kind, 'generic')
  assert.equal(card.error.code, 'ECAD_WRITES_DISABLED')
  assert.equal(card.error.message, 'writes are off')
  assert.equal(card.error.fix, 'Enable writes, then apply again.')
})

test('an error envelope with candidates keeps them bounded and readable', () => {
  const card = cardOfValue('ecad_open', {
    error: { code: 'ECAD_UNKNOWN_PATH', message: 'no such drawing', fix: 'Use one of the listed candidates.', candidates: ['Prints/a.dxf', 'Prints/b.dwg'] },
  }, 'text')
  assert.equal(card.kind, 'generic')
  assert.deepEqual(card.error.candidates, ['Prints/a.dxf', 'Prints/b.dwg'])
})

test('a known ECAD tool without a specialised card states its own fields', () => {
  const card = cardOfContent('ecad_compare', answer('2 added, 0 removed, 1 changed primitive(s).', {
    a: { path: 'Prints/a.dxf', version: 'v1' },
    b: { path: 'Prints/b.dxf', version: 'v2' },
    added: 2,
    removed: 0,
    changed: 1,
    truncated: false,
  }))
  assert.equal(card.kind, 'generic')
  assert.deepEqual(card.fields.map(entry => entry.name), ['a', 'b', 'added', 'removed', 'changed', 'truncated'])
  assert.equal(card.fields[0].value, 'Prints/a.dxf')
  assert.ok(card.fields.some(entry => entry.name === 'added' && entry.value === '2'))
  assert.equal(card.error, undefined)
})

test('a payload that is not JSON falls back to the text it saw', () => {
  const card = cardOfContent('ecad_open', contentOf('Opened Prints/a.dxf, but the answer was truncated mid-JSON'))
  assert.equal(card.kind, 'generic')
  assert.match(card.summary, /truncated mid-JSON/u)
  assert.match(card.text, /Opened Prints/u)
  assert.deepEqual(card.fields, [])
})

test('an empty result renders an empty card rather than throwing', () => {
  const card = cardOfContent('ecad_open', [])
  assert.equal(card.kind, 'generic')
  assert.equal(card.summary, '')
  assert.equal(card.error, undefined)
  assert.equal(cardOfContent('ecad_open', undefined).kind, 'generic')
})

test('the transcript marking a result as an error overrides a success payload', () => {
  const card = cardOfContent('ecad_open', answer('looks fine', OPEN), true)
  assert.equal(card.kind, 'generic')
  assert.equal(card.error.code, 'ECAD_TOOL_ERROR')
})

test('a malformed field inside a correct envelope falls back instead of inventing counts', () => {
  // A checks answer without findings cannot claim a severity count.
  const card = cardOfContent('ecad_checks', answer('checks ran', { sheets: 2, notes: 'shape changed' }))
  assert.equal(card.kind, 'generic')
  assert.equal(card.fields.length, 0)
  // An open answer with no drawing identity is not an open card.
  const open = cardOfContent('ecad_open', answer('opened', { writes: true }))
  assert.equal(open.kind, 'generic')
})

test('no payload, however malformed, throws out of the card model', () => {
  const junk = [undefined, null, 0, '', 'not json', '[]', '{}', '{"summary":5}', '{"data":[]}', '{"error":null}', '{', '\u0000', '{"summary":"s","data":{"findings":"no"}}']
  for (const toolName of ECAD_TOOL_NAMES) {
    for (const value of junk) {
      const card = cardOfContent(toolName, value === undefined ? undefined : contentOf(value))
      assert.ok(typeof card === 'object' && typeof card.kind === 'string', `${toolName} with ${String(value)} produced no card`)
    }
  }
})

test('the face claims its whole ECAD tool inventory once', () => {
  assert.equal(ECAD_TOOL_NAMES.length, 12)
  assert.equal(new Set(ECAD_TOOL_NAMES).size, 12)
  for (const required of ['ecad_open', 'ecad_scan', 'ecad_checks', 'ecad_cross_reference', 'ecad_render', 'ecad_capabilities']) {
    assert.ok(ECAD_TOOL_NAMES.includes(required), `the card inventory is missing ${required}`)
  }
})

const SHEETS = {
  workspace: 'C:/workspace',
  dwg: { available: true, converterVersion: '0.6.8' },
  sheets: [
    { path: 'Prints/a.dxf', format: 'dxf', bytes: 10 },
    { path: 'Prints/b.dxf', format: 'dxf', bytes: 10 },
    { path: 'Prints/c.dwg', format: 'dwg', bytes: 20 },
  ],
  truncated: false,
  indexed: true,
}

const CAPABILITIES = {
  contractVersion: 2,
  engine: 'dxf+dwg',
  writes: true,
  profileSource: 'workspace',
  dwg: { available: true, kind: 'acadrust', version: '0.6.8' },
}

test('the dock report reads the drawing count, the DWG count, the profile and the write switch', () => {
  const set = sheetSetOf(SHEETS, CAPABILITIES)
  assert.deepEqual(set, { drawings: 3, dwg: 1, truncated: false, writes: true, profileConfirmed: true })
  assert.equal(sheetSetVisible(set), true)
  // Without the capability answer the chip still shows the drawings, and says
  // nothing it does not know.
  const partial = sheetSetOf(SHEETS)
  assert.deepEqual(partial, { drawings: 3, dwg: 1, truncated: false })
  assert.equal(sheetSetVisible(partial), true)
  assert.equal(sheetSetOf(SHEETS, { writes: false, profileSource: 'default' }).profileConfirmed, false)
})

test('the dock is absent for a workspace with no drawing and for a report it cannot read', () => {
  assert.equal(sheetSetVisible(sheetSetOf({ sheets: [] }, CAPABILITIES)), false)
  assert.equal(sheetSetOf({ sheets: [] }, CAPABILITIES).drawings, 0)
  for (const value of [undefined, null, 'Prints/a.dxf', {}, { sheets: 'no' }, { rows: [] }]) {
    assert.equal(sheetSetOf(value, CAPABILITIES), undefined, `sheetSetOf(${String(value)}) invented a report`)
  }
})

test('a drawing row without a format is counted by its extension', () => {
  const set = sheetSetOf({ sheets: [{ path: 'Prints/legacy.DWG' }, { path: 'Prints/plain.dxf' }] })
  assert.equal(set.drawings, 2)
  assert.equal(set.dwg, 1)
})
