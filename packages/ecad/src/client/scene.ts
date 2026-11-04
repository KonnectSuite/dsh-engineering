/**
 * The sheet model, projected into the drawing primitives the pane draws.
 *
 * Everything here is a pure function of the cached `EcadSheetModel` the host
 * writes under `.ecad/previews/`: no React, no DOM, no theme read. The renderer
 * component maps these primitives to SVG, and the pure helpers are what the unit
 * tests judge without a browser.
 *
 * Coordinates stay in drawing units in this module. The pane applies one
 * transform for the fit and one for the user's pan and zoom, so a wheel gesture
 * never rebuilds a primitive.
 *
 * @module dsh-engineering-ecad/client/scene
 */

import type { EcadBox, EcadEntity, EcadEntityKind, EcadLayer, EcadLayout, EcadSheetModel } from '../engine/types.ts'
import { AUTO_INK, inkFor, isAutoColor } from './palette.ts'

/** One primitive's geometry, in drawing units. */
export type EcadSceneGeometry =
  | { readonly t: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly t: 'path'; readonly d: string; readonly fill: boolean; readonly hatch: boolean }
  | { readonly t: 'rect'; readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly dashed: boolean }
  | { readonly t: 'circle'; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly t: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly degrees: number }
  | { readonly t: 'dot'; readonly cx: number; readonly cy: number; readonly r: number }
  /** Text-only primitives draw no geometry of their own. */
  | { readonly t: 'none' }

/** One text line, already anchored and rotated in drawing units. */
export interface EcadSceneTextLine {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly height: number
  readonly degrees: number
  readonly anchor: 'start' | 'middle' | 'end'
  readonly baseline: 'alphabetic' | 'text-after-edge' | 'middle' | 'text-before-edge'
}

/** One drawable primitive. */
export interface EcadScenePrimitive {
  /** The entity's stable id, also the selection key. */
  readonly id: string
  readonly kind: EcadEntityKind
  readonly layer: string
  /** CSS paint for the stroke, or for the fill of a filled polygon. */
  readonly ink: string
  readonly approx: boolean
  readonly geometry: EcadSceneGeometry
  /** Text runs when the primitive is text or a dimension's text. */
  readonly text: readonly EcadSceneTextLine[]
}

/** One layout projected for the pane. */
export interface EcadScene {
  readonly primitives: readonly EcadScenePrimitive[]
  readonly bounds: EcadBox
  /** Entities the model carries but the pane cannot draw (flattened inserts, unsupported). */
  readonly undrawn: number
  /** Entities omitted because their layer is hidden in the pane. */
  readonly hiddenByLayer: number
  /** Entities in the layout. */
  readonly total: number
}

/** The transform that fits a drawing box into a pixel canvas. */
export interface EcadFit {
  readonly scale: number
  readonly translateX: number
  readonly translateY: number
}

/** The value the pane shows for the drawing's units code. */
export interface EcadCoverage {
  readonly entities: number
  readonly approximate: number
  readonly unsupportedTotal: number
  readonly unsupported: readonly (readonly [string, number])[]
  readonly truncated: boolean
}

/** The fields the inspector lists for one entity. */
export interface EcadEntityFacts {
  readonly id: string
  readonly kind: EcadEntityKind
  readonly layer: string
  readonly text?: string
  readonly point?: readonly [number, number]
  readonly points?: number
  readonly block?: string
  readonly approximate: boolean
  readonly source?: string
}

/**
 * Round a number for a path attribute, without the binary noise.
 * @param value - coordinate.
 * @returns the shortest faithful decimal.
 */
export function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 10_000) / 10_000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * Format one point for the inspector.
 * @param point - drawing-unit point.
 * @returns `x, y`.
 */
export function formatPoint(point: readonly [number, number] | undefined): string {
  if (point === undefined) return ''
  return `${fmt(point[0])}, ${fmt(point[1])}`
}

/**
 * Estimated glyph width in ems, matching how the host engine sizes text boxes.
 * @param text - the run.
 * @returns the width in ems.
 */
