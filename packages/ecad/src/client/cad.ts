/**
 * The CAD workspace's pure geometry: screen/world inversion, the selection set,
 * marquee window/crossing maths, picking, object snaps, the viewport helpers and
 * the grip handles of an entity.
 *
 * Nothing in this module touches React or the DOM. The body owns pointer state
 * and the SVG layer renders what these functions return, so every rule a reader
 * can feel with the mouse is judged here by the node tests without a browser.
 *
 * Coordinates are drawing units unless a name says `screen`/`Screen`; a screen
 * point is a CSS pixel inside the canvas element.
 *
 * @module dsh-engineering-ecad/client/cad
 */

import type { EcadBox, EcadEntity, EcadPoint } from '../engine/types.ts'
import type { EcadFit } from './scene.ts'
import { entityBounds } from './scene.ts'
import { worldAt, type EcadEditView } from './edits.ts'

/** The pane's zoom limits. */
export const MIN_ZOOM = 0.25
/** The pane's zoom ceiling; a print sheet reads fine at 60×. */
export const MAX_ZOOM = 60
/** Screen-space movement below this is a click, not a drag. */
export const DRAG_THRESHOLD = 3

/** One point in canvas CSS pixels. */
export interface CadScreenPoint {
  readonly x: number
  readonly y: number
}

