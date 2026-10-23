/**
 * The `mwi-read` entry: the saved project model, code, help and review evidence.
 *
 * The row registers on Windows only, like the session row: the engine reads a
 * MotionWorks project and the bridge covers the same installation.
 *
 * @module dsh-engineering-mwi/read
 */

import type { PluginContext } from './core/tool.ts'
import { readTools } from './tools/read.ts'

/** Plugin name in a composition. */
export const name = 'mwi-read'

/** Services this plugin cannot register without. */
export const inject = ['tools'] as const

/**
 * Register the read tools.
 *
 * @param ctx - Plugin context with the tool registry.
 */
export function apply(ctx: PluginContext): void {
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(`mwi-read: skipped because this host is ${process.platform}; MotionWorks IEC requires Windows.`)
    } catch {
      // A logger that refuses must not turn an unsupported host into a crash.
    }
    return
  }
  for (const definition of readTools()) ctx.tools.register(definition)
}

export { readTools } from './tools/read.ts'
export { ReadService } from './read/service.ts'
