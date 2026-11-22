/**
 * The RSLogix 500 row.
 *
 * One row, ten read-only tools and the `rslogix-500` skill. The row ships off:
 * a machine without RSLogix 500 still gets the offline text and documentation
 * readers, but the operator opts in before any of it mounts.
 *
 * @module dsh-engineering-slc
 */

import * as skill from './skill.ts'
import { docsTools } from './docs.ts'
import { slc500Tools } from './tools/index.ts'
import type { PluginContext, SandboxPolicyResolver } from './core/tool.ts'

/** The row name the bundle mounts. */
export const name = 'engineering-slc'

/** The host services the row injects. */
export const inject = ['tools', 'fs'] as const

/** Per-tool switches, so an operator can narrow the row without editing it. */
export interface Config {
  capabilities?: boolean
  open?: boolean
  ladder?: boolean
  find?: boolean
  ioCensus?: boolean
  ioConfig?: boolean
  dataRead?: boolean
  processor?: boolean
  database?: boolean
  docs?: boolean
}

/** The tool name each config flag gates. */
const FLAG_TO_TOOL: ReadonlyArray<[keyof Config, string]> = [
  ['capabilities', 'slc500_capabilities'],
  ['open', 'slc500_open'],
  ['ladder', 'slc500_ladder'],
  ['find', 'slc500_find'],
  ['ioCensus', 'slc500_io_census'],
  ['ioConfig', 'slc500_io_config'],
  ['dataRead', 'slc500_data_read'],
  ['processor', 'slc500_processor'],
  ['database', 'slc500_database'],
]

/** Mount the row: register the ten tools the config keeps, then the skill. */
export function apply(ctx: PluginContext, config: Config = {}): void {
  try {
    const definitions = slc500Tools(ctx.fs, ctx.get?.('sandboxPolicy') as SandboxPolicyResolver | undefined)
    for (const definition of definitions) {
      const gated = FLAG_TO_TOOL.find(([, tool]) => tool === definition.name)
      if (gated !== undefined && config[gated[0]] === false) continue
      ctx.tools.register(definition)
    }
    if (config.docs !== false) {
      for (const definition of docsTools(ctx)) ctx.tools.register(definition)
    }
    void skill.apply(ctx)
  } catch (error) {
    try {
      ctx.logger?.warn?.(`engineering-slc: the row did not mount: ${error instanceof Error ? error.message : String(error)}`)
    } catch {
      // The logger itself is optional; a failed mount must not throw out of apply.
    }
  }
}

export { slc500Tools } from './tools/index.ts'
export { docsTools, slc500DocsTool, COLLECTION } from './docs.ts'
export { SKILL } from './skill.ts'
export {
  automationServerRegistered,
  AUTOMATION_TRANSCRIPT_ENV,
  parseAutomationTranscript,
  powershell32Path,
  SlcAutomationError,
  type AutomationSnapshot,
} from './engine/automation.ts'
export { censusIo, censusLines, type IoCell, type IoCensus, type IoReference } from './engine/census.ts'
export { databaseFormatName, parseDatabaseExport, SlcDatabaseError, type DatabaseExport, type DatabaseRow } from './engine/database.ts'
export {
  dataFileByName,
  decodeSlcText,
  logicRungs,
  parseSlcText,
  programFileByName,
  SlcTextError,
  totalRungs,
  type SlcDataFile,
  type SlcFile,
  type SlcIoModule,
  type SlcProcessorIdentity,
  type SlcProject,
  type SlcRung,
  type SlcSymbol,
} from './engine/slc-text.ts'
export type { FsService, PluginContext, SandboxPolicyResolver, ToolDefinition, ToolExec, ToolOutput } from './core/tool.ts'
