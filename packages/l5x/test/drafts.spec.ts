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
