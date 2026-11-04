/**
 * The CAD workspace's command model: the tool registry, the interactive point
 * machine that turns clicks into staged operations, the engine-operation
 * adapter, and the undo/redo state of the staged draft.
 *
 * The registry is the one place that says what each tool stages. The engine
 * operations a parallel engine change is still adding (`copy`, `scale`,
 * `setLine`, layer edits, …) are listed in {@link PENDING_ENGINE_OPS}: the tools
 * stay in the palette and their interaction and preview work, and the adapter
 * reports the pending operation instead of pretending it was staged. When those
 * operations land, only this module's lists and payload builders change.
 *
 * Everything here is pure; the body owns pointer state and calls in.
 *
 * @module dsh-engineering-ecad/client/cadTools
 */

import type { EcadOp, EcadPoint } from '../engine/types.ts'
import type { EcadStagedOp } from './edits.ts'
import { roundCoord } from './edits.ts'
import { angleDegrees, pointAtDistance, roundValue } from './cad.ts'

/** The tool palette groups, in palette order. */
export type CadToolGroup = 'view' | 'draw' | 'modify'

/** Every tool the palette offers. */
export type CadToolId =
  | 'select'
  | 'pan'
  | 'zoomWindow'
  | 'line'
  | 'polyline'
  | 'rectangle'
  | 'circle'
  | 'arc'
  | 'revisionCloud'
  | 'leader'
  | 'text'
  | 'block'
  | 'move'
  | 'copy'
  | 'rotate'
  | 'scale'
  | 'mirror'
  | 'offset'
  | 'trim'
  | 'extend'
  | 'erase'

/** The numeric entry a command accepts. */
export type CadNumericKind = 'radius' | 'angle' | 'distance' | 'factor'

/** One palette tool. */
export interface CadToolSpec {
  readonly id: CadToolId
  readonly group: CadToolGroup
  /** Locale key of the tool name. */
  readonly labelKey: string
  /** Locale key of the one-line hint shown in the command bar. */
  readonly hintKey: string
  /** Single-key shortcut, upper case; absent when the tool has none. */
  readonly shortcut?: string
  /** Click picks that complete the command; 0 means the command owns its flow. */
  readonly steps: number
  /** A line chain continues from the end of the previous segment. */
  readonly chain?: boolean
  /** The numeric entry the command bar offers. */
  readonly numeric?: CadNumericKind
  /** The engine operation the command stages. */
  readonly op?: string
  /** True when the tool needs write mode (edit mode) and a local draft. */
  readonly writes: boolean
}

/**
 * The tool registry.
 *
 * Names are the CAD names; the label and hint keys are resolved by the locale
 * dictionary in both languages. `writes: false` tools stay available with the
 * row's writes switched off, which is the read-only contract the M4 pane had.
 */
export const CAD_TOOLS: readonly CadToolSpec[] = [
  { id: 'select', group: 'view', labelKey: 'toolSelect', hintKey: 'toolSelectHint', shortcut: 'V', steps: 0, writes: false },
  { id: 'pan', group: 'view', labelKey: 'toolPan', hintKey: 'toolPanHint', shortcut: 'H', steps: 0, writes: false },
  { id: 'zoomWindow', group: 'view', labelKey: 'toolZoomWindow', hintKey: 'toolZoomWindowHint', shortcut: 'Z', steps: 0, writes: false },
  { id: 'line', group: 'draw', labelKey: 'toolLine', hintKey: 'toolLineHint', shortcut: 'L', steps: 2, chain: true, numeric: 'distance', op: 'addLine', writes: true },
  { id: 'polyline', group: 'draw', labelKey: 'toolPolyline', hintKey: 'toolPolylineHint', shortcut: 'P', steps: 0, numeric: 'distance', op: 'addPolyline', writes: true },
  { id: 'rectangle', group: 'draw', labelKey: 'toolRectangle', hintKey: 'toolRectangleHint', shortcut: 'R', steps: 2, op: 'addRectangle', writes: true },
  { id: 'circle', group: 'draw', labelKey: 'toolCircle', hintKey: 'toolCircleHint', shortcut: 'C', steps: 2, numeric: 'radius', op: 'addCircle', writes: true },
  { id: 'arc', group: 'draw', labelKey: 'toolArc', hintKey: 'toolArcHint', shortcut: 'A', steps: 3, op: 'addArc', writes: true },
  { id: 'revisionCloud', group: 'draw', labelKey: 'toolRevisionCloud', hintKey: 'toolRevisionCloudHint', shortcut: 'K', steps: 0, op: 'addRevisionCloud', writes: true },
  { id: 'leader', group: 'draw', labelKey: 'toolLeader', hintKey: 'toolLeaderHint', shortcut: 'D', steps: 0, op: 'addLeader', writes: true },
  { id: 'text', group: 'draw', labelKey: 'toolText', hintKey: 'toolTextHint', shortcut: 'T', steps: 0, op: 'addText', writes: true },
  { id: 'block', group: 'draw', labelKey: 'toolBlock', hintKey: 'toolBlockHint', shortcut: 'I', steps: 0, op: 'addBlock', writes: true },
  { id: 'move', group: 'modify', labelKey: 'toolMove', hintKey: 'toolMoveHint', shortcut: 'M', steps: 2, numeric: 'distance', op: 'move', writes: true },
  { id: 'copy', group: 'modify', labelKey: 'toolCopy', hintKey: 'toolCopyHint', shortcut: 'Y', steps: 2, numeric: 'distance', op: 'copy', writes: true },
  { id: 'rotate', group: 'modify', labelKey: 'toolRotate', hintKey: 'toolRotateHint', shortcut: 'Q', steps: 1, numeric: 'angle', op: 'rotate', writes: true },
  { id: 'scale', group: 'modify', labelKey: 'toolScale', hintKey: 'toolScaleHint', shortcut: 'S', steps: 1, numeric: 'factor', op: 'scale', writes: true },
  { id: 'mirror', group: 'modify', labelKey: 'toolMirror', hintKey: 'toolMirrorHint', shortcut: 'F', steps: 2, op: 'mirror', writes: true },
  { id: 'offset', group: 'modify', labelKey: 'toolOffset', hintKey: 'toolOffsetHint', shortcut: 'O', steps: 1, numeric: 'distance', op: 'offset', writes: true },
  { id: 'trim', group: 'modify', labelKey: 'toolTrim', hintKey: 'toolTrimHint', shortcut: 'X', steps: 0, op: 'trim', writes: true },
  { id: 'extend', group: 'modify', labelKey: 'toolExtend', hintKey: 'toolExtendHint', shortcut: 'E', steps: 0, op: 'extend', writes: true },
  { id: 'erase', group: 'modify', labelKey: 'toolErase', hintKey: 'toolEraseHint', shortcut: 'Del', steps: 0, op: 'erase', writes: true },
]

