/**
 * Validating and applying staged edit operations to a drawing.
 *
 * Every op is checked against the actual database before anything is written:
 * the layout, the entity id, the layer name, the block name and every number.
 * Applying then runs the whole list inside one `runDatabaseEdit`, so a draft
 * either lands as a unit or is reported as a validation failure, never as a
 * half-applied list with no audit trail.
 *
 * Ids are the ids the render model carries. Flattened block content is rejected
 * for direct edit — it belongs to the block definition — and attributes are
 * reached through their insert via `setAttribute`.
 *
 * @module dsh-engineering-ecad/engine/ops
 */

import {
  AcCmColor,
  AcDbArc,
  AcDbBlockReference,
  AcDbBlockTableRecord,
  AcDbCircle,
  AcDbEllipse,
  AcDbLayerTableRecord,
  AcDbLine,
  AcDbMText,
  AcDbPoint,
  AcDbPolyline,
  AcDbSolid,
  AcDbText,
  AcGeMatrix3d,
  AcGePoint2d,
  AcGePoint3d,
  AcGeVector3d
} from '@mlightcad/data-model'
import type { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'
import type { EcadDraft, EcadOp, EcadPoint } from './types.ts'
import type { OpenedSheet } from './parse.ts'
import { EcadError } from './errors.ts'
import {
  axisAngle,
  distance,
  GEOM_EPSILON,
  lineIntersection,
  lineOffsetVector,
  mirroredArcAngles,
  mirroredEllipseParams,
  onSegment,
  radialOffsetSign,
  reflectAngle,
  reflectPoint,
  wrapAngle2Pi
} from './ops-geom.ts'
import type { Segment } from './ops-geom.ts'

/** One rejected operation. */
export interface EcadOpError {
  /** Zero-based index of the op in the draft. */
  readonly opIndex: number
  /** What is wrong. */
  readonly message: string
  /** What to change to make the op valid. */
  readonly fix: string
}

/** Result of {@link validateOps}. */
export interface EcadOpsValidation {
  readonly ok: boolean
  readonly errors: readonly EcadOpError[]
  /** Notes that do not block the apply, for example a layer that will be created. */
  readonly notes: readonly string[]
}

/** Result of {@link applyOps}. */
export interface EcadOpsResult {
  /** Per operation kind, the number of changes the ops asked for. */
  readonly changes: Readonly<Record<string, number>>
  /** Handles of every entity created, changed or erased, in application order. */
  readonly touchedIds: readonly string[]
}

/** One layout the drawing exposes. */
interface LayoutSlot {
  readonly layoutId: string
  readonly record: AcDbBlockTableRecord
}

/** An entity reachable by its render-model id. */
interface IdSlot {
  readonly entity: AcDbEntity
  readonly record: AcDbBlockTableRecord
  readonly layoutId: string
}

/** A drawing indexed for validation and application. */
interface DrawingIndex {
  readonly layouts: Map<string, LayoutSlot>
  readonly entities: Map<string, IdSlot>
}

/** DXF layer-name characters AutoCAD refuses. */
const INVALID_LAYER_CHARS = /[<>/\\":;?*|,=`]/

/**
 * Entity kinds the modify operations transform directly.
 *
 * The lists are what validation checks, so the error a caller sees and the code
 * that runs cannot drift: `scale` and `mirror` name their supported kinds here,
 * and every other kind is refused by name with a fix instead of being silently
 * left alone. Approximated geometry (HATCH, SPLINE, DIMENSION, VIEWPORT) is
 * absent on purpose: its editable form is not carried as entity geometry.
 */
const SCALABLE_KINDS: readonly string[] = ['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'POINT', 'SOLID', 'TRACE', 'LEADER', 'TEXT', 'MTEXT', 'INSERT']

/** Entity kinds `mirror` can reflect; a block reference would need a reflected insert transform. */
const MIRRORABLE_KINDS: readonly string[] = ['LINE', 'LWPOLYLINE', 'CIRCLE', 'ARC', 'ELLIPSE', 'POINT', 'SOLID', 'TRACE', 'LEADER', 'TEXT', 'MTEXT']

/** Entity kinds `offset` supports. */
const OFFSET_KINDS: readonly string[] = ['LINE', 'CIRCLE', 'ARC']

/** Op kinds in output order. */
const OP_KINDS: readonly string[] = [
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
  'addLayer',
  'setLayerColor',
  'renameLayer',
  'erase'
]

/**
 * A layer-table operation.
 *
 * Layers are shared by every layout, so these operations have no `layout` field;
 * validation and application treat them apart from the entity operations.
 */
type LayerOp = Extract<EcadOp, { op: 'addLayer' | 'setLayerColor' | 'renameLayer' }>

/**
 * True for an operation that edits a symbol table rather than entity geometry.
 *
 * @param op - staged operation.
 */
function isLayerOp(op: EcadOp): op is LayerOp {
  return op.op === 'addLayer' || op.op === 'setLayerColor' || op.op === 'renameLayer'
}

/**
 * Validate a draft against the opened drawing without changing it.
 *
 * @param opened - the drawing the draft applies to.
 * @param draft - the draft, or a bare op list.
 * @returns `ok` plus one error per rejected op and non-blocking notes.
 */
export function validateOps(opened: OpenedSheet, draft: EcadDraft | readonly EcadOp[]): EcadOpsValidation {
  const ops = opsOf(draft)
  const index = indexDrawing(opened.db)
  const layers = new Set([...opened.db.tables.layerTable.newIterator()].map(record => record.name.toUpperCase()))
  const blocks = new Set<string>()
  for (const record of opened.db.tables.blockTable.newIterator()) {
    if (record.isModelSapce === true || record.isPaperSapce === true) continue
    blocks.add(record.name)
  }
  const errors: EcadOpError[] = []
  const notes: string[] = []
  const notedLayers = new Set<string>()
  const notedBlocks = new Set<string>()
  // Layers that will exist when the op runs: the drawing's own layers plus the
  // ones an earlier operation in the same draft creates or renames. Layer
  // operations must see a previous addLayer/renameLayer of the same draft.
  const plannedLayers = new Set(layers)

  const error = (opIndex: number, message: string, fix: string): void => {
    errors.push({ opIndex, message, fix })
  }

  const checkLayout = (opIndex: number, op: EcadOp): boolean => {
    if (typeof (op as { layout?: unknown }).layout !== 'string' || !index.layouts.has((op as { layout: string }).layout)) {
      error(opIndex, `layout ${JSON.stringify((op as { layout?: unknown }).layout)} does not exist`, `Use one of: ${[...index.layouts.keys()].join(', ')}.`)
      return false
    }
    return true
  }

  const checkLayer = (opIndex: number, layer: string | undefined): boolean => {
    if (layer === undefined) return true
    if (typeof layer !== 'string' || layer.trim().length === 0) {
      error(opIndex, 'layer name is empty', 'Pass a layer name of at most 255 characters.')
      return false
    }
    if (layer.length > 255 || INVALID_LAYER_CHARS.test(layer)) {
      error(opIndex, `layer ${JSON.stringify(layer)} is not a legal DXF layer name`, 'Avoid the characters < > / \\ " : ; ? * | , = ` and keep the name under 256 characters.')
      return false
    }
    if (!layers.has(layer.toUpperCase()) && !notedLayers.has(layer.toUpperCase())) {
      notedLayers.add(layer.toUpperCase())
      // An add* op with a layer the drawing does not have creates it, so a later
      // layer operation in the same draft can rely on it, just as apply does.
      plannedLayers.add(layer.toUpperCase())
      notes.push(`layer ${layer} does not exist and will be created`)
    }
    return true
  }

  const checkNumbers = (opIndex: number, values: ReadonlyArray<number | undefined>, what: string): boolean => {
    for (const value of values) {
      if (value === undefined) continue
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        error(opIndex, `${what} must be finite numbers`, 'Pass finite drawing-unit coordinates.')
        return false
      }
    }
    return true
  }

  const requireNumbers = (opIndex: number, values: ReadonlyArray<number | undefined>, what: string): boolean => {
    for (const value of values) {
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        error(opIndex, `${what} must be present and finite`, 'Pass finite drawing-unit coordinates; the field is required for this operation.')
        return false
      }
    }
    return true
  }

  const checkPoints = (opIndex: number, points: readonly EcadPoint[] | undefined, minimum: number): boolean => {
    if (!Array.isArray(points) || points.length < minimum) {
      error(opIndex, `expected at least ${minimum} point(s), got ${Array.isArray(points) ? points.length : 0}`, `Pass ${minimum} or more points as [x, y] pairs.`)
      return false
    }
    for (const point of points) {
      if (!Array.isArray(point) || point.length < 2 || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
        error(opIndex, 'a point is not a finite [x, y] pair', 'Pass finite [x, y] drawing-unit coordinates.')
        return false
      }
    }
    return true
  }

  const checkId = (opIndex: number, id: string): IdSlot | undefined => {
    if (typeof id !== 'string' || id.length === 0) {
      error(opIndex, 'entity id is empty', 'Pass the id the render model carries for the entity.')
      return undefined
    }
    if (id.includes('/')) {
      error(opIndex, `id ${JSON.stringify(id)} refers to flattened block content`, 'Edit the block definition, or use setAttribute with the owning insert id; geometry inside a block cannot be edited in place.')
      return undefined
    }
    const slot = index.entities.get(id)
    if (!slot) {
      error(opIndex, `entity id ${JSON.stringify(id)} does not exist in this drawing`, 'Re-read the sheet model and use an id it lists.')
      return undefined
    }
    return slot
  }

  const checkDrawingLayer = (opIndex: number, name: unknown): boolean => {
    if (typeof name !== 'string' || name.trim().length === 0) {
      error(opIndex, 'layer name is empty', 'Pass a layer name of at most 255 characters.')
      return false
    }
    if (name.length > 255 || INVALID_LAYER_CHARS.test(name)) {
      error(opIndex, `layer ${JSON.stringify(name)} is not a legal DXF layer name`, 'Avoid the characters < > / \\ " : ; ? * | , = ` and keep the name under 256 characters.')
      return false
    }
    return true
  }

  const checkAciColor = (opIndex: number, color: unknown, required: boolean): boolean => {
    if (color === undefined && !required) return true
    if (typeof color !== 'number' || !Number.isInteger(color) || color < 1 || color > 255) {
      error(opIndex, `layer colour ${JSON.stringify(color)} is not an ACI index`, 'Pass an AutoCAD Color Index from 1 to 255 (7 is the default foreground colour).')
      return false
    }
    return true
  }

  const checkKind = (opIndex: number, slot: IdSlot, supported: readonly string[], operation: string, fix: string): string => {
    const type = dxfTypeNameOf(slot.entity)
    if (!supported.includes(type)) {
      error(opIndex, `${operation} cannot edit a ${type} entity`, fix)
    }
    return type
  }

  for (let opIndex = 0; opIndex < ops.length; opIndex += 1) {
    const op = ops[opIndex] as EcadOp | undefined
    if (!op || typeof op !== 'object') {
      error(opIndex, 'operation is not an object', 'Each operation must be a JSON object with an "op" field.')
      continue
    }
    const kind = (op as { op?: unknown }).op
    if (typeof kind !== 'string' || !OP_KINDS.includes(kind)) {
      error(opIndex, `unknown operation ${JSON.stringify(kind)}`, `Supported operations: ${OP_KINDS.join(', ')}.`)
      continue
    }
    if (!isLayerOp(op) && !checkLayout(opIndex, op)) continue
    switch (op.op) {
      case 'addText': {
        if (typeof op.text !== 'string' || op.text.trim().length === 0) {
          error(opIndex, 'addText needs non-empty text', 'Pass the text to draw.')
          break
        }
        if (!checkPoints(opIndex, [op.p], 1)) break
        if (!requireNumbers(opIndex, [op.height], 'height')) break
        checkNumbers(opIndex, [op.rotation], 'rotation')
        if (!(op.height > 0)) error(opIndex, 'addText height must be greater than 0', 'Pass a positive text height in drawing units.')
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addLine': {
        if (!checkPoints(opIndex, [op.a, op.b], 2)) break
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addPolyline': {
        if (!checkPoints(opIndex, op.pts, 2)) break
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addRectangle': {
        if (!checkPoints(opIndex, [op.corner1, op.corner2], 2)) break
        if (op.corner1[0] === op.corner2[0] && op.corner1[1] === op.corner2[1]) {
          error(opIndex, 'addRectangle corners are the same point', 'Pass two opposite corners.')
          break
        }
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addRevisionCloud': {
        if (!checkPoints(opIndex, op.pts, 2)) break
        checkNumbers(opIndex, [op.bulge], 'bulge')
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addLeader': {
        if (!checkPoints(opIndex, op.pts, 2)) break
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addBlock': {
        if (typeof op.block !== 'string' || op.block.length === 0) {
          error(opIndex, 'addBlock needs a block name', 'Pass the name of an existing block definition.')
          break
        }
        if (!blocks.has(op.block)) {
          error(opIndex, `block ${JSON.stringify(op.block)} does not exist in this drawing`, `Use one of the drawing's blocks: ${[...blocks].slice(0, 20).join(', ')}${blocks.size > 20 ? ', …' : ''}.`)
          break
        }
        if (!notedBlocks.has(op.block)) {
          notedBlocks.add(op.block)
          notes.push(`addBlock uses existing block ${op.block}`)
        }
        if (!checkPoints(opIndex, [op.p], 1)) break
        checkNumbers(opIndex, [op.rotation, op.scale?.[0], op.scale?.[1]], 'rotation and scale')
        checkLayer(opIndex, op.layer)
        break
      }
      case 'setText': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        if (typeof op.text !== 'string') {
          error(opIndex, 'setText needs a text string', 'Pass the replacement text.')
          break
        }
        const type = dxfTypeNameOf(slot.entity)
        if (type !== 'TEXT' && type !== 'MTEXT' && type !== 'ATTDEF') {
          error(opIndex, `setText cannot edit a ${type} entity`, 'setText edits TEXT, MTEXT and ATTDEF; use setAttribute for an attribute value.')
        }
        break
      }
      case 'setAttribute': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        if (dxfTypeNameOf(slot.entity) !== 'INSERT') {
          error(opIndex, `setAttribute needs an INSERT id, got ${dxfTypeNameOf(slot.entity)}`, 'Pass the id of the block reference that owns the attribute.')
          break
        }
        if (typeof op.tag !== 'string' || op.tag.length === 0) {
          error(opIndex, 'setAttribute needs an attribute tag', 'Pass the attribute tag as the drawing stores it.')
          break
        }
        if (typeof op.value !== 'string') {
          error(opIndex, 'setAttribute needs a value string', 'Pass the new attribute value, empty string to clear it.')
          break
        }
        const insert = slot.entity as AcDbBlockReference
        const tags = [...insert.attributeIterator()].map(attribute => attribute.tag)
        if (!tags.includes(op.tag)) {
          error(opIndex, `insert ${JSON.stringify(op.id)} has no attribute ${JSON.stringify(op.tag)}`, `Available tags: ${tags.slice(0, 20).join(', ')}${tags.length > 20 ? ', …' : ''}.`)
        }
        break
      }
      case 'setLayer': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        checkLayer(opIndex, op.layer)
        break
      }
      case 'move': {
        if (!checkIds(opIndex, op.ids, checkId, error)) break
        requireNumbers(opIndex, [op.dx, op.dy], 'dx and dy')
        break
      }
      case 'rotate': {
        if (!checkIds(opIndex, op.ids, checkId, error)) break
        if (!checkPoints(opIndex, [op.center], 1)) break
        requireNumbers(opIndex, [op.angleDeg], 'angleDeg')
        break
      }
      case 'erase': {
        checkIds(opIndex, op.ids, checkId, error)
        break
      }
      case 'addCircle': {
        if (!checkPoints(opIndex, [op.center], 1)) break
        if (!requireNumbers(opIndex, [op.radius], 'radius')) break
        if (!(op.radius > 0)) {
          error(opIndex, 'addCircle radius must be greater than 0', 'Pass a positive radius in drawing units.')
          break
        }
        checkLayer(opIndex, op.layer)
        break
      }
      case 'addArc': {
        if (!checkPoints(opIndex, [op.center], 1)) break
        if (!requireNumbers(opIndex, [op.radius, op.startAngleDeg, op.endAngleDeg], 'radius and angles')) break
        if (!(op.radius > 0)) {
          error(opIndex, 'addArc radius must be greater than 0', 'Pass a positive radius in drawing units.')
          break
        }
        const sweep = wrapAngle2Pi(((op.endAngleDeg - op.startAngleDeg) * Math.PI) / 180)
        if (sweep <= GEOM_EPSILON || Math.PI * 2 - sweep <= GEOM_EPSILON) {
          error(opIndex, 'addArc start and end angles describe no sweep', 'Pass two angles that differ; use addCircle for a full circle.')
          break
        }
        checkLayer(opIndex, op.layer)
        break
      }
      case 'copy': {
        if (!checkIds(opIndex, op.ids, checkId, error)) break
        requireNumbers(opIndex, [op.dx, op.dy], 'dx and dy')
        break
      }
      case 'scale': {
        if (!checkIds(opIndex, op.ids, checkId, error)) break
        if (!checkPoints(opIndex, [op.center], 1)) break
        if (!requireNumbers(opIndex, [op.factor], 'factor')) break
        if (!(op.factor > 0)) {
          error(opIndex, 'scale factor must be greater than 0', 'Pass a positive uniform scale factor; use mirror to reverse geometry.')
          break
        }
        for (const id of op.ids) {
          const slot = index.entities.get(id)
          if (slot) checkKind(opIndex, slot, SCALABLE_KINDS, 'scale', 'Scale LINE, LWPOLYLINE, CIRCLE, ARC, ELLIPSE, POINT, SOLID, TRACE, LEADER, TEXT, MTEXT and INSERT entities; a HATCH, SPLINE, DIMENSION or VIEWPORT has no editable geometry this operation can scale.')
        }
        break
      }
      case 'mirror': {
        if (!checkIds(opIndex, op.ids, checkId, error)) break
        if (!checkPoints(opIndex, [op.axisA, op.axisB], 2)) break
        if (distance(op.axisA, op.axisB) <= GEOM_EPSILON) {
          error(opIndex, 'mirror axis points are the same point', 'Pass two distinct points on the mirror line.')
          break
        }
        if (op.eraseSource !== undefined && typeof op.eraseSource !== 'boolean') {
          error(opIndex, 'mirror eraseSource must be true or false', 'Pass eraseSource: true to remove the source, or omit it to keep a mirrored copy.')
          break
        }
        for (const id of op.ids) {
          const slot = index.entities.get(id)
          if (slot) checkKind(opIndex, slot, MIRRORABLE_KINDS, 'mirror', 'Mirror LINE, LWPOLYLINE, CIRCLE, ARC, ELLIPSE, POINT, SOLID, TRACE, LEADER, TEXT and MTEXT entities; a block reference would need a reflected insert transform this writer does not carry, so mirror the block geometry instead.')
        }
        break
      }
      case 'offset': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        if (!requireNumbers(opIndex, [op.distance], 'distance')) break
        if (!(op.distance > 0)) {
          error(opIndex, 'offset distance must be greater than 0', 'Pass a positive distance in drawing units.')
          break
        }
        if (op.side !== undefined && !checkPoints(opIndex, [op.side], 1)) break
        const type = checkKind(opIndex, slot, OFFSET_KINDS, 'offset', 'Offset a LINE, CIRCLE or ARC; other entity kinds have no supported offset form in this engine.')
        if (!OFFSET_KINDS.includes(type)) break
        if (type === 'LINE') {
          const segment = lineEndpoints(slot.entity)
          if (!segment || distance(segment.a, segment.b) <= GEOM_EPSILON) {
            error(opIndex, 'offset cannot offset a zero-length line', 'Pass a line whose endpoints differ.')
            break
          }
          if (op.side === undefined) {
            error(opIndex, 'offset of a LINE needs a side point', 'Pass side as a point on the side the parallel line must land.')
            break
          }
          if (!lineOffsetVector(segment.a, segment.b, op.side, op.distance)) {
            error(opIndex, 'offset side point lies on the line', 'Pass a side point off the line so the offset direction is unambiguous.')
            break
          }
        } else {
          const geometry = circularGeometryOf(slot.entity)
          if (!geometry) {
            error(opIndex, `offset cannot read the geometry of a ${type} entity`, 'Re-read the sheet model and retry; the entity carries no usable circle or arc geometry.')
            break
          }
          if (op.side !== undefined) {
            const sign = radialOffsetSign(geometry.center, geometry.radius, op.side)
            if (sign === undefined) {
              error(opIndex, 'offset side point lies on the circle', 'Pass a side point off the circumference so inward or outward is unambiguous.')
              break
            }
            if (geometry.radius + sign * op.distance <= GEOM_EPSILON) {
              error(opIndex, `offset distance ${op.distance} is not smaller than the radius ${geometry.radius}`, 'Pass a distance smaller than the radius to offset inward, or pick a side outside the circle.')
              break
            }
          }
        }
        break
      }
      case 'trim': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        const boundarySlot = checkId(opIndex, op.boundaryId)
        if (!boundarySlot) break
        if (op.id === op.boundaryId) {
          error(opIndex, 'trim needs a boundary entity different from the line being trimmed', 'Pass the id of the cutting edge.')
          break
        }
        if (op.pick !== undefined && !checkPoints(opIndex, [op.pick], 1)) break
        const target = lineEndpoints(slot.entity)
        if (!target) {
          error(opIndex, `trim only supports LINE entities, got ${dxfTypeNameOf(slot.entity)}`, 'Trim a LINE against a LINE boundary; trim another kind in the source application.')
          break
        }
        const edge = lineEndpoints(boundarySlot.entity)
        if (!edge) {
          error(opIndex, `trim boundary must be a LINE, got ${dxfTypeNameOf(boundarySlot.entity)}`, 'Pass the id of a LINE boundary.')
          break
        }
        const hit = lineIntersection(target.a, target.b, edge.a, edge.b)
        if (!hit) {
          error(opIndex, 'trim target and boundary do not intersect', 'Move the boundary across the line, or use extend when they only meet when extended.')
          break
        }
        if (!onSegment(hit.u)) {
          error(opIndex, 'the boundary does not cross the line between the boundary endpoints', 'Pass a boundary that spans the intersection point.')
          break
        }
        if (hit.t < -GEOM_EPSILON || hit.t > 1 + GEOM_EPSILON) {
          error(opIndex, 'the boundary does not cross the line between its endpoints', 'Pass a boundary that crosses the line, or use extend when the line stops short.')
          break
        }
        if (hit.t <= GEOM_EPSILON || hit.t >= 1 - GEOM_EPSILON) {
          error(opIndex, 'trim intersection is at an endpoint of the line', 'Pass a boundary that crosses the line away from both ends, or use extend for a line that stops short.')
          break
        }
        break
      }
      case 'extend': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        const boundarySlot = checkId(opIndex, op.boundaryId)
        if (!boundarySlot) break
        if (op.id === op.boundaryId) {
          error(opIndex, 'extend needs a boundary entity different from the line being extended', 'Pass the id of the boundary line.')
          break
        }
        const target = lineEndpoints(slot.entity)
        if (!target) {
          error(opIndex, `extend only supports LINE entities, got ${dxfTypeNameOf(slot.entity)}`, 'Extend a LINE to a LINE boundary; extend another kind in the source application.')
          break
        }
        const edge = lineEndpoints(boundarySlot.entity)
        if (!edge) {
          error(opIndex, `extend boundary must be a LINE, got ${dxfTypeNameOf(boundarySlot.entity)}`, 'Pass the id of a LINE boundary.')
          break
        }
        const hit = lineIntersection(target.a, target.b, edge.a, edge.b)
        if (!hit) {
          error(opIndex, 'extend target and boundary are parallel', 'Pass a boundary that crosses the line direction.')
          break
        }
        if (!onSegment(hit.u)) {
          error(opIndex, 'the line extension does not reach the boundary between its endpoints', 'Pass a boundary that spans the point the line would reach when extended.')
          break
        }
        if (hit.t >= -GEOM_EPSILON && hit.t <= 1 + GEOM_EPSILON) {
          error(opIndex, 'the line already reaches the boundary', 'Use trim to cut it back, or pass a boundary beyond the line end.')
          break
        }
        break
      }
      case 'setLine': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        const type = checkKind(opIndex, slot, ['LINE'], 'setLine', 'Pass a LINE id; use setPolyline for an LWPOLYLINE.')
        if (type !== 'LINE') break
        if (!checkPoints(opIndex, [op.a, op.b], 2)) break
        if (distance(op.a, op.b) <= GEOM_EPSILON) {
          error(opIndex, 'setLine endpoints are the same point', 'Pass two distinct endpoints; a zero-length line draws nothing.')
        }
        break
      }
      case 'setPolyline': {
        const slot = checkId(opIndex, op.id)
        if (!slot) break
        const type = checkKind(opIndex, slot, ['LWPOLYLINE'], 'setPolyline', 'Pass an LWPOLYLINE id; legacy POLYLINE and other kinds are not editable with this operation.')
        if (type !== 'LWPOLYLINE') break
        if (!checkPoints(opIndex, op.pts, 2)) break
        if (op.closed !== undefined && typeof op.closed !== 'boolean') {
          error(opIndex, 'setPolyline closed must be true or false', 'Pass closed: true to close the polyline, or omit it to leave it open.')
        }
        break
      }
      case 'addLayer': {
        if (!checkDrawingLayer(opIndex, op.name)) break
        if (plannedLayers.has(op.name.toUpperCase())) {
          error(opIndex, `layer ${JSON.stringify(op.name)} already exists`, 'Pass a new layer name, or drop addLayer and reuse the existing layer.')
          break
        }
        if (!checkAciColor(opIndex, op.color, false)) break
        plannedLayers.add(op.name.toUpperCase())
        notes.push(`layer ${op.name} will be created`)
        break
      }
      case 'setLayerColor': {
        if (!checkDrawingLayer(opIndex, op.name)) break
        if (!plannedLayers.has(op.name.toUpperCase())) {
          error(opIndex, `layer ${JSON.stringify(op.name)} does not exist`, `Use one of: ${[...plannedLayers].sort().slice(0, 20).join(', ')}${plannedLayers.size > 20 ? ', …' : ''}.`)
          break
        }
        checkAciColor(opIndex, op.color, true)
        break
      }
      case 'renameLayer': {
        if (!checkDrawingLayer(opIndex, op.from)) break
        if (!checkDrawingLayer(opIndex, op.to)) break
        if (!plannedLayers.has(op.from.toUpperCase())) {
          error(opIndex, `layer ${JSON.stringify(op.from)} does not exist`, `Use one of: ${[...plannedLayers].sort().slice(0, 20).join(', ')}${plannedLayers.size > 20 ? ', …' : ''}.`)
          break
        }
        if (op.from.toUpperCase() === '0') {
          error(opIndex, 'layer 0 cannot be renamed', 'Pass a layer other than 0; the DXF format requires layer 0.')
          break
        }
        if (plannedLayers.has(op.to.toUpperCase())) {
          error(opIndex, `layer ${JSON.stringify(op.to)} already exists`, 'Pass a name no layer uses.')
          break
        }
        plannedLayers.delete(op.from.toUpperCase())
        plannedLayers.add(op.to.toUpperCase())
        notes.push(`layer ${op.from} will be renamed to ${op.to}`)
        break
      }
    }
  }

  return { ok: errors.length === 0, errors, notes }
}

