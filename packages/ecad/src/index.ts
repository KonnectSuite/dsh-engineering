/**
 * The ECAD row: the twelve model-facing tools over the DXF engine.
 *
 * The engine is a plain library under `src/engine`; the format rule and every
 * write live in `drawings.ts` and `session.ts`. This module only turns that into
 * tool definitions and configures the bundle's `ecad` Remote service when the
 * composition mounted it, so the panel and the tools agree on whether writes are
 * allowed.
 *
 * Drawing authoring is not this row's job: it happens in AryaCAD Electrical, which
 * the owner mounts as an MCP server in their own profile. This row never starts
 * that application; it reads the tool registry so `ecad_capabilities` can report
 * whether the bridge's tools are live in this composition.
 *
 * The row ships off by default and its writes switch starts off: a mounted row
 * can read and review, and only writes the deliverables a person enabled.
 *
 * @module dsh-engineering-ecad
 */

import z from '@deepseek-ai/schemastery'
import { bridgePrefix, DEFAULT_BRIDGE_SERVER } from './bridge.ts'
import type { CadBridge } from './bridge.ts'
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
  writes: z.boolean().default(false).volatile().description(
    'Allow the ECAD tools and the drawing panel to write deliverables: a document export or a backup copy, each naming its own new output. Drawing geometry is never written by these tools; authoring runs in AryaCAD Electrical. Off by default; sources are never overwritten.'
  ),
  bridgeServerName: z.string().default(DEFAULT_BRIDGE_SERVER).volatile().description(
    'The MCP serverName the AryaCAD Electrical bridge is mounted under. `ecad_capabilities` reports the tools of that server that are registered in this composition; this row never starts the CAD application.'
  ),
  maxFiles: z.natural().default(2000).volatile().description('Most drawings a scan, review or backup call may touch in one call.'),
  maxFileBytes: z.natural().default(DEFAULT_MAX_FILE_BYTES).volatile().description('Largest drawing file the tools will read, in bytes.'),
  maxEntities: z.natural().default(200_000).volatile().description('Most primitives per layout the render model builds before it reports the layout as truncated.')
})

/** The configuration shape `apply` receives after schema validation. */
export interface RowConfig {
  /** Write switch; a volatile reference is accepted and read live. */
  readonly writes?: boolean | { get(): unknown }
  /** MCP serverName of the CAD bridge; a volatile reference is accepted and read live. */
  readonly bridgeServerName?: string | { get(): unknown }
  readonly maxFiles?: number | { get(): unknown }
  readonly maxFileBytes?: number | { get(): unknown }
  readonly maxEntities?: number | { get(): unknown }
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
function limitOf(input: number | { get(): unknown } | undefined, fallback: number): number {
  const current = input !== null && typeof input === 'object' && typeof (input as { get?: unknown }).get === 'function'
    ? (input as { get(): unknown }).get()
    : input
  return typeof current === 'number' && Number.isInteger(current) && current > 0 ? current : fallback
}

/**
 * Read one string setting, or the fallback.
 *
 * @param input - the raw field.
 * @param fallback - value used when the field is absent or not a usable string.
 */
function textOf(input: string | { get(): unknown } | undefined, fallback: string): string {
  const current = input !== null && typeof input === 'object' && typeof (input as { get?: unknown }).get === 'function'
    ? (input as { get(): unknown }).get()
    : input
  return typeof current === 'string' && current.trim() !== '' ? current.trim() : fallback
}

/**
 * Look at the composition's tool registry for one MCP server's tools.
 *
 * The host registers every MCP tool as `mcp__<serverName>__<tool>`, so a prefix
 * read of the registered definitions is the whole check. The registry read face is
 * optional here: a test harness or an older host may expose only `register`, and a
 * missing read face is reported as "no bridge tools visible", never as an error.
 *
 * @param ctx - plugin context whose registry to read.
 * @param serverName - the configured MCP server name.
 */
function cadBridge(ctx: PluginContext, serverName: string): CadBridge {
  const prefix = bridgePrefix(serverName)
  return {
    serverName,
    visibleTools(): readonly string[] {
      if (typeof ctx.tools.definitions !== 'function') return []
      try {
        return ctx.tools.definitions()
          .map(definition => definition.name)
          .filter(name => typeof name === 'string' && name.startsWith(prefix))
      } catch (error) {
        ctx.logger?.warn?.(`engineering-ecad: the tool registry could not be read for the CAD bridge: ${error instanceof Error ? error.message : String(error)}`)
        return []
      }
    }
  }
}

/**
 * Mount the ECAD tools and configure the panel service.
 *
 * @param ctx - plugin context.
 * @param config - row configuration after schema validation.
 */
export function apply(ctx: PluginContext, config: RowConfig = {}): void {
  const writes = switchOf(config.writes, false)
  const bridgeServerName = textOf(config.bridgeServerName, DEFAULT_BRIDGE_SERVER)
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
  // The bridge is read from the registry on every capability call, so a server
  // mounted after this row still shows up; only its configured name is fixed here.
  const bridge = cadBridge(ctx, bridgeServerName)
  for (const definition of ecadTools(session, bridge)) ctx.tools.register(definition)
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
export { ecadDeliverTools, ecadReadTools, ecadTools } from './tools/index.ts'
export { bridgePrefix, bridgeReport, BRIDGE_ENTRY_TOOL, DEFAULT_BRIDGE_SERVER } from './bridge.ts'
export type { BridgeReport, CadBridge } from './bridge.ts'
export { EngineeringError } from './core.ts'
export { RECOGNISED_EXTENSIONS, SUPPORTED_EXTENSIONS, readDrawing, writeDrawing } from './drawings.ts'
export type { Coverage, NextStep, Success, ToolDefinition } from './core.ts'
export type { DrawingFormat } from './drawings.ts'
