/**
 * The tool and filesystem convention the ECAD row registers against.
 *
 * Declared locally, and structurally, so this package compiles without the host
 * packages at build time while matching what the Cordis tool registry and the
 * filesystem provider expose at runtime. Every tool answers with `summary`,
 * `data`, `next` and `coverage`; a failure carries `{ code, message, fix }` and
 * never escapes as a thrown value.
 *
 * @module dsh-engineering-ecad/core
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

/** How completely an answer covers the request. */
export interface Coverage {
  /** False when the answer was capped, truncated or approximated. */
  readonly complete: boolean
  /** What the answer could not establish. */
  readonly unverified: readonly string[]
}

/** One suggested follow-up call. */
export interface NextStep {
  readonly tool: string
  readonly args?: Readonly<Record<string, unknown>>
  readonly why: string
}

/** The success document every tool returns. */
export interface Success {
  readonly summary: string
  readonly data: unknown
  readonly next: readonly NextStep[]
  readonly coverage: Coverage
}

/** A failure the caller can usually repair. */
export class EngineeringError extends Error {
  /** Stable identifier for tests and logs. */
  readonly code: string
  /** The next call or check that unblocks the caller. */
  readonly fix: string
  /** Known names the caller probably meant. */
  readonly candidates: readonly string[]

  /**
   * @param code - stable failure class.
   * @param message - what failed, in the reader's terms.
   * @param fix - the next call or check.
   * @param candidates - names the caller probably meant.
   */
  constructor(code: string, message: string, fix: string, candidates: readonly string[] = []) {
    super(message)
    this.name = 'EngineeringError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

/** The failure document a tool returns. */
export interface ErrorEnvelope {
  readonly error: { readonly code: string; readonly message: string; readonly fix: string; readonly candidates: readonly string[] }
}

/**
 * Convert any thrown value into the error envelope.
 *
 * The engine throws its own `EcadError`, which already carries `code`, `message`
 * and `fix`; it is recognised structurally so the two packages do not need to
 * share a class.
 *
 * @param error - the thrown value.
 * @returns the envelope the tool returns.
 */
export function errorEnvelope(error: unknown): ErrorEnvelope {
  if (error instanceof EngineeringError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, candidates: error.candidates } }
  }
  if (error !== null && typeof error === 'object') {
    const typed = error as { code?: unknown; message?: unknown; fix?: unknown }
    if (typeof typed.code === 'string' && typeof typed.message === 'string') {
      return {
        error: {
          code: typed.code,
          message: typed.message,
          fix: typeof typed.fix === 'string' ? typed.fix : 'Re-run the call; if it fails the same way, report the drawing and the arguments used.',
          candidates: []
        }
      }
    }
  }
  return {
    error: {
      code: 'ECAD_INTERNAL',
      message: error instanceof Error ? error.message : String(error),
      fix: 'Retry the call; if it fails the same way, report the drawing name and the arguments used.',
      candidates: []
    }
  }
}

/** Build one success document. */
export function success(summary: string, data: unknown, next: readonly NextStep[] = [], coverage: Coverage = { complete: true, unverified: [] }): Success {
  return lossless({ summary, data, next, coverage })
}

/**
 * Drop the one value the host will not carry.
 *
 * Tool answers cross the host as lossless JSON, which refuses a document that
 * holds `undefined` anywhere — the whole call fails, not just the field. An
 * optional member that has nothing to say is therefore removed rather than
 * present and empty.
 *
 * @param value - the document about to be returned.
 * @returns the same document, with `undefined` members removed and array holes replaced by `null`.
 */
export function lossless<T>(value: T): T {
  if (Array.isArray(value)) return value.map(entry => lossless(entry ?? null)) as T
  if (value !== null && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value) as unknown
    if (prototype === Object.prototype || prototype === null) {
      const copy: Record<string, unknown> = {}
      for (const [key, entry] of Object.entries(value)) if (entry !== undefined) copy[key] = lossless(entry)
      return copy as T
    }
  }
  return value
}