/**
 * Apply a validated op list to the drawing.
 *
 * @param opened - the drawing to edit; its database is mutated in place.
 * @param ops - the operations, or a draft carrying them.
 * @returns per-kind change counters and the handles that were touched.
 * @throws EcadError `INVALID_DRAFT` when validation fails; nothing is applied then.
 */
export function applyOps(opened: OpenedSheet, ops: EcadDraft | readonly EcadOp[]): EcadOpsResult {
  const opList = opsOf(ops)
  const validation = validateOps(opened, opList)
  if (!validation.ok) {
    throw new EcadError('INVALID_DRAFT', `the draft has ${validation.errors.length} invalid operation(s): ${validation.errors.map(item => `#${item.opIndex} ${item.message}`).join('; ')}`, 'Fix the listed operations (validateOps reports a fix for each) and apply again; nothing was written.')
  }
  const db = opened.db
  const index = indexDrawing(db)
  const layers = new Set([...db.tables.layerTable.newIterator()].map(record => record.name.toUpperCase()))
  const changes: Record<string, number> = {}
  const touchedIds: string[] = []
  const count = (kind: string, amount: number): void => {
    changes[kind] = (changes[kind] ?? 0) + amount
  }
  const ensureLayer = (name: string | undefined): void => {
    if (!name || name.length === 0) return
    if (layers.has(name.toUpperCase())) return
    const record = new AcDbLayerTableRecord({ name })
    db.tables.layerTable.add(record)
    layers.add(name.toUpperCase())
  }
  const push = (entity: AcDbEntity): void => {
    touchedIds.push(String(entity.objectId ?? ''))
  }

  db.runDatabaseEdit('ecad applyOps', () => {
    for (const op of opList) {
      if (isLayerOp(op)) {
        switch (op.op) {
          case 'addLayer': {
            const record = new AcDbLayerTableRecord({ name: op.name })
            record.color = aciColor(op.color ?? 7)
            db.tables.layerTable.add(record)
            layers.add(op.name.toUpperCase())
            count('addLayer', 1)
            break
          }
          case 'setLayerColor': {
            const record = findLayerRecord(db, op.name)
            if (!record) continue
            // A symbol table record mutated inside a transaction must be opened
            // for write through it, or the change is not tracked and the model
            // refuses the assignment.
            const writable = db.openObjectForWrite<AcDbLayerTableRecord>(record.objectId)
            if (!writable) continue
            writable.color = aciColor(op.color)
            count('setLayerColor', 1)
            break
          }
          case 'renameLayer': {
            const record = findLayerRecord(db, op.from)
            if (!record) continue
            const replacement = copyLayerRecord(record, op.to)
            // Add the replacement before removing the old record so a table
            // implementation that keeps one record per name never has a gap.
            db.tables.layerTable.add(replacement)
            db.tables.layerTable.remove(record.name)
            const fromUpper = op.from.toUpperCase()
            // Every entity that referenced the old layer name moves with it,
            // including geometry inside block definitions; otherwise the writer
            // emits entities that point at a layer the table no longer holds.
            for (const record2 of db.tables.blockTable.newIterator()) {
              for (const entity of record2.newIterator()) {
                if (String(entity.layer ?? '').toUpperCase() === fromUpper) entity.layer = op.to
              }
            }
            if (String(db.clayer ?? '').toUpperCase() === fromUpper) db.clayer = op.to
            layers.delete(fromUpper)
            layers.add(op.to.toUpperCase())
            count('renameLayer', 1)
            break
          }
        }
        continue
      }
      const layout = index.layouts.get(op.layout)
      if (!layout) continue
      switch (op.op) {
        case 'addText': {
          ensureLayer(op.layer)
          const text = new AcDbText()
          text.textString = op.text
          text.position = new AcGePoint3d(op.p[0], op.p[1], 0)
          text.height = op.height
          text.rotation = op.rotation ?? 0
          if (op.layer) text.layer = op.layer
          layout.record.appendEntity(text)
          push(text)
          count('addText', 1)
          break
        }
        case 'addLine': {
          ensureLayer(op.layer)
          const line = new AcDbLine(new AcGePoint3d(op.a[0], op.a[1], 0), new AcGePoint3d(op.b[0], op.b[1], 0))
          if (op.layer) line.layer = op.layer
          layout.record.appendEntity(line)
          push(line)
          count('addLine', 1)
          break
        }
        case 'addPolyline': {
          ensureLayer(op.layer)
          const polyline = new AcDbPolyline()
          op.pts.forEach((point, vertex) => polyline.addVertexAt(vertex, new AcGePoint2d(point[0], point[1]), 0))
          polyline.closed = op.closed === true
          if (op.layer) polyline.layer = op.layer
          layout.record.appendEntity(polyline)
          push(polyline)
          count('addPolyline', 1)
          break
        }
        case 'addRectangle': {
          ensureLayer(op.layer)
          const polyline = closedPolyline([
            [Math.min(op.corner1[0], op.corner2[0]), Math.min(op.corner1[1], op.corner2[1])],
            [Math.max(op.corner1[0], op.corner2[0]), Math.min(op.corner1[1], op.corner2[1])],
            [Math.max(op.corner1[0], op.corner2[0]), Math.max(op.corner1[1], op.corner2[1])],
            [Math.min(op.corner1[0], op.corner2[0]), Math.max(op.corner1[1], op.corner2[1])]
          ], 0)
          if (op.layer) polyline.layer = op.layer
          layout.record.appendEntity(polyline)
          push(polyline)
          count('addRectangle', 1)
          break
        }
        case 'addRevisionCloud': {
          ensureLayer(op.layer)
          const bulge = typeof op.bulge === 'number' && Number.isFinite(op.bulge) ? op.bulge : 0.35
          const polyline = closedPolyline(op.pts, bulge)
          if (op.layer) polyline.layer = op.layer
          layout.record.appendEntity(polyline)
          push(polyline)
          count('addRevisionCloud', 1)
          break
        }
        case 'addLeader': {
          ensureLayer(op.layer)
          const polyline = new AcDbPolyline()
          op.pts.forEach((point, vertex) => polyline.addVertexAt(vertex, new AcGePoint2d(point[0], point[1]), 0))
          polyline.closed = false
          if (op.layer) polyline.layer = op.layer
          layout.record.appendEntity(polyline)
          push(polyline)
          count('addLeader', 1)
          if (op.arrow !== false) {
            const arrow = arrowHead(op.pts[0]!, op.pts[1]!)
            if (arrow) {
              if (op.layer) arrow.layer = op.layer
              layout.record.appendEntity(arrow)
              push(arrow)
            }
          }
          break
        }
        case 'addBlock': {
          ensureLayer(op.layer)
          const reference = new AcDbBlockReference(op.block)
          reference.position = new AcGePoint3d(op.p[0], op.p[1], 0)
          reference.rotation = op.rotation ?? 0
          reference.scaleFactors = new AcGePoint3d(op.scale?.[0] ?? 1, op.scale?.[1] ?? 1, 1)
          if (op.layer) reference.layer = op.layer
          layout.record.appendEntity(reference)
          push(reference)
          count('addBlock', 1)
          break
        }
        case 'setText': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          const entity = slot.entity as unknown as { textString?: string; contents?: string }
          if (dxfTypeNameOf(slot.entity) === 'MTEXT') entity.contents = op.text
          else entity.textString = op.text
          push(slot.entity)
          count('setText', 1)
          break
        }
        case 'setAttribute': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          for (const attribute of (slot.entity as AcDbBlockReference).attributeIterator()) {
            if (attribute.tag === op.tag) {
              attribute.textString = op.value
              push(attribute)
              break
            }
          }
          count('setAttribute', 1)
          break
        }
        case 'setLayer': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          ensureLayer(op.layer)
          slot.entity.layer = op.layer
          push(slot.entity)
          count('setLayer', 1)
          break
        }
        case 'move': {
          const matrix = AcGeMatrix3d.makeTranslation(op.dx, op.dy, 0)
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            slot.entity.transformBy(matrix)
            push(slot.entity)
          }
          count('move', op.ids.length)
          break
        }
        case 'rotate': {
          const radians = (op.angleDeg * Math.PI) / 180
          const matrix = new AcGeMatrix3d()
          const rotation = new AcGeMatrix3d().makeRotationAxis(new AcGeVector3d(0, 0, 1), radians)
          matrix.multiplyMatrices(AcGeMatrix3d.makeTranslation(op.center[0], op.center[1], 0), rotation)
          matrix.multiply(AcGeMatrix3d.makeTranslation(-op.center[0], -op.center[1], 0))
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            slot.entity.transformBy(matrix)
            push(slot.entity)
          }
          count('rotate', op.ids.length)
          break
        }
        case 'erase': {
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            slot.record.removeEntity(slot.entity.objectId)
            touchedIds.push(id)
            index.entities.delete(id)
          }
          count('erase', op.ids.length)
          break
        }
        case 'addCircle': {
          ensureLayer(op.layer)
          const circle = new AcDbCircle(new AcGePoint3d(op.center[0], op.center[1], 0), op.radius)
          if (op.layer) circle.layer = op.layer
          layout.record.appendEntity(circle)
          push(circle)
          count('addCircle', 1)
          break
        }
        case 'addArc': {
          ensureLayer(op.layer)
          const start = wrapAngle2Pi((op.startAngleDeg * Math.PI) / 180)
          const end = wrapAngle2Pi((op.endAngleDeg * Math.PI) / 180)
          const arc = new AcDbArc(new AcGePoint3d(op.center[0], op.center[1], 0), op.radius, start, end)
          if (op.layer) arc.layer = op.layer
          layout.record.appendEntity(arc)
          push(arc)
          count('addArc', 1)
          break
        }
        case 'copy': {
          const matrix = AcGeMatrix3d.makeTranslation(op.dx, op.dy, 0)
          let copied = 0
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            // clone() gives a detached object with a fresh temporary id; the
            // append hands it a real handle, so the copy can never keep the
            // source's id.
            const clone = slot.entity.clone()
            clone.transformBy(matrix)
            slot.record.appendEntity(clone)
            push(clone)
            registerEntity(index, clone, slot)
            copied += 1
          }
          if (copied > 0) count('copy', copied)
          break
        }
        case 'scale': {
          // A factor of 1 is a legal request but changes nothing; it is counted
          // as no change so the write verification does not expect a diff.
          if (op.factor === 1) break
          const matrix = scaleMatrix(op.center, op.factor)
          let scaled = 0
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            if (scaleEntityAt(slot.entity, op.center, op.factor, matrix)) {
              push(slot.entity)
              scaled += 1
            }
          }
          if (scaled > 0) count('scale', scaled)
          break
        }
        case 'mirror': {
          const eraseSource = op.eraseSource === true
          let mirrored = 0
          for (const id of op.ids) {
            const slot = index.entities.get(id)
            if (!slot) continue
            const clone = slot.entity.clone()
            if (!mirrorEntityAcross(clone, op.axisA, op.axisB)) continue
            slot.record.appendEntity(clone)
            push(clone)
            registerEntity(index, clone, slot)
            mirrored += 1
            if (eraseSource) {
              slot.record.removeEntity(slot.entity.objectId)
              touchedIds.push(id)
              index.entities.delete(id)
            }
          }
          if (mirrored > 0) count('mirror', mirrored)
          break
        }
        case 'offset': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          const type = dxfTypeNameOf(slot.entity)
          if (type === 'LINE') {
            const segment = lineEndpoints(slot.entity)
            if (!segment || op.side === undefined) continue
            const vector = lineOffsetVector(segment.a, segment.b, op.side, op.distance)
            if (!vector) continue
            const clone = slot.entity.clone()
            clone.transformBy(AcGeMatrix3d.makeTranslation(vector[0], vector[1], 0))
            slot.record.appendEntity(clone)
            push(clone)
            registerEntity(index, clone, slot)
            count('offset', 1)
          } else if (type === 'CIRCLE' || type === 'ARC') {
            const geometry = circularGeometryOf(slot.entity)
            if (!geometry) continue
            const sign = op.side === undefined ? 1 : radialOffsetSign(geometry.center, geometry.radius, op.side)
            if (sign === undefined) continue
            const radius = geometry.radius + sign * op.distance
            if (radius <= GEOM_EPSILON) continue
            const clone = slot.entity.clone() as unknown as AcDbCircle | AcDbArc
            clone.radius = radius
            slot.record.appendEntity(clone)
            push(clone)
            registerEntity(index, clone, slot)
            count('offset', 1)
          }
          break
        }
        case 'trim': {
          const slot = index.entities.get(op.id)
          const boundarySlot = index.entities.get(op.boundaryId)
          if (!slot || !boundarySlot) continue
          const target = lineEndpoints(slot.entity)
          const edge = lineEndpoints(boundarySlot.entity)
          if (!target || !edge) continue
          const hit = lineIntersection(target.a, target.b, edge.a, edge.b)
          if (!hit) continue
          const line = slot.entity as AcDbLine
          const point = new AcGePoint3d(hit.point[0], hit.point[1], 0)
          if (trimEndAt(target, hit.point, op.pick) === 'start') line.startPoint = point
          else line.endPoint = point
          push(slot.entity)
          count('trim', 1)
          break
        }
        case 'extend': {
          const slot = index.entities.get(op.id)
          const boundarySlot = index.entities.get(op.boundaryId)
          if (!slot || !boundarySlot) continue
          const target = lineEndpoints(slot.entity)
          const edge = lineEndpoints(boundarySlot.entity)
          if (!target || !edge) continue
          const hit = lineIntersection(target.a, target.b, edge.a, edge.b)
          if (!hit) continue
          // Validation guarantees the intersection is beyond one end; the end on
          // that side moves, which is the only direction that reaches the boundary.
          const line = slot.entity as AcDbLine
          const point = new AcGePoint3d(hit.point[0], hit.point[1], 0)
          if (hit.t < 0) line.startPoint = point
          else line.endPoint = point
          push(slot.entity)
          count('extend', 1)
          break
        }
        case 'setLine': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          const current = lineEndpoints(slot.entity)
          if (current && sameSegment(current, op.a, op.b)) break
          const line = slot.entity as AcDbLine
          line.startPoint = new AcGePoint3d(op.a[0], op.a[1], 0)
          line.endPoint = new AcGePoint3d(op.b[0], op.b[1], 0)
          push(slot.entity)
          count('setLine', 1)
          break
        }
        case 'setPolyline': {
          const slot = index.entities.get(op.id)
          if (!slot) continue
          const polyline = slot.entity as AcDbPolyline
          const changed = !samePoints(polylinePointsOf(polyline), op.pts) || polyline.closed !== (op.closed === true)
          if (!changed) break
          replacePolylinePoints(polyline, op.pts, op.closed === true)
          push(slot.entity)
          count('setPolyline', 1)
          break
        }
      }
    }
  })

  return { changes, touchedIds }
}

