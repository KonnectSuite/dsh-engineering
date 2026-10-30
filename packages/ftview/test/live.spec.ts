import { describe, expect, it } from 'vitest'
import { liveMapOf, parseAddress } from '../src/live.ts'
import type { Application, TagRow } from '../src/model.ts'

/** One tag row as the CSV parser keeps it. */
function row(name: string, type: string, address: string, device = 'D'): TagRow {
  return {
    name,
    description: '',
    type,
    raw: {
      'Tag Type': type,
      'Tag Name': name,
      'Data Source': device,
      Address: address,
    },
  }
}

/** The minimum application the mapping reads. */
function appWith(tags: readonly TagRow[]): Application {
  return {
    root: 'C:/export',
    name: 'TestApp',
    displays: [],
    tags,
    tagFiles: [],
    tagErrors: [],
    alarmFiles: [], manifestFiles: [],
    diagnostics: [],
    files: [],
  }
}

describe('tag address parsing', () => {
  it('reads a topic-qualified tag', () => {
    expect(parseAddress('::[Laminator]In_ABPower_IsOn')).toEqual({ topic: 'Laminator', tag: 'In_ABPower_IsOn' })
  })

  it('reads a bare symbolic tag', () => {
    expect(parseAddress('::Run')).toEqual({ tag: 'Run' })
  })

  it('rejects a direct address and an empty cell', () => {
    expect(parseAddress('N7:0')).toBeUndefined()
    expect(parseAddress('')).toBeUndefined()
    expect(parseAddress('::')).toBeUndefined()
  })
})

describe('live mapping', () => {
  it('separates controller tags from memory tags without inventing values', () => {
    const map = liveMapOf(appWith([
      row('ABPower', 'D', '::[Laminator]In_ABPower_IsOn'),
      row('LocalMode', 'D', ''),
      row('Counter', 'A', '::[Laminator]Count_1'),
      row('Direct', 'D', 'N7:0'),
    ]))
    expect(map.totals).toEqual({ all: 4, live: 2, memory: 1, direct: 1 })
    expect(map.topics).toEqual(['Laminator'])
    expect(map.devices).toEqual(['D'])
    expect(map.tags.find(tag => tag.hmi === 'LocalMode')).toMatchObject({ live: false, reason: 'memory' })
    expect(map.tags.find(tag => tag.hmi === 'ABPower')).toMatchObject({ live: true, plcTag: 'In_ABPower_IsOn', topic: 'Laminator' })
  })

  it('keeps the device name off the tag when the csv omits it', () => {
    const map = liveMapOf(appWith([row('Run', 'D', '::Run', '')]))
    expect(map.tags[0]).toMatchObject({ live: true, plcTag: 'Run' })
    expect(map.devices).toEqual([])
  })
})