export function textWidthEm(text: string): number {
  let em = 0
  for (const character of text) {
    if (character === '\n') continue
    em += character.charCodeAt(0) > 0x2e7f ? 1 : 0.6
  }
  return em
}

/**
 * Extend a mutable box by one point.
 * @param box - the box state.
 * @param x - point x.
 * @param y - point y.
 */
function extend(box: { minX: number; minY: number; maxX: number; maxY: number; empty: boolean }, x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return
  box.minX = Math.min(box.minX, x)
  box.minY = Math.min(box.minY, y)
  box.maxX = Math.max(box.maxX, x)
  box.maxY = Math.max(box.maxY, y)
  box.empty = false
}

/**
 * Approximate bounds of one primitive, in drawing units.
 * @param entity - the primitive.
 * @returns the box, or `undefined` when it has no geometry.
 */
export function entityBounds(entity: EcadEntity): EcadBox | undefined {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity, empty: true }
  switch (entity.k) {
    case 'line':
    case 'polyline':
    case 'spline':
    case 'solid':
    case 'hatch':
    case 'leader': {
      for (const point of entity.pts ?? []) extend(box, point[0], point[1])
      break
    }
    case 'circle':
    case 'arc': {
      if (entity.c === undefined) return undefined
      const radius = entity.r ?? 0
      if (entity.k === 'circle') {
        extend(box, entity.c[0] - radius, entity.c[1] - radius)
        extend(box, entity.c[0] + radius, entity.c[1] + radius)
        break
      }
      const a0 = entity.a0 ?? 0
      let a1 = entity.a1 ?? 0
      if (a1 < a0) a1 += Math.PI * 2
      extend(box, entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0))
      extend(box, entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1))
      for (let turn = 0; turn < 4; turn += 1) {
        const angle = (turn * Math.PI) / 2
        if (angle > a0 && angle < a1) extend(box, entity.c[0] + radius * Math.cos(angle), entity.c[1] + radius * Math.sin(angle))
      }
      break
    }
    case 'ellipse': {
      if (entity.c === undefined) return undefined
      const rx = entity.rx ?? 0
      const ry = entity.ry ?? 0
      const rotation = entity.rot ?? 0
      for (let index = 0; index < 16; index += 1) {
        const angle = (index / 16) * Math.PI * 2
        const x = rx * Math.cos(angle)
        const y = ry * Math.sin(angle)
        extend(box, entity.c[0] + x * Math.cos(rotation) - y * Math.sin(rotation), entity.c[1] + x * Math.sin(rotation) + y * Math.cos(rotation))
      }
      break
    }
    case 'text':
    case 'mtext': {
      if (entity.p === undefined) return undefined
      const height = Math.max(entity.h ?? 0, 0)
      const referenceWidth = entity.w ?? 0
      const width = entity.k === 'mtext' && referenceWidth > 0 ? referenceWidth : textWidthEm(entity.t ?? '') * height
      const rotation = entity.rot ?? 0
      const ha = entity.ha ?? 0
      const left = ha === 1 ? -width / 2 : ha === 2 ? -width : 0
      for (const [dx, dy] of [[left, 0], [left + width, 0], [left, height], [left + width, height]] as const) {
        extend(box, entity.p[0] + dx * Math.cos(rotation) - dy * Math.sin(rotation), entity.p[1] + dx * Math.sin(rotation) + dy * Math.cos(rotation))
      }
      break
    }
    case 'point': {
      if (entity.p === undefined) return undefined
      extend(box, entity.p[0], entity.p[1])
      break
    }
    case 'viewport': {
      if (entity.p === undefined) return undefined
      extend(box, entity.p[0] - (entity.w ?? 0) / 2, entity.p[1] - (entity.h ?? 0) / 2)
      extend(box, entity.p[0] + (entity.w ?? 0) / 2, entity.p[1] + (entity.h ?? 0) / 2)
      break
    }
    case 'dimension': {
      for (const point of entity.pts ?? []) extend(box, point[0], point[1])
      if (entity.p !== undefined) extend(box, entity.p[0], entity.p[1])
      break
    }
    case 'insert':
    case 'unsupported':
      return undefined
  }
  if (!Number.isFinite(box.minX) || !Number.isFinite(box.minY) || !Number.isFinite(box.maxX) || !Number.isFinite(box.maxY)) return undefined
  return { min: [box.minX, box.minY], max: [box.maxX, box.maxY] }
}

