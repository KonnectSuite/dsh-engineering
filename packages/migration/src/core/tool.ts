/**
 * The tool and filesystem surfaces this package registers against.
 *
 * Declared locally, and structurally, so the package compiles without the host
 * packages at build time while still matching what the Cordis registry and the
 * filesystem provider expose at runtime.
 *
 * @module dsh-engineering-migration/core/tool
 */

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
  readonly sessionId?: string
}

/** A registered tool. */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Readonly<Record<string, unknown>>
  readonly output: ToolOutput
  execute(args: Readonly<Record<string, unknown>>, exec: ToolExec): Promise<unknown>
}

/** The registry service. */
export interface ToolRegistry {
  register(definition: ToolDefinition): unknown
}

/** A path resolved by the filesystem provider into its backend identity. */
export interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  readonly targetKey: unknown
  /** Path for model- and UI-facing output. */
  readonly displayPath: string
}

/** The filesystem service operations this package uses. */
export interface FsService {
  resolve(path: string, options?: { readonly signal?: AbortSignal; readonly cwd?: string }): Promise<FsTarget>
  stat(target: FsTarget, signal?: AbortSignal): Promise<{ readonly type: string } | undefined>
  readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes?: number): Promise<Uint8Array>
  /** Write one UTF-8 text file; the provider creates missing parents. */
  writeText(target: FsTarget, text: string, signal?: AbortSignal): Promise<void>
}

/** The services a composition must provide before this plugin loads. */
export interface PluginContext {
  readonly tools: ToolRegistry
  readonly fs: FsService
  readonly logger?: { warn(message: string): void }
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
