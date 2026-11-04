/**
 * The CAD command model: the tool registry, the point machine that turns picks
 * into operations, the operation builders the merged engine validates, and the
 * staged-draft undo/redo state.
 *
 * A command that builds the wrong op is worse than a command that does nothing:
 * the host writes a new drawing from it. These tests judge the op payloads and
 * the interaction state machine without a browser; the engine's own suite judges
 * that the payloads apply to a real drawing.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  arcThrough,
  asEcadOp,
  CAD_TOOLS,
  commandClick,
  commandFinish,
  commandHover,
  commandNumeric,
  commandStart,
  draftAdd,
  draftAddMany,
  draftCanRedo,
  draftCanUndo,
  draftClear,
  draftCommit,
  draftRedo,
  draftRemove,
  draftReset,
  draftUndo,
  EMPTY_DRAFT_STATE,
  ENGINE_OPS_SUPPORTED,
  PENDING_ENGINE_OPS,
  engineOpAvailable,
  stageAddArc,
  stageAddBlock,
  stageAddCircle,
  stageAddLayer,
  stageAddLeader,
  stageAddLine,
  stageAddPolyline,
  stageAddRectangle,
  stageAddRevisionCloud,
  stageCopy,
  stageEraseMany,
  stageExtend,
  stageMirror,
  stageMoveMany,
  stageOffset,
  stageRenameLayer,
  stageRotate,
  stageScale,
  stageSetAttribute,
  stageSetLayer,
  stageSetLayerColor,
  stageSetLayerMany,
  stageSetLine,
  stageSetPolyline,
  stageSetText,
  stageTrim,
  TOOL_BY_ID,
  toolAvailable,
  toolForShortcut,
} from '../../src/client/cadTools.ts'

/** The command context used by the interaction tests. */
const CONTEXT = { layout: 'Model', layer: '0', selection: ['a', 'b'], block: 'WD_M' }
/** The same context with no selection, for the modify-command rejections. */
const NO_SELECTION = { layout: 'Model', selection: [] }

/** One exact op body, compared field by field through deepEqual. */
const opOf = step => {
  assert.equal(step.kind, 'complete')
  assert.equal(step.ops.length, 1)
  return step.ops[0]
}

test('the tool registry is a unique, documented palette', () => {
  const ids = CAD_TOOLS.map(tool => tool.id)
  assert.equal(new Set(ids).size, ids.length, 'a tool id repeats')
  assert.deepEqual([...new Set(CAD_TOOLS.map(tool => tool.group))], ['view', 'draw', 'modify'])
  assert.equal(TOOL_BY_ID.get('line')?.group, 'draw')
  assert.equal(TOOL_BY_ID.get('erase')?.group, 'modify')
  assert.equal(TOOL_BY_ID.get('select')?.writes, false)
  assert.equal(TOOL_BY_ID.get('line')?.writes, true)
  // Every writing tool names a label, a hint and an operation; the labels are
  // locale keys, so a tool cannot ship with a hardcoded English string.
  for (const tool of CAD_TOOLS) {
    assert.match(tool.labelKey, /^tool[A-Z]/u, `${tool.id} labelKey is not a tool locale key`)
    assert.match(tool.hintKey, /^tool[A-Z].*Hint$/u, `${tool.id} hintKey is not a hint locale key`)
    if (tool.writes) assert.ok(tool.op !== undefined, `${tool.id} stages nothing`)
  }
  // Shortcuts are unique among the single-key tools (Delete is not a letter).
  const shortcuts = CAD_TOOLS.map(tool => tool.shortcut).filter(shortcut => shortcut !== undefined && shortcut !== 'Del')
  assert.equal(new Set(shortcuts).size, shortcuts.length, 'two tools share a keyboard shortcut')
  assert.equal(toolForShortcut('l'), 'line')
  assert.equal(toolForShortcut('L'), 'line')
  assert.equal(toolForShortcut('V'), 'select')
  assert.equal(toolForShortcut('nope'), undefined)
  assert.equal(toolForShortcut('Del'), undefined)
  // A tool that needs a draft is unavailable while the pane is read-only.
  assert.equal(toolAvailable(TOOL_BY_ID.get('line'), false), false)
  assert.equal(toolAvailable(TOOL_BY_ID.get('pan'), false), true)
})

