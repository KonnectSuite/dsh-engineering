/**
 * Parameter schemas that always describe themselves.
 *
 * The port's first measured failure was 132 parameters with no description.
 * These helpers make an undescribed parameter impossible to write: the
 * description is a required argument, not an optional field.
 *
 * @module dsh-engineering-l5x/core/params
 */

/** One JSON Schema property, with the description that is mandatory here. */
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

/** A string parameter. */
export function string(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, ...extra }
}

/** An integer parameter with an optional range. */
export function integer(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'integer', description, ...extra }
}

/** A string parameter restricted to a known set. */
export function choice(description: string, values: readonly string[], extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, enum: values, ...extra }
}

/** An array of one parameter type. */
export function list(description: string, items: ParameterSchema, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'array', description, items, ...extra }
}

/** One object element of an array parameter. */
export function objectItem(description: string, properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): ParameterSchema {
  return { type: 'object', description, properties, required, additionalProperties: false }
}

/** The `parameters` object of one tool. */
export interface Parameters {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, ParameterSchema>>
  readonly required: readonly string[]
  readonly additionalProperties: false
}

/**
 * Build a tool's parameter object.
 *
 * @param properties - Named parameters, every one already described.
 * @param required - Names the caller must supply.
 * @returns The schema object a tool definition declares.
 */
export function object(properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): Parameters {
  return { type: 'object', properties, required, additionalProperties: false }
}