/** One JSON Schema property, always described. */
export interface ParameterSchema {
  readonly type: 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object'
  readonly description: string
  readonly enum?: readonly string[]
  readonly items?: ParameterSchema
  readonly default?: unknown
  readonly minimum?: number
  readonly maximum?: number
  readonly minItems?: number
  readonly maxItems?: number
  readonly properties?: Readonly<Record<string, ParameterSchema>>
  readonly required?: readonly string[]
  readonly additionalProperties?: boolean
}

/** A described string parameter. */
export function string(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, ...extra }
}

/** A described integer parameter with an optional range. */
export function integer(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'integer', description, ...extra }
}

/** A described number parameter. */
export function number(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'number', description, ...extra }
}

/** A described boolean parameter. */
export function boolean(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'boolean', description, ...extra }
}

/** A described enum parameter. */
export function choice(description: string, values: readonly string[], extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, enum: values, ...extra }
}

/** An array of one parameter type. */
export function list(description: string, items: ParameterSchema, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'array', description, items, ...extra }
}

/** One object element of an array parameter. */
export function objectItem(description: string, properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = [], open = false): ParameterSchema {
  return { type: 'object', description, properties, required, additionalProperties: open }
}

/** The `parameters` object of one tool. */
export interface Parameters {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, ParameterSchema>>
  readonly required: readonly string[]
  readonly additionalProperties: false
}

/**
 * Build a parameter object.
 *
 * @param properties - named parameters, each already described.
 * @param required - names the caller must supply.
 * @returns the schema a tool definition declares.
 */
export function object(properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): Parameters {
  return { type: 'object', properties, required, additionalProperties: false }
}

/** One direct child of a directory. */
export interface DirEntry {
  readonly name: string
  readonly type: string
  /** Resolved child target when the provider reports it. */
  readonly target?: FsTarget
  readonly size?: number
}

/** A path resolved by the harness filesystem into its backend identity. */
export interface FsTarget {
  /** Opaque key for stale guards and target lookup. */
  readonly targetKey: unknown
  /** Path for model- and UI-facing output. */
  readonly displayPath: string
}

/** Where a write is allowed to run: the per-call mode and workspace root. */
export type SandboxPolicy = unknown

/** A write guard: create a missing file, or replace a file at a known version. */
export type FsWriteIntent = { readonly kind: 'createIfAbsent' } | { readonly kind: 'replaceIfVersion'; readonly version: unknown }

/** Metadata about one target. */
export interface FsInfo {
  readonly type: string
  readonly size?: number
}