/** An axis-aligned box in canvas CSS pixels. */
export interface CadScreenBox {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** How a click joins the selection set. */
export type CadSelectionMode = 'replace' | 'add' | 'toggle'

/** The two marquee modes, named the way CAD software names them. */
export type CadMarqueeMode = 'window' | 'crossing'

/** One selection gesture's rectangle. */
export interface CadMarquee {
  readonly box: CadScreenBox
  readonly mode: CadMarqueeMode
}

/** Clamp a zoom factor into the pane's usable range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom))
}

/**
 * Zoom around one screen point, keeping it fixed under the pointer.
 * @param view - current view.
 * @param factor - multiplier.
 * @param cx - screen x.
 * @param cy - screen y.
 * @returns the next view.
 */
export function zoomAt(view: EcadEditView, factor: number, cx: number, cy: number): EcadEditView {
  const zoom = clampZoom(view.zoom * factor)
  if (zoom === view.zoom || !Number.isFinite(cx) || !Number.isFinite(cy)) return view
  const ratio = zoom / view.zoom
  return { zoom, panX: cx - ratio * (cx - view.panX), panY: cy - ratio * (cy - view.panY) }
}

/**
 * The world point under one screen point.
 * @param screen - point in canvas CSS pixels.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @returns the point in drawing units.
 */
export function toWorld(screen: CadScreenPoint, fit: EcadFit, view: EcadEditView): readonly [number, number] {
  return worldAt(screen, fit, view)
}

/**
 * The screen point over one world point, the exact inverse of {@link worldAt}.
 * @param point - drawing-unit point.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @returns the point in canvas CSS pixels.
 */
export function toScreen(point: EcadPoint, fit: EcadFit, view: EcadEditView): readonly [number, number] {
  const scale = fit.scale * view.zoom
  if (!Number.isFinite(scale) || scale === 0) return [0, 0]
  const fittedX = fit.translateX + point[0] * fit.scale
  const fittedY = fit.translateY - point[1] * fit.scale
  return [view.panX + fittedX * view.zoom, view.panY + fittedY * view.zoom]
}

/**
 * One drawing-unit box as a screen-space box.
 * @param box - drawing-unit bounds.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @returns the screen box, min/max normalised after the Y flip.
 */
export function screenBoxOf(box: EcadBox, fit: EcadFit, view: EcadEditView): CadScreenBox {
  const [x1, y1] = toScreen(box.min, fit, view)
  const [x2, y2] = toScreen(box.max, fit, view)
  return {
    minX: Math.min(x1, x2),
    minY: Math.min(y1, y2),
    maxX: Math.max(x1, x2),
    maxY: Math.max(y1, y2),
  }
}

/**
 * A screen box from two corner points, min/max normalised.
 * @param a - first corner.
 * @param b - second corner.
 * @returns the normalised box.
 */
export function screenBoxOfPoints(a: CadScreenPoint, b: CadScreenPoint): CadScreenBox {
  return {
    minX: Math.min(a.x, b.x),
    minY: Math.min(a.y, b.y),
    maxX: Math.max(a.x, b.x),
    maxY: Math.max(a.y, b.y),
  }
}

/**
 * Whether a screen point lies in a screen box, with an optional pad.
 * @param box - the box.
 * @param point - the point.
 * @param pad - pixels added to every side.
 * @returns true when inside.
 */
export function screenBoxHasPoint(box: CadScreenBox, point: CadScreenPoint, pad = 0): boolean {
  return point.x >= box.minX - pad && point.x <= box.maxX + pad && point.y >= box.minY - pad && point.y <= box.maxY + pad
}

/**
 * Whether a screen box contains another one.
 * @param outer - the containing box.
 * @param inner - the box that must be inside.
 * @returns true when `inner` is fully enclosed.
 */
export function screenBoxContains(outer: CadScreenBox, inner: CadScreenBox): boolean {
  return inner.minX >= outer.minX && inner.maxX <= outer.maxX && inner.minY >= outer.minY && inner.maxY <= outer.maxY
}

/**
 * Whether two screen boxes overlap (touching counts).
 * @param a - first box.
 * @param b - second box.
 * @returns true when they overlap.
 */
export function screenBoxIntersects(a: CadScreenBox, b: CadScreenBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
}

/**
 * Round a value so an op does not carry float noise.
 * @param value - coordinate in drawing units.
 * @returns the value at six decimals; `-0` is normalised to `0`.
 */
export function roundValue(value: number): number {
  const rounded = Math.round(value * 1_000_000) / 1_000_000
  return Object.is(rounded, -0) ? 0 : rounded
}

/**
 * Shrink a screen box by a margin so a window/marquee gesture that starts with a
 * tiny jitter still encloses what the reader meant to enclose.
 * @param box - the box.
 * @param margin - pixels to add to every side.
 * @returns the grown box.
 */
export function growScreenBox(box: CadScreenBox, margin: number): CadScreenBox {
  return { minX: box.minX - margin, minY: box.minY - margin, maxX: box.maxX + margin, maxY: box.maxY + margin }
}

/**
 * The marquee a left-drag describes: left→right is a window selection, right→left
 * a crossing selection.
 * @param start - screen point where the drag began.
 * @param end - current screen point.
 * @returns the normalised box and its mode.
 */
export function marqueeOf(start: CadScreenPoint, end: CadScreenPoint): CadMarquee {
  return { box: screenBoxOfPoints(start, end), mode: end.x >= start.x ? 'window' : 'crossing' }
}

/* ------------------------------------------------------------------ *
 * Selection set
 * ------------------------------------------------------------------ */

/**
 * Add, toggle or replace one id in an ordered selection set.
 * @param current - the selected ids, in selection order.
 * @param id - id to select.
 * @param mode - gesture mode.
 * @returns the next selection; order is preserved and ids stay unique.
 */
export function selectId(current: readonly string[], id: string, mode: CadSelectionMode): readonly string[] {
  return selectIds(current, [id], mode)
}

/**
 * Add, toggle or replace several ids in an ordered selection set.
 * @param current - the selected ids, in selection order.
 * @param ids - ids to select.
 * @param mode - gesture mode.
 * @returns the next selection; order is preserved and ids stay unique.
 */
export function selectIds(current: readonly string[], ids: readonly string[], mode: CadSelectionMode): readonly string[] {
  if (mode === 'replace') {
    const next: string[] = []
    const seen = new Set<string>()
    for (const id of ids) {
      if (seen.has(id)) continue
      seen.add(id)
      next.push(id)
    }
    return next
  }
  let next = [...current]
  for (const id of ids) {
    const at = next.indexOf(id)
    if (mode === 'toggle' && at !== -1) {
      next = next.filter(candidate => candidate !== id)
      continue
    }
    if (at === -1) next.push(id)
  }
  if (mode === 'toggle') return next
  return next
}

/**
 * Remove ids from a selection.
 * @param current - the selected ids.
 * @param ids - ids to remove.
 * @returns the next selection.
 */
export function deselectIds(current: readonly string[], ids: readonly string[]): readonly string[] {
  if (ids.length === 0) return current
  const drop = new Set(ids)
  return current.filter(id => !drop.has(id))
}

/**
 * Keep only ids that still belong to the sheet.
 * @param current - the selected ids.
 * @param available - ids the active layout draws.
 * @returns the next selection; the input is returned when nothing was dropped.
 */
export function clampSelection(current: readonly string[], available: ReadonlySet<string>): readonly string[] {
  const kept = current.filter(id => available.has(id))
  return kept.length === current.length ? current : kept
}

/** @returns true when the id is selected. */
export function isSelected(current: readonly string[], id: string): boolean {
  return current.includes(id)
}

/* ------------------------------------------------------------------ *
 * Entity geometry helpers
 * ------------------------------------------------------------------ */

/** The most vertices of one polyline the marquee/hit sampling keeps. */
const MAX_SAMPLES = 512
/** The most samples a circle/arc/ellipse produces. */
const CURVE_SAMPLES = 32

/**
 * One entity's geometry as world points, for screen-space marquee and for
 * cursor-distance picking. Curves are sampled; text and blocks use their box
 * corners; inserts keep their placement point.
 * @param entity - the entity.
 * @returns the sample points, in drawing units.
 */
export function samplePointsOf(entity: EcadEntity): readonly EcadPoint[] {
  switch (entity.k) {
    case 'line':
    case 'polyline':
    case 'spline':
    case 'solid':
    case 'hatch':
    case 'leader':
    case 'dimension':
      return capSamples(entity.pts ?? [])
    case 'circle': {
      if (entity.c === undefined) return []
      const radius = Math.abs(entity.r ?? 0)
      return curvePoints(entity.c, radius, radius, 0, 0, Math.PI * 2)
    }
    case 'arc': {
      if (entity.c === undefined) return []
      const radius = Math.abs(entity.r ?? 0)
      const a0 = entity.a0 ?? 0
      let a1 = entity.a1 ?? 0
      if (a1 < a0) a1 += Math.PI * 2
      return curvePoints(entity.c, radius, radius, 0, a0, a1)
    }
    case 'ellipse': {
      if (entity.c === undefined) return []
      const a0 = entity.a0 ?? 0
      let a1 = entity.a1 ?? Math.PI * 2
      if (a1 < a0) a1 += Math.PI * 2
      return curvePoints(entity.c, Math.abs(entity.rx ?? 0), Math.abs(entity.ry ?? 0), entity.rot ?? 0, a0, a1)
    }
    case 'text':
    case 'mtext': {
      const box = entityBounds(entity)
      if (box === undefined) return entity.p === undefined ? [] : [entity.p]
      return [[box.min[0], box.min[1]], [box.max[0], box.min[1]], [box.max[0], box.max[1]], [box.min[0], box.max[1]]]
    }
    case 'point':
    case 'insert':
    case 'viewport': {
      if (entity.p !== undefined) return [entity.p]
      const box = entityBounds(entity)
      return box === undefined ? [] : [[box.min[0], box.min[1]], [box.max[0], box.max[1]]]
    }
    case 'unsupported':
      return []
  }
}

/** Keep a point list bounded while keeping its first and last vertex. */
function capSamples(points: readonly EcadPoint[]): readonly EcadPoint[] {
  if (points.length <= MAX_SAMPLES) return points
  const step = Math.ceil(points.length / MAX_SAMPLES)
  const kept: EcadPoint[] = []
  for (let index = 0; index < points.length; index += step) kept.push(points[index] as EcadPoint)
  const last = points[points.length - 1]
  if (last !== undefined && kept[kept.length - 1] !== last) kept.push(last)
  return kept
}

/** Sample a circular or elliptical arc into world points. */
function curvePoints(center: EcadPoint, rx: number, ry: number, rotation: number, a0: number, a1: number): readonly EcadPoint[] {
  const span = Math.abs(a1 - a0)
  const count = Math.max(8, Math.min(CURVE_SAMPLES, Math.ceil((span / (Math.PI * 2)) * CURVE_SAMPLES) + 1))
  const points: EcadPoint[] = []
  for (let index = 0; index <= count; index += 1) {
    const angle = a0 + ((a1 - a0) * index) / count
    const x = rx * Math.cos(angle)
    const y = ry * Math.sin(angle)
    points.push([
      center[0] + x * Math.cos(rotation) - y * Math.sin(rotation),
      center[1] + x * Math.sin(rotation) + y * Math.cos(rotation),
    ])
  }
  return points
}

/* ------------------------------------------------------------------ *
 * Picking index
 * ------------------------------------------------------------------ */

/** One entity in the pick index: its bounds, its sample points and its layer. */
export interface CadIndexEntry {
  readonly id: string
  readonly layer: string
  readonly entity: EcadEntity
  readonly bounds: EcadBox
  readonly samples: readonly EcadPoint[]
}

/** A world-space bucket grid over one layout's drawable entities. */
export interface CadIndex {
  /** Bucket size in drawing units. */
  readonly cell: number
  /** Cell key to entry indexes. */
  readonly cells: ReadonlyMap<string, readonly number[]>
  readonly entries: readonly CadIndexEntry[]
}

/** The key of one bucket cell. */
function cellKey(column: number, row: number): string {
  return `${column},${row}`
}

/**
 * Build the bucket grid the pane picks, marquees and snaps through.
 *
 * The grid is built once per layout (not per pointer move): a query then reads
 * only the cells around the cursor, so a 36k-primitive sheet stays interactive.
 * @param entities - one layout's entities, already filtered by the pane's layer visibility.
 * @param cell - bucket size in drawing units; defaults to a fraction of the sheet span.
 * @returns the index.
 */
export function buildIndex(entities: readonly EcadEntity[], cell?: number): CadIndex {
  const entries: CadIndexEntry[] = []
  let bounds: EcadBox | undefined
  for (const entity of entities) {
    const box = entityBounds(entity)
    if (box === undefined) continue
    bounds = bounds === undefined
      ? box
      : {
        min: [Math.min(bounds.min[0], box.min[0]), Math.min(bounds.min[1], box.min[1])],
        max: [Math.max(bounds.max[0], box.max[0]), Math.max(bounds.max[1], box.max[1])],
      }
    entries.push({ id: entity.id, layer: entity.layer.toUpperCase(), entity, bounds: box, samples: samplePointsOf(entity) })
  }
  let size = cell
  if (size === undefined || !Number.isFinite(size) || size <= 0) {
    if (bounds === undefined) size = 1
    else {
      const span = Math.max(bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1])
      size = Number.isFinite(span) && span > 0 ? span / 96 : 1
    }
  }
  const cells = new Map<string, number[]>()
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index] as CadIndexEntry
    const fromX = Math.floor(entry.bounds.min[0] / size)
    const toX = Math.floor(entry.bounds.max[0] / size)
    const fromY = Math.floor(entry.bounds.min[1] / size)
    const toY = Math.floor(entry.bounds.max[1] / size)
    for (let column = fromX; column <= toX; column += 1) {
      for (let row = fromY; row <= toY; row += 1) {
        const key = cellKey(column, row)
        const list = cells.get(key)
        if (list === undefined) cells.set(key, [index])
        else list.push(index)
      }
    }
  }
  return { cell: size, cells, entries }
}

