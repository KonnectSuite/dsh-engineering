/**
 * Evaluate the small expression language FactoryTalk View uses for animations.
 *
 * Animations are comparisons over tag references, for example
 * `{Current_Screen} = 6` or `{LineSpeed} > 100`. The evaluator covers tag
 * references, numeric and string literals, the six comparisons and `AND`/`OR`.
 * When a referenced tag has no value the result is `undefined`: the renderer
 * then leaves the object in its base state instead of guessing.
 *
 * @module dsh-engineering-ftview-viewer/expression
 */

/** Values a preview may know for a tag. */
export type TagValues = Readonly<Record<string, number | string | boolean>>

const COMPARISON = /^\s*(.+?)\s*(<=|>=|<>|!=|=|<|>)\s*(.+?)\s*$/u

/** One operand: a tag reference, a quoted string or a number. */
function operand(text: string, values: TagValues): { known: boolean; value: string | number } | undefined {
  const trimmed = text.trim()
  const tag = /^\{([^}]+)\}$/u.exec(trimmed)
  if (tag !== null) {
    const value = values[(tag[1] ?? '').trim()]
    return value === undefined ? { known: false, value: 0 } : { known: true, value: typeof value === 'boolean' ? Number(value) : value }
  }
  const quoted = /^['"](.*)['"]$/u.exec(trimmed)
  if (quoted !== null) return { known: true, value: quoted[1] ?? '' }
  const number = Number(trimmed)
  if (Number.isFinite(number)) return { known: true, value: number }
  return undefined
}

/** Compare two known operands. */
function compare(left: string | number, operator: string, right: string | number): boolean {
  const bothNumeric = typeof left === 'number' && typeof right === 'number'
  const a = bothNumeric ? left as number : String(left)
  const b = bothNumeric ? right as number : String(right)
  switch (operator) {
    case '=': return a === b
    case '<>':
    case '!=': return a !== b
    case '<': return a < b
    case '>': return a > b
    case '<=': return a <= b
    case '>=': return a >= b
    default: return false
  }
}

/** One comparison, or `undefined` when a tag is unknown. */
function clause(text: string, values: TagValues): boolean | undefined {
  const match = COMPARISON.exec(text)
  if (match === null) return undefined
  const left = operand(match[1] ?? '', values)
  const right = operand(match[3] ?? '', values)
  if (left === undefined || right === undefined || !left.known || !right.known) return undefined
  return compare(left.value, match[2] ?? '=', right.value)
}

/**
 * Evaluate one animation expression.
 *
 * @param expression - The expression text from the export.
 * @param values - Known tag values.
 * @returns True or false when every operand is known, otherwise undefined.
 */
export function evaluate(expression: string, values: TagValues): boolean | undefined {
  const text = expression.trim()
  if (text === '') return undefined
  const parts = text.split(/\s+(AND|OR)\s+/iu)
  if (parts.length === 1) return clause(text, values)
  const results: (boolean | undefined)[] = []
  const operators: string[] = []
  for (const part of parts) {
    if (/^(AND|OR)$/iu.test(part)) operators.push(part.toUpperCase())
    else results.push(clause(part, values))
  }
  if (results.some(result => result === undefined)) return undefined
  return operators.reduce((combined, operator, index) => {
    const next = results[index + 1] ?? false
    return operator === 'AND' ? combined && next : combined || next
  }, results[0] ?? false)
}

/** Every tag name an expression references. */
export function referencesOf(expression: string): readonly string[] {
  return [...expression.matchAll(/\{([^}]+)\}/gu)].map(match => (match[1] ?? '').trim()).filter(name => name !== '')
}
