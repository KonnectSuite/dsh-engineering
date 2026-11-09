import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Plc5Error, dedupeChassis, readPlc5Project } from '../src/engine/rslogix5.ts'

/** The error a promise rejected with, or undefined when it resolved. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

/**
 * The test that drives the installed RSLogix 5 host is opt-in: a suite must not
 * depend on a vendor product, and a machine whose server will not launch makes
 * every attempt wait about two minutes for `CO_E_SERVER_EXEC_FAILURE`.
 *
 *   DSH_PLC5_LIVE=1 vitest run packages/plc5/test/rslogix5.spec.ts
 */
const live = process.env.DSH_PLC5_LIVE === '1'

describe('headless RSLogix 5 read', () => {
  it('refuses a path that is not a file before starting the vendor host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'plc5-read-'))
    try {
      const error = await rejection(readPlc5Project(directory))
      expect(error).toBeInstanceOf(Plc5Error)
      const failure = error as Plc5Error
      expect(failure.code).toBe('PLC5_FILE_MISSING')
      expect(failure.message).toContain(directory)
      expect(failure.fix).toContain('.RSP')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('names the missing path in the error, not a bare COM failure', async () => {
    const missing = join(tmpdir(), 'plc5-read-does-not-exist.rsp')
    const error = await rejection(readPlc5Project(missing))
    expect(error).toBeInstanceOf(Plc5Error)
    expect((error as Plc5Error).message).toContain('plc5-read-does-not-exist.rsp')
    expect((error as Plc5Error).code).toBe('PLC5_FILE_MISSING')
  })

  it('drops a chassis the server enumerated twice', () => {
    const row = (name: string, startingRack: number) => ({
      name,
      part: '1794 Flex I/O Adapter',
      slots: 8,
      startingRack,
      endingRack: startingRack,
      startingGroup: 0,
      endingGroup: 7,
      adapter: 8,
      channel: '7',
    })
    const unique = dedupeChassis([
      row('Chassis_13', 13),
      row('Chassis_14', 14),
      row('Chassis_14', 14),
      { ...row('', 0), part: '' },
    ])
    expect(unique.map(entry => entry.name)).toEqual(['Chassis_13', 'Chassis_14'])
  })

  it.skipIf(!live)('reports a file that is not a container as a failed open, not a crash', async () => {    const directory = await mkdtemp(join(tmpdir(), 'plc5-read-'))
    const path = join(directory, 'not-a-project.rsp')
    try {
      await writeFile(path, 'this is not an OLE2 container')
      const error = await rejection(readPlc5Project(path))
      expect(error).toBeInstanceOf(Plc5Error)
      const failure = error as Plc5Error
      expect(['PLC5_OPEN_FAILED', 'PLC5_NO_PROJECT', 'PLC5_BAD_ANSWER', 'PLC5_POWERSHELL_MISSING', 'PLC5_NO_ANSWER', 'PLC5_COM_UNAVAILABLE', 'PLC5_TIMEOUT']).toContain(failure.code)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }, 330_000)
})