/**
 * Union of two boxes.
 * @param a - first box.
 * @param b - second box.
 * @returns the union.
 */
export function unionBounds(a: EcadBox | undefined, b: EcadBox | undefined): EcadBox | undefined {
  if (a === undefined) return b
  if (b === undefined) return a
  return {
    min: [Math.min(a.min[0], b.min[0]), Math.min(a.min[1], b.min[1])],
    max: [Math.max(a.max[0], b.max[0]), Math.max(a.max[1], b.max[1])],
  }
}

/**
 * A box that can be fitted even when the layout carries no geometry.
 * @param box - candidate box.
 * @returns a box with a positive span.
 */
export function sanitiseBox(box: EcadBox): EcadBox {
  const min: readonly [number, number] = Number.isFinite(box.min[0]) && Number.isFinite(box.min[1]) ? box.min : [0, 0]
  const max: readonly [number, number] = Number.isFinite(box.max[0]) && Number.isFinite(box.max[1]) ? box.max : [min[0] + 1, min[1] + 1]
  if (max[0] - min[0] <= 0 && max[1] - min[1] <= 0) return { min, max: [min[0] + 1, min[1] + 1] }
  return { min, max }
}

/**
 * Fit a drawing box into a pixel canvas, preserving aspect ratio and centring.
 * @param bounds - drawing box.
 * @param width - canvas width in pixels.
 * @param height - canvas height in pixels.
 * @param margin - margin in pixels.
 * @returns the fit transform.
 */
export function fitBox(bounds: EcadBox, width: number, height: number, margin: number): EcadFit {
  const box = sanitiseBox(bounds)
  const spanX = box.max[0] - box.min[0]
  const spanY = box.max[1] - box.min[1]
  const usableWidth = Math.max(1, width - margin * 2)
  const usableHeight = Math.max(1, height - margin * 2)
  let scale = 1
  if (spanX > 1e-12 && spanY > 1e-12) scale = Math.min(usableWidth / spanX, usableHeight / spanY)
  else if (spanX > 1e-12) scale = usableWidth / spanX
  else if (spanY > 1e-12) scale = usableHeight / spanY
  if (!Number.isFinite(scale) || scale <= 0) scale = 1
  return {
    scale,
    translateX: (width - scale * spanX) / 2 - scale * box.min[0],
    translateY: (height + scale * spanY) / 2 + scale * box.min[1],
  }
}

/** @param model - the sheet model. @returns layers keyed by upper-case name. */
export function layersOf(model: EcadSheetModel): ReadonlyMap<string, EcadLayer> {
  const map = new Map<string, EcadLayer>()
  for (const layer of model.layers) {
    if (!map.has(layer.name.toUpperCase())) map.set(layer.name.toUpperCase(), layer)
  }
  return map
}

/**
 * The layers shown in the pane's layer list, first-seen order.
 * @param model - the sheet model.
 * @returns the layer rows.
 */
export function layerRows(model: EcadSheetModel): readonly EcadLayer[] {
  return model.layers
}

/**
 * Count the entities on each layer.
 * @param entities - one layout's entities.
 * @returns layer name (upper case) to count.
 */
