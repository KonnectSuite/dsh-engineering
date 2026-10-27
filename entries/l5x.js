/**
 * The Studio 5000 L5X product row: one switch for the whole L5X surface.
 *
 * The parts are the vendored entries; this module mounts them, so the Plugins
 * page shows one row per product instead of one per surface. The expensive
 * surfaces stay off by default and are switched from this row's config form,
 * which is the same decision the old separate rows encoded — just reachable
 * from the product row instead of from the list.
 *
 * `allowWrites` is forwarded into the live entry, not consumed here: the write
 * tools refuse from inside that entry, so the switch and the per-call approval
 * both live where the controller traffic happens.
 */
import z from '@deepseek-ai/schemastery'
import * as read from '../vendor/l5x/lib/index.js'
import * as skill from '../vendor/l5x/lib/skill.js'
import * as editing from '../vendor/l5x/lib/editing.js'
import * as studio from '../vendor/l5x/lib/studio.js'
import * as live from '../vendor/l5x/lib/live.js'
import { flag, list } from './config.js'

export const name = 'engineering-l5x'
/** Union of the parts' requirements: the read entry owns the project service. */
export const inject = ['tools', 'fs']

export const Config = z.object({
  editing: z.boolean().default(false).volatile().description(
    'Nine staged draft tools (draft_rung, draft_apply, ...). Off by default: a read-only profile should not pay for these schemas.',
  ),
  studio: z.boolean().default(false).volatile().description(
    'Logix Designer SDK and supervised controller tools. Needs Studio 5000 with the SDK service installed.',
  ),
  live: z.boolean().default(false).volatile().description(
    'EtherNet/IP surface: polling, batch reads, discovery, controller clock and trends. Needs a reachable controller address.',
  ),
  allowWrites: z.boolean().default(false).volatile().description(
    'Permit the two live write tools (tag, wall clock). Each write still needs human approval for that exact operation, and only applies while live is on.',
  ),
  allowedAddresses: z.array(z.string()).default([]).volatile().description(
    'Optional IPv4 allowlist for live reads, writes and discovery. Empty permits any explicit address.',
  ),
})

/**
 * Mount the L5X surface.
 * @param ctx - plugin context.
 * @param config - the optional surfaces, all off unless enabled.
 */
export function apply(ctx, config = {}) {
  ctx.plugin(read)
  ctx.plugin(skill)
  // Volatile-only config changes never re-run apply(): the loader commits the
  // new values and emits loader/volatile-update. Remount the optional surfaces
  // from that event so a switch flipped in the row page takes effect at once.
  let editingFiber
  let studioFiber
  let liveFiber
  let liveSignature = ''
  const sync = () => {
    const wantEditing = flag(config.editing)
    if (wantEditing && editingFiber === undefined) editingFiber = ctx.plugin(editing)
    else if (!wantEditing && editingFiber !== undefined) {
      void editingFiber.dispose()
      editingFiber = undefined
    }

    const wantStudio = flag(config.studio)
    if (wantStudio && studioFiber === undefined) studioFiber = ctx.plugin(studio)
    else if (!wantStudio && studioFiber !== undefined) {
      void studioFiber.dispose()
      studioFiber = undefined
    }

    const wantLive = flag(config.live)
    const addresses = list(config.allowedAddresses)
    const signature = wantLive ? JSON.stringify([flag(config.allowWrites), addresses]) : ''
    if (wantLive && (liveFiber === undefined || signature !== liveSignature)) {
      if (liveFiber !== undefined) void liveFiber.dispose()
      liveFiber = ctx.plugin(live, {
        allowWrites: flag(config.allowWrites),
        ...(addresses.length === 0 ? {} : { allowedAddresses: addresses }),
      })
      liveSignature = signature
    } else if (!wantLive && liveFiber !== undefined) {
      void liveFiber.dispose()
      liveFiber = undefined
      liveSignature = ''
    }
  }
  sync()
  ctx.on('loader/volatile-update', sync)
}
