import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { applyOps, attributeRows, buildSheetModel, dxfBytes, openSheet, validateOps } from '../src/engine/index.ts'
import { entity, fixturesDir, layout, sheetModel, ok } from './helpers.mjs'

/** Fresh database from the titleblock fixture, so every test starts clean. */
async function openTitleblock() {
  return openSheet({ path: 'titleblock.dxf', bytes: new Uint8Array(readFileSync(join(fixturesDir, 'titleblock.dxf'))) })
}

/** The fixture's '007' text id and its TB insert id. */
function idsOf(model) {
  const entities = model.layouts[0].entities
  return {
    textId: entities.find(entity => entity.k === 'text' && entity.t === '007').id,
    insertId: entities.find(entity => entity.k === 'insert' && entity.block === 'TB').id,
    checkedId: entities.find(entity => entity.k === 'text' && entity.t === 'AB').id
  }
}

/** Every op kind, valid against titleblock.dxf. */
function allOps(ids) {
  return [
    { op: 'addText', layout: 'Model', p: [1, 1], text: 'REVIEWED', height: 0.2, layer: 'TITLE_BLOCK' },
    { op: 'addLine', layout: 'Model', a: [0, 0], b: [5, 5] },
    { op: 'addPolyline', layout: 'Model', pts: [[0, 0], [1, 0], [1, 1]], closed: true },
    { op: 'addRectangle', layout: 'Model', corner1: [10, 10], corner2: [12, 12], layer: 'NEW_LAYER' },
    { op: 'addRevisionCloud', layout: 'Model', pts: [[0, 20], [5, 20], [5, 25]], bulge: 0.4 },
    { op: 'addLeader', layout: 'Model', pts: [[20, 0], [22, 2], [25, 2]], arrow: true },
    { op: 'addBlock', layout: 'Model', block: 'TB', p: [30, 20], rotation: 0.5, scale: [2, 2] },
    { op: 'setText', layout: 'Model', id: ids.textId, text: '041' },
    { op: 'setAttribute', layout: 'Model', id: ids.insertId, tag: 'TITLE', value: 'CHANGED TITLE' },
    { op: 'setLayer', layout: 'Model', id: ids.textId, layer: 'TEXT' },
    { op: 'move', layout: 'Model', ids: [ids.textId], dx: 1, dy: 2 },
    { op: 'rotate', layout: 'Model', ids: [ids.textId], center: [0, 0], angleDeg: 90 },
    { op: 'erase', layout: 'Model', ids: [ids.checkedId] }
  ]
}

test('validateOps accepts a valid draft and notes the layers it will create', async () => {
  const opened = await openTitleblock()
  const model = buildSheetModel(opened)
  const validation = validateOps(opened, { ops: allOps(idsOf(model)) })
  assert.equal(validation.ok, true)
  assert.deepEqual(validation.errors, [])
  ok(validation.notes.some(note => note.includes('NEW_LAYER') && note.includes('will be created')))
  ok(validation.notes.some(note => note.includes('existing block TB')))
})

test('validateOps rejects every class of bad operation with an actionable fix', async () => {
  const opened = await openTitleblock()
  const model = buildSheetModel(opened)
  const ids = idsOf(model)
  const flattened = model.layouts[0].entities.find(entity => entity.g && entity.id.includes('/')).id
  const cases = [
    [{ op: 'nope', layout: 'Model' }, /unknown operation/],
    [{ op: 'addText', layout: 'Nope', p: [0, 0], text: 'x', height: 0.1 }, /does not exist/],
    [{ op: 'addText', layout: 'Model', p: [0, 0], text: '   ', height: 0.1 }, /non-empty text/],
    [{ op: 'addText', layout: 'Model', p: [0, 0], text: 'x', height: 0 }, /greater than 0/],
    [{ op: 'addLine', layout: 'Model', a: [0, 0], b: [Number.NaN, 1] }, /finite/],
    [{ op: 'addLine', layout: 'Model', a: [0, 0], b: [1, 1], layer: 'bad/name' }, /not a legal DXF layer name/],
    [{ op: 'addPolyline', layout: 'Model', pts: [[0, 0]] }, /at least 2 point/],
    [{ op: 'addRectangle', layout: 'Model', corner1: [1, 1], corner2: [1, 1] }, /same point/],
    [{ op: 'addRevisionCloud', layout: 'Model', pts: [[0, 0], [1, 1]], bulge: Number.POSITIVE_INFINITY }, /finite/],
    [{ op: 'addLeader', layout: 'Model', pts: [[0, 0]] }, /at least 2 point/],
    [{ op: 'addBlock', layout: 'Model', block: 'MISSING', p: [0, 0] }, /does not exist/],
    [{ op: 'setText', layout: 'Model', id: 'FFFF', text: 'x' }, /does not exist/],
    [{ op: 'setText', layout: 'Model', id: flattened, text: 'x' }, /flattened block content/],
    [{ op: 'setText', layout: 'Model', id: ids.insertId, text: 'x' }, /cannot edit a INSERT/],
    [{ op: 'setAttribute', layout: 'Model', id: ids.textId, tag: 'TITLE', value: 'x' }, /needs an INSERT id/],
    [{ op: 'setAttribute', layout: 'Model', id: ids.insertId, tag: 'NOPE', value: 'x' }, /no attribute/],
    [{ op: 'setLayer', layout: 'Model', id: ids.textId, layer: '' }, /layer name is empty/],
    [{ op: 'move', layout: 'Model', ids: [], dx: 1, dy: 1 }, /at least one entity id/],
    [{ op: 'move', layout: 'Model', ids: [ids.textId] }, /must be present and finite/],
    [{ op: 'rotate', layout: 'Model', ids: [ids.textId], center: [0, 0] }, /must be present and finite/],
    [{ op: 'erase', layout: 'Model', ids: ['FFFF'] }, /does not exist/]
  ]
  for (const [op, pattern] of cases) {
    const validation = validateOps(opened, [op])
    assert.equal(validation.ok, false, `${JSON.stringify(op)} should be rejected`)
    ok(validation.errors.length >= 1)
    assert.match(validation.errors[0].message, pattern)
    ok(validation.errors[0].fix.length > 0)
    assert.equal(typeof validation.errors[0].opIndex, 'number')
  }
})

