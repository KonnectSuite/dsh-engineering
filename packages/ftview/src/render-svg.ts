/**
 * Render one parsed display to SVG, and optionally to PNG through a headless browser.
 *
 * This is a sanity view, not a Studio preview: it draws the geometry the export
 * declares (panels, text, buttons, indicators, lines) so a model can see overlap
 * and colour before a human imports anything. Artwork named by an object is inlined when the
 * export carries its file under `Images/`; animations and vendor widgets are drawn as
 * labelled placeholders on purpose.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { encodeEntities } from './display-tree.ts'
import { decodeEntities } from './model.ts'
import type { DisplayObject } from './model.ts'

/** Canvas size and background read from `displaySettings`. */
export interface RenderSettings {
  readonly width: number
  readonly height: number
  readonly backColor: string
}

/** What the renderer produced. */
export interface RenderResult {
  readonly svg: string
  readonly width: number
  readonly height: number
  readonly drawn: number
  readonly skipped: readonly string[]
  readonly problems: readonly RenderProblem[]
}

/** A geometry problem the drawing exposes before anyone imports it. */
export interface RenderProblem {
  readonly object: string
  readonly kind: 'outside' | 'overflows'
  readonly detail: string
}

/** The declared object type: newer exports wrap it in \`type\` on an \`object\` element. */
function kindOf(object: DisplayObject): string {
  return String(object.attributes.type ?? object.type).toLowerCase()
}

/** Rough glyph width of the renderer's fonts, as a fraction of the font size. */
const CHARACTER_WIDTH = 0.55

/** Lines the text needs at this width, ignoring wrapping subtleties. */
function linesNeeded(text: string, width: number, size: number): number {
  const capacity = Math.max(1, Math.floor(width / Math.max(1, size * CHARACTER_WIDTH)))
  return text.split(/\r?\n/u).reduce((total, line) => total + Math.max(1, Math.ceil(line.length / capacity)), 0)
}

/** Geometry and text that the canvas or the object's own box cannot hold. */
function problemsOf(object: DisplayObject, settings: RenderSettings): RenderProblem[] {
  const name = object.name ?? object.type
  const left = geometry(object, 'left', 0)
  const top = geometry(object, 'top', 0)
  const width = geometry(object, 'width', 0)
  const height = geometry(object, 'height', 0)
  const type = kindOf(object)
  if (type === 'line') return []
  const problems: RenderProblem[] = []
  if (left < 0 || top < 0 || left + width > settings.width + 1 || top + height > settings.height + 1) {
    problems.push({ object: name, kind: 'outside', detail: `box ${left},${top} ${width}x${height} leaves the ${settings.width}x${settings.height} canvas` })
  }
  const text = faceText(object)
  if (type === 'text') {
    const size = geometry(object, 'fontSize', 12)
    const needed = linesNeeded(text, width, size) * (size + 2)
    if (needed > height + 4) problems.push({ object: name, kind: 'overflows', detail: `${text.length} characters need about ${needed}px of height in a ${height}px box` })
  }
  if (type.includes('button')) {
    const size = geometry(object, 'fontSize', 12)
    const needed = Math.max(...text.split(/\r?\n/u).map(line => line.length)) * size * CHARACTER_WIDTH
    if (needed > width - 8) problems.push({ object: name, kind: 'overflows', detail: `caption "${text}" needs about ${Math.round(needed)}px in a ${width}px button` })
  }
  return problems
}

/** Settings defaults the ME templates use when a file omits them. */
const DEFAULT_SETTINGS: RenderSettings = { width: 640, height: 480, backColor: '#C6C6C6' }

/** One raster the renderer can inline: the image bytes and their media type. */
export interface RasterImage {
  readonly mime: string
  readonly base64: string
}

/** Child elements the parser reports as objects but which draw nothing. */
const STRUCTURAL = new Set(['connections', 'connection', 'caption', 'states', 'state', 'animations', 'imagesettings', 'displaysettings', 'parameterfile', 'message', 'scada'])

/** Browser executables that can rasterise an SVG here. */
const BROWSERS: readonly string[] = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
]