/**
 * The op list of a draft or a bare array.
 *
 * @param input - draft or ops.
 */
function opsOf(input: EcadDraft | readonly EcadOp[]): readonly EcadOp[] {
  if (Array.isArray(input)) return input as readonly EcadOp[]
  const draft = input as EcadDraft
  if (!draft || !Array.isArray(draft.ops)) {
    throw new EcadError('INVALID_INPUT', 'the draft has no ops array', 'Pass an EcadDraft (with an ops array) or a list of operations.')
  }
  return draft.ops
}

/**
 * Index a drawing's layouts and top-level entities by their render-model ids.
 *
 * @param db - drawing database.
 */
function indexDrawing(db: AcDbDatabase): DrawingIndex {
  const layouts = new Map<string, LayoutSlot>()
  const entities = new Map<string, IdSlot>()
  for (const record of db.tables.blockTable.newIterator()) {
    const isModel = record.isModelSapce === true
    const isPaper = record.isPaperSapce === true
    if (!isModel && !isPaper) continue
    const layoutId = layoutIdOf(db, record, isModel)
    layouts.set(layoutId, { layoutId, record })
    for (const entity of record.newIterator()) {
      const id = String(entity.objectId ?? '')
      if (id.length === 0) continue
      entities.set(id, { entity, record, layoutId })
    }
  }
  return { layouts, entities }
}

