/**
 * Render one FactoryTalk View ME display to SVG.
 *
 * The renderer is deliberately a pure function of the display tree plus an
 * optional tag table: the same call runs in the browser preview, in a Node
 * snapshot test, and in the headless screenshot harness.
 *
 * Two rules shape it. First, the vocabulary comes from the vendor schema
 * (`vocabulary.generated.ts`, generated from `Gfx-ME16.xsd`), so every object the
 * editor can export is drawn by family instead of dropping out of a hand-kept
 * list. Second, nothing disappears silently: an object the preview cannot draw
 * faithfully becomes a labelled placeholder, and {@link renderDisplayWithReport}
 * returns the count, the names and the reason for every one of them.
 *
 * Geometry follows the measured editor rules in `geometry.ts`; a file that has
 * not been imported yet is read as a draft, where coordinates are percent of the
 * object box.
 *
 * @module dsh-engineering-ftview-viewer/render
 */

import { attribute, child, numberAttribute, parseXml, type XmlNode } from './xml.ts'
import { evaluate } from './expression.ts'
import { ELEMENTS, PART_NAMES, elementFacts, type Family } from './vocabulary.generated.ts'
import {
  arcPath,
  boxDiagonal,
  clamp,
  documentMode,
  lineSegment,
  pathPoints,
  pointsToPath,
  polygonPoints,
  roundedRectPath,
  wedgePath,
  type Box,
  type CoordinateMode,
  type CoordinateRule,
} from './geometry.ts'

/** Inputs a live preview may supply. */
export interface RenderOptions {
  /** Resolve an image name to a URL; absent means draw a labelled placeholder. */
  readonly imageHref?: (name: string) => string | undefined
  /** Current tag values, keyed by HMI tag name. */
  readonly tagValues?: Readonly<Record<string, number | string | boolean>>
  /** Global Objects by `File.Object` name, for reference objects. */
  readonly globals?: Readonly<Record<string, XmlNode>>
  /** Force the coordinate space; `auto` reads it from the document. */
  readonly mode?: CoordinateMode | 'auto'
  /** Draw the labelled placeholder for an object the preview cannot draw; default true. */
  readonly markers?: boolean
}

/** One object the preview did not draw as authored. */
export interface RenderMarker {
  /** Object name, when the export names it. */
  readonly name?: string
  /** Element name. */
  readonly type: string
  /** Painter family the vocabulary gave it. */
  readonly family: Family | 'unknown'
  /** Why it is a placeholder, in one sentence. */
  readonly reason: string
}

/** One object whose coordinates were read through a rule worth stating. */
export interface GeometryNote {
  /** Object name, when the export names it. */
  readonly name?: string
  /** Element name. */
  readonly type: string
  /** The attribute read. */
  readonly attribute: string
  /** The rule applied. */
  readonly rule: CoordinateRule
}

/** What the preview did, beyond the drawing itself. */
export interface RenderReport {
  /** The coordinate space the file was read in. */
  readonly mode: CoordinateMode
  /** Where that decision came from. */
  readonly modeReason: 'settings' | 'imported-flags' | 'staged' | 'forced'
  /** Objects considered. */
  readonly objects: number
  /** Objects drawn as authored. */
  readonly drawn: number
  /** Objects drawn as a labelled placeholder. */
  readonly markers: readonly RenderMarker[]
  /** Objects the vocabulary does not know at all. */
  readonly unknown: readonly RenderMarker[]
  /** Coordinates read through a percent or diagonal rule. */
  readonly geometry: readonly GeometryNote[]
}

/** The drawable facts a render pass collects. */
interface Pass {
  readonly options: RenderOptions
  readonly mode: CoordinateMode
  readonly markers: RenderMarker[]
  readonly unknown: RenderMarker[]
  readonly geometry: GeometryNote[]
  /** Objects considered, nested ones included, so `drawn/objects` is one ratio. */
  objects: number
  drawn: number
}

const NAMED_COLORS: Readonly<Record<string, string>> = {
  white: '#ffffff', black: '#000000', silver: '#c0c0c0', gray: '#808080', grey: '#808080',
  red: '#ff0000', green: '#008000', blue: '#0000ff', yellow: '#ffff00', cyan: '#00ffff',
  magenta: '#ff00ff', maroon: '#800000', navy: '#000080', teal: '#008080', lime: '#00ff00',
  olive: '#808000', purple: '#800080', fuchsia: '#ff00ff', aqua: '#00ffff', orange: '#ffa500',
}

/**
 * Child elements that are structural, not objects: the wrapper some exports put
 * around the object list, and the schema's own `<displaySettings>`.
 */
const WRAPPERS = new Set(['objects', 'displaySettings'])

/** The schema's part names, as a set: a part is never an object of its own. */
const PART_SET: ReadonlySet<string> = new Set(PART_NAMES)

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

/**
 * A readable colour for an annotation drawn on top of an object's own fill.
 *
 * The list and stand-in labels are not authored text, so they must not disappear
 * into a dark fill: grey on the navy of an alarm banner is unreadable, which
 * makes a labelled stand-in as good as an empty one.
 *
 * @param fill - The fill the annotation sits on, when it is a hex colour.
 * @returns A grey for a light fill and an off-white for a dark one.
 */
