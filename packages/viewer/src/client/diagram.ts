/**
 * Draw a function block diagram or a sequential function chart as one SVG.
 *
 * Studio records a position for every block, reference, step and transition, so the drawing can be
 * laid out where the export puts it instead of being invented here. A wire carries no position: it
 * joins two ids and is drawn between the centres of the elements those ids name.
 *
 * The drawing is schematic. It shows structure — what is wired to what, which step is initial, which
 * transition carries which condition — and says nothing about execution.
 *
 * @module dsh-engineering-l5x-viewer/diagram
 */

import type { Diagram, DiagramElement } from './model.ts'

/** Box size for one kind of element. */
function sizeOf(kind: string): { w: number; h: number } {
  if (kind === 'Block') return { w: 170, h: 96 }
  if (kind === 'Step') return { w: 132, h: 68 }
  if (kind === 'Transition') return { w: 132, h: 46 }
  return { w: 104, h: 34 }
}

/** Escape text for SVG content. */
function escapeText(value: string): string {
  return value.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

/** Fill and stroke for one kind of element. */
function coloursOf(element: DiagramElement): { fill: string; stroke: string } {
  if (element.kind === 'Step') return element.initial ? { fill: '#12321f', stroke: '#3fa46a' } : { fill: '#101a2c', stroke: '#3b4a63' }
  if (element.kind === 'Transition') return { fill: '#20192b', stroke: '#8a6fb0' }
  if (element.kind === 'Block') return { fill: '#131d30', stroke: '#5a6f94' }
  return { fill: '#0e1626', stroke: '#3b4a63' }
}

/**
 * Draw one diagram.
 *
 * @param diagram - Parsed nodes of an FBD routine or an SFC chart.
 * @returns An SVG document, or an empty string when the routine carries nothing to draw.
 */
export function diagramSvg(diagram: Diagram): string {
  const boxes = diagram.elements.filter(element => element.kind !== 'Wire' && element.kind !== 'DirectedLink')
  if (boxes.length === 0) return ''
  const byId = new Map(boxes.filter(box => box.id !== '').map(box => [box.id, box]))
  const centreOf = (id: string): { x: number; y: number } | undefined => {
    const box = byId.get(id)
    if (box === undefined) return undefined
    const size = sizeOf(box.kind)
    return { x: box.x + size.w / 2, y: box.y + size.h / 2 }
  }
  const right = Math.max(...boxes.map(box => box.x + sizeOf(box.kind).w))
  const bottom = Math.max(...boxes.map(box => box.y + sizeOf(box.kind).h))
  const width = Math.max(right, 320) + 60
  const height = Math.max(bottom, 160) + 50
  const parts: string[] = []
  // Wires first, so every box sits on top of the lines that reach it.
  for (const wire of diagram.elements) {
    if (wire.kind !== 'Wire' && wire.kind !== 'DirectedLink') continue
    const from = centreOf(wire.from)
    const to = centreOf(wire.to)
    if (from === undefined || to === undefined) continue
    const dashed = wire.kind === 'DirectedLink' ? '' : ' stroke-dasharray="0"'
    parts.push(`<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="#4a5a78" stroke-width="1.5"${dashed}/>`)
    const pin = wire.fromPin || wire.toPin
    if (pin !== '') {
      const mx = (from.x + to.x) / 2
      const my = (from.y + to.y) / 2
      parts.push(`<text x="${mx + 4}" y="${my - 4}" font-size="9" fill="#7f8ca6">${escapeText(pin)}</text>`)
    }
  }
  for (const box of boxes) {
    const size = sizeOf(box.kind)
    const colour = coloursOf(box)
    parts.push(`<rect x="${box.x}" y="${box.y}" width="${size.w}" height="${size.h}" rx="4" fill="${colour.fill}" stroke="${colour.stroke}" stroke-width="1.2"/>`)
    parts.push(`<text x="${box.x + size.w / 2}" y="${box.y + 15}" text-anchor="middle" font-size="10" fill="#8b9ab5">${escapeText(box.kind)}</text>`)
    if (box.label !== '') parts.push(`<text x="${box.x + size.w / 2}" y="${box.y + 31}" text-anchor="middle" font-size="12" fill="#e2e8f0">${escapeText(box.label)}</text>`)
    if (box.initial) parts.push(`<text x="${box.x + size.w / 2}" y="${box.y + size.h - 6}" text-anchor="middle" font-size="9" fill="#3fa46a">initial</text>`)
    if (box.pins !== '') {
      box.pins.split(/\s+/u).filter(Boolean).slice(0, 8).forEach((pin, index) => {
        parts.push(`<text x="${box.x + 8}" y="${box.y + 48 + index * 12}" font-size="10" fill="#9fb0cc">${escapeText(pin)}</text>`)
      })
    }
    if (box.condition !== '') {
      box.condition.split(/\r?\n/u).filter(Boolean).slice(0, 4).forEach((line, index) => {
        parts.push(`<text x="${box.x + size.w / 2}" y="${box.y + size.h + 14 + index * 12}" text-anchor="middle" font-size="10" fill="#c79ad6">${escapeText(line)}</text>`)
      })
    }
  }
  const language = diagram.language === 'FBD' ? 'Function block diagram' : 'Sequential function chart'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="100%" role="img" aria-label="${language}"><title>${language}</title>${parts.join('')}</svg>`
}