test('every tool operation is supported by the merged engine', () => {
  for (const tool of CAD_TOOLS) {
    if (tool.op === undefined) continue
    assert.ok(ENGINE_OPS_SUPPORTED.has(tool.op), `${tool.id} names ${tool.op}, which the merged engine does not accept`)
    assert.ok(!PENDING_ENGINE_OPS.includes(tool.op), `${tool.id} names pending op ${tool.op}`)
  }
  // The merged engine list, as the engine's own op kinds carry it.
  for (const op of [
    'addText', 'addLine', 'addPolyline', 'addRectangle', 'addRevisionCloud', 'addLeader', 'addBlock',
    'addCircle', 'addArc', 'setText', 'setAttribute', 'setLayer', 'move', 'rotate', 'copy', 'scale',
    'mirror', 'offset', 'trim', 'extend', 'setLine', 'setPolyline', 'erase', 'addLayer', 'setLayerColor', 'renameLayer',
  ]) {
    assert.equal(engineOpAvailable(op), true, `${op} should be supported by the merged engine`)
  }
  // The only operations the face still wires without an engine form are the
  // circle/arc/other geometry grip setters.
  for (const op of ['setCircle', 'setArc', 'setGeometry', 'setDimension']) {
    assert.equal(engineOpAvailable(op), false, `${op} should still be pending`)
  }
  assert.equal(PENDING_ENGINE_OPS.length, new Set(PENDING_ENGINE_OPS).size)
  assert.equal(asEcadOp({ op: 'copy', layout: 'Model', ids: ['a'], dx: 1, dy: 2 }).op, 'copy')
})

test('a line command chains each segment and continues from its end', () => {
  let command = commandStart('line')
  assert.ok(command !== undefined)
  const first = commandClick(command, [0, 0], CONTEXT)
  assert.equal(first.kind, 'pending')
  command = first.command
  const second = commandClick(command, [10, 0], CONTEXT)
  const op = opOf(second)
  assert.deepEqual(op, { op: 'addLine', layout: 'Model', a: [0, 0], b: [10, 0], layer: '0' })
  assert.ok(second.command !== undefined)
  assert.deepEqual(second.command.points, [[10, 0]], 'the chain continues from the segment end')
})

test('polyline, cloud and leader commands finish on Enter with enough points', () => {
  let poly = commandStart('polyline')
  for (const point of [[0, 0], [5, 0], [5, 5]]) {
    const step = commandClick(poly, point, CONTEXT)
    assert.equal(step.kind, 'pending')
    poly = step.command
  }
  assert.deepEqual(opOf(commandFinish(poly, CONTEXT)), {
    op: 'addPolyline', layout: 'Model', pts: [[0, 0], [5, 0], [5, 5]], layer: '0',
  })
  let cloud = commandStart('revisionCloud')
  for (const point of [[0, 0], [5, 0], [5, 5]]) cloud = commandClick(cloud, point, CONTEXT).command
  assert.equal(opOf(commandFinish(cloud, CONTEXT)).op, 'addRevisionCloud')
  let leader = commandStart('leader')
  for (const point of [[0, 0], [5, 0], [5, 5]]) leader = commandClick(leader, point, CONTEXT).command
  assert.equal(opOf(commandFinish(leader, CONTEXT)).op, 'addLeader')
  // Too few points is a rejection, not an op with a one-point polyline.
  assert.equal(commandFinish(commandStart('polyline'), CONTEXT).kind, 'rejected')
  // Enter on a click-per-pick command stops it with no op.
  const rotate = commandStart('rotate')
  const started = commandClick(rotate, [0, 0], CONTEXT)
  assert.equal(started.kind, 'pending')
  assert.deepEqual(commandFinish(started.command, CONTEXT), { kind: 'complete', ops: [], command: undefined })
})

