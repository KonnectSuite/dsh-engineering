/**
 * The CAD workspace's pure geometry: selection sets, marquee window/crossing,
 * picking, object snaps, the viewport helpers and grip handles.
 *
 * The pane's pointer rules are only as good as these functions: a marquee that
 * selects a line it merely passed, a snap that prefers the wrong point, or an
 * inverted screen transform is a bug the browser would hide behind a plausible
 * picture. They are judged here without a DOM.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  angleDegrees,
  buildIndex,
  clampSelection,
  deselectIds,
  entryDistance,
  gripsOf,
  gripRequestFor,
  gridLinesOf,
  growScreenBox,
  marqueeHits,
  marqueeOf,
  marqueeSelect,
  niceGridStep,
  orthoPoint,
  pickEntity,
  pointAtDistance,
  screenBoxContains,
  screenBoxIntersects,
  segmentIntersectsBox,
  selectId,
  selectIds,
  snapNear,
  snapPriority,
  toScreen,
  toWorld,
  viewForBox,
  zoomAt,
} from '../../src/client/cad.ts'
import { fitBox } from '../../src/client/scene.ts'

/** A fitted transform for a 100×50 sheet in a 400×400 canvas with no margin. */
const FIT = fitBox({ min: [0, 0], max: [100, 50] }, 400, 400, 0)
/** The identity user transform. */
const VIEW = { zoom: 1, panX: 0, panY: 0 }

/** One entity with the fields the model emits, defaulted. */
const entity = overrides => ({ id: 'e', k: 'line', layer: '0', color: 7, pts: [[0, 0], [10, 0]], ...overrides })

test('screen projection is the exact inverse of the world mapping', () => {
  // The fit puts world (0,0) at screen (0,300) and world (100,50) at (400,100).
  assert.deepEqual(toWorld({ x: 0, y: 300 }, FIT, VIEW), [0, 0])
  assert.deepEqual(toWorld({ x: 400, y: 100 }, FIT, VIEW), [100, 50])
  assert.deepEqual(toScreen([0, 0], FIT, VIEW), [0, 300])
  assert.deepEqual(toScreen([100, 50], FIT, VIEW), [400, 100])
  const withView = { zoom: 2, panX: -100, panY: -100 }
  assert.deepEqual(toScreen([50, 25], FIT, withView), [300, 300])
  assert.deepEqual(toWorld({ x: 300, y: 300 }, FIT, withView), [50, 25])
  // A degenerate fit maps everything to the origin rather than NaN.
  assert.deepEqual(toScreen([10, 10], { scale: 0, translateX: 0, translateY: 0 }, VIEW), [0, 0])
})

test('zoom keeps the screen point under the cursor fixed', () => {
  const next = zoomAt({ zoom: 1, panX: 0, panY: 0 }, 2, 100, 80)
  assert.deepEqual(next, { zoom: 2, panX: -100, panY: -80 })
  // The same screen point maps back to the same world point after the zoom.
  const baseline = toWorld({ x: 100, y: 80 }, FIT, { zoom: 1, panX: 0, panY: 0 })
  const after = toWorld({ x: 100, y: 80 }, FIT, next)
  assert.ok(Math.abs(baseline[0] - after[0]) < 1e-9 && Math.abs(baseline[1] - after[1]) < 1e-9)
  // Zoom limits clamp; an out-of-range factor returns the same view.
  assert.deepEqual(zoomAt({ zoom: 60, panX: 0, panY: 0 }, 2, 0, 0), { zoom: 60, panX: 0, panY: 0 })
  assert.deepEqual(zoomAt({ zoom: 0.25, panX: 0, panY: 0 }, 0.5, 0, 0), { zoom: 0.25, panX: 0, panY: 0 })
})

test('zoom window frames a screen box with a margin and keeps its centre', () => {
  const view = viewForBox({ minX: 100, minY: 100, maxX: 200, maxY: 200 }, FIT, VIEW, 400, 400, 20)
  // The screen centre of the framed box is world (37.5, 37.5) under this fit.
  const centre = toScreen([37.5, 37.5], FIT, view)
  assert.ok(Math.abs(centre[0] - 200) < 1e-6 && Math.abs(centre[1] - 200) < 1e-6, 'the framed centre lands on the canvas centre')
  // The framed box is larger on screen than it was, but stays inside the canvas.
  const framedTopLeft = toScreen(toWorld({ x: 100, y: 100 }, FIT, VIEW), FIT, view)
  assert.ok(framedTopLeft[0] >= 20 - 1e-6 && framedTopLeft[1] >= 20 - 1e-6, 'the framed box clears the margin')
  // A degenerate box leaves the view alone.
  assert.deepEqual(viewForBox({ minX: 10, minY: 10, maxX: 10, maxY: 10 }, FIT, VIEW, 400, 400), VIEW)
})

