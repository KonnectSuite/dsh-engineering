/**
 * Render one parsed display to SVG, and optionally to PNG through a headless browser.
 *
 * This is a sanity view, not a Studio preview: it draws the geometry the export
 * declares (panels, text, buttons, indicators, lines) so a model can see overlap
 * and colour before a human imports anything. Animations, images and vendor
 * widgets are drawn as placeholders on purpose.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { encodeEntities } from './display-tree.ts'
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

/** Text drawn on a face: the caption attribute, else the object name. */
function faceText(object: DisplayObject): string {
  return object.attributes.caption ?? object.attributes.Text ?? object.name ?? ''
}

/** One object as SVG. */
function draw(object: DisplayObject, images: ReadonlyMap<string, RasterImage>): string {
  const left = geometry(object, 'left', 0)
  const top = geometry(object, 'top', 0)
  const width = geometry(object, 'width', 0)
  const height = geometry(object, 'height', 0)
  const type = object.type.toLowerCase()
  const fill = colour(object.attributes.backColor, 'none')
  const stroke = colour(object.attributes.borderColor, 'none')
  const border = `${geometry(object, 'borderWidth', 0) > 0 && stroke !== 'none' ? ` stroke="${stroke}"` : ''}`
  const label = encodeEntities(faceText(object))
  if (type === 'text') {
    const size = geometry(object, 'fontSize', 12)
    const colourText = colour(object.attributes.color, '#000000')
    return `<text x="${left}" y="${top + size}" font-size="${size}" font-family="Segoe UI, Arial, sans-serif" fill="${colourText}">${label}</text>`
  }
  if (type === 'line') {
    return `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top + height}" stroke="${colour(object.attributes.color, '#000000')}" stroke-width="1"/>`
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
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${colour(object.attributes.backColor, '#FF0000')}"${border}/>`
  }
  const rect = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${fill}"${border}/>`
  if (type.includes('button')) {
    const size = geometry(object, 'fontSize', 12)
    const colourText = colour(object.attributes.captionColor ?? object.attributes.color, '#000000')
    return `${rect}<text x="${left + width / 2}" y="${top + height / 2 + size / 3}" text-anchor="middle" font-size="${size}" font-family="Segoe UI, Arial, sans-serif" fill="${colourText}">${label}</text>`
  }
  if (type === 'panel' || type.includes('rectangle')) return rect
  return `${rect}<text x="${left + 2}" y="${top + 12}" font-size="10" font-family="Segoe UI, Arial, sans-serif" fill="#64748B">${encodeEntities(object.name ?? object.type)}</text>`
}

/** Render a display to an SVG document. */
export function renderDisplaySvg(name: string, objects: readonly DisplayObject[], settings: RenderSettings, images: ReadonlyMap<string, RasterImage> = new Map()): RenderResult {
  const skipped: string[] = []
  const shapes: string[] = []
  for (const object of objects) {
    if (STRUCTURAL.has(object.type.toLowerCase())) continue
    if (geometry(object, 'width', 0) === 0 && geometry(object, 'height', 0) === 0) {
      skipped.push(object.name ?? object.type)
      continue
    }
    shapes.push(draw(object, images))
  }
  const svg = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${settings.width}" height="${settings.height}" viewBox="0 0 ${settings.width} ${settings.height}">`,
    `<rect x="0" y="0" width="${settings.width}" height="${settings.height}" fill="${settings.backColor}"/>`,
    ...shapes,
    `</svg>`,
    '',
  ].join('\n')
  return { svg, width: settings.width, height: settings.height, drawn: shapes.length, skipped }
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
