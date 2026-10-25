/**
 * The Studio 5000 L5X product row: one switch for the whole L5X surface.
 *
 * The parts are the vendored entries; this module mounts them, so the Plugins
 * page shows one row per product instead of one per surface. The three
 * expensive surfaces stay off by default and are switched from this row's
 * config form, which is the same decision the old separate rows encoded —
 * just reachable from the product row instead of from the list.
 */
import z from '@deepseek-ai/schemastery'
import * as read from '../vendor/l5x/lib/index.js'
import * as skill from '../vendor/l5x/lib/skill.js'
import * as editing from '../vendor/l5x/lib/editing.js'
import * as studio from '../vendor/l5x/lib/studio.js'
import * as live from '../vendor/l5x/lib/live.js'

export const name = 'engineering-l5x'
/** Union of the parts' requirements: the read entry owns the project service. */
export const inject = ['tools', 'fs']

export const Config = z.object({
  editing: z.boolean().default(false).description(
    'Nine staged draft tools (draft_rung, draft_apply, ...). Off by default: a read-only profile should not pay for these schemas.',
  ),
  studio: z.boolean().default(false).description(
    'Logix Designer SDK and supervised controller tools. Needs Studio 5000 with the SDK service installed.',
  ),
  live: z.boolean().default(false).description(
    'EtherNet/IP polling and trend tools. Needs a reachable controller address.',
  ),
})

/**
 * Mount the L5X surface.
 * @param ctx - plugin context.
 * @param config - the three optional surfaces, all off unless enabled.
 */
export function apply(ctx, config = {}) {
  ctx.plugin(read)
  ctx.plugin(skill)
  if (config.editing === true) ctx.plugin(editing)
  if (config.studio === true) ctx.plugin(studio)
  if (config.live === true) ctx.plugin(live)
}
