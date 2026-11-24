/**
 * Geometry for the FactoryTalk View ME preview.
 *
 * The ME editor stores coordinates inside a drawing object in two different
 * coordinate spaces, and the 0.104.1 authoring pass measured both against a real
 * Studio round trip (`packages/ftview/knowledge/ftview-me/pages/editor-rewrites.md`):
 *
 * - `path` (`polyline`, `freehand`), `polygon` and `innerPolygon.polygon` are
 *   **percent of the object's own box** as written, and the editor rewrites them
 *   to absolute display pixels on export. `path="0 0 100 0 100 100"` on a 200×100
 *   box at (300,320) came back as `301 321 500 321 500 419 ` — 100 % is the right
 *   and bottom edge, inset by one pixel, and a value above 100 clamps to the edge
 *   instead of meaning pixels.
 * - `line` is **absolute display pixels when any value leaves 0..100, and percent
 *   of the box when every value sits inside it**. Two objects in one round trip
 *   proved both halves: `line="0 0 100 0"` on the box (10,10,100,10) exported as
 *   `15 15 105 15 ` (percent, then inset by half the 10 px pen) while
 *   `line="210 15 310 15"` on the box (200,10,100,10) exported as
 *   `215 15 305 15 ` (absolute, same inset).
 *
 * The preview therefore resolves coordinates through {@link lineSegment},
 * {@link pathPoints} and {@link polygonPoints}, which return the rule they
 * applied so the face can say so instead of guessing quietly.
 *
 * @module dsh-engineering-ftview-viewer/geometry
 */

/** One object's box in display pixels. */
export interface Box {
  readonly left: number
  readonly top: number
  readonly width: number
  readonly height: number
}

/** One resolved point in display pixels. */
export interface Point {
  readonly x: number
  readonly y: number
}

/** Which coordinate space a value was read in. */
export type CoordinateRule = 'percent' | 'absolute' | 'box-diagonal'

/** Which way a file's coordinates are read. */
export type CoordinateMode = 'export' | 'draft'

/** Points plus the rule that produced them. */
export interface ResolvedPoints {
  readonly points: readonly Point[]
  readonly rule: CoordinateRule
}

/** Every number in a whitespace-separated list. */
export function parsePoints(value: string | undefined): readonly number[] {
  if (value === undefined) return []
  const numbers: number[] = []
  for (const token of value.trim().split(/\s+/u)) {
    if (token === '') continue
    const parsed = Number.parseFloat(token)
    if (Number.isFinite(parsed)) numbers.push(parsed)
  }
  return numbers
}

/** Clamp one number into a range. */
export function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Half the pen width, which is how far the editor insets a reported endpoint. */
export function penInset(lineWidth: number): number {
  return Math.max(0, lineWidth) / 2
}

/** Map one percent pair onto the box, clamping 0..100 to the edge. */
function percentPoint(x: number, y: number, box: Box): Point {
  return {
    x: box.left + (clamp(x, 0, 100) / 100) * box.width,
    y: box.top + (clamp(y, 0, 100) / 100) * box.height,
  }
}

/** Pair a flat number list into points. */
function pair(numbers: readonly number[]): readonly (readonly [number, number])[] {
  const pairs: (readonly [number, number])[] = []
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    pairs.push([numbers[index] as number, numbers[index + 1] as number])
  }
  return pairs
}

/** Whether every number sits inside the percent range. */
function allPercent(numbers: readonly number[]): boolean {
  return numbers.length > 0 && numbers.every(value => value >= 0 && value <= 100)
}

/**
 * The endpoints of a `line` object.
 *
 * @param value - The `line` attribute (`x1 y1 x2 y2`), when present.
 * @param box - The object box.
 * @param mode - `export` for a Studio export, `draft` for a staged file.
 * @returns The segment, or `undefined` when the attribute is missing or short.
 */
export function lineSegment(value: string | undefined, box: Box, mode: CoordinateMode): ResolvedPoints | undefined {
  const numbers = parsePoints(value)
  if (numbers.length < 4) return undefined
  const [x1, y1, x2, y2] = numbers as [number, number, number, number]
  if (mode === 'draft' && allPercent(numbers.slice(0, 4))) {
    return { points: [percentPoint(x1, y1, box), percentPoint(x2, y2, box)], rule: 'percent' }
  }
  return { points: [{ x: x1, y: y1 }, { x: x2, y: y2 }], rule: 'absolute' }
}

/**
 * The points of a `path` attribute (`polyline`, `freehand`).
 *
 * @param value - The `path` attribute.
 * @param box - The object box.
 * @param mode - `export` or `draft`.
 * @returns The points; empty when the attribute is missing.
 */
export function pathPoints(value: string | undefined, box: Box, mode: CoordinateMode): ResolvedPoints {
  const numbers = parsePoints(value)
  const pairs = pair(numbers)
  if (pairs.length === 0) return { points: [], rule: mode === 'draft' ? 'percent' : 'absolute' }
  if (mode === 'draft') return { points: pairs.map(([x, y]) => percentPoint(x, y, box)), rule: 'percent' }
  return { points: pairs.map(([x, y]) => ({ x, y })), rule: 'absolute' }
}

