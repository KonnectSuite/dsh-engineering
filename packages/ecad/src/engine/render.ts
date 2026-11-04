/**
 * SVG rendering of a sheet model.
 *
 * The output is a static SVG string — no DOM, no canvas, no browser — so the
 * same call works in the host, in a test and in a headless check. The drawing
 * is drawn in drawing coordinates inside one group that flips the Y axis, which
 * is what makes the result read like CAD rather than like a plot with the
 * origin at the top-left; text carries its own counter-flip so it stays upright.
 *
 * Fidelity is stated per primitive: lines, arcs, circles, ellipses, splines and
 * polygons are drawn as themselves, text uses an estimated width, and anything
 * the model marked `approx` draws its approximation rather than a claim.
 *
 * @module dsh-engineering-ecad/engine/render
 */

import type { EcadBox, EcadEntity, EcadLayout, EcadSheetModel } from './types.ts'
import { entityBounds, unionBounds } from './model.ts'
import { EcadError } from './errors.ts'
import { aciToCss, rgbToCss } from './palette.ts'
import { textWidthEm } from './text.ts'

/** Options of {@link renderLayoutSvg} and {@link renderStackSvg}. */
export interface RenderOptions {
  /** Canvas width in pixels. Defaults to 1200. */
  readonly width?: number
  /** Canvas height in pixels. Defaults to 900. */
  readonly height?: number
  /** Margin around the drawing in pixels. Defaults to 24. */
  readonly margin?: number
  /** Page background. Defaults to `#ffffff`. */
  readonly background?: string
  /** Layer names to hide, case-insensitive. */
  readonly hiddenLayers?: readonly string[]
  /** Draw entities on layers the drawing marks off or frozen. Defaults to false. */
  readonly showHiddenLayers?: boolean
  /** Stroke width in pixels (non-scaling). Defaults to 1. */
  readonly strokeWidth?: number
  /** Point marker radius in drawing units. Defaults to a fraction of the span. */
  readonly pointRadius?: number
  /** Multiplier on text heights. Defaults to 1. */
  readonly textScale?: number
  /** Cap on primitives drawn. Defaults to 100000. */
  readonly maxEntities?: number
}

/** Options of {@link renderStackSvg}, which stacks several sheets on one page. */
export interface RenderStackOptions extends RenderOptions {
  /** Height of one sheet tile in pixels. Defaults to 900. */
  readonly itemHeight?: number
  /** Height of the title strip above each tile in pixels. Defaults to 28. */
  readonly titleHeight?: number
  /** Gap between tiles in pixels. Defaults to 12. */
  readonly gap?: number
}

/** One sheet in a stacked review page. */
export interface RenderStackItem {
  /** Title printed above the sheet. */
  readonly title: string
  /** The model to draw. */
  readonly model: EcadSheetModel
  /** Layout id; `Model` when omitted. */
  readonly layoutId?: string
}

/** Drawing context handed to the per-entity renderers. */
interface DrawContext {
  readonly lightBackground: boolean
  readonly showHiddenLayers: boolean
  readonly hiddenLayers: ReadonlySet<string>
  readonly layerVisible: ReadonlyMap<string, boolean>
  readonly strokeWidth: number
  readonly pointRadius: number
  readonly textScale: number
  readonly fallbackTextHeight: number
}

/** Geometry of one laid-out drawing inside a canvas. */
interface TileGeometry {
  readonly width: number
  readonly height: number
  readonly scale: number
  readonly translateX: number
  readonly translateY: number
  readonly bounds: EcadBox
}

/**
 * Render one layout of a sheet as an SVG document.
 *
 * @param model - the sheet model.
 * @param layoutId - layout to draw (`Model` or a paper layout id); `Model` when omitted.
 * @param options - size, background, layer filter and caps.
 * @returns a complete SVG string.
 */
