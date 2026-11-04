/**
 * The ECAD row: the sixteen model-facing tools over the DXF engine.
 *
 * The engine is a plain library under `src/engine`; the format rule and every
 * write live in `drawings.ts` and `session.ts`. This module only turns that into
 * tool definitions and configures the bundle's `ecad` Remote service when the
 * composition mounted it, so the panel and the tools agree on whether writes are
 * allowed.
 *
 * The row ships off by default and its writes switch starts off: a mounted row
 * can read and review, and only writes what a person enabled.
 *
 * @module dsh-engineering-ecad
 */

import z from '@deepseek-ai/schemastery'
import { asFsService } from './core.ts'
import type { PluginContext, SandboxPolicyResolver } from './core.ts'
import { EcadSession } from './session.ts'
import { ecadTools } from './tools/index.ts'

/** Plugin name in a composition. */
export const name = 'engineering-ecad'

/** The tools need the registry and the filesystem. */
export const inject = ['tools', 'fs'] as const

/** The service this row provides for other entries: the workspace session. */
export const ECAD_SESSION_SERVICE = 'ecadSession'

/** The default drawing-size ceiling, matching the engine and the panel service. */
export const DEFAULT_MAX_FILE_BYTES = 64 * 1024 * 1024

/** The row configuration. */
export const Config = z.object({
  writes: z.boolean().default(false).description(
    'Allow the ECAD tools and the drawing panel to write: draft apply writes a NEW drawing beside the source, and documentation or backups name their own new output. Off by default; sources are never overwritten.'
  ),
  maxFiles: z.natural().default(2000).description('Most drawings a scan, review or backup call may touch in one call.'),
  maxFileBytes: z.natural().default(DEFAULT_MAX_FILE_BYTES).description('Largest drawing file the tools will read, in bytes.'),
  maxEntities: z.natural().default(200_000).description('Most primitives per layout the render model builds before it reports the layout as truncated.')
})

/** The configuration shape `apply` receives after schema validation. */
export interface RowConfig {
  /** Write switch; a volatile reference is accepted and read live. */
  readonly writes?: boolean | { get(): unknown }
  readonly maxFiles?: number
  readonly maxFileBytes?: number
  readonly maxEntities?: number
}

/** The Remote service shape this row configures when it is mounted beside it. */
interface EcadRemoteService {
  configure?(config: { writes?: boolean; maxFileBytes?: number }): unknown
}

/**
 * Read one switch that may arrive as a live reference.
 *
 * The row's settings page can hand a volatile field to the plugin as
 * `{ get() }` rather than as a boolean; reading it as a boolean made every switch
 * look off. Plain values (tests, older hosts) still work.
 *
 * @param input - the raw field.
 * @param fallback - value used when the field is absent or not a boolean.
 */
function switchOf(input: boolean | { get(): unknown } | undefined, fallback: boolean): boolean {
  const current = input !== null && typeof input === 'object' && typeof input.get === 'function' ? input.get() : input
  return typeof current === 'boolean' ? current : fallback
}

/**
 * Read one positive integer limit, or the fallback.
 *
 * @param input - the raw field.
 * @param fallback - value used when the field is absent or not a positive integer.
 */
function limitOf(input: number | undefined, fallback: number): number {
  return typeof input === 'number' && Number.isInteger(input) && input > 0 ? input : fallback
}

/**
 * Mount the ECAD tools and configure the panel service.
 *
 * @param ctx - plugin context.
 * @param config - row configuration after schema validation.
 */
export function apply(ctx: PluginContext, config: RowConfig = {}): void {
  const writes = switchOf(config.writes, false)
  const maxFiles = limitOf(config.maxFiles, 2000)
  const maxFileBytes = limitOf(config.maxFileBytes, DEFAULT_MAX_FILE_BYTES)
  const maxEntities = limitOf(config.maxEntities, 200_000)
  const policy = ctx.get?.('sandboxPolicy') as SandboxPolicyResolver | undefined
  const session = new EcadSession(asFsService(ctx.fs), {
    writes,
    maxFiles,
    maxFileBytes,
    maxEntities,
    ...(policy === undefined ? {} : { policy })
  })
  for (const definition of ecadTools(session)) ctx.tools.register(definition)
  ctx.provide?.(ECAD_SESSION_SERVICE, session)

  // Keep the drawing panel and the tools on one policy: when the bundle's Remote
  // service is mounted beside this row, its write switch follows the row's.
  const service = ctx.get?.('ecad') as EcadRemoteService | undefined
  if (service !== undefined && typeof service.configure === 'function') {
    try {
      service.configure({ writes, maxFileBytes })
    } catch (error) {
      ctx.logger?.warn?.(`engineering-ecad: the panel service did not accept the row policy: ${error instanceof Error ? error.message : String(error)}`)
    }
    ctx.effect?.(() => () => {
      try {
        service.configure?.({ writes: false })
      } catch {
        // The service is going away with the composition; nothing to reset.
      }
    }, 'engineering-ecad: reset the panel writes switch')
  }
}

export { EcadSession } from './session.ts'
export { ecadDraftTools, ecadDeliverTools, ecadReadTools, ecadTools } from './tools/index.ts'
export { EngineeringError } from './core.ts'
export { RECOGNISED_EXTENSIONS, SUPPORTED_EXTENSIONS, readDrawing, writeDrawing } from './drawings.ts'
export type { Coverage, NextStep, Success, ToolDefinition } from './core.ts'
export type { DrawingFormat } from './drawings.ts'