test('rectangle, circle and arc produce the operations the merged engine validates', () => {
  let rectangle = commandStart('rectangle')
  rectangle = commandClick(rectangle, [0, 0], CONTEXT).command
  assert.deepEqual(opOf(commandClick(rectangle, [10, 5], CONTEXT)), {
    op: 'addRectangle', layout: 'Model', corner1: [0, 0], corner2: [10, 5], layer: '0',
  })
  // Circle: centre then a point on the rim, or a typed radius.
  let circle = commandStart('circle')
  circle = commandClick(circle, [10, 10], CONTEXT).command
  const circleOp = opOf(commandClick(circle, [16, 10], CONTEXT))
  assert.equal(circleOp.op, 'addCircle')
  assert.deepEqual(circleOp.center, [10, 10])
  assert.equal(circleOp.radius, 6)
  assert.equal(circleOp.layer, '0')
  let typed = commandStart('circle')
  typed = commandClick(typed, [0, 0], CONTEXT).command
  assert.equal(opOf(commandNumeric(typed, 4.5, CONTEXT)).radius, 4.5)
  // A zero radius is rejected instead of staging a degenerate circle.
  let flat = commandStart('circle')
  flat = commandClick(flat, [0, 0], CONTEXT).command
  assert.equal(commandClick(flat, [0, 0], CONTEXT).kind, 'rejected')
  assert.equal(commandNumeric(flat, 0, CONTEXT).kind, 'rejected')
  // Arc through three points: the centre is the circumcentre and the engine
  // carries the sweep in degrees, counter-clockwise from start to end.
  let arc = commandStart('arc')
  for (const point of [[0, 0], [10, 0]]) arc = commandClick(arc, point, CONTEXT).command
  const arcOp = opOf(commandClick(arc, [10, 10], CONTEXT))
  assert.equal(arcOp.op, 'addArc')
  assert.ok(Math.abs(arcOp.center[0] - 5) < 1e-9 && Math.abs(arcOp.center[1] - 5) < 1e-9)
  assert.ok(Math.abs(arcOp.radius - Math.hypot(5, 5)) < 1e-6)
  // The start angle is the raw atan2 direction (-135°), and the sweep runs
  // clockwise-in-angle order (45°) through the middle point (315°).
  assert.ok(Math.abs(arcOp.startAngleDeg - -135) < 1e-6)
  assert.ok(Math.abs(arcOp.endAngleDeg - 45) < 1e-6)
  // The three starting points are on the circle, and the sweep contains the
  // middle point, which is what arcThrough guarantees.
  assert.equal(arcThrough([0, 0], [5, 0], [10, 0]), undefined)
  // Collinear points are refused.
  let collinear = commandStart('arc')
  for (const point of [[0, 0], [5, 0]]) collinear = commandClick(collinear, point, CONTEXT).command
  assert.equal(commandClick(collinear, [10, 0], CONTEXT).kind, 'rejected')
})