export function renderLayoutSvg(model: EcadSheetModel, layoutId: string = 'Model', options: RenderOptions = {}): string {
  const layout = findLayout(model, layoutId)
  const width = positive(options.width, 1200)
  const height = positive(options.height, 900)
  const margin = positive(options.margin, 24)
  const background = options.background ?? '#ffffff'
  const strokeWidth = positive(options.strokeWidth, 1)
  const textScale = positive(options.textScale, 1)
  const maxEntities = Math.max(1, Math.trunc(options.maxEntities ?? 100_000))
  const entities = drawnEntities(model, layout, options, maxEntities)
  const bounds = entities.reduce<EcadBox | undefined>((box, entity) => unionBounds(box, entityBounds(entity)), undefined) ?? sanitiseBox(layout.extents)
  const context: DrawContext = {
    lightBackground: isLightColour(background),
    showHiddenLayers: options.showHiddenLayers === true,
    hiddenLayers: new Set((options.hiddenLayers ?? []).map(name => name.toUpperCase())),
    layerVisible: new Map(model.layers.map(layer => [layer.name.toUpperCase(), layer.visible])),
    strokeWidth,
    pointRadius: positive(options.pointRadius, Math.max(span(bounds) * 0.0015, 1e-6)),
    textScale,
    fallbackTextHeight: Math.max(span(bounds) * 0.005, 1e-6)
  }
  const geometry = fit(bounds, width, height, margin)
  const body = entities.map(entity => renderEntity(entity, context)).filter(part => part.length > 0).join('')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}">`,
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(height)}" fill="${escapeXml(background)}"/>`,
    `<g transform="translate(${fmt(geometry.translateX)} ${fmt(geometry.translateY)}) scale(${fmt(geometry.scale)} ${fmt(-geometry.scale)})">`,
    body,
    '</g>',
    '</svg>'
  ].join('')
}

/**
 * Render several sheets onto one review page, each with its title.
 *
 * @param items - sheets to draw, in order.
 * @param options - page width, tile size, title strip and drawing options.
 * @returns a complete SVG string.
 */
export function renderStackSvg(items: readonly RenderStackItem[], options: RenderStackOptions = {}): string {
  if (items.length === 0) throw new EcadError('INVALID_INPUT', 'renderStackSvg needs at least one sheet', 'Pass the models you want on the review page.')
  const width = positive(options.width, 1200)
  const itemHeight = positive(options.itemHeight, 900)
  const titleHeight = positive(options.titleHeight, 28)
  const gap = Math.max(0, options.gap ?? 12)
  const margin = positive(options.margin, 24)
  const background = options.background ?? '#ffffff'
  const totalHeight = margin * 2 + items.length * (titleHeight + itemHeight) + (items.length - 1) * gap
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(totalHeight)}" width="${fmt(width)}" height="${fmt(totalHeight)}">`,
    `<rect x="0" y="0" width="${fmt(width)}" height="${fmt(totalHeight)}" fill="${escapeXml(background)}"/>`
  ]
  let offsetY = margin
  for (const item of items) {
    const model = item.model
    const layout = findLayout(model, item.layoutId ?? 'Model')
    const maxEntities = Math.max(1, Math.trunc(options.maxEntities ?? 100_000))
    const strokeWidth = positive(options.strokeWidth, 1)
    const textScale = positive(options.textScale, 1)
    const entities = drawnEntities(model, layout, options, maxEntities)
    const bounds = entities.reduce<EcadBox | undefined>((box, entity) => unionBounds(box, entityBounds(entity)), undefined) ?? sanitiseBox(layout.extents)
    const context: DrawContext = {
      lightBackground: isLightColour(background),
      showHiddenLayers: options.showHiddenLayers === true,
      hiddenLayers: new Set((options.hiddenLayers ?? []).map(name => name.toUpperCase())),
      layerVisible: new Map(model.layers.map(layer => [layer.name.toUpperCase(), layer.visible])),
      strokeWidth,
      pointRadius: positive(options.pointRadius, Math.max(span(bounds) * 0.0015, 1e-6)),
      textScale,
      fallbackTextHeight: Math.max(span(bounds) * 0.005, 1e-6)
    }
    const geometry = fit(bounds, width - margin * 2, itemHeight, 0)
    const body = entities.map(entity => renderEntity(entity, context)).filter(part => part.length > 0).join('')
    parts.push(`<g transform="translate(0 ${fmt(offsetY)})">`)
    parts.push(`<text x="${fmt(margin)}" y="${fmt(titleHeight * 0.7)}" font-family="sans-serif" font-size="15" fill="${context.lightBackground ? '#111111' : '#eeeeee'}">${escapeXml(item.title)}</text>`)
    parts.push('<g>')
    parts.push(`<g transform="translate(${fmt(margin + geometry.translateX)} ${fmt(titleHeight + geometry.translateY)}) scale(${fmt(geometry.scale)} ${fmt(-geometry.scale)})">`)
    parts.push(body)
    parts.push('</g>')
    parts.push('</g>')
    parts.push('</g>')
    offsetY += titleHeight + itemHeight + gap
  }
  parts.push('</svg>')
  return parts.join('')
}

