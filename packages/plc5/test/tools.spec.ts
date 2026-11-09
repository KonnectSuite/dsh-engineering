import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { plc5Tools } from '../src/tools.ts'
import type { FsService, ToolExec } from '../src/core/tool.ts'

const exec: ToolExec = {}

/** A filesystem face over the real disk, as the host resolves it. */
const fs: FsService = {
  async resolve(path) {
    return { targetKey: path, displayPath: path }
  },
  async stat(target) {
    const { statSync } = await import('node:fs')
    const info = statSync(target.targetKey)
    return { name: target.targetKey.split(/[\\/]/).pop() ?? '', type: info.isDirectory() ? 'directory' : 'file', size: info.size }
  },
  async readBytes(target) {
    const { readFile } = await import('node:fs/promises')
    return new Uint8Array(await readFile(target.targetKey))
  },
  async list(target) {
    const { readdir } = await import('node:fs/promises')
    return (await readdir(target.targetKey, { withFileTypes: true })).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' as const : 'file' as const }))
  },
}

const tool = (name: string) => {
  const definition = plc5Tools(fs).find(definition => definition.name === name)
  if (definition === undefined) throw new Error(`no tool named ${name}`)
  return definition
}

describe('the PLC-5 tool envelope', () => {
  it('refuses a path that is not an .RSP with a named fix', async () => {
    const answer = await tool('plc5_ladder').execute({ path: 'C:\\projects\\plant.l5x' }, exec) as any
    expect(answer.error.code).toBe('NOT_AN_RSP')
    expect(answer.error.fix).toContain('.RSP')
  })

  it('names the folder contents when a path is missing', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plc5-tools-'))
    try {
      await writeFile(join(directory, 'F00607.L5K'), 'x')
      const answer2 = await tool('plc5_find').execute({ path: join(directory, 'F00607.rsp'), pattern: 'PUMP' }, exec) as any
      expect(answer2.error.code).toBe('FILE_MISSING')
      expect(answer2.error.candidates).toContain('F00607.L5K')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('reports a file that is not a container as NOT_A_CONTAINER on the container path', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plc5-tools-'))
    const path = join(directory, 'notes.rsp')
    try {
      await writeFile(path, 'plain text, not an OLE2 container')
      const answer = await tool('plc5_processor').execute({ path }, exec) as any
      expect(answer.error.code).toBe('NOT_A_CONTAINER')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('answers the capabilities probe with the host facts and a next step', async () => {
    const answer = await tool('plc5_capabilities').execute({}, exec) as any
    expect(answer.summary).toContain('RSLogix 5')
    expect(typeof answer.data.powershell32).toBe('boolean')
    expect(typeof answer.data.com_server).toBe('boolean')
    expect(answer.next.length).toBeGreaterThan(0)
    expect(answer.coverage.complete).toBe(false)
  })

  it('registers eight tools, all inside the plc5 namespace', () => {
    const names = plc5Tools(fs).map(definition => definition.name)
    expect(names).toEqual([
      'plc5_capabilities', 'plc5_open', 'plc5_ladder', 'plc5_find',
      'plc5_io_census', 'plc5_io_config', 'plc5_data_read', 'plc5_processor',
    ])
    for (const definition of plc5Tools(fs)) {
      expect(definition.parameters.additionalProperties).toBe(false)
      expect(definition.output.render).toBeTruthy()
    }
  })
})
