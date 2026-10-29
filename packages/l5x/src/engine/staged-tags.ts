/**
 * Staged tag declarations, so composition can see what the draft will declare.
 *
 * A rung is often written against a tag the same draft adds. The export has no
 * such tag yet, so composing against it alone answers TAG_NOT_FOUND — correct
 * for the export, wrong for the draft. The declarations ride on the project
 * snapshot instead of the parsed document: the document's symbol table is a
 * cache keyed by identity, and a copy would lose the parsed controller element.
 *
 * @module dsh-engineering-l5x/engine/staged-tags
 */

import type { L5xTag } from '../model/types.ts'
import type { DraftOperation } from '../drafts.ts'
import type { ProjectSnapshot } from '../session.ts'

/** One tag a draft declares and the export does not have. */
export interface StagedTag {
  readonly name: string
  readonly scope: string
  readonly data_type: string
}

/**
 * Collect the tags a draft adds that the export does not already declare.
 *
 * @param operations - The draft's operations in order.
 * @param project - The open project, whose tags are the baseline.
 * @returns The pending declarations, first occurrence wins.
 */
export function stagedTags(operations: readonly DraftOperation[], project: ProjectSnapshot): readonly StagedTag[] {
  const seen = new Set<string>(project.document.tags.map(tag => `${tag.scope}:${tag.name.toUpperCase()}`))
  const tags: StagedTag[] = []
  for (const operation of operations) {
    if (operation.operation !== 'add_tag') continue
    const name = typeof operation.name === 'string' ? operation.name : ''
    const scope = typeof operation.scope === 'string' ? operation.scope : 'controller'
    const dataType = typeof operation.data_type === 'string' ? operation.data_type : ''
    if (name === '' || dataType === '') continue
    const key = `${scope}:${name.toUpperCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    tags.push({ name, scope, data_type: dataType })
  }
  return tags
}

/**
 * A project view carrying the staged declarations for composition.
 *
 * @param project - The open project.
 * @param tags - Staged declarations from {@link stagedTags}.
 * @returns A project whose operand checks may resolve those names.
 */
export function withStagedTags(project: ProjectSnapshot, tags: readonly StagedTag[]): ProjectSnapshot {
  if (tags.length === 0) return project
  const declared: L5xTag[] = tags.map(tag => ({
    name: tag.name,
    dataType: tag.data_type,
    scope: tag.scope,
    description: 'Staged in this draft; nothing is written until draft_apply.',
  }))
  return { ...project, stagedTags: declared }
}
