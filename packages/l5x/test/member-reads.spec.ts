/**
 * Scalar member reads.
 *
 * An engineer debugging a timer needs PRE and ACC, not just the whole TIMER. The
 * live surface used to refuse any name that was not a declared scalar tag; these
 * tests hold that one scalar member resolves to its own type, that a structured
 * tag is still refused whole, and that a write cannot target a member.
 */
import { describe, expect, it } from 'vitest'
import { ProjectSession } from '../src/session.ts'
import { batchReadRequest, writableTagRequest } from '../src/engine/cip-request.ts'
import { pollingRequest } from '../src/engine/direct-polling.ts'
import { fixtureBytes } from './harness.ts'

const bytes = fixtureBytes()
const fs = {
  async resolve(path: string) { return { targetKey: path, displayPath: path } },
  async stat() { return { type: 'file' } },
  async readBytes() { return bytes },
}
const config = {
  enabled: true,
  minIntervalMs: 50,
  defaultIntervalMs: 200,
  maxTags: 16,
  maxSamples: 10,
  maxDurationMs: 60_000,
  requestTimeoutMs: 3_000,
  maxConcurrent: 1,
  allowedAddresses: [] as readonly string[],
  displayRefreshMs: 250,
  displayMaxSamples: 1_200,
}

async function project() {
  return await new ProjectSession(fs as never, 64 * 1024 * 1024).open('sample.l5x')
}

describe('one scalar member of a structured tag', () => {
  it('resolves to the member type for a batch read', async () => {
    const snapshot = await project()
    const result = batchReadRequest(snapshot, {
      ip_address: '192.168.1.10',
      tags_json: JSON.stringify([{ name: 'MainTimer.PRE', scope: 'MainProgram' }]),
    }, config, 64)
    expect(result.request.tags[0]).toMatchObject({ name: 'MainTimer.PRE', data_type: 'DINT' })
  })

  it('resolves to the member type for a trend', async () => {
    const snapshot = await project()
    const result = pollingRequest(snapshot, {
      ip_address: '192.168.1.10',
      sample_count: 2,
      interval_ms: 200,
      tags_json: JSON.stringify([{ name: 'MainTimer.ACC', scope: 'MainProgram' }]),
    }, config)
    expect(result.request.tags[0]).toMatchObject({ name: 'MainTimer.ACC', data_type: 'DINT' })
  })

  it('still refuses the structured tag itself', async () => {
    const snapshot = await project()
    expect(() => batchReadRequest(snapshot, {
      ip_address: '192.168.1.10',
      tags_json: JSON.stringify([{ name: 'MainTimer', scope: 'MainProgram' }]),
    }, config, 64)).toThrow(/TIMER/)
  })

  it('refuses a write that names a member', async () => {
    const snapshot = await project()
    expect(() => writableTagRequest(snapshot, {
      ip_address: '192.168.1.10',
      name: 'MainTimer.PRE',
      program: 'MainProgram',
      value: 5,
    }, config)).toThrow(/member/)
  })
})