/** Read the canvas from a display file, falling back to template defaults. */
export function settingsFromXml(xml: string): RenderSettings {
  const tag = /<displaySettings\b[^>]*>/u.exec(xml)?.[0] ?? ''
  const number = (name: string, fallback: number): number => {
    const raw = new RegExp(`${name}="(\\d+)"`, 'u').exec(tag)?.[1]
    return raw === undefined ? fallback : Number(raw)
  }
  const colour = /backColor="(#[0-9A-Fa-f]{6})"/u.exec(tag)?.[1]
  return {
    width: number('width', DEFAULT_SETTINGS.width),
    height: number('height', DEFAULT_SETTINGS.height),
    backColor: colour ?? DEFAULT_SETTINGS.backColor,
  }
}

/** Colour attribute as CSS, treating the vendor's transparent marker as none. */
function colour(value: string | undefined, fallback: string): string {
  if (value === undefined || value.length === 0) return fallback
  if (value === 'transparent' || value === 'Transparent') return 'none'
  return value
}

/** Integer geometry attribute. */
function geometry(object: DisplayObject, name: string, fallback: number): number {
  const raw = object.attributes[name]
  if (raw === undefined) return fallback
  const value = Number(raw)
  return Number.isFinite(value) ? value : fallback
}

/** The vendor's polyline marker: pairs of display coordinates, space separated. */
function polyline(object: DisplayObject): string | undefined {
  const raw = object.attributes.line
  if (raw === undefined) return undefined
  const numbers = raw.trim().split(/\s+/u).map(Number).filter(Number.isFinite)
  if (numbers.length < 4 || numbers.length % 2 !== 0) return undefined
  const pairs: string[] = []
  for (let i = 0; i < numbers.length; i += 2) pairs.push(`${numbers[i]},${numbers[i + 1]}`)
  return pairs.join(' ')
}

/** SVG dash pattern for a vendor line style. */
function dash(style: string | undefined): string {
  if (style === 'dash') return ' stroke-dasharray="6 4"'
  if (style === 'dot') return ' stroke-dasharray="2 3"'
  return ''
}

/** Grid lines inside a box, for trends and bar tracks. */
function grid(left: number, top: number, width: number, height: number, stroke: string, columns: number, rows: number): string {
  const lines: string[] = []
  for (let i = 1; i < columns; i += 1) {
    const x = left + (width / columns) * i
    lines.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.5"/>`)
  }
  for (let i = 1; i < rows; i += 1) {
    const y = top + (height / rows) * i
    lines.push(`<line x1="${left}" y1="${y}" x2="${left + width}" y2="${y}" stroke="${stroke}" stroke-width="1" stroke-opacity="0.5"/>`)
  }
  return lines.join('')
}

/** The expression a frame is wired to, as a short label, or an empty string. */
function wiredTag(object: DisplayObject, left: number, top: number, width: number, height: number): string {
  const connections = object.connections ?? {}
  const raw = connections.Value ?? connections.Indicator ?? connections.Display ?? Object.values(connections)[0]
  if (raw === undefined || raw === '') return ''
  const full = decodeEntities(raw)
  const room = Math.max(6, Math.floor(width / 5))
  const shown = full.length > room ? `${full.slice(0, room)}…` : full
  return `<text x="${left + 3}" y="${top + height - 3}" font-size="9" font-family="Segoe UI, Arial, sans-serif" fill="#0B1220">${encodeEntities(shown)}</text>`
}

/** Text drawn on a face: the caption attribute, else the object name. */
function faceText(object: DisplayObject): string {
  const raw = object.attributes.caption ?? object.attributes.Text ?? object.name ?? ''
  return decodeEntities(raw)
}

