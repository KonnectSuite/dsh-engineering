/**
 * Building the plain-JSON sheet model from an opened drawing.
 *
 * The model is the only thing the panel, the checks and the renderer read, so
 * this module is where every drawing-specific decision is made once: which
 * layouts exist, how block references flatten into world coordinates, how a
 * colour resolves through the layer and insert chain, which entity types are
 * carried exactly versus approximated, and where the entity cap bites.
 *
 * Two rules keep the output honest:
 *
 * - Every entity that exists in a layout appears in the model, even when it is
 *   only an `unsupported` marker, so an id never goes missing between a source
 *   drawing and its review.
 * - An approximated primitive says so (`approx` and `src`); the counters in
 *   `stats` are sums of those flags rather than a claim of completeness.
 *
 * @module dsh-engineering-ecad/engine/model
 */

import { AcGeMatrix3d } from '@mlightcad/data-model'
import type { AcDbAttribute, AcDbBlockReference, AcDbBlockTableRecord, AcDbDatabase, AcDbEntity, AcDbLayerTableRecord } from '@mlightcad/data-model'
import type { EcadBlockSummary, EcadBox, EcadEntity, EcadEntityKind, EcadLayer, EcadLayout, EcadModelStats, EcadPoint, EcadSheetModel } from './types.ts'
import type { OpenedSheet } from './parse.ts'
import { decodeDxfText, decodeMText, textWidthEm } from './text.ts'

/** Default cap on primitives emitted for one layout. */
export const DEFAULT_MAX_ENTITIES_PER_LAYOUT = 200_000

/** Default recursion limit when flattening block references. */
export const DEFAULT_MAX_INSERT_DEPTH = 8

/** Options of {@link buildSheetModel}. */
export interface BuildSheetModelOptions {
  /** Cap on primitives per layout; the layout's `stats.truncated` is set when it bites. */
  readonly maxEntitiesPerLayout?: number
  /** Flatten block references into their layout. Defaults to true. */
  readonly flattenInserts?: boolean
  /** Emit one `insert` marker per block reference. Defaults to true. */
  readonly includeInsertMarkers?: boolean
  /** Maximum nested block depth before the rest is counted as unsupported. Defaults to 8. */
  readonly maxInsertDepth?: number
  /** Skip entities flagged invisible. Defaults to true. */
  readonly skipInvisible?: boolean
}

/** The MIT-pinned data model ships no public typings for these internals. */
interface GeoVertex {
  readonly x: number
  readonly y: number
  readonly bulge?: number
}

/** One hatch boundary loop, whose tessellation is public in the geometry engine but private here. */
interface GeoLoop {
  readonly tessellate?: (options?: unknown) => Array<{ x: number; y: number }>
}

/** Runtime-only geometry carried by splines, polylines and hatches in data-model 1.15.21. */
interface EntityGeo {
  readonly _geo?: {
    readonly vertices?: readonly GeoVertex[]
    readonly loops?: readonly GeoLoop[]
    readonly controlPoints?: ReadonlyArray<{ x: number; y: number; z: number }>
    readonly fitPoints?: ReadonlyArray<{ x: number; y: number; z: number }>
    readonly getPoints?: (count?: number) => Array<{ x: number; y: number; z: number }>
  }
}

/** An affine 2D transform, derived once from a 4×4 column-major matrix. */
interface Xform {
  /** Column-major 4×4 elements. */
  readonly e: readonly number[]
  readonly identity: boolean
  /** Uniform scale factor (geometric mean of the axis lengths). */
  readonly scale: number
  /** Rotation of the local x axis, radians. */
  readonly rotation: number
  /** True when the two axes carry the same length and the transform is not mirrored. */
  readonly uniform: boolean
  /** True when the transform mirrors. */
  readonly reflected: boolean
}

/** The identity transform. */
const IDENTITY_ELEMENTS: readonly number[] = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])
const IDENTITY_XFORM: Xform = Object.freeze({
  e: IDENTITY_ELEMENTS,
  identity: true,
  scale: 1,
  rotation: 0,
  uniform: true,
  reflected: false
})

/** A mutable growing box. */
interface MutableBox {
  minX: number
  minY: number
  maxX: number
  maxY: number
  empty: boolean
}

/** Everything one layout's conversion accumulates. */
interface LayoutBuild {
  readonly id: string
  readonly name: string
  readonly kind: 'model' | 'paper'
  readonly entities: EcadEntity[]
  readonly box: MutableBox
  truncated: boolean
}

/**
 * Build the render model for one opened drawing.
 *
 * @param opened - the parsed sheet, already hashed and versioned.
 * @param options - caps and flattening switches.
 * @returns every layout, resolved layers, block summaries and coverage counters.
 */
