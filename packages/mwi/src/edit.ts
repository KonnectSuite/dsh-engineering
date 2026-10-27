/**
 * The `mwi-edit` entry: staged edits, validation and apply.
 *
 * On by default; a read-only profile can switch it off. The row writes only the staged project and verifies that
 * unrelated saved and native state did not change.
 *
 * @module dsh-engineering-mwi/edit
 */

import type { PluginContext } from './core/tool.ts'
import { editTools } from './tools/edit.ts'

/** Plugin name in a composition. */
export const name = 'mwi-edit'

/** Services this plugin cannot register without. */
export const inject = ['tools'] as const

/**
 * Register the edit tools.
 *
 * @param ctx - Plugin context with the tool registry.
 */
export function apply(ctx: PluginContext): void {
  if (process.platform !== 'win32') {
    try {
      ctx.logger?.info?.(`mwi-edit: skipped because this host is ${process.platform}; MotionWorks IEC requires Windows.`)
    } catch {
      // A logger that refuses must not turn an unsupported host into a crash.
    }
    return
  }
  for (const definition of editTools()) ctx.tools.register(definition)
}

export { editTools } from './tools/edit.ts'
