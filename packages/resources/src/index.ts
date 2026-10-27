/**
 * The engineering resources row: a local standards corpus, a house-style profile
 * and the `engineering-standards` skill that tells a model to read both before
 * authoring.
 *
 * The corpus is generated data (`index.json`, `SOURCE.json`) over authored
 * Markdown; the profile is produced by whichever product package has a project
 * open. This entry wires them to the tool registry and mounts the skill as a
 * sub-plugin that waits for the skills service, so row order cannot drop it.
 *
 * @module dsh-engineering-resources
 */

import { resourceTools } from './tools.ts'
import { getProfile } from './store.ts'
import * as skill from './skill.ts'
import type { StyleProfile } from './profile.ts'

/** Plugin name in a composition. */
export const name = 'engineering-resources'

/** The tools need the registry; the skill is a sub-plugin with its own injection. */
export const inject = ['tools']

/** The service name a generation tool can inject to read a profile by handle. */
export const PROFILES_SERVICE = 'engineeringProfiles'

/** Configuration for the row. */
export interface Config {
  /** Whether the reference and profile tools are registered. Defaults to true. */
  reference?: boolean
}

/** The service exposed to other rows. */
export interface ProfilesService {
  /** The profile for one handle, when it is still in memory. */
  get(id: string): StyleProfile | undefined
}

/** The plugin context shape this row needs. */
interface RowContext {
  tools: { register(definition: unknown): void }
  get?: (name: string) => unknown
  provide?: (name: string, value: unknown) => void
  plugin?: (plugin: unknown) => void
  logger?: { warn?(message: string): void }
}

/**
 * Register the resource tools and mount the standards skill.
 *
 * @param ctx - Plugin context with the tool registry and optional services.
 * @param config - Row configuration.
 */
export function apply(ctx: RowContext, config: Config = {}): void {
  // A reference row must never be able to stop the application from booting:
  // in 0.9.0 a row id that collided with a harness service did exactly that.
  // Anything that goes wrong here is reported and skipped.
  try {
    const getService = (service: string): unknown => (typeof ctx.get === 'function' ? ctx.get(service) : undefined)
    if (config.reference !== false) {
      for (const definition of resourceTools(getService)) ctx.tools.register(definition)
    }
    ctx.provide?.(PROFILES_SERVICE, { get: getProfile } satisfies ProfilesService)
    // Mount the skill as its own plugin: it declares `inject: ['skills']`, so the
    // host activates it when that service exists rather than at this row's turn.
    if (typeof ctx.plugin === 'function') {
      ctx.plugin(skill)
    } else {
      const skills = getService('skills') as { register?(definition: unknown): void } | undefined
      if (skills !== undefined) skill.registerSkill(skills)
    }
  } catch (error) {
    try {
      ctx.logger?.warn?.(`engineering-resources: the row did not mount: ${error instanceof Error ? error.message : String(error)}`)
    } catch {
      // Nothing left to report to.
    }
  }
}

export { getProfile } from './store.ts'
export { validateProfile, profileId } from './profile.ts'
export type { StyleProfile } from './profile.ts'
export { resourceTools, referenceTool, profileTool } from './tools.ts'
export { SKILL } from './skill.ts'