export function buildSheetModel(opened: OpenedSheet, options: BuildSheetModelOptions = {}): EcadSheetModel {
  const db = opened.db
  const maxEntities = Math.max(1, Math.trunc(options.maxEntitiesPerLayout ?? DEFAULT_MAX_ENTITIES_PER_LAYOUT))
  const layers = readLayers(db)
  const layerByName = new Map(layers.map(layer => [layer.name, layer]))
  const blocks = readBlocks(db)
  const layouts: EcadLayout[] = []
  const byKind: Record<string, number> = {}
  const unsupported: Record<string, number> = {}
  let approximate = 0
  let truncated = false

  for (const record of db.tables.blockTable.newIterator()) {
    const isModel = record.isModelSapce === true
    const isPaper = record.isPaperSapce === true
    if (!isModel && !isPaper) continue
    const layoutName = layoutNameOf(db, record, isModel)
    const build: LayoutBuild = {
      id: layoutName,
      name: layoutName,
      kind: isModel ? 'model' : 'paper',
      entities: [],
      box: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, empty: true },
      truncated: false
    }
    const converter = new Converter({
      build,
      layerByName,
      maxEntities,
      flattenInserts: options.flattenInserts !== false,
      includeInsertMarkers: options.includeInsertMarkers !== false,
      maxInsertDepth: Math.max(0, Math.trunc(options.maxInsertDepth ?? DEFAULT_MAX_INSERT_DEPTH)),
      skipInvisible: options.skipInvisible !== false
    })
    for (const entity of record.newIterator()) {
      if (converter.emitted >= maxEntities) {
        build.truncated = true
        break
      }
      converter.entity(entity, IDENTITY_XFORM, '', undefined, 0)
    }
    for (const entity of build.entities) {
      byKind[entity.k] = (byKind[entity.k] ?? 0) + 1
      if (entity.approx) approximate += 1
    }
    for (const [type, count] of converter.unsupported) {
      unsupported[type] = (unsupported[type] ?? 0) + count
    }
    if (build.truncated) truncated = true
    layouts.push({
      id: build.id,
      name: build.name,
      kind: build.kind,
      extents: freezeBox(build.box),
      entities: build.entities
    })
  }

  const stats: EcadModelStats = {
    entities: layouts.reduce((sum, layout) => sum + layout.entities.length, 0),
    byKind,
    unsupported,
    approximate,
    truncated
  }

  return {
    schema: 1,
    path: opened.path,
    version: opened.sha256,
    dxfVersion: opened.dxfVersion,
    units: opened.units,
    layouts,
    layers,
    blocks,
    stats
  }
}

/**
 * Convert entities of one layout into primitives.
 *
 * A class rather than a closure because recursion into block definitions needs
 * the same emitter, counters and caps.
 */
class Converter {
  readonly unsupported = new Map<string, number>()
  emitted = 0

  private readonly build: LayoutBuild
  private readonly layerByName: ReadonlyMap<string, EcadLayer>
  private readonly maxEntities: number
  private readonly flattenInserts: boolean
  private readonly includeInsertMarkers: boolean
  private readonly maxInsertDepth: number
  private readonly skipInvisible: boolean

  constructor(init: {
    build: LayoutBuild
    layerByName: ReadonlyMap<string, EcadLayer>
    maxEntities: number
    flattenInserts: boolean
    includeInsertMarkers: boolean
    maxInsertDepth: number
    skipInvisible: boolean
  }) {
    this.build = init.build
    this.layerByName = init.layerByName
    this.maxEntities = init.maxEntities
    this.flattenInserts = init.flattenInserts
    this.includeInsertMarkers = init.includeInsertMarkers
    this.maxInsertDepth = init.maxInsertDepth
    this.skipInvisible = init.skipInvisible
  }

