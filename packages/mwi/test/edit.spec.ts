/**
 * The edit tools over a fake runtime.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { editTools } from '../src/tools/edit.ts'
import type { SessionRuntime } from '../src/session/service.ts'

type Envelope = { summary?: string; data?: Record<string, unknown>; next?: readonly { tool: string }[]; error?: { code: string } }

function fakeRuntime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  return {
    async status() { return {} },
    async ideState() { return {} },
    async stage() { throw new Error('not used') },
    async open() { return {} },
    async start() { return {} },
    async worksheet() { return {} },
    async close() { return {} },
    stagedAt() { return undefined },
    reads: {} as SessionRuntime['reads'],
    async compile() { return {} },
    async diagnostics() { return {} },
    async verify() { return {} },
    async editCode() { return { verification: { accepted: true, errors: [] }, pou: 'Main' } },
    async editVariable() { return { operation: 'add', verification: { accepted: true, errors: [] } } },
    async editStructure() { return { scope: 'pou', operation: 'create', verification: { accepted: true, errors: [] } } },
    async insertBlock() { return { verification: { accepted: true, errors: [], warnings: [] }, completed_phases: ['instance_declared', 'call_inserted'] } },
    async transferPou() { return { accepted: true, operation: 'export', package_token: 't-1' } },
    async validate() { return { ready: true, blockers: [], validation_errors: [] } },
    async apply() { return { saved: true } },
    ...overrides,
  }
}

async function call(runtime: SessionRuntime, name: string, args: Record<string, unknown> = {}): Promise<Envelope> {
  const root = mkdtempSync(join(tmpdir(), 'mwi-edit-'))
  const definition = editTools(() => runtime).find(tool => tool.name === name)
  if (definition === undefined) throw new Error(`no ${name}`)
  return await definition.execute(args, { cwd: root }) as Envelope
}

describe('edit tools', () => {
  it('registers the implemented edit intents', () => {
    expect(editTools(fakeRuntime()).map(tool => tool.name)).toEqual(['mw_edit_code', 'mw_edit_variables', 'mw_edit_structure', 'mw_insert_block', 'mw_transfer_pou', 'mw_validate', 'mw_apply'])
  })

  it('delegates an exact change with the body hash', async () => {
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async editCode(input) { received = input as Record<string, unknown>; return { verification: { accepted: true, errors: [] } } },
    })
    const result = await call(runtime, 'mw_edit_code', {
      pou: 'Main',
      changes: [{ find: 'a', replace: 'b' }],
      expected_body_sha256: 'a'.repeat(64),
    })
    expect(received).toMatchObject({ pou: 'Main', expectedHash: 'a'.repeat(64) })
    expect(result.summary).toContain('Edited Main')
    expect(result.next?.[0]?.tool).toBe('mw_compile')
  })

  it('delegates a complete body with the expected body', async () => {
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async editCode(input) { received = input as Record<string, unknown>; return { verification: { accepted: false, errors: ['Native structure changed'] } } },
    })
    const result = await call(runtime, 'mw_edit_code', { pou: 'Main', body: 'x := 1;', expected_body: '' })
    expect(received).toMatchObject({ body: 'x := 1;', expectedBody: '' })
    expect(result.summary).toContain('verification reported')
    expect(result.next?.[0]?.tool).toBe('mw_verify')
  })

  it('refuses a mixed request, but accepts changes without a hash', async () => {
    const mixed = await call(fakeRuntime(), 'mw_edit_code', { pou: 'Main', changes: [{ find: 'a', replace: 'b' }], body: 'x := 1;', expected_body_sha256: 'a'.repeat(64) })
    expect(mixed.error).toMatchObject({ code: 'INVALID_ARGUMENT' })
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async editCode(input) { received = input as Record<string, unknown>; return { verification: { accepted: true, errors: [] } } },
    })
    const noHash = await call(runtime, 'mw_edit_code', { pou: 'Main', changes: [{ find: 'a', replace: 'b' }] })
    expect(noHash.error).toBeUndefined()
    expect(received).toMatchObject({ pou: 'Main' })
    expect(received?.expectedHash).toBeUndefined()
  })

  it('builds a complete declaration for a variable add', async () => {
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async editVariable(input) { received = input as Record<string, unknown>; return { verification: { accepted: true, errors: [] } } },
    })
    const result = await call(runtime, 'mw_edit_variables', {
      operation: 'add',
      pou: 'Main',
      declaration: { name: 'Speed', type: 'INT', section: 'VAR' },
      flags: { retain: true },
    })
    expect(received).toMatchObject({ operation: 'add', pou: 'Main', declaration: { name: 'Speed', type: 'INT', section: 'VAR', group: null, address: null }, flags: { retain: true } })
    expect(result.summary).toContain('verified')
  })

  it('passes task settings and approval for a structure change', async () => {
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async editStructure(input) { received = input as Record<string, unknown>; return { verification: { accepted: false, errors: ['Task settings differ from plan'] } } },
    })
    const result = await call(runtime, 'mw_edit_structure', {
      scope: 'task', operation: 'edit', name: 'FastTsk', settings: { INTERVAL: 'T#8ms' }, user_approved: true,
    })
    expect(received).toMatchObject({ scope: 'task', operation: 'edit', settings_changes: { INTERVAL: 'T#8ms' }, user_approved: true })
    expect(result.summary).toContain('did not verify')
  })

  it('turns pin pairs into a binding map for insertion', async () => {
    let received: Record<string, unknown> | undefined
    const runtime = fakeRuntime({
      async insertBlock(input) { received = input as Record<string, unknown>; return { verification: { accepted: true, errors: [] } } },
    })
    const result = await call(runtime, 'mw_insert_block', {
      pou: 'Main', block: 'R_TRIG', instance: 'Trig1', expected_body_sha256: 'a'.repeat(64),
      bindings: [{ pin: 'CLK', value: 'Start' }, { pin: 'Q', value: 'Ready' }],
    })
    expect(received).toMatchObject({ pou: 'Main', block: 'R_TRIG', instance: 'Trig1', bindings: { CLK: 'Start', Q: 'Ready' } })
    expect(result.summary).toContain('Inserted Trig1')
  })

  it('exports a POU and reports the token path', async () => {
    const result = await call(fakeRuntime(), 'mw_transfer_pou', { operation: 'export', pou: 'Main' })
    expect(result.summary).toContain('Exported Main')
  })

  it('requires a token before an import', async () => {
    const result = await call(fakeRuntime(), 'mw_transfer_pou', { operation: 'import' })
    expect(result.error).toMatchObject({ code: 'INVALID_ARGUMENT' })
  })

  it('reports validation blockers and points at review', async () => {
    const runtime = fakeRuntime({
      async validate() { return { ready: false, blockers: ['task'], validation_errors: ['x'] } },
    })
    const result = await call(runtime, 'mw_validate', { pou: 'Main' })
    expect(result.summary).toContain('1 blocker')
    expect(result.next?.[0]?.tool).toBe('mw_review')
  })

  it('applies the staged project and points at compile', async () => {
    const result = await call(fakeRuntime(), 'mw_apply')
    expect(result.summary).toContain('Saved the open project')
    expect(result.next?.[0]?.tool).toBe('mw_compile')
  })
})
