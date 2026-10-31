/**
 * The migration support row: assess a legacy RSLogix 500 export and lint the
 * `.L5K` the migration wizard writes, with the `slc-to-logix-migration` skill
 * that says to interview and prove rather than assume.
 *
 * The tools read local files only. No controller, no RSLogix 500 automation and
 * no claim that a file is migrated.
 *
 * @module dsh-engineering-migration
 */

import { migrationTools } from './tools.ts'
import * as skill from './skill.ts'
import type { PluginContext } from './core/tool.ts'

/** Plugin name in a composition. */
export const name = 'engineering-migration'

/** Both tools need the registry and the filesystem; the skill declares its own. */
export const inject = ['tools', 'fs']

/** Configuration for the row. */
export interface Config {
  /** Whether the assessment tool is registered. Defaults to true. */
  readonly assess?: boolean
  /** Whether the .L5K linter is registered. Defaults to true. */
  readonly lint?: boolean
}

/**
 * Register the migration tools and mount the skill.
 *
 * @param ctx - plugin context with the tool registry and filesystem.
 * @param config - Row configuration.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  try {
    for (const definition of migrationTools(ctx.fs)) {
      if (definition.name === 'migration_assess' && config.assess === false) continue
      if (definition.name === 'l5k_lint' && config.lint === false) continue
      ctx.tools.register(definition)
    }
    skill.apply(ctx)
  } catch (error) {
    try {
      ctx.logger?.warn?.(`engineering-migration: the row did not mount: ${error instanceof Error ? error.message : String(error)}`)
    } catch {
      // Nothing left to report to.
    }
  }
}

export { migrationTools } from './tools.ts'
export { SKILL } from './skill.ts'
export { decodeL5k, readL5k, lintL5k } from './engine/l5k.ts'
export type { L5kFacts, L5kFinding, L5kReport, L5kText, L5kEncoding } from './engine/l5k.ts'