  /**
   * Convert one entity and, for a block reference, its definition contents.
   *
   * @param entity - source entity.
   * @param xf - transform of the enclosing insert chain.
   * @param insertPath - id prefix of the enclosing insert chain (`''` at top level).
   * @param ownerInsertId - id of the nearest owning insert, recorded in `g`.
   * @param depth - block nesting depth.
   * @param blockPath - names of the blocks already being expanded, for cycle detection.
   */
  entity(entity: AcDbEntity, xf: Xform, insertPath: string, ownerInsertId: string | undefined, depth: number, blockPath: readonly string[] = []): void {
    if (this.emitted >= this.maxEntities) return
    if (this.skipInvisible && entity.visibility === false) return
    const type = dxfTypeNameOf(entity)
    if (type === 'INSERT') {
      this.insert(entity as AcDbBlockReference, xf, insertPath, ownerInsertId, depth, blockPath)
      return
    }
    // ATTDEF is a definition, SEQEND terminates an attribute list; neither is
    // visible geometry in the layout it appears in.
    if (type === 'ATTDEF' || type === 'ATTRIB' || type === 'SEQEND') return

    const id = entityId(entity, insertPath)
    const layer = layerNameOf(entity)
    const color = this.colorOf(entity, layer, undefined)
    const base = { id, layer, color: color.color, rgb: color.rgb, lt: lineTypeOf(entity), lw: lineWeightOf(entity), g: ownerInsertId }

    switch (type) {
      case 'LINE': {
        const line = entity as unknown as { startPoint: Vec3; endPoint: Vec3 }
        // A block's line must go through the same transform as its circles and
        // text; reading the raw points put every flattened block line at the
        // block-local origin, which drew stray geometry in the sheet corner.
        this.push({ ...base, k: 'line', pts: [applyPoint(xf, line.startPoint), applyPoint(xf, line.endPoint)] })
        return
      }
      case 'LWPOLYLINE': {
        const points = lwPolylinePoints(entity, xf)
        this.push({ ...base, k: 'polyline', pts: points.points, closed: closedOf(entity), approx: points.approx || undefined, src: points.approx ? 'LWPOLYLINE' : undefined })
        return
      }
      case 'POLYLINE':
      case '2D_POLYLINE': {
        const points = twoDPolylinePoints(entity, xf)
        this.push({ ...base, k: 'polyline', pts: points.points, closed: closedOf(entity), approx: points.approx || undefined, src: points.approx ? type : undefined })
        return
      }
      case 'ARC': {
        const arc = entity as unknown as { center: Vec3; radius: number; startAngle: number; endAngle: number }
        this.push({ ...base, k: 'arc', c: applyPoint(xf, arc.center), r: arc.radius * xf.scale, a0: rotateAngle(xf, arc.startAngle), a1: rotateAngle(xf, arc.endAngle), approx: arcApproximate(xf) || undefined, src: arcApproximate(xf) ? type : undefined })
        return
      }
      case 'CIRCLE': {
        const circle = entity as unknown as { center: Vec3; radius: number }
        this.push({ ...base, k: 'circle', c: applyPoint(xf, circle.center), r: circle.radius * xf.scale, approx: arcApproximate(xf) || undefined, src: arcApproximate(xf) ? type : undefined })
        return
      }
      case 'ELLIPSE': {
        const ellipse = entity as unknown as {
          center: Vec3
          majorAxisRadius: number
          minorAxisRadius: number
          majorAxis?: Vec3
          startAngle: number
          endAngle: number
          closed?: boolean
        }
        const rotation = angleOf(ellipse.majorAxis)
        this.push({
          ...base,
          k: 'ellipse',
          c: applyPoint(xf, ellipse.center),
          rx: ellipse.majorAxisRadius * xf.scale,
          ry: ellipse.minorAxisRadius * xf.scale,
          rot: rotation + xf.rotation,
          a0: ellipse.startAngle,
          a1: ellipse.endAngle,
          closed: ellipse.closed || Math.abs(Math.abs(ellipse.endAngle - ellipse.startAngle) - Math.PI * 2) < 1e-6 || undefined,
          approx: arcApproximate(xf) || undefined,
          src: arcApproximate(xf) ? type : undefined
        })
        return
      }
      case 'SPLINE': {
        const points = splinePoints(entity, xf)
        if (points.length < 2) {
          this.countUnsupported(type)
          this.push({ ...base, k: 'unsupported', src: type })
          return
        }
        this.push({ ...base, k: 'spline', pts: points, closed: closedOf(entity) || undefined, approx: true, src: type })
        return
      }
      case 'POINT': {
        const point = entity as unknown as { position: Vec3 }
        this.push({ ...base, k: 'point', p: applyPoint(xf, point.position) })
        return
      }
      case 'TEXT': {
        const text = entity as unknown as TextLike
        const placement = text.hasAlignmentPoint && (text.horizontalMode !== 0 || text.verticalMode !== 0) ? text.alignmentPoint : text.position
        const value = decodeDxfText(text.textString ?? '')
        this.push({
          ...base,
          k: 'text',
          t: value,
          p: applyPoint(xf, placement),
          h: (text.height ?? 0) * xf.scale,
          rot: rotateAngle(xf, text.rotation ?? 0),
          ...textAlignment(value, numberOr(text.horizontalMode, 0), numberOr(text.verticalMode, 0))
        })
        return
      }
      case 'MTEXT': {
        const text = entity as unknown as MTextLike
        const attachment = numberOr(text.attachmentPoint, 1)
        const value = decodeMText(text.contents ?? '')
        this.push({
          ...base,
          k: 'mtext',
          t: value,
          p: applyPoint(xf, text.location),
          h: (text.height ?? 0) * xf.scale,
          w: numberOr(text.width, 0) > 0 ? numberOr(text.width, 0) * xf.scale : undefined,
          rot: rotateAngle(xf, text.rotation ?? 0),
          ...textAlignment(
            value,
            attachment === 1 || attachment === 4 || attachment === 7 ? 0 : attachment === 2 || attachment === 5 || attachment === 8 ? 1 : 2,
            attachment <= 3 ? 3 : attachment <= 6 ? 2 : 1
          )
        })
        return
      }
      case 'SOLID':
      case 'TRACE': {
        const points = fourPointEntity(entity, xf)
        this.push({ ...base, k: 'solid', pts: points, closed: true, approx: true, src: type })
        return
      }
      case 'HATCH': {
        this.hatch(entity, xf, base)
        return
      }
      case 'DIMENSION': {
        this.dimension(entity, xf, base)
        return
      }
      case 'LEADER': {
        const leader = entity as unknown as { vertices?: Vec3[]; numVertices?: number }
        const vertices = Array.isArray(leader.vertices) ? leader.vertices.map(v => applyPoint(xf, v)) : []
        this.push({ ...base, k: 'leader', pts: vertices, approx: true, src: type })
        return
      }
      case 'VIEWPORT': {
        const viewport = entity as unknown as { centerPoint: Vec3; width: number; height: number }
        const center = applyPoint(xf, viewport.centerPoint)
        this.push({ ...base, k: 'viewport', p: center, w: viewport.width * xf.scale, h: viewport.height * xf.scale, approx: true, src: type })
        return
      }
      default: {
        this.countUnsupported(type)
        this.push({ ...base, k: 'unsupported', src: type })
      }
    }
  }

  /** Emit one primitive and extend the layout's extents. */
  private push(entity: EcadEntity): void {
    if (this.emitted >= this.maxEntities) {
      this.build.truncated = true
      return
    }
    this.emitted += 1
    this.build.entities.push(entity)
    extendBox(this.build.box, entity)
  }

  /** Count one unsupported entity type. */
  private countUnsupported(type: string): void {
    this.unsupported.set(type, (this.unsupported.get(type) ?? 0) + 1)
  }

  /** Resolve an entity colour through its layer and its insert chain. */
  private colorOf(entity: AcDbEntity, layerName: string, blockColor: number | undefined): { color: number; rgb?: readonly [number, number, number] } {
    const layer = this.layerByName.get(layerName)
    const layerColor = layer?.color ?? 7
    const color = (entity as unknown as { color?: ColorLike }).color
    if (!color) return { color: layerColor }
    if (color.isByColor) {
      const rgb: [number, number, number] = [numberOr(color.red, 0), numberOr(color.green, 0), numberOr(color.blue, 0)]
      return { color: layerColor, rgb }
    }
    if (color.isByLayer) return { color: layerColor }
    if (color.isByBlock) return { color: blockColor ?? layerColor }
    return { color: numberOr(color.colorIndex, 7) }
  }

