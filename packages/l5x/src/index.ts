/**
 * The rebuilt offline L5X read surface.
 *
 * Four tools, one intent each, with described parameters, a summary-first
 * result and repairable failures. This package is the pilot for the engineering
 * port: the model layer is the existing parser, and everything above it is new.
 *
 * @module dsh-engineering-l5x
 */

import type { PluginContext } from './core/tool.ts'
import { ProjectSession } from './session.ts'
import { readTools } from './tools/read.ts'

/** Plugin name in a composition. */
export const name = 'l5x-read'

/** Services this plugin cannot register without. */
export const inject = ['tools', 'fs'] as const

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
  for (const definition of readTools(session)) ctx.tools.register(definition)
}

export { ProjectSession } from './session.ts'
export { readTools } from './tools/read.ts'
export { L5xError } from './core/errors.ts'
export type { NextStep, Coverage, Success } from './core/result.ts'
export type { ToolDefinition } from './core/tool.ts'