/**
 * The entries whose bounds touch one world box.
 * @param index - the pick index.
 * @param box - query box in drawing units.
 * @param limit - most entries to return; the cap keeps one query bounded.
 * @returns the entries, at most `limit`.
 */
export function queryIndex(index: CadIndex, box: EcadBox, limit = 4096): readonly CadIndexEntry[] {
  const size = index.cell
  const fromX = Math.floor(box.min[0] / size)
  const toX = Math.floor(box.max[0] / size)
  const fromY = Math.floor(box.min[1] / size)
  const toY = Math.floor(box.max[1] / size)
  const seen = new Set<number>()
  const found: CadIndexEntry[] = []
  for (let column = fromX; column <= toX; column += 1) {
    for (let row = fromY; row <= toY; row += 1) {
      const list = index.cells.get(cellKey(column, row))
      if (list === undefined) continue
      for (const entryIndex of list) {
        if (seen.has(entryIndex)) continue
        seen.add(entryIndex)
        const entry = index.entries[entryIndex]
        if (entry === undefined) continue
        if (entry.bounds.max[0] < box.min[0] || entry.bounds.min[0] > box.max[0]) continue
        if (entry.bounds.max[1] < box.min[1] || entry.bounds.min[1] > box.max[1]) continue
        found.push(entry)
        if (found.length >= limit) return found
      }
    }
  }
  return found
}