/**
 * Find one layout by id, defaulting to `Model`.
 *
 * @param model - the sheet model.
 * @param layoutId - layout id.
 */
function findLayout(model: EcadSheetModel, layoutId: string): EcadLayout {
  const layout = model.layouts.find(entry => entry.id === layoutId) ?? (layoutId === 'Model' ? model.layouts.find(entry => entry.kind === 'model') : undefined)
  if (!layout) {
    throw new EcadError('MISSING_TARGET', `layout ${JSON.stringify(layoutId)} does not exist in ${model.path}`, `Use one of: ${model.layouts.map(entry => entry.id).join(', ')}.`)
  }
  return layout
}

/**
 * Entities that should be drawn, after hidden layers and the cap.
 *
 * @param model - sheet model.
 * @param layout - layout to draw.
 * @param options - render options.
 * @param maxEntities - cap.
 */
function drawnEntities(model: EcadSheetModel, layout: EcadLayout, options: RenderOptions, maxEntities: number): EcadEntity[] {
  const hiddenLayers = new Set((options.hiddenLayers ?? []).map(name => name.toUpperCase()))
  const layerVisible = new Map(model.layers.map(layer => [layer.name.toUpperCase(), layer.visible]))
  const out: EcadEntity[] = []
  for (const entity of layout.entities) {
    if (entity.k === 'insert' || entity.k === 'unsupported') continue
    const key = entity.layer.toUpperCase()
    if (hiddenLayers.has(key)) continue
    if (options.showHiddenLayers !== true && layerVisible.get(key) === false) continue
    out.push(entity)
    if (out.length >= maxEntities) break
  }
  return out
}

/**
 * Fit a box into a pixel canvas, preserving aspect ratio and centring.
 *
 * @param bounds - drawing bounds.
 * @param width - canvas width in pixels.
 * @param height - canvas height in pixels.
 * @param margin - margin in pixels.
 */
function fit(bounds: EcadBox, width: number, height: number, margin: number): TileGeometry {
  const spanX = bounds.max[0] - bounds.min[0]
  const spanY = bounds.max[1] - bounds.min[1]
  const usableWidth = Math.max(1, width - margin * 2)
  const usableHeight = Math.max(1, height - margin * 2)
  let scale = 1
  if (spanX > 1e-12 && spanY > 1e-12) scale = Math.min(usableWidth / spanX, usableHeight / spanY)
  else if (spanX > 1e-12) scale = usableWidth / spanX
  else if (spanY > 1e-12) scale = usableHeight / spanY
  if (!Number.isFinite(scale) || scale <= 0) scale = 1
  const translateX = (width - scale * spanX) / 2 - scale * bounds.min[0]
  const translateY = (height + scale * spanY) / 2 + scale * bounds.min[1]
  return { width, height, scale, translateX, translateY, bounds }
}