/** The tool registry keyed by id, for the body's dispatch. */
export const TOOL_BY_ID: ReadonlyMap<CadToolId, CadToolSpec> = new Map(CAD_TOOLS.map(tool => [tool.id, tool]))

/** @returns the tool spec, or undefined for an unknown id. */
export function toolOf(id: CadToolId): CadToolSpec | undefined {
  return TOOL_BY_ID.get(id)
}

/** The tool a single keyboard letter arms, if any. */
export function toolForShortcut(key: string): CadToolId | undefined {
  const wanted = key.toUpperCase()
  const tool = CAD_TOOLS.find(candidate => (candidate.shortcut ?? '').toUpperCase() === wanted && candidate.shortcut !== 'Del')
  return tool?.id
}

/** Whether a tool is available in the current write posture. */
export function toolAvailable(tool: CadToolSpec, editing: boolean): boolean {
  return tool.writes ? editing : true
}

/**
 * The operations the merged engine validates today.
 *
 * The engine is the authority: its `draft_ops` validation refuses an operation
 * or a selection it cannot carry, and the apply outcome surfaces that rejection
 * (code, message and fix) verbatim. The entries below are what the face knows it
 * can stage; {@link PENDING_ENGINE_OPS} names the few grip forms still waiting.
 */
export const ENGINE_OPS_SUPPORTED: ReadonlySet<string> = new Set([
  'addText',
  'addLine',
  'addPolyline',
  'addRectangle',
  'addRevisionCloud',
  'addLeader',
  'addBlock',
  'addCircle',
  'addArc',
  'setText',
  'setAttribute',
  'setLayer',
  'move',
  'rotate',
  'copy',
  'scale',
  'mirror',
  'offset',
  'trim',
  'extend',
  'setLine',
  'setPolyline',
  'erase',
  'addLayer',
  'setLayerColor',
  'renameLayer',
])

/**
 * Grip and property edits the pinned engine still has no operation for.
 *
 * `setCircle`, `setArc`, `setEllipse` and `setColor` are fully built here against
 * the shapes the parallel engine change adds; until that lands they stay in this
 * list so the pane previews the edit and names the pending operation instead of
 * faking a stage. Moving one of these into {@link ENGINE_OPS_SUPPORTED} is the
 * whole switch.
 */
export const PENDING_ENGINE_OPS: readonly string[] = [
  'setCircle',
  'setArc',
  'setEllipse',
  'setColor',
  'setGeometry',
  'setDimension',
]

/** The operations the face builds against an engine branch not yet merged. */
export const PREPARED_ENGINE_OPS: readonly string[] = ['setCircle', 'setArc', 'setEllipse', 'setColor']

/** Whether one engine operation can be staged against the pinned engine. */
export function engineOpAvailable(op: string): boolean {
  return ENGINE_OPS_SUPPORTED.has(op)
}

/** One operation the face builds, with a shape the engine validates. */
export interface CadPendingOp {
  readonly op: string
  readonly [field: string]: unknown
}