  /** Emit an insert marker and flatten the block definition beneath it. */
  private insert(entity: AcDbBlockReference, xf: Xform, insertPath: string, ownerInsertId: string | undefined, depth: number, blockPath: readonly string[]): void {
    const id = entityId(entity, insertPath)
    const layer = layerNameOf(entity)
    const color = this.colorOf(entity, layer, undefined)
    const scale = entity.scaleFactors
    if (this.includeInsertMarkers) {
      this.push({
        id,
        k: 'insert',
        layer,
        color: color.color,
        rgb: color.rgb,
        lt: lineTypeOf(entity),
        lw: lineWeightOf(entity),
        g: ownerInsertId,
        block: entity.blockName,
        p: applyPoint(xf, entity.position),
        rot: rotateAngle(xf, entity.rotation ?? 0),
        scale: [numberOr(scale?.x, 1), numberOr(scale?.y, 1)]
      })
    }
    if (!this.flattenInserts) return
    if (depth >= this.maxInsertDepth) {
      this.countUnsupported('INSERT_DEPTH')
      return
    }
    const record = entity.blockTableRecord as AcDbBlockTableRecord | undefined
    if (!record) {
      this.countUnsupported('INSERT_UNRESOLVED')
      return
    }
    const world = multiplyTransforms(xf, entity.blockTransform)
    // A block that refers to itself, directly or through a cycle, is reported
    // rather than expanded forever.
    if (blockPath.includes(record.name)) {
      this.countUnsupported('BLOCK_CYCLE')
      return
    }
    const childPath = `${id}/`
    const childBlocks = [...blockPath, record.name]
    for (const child of record.newIterator()) {
      if (this.emitted >= this.maxEntities) {
        this.build.truncated = true
        return
      }
      this.entity(child, world, childPath, id, depth + 1, childBlocks)
    }
    // Attribute values replace the block's ATTDEFs where the insert shows them.
    for (const attribute of entity.attributeIterator()) {
      if (this.skipInvisible && (attribute.isInvisible === true || attribute.visibility === false)) continue
      if (this.emitted >= this.maxEntities) {
        this.build.truncated = true
        return
      }
      const attributeLayer = layerNameOf(attribute)
      const attributeColor = this.colorOf(attribute, attributeLayer, color.color)
      const attributeId = `${insertPath}${id}/${attribute.objectId}`.replace(/\/+/g, '/')
      const attributeValue = decodeDxfText(attribute.textString ?? '')
      this.push({
        id: attributeId,
        k: 'text',
        layer: attributeLayer,
        color: attributeColor.color,
        rgb: attributeColor.rgb,
        lt: lineTypeOf(attribute),
        lw: lineWeightOf(attribute),
        g: id,
        t: attributeValue,
        p: applyPoint(world, attribute.position),
        h: (attribute.height ?? 0) * world.scale,
        rot: rotateAngle(world, attribute.rotation ?? 0),
        // The pinned data-model writer does not carry an ATTRIB's vertical
        // justification (it writes group 74 as the lock flag), so the model keeps
        // the horizontal mode and leaves the vertical one to the writer's default.
        // Otherwise every write would read back as an alignment change the source
        // drawing does not show. Reported as a known writer limitation.
        ...(attributeValue.length > 0 ? { ha: numberOr(attribute.horizontalMode, 0) } : {})
      })
    }
  }

  /** Emit one primitive per hatch boundary loop, or an unsupported marker when none is available. */
  private hatch(entity: AcDbEntity, xf: Xform, base: Omit<EcadEntity, 'k'>): void {
    const loops = hatchLoops(entity)
    if (loops.length === 0) {
      this.countUnsupported('HATCH')
      this.push({ ...base, k: 'unsupported', src: 'HATCH' })
      return
    }
    // A multi-loop hatch becomes more than one primitive, so the ids get a
    // loop suffix and the loops are ordered geometrically: the same drawing then
    // produces the same ids and the same order after a write and re-read.
    const ordered = loops.length > 1 ? [...loops].sort(compareLoops) : loops
    for (let index = 0; index < ordered.length; index += 1) {
      const loop = ordered[index]!
      if (loop.length < 3) continue
      const id = ordered.length > 1 ? `${base.id}#${index}` : base.id
      this.push({ ...base, id, k: 'hatch', pts: loop.map(point => applyPoint(xf, point)), closed: true, approx: true, src: 'HATCH' })
    }
  }

  /** Emit a dimension placeholder from its definition points and text. */
  private dimension(entity: AcDbEntity, xf: Xform, base: Omit<EcadEntity, 'k'>): void {
    const dimension = entity as unknown as DimensionLike
    const pts: EcadPoint[] = []
    for (const candidate of [dimension.xLine1Point, dimension.xLine2Point, dimension.dimLinePoint]) {
      if (!candidate) continue
      const point = applyPoint(xf, candidate)
      if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) continue
      if (point[0] === 0 && point[1] === 0) continue
      pts.push(point)
    }
    const measurement = numberOr(dimension.measurement, Number.NaN)
    const text = typeof dimension.dimensionText === 'string' && dimension.dimensionText.length > 0 ? decodeDxfText(dimension.dimensionText) : Number.isFinite(measurement) ? formatMeasurement(measurement) : undefined
    const placement = dimension.textPosition ?? dimension.dimBlockPosition
    this.push({
      ...base,
      k: 'dimension',
      pts,
      p: placement ? applyPoint(xf, placement) : undefined,
      rot: placement ? rotateAngle(xf, numberOr(dimension.textRotation, 0)) : undefined,
      t: text,
      approx: true,
      src: 'DIMENSION'
    })
  }
}

/** Shape of `AcDbText` fields the model reads. */
interface TextLike {
  readonly textString?: string
  readonly position?: Vec3
  readonly alignmentPoint?: Vec3
  readonly hasAlignmentPoint?: boolean
  readonly height?: number
  readonly rotation?: number
  readonly horizontalMode?: number
  readonly verticalMode?: number
}

/** Shape of `AcDbMText` fields the model reads. */
interface MTextLike {
  readonly contents?: string
  readonly location?: Vec3
  readonly height?: number
  readonly width?: number
  readonly rotation?: number
  readonly attachmentPoint?: number
}