/**
 * Render a single entity to SVG markup, in drawing coordinates.
 *
 * @param entity - the primitive.
 * @param context - drawing context.
 */
function renderEntity(entity: EcadEntity, context: DrawContext): string {
  const key = entity.layer.toUpperCase()
  if (context.hiddenLayers.has(key)) return ''
  if (!context.showHiddenLayers && context.layerVisible.get(key) === false) return ''
  const stroke = colourOf(entity, context)
  const common = ` stroke="${stroke}" fill="none" stroke-width="${fmt(context.strokeWidth)}" vector-effect="non-scaling-stroke" data-ecad-id="${escapeXml(entity.id)}" data-ecad-kind="${entity.k}" data-layer="${escapeXml(entity.layer)}"`
  switch (entity.k) {
    case 'line': {
      const [a, b] = entity.pts ?? []
      if (!a || !b) return ''
      return `<line x1="${fmt(a[0])}" y1="${fmt(a[1])}" x2="${fmt(b[0])}" y2="${fmt(b[1])}"${common}/>`
    }
    case 'polyline':
    case 'spline': {
      const points = entity.pts ?? []
      if (points.length < 2) return ''
      const attr = points.map(point => `${fmt(point[0])},${fmt(point[1])}`).join(' ')
      return entity.closed ? `<polygon points="${attr}"${common}/>` : `<polyline points="${attr}"${common}/>`
    }
    case 'hatch':
    case 'solid': {
      const points = entity.pts ?? []
      if (points.length < 3) return ''
      const attr = points.map(point => `${fmt(point[0])},${fmt(point[1])}`).join(' ')
      return `<polygon points="${attr}" fill="${stroke}" stroke="none" fill-rule="evenodd" data-ecad-id="${escapeXml(entity.id)}" data-ecad-kind="${entity.k}" data-layer="${escapeXml(entity.layer)}"/>`
    }
    case 'arc': {
      if (!entity.c) return ''
      const radius = entity.r ?? 0
      const a0 = entity.a0 ?? 0
      let a1 = entity.a1 ?? 0
      if (a1 < a0) a1 += Math.PI * 2
      const sweep = a1 - a0
      const start = [entity.c[0] + radius * Math.cos(a0), entity.c[1] + radius * Math.sin(a0)]
      const end = [entity.c[0] + radius * Math.cos(a1), entity.c[1] + radius * Math.sin(a1)]
      const large = sweep > Math.PI ? 1 : 0
      return `<path d="M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(radius)} ${fmt(radius)} 0 ${large} 1 ${fmt(end[0])} ${fmt(end[1])}"${common}/>`
    }
    case 'circle': {
      if (!entity.c) return ''
      return `<circle cx="${fmt(entity.c[0])}" cy="${fmt(entity.c[1])}" r="${fmt(Math.abs(entity.r ?? 0))}"${common}/>`
    }
    case 'ellipse': {
      if (!entity.c) return ''
      const rx = Math.abs(entity.rx ?? 0)
      const ry = Math.abs(entity.ry ?? 0)
      const rot = entity.rot ?? 0
      const a0 = entity.a0 ?? 0
      const a1 = entity.a1 ?? 0
      const full = entity.closed === true || Math.abs(Math.abs(a1 - a0) - Math.PI * 2) <= 1e-6
      if (full) {
        return `<ellipse cx="${fmt(entity.c[0])}" cy="${fmt(entity.c[1])}" rx="${fmt(rx)}" ry="${fmt(ry)}" transform="rotate(${fmt((rot * 180) / Math.PI)} ${fmt(entity.c[0])} ${fmt(entity.c[1])})"${common}/>`
      }
      let end = a1
      if (end < a0) end += Math.PI * 2
      const start = ellipsePoint(entity.c, rx, ry, rot, a0)
      const finish = ellipsePoint(entity.c, rx, ry, rot, end)
      const large = end - a0 > Math.PI ? 1 : 0
      return `<path d="M ${fmt(start[0])} ${fmt(start[1])} A ${fmt(rx)} ${fmt(ry)} ${fmt((rot * 180) / Math.PI)} ${large} 1 ${fmt(finish[0])} ${fmt(finish[1])}"${common}/>`
    }
    case 'point': {
      if (!entity.p) return ''
      return `<circle cx="${fmt(entity.p[0])}" cy="${fmt(entity.p[1])}" r="${fmt(context.pointRadius)}" fill="${stroke}" stroke="none" data-ecad-id="${escapeXml(entity.id)}" data-ecad-kind="point" data-layer="${escapeXml(entity.layer)}"/>`
    }
    case 'viewport': {
      if (!entity.p) return ''
      const halfWidth = Math.abs(entity.w ?? 0) / 2
      const halfHeight = Math.abs(entity.h ?? 0) / 2
      return `<rect x="${fmt(entity.p[0] - halfWidth)}" y="${fmt(entity.p[1] - halfHeight)}" width="${fmt(halfWidth * 2)}" height="${fmt(halfHeight * 2)}" stroke-dasharray="6 4"${common}/>`
    }
    case 'text':
    case 'mtext': {
      return renderText(entity, context, stroke)
    }
    case 'dimension': {
      const points = entity.pts ?? []
      const line = points.length >= 2 ? `<polyline points="${points.map(point => `${fmt(point[0])},${fmt(point[1])}`).join(' ')}"${common}/>` : ''
      const text = entity.p && entity.t ? renderTextAt(entity.t, entity.p, entity.h ?? context.fallbackTextHeight, entity.rot ?? 0, 1, 0, context, stroke, entity.id, 'dimension') : ''
      return line + text
    }
    case 'leader': {
      const points = entity.pts ?? []
      if (points.length < 2) return ''
      return `<polyline points="${points.map(point => `${fmt(point[0])},${fmt(point[1])}`).join(' ')}"${common}/>`
    }
    case 'insert':
    case 'unsupported':
      return ''
  }
}