/**
 * Present a built operation as the wire's op type.
 *
 * Every builder in this module targets an operation {@link ENGINE_OPS_SUPPORTED}
 * lists, so the cast only bridges the builder's open shape to the engine's
 * discriminated union. The engine validates what it receives and its rejection
 * is surfaced verbatim; {@link engineOpAvailable} gates the entries that remain
 * pending.
 * @param op - the built operation.
 * @returns the wire operation.
 */
export function asEcadOp(op: CadPendingOp): EcadOp {
  return op as unknown as EcadOp
}

/* ------------------------------------------------------------------ *
 * Operation builders for the operations the engine supports
 * ------------------------------------------------------------------ */

/** @returns a staged op list entry. */
function staged(key: string, layout: string, op: CadPendingOp): EcadStagedOp {
  return { key, layout, op: asEcadOp(op) }
}

/** Build a staged op with no layout (the layer-table operations). */
function stagedLayer(key: string, op: CadPendingOp): EcadStagedOp {
  return { key, layout: '', op: asEcadOp(op) }
}

/** Build an `addLine` staged op. */
export function stageAddLine(key: string, layout: string, a: EcadPoint, b: EcadPoint, layer?: string): EcadStagedOp {
  return staged(key, layout, { op: 'addLine', layout, a: [roundCoord(a[0]), roundCoord(a[1])], b: [roundCoord(b[0]), roundCoord(b[1])], ...(layer === undefined ? {} : { layer }) })
}

/** Build an `addPolyline` staged op. */
export function stageAddPolyline(key: string, layout: string, points: readonly EcadPoint[], closed = false, layer?: string): EcadStagedOp {
  return staged(key, layout, {
    op: 'addPolyline',
    layout,
    pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]),
    ...(closed ? { closed: true } : {}),
    ...(layer === undefined ? {} : { layer }),
  })
}

/** Build an `addRectangle` staged op. */
export function stageAddRectangle(key: string, layout: string, corner1: EcadPoint, corner2: EcadPoint, layer?: string): EcadStagedOp {
  return staged(key, layout, { op: 'addRectangle', layout, corner1: [roundCoord(corner1[0]), roundCoord(corner1[1])], corner2: [roundCoord(corner2[0]), roundCoord(corner2[1])], ...(layer === undefined ? {} : { layer }) })
}

/** Build an `addRevisionCloud` staged op. */
export function stageAddRevisionCloud(key: string, layout: string, points: readonly EcadPoint[], layer?: string): EcadStagedOp {
  return staged(key, layout, { op: 'addRevisionCloud', layout, pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]), ...(layer === undefined ? {} : { layer }) })
}

/** Build an `addLeader` staged op. */
export function stageAddLeader(key: string, layout: string, points: readonly EcadPoint[], layer?: string): EcadStagedOp {
  return staged(key, layout, { op: 'addLeader', layout, pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]), ...(layer === undefined ? {} : { layer }) })
}

/** Build an `addBlock` staged op. */
export function stageAddBlock(key: string, layout: string, block: string, point: EcadPoint, rotationDeg = 0, scale?: EcadPoint, layer?: string): EcadStagedOp {
  return staged(key, layout, {
    op: 'addBlock',
    layout,
    block,
    p: [roundCoord(point[0]), roundCoord(point[1])],
    ...(rotationDeg === 0 ? {} : { rotation: rotationDeg }),
    ...(scale === undefined ? {} : { scale }),
    ...(layer === undefined ? {} : { layer }),
  })
}

/** Build a `setText` staged op. */
export function stageSetText(key: string, layout: string, id: string, text: string): EcadStagedOp {
  return staged(key, layout, { op: 'setText', layout, id, text })
}

/** Build a `setAttribute` staged op; the wire names the owning INSERT id and the tag. */
export function stageSetAttribute(key: string, layout: string, id: string, tag: string, value: string): EcadStagedOp {
  return staged(key, layout, { op: 'setAttribute', layout, id, tag, value })
}

/** Build a `setLayer` staged op. */
export function stageSetLayer(key: string, layout: string, id: string, layer: string): EcadStagedOp {
  return staged(key, layout, { op: 'setLayer', layout, id, layer })
}

/** Build one `setLayer` op per entity, for a bulk layer change. */
export function stageSetLayerMany(keyPrefix: string, layout: string, ids: readonly string[], layer: string): readonly EcadStagedOp[] {
  return ids.map((id, index) => stageSetLayer(`${keyPrefix}-${index}`, layout, id, layer))
}

/** Build one multi-id `move` staged op. */
export function stageMoveMany(key: string, layout: string, ids: readonly string[], dx: number, dy: number): EcadStagedOp {
  return staged(key, layout, { op: 'move', layout, ids: [...ids], dx: roundCoord(dx), dy: roundCoord(dy) })
}

/** Build one multi-id `rotate` staged op. */
export function stageRotate(key: string, layout: string, ids: readonly string[], center: EcadPoint, angleDeg: number): EcadStagedOp {
  return staged(key, layout, { op: 'rotate', layout, ids: [...ids], center: [roundCoord(center[0]), roundCoord(center[1])], angleDeg: roundCoord(angleDeg) })
}