/**
 * Layout id for one block table record.
 *
 * @param db - drawing database.
 * @param record - block table record.
 * @param isModel - whether this is model space.
 */
function layoutIdOf(db: AcDbDatabase, record: AcDbBlockTableRecord, isModel: boolean): string {
  if (isModel) return 'Model'
  const layout = db.objects.layout.getBtrIdAt(record.objectId)
  const name = layout?.layoutName
  if (typeof name === 'string' && name.length > 0 && !name.startsWith('*')) return name
  return (record.name ?? 'Layout').replace(/^\*/, '') || 'Layout'
}

/**
 * DXF type name of an entity.
 *
 * @param entity - source entity.
 */
function dxfTypeNameOf(entity: AcDbEntity): string {
  const typed = entity as unknown as { dxfTypeName?: string; type?: string }
  if (typeof typed.dxfTypeName === 'string' && typed.dxfTypeName.length > 0) return typed.dxfTypeName
  return typeof typed.type === 'string' ? typed.type.toUpperCase() : 'UNKNOWN'
}

/**
 * Check every id of a multi-entity operation.
 *
 * @param opIndex - op index, for the error.
 * @param ids - ids to check.
 * @param check - per-id checker.
 * @param error - error sink.
 */
function checkIds(
  opIndex: number,
  ids: readonly string[] | undefined,
  check: (opIndex: number, id: string) => IdSlot | undefined,
  error: (opIndex: number, message: string, fix: string) => void
): boolean {
  if (!Array.isArray(ids) || ids.length === 0) {
    error(opIndex, 'the operation needs at least one entity id', 'Pass the ids the render model lists for the entities to edit.')
    return false
  }
  let ok = true
  for (const id of ids) {
    if (!check(opIndex, id)) ok = false
  }
  return ok
}

