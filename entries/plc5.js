/**
 * The RSLogix 5 (PLC-5) product row: the headless `.RSP` reader, the ladder
 * in neutral text, the ladder search, the I/O footprint census, the chassis
 * configuration, the data-file table, the processor identity and the
 * `rslogix-5` skill.
 *
 * Every tool opens the project through the RSLogix 5 automation server,
 * hidden and closed with the do-not-save flag, and the container reader
 * answers from the file itself when RSLogix 5 is not on the machine. No tool
 * writes a project and no tool contacts a controller. The row ships OFF: a
 * new surface, listed and disabled until a person enables it.
 */
import * as plc5 from '../vendor/plc5/lib/index.js'
import { apply as mountRow } from './activation.js'

export const name = 'engineering-plc5'

/** The tools need the registry and the filesystem; the skill is registered when offered. */
export const inject = ['tools', 'fs']

/**
 * Mount the RSLogix 5 surface.
 * @param ctx - plugin context.
 * @param config - `capabilities`, `open`, `ladder`, `find`, `ioCensus`,
 * `ioConfig`, `dataRead` and `processor` (all default true) control the tools,
 * one flag each.
 */
export function apply(ctx, config = {}) {
  mountRow(ctx, 'plc5', plc5, config)
}