/** Build one multi-id `erase` staged op. */
export function stageEraseMany(key: string, layout: string, ids: readonly string[]): EcadStagedOp {
  return staged(key, layout, { op: 'erase', layout, ids: [...ids] })
}

/* ------------------------------------------------------------------ *
 * Operation builders for the geometry operations the merged engine accepts
 * ------------------------------------------------------------------ */

/** Build an `addCircle` staged op. */
export function stageAddCircle(key: string, layout: string, center: EcadPoint, radius: number, layer?: string): EcadStagedOp {
  return staged(key, layout, {
    op: 'addCircle',
    layout,
    center: [roundCoord(center[0]), roundCoord(center[1])],
    radius: roundCoord(Math.abs(radius)),
    ...(layer === undefined ? {} : { layer }),
  })
}

/** Build an `addArc` staged op; the engine carries the sweep in degrees. */
export function stageAddArc(key: string, layout: string, center: EcadPoint, radius: number, startAngleDeg: number, endAngleDeg: number, layer?: string): EcadStagedOp {
  return staged(key, layout, {
    op: 'addArc',
    layout,
    center: [roundCoord(center[0]), roundCoord(center[1])],
    radius: roundCoord(Math.abs(radius)),
    startAngleDeg: roundCoord(startAngleDeg),
    endAngleDeg: roundCoord(endAngleDeg),
    ...(layer === undefined ? {} : { layer }),
  })
}

/** Build a multi-id `copy` staged op. */
export function stageCopy(key: string, layout: string, ids: readonly string[], dx: number, dy: number): EcadStagedOp {
  return staged(key, layout, { op: 'copy', layout, ids: [...ids], dx: roundCoord(dx), dy: roundCoord(dy) })
}

/** Build a multi-id `scale` staged op. */
export function stageScale(key: string, layout: string, ids: readonly string[], center: EcadPoint, factor: number): EcadStagedOp {
  return staged(key, layout, {
    op: 'scale',
    layout,
    ids: [...ids],
    center: [roundCoord(center[0]), roundCoord(center[1])],
    factor: roundCoord(factor),
  })
}

/** Build a multi-id `mirror` staged op; the engine keeps a mirrored copy by default. */
export function stageMirror(key: string, layout: string, ids: readonly string[], axisA: EcadPoint, axisB: EcadPoint, eraseSource = false): EcadStagedOp {
  return staged(key, layout, {
    op: 'mirror',
    layout,
    ids: [...ids],
    axisA: [roundCoord(axisA[0]), roundCoord(axisA[1])],
    axisB: [roundCoord(axisB[0]), roundCoord(axisB[1])],
    ...(eraseSource ? { eraseSource: true } : {}),
  })
}

/** Build an `offset` staged op; one entity per op, as the engine carries it. */
export function stageOffset(key: string, layout: string, id: string, distance: number, side: EcadPoint): EcadStagedOp {
  return staged(key, layout, {
    op: 'offset',
    layout,
    id,
    distance: roundCoord(Math.abs(distance)),
    side: [roundCoord(side[0]), roundCoord(side[1])],
  })
}

/** Build a `trim` staged op; `pick` is the side of the line the reader clicked. */
export function stageTrim(key: string, layout: string, id: string, boundaryId: string, pick?: EcadPoint): EcadStagedOp {
  return staged(key, layout, {
    op: 'trim',
    layout,
    id,
    boundaryId,
    ...(pick === undefined ? {} : { pick: [roundCoord(pick[0]), roundCoord(pick[1])] }),
  })
}

/** Build an `extend` staged op. */
export function stageExtend(key: string, layout: string, id: string, boundaryId: string): EcadStagedOp {
  return staged(key, layout, { op: 'extend', layout, id, boundaryId })
}

/** Build a `setLine` staged op, for a line's endpoint grip. */
export function stageSetLine(key: string, layout: string, id: string, a: EcadPoint, b: EcadPoint): EcadStagedOp {
  return staged(key, layout, { op: 'setLine', layout, id, a: [roundCoord(a[0]), roundCoord(a[1])], b: [roundCoord(b[0]), roundCoord(b[1])] })
}

/** Build a `setPolyline` staged op, for a polyline vertex grip. */
export function stageSetPolyline(key: string, layout: string, id: string, points: readonly EcadPoint[], closed = false): EcadStagedOp {
  return staged(key, layout, {
    op: 'setPolyline',
    layout,
    id,
    pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]),
    ...(closed ? { closed: true } : {}),
  })
}

/** Build a `setCircle` staged op, for a circle radius grip. */
export function stageSetCircle(key: string, layout: string, id: string, center: EcadPoint, radius: number): EcadStagedOp {
  return staged(key, layout, {
    op: 'setCircle',
    layout,
    id,
    center: [roundCoord(center[0]), roundCoord(center[1])],
    radius: roundCoord(Math.abs(radius)),
  })
}

