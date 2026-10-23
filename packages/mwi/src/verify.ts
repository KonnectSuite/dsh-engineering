/**
 * The `mwi-verify` entry: compile, diagnostics and verification.
 *
 * @module dsh-engineering-mwi/verify
 */

import type { PluginContext } from './core/tool.ts'
import { verifyTools } from './tools/verify.ts'

/** Plugin name in a composition. */
export const name = 'mwi-verify'

/** Services this plugin cannot register without. */
export const inject = ['tools'] as const

/**
 * Register the verify tools.
 *
 * @param ctx - Plugin context with the tool registry.
 */
export function apply(ctx: PluginContext): void {
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(`mwi-verify: skipped because this host is ${process.platform}; MotionWorks IEC requires Windows.`)
    } catch {
      // A logger that refuses must not turn an unsupported host into a crash.
    }
    return
  }
  for (const definition of verifyTools()) ctx.tools.register(definition)
}

export { verifyTools } from './tools/verify.ts'