/**
 * The squared distance from a point to a segment.
 * @param point - the point.
 * @param a - segment start.
 * @param b - segment end.
 * @returns the squared distance.
 */
export function pointSegmentDistanceSquared(point: CadPointLike, a: CadPointLike, b: CadPointLike): number {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  if (dx === 0 && dy === 0) {
    const px = point[0] - a[0]
    const py = point[1] - a[1]
    return px * px + py * py
  }
  const lengthSquared = dx * dx + dy * dy
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  const x = a[0] + t * dx - point[0]
  const y = a[1] + t * dy - point[1]
  return x * x + y * y
}

/** A readonly `[x, y]` pair the geometry helpers accept. */
export type CadPointLike = readonly [number, number]

/**
 * The distance from a world point to one entry's geometry, or `Infinity` when
 * the point is farther than the tolerance.
 * @param entry - one indexed entity.
 * @param point - world point under the cursor.
 * @param tolerance - pick tolerance in drawing units.
 * @returns the distance; `Infinity` means not picked.
 */
export function entryDistance(entry: CadIndexEntry, point: CadPointLike, tolerance: number): number {
  const entity = entry.entity
  const toleranceSquared = tolerance * tolerance
  if (entity.k === 'text' || entity.k === 'mtext' || entity.k === 'viewport' || entity.k === 'dimension') {
    const box = entry.bounds
    const inside = point[0] >= box.min[0] - tolerance && point[0] <= box.max[0] + tolerance
      && point[1] >= box.min[1] - tolerance && point[1] <= box.max[1] + tolerance
    return inside ? 0 : Infinity
  }
  if (entity.k === 'point') {
    const at = entity.p
    if (at === undefined) return Infinity
    const dx = point[0] - at[0]
    const dy = point[1] - at[1]
    const distance = dx * dx + dy * dy
    return distance <= toleranceSquared ? Math.sqrt(distance) : Infinity
  }
  if (entity.k === 'circle') {
    if (entity.c === undefined) return Infinity
    const dx = point[0] - entity.c[0]
    const dy = point[1] - entity.c[1]
    const distance = Math.abs(Math.sqrt(dx * dx + dy * dy) - Math.abs(entity.r ?? 0))
    return distance <= tolerance ? distance : Infinity
  }
  // Everything else is a polyline of sample points: line, polyline, arc, ellipse,
  // spline, hatch, solid, leader.
  let best = Infinity
  for (let index = 1; index < entry.samples.length; index += 1) {
    const a = entry.samples[index - 1] as CadPointLike
    const b = entry.samples[index] as CadPointLike
    const distance = pointSegmentDistanceSquared(point, a, b)
    if (distance < best) best = distance
  }
  if (entry.samples.length === 1) {
    const only = entry.samples[0] as CadPointLike
    const dx = point[0] - only[0]
    const dy = point[1] - only[1]
    best = dx * dx + dy * dy
  }
  if (!Number.isFinite(best)) return Infinity
  const distance = Math.sqrt(best)
  return distance <= tolerance ? distance : Infinity
}

/** Options one pick honours. */
export interface CadPickOptions {
  /** Layer names (upper case) whose content cannot be selected. */
  readonly locked?: ReadonlySet<string>
  /** Ids the caller wants excluded. */
  readonly exclude?: ReadonlySet<string>
}

/**
 * The topmost entity under one world point.
 *
 * The nearest entity wins; on a tie the entity drawn later (on top) wins, which
 * is how a CAD selection reads.
 * @param index - the pick index.
 * @param point - world point.
 * @param tolerance - pick tolerance in drawing units.
 * @param options - lock/exclude filters.
 * @returns the entity id, or undefined when nothing is hit.
 */
export function pickEntity(index: CadIndex, point: CadPointLike, tolerance: number, options: CadPickOptions = {}): string | undefined {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(tolerance) || tolerance <= 0) return undefined
  const box: EcadBox = {
    min: [point[0] - tolerance, point[1] - tolerance],
    max: [point[0] + tolerance, point[1] + tolerance],
  }
  const candidates = queryIndex(index, box)
  let bestId: string | undefined
  let bestDistance = Infinity
  for (const entry of candidates) {
    if (options.locked?.has(entry.layer) === true) continue
    if (options.exclude?.has(entry.id) === true) continue
    const distance = entryDistance(entry, point, tolerance)
    if (distance === Infinity) continue
    if (distance <= bestDistance) {
      // `<=` lets the later-drawn entry win an exact tie.
      bestDistance = distance
      bestId = entry.id
    }
  }
  return bestId
}

/**
 * The entities a marquee gesture selects.
 *
 * Window selections keep only entities fully enclosed in the rectangle; crossing
 * selections keep every entity the rectangle touches. The tests run in screen
 * space against sampled geometry rather than anchor points, so a circle near the
 * edge and a long diagonal line behave the way the drawing looks.
 * @param index - the pick index.
 * @param marquee - the selection rectangle and mode.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @param options - lock filter.
 * @returns the selected ids, in index order.
 */