export function layerCounts(entities: readonly EcadEntity[]): ReadonlyMap<string, number> {
  const counts = new Map<string, number>()
  for (const entity of entities) {
    const key = entity.layer.toUpperCase()
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

/**
 * Draw one entity as primitives. Inserts are already flattened into the layout,
 * and a primitive with no usable geometry draws nothing.
 * @param entity - the primitive.
 * @param layers - layer table, for by-layer and by-block colours.
 * @param pointRadius - point marker radius in drawing units.
 * @returns the primitives, possibly empty.
 */
export function primitivesOf(entity: EcadEntity, layers: ReadonlyMap<string, EcadLayer>, pointRadius: number): readonly EcadScenePrimitive[] {
  const base = {
    id: entity.id,
    kind: entity.k,
    layer: entity.layer,
    approx: entity.approx === true,
    ink: inkFor(entity.color, entity.rgb, layers.get(entity.layer.toUpperCase())),
  }
  const point = (): readonly [number, number] | undefined => entity.p ?? entity.c
  switch (entity.k) {
    case 'line': {
      const [a, b] = entity.pts ?? []
      if (a === undefined || b === undefined) return []
      return [{ ...base, geometry: { t: 'line', x1: a[0], y1: a[1], x2: b[0], y2: b[1] }, text: [] }]
    }
    case 'polyline':
    case 'spline': {
      const points = entity.pts ?? []
      if (points.length < 2) return []
      return [{ ...base, geometry: { t: 'path', d: pathOf(points, entity.closed === true), fill: false, hatch: false }, text: [] }]
    }
    case 'hatch':
    case 'solid': {
      const points = entity.pts ?? []
      if (points.length < 3) return []
      return [{ ...base, geometry: { t: 'path', d: pathOf(points, true), fill: true, hatch: entity.k === 'hatch' }, text: [] }]
    }
    case 'arc': {
      if (entity.c === undefined) return []
      const radius = entity.r ?? 0
      const a0 = entity.a0 ?? 0
      let a1 = entity.a1 ?? 0
      if (a1 < a0) a1 += Math.PI * 2
      const start = [entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0)]
      const end = [entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1)]
      const large = a1 - a0 > Math.PI ? 1 : 0
      return [{
        ...base,
        geometry: { t: 'path', d: `M ${fmt(start[0]!)} ${fmt(start[1]!)} A ${fmt(radius)} ${fmt(radius)} 0 ${large} 1 ${fmt(end[0]!)} ${fmt(end[1]!)}`, fill: false, hatch: false },
        text: [],
      }]
    }
    case 'circle': {
      if (entity.c === undefined) return []
      return [{ ...base, geometry: { t: 'circle', cx: entity.c[0], cy: entity.c[1], r: Math.abs(entity.r ?? 0) }, text: [] }]
    }
    case 'ellipse': {
      if (entity.c === undefined) return []
      const rx = Math.abs(entity.rx ?? 0)
      const ry = Math.abs(entity.ry ?? 0)
      const rotation = entity.rot ?? 0
      const a0 = entity.a0 ?? 0
      const a1 = entity.a1 ?? 0
      const full = entity.closed === true || Math.abs(Math.abs(a1 - a0) - Math.PI * 2) <= 1e-6
      if (full) {
        return [{ ...base, geometry: { t: 'ellipse', cx: entity.c[0], cy: entity.c[1], rx, ry, degrees: (rotation * 180) / Math.PI }, text: [] }]
      }
      let end = a1
      if (end < a0) end += Math.PI * 2
      const start = ellipsePoint(entity.c, rx, ry, rotation, a0)
      const finish = ellipsePoint(entity.c, rx, ry, rotation, end)
      const large = end - a0 > Math.PI ? 1 : 0
      return [{
        ...base,
        geometry: {
          t: 'path',
          d: `M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(rx)} ${fmt(ry)} ${fmt((rotation * 180) / Math.PI)} ${large} 1 ${fmt(finish[0])} ${fmt(finish[1])}`,
          fill: false,
          hatch: false,
        },
        text: [],
      }]
    }
    case 'point': {
      const at = point()
      if (at === undefined) return []
      return [{ ...base, geometry: { t: 'dot', cx: at[0], cy: at[1], r: pointRadius }, text: [] }]
    }
    case 'viewport': {
      const at = point()
      if (at === undefined) return []
      const width = Math.abs(entity.w ?? 0)
      const height = Math.abs(entity.h ?? 0)
      if (width <= 0 || height <= 0) {
        return [{ ...base, geometry: { t: 'dot', cx: at[0], cy: at[1], r: pointRadius }, text: [] }]
      }
      return [{ ...base, geometry: { t: 'rect', x: at[0] - width / 2, y: at[1] - height / 2, width, height, dashed: true }, text: [] }]
    }
    case 'text':
    case 'mtext': {
      const lines = textLines(entity)
      if (lines.length === 0) return []
      return [{ ...base, geometry: { t: 'none' }, text: lines }]
    }
    case 'dimension': {
      const points = entity.pts ?? []
      const lines = entity.p !== undefined && entity.t !== undefined
        ? textLines({ ...entity, k: 'text' })
        : []
      if (points.length === 0 && lines.length === 0) return []
      return [{
        ...base,
        geometry: points.length >= 2
          ? { t: 'path', d: pathOf(points, false), fill: false, hatch: false }
          : { t: 'none' },
        text: lines,
      }]
    }
    case 'leader': {
      const points = entity.pts ?? []
      if (points.length < 2) return []
      return [{ ...base, geometry: { t: 'path', d: pathOf(points, false), fill: false, hatch: false }, text: [] }]
    }
    case 'insert':
    case 'unsupported':
      return []
  }
}

