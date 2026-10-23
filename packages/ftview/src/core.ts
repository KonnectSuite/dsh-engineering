/**
 * Shared result, error and parameter conventions for the engineering bundle.
 *
 * Every tool answers with `summary`, `data`, `next` and `coverage`, and every
 * parameter is described at the point of declaration. Failures carry a stable
 * code, a message in the reader's terms, and the fix that unblocks the caller.
 *
 * @module dsh-engineering-ftview/core
 */

/** How completely an answer covers the request. */
export interface Coverage {
  readonly complete: boolean
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
  readonly code: string
  readonly fix: string
  readonly candidates: readonly string[]

  /**
   * @param code - Stable identifier for tests and logs.
   * @param message - What failed, in the reader's terms.
   * @param fix - The next call or check.
   * @param candidates - Known names the caller probably meant.
   */
  constructor(code: string, message: string, fix: string, candidates: readonly string[] = []) {
    super(message)
    this.name = 'EngineeringError'
    this.code = code
    this.fix = fix
    this.candidates = candidates
  }
}

/**
 * Convert any thrown value into the error envelope.
 *
 * @param error - The thrown value.
 * @returns The envelope the tool registry reports.
 */
export function errorEnvelope(error: unknown): { error: { code: string; message: string; fix: string; candidates: readonly string[] } } {
  if (error instanceof EngineeringError) {
    return { error: { code: error.code, message: error.message, fix: error.fix, candidates: error.candidates } }
  }
  return {
    error: {
      code: 'INTERNAL',
      message: error instanceof Error ? error.message : String(error),
      fix: 'Retry the call; if it fails the same way, report the message and the arguments used.',
      candidates: [],
    },
  }
}

/** Build one success document. */
export function success(summary: string, data: unknown, next: readonly NextStep[], coverage: Coverage): Success {
  return { summary, data, next, coverage }
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

/** A described enum parameter. */
export function choice(description: string, values: readonly string[], extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, enum: values, ...extra }
}

/** One object element of an array parameter. */
export function objectItem(description: string, properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): ParameterSchema {
  return { type: 'object', description, properties, required, additionalProperties: false }
}

/** An array of one parameter type. */
export function list(description: string, items: ParameterSchema, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'array', description, items, ...extra }
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
 * @param properties - Named parameters, each already described.
 * @param required - Names the caller must supply.
 * @returns The schema a tool definition declares.
 */
export function object(properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): Parameters {
  return { type: 'object', properties, required, additionalProperties: false }
}

/** One directory entry the filesystem provider reports. */
export interface DirEntry {
  readonly name: string
  readonly type: string
}

/** The filesystem operations this package uses. */
export interface FsService {
  resolve(path: string, options?: { readonly signal?: AbortSignal; readonly cwd?: string }): Promise<string>
  stat(path: string, signal?: AbortSignal): Promise<{ readonly type: string } | undefined>
  readBytes(path: string, signal: AbortSignal | undefined, maxBytes?: number): Promise<Uint8Array>
  listDir?(path: string, signal?: AbortSignal): Promise<readonly DirEntry[]>
  writeText?(path: string, text: string, options?: { readonly kind?: 'createIfAbsent' | 'overwrite' }, signal?: AbortSignal): Promise<void>
}

/** The tool registry the plugin registers into. */
export interface ToolRegistry {
  register(definition: ToolDefinition): void
}

/** The services a composition must provide before this plugin loads. */
export interface PluginContext {
  readonly tools: ToolRegistry
  readonly fs: FsService
  provide?(name: string, value: unknown): void
  get?(name: string): unknown
}

/** The context a tool body receives. */
export interface ExecContext {
  readonly signal?: AbortSignal
  readonly cwd?: string
  readonly chat?: object
}

/** One text block the transcript renders. */
export interface TextBlock {
  readonly type: 'text'
  readonly text: string
}

/** The output declaration every registered tool carries. */
export interface ToolOutput {
  readonly schema: { readonly type: 'object'; readonly additionalProperties: boolean }
  render(args: unknown, value: unknown): readonly TextBlock[]
}

/** Render one tool answer as JSON text for the transcript. */
function jsonText(_args: unknown, value: unknown): readonly TextBlock[] {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }]
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

/**
 * Wrap one tool body in the shared envelope and error handling.
 *
 * @param spec - Tool identity and body.
 * @returns The definition the registry accepts.
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
    },
  }
}

/** A required string argument. */
export function requiredString(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = args[name]
  if (typeof value !== 'string' || value === '') {
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