export function marqueeSelect(index: CadIndex, marquee: CadMarquee, fit: EcadFit, view: EcadEditView, options: CadPickOptions = {}): readonly string[] {
  const { box, mode } = marquee
  if (box.maxX - box.minX < 0.5 || box.maxY - box.minY < 0.5) return []
  // One world-space query box around the screen rectangle, then the exact test.
  const corners = [
    toWorld({ x: box.minX, y: box.minY }, fit, view),
    toWorld({ x: box.maxX, y: box.minY }, fit, view),
    toWorld({ x: box.maxX, y: box.maxY }, fit, view),
    toWorld({ x: box.minX, y: box.maxY }, fit, view),
  ]
  const world: EcadBox = {
    min: [Math.min(...corners.map(corner => corner[0])), Math.min(...corners.map(corner => corner[1]))],
    max: [Math.max(...corners.map(corner => corner[0])), Math.max(...corners.map(corner => corner[1]))],
  }
  const candidates = queryIndex(index, world, 20000)
  const selected: string[] = []
  for (const entry of candidates) {
    if (options.locked?.has(entry.layer) === true) continue
    const screenSamples = entry.samples.map(sample => toScreen(sample, fit, view))
    if (screenSamples.length === 0) continue
    if (marqueeHits(screenSamples, box, mode)) selected.push(entry.id)
  }
  return selected
}

/**
 * Whether one entity's screen-space sample points satisfy a marquee.
 * @param samples - screen points on the entity.
 * @param box - the marquee rectangle.
 * @param mode - window or crossing.
 * @returns true when selected.
 */
export function marqueeHits(samples: readonly (readonly [number, number])[], box: CadScreenBox, mode: CadMarqueeMode): boolean {
  if (samples.length === 0) return false
  if (mode === 'window') {
    // A window selection keeps an entity only when all of it is inside. The
    // rectangle is convex, so every segment between two inside vertices is
    // inside; the curve samples stand in for the arc between vertices.
    for (const sample of samples) {
      if (!screenBoxHasPoint(box, { x: sample[0], y: sample[1] })) return false
    }
    return true
  }
  for (const sample of samples) {
    if (screenBoxHasPoint(box, { x: sample[0], y: sample[1] })) return true
  }
  for (let index = 1; index < samples.length; index += 1) {
    const a = samples[index - 1] as readonly [number, number]
    const b = samples[index] as readonly [number, number]
    if (segmentIntersectsBox(a, b, box)) return true
  }
  return false
}

/**
 * Whether a segment intersects an axis-aligned box (a segment fully inside or
 * crossing its border counts).
 * @param a - segment start in screen space.
 * @param b - segment end.
 * @param box - the box.
 * @returns true when they touch.
 */
export function segmentIntersectsBox(a: readonly [number, number], b: readonly [number, number], box: CadScreenBox): boolean {
  // Liang–Barsky clipping.
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const checks: readonly (readonly [number, number])[] = [
    [-dx, a[0] - box.minX],
    [dx, box.maxX - a[0]],
    [-dy, a[1] - box.minY],
    [dy, box.maxY - a[1]],
  ]
  for (const [p, q] of checks) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
  }
  return t0 <= t1
}

/* ------------------------------------------------------------------ *
 * Object snaps
 * ------------------------------------------------------------------ */

/** The snap classes the pane offers, in priority order. */
export type CadSnapKind = 'endpoint' | 'midpoint' | 'center' | 'nearest' | 'grid'

/** One snap candidate. */
export interface CadSnapResult {
  /** The snapped drawing point. */
  readonly point: EcadPoint
  readonly kind: CadSnapKind
  /** The entity the point came from, when it is not a grid intersection. */
  readonly id?: string
  /** Distance from the cursor in drawing units, for tests and tie-breaking. */
  readonly distance: number
}

/** Snap options one query honours. */
export interface CadSnapOptions {
  /** Drawing units per grid step; 0 or absent disables the grid candidate. */
  readonly grid?: number
  /** When true a grid intersection is a candidate even with no geometry near. */
  readonly includeGrid?: boolean
  /** Locked layers are still geometry; keep them out when the pane locks them. */
  readonly locked?: ReadonlySet<string>
}

/** Priority of each snap class: a lower number wins a tie. */
export function snapPriority(kind: CadSnapKind): number {
  switch (kind) {
    case 'endpoint': return 0
    case 'midpoint': return 1
    case 'center': return 2
    case 'nearest': return 3
    case 'grid': return 4
  }
}

/**
 * The best object snap near one world point.
 *
 * Candidates are gathered from the bucket index around the cursor, so the cost
 * follows how much geometry is near the pointer, not the sheet size.
 * @param index - the pick index.
 * @param point - world point under the cursor.
 * @param radius - snap radius in drawing units.
 * @param options - grid and lock filters.
 * @returns the best snap, or undefined when nothing is near.
 */
