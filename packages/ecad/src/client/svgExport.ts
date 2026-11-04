/**
 * The sheet workflow's export helper: the current view as a standalone SVG.
 *
 * The pane draws with theme tokens; an exported drawing must not carry a
 * `var(--…)` colour into a file opened outside the app, so this module renders
 * the scene's own geometry on a white ground with the drawing's own colours.
 * The PNG path rasterises this same document through a browser canvas.
 *
 * Pure: no React, no DOM. The unit tests judge the document shape and escaping.
 *
 * @module dsh-engineering-ecad/client/svgExport
 */

import type { EcadScene, EcadScenePrimitive, EcadFit } from './scene.ts'
import { fmt } from './scene.ts'

/** The user's pan and zoom on top of the fitted drawing. */
export interface CadExportView {
  readonly zoom: number
  readonly panX: number
  readonly panY: number
}

/** Options of one exported SVG document. */
export interface CadSvgOptions {
  readonly title: string
  readonly width: number
  readonly height: number
}

/** Escape text for XML content. */
function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

/**
 * The ink an exported primitive draws with.
 *
 * The pane's theme tint is for the screen; the export keeps a colour the scene
 * carries as a literal and falls back to near-black for a themed ink.
 * @param primitive - the primitive.
 * @returns a CSS colour for the SVG.
 */
function exportedInk(primitive: EcadScenePrimitive): string {
  const ink = primitive.ink
  if (ink.startsWith('#') || ink.startsWith('rgb') || ink.startsWith('hsl')) return ink
  return '#1a1a1a'
}

/** One primitive's geometry element. */
function shapeOf(primitive: EcadScenePrimitive): string {
  const geometry = primitive.geometry
  const ink = exportedInk(primitive)
  switch (geometry.t) {
    case 'line':
      return `<line x1="${fmt(geometry.x1)}" y1="${fmt(geometry.y1)}" x2="${fmt(geometry.x2)}" y2="${fmt(geometry.y2)}" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`
    case 'path':
      return `<path d="${geometry.d}" fill="${geometry.fill ? ink : 'none'}" fill-opacity="${geometry.hatch ? '0.22' : '0.9'}" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>`
    case 'rect':
      return `<rect x="${fmt(geometry.x)}" y="${fmt(geometry.y)}" width="${fmt(geometry.width)}" height="${fmt(geometry.height)}" fill="none" stroke="${ink}" stroke-width="1"${geometry.dashed ? ' stroke-dasharray="4 2"' : ''} vector-effect="non-scaling-stroke"/>`
    case 'circle':
      return `<circle cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" r="${fmt(geometry.r)}" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    case 'ellipse':
      return `<ellipse cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" rx="${fmt(geometry.rx)}" ry="${fmt(geometry.ry)}" transform="rotate(${Number(geometry.degrees.toFixed(4))} ${fmt(geometry.cx)} ${fmt(geometry.cy)})" fill="none" stroke="${ink}" stroke-width="1" vector-effect="non-scaling-stroke"/>`
    case 'dot':
      return `<circle cx="${fmt(geometry.cx)}" cy="${fmt(geometry.cy)}" r="${fmt(geometry.r)}" fill="${ink}"/>`
    case 'none':
      return ''
    default:
      return ''
  }
}

/** One primitive's text runs. */
function textOf(primitive: EcadScenePrimitive): string {
  const ink = exportedInk(primitive)
  return primitive.text.map(line => `<text transform="translate(${fmt(line.x)} ${fmt(line.y)}) scale(1 -1) rotate(${Number((-line.degrees).toFixed(4))})" font-size="${fmt(line.height)}" text-anchor="${line.anchor}" dominant-baseline="${line.baseline}" fill="${ink}" font-family="sans-serif">${escapeXml(line.text)}</text>`).join('')
}

/**
 * Render the current sheet view as a standalone SVG document.
 * @param scene - the projected scene.
 * @param fit - the fitted transform.
 * @param view - the user's pan and zoom.
 * @param options - title and canvas size.
 * @returns the SVG source.
 */
export function svgDocumentOf(scene: EcadScene, fit: EcadFit, view: CadExportView, options: CadSvgOptions): string {
  const body = scene.primitives.map(primitive => `<g>${shapeOf(primitive)}${textOf(primitive)}</g>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${options.width}" height="${options.height}" viewBox="0 0 ${options.width} ${options.height}" role="img" aria-label="${escapeXml(options.title)}">
<title>${escapeXml(options.title)}</title>
<rect width="${options.width}" height="${options.height}" fill="#ffffff"/>
<g transform="translate(${fmt(view.panX)} ${fmt(view.panY)}) scale(${fmt(view.zoom)})">
<g transform="translate(${fmt(fit.translateX)} ${fmt(fit.translateY)}) scale(${fmt(fit.scale)} ${fmt(-fit.scale)})">
${body}
</g>
</g>
</svg>
`
}
