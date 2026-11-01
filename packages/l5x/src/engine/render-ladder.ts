/**
 * Draw ladder rungs as a diagram, so a chat answer can show the logic instead of
 * quoting NeutralText. The drawing is schematic: instruction boxes on a rail,
 * branches stacked inside a bracket. Nothing here parses semantics; the caller
 * already validated every rung with the composer's parser.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseLadder, type LadderNode } from './logic-syntax.ts'

/** One rung to draw: its number, its verified text and an optional comment. */
export interface RungSpec {
  readonly number: number
  readonly text: string
  readonly comment?: string
}

/** A rendered diagram plus layout notes; empty when every element could be drawn. */
export interface LadderRaster {
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly rungs: number
  /** Elements the layout could not draw; branches are drawn with their join, so this is usually empty. */
  readonly flattened: readonly string[]
}

/** Box metrics, in pixels. */
const BOX_HEIGHT = 34
const BOX_GAP = 16
const ROW_GAP = 22
const FONT = 12.5
const COMMENT_LINE = 16
const COMMENT_CHARS = 130

/** Instruction families, so a reader can tell contacts from outputs at a glance. */
const GROUPS: readonly { readonly names: readonly string[]; readonly fill: string; readonly stroke: string }[] = [
  { names: ['XIC', 'XIO', 'ONS', 'OSR', 'OSF'], fill: '#14251F', stroke: '#2F6F55' },
  { names: ['OTE', 'OTL', 'OTU'], fill: '#1B2436', stroke: '#3B5BA5' },
  { names: ['TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES'], fill: '#2A2117', stroke: '#8A6A2F' },
]

/** Escape text for XML content and attributes. */
function escapeXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

/** Colours for one instruction mnemonic. */
function coloursFor(name: string): { fill: string; stroke: string } {
  const upper = name.toUpperCase()
  const group = GROUPS.find(candidate => candidate.names.includes(upper))
  return group === undefined ? { fill: '#16202E', stroke: '#4B5B6E' } : { fill: group.fill, stroke: group.stroke }
}

/** One drawn box: the label, its rectangle and its colours. */
interface Cell {
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly fill: string
  readonly stroke: string
  /** Label broken for a two-line face; absent for a single line. */
  readonly lines?: readonly string[]
}

/** Longest line a box carries before it wraps. */
const LABEL_CHARS = 30

/**
 * Break a label into at most two lines, preferring a separator near the middle.
 *
 * @param label - Instruction label as drawn.
 */
export function splitLabel(label: string): string[] {
  if (label.length <= LABEL_CHARS) return [label]
  const middle = label.length / 2
  let best = -1
  for (const separator of ['_', '.', ':', ',', ' ']) {
    const at = label.lastIndexOf(separator, Math.floor(middle + 6))
    if (at > 8 && at < label.length - 6 && (best < 0 || Math.abs(at - middle) < Math.abs(best - middle))) best = at
  }
  if (best > 0) return [label.slice(0, best + 1).trim(), label.slice(best + 1).trim()]
  return [label.slice(0, LABEL_CHARS), label.slice(LABEL_CHARS)]
}

/** Width of a box that holds one label. */
function boxWidth(label: string): number {
  const widest = splitLabel(label).reduce((width, line) => Math.max(width, line.length), 0)
  return Math.max(84, Math.ceil(widest * FONT * 0.62) + 18)
}

/** Draw one instruction node as a label. */
function instructionLabel(node: Extract<LadderNode, { kind: 'instruction' }>): string {
  const operands = node.operands.map(group => group.map(token => token.text).join('')).join(',')
  return operands === '' ? node.name : `${node.name}(${operands})`
}

/** Right edge of a laid-out sequence. */
function rightEdge(cells: readonly Cell[]): number {
  return cells.reduce((right, cell) => Math.max(right, cell.x + cell.width), 0)
}

/**
 * How far above its row centre the sequence reaches when laid out.
 *
 * A branch stacks its paths around the centre, so a rung whose comment sits at
 * the centre would have the comment covered by the first stacked path. The
 * row is pushed down by this extent so the comment keeps its own band.
 *
 * @param nodes - Parsed nodes in source order.
 * @returns Distance from the row centre to the highest drawn edge.
 */
function topExtent(nodes: readonly LadderNode[]): number {
  let extent = 0
  let hasInstruction = false
  for (const node of nodes) {
    if (node.kind === 'instruction') {
      hasInstruction = true
      continue
    }
    const step = BOX_HEIGHT + 8
    node.paths.forEach((path, index) => {
      const above = ((node.paths.length - 1) * step) / 2 - index * step
      extent = Math.max(extent, above + topExtent(path))
    })
  }
  return Math.max(extent, hasInstruction ? BOX_HEIGHT / 2 : 0)
}