/** Shape of `AcDbDimension` fields the model reads. */
interface DimensionLike {
  readonly dimensionText?: string | null
  readonly measurement?: number
  readonly textPosition?: Vec3
  readonly dimBlockPosition?: Vec3
  readonly textRotation?: number
  readonly xLine1Point?: Vec3
  readonly xLine2Point?: Vec3
  readonly dimLinePoint?: Vec3
}

/** The parts of `AcCmColor` the model reads. */
interface ColorLike {
  readonly isByLayer?: boolean
  readonly isByBlock?: boolean
  readonly isByColor?: boolean
  readonly colorIndex?: number
  readonly red?: number
  readonly green?: number
  readonly blue?: number
}

/** A 3D coordinate carrier. */
interface Vec3 {
  readonly x: number
  readonly y: number
  readonly z?: number
}

/**
 * Read the layer table into resolved rows.
 *
 * @param db - drawing database.
 */
function readLayers(db: AcDbDatabase): EcadLayer[] {
  const out: EcadLayer[] = []
  for (const record of db.tables.layerTable.newIterator()) {
    out.push(layerOf(record))
  }
  out.sort((a, b) => a.name.localeCompare(b.name))
  return out
}

/**
 * One layer row with its colour resolved.
 *
 * @param record - layer table record.
 */
function layerOf(record: AcDbLayerTableRecord): EcadLayer {
  const color = (record as unknown as { color?: ColorLike }).color
  let index = 7
  let rgb: readonly [number, number, number] | undefined
  if (color) {
    if (color.isByColor) {
      rgb = [numberOr(color.red, 0), numberOr(color.green, 0), numberOr(color.blue, 0)]
      index = numberOr(color.colorIndex, 7)
    } else {
      index = numberOr(color.colorIndex, 7)
      if (index === 0 || index === 256) index = 7
    }
  }
  const record2 = record as unknown as { isOff?: boolean; isFrozen?: boolean; isLocked?: boolean }
  return {
    name: record.name || '0',
    color: index,
    rgb,
    visible: !(record2.isOff === true || record2.isFrozen === true),
    frozen: record2.isFrozen === true || undefined,
    locked: record2.isLocked === true || undefined
  }
}

/**
 * Summarise every block definition, excluding model and paper space.
 *
 * @param db - drawing database.
 */
function readBlocks(db: AcDbDatabase): EcadBlockSummary[] {
  const out: EcadBlockSummary[] = []
  for (const record of db.tables.blockTable.newIterator()) {
    if (record.isModelSapce === true || record.isPaperSapce === true) continue
    let entities = 0
    for (const _entity of record.newIterator()) entities += 1
    out.push({ name: record.name, entities, external: record.isXref === true })
  }
  return out
}

/**
 * Layout name for one block table record: the layout record's name where the
 * database has one, else the block record name with its `*` prefix removed.
 *
 * @param db - drawing database.
 * @param record - block table record for a layout.
 * @param isModel - whether this is model space.
 */
function layoutNameOf(db: AcDbDatabase, record: AcDbBlockTableRecord, isModel: boolean): string {
  if (isModel) return 'Model'
  const layout = db.objects.layout.getBtrIdAt(record.objectId)
  const name = layout?.layoutName
  if (typeof name === 'string' && name.length > 0 && !name.startsWith('*')) return name
  const recordName = record.name ?? ''
  return recordName.replace(/^\*/, '') || 'Layout'
}

/**
 * Stable primitive id: the object handle at top level, the insert path plus the
 * handle for flattened block content.
 *
 * @param entity - source entity.
 * @param insertPath - enclosing insert id prefix.
 */
function entityId(entity: AcDbEntity, insertPath: string): string {
  const id = String(entity.objectId ?? '')
  return insertPath.length > 0 ? `${insertPath}${id}` : id
}

/**
 * The DXF record type of an entity (`LINE`, `INSERT`, …).
 *
 * @param entity - source entity.
 */
function dxfTypeNameOf(entity: AcDbEntity): string {
  const typed = entity as unknown as { dxfTypeName?: string; type?: string }
  if (typeof typed.dxfTypeName === 'string' && typed.dxfTypeName.length > 0) return typed.dxfTypeName
  if (typeof typed.type === 'string') return typed.type.toUpperCase()
  return 'UNKNOWN'
}

/**
 * Layer name of an entity, defaulting to `0`.
 *
 * @param entity - source entity.
 */
function layerNameOf(entity: AcDbEntity): string {
  const layer = (entity as unknown as { layer?: string }).layer
  return typeof layer === 'string' && layer.length > 0 ? layer : '0'
}

/**
 * Linetype name of an entity.
 *
 * @param entity - source entity.
 */
function lineTypeOf(entity: AcDbEntity): string | undefined {
  const lineType = (entity as unknown as { lineType?: string }).lineType
  return typeof lineType === 'string' && lineType.length > 0 ? lineType : undefined
}

/**
 * Lineweight of an entity in 1/100 mm, `-1` when by layer.
 *
 * @param entity - source entity.
 */