/**
 * Render a TEXT or MTEXT entity, line by line.
 *
 * @param entity - text primitive.
 * @param context - drawing context.
 * @param stroke - colour.
 */
function renderText(entity: EcadEntity, context: DrawContext, stroke: string): string {
  if (!entity.p) return ''
  const height = entity.h && entity.h > 0 ? entity.h * context.textScale : context.fallbackTextHeight
  if (!entity.t || entity.t.length === 0) return ''
  return renderTextAt(entity.t, entity.p, height, entity.rot ?? 0, entity.ha ?? 0, entity.va ?? 0, context, stroke, entity.id, entity.k)
}

/**
 * Render one text run with its anchor, rotation and line breaks.
 *
 * @param text - plain text, `\n` between lines.
 * @param point - anchor point in drawing units.
 * @param height - text height in drawing units.
 * @param rotation - rotation in radians.
 * @param ha - horizontal alignment mode.
 * @param va - vertical alignment mode.
 * @param context - drawing context.
 * @param stroke - colour.
 * @param id - entity id, for tracing.
 */
function renderTextAt(
  text: string,
  point: readonly [number, number],
  height: number,
  rotation: number,
  ha: number,
  va: number,
  context: DrawContext,
  stroke: string,
  id: string,
  kind = 'text'
): string {
  const lines = text.split('\n')
  const anchor = textAnchor(ha)
  const baseline = baselineOf(va)
  const degree = (rotation * 180) / Math.PI
  const lineStep = height * 1.4
  const parts: string[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!
    if (line.length === 0) continue
    const step = index * lineStep
    const x = point[0] + step * Math.sin(rotation)
    const y = point[1] - step * Math.cos(rotation)
    const estimatedWidth = textWidthEm(line) * height
    parts.push(
      `<text x="0" y="0" transform="translate(${fmt(x)} ${fmt(y)}) scale(1 ${-1}) rotate(${fmt(-degree)})" font-family="sans-serif" font-size="${fmt(height)}" text-anchor="${anchor}" dominant-baseline="${baseline}" fill="${stroke}" data-ecad-id="${escapeXml(id)}" data-ecad-kind="${escapeXml(kind)}" data-layer="" data-estimated-width="${fmt(estimatedWidth)}">${escapeXml(line)}</text>`.replace(' data-layer=""', '')
    )
  }
  return parts.join('')
}

