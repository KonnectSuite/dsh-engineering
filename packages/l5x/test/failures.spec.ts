/**
 * Failure handling: a refusal is repairable, and an `INTERNAL` code is a defect.
 *
 * The plugin's own contract says `INTERNAL` means the tool is broken. Probing malformed input
 * found two specs that produced exactly that — an empty composition node and a non-string
 * mnemonic — which read to the model as "the plugin is broken" rather than "fix the argument".
 * This holds the whole class: bad bytes, bad arguments, and a target that does not exist.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

const encoder = new TextEncoder()

/** Every case must answer with a code that is not INTERNAL. */
const REPAIRABLE = new Set([
  'INVALID_L5X', 'FILE_NOT_FOUND', 'INVALID_ARGUMENT', 'INVALID_LADDER_SPEC',
  'COMPONENT_NOT_FOUND', 'AMBIGUOUS_TARGET', 'ROUTINE_NOT_FOUND',
])

/** Open one export and return the harness. */
async function opened(options: { editing?: boolean } = {}) {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), options)
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('an export that cannot be used', () => {
  const cases: readonly (readonly [string, Map<string, Uint8Array>])[] = [
    ['empty', new Map([['x.l5x', encoder.encode('')]])],
    ['not L5X', new Map([['x.l5x', encoder.encode('<?xml version="1.0"?><foo/>')]])],
    ['truncated', new Map([['x.l5x', encoder.encode(new TextDecoder().decode(fixtureBytes()).slice(0, 300))]])],
    ['unclosed', new Map([['x.l5x', encoder.encode('<?xml version="1.0"?><RSLogix5000Content><Controller Name="X">')]])],
  ]

  for (const [label, files] of cases) {
    it(`refuses a ${label} source as invalid L5X, not as a defect`, async () => {
      const result = await harness(files).call('open_project', { path: 'x.l5x' })
      expect(result.error?.code).toBe('INVALID_L5X')
      expect(result.error?.fix.length).toBeGreaterThan(10)
    })
  }

  it('refuses a missing path as not found', async () => {
    const result = await harness(new Map()).call('open_project', { path: 'nope.l5x' })
    expect(result.error?.code).toBe('FILE_NOT_FOUND')
  })
})

describe('a composition spec', () => {
  const cases: readonly (readonly [string, string])[] = [
    ['not JSON', 'this is not json'],
    ['an empty object', '{}'],
    ['a numeric mnemonic', '{"series":[{"instr":5}]}'],
    ['a non-string operand', '{"series":[{"instr":"XIC","args":[5]}]}'],
    ['a numeric node', '{"series":[5]}'],
  ]

  for (const [label, spec] of cases) {
    it(`refuses ${label} as an invalid spec, not as a defect`, async () => {
      const l5x = await opened({ editing: true })
      const result = await l5x.call('compose_rung', { spec_json: spec })
      expect(result.error).toBeDefined()
      expect(result.error?.code).not.toBe('INTERNAL')
      expect(REPAIRABLE.has(result.error?.code ?? '')).toBe(true)
    })
  }
})

describe('a target that is not there', () => {
  it('says the routine is absent rather than calling it ambiguous', async () => {
    const l5x = await opened({ editing: true })
    const staged = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'NoSuchRoutine', rung: 0, mode: 'insert',
      text: 'XIC(StartPB)OTE(SystemRunning);',
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(validated.error?.message).toContain('NoSuchRoutine')
  })
})
