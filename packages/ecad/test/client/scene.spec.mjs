/**
 * The drawing scene: the sheet model projected into primitives, and the small
 * pure helpers the pane reads it through.
 *
 * Everything here is judged without a browser: the entity kinds the model
 * carries must produce the geometry the pane draws, a hidden layer must leave
 * the drawing and nothing else, the fit must keep CAD orientation, and the
 * coverage counters must agree with the model's own stats. The React component
 * only maps these primitives to SVG, so this is where drawing correctness is
 * measured.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  coverageOf,
  entityBounds,
  factsOf,
  fitBox,
  fmt,
  formatPoint,
  layerCounts,
  layerInk,
  layersOf,
  sceneOf,
  textLines,
  textWidthEm,
  unionBounds,
  unitLabel,
} from '../../src/client/scene.ts'
import { aciHex, aciToRgb, AUTO_INK, inkFor, isAutoColor, rgbToHex, tintedInk, wash } from '../../src/client/palette.ts'

/** One entity with the fields this repository's model emits, defaulted. */
const entity = overrides => ({
  id: 'e', k: 'line', layer: '0', color: 7, pts: [[0, 0], [10, 0]], ...overrides,
})

/** Layers covering the fixed and by-layer cases. */
const LAYERS = [
  { name: '0', color: 7, visible: true },
  { name: 'WIRES', color: 1, visible: true },
  { name: 'HIDDEN', color: 3, visible: false },
  { name: 'TRUECOLOR', color: 256, rgb: [10, 200, 90], visible: true },
]

/** One layout around the origin with every kind the model can carry. */
const MODEL_LAYOUT = {
  id: 'Model',
  name: 'Model',
  kind: 'model',
  extents: { min: [0, 0], max: [100, 60] },
  entities: [
    entity({ id: 'line', k: 'line', pts: [[0, 0], [100, 0]] }),
    entity({ id: 'poly', k: 'polyline', layer: 'WIRES', pts: [[0, 10], [30, 10], [30, 30]], closed: true, color: 1 }),
    entity({ id: 'spline', k: 'spline', pts: [[0, 40], [10, 45], [20, 40]], approx: true, src: 'SPLINE' }),
    entity({ id: 'arc', k: 'arc', c: [50, 20], r: 10, a0: 0, a1: Math.PI / 2 }),
    entity({ id: 'circle', k: 'circle', c: [70, 20], r: 5 }),
    entity({ id: 'ellipse', k: 'ellipse', c: [80, 40], rx: 8, ry: 4, rot: 0, a0: 0, a1: Math.PI * 2, closed: true }),
    entity({ id: 'point', k: 'point', p: [5, 5] }),
    entity({ id: 'text', k: 'text', p: [10, 50], t: 'SHEET 1', h: 4, color: 2 }),
    entity({ id: 'mtext', k: 'mtext', p: [60, 55], t: 'A\nB', h: 3, w: 20, ha: 1, va: 2 }),
    entity({ id: 'hatch', k: 'hatch', pts: [[70, 0], [90, 0], [90, 10], [70, 10]], approx: true, src: 'HATCH' }),
    entity({ id: 'solid', k: 'solid', pts: [[90, 30], [99, 30], [99, 39]] }),
    entity({ id: 'dim', k: 'dimension', pts: [[0, 55], [40, 55]], p: [20, 58], t: '40', h: 2.5 }),
    entity({ id: 'leader', k: 'leader', pts: [[30, 20], [36, 24], [42, 24]] }),
    entity({ id: 'viewport', k: 'viewport', p: [50, 50], w: 30, h: 18 }),
    entity({ id: 'insert', k: 'insert', p: [0, 0], block: 'WD_M' }),
    entity({ id: 'proxy', k: 'unsupported', src: 'ACAD_PROXY_ENTITY' }),
  ],
}

/** A two-layout sheet with the layer table the pane reads. */
const MODEL = {
  schema: 1,
  path: 'Prints/DXF/A-101.dxf',
  version: 'abc123',
  dxfVersion: 'AC1032',
  units: 4,
  layouts: [MODEL_LAYOUT, { id: 'Layout1', name: 'Layout1', kind: 'paper', extents: { min: [0, 0], max: [10, 10] }, entities: [entity({ id: 'paper-line', pts: [[0, 0], [10, 10]] })] }],
  layers: LAYERS,
  blocks: [],
  stats: {
    entities: 17,
    byKind: { line: 2, polyline: 1, spline: 1, arc: 1, circle: 1, ellipse: 1, point: 1, text: 1, mtext: 1, hatch: 1, solid: 1, dimension: 1, leader: 1, viewport: 1, insert: 1 },
    unsupported: { ACAD_PROXY_ENTITY: 2 },
    approximate: 3,
    truncated: true,
  },
}

