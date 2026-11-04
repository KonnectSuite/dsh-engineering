/**
 * Pure 2D geometry used by the modify operations.
 *
 * Trim, extend, offset and mirror all need the same small set of measurements:
 * where two segments meet, which side of a line a pick point is on, and how a
 * point or an angle reflects about an axis. They are kept here, free of any
 * database class, so the rules are one readable unit and the operation code only
 * decides what a result means.
 *
 * Angles are radians, points are WCS drawing units, matching the rest of the
 * engine.
 *
 * @module dsh-engineering-ecad/engine/ops-geom
 */

import type { EcadPoint } from './types.ts'

/** Distance below which two drawing-unit values are treated as the same value. */
export const GEOM_EPSILON = 1e-9

/** Where two infinite lines meet, with the parameter along each segment. */
export interface LineHit {
  /** Intersection point in WCS. */
  readonly point: EcadPoint
  /** Position on the first segment: 0 at `a`, 1 at `b`. */
  readonly t: number
  /** Position on the second segment: 0 at `c`, 1 at `d`. */
  readonly u: number
}

/** One finite segment. */
export interface Segment {
  readonly a: EcadPoint
  readonly b: EcadPoint
}

/**
 * Intersection of the infinite lines through two segments.
 *
 * @param a - first segment start.
 * @param b - first segment end.
 * @param c - second segment start.
 * @param d - second segment end.
 * @returns the intersection and its two parameters, or `undefined` when the
 * lines are parallel, collinear or a segment is degenerate.
 */
export function lineIntersection(a: EcadPoint, b: EcadPoint, c: EcadPoint, d: EcadPoint): LineHit | undefined {
  const rx = b[0] - a[0]
  const ry = b[1] - a[1]
  const sx = d[0] - c[0]
  const sy = d[1] - c[1]
  const rLength = Math.hypot(rx, ry)
  const sLength = Math.hypot(sx, sy)
  if (rLength <= GEOM_EPSILON || sLength <= GEOM_EPSILON) return undefined
  const denom = cross(rx, ry, sx, sy)
  // Scale the parallel test with the segment lengths so a small drawing and a
  // large one behave the same.
  if (Math.abs(denom) <= GEOM_EPSILON * rLength * sLength) return undefined
  const qx = c[0] - a[0]
  const qy = c[1] - a[1]
  const t = cross(qx, qy, sx, sy) / denom
  const u = cross(qx, qy, rx, ry) / denom
  return { point: [a[0] + t * rx, a[1] + t * ry], t, u }
}

/**
 * Whether a parameter lies on its segment, within the shared tolerance.
 *
 * @param value - segment parameter.
 */
export function onSegment(value: number): boolean {
  return value >= -GEOM_EPSILON && value <= 1 + GEOM_EPSILON
}

/**
 * Reflect one point about the line through two axis points.
 *
 * @param point - point to reflect.
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 * @returns the reflected point.
 */
export function reflectPoint(point: EcadPoint, axisA: EcadPoint, axisB: EcadPoint): EcadPoint {
  const theta = axisAngle(axisA, axisB)
  const cos = Math.cos(2 * theta)
  const sin = Math.sin(2 * theta)
  const dx = point[0] - axisA[0]
  const dy = point[1] - axisA[1]
  return [axisA[0] + cos * dx + sin * dy, axisA[1] + sin * dx - cos * dy]
}

/**
 * Reflect an angle about the line through two axis points.
 *
 * A direction at `angle` mirrors to `2 * axisAngle - angle`, which is the
 * rotation a readable mirrored text or a reflected arc uses.
 *
 * @param angle - direction in radians.
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 */
export function reflectAngle(angle: number, axisA: EcadPoint, axisB: EcadPoint): number {
  return 2 * axisAngle(axisA, axisB) - angle
}

/**
 * Angle of the direction from one point to another.
 *
 * @param a - start point.
 * @param b - end point.
 */
export function axisAngle(a: EcadPoint, b: EcadPoint): number {
  return Math.atan2(b[1] - a[1], b[0] - a[0])
}