/** The filesystem operations this package uses, addressed by resolved targets. */
export interface FsService {
  resolve(path: string, options?: { readonly cwd?: string; readonly signal?: AbortSignal }): Promise<FsTarget>
  stat(target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined>
  readBytes(target: FsTarget, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  listDir?(target: FsTarget, signal?: AbortSignal): Promise<readonly DirEntry[]>
  writeText?(target: FsTarget, text: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
  writeBytes?(target: FsTarget, bytes: Uint8Array, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
  deleteFile?(target: FsTarget, expected?: { readonly version: unknown }, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
}

/** The filesystem as the harness may provide it: some hosts and test doubles resolve to a string. */
export interface RawFsService {
  resolve(path: string, options?: { readonly cwd?: string; readonly signal?: AbortSignal }): Promise<FsTarget | string>
  stat(target: FsTarget | string, signal?: AbortSignal): Promise<FsInfo | undefined>
  readBytes(target: FsTarget | string, signal: AbortSignal | undefined, maxBytes: number): Promise<Uint8Array>
  listDir?(target: FsTarget | string, signal?: AbortSignal): Promise<readonly DirEntry[]>
  writeText?(target: FsTarget | string, text: string, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
  writeBytes?(target: FsTarget | string, bytes: Uint8Array, expected?: FsWriteIntent, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
  deleteFile?(target: FsTarget | string, expected?: { readonly version: unknown }, signal?: AbortSignal, sandboxPolicy?: SandboxPolicy): Promise<unknown>
}

/**
 * Refuse a binary write the host policy does not allow.
 *
 * The shipped host filesystem service exposes no byte writer, so a drawing is
 * published with the local writer. That must not weaken the promises the text
 * path keeps: a read-only session refuses, and the destination has to sit inside
 * the writable workspace the policy names.
 *
 * @param displayPath - destination the write would use.
 * @param sandboxPolicy - the session policy, when the host supplies one.
 */
function assertBinaryWriteAllowed(displayPath: string, sandboxPolicy: SandboxPolicy): void {
  if (sandboxPolicy === null || typeof sandboxPolicy !== 'object') return
  const policy = sandboxPolicy as { readonly mode?: unknown; readonly workspaceRoot?: unknown; readonly additionalWritableRoots?: unknown }
  if (policy.mode === 'read-only') {
    throw new EngineeringError(
      'ECAD_WRITE_REFUSED',
      `The session is read-only, so ${displayPath} was not written.`,
      'Switch the session to Workspace Write (or use a row that enables writes) and retry; nothing was written.',
    )
  }
  const roots: string[] = []
  if (typeof policy.workspaceRoot === 'string') roots.push(policy.workspaceRoot)
  if (Array.isArray(policy.additionalWritableRoots)) {
    for (const root of policy.additionalWritableRoots) if (typeof root === 'string') roots.push(root)
  }
  if (roots.length === 0) return
  const target = resolve(displayPath)
  const inside = roots.some((root) => {
    const rel = relative(resolve(root), target)
    return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  })
  if (!inside) {
    throw new EngineeringError(
      'ECAD_WRITE_REFUSED',
      `${displayPath} is outside the writable workspace, so it was not written.`,
      'Choose a destination inside the session workspace, then retry; nothing was written.',
    )
  }
}

/**
 * Normalise a filesystem that may resolve to a string into one that always
 * resolves to a target, so path composition and cache keys are the same shape in
 * a host and in a test.
 *
 * @param service - the filesystem the composition provides.
 * @returns the same operations addressed by {@link FsTarget}.
 */
export function asFsService(service: RawFsService): FsService {
  const targetOf = async (value: FsTarget | string): Promise<FsTarget> =>
    typeof value === 'string' ? { targetKey: value, displayPath: value } : { targetKey: value.targetKey, displayPath: value.displayPath }
  const fs: FsService = {
    async resolve(path, options) {
      return await targetOf(await service.resolve(path, options))
    },
    async stat(target, signal) {
      return await service.stat(target, signal)
    },
    async readBytes(target, signal, maxBytes) {
      return await service.readBytes(target, signal, maxBytes)
    }
  }
  if (service.listDir !== undefined) {
    fs.listDir = async (target, signal) => {
      const entries = await service.listDir!(target, signal)
      return entries.map(entry => (entry.target === undefined ? entry : { ...entry, target: { targetKey: entry.target.targetKey, displayPath: entry.target.displayPath } }))
    }
  }
  if (service.writeText !== undefined) {
    fs.writeText = async (target, text, expected, signal, sandboxPolicy) => await service.writeText!(target, text, expected, signal, sandboxPolicy)
  }
  if (service.writeBytes !== undefined) {
    fs.writeBytes = async (target, bytes, expected, signal, sandboxPolicy) => await service.writeBytes!(target, bytes, expected, signal, sandboxPolicy)
  } else {
    // The shipped host filesystem service writes UTF-8 text only. A drawing is
    // bytes, so the local writer publishes it after the same promises are kept:
    // a read-only session refuses, and the destination must sit inside the
    // session workspace (or an additional writable root the policy names).
    fs.writeBytes = async (target, bytes, expected, signal, sandboxPolicy) => {
      signal?.throwIfAborted()
      assertBinaryWriteAllowed(target.displayPath, sandboxPolicy)
      await mkdir(dirname(target.displayPath), { recursive: true })
      await writeFile(target.displayPath, bytes, expected?.kind === 'createIfAbsent' ? { flag: 'wx' } : undefined)
    }
  }
  if (service.deleteFile !== undefined) {
    fs.deleteFile = async (target, expected, signal, sandboxPolicy) => await service.deleteFile!(target, expected, signal, sandboxPolicy)
  }
  return fs
}

/**
 * Resolve one path through a filesystem without reading it.
 *
 * @param fs - the filesystem.
 * @param path - caller-supplied path.
 * @param cwd - workspace root.
 * @param signal - cancellation.
 * @returns the resolved target.
 */
export async function resolveTarget(fs: FsService, path: string, cwd: string | undefined, signal: AbortSignal | undefined): Promise<FsTarget> {
  return await fs.resolve(path, { ...(cwd === undefined ? {} : { cwd }), ...(signal === undefined ? {} : { signal }) })
}

/** The tool registry the plugin registers into. */
export interface ToolRegistry {
  register(definition: ToolDefinition): unknown
}

/** The host's per-session sandbox policy service. */
export interface SandboxPolicyResolver {
  resolve(options: { readonly session?: unknown }): unknown
}

/** One content block the transcript renders. */
export interface TextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The output declaration every registered tool carries. */
export interface ToolOutput {
  readonly schema: { readonly type: 'object'; readonly additionalProperties: boolean }
  render(args: unknown, value: unknown): readonly TextBlock[]
}

/** The execution context a tool body receives. */
export interface ExecContext {
  /** Cancellation for this call. */
  readonly signal?: AbortSignal
  /** Workspace root of the calling session. */
  readonly cwd?: string
  /** The calling chat; handles belong to it. */
  readonly chat?: object
  /** The calling agent; its session carries the sandbox policy of this call. */
  readonly agent?: unknown
}

/** One registered tool. */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  readonly output: ToolOutput
  execute(args: Readonly<Record<string, unknown>>, exec: ExecContext): Promise<unknown>
}

/** One tool body before the shared envelope and error handling are attached. */
export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  run(args: Readonly<Record<string, unknown>>, exec: ExecContext): Promise<unknown>
}

/** Render one tool answer as pretty JSON. */
function jsonText(_args: unknown, value: unknown): readonly TextBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, undefined, 2) }]
}

/**
 * Wrap one tool body in the shared envelope and error handling.
 *
 * @param spec - tool identity and body.
 * @returns the definition the registry accepts.
 */
export function tool(spec: ToolSpec): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      try {
        return await spec.run(args, exec)
      } catch (error) {
        return errorEnvelope(error)
      }
    }
  }
}

