/**
 * The pane's edit model: click-to-drawing coordinates, the three staged
 * operations, and the draft preview the canvas draws.
 *
 * The host is the only writer, so what the face can get wrong is the op it
 * builds: a wrong layout id, a flattened block id, or a screen point that lands
 * in the wrong place after the Y flip. Those are judged here without a browser.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultLayer,
  defaultTextHeight,
  draftCounts,
  draftOps,
  draftPreview,
  editableEntityId,
  entityOf,
  parseNumberField,
  roundCoord,
  stageErase,
  stageMove,
  stageText,
  validLayerName,
  worldAt,
  worldDelta,
} from '../../src/client/edits.ts'
import { fitBox } from '../../src/client/scene.ts'

/** A fitted transform for a 100×50 sheet in a 400×400 canvas with no margin. */
const FIT = fitBox({ min: [0, 0], max: [100, 50] }, 400, 400, 0)
/** The identity user transform. */
const VIEW = { zoom: 1, panX: 0, panY: 0 }

/** A sheet model just complete enough for the default helpers. */
const MODEL = {
  schema: 1,
  path: 'Prints/DXF/A-101.dxf',
  version: 'v1',
  dxfVersion: 'AC1032',
  units: 4,
  layouts: [{ id: 'Model', name: 'Model', kind: 'model', extents: { min: [0, 0], max: [100, 50] }, entities: [{ id: '10', k: 'line', layer: 'WIRES', color: 7, pts: [[0, 0], [1, 1]] }] }],
  layers: [{ name: '0', color: 7, visible: true }, { name: 'WIRES', color: 1, visible: true }],
  blocks: [],
  stats: { entities: 1, byKind: { line: 1 }, unsupported: {}, approximate: 0, truncated: false },
}

test('a screen point maps through the fit and the Y flip into drawing units', () => {
  // The fit puts world (0,0) at screen (0,300) and world (100,50) at (400,100).
  assert.deepEqual(worldAt({ x: 0, y: 300 }, FIT, VIEW), [0, 0])
  assert.deepEqual(worldAt({ x: 400, y: 100 }, FIT, VIEW), [100, 50])
  assert.deepEqual(worldAt({ x: 200, y: 200 }, FIT, VIEW), [50, 25])
  // A pan and a zoom are the reader's transform on top of the fit: world (50,25)
  // sits at fit screen (200,200), then at (300,300) after the view transform.
  assert.deepEqual(worldAt({ x: 300, y: 300 }, FIT, { zoom: 2, panX: -100, panY: -100 }), [50, 25])
  assert.deepEqual(worldAt({ x: 700, y: 100 }, FIT, { zoom: 2, panX: -100, panY: -100 }), [100, 50])
})

test('a screen drag becomes a drawing delta, lowered in world Y for a downward drag', () => {
  assert.deepEqual(worldDelta({ x: 40, y: -20 }, FIT, VIEW), [10, 5])
  assert.deepEqual(worldDelta({ x: -40, y: 20 }, FIT, VIEW), [-10, -5])
  // A zoom halves the world delta the same screen movement covers.
  assert.deepEqual(worldDelta({ x: 20, y: 0 }, FIT, { zoom: 0.5, panX: 0, panY: 0 }), [10, 0])
  assert.deepEqual(worldDelta({ x: 10, y: 10 }, { scale: 0, translateX: 0, translateY: 0 }, VIEW), [0, 0])
})

test('a text annotation carries the layout, rounded point and height', () => {
  const staged = stageText('draft-1', 'Model', [10.1234567, 20], '  NOTE  ', 2.5, 'WIRES')
  assert.equal(staged.key, 'draft-1')
  assert.equal(staged.layout, 'Model')
  assert.deepEqual(staged.op, { op: 'addText', layout: 'Model', p: [10.123457, 20], text: '  NOTE  ', height: 2.5, layer: 'WIRES' })
  // The empty layer is omitted so the drawing's current layer applies.
  const noLayer = stageText('draft-2', 'Model', [0, 0], 'X', 1, '')
  assert.equal('layer' in noLayer.op, false)
})

test('move and erase name exactly the entity ids the sheet model carries', () => {
  const move = stageMove('draft-3', 'Model', '10', 5, -2.5)
  assert.deepEqual(move.op, { op: 'move', layout: 'Model', ids: ['10'], dx: 5, dy: -2.5 })
  const erase = stageErase('draft-4', 'Model', '10')
  assert.deepEqual(erase.op, { op: 'erase', layout: 'Model', ids: ['10'] })
})

