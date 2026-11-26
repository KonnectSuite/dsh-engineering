/**
 * The migration support row: the legacy assessment, the `.L5K` linter, the
 * conversion comparison, the marker resolver, the migration report and the
 * `legacy-to-logix-migration` skill.
 *
 * The `.L5K`, `.L5X` and `.SLC` readers are pure file readers. `slc_read` and
 * `migration_compare` also open an `.RSS`, `.ACH` or `.RSP` through the vendor
 * automation server, hidden and without saving, because only that product can
 * read those containers. `migration_report` writes the report and nothing else.
 * No controller is touched.
 */
import * as migration from '../vendor/migration/lib/index.js'
import { apply as mountRow } from './activation.js'

export const name = 'engineering-migration'

/** The tools need the registry and the filesystem; the skill is registered when offered. */
export const inject = ['tools', 'fs']

/**
 * Mount the migration surface.
 * @param ctx - plugin context.
 * @param config - `assess`, `lint`, `compare`, `resolve`, `report` and `plan`
 * (all default true) control the tools, one flag each.
 */
export function apply(ctx, config = {}) {
  mountRow(ctx, 'migration', migration, config)
}
