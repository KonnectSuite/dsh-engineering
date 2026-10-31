import { describe, expect, it } from 'vitest'
import { migrationTools } from '../src/tools.ts'
import type { FsService } from '../src/core/tool.ts'

/** A filesystem that serves bytes from an in-memory map. */
function fakeFs(files: Readonly<Record<string, string | Uint8Array>>): FsService {
  return {
    resolve: async (path: string) => ({ targetKey: path, displayPath: path }),
    stat: async (target: { displayPath: string }) => (target.displayPath in files ? { type: 'file' } : undefined),
    readBytes: async (target: { displayPath: string }) => {
      const value = files[target.displayPath]
      if (value === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
      return typeof value === 'string' ? new TextEncoder().encode(value) : value
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
