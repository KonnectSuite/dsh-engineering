/**
 * The verify tools over a fake runtime.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MwiError } from '../src/core/errors.ts'
import { verifyTools } from '../src/tools/verify.ts'
import type { SessionRuntime } from '../src/session/service.ts'

type Envelope = { summary?: string; data?: Record<string, unknown>; next?: readonly { tool: string }[]; error?: { code: string } }

function fakeRuntime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  return {
    async status() { return { ide_running: true, is_project_open: true, active_project: 'C:/ws/.motionworks/stage/Line.mwt' } },
    async ideState() { return { ide_running: true, blocked: false } },
    async stage() { throw new Error('not used') },
    async open() { return {} },
    async start() { return {} },
    async worksheet() { return {} },
    async close() { return {} },
    stagedAt() { return undefined },
    reads: {} as SessionRuntime['reads'],
    async compile() { return { is_compiled: true, is_modified: false } },
    async diagnostics() { return { count: 0, lines: [], compile_state: { is_compiled: true } } },
    async verify(mode) {
      return mode === 'baseline'
        ? { baseline_id: 'b-1', project: 'C:/ws/.motionworks/stage/Line' }
        : { baseline_id: 'b-1', project: 'C:/ws/.motionworks/stage/Line', matched: false, changed: ['src.st1'] }
    },
    ...overrides,
  }
}

async function call(runtime: SessionRuntime, name: string, args: Record<string, unknown> = {}): Promise<Envelope> {
  const root = mkdtempSync(join(tmpdir(), 'mwi-verify-'))
  const definition = verifyTools(() => runtime).find(tool => tool.name === name)
  if (definition === undefined) throw new Error(`no tool ${name}`)
  return await definition.execute(args, { cwd: root }) as Envelope
}

describe('verify tools', () => {
  it('registers the three verify intents', () => {
    expect(verifyTools(fakeRuntime).map(tool => tool.name)).toEqual(['mw_compile', 'mw_diagnostics', 'mw_verify'])
  })

  it('reports compile state', async () => {
    const result = await call(fakeRuntime(), 'mw_compile', { mode: 'state' })
    expect(result.summary).toContain('compiled=true')
  })

  it('passes the compile mode through', async () => {
    let mode: string | undefined
    const runtime = fakeRuntime({ async compile(value) { mode = value; return { verdict: 'passed' } } })
    const result = await call(runtime, 'mw_compile', { mode: 'build' })
    expect(mode).toBe('build')
    expect(result.summary).toContain('build')
  })

  it('reports an empty pane and the compile state', async () => {
    const result = await call(fakeRuntime(), 'mw_diagnostics', { pane: 'Warnings' })
    expect(result.summary).toContain('no messages')
    expect(result.data?.compile_state).toBeDefined()
  })

  it('captures a baseline and points at compare', async () => {
    const result = await call(fakeRuntime(), 'mw_verify', { mode: 'baseline' })
    expect(result.data?.baseline_id).toBe('b-1')
    expect(result.next?.[0]).toMatchObject({ tool: 'mw_verify', args: { mode: 'compare', baseline_id: 'b-1' } })
  })

  it('reports changed files on compare', async () => {
    const result = await call(fakeRuntime(), 'mw_verify', { mode: 'compare', baseline_id: 'b-1' })
    expect(result.summary).toContain('1 changed')
  })

  it('keeps a missing baseline as a recoverable failure', async () => {
    const runtime = fakeRuntime({
      async verify() { throw new MwiError('BASELINE_REQUIRED', 'Need an id.', 'Capture one.') },
    })
    const result = await call(runtime, 'mw_verify', { mode: 'compare' })
    expect(result.error).toMatchObject({ code: 'BASELINE_REQUIRED' })
  })
})
