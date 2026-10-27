/**
 * The engineering resources row: the standards corpus, the house-style profile
 * and the `engineering-standards` skill.
 *
 * The corpus and the index are generated data shipped inside the vendored
 * package; this entry only mounts them. A profile needs a product row to have a
 * project open, and says so when none is.
 */
import * as resources from '../vendor/resources/lib/index.js'

export const name = 'engineering-resources'

/** The tools need the registry; the skill is registered when the host offers it. */
export const inject = ['tools']

/**
 * Mount the resources surface.
 * @param ctx - plugin context.
 * @param config - `reference` (default true) controls the two read tools.
 */
export function apply(ctx, config = {}) {
  resources.apply(ctx, config)
}
