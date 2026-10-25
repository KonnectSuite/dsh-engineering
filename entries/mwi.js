/**
 * The MotionWorks IEC product row: one switch for the session, read, verify and
 * edit surfaces plus the skill.
 *
 * Editing is the largest schema set in the bundle, so it stays off until the
 * row's config form turns it on.
 */
import z from '@deepseek-ai/schemastery'
import * as session from '../vendor/mwi/lib/index.js'
import * as read from '../vendor/mwi/lib/read.js'
import * as skill from '../vendor/mwi/lib/skill.js'
import * as verify from '../vendor/mwi/lib/verify.js'
import * as edit from '../vendor/mwi/lib/edit.js'

export const name = 'engineering-mwi'
/** The whole product needs the tool registry. */
export const inject = ['tools']

export const Config = z.object({
  edit: z.boolean().default(false).description(
    'Seven staged edit tools (code, declarations, structure, blocks, POU packages). Off by default: the largest schemas in the bundle.',
  ),
})

/**
 * Mount the MotionWorks IEC surface.
 * @param ctx - plugin context.
 * @param config - the optional edit surface, off unless enabled.
 */
export function apply(ctx, config = {}) {
  ctx.plugin(session)
  ctx.plugin(read)
  ctx.plugin(skill)
  ctx.plugin(verify)
  if (config.edit === true) ctx.plugin(edit)
}
