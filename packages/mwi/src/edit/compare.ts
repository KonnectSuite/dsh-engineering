/**
 * Compare saved declarations with the native rows an edit expects.
 *
 * The evidence names the exact fields that differ; it never repairs a mismatch.
 *
 * @module dsh-engineering-mwi/edit/compare
 */

/** The declaration fields a saved/native comparison covers. */
export const VARIABLE_FIELDS = ['name', 'type', 'section', 'group', 'address', 'initial_value', 'description'] as const

/** A comparison outcome the edit helpers accept. */
export interface VariableComparison {
  readonly accepted: boolean
  readonly evidence_kind: 'saved-declarations-only'
  readonly expected_count: number
  readonly saved_count: number
  readonly missing: string[]
  readonly unexpected: string[]
  readonly changed: { name: string; fields: string[]; expected: Record<string, null | string>; saved: Record<string, null | string> }[]
  readonly errors: string[]
}

/**
 * Compare expected and actual declaration rows by upper-cased name.
 *
 * @param expected - Declarations the edit expects after the mutation.
 * @param actual - Declarations read back from the saved project.
 * @returns The comparison with every difference named.
 */
export function compareVariables(expected: readonly Record<string, unknown>[], actual: readonly Record<string, unknown>[]): VariableComparison {
  const errors: string[] = []
  const index = (rows: readonly Record<string, unknown>[], label: string, strict: boolean): Map<string, Record<string, unknown>> => {
    if (!Array.isArray(rows)) throw new Error(`${label} declarations must be an array`)
    const result = new Map<string, Record<string, unknown>>()
    for (const row of rows) {
      if (typeof row?.name !== 'string' || row.name.trim() === '') throw new Error(`${label}: missing variable name`)
      if (strict && VARIABLE_FIELDS.some(field => !Object.hasOwn(row, field) || (row[field] !== null && typeof row[field] !== 'string'))) {
        throw new Error(`${label}: supply every declaration field for ${String(row.name)}, including explicit nulls`)
      }
      const key = row.name.toUpperCase()
      if (result.has(key)) errors.push(`${label}: duplicate variable ${String(row.name)}`)
      result.set(key, row)
    }
    return result
  }
  const wanted = index(expected, 'expected', true)
  const found = index(actual, 'saved', false)
  const missing: string[] = []
  const unexpected: string[] = []
  const changed: VariableComparison['changed'] = []
  for (const [key, row] of wanted) {
    const saved = found.get(key)
    if (saved === undefined) {
      missing.push(String(row.name))
      continue
    }
    const fields = VARIABLE_FIELDS.filter(field => (row[field] ?? null) !== (saved[field] ?? null))
    if (fields.length > 0) {
      changed.push({
        name: String(row.name),
        fields: [...fields],
        expected: Object.fromEntries(fields.map(field => [field, (row[field] ?? null) as null | string])),
        saved: Object.fromEntries(fields.map(field => [field, (saved[field] ?? null) as null | string])),
      })
    }
  }
  for (const [key, row] of found) if (!wanted.has(key)) unexpected.push(String(row.name))
  return {
    accepted: errors.length === 0 && missing.length === 0 && unexpected.length === 0 && changed.length === 0,
    evidence_kind: 'saved-declarations-only',
    expected_count: expected.length,
    saved_count: actual.length,
    missing,
    unexpected,
    changed,
    errors,
  }
}