test('the selection set adds, toggles and replaces without duplicates', () => {
  assert.deepEqual(selectId([], 'a', 'replace'), ['a'])
  assert.deepEqual(selectId(['a', 'b'], 'c', 'add'), ['a', 'b', 'c'])
  assert.deepEqual(selectId(['a', 'b'], 'b', 'add'), ['a', 'b'])
  assert.deepEqual(selectId(['a', 'b'], 'b', 'toggle'), ['a'])
  assert.deepEqual(selectId(['a'], 'c', 'toggle'), ['a', 'c'])
  assert.deepEqual(selectIds([], ['a', 'b', 'a'], 'replace'), ['a', 'b'])
  assert.deepEqual(selectIds(['a', 'b'], ['b', 'c'], 'toggle'), ['a', 'c'])
  assert.deepEqual(deselectIds(['a', 'b', 'c'], ['b', 'c']), ['a'])
  assert.deepEqual(clampSelection(['a', 'gone', 'b'], new Set(['a', 'b'])), ['a', 'b'])
  const same = ['a', 'b']
  assert.equal(clampSelection(same, new Set(['a', 'b', 'c'])), same)
})

test('a left-drag marquee is a window and a right-drag is a crossing', () => {
  const right = marqueeOf({ x: 10, y: 10 }, { x: 90, y: 90 })
  assert.equal(right.mode, 'window')
  assert.deepEqual(right.box, { minX: 10, minY: 10, maxX: 90, maxY: 90 })
  const left = marqueeOf({ x: 90, y: 90 }, { x: 10, y: 10 })
  assert.equal(left.mode, 'crossing')
  assert.deepEqual(left.box, { minX: 10, minY: 10, maxX: 90, maxY: 90 })
  assert.deepEqual(growScreenBox({ minX: 1, minY: 2, maxX: 3, maxY: 4 }, 5), { minX: -4, minY: -3, maxX: 8, maxY: 9 })
})

test('window selection keeps only fully enclosed geometry; crossing keeps everything touched', () => {
  const entities = [
    entity({ id: 'inside', pts: [[40, 20], [60, 30]] }),
    entity({ id: 'straddle', pts: [[40, 20], [150, 30]] }),
    entity({ id: 'outside', pts: [[0, 0], [5, 5]] }),
    entity({ id: 'circle', k: 'circle', c: [50, 25], r: 5 }),
    entity({ id: 'text', k: 'text', p: [52, 30], t: 'X', h: 4 }),
  ]
  const index = buildIndex(entities)
  // Screen box around the middle of the sheet: world 40..70 × 15..40.
  const box = { minX: 160, minY: 160, maxX: 280, maxY: 280 }
  const window = marqueeSelect(index, { box, mode: 'window' }, FIT, VIEW)
  assert.deepEqual([...window].sort(), ['circle', 'inside', 'text'])
  const crossing = marqueeSelect(index, { box, mode: 'crossing' }, FIT, VIEW)
  assert.deepEqual([...crossing].sort(), ['circle', 'inside', 'straddle', 'text'])
  // A degenerate rectangle selects nothing.
  assert.deepEqual(marqueeSelect(index, { box: { minX: 10, minY: 10, maxX: 10.1, maxY: 10.1 }, mode: 'crossing' }, FIT, VIEW), [])
  // Locked layers are never selected by a marquee.
  const locked = marqueeSelect(index, { box, mode: 'window' }, FIT, VIEW, { locked: new Set(['0']) })
  assert.deepEqual(locked, [])
})

