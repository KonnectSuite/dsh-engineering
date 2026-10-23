/**
 * The read tools over a fake engine and a real staged-project layout.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ReadService, type ReadEngine } from '../src/read/service.ts'
import { readTools } from '../src/tools/read.ts'
import type { EngineResult } from '../src/core/code-engine.ts'

type Envelope = { summary?: string; data?: Record<string, unknown>; next?: readonly { tool: string }[]; error?: { code: string } }

const BODY = 'PROGRAM Main\nx := Start;\nIF x THEN Run := TRUE; END_IF;\nEND_PROGRAM'

function engine(overrides: Record<string, (request: Readonly<Record<string, unknown>>) => EngineResult> = {}): ReadEngine {
  const table: Record<string, (request: Readonly<Record<string, unknown>>) => EngineResult> = {
    pous: () => ({ ok: true, pous: [{ name: 'Main', language: 'ST', has_st_body: true }, { name: 'Graph', language: 'LD', has_st_body: false }] }),
    read_text: () => ({ ok: true, text: BODY, variables: [{ name: 'x', type: 'BOOL' }] }),
    globals: () => ({ ok: true, variables: [{ name: 'G1', type: 'INT', section: 'VAR_GLOBAL' }] }),
    types: () => ({ ok: true, types: [{ name: 'T1', kind: 'STRUCT' }] }),
    tasks: () => ({ ok: true, bindings: [{ name: 'FastTsk', kind: 'CYCLIC' }], unassigned: ['Main'] }),
    workflow_check: () => ({ ok: true, blockers: [], warnings: [] }),
    validate: () => ({ ok: true, result: { errors: [] } }),
    unsupported: () => ({ ok: true, limitations: [] }),
    check_program: () => ({ ok: true, findings: [] }),
    installed_help: () => ({ ok: true, topics: [] }),
    library: () => ({ ok: true, blocks: [{ name: 'R_TRIG' }] }),
    block_interface: (request) => ({ ok: true, name: request.name, pins: [] }),
    eip_map: () => ({ ok: true, assemblies: [] }),
    ...overrides,
  }
  return { async run(verb, request) { const handler = table[verb]; return handler === undefined ? { ok: true } : handler(request) } }
}

function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'mwi-read-'))
  const stage = join(root, '.motionworks', 'stage', 'Line')
  mkdirSync(stage, { recursive: true })
  writeFileSync(join(root, '.motionworks', 'stage', 'Line.mwt'), 'wrapper')
  writeFileSync(join(stage, 'PROJECT.TRE'), 'tree')
  return root
}

async function call(root: string, service: ReadService, name: string, args: Record<string, unknown> = {}): Promise<Envelope> {
  const definition = readTools(() => service).find(tool => tool.name === name)
  if (definition === undefined) throw new Error(`no tool ${name}`)
  return await definition.execute(args, { cwd: root }) as Envelope
}

describe('read tools', () => {
  it('registers the seven read intents', () => {
    expect(readTools(() => new ReadService(engine())).map(tool => tool.name)).toEqual([
      'mw_project_overview', 'mw_list', 'mw_get', 'mw_search', 'mw_references', 'mw_review', 'mw_help',
    ])
  })

  it('summarizes the single staged project', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_project_overview')
    expect(result.data?.counts).toMatchObject({ pou: 2, global: 1, type: 1, task: 2 })
    expect(result.summary).toContain('2 POU')
  })

  it('lists and pages POUs', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_list', { kind: 'pou', limit: 1 })
    expect(result.data?.total).toBe(2)
    expect(result.data?.rows).toHaveLength(1)
  })

  it('lists variables for one POU', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_list', { kind: 'variable', pou: 'Main' })
    expect(result.data?.rows).toMatchObject([{ name: 'x', type: 'BOOL' }])
  })

  it('reads one POU through read_text', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_get', { kind: 'pou', name: 'Main' })
    const document = result.data?.document as { text?: string }
    expect(document.text).toContain('PROGRAM Main')
    expect(result.summary).toContain('Main')
  })

  it('finds literal text and symbol references with lines', async () => {
    const root = workspace()
    const service = new ReadService(engine())
    const search = await call(root, service, 'mw_search', { query: 'start' })
    expect(search.data?.matches).toEqual([{ pou: 'Main', line: 2, text: 'x := Start;' }])
    const references = await call(root, service, 'mw_references', { symbol: 'x' })
    expect(references.data?.matches).toHaveLength(2)
  })

  it('reviews the saved project', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_review', { pou: 'Main' })
    expect(result.data?.workflow).toBeDefined()
    expect(result.data?.review).toBeDefined()
  })

  it('searches installed help', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_help', { source: 'help', query: 'timer' })
    expect(result.summary).toContain('help')
  })

  it('refuses a project that does not exist', async () => {
    const root = workspace()
    const result = await call(root, new ReadService(engine()), 'mw_list', { kind: 'pou', project: 'Missing' })
    expect(result.error).toMatchObject({ code: 'PROJECT_NOT_FOUND' })
  })
})