function lineWeightOf(entity: AcDbEntity): number | undefined {
  const value = (entity as unknown as { lineWeight?: number }).lineWeight
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Closed flag of a curve entity.
 *
 * @param entity - source entity.
 */
function closedOf(entity: AcDbEntity): boolean {
  return (entity as unknown as { closed?: boolean }).closed === true
}

/**
 * True when an arc or ellipse was drawn through a transform that changes its
 * shape (non-uniform scale or a mirror), so the emitted primitive is an
 * approximation.
 *
 * @param xf - transform in effect.
 */
function arcApproximate(xf: Xform): boolean {
  return !xf.uniform || xf.reflected
}

/**
 * Derive a 2D transform from a 4×4 column-major matrix.
 *
 * @param matrix - block reference transform; identity when absent.
 */
function transformOf(matrix: AcGeMatrix3d | undefined): Xform {
  const e = matrix?.elements
  if (!e || e.length !== 16) return IDENTITY_XFORM
  const identity = e.every((value, index) => value === IDENTITY_ELEMENTS[index])
  if (identity) return IDENTITY_XFORM
  const xLength = Math.hypot(e[0]!, e[1]!)
  const yLength = Math.hypot(e[4]!, e[5]!)
  const determinant = e[0]! * e[5]! - e[4]! * e[1]!
  const scale = Math.sqrt(Math.abs(determinant)) || xLength || 1
  const uniform = Math.abs(xLength - yLength) <= Math.max(1e-9, 1e-9 * Math.max(xLength, yLength))
  return {
    e,
    identity: false,
    scale,
    rotation: Math.atan2(e[1]!, e[0]!),
    uniform,
    reflected: determinant < 0
  }
}

/**
 * Compose the enclosing transform with one block reference transform.
 *
 * @param xf - enclosing transform.
 * @param matrix - the insert's block-local transform.
 */
function multiplyTransforms(xf: Xform, matrix: AcGeMatrix3d | undefined): Xform {
  if (!matrix) return xf
  const child = transformOf(matrix)
  if (xf.identity) return child
  if (child.identity) return xf
  const composed = new AcGeMatrix3d()
  composed.multiplyMatrices(matrixOf(xf), matrix)
  return transformOf(composed)
}

/**
 * Rebuild a matrix from a transform's elements.
 *
 * @param xf - transform.
 */
function matrixOf(xf: Xform): AcGeMatrix3d {
  const matrix = new AcGeMatrix3d()
  matrix.fromArray([...xf.e])
  return matrix
}

/**
 * Apply the transform to a point.
 *
 * @param xf - transform.
 * @param point - source point.
 */
function applyPoint(xf: Xform, point: Vec3 | undefined): EcadPoint {
  const x = numberOr(point?.x, 0)
  const y = numberOr(point?.y, 0)
  if (xf.identity) return [x, y]
  const e = xf.e
  return [e[0]! * x + e[4]! * y + e[12]!, e[1]! * x + e[5]! * y + e[13]!]
}

/**
 * Rotate an angle by the transform's rotation.
 *
 * @param xf - transform.
 * @param angle - source angle in radians.
 */
function rotateAngle(xf: Xform, angle: number): number {
  const value = numberOr(angle, 0)
  return xf.identity ? value : value + xf.rotation
}

/**
 * Angle of a 2D direction vector, `0` when absent.
 *
 * @param vector - direction.
 */
function angleOf(vector: Vec3 | undefined): number {
  if (!vector) return 0
  return Math.atan2(numberOr(vector.y, 0), numberOr(vector.x, 0))
}

/**
 * Tessellate an LWPOLYLINE, including its bulge arcs.
 *
 * @param entity - polyline entity.
 * @param xf - transform in effect.
 */
function lwPolylinePoints(entity: AcDbEntity, xf: Xform): { points: EcadPoint[]; approx: boolean } {
  const polyline = entity as unknown as {
    numberOfVertices?: number
    getPoint2dAt?: (index: number) => { x: number; y: number }
  }
  const count = Math.max(0, Math.trunc(numberOr(polyline.numberOfVertices, 0)))
  const vertices: GeoVertex[] = []
  for (let index = 0; index < count; index += 1) {
    const point = polyline.getPoint2dAt?.(index)
    vertices.push({ x: numberOr(point?.x, 0), y: numberOr(point?.y, 0), bulge: bulletOf(entity, index) })
  }
  return tessellateBulges(vertices, closedOf(entity), xf)
}

/**
 * The bulge of one polyline vertex, read from the private geometry carrier.
 *
 * @param entity - polyline entity.
 * @param index - vertex index.
 */
function bulletOf(entity: AcDbEntity, index: number): number {
  const geo = (entity as unknown as EntityGeo)._geo
  const vertex = geo?.vertices?.[index]
  return numberOr(vertex?.bulge, 0)
}

/**
 * Tessellate a 2D polyline (legacy `POLYLINE`), including bulges.
 *
 * @param entity - polyline entity.
 * @param xf - transform in effect.
 */
function twoDPolylinePoints(entity: AcDbEntity, xf: Xform): { points: EcadPoint[]; approx: boolean } {
  const polyline = entity as unknown as {
    numberOfVertices?: number
    getPointAt?: (index: number) => { x: number; y: number }
    getBulgeAt?: (index: number) => number
  }
  const count = Math.max(0, Math.trunc(numberOr(polyline.numberOfVertices, 0)))
  const vertices: GeoVertex[] = []
  for (let index = 0; index < count; index += 1) {
    const point = polyline.getPointAt?.(index)
    vertices.push({ x: numberOr(point?.x, 0), y: numberOr(point?.y, 0), bulge: numberOr(polyline.getBulgeAt?.(index), 0) })
  }
  return tessellateBulges(vertices, closedOf(entity), xf)
}

/**
 * Expand a vertex list into straight segments and tessellated bulge arcs.
 *
 * @param vertices - vertices with optional bulges.
 * @param closed - whether the last vertex joins the first.
 * @param xf - transform in effect.
 */
function tessellateBulges(vertices: readonly GeoVertex[], closed: boolean, xf: Xform): { points: EcadPoint[]; approx: boolean } {
  const points: EcadPoint[] = []
  let approx = false
  if (vertices.length === 0) return { points, approx }
  const segmentCount = closed ? vertices.length : vertices.length - 1
  points.push(applyPoint(xf, vertices[0]!))
  for (let index = 0; index < segmentCount; index += 1) {
    const start = vertices[index]!
    const end = vertices[(index + 1) % vertices.length]!
    const bulge = numberOr(start.bulge, 0)
    if (bulge === 0) {
      points.push(applyPoint(xf, end))
      continue
    }
    approx = true
    const arc = bulgeArcPoints(start, end, bulge)
    for (const point of arc) points.push(applyPoint(xf, point))
  }
  return { points, approx }
}

/**
 * Tessellate one bulge segment (`bulge` = tan of a quarter of the included
 * angle, positive counter-clockwise) into points between its endpoints.
 *
 * @param start - segment start.
 * @param end - segment end.
 * @param bulge - bulge value.
 */
function bulgeArcPoints(start: GeoVertex, end: GeoVertex, bulge: number): Vec3[] {
  const theta = 4 * Math.atan(bulge)
  if (!Number.isFinite(theta) || Math.abs(theta) < 1e-9) return [{ x: end.x, y: end.y }]
  const dx = end.x - start.x
  const dy = end.y - start.y
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-12) return [{ x: end.x, y: end.y }]
  const radius = chord / (2 * Math.sin(Math.abs(theta) / 2))
  const half = Math.tan(theta / 2)
  const offset = Math.abs(half) < 1e-12 ? 0 : chord / (2 * half)
  const centerX = (start.x + end.x) / 2 + (-dy / chord) * offset
  const centerY = (start.y + end.y) / 2 + (dx / chord) * offset
  const startAngle = Math.atan2(start.y - centerY, start.x - centerX)
  const sweep = theta
  const segments = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 12)))
  const points: Vec3[] = []
  for (let index = 1; index <= segments; index += 1) {
    const angle = startAngle + (sweep * index) / segments
    points.push({ x: centerX + radius * Math.cos(angle), y: centerY + radius * Math.sin(angle) })
  }
  return points
}