/**
 * A closed polyline from points, with an optional bulge on every vertex.
 *
 * @param points - vertex points.
 * @param bulge - bulge applied to every vertex (revision cloud arcs).
 */
function closedPolyline(points: readonly EcadPoint[], bulge: number): AcDbPolyline {
  const polyline = new AcDbPolyline()
  points.forEach((point, vertex) => polyline.addVertexAt(vertex, new AcGePoint2d(point[0], point[1]), bulge))
  polyline.closed = true
  return polyline
}

/**
 * A filled arrow head for the first segment of a leader.
 *
 * @param tip - leader start point (arrow tip).
 * @param next - the next vertex, which gives the direction.
 */
function arrowHead(tip: EcadPoint, next: EcadPoint): AcDbSolid | undefined {
  const dx = next[0] - tip[0]
  const dy = next[1] - tip[1]
  const length = Math.hypot(dx, dy)
  if (length < 1e-9) return undefined
  const unitX = dx / length
  const unitY = dy / length
  const arrowLength = Math.min(length, Math.max(length * 0.08, 1e-6))
  const halfWidth = arrowLength * 0.35
  const baseX = tip[0] + unitX * arrowLength
  const baseY = tip[1] + unitY * arrowLength
  const solid = new AcDbSolid()
  solid.setPointAt(0, new AcGePoint3d(tip[0], tip[1], 0))
  solid.setPointAt(1, new AcGePoint3d(baseX - unitY * halfWidth, baseY + unitX * halfWidth, 0))
  solid.setPointAt(2, new AcGePoint3d(baseX + unitY * halfWidth, baseY - unitX * halfWidth, 0))
  solid.setPointAt(3, new AcGePoint3d(tip[0], tip[1], 0))
  return solid
}

