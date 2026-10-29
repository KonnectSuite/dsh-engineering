import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the live entry mounted over the read entry. */
function liveHarness(options: { allowWrites?: boolean; approval?: { policy: 'ask' | 'never'; outcome?: string } } = {}) {
  return harness(fixtureBytes, {
    live: options.allowWrites === undefined ? true : { allowWrites: options.allowWrites },
    ...(options.approval === undefined ? {} : { approval: options.approval }),
  })
}

/** Open the fixture export and return the ready harness. */
async function opened(options: { allowWrites?: boolean; approval?: { policy: 'ask' | 'never'; outcome?: string } } = {}) {
  const l5x = liveHarness(options)
  // The session is an object: the plugin scopes handles by `exec.agent.session`.
  const session = { id: 'session-1' }
  const agent = { agent: { session } }
  const result = await l5x.call('open_project', { path: 'sample.l5x' }, agent)
  expect(result.error).toBeUndefined()
  return { definitions: l5x.definitions, written: l5x.written, call: (name: string, args: Record<string, unknown> = {}) => l5x.call(name, args, agent) }
}

describe('live registration', () => {
  it('mounts the whole EtherNet/IP surface after the read tools', () => {
    const { definitions } = liveHarness()
    const names = definitions.map(definition => definition.name)
    expect(names.slice(15)).toEqual([
      'poll_live_tags',
      'read_live_tags',
      'read_controller_clock',
      'discover_controllers',
      'write_live_tag',
      'write_controller_clock',
      'start_plc_trend',
    ])
  })
})

describe('poll validation', () => {
  it('refuses a tag that is not a declared scalar', async () => {
    const l5x = await opened()
    const polled = await l5x.call('poll_live_tags', {
      ip_address: '192.168.1.10',
      tags: [{ name: 'No_Such_Tag' }],
    })
    expect(polled.error?.code).toBe('UNSUPPORTED_POLL_TAG')
  })

  it('refuses a JSON string where the tags array belongs', async () => {
    const l5x = await opened()
    const polled = await l5x.call('poll_live_tags', {
      ip_address: '192.168.1.10',
      tags: '[{"name":"Motor_1"}]',
    })
    expect(polled.error?.code).toBe('INVALID_POLL')
    expect(polled.error?.fix).toContain('not a JSON string')
  })

  it('refuses an address that is not IPv4', async () => {
    const l5x = await opened()
    const polled = await l5x.call('poll_live_tags', { ip_address: 'not-an-ip', tags: [{ name: 'LineSpeed' }] })
    expect(polled.error?.code).toBe('INVALID_CONTROLLER')
  })
})

describe('batch read validation', () => {
  it('refuses an undeclared tag before opening a connection', async () => {
    const l5x = await opened()
    const result = await l5x.call('read_live_tags', { ip_address: '192.168.1.10', tags: [{ name: 'No_Such_Tag' }] })
    expect(result.error?.code).toBe('UNSUPPORTED_WRITE_TAG')
  })

  it('refuses a JSON string where the tags array belongs', async () => {
    const l5x = await opened()
    const result = await l5x.call('read_live_tags', { ip_address: '192.168.1.10', tags: '[{"name":"Motor_1"}]' })
    expect(result.error?.code).toBe('INVALID_POLL')
  })
})

describe('write gating', () => {
  it('refuses a write while the row switch is off, even with approval on', async () => {
    const l5x = await opened({ allowWrites: false, approval: { policy: 'ask' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'LineSpeed', value: 12 })
    expect(result.error?.code).toBe('WRITES_DISABLED')
    expect(result.error?.fix).toContain('allowWrites')
  })

  it('refuses a clock write while the row switch is off', async () => {
    const l5x = await opened({ allowWrites: false, approval: { policy: 'ask' } })
    const result = await l5x.call('write_controller_clock', { ip_address: '192.168.1.10' })
    expect(result.error?.code).toBe('WRITES_DISABLED')
  })

  it('refuses before contacting a controller when the session cannot ask', async () => {
    const l5x = await opened({ allowWrites: true, approval: { policy: 'never' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'LineSpeed', value: 12 })
    expect(result.error?.code).toBe('APPROVAL_UNAVAILABLE')
  })

  it('refuses when the human declines', async () => {
    const l5x = await opened({ allowWrites: true, approval: { policy: 'ask', outcome: 'rejected' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'LineSpeed', value: 12 })
    expect(result.error?.code).toBe('APPROVAL_DENIED')
    expect(result.error?.fix).toContain('Nothing was sent to the controller')
  })

  it('rejects a value whose type does not match the declaration', async () => {
    const l5x = await opened({ allowWrites: true, approval: { policy: 'ask' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'LineSpeed', value: true })
    expect(result.error?.code).toBe('INVALID_WRITE')
  })

  it('refuses a UDT tag, which is not a scalar', async () => {
    const l5x = await opened({ allowWrites: true, approval: { policy: 'ask' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'Motor_1', value: 1 })
    expect(result.error?.code).toBe('UNSUPPORTED_WRITE_TAG')
  })

  it('refuses a write to an alias and names the tag to write instead', async () => {
    // Reads resolve aliases; a write must name the declared operand so the
    // controller changes exactly one known tag.
    const l5x = await opened({ allowWrites: true, approval: { policy: 'ask' } })
    const result = await l5x.call('write_live_tag', { ip_address: '192.168.1.10', name: 'StartPB_Field', program: 'MainProgram', value: true })
    expect(result.error?.code).toBe('UNSUPPORTED_WRITE_TAG')
    expect(result.error?.message).toContain('alias')
    expect(result.error?.message).toContain('write the tag it points at')
    expect(result.error?.fix).toContain('Read aliases freely')
  })
})

describe('discovery bounds', () => {
  it('refuses a window outside 1 to 15 seconds', async () => {
    const l5x = liveHarness()
    const result = await l5x.call('discover_controllers', { duration_seconds: 60 })
    expect(result.error?.code).toBe('INVALID_POLL')
  })
})

describe('trend without a job service', () => {
  it('refuses before opening a controller connection', async () => {
    const l5x = await opened()
    const trend = await l5x.call('start_plc_trend', {
      ip_address: '192.168.1.10',
      tags: [{ name: 'LineSpeed' }],
      sample_count: 2,
    })
    expect(trend.error?.code).toBe('TREND_JOBS_UNAVAILABLE')
  })
})
