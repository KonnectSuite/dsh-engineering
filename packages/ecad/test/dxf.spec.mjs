import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyOps, buildSheetModel, dxfBytes, openSheet, verifyWritten, writeAndVerify } from '../src/engine/index.ts'
import { fixturesDir, sheetModel, layout, entity, ok } from './helpers.mjs'

/** Fresh database from the titleblock fixture. */
async function openTitleblock() {
  return openSheet({ path: 'titleblock.dxf', bytes: new Uint8Array(readFileSync(join(fixturesDir, 'titleblock.dxf'))) })
}

test('dxfBytes serialises an opened drawing as ASCII DXF that re-reads', async () => {
  const opened = await openTitleblock()
  const bytes = dxfBytes(opened)
  ok(bytes instanceof Uint8Array)
  ok(bytes.byteLength > 1000)
  const text = new TextDecoder().decode(bytes.subarray(0, 64))
  ok(text.startsWith('0\n') || text.startsWith('0\r\n'))
  ok(text.includes('SECTION'))
  const reread = await openSheet({ path: 'written.dxf', bytes })
  assert.equal(reread.dxfVersion, opened.dxfVersion)
  const model = buildSheetModel(reread)
  assert.equal(model.stats.entities, buildSheetModel(opened).stats.entities)
})

test('an unmodified write verifies with no problems', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const bytes = dxfBytes(opened)
  const verification = await verifyWritten(opened, bytes, { changes: {}, baseModel: base })
  assert.equal(verification.ok, true)
  assert.deepEqual(verification.problems, [])
  assert.deepEqual(verification.dropped, {})
  ok(verification.notes.some(note => note.includes('re-read')))
})

test('a write of applied ops verifies against the expected counters', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const textId = base.layouts[0].entities.find(entity => entity.k === 'text' && entity.t === '007').id
  const result = applyOps(opened, [
    { op: 'addText', layout: 'Model', p: [1, 1], text: 'ADDED', height: 0.2 },
    { op: 'addLine', layout: 'Model', a: [0, 0], b: [1, 1] },
    { op: 'setText', layout: 'Model', id: textId, text: '041' }
  ])
  const bytes = dxfBytes(opened)
  const verification = await verifyWritten(opened, bytes, { changes: result.changes, baseModel: base })
  assert.equal(verification.ok, true, JSON.stringify(verification.problems))
  assert.equal(verification.expected.addText, 1)
  assert.equal(verification.applied.addText, 1)
  assert.equal(verification.applied.addLine, 1)
  ok(verification.applied.setText >= 1)
})

test('an unmet expectation is reported as a problem, not smoothed over', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const bytes = dxfBytes(opened)
  const verification = await verifyWritten(opened, bytes, { changes: { addText: 3 }, baseModel: base })
  assert.equal(verification.ok, false)
  ok(verification.problems.some(problem => problem.includes('addText')))
})

test('unreadable written bytes fail verification with a problem', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const verification = await verifyWritten(opened, new TextEncoder().encode('not a drawing'), { changes: {}, baseModel: base })
  assert.equal(verification.ok, false)
  ok(verification.problems[0].includes('could not be read back'))
})

test('dropped unsupported types are named when the base model carried some', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const withUnsupported = {
    ...base,
    stats: { ...base.stats, unsupported: { RAY: 2 } }
  }
  const bytes = dxfBytes(opened)
  const verification = await verifyWritten(opened, bytes, { changes: {}, baseModel: withUnsupported })
  assert.equal(verification.ok, false)
  assert.deepEqual(verification.dropped, { RAY: 2 })
  ok(verification.problems.some(problem => problem.includes('unsupported')))
})

test('writeAndVerify writes the bytes and the verification together', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const outcome = await writeAndVerify(opened, { changes: {}, baseModel: base })
  ok(outcome.bytes.byteLength > 1000)
  assert.equal(outcome.verification.ok, true)
})

test('the verification compares layouts and primitives rather than trusting the writer', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  // A base model that claims a different layout set must surface the difference
  // in the notes instead of the check quietly passing.
  const altered = { ...base, layouts: [...base.layouts, layout('Layout2', [entity('zz', 'line', { pts: [[0, 0], [1, 1]] })], 'paper')] }
  const verification = await verifyWritten(opened, dxfBytes(opened), { changes: {}, baseModel: altered })
  ok(verification.notes.some(note => note.includes('layout count changed')))
  ok(verification.notes.some(note => note.includes('model comparison')))
})

test('verifyWritten handles an empty synthetic model honestly', async () => {
  const opened = await openTitleblock()
  const empty = sheetModel({ path: 'titleblock.dxf', layouts: [layout('Model', [])] })
  const verification = await verifyWritten(opened, dxfBytes(opened), { changes: {}, baseModel: empty })
  assert.equal(verification.ok, false)
  ok(verification.problems.some(problem => problem.includes('stale')), `expected a stale-base problem, got ${JSON.stringify(verification.problems)}`)
})
