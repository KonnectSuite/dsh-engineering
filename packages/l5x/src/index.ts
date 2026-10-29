/**
 * The rebuilt offline L5X read surface.
 *
 * Eleven read tools, one intent each, with described parameters, a
 * summary-first result and repairable failures. The project handles it opens are
 * provided as the `l5xProjects` service so the editing entry can draft against
 * the same exports without opening them twice.
 *
 * @module dsh-engineering-l5x
 */

import type { PluginContext } from './core/tool.ts'
import { ProjectSession } from './session.ts'
import { readTools } from './tools/read.ts'
import { referenceTools } from './tools/references.ts'
import { checkTools } from './tools/checks.ts'
import { documentTools } from './tools/document.ts'
import { previewTools } from './tools/preview.ts'

/** Plugin name in a composition. */
export const name = 'l5x-read'

/** Services this plugin cannot register without. */
export const inject = ['tools', 'fs'] as const

/** Service name the editing entry consumes. */
export const PROJECTS_SERVICE = 'l5xProjects'

/** Configuration for the read surface. */
export interface Config {
  /** Largest export, in bytes, one open will read. Defaults to 64 MiB. */
  maxFileBytes?: number
}

/**
 * Register the offline read surface.
 *
 * @param ctx - Plugin context with the tool registry and filesystem provider.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const maxFileBytes = config.maxFileBytes ?? 64 * 1024 * 1024
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error('l5x-read: maxFileBytes must be a positive integer')
  }
  const session = new ProjectSession(ctx.fs, maxFileBytes)
  ctx.provide?.(PROJECTS_SERVICE, session)
  for (const definition of [...readTools(session), ...referenceTools(session), ...checkTools(session), ...documentTools(session), ...previewTools(session)]) {
    ctx.tools.register(definition)
  }
}

export { ProjectSession } from './session.ts'
export { readTools } from './tools/read.ts'
export { referenceTools } from './tools/references.ts'
export { checkTools } from './tools/checks.ts'
export { documentTools } from './tools/document.ts'
export { previewTools } from './tools/preview.ts'
export { L5xError } from './core/errors.ts'
export type { NextStep, Coverage, Success } from './core/result.ts'
export type { ToolDefinition } from './core/tool.ts'
