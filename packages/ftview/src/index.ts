/**
 * The rebuilt FactoryTalk View ME read surface.
 *
 * Six intents over one opened export folder: open, list, get, find, check and
 * compare. No Python engine, no Studio automation, no MER decoding.
 *
 * @module dsh-engineering-ftview
 */

import type { PluginContext } from './core.ts'
import { ViewSession } from './session.ts'
import { ftviewTools } from './tools.ts'

/** Plugin name in a composition. */
export const name = 'ftview-read'

/** Services this plugin cannot register without. */
export const inject = ['tools', 'fs'] as const

/** Service name the editing entry consumes. */
export const VIEWS_SERVICE = 'ftviewViews'

/** Configuration for the read surface. */
export interface Config {
  /** Most display and tag files one open may scan. Defaults to 2000. */
  maxFiles?: number
}

/**
 * Register the ME read surface.
 *
 * @param ctx - Plugin context with the tool registry and filesystem provider.
 * @param config - Deployment limits.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  const maxFiles = config.maxFiles ?? 2000
  if (!Number.isInteger(maxFiles) || maxFiles <= 0) {
    throw new Error('ftview-read: maxFiles must be a positive integer')
  }
  const session = new ViewSession(ctx.fs, maxFiles)
  ctx.provide?.(VIEWS_SERVICE, session)
  for (const definition of ftviewTools(session)) ctx.tools.register(definition)
}

export { ViewSession } from './session.ts'
export { ftviewTools } from './tools.ts'
export { EngineeringError } from './core.ts'
export type { Coverage, NextStep, Success, ToolDefinition } from './core.ts'