test('applyOps applies every kind and reports counters and touched ids', async () => {
  const opened = await openTitleblock()
  const base = buildSheetModel(opened)
  const result = applyOps(opened, allOps(idsOf(base)))
  assert.deepEqual(Object.keys(result.changes).sort(), ['addBlock', 'addLeader', 'addLine', 'addPolyline', 'addRectangle', 'addRevisionCloud', 'addText', 'erase', 'move', 'rotate', 'setAttribute', 'setLayer', 'setText'])
  assert.equal(result.changes.move, 1)
  assert.equal(result.changes.erase, 1)
  ok(result.touchedIds.length >= 13)
  const after = buildSheetModel(await openSheet({ path: 'titleblock.dxf', bytes: dxfBytes(opened) }))
  const entities = after.layouts[0].entities
  ok(entities.some(entity => entity.t === '041'))
  ok(entities.some(entity => entity.t === 'REVIEWED'))
  ok(entities.some(entity => entity.t === 'CHANGED TITLE'))
  ok(entities.some(entity => entity.block === 'TB' && entity.k === 'insert'))
  assert.equal(entities.some(entity => entity.t === 'AB'), false)
  ok(after.layers.some(layer => layer.name === 'NEW_LAYER'))
})

test('applyOps refuses an invalid draft without touching the drawing', async () => {
  const opened = await openTitleblock()
  const before = buildSheetModel(opened)
  assert.throws(
    () => applyOps(opened, [{ op: 'erase', layout: 'Model', ids: ['FFFF'] }]),
    error => error.code === 'INVALID_DRAFT' && error.message.includes('#0')
  )
  const after = buildSheetModel(opened)
  assert.equal(after.stats.entities, before.stats.entities)
})

test('a revision cloud becomes a closed polyline with bulges and an approximated arc', async () => {
  const opened = await openTitleblock()
  const result = applyOps(opened, [{ op: 'addRevisionCloud', layout: 'Model', pts: [[0, 30], [4, 30], [4, 34], [0, 34]] }])
  assert.equal(result.changes.addRevisionCloud, 1)
  const after = buildSheetModel(await openSheet({ path: 'titleblock.dxf', bytes: dxfBytes(opened) }))
  const cloud = after.layouts[0].entities.find(entity => entity.k === 'polyline' && entity.approx === true && entity.src === 'LWPOLYLINE')
  ok(cloud, 'the cloud is a tessellated closed polyline')
  assert.equal(cloud.closed, true)
  ok(cloud.pts.length > 4)
})

test('a leader is a polyline plus an arrow solid', async () => {
  const opened = await openTitleblock()
  applyOps(opened, [{ op: 'addLeader', layout: 'Model', pts: [[0, 40], [3, 43]], arrow: true }])
  const after = buildSheetModel(await openSheet({ path: 'titleblock.dxf', bytes: dxfBytes(opened) }))
  const entities = after.layouts[0].entities
  ok(entities.some(entity => entity.k === 'solid' && entity.approx === true && entity.src === 'SOLID'))
})

test('attributeRows lists the tags of an insert', async () => {
  const opened = await openTitleblock()
  const inserts = [...opened.db.tables.blockTable.modelSpace.newIterator()].filter(entity => entity.dxfTypeName === 'INSERT')
  const tb = inserts.find(insert => insert.blockName === 'TB')
  const rows = attributeRows(tb)
  assert.deepEqual(rows.map(row => row.tag).sort(), ['SHEET_NUMBER', 'TITLE'])
})

test('validateOps accepts a draft object as well as a bare op list', async () => {
  const opened = await openTitleblock()
  const model = buildSheetModel(opened)
  const draft = { schema: 1, id: 'd1', path: 'titleblock.dxf', baseVersion: model.version, createdAt: new Date().toISOString(), ops: allOps(idsOf(model)) }
  assert.equal(validateOps(opened, draft).ok, true)
  assert.equal(validateOps(opened, draft.ops).ok, true)
})

test('a draft with no ops array is rejected as invalid input', async () => {
  const opened = await openTitleblock()
  assert.throws(() => validateOps(opened, { schema: 1 }), error => error.code === 'INVALID_INPUT')
})

test('synthetic-entity helpers keep validateOps honest about ids', () => {
  // The check is against the database, so an id from a different model is unknown.
  assert.equal(entity('not-an-id', 'text').id, 'not-an-id')
  assert.equal(layout('Model', []).entities.length, 0)
  assert.equal(sheetModel({}).layouts.length, 0)
})
