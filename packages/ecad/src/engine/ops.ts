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

import { AcDbBlockReference, AcDbBlockTableRecord, AcDbLayerTableRecord, AcDbLine, AcDbPolyline, AcDbSolid, AcDbText, AcGeMatrix3d, AcGePoint2d, AcGePoint3d, AcGeVector3d } from '@mlightcad/data-model'
import type { AcDbDatabase, AcDbEntity } from '@mlightcad/data-model'
import type { EcadDraft, EcadOp, EcadPoint } from './types.ts'
import type { OpenedSheet } from './parse.ts'
import { EcadError } from './errors.ts'

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

/** Op kinds in output order. */
const OP_KINDS: readonly string[] = [
  'addText',
  'addLine',
  'addPolyline',
  'addRectangle',
  'addRevisionCloud',
  'addLeader',
  'addBlock',
  'setText',
  'setAttribute',
  'setLayer',
  'move',
  'rotate',
  'erase'
]

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
    if (!checkLayout(opIndex, op)) continue
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