export function snapNear(index: CadIndex, point: CadPointLike, radius: number, options: CadSnapOptions = {}): CadSnapResult | undefined {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1]) || !Number.isFinite(radius) || radius <= 0) return undefined
  let best: CadSnapResult | undefined
  const consider = (candidatePoint: CadPointLike, kind: CadSnapKind, id?: string): void => {
    const dx = candidatePoint[0] - point[0]
    const dy = candidatePoint[1] - point[1]
    const distance = Math.sqrt(dx * dx + dy * dy)
    if (distance > radius) return
    if (best === undefined) {
      best = { point: [candidatePoint[0], candidatePoint[1]], kind, distance, ...(id === undefined ? {} : { id }) }
      return
    }
    const currentPriority = snapPriority(best.kind)
    const nextPriority = snapPriority(kind)
    if (nextPriority < currentPriority || (nextPriority === currentPriority && distance < best.distance)) {
      best = { point: [candidatePoint[0], candidatePoint[1]], kind, distance, ...(id === undefined ? {} : { id }) }
    }
  }
  const box: EcadBox = { min: [point[0] - radius, point[1] - radius], max: [point[0] + radius, point[1] + radius] }
  for (const entry of queryIndex(index, box, 2048)) {
    if (options.locked?.has(entry.layer) === true) continue
    const entity = entry.entity
    const samples = entry.samples
    const pointAt = (indexOf: number): CadPointLike | undefined => samples[indexOf] as CadPointLike | undefined
    if (entity.k === 'circle' || entity.k === 'arc' || entity.k === 'ellipse') {
      if (entity.c !== undefined) consider(entity.c, 'center', entry.id)
      const first = pointAt(0)
      const last = pointAt(samples.length - 1)
      if (first !== undefined) consider(first, 'endpoint', entry.id)
      if (last !== undefined) consider(last, 'endpoint', entry.id)
      // The nearest point on a circle is the projection onto its radius.
      if (entity.k === 'circle' && entity.c !== undefined) {
        const dx = point[0] - entity.c[0]
        const dy = point[1] - entity.c[1]
        const length = Math.hypot(dx, dy)
        if (length > 0) {
          const radius2 = Math.abs(entity.r ?? 0)
          consider([entity.c[0] + (dx / length) * radius2, entity.c[1] + (dy / length) * radius2], 'nearest', entry.id)
        }
      }
      for (let index = 1; index < samples.length; index += 1) {
        const a = samples[index - 1] as CadPointLike
        const b = samples[index] as CadPointLike
        if (index % 2 === 0) consider(midpointOf(a, b), 'midpoint', entry.id)
        const projection = nearestOnSegment(point, a, b)
        if (projection !== undefined) consider(projection, 'nearest', entry.id)
      }
      continue
    }
    if (entity.k === 'point' || entity.k === 'insert' || entity.k === 'text' || entity.k === 'mtext' || entity.k === 'viewport') {
      const at = entity.p ?? (samples[0] as CadPointLike | undefined)
      if (at !== undefined) consider(at, 'endpoint', entry.id)
      continue
    }
    // Polyline-like geometry: every vertex is an endpoint snap, every segment
    // offers a midpoint and a nearest point.
    if (samples.length === 1) consider(samples[0] as CadPointLike, 'endpoint', entry.id)
    for (let index = 0; index < samples.length; index += 1) {
      const at = samples[index] as CadPointLike
      consider(at, 'endpoint', entry.id)
      if (index > 0) {
        const previous = samples[index - 1] as CadPointLike
        consider(midpointOf(previous, at), 'midpoint', entry.id)
        const projection = nearestOnSegment(point, previous, at)
        if (projection !== undefined) consider(projection, 'nearest', entry.id)
      }
    }
  }
  if (options.includeGrid === true && options.grid !== undefined && Number.isFinite(options.grid) && options.grid > 0) {
    const gridPoint: CadPointLike = [Math.round(point[0] / options.grid) * options.grid, Math.round(point[1] / options.grid) * options.grid]
    if (Math.abs(gridPoint[0] - point[0]) <= radius && Math.abs(gridPoint[1] - point[1]) <= radius) {
      const dx = gridPoint[0] - point[0]
      const dy = gridPoint[1] - point[1]
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (best === undefined || distance < best.distance) best = { point: [roundValue(gridPoint[0]), roundValue(gridPoint[1])], kind: 'grid', distance }
    }
  }
  return best
}

/** The midpoint of two world points. */
function midpointOf(a: CadPointLike, b: CadPointLike): CadPointLike {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
}

/** The point on a segment nearest to `point`, clamped to the segment ends. */
function nearestOnSegment(point: CadPointLike, a: CadPointLike, b: CadPointLike): CadPointLike | undefined {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return undefined
  let t = ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  return [a[0] + t * dx, a[1] + t * dy]
}

/**
 * Constrain a point to the horizontal or vertical axis through a base point.
 * @param base - the last picked point.
 * @param point - the cursor point.
 * @returns the constrained point; the longer axis wins.
 */
export function orthoPoint(base: CadPointLike, point: CadPointLike): CadPointLike {
  const dx = Math.abs(point[0] - base[0])
  const dy = Math.abs(point[1] - base[1])
  return dx >= dy ? [point[0], base[1]] : [base[0], point[1]]
}

/**
 * The next point when the reader types a distance instead of clicking.
 * @param base - the last picked point.
 * @param cursor - the current cursor point; only its direction is used.
 * @param distance - the typed segment length.
 * @returns the point at that distance in the cursor's direction.
 */
export function pointAtDistance(base: CadPointLike, cursor: CadPointLike, distance: number): CadPointLike {
  const dx = cursor[0] - base[0]
  const dy = cursor[1] - base[1]
  const length = Math.hypot(dx, dy)
  if (!Number.isFinite(distance) || distance <= 0 || length === 0) return [base[0] + distance, base[1]]
  return [base[0] + (dx / length) * distance, base[1] + (dy / length) * distance]
}

/**
 * The angle of a vector in degrees, measured from the positive X axis.
 * @param center - the base point.
 * @param point - the point that describes the direction.
 * @returns the angle in degrees, normalised to (-180, 180].
 */
export function angleDegrees(center: CadPointLike, point: CadPointLike): number {
  const degrees = (Math.atan2(point[1] - center[1], point[0] - center[0]) * 180) / Math.PI
  return roundValue(degrees)
}