/** One object as SVG. */
function draw(object: DisplayObject, images: ReadonlyMap<string, RasterImage>): string {
  const left = geometry(object, 'left', 0)
  const top = geometry(object, 'top', 0)
  const width = geometry(object, 'width', 0)
  const height = geometry(object, 'height', 0)
  const type = kindOf(object)
  const fill = colour(object.attributes.backColor, 'none')
  const stroke = colour(object.attributes.borderColor, 'none')
  const border = `${geometry(object, 'borderWidth', 0) > 0 && stroke !== 'none' ? ` stroke="${stroke}"` : ''}`
  const label = encodeEntities(faceText(object))
  const tag = wiredTag(object, left, top, width, height)
  if (type === 'text') {
    const size = geometry(object, 'fontSize', 12)
    const colourText = colour(object.attributes.color, '#000000')
    const lines = faceText(object).split(/\r?\n/u).map(line => encodeEntities(line))
    const spans = lines
      .map((line, index) => `<tspan x="${left}" dy="${index === 0 ? 0 : size + 2}">${line}</tspan>`)
      .join('')
    return `<text x="${left}" y="${top + size}" font-size="${size}" font-family="Segoe UI, Arial, sans-serif" fill="${colourText}">${spans}</text>`
  }
  if (type === 'line') {
    const points = polyline(object)
    const strokeColour = colour(object.attributes.foreColor ?? object.attributes.color ?? object.attributes.backColor, '#000000')
    const width = geometry(object, 'lineWidth', 1)
    if (points === undefined) {
      return `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top + height}" stroke="${strokeColour}" stroke-width="${width}"/>`
    }
    return `<polyline points="${points}" fill="none" stroke="${strokeColour}" stroke-width="${width}"${dash(object.attributes.lineStyle)}/>`
  }
  const imageName = object.attributes.imageName
  if (imageName !== undefined && images.has(imageName)) {
    const raster = images.get(imageName) as RasterImage
    return `<image x="${left}" y="${top}" width="${width}" height="${height}" preserveAspectRatio="none" href="data:${raster.mime};base64,${raster.base64}"/>`
  }
  if (type.includes('indicator')) {
    const cx = left + width / 2
    const cy = top + height / 2
    const radius = Math.max(2, Math.min(width, height) / 2)
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${colour(object.attributes.backColor, '#FF0000')}"${border}/>${tag}`
  }
  const rect = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${fill}"${border}/>`
  if (type.includes('button')) {
    const size = geometry(object, 'fontSize', 12)
    const colourText = colour(object.attributes.captionColor ?? object.attributes.color, '#000000')
    return `${rect}${tag}<text x="${left + width / 2}" y="${top + height / 2 + size / 3}" text-anchor="middle" font-size="${size}" font-family="Segoe UI, Arial, sans-serif" fill="${colourText}">${label}</text>`
  }
  if (type.includes('trend')) {
    return `${rect}${tag}${grid(left, top, width, height, colour(object.attributes.borderColor, '#94A3B8'), 4, 4)}`
  }
  if (type.includes('bargraph')) {
    return `${rect}${tag}${grid(left, top, width, height, colour(object.attributes.borderColor, '#94A3B8'), 1, 4)}`
  }
  if (type === 'panel' || type.includes('rectangle')) return `${rect}${tag}`
  return `${rect}${tag}<text x="${left + 2}" y="${top + 12}" font-size="10" font-family="Segoe UI, Arial, sans-serif" fill="#64748B">${encodeEntities(object.name ?? object.type)}</text>`
}

/** Render a display to an SVG document. */
export function renderDisplaySvg(name: string, objects: readonly DisplayObject[], settings: RenderSettings, images: ReadonlyMap<string, RasterImage> = new Map()): RenderResult {
  const skipped: string[] = []
  const problems: RenderProblem[] = []
  const shapes: string[] = []
  for (const object of objects) {
    if (STRUCTURAL.has(object.type.toLowerCase()) || STRUCTURAL.has(kindOf(object))) continue
    if (geometry(object, 'width', 0) === 0 && geometry(object, 'height', 0) === 0) {
      skipped.push(object.name ?? object.type)
      continue
    }
    shapes.push(draw(object, images))
    problems.push(...problemsOf(object, settings))
  }
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.width}" height="${settings.height}" viewBox="0 0 ${settings.width} ${settings.height}">`,
    `<rect x="0" y="0" width="${settings.width}" height="${settings.height}" fill="${settings.backColor}"/>`,
    ...shapes,
    `</svg>`,
    '',
  ].join('\n')
  return { svg, width: settings.width, height: settings.height, drawn: shapes.length, skipped, problems }
}

