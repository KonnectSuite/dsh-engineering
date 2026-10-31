/**
 * The migration support row: the legacy assessment, the `.L5K` linter and the
 * `slc-to-logix-migration` skill.
 *
 * Neither tool touches a controller or a vendor application; the row is a set of
 * offline readers over the files a migration already produced.
 */
import * as migration from '../vendor/migration/lib/index.js'

export const name = 'engineering-migration'

/** The tools need the registry and the filesystem; the skill is registered when offered. */
export const inject = ['tools', 'fs']

/**
 * Mount the migration surface.
 * @param ctx - plugin context.
 * @param config - `assess` and `lint` (both default true) control the two tools.
 */
export function apply(ctx, config = {}) {
  migration.apply(ctx, config)
}
