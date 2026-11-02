/**
 * The L5X-style editing entry for FactoryTalk View ME: drafts over the read
 * entry's opened views.
 *
 * Separate so a read-only profile does not pay for five edit schemas. It
 * consumes the `ftviewViews` service the read entry provides, so an export is
 * scanned once and both entries see the same handle.
 *
 * @module dsh-engineering-ftview/edit
 */

import { stringFs, type PluginContext, type SandboxPolicyResolver } from './core.ts'
import { EditDrafts } from './edit/drafts.ts'
import { editTools } from './edit/tools.ts'
import type { ViewSession } from './session.ts'

/** Plugin name in a composition. */
export const name = 'ftview-edit'

/** The read entry's view service must already be mounted. */
export const inject = ['tools', 'fs', 'ftviewViews'] as const

/** Configuration for the editing entry. */
export interface Config {
  /** Most operations one draft may accumulate. Defaults to 100. */
  maxDraftOperations?: number
}

/**
 * Register the editing tools.
 *
 * @param ctx - Plugin context carrying the read entry's view service.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const session = ctx.get?.('ftviewViews') as ViewSession | undefined
  if (session === undefined) {
    throw new Error('ftview-edit: the ftviewViews service is unavailable; mount the FTView read entry before this one')
  }
  const maxDraftOperations = config.maxDraftOperations ?? 100
  if (!Number.isInteger(maxDraftOperations) || maxDraftOperations <= 0) {
    throw new Error('ftview-edit: maxDraftOperations must be a positive integer')
  }
  const profiles = ctx.get?.('engineeringProfiles') as { get(id: string): unknown } | undefined
  for (const definition of editTools(session, new EditDrafts(), stringFs(ctx.fs), maxDraftOperations, profiles?.get.bind(profiles), ctx.get?.('sandboxPolicy') as SandboxPolicyResolver | undefined)) ctx.tools.register(definition)
}

export { EditDrafts } from './edit/drafts.ts'
export { editTools } from './edit/tools.ts'
export { prepareEdit } from './edit/prepare.ts'
