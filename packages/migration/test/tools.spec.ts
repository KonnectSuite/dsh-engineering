import { describe, expect, it } from 'vitest'
import { migrationTools } from '../src/tools.ts'
import type { FsService } from '../src/core/tool.ts'

/** A filesystem that serves bytes from an in-memory map, and records writes. */
function fakeFs(files: Readonly<Record<string, string | Uint8Array>>): FsService {
  const store = new Map<string, string | Uint8Array>(Object.entries(files))
  return {
    resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
    stat: async (target: { displayPath: string }) => (store.has(target.displayPath) ? { type: 'file' } : undefined),
    readBytes: async (target: { displayPath: string }) => {
      const value = store.get(target.displayPath)
      if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return typeof value === 'string' ? new TextEncoder().encode(value) : value
    },
    writeText: async (target: { displayPath: string }, text: string) => {
      store.set(target.displayPath, text)
    },
  }
}

const tools = migrationTools(fakeFs({
  'C:\\x\\sheet.slc': [
    'START 1747-L542C % 5/04 CPU - 32K Mem. OS401 Series C FRN 3-8 %',
    '1 1746-A7',
    '2 1746-A7',
    'LADDER 2 - Total Rungs in File = 3',
    '% Rung: 0 %',
    'SOR XIC S:1/15 EOR',
    '% Rung: 1 %',
    'SOR XIC S:1/15 EOR',
    'LADDER 3 - Total Rungs in File = 1',
    '% Rung: 0 %',
    'SOR XIC S:1/15 EOR',
    'DATA B3:0',
  ].join('\r\n'),
  'C:\\x\\broken.l5k': 'CONTROLLER CNTRLR (\r\n\t\tProcessorType := 5069-L330ER,\r\n\t\tMajor := 31\r\n\t\t)\r\nTAG\r\n  Start : BOOL;\r\nEND_TAG\r\nN:  XIC(Start) OTE(Start);\r\n',
  'C:\\x\\notes.txt': 'hello',
  'C:\\x\\machine.rss': new Uint8Array([0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a]),
}))

const exec = { cwd: 'C:\\x' }
const find = (name: string) => tools.find(tool => tool.name === name)!

describe('migration_assess', () => {
  it('counts the sections of an SLC text export', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\sheet.slc' }, exec) as any
    expect(answer.summary).toContain('SLC export for 1747-L542C')
    expect(answer.summary).toContain('2 ladder file(s), 3 rung(s)')
    expect(answer.data.format).toBe('SLC')
    expect(answer.data.facts.racks).toBe(2)
    expect(answer.data.facts.data_files).toEqual(['B3'])
    expect(answer.data.checks.edits_possible_here).toBe(false)
  })

  it('lints an L5K and reports whether the import would be ready', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\broken.l5k' }, exec) as any
    expect(answer.data.format).toBe('L5K')
    expect(answer.data.import_ready).toBe(true)
    expect(answer.data.build_gate).toContain('revision 37')
  })

  it('says an RSS container has to be converted in RSLogix 500', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\machine.rss' }, exec) as any
    expect(answer.summary).toContain('RSLogix 500 container')
    expect(answer.data.checks.text_readable).toBe(false)
  })

  it('refuses a format it cannot read', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\notes.txt' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })

  it('reports a missing file as a code, not a stack trace', async () => {
    const answer = await find('migration_assess').execute({ path: 'C:\\x\\gone.l5k' }, exec) as any
    expect(answer.error.code).toBe('FILE_MISSING')
    expect(answer.error.fix).toContain('existing')
  })
})

describe('l5k_lint', () => {
  it('reports the trailing comma that stops the Studio import', async () => {
    const fs = fakeFs({
      'C:\\x\\comma.l5k': 'CONTROLLER CNTRLR (\r\n\t\tProcessorType := 5069-L330ER,\r\n\t\tAttribute := 1.0,\r\n\t\t)\r\n',
    })
    const lint = migrationTools(fs).find(tool => tool.name === 'l5k_lint')!
    const answer = await lint.execute({ path: 'C:\\x\\comma.l5k' }, exec) as any
    expect(answer.summary).toContain('1 error(s)')
    expect(answer.data.import_ready).toBe(false)
    expect(answer.data.findings[0].rule).toBe('TRAILING_COMMA')
    expect(answer.data.findings[0].line).toBe(3)
  })

  it('refuses a file that is not an L5K', async () => {
    const answer = await find('l5k_lint').execute({ path: 'C:\\x\\sheet.slc' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })
})

describe('migration_plan', () => {
  const planFs = () => fakeFs({ 'C:\\x\\machine.rss': new Uint8Array([0xcf, 0x11, 0xe0, 0xa1]) })
  const plan = (fs: FsService) => migrationTools(fs).find(tool => tool.name === 'migration_plan')!

  it('creates a blocked plan that records the interview questions', async () => {
    const answer = await plan(planFs()).execute({ action: 'create', source: 'C:\\x\\machine.rss', family: 'slc500' }, exec) as any
    expect(answer.summary).toContain('5 interview question(s)')
    expect(answer.data.state).toBe('blocked')
    expect(answer.data.plan.stages).toHaveLength(8)
    expect(answer.data.plan.source.family).toBe('slc500')
  })

  it('records answers, stage evidence and an exception, and reads them back', async () => {
    const fs = planFs()
    const tool = plan(fs)
    await tool.execute({ action: 'create', source: 'C:\\x\\machine.rss' }, exec)
    const answered = await tool.execute({
      action: 'answer',
      target_cpu: '5069-L330ER',
      target_revision: 37,
      io_strategy: 'Keep the 1746 chassis behind a 1747-AENTR bridge.',
      hmi_scope: 'Recorded for later.',
      acceptance: 'An offline build passes.',
    }, exec) as any
    expect(answered.data.state).toBe('active')
    const staged = await tool.execute({ action: 'stage', stage: 'assess', status: 'done', evidence: 'slc_read: 76 program files' }, exec) as any
    expect(staged.data.plan.stages[1]?.status).toBe('done')
    expect(staged.data.plan.stages[1]?.evidence).toEqual(['slc_read: 76 program files'])
    const excepted = await tool.execute({
      action: 'exception',
      id: 'indirect-N7-130',
      kind: 'indirect',
      description: 'N[N7:130] indexes a data file.',
      rationale: 'Rewrite as an indexed array.',
      exception_status: 'accepted',
    }, exec) as any
    expect(excepted.data.open_exceptions).toBe(0)
    const read = await tool.execute({ action: 'read' }, exec) as any
    expect(read.data.plan.decisions.target_cpu).toBe('5069-L330ER')
    expect(read.data.plan.exceptions).toHaveLength(1)
  })

  it('refuses to read a plan that was never created', async () => {
    const answer = await plan(planFs()).execute({ action: 'read' }, exec) as any
    expect(answer.error.code).toBe('PLAN_MISSING')
  })
})

describe('migration_compare', () => {
  it('refuses a source that is not an RSLogix 500 project', async () => {
    const answer = await find('migration_compare').execute({ source: 'C:\\x\\sheet.slc', logix: 'C:\\x\\a.l5x' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })

  it('refuses a Logix side that is not an L5X', async () => {
    const answer = await find('migration_compare').execute({ source: 'C:\\x\\machine.rss', logix: 'C:\\x\\sheet.l5k' }, exec) as any
    expect(answer.error.code).toBe('UNSUPPORTED_FORMAT')
  })
})
