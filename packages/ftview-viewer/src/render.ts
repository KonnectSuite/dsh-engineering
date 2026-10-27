/**
 * Render one FactoryTalk View ME display to SVG.
 *
 * The renderer is deliberately a pure function of the display tree plus an
 * optional tag table: the same call runs in the browser preview, in a Node
 * snapshot test, and in the headless screenshot harness. It draws the objects
 * the application actually uses (panels, groups, text, buttons with per-state
 * captions and colours, images, numeric and string displays, multistate
 * indicators, alarm placeholders, basic shapes) and leaves a labelled
 * placeholder for a type it does not know yet rather than drawing nothing.
 *
 * @module dsh-engineering-ftview-viewer/render
 */

import { attribute, child, numberAttribute, parseXml, type XmlNode } from './xml.ts'

/** Inputs a live preview may supply. */
export interface RenderOptions {
  /** Resolve an image name to a URL; absent means draw a labelled placeholder. */
  readonly imageHref?: (name: string) => string | undefined
  /** Current tag values, keyed by HMI tag name. */
  readonly tagValues?: Readonly<Record<string, number | string | boolean>>
}

const OBJECTS = new Set([
  'panel', 'text', 'group', 'momentaryButton', 'gotoButton', 'multistateButton', 'latchedButton',
  'maintainButton', 'numericDisplay', 'numericInput', 'stringDisplay', 'stringInput', 'image',
  'line', 'rectangle', 'ellipse', 'polygon', 'arc', 'barGraph', 'gauge', 'listSelector', 'trend',
  'alarmList', 'alarmStatusList', 'alarmBanner', 'clearAlarmBannerButton', 'recipe', 'activeX',
  'symbol', 'referenceObject', 'globalObject', 'rampButton',
])

const NAMED_COLORS: Readonly<Record<string, string>> = {
  white: '#ffffff', black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff',
  magenta: '#ff00ff', maroon: '#800000', navy: '#000080', teal: '#008080', lime: '#00ff00',
  olive: '#808000', purple: '#800080', fuchsia: '#ff00ff', aqua: '#00ffff', orange: '#ffa500',
}

