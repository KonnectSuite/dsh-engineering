/**
 * The MotionWorks IEC product row: one switch for the session, read, verify and
 * edit surfaces plus the skill.
 *
 * Editing is the largest schema set in the bundle; it ships on by default and
 * the row's config form can switch it off for a read-only profile.
 */
import z from '@deepseek-ai/schemastery'
import * as session from '../vendor/mwi/lib/index.js'
import * as read from '../vendor/mwi/lib/read.js'
import * as skill from '../vendor/mwi/lib/skill.js'
import * as verify from '../vendor/mwi/lib/verify.js'
import * as edit from '../vendor/mwi/lib/edit.js'
import { configureWorkspace } from '../vendor/mwi/lib/session/workspace.js'
import { mount } from './activation.js'
import { flag, text } from './config.js'

export const name = 'engineering-mwi'
/** The whole product needs the tool registry. */
export const inject = ['tools']

export const Config = z.object({
  workspace: z.string().default('').volatile().description(
    'Absolute workspace root for MotionWorks projects. Empty uses the session directory when the host passes one, then the mwi.workspace marker in the profile.',
  ),
  edit: z.boolean().default(true).volatile().description(
    'Seven staged edit tools (code, declarations, structure, blocks, POU packages). On by default; switch it off to drop the largest schemas in the bundle.',
  ),
})

/**
 * Mount the MotionWorks IEC surface.
 * @param ctx - plugin context.
 * @param config - the workspace root and the optional edit surface.
 */
export function apply(ctx, config = {}) {
  mount(ctx, 'mwi', session)
  mount(ctx, 'mwi', read)
  mount(ctx, 'mwi', skill)
  mount(ctx, 'mwi', verify)
  // The loader commits volatile-only config changes into the live references
  // and emits `loader/volatile-update` instead of re-running apply(). The edit
  // switch must mount and unmount the edit tools in place, or the page would
  // claim the tools are on while the request still lacks them.
  let mounted
  const sync = () => {
    configureWorkspace(text(config.workspace))
    const wanted = flag(config.edit)
    if (wanted && mounted === undefined) mounted = mount(ctx, 'mwi', edit)
    else if (!wanted && mounted !== undefined) {
      void mounted.dispose()
      mounted = undefined
    }
  }
  sync()
  ctx.on('loader/volatile-update', sync)
}