/**
 * A world-space grid step that reads well at the current zoom: a 1/2/5 step that
 * stays near the target pixel spacing.
 * @param worldPerPixel - drawing units covered by one CSS pixel.
 * @param targetPixels - the wanted spacing on screen.
 * @returns the step in drawing units.
 */
export function niceGridStep(worldPerPixel: number, targetPixels = 28): number {
  if (!Number.isFinite(worldPerPixel) || worldPerPixel <= 0) return 1
  const raw = worldPerPixel * targetPixels
  const exponent = Math.floor(Math.log10(raw))
  const mantissa = raw / 10 ** exponent
  // Snap to the nearest 1/2/5 mantissa so the step stays close to the wanted
  // on-screen spacing instead of doubling it.
  const nice = mantissa <= 1.5 ? 1 : mantissa <= 3.5 ? 2 : mantissa <= 7.5 ? 5 : 10
  return nice * 10 ** exponent
}

/** The grid lines visible in one viewport, in screen pixels. */
export interface CadGridView {
  readonly step: number
  readonly xs: readonly number[]
  readonly ys: readonly number[]
}

/**
 * The grid lines of the current viewport, in screen coordinates.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @param width - canvas width in pixels.
 * @param height - canvas height in pixels.
 * @param targetPixels - wanted on-screen spacing.
 * @returns the grid step and the screen positions of its lines.
 */
export function gridLinesOf(fit: EcadFit, view: EcadEditView, width: number, height: number, targetPixels = 28): CadGridView {
  const scale = fit.scale * view.zoom
  if (!Number.isFinite(scale) || scale <= 0 || width <= 0 || height <= 0) return { step: 1, xs: [], ys: [] }
  const step = niceGridStep(1 / scale, targetPixels)
  const [left, bottom] = toWorld({ x: 0, y: height }, fit, view)
  const [right, top] = toWorld({ x: width, y: 0 }, fit, view)
  const minX = Math.min(left, right)
  const maxX = Math.max(left, right)
  const minY = Math.min(bottom, top)
  const maxY = Math.max(bottom, top)
  const firstX = Math.ceil(minX / step) * step
  const firstY = Math.ceil(minY / step) * step
  const xs: number[] = []
  const ys: number[] = []
  const limit = 400
  for (let x = firstX, count = 0; x <= maxX && count < limit; x += step, count += 1) xs.push(toScreen([x, 0], fit, view)[0])
  for (let y = firstY, count = 0; y <= maxY && count < limit; y += step, count += 1) ys.push(toScreen([0, y], fit, view)[1])
  return { step, xs, ys }
}

/**
 * The view that shows one screen-space box inside the canvas, with a margin.
 * @param box - the box to frame, in canvas pixels.
 * @param fit - the current fitted transform.
 * @param view - the current user view.
 * @param width - canvas width.
 * @param height - canvas height.
 * @param margin - pixels kept around the box.
 * @returns the view that frames it.
 */
export function viewForBox(box: CadScreenBox, fit: EcadFit, view: EcadEditView, width: number, height: number, margin = 20): EcadEditView {
  const spanX = Math.max(box.maxX - box.minX, 0)
  const spanY = Math.max(box.maxY - box.minY, 0)
  if (spanX < 1 || spanY < 1) return view
  // The box is in canvas pixels, so it is already in the user's view space.
  // Convert to fitted space (the fit plus the user's zoom) so the next zoom and
  // pan keep the drawing's aspect ratio.
  const fittedSpanX = spanX / view.zoom
  const fittedSpanY = spanY / view.zoom
  const usableWidth = Math.max(1, width - margin * 2)
  const usableHeight = Math.max(1, height - margin * 2)
  const zoom = clampZoom(Math.min(usableWidth / fittedSpanX, usableHeight / fittedSpanY))
  if (!Number.isFinite(zoom) || zoom <= 0) return view
  const centreFittedX = ((box.minX + box.maxX) / 2 - view.panX) / view.zoom
  const centreFittedY = ((box.minY + box.maxY) / 2 - view.panY) / view.zoom
  return {
    zoom,
    panX: width / 2 - zoom * centreFittedX,
    panY: height / 2 - zoom * centreFittedY,
  }
}

/* ------------------------------------------------------------------ *
 * Grips
 * ------------------------------------------------------------------ */

/** The kind of a grip handle. */
export type CadGripKind = 'endpoint' | 'vertex' | 'center' | 'quadrant' | 'insert' | 'point'

/** One grip handle of an entity: a small square the reader can drag. */
export interface CadGrip {
  /** Stable within the entity: `<kind>:<index>`. */
  readonly key: string
  /** Handle position in drawing units. */
  readonly point: EcadPoint
  readonly kind: CadGripKind
  /** Index into the entity's own vertex list (meaningful for vertices/endpoints). */
  readonly index: number
}

/**
 * The grip handles of one entity, capped so a giant polyline cannot draw a
 * handle grid over the sheet.
 * @param entity - the entity.
 * @param maxVertices - most vertex handles per entity.
 * @returns the grips; empty for geometry the pane does not grip.
 */
