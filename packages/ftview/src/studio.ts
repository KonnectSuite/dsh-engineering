/**
 * The FTView Studio entry: discovery, preflight and manual handoff.
 *
 * Deliberately does not execute vendor utilities. The old plugin's
 * `ftview_studio_apply` ran `SEAddComponent.exe` behind a capability probe that
 * only a licensed Studio install can produce; that path is out of scope until
 * it can be validated, so this entry stops at a verifiable handoff.
 *
 * @module dsh-engineering-ftview/studio
 */

import type { PluginContext } from './core.ts'
import { DEFAULT_SEARCH_ROOTS } from './studio/discover.ts'
import { studioTools } from './studio/tools.ts'
import type { ViewSession } from './session.ts'

/** Plugin name in a composition. */
export const name = 'ftview-studio'

/** The read entry's view service must already be mounted. */
export const inject = ['tools', 'fs', 'ftviewViews'] as const

/** Configuration for the Studio entry. */
export interface Config {
  /** Install roots to search. Defaults to the two Rockwell Programs folders. */
  searchRoots?: string[]
}

/**
 * Register the Studio tools.
 *
 * @param ctx - Plugin context carrying the read entry's view service.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const session = ctx.get?.('ftviewViews') as ViewSession | undefined
  if (session === undefined) {
    throw new Error('ftview-studio: the ftviewViews service is unavailable; mount the FTView read entry before this one')
  }
  const roots = config.searchRoots ?? [...DEFAULT_SEARCH_ROOTS]
  if (!Array.isArray(roots) || roots.some(root => typeof root !== 'string' || root === '')) {
    throw new Error('ftview-studio: searchRoots must be an array of non-empty absolute paths')
  }
  for (const definition of studioTools(session, roots)) ctx.tools.register(definition)
}

export { discoverStudio, DEFAULT_SEARCH_ROOTS } from './studio/discover.ts'
export { handoffPlan, studioPreflight } from './studio/preflight.ts'
export { studioTools } from './studio/tools.ts'