/**
 * Attribute rows of an insert, for callers that want to inspect a draft target.
 *
 * @param insert - block reference.
 */
export function attributeRows(insert: AcDbBlockReference): Array<{ tag: string; value: string }> {
  const rows: Array<{ tag: string; value: string }> = []
  for (const attribute of insert.attributeIterator()) {
    rows.push({ tag: attribute.tag, value: attribute.textString ?? '' })
  }
  return rows
}

/** The minimum 3D point shape the modify helpers read. */
interface Vec3Like {
  readonly x: number
  readonly y: number
  readonly z?: number
}

/**
 * An ACI colour object for a layer table record.
 *
 * @param colorIndex - AutoCAD Color Index, 1–255.
 */
function aciColor(colorIndex: number): AcCmColor {
  const color = new AcCmColor()
  color.colorIndex = colorIndex
  return color
}

/**
 * Find a layer table record by name, case-insensitively (DXF layer names are
 * case-insensitive; the data-model table normalises them on insertion).
 *
 * @param db - drawing database.
 * @param name - layer name as the caller wrote it.
 */
function findLayerRecord(db: AcDbDatabase, name: string): AcDbLayerTableRecord | undefined {
  const wanted = name.toUpperCase()
  for (const record of db.tables.layerTable.newIterator()) {
    if (String(record.name ?? '').toUpperCase() === wanted) return record
  }
  return undefined
}

