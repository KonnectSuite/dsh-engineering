/**
 * The host surfaces these tools compile against, declared locally so the
 * package builds without the host packages.
 *
 * A component is mounted by an entry, and the entry passes the host's `fs`,
 * `tools` and `skills` services in. The method shapes below mirror what the
 * host returns: `fs.resolve` yields an `FsTarget`, not a string.
 *
 * @module dsh-engineering-slc/core/tool
 */

/** One text block a tool renders. */
export interface TextBlock {
  type: 'text'
  text: string
}

/** The declared output of a tool: a JSON schema and the renderer. */
export interface ToolOutput {
  schema: { type: 'object'; additionalProperties: boolean }
  render(args: Readonly<Record<string, unknown>>, value: unknown): readonly TextBlock[]
}

/** Per-call execution context supplied by the host. */
export interface ToolExec {
  signal?: unknown
  cwd?: string
  sessionId?: string
  agent?: unknown
}

/** The sandbox policy resolver the host may expose as a service. */
export interface SandboxPolicyResolver {
  resolve(options: { session?: unknown }): unknown
}

/** A tool definition the host registry accepts. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Readonly<Record<string, unknown>>
  output: ToolOutput
  execute(args: Readonly<Record<string, unknown>>, exec: ToolExec): Promise<unknown>
}

/** The tool registry surface a plugin registers on. */
export interface ToolRegistry {
  register(definition: ToolDefinition): unknown
}

/** A resolved filesystem target. */
export interface FsTarget {
  targetKey: string
  displayPath: string
}

/** One directory entry. */
export interface FsEntry {
  name: string
  type: string
}

/** The filesystem service from the composition. */
export interface FsService {
  resolve(path: string, options?: { signal?: unknown; cwd?: string }): Promise<FsTarget>
  stat(target: FsTarget, signal?: unknown): Promise<{ type: string } | undefined>
  readBytes(target: FsTarget, signal?: unknown, maxBytes?: number): Promise<Uint8Array>
  list?(target: FsTarget, signal?: unknown): Promise<readonly FsEntry[]>
  writeText?(
    target: FsTarget,
    text: string,
    options?: { kind?: 'createIfAbsent' | 'overwrite' },
    signal?: unknown,
    sandboxPolicy?: unknown,
  ): Promise<void>
}

/** The plugin context a row receives. */
export interface PluginContext {
  tools: ToolRegistry
  fs: FsService
  logger?: { warn(message: string): void }
  get?(name: string): unknown
}

/** Render a JSON value as the single text block of an answer. */
export function jsonText(_args: Readonly<Record<string, unknown>>, value: unknown): readonly TextBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, undefined, 2) }]
}