/** Build a `setArc` staged op, for an arc geometry grip. */
export function stageSetArc(key: string, layout: string, id: string, center: EcadPoint, radius: number, startAngleDeg: number, endAngleDeg: number): EcadStagedOp {
  return staged(key, layout, {
    op: 'setArc',
    layout,
    id,
    center: [roundCoord(center[0]), roundCoord(center[1])],
    radius: roundCoord(Math.abs(radius)),
    startAngleDeg: roundCoord(startAngleDeg),
    endAngleDeg: roundCoord(endAngleDeg),
  })
}

/** Build a `setEllipse` staged op, for an ellipse quadrant grip. */
export function stageSetEllipse(key: string, layout: string, id: string, center: EcadPoint, rx: number, ry: number, rotDeg: number): EcadStagedOp {
  return staged(key, layout, {
    op: 'setEllipse',
    layout,
    id,
    center: [roundCoord(center[0]), roundCoord(center[1])],
    rx: roundCoord(Math.abs(rx)),
    ry: roundCoord(Math.abs(ry)),
    rotDeg: roundCoord(rotDeg),
  })
}

/** Build one `setColor` staged op for a whole selection; the engine takes an ACI 1–255. */
export function stageSetColor(key: string, layout: string, ids: readonly string[], color: number): EcadStagedOp {
  return staged(key, layout, { op: 'setColor', layout, ids: [...ids], color: Math.trunc(color) })
}

/** Build an `addLayer` staged op (no layout: the layer table is drawing-wide). */
export function stageAddLayer(key: string, name: string, color?: number): EcadStagedOp {
  return stagedLayer(key, { op: 'addLayer', name, ...(color === undefined ? {} : { color: Math.trunc(color) }) })
}

/** Build a `renameLayer` staged op. */
export function stageRenameLayer(key: string, from: string, to: string): EcadStagedOp {
  return stagedLayer(key, { op: 'renameLayer', from, to })
}

/** Build a `setLayerColor` staged op. */
export function stageSetLayerColor(key: string, name: string, color: number): EcadStagedOp {
  return stagedLayer(key, { op: 'setLayerColor', name, color: Math.trunc(color) })
}

/* ------------------------------------------------------------------ *
 * Interactive point machine
 * ------------------------------------------------------------------ */

/** One tool's in-progress pick sequence. */
export interface CadCommand {
  readonly tool: CadToolId
  /** Points already picked, in drawing units. */
  readonly points: readonly EcadPoint[]
  /** The last hovered point, used by numeric entry and the rubber-band preview. */
  readonly cursor?: EcadPoint
}

/** The context one command step is completed against. */
export interface CadCommandContext {
  /** Layout id the model reports. */
  readonly layout: string
  /** The layer new geometry starts on. */
  readonly layer?: string
  /** Entities the reader has selected. */
  readonly selection: readonly string[]
  /** The block chosen for a block insert, when the tool is `block`. */
  readonly block?: string
}

/** The outcome of one command step. */
export type CadCommandStep =
  | { readonly kind: 'pending'; readonly command: CadCommand }
  | { readonly kind: 'complete'; readonly ops: readonly CadPendingOp[]; readonly command: CadCommand | undefined }
  | { readonly kind: 'form'; readonly form: 'text' | 'block'; readonly point: EcadPoint }
  | { readonly kind: 'rejected'; readonly reasonKey: string }

/** Start a command for one tool, or undefined for a tool that runs on its own. */
export function commandStart(tool: CadToolId): CadCommand | undefined {
  const spec = toolOf(tool)
  if (spec === undefined) return undefined
  if (tool === 'select' || tool === 'pan' || tool === 'zoomWindow' || tool === 'erase' || tool === 'trim' || tool === 'extend') return undefined
  return { tool, points: [] }
}

/** Update only the hover point of an in-progress command. */
export function commandHover(command: CadCommand, cursor: EcadPoint): CadCommand {
  return { ...command, cursor }
}

/**
 * Feed one picked point into the command machine.
 * @param command - the in-progress command.
 * @param point - the picked point in drawing units.
 * @param context - layout, layer and selection.
 * @returns the next step.
 */