/**
 * Path data for a point list.
 * @param points - drawing-unit points.
 * @param closed - whether to close the path.
 * @returns the `d` attribute.
 */
function pathOf(points: readonly (readonly [number, number])[], closed: boolean): string {
  const parts: string[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]!
    parts.push(`${index === 0 ? 'M' : 'L'} ${fmt(point[0])} ${fmt(point[1])}`)
  }
  if (closed) parts.push('Z')
  return parts.join(' ')
}

/** @returns the point on an ellipse at a parametric angle. */
function ellipsePoint(center: readonly [number, number], rx: number, ry: number, rotation: number, angle: number): [number, number] {
  const x = rx * Math.cos(angle)
  const y = ry * Math.sin(angle)
  return [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)]
}

/**
 * Text runs laid out on their anchor, rotation and line breaks.
 * @param entity - text, mtext or dimension.
 * @returns the lines, empty when there is nothing to draw.
 */
export function textLines(entity: EcadEntity): readonly EcadSceneTextLine[] {
  if (entity.p === undefined || entity.t === undefined || entity.t.length === 0) return []
  const height = entity.h !== undefined && entity.h > 0 ? entity.h : 1
  const rotation = entity.rot ?? 0
  const ha = entity.ha ?? 0
  const va = entity.va ?? 0
  const anchor: EcadSceneTextLine['anchor'] = ha === 1 || ha === 4 ? 'middle' : ha === 2 ? 'end' : 'start'
  const baseline: EcadSceneTextLine['baseline'] = va === 1 ? 'text-after-edge' : va === 2 ? 'middle' : va === 3 ? 'text-before-edge' : 'alphabetic'
  const degrees = (rotation * 180) / Math.PI
  const lines: EcadSceneTextLine[] = []
  const step = height * 1.4
  for (const [index, text] of entity.t.split('\n').entries()) {
    if (text.length === 0) continue
    const offset = index * step
    lines.push({
      text,
      x: entity.p[0] + offset * Math.sin(rotation),
      y: entity.p[1] - offset * Math.cos(rotation),
      height,
      degrees,
      anchor,
      baseline,
    })
  }
  return lines
}

/**
 * Fit one layout into the pane's primitives.
 * @param layout - the layout to draw.
 * @param layers - layer table keyed by upper-case name.
 * @param hiddenLayers - layer names hidden in the pane, upper case.
 * @returns the scene.
 */