test('marquee geometry tests sample points and crossing segments', () => {
  const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 }
  assert.equal(marqueeHits([[2, 2], [8, 8]], box, 'window'), true)
  assert.equal(marqueeHits([[2, 2], [12, 8]], box, 'window'), false)
  assert.equal(marqueeHits([[2, 2], [12, 8]], box, 'crossing'), true)
  // A line that merely spans the box without either end inside is crossed.
  assert.equal(marqueeHits([[-5, 5], [15, 5]], box, 'crossing'), true)
  // A line entirely above the box is not.
  assert.equal(marqueeHits([[-5, 50], [15, 50]], box, 'crossing'), false)
  assert.equal(marqueeHits([], box, 'crossing'), false)
  // Segment/box: inside, crossing, outside, and a degenerate segment.
  assert.equal(segmentIntersectsBox([2, 2], [8, 8], box), true)
  assert.equal(segmentIntersectsBox([-1, 5], [11, 5], box), true)
  assert.equal(segmentIntersectsBox([-1, 50], [11, 50], box), false)
  const whole = { minX: -1, minY: -1, maxX: 11, maxY: 11 }
  assert.equal(screenBoxContains(whole, box), true)
  assert.equal(screenBoxContains(box, whole), false)
  assert.equal(screenBoxIntersects(box, { minX: 5, minY: 5, maxX: 15, maxY: 15 }), true)
  assert.equal(screenBoxIntersects(box, { minX: 20, minY: 20, maxX: 30, maxY: 30 }), false)
})

test('picking prefers the nearest entity, the later one on a tie, and skips locked layers', () => {
  const entities = [
    entity({ id: 'top', pts: [[0, 0], [100, 0]] }),
    entity({ id: 'bottom', pts: [[0, 0], [100, 0]] }),
    entity({ id: 'circle', k: 'circle', c: [50, 50], r: 10 }),
    entity({ id: 'locked', layer: 'LOCKED', pts: [[0, 80], [100, 80]] }),
  ]
  const index = buildIndex(entities)
  // On the shared horizontal line, the later-drawn entity wins the tie.
  assert.equal(pickEntity(index, [50, 0], 2), 'bottom')
  // The circle's ring, not its empty middle, is what is picked; the locked line
  // is below the ring and does not interfere here.
  assert.equal(pickEntity(index, [50, 60], 1), 'circle')
  assert.equal(pickEntity(index, [50, 50], 1), undefined)
  assert.equal(pickEntity(index, [50, 80.4], 1), 'locked')
  assert.equal(pickEntity(index, [50, 80.4], 1, { locked: new Set(['LOCKED']) }), undefined)
  // A zero or invalid tolerance picks nothing.
  assert.equal(pickEntity(index, [50, 0], 0), undefined)
  assert.equal(pickEntity(index, [Number.NaN, 0], 1), undefined)
  // Distance is only reported for geometry within the tolerance.
  const circleEntry = index.entries.find(entry => entry.id === 'circle')
  assert.ok(circleEntry !== undefined)
  assert.ok(entryDistance(circleEntry, [55, 50], 6) < 6)
  assert.equal(entryDistance(circleEntry, [50, 50], 1), Infinity)
})

test('snaps prefer an endpoint over a midpoint over a centre over nearest over grid', () => {
  const entities = [
    entity({ id: 'wire', pts: [[0, 0], [20, 0], [20, 20]] }),
    entity({ id: 'circle', k: 'circle', c: [50, 10], r: 5 }),
  ]
  const index = buildIndex(entities)
  assert.equal(snapNear(index, [20.2, 0.1], 2)?.kind, 'endpoint')
  assert.equal(snapNear(index, [10.1, 0.1], 2)?.kind, 'midpoint')
  assert.equal(snapNear(index, [50.2, 10.1], 2)?.kind, 'center')
  // Nearest-on-line is offered where no endpoint/midpoint is near.
  const nearest = snapNear(index, [5.1, 0.4], 2)
  assert.equal(nearest?.kind, 'nearest')
  assert.ok(nearest !== undefined && Math.abs(nearest.point[1]) < 1e-9)
  // The grid is the lowest-priority candidate and only joins when enabled.
  assert.equal(snapNear(index, [33.2, 33.4], 0.5), undefined)
  const grid = snapNear(index, [33.2, 33.4], 1, { includeGrid: true, grid: 1 })
  assert.equal(grid?.kind, 'grid')
  assert.deepEqual(grid?.point, [33, 33])
  // A snap radius of zero and a locked layer yield no snap.
  assert.equal(snapNear(index, [20, 0], 0), undefined)
  assert.equal(snapNear(index, [20, 0], 2, { locked: new Set(['0']) }), undefined)
  // Priority is a total order the pane documents.
  assert.ok(snapPriority('endpoint') < snapPriority('midpoint'))
  assert.ok(snapPriority('midpoint') < snapPriority('center'))
  assert.ok(snapPriority('center') < snapPriority('nearest'))
  assert.ok(snapPriority('nearest') < snapPriority('grid'))
})

