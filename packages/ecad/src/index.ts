/**
 * The ECAD row: the model-facing tools and the `ecad-drafting` skill.
 *
 * The engine is a plain library under `src/engine`; the open-document handles
 * and every write live in the bundle's `ecad` service, which the panel uses too.
 * This module only turns that service into tools and mounts the guidance.
 *
 * @module dsh-engineering-ecad
 */

/** Plugin name in a composition. */
export const name = 'engineering-ecad'

/** The tools need the registry and the filesystem; the `ecad` service provides the engine. */
export const inject = ['tools', 'fs'] as const

/**
 * Mount the ECAD tools and skill.
 *
 * @param ctx - plugin context.
 */
export function apply(_ctx: unknown): void {
  // The ECAD milestone mounts the tools and the skill here.
}