export function commandClick(command: CadCommand, point: EcadPoint, context: CadCommandContext): CadCommandStep {
  const rounded: EcadPoint = [roundCoord(point[0]), roundCoord(point[1])]
  const spec = toolOf(command.tool)
  if (spec === undefined) return { kind: 'rejected', reasonKey: 'commandUnknown' }
  const points = [...command.points, rounded]
  if (command.tool === 'text') {
    return points.length >= 1 ? { kind: 'form', form: 'text', point: rounded } : { kind: 'pending', command: { ...command, points, cursor: rounded } }
  }
  if (command.tool === 'block') {
    if (context.block === undefined || context.block === '') return { kind: 'rejected', reasonKey: 'commandNeedsBlock' }
    return { kind: 'form', form: 'block', point: rounded }
  }
  if (spec.group === 'modify') {
    if (command.tool === 'rotate' || command.tool === 'scale' || command.tool === 'offset') {
      const first = points[0] as EcadPoint
      if (points.length < 2) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      // A second click describes the angle/scale/side; numeric entry is the
      // primary path for the factor and the distance.
      switch (command.tool) {
        case 'rotate':
          return finishRotate(points[0] as EcadPoint, angleDegrees(first, rounded), context)
        case 'scale': {
          const base = points[0] as EcadPoint
          const distance = Math.hypot(rounded[0] - base[0], rounded[1] - base[1])
          return distance > 0 ? finishScale(base, distance, context) : { kind: 'pending', command: { ...command, points, cursor: rounded } }
        }
        case 'offset':
          return { kind: 'rejected', reasonKey: 'commandNeedsDistance' }
        default:
          return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      }
    }
    if (context.selection.length === 0) return { kind: 'rejected', reasonKey: 'commandNeedsSelection' }
    if (points.length < 2) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
    const base = points[0] as EcadPoint
    const target = points[1] as EcadPoint
    const dx = target[0] - base[0]
    const dy = target[1] - base[1]
    if (command.tool === 'move') return { kind: 'complete', ops: [{ op: 'move', layout: context.layout, ids: [...context.selection], dx: roundCoord(dx), dy: roundCoord(dy) }], command: undefined }
    if (command.tool === 'copy') return { kind: 'complete', ops: [{ op: 'copy', layout: context.layout, ids: [...context.selection], dx: roundCoord(dx), dy: roundCoord(dy) }], command: undefined }
    if (command.tool === 'mirror') return { kind: 'complete', ops: [{ op: 'mirror', layout: context.layout, ids: [...context.selection], axisA: [roundCoord(base[0]), roundCoord(base[1])], axisB: [roundCoord(target[0]), roundCoord(target[1])] }], command: undefined }
    return { kind: 'rejected', reasonKey: 'commandUnknown' }
  }
  switch (command.tool) {
    case 'line': {
      if (points.length < 2) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      const a = points[0] as EcadPoint
      const b = points[1] as EcadPoint
      // A line chains: the segment completes and the next one starts at its end.
      return { kind: 'complete', ops: [{ op: 'addLine', layout: context.layout, a: [roundCoord(a[0]), roundCoord(a[1])], b: [roundCoord(b[0]), roundCoord(b[1])], ...(context.layer === undefined ? {} : { layer: context.layer }) }], command: { tool: 'line', points: [rounded], cursor: rounded } }
    }
    case 'rectangle': {
      if (points.length < 2) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      const a = points[0] as EcadPoint
      return {
        kind: 'complete',
        ops: [{ op: 'addRectangle', layout: context.layout, corner1: [roundCoord(a[0]), roundCoord(a[1])], corner2: [roundCoord(rounded[0]), roundCoord(rounded[1])], ...(context.layer === undefined ? {} : { layer: context.layer }) }],
        command: undefined,
      }
    }
    case 'circle': {
      if (points.length < 2) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      const center = points[0] as EcadPoint
      const radius = Math.hypot(rounded[0] - center[0], rounded[1] - center[1])
      return radius > 0
        ? {
          kind: 'complete',
          ops: [{ op: 'addCircle', layout: context.layout, center: [roundCoord(center[0]), roundCoord(center[1])], radius: roundCoord(radius), ...(context.layer === undefined ? {} : { layer: context.layer }) }],
          command: undefined,
        }
        : { kind: 'rejected', reasonKey: 'commandNeedsRadius' }
    }
    case 'arc': {
      if (points.length < 3) return { kind: 'pending', command: { ...command, points, cursor: rounded } }
      const arc = arcThrough(points[0] as EcadPoint, points[1] as EcadPoint, points[2] as EcadPoint)
      if (arc === undefined) return { kind: 'rejected', reasonKey: 'commandArcCollinear' }
      const degrees = 180 / Math.PI
      return {
        kind: 'complete',
        ops: [{
          op: 'addArc',
          layout: context.layout,
          center: [roundCoord(arc.center[0]), roundCoord(arc.center[1])],
          radius: roundCoord(arc.radius),
          startAngleDeg: roundCoord(arc.a0 * degrees),
          endAngleDeg: roundCoord(arc.a1 * degrees),
          ...(context.layer === undefined ? {} : { layer: context.layer }),
        }],
        command: undefined,
      }
    }
    case 'polyline':
    case 'revisionCloud':
    case 'leader':
      return { kind: 'pending', command: { ...command, points, cursor: rounded } }
    default:
      return { kind: 'rejected', reasonKey: 'commandUnknown' }
  }
}

/** Complete a multi-point command (Enter or double-click). */
export function commandFinish(command: CadCommand, context: CadCommandContext): CadCommandStep {
  const points = command.points
  switch (command.tool) {
    case 'polyline':
      if (points.length < 2) return { kind: 'rejected', reasonKey: 'commandNeedsPoints' }
      return { kind: 'complete', ops: [{ op: 'addPolyline', layout: context.layout, pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]), ...(context.layer === undefined ? {} : { layer: context.layer }) }], command: undefined }
    case 'revisionCloud':
      if (points.length < 3) return { kind: 'rejected', reasonKey: 'commandNeedsPoints' }
      return { kind: 'complete', ops: [{ op: 'addRevisionCloud', layout: context.layout, pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]), ...(context.layer === undefined ? {} : { layer: context.layer }) }], command: undefined }
    case 'leader':
      if (points.length < 2) return { kind: 'rejected', reasonKey: 'commandNeedsPoints' }
      return { kind: 'complete', ops: [{ op: 'addLeader', layout: context.layout, pts: points.map(point => [roundCoord(point[0]), roundCoord(point[1])]), ...(context.layer === undefined ? {} : { layer: context.layer }) }], command: undefined }
    default:
      // Enter on a click-per-pick command simply stops it.
      return { kind: 'complete', ops: [], command: undefined }
  }
}