/** A required string argument. */
export function requiredString(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new EngineeringError('INVALID_ARGUMENT', `${name} is required and must be a non-empty string.`, `Pass ${name}, for example "${name}".`)
  }
  return value
}

/** An optional string argument. */
export function optionalString(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** An optional integer argument. */
export function optionalInteger(args: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = args[name]
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/** An optional finite number argument. */
export function optionalNumber(args: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = args[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** An optional boolean argument. */
export function optionalBoolean(args: Readonly<Record<string, unknown>>, name: string, fallback = false): boolean {
  const value = args[name]
  return typeof value === 'boolean' ? value : fallback
}

/** An optional array of non-empty strings. */
export function optionalStringList(args: Readonly<Record<string, unknown>>, name: string): string[] | undefined {
  const value = args[name]
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '')
  return strings.length > 0 ? strings : undefined
}

/** An optional array of objects, for staged operations. */
export function optionalObjectList(args: Readonly<Record<string, unknown>>, name: string): Array<Record<string, unknown>> | undefined {
  const value = args[name]
  if (!Array.isArray(value)) return undefined
  const objects = value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object' && !Array.isArray(entry))
  return objects
}

/** The plugin context this package registers against. */
export interface PluginContext {
  readonly tools: ToolRegistry
  readonly fs: RawFsService
  /** Read a service another entry in the same composition provided. */
  get?(name: string): unknown
  /** Provide a service other entries can consume. */
  provide?(name: string, value: unknown): void
  /** Register a disposer that runs when this plugin is unmounted. */
  effect?(callback: () => unknown, label?: string): unknown
  /** Optional logger for conditions that must not stop a mount. */
  logger?: { warn?(message: string): void }
  /** Mount a sub-plugin. */
  plugin?(plugin: unknown): unknown
}
