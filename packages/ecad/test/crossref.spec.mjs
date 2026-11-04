import { test } from 'node:test'
import assert from 'node:assert/strict'
import { crossReference, defaultProfile } from '../src/engine/index.ts'
import { entity, layout, layer, profile, sheetModel, text, ok } from './helpers.mjs'

/** A profile whose layer lists are known, so layer evidence is testable. */
function testProfile() {
  const base = profile()
  return {
    ...base,
    titleBlockLayers: ['TITLE_BLOCK'],
    tagLayers: ['TAGS'],
    wireLayers: ['WIRES'],
    xrefLayers: ['XREF'],
    locLayers: ['LOC'],
    standardLayers: ['0', 'TAGS', 'WIRES', 'TITLE_BLOCK']
  }
}

const layers = [layer('0'), layer('TAGS'), layer('WIRES'), layer('TITLE_BLOCK')]

/** Model A: duplicate device tag, two wire ends, a resolved sheet reference. */
function modelA() {
  return sheetModel({
    path: 'SET-1.dxf',
    layers,
    layouts: [
      layout('Model', [
        text('a1', 'M1', { x: 1, y: 1, layer: 'TAGS' }),
        text('a2', 'M1', { x: 2, y: 1, layer: 'TAGS' }),
        text('a3', 'CR2', { x: 3, y: 1, layer: 'TAGS' }),
        text('a4', '12', { x: 1, y: 2, layer: 'WIRES' }),
        text('a5', '12', { x: 5, y: 2, layer: 'WIRES' }),
        text('a6', '13', { x: 1, y: 3, layer: 'WIRES' }),
        text('a7', 'SEE SHEET 2', { x: 1, y: 4, layer: '0' }),
        text('a8', 'SHEET NUMBER:', { x: 8, y: 8, layer: 'TITLE_BLOCK' }),
        text('a9', 'M9', { x: 8, y: 7, layer: 'TITLE_BLOCK' }),
        // Block-owned text must never be a candidate.
        text('a10', 'M1', { x: 9, y: 9, layer: 'TAGS', g: 'insert-99' })
      ])
    ]
  })
}

/** Model B: the same device tag on a second sheet, an unresolved sheet reference. */
function modelB() {
  return sheetModel({
    path: 'SET-2.dxf',
    layers,
    layouts: [
      layout('Model', [
        text('b1', 'M1', { x: 1, y: 1, layer: 'TAGS' }),
        text('b2', 'SEE SHEET 9', { x: 1, y: 2, layer: '0' }),
        text('b3', '12', { x: 4, y: 2, layer: 'WIRES' })
      ])
    ]
  })
}

test('device tags group across sheets, and a repeated tag on one sheet is a duplicate candidate', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }, { path: 'SET-2.dxf', model: modelB() }], testProfile())
  const m1 = rows.find(row => row.kind === 'device-tag' && row.value === 'M1')
  ok(m1)
  assert.equal(m1.status, 'duplicate')
  assert.equal(m1.sheets.length, 3)
  ok(m1.confidence > 0 && m1.confidence <= 1)
  ok(m1.note.includes('duplicate candidate'))
  const cr2 = rows.find(row => row.kind === 'device-tag' && row.value === 'CR2')
  assert.equal(cr2.status, 'ok')
})

test('title-block text and block-owned text are excluded', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }], testProfile())
  assert.equal(rows.filter(row => row.value === 'M9').length, 0)
  assert.equal(rows.filter(row => row.sheets.some(sheet => sheet.layer === 'TITLE_BLOCK')).length, 0)
  // The block-owned M1 only leaves the two top-level occurrences.
  const m1 = rows.find(row => row.kind === 'device-tag' && row.value === 'M1')
  assert.equal(m1.sheets.length, 2)
})

test('wire labels report one-sided, ok and duplicate candidates within the sheet', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }, { path: 'SET-2.dxf', model: modelB() }], testProfile())
  const twelve = rows.find(row => row.kind === 'wire-label' && row.value === '12')
  assert.equal(twelve.status, 'ok')
  assert.equal(twelve.sheets.length, 3)
  const thirteen = rows.find(row => row.kind === 'wire-label' && row.value === '13')
  assert.equal(thirteen.status, 'one-sided')
  ok(thirteen.note.includes('one-sided') || thirteen.note.includes('once'))
})

test('sheet references resolve against the file set and stay unresolved otherwise', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }, { path: 'SET-2.dxf', model: modelB() }], testProfile())
  const toTwo = rows.find(row => row.kind === 'sheet-reference' && row.value === 'SHEET 2')
  assert.equal(toTwo.status, 'ok')
  ok(toTwo.confidence > 0.5)
  const toNine = rows.find(row => row.kind === 'sheet-reference' && row.value === 'SHEET 9')
  assert.equal(toNine.status, 'unresolved')
  ok(toNine.note.includes('no file'))
})

test('cross-reference rows are ordered by kind then value', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }], testProfile())
  const kinds = rows.map(row => row.kind)
  const firstWire = kinds.indexOf('wire-label')
  const firstReference = kinds.indexOf('sheet-reference')
  ok(kinds.lastIndexOf('device-tag') < firstWire)
  ok(firstWire < firstReference)
})

test('the row cap is reported in the last row note', () => {
  const rows = crossReference([{ path: 'SET-1.dxf', model: modelA() }], testProfile(), { maxRows: 2 })
  assert.equal(rows.length, 2)
  ok(rows[1].note.includes('capped'))
})
