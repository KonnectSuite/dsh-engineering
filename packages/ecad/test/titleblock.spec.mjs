import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSheetModel, detectTitleBlock, extractInsertAttributes, pairTitleBlockValues } from '../src/engine/index.ts'
import { openFixture, profile, ok } from './helpers.mjs'

test('title-block fields pair labels on the TITLE_BLOCK layer with the value cell below', async () => {
  const opened = await openFixture('titleblock.dxf')
  const model = buildSheetModel(opened)
  const pairing = pairTitleBlockValues(model, profile())
  assert.equal(pairing.layout, 'Model')
  assert.equal(pairing.fields.date.value, '2026-01-02')
  assert.equal(pairing.fields.date.source, 'text')
  assert.equal(pairing.fields.date.label, 'RELEASE DATE:')
  assert.equal(pairing.fields.scale.value, '1:1')
  assert.equal(pairing.fields.checkedBy.value, 'AB')
  assert.equal(pairing.fields.title.value, 'PUMP STATION')
  ok(pairing.fields.sheetNumber.confidence >= 0.5)
  // The revision row is genuinely empty; the SCALE cell below must not be stolen.
  assert.equal(pairing.fields.revision, undefined)
  assert.deepEqual(pairing.blanks.map(blank => blank.label), ['REVISION LEVEL:'])
})

test('detectTitleBlock reads an attribute block and outranks positional pairing', async () => {
  const opened = await openFixture('titleblock.dxf')
  const model = buildSheetModel(opened)
  const inserts = extractInsertAttributes(opened)
  const titleBlock = detectTitleBlock(model, profile(), { inserts })
  assert.equal(titleBlock.layout, 'Model')
  assert.equal(titleBlock.fields.sheetNumber.value, 'ACME-007')
  assert.equal(titleBlock.fields.sheetNumber.source, 'attribute')
  assert.equal(titleBlock.fields.sheetNumber.label, 'SHEET_NUMBER')
  assert.equal(titleBlock.fields.title.value, 'PUMP STATION')
  assert.equal(titleBlock.fields.title.source, 'attribute')
  assert.equal(titleBlock.fields.date.source, 'text')
  ok(titleBlock.fields.sheetNumber.confidence > titleBlock.fields.date.confidence)
})

test('detectTitleBlock accepts an opened drawing directly and builds its own model', async () => {
  const opened = await openFixture('titleblock.dxf')
  const fromOpened = detectTitleBlock(opened, profile())
  assert.equal(fromOpened.fields.title?.value, 'PUMP STATION')
  assert.equal(fromOpened.fields.title?.source, 'attribute')
})

test('a sheet with no title block yields no fields, and the file name fills sheetNumber', async () => {
  const opened = await openFixture('tiny.dxf')
  const model = buildSheetModel(opened)
  assert.deepEqual(detectTitleBlock(model, profile()).fields, {})
  const renamed = { ...model, path: 'ACME-042.dxf' }
  const fallback = detectTitleBlock(renamed, profile())
  assert.equal(fallback.fields.sheetNumber.value, 'ACME-042')
  assert.equal(fallback.fields.sheetNumber.source, 'filename')
  assert.equal(fallback.fields.sheetNumber.confidence, 0.5)
  assert.equal(fallback.fields.sheetNumber.label, '<set>-<sheet>')
})

test('extractInsertAttributes returns every insert that carries attributes', async () => {
  const opened = await openFixture('tiny.dxf')
  const rows = extractInsertAttributes(opened)
  assert.equal(rows.length, 2)
  const motor = rows.find(row => row.blockName === 'MOTOR')
  assert.deepEqual(motor.attributes, [{ tag: 'TAG', value: 'M7' }])
  const wdM = rows.find(row => row.blockName === 'WD_M')
  ok(wdM.attributes.some(attribute => attribute.tag === 'WIRELAYS' && attribute.value === 'WIRES'))
  assert.equal(wdM.layout, 'Model')
  assert.match(wdM.insertId, /^[0-9A-F]+$/i)
})