/** @returns the scene of the fixture model's model-space layout. */
const scene = () => sceneOf(MODEL_LAYOUT, layersOf(MODEL), new Set())

test('every entity kind the model carries becomes a primitive the pane can draw', () => {
  const kinds = new Set(scene().primitives.map(primitive => primitive.kind))
  for (const kind of ['line', 'polyline', 'spline', 'arc', 'circle', 'ellipse', 'point', 'text', 'mtext', 'hatch', 'solid', 'dimension', 'leader', 'viewport']) {
    assert.ok(kinds.has(kind), `the scene dropped ${kind}`)
  }
  assert.equal(kinds.has('insert'), false, 'an insert is flattened by the engine and is not drawn here')
  assert.equal(kinds.has('unsupported'), false, 'an unsupported entity is counted, not drawn')
})

test('a hidden layer leaves the drawing and nothing else, and the counts say so', () => {
  const visible = scene()
  const hidden = sceneOf(MODEL_LAYOUT, layersOf(MODEL), new Set(['HIDDEN']))
  assert.equal(hidden.hiddenByLayer, 0, 'no fixture entity sits on the HIDDEN layer')
  // A layer the pane hides by name is dropped even when the drawing marks it visible.
  const dropped = sceneOf(MODEL_LAYOUT, layersOf(MODEL), new Set(['WIRES']))
  assert.equal(dropped.primitives.length, visible.primitives.length - 1)
  assert.equal(dropped.primitives.some(primitive => primitive.layer === 'WIRES'), false)
  assert.equal(dropped.hiddenByLayer, 1)
})

test('the scene reports what it could not draw instead of silently losing it', () => {
  const projected = scene()
  assert.equal(projected.undrawn, 2, 'the insert and the proxy entity are counted as undrawn')
  assert.equal(projected.total, MODEL_LAYOUT.entities.length)
})

test('the fit keeps CAD orientation: the drawing grows upward and is centred', () => {
  const box = { min: [0, 0], max: [100, 50] }
  const fit = fitBox(box, 400, 400, 0)
  // Y is flipped by the renderer's scale(s, -s); the fit itself must place the
  // top of the box at the top of the canvas.
  assert.equal(fit.scale, 4)
  assert.equal(fit.translateX, (400 - 4 * 100) / 2)
  assert.equal(fit.translateY, (400 + 4 * 50) / 2)
  const screenY = value => fit.translateY - fit.scale * value
  assert.ok(screenY(50) < screenY(0), 'world Y=50 must sit above world Y=0 on screen')
  assert.equal(screenY(50), 100)
  assert.equal(screenY(0), 300)
})

test('a degenerate box still fits, so an empty layout cannot produce NaN geometry', () => {
  const fit = fitBox({ min: [5, 5], max: [5, 5] }, 100, 100, 8)
  assert.ok(Number.isFinite(fit.scale) && fit.scale > 0)
  assert.ok(Number.isFinite(fit.translateX) && Number.isFinite(fit.translateY))
})

test('text carries its anchor, rotation and line breaks into the scene', () => {
  const lines = textLines(entity({ k: 'text', p: [10, 20], t: 'A\nB', h: 5, rot: Math.PI / 2, ha: 1, va: 2 }))
  assert.equal(lines.length, 2)
  assert.equal(lines[0].text, 'A')
  assert.equal(lines[0].anchor, 'middle')
  assert.equal(lines[0].baseline, 'middle')
  assert.equal(lines[0].height, 5)
  assert.equal(lines[0].degrees, 90)
  // Line two steps along the rotated baseline: down-range in world terms.
  assert.ok(lines[1].x > lines[0].x, 'a 90° rotation steps the second line along +x')
  assert.ok(Math.abs(lines[1].x - (10 + 5 * 1.4)) < 1e-9)
})

test('an entity with no usable geometry is not a primitive', () => {
  const projected = sceneOf(
    { id: 'Model', name: 'Model', kind: 'model', extents: { min: [0, 0], max: [1, 1] }, entities: [entity({ k: 'polyline', pts: [[0, 0]] })] },
    new Map(),
    new Set(),
  )
  assert.equal(projected.primitives.length, 0)
  assert.equal(projected.undrawn, 1)
})

test('bounds cover the glyph estimate, so text at the edge is not clipped', () => {
  const box = entityBounds(entity({ k: 'text', p: [10, 10], t: 'MM', h: 4, ha: 2 }))
  assert.ok(box !== undefined)
  // Right-aligned text runs left of its anchor; two wide glyphs are 1.2 em each.
  assert.equal(box.max[0], 10)
  assert.ok(Math.abs(box.min[0] - (10 - 4.8)) < 1e-9)
  assert.equal(box.max[1], 14)
  assert.equal(unionBounds(box, undefined), box)
})

