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

/** One rung to draw: its number and its verified text. */
export interface RungSpec {
  readonly number: number
  readonly text: string
}

/** A rendered diagram plus what the layout had to flatten. */
export interface LadderRaster {
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly rungs: number
  readonly flattened: readonly string[]
}

/** Box metrics, in pixels. */
const BOX_HEIGHT = 34
const BOX_GAP = 16
const ROW_GAP = 22
const RAIL = 20
const FONT = 12.5

/** Escape text for XML content and attributes. */
function escapeXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;').replace(/"/gu, '&quot;')
}

/** One drawn box: the label plus its rectangle. */
interface Cell {
  readonly label: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Width of a box that holds one label. */
function boxWidth(label: string): number {
  return Math.max(84, Math.ceil(label.length * FONT * 0.62) + 18)
}

/** Draw one instruction node as a label. */
function instructionLabel(node: Extract<LadderNode, { kind: 'instruction' }>): string {
  const operands = node.operands.map(group => group.map(token => token.text).join('')).join(',')
  return operands === '' ? node.name : `${node.name}(${operands})`
}

/** Lay one sequence of nodes along a row, returning its cells and consumed width. */
function laySequence(nodes: readonly LadderNode[], startX: number, centreY: number, flattened: string[]): { cells: Cell[]; width: number } {
  const cells: Cell[] = []
  let x = startX
  let width = 0
  for (const node of nodes) {
    if (node.kind === 'instruction') {
      const label = instructionLabel(node)
      const box = boxWidth(label)
      cells.push({ label, x, y: centreY - BOX_HEIGHT / 2, width: box, height: BOX_HEIGHT })
      x += box + BOX_GAP
      width = x - startX
      continue
    }
    // A branch stacks its paths; the widest path decides the advance.
    const pathWidths = node.paths.map(path => laySequence(path, startX + 12, centreY, flattened).width)
    flattened.push(`branch with ${node.paths.length} path(s)`)
    const span = Math.max(...pathWidths, 84)
    let offset = centreY - ((node.paths.length - 1) * (BOX_HEIGHT + 8)) / 2
    for (const path of node.paths) {
      const laid = laySequence(path, x + 12, offset, flattened)
      cells.push(...laid.cells)
      offset += BOX_HEIGHT + 8
    }
    cells.push({ label: '', x, y: centreY - ((node.paths.length - 1) * (BOX_HEIGHT + 8)) / 2 - 4, width: 10, height: (node.paths.length - 1) * (BOX_HEIGHT + 8) + BOX_HEIGHT + 8 })
    x += span + 22
    width = x - startX
  }
  return { cells, width }
}

/** Draw one rung row and return the SVG fragment plus its height. */
function drawRung(rung: RungSpec, top: number, left: number, right: number, flattened: string[]): { shapes: string[]; height: number; cells: Cell[] } {
  const parsed = parseLadder(rung.text)
  const centre = top + BOX_HEIGHT / 2 + 6
  const laid = laySequence(parsed.nodes, left + 18, centre, flattened)
  const height = Math.max(BOX_HEIGHT + ROW_GAP, ...laid.cells.map(cell => cell.y + cell.height - top + ROW_GAP / 2))
  const shapes: string[] = []
  shapes.push(`<text x="${left + 4}" y="${top + 12}" font-size="11" font-family="Consolas, monospace" fill="#7D8CA3">${rung.number}</text>`)
  shapes.push(`<line x1="${left}" y1="${centre}" x2="${right}" y2="${centre}" stroke="#334155" stroke-width="1"/>`)
  shapes.push(`<line x1="${left}" y1="${top}" x2="${left}" y2="${top + height}" stroke="#64748B" stroke-width="2"/>`)
  shapes.push(`<line x1="${right}" y1="${top}" x2="${right}" y2="${top + height}" stroke="#64748B" stroke-width="2"/>`)
  for (const cell of laid.cells) {
    if (cell.label === '') {
      shapes.push(`<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" fill="none" stroke="#64748B"/>`)
      continue
    }
    shapes.push(`<rect x="${cell.x}" y="${cell.y}" width="${cell.width}" height="${cell.height}" rx="3" fill="#16202E" stroke="#4B5B6E"/>`)
    shapes.push(`<text x="${cell.x + cell.width / 2}" y="${cell.y + cell.height / 2 + 4.5}" text-anchor="middle" font-size="${FONT}" font-family="Consolas, monospace" fill="#E2E8F0">${escapeXml(cell.label)}</text>`)
  }
  return { shapes, height, cells: laid.cells }
}

/** Render rungs to one SVG document. */
export function renderLadderSvg(rungs: readonly RungSpec[], title = 'Ladder preview'): LadderRaster {
  const left = 16
  const computed = rungs.map(rung => parseLadder(rung.text))
  const widest = Math.max(
    420,
    ...computed.map(parsed => {
      const laid = laySequence(parsed.nodes, 34, 0, [])
      return laid.width + 90
    }),
  )
  const width = Math.min(1600, Math.ceil(widest))
  const right = width - 16
  const flattened: string[] = []
  const shapes: string[] = []
  let top = 34
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
