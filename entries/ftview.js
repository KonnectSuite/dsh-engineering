/**
 * The FactoryTalk View ME product row: one switch for read, edits, Studio
 * handoff and the skill.
 *
 * All four surfaces are on by default — the whole product is small enough that
 * a reader who opens an export wants the edits and the handoff too.
 */
import z from '@deepseek-ai/schemastery'
import * as read from '../vendor/ftview/lib/index.js'
import * as skill from '../vendor/ftview/lib/skill.js'
import * as edit from '../vendor/ftview/lib/edit.js'
import * as studio from '../vendor/ftview/lib/studio.js'
import { flag } from './config.js'

export const name = 'engineering-ftview'
/** Union of the parts' requirements: the read entry owns the view service. */
export const inject = ['tools', 'fs']

export const Config = z.object({
  edit: z.boolean().default(true).volatile().description(
    'Staged display and HMI-tag edits, validated then written to a new export folder.',
  ),
  studio: z.boolean().default(true).volatile().description(
    'FactoryTalk View Studio discovery and the manual import plan. Runs no vendor utility.',
  ),
})

/**
 * Mount the FactoryTalk View surface.
 * @param ctx - plugin context.
 * @param config - the two optional surfaces, on by default.
 */
export function apply(ctx, config = {}) {
  ctx.plugin(read)
  ctx.plugin(skill)
  if (flag(config.edit, true)) ctx.plugin(edit)
  if (flag(config.studio, true)) ctx.plugin(studio)
}