test('modify commands build the merged engine operations', () => {
  let move = commandStart('move')
  move = commandClick(move, [0, 0], CONTEXT).command
  assert.deepEqual(opOf(commandClick(move, [10, 5], CONTEXT)), {
    op: 'move', layout: 'Model', ids: ['a', 'b'], dx: 10, dy: 5,
  })
  // Without a selection the command says so instead of staging a no-op.
  assert.deepEqual(commandClick(commandStart('move'), [0, 0], NO_SELECTION), { kind: 'rejected', reasonKey: 'commandNeedsSelection' })
  // Copy.
  let copy = commandStart('copy')
  copy = commandClick(copy, [0, 0], CONTEXT).command
  assert.deepEqual(opOf(commandClick(copy, [4, 1], CONTEXT)), {
    op: 'copy', layout: 'Model', ids: ['a', 'b'], dx: 4, dy: 1,
  })
  // Rotate: centre pick then a typed angle, or a second click's direction.
  let rotate = commandStart('rotate')
  rotate = commandClick(rotate, [5, 5], CONTEXT).command
  assert.deepEqual(opOf(commandNumeric(rotate, 90, CONTEXT)), { op: 'rotate', layout: 'Model', ids: ['a', 'b'], center: [5, 5], angleDeg: 90 })
  let byClick = commandStart('rotate')
  byClick = commandClick(byClick, [0, 0], CONTEXT).command
  assert.equal(opOf(commandClick(byClick, [0, 10], CONTEXT)).angleDeg, 90)
  // Scale: base point plus a typed factor.
  let scale = commandStart('scale')
  scale = commandClick(scale, [0, 0], CONTEXT).command
  assert.deepEqual(opOf(commandNumeric(scale, 2, CONTEXT)), { op: 'scale', layout: 'Model', ids: ['a', 'b'], center: [0, 0], factor: 2 })
  // Mirror: the two picked points are the axis.
  let mirror = commandStart('mirror')
  mirror = commandClick(mirror, [0, 0], CONTEXT).command
  assert.deepEqual(opOf(commandClick(mirror, [0, 10], CONTEXT)), {
    op: 'mirror', layout: 'Model', ids: ['a', 'b'], axisA: [0, 0], axisB: [0, 10],
  })
  // Offset: a side click and a typed distance become one op per selected entity.
  let offset = commandStart('offset')
  offset = commandClick(offset, [1, 1], CONTEXT).command
  const offsetStep = commandNumeric(offset, 2, CONTEXT)
  assert.equal(offsetStep.kind, 'complete')
  assert.equal(offsetStep.ops.length, 2)
  assert.deepEqual(offsetStep.ops[0], { op: 'offset', layout: 'Model', id: 'a', distance: 2, side: [1, 1] })
  assert.deepEqual(offsetStep.ops[1], { op: 'offset', layout: 'Model', id: 'b', distance: 2, side: [1, 1] })
  // A typed distance before any point is a rejection, not a crash.
  assert.equal(commandNumeric(commandStart('offset'), 2, CONTEXT).kind, 'rejected')
})

test('numeric entry feeds drawing commands along the cursor direction', () => {
  let line = commandStart('line')
  line = commandClick(line, [0, 0], CONTEXT).command
  line = commandHover(line, [10, 10])
  const op = opOf(commandNumeric(line, 5, CONTEXT))
  assert.equal(op.op, 'addLine')
  assert.ok(Math.abs(op.a[0]) < 1e-9 && Math.abs(op.a[1]) < 1e-9)
  // The end point follows the 45° cursor direction at exactly five units.
  assert.ok(Math.abs(Math.hypot(op.b[0], op.b[1]) - 5) < 1e-6)
  assert.ok(Math.abs(op.b[0] - op.b[1]) < 1e-6)
  // A negative or zero value is refused.
  assert.equal(commandNumeric(line, -1, CONTEXT).kind, 'rejected')
  // Move accepts a typed distance too.
  let move = commandStart('move')
  move = commandClick(move, [0, 0], CONTEXT).command
  move = commandHover(move, [0, 10])
  assert.deepEqual(opOf(commandNumeric(move, 2, CONTEXT)), { op: 'move', layout: 'Model', ids: ['a', 'b'], dx: 0, dy: 2 })
})

test('text, block, trim and extend are not point commands', () => {
  const text = commandClick(commandStart('text') ?? { tool: 'text', points: [] }, [5, 5], CONTEXT)
  assert.deepEqual(text, { kind: 'form', form: 'text', point: [5, 5] })
  const block = commandClick(commandStart('block') ?? { tool: 'block', points: [] }, [5, 5], CONTEXT)
  assert.deepEqual(block, { kind: 'form', form: 'block', point: [5, 5] })
  // A block insert without a chosen block is refused.
  assert.equal(commandClick({ tool: 'block', points: [] }, [5, 5], { layout: 'Model', selection: [] }).kind, 'rejected')
  // Select/pan/zoom-window and the entity-pick modify tools own their gesture.
  for (const tool of ['select', 'pan', 'zoomWindow', 'erase', 'trim', 'extend']) {
    assert.equal(commandStart(tool), undefined, `${tool} should not be a point command`)
  }
})

