/**
 * Component skeleton — rename every placeholder before wiring this component.
 *
 * The file is deliberately dependency-free so it typechecks in place, before
 * the package has any node_modules. A real component replaces these local
 * types with the host's own imports (`@deepseek-ai/schemastery`, the tools
 * registry type from the host, the skill registry) and adds its tools under
 * `src/tools/`. Nothing here registers a tool with a live bundle.
 */

/** The entry name a copied component uses. RENAME: `engineering-<id>`. */
export const name = 'engineering-scaffold-example'

/** Services the entry asks the host for before `apply` runs. */
export const inject = ['tools'] as const

/** The probe tool every product row registers. RENAME: `<prefix>_capabilities`. */
export const PLACEHOLDER_TOOL = 'example_capabilities'

/** A tool definition shaped like the host's registry entry. */
export interface ToolDefinition {
  name: string
  description: string
  parameters: Record<string, unknown>
  handler: (args: Record<string, unknown>) => Promise<unknown> | unknown
}

/** The slice of the host context this skeleton needs. */
export interface PluginContext {
  tools: {
    register(definition: ToolDefinition): void
  }
}

/** Row switches the copied component exposes through its `Config` schema. */
export interface ScaffoldOptions {
  /** Tool-name prefix. RENAME: the component's namespace. */
  prefix?: string
  /** When true the entry mounts read tools only; the row still ships off. */
  readOnly?: boolean
}

/**
 * Mount the component. A real entry mounts each tool/skill part here:
 *
 * ```ts
 * export function apply(ctx: PluginContext, options: ScaffoldOptions): void {
 *   ctx.plugin(createReadTools(options))
 * }
 * ```
 *
 * The skeleton registers the probe directly so `tsc` proves the shape.
 */
export function apply(ctx: PluginContext, options: ScaffoldOptions = {}): void {
  const prefix = options.prefix ?? 'example'
  ctx.tools.register({
    name: `${prefix}_capabilities`,
    description: 'Describe what this component can read, and what it needs installed.',
    parameters: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    handler: () => ({
      ok: true,
      component: name,
      readOnly: options.readOnly ?? true,
      // Answer with measured facts only. A skeleton that guesses is worse than
      // no tool: return the install/measurement state and let the agent decide.
      evidence: 'skeleton — no capability has been measured yet',
    }),
  })
}