/**
 * Lay one sequence of nodes along a row.
 * @param nodes - Parsed nodes in source order.
 * @param startX - Left edge of the sequence.
 * @param centreY - Vertical centre of the sequence's first row.
 * @param flattened - Collector for layout notes.
 * @returns The drawn cells and the width the sequence occupies.
 */
function laySequence(nodes: readonly LadderNode[], startX: number, centreY: number, flattened: string[]): { cells: Cell[]; width: number } {
  const cells: Cell[] = []
  let x = startX
  for (const node of nodes) {
    if (node.kind === 'instruction') {
      const label = instructionLabel(node)
      const box = boxWidth(label)
      const colours = coloursFor(node.name)
      cells.push({ label, lines: splitLabel(label), x, y: centreY - BOX_HEIGHT / 2, width: box, height: BOX_HEIGHT, ...colours })
      x += box + BOX_GAP
      continue
    }
    // A branch stacks its paths, then draws their re-convergence: a stub from each path's right
    // edge to one join bar. Without the join the drawing showed the paths but not that they merge.
    const step = BOX_HEIGHT + 8
    const firstCentres = node.paths.map((_path, index) => centreY - ((node.paths.length - 1) * step) / 2 + index * step)
    const laidPaths = node.paths.map((path, index) => laySequence(path, x + 14, firstCentres[index]!, flattened))
    const pathRights = laidPaths.map(laid => rightEdge(laid.cells))
    const span = Math.max(84, ...laidPaths.map(laid => rightEdge(laid.cells) - x))
    for (const laid of laidPaths) cells.push(...laid.cells)
    const top = firstCentres[0]! - BOX_HEIGHT / 2
    const bottom = firstCentres[firstCentres.length - 1]! + BOX_HEIGHT / 2
    cells.push({ label: '', x, y: top, width: 10, height: bottom - top, fill: 'none', stroke: '#64748B' })
    const joinX = x + span + 12
    for (const [index, laid] of laidPaths.entries()) {
      const right = pathRights[index]!
      const centre = firstCentres[index]!
      if (joinX > right) cells.push({ label: '', x: right, y: centre - 1, width: joinX - right, height: 2, fill: '#64748B', stroke: 'none' })
    }
    cells.push({ label: '', x: joinX, y: top, width: 2, height: bottom - top, fill: '#64748B', stroke: 'none' })
    x = joinX + 34
  }
  return { cells, width: Math.max(0, rightEdge(cells) - startX) }
}

/** Split a comment into drawable lines. */
function commentLines(comment: string | undefined): string[] {
  if (comment === undefined || comment.trim() === '') return []
  const lines: string[] = []
  for (const paragraph of comment.split(/\r?\n/u)) {
    let rest = paragraph.trim()
    while (rest.length > COMMENT_CHARS) {
      const cut = rest.lastIndexOf(' ', COMMENT_CHARS)
      const at = cut > 40 ? cut : COMMENT_CHARS
      lines.push(rest.slice(0, at).trim())
      rest = rest.slice(at).trim()
    }
    lines.push(rest)
  }
  return lines
}

