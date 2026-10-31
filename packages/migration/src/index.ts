/**
 * The migration support row: read a legacy RSLogix 500 project headlessly,
 * assess a saved legacy export, lint the `.L5K` the migration wizard writes,
 * compare the migrated Logix export with the legacy structure, resolve the
 * conversion errors the wizard left behind, and keep the resumable plan, with
 * the `slc-to-logix-migration` skill that says to interview and prove rather
 * than assume.
 *
 * The readers read local files only. `slc_read` and `migration_compare` open
 * the project through RSLogix 500's 32-bit automation server, hidden and
 * read-only, and quit without saving; no tool claims a file is migrated.
 *
 * @module dsh-engineering-migration
 */

import { migrationTools } from './tools.ts'
import * as skill from './skill.ts'
import type { PluginContext } from './core/tool.ts'

/** Plugin name in a composition. */
export const name = 'engineering-migration'

/** Every tool needs the registry and the filesystem; the skill declares its own. */
export const inject = ['tools', 'fs']

/** Configuration for the row. */
export interface Config {
  /** Whether the headless RSLogix 500 reader is registered. Defaults to true. */
  readonly read?: boolean
  /** Whether the assessment tool is registered. Defaults to true. */
  readonly assess?: boolean
  /** Whether the `.L5K` linter is registered. Defaults to true. */
  readonly lint?: boolean
  /** Whether the legacy-to-Logix comparison is registered. Defaults to true. */
  readonly compare?: boolean
  /** Whether the conversion-error resolver is registered. Defaults to true. */
  readonly resolve?: boolean
  /** Whether the plan tool is registered. Defaults to true. */
  readonly plan?: boolean
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
      if (definition.name === 'slc_read' && config.read === false) continue
      if (definition.name === 'migration_assess' && config.assess === false) continue
      if (definition.name === 'l5k_lint' && config.lint === false) continue
      if (definition.name === 'migration_compare' && config.compare === false) continue
      if (definition.name === 'migration_resolve' && config.resolve === false) continue
      if (definition.name === 'migration_plan' && config.plan === false) continue
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
export { readSlcProject, SlcError } from './engine/rslogix500.ts'
export { compareSides, matchRoutine, readLogix } from './engine/compare.ts'
export { legacyCalls, logixCalls, pairRungs, repairOperands, resolvePces, stripMarkers } from './engine/pce.ts'
export { STAGES, createPlan, parsePlan, planState, nextAction, openQuestions, summarize } from './engine/plan.ts'
export type { SlcFile, SlcProject, SlcRung, SlcDataFile, SlcSymbol } from './engine/rslogix500.ts'
export type { L5kFacts, L5kFinding, L5kReport, L5kText, L5kEncoding } from './engine/l5k.ts'
export type { Comparison, Difference, LegacySide, LogixSide, MatchedRoutine } from './engine/compare.ts'
export type { LegacyRungRef, MarkerSite, OperandSite, PceReport, Resolution, ResolutionKind } from './engine/pce.ts'
export type { MigrationPlan, PlanDecisions, PlanException, PlanSource, StageId, StageStatus } from './engine/plan.ts'
