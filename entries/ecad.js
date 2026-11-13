/**
 * The ECAD product row: the twelve drawing tools and the `ecad-review` skill
 * behind one switch.
 *
 * The row ships OFF by default (it is a new surface over a large schema set), so
 * its tools cost a fresh install nothing until a person enables it. Writes are a
 * second switch on the row and start off: a mounted row reads and reviews, and
 * only writes the deliverables a person enabled — every written file is a new
 * file. Drawing authoring is not this row's: it runs in AryaCAD Electrical, which
 * the owner mounts as an MCP server in their own profile (docs/aryacad-bridge.md);
 * `bridgeServerName` only tells this row which server name to report on.
 */
import z from '@deepseek-ai/schemastery'
import * as ecad from '../vendor/ecad/lib/index.js'
import * as skill from '../vendor/ecad/lib/skill.js'

export const name = 'engineering-ecad'

/** The drawing tools need the registry and the filesystem. */
export const inject = ['tools', 'fs']

/**
 * Service key carrying the row's live write policy.
 *
 * The package-root row (`@aryacode/dsh-engineering`) mounts the ECAD Remote
 * service and this row mounts the tools. Sibling rows are not guaranteed to be
 * applied in the order the patch lists them, so the service cannot rely on
 * being configured by this row's `apply`; it reads this policy on every call
 * instead. The getters read the row's volatile config live.
 */
export const POLICY_SERVICE = 'ecadPolicy'

/** Read a boolean row field that may arrive as a volatile getter reference. */
function switchOf(input, fallback) {
  const current =
    input !== null && typeof input === 'object' && typeof input.get === 'function' ? input.get() : input
  return typeof current === 'boolean' ? current : fallback
}

/** Read a positive integer row field that may arrive as a volatile getter reference. */
function limitOf(input, fallback) {
  const current =
    input !== null && typeof input === 'object' && typeof input.get === 'function' ? input.get() : input
  return typeof current === 'number' && Number.isInteger(current) && current > 0 ? current : fallback
}

/** Read a non-empty string row field that may arrive as a volatile getter reference. */
function textOf(input, fallback) {
  const current =
    input !== null && typeof input === 'object' && typeof input.get === 'function' ? input.get() : input
  return typeof current === 'string' && current.trim() !== '' ? current.trim() : fallback
}

export const Config = z.object({
  writes: z.boolean().default(false).volatile().description(
    'Allow ECAD writes of deliverables: a document export or a backup copy, each naming its own new output. Drawing geometry is never written by these tools; authoring runs in AryaCAD Electrical. Off by default; a customer drawing is never overwritten.',
  ),
  bridgeServerName: z.string().default('ocs').volatile().description(
    'The MCP serverName the AryaCAD Electrical bridge is mounted under. `ecad_capabilities` reports that server\'s tools that are registered in this composition; this row never starts the CAD application.',
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
  // Publish the policy before mounting the tools. The package-root Remote service
  // reads it at call time, so the panel and the tools agree even when this row is
  // applied before the row that provides the service.
  const policy = {
    get writes() {
      return switchOf(config.writes, false)
    },
    get bridgeServerName() {
      return textOf(config.bridgeServerName, 'ocs')
    },
    get maxFileBytes() {
      return limitOf(config.maxFileBytes, 64 * 1024 * 1024)
    },
  }
  ctx.provide?.(POLICY_SERVICE, policy)

  // Belt and braces for compositions where the sibling rows do not share the
  // service lookup: push the same policy into the panel service when it is there,
  // and retry briefly when this row is applied before the service row.
  const configureService = () => {
    const service = ctx.get?.('ecad')
    if (service === undefined || typeof service.configure !== 'function') return false
    try {
      service.configure({ writes: policy.writes, maxFileBytes: policy.maxFileBytes })
    } catch (error) {
      ctx.logger?.warn?.(`engineering-ecad: the panel service did not accept the row policy: ${error instanceof Error ? error.message : String(error)}`)
    }
    return true
  }
  if (configureService()) {
    ctx.effect?.(() => () => {
      try {
        ctx.get?.('ecad')?.configure?.({ writes: false })
      } catch {
        // The service is going away with the composition; nothing to reset.
      }
    }, 'engineering-ecad: reset the panel writes switch')
  } else {
    let attempts = 0
    const timer = setInterval(() => {
      attempts += 1
      if (configureService() || attempts >= 100) clearInterval(timer)
    }, 50)
    timer.unref?.()
    ctx.effect?.(() => () => clearInterval(timer), 'engineering-ecad: stop waiting for the panel service')
  }

  ctx.plugin(ecad, config)
  ctx.plugin(skill)
}
