import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the live entry mounted over the read entry. */
function liveHarness() {
  return harness(fixtureBytes, { live: true })
}

describe('live registration', () => {
  it('mounts the two live tools after the read surface', () => {
    const { definitions } = liveHarness()
    const names = definitions.map(definition => definition.name)
    expect(names.slice(11)).toEqual(['poll_live_tags', 'start_plc_trend'])
  })
})

describe('poll validation', () => {
  it('refuses a tag that is not a declared scalar', async () => {
    const l5x = liveHarness()
    const opened = await l5x.call('open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    const polled = await l5x.call('poll_live_tags', {
      ip_address: '192.168.1.10',
      tags: [{ name: 'No_Such_Tag' }],
    })
    expect(polled.error?.code).toBe('UNSUPPORTED_POLL_TAG')
  })

  it('refuses a JSON string where the tags array belongs', async () => {
    const l5x = liveHarness()
    const opened = await l5x.call('open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    const polled = await l5x.call('poll_live_tags', {
      ip_address: '192.168.1.10',
      tags: '[{"name":"Motor_1"}]',
    })
    expect(polled.error?.code).toBe('INVALID_POLL')
    expect(polled.error?.fix).toContain('not a JSON string')
  })
})

describe('trend without a job service', () => {
  it('refuses before opening a controller connection', async () => {
    const l5x = liveHarness()
    const opened = await l5x.call('open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    const trend = await l5x.call('start_plc_trend', {
      ip_address: '192.168.1.10',
      tags: [{ name: 'LineSpeed' }],
      sample_count: 2,
    })
    expect(trend.error?.code).toBe('TREND_JOBS_UNAVAILABLE')
  })
})
