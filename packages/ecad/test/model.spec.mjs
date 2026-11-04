import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildSheetModel, DEFAULT_MAX_ENTITIES_PER_LAYOUT, entityBounds } from '../src/engine/index.ts'
import { openFixture, ok } from './helpers.mjs'

/** The one fixture model every model test uses. */
async function tinyModel(options) {
  const opened = await openFixture('tiny.dxf')
  return { opened, model: buildSheetModel(opened, options) }
}

test('every layout is carried: model space plus the paper layout', async () => {
  const { model } = await tinyModel()
  assert.deepEqual(model.layouts.map(layout => layout.id), ['Model', 'Layout1'])
  assert.deepEqual(model.layouts.map(layout => layout.kind), ['model', 'paper'])
  assert.equal(model.schema, 1)
  assert.equal(model.dxfVersion, 'AC1032')
  assert.match(model.version, /^[0-9a-f]{64}$/)
})

test('entity kinds, unsupported counters and approximation counters are honest', async () => {
  const { model } = await tinyModel()
  const modelLayout = model.layouts[0]
  const kinds = new Set(modelLayout.entities.map(entity => entity.k))
  for (const kind of ['line', 'polyline', 'circle', 'arc', 'ellipse', 'point', 'solid', 'mtext', 'text', 'hatch', 'insert', 'unsupported']) {
    ok(kinds.has(kind), `expected a ${kind} primitive`)
  }
  assert.equal(model.stats.unsupported.RAY, 1)
  assert.equal(model.stats.entities, model.layouts.reduce((sum, layout) => sum + layout.entities.length, 0))
  ok(model.stats.approximate >= 3, `expected spline/bulge/solid approximations, got ${model.stats.approximate}`)
  assert.equal(model.stats.truncated, false)
})

test('layers resolve their ACI colours and block definitions are summarised', async () => {
  const { model } = await tinyModel()
  const byName = new Map(model.layers.map(layer => [layer.name, layer]))
  assert.equal(byName.get('WIRES').color, 5)
  assert.equal(byName.get('TEXT').color, 2)
  assert.equal(byName.get('TITLE_BLOCK').color, 7)
  assert.equal(byName.get('0').visible, true)
  const blocks = new Map(model.blocks.map(block => [block.name, block]))
  assert.equal(blocks.get('MOTOR').entities, 3)
  assert.equal(blocks.get('WD_M').entities, 10)
  assert.equal(blocks.get('MOTOR').external, false)
})

test('block references flatten into world coordinates and record the owner', async () => {
  const { model } = await tinyModel()
  const entities = model.layouts[0].entities
  const insert = entities.find(entity => entity.k === 'insert' && entity.block === 'MOTOR')
  ok(insert, 'the MOTOR insert marker is in the model')
  assert.deepEqual(insert.p, [22, 4])
  ok(Math.abs(insert.scale[0] - 1) < 1e-9)
  const children = entities.filter(entity => entity.g === insert.id)
  ok(children.length >= 2, 'block geometry is flattened and owned by the insert')
  const box = children.find(entity => entity.k === 'polyline')
  ok(box)
  // A 1×1 box inserted at (22, 4) rotated 30° lands inside a 2-unit square.
  for (const point of box.pts) {
    ok(point[0] >= 21.4 && point[0] <= 23, `x ${point[0]} out of range`)
    ok(point[1] >= 3.9 && point[1] <= 5.4, `y ${point[1]} out of range`)
  }
  const tag = children.find(entity => entity.k === 'text' && entity.t === 'M7')
  ok(tag, 'the attribute value is flattened as text')
  ok(tag.t === 'M7')
  // ATTDEF prompts are definitions, not geometry: they never appear.
  assert.equal(entities.filter(entity => entity.t === 'TAG').length, 0)
})

test('text control codes are decoded and MTEXT keeps its paragraph break', async () => {
  const { model } = await tinyModel()
  const entities = model.layouts[0].entities
  assert.equal(entities.find(entity => entity.k === 'text' && entity.t?.startsWith('TINY')).t, 'TINY ° SHEET ±1 Ø3 UNDER')
  const mtext = entities.find(entity => entity.k === 'mtext')
  assert.equal(mtext.t, 'MTEXT bold line\nsecond 1/2 °')
})

test('polyline bulges are tessellated and marked approximate', async () => {
  const { model } = await tinyModel()
  const polyline = model.layouts[0].entities.find(entity => entity.k === 'polyline' && entity.layer === 'WIRES')
  assert.equal(polyline.closed, true)
  ok(polyline.pts.length > 4, 'the bulge segment is tessellated into extra points')
  assert.equal(polyline.approx, true)
  assert.equal(polyline.src, 'LWPOLYLINE')
})

test('solid and hatch become closed filled polygons', async () => {
  const { model } = await tinyModel()
  const entities = model.layouts[0].entities
  const solid = entities.find(entity => entity.k === 'solid')
  assert.equal(solid.closed, true)
  ok(solid.pts.length >= 3)
  const hatch = entities.find(entity => entity.k === 'hatch')
  assert.equal(hatch.closed, true)
  ok(hatch.pts.length >= 3)
  assert.equal(hatch.approx, true)
  assert.equal(hatch.src, 'HATCH')
})

test('ids are stable across builds and flattened ids carry their insert path', async () => {
  const first = await tinyModel()
  const second = await tinyModel()
  assert.deepEqual(first.model.layouts.map(layout => layout.entities.map(entity => entity.id)), second.model.layouts.map(layout => layout.entities.map(entity => entity.id)))
  const withOwner = first.model.layouts[0].entities.filter(entity => entity.g)
  ok(withOwner.length > 0)
  ok(withOwner.every(entity => entity.id.includes('/')), 'flattened ids carry the insert path')
})

test('the entity cap truncates a layout and sets stats.truncated', async () => {
  const { model } = await tinyModel({ maxEntitiesPerLayout: 5 })
  assert.equal(model.layouts[0].entities.length, 5)
  assert.equal(model.layouts[0].entities.length <= 5, true)
  assert.equal(model.stats.truncated, true)
  ok(DEFAULT_MAX_ENTITIES_PER_LAYOUT >= 200_000)
})

test('layout extents cover the drawn geometry', async () => {
  const { model } = await tinyModel()
  const extents = model.layouts[0].extents
  ok(extents.min[0] <= 0)
  ok(extents.min[1] <= 0)
  ok(extents.max[0] >= 22)
  ok(extents.max[1] >= 9)
  const bounds = entityBounds({ id: 'x', k: 'circle', layer: '0', color: 7, c: [5, 5], r: 1.5 })
  assert.deepEqual(bounds.min, [3.5, 3.5])
  assert.deepEqual(bounds.max, [6.5, 6.5])
  assert.equal(entityBounds({ id: 'x', k: 'insert', layer: '0', color: 7 }), undefined)
})

test('a model can omit insert markers and flattening', async () => {
  const { opened } = await tinyModel()
  const markersOnly = buildSheetModel(opened, { flattenInserts: false })
  assert.equal(markersOnly.layouts[0].entities.filter(entity => entity.k === 'insert').length, 2)
  assert.equal(markersOnly.layouts[0].entities.filter(entity => entity.g).length, 0)
  const noMarkers = buildSheetModel(opened, { includeInsertMarkers: false })
  assert.equal(noMarkers.layouts[0].entities.filter(entity => entity.k === 'insert').length, 0)
  ok(noMarkers.layouts[0].entities.filter(entity => entity.g).length > 0)
})
