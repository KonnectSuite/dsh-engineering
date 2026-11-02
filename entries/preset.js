/**
 * The Arya Automation Engineer preset row.
 *
 * The preset used to live in `@aryacode/dsh-aryacode-polish`, next to the Arya Standard and Arya
 * Qwen presets. It belongs here instead: the persona is an automation-engineering contract, the
 * compaction tuning is for read-heavy L5X work, and the ledger it registers is a record of what was
 * read, checked, written and verified in this bundle's tools. Installing this bundle should be enough
 * to get the agent that works on PLC projects.
 *
 * The row mounts the preset through the host's own registry (`ctx.get('agentPresets')`) and the
 * session projections service, exactly as the polish bundle did, so a profile that has no preset
 * registry simply logs and continues. The definition and the persona are in `presets/arya-automation`.
 *
 * @module dsh-engineering/preset
 */
import { mountAryaAutomation } from '../presets/arya-automation/plugin.js'

export const name = 'engineering-preset'

/** The preset cannot be registered without the host's registry; the projection needs its service. */
export const inject = ['agentPresets']

/**
 * Mount the preset for this row's config.
 *
 * @param ctx - The row's cordis context.
 * @param config - Row configuration, forwarded to the preset's settings reader.
 * @returns Resolves once the definition and the projection are registered.
 */
export function apply(ctx, config = {}) {
  return mountAryaAutomation(ctx, config)
}