/**
 * Feed a typed numeric value into the command machine.
 *
 * A number is the second "point" where a distance/radius/angle/factor defines
 * it: line and polyline use the cursor direction, rotate uses the angle, and
 * scale/offset use their factor/distance directly.
 * @param command - the in-progress command.
 * @param value - the parsed number; degrees for an angle.
 * @param context - layout and selection.
 * @returns the next step.
 */
export function commandNumeric(command: CadCommand, value: number, context: CadCommandContext): CadCommandStep {
  if (!Number.isFinite(value)) return { kind: 'rejected', reasonKey: 'commandInvalidNumber' }
  const spec = toolOf(command.tool)
  if (spec === undefined) return { kind: 'rejected', reasonKey: 'commandUnknown' }
  const last = command.points[command.points.length - 1]
  const direction: EcadPoint = command.cursor ?? (last === undefined ? [1, 0] : [last[0] + 1, last[1]])
  switch (command.tool) {
    case 'line':
    case 'polyline':
    case 'leader':
    case 'revisionCloud': {
      if (last === undefined) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      if (value <= 0) return { kind: 'rejected', reasonKey: 'commandInvalidNumber' }
      const next = pointAtDistance(last, direction, value)
      return commandClick(command, [roundValue(next[0]), roundValue(next[1])], context)
    }
    case 'circle': {
      if (last === undefined) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      if (value <= 0) return { kind: 'rejected', reasonKey: 'commandNeedsRadius' }
      return {
        kind: 'complete',
        ops: [{ op: 'addCircle', layout: context.layout, center: [roundCoord(last[0]), roundCoord(last[1])], radius: roundCoord(value), ...(context.layer === undefined ? {} : { layer: context.layer }) }],
        command: undefined,
      }
    }
    case 'rotate': {
      const center = command.points[0]
      if (center === undefined) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      return finishRotate(center, value, context)
    }
    case 'scale': {
      const base = command.points[0]
      if (base === undefined) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      if (value <= 0) return { kind: 'rejected', reasonKey: 'commandInvalidNumber' }
      return finishScale(base, value, context)
    }
    case 'offset': {
      if (command.points.length < 1) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      if (value <= 0) return { kind: 'rejected', reasonKey: 'commandInvalidNumber' }
      if (context.selection.length === 0) return { kind: 'rejected', reasonKey: 'commandNeedsSelection' }
      const side = command.points[0] as EcadPoint
      // The engine offsets one entity per operation; a multi-selection becomes
      // one operation per selected entity against the same side point/distance.
      return {
        kind: 'complete',
        ops: context.selection.map(id => ({ op: 'offset', layout: context.layout, id, distance: roundCoord(value), side: [roundCoord(side[0]), roundCoord(side[1])] })),
        command: undefined,
      }
    }
    case 'move':
    case 'copy': {
      const base = command.points[0]
      if (base === undefined) return { kind: 'rejected', reasonKey: 'commandNeedsPoint' }
      if (context.selection.length === 0) return { kind: 'rejected', reasonKey: 'commandNeedsSelection' }
      if (value <= 0) return { kind: 'rejected', reasonKey: 'commandInvalidNumber' }
      const target = pointAtDistance(base, direction, value)
      const dx = roundValue(target[0] - base[0])
      const dy = roundValue(target[1] - base[1])
      if (command.tool === 'move') return { kind: 'complete', ops: [{ op: 'move', layout: context.layout, ids: [...context.selection], dx, dy }], command: undefined }
      return { kind: 'complete', ops: [{ op: 'copy', layout: context.layout, ids: [...context.selection], dx, dy }], command: undefined }
    }
    default:
      return { kind: 'rejected', reasonKey: 'commandNoNumeric' }
  }
}

/** Complete a rotate command. */
function finishRotate(center: EcadPoint, angle: number, context: CadCommandContext): CadCommandStep {
  if (context.selection.length === 0) return { kind: 'rejected', reasonKey: 'commandNeedsSelection' }
  return { kind: 'complete', ops: [{ op: 'rotate', layout: context.layout, ids: [...context.selection], center: [roundCoord(center[0]), roundCoord(center[1])], angleDeg: roundCoord(angle) }], command: undefined }
}

