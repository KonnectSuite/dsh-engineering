/**
 * The ECAD product row: the sixteen drawing tools and the `ecad-drafting` skill
 * behind one switch.
 *
 * The row ships OFF by default (it is a new surface over a large schema set), so
 * its tools cost a fresh install nothing until a person enables it. Writes are a
 * second switch on the row and start off: a mounted row reads and reviews, and
 * only writes what a person enabled. Every written file is a new file beside the
 * source.
 */
import z from '@deepseek-ai/schemastery'
import * as ecad from '../vendor/ecad/lib/index.js'
import * as skill from '../vendor/ecad/lib/skill.js'

export const name = 'engineering-ecad'

/** The drawing tools need the registry and the filesystem. */
export const inject = ['tools', 'fs']

export const Config = z.object({
  writes: z.boolean().default(false).volatile().description(
    'Allow ECAD writes: draft apply writes a NEW drawing beside the source, and documentation or backups name their own new output. Off by default; a customer drawing is never overwritten.',
  ),
  maxFiles: z.natural().default(2000).volatile().description(
    'Most drawings a scan, review or backup call may touch in one call.',
  ),
  maxFileBytes: z.natural().default(67108864).volatile().description(
    'Largest drawing file the tools will read, in bytes (64 MiB by default).',
  ),
  maxEntities: z.natural().default(200000).volatile().description(
    'Most primitives per layout the render model builds before the layout is reported as truncated.',
  ),
})

/**
 * Mount the ECAD surface.
 * @param ctx - plugin context.
 * @param config - the row's write switch and bounds.
 */
export function apply(ctx, config = {}) {
  ctx.plugin(ecad, config)
  ctx.plugin(skill)
}
