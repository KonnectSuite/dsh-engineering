/**
 * The L5X studio entry: offline SDK work over the read entry's project handles.
 *
 * Separate so the SDK's ACD export, build and verification schemas are paid for
 * only where Studio 5000 is installed and the user opted in. No tool in this
 * entry contacts a controller.
 *
 * @module dsh-engineering-l5x/studio
 */

import type { PluginContext } from './core/tool.ts'
import { StudioState } from './studio-state.ts'
import { studioTools } from './tools/studio.ts'
import type { ProjectSession } from './session.ts'
import { PROJECTS_SERVICE } from './index.ts'

/** Plugin name in a composition. */
export const name = 'l5x-studio'

/** The read entry's project service must already be mounted. */
export const inject = ['tools', PROJECTS_SERVICE] as const

/** Configuration for the studio entry. */
export interface Config {
  /** Largest export, in bytes, one verification may read. Defaults to 64 MiB. */
  maxFileBytes?: number
}

/**
 * Register the studio tools.
 *
 * @param ctx - Plugin context carrying the read entry's project service.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const session = ctx.get?.(PROJECTS_SERVICE) as ProjectSession | undefined
  if (session === undefined) {
    throw new Error('l5x-studio: the l5xProjects service is unavailable; mount the L5X read entry before this one')
  }
  const maxFileBytes = config.maxFileBytes ?? 64 * 1024 * 1024
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error('l5x-studio: maxFileBytes must be a positive integer')
  }
  for (const definition of studioTools(session, new StudioState())) {
    ctx.tools.register(definition)
  }
}

export { StudioState } from './studio-state.ts'
export { studioTools } from './tools/studio.ts'