test('the operation builders emit the exact wire shapes the merged engine validates', () => {
  assert.deepEqual(stageAddLine('k1', 'Model', [0, 0], [1, 2], 'WIRES').op, {
    op: 'addLine', layout: 'Model', a: [0, 0], b: [1, 2], layer: 'WIRES',
  })
  assert.equal(stageAddLine('k1', 'Model', [0, 0], [1, 2]).op.layer, undefined)
  assert.deepEqual(stageAddPolyline('k2', 'Model', [[0, 0], [1, 0], [1, 1]], true).op, {
    op: 'addPolyline', layout: 'Model', pts: [[0, 0], [1, 0], [1, 1]], closed: true,
  })
  assert.deepEqual(stageAddRectangle('k3', 'Model', [0, 0], [2, 3]).op, { op: 'addRectangle', layout: 'Model', corner1: [0, 0], corner2: [2, 3] })
  assert.equal(stageAddRevisionCloud('k4', 'Model', [[0, 0], [1, 0], [0, 1]]).op.op, 'addRevisionCloud')
  assert.equal(stageAddLeader('k5', 'Model', [[0, 0], [1, 1]]).op.op, 'addLeader')
  assert.deepEqual(stageAddBlock('k6', 'Model', 'WD_M', [3, 4], 90).op, { op: 'addBlock', layout: 'Model', block: 'WD_M', p: [3, 4], rotation: 90 })
  assert.deepEqual(stageAddCircle('k7', 'Model', [1, 2], 3, 'WIRES').op, { op: 'addCircle', layout: 'Model', center: [1, 2], radius: 3, layer: 'WIRES' })
  assert.deepEqual(stageAddArc('k8', 'Model', [0, 0], 2, 10, 80).op, { op: 'addArc', layout: 'Model', center: [0, 0], radius: 2, startAngleDeg: 10, endAngleDeg: 80 })
  assert.deepEqual(stageSetText('k9', 'Model', '10', 'NOTE').op, { op: 'setText', layout: 'Model', id: '10', text: 'NOTE' })
  assert.deepEqual(stageSetAttribute('k10', 'Model', 'insert-1', 'TAG', 'VALUE').op, { op: 'setAttribute', layout: 'Model', id: 'insert-1', tag: 'TAG', value: 'VALUE' })
  assert.deepEqual(stageSetLayer('k11', 'Model', '10', 'WIRES').op, { op: 'setLayer', layout: 'Model', id: '10', layer: 'WIRES' })
  const layerOps = stageSetLayerMany('bulk', 'Model', ['a', 'b'], 'WIRES')
  assert.equal(layerOps.length, 2)
  assert.deepEqual(layerOps.map(entry => entry.key), ['bulk-0', 'bulk-1'])
  assert.deepEqual(stageMoveMany('k12', 'Model', ['a', 'b'], 1, -2).op, { op: 'move', layout: 'Model', ids: ['a', 'b'], dx: 1, dy: -2 })
  assert.deepEqual(stageRotate('k13', 'Model', ['a'], [0, 0], 45).op, { op: 'rotate', layout: 'Model', ids: ['a'], center: [0, 0], angleDeg: 45 })
  assert.deepEqual(stageCopy('k14', 'Model', ['a'], 1, 2).op, { op: 'copy', layout: 'Model', ids: ['a'], dx: 1, dy: 2 })
  assert.deepEqual(stageScale('k15', 'Model', ['a'], [5, 5], 2).op, { op: 'scale', layout: 'Model', ids: ['a'], center: [5, 5], factor: 2 })
  assert.deepEqual(stageMirror('k16', 'Model', ['a'], [0, 0], [0, 1]).op, { op: 'mirror', layout: 'Model', ids: ['a'], axisA: [0, 0], axisB: [0, 1] })
  assert.deepEqual(stageMirror('k16', 'Model', ['a'], [0, 0], [0, 1], true).op.eraseSource, true)
  assert.deepEqual(stageOffset('k17', 'Model', 'line-1', 2, [5, 0]).op, { op: 'offset', layout: 'Model', id: 'line-1', distance: 2, side: [5, 0] })
  assert.deepEqual(stageTrim('k18', 'Model', 'target', 'boundary', [2, 2]).op, { op: 'trim', layout: 'Model', id: 'target', boundaryId: 'boundary', pick: [2, 2] })
  assert.deepEqual(stageExtend('k19', 'Model', 'target', 'boundary').op, { op: 'extend', layout: 'Model', id: 'target', boundaryId: 'boundary' })
  assert.deepEqual(stageSetLine('k20', 'Model', 'l', [0, 0], [1, 1]).op, { op: 'setLine', layout: 'Model', id: 'l', a: [0, 0], b: [1, 1] })
  assert.deepEqual(stageSetPolyline('k21', 'Model', 'p', [[0, 0], [1, 1]], true).op, { op: 'setPolyline', layout: 'Model', id: 'p', pts: [[0, 0], [1, 1]], closed: true })
  assert.deepEqual(stageEraseMany('k22', 'Model', ['a', 'b']).op, { op: 'erase', layout: 'Model', ids: ['a', 'b'] })
})

