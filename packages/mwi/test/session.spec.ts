/**
 * The session tools over a fake runtime and a real temporary workspace.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MwiError } from '../src/core/errors.ts'
import { sessionTools } from '../src/tools/session.ts'
import type { SessionRuntime } from '../src/session/service.ts'
import type { StageRecord } from '../src/session/stage.ts'

type Envelope = { summary?: string; data?: Record<string, unknown>; next?: readonly { tool: string }[]; error?: { code: string } }

const RECORD: StageRecord = {
  name: 'Line',
  source: 'C:/ws/Line.mwt',
  source_directory: 'C:/ws/Line',
  workspace: 'C:/ws',
  staged_mwt: 'C:/ws/.motionworks/stage/Line.mwt',
  staged_directory: 'C:/ws/.motionworks/stage/Line',
  bound_to: 'C:/ws/.motionworks/stage/Line',
  previous_embedded_path: null,
  staged_at: '2026-10-23T00:00:00.000Z',
}

function fakeRuntime(overrides: Partial<SessionRuntime> = {}): SessionRuntime {
  return {
    async status() { return { ide_running: true, is_project_open: true, active_project: 'C:/ws/.motionworks/stage/Line.mwt' } },
    async ideState() { return { ide_running: true, blocked: false } },
    async stage() { return RECORD },
    async open() { return { active_project: RECORD.staged_mwt, matches_request: true } },
    async start() { return { ide_window: '0x1', version: '1.19' } },
    async worksheet() { return { accepted: true } },
    async close() { return { closed: true } },
    stagedAt() { return RECORD },
    ...overrides,
  }
}

async function call(runtime: SessionRuntime, name: string, args: Record<string, unknown> = {}, cwd = process.cwd()): Promise<Envelope> {
  const definition = sessionTools(() => runtime).find(tool => tool.name === name)
  if (definition === undefined) throw new Error(`no tool ${name}`)
  return await definition.execute(args, { cwd }) as Envelope
}

describe('session tools', () => {
  it('registers the seven session intents', () => {
    expect(sessionTools(fakeRuntime).map(tool => tool.name)).toEqual([
      'mw_project_find', 'mw_ide_status', 'mw_project_stage', 'mw_project_open',
      'mw_ide_start', 'mw_worksheet_open', 'mw_project_close',
    ])
  })

  it('finds projects in the workspace and reports staged copies', async () => {
    const workspace = mkdtempSync(join(tmpdir(), 'mwi-ws-'))
    mkdirSync(join(workspace, 'Line'))
    writeFileSync(join(workspace, 'Line.mwt'), 'wrapper')
    mkdirSync(join(workspace, '.motionworks', 'stage'), { recursive: true })
    writeFileSync(join(workspace, '.motionworks', 'stage', 'Line.mwt'), 'staged')
    const result = await call(fakeRuntime(), 'mw_project_find', {}, workspace)
    expect(result.data?.projects).toHaveLength(1)
    expect(result.data?.projects).toMatchObject([{ name: 'Line', staged: join(workspace, '.motionworks', 'stage', 'Line.mwt') }])
    expect(result.next?.[0]?.tool).toBe('mw_project_open')
  })

  it('reports an IDE that is not running as a state and points at start', async () => {
    const runtime = fakeRuntime({
      async status() { throw new MwiError('IDE_NOT_RUNNING', 'No IDE.', 'Start it.') },
    })
    const result = await call(runtime, 'mw_ide_status')
    expect(result.error).toBeUndefined()
    expect(result.data?.ide_running).toBe(false)
    expect(result.next?.[0]?.tool).toBe('mw_ide_start')
  })

  it('reports the open project and any blocking dialog', async () => {
    const result = await call(fakeRuntime({ async ideState() { return { ide_running: true, blocked: true } } }), 'mw_ide_status')
    expect(result.summary).toContain('blocked by a dialog')
    expect(result.data?.ide_state).toMatchObject({ blocked: true })
  })

  it('stages through the runtime and points at open', async () => {
    let source: string | undefined
    const result = await call(fakeRuntime({ async stage(value) { source = value; return RECORD } }), 'mw_project_stage', { source: 'Line' })
    expect(source).toBe('Line')
    expect(result.data?.staged_mwt).toBe(RECORD.staged_mwt)
    expect(result.next?.[0]?.tool).toBe('mw_project_open')
  })

  it('passes the approval fields to open', async () => {
    let received: { userApproved?: boolean; expectedProject?: string } | undefined
    const runtime = fakeRuntime({
      async open(_path, options) { received = options; return { matches_request: true, active_project: RECORD.staged_mwt } },
    })
    await call(runtime, 'mw_project_open', { path: RECORD.staged_mwt, user_approved: true, expected_project: 'C:/old.mwt' })
    expect(received).toEqual({ userApproved: true, expectedProject: 'C:/old.mwt' })
  })

  it('opens a variables worksheet without a POU', async () => {
    let request: unknown
    const runtime = fakeRuntime({ async worksheet(value) { request = value; return { accepted: true } } })
    const result = await call(runtime, 'mw_worksheet_open', { kind: 'variables' })
    expect(request).toEqual({ kind: 'variables', inspectOnly: false })
    expect(result.summary).toContain('variables worksheet')
  })

  it('closes only with approval and reports a refusal to close', async () => {
    const runtime = fakeRuntime({
      async close(options) {
        if (options.userApproved !== true) throw new MwiError('APPROVAL_REQUIRED', 'Ask.', 'Approve.')
        return { closed: false }
      },
    })
    await expect(call(runtime, 'mw_project_close', { user_approved: false })).resolves.toMatchObject({ error: { code: 'APPROVAL_REQUIRED' } })
    const result = await call(runtime, 'mw_project_close', { user_approved: true })
    expect(result.summary).toContain('still running')
  })
})
