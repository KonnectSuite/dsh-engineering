/**
 * The RSLogix 5 (PLC-5) product row: open a `.RSP` project headlessly through
 * the vendor automation server, read its ladder in neutral text, search it,
 * census the I/O footprint it references, list the configured chassis, read
 * the data-file table, and name the processor — with the `rslogix-5` skill
 * that keeps every read hidden, read-only and closed with the do-not-save flag.
 *
 * The readers read local files only. No tool contacts a controller, no tool
 * writes to a project, and the container reader answers from the file itself
 * when RSLogix 5 is not on the machine.
 *
 * @module dsh-engineering-plc5
 */

import { plc5Tools } from './tools.ts'
import { docsTools } from './docs.ts'
import * as skill from './skill.ts'
import type { PluginContext, SandboxPolicyResolver } from './core/tool.ts'

/** Plugin name in a composition. */
export const name = 'engineering-plc5'

/** Every tool needs the registry and the filesystem; the skill declares its own. */
export const inject = ['tools', 'fs']

/** Configuration for the row. */
export interface Config {
  /** Whether the capabilities probe is registered. Defaults to true. */
  readonly capabilities?: boolean
  /** Whether the headless project reader is registered. Defaults to true. */
  readonly open?: boolean
  /** Whether the ladder reader is registered. Defaults to true. */
  readonly ladder?: boolean
  /** Whether the ladder search is registered. Defaults to true. */
  readonly find?: boolean
  /** Whether the I/O footprint census is registered. Defaults to true. */
  readonly ioCensus?: boolean
  /** Whether the chassis configuration reader is registered. Defaults to true. */
  readonly ioConfig?: boolean
  /** Whether the data-file table reader is registered. Defaults to true. */
  readonly dataRead?: boolean
  /** Whether the processor identity tool is registered. Defaults to true. */
  readonly processor?: boolean
  /** Whether the .PC5 structure report is registered. Defaults to true. */
  readonly pc5Export?: boolean
  /** Whether the text-export consistency verdict is registered. Defaults to true. */
  readonly verify?: boolean
  /** Whether the text-export instruction census is registered. Defaults to true. */
  readonly instructionInventory?: boolean
  /** Whether the text-export rung digest is registered. Defaults to true. */
  readonly rungDigest?: boolean
  /** Whether the text-export indirect-address census is registered. Defaults to true. */
  readonly indirectCensus?: boolean
  /** Whether the text-export diff is registered. Defaults to true. */
  readonly diff?: boolean
  /** Whether the authored `plc5_docs` knowledge tool is registered. Defaults to true. */
  readonly docs?: boolean
}

/**
 * Register the RSLogix 5 tools and mount the skill.
 *
 * @param ctx - plugin context with the tool registry and filesystem.
 * @param config - Row configuration.
 */
export function apply(ctx: PluginContext, config: Config = {}): void {
  try {
    for (const definition of plc5Tools(ctx.fs, ctx.get?.('sandboxPolicy') as SandboxPolicyResolver | undefined)) {
      if (definition.name === 'plc5_capabilities' && config.capabilities === false) continue
      if (definition.name === 'plc5_open' && config.open === false) continue
      if (definition.name === 'plc5_ladder' && config.ladder === false) continue
      if (definition.name === 'plc5_find' && config.find === false) continue
      if (definition.name === 'plc5_io_census' && config.ioCensus === false) continue
      if (definition.name === 'plc5_io_config' && config.ioConfig === false) continue
      if (definition.name === 'plc5_data_read' && config.dataRead === false) continue
      if (definition.name === 'plc5_processor' && config.processor === false) continue
      if (definition.name === 'plc5_pc5' && config.pc5Export === false) continue
      if (definition.name === 'plc5_verify' && config.verify === false) continue
      if (definition.name === 'plc5_instruction_inventory' && config.instructionInventory === false) continue
      if (definition.name === 'plc5_rung_digest' && config.rungDigest === false) continue
      if (definition.name === 'plc5_indirect_census' && config.indirectCensus === false) continue
      if (definition.name === 'plc5_diff' && config.diff === false) continue
      ctx.tools.register(definition)
    }
    for (const definition of docsTools(ctx)) {
      if (definition.name === 'plc5_docs' && config.docs === false) continue
      ctx.tools.register(definition)
    }
    skill.apply(ctx)
  } catch (error) {
    try {
      ctx.logger?.warn?.(`engineering-plc5: the row did not mount: ${error instanceof Error ? error.message : String(error)}`)
    } catch {
      // Nothing left to report to.
    }
  }
}

export { plc5Tools } from './tools.ts'
export { pc5TextTools } from './tools/pc5-text.ts'
export { docsTools, COLLECTION, DOCS_TOOL_NAME, DOCS_DESCRIPTION } from './docs.ts'
export { SKILL } from './skill.ts'
export {
  BRANCH_TOKENS,
  KNOWN_INSTRUCTIONS,
  PC5_TEXT_EXTENSIONS,
  Pc5TextError,
  decodePc5Text,
  parsePc5Text,
  parseRungText,
  sniffPc5Bytes,
} from './engine/pc5-text.ts'
export type {
  Pc5ByteKind,
  Pc5DataFile,
  Pc5Export,
  Pc5Header,
  Pc5InstructionToken,
  Pc5Issue,
  Pc5ProgramFile,
  Pc5Rung,
} from './engine/pc5-text.ts'
export { readPlc5Project, Plc5Error } from './engine/rslogix5.ts'
export type { Plc5Chassis, Plc5DataFile, Plc5File, Plc5Processor, Plc5Project, Plc5Rung, Plc5Symbol } from './engine/rslogix5.ts'
export { parseCfbf, readContainerIdentity, CfbfError } from './engine/container.ts'
export type { CfbfFile, CfbfStream, Plc5ContainerIdentity } from './engine/container.ts'
export { scanIoFootprint, coverageAgainst } from './engine/census.ts'
export type { IoCell, IoCensus } from './engine/census.ts'