/** Complete a scale command. */
function finishScale(base: EcadPoint, factor: number, context: CadCommandContext): CadCommandStep {
  if (context.selection.length === 0) return { kind: 'rejected', reasonKey: 'commandNeedsSelection' }
  return {
    kind: 'complete',
    ops: [{ op: 'scale', layout: context.layout, ids: [...context.selection], center: [roundCoord(base[0]), roundCoord(base[1])], factor: roundCoord(factor) }],
    command: undefined,
  }
}

/** The circle through three points, with the arc swept from the first to the third. */
export function arcThrough(a: EcadPoint, b: EcadPoint, c: EcadPoint): { readonly center: EcadPoint; readonly radius: number; readonly a0: number; readonly a1: number } | undefined {
  const ax = a[0]; const ay = a[1]
  const bx = b[0]; const by = b[1]
  const cx = c[0]; const cy = c[1]
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
  if (Math.abs(d) < 1e-12) return undefined
  const a2 = ax * ax + ay * ay
  const b2 = bx * bx + by * by
  const c2 = cx * cx + cy * cy
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d
  const center: EcadPoint = [ux, uy]
  const radius = Math.hypot(ax - ux, ay - uy)
  const angleOf = (point: EcadPoint): number => Math.atan2(point[1] - uy, point[0] - ux)
  const start = angleOf(a)
  const endAngle = angleOf(c)
  // The arc goes through `b`: sweep from a to c in the direction that contains b.
  const normalise = (value: number): number => ((value % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)
  let sweep = normalise(endAngle - start)
  const bSweep = normalise(angleOf(b) - start)
  if (bSweep > sweep) {
    // The short way round misses b: take the long way instead, expressed as an
    // end angle below the start (the renderer adds a full turn).
    sweep -= Math.PI * 2
  }
  return { center: [roundCoord(ux), roundCoord(uy)], radius, a0: start, a1: start + sweep }
}

/* ------------------------------------------------------------------ *
 * Undo/redo over the staged draft
 * ------------------------------------------------------------------ */

/** The staged draft and its undo/redo history, as one immutable state. */
export interface CadDraftState {
  readonly ops: readonly EcadStagedOp[]
  readonly past: readonly (readonly EcadStagedOp[])[]
  readonly future: readonly (readonly EcadStagedOp[])[]
}

/** The most undo steps the pane keeps. */
export const HISTORY_LIMIT = 200

/** A fresh, empty draft. */
export const EMPTY_DRAFT_STATE: CadDraftState = { ops: [], past: [], future: [] }

/**
 * Record a new op list, remembering the previous list for undo.
 * @param state - the draft state.
 * @param next - the next op list.
 * @returns the next state; identity is preserved when nothing changed.
 */
export function draftCommit(state: CadDraftState, next: readonly EcadStagedOp[]): CadDraftState {
  if (next === state.ops) return state
  const past = [...state.past, state.ops]
  if (past.length > HISTORY_LIMIT) past.splice(0, past.length - HISTORY_LIMIT)
  return { ops: next, past, future: [] }
}

/** Append one staged op. */
export function draftAdd(state: CadDraftState, op: EcadStagedOp): CadDraftState {
  return draftCommit(state, [...state.ops, op])
}

/** Append several staged ops. */
export function draftAddMany(state: CadDraftState, ops: readonly EcadStagedOp[]): CadDraftState {
  if (ops.length === 0) return state
  return draftCommit(state, [...state.ops, ...ops])
}

/** Remove one staged op by its client key. */
export function draftRemove(state: CadDraftState, key: string): CadDraftState {
  const next = state.ops.filter(item => item.key !== key)
  return next.length === state.ops.length ? state : draftCommit(state, next)
}

/** Remove everything, including its history. */
export function draftClear(state: CadDraftState): CadDraftState {
  if (state.ops.length === 0 && state.past.length === 0) return state
  return { ops: [], past: [...state.past, state.ops].slice(-HISTORY_LIMIT), future: [] }
}

/** Undo one staging step. */
export function draftUndo(state: CadDraftState): CadDraftState {
  const previous = state.past[state.past.length - 1]
  if (previous === undefined) return state
  return { ops: previous, past: state.past.slice(0, -1), future: [state.ops, ...state.future] }
}

/** Redo one staging step. */
export function draftRedo(state: CadDraftState): CadDraftState {
  const next = state.future[0]
  if (next === undefined) return state
  return { ops: next, past: [...state.past, state.ops], future: state.future.slice(1) }
}

/** Whether undo has a step. */
export function draftCanUndo(state: CadDraftState): boolean {
  return state.past.length > 0
}

/** Whether redo has a step. */
export function draftCanRedo(state: CadDraftState): boolean {
  return state.future.length > 0
}

/** Apply reset: the draft is empty and its history is gone. */
export function draftReset(): CadDraftState {
  return EMPTY_DRAFT_STATE
}

/* ------------------------------------------------------------------ *
 * Tool availability + pending-op notice keys
 * ------------------------------------------------------------------ */

/** The localized notice used when a wired operation is not in the pinned engine. */
export const ENGINE_OP_PENDING_KEY = 'engineOpPending'

/** The locale keys a command rejection may report. */
export function rejectionKey(reasonKey: string): string {
  return reasonKey
}
