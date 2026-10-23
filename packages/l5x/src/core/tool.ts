/**
 * The tool and service surfaces this package registers against.
 *
 * Declared locally, and structurally, so the package compiles without the host
 * packages at build time while still matching what the Cordis registry and the
 * filesystem provider expose at runtime.
 *
 * @module dsh-engineering-l5x/core/tool
 */

import type { Parameters } from './params.ts'

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
  readonly agent?: { readonly session?: { readonly header?: { readonly cwd?: string } } }
}

/** The context a tool body receives: cancellation, workspace, and chat identity. */
export interface ExecContext {
  readonly signal?: AbortSignal
  readonly cwd?: string
  /** The calling chat; handles are scoped to it. */
  readonly chat?: object
}

/** A registered tool. */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  readonly output: ToolOutput
  execute(args: Readonly<Record<string, unknown>>, exec: ToolExec): Promise<unknown>
}

/** The registry service. */
export interface ToolRegistry {
  register(definition: ToolDefinition): unknown
}

/** The filesystem service operations this package uses. */
export interface FsService {
  resolve(path: string, options?: { readonly signal?: AbortSignal; readonly cwd?: string }): Promise<string>
  stat(path: string, signal?: AbortSignal): Promise<{ readonly type: string } | undefined>
  readBytes(path: string, signal: AbortSignal | undefined, maxBytes?: number): Promise<Uint8Array>
  writeText?(path: string, text: string, options?: { readonly kind?: 'createIfAbsent' }, signal?: AbortSignal): Promise<void>
}

/** The services a composition must provide before this plugin loads. */
export interface PluginContext {
  readonly tools: ToolRegistry
  readonly fs: FsService
  readonly logger?: { warn(message: string): void }
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
