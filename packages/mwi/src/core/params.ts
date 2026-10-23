/**
 * Parameter schemas that always describe themselves.
 *
 * MWI's legacy surface had inconsistent parameter descriptions; these helpers
 * make an undescribed parameter impossible to write, as in the other products.
 *
 * @module dsh-engineering-mwi/core/params
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

/** A boolean parameter. */
export function boolean(description: string, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'boolean', description, ...extra }
}

/** A string parameter restricted to a known set. */
export function choice(description: string, values: readonly string[], extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'string', description, enum: values, ...extra }
}

/** An array of one parameter type. */
export function list(description: string, items: ParameterSchema, extra: Partial<ParameterSchema> = {}): ParameterSchema {
  return { type: 'array', description, items, ...extra }
}

/** A fixed-property object parameter. */
export function record(description: string, properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): ParameterSchema {
  return { type: 'object', description, properties, required, additionalProperties: false }
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
 * @param properties - Named parameters, each carrying its description.
 * @param required - Names the caller must pass.
 * @returns The open-object parameter schema.
 */
export function object(properties: Readonly<Record<string, ParameterSchema>>, required: readonly string[] = []): Parameters {
  return { type: 'object', properties, required, additionalProperties: false }
}