/**
 * Normalise an angle into `[0, 2π)`.
 *
 * @param angle - angle in radians.
 */
export function wrapAngle2Pi(angle: number): number {
  const turn = Math.PI * 2
  const wrapped = angle % turn
  return wrapped < 0 ? wrapped + turn : wrapped
}

/**
 * Start/end angles of a reflected arc, kept counter-clockwise.
 *
 * Reflection reverses the sweep, so the mirrored arc starts at the reflection of
 * the old end angle and ends at the reflection of the old start angle. The
 * result satisfies `start <= end` and both are in `[0, 2π)`.
 *
 * @param startAngle - source arc start, radians.
 * @param endAngle - source arc end, radians.
 * @param axisA - first axis point.
 * @param axisB - second axis point.
 * @returns the reflected `[start, end]` pair.
 */
export function mirroredArcAngles(startAngle: number, endAngle: number, axisA: EcadPoint, axisB: EcadPoint): readonly [number, number] {
  const theta = axisAngle(axisA, axisB)
  const start = wrapAngle2Pi(2 * theta - endAngle)
  let end = wrapAngle2Pi(2 * theta - startAngle)
  if (end <= start) end += Math.PI * 2
  return [start, end]
}

/**
 * Parameter range of a reflected partial ellipse.
 *
 * The reflected ellipse keeps its radii and gets the reflected major-axis
 * rotation; its parameter then runs the other way (`t` maps to `-t`), so the
 * mirrored curve starts at the reflection of the old end parameter and ends at
 * the reflection of the old start parameter.
 *
 * @param startAngle - source start parameter, radians.
 * @param endAngle - source end parameter, radians.
 * @returns the reflected `[start, end]` parameter pair, counter-clockwise.
 */
export function mirroredEllipseParams(startAngle: number, endAngle: number): readonly [number, number] {
  const start = wrapAngle2Pi(-endAngle)
  let end = wrapAngle2Pi(-startAngle)
  if (end <= start) end += Math.PI * 2
  return [start, end]
}

/**
 * Translation that moves a line onto the side of a pick point.
 *
 * The returned vector is already scaled by `distance`; the caller adds it to a
 * clone of the line.
 *
 * @param a - line start.
 * @param b - line end.
 * @param side - a point on the side the parallel line must land.
 * @param distance - perpendicular distance in drawing units.
 * @returns the translation, or `undefined` for a degenerate line or a side point
 * that lies on the line itself (where "which side" has no answer).
 */
export function lineOffsetVector(a: EcadPoint, b: EcadPoint, side: EcadPoint, distance: number): EcadPoint | undefined {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const length = Math.hypot(dx, dy)
  if (length <= GEOM_EPSILON) return undefined
  const nx = -dy / length
  const ny = dx / length
  const signed = (side[0] - a[0]) * nx + (side[1] - a[1]) * ny
  if (Math.abs(signed) <= GEOM_EPSILON) return undefined
  const sign = signed > 0 ? 1 : -1
  return [nx * distance * sign, ny * distance * sign]
}

/**
 * Which way a circle or arc must grow to reach the side of a pick point.
 *
 * @param center - circle/arc centre.
 * @param radius - current radius.
 * @param side - a point the offset must reach toward.
 * @returns `1` outward, `-1` inward, or `undefined` when the point sits on the
 * circumference and the direction is ambiguous.
 */
export function radialOffsetSign(center: EcadPoint, radius: number, side: EcadPoint): 1 | -1 | undefined {
  const distance = Math.hypot(side[0] - center[0], side[1] - center[1])
  if (Math.abs(distance - radius) <= GEOM_EPSILON) return undefined
  return distance > radius ? 1 : -1
}

/**
 * Signed distance between two points.
 *
 * @param a - first point.
 * @param b - second point.
 */
export function distance(a: EcadPoint, b: EcadPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1])
}

/**
 * 2D cross product of two direction vectors.
 *
 * @param ax - first vector x.
 * @param ay - first vector y.
 * @param bx - second vector x.
 * @param by - second vector y.
 */
function cross(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx
}
