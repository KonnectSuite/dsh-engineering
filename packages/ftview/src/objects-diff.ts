import type { DisplayFile, DisplayObject } from './model.ts'

/** One object that differs between two exports. */
export interface ChangedObject {
  /** Object name, or a synthetic key for an unnamed object. */
  readonly name: string
  /** Attributes or connections that differ. */
  readonly fields: readonly string[]
}

/** What changed inside one display. */
export interface DisplayObjects {
  /** Display name. */
  readonly display: string
  /** Objects the later export has and the earlier one did not. */
  readonly added: readonly string[]
  /** Objects the earlier export had and the later one does not. */
  readonly removed: readonly string[]
  /** Objects present in both whose geometry, caption, states or wiring differ. */
  readonly changed: readonly ChangedObject[]
}

/** Fields compared for one object; identity and wiring are what an engineer reads. */
const FIELDS = ['type', 'left', 'top', 'width', 'height', 'caption', 'connections', 'visible']

/** Value of one compared field, flattened to a string. */
function field(object: DisplayObject, name: string): string {
  if (name === 'type') return object.type
  if (name === 'connections') {
    const entries = Object.entries(object.connections ?? {}).sort(([left], [right]) => left.localeCompare(right))
    return entries.map(([key, value]) => `${key}=${value}`).join(';')
  }
  return object.attributes[name] ?? ''
}

/** Stable key for one object: its name, or its type and position when unnamed. */
function keyOf(object: DisplayObject): string {
  if (object.name !== undefined && object.name !== '') return object.name
  const left = object.attributes.left ?? '0'
  const top = object.attributes.top ?? '0'
  return `${object.type}@${left},${top}`
}

/**
 * Compare the objects of two exports, display by display.
 *
 * Displays only in one side are reported by name; displays in both are compared
 * object by object on the fields an engineer reads off the screen.
 *
 * @param before - Displays of the earlier export.
 * @param after - Displays of the later export.
 * @param limit - Most displays to report.
 * @returns Per-display deltas, plus the totals needed to describe them.
 */
export function diffObjects(
  before: readonly DisplayFile[],
  after: readonly DisplayFile[],
  limit: number,
): { displays: readonly DisplayObjects[]; changedDisplays: number; truncated: boolean } {
  const oldByName = new Map(before.map(display => [display.name, display]))
  const results: DisplayObjects[] = []
  for (const display of after) {
    const old = oldByName.get(display.name)
    if (old === undefined) continue
    const oldObjects = new Map(old.objects.map(object => [keyOf(object), object]))
    const newObjects = new Map(display.objects.map(object => [keyOf(object), object]))
    const added = [...newObjects.keys()].filter(key => !oldObjects.has(key))
    const removed = [...oldObjects.keys()].filter(key => !newObjects.has(key))
    const changed: ChangedObject[] = []
    for (const [key, object] of newObjects) {
      const previous = oldObjects.get(key)
      if (previous === undefined) continue
      const fields = FIELDS.filter(name => field(previous, name) !== field(object, name))
      if (fields.length > 0) changed.push({ name: key, fields })
    }
    if (added.length === 0 && removed.length === 0 && changed.length === 0) continue
    results.push({ display: display.name, added, removed, changed })
  }
  return { displays: results.slice(0, limit), changedDisplays: results.length, truncated: results.length > limit }
}