/**
 * The points of a `polygon` attribute.
 *
 * A polygon is written as percent of the box exactly like a path; the only
 * difference is that the preview closes the outline.
 *
 * @param value - The `polygon` attribute.
 * @param box - The object box.
 * @param mode - `export` or `draft`.
 * @returns The points.
 */
export function polygonPoints(value: string | undefined, box: Box, mode: CoordinateMode): ResolvedPoints {
  return pathPoints(value, box, mode)
}

/**
 * The diagonal of the box, inset by one pixel when the object carries no geometry.
 *
 * A drafted `polyline` with no `path` is not an empty object: the editor imports
 * it as a `<line>` across the box diagonal, measured as `line="11 241 179 329 "`
 * for the box (10,240,170,90).
 *
 * @param box - The object box.
 * @param inset - Inset in pixels; 1 matches the measured export.
 * @returns The diagonal as a two-point list.
 */
export function boxDiagonal(box: Box, inset = 1): ResolvedPoints {
  return {
    points: [
      { x: box.left + inset, y: box.top + inset },
      { x: box.left + box.width - inset, y: box.top + box.height - inset },
    ],
    rule: 'box-diagonal',
  }
}

/** An SVG path for a rounded rectangle. */
export function roundedRectPath(box: Box, radius: number): string {
  const r = clamp(radius, 0, Math.min(box.width, box.height) / 2)
  const { left: x, top: y, width: w, height: h } = box
  if (r <= 0) return `M ${x} ${y} H ${x + w} V ${y + h} H ${x} Z`
  return `M ${x + r} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r} A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r} V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} Z`
}

/** The point on the box ellipse at one angle, in degrees clockwise from 3 o'clock. */
function anglePoint(box: Box, degrees: number): Point {
  const radians = (degrees * Math.PI) / 180
  return {
    x: box.left + box.width / 2 + (Math.cos(radians) * box.width) / 2,
    y: box.top + box.height / 2 + (Math.sin(radians) * box.height) / 2,
  }
}

/**
 * An SVG path for an `arc`.
 *
 * The ME schema carries `startAngle`/`endAngle` without documenting the zero
 * direction; the preview reads them as degrees clockwise from 3 o'clock, which is
 * the convention the vendor's own symbol screens use. That reading is an
 * assumption, and the face labels an arc as approximate for that reason.
 *
 * @param box - The object box.
 * @param startAngle - Degrees.
 * @param endAngle - Degrees.
 * @returns The arc path.
 */
export function arcPath(box: Box, startAngle: number, endAngle: number): string {
  const start = anglePoint(box, startAngle)
  const end = anglePoint(box, endAngle)
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  const sweep = endAngle >= startAngle ? 1 : 0
  return `M ${start.x} ${start.y} A ${box.width / 2} ${box.height / 2} 0 ${large} ${sweep} ${end.x} ${end.y}`
}

/**
 * An SVG path for a `wedge` (a pie slice).
 *
 * @param box - The object box.
 * @param startAngle - Degrees.
 * @param endAngle - Degrees.
 * @returns The wedge path.
 */
export function wedgePath(box: Box, startAngle: number, endAngle: number): string {
  const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 }
  const start = anglePoint(box, startAngle)
  const end = anglePoint(box, endAngle)
  const large = Math.abs(endAngle - startAngle) > 180 ? 1 : 0
  const sweep = endAngle >= startAngle ? 1 : 0
  return `M ${centre.x} ${centre.y} L ${start.x} ${start.y} A ${box.width / 2} ${box.height / 2} 0 ${large} ${sweep} ${end.x} ${end.y} Z`
}

/**
 * An SVG path through points.
 *
 * @param points - Display-pixel points.
 * @param close - Whether to close the outline (a polygon).
 * @returns The path data.
 */
export function pointsToPath(points: readonly Point[], close: boolean): string {
  if (points.length === 0) return ''
  const [first, ...rest] = points as readonly [Point, ...Point[]]
  return `M ${first.x} ${first.y}${rest.map(point => ` L ${point.x} ${point.y}`).join('')}${close ? ' Z' : ''}`
}

/**
 * Whether a display file looks like a Studio export rather than a staged draft.
 *
 * Measured: an export always carries `<displaySettings>` and marks every object
 * with `visible`/`wallpaper`/`isReferenceObject`, while a file the engineering
 * tools wrote before an import carries neither. The schema declaration
 * (`xsi:noNamespaceSchemaLocation`) is on both, so it is not a marker.
 *
 * @param display - The parsed root node.
 * @param hasSettings - Whether a `<displaySettings>` child exists.
 * @returns The mode and the reason, for the face to display.
 */
export function documentMode(hasSettings: boolean, objectCount: number, referenceFlags: number): { mode: CoordinateMode; reason: 'settings' | 'imported-flags' | 'staged' } {
  if (hasSettings) return { mode: 'export', reason: 'settings' }
  if (objectCount > 0 && referenceFlags > 0) return { mode: 'export', reason: 'imported-flags' }
  return { mode: 'draft', reason: 'staged' }
}