/**
 * SVG text anchor for a DXF horizontal alignment mode.
 *
 * @param ha - `AcDbTextHorizontalMode` value (0 left, 1 center, 2 right, 3 aligned, 4 middle, 5 fit).
 */
function textAnchor(ha: number): string {
  if (ha === 1 || ha === 4) return 'middle'
  if (ha === 2) return 'end'
  return 'start'
}

/**
 * SVG dominant baseline for a DXF vertical alignment mode.
 *
 * @param va - `AcDbTextVerticalMode` value (0 baseline, 1 bottom, 2 middle, 3 top).
 */
function baselineOf(va: number): string {
  if (va === 1) return 'text-after-edge'
  if (va === 2) return 'middle'
  if (va === 3) return 'text-before-edge'
  return 'alphabetic'
}

/**
 * Point on an ellipse at a parametric angle.
 *
 * @param center - centre.
 * @param rx - major radius.
 * @param ry - minor radius.
 * @param rotation - major-axis rotation.
 * @param angle - parametric angle.
 */
function ellipsePoint(center: readonly [number, number], rx: number, ry: number, rotation: number, angle: number): [number, number] {
  const x = rx * Math.cos(angle)
  const y = ry * Math.sin(angle)
  return [center[0] + x * Math.cos(rotation) - y * Math.sin(rotation), center[1] + x * Math.sin(rotation) + y * Math.cos(rotation)]
}

/**
 * CSS colour of one entity: true colour wins, otherwise the resolved ACI.
 *
 * @param entity - primitive.
 * @param context - drawing context.
 */
function colourOf(entity: EcadEntity, context: DrawContext): string {
  if (entity.rgb) return rgbToCss(entity.rgb)
  return aciToCss(entity.color, { lightBackground: context.lightBackground })
}

/**
 * True when a CSS colour is light, so index 7 (AutoCAD's white) is drawn black.
 *
 * @param colour - `#rrggbb` or a named colour.
 */
function isLightColour(colour: string): boolean {
  const match = /^#([0-9a-f]{6})$/i.exec(colour.trim())
  if (!match) return true
  const value = Number.parseInt(match[1]!, 16)
  const r = (value >> 16) & 0xff
  const g = (value >> 8) & 0xff
  const b = value & 0xff
  return (r * 299 + g * 587 + b * 114) / 1000 > 140
}

/**
 * The larger span of a box.
 *
 * @param box - drawing bounds.
 */
function span(box: EcadBox): number {
  return Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1])
}

/**
 * A box that can be fitted even when the layout carries no geometry.
 *
 * @param box - candidate bounds.
 */
function sanitiseBox(box: EcadBox): EcadBox {
  const min: readonly [number, number] = Number.isFinite(box.min[0]) && Number.isFinite(box.min[1]) ? box.min : [0, 0]
  const max: readonly [number, number] = Number.isFinite(box.max[0]) && Number.isFinite(box.max[1]) ? box.max : [min[0] + 1, min[1] + 1]
  if (max[0] - min[0] <= 0 && max[1] - min[1] <= 0) return { min, max: [min[0] + 1, min[1] + 1] }
  return { min, max }
}

/**
 * A positive finite number or a fallback.
 *
 * @param value - candidate.
 * @param fallback - value used when the candidate is absent or invalid.
 */
function positive(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * Format a number for SVG: up to four decimals, no trailing zeros, no `-0`.
 *
 * @param value - number.
 */
function fmt(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 10_000) / 10_000
  return Object.is(rounded, -0) ? '0' : String(rounded)
}

/**
 * Escape text for XML text content and attribute values.
 *
 * @param value - raw text.
 */
function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}
