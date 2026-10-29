import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness, type Harness } from './harness.ts'

/** Open the fixture in a fresh chat and return the harness. */
async function opened(): Promise<Harness> {
  const files = new Map<string, Uint8Array>([['sample.l5x', fixtureBytes()]])
  const l5x = harness(files, { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('draft accumulation', () => {
  it('appends one operation per call and returns a stable draft handle', async () => {
    const l5x = await opened()
    const first = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    expect(first.error).toBeUndefined()
    const id = first.data?.draft_id
    expect(id).toBeTypeOf('string')
    expect(first.data?.operation_count).toBe(1)
    const second = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(Start)OTE(Run);',
    })
    expect(second.error).toBeUndefined()
    expect(second.data?.draft_id).toBe(id)
    expect(second.data?.operation_count).toBe(2)
  })

  it('refuses a rung operation without its required arguments', async () => {
    const l5x = await opened()
    const missing = await l5x.call('draft_rung', { program: 'MainProgram', routine: 'MainRoutine', mode: 'delete' })
    expect(missing.error?.code).toBe('INVALID_ARGUMENT')
    expect(missing.error?.fix).toContain('rung number')
  })

  it('accepts a scalar tag with no initial value', async () => {
    // Studio gives every scalar a typed default (0 / FALSE). Requiring `value`
    // rejected the ordinary "declare a REAL" operation in a live session.
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'hmi_StagedThickness', data_type: 'REAL', description: 'Staged thickness (in)' })
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
    expect(validated.data?.operation_count).toBe(1)
  })
})

describe('validate and apply', () => {
  it('validates the accumulated draft and returns its hash and review data', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const id = appended.data?.draft_id
    const validated = await l5x.call('draft_validate', { draft_id: id })
    expect(validated.error).toBeUndefined()
    expect(validated.data?.operation_count).toBe(1)
    expect(validated.data?.draft_sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(validated.data?.validation).toBeTypeOf('object')
    expect(validated.summary).toContain('prepared')
  })

  it('writes one new file, never the source, and clears the draft', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const id = appended.data?.draft_id
    const applied = await l5x.call('draft_apply', { draft_id: id, output_path: 'draft.l5x' })
    expect(applied.error).toBeUndefined()
    expect(applied.data?.output_path).toBe('draft.l5x')
    expect(l5x.written.get('draft.l5x')).toContain('SP_Start')
    expect(l5x.written.has('sample.l5x')).toBe(false)
    const again = await l5x.call('draft_apply', { draft_id: id, output_path: 'draft2.l5x' })
    expect(again.error?.code).toBe('UNKNOWN_DRAFT')
  })

  it('refuses to overwrite an existing output file', async () => {
    const l5x = await opened()
    const appended = await l5x.call('draft_tag', {
      scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80,
    })
    const applied = await l5x.call('draft_apply', { draft_id: appended.data?.draft_id, output_path: 'sample.l5x' })
    expect(applied.error?.code).toBe('OUTPUT_EXISTS')
    expect(applied.error?.fix).toContain('new output_path')
  })
})

describe('draft handles', () => {
  it('refuses an unknown draft id and lists the chat drafts', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'x', value: 1 })
    const missing = await l5x.call('draft_validate', { draft_id: 'nope' })
    expect(missing.error?.code).toBe('UNKNOWN_DRAFT')
    expect(missing.error?.candidates.length).toBe(1)
  })

  it('refuses validation when no draft exists', async () => {
    const l5x = await opened()
    const none = await l5x.call('draft_validate', {})
    expect(none.error?.code).toBe('NO_DRAFT')
  })
})

describe('draft editing', () => {
  it('lists staged operations with the index each occupies', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'Start threshold', value: 80 })
    await l5x.call('draft_rung', { program: 'MainProgram', routine: 'MainRoutine', mode: 'replace', rung: 0, text: 'XIC(Start)OTE(Run);' })
    const list = await l5x.call('draft_list', {})
    expect(list.error).toBeUndefined()
    expect(list.data?.operation_count).toBe(2)
    const operations = list.data?.operations as readonly { index: number; operation: string; rung?: number }[]
    expect(operations.map(operation => operation.index)).toEqual([0, 1])
    expect(operations[0]?.operation).toBe('add_tag')
    expect(operations[1]?.operation).toBe('replace_rung')
  })

  it('removes exactly one operation and keeps the rest', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'first' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Stop', data_type: 'REAL', description: 'second' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Hold', data_type: 'REAL', description: 'third' })
    const removed = await l5x.call('draft_remove_op', { index: 1 })
    expect(removed.error).toBeUndefined()
    expect(removed.data?.operation_count).toBe(2)
    const names = (removed.data?.operations as readonly { name?: string }[]).map(operation => operation.name)
    expect(names).toEqual(['SP_Start', 'SP_Hold'])
  })

  it('refuses an index past the end and points at draft_list', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'only' })
    const outOfRange = await l5x.call('draft_remove_op', { index: 4 })
    expect(outOfRange.error?.code).toBe('UNKNOWN_OPERATION')
    expect(outOfRange.error?.fix).toContain('draft_list')
  })
})
describe('composition against staged tags', () => {
  const spec = '{"series":[{"instr":"XIC","args":["SP_Start"]},{"instr":"OTE","args":["SP_Latch"]}]}'

  it('refuses a staged name before the draft declares it', async () => {
    const l5x = await opened()
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error?.code).toBe('TAG_NOT_FOUND')
  })

  it('composes once the same draft declares the tag', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'BOOL', description: 'staged start' })
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Latch', data_type: 'BOOL', description: 'staged latch' })
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error).toBeUndefined()
    const rungs = composed.data?.rungs as readonly { neutral_text: string }[] | undefined
    expect(rungs?.[0]?.neutral_text).toContain('XIC(SP_Start)')
  })

  it('still type-checks the staged declaration', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'SP_Start', data_type: 'REAL', description: 'wrong type' })
    const composed = await l5x.call('compose_rung', { spec_json: spec })
    expect(composed.error?.code).toBe('INVALID_OPERAND')
    expect(composed.error?.message).toContain('BOOL')
  })
})