test('the coverage counters agree with the model stats and sort the undrawn types', () => {
  const coverage = coverageOf(MODEL)
  assert.equal(coverage.entities, 17)
  assert.equal(coverage.approximate, 3)
  assert.equal(coverage.truncated, true)
  assert.deepEqual(coverage.unsupported, [['ACAD_PROXY_ENTITY', 2]])
  assert.equal(coverage.unsupportedTotal, 2)
})

test('the inspector facts name the fields the pane shows', () => {
  const facts = factsOf(entity({ k: 'text', p: [3, 4], t: 'HELLO', layer: 'WIRES', approx: true, src: 'MTEXT' }))
  assert.equal(facts.kind, 'text')
  assert.equal(facts.layer, 'WIRES')
  assert.equal(facts.text, 'HELLO')
  assert.deepEqual(facts.point, [3, 4])
  assert.equal(facts.approximate, true)
  assert.equal(facts.source, 'MTEXT')
  assert.equal(factsOf({ id: 'x', k: 'insert', layer: '0', color: 7 }).point, undefined)
})

test('layer counts and layer inks follow the layer table', () => {
  const counts = layerCounts(MODEL_LAYOUT.entities)
  assert.equal(counts.get('WIRES'), 1)
  assert.equal([...counts.values()].reduce((total, count) => total + count, 0), MODEL_LAYOUT.entities.length)
  assert.equal(layerInk({ name: 'WIRES', color: 1, visible: true }), tintedInk(aciHex(1)))
  assert.equal(layerInk({ name: '0', color: 7, visible: true }), AUTO_INK)
  assert.equal(layerInk({ name: 'T', color: 256, rgb: [1, 2, 3], visible: true }), tintedInk(rgbToHex([1, 2, 3])))
})

test('the units label is the drawing-unit abbreviation the code names', () => {
  assert.equal(unitLabel(4), 'mm')
  assert.equal(unitLabel(1), 'in')
  assert.equal(unitLabel(0), undefined)
  assert.equal(unitLabel(undefined), undefined)
})

test('number and point formatting stays short and stable', () => {
  assert.equal(fmt(1 / 3), '0.3333')
  assert.equal(fmt(-0), '0')
  assert.equal(fmt(Number.NaN), '0')
  assert.equal(formatPoint([12.5, -3]), '12.5, -3')
  assert.equal(formatPoint(undefined), '')
  assert.equal(textWidthEm('MM'), 1.2)
})

test('the ACI table carries the fixed entries and the generated hues', () => {
  assert.deepEqual(aciToRgb(1), [255, 0, 0])
  assert.deepEqual(aciToRgb(2), [255, 255, 0])
  assert.deepEqual(aciToRgb(7), [255, 255, 255])
  assert.deepEqual(aciToRgb(8), [128, 128, 128])
  assert.deepEqual(aciToRgb(250), [51, 51, 51])
  assert.equal(aciHex(1), '#FF0000')
  assert.equal(aciHex(256), '#FFFFFF')
  // A generated entry: hue 30° at full saturation, brightest level.
  assert.deepEqual(aciToRgb(30), [255, 127, 0])
  assert.equal(aciToRgb(-5), aciToRgb(0))
  assert.equal(aciToRgb(1000), aciToRgb(256))
})

test('the auto indexes draw in the theme ink and a colour index keeps its hue', () => {
  assert.equal(isAutoColor(7), true)
  assert.equal(isAutoColor(0), true)
  assert.equal(isAutoColor(256), true)
  assert.equal(isAutoColor(1), false)
  assert.equal(inkFor(7, undefined, undefined), AUTO_INK)
  assert.equal(inkFor(0, undefined, undefined), AUTO_INK)
  assert.equal(inkFor(256, undefined, { name: '0', color: 7, visible: true }), AUTO_INK)
  assert.equal(inkFor(256, undefined, { name: 'W', color: 1, visible: true }), tintedInk(aciHex(1)))
  assert.equal(inkFor(256, [10, 20, 30], undefined), tintedInk('#0A141E'))
  assert.match(tintedInk('#FF0000'), /^color-mix\(in srgb, #FF0000 var\(--ecad-ink-tint, 55%\), var\(--ecad-ink\)\)$/u)
  assert.match(wash(AUTO_INK), /^color-mix\(in srgb, var\(--ecad-ink\) 22%, transparent\)$/u)
})
