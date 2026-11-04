/**
 * The L5X editing entry: drafts over the read entry's project handles.
 *
 * Kept separate so a profile that only reads, checks and compares does not pay
 * for the draft schemas. It consumes the `l5xProjects` service the read entry
 * provides, so a project is opened once and both entries see the same handle.
 *
 * @module dsh-engineering-l5x/editing
 */

import type { PluginContext } from './core/tool.ts'
import { DraftStore } from './drafts.ts'
import { draftTools } from './tools/drafts.ts'
import type { ProjectSession } from './session.ts'
import { PROJECTS_SERVICE } from './index.ts'

/** Plugin name in a composition. */
export const name = 'l5x-editing'

/** The read entry's project service must already be mounted. */
export const inject = ['tools', PROJECTS_SERVICE] as const

/** Configuration for the editing entry. */
export interface Config {
  /** Largest export, in bytes, one preparation may read. Defaults to 64 MiB. */
  maxFileBytes?: number
  /** Most operations one draft may accumulate. Defaults to 200. */
  maxDraftOperations?: number
}

/**
 * Register the draft tools.
 *
 * @param ctx - Plugin context carrying the read entry's project service.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const session = ctx.get?.(PROJECTS_SERVICE) as ProjectSession | undefined
  if (session === undefined) {
    throw new Error('l5x-editing: the l5xProjects service is unavailable; mount the L5X read entry before this one')
  }
  const maxFileBytes = config.maxFileBytes ?? 64 * 1024 * 1024
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error('l5x-editing: maxFileBytes must be a positive integer')
  }
  const maxDraftOperations = config.maxDraftOperations ?? 200
  if (!Number.isInteger(maxDraftOperations) || maxDraftOperations <= 0) {
    throw new Error('l5x-editing: maxDraftOperations must be a positive integer')
  }
  const drafts = new DraftStore()
  for (const definition of draftTools(session, drafts, maxDraftOperations, maxFileBytes)) {
    ctx.tools.register(definition)
  }
}

export { DraftStore } from './drafts.ts'
export { draftTools } from './tools/drafts.ts'