/** One drawing on a review sheet: the display name and its own SVG document. */
export interface SheetEntry {
  readonly name: string
  readonly svg: string
}

/**
 * Stack finished display drawings onto one image so a reviewer can look at a set
 * in a single glance instead of opening a dozen files.
 *
 * Each display is embedded as an `<image>` holding its SVG document, which every
 * browser draws, so the sheet stays a plain SVG that the same rasteriser accepts.
 *
 * @param entries - Rendered displays in review order.
 * @param width - Sheet width in pixels; narrower drawings are centred.
 * @returns The sheet document and its size.
 */
export function composeSheet(entries: readonly SheetEntry[], width: number): { readonly svg: string; readonly width: number; readonly height: number } {
  const TITLE = 26
  const GAP = 10
  const rows = entries.map(entry => {
    const size = /width="(\d+)" height="(\d+)"/u.exec(entry.svg)
    const w = size === null ? width : Number(size[1])
    const h = size === null ? Math.round(width * 0.75) : Number(size[2])
    return { entry, w, h }
  })
  const height = rows.reduce((total, row) => total + TITLE + row.h + GAP, GAP)
  const parts: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#0B1220"/>`,
  ]
  let y = GAP
  for (const row of rows) {
    parts.push(`<text x="12" y="${y + 17}" font-family="Segoe UI, Arial, sans-serif" font-size="14" fill="#7FA8C9">${encodeEntities(row.entry.name)}</text>`)
    const x = Math.max(0, Math.round((width - row.w) / 2))
    const encoded = Buffer.from(row.entry.svg, 'utf8').toString('base64')
    parts.push(`<image x="${x}" y="${y + TITLE}" width="${row.w}" height="${row.h}" href="data:image/svg+xml;base64,${encoded}"/>`)
    y += TITLE + row.h + GAP
  }
  parts.push('</svg>')
  return { svg: parts.join('\n'), width, height }
}

/** Whether a headless browser exists to rasterise the SVG. */
export function findBrowser(): string | undefined {
  return BROWSERS.find(candidate => existsSync(candidate))
}

/** Rasterise an SVG file to PNG with a headless browser; returns the PNG path when it landed. */
export async function rasterize(svgPath: string, pngPath: string, size: { readonly width: number; readonly height: number }): Promise<string | undefined> {
  const browser = findBrowser()
  if (browser === undefined) return undefined
  mkdirSync(dirname(pngPath), { recursive: true })
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${size.width},${size.height}`,
    `--screenshot=${resolve(pngPath)}`,
    `file:///${resolve(svgPath).replace(/\\/gu, '/').replace(/^\//u, '')}`,
  ]
  const code = await new Promise<number | null>(resolve => {
    const child = spawn(browser, args, { stdio: 'ignore' })
    child.on('error', () => resolve(null))
    child.on('exit', value => resolve(value))
  })
  if (code !== 0) return undefined
  return existsSync(pngPath) && statSync(pngPath).size > 0 ? pngPath : undefined
}

/** Copy a render to disk next to the export, returning what landed. */
export async function writeRender(outputRoot: string, display: string, result: RenderResult): Promise<{ svg: string; png?: string }> {
  mkdirSync(outputRoot, { recursive: true })
  const stem = display.replace(/[^\w.-]+/gu, '-')
  const svgPath = `${outputRoot}/${stem}.svg`
  await writeFile(svgPath, result.svg, 'utf8')
  const png = await rasterize(svgPath, `${outputRoot}/${stem}.png`, result)
  return png === undefined ? { svg: svgPath } : { svg: svgPath, png }
}

/** Read a display file's settings without a full export open. */
export async function settingsOfFile(file: string): Promise<RenderSettings> {
  return settingsFromXml(await readFile(file, 'utf8'))
}