test('ortho, typed distance and angle helpers follow CAD conventions', () => {
  assert.deepEqual(orthoPoint([0, 0], [10, 2]), [10, 0])
  assert.deepEqual(orthoPoint([0, 0], [2, 10]), [0, 10])
  assert.deepEqual(pointAtDistance([0, 0], [10, 0], 5), [5, 0])
  const diagonal = pointAtDistance([0, 0], [3, 4], 10)
  assert.ok(Math.abs(diagonal[0] - 6) < 1e-9 && Math.abs(diagonal[1] - 8) < 1e-9)
  // A zero-length direction falls back to +X rather than NaN.
  assert.deepEqual(pointAtDistance([0, 0], [0, 0], 3), [3, 0])
  assert.equal(angleDegrees([0, 0], [0, 10]), 90)
  assert.equal(angleDegrees([0, 0], [-10, 0]), 180)
  assert.equal(angleDegrees([0, 0], [10, -10]), -45)
})

test('the grid step snaps to 1/2/5 values and the line list stays bounded', () => {
  assert.equal(niceGridStep(1), 20)
  assert.equal(niceGridStep(0.1), 2)
  assert.equal(niceGridStep(0.01), 0.2)
  // Degenerate inputs return a usable step instead of NaN.
  assert.equal(niceGridStep(0), 1)
  assert.equal(niceGridStep(Number.NaN), 1)
  const grid = gridLinesOf(FIT, VIEW, 400, 400)
  assert.ok(grid.step > 0)
  assert.ok(grid.xs.length > 0 && grid.xs.length <= 400)
  assert.ok(grid.ys.length > 0 && grid.ys.length <= 400)
  assert.deepEqual(gridLinesOf(FIT, VIEW, 0, 0).xs, [])
})

test('grips expose the vertices, centres and insertions a CAD user expects', () => {
  const line = gripsOf(entity({ k: 'line', pts: [[1, 2], [3, 4]] }))
  assert.deepEqual(line.map(grip => grip.key), ['endpoint:0', 'endpoint:1'])
  assert.deepEqual(line[0].point, [1, 2])
  const poly = gripsOf(entity({ k: 'polyline', pts: [[0, 0], [1, 0], [1, 1]] }))
  assert.deepEqual(poly.map(grip => grip.kind), ['vertex', 'vertex', 'vertex'])
  const circle = gripsOf(entity({ k: 'circle', c: [10, 10], r: 4 }))
  assert.equal(circle[0].kind, 'center')
  assert.equal(circle.length, 5)
  const text = gripsOf(entity({ k: 'text', p: [5, 5], t: 'A', h: 2 }))
  assert.deepEqual(text.map(grip => [grip.kind, grip.point]), [['insert', [5, 5]]])
  // A giant polyline caps its handles but keeps the last vertex reachable.
  const giant = gripsOf(entity({ k: 'polyline', pts: Array.from({ length: 500 }, (_, index) => [index, index]) }), 10)
  assert.ok(giant.length <= 12)
  assert.deepEqual(giant[giant.length - 1].point, [499, 499])
  assert.deepEqual(gripsOf(entity({ id: 'x', k: 'unsupported' })), [])
})

test('a grip dispatches a supported move for insertion points and an engine op for geometry', () => {
  const text = entity({ id: 't', k: 'text', p: [10, 10], t: 'A', h: 2 })
  const request = gripRequestFor(text, gripsOf(text)[0], [12, 13])
  assert.deepEqual(request, { kind: 'move', dx: 2, dy: 3 })
  const line = entity({ id: 'l', k: 'line', pts: [[0, 0], [10, 0]] })
  const lineRequest = gripRequestFor(line, gripsOf(line)[1], [10, 5])
  assert.equal(lineRequest.kind, 'engine')
  assert.equal(lineRequest.op, 'setLine')
  assert.deepEqual(lineRequest.payload.b, [10, 5])
  const poly = entity({ id: 'p', k: 'polyline', pts: [[0, 0], [5, 0], [5, 5]] })
  const polyRequest = gripRequestFor(poly, gripsOf(poly)[1], [5, 2])
  assert.equal(polyRequest.op, 'setPolyline')
  const circle = entity({ id: 'c', k: 'circle', c: [0, 0], r: 5 })
  assert.equal(gripRequestFor(circle, gripsOf(circle)[1], [6, 0]).op, 'setCircle')
  // A circle's centre grip translates the circle, which `move` supports.
  assert.deepEqual(gripRequestFor(circle, gripsOf(circle)[0], [2, 3]), { kind: 'move', dx: 2, dy: 3 })
})