export function sceneOf(layout: EcadLayout, layers: ReadonlyMap<string, EcadLayer>, hiddenLayers: ReadonlySet<string>): EcadScene {
  const drawable: EcadEntity[] = []
  let undrawn = 0
  let hiddenByLayer = 0
  for (const entity of layout.entities) {
    if (entity.k === 'insert' || entity.k === 'unsupported') {
      undrawn += 1
      continue
    }
    if (hiddenLayers.has(entity.layer.toUpperCase())) {
      hiddenByLayer += 1
      continue
    }
    if (entityBounds(entity) === undefined) {
      undrawn += 1
      continue
    }
    drawable.push(entity)
  }
  let bounds: EcadBox | undefined
  for (const entity of drawable) bounds = unionBounds(bounds, entityBounds(entity))
  const fitted = sanitiseBox(bounds ?? layout.extents)
  const span = Math.max(fitted.max[0] - fitted.min[0], fitted.max[1] - fitted.min[1])
  const pointRadius = Math.max(span * 0.0015, 1e-6)
  const primitives: EcadScenePrimitive[] = []
  for (const entity of drawable) {
    const produced = primitivesOf(entity, layers, pointRadius)
    // A primitive the model carries but this pane cannot draw is reported, not
    // silently dropped: a one-point polyline is exactly that.
    if (produced.length === 0) undrawn += 1
    for (const primitive of produced) primitives.push(primitive)
  }
  return { primitives, bounds: fitted, undrawn, hiddenByLayer, total: layout.entities.length }
}

/**
 * The inspector's facts for one entity.
 * @param entity - the primitive.
 * @returns the fields to show.
 */
export function factsOf(entity: EcadEntity): EcadEntityFacts {
  const point = entity.p ?? entity.c ?? entity.pts?.[0]
  return {
    id: entity.id,
    kind: entity.k,
    layer: entity.layer,
    ...(entity.t === undefined || entity.t === '' ? {} : { text: entity.t }),
    ...(point === undefined ? {} : { point }),
    ...(entity.pts === undefined ? {} : { points: entity.pts.length }),
    ...(entity.block === undefined ? {} : { block: entity.block }),
    approximate: entity.approx === true,
    ...(entity.src === undefined ? {} : { source: entity.src }),
  }
}

/**
 * The sheet's coverage counters, in the shape the toolbar and badges read.
 * @param model - the sheet model.
 * @returns the coverage.
 */
export function coverageOf(model: EcadSheetModel): EcadCoverage {
  const unsupported = Object.entries(model.stats.unsupported ?? {})
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    entities: model.stats.entities,
    approximate: model.stats.approximate,
    unsupportedTotal: unsupported.reduce((total, [, count]) => total + count, 0),
    unsupported,
    truncated: model.stats.truncated === true,
  }
}

/**
 * The colour a layer swatch shows.
 * @param layer - the layer.
 * @returns a CSS paint.
 */
export function layerInk(layer: EcadLayer): string {
  if (layer.rgb !== undefined) return inkFor(layer.color, layer.rgb, undefined)
  return isAutoColor(layer.color) ? AUTO_INK : inkFor(layer.color, undefined, undefined)
}

/**
 * The layer's name as the drawing spells it, falling back to the raw name.
 * @param model - the sheet model.
 * @param name - the entity's layer string.
 * @returns the display name.
 */
export function layerNameOf(model: EcadSheetModel, name: string): string {
  const match = model.layers.find(layer => layer.name.toUpperCase() === name.toUpperCase())
  return match?.name ?? name
}

/** Drawing-unit labels for the `$INSUNITS` codes a print set commonly carries. */
const UNIT_LABELS: Readonly<Record<number, string>> = {
  1: 'in', 2: 'ft', 3: 'mi', 4: 'mm', 5: 'cm', 6: 'm', 7: 'km', 8: 'µin', 9: 'mil', 10: 'yd',
  11: 'Å', 12: 'nm', 13: 'µm', 14: 'dm', 15: 'dam', 16: 'hm',
}

/**
 * The label for a drawing's units code.
 * @param units - the `$INSUNITS` value from the sheet model.
 * @returns the short unit label, or `undefined` when the drawing does not set one.
 */
export function unitLabel(units: number): string | undefined {
  return Number.isFinite(units) ? UNIT_LABELS[Math.trunc(units)] : undefined
}