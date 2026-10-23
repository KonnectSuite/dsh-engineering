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
    expect(editTools(fakeRuntime()).map(tool => tool.name)).toEqual(['mw_edit_code', 'mw_validate', 'mw_apply'])
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

  it('refuses a mixed or incomplete request before calling the IDE', async () => {
    const mixed = await call(fakeRuntime(), 'mw_edit_code', { pou: 'Main', changes: [{ find: 'a', replace: 'b' }], body: 'x := 1;', expected_body_sha256: 'a'.repeat(64) })
    expect(mixed.error).toMatchObject({ code: 'INVALID_ARGUMENT' })
    const noHash = await call(fakeRuntime(), 'mw_edit_code', { pou: 'Main', changes: [{ find: 'a', replace: 'b' }] })
    expect(noHash.error).toMatchObject({ code: 'INVALID_ARGUMENT' })
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
    expect(result.summary).toContain('Saved the staged project')
    expect(result.next?.[0]?.tool).toBe('mw_compile')
  })
})