export function gripsOf(entity: EcadEntity, maxVertices = 64): readonly CadGrip[] {
  const grips: CadGrip[] = []
  const push = (point: EcadPoint | undefined, kind: CadGripKind, index: number): void => {
    if (point === undefined) return
    if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) return
    grips.push({ key: `${kind}:${index}`, point, kind, index })
  }
  switch (entity.k) {
    case 'line': {
      const points = entity.pts ?? []
      push(points[0], 'endpoint', 0)
      push(points[1], 'endpoint', 1)
      break
    }
    case 'polyline':
    case 'spline':
    case 'leader':
    case 'solid':
    case 'hatch': {
      const points = entity.pts ?? []
      const step = Math.max(1, Math.ceil(points.length / maxVertices))
      for (let index = 0; index < points.length; index += step) push(points[index], 'vertex', index)
      const last = points.length - 1
      if (last > 0 && last % step !== 0) push(points[last], 'vertex', last)
      break
    }
    case 'circle': {
      if (entity.c !== undefined) {
        push(entity.c, 'center', 0)
        const radius = Math.abs(entity.r ?? 0)
        push([entity.c[0] + radius, entity.c[1]], 'quadrant', 1)
        push([entity.c[0], entity.c[1] + radius], 'quadrant', 2)
        push([entity.c[0] - radius, entity.c[1]], 'quadrant', 3)
        push([entity.c[0], entity.c[1] - radius], 'quadrant', 4)
      }
      break
    }
    case 'arc': {
      if (entity.c !== undefined) {
        const radius = Math.abs(entity.r ?? 0)
        const a0 = entity.a0 ?? 0
        let a1 = entity.a1 ?? 0
        if (a1 < a0) a1 += Math.PI * 2
        push(entity.c, 'center', 0)
        push([entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0)], 'endpoint', 1)
        push([entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1)], 'endpoint', 2)
      }
      break
    }
    case 'ellipse': {
      if (entity.c !== undefined) {
        push(entity.c, 'center', 0)
        const rotation = entity.rot ?? 0
        const rx = Math.abs(entity.rx ?? 0)
        const ry = Math.abs(entity.ry ?? 0)
        push([entity.c[0] + rx * Math.cos(rotation), entity.c[1] + rx * Math.sin(rotation)], 'quadrant', 1)
        push([entity.c[0] - ry * Math.sin(rotation), entity.c[1] + ry * Math.cos(rotation)], 'quadrant', 2)
      }
      break
    }
    case 'text':
    case 'mtext':
    case 'insert':
    case 'point':
    case 'viewport':
      push(entity.p ?? entity.c, 'insert', 0)
      break
    case 'dimension': {
      const points = entity.pts ?? []
      push(points[0], 'endpoint', 0)
      push(points[1], 'endpoint', 1)
      break
    }
    case 'unsupported':
      break
  }
  return grips
}

/** A grip edit, dispatched through the adapter the body owns. */
export type CadGripRequest =
  | { readonly kind: 'move'; readonly dx: number; readonly dy: number }
  | { readonly kind: 'engine'; readonly op: string; readonly payload: Readonly<Record<string, unknown>> }

/**
 * What moving one grip to a point should stage.
 *
 * Only a text/block insertion grip has a supported operation behind it today
 * (`move`); the geometry ops the other grips need (`setLine`, `setPolyline`, …)
 * are produced here as engine requests so the adapter can surface the engine's
 * own words until the engine merge lands. A grip never moves the whole entity
 * by itself.
 * @param entity - the entity being gripped.
 * @param grip - the grip that moved.
 * @param to - the new grip position in drawing units.
 * @returns the request the body dispatches.
 */
export function gripRequestFor(entity: EcadEntity, grip: CadGrip, to: EcadPoint): CadGripRequest {
  if (entity.k === 'text' || entity.k === 'mtext' || entity.k === 'insert' || entity.k === 'point' || entity.k === 'viewport') {
    const at = entity.p ?? entity.c
    if (at === undefined) return { kind: 'engine', op: 'move', payload: { id: entity.id } }
    return { kind: 'move', dx: roundValue(to[0] - at[0]), dy: roundValue(to[1] - at[1]) }
  }
  if (entity.k === 'line') {
    const points = entity.pts ?? []
    const start = points[0] ?? [0, 0]
    const end = points[1] ?? [0, 0]
    const moved: CadPointLike = [roundValue(to[0]), roundValue(to[1])]
    const slot = grip.kind === 'endpoint' && grip.index === 1 ? 1 : 0
    return {
      kind: 'engine',
      op: 'setLine',
      payload: { id: entity.id, a: slot === 0 ? moved : start, b: slot === 1 ? moved : end },
    }
  }
  if (entity.k === 'polyline' || entity.k === 'spline' || entity.k === 'leader') {
    const points = (entity.pts ?? []).map(p => [p[0], p[1]] as [number, number])
    if (grip.index >= 0 && grip.index < points.length) points[grip.index] = [roundValue(to[0]), roundValue(to[1])]
    return { kind: 'engine', op: 'setPolyline', payload: { id: entity.id, pts: points } }
  }
  if (entity.k === 'circle') {
    if (entity.c !== undefined && grip.kind === 'center') {
      // A circle's centre grip translates the circle; that is the one whole-entity
      // move a grip is allowed to make, and `move` is the supported operation.
      return { kind: 'move', dx: roundValue(to[0] - entity.c[0]), dy: roundValue(to[1] - entity.c[1]) }
    }
    return { kind: 'engine', op: 'setCircle', payload: { id: entity.id, c: entity.c, r: entity.r } }
  }
  if (entity.k === 'arc') {
    return { kind: 'engine', op: 'setArc', payload: { id: entity.id, c: entity.c, r: entity.r, a0: entity.a0, a1: entity.a1 } }
  }
  return { kind: 'engine', op: 'setGeometry', payload: { id: entity.id, point: [roundValue(to[0]), roundValue(to[1])] } }
}