/**
 * A renamed copy of a layer table record that keeps its appearance.
 *
 * @param source - existing record.
 * @param name - new layer name.
 */
function copyLayerRecord(source: AcDbLayerTableRecord, name: string): AcDbLayerTableRecord {
  const copy = new AcDbLayerTableRecord({ name })
  const color = source.color
  copy.color = color && typeof color.clone === 'function' ? color.clone() : aciColor(7)
  copy.description = source.description ?? ''
  copy.isOff = source.isOff
  copy.isFrozen = source.isFrozen
  copy.isLocked = source.isLocked
  copy.isPlottable = source.isPlottable
  const linetype = source.linetype
  if (typeof linetype === 'string' && linetype.length > 0) copy.linetype = linetype
  return copy
}

/**
 * The endpoints of a LINE, or `undefined` for any other entity kind.
 *
 * @param entity - source entity.
 */
function lineEndpoints(entity: AcDbEntity): Segment | undefined {
  if (dxfTypeNameOf(entity) !== 'LINE') return undefined
  const line = entity as AcDbLine
  return { a: [line.startPoint.x, line.startPoint.y], b: [line.endPoint.x, line.endPoint.y] }
}

/**
 * The centre and radius of a CIRCLE or ARC, or `undefined` for another kind.
 *
 * @param entity - source entity.
 */
function circularGeometryOf(entity: AcDbEntity): { center: EcadPoint; radius: number } | undefined {
  const type = dxfTypeNameOf(entity)
  if (type !== 'CIRCLE' && type !== 'ARC') return undefined
  const curve = entity as AcDbCircle | AcDbArc
  const center = curve.center
  return { center: [center.x, center.y], radius: curve.radius }
}

/**
 * Uniform scale about a world point.
 *
 * @param center - fixed point of the scale.
 * @param factor - positive uniform factor.
 */
function scaleMatrix(center: EcadPoint, factor: number): AcGeMatrix3d {
  const matrix = new AcGeMatrix3d()
  matrix.multiplyMatrices(AcGeMatrix3d.makeTranslation(center[0], center[1], 0), new AcGeMatrix3d().makeScale(factor, factor, 1))
  matrix.multiply(AcGeMatrix3d.makeTranslation(-center[0], -center[1], 0))
  return matrix
}

/**
 * Reflection about the line through two axis points: translate the axis point to
 * the origin, rotate the axis onto the x axis, mirror y, rotate back and
 * translate the axis point into place again.
 *
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 */
function reflectionMatrix(axisA: EcadPoint, axisB: EcadPoint): AcGeMatrix3d {
  const matrix = new AcGeMatrix3d()
  matrix.multiplyMatrices(AcGeMatrix3d.makeTranslation(axisA[0], axisA[1], 0), new AcGeMatrix3d().makeRotationZ(2 * axisAngle(axisA, axisB)))
  matrix.multiply(new AcGeMatrix3d().makeScale(1, -1, 1))
  matrix.multiply(AcGeMatrix3d.makeTranslation(-axisA[0], -axisA[1], 0))
  return matrix
}

/**
 * Scale one entity about a world point.
 *
 * Geometry is transformed by one uniform matrix, which keeps line endpoints,
 * polyline vertices and bulges, circle/arc radius, ellipse radii, solid and
 * leader points and point placement exact. Text needs its height scaled too, and
 * an insert needs its scale factors scaled, so both are handled explicitly
 * rather than through the matrix.
 *
 * @param entity - entity to scale in place.
 * @param center - fixed point of the scale.
 * @param factor - positive uniform factor.
 * @param matrix - the scale matrix, built once per operation.
 * @returns false when the kind is not scalable; validation normally refuses it first.
 */
function scaleEntityAt(entity: AcDbEntity, center: EcadPoint, factor: number, matrix: AcGeMatrix3d): boolean {
  const type = dxfTypeNameOf(entity)
  if (type === 'TEXT') {
    const text = entity as AcDbText
    text.position = scalePoint3d(text.position, center, factor)
    if (text.hasAlignmentPoint === true) text.alignmentPoint = scalePoint3d(text.alignmentPoint, center, factor)
    text.height = text.height * factor
    return true
  }
  if (type === 'MTEXT') {
    const text = entity as AcDbMText
    text.location = scalePoint3d(text.location, center, factor)
    text.height = text.height * factor
    if (text.width > 0) text.width = text.width * factor
    if (text.extentsWidth > 0) text.extentsWidth = text.extentsWidth * factor
    return true
  }
  if (type === 'INSERT') {
    const insert = entity as AcDbBlockReference
    insert.position = scalePoint3d(insert.position, center, factor)
    const scale = insert.scaleFactors
    insert.scaleFactors = new AcGePoint3d(scale.x * factor, scale.y * factor, scale.z * factor)
    return true
  }
  if (!SCALABLE_KINDS.includes(type)) return false
  entity.transformBy(matrix)
  return true
}

