/**
 * The tool contract shared by every MWI row.
 *
 * The legacy surface declared 63 tools in one file. The redesign keeps one
 * builder here so every tool carries a description, described parameters, the
 * canonical output declaration and the shared failure document.
 *
 * @module dsh-engineering-mwi/core/tool
 */

import type { Parameters } from './params.ts'
import { errorEnvelope, MwiError } from './errors.ts'

/** One content block the registry renders for the model. */
export interface TextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The canonical output declaration every tool must carry. */
export interface ToolOutput {
  readonly schema: { readonly type: 'object'; readonly additionalProperties: boolean }
  render(args: unknown, value: unknown): readonly TextBlock[]
}

/** The execution context a tool receives from the registry. */
export interface ToolExec {
  readonly signal?: AbortSignal
  readonly cwd?: string
  /** The calling chat; staged project handles are scoped to it. */
  readonly chat?: object
  readonly sessionId?: string
  readonly agent?: unknown
}

/** A registered tool. */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  readonly output: ToolOutput
  execute(args: Readonly<Record<string, unknown>>, exec?: ToolExec): Promise<unknown>
}

/** The registry service. */
export interface ToolRegistry {
  register(definition: ToolDefinition): unknown
}

/** One tool body, before the shared output and failure document are attached. */
export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  run(args: Readonly<Record<string, unknown>>, exec: ToolExec): Promise<unknown>
}

/** The services a composition must provide before an MWI row loads. */
export interface PluginContext {
  readonly tools: ToolRegistry
  readonly logger?: { info?(message: string): void; warn?(message: string): void }
  /** Register a service other entries in the same composition can consume. */
  provide?(name: string, value: unknown): void
  /** Read a service another entry in the same composition provided. */
  get?(name: string): unknown
}

/**
 * Render one tool answer as pretty JSON.
 *
 * @param _args - Accepted arguments; unused by this renderer.
 * @param value - The validated canonical value.
 * @returns One text block.
 */
export function jsonText(_args: unknown, value: unknown): readonly TextBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, undefined, 2) }]
}

/**
 * Attach the canonical output declaration and the shared failure handling.
 *
 * @param spec - The tool body and its metadata.
 * @returns The definition the registry receives.
 */
export function tool(spec: ToolSpec): ToolDefinition {
  if (!spec.name.startsWith('mw_')) {
    throw new Error(`MWI tool ${spec.name} must use the mw_ prefix so the motionworks-iec switch governs it`)
  }
  if (spec.description.trim() === '') throw new Error(`MWI tool ${spec.name} has no description`)
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        return await spec.run(args, exec ?? {})
      } catch (error) {
        return errorEnvelope(error)
      }
    },
  }
}

/** Read one required string argument, or refuse with a fix. */
export function requiredString(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new MwiError(
      'INVALID_ARGUMENT',
      `Argument ${name} must be a non-empty string.`,
      `Pass ${name} as a non-empty string; see the tool description for its expected value.`,
    )
  }
  return value
}