function annotationColour(fill: string | undefined): string {
  const hex = fill !== undefined && /^#[0-9a-f]{6}$/u.test(fill) ? fill.slice(1) : undefined
  if (hex === undefined) return '#606060'
  const [red, green, blue] = [0, 2, 4].map(at => Number.parseInt(hex.slice(at, at + 2), 16) / 255)
  const luma = 0.2126 * (red ?? 0) + 0.7152 * (green ?? 0) + 0.0722 * (blue ?? 0)
  return luma < 0.45 ? '#f0f0f0' : '#606060'
}

/**
 * Whether a child node is a drawing object rather than a part of one.
 *
 * The answer comes from the schema: every part name the vendor declares — the
 * captions, thresholds, image settings, state tables, animations — is a piece of
 * the object that contains it. Anything else that is not one of the two wrapper
 * names is an object, including a name the installed schema does not know, which
 * is then drawn generically and reported.
 */
function isObjectNode(node: XmlNode): boolean {
  if (WRAPPERS.has(node.tag)) return false
  // `thresh1Value`…`thresh8Value` are bar-graph settings the schema declares as
  // children of the graph rather than as parts, so they are not in PART_NAMES;
  // drawn as objects they used to paint one letter per line over the graph.
  if (/^thresh\d+Value$/u.test(node.tag)) return false
  return !PART_SET.has(node.tag)
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
  readonly charHeight?: number
  readonly charWidth?: number
  readonly bold?: boolean
  readonly italic?: boolean
  readonly underline?: boolean
  readonly strikethrough?: boolean
  readonly wordWrap?: boolean
  readonly alignment?: string
}

/** The numbers a caption carries, whatever element supplied them. */
interface TextMetrics {
  readonly family: string
  readonly size: number
  readonly charHeight?: number
  readonly charWidth?: number
  readonly color: string
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly strikethrough: boolean
  readonly wordWrap: boolean
  readonly horizontal: 'start' | 'middle' | 'end'
  readonly vertical: 'top' | 'middle' | 'bottom'
}

