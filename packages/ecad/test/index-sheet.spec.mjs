import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSheetModel, detectIndexSheet } from '../src/engine/index.ts'
import { openFixture, profile, ok } from './helpers.mjs'

test('the index sheet is detected by heading and parsed by column', async () => {
  const opened = await openFixture('index.dxf')
  const model = buildSheetModel(opened)
  const index = detectIndexSheet(model, profile())
  ok(index)
  assert.equal(index.layout, 'Model')
  assert.equal(index.heading, 'SHEET INDEX')
  assert.equal(index.entries.length, 6)
  const first = index.entries[0]
  assert.deepEqual({ sheetNumber: first.sheetNumber, title: first.title }, { sheetNumber: '21036-001', title: 'POWER DISTRIBUTION' })
  assert.equal(first.raw, '1 21036-001 POWER DISTRIBUTION')
  const pump = index.entries.find(entry => entry.sheetNumber === '21036-007')
  assert.equal(pump.title, 'PUMP STATION')
})

test('a spare row keeps its title and rows with only a number stay placeholders', async () => {
  const opened = await openFixture('index.dxf')
  const index = detectIndexSheet(buildSheetModel(opened), profile())
  const spare = index.entries.find(entry => entry.title === 'SPARE SHEET')
  ok(spare)
  assert.equal(spare.sheetNumber, '4')
  const placeholders = index.entries.filter(entry => entry.title === undefined)
  assert.deepEqual(placeholders.map(entry => entry.raw), ['5', '6'])
})

test('title-block text on the same sheet is never parsed as a table row', async () => {
  const opened = await openFixture('index.dxf')
  const index = detectIndexSheet(buildSheetModel(opened), profile())
  assert.equal(index.entries.filter(entry => entry.raw.includes('FC1000495')).length, 0)
})

test('entries are ordered by sheet number, not by print order', async () => {
  const opened = await openFixture('index.dxf')
  const index = detectIndexSheet(buildSheetModel(opened), profile())
  const numbers = index.entries.map(entry => Number.parseInt(/(\d{1,4})\s*$/.exec(entry.sheetNumber ?? entry.raw)[1], 10))
  const sorted = [...numbers].sort((a, b) => a - b)
  assert.deepEqual(numbers, sorted)
})

test('a drawing without an index heading yields undefined', async () => {
  const opened = await openFixture('tiny.dxf')
  assert.equal(detectIndexSheet(buildSheetModel(opened), profile()), undefined)
})

test('the heading pattern can be overridden for a set that names it differently', async () => {
  const opened = await openFixture('index.dxf')
  const model = buildSheetModel(opened)
  assert.equal(detectIndexSheet(model, profile(), { headingPattern: /^DRAWING REGISTER$/ }), undefined)
  ok(detectIndexSheet(model, profile(), { headingPattern: /^SHEET INDEX$/ }))
})

test('the entry cap is honoured', async () => {
  const opened = await openFixture('index.dxf')
  const index = detectIndexSheet(buildSheetModel(opened), profile(), { maxEntries: 2 })
  assert.equal(index.entries.length, 2)
})