/**
 * Tessellate a spline from its control or fit points.
 *
 * @param entity - spline entity.
 * @param xf - transform in effect.
 */
function splinePoints(entity: AcDbEntity, xf: Xform): EcadPoint[] {
  const geo = (entity as unknown as EntityGeo)._geo
  const sampleCount = 64
  let samples: ReadonlyArray<Vec3> | undefined
  if (typeof geo?.getPoints === 'function') {
    try {
      const points = geo.getPoints(sampleCount)
      if (Array.isArray(points) && points.length >= 2) samples = points
    } catch {
      samples = undefined
    }
  }
  if (!samples) {
    const grip = (entity as unknown as { subGetGripPoints?: () => Vec3[] }).subGetGripPoints
    if (typeof grip === 'function') {
      try {
        const points = grip.call(entity)
        if (Array.isArray(points) && points.length >= 2) samples = points
      } catch {
        samples = undefined
      }
    }
  }
  if (!samples) {
    const control = geo?.controlPoints ?? geo?.fitPoints
    if (control && control.length >= 2) samples = control
  }
  if (!samples) return []
  return samples.map(point => applyPoint(xf, point))
}

/**
 * Alignment fields of one text primitive.
 *
 * Empty text carries no alignment: it draws nothing, and a write and re-read may
 * normalise the alignment codes of an empty value, which would otherwise read as
 * a change that no person can see.
 *
 * @param value - decoded text.
 * @param ha - horizontal alignment mode.
 * @param va - vertical alignment mode.
 */
function textAlignment(value: string, ha: number, va: number): { ha?: number; va?: number } {
  if (value.length === 0) return {}
  return { ha, va }
}

/**
 * Deterministic order for hatch boundary loops: by lower-left corner, then by
 * point count. A write and re-read can reorder loops; sorting keeps ids stable.
 *
 * @param a - first loop.
 * @param b - second loop.
 */
function compareLoops(a: ReadonlyArray<{ x: number; y: number }>, b: ReadonlyArray<{ x: number; y: number }>): number {
  const boxA = loopBox(a)
  const boxB = loopBox(b)
  if (boxA.minX !== boxB.minX) return boxA.minX - boxB.minX
  if (boxA.minY !== boxB.minY) return boxA.minY - boxB.minY
  if (boxA.maxX !== boxB.maxX) return boxA.maxX - boxB.maxX
  if (boxA.maxY !== boxB.maxY) return boxA.maxY - boxB.maxY
  return a.length - b.length
}

/**
 * Bounding box of a boundary loop.
 *
 * @param loop - loop points.
 */
function loopBox(loop: ReadonlyArray<{ x: number; y: number }>): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const point of loop) {
    if (point.x < minX) minX = point.x
    if (point.y < minY) minY = point.y
    if (point.x > maxX) maxX = point.x
    if (point.y > maxY) maxY = point.y
  }
  return { minX, minY, maxX, maxY }
}

/**
 * The four corners of a SOLID or TRACE in drawing order (1 → 2 → 4 → 3).
 *
 * @param entity - solid or trace entity.
 * @param xf - transform in effect.
 */
function fourPointEntity(entity: AcDbEntity, xf: Xform): EcadPoint[] {
  const solid = entity as unknown as { getPointAt?: (index: number) => Vec3 }
  const raw: Vec3[] = []
  for (let index = 0; index < 4; index += 1) {
    const point = solid.getPointAt?.(index)
    if (!point) continue
    raw.push(point)
  }
  const order = [0, 1, 3, 2]
  const points: EcadPoint[] = []
  for (const index of order) {
    const point = raw[index]
    if (point) points.push(applyPoint(xf, point))
  }
  return points
}

/**
 * Boundary loops of a hatch, tessellated. Empty when the boundary is associative
 * and not carried in the entity.
 *
 * @param entity - hatch entity.
 */
function hatchLoops(entity: AcDbEntity): Array<Array<{ x: number; y: number }>> {
  const geo = (entity as unknown as EntityGeo)._geo
  const loops = geo?.loops
  const out: Array<Array<{ x: number; y: number }>> = []
  if (loops && loops.length > 0) {
    for (const loop of loops) {
      try {
        const points = loop.tessellate?.()
        if (Array.isArray(points) && points.length >= 3) out.push(points.map(point => ({ x: numberOr(point.x, 0), y: numberOr(point.y, 0) })))
      } catch {
        // Fall through to the grip-point path below.
      }
    }
  }
  if (out.length > 0) return out
  const grip = (entity as unknown as { subGetGripPoints?: () => Vec3[] }).subGetGripPoints
  if (typeof grip === 'function') {
    try {
      const points = grip.call(entity)
      if (Array.isArray(points) && points.length >= 3) out.push(points.map(point => ({ x: numberOr(point.x, 0), y: numberOr(point.y, 0) })))
    } catch {
      // No usable boundary.
    }
  }
  return out
}

