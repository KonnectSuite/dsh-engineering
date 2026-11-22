/**
 * Shared tool scaffolding: the envelope, the failure translation, and the
 * argument readers every tool uses.
 *
 * @module dsh-engineering-l5x/tools/common
 */

import { L5xError, errorEnvelope } from '../core/errors.ts'
import { object, string, type Parameters } from '../core/params.ts'
import { jsonText, type ExecContext, type ToolDefinition } from '../core/tool.ts'

/** What this surface cannot establish, stated once. */
export const COVERAGE = {
  complete: false,
  unverified: [
    'FBD and SFC execution semantics',
    'dynamic indices',
    'runtime behavior',
    'external HMI, produced/consumed and driver consumers are not visible',
    'whether online logic matches the export',
  ],
} as const

/** The handle every read can omit when one project is open. */
export const PROJECT_ID = string(
  'Handle returned by l5x_open_project. Omit when exactly one project is open in this chat.',
  {},
)

/** One tool body, before the shared envelope and error handling are attached. */
export interface ToolSpec {
  readonly name: string
  readonly description: string
  readonly parameters: Parameters
  run(args: Readonly<Record<string, unknown>>, exec: ExecContext): Promise<unknown>
}

/**
 * Attach the canonical output declaration and the failure envelope.
 *
 * @param spec - Tool name, description, parameters and body.
 * @returns A registerable tool definition.
 */
export function tool(spec: ToolSpec): ToolDefinition {
  return {
    name: spec.name,
    description: spec.description,
    parameters: spec.parameters,
    output: { schema: { type: 'object', additionalProperties: true }, render: jsonText },
    async execute(args, exec) {
      const context: ExecContext = {
        ...(exec.signal === undefined ? {} : { signal: exec.signal }),
        ...(exec.agent?.session?.header?.cwd === undefined ? {} : { cwd: exec.agent.session.header.cwd }),
        ...(exec.agent?.session === undefined ? {} : { chat: exec.agent.session }),
        ...(exec.callId === undefined ? {} : { callId: exec.callId }),
        ...(exec.sessionId === undefined ? {} : { sessionId: exec.sessionId }),
        ...(exec.agent === undefined ? {} : { agent: exec.agent }),
      }
      try {
        return await spec.run(args, context)
      } catch (error) {
        return errorEnvelope(error)
      }
    },
  }
}

/** Whole-number argument with a default. */
export function integerArg(args: Readonly<Record<string, unknown>>, name: string, fallback: number): number {
  const value = args[name]
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback
}

/** A required string argument. */
export function requiredString(args: Readonly<Record<string, unknown>>, name: string): string {
  const value = optionalString(args, name)
  if (value === undefined) {
    throw new L5xError('INVALID_ARGUMENT', `${name} is required.`, `Pass ${name} as a non-empty string.`)
  }
  return value
}

/** A string argument, or undefined when absent or empty. */
export function optionalString(args: Readonly<Record<string, unknown>>, name: string): string | undefined {
  const value = args[name]
  return typeof value === 'string' && value !== '' ? value : undefined
}

/** An integer argument, or undefined when absent or not an integer. */
export function optionalInteger(args: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = args[name]
  return typeof value === 'number' && Number.isInteger(value) ? value : undefined
}

/** A number argument, or undefined when absent or not a finite number. */
export function optionalNumber(args: Readonly<Record<string, unknown>>, name: string): number | undefined {
  const value = args[name]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/** The parameters object for a tool that takes no arguments but the project handle. */
export function projectOnly(): Parameters {
  return object({ project_id: PROJECT_ID }, [])
}
