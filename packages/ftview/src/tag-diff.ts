/**
 * Row-level tag differences between two exports.
 *
 * `ftview_compare` already reports displays and objects; a tag CSV only showed
 * up as a changed file hash, which cannot answer "which tags were added,
 * removed or re-addressed between two versions of the application".
 *
 * @module dsh-engineering-ftview/tag-diff
 */

import type { TagRow } from './model.ts'

/** One changed field of a tag that exists in both exports. */
export interface TagFieldChange {
  readonly name: string
  readonly field: string
  readonly before: string
  readonly after: string
}

/** Added, removed and changed tags. */
export interface TagDiff {
  readonly added: readonly string[]
  readonly removed: readonly string[]
  readonly changed: readonly TagFieldChange[]
}

/** Fields compared per tag, in reading order. */
const FIELDS: readonly (readonly [string, (tag: TagRow) => string])[] = [
  ['type', tag => tag.type],
  ['description', tag => tag.description],
  ['DevAddress', tag => tag.raw.DevAddress ?? ''],
  ['DataSource', tag => tag.raw.DataSource ?? ''],
  ['NativeType', tag => tag.raw.NativeType ?? ''],
  ['ReadOnly', tag => tag.raw.ReadOnly ?? ''],
]

/**
 * Compare the tag rows of two exports by name and field.
 *
 * @param before - Tag rows from the earlier export.
 * @param after - Tag rows from the later export.
 * @returns Added and removed names, and the fields that changed.
 */
export function tagDiff(before: readonly TagRow[], after: readonly TagRow[]): TagDiff {
  const left = new Map(before.map(tag => [tag.name, tag]))
  const right = new Map(after.map(tag => [tag.name, tag]))
  const added = [...right.keys()].filter(name => !left.has(name)).sort()
  const removed = [...left.keys()].filter(name => !right.has(name)).sort()
  const changed: TagFieldChange[] = []
  for (const [name, previous] of left) {
    const next = right.get(name)
    if (next === undefined) continue
    for (const [field, read] of FIELDS) {
      const from = read(previous)
      const to = read(next)
      if (from !== to) changed.push({ name, field, before: from, after: to })
    }
  }
  return { added, removed, changed }
}
