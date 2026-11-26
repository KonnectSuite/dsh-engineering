/**
 * The RSLogix 500 (SLC 500 and MicroLogix) product row: the read-only
 * `.SLC`/text-export reader, ladder and data-file reads, I/O and processor
 * census, the database export, `slc500_docs` and the `rslogix-500` skill.
 *
 * The row ships OFF: a new surface on a legacy platform, listed and disabled
 * until a person enables it. No tool writes a project, edits a data file or
 * contacts a controller; the automation-server path only reads, hidden and
 * never saved, and the text reader answers from the export alone when
 * RSLogix 500 is not on the machine.
 */
import * as slc from '../vendor/slc/lib/index.js'
import { apply as mountRow } from './activation.js'

export const name = 'engineering-slc'

/** The tools need the registry and the filesystem; the skill is registered when offered. */
export const inject = ['tools', 'fs']

/**
 * Mount the RSLogix 500 surface.
 * @param ctx - plugin context.
 * @param config - `capabilities`, `open`, `ladder`, `find`, `ioCensus`,
 * `ioConfig`, `dataRead`, `processor`, `database` and `docs` (all default true)
 * control the tools, one flag each.
 */
export function apply(ctx, config = {}) {
  mountRow(ctx, 'slc', slc, config)
}