/** Split an ME alignment name into its two axes. */
function alignmentOf(value: string | undefined): { horizontal: 'start' | 'middle' | 'end'; vertical: 'top' | 'middle' | 'bottom' } {
  const text = (value ?? 'middleCenter').toLowerCase()
  const horizontal = text.includes('left') ? 'start' : text.includes('right') ? 'end' : 'middle'
  const vertical = text.startsWith('top') || text.includes('top') ? 'top' : text.includes('bottom') ? 'bottom' : 'middle'
  return { horizontal, vertical }
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
      ...(attribute(caption, 'charHeight') === undefined ? {} : { charHeight: numberAttribute(caption, 'charHeight', 12) }),
      ...(attribute(caption, 'charWidth') === undefined ? {} : { charWidth: numberAttribute(caption, 'charWidth', 7) }),
      bold: attribute(caption, 'bold') === 'true',
      italic: attribute(caption, 'italic') === 'true',
      underline: attribute(caption, 'underline') === 'true',
      strikethrough: attribute(caption, 'strikethrough') === 'true',
      wordWrap: attribute(caption, 'wordWrap') === 'true',
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

/**
 * The text metrics of one caption.
 *
 * Measured: the editor stores `charHeight`/`charWidth` in pixels, recomputes them
 * from the requested point size on import and drops `fontSize` entirely, so those
 * two are authoritative and `fontSize` is only a fallback for a file that carries
 * no metrics at all.
 *
 * @param node - The object.
 * @param state - Its current state, when it has states.
 * @returns The metrics used to place and wrap the caption.
 */
function metricsOf(node: XmlNode, state: ObjectState | undefined): TextMetrics {
  const own = child(node, 'caption')
  const source = state !== undefined && state.caption !== undefined ? undefined : own
  const charHeight = state?.charHeight ?? (source === undefined ? undefined : numberAttribute(source, 'charHeight', Number.NaN))
  const charWidth = state?.charWidth ?? (source === undefined ? undefined : numberAttribute(source, 'charWidth', Number.NaN))
  const size = Number.isFinite(charHeight as number)
    ? (charHeight as number)
    : state?.fontSize ?? numberAttribute(source ?? node, 'fontSize', numberAttribute(node, 'fontSize', 12))
  const alignment = alignmentOf(state?.alignment ?? attribute(source ?? node, 'alignment'))
  return {
    family: state?.fontFamily ?? attribute(source ?? node, 'fontFamily') ?? attribute(node, 'fontFamily') ?? 'Arial Unicode MS',
    size,
    ...(Number.isFinite(charHeight as number) ? { charHeight: charHeight as number } : {}),
    ...(Number.isFinite(charWidth as number) ? { charWidth: charWidth as number } : {}),
    color: state?.captionColor ?? (source === undefined ? undefined : colourOf(attribute(source, 'color'))) ?? colourOf(attribute(node, 'foreColor')) ?? '#000000',
    bold: state?.bold ?? attribute(source ?? node, 'bold') === 'true',
    italic: state?.italic ?? attribute(source ?? node, 'italic') === 'true',
    underline: state?.underline ?? attribute(source ?? node, 'underline') === 'true',
    strikethrough: state?.strikethrough ?? attribute(source ?? node, 'strikethrough') === 'true',
    wordWrap: state?.wordWrap ?? attribute(source ?? node, 'wordWrap') !== 'false',
    ...alignment,
  }
}

/** The caption text of one object, from its state, attribute or child part. */
function captionOf(node: XmlNode, state: ObjectState | undefined): string {
  const own = child(node, 'caption')
  return attribute(node, 'caption') ?? (own === undefined ? undefined : attribute(own, 'caption')) ?? state?.caption ?? ''
}

/** Text position for one anchor. */
function textX(left: number, width: number, horizontal: 'start' | 'middle' | 'end', margin: number): number {
  if (horizontal === 'start') return left + margin
  if (horizontal === 'end') return left + width - margin
  return left + width / 2
}

/** Break one caption into rendered lines, honouring wrap and hard newlines. */
function wrapText(text: string, metrics: TextMetrics, width: number, margin: number): readonly string[] {
  const hard = text.split(/\r?\n/u)
  if (metrics.wordWrap !== true) return hard
  const advance = Math.max(1, metrics.charWidth ?? metrics.size * 0.55)
  const perLine = Math.max(1, Math.floor((width - margin * 2) / advance))
  const lines: string[] = []
  for (const paragraph of hard) {
    if (paragraph.length <= perLine) {
      lines.push(paragraph)
      continue
    }
    let rest = paragraph
    while (rest.length > perLine) {
      const cut = rest.lastIndexOf(' ', perLine)
      const at = cut > 0 ? cut : perLine
      lines.push(rest.slice(0, at).trimEnd())
      rest = rest.slice(at).trimStart()
    }
    lines.push(rest)
  }
  return lines
}

/** The `<text>` element for one caption, placed by its nine-way alignment. */
function textElement(text: string, metrics: TextMetrics, box: Box, margin: number, verticalMargin = 2): string {
  if (text === '') return ''
  const lines = wrapText(text, metrics, box.width, margin)
  const lineHeight = (metrics.charHeight ?? metrics.size) * 1.25
  const block = lines.length * lineHeight
  const anchorX = textX(box.left, box.width, metrics.horizontal, margin)
  const firstY = metrics.vertical === 'top'
    ? box.top + verticalMargin + lineHeight / 2
    : metrics.vertical === 'bottom'
      ? box.top + box.height - verticalMargin - block + lineHeight / 2
      : box.top + box.height / 2 - block / 2 + lineHeight / 2
  const parts = lines.map((line, index) => `<tspan x="${anchorX}" y="${firstY + index * lineHeight}">${escapeXml(line)}</tspan>`)
  const decoration = [
    ...(metrics.underline ? ['underline'] : []),
    ...(metrics.strikethrough ? ['line-through'] : []),
  ]
  return `<text text-anchor="${metrics.horizontal === 'start' ? 'start' : metrics.horizontal === 'end' ? 'end' : 'middle'}" dominant-baseline="middle" font-family="${escapeXml(metrics.family)}" font-size="${metrics.size}" fill="${metrics.color}"${metrics.bold ? ' font-weight="bold"' : ''}${metrics.italic ? ' font-style="italic"' : ''}${decoration.length === 0 ? '' : ` text-decoration="${decoration.join(' ')}"`}>${parts.join('')}</text>`
}

/** A labelled dashed box for an object the preview does not draw as authored. */
function markerBox(box: Box, label: string, detail: string | undefined, dashed = true): string {
  const stroke = detail === undefined ? '4 3' : '2 2'
  // The label and the reason are annotations, not authored text: they are folded
  // to the box so a stand-in never runs over its neighbour, and a long reason is
  // cut rather than spilling out of the object it explains.
  const perLine = Math.max(6, Math.floor((box.width - 10) / 4.8))
  const rows = detail === undefined ? [] : foldText(detail, perLine, 3)
  const labelText = foldText(label, Math.max(6, Math.floor((box.width - 10) / 5)), 1).join(' ')
  return `<g><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="#f6f6f6" fill-opacity="0.55" stroke="#909090"${dashed ? ` stroke-dasharray="${stroke}"` : ''}/>` +
    `<text x="${box.left + 5}" y="${box.top + 14}" font-family="Segoe UI" font-size="10" fill="#606060">${escapeXml(labelText)}</text>` +
    rows.map((row, index) => `<text x="${box.left + 5}" y="${box.top + 27 + index * 11}" font-family="Segoe UI" font-size="9" fill="#808080">${escapeXml(row)}</text>`).join('') +
    '</g>'
}

/** Break a sentence onto at most `lines` rows of `width` characters. */
function foldText(text: string, width: number, lines: number): string[] {
  const words = text.split(/\s+/u).filter(word => word !== '')
  const rows: string[] = []
  let row = ''
  for (const word of words) {
    if (rows.length === lines) break
    if (row === '') row = word
    else if (row.length + 1 + word.length <= width) row = `${row} ${word}`
    else {
      rows.push(row)
      row = word
    }
  }
  if (rows.length < lines && row !== '') rows.push(row)
  const joined = rows.join(' ')
  if (joined.length < text.length && rows.length > 0) rows[rows.length - 1] = `${(rows[rows.length - 1] ?? '').replace(/\.$/u, '')}…`
  return rows
}

/** Draw one image object, or its placeholder. */
function imageElement(node: XmlNode, options: RenderOptions, box: Box): string {
  const settings = child(node, 'imageSettings')
  const name = attribute(node, 'imageName') ?? (settings === undefined ? undefined : attribute(settings, 'imageName')) ?? ''
  const href = name === ''
    ? undefined
    : options.imageHref === undefined
      ? `Images/${name}`
      : options.imageHref(name)
  if (href !== undefined) return `<image x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" href="${escapeXml(href)}" preserveAspectRatio="none"/>`
  return `<g><rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="#f0f0f0" stroke="#909090" stroke-dasharray="4 3"/><text x="${box.left + box.width / 2}" y="${box.top + box.height / 2}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI" font-size="10" fill="#606060">image ${escapeXml(name || '(unnamed)')}</text></g>`
}

/** The expression wired to one connection name, when the object has one. */
function connectionOf(node: XmlNode, name: string): string | undefined {
  const connections = child(node, 'connections')
  if (connections === undefined) return undefined
  const connection = connections.children.find(candidate => candidate.tag === 'connection' && attribute(candidate, 'name') === name)
  return connection === undefined ? undefined : attribute(connection, 'expression')
}

/** A numeric tag value for an expression, when one was supplied. */
function numericValue(expression: string | undefined, options: RenderOptions): number | undefined {
  if (expression === undefined) return undefined
  const value = options.tagValues?.[expression]
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number.parseFloat(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : undefined
}

/** A bar graph: a track, the filled portion for the value, and its thresholds. */
function barGraphElement(node: XmlNode, options: RenderOptions, box: Box, paint: ReturnType<typeof paintOf>, pass: Pass): string {
  const { left, top, width, height } = box
  const minimum = numberAttribute(node, 'minValue', 0)
  const maximum = numberAttribute(node, 'maxValue', 100)
  const reading = numericValue(connectionOf(node, 'Value'), options)
  const value = reading ?? minimum
  const fraction = maximum === minimum ? 0 : clamp((value - minimum) / (maximum - minimum), 0, 1)
  const fill = colourOf(attribute(node, 'fillColor')) ?? colourOf(attribute(node, 'foreColor')) ?? '#00c000'
  const direction = attribute(node, 'fillDirection') ?? 'leftToRight'
  const filled = ((): { x: number; y: number; width: number; height: number } => {
    switch (direction) {
      case 'rightToLeft':
        return { x: left + width * (1 - fraction), y: top, width: width * fraction, height }
      case 'topToBottom':
        return { x: left, y: top, width, height: height * fraction }
      case 'bottomToTop':
        return { x: left, y: top + height * (1 - fraction), width, height: height * fraction }
      default:
        return { x: left, y: top, width: width * fraction, height }
    }
  })()
  const thresholds = Number.parseInt(attribute(node, 'numberOfThresholds') ?? '0', 10) || 0
  const marks: string[] = []
  for (let index = 1; index <= thresholds; index += 1) {
    // Studio writes thresholds either as an attribute or as a child element,
    // depending on the build; accept both.
    const element = node.children.find(candidate => candidate.tag === `thresh${index}Value`)
    const fromElement = element === undefined ? Number.NaN : Number.parseFloat(element.text.trim())
    const at = Number.isFinite(fromElement) ? fromElement : numberAttribute(node, `thresh${index}Value`, Number.NaN)
    if (!Number.isFinite(at) || maximum === minimum) continue
    const fractionOfMark = clamp((at - minimum) / (maximum - minimum), 0, 1)
    const x = left + width * fractionOfMark
    marks.push(`<line x1="${x}" y1="${top}" x2="${x}" y2="${top + height}" stroke="#ff0000" stroke-width="1"/>`)
  }
  // A bar with no controller value is not a bar at zero: with a transparent
  // background and no border the export paints nothing at all, which reads as a
  // blank spot in the design. The frame is still drawn, plus a dashed inner
  // outline that says the bar itself is missing.
  const stands = reading === undefined
    ? `<rect x="${left + 2}" y="${top + 2}" width="${Math.max(1, width - 4)}" height="${Math.max(1, height - 4)}" fill="none" stroke="#909090" stroke-dasharray="3 3" stroke-width="1"/>` +
      `<text x="${left + 6}" y="${top + Math.min(height - 6, 18)}" font-family="Segoe UI" font-size="9" fill="${annotationColour(paint.fill)}">${escapeXml(`${node.tag} · no value`)}</text>`
    : ''
  if (stands !== '') markMarker(pass, node, 'The bar needs a controller value, and this preview has none, so the frame is drawn in place of the bar.')
  return `<rect x="${left}" y="${top}" width="${width}" height="${height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>` +
    (fraction > 0 ? `<rect x="${filled.x}" y="${filled.y}" width="${filled.width}" height="${filled.height}" fill="${fill}"/>` : '') +
    marks.join('') +
    stands
}

/** A gauge: the scale arc, ticks and a needle at the value. */
function gaugeElement(node: XmlNode, options: RenderOptions, box: Box): string {
  const minimum = numberAttribute(node, 'minValue', 0)
  const maximum = numberAttribute(node, 'maxValue', 100)
  const value = numericValue(connectionOf(node, 'Value'), options) ?? minimum
  const fraction = maximum === minimum ? 0 : clamp((value - minimum) / (maximum - minimum), 0, 1)
  const cx = box.left + box.width / 2
  const cy = box.top + box.height / 2
  const radius = Math.min(box.width, box.height) / 2 - 4
  const start = Math.PI * 0.75
  const end = Math.PI * 2.25
  const angle = start + (end - start) * fraction
  const point = (at: number, r: number): string => `${cx + Math.cos(at) * r},${cy + Math.sin(at) * r}`
  const arc = `M ${point(start, radius)} A ${radius} ${radius} 0 1 1 ${point(end, radius)}`
  return `<path d="${arc}" fill="none" stroke="#808080" stroke-width="2"/>` +
    `<line x1="${cx}" y1="${cy}" x2="${point(angle, radius - 2).split(',')[0]}" y2="${point(angle, radius - 2).split(',')[1]}" stroke="#c00000" stroke-width="2"/>` +
    `<circle cx="${cx}" cy="${cy}" r="3" fill="#202020"/>`
}

/** A trend placeholder with axes; live series arrive with the route. */
function trendElement(box: Box, paint: ReturnType<typeof paintOf>): string {
  const lines: string[] = []
  for (let index = 1; index < 4; index += 1) {
    const y = box.top + (box.height / 4) * index
    lines.push(`<line x1="${box.left}" y1="${y}" x2="${box.left + box.width}" y2="${y}" stroke="#b0b0b0" stroke-width="1"/>`)
  }
  return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${paint.fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>${lines.join('')}` +
    `<text x="${box.left + 6}" y="${box.top + 14}" font-family="Segoe UI" font-size="10" fill="#606060">trend</text>`
}

/**
 * A numeric display's value: the tag table's entry when the caller supplied it,
 * and `####` when it did not. The digits are the honest placeholder for "this
 * value comes from a controller at run time", not an invented number.
 */
function valueElement(
  node: XmlNode,
  text: string,
  metrics: TextMetrics,
  box: Box,
  margin: number,
  options: RenderOptions,
): string {
  const expression = attribute(node, 'expression') ?? connectionOf(node, 'Value') ?? ''
  const value = expression === '' ? undefined : options.tagValues?.[expression]
  const shown = value === undefined ? '####' : String(value)
  return textElement(shown, metrics, box, margin)
}

/** A reference object resolved against its Global Objects base. */
function resolveReference(node: XmlNode, options: RenderOptions): XmlNode {
  if (attribute(node, 'isReferenceObject') !== 'true') return node
  const link = attribute(node, 'linkBaseObject')
  const base = link === undefined ? undefined : options.globals?.[link]
  if (base === undefined) return node
  // The base object supplies defaults, but **every** attribute on the reference
  // overrides it. Taking only placement dropped `currentStateId="0"` on a
  // reference multistate and drew the base's default state (the MANUAL bar).
  const attributes: Record<string, string> = { ...base.attributes, ...node.attributes }
  return {
    tag: base.tag,
    attributes,
    // Keep the base object's visuals and only take the local bindings: a
    // reference group carries its own <animations>/<connections>, and taking
    // those instead of the base children is what dropped the header bar.
    children: [
      ...base.children,
      ...node.children.filter(candidate => candidate.tag === 'animations' || candidate.tag === 'connections'),
    ],
    text: base.text,
  }
}

/** Visibility from an `animateVisibility` animation, when its tags are known. */
function animatedVisibility(node: XmlNode, options: RenderOptions): boolean | undefined {
  const animations = child(node, 'animations')
  if (animations === undefined) return undefined
  for (const animation of animations.children) {
    if (animation.tag !== 'animateVisibility') continue
    const expression = attribute(animation, 'expression')
    if (expression === undefined) continue
    const result = evaluate(expression, options.tagValues ?? {})
    if (result === undefined) continue
    const trueState = attribute(animation, 'expressionTrueState') ?? 'visible'
    return result ? trueState === 'visible' : trueState !== 'visible'
  }
  return undefined
}

/** A colour from an `animateColor` animation, when its tags are known. */
function animatedFill(node: XmlNode, options: RenderOptions): string | undefined {
  const animations = child(node, 'animations')
  if (animations === undefined) return undefined
  for (const animation of animations.children) {
    if (animation.tag !== 'animateFill' && animation.tag !== 'animateColor') continue
    const expression = attribute(animation, 'expression')
    if (expression === undefined) continue
    if (evaluate(expression, options.tagValues ?? {}) !== true) continue
    const colour = colourOf(attribute(animation, 'expressionTrueState') ?? attribute(animation, 'color'))
    if (colour !== undefined) return colour
  }
  return undefined
}

/** A caption replaced by an animation or a tag value, when known. */
function animatedCaption(node: XmlNode, options: RenderOptions): string | undefined {
  const animations = child(node, 'animations')
  if (animations === undefined) return undefined
  for (const animation of animations.children) {
    if (animation.tag !== 'animateString' && animation.tag !== 'animateCaption') continue
    const expression = attribute(animation, 'expression')
    if (expression === undefined) continue
    const value = options.tagValues?.[expression]
    if (value !== undefined) return String(value)
  }
  return undefined
}

/** Record a placeholder and return its drawing. */
function placeholder(pass: Pass, node: XmlNode, box: Box, reason: string): string {
  const name = attribute(node, 'name')
  pass.markers.push({ ...(name === undefined ? {} : { name }), type: node.tag, family: elementFacts(node.tag)?.family ?? 'unknown', reason })
  if (pass.options.markers === false) return ''
  return markerBox(box, name === undefined ? node.tag : `${node.tag} ${name}`, reason)
}

/** Note how a coordinate list was read. */
function noteGeometry(pass: Pass, node: XmlNode, attributeName: string, rule: CoordinateRule): void {
  const name = attribute(node, 'name')
  pass.geometry.push({ ...(name === undefined ? {} : { name }), type: node.tag, attribute: attributeName, rule })
}

/**
 * Record an element name the installed schema does not declare. The drawing stays
 * (a box, a caption, a frame), but the report says the name is not a view object,
 * which is the difference between a faithful preview and a guess.
 */
function markUnknown(pass: Pass, node: XmlNode, reason: string): void {
  const name = attribute(node, 'name')
  pass.unknown.push({
    ...(name === undefined ? {} : { name }),
    type: node.tag,
    family: 'unknown',
    reason,
  })
}

/**
 * Record an object the preview draws as something other than what it declares —
 * a placeholder body, or a drawing that rests on an assumption the export does
 * not state. The report is what the operator sees instead of a silent blank.
 */
function markMarker(pass: Pass, node: XmlNode, reason: string): void {
  const name = attribute(node, 'name')
  pass.markers.push({
    ...(name === undefined ? {} : { name }),
    type: node.tag,
    family: elementFacts(node.tag)?.family ?? 'unknown',
    reason,
  })
}

/** Stroke for a shape: the border colour, or the fill when there is no border. */
function strokeOf(paint: ReturnType<typeof paintOf>): string {
  return paint.stroke === 'none' ? paint.fill : paint.stroke
}

/** The SVG for one object's own body (children are drawn by the caller). */
function bodyOf(node: XmlNode, box: Box, pass: Pass): string {
  const options = pass.options
  const state = stateOf(node)
  const paint = paintOf(node, state)
  const fill = animatedFill(node, options) ?? paint.fill
  const captionText = animatedCaption(node, options) ?? captionOf(node, state)
  const metrics = metricsOf(node, state)
  const margin = numberAttribute(node, 'horizontalMargin', 4)
  const verticalMargin = numberAttribute(node, 'verticalMargin', 2)
  const facts = elementFacts(node.tag)
  const family: Family = facts?.family ?? 'box'
  const shape = (attribute(node, 'shape') ?? '').toLowerCase()
  const rounded = shape.includes('round')
  const circle = shape === 'ellipse' || shape === 'circle'

  const boxOf = (): string => {
    if (circle) return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
    const radius = numberAttribute(node, 'cornerRadius', rounded ? 4 : 0)
    if (radius > 0) return `<path d="${roundedRectPath(box, radius)}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
    return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
  }

  const frame = `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`

  switch (family) {
    case 'line': {
      const segment = lineSegment(attribute(node, 'line'), box, pass.mode)
      if (segment === undefined) {
        const diagonal = boxDiagonal(box)
        noteGeometry(pass, node, 'line', 'box-diagonal')
        const [from, to] = diagonal.points as readonly [typeof diagonal.points[0], typeof diagonal.points[0]]
        return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
      }
      noteGeometry(pass, node, 'line', segment.rule)
      const pen = Math.max(1, numberAttribute(node, 'lineWidth', 1))
      const [from, to] = segment.points as readonly [typeof segment.points[0], typeof segment.points[0]]
      return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeOf(paint)}" stroke-width="${pen}"/>`
    }
    case 'path': {
      const resolved = pathPoints(attribute(node, 'path'), box, pass.mode)
      if (resolved.points.length < 2) {
        const diagonal = boxDiagonal(box)
        noteGeometry(pass, node, 'path', 'box-diagonal')
        const [from, to] = diagonal.points as readonly [typeof diagonal.points[0], typeof diagonal.points[0]]
        return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
      }
      noteGeometry(pass, node, 'path', resolved.rule)
      return `<path d="${pointsToPath(resolved.points, false)}" fill="none" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
    }
    case 'polygon': {
      const resolved = polygonPoints(attribute(node, 'path'), box, pass.mode)
      if (resolved.points.length < 2) return placeholder(pass, node, box, 'The polygon carries no path coordinates, so its outline is unknown.')
      noteGeometry(pass, node, 'path', resolved.rule)
      return `<path d="${pointsToPath(resolved.points, true)}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
    }
    case 'polyPolygon': {
      const parts = node.children.filter(candidate => candidate.tag === 'innerPolygon')
      if (parts.length < 2) return placeholder(pass, node, box, `The schema requires at least two innerPolygon parts; this object carries ${parts.length}.`)
      const paths = parts.map(part => {
        const resolved = polygonPoints(attribute(part, 'polygon'), box, pass.mode)
        noteGeometry(pass, node, 'innerPolygon', resolved.rule)
        return `<path d="${pointsToPath(resolved.points, true)}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
      })
      return paths.join('')
    }
    case 'angle': {
      const start = numberAttribute(node, 'startAngle', 0)
      const end = numberAttribute(node, 'endAngle', 90)
      // Measured on an installed export: an arc written with startAngle and
      // endAngle both zero is drawn by the editor as a full filled ellipse, not
      // as an empty sweep. The same pair sent to arcPath() is a zero-length path,
      // which is why this case is decided before the geometry is built.
      if (start === end) {
        markMarker(pass, node, 'startAngle and endAngle are equal, which the editor draws as a full ellipse rather than a sweep.')
        return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
      }
      const path = node.tag === 'wedge' ? wedgePath(box, start, end) : arcPath(box, start, end)
      markMarker(pass, node, 'The angle is drawn clockwise from 3 o\'clock; the vendor does not document the zero direction.')
      return `<path d="${path}" fill="${node.tag === 'wedge' ? fill : 'none'}" stroke="${strokeOf(paint)}" stroke-width="${Math.max(1, numberAttribute(node, 'lineWidth', 1))}"/>`
    }
    case 'ellipse':
      return `<ellipse cx="${box.left + box.width / 2}" cy="${box.top + box.height / 2}" rx="${box.width / 2}" ry="${box.height / 2}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
    case 'roundedRectangle': {
      const rx = numberAttribute(node, 'roundingWidth', numberAttribute(node, 'cornerRadius', 4))
      const ry = numberAttribute(node, 'roundingHeight', rx)
      return `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
    }
    case 'rectangle':
      return frame
    case 'panel': {
      const radius = numberAttribute(node, 'cornerRadius', 0)
      const body = radius > 0
        ? `<path d="${roundedRectPath(box, radius)}" fill="${fill}" stroke="${paint.stroke}" stroke-width="${paint.strokeWidth}"/>`
        : frame
      const text = textElement(captionText, metrics, box, margin, verticalMargin)
      const blink = attribute(node, 'blink') === 'true'
        ? `<rect x="${box.left}" y="${box.top}" width="${box.width}" height="${box.height}" fill="none" stroke="#c00000" stroke-dasharray="6 4" stroke-width="1"/>`
        : ''
      return body + blink + text
    }
    case 'image':
      return imageElement(node, options, box)
    case 'group':
      return ''
    case 'text':
      return textElement(captionText, metrics, box, margin, verticalMargin)
    case 'button':
      return boxOf() + (captionText === '' ? '' : textElement(captionText, metrics, box, margin, verticalMargin))
    case 'indicator':
      return boxOf() + (captionText === '' ? '' : textElement(captionText, metrics, box, margin, verticalMargin))
    case 'field':
      return frame + valueElement(node, captionText, metrics, box, margin, options)
    case 'chart':
      if (node.tag === 'barGraph') return barGraphElement(node, options, box, paint, pass)
      if (node.tag === 'gauge') return gaugeElement(node, options, box)
      return placeholder(pass, node, box, 'The preview draws charts only for a bar graph and a gauge.')
    case 'list': {
      // A list's rows and headers come from a controller at run time, so the
      // preview draws the frame and an annotation instead. A state caption is a
      // row caption, not the object's label, which is why it is not used here.
      const own = attribute(node, 'caption')
      const named = own !== undefined && own !== ''
      const label = named ? own : node.tag
      const style = named
        ? { ...metrics, horizontal: 'start' as const, vertical: 'top' as const }
        : { ...metrics, color: annotationColour(colourOf(attribute(node, 'backColor')) ?? fill), horizontal: 'start' as const, vertical: 'top' as const }
      return frame + textElement(label, style, box, margin, verticalMargin + 2)
    }
    case 'activeX':
      return placeholder(pass, node, box, 'An ActiveX control is drawn by its host, not by a display export.')
    case 'box':
    default: {
      if (facts === undefined) {
        markUnknown(pass, node, 'The element is not in the installed Gfx-ME schema.')
        return frame + textElement(captionText === '' ? node.tag : captionText, metrics, box, margin, verticalMargin)
      }
      return boxOf() + (captionText === '' ? '' : textElement(captionText, metrics, box, margin, verticalMargin))
    }
  }
}

/** Draw one object and its children. */
function renderObject(rawNode: XmlNode, depth: number, pass: Pass): string {
  const node = resolveReference(rawNode, pass.options)
  if (animatedVisibility(node, pass.options) === false) return ''
  const visible = attribute(node, 'visible')
  if (visible === 'false' || visible === '0' || visible === 'no') return ''
  pass.objects += 1
  const box: Box = {
    left: numberAttribute(node, 'left', 0),
    top: numberAttribute(node, 'top', 0),
    width: numberAttribute(node, 'width', 0),
    height: numberAttribute(node, 'height', 0),
  }
  if (node.tag === 'trend') {
    // A trend is drawn as a frame with a grid: the series come from a data source
    // the export does not carry. The element name is not in the Gfx-ME schema
    // either, so it is listed with the unknowns rather than passed off as drawn.
    markUnknown(pass, node, 'The element is not in the installed Gfx-ME schema; the preview draws its frame and grid, not its series.')
    const name = attribute(node, 'name')
    const paint = paintOf(node, stateOf(node))
    pass.drawn += 1
    return `<g data-ftv-type="trend"${name === undefined ? '' : ` data-ftv-name="${escapeXml(name)}"`}>${trendElement(box, paint)}</g>`
  }
  const own = bodyOf(node, box, pass)
  if (own !== '') pass.drawn += 1
  const nested = node.children.filter(isObjectNode).map(candidate => renderObject(candidate, depth + 1, pass)).join('')
  const content = own + (nested === '' ? '' : `<g transform="translate(${box.left},${box.top})">${nested}</g>`)
  if (content === '') return ''
  // Identity for hit-testing and inspection: the preview maps a click back to the
  // object that produced the drawing without re-parsing coordinates.
  const name = attribute(node, 'name')
  const identity = `data-ftv-type="${escapeXml(node.tag)}"${name === undefined ? '' : ` data-ftv-name="${escapeXml(name)}"`}`
  return `<g ${identity}>${content}</g>`
}

/** Parse a display and its settings. */
function readDisplay(source: string): { display: XmlNode; settings: XmlNode | undefined; width: number; height: number } {
  const display = parseXml(source)
  if (display.tag !== 'gfx' && display.tag !== 'display') throw new Error(`not a FactoryTalk View display: root element is <${display.tag}>`)
  const settings = child(display, 'displaySettings')
  const width = settings === undefined ? numberAttribute(display, 'width', 640) : numberAttribute(settings, 'width', numberAttribute(display, 'width', 640))
  const height = settings === undefined ? numberAttribute(display, 'height', 480) : numberAttribute(settings, 'height', numberAttribute(display, 'height', 480))
  return { display, settings, width, height }
}

/**
 * Render one display file and report what was drawn, skipped or read through a rule.
 *
 * @param source - The display XML.
 * @param options - Image resolver, tag values, globals and an optional forced mode.
 * @returns The SVG document and the report.
 */
export function renderDisplayWithReport(source: string, options: RenderOptions = {}): { svg: string; report: RenderReport } {
  const { display, settings, width, height } = readDisplay(source)
  const container = child(display, 'objects') ?? display
  const objects = container.children.filter(isObjectNode)
  const flags = objects.filter(object => attribute(object, 'isReferenceObject') !== undefined).length
  const detected = documentMode(settings !== undefined, objects.length, flags)
  const forced = options.mode !== undefined && options.mode !== 'auto'
  const mode: CoordinateMode = forced ? (options.mode as CoordinateMode) : detected.mode
  const pass: Pass = { options, mode, markers: [], unknown: [], geometry: [], objects: 0, drawn: 0 }
  const background = colourOf(attribute(display, 'backColor') ?? (settings === undefined ? undefined : attribute(settings, 'backColor'))) ?? '#c6c6c6'
  const body = objects.map(object => renderObject(object, 0, pass)).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${background}"/>${body}</svg>`
  return {
    svg,
    report: {
      mode,
      modeReason: forced ? 'forced' : detected.reason,
      objects: pass.objects,
      drawn: pass.drawn,
      markers: pass.markers,
      unknown: pass.unknown,
      geometry: pass.geometry,
    },
  }
}

/**
 * Render one display file to an SVG document.
 *
 * @param source - The display XML.
 * @param options - Image resolver and tag values.
 * @returns A complete, standalone SVG string.
 */
export function renderDisplay(source: string, options: RenderOptions = {}): string {
  return renderDisplayWithReport(source, options).svg
}

/**
 * Make an SVG fill its container while keeping its aspect ratio.
 *
 * The rendered document carries the display's pixel size as attributes, which is
 * right for the PNG export and wrong for a preview pane narrower than the
 * display: without this, "fit" showed a crop of the top-left corner. The style
 * overrides the intrinsic size; the viewBox keeps the drawing proportional.
 *
 * @param svg - A document from {@link renderDisplay}.
 * @returns The same document, sized to its container.
 */
export function responsiveSvg(svg: string): string {
  return svg.replace('<svg ', '<svg style="width:100%;height:100%;display:block" preserveAspectRatio="xMidYMid meet" ')
}

/** What kind of FactoryTalk View artifact a file is. */
export type ArtifactKind = 'display' | 'alarms' | 'tags' | 'batch' | 'unknown'

/** Detection result shown by the preview when the file is not a display. */
export interface ArtifactSummary {
  /** Artifact family. */
  readonly kind: ArtifactKind
  /** Human title for the preview header. */
  readonly title: string
  /** Short factual lines, for example counts. */
  readonly details: readonly string[]
}

/**
 * Detect which FactoryTalk View artifact a file holds.
 *
 * The preview used to assume every opened `*.xml` was a display, so a valid
 * alarm export showed as an error. Detection runs before rendering: alarms,
 * tag CSVs and batch import files get a summary card, displays render, and only
 * genuinely unknown content is reported as unrecognised.
 *
 * @param source - File text.
 * @returns The kind, a title and factual details.
 */
export function detectArtifact(source: string): ArtifactSummary {
  if (/<alarms[\s>]/iu.test(source)) {
    const alarms = (source.match(/<alarm[\s>]/gu) ?? []).length
    const id = /<alarms[^>]*\bid="([^"]*)"/iu.exec(source)?.[1]
    const version = /<alarms[^>]*\bversion="([^"]*)"/iu.exec(source)?.[1]
    return {
      kind: 'alarms',
      title: 'Alarm configuration export',
      details: [
        `${alarms} alarm definition(s)`,
        ...(id === undefined ? [] : [`id: ${id}`]),
        ...(version === undefined ? [] : [`schema version ${version}`]),
      ],
    }
  }
  if (/;\s*Tag Type\s*,/iu.test(source)) {
    const rows = source.split(/\r?\n/u).filter(line => /^"?[DAS]"?,/u.test(line)).length
    return { kind: 'tags', title: 'HMI tag database (CSV)', details: [`${rows} tag row(s)`] }
  }
  if (/<gfxImport[\s>]/iu.test(source)) {
    const entries = (source.match(/<import[\s>]/gu) ?? []).length
    return { kind: 'batch', title: 'Display batch import file', details: [`${entries} import entry(ies)`] }
  }
  try {
    const root = parseXml(source)
    if (root.tag === 'gfx' || root.tag === 'display') return { kind: 'display', title: 'FactoryTalk View display', details: [] }
    return { kind: 'unknown', title: `Unrecognised XML: <${root.tag}>`, details: [] }
  } catch {
    return { kind: 'unknown', title: 'Unrecognised file', details: [] }
  }
}

/** Re-exported so a caller can name a family without importing the generated module. */
export type { Family }
export { ELEMENTS }