test('the layer-table builders stage drawing-wide operations with no layout', () => {
  assert.deepEqual(stageAddLayer('k1', 'REVISIONS', 1).op, { op: 'addLayer', name: 'REVISIONS', color: 1 })
  assert.deepEqual(stageAddLayer('k1', 'REVISIONS').op, { op: 'addLayer', name: 'REVISIONS' })
  assert.deepEqual(stageRenameLayer('k2', 'OLD', 'NEW').op, { op: 'renameLayer', from: 'OLD', to: 'NEW' })
  assert.deepEqual(stageSetLayerColor('k3', 'WIRES', 3).op, { op: 'setLayerColor', name: 'WIRES', color: 3 })
  // Layer operations are drawing-wide: the staged entry carries no layout id.
  assert.equal(stageAddLayer('k1', 'X', 2).layout, '')
  assert.equal(engineOpAvailable('addLayer'), true)
  assert.equal(engineOpAvailable('renameLayer'), true)
  assert.equal(engineOpAvailable('setLayerColor'), true)
})

test('the staged draft is an undo/redo state machine', () => {
  let state = EMPTY_DRAFT_STATE
  assert.equal(draftCanUndo(state), false)
  assert.equal(draftCanRedo(state), false)
  const a = stageAddLine('k1', 'Model', [0, 0], [1, 1])
  const b = stageAddRectangle('k2', 'Model', [0, 0], [1, 1])
  state = draftAdd(state, a)
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1'])
  assert.equal(draftCanUndo(state), true)
  state = draftAddMany(state, [b])
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1', 'k2'])
  // Undo walks back, redo walks forward, and a new commit drops the redo branch.
  state = draftUndo(state)
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1'])
  assert.equal(draftCanRedo(state), true)
  state = draftRedo(state)
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1', 'k2'])
  state = draftUndo(state)
  const c = stageSetText('k3', 'Model', 'e', 'X')
  state = draftAdd(state, c)
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1', 'k3'])
  assert.equal(draftCanRedo(state), false)
  // Removal and clear are both undoable.
  state = draftRemove(state, 'k1')
  assert.deepEqual(state.ops.map(entry => entry.key), ['k3'])
  state = draftUndo(state)
  assert.deepEqual(state.ops.map(entry => entry.key), ['k1', 'k3'])
  state = draftClear(state)
  assert.deepEqual(state.ops, [])
  assert.deepEqual(draftUndo(state).ops.map(entry => entry.key), ['k1', 'k3'])
  // A commit that changes nothing keeps the state identity.
  const stable = draftAdd(EMPTY_DRAFT_STATE, a)
  assert.equal(draftCommit(stable, stable.ops), stable)
  assert.equal(draftAddMany(stable, []), stable)
  assert.equal(draftRemove(stable, 'missing'), stable)
  assert.equal(draftClear(EMPTY_DRAFT_STATE), EMPTY_DRAFT_STATE)
  // A reset after apply starts clean with no history.
  assert.deepEqual(draftReset(), EMPTY_DRAFT_STATE)
  // The history is bounded so a long session cannot grow without limit.
  let deep = EMPTY_DRAFT_STATE
  for (let index = 0; index < 260; index += 1) deep = draftAdd(deep, stageSetText(`key-${index}`, 'Model', 'e', String(index)))
  assert.equal(deep.past.length, 200)
  assert.equal(deep.ops.length, 260)
})