/**
 * Reflect one entity about a line.
 *
 * Linework and point-based geometry go through the reflection matrix, which
 * also flips polyline bulges. Circles, arcs and ellipses reflect their centre
 * and, for arcs and partial ellipses, their angles, because the geometry engine
 * does not reverse an arc's sweep under a mirror. Text stays readable
 * (AutoCAD's MIRRTEXT=0 behaviour): its placement and rotation reflect, the
 * glyphs do not.
 *
 * @param entity - entity to mirror in place.
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 * @returns false when the kind is not mirrorable; validation normally refuses it first.
 */
function mirrorEntityAcross(entity: AcDbEntity, axisA: EcadPoint, axisB: EcadPoint): boolean {
  const type = dxfTypeNameOf(entity)
  switch (type) {
    case 'LINE':
    case 'LWPOLYLINE':
    case 'POINT':
    case 'SOLID':
    case 'TRACE':
    case 'LEADER':
      entity.transformBy(reflectionMatrix(axisA, axisB))
      return true
    case 'CIRCLE': {
      const circle = entity as AcDbCircle
      circle.center = reflectPoint3d(circle.center, axisA, axisB)
      return true
    }
    case 'ARC': {
      const arc = entity as AcDbArc
      arc.center = reflectPoint3d(arc.center, axisA, axisB)
      const [start, end] = mirroredArcAngles(arc.startAngle, arc.endAngle, axisA, axisB)
      arc.startAngle = start
      arc.endAngle = end
      return true
    }
    case 'ELLIPSE': {
      const ellipse = entity as AcDbEllipse
      const closed = ellipse.closed === true
      const start = ellipse.startAngle
      const end = ellipse.endAngle
      // The matrix gives the reflected centre and major-axis rotation; a
      // partial ellipse then needs its parameter range reversed by hand.
      ellipse.transformBy(reflectionMatrix(axisA, axisB))
      if (!closed) {
        const [reflectedStart, reflectedEnd] = mirroredEllipseParams(start, end)
        ellipse.startAngle = reflectedStart
        ellipse.endAngle = reflectedEnd
      }
      return true
    }
    case 'TEXT': {
      const text = entity as AcDbText
      text.position = reflectPoint3d(text.position, axisA, axisB)
      if (text.hasAlignmentPoint === true) text.alignmentPoint = reflectPoint3d(text.alignmentPoint, axisA, axisB)
      text.rotation = reflectAngle(text.rotation, axisA, axisB)
      return true
    }
    case 'MTEXT': {
      const text = entity as AcDbMText
      text.location = reflectPoint3d(text.location, axisA, axisB)
      const rotation = reflectAngle(text.rotation, axisA, axisB)
      text.rotation = rotation
      // MTEXT carries a flow direction next to the rotation; keep both
      // consistent so another CAD reader shows the same text.
      text.direction = new AcGeVector3d(Math.cos(rotation), Math.sin(rotation), 0)
      return true
    }
    default:
      return false
  }
}

/**
 * Scale a 3D placement point in the XY plane, keeping its Z.
 *
 * @param point - source point.
 * @param center - fixed point of the scale.
 * @param factor - positive uniform factor.
 */
function scalePoint3d(point: Vec3Like, center: EcadPoint, factor: number): AcGePoint3d {
  return new AcGePoint3d(center[0] + (point.x - center[0]) * factor, center[1] + (point.y - center[1]) * factor, numberOr(point.z, 0))
}

/**
 * Reflect a 3D placement point about a line in the XY plane, keeping its Z.
 *
 * @param point - source point.
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 */
function reflectPoint3d(point: Vec3Like, axisA: EcadPoint, axisB: EcadPoint): AcGePoint3d {
  const reflected = reflectPoint([point.x, point.y], axisA, axisB)
  return new AcGePoint3d(reflected[0], reflected[1], numberOr(point.z, 0))
}

/**
 * Make a cloned entity reachable by its new render-model id, so a later op in
 * the same draft can address it and the returned touched ids stay meaningful.
 *
 * @param index - drawing index being applied.
 * @param entity - the appended clone.
 * @param source - the slot it was cloned from, for record and layout.
 */
function registerEntity(index: DrawingIndex, entity: AcDbEntity, source: IdSlot): void {
  const id = String(entity.objectId ?? '')
  if (id.length === 0) return
  index.entities.set(id, { entity, record: source.record, layoutId: source.layoutId })
}

/**
 * Which end of the line a trim replaces.
 *
 * A pick point decides: the end nearest the pick is the one cut back. Without a
 * pick, the end nearest the intersection is the one that disappears, which is
 * the same end a person would have picked.
 *
 * @param segment - line being trimmed.
 * @param intersection - where the boundary crosses it.
 * @param pick - optional pick point from the operation.
 * @returns the end that is replaced by the intersection.
 */
function trimEndAt(segment: Segment, intersection: EcadPoint, pick: EcadPoint | undefined): 'start' | 'end' {
  const reference = pick ?? intersection
  return distance(reference, segment.a) <= distance(reference, segment.b) ? 'start' : 'end'
}

/**
 * True when two points are the same within the shared geometry tolerance.
 *
 * @param point - first point.
 * @param x - second point x.
 * @param y - second point y.
 */
function pointAt(point: readonly number[] | undefined, x: number, y: number): boolean {
  if (!point) return false
  return Math.abs(point[0]! - x) <= GEOM_EPSILON && Math.abs(point[1]! - y) <= GEOM_EPSILON
}

/**
 * True when a segment already is the requested endpoints (a no-op setLine).
 *
 * @param segment - current segment.
 * @param a - requested start.
 * @param b - requested end.
 */
function sameSegment(segment: Segment, a: EcadPoint, b: EcadPoint): boolean {
  return pointAt(segment.a, a[0], a[1]) && pointAt(segment.b, b[0], b[1])
}

/**
 * True when two point lists describe the same vertices (a no-op setPolyline).
 *
 * @param current - current vertices.
 * @param next - requested vertices.
 */
function samePoints(current: readonly EcadPoint[], next: readonly EcadPoint[]): boolean {
  if (current.length !== next.length) return false
  for (let index = 0; index < current.length; index += 1) {
    if (!pointAt(current[index], next[index]![0], next[index]![1])) return false
  }
  return true
}

/**
 * The 2D vertices of an LWPOLYLINE, in order.
 *
 * @param polyline - polyline entity.
 */
function polylinePointsOf(polyline: AcDbPolyline): EcadPoint[] {
  const points: EcadPoint[] = []
  for (let index = 0; index < polyline.numberOfVertices; index += 1) {
    const point = polyline.getPoint2dAt(index)
    points.push([point.x, point.y])
  }
  return points
}

/**
 * Replace every vertex of an LWPOLYLINE and set its closed flag.
 *
 * The model's grip path has no bulge to preserve, so every vertex is written
 * straight (bulge 0); this is the documented limit of `setPolyline`.
 *
 * @param polyline - polyline to rewrite.
 * @param points - replacement vertices.
 * @param closed - whether the last vertex joins the first.
 */
function replacePolylinePoints(polyline: AcDbPolyline, points: readonly EcadPoint[], closed: boolean): void {
  while (polyline.numberOfVertices > 0) polyline.removeVertexAt(polyline.numberOfVertices - 1)
  points.forEach((point, index) => polyline.addVertexAt(index, new AcGePoint2d(point[0], point[1]), 0))
  polyline.closed = closed
}

/**
 * A finite number or a fallback.
 *
 * @param value - candidate.
 * @param fallback - value used when the candidate is not a finite number.
 */
function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}