/**
 * Format a dimension measurement the way AutoCAD shows it: up to two decimals,
 * no trailing zeros.
 *
 * @param value - measured value in drawing units.
 */
function formatMeasurement(value: number): string {
  if (!Number.isFinite(value)) return ''
  const rounded = Math.round(value * 100) / 100
  return Number.isInteger(rounded) ? rounded.toFixed(1) : String(rounded)
}

/**
 * Grow a box with one primitive's approximate bounds.
 *
 * @param box - mutable box.
 * @param entity - emitted primitive.
 */
function extendBox(box: MutableBox, entity: EcadEntity): void {
  const bounds = entityBounds(entity)
  if (!bounds) return
  box.minX = Math.min(box.minX, bounds.min[0])
  box.minY = Math.min(box.minY, bounds.min[1])
  box.maxX = Math.max(box.maxX, bounds.max[0])
  box.maxY = Math.max(box.maxY, bounds.max[1])
  box.empty = false
}

/**
 * Approximate bounds of one emitted primitive, in drawing units.
 *
 * Text and MText use an estimated glyph width, ellipses are sampled at 16
 * points, and arcs account for any cardinal angle they sweep. The result is
 * what the renderer fits and what the layout extents report.
 *
 * @param entity - emitted primitive.
 * @returns the bounds, or `undefined` when the primitive has no geometry.
 */
export function entityBounds(entity: EcadEntity): EcadBox | undefined {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const extend = (x: number, y: number): void => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  switch (entity.k) {
    case 'line':
    case 'polyline':
    case 'spline':
    case 'solid':
    case 'hatch':
    case 'leader': {
      for (const point of entity.pts ?? []) extend(point[0], point[1])
      break
    }
    case 'circle':
    case 'arc': {
      const center = entity.c
      const radius = numberOr(entity.r, 0)
      if (!center) return undefined
      if (entity.k === 'circle') {
        extend(center[0] - radius, center[1] - radius)
        extend(center[0] + radius, center[1] + radius)
        break
      }
      // An arc's bounds are its endpoints plus any cardinal angle it sweeps.
      const a0 = numberOr(entity.a0, 0)
      let a1 = numberOr(entity.a1, 0)
      if (a1 < a0) a1 += Math.PI * 2
      extend(center[0] + radius * Math.cos(a0), center[1] + radius * Math.sin(a0))
      extend(center[0] + radius * Math.cos(a1), center[1] + radius * Math.sin(a1))
      for (let turn = 0; turn < 4; turn += 1) {
        const angle = (turn * Math.PI) / 2
        if (angle > a0 && angle < a1) extend(center[0] + radius * Math.cos(angle), center[1] + radius * Math.sin(angle))
      }
      break
    }
    case 'ellipse': {
      const center = entity.c
      if (!center) return undefined
      const rx = numberOr(entity.rx, 0)
      const ry = numberOr(entity.ry, 0)
      const rot = numberOr(entity.rot, 0)
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2
        const x = rx * Math.cos(angle)
        const y = ry * Math.sin(angle)
        extend(center[0] + x * Math.cos(rot) - y * Math.sin(rot), center[1] + x * Math.sin(rot) + y * Math.cos(rot))
      }
      break
    }
    case 'text':
    case 'mtext': {
      const height = Math.max(numberOr(entity.h, 0), 0)
      const referenceWidth = numberOr(entity.w, 0)
      const width = entity.k === 'mtext' && referenceWidth > 0 ? referenceWidth : textWidthEm(entity.t ?? '') * height
      const origin = entity.p
      if (!origin) return undefined
      const rot = numberOr(entity.rot, 0)
      const ha = numberOr(entity.ha, 0)
      const left = ha === 1 ? -width / 2 : ha === 2 ? -width : 0
      for (const [dx, dy] of [[left, 0], [left + width, 0], [left, height], [left + width, height]] as const) {
        extend(origin[0] + dx * Math.cos(rot) - dy * Math.sin(rot), origin[1] + dx * Math.sin(rot) + dy * Math.cos(rot))
      }
      break
    }
    case 'point': {
      const point = entity.p
      if (!point) return undefined
      extend(point[0], point[1])
      break
    }
    case 'viewport': {
      const center = entity.p
      if (!center) return undefined
      const halfWidth = numberOr(entity.w, 0) / 2
      const halfHeight = numberOr(entity.h, 0) / 2
      extend(center[0] - halfWidth, center[1] - halfHeight)
      extend(center[0] + halfWidth, center[1] + halfHeight)
      break
    }
    case 'dimension': {
      for (const point of entity.pts ?? []) extend(point[0], point[1])
      if (entity.p) extend(entity.p[0], entity.p[1])
      break
    }
    case 'insert':
    case 'unsupported':
      return undefined
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return undefined
  return { min: [minX, minY], max: [maxX, maxY] }
}

/**
 * Union of two optional boxes.
 *
 * @param a - first box.
 * @param b - second box.
 */
export function unionBounds(a: EcadBox | undefined, b: EcadBox | undefined): EcadBox | undefined {
  if (!a) return b
  if (!b) return a
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])]
  }
}

/**
 * Freeze a mutable box into the JSON form, falling back to the origin for an
 * empty layout.
 *
 * @param box - accumulated box.
 */
function freezeBox(box: MutableBox): EcadBox {
  if (box.empty) return { min: [0, 0], max: [0, 0] }
  return { min: [box.minX, box.minY], max: [box.maxX, box.maxY] }
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