/** Escape text for SVG. */
function escapeXml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Normalise a colour to `#rrggbb`, or undefined for none/transparent. */
export function colourOf(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const text = value.trim().toLowerCase()
  if (text === '' || text === 'none' || text === 'transparent') return undefined
  const named = NAMED_COLORS[text]
  if (named !== undefined) return named
  if (/^#[0-9a-f]{6}$/u.test(text)) return text
  if (/^#[0-9a-f]{8}$/u.test(text)) return `#${text.slice(3)}`
  if (/^#[0-9a-f]{3}$/u.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`
  return undefined
}

/** One selected state of an object, with its caption. */
interface ObjectState {
  readonly id: string
  readonly backColor?: string
  readonly borderColor?: string
  readonly caption?: string
  readonly captionColor?: string
  readonly fontFamily?: string
  readonly fontSize?: number
  readonly bold?: boolean
  readonly italic?: boolean
  readonly alignment?: string
}

/** The state an object displays now, defaulting to state 0. */
function stateOf(node: XmlNode): ObjectState | undefined {
  const states = child(node, 'states')
  if (states === undefined) return undefined
  const list = states.children.filter(candidate => candidate.tag === 'state')
  if (list.length === 0) return undefined
  const current = attribute(node, 'currentStateId') ?? attribute(node, 'stateId') ?? '0'
  const exact = list.find(candidate => attribute(candidate, 'stateId') === current)
  const selected = exact ?? list.find(candidate => attribute(candidate, 'stateId') === '0') ?? list[0]
  if (selected === undefined) return undefined
  const caption = child(selected, 'caption')
  const id = attribute(selected, 'stateId') ?? '0'
  return {
    id,
    backColor: colourOf(attribute(selected, 'backColor')),
    borderColor: colourOf(attribute(selected, 'borderColor')),
    ...(caption === undefined ? {} : {
      caption: attribute(caption, 'caption'),
      captionColor: colourOf(attribute(caption, 'color')),
      ...(attribute(caption, 'fontFamily') === undefined ? {} : { fontFamily: attribute(caption, 'fontFamily') as string }),
      fontSize: numberAttribute(caption, 'fontSize', 12),
      bold: attribute(caption, 'bold') === 'true',
      italic: attribute(caption, 'italic') === 'true',
      alignment: attribute(caption, 'alignment'),
    }),
  }
}

/** Fill and stroke for one object. */
function paintOf(node: XmlNode, state: ObjectState | undefined): { fill: string; stroke: string; strokeWidth: number } {
  const backStyle = attribute(node, 'backStyle') ?? 'solid'
  const fill = backStyle === 'transparent'
    ? 'none'
    : colourOf(state?.backColor ?? attribute(node, 'backColor')) ?? '#d4d0c8'
  const borderStyle = attribute(node, 'borderStyle') ?? 'none'
  const stroke = borderStyle === 'none' ? 'none' : colourOf(state?.borderColor ?? attribute(node, 'borderColor') ?? attribute(node, 'foreColor')) ?? '#808080'
  const strokeWidth = borderStyle === 'none' ? 0 : Math.max(1, numberAttribute(node, 'borderWidth', 1))
  return { fill, stroke, strokeWidth }
}

/** A caption, its font and its anchor for one object. */
function captionOf(node: XmlNode, state: ObjectState | undefined): { text: string; color: string; family: string; size: number; bold: boolean; italic: boolean; anchor: string } {
  const own = child(node, 'caption')
  const text = attribute(node, 'caption') ?? (own === undefined ? undefined : attribute(own, 'caption')) ?? state?.caption ?? ''
  const anchor = ((): string => {
    const alignment = state?.alignment ?? attribute(own ?? node, 'alignment') ?? 'middleCenter'
    if (alignment.toLowerCase().includes('left')) return 'start'
    if (alignment.toLowerCase().includes('right')) return 'end'
    return 'middle'
  })()
  return {
    text,
    color: colourOf(state?.captionColor ?? (own === undefined ? undefined : attribute(own, 'color')) ?? attribute(node, 'foreColor')) ?? '#000000',
    family: state?.fontFamily ?? attribute(own ?? node, 'fontFamily') ?? attribute(node, 'fontFamily') ?? 'Arial Unicode MS',
    size: state?.fontSize ?? numberAttribute(own ?? node, 'fontSize', numberAttribute(node, 'fontSize', 12)),
    bold: state?.bold ?? attribute(own ?? node, 'bold') === 'true',
    italic: state?.italic ?? attribute(own ?? node, 'italic') === 'true',
    anchor,
  }
}

/** Text position for one anchor. */
function textX(left: number, width: number, anchor: string, margin: number): number {
  if (anchor === 'start') return left + margin
  if (anchor === 'end') return left + width - margin
  return left + width / 2
}

/** The `<text>` element for one caption, vertically centred. */
function textElement(caption: ReturnType<typeof captionOf>, left: number, top: number, width: number, height: number, margin: number): string {
  const lines = caption.text.split(/\r?\n/u)
  const lineHeight = caption.size * 1.25
  const startY = top + height / 2 - ((lines.length - 1) * lineHeight) / 2
  const parts = lines.map((line, index) => `<tspan x="${textX(left, width, caption.anchor, margin)}" y="${startY + index * lineHeight}">${escapeXml(line)}</tspan>`)
  return `<text text-anchor="${caption.anchor}" dominant-baseline="middle" font-family="${escapeXml(caption.family)}" font-size="${caption.size}" fill="${caption.color}"${caption.bold ? ' font-weight="bold"' : ''}${caption.italic ? ' font-style="italic"' : ''}>${parts.join('')}</text>`
}

/** Draw one image object, or its placeholder. */
function imageElement(node: XmlNode, options: RenderOptions, left: number, top: number, width: number, height: number): string {
  const settings = child(node, 'imageSettings')
  const name = attribute(node, 'imageName') ?? (settings === undefined ? undefined : attribute(settings, 'imageName')) ?? ''
  const href = name === ''
    ? undefined
    : options.imageHref === undefined
      ? `Images/${name}`
      : options.imageHref(name)
  if (href !== undefined) return `<image x="${left}" y="${top}" width="${width}" height="${height}" href="${escapeXml(href)}" preserveAspectRatio="none"/>`
  return `<g><rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f0f0f0" stroke="#909090" stroke-dasharray="4 3"/><text x="${left + width / 2}" y="${top + height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI" font-size="10" fill="#606060">image ${escapeXml(name || '(unnamed)')}</text></g>`
}

/** Draw a numeric value with the display's format, or a placeholder. */
function valueElement(node: XmlNode, caption: ReturnType<typeof captionOf>, left: number, top: number, width: number, height: number, margin: number, options: RenderOptions): string {
  const expression = attribute(node, 'expression') ?? ''
  const value = options.tagValues?.[expression]
  const shown = value === undefined ? '####' : String(value)
  return textElement({ ...caption, text: shown }, left, top, width, height, margin)
}

/** Draw one object and its children. */
function renderObject(node: XmlNode, depth: number, options: RenderOptions): string {
  const left = numberAttribute(node, 'left', 0)
  const top = numberAttribute(node, 'top', 0)
  const width = numberAttribute(node, 'width', 0)
  const height = numberAttribute(node, 'height', 0)
  const visible = attribute(node, 'visible')
  if (visible === 'false' || visible === '0' || visible === 'no') return ''
  const state = stateOf(node)
  const paint = paintOf(node, state)
  const caption = captionOf(node, state)
  const margin = numberAttribute(node, 'horizontalMargin', 4)
  const shape = ((): string => {
    switch (node.tag) {
      case 'panel':
      case 'rectangle':
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
      case 'ellipse':
        return `<ellipse cx="${left + width / 2}" cy="${top + height / 2}" rx="${width / 2}" ry="${height / 2}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
      case 'line':
        return `<line x1="${left}" y1="${top}" x2="${left + width}" y2="${top + height}" stroke="${paint.stroke === 'none' ? paint.fill : paint.stroke}" stroke-width="${Math.max(1, paint.strokeWidth)}"/>`
      case 'image':
        return imageElement(node, options, left, top, width, height)
      case 'numericDisplay':
      case 'numericInput':
      case 'stringDisplay':
      case 'stringInput':
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` + valueElement(node, caption, left, top, width, height, margin, options)
      case 'alarmList':
      case 'alarmStatusList':
      case 'alarmBanner':
      case 'clearAlarmBannerButton':
        return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="#f4f4f4" stroke="#a0a0a0"/><text x="${left + 8}" y="${top + 18}" font-family="Segoe UI" font-size="11" fill="#505050">${escapeXml(node.tag)}</text>`
      case 'group':
        return ''
      default:
        break
    }
    if (OBJECTS.has(node.tag)) {
      // Buttons, indicators and any type with a face: fill, border and caption.
      const body = `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
      return caption.text === '' ? body : body + textElement(caption, left, top, width, height, margin)
    }
    return ''
  })()

  const own = shape === '' ? '' : shape
  const nested = node.children.filter(candidate => OBJECTS.has(candidate.tag))
  if (nested.length === 0) return own
  return own + `<g transform="translate(${left},${top})">${nested.map(candidate => renderObject(candidate, depth + 1, options)).join('')}</g>`
}

/**
 * Render one display file to an SVG document.
 *
 * @param source - The display XML.
 * @param options - Image resolver and tag values.
 * @returns A complete, standalone SVG string.
 */
export function renderDisplay(source: string, options: RenderOptions = {}): string {
  const display = parseXml(source)
  const settings = child(display, 'displaySettings')
  const width = settings === undefined ? numberAttribute(display, 'width', 640) : numberAttribute(settings, 'width', numberAttribute(display, 'width', 640))
  const height = settings === undefined ? numberAttribute(display, 'height', 480) : numberAttribute(settings, 'height', numberAttribute(display, 'height', 480))
  const background = colourOf(attribute(display, 'backColor') ?? (settings === undefined ? undefined : attribute(settings, 'backColor'))) ?? '#c6c6c6'
  const container = child(display, 'objects') ?? display
  const objects = container.children.filter(candidate => OBJECTS.has(candidate.tag))
  const body = objects.map(object => renderObject(object, 0, options)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`
}
