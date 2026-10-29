/**
 * Bulk object edits: one attribute, caption or connection change applied to every
 * object that matches, across displays. The field sessions patched XML by script for
 * this; a draft operation per object is the same result through the validated path.
 *
 * Matching is intentionally simple — type, name glob, and existing attribute values —
 * because the caller states the change and the tool reports exactly what it selected.
 */
import type { DisplayFile, DisplayObject } from '../model.ts'

/** Child elements the parser reports as objects but which are not editable objects. */
const STRUCTURAL = new Set([
  'connections',
  'connection',
  'caption',
  'states',
  'state',
  'animations',
  'imagesettings',
  'displaysettings',
  'parameterfile',
  'message',
  'scada',
])

/** What an object must look like to be selected. Absent fields match anything. */
export interface BulkMatch {
  /** Object type, case-insensitive, for example `momentaryButton`. */
  readonly type?: string
  /** Object name with `*` wildcards, case-insensitive. */
  readonly name?: string
  /** Attribute values the object must already carry. */
  readonly attribute?: Readonly<Record<string, string>>
}

/** One object selected for a bulk change. */
export interface BulkTarget {
  readonly display: string
  readonly object: string
  readonly type: string
}

/** What the match selected, and what was left because of the cap. */
export interface BulkSelection {
  readonly targets: readonly BulkTarget[]
  readonly displays: readonly string[]
  readonly scanned: number
  readonly truncated: boolean
}

/**
 * Whether `pattern` matches `value`, where `*` matches any run of characters.
 *
 * @param pattern - Glob with `*` wildcards.
 * @param value - Text to test.
 */
export function globMatches(pattern: string, value: string): boolean {
  if (pattern === '*') return true
  if (!pattern.includes('*')) return pattern.toLowerCase() === value.toLowerCase()
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/gu, '\\$&').replace(/\*/gu, '.*')
  return new RegExp(`^${escaped}$`, 'iu').test(value)
}

/**
 * Whether one object satisfies every stated part of the match.
 *
 * @param object - Parsed object.
 * @param match - Rules stated by the caller.
 */
export function matchesBulk(object: DisplayObject, match: BulkMatch): boolean {
  if (STRUCTURAL.has(object.type.toLowerCase())) return false
  if (match.type !== undefined && object.type.toLowerCase() !== match.type.toLowerCase()) return false
  if (match.name !== undefined && (object.name === undefined || !globMatches(match.name, object.name))) return false
  if (match.attribute !== undefined) {
    for (const [key, wanted] of Object.entries(match.attribute)) {
      if (object.attributes[key] !== wanted) return false
    }
  }
  return true
}

/**
 * Select objects across displays, stopping at `limit`.
 *
 * @param displays - Parsed displays from the open export.
 * @param match - Rules stated by the caller.
 * @param limit - Most objects to select.
 * @param only - Display names to restrict to, if the caller named any.
 */
export function selectBulk(
  displays: readonly DisplayFile[],
  match: BulkMatch,
  limit: number,
  only?: readonly string[],
): BulkSelection {
  const wanted = only === undefined ? undefined : new Set(only.map(name => name.toLowerCase()))
  const targets: BulkTarget[] = []
  const touched = new Set<string>()
  let scanned = 0
  let truncated = false
  for (const display of displays) {
    if (wanted !== undefined && !wanted.has(display.name.toLowerCase())) continue
    scanned += display.objects.length
    for (const object of display.objects) {
      if (!matchesBulk(object, match)) continue
      if (targets.length >= limit) {
        truncated = true
        break
      }
      targets.push({ display: display.name, object: object.name ?? object.type, type: object.type })
      touched.add(display.name)
    }
    if (truncated) break
  }
  return { targets, displays: [...touched], scanned, truncated }
}