test('a flattened block member cannot be named by an edit op', () => {
  assert.equal(editableEntityId('10'), true)
  assert.equal(editableEntityId('10/3'), false)
  assert.equal(editableEntityId(''), false)
})

test('counts, wire ops and the preview follow the staged order', () => {
  const staged = [
    stageText('a', 'Model', [1, 2], 'NOTE', 2, '0'),
    stageMove('b', 'Model', '10', 1, 0),
    stageErase('c', 'Model', '11'),
    stageMove('d', 'Model', '12', 0, 3),
  ]
  assert.deepEqual(draftCounts(staged), { addText: 1, move: 2, erase: 1 })
  const ops = draftOps(staged)
  assert.equal(ops.length, 4)
  assert.equal(ops[0].op, 'addText')
  assert.equal(ops[2].op, 'erase')
  // The wire array is exactly the op objects, in staging order.
  assert.equal(ops[1], staged[1].op)
  const preview = draftPreview(staged)
  assert.equal(preview.adds.length, 1)
  assert.deepEqual(preview.adds[0].point, [1, 2])
  assert.equal(preview.moves.length, 2)
  assert.ok(preview.erases.has('11'))
  assert.equal(preview.erases.has('10'), false)
})

test('the default annotation height follows the sheet text, then the sheet span', () => {
  // The drawing's own text heights win, as their median.
  const layout = {
    id: 'Model', name: 'Model', kind: 'model', extents: { min: [0, 0], max: [100, 50] },
    entities: [
      { id: 't1', k: 'text', layer: '0', color: 7, p: [0, 0], t: 'A', h: 0.3 },
      { id: 't2', k: 'text', layer: '0', color: 7, p: [0, 0], t: 'B', h: 2.5 },
      { id: 't3', k: 'mtext', layer: '0', color: 7, p: [0, 0], t: 'C', h: 0.7 },
      { id: 't4', k: 'text', layer: '0', color: 7, p: [0, 0], t: 'D', h: 0 },
    ],
  }
  assert.equal(defaultTextHeight({ min: [0, 0], max: [100, 50] }, layout), 0.7)
  // Without text the drawn span decides, and a degenerate box still yields a height.
  assert.equal(defaultTextHeight({ min: [0, 0], max: [100, 50] }), 1)
  assert.equal(defaultTextHeight({ min: [0, 0], max: [10, 4] }), 0.1)
  assert.equal(defaultTextHeight({ min: [0, 0], max: [0, 0] }), 1)
  assert.equal(defaultTextHeight({ min: [0, 0], max: [0, 0] }, { ...layout, entities: [] }), 1)
})

test('the default layer prefers the drawing default, then the content layer', () => {
  assert.equal(defaultLayer(MODEL, MODEL.layouts[0]), '0')
  assert.equal(defaultLayer({ ...MODEL, layers: [{ name: 'WIRES', color: 1, visible: true }] }, MODEL.layouts[0]), 'WIRES')
  // With neither a layer table nor content there is no layer to name.
  assert.equal(defaultLayer({ ...MODEL, layers: [] }, { ...MODEL.layouts[0], entities: [] }), undefined)
  assert.equal(defaultLayer({ ...MODEL, layers: [{ name: 'WIRES', color: 1, visible: true }] }, { ...MODEL.layouts[0], entities: [] }), 'WIRES')
})

test('layer names the engine would reject are refused before staging', () => {
  assert.equal(validLayerName('WIRES'), true)
  assert.equal(validLayerName('0'), true)
  for (const name of ['', 'a/b', 'a"b', 'a?b', 'a*b', 'a|b', 'a<b', 'a=b', 'a`b', 'x'.repeat(256)]) {
    assert.equal(validLayerName(name), false, name)
  }
})

test('form fields parse into finite numbers and nothing else', () => {
  assert.equal(parseNumberField('12.5'), 12.5)
  assert.equal(parseNumberField(' -3 '), -3)
  assert.equal(parseNumberField(''), undefined)
  assert.equal(parseNumberField('abc'), undefined)
  assert.equal(parseNumberField('Infinity'), undefined)
  assert.equal(parseNumberField('NaN'), undefined)
})

test('coordinates are rounded to six decimals for the wire', () => {
  assert.equal(roundCoord(1 / 3), 0.333333)
  assert.equal(roundCoord(-0), 0)
  assert.equal(roundCoord(10), 10)
})

test('an entity is found by the id the draft names', () => {
  assert.equal(entityOf(MODEL.layouts[0], '10')?.layer, 'WIRES')
  assert.equal(entityOf(MODEL.layouts[0], 'nope'), undefined)
  assert.equal(entityOf(undefined, '10'), undefined)
})