/** Draw one rung row and return the SVG fragments plus the height it consumed. */
function drawRung(rung: RungSpec, top: number, left: number, right: number, flattened: string[]): { shapes: string[]; height: number } {
  const parsed = parseLadder(rung.text)
  const comment = commentLines(rung.comment)
  const shapes: string[] = []
  const numberY = top + 11
  shapes.push(`<text x="${left + 4}" y="${numberY}" font-size="11" font-family="Consolas, monospace" fill="#7D8CA3">${rung.number}</text>`)
  let cursor = top
  if (comment.length > 0) {
    cursor += COMMENT_LINE / 2
    for (const line of comment) {
      shapes.push(`<text x="${left + 26}" y="${cursor + 10}" font-size="11.5" font-family="Segoe UI, Arial, sans-serif" fill="#9FB0C6">${escapeXml(line)}</text>`)
      cursor += COMMENT_LINE
    }
    cursor += 4
  }
  const centre = cursor + topExtent(parsed.nodes) + 6
  const laid = laySequence(parsed.nodes, left + 26, centre, flattened)
  const height = Math.max(centre + BOX_HEIGHT / 2 - top + ROW_GAP, ...laid.cells.map(cell => cell.y + cell.height - top + ROW_GAP / 2))
  shapes.push(`<line x1="${left}" y1="${centre}" x2="${right}" y2="${centre}" stroke="#334155" stroke-width="1"/>`)
  shapes.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + height}" stroke="#64748B" stroke-width="2"/>`)
  shapes.push(`<line x1="${right}" y1="${top}" x2="${right}" y2="${top + height}" stroke="#64748B" stroke-width="2"/>`)
  for (const cell of laid.cells) {
    if (cell.label === '') {
      shapes.push(`<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="none" stroke="${cell.stroke}"/>`)
      continue
    }
    shapes.push(`<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" rx="3" fill="${cell.fill}" stroke="${cell.stroke}"/>`)
    const lines = cell.lines ?? [cell.label]
    const centreX = cell.x + cell.width / 2
    if (lines.length > 1) {
      shapes.push(`<text x="${centreX}" y="${cell.y + cell.height / 2 - 3}" text-anchor="middle" font-size="${FONT - 1.5}" font-family="Consolas, monospace" fill="#E2E8F0">${escapeXml(lines[0] ?? '')}</text>`)
      shapes.push(`<text x="${centreX}" y="${cell.y + cell.height / 2 + 11}" text-anchor="middle" font-size="${FONT - 1.5}" font-family="Consolas, monospace" fill="#E2E8F0">${escapeXml(lines[1] ?? '')}</text>`)
    } else {
      shapes.push(`<text x="${centreX}" y="${cell.y + cell.height / 2 + 4.5}" text-anchor="middle" font-size="${FONT}" font-family="Consolas, monospace" fill="#E2E8F0">${escapeXml(cell.label)}</text>`)
    }
  }
  return { shapes, height }
}

/** Render rungs to one SVG document. */
export function renderLadderSvg(rungs: readonly RungSpec[], title = 'Ladder preview', note?: string): LadderRaster {
  const flattened: string[] = []
  const widest = Math.max(
    420,
    ...rungs.map(rung => {
      const parsed = parseLadder(rung.text)
      const laid = laySequence(parsed.nodes, 60, 0, [])
      return rightEdge(laid.cells) + 60
    }),
  )
  const width = Math.min(1800, Math.ceil(widest))
  const left = 16
  const right = width - 16
  const shapes: string[] = []
  let top = note === undefined ? 34 : 52
  for (const rung of rungs) {
    const drawn = drawRung(rung, top, left, right, flattened)
    shapes.push(...drawn.shapes)
    top += drawn.height
  }
  const height = top + 12
  const svg = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#0B1220"/>`,
    `<text x="16" y="18" font-size="12" font-family="Segoe UI, Arial, sans-serif" fill="#94A3B8">${escapeXml(title)}</text>`,
    ...(note === undefined ? [] : [`<text x="16" y="34" font-size="11" font-family="Segoe UI, Arial, sans-serif" fill="#64748B">${escapeXml(note)}</text>`]),
    ...shapes,
    '</svg>',
    '',
  ].join('\n')
  return { svg, width, height, rungs: rungs.length, flattened }
}

/** Find a Chromium on this host, if one is installed. */
export function findChromium(): string | undefined {
  const candidates = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ]
  return candidates.find(candidate => existsSync(candidate))
}

/** Rasterise one SVG file with a headless browser; true when a PNG appeared. */
export async function rasterise(svgPath: string, pngPath: string, width: number, height: number): Promise<boolean> {
  const browser = findChromium()
  if (browser === undefined) return false
  mkdirSync(join(pngPath, '..'), { recursive: true })
  const absoluteSvg = resolve(svgPath)
  const absolutePng = resolve(pngPath)
  const url = `file:///${absoluteSvg.replace(/\\/gu, '/').replace(/^\/+/u, '')}`
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-sandbox', `--screenshot=${absolutePng}`, `--window-size=${width},${height}`, url]
  const ok = await new Promise<boolean>(resolvePromise => {
    const child = spawn(browser, args, { stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill(); resolvePromise(false) }, 60_000)
    child.on('error', () => { clearTimeout(timer); resolvePromise(false) })
    child.on('exit', () => { clearTimeout(timer); resolvePromise(true) })
  })
  return ok && existsSync(absolutePng)
}

/** Write the SVG beside its PNG and rasterise it when a browser exists. */
export async function writeLadderRaster(outputRoot: string, name: string, raster: LadderRaster): Promise<{ svg: string; png?: string }> {
  mkdirSync(outputRoot, { recursive: true })
  const svgPath = join(outputRoot, `${name}.svg`)
  writeFileSync(svgPath, raster.svg, 'utf8')
  const pngPath = join(outputRoot, `${name}.png`)
  const ok = await rasterise(svgPath, pngPath, raster.width, raster.height)
  return ok ? { svg: svgPath, png: pngPath } : { svg: svgPath }
}
