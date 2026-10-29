/**
 * Tag rows must be comparable field by field, not just by name.
 */
import { describe, expect, it } from 'vitest'
import { tagDiff } from '../src/tag-diff.ts'
import type { TagRow } from '../src/model.ts'

function tag(name: string, address: string, description = ''): TagRow {
  return {
    name,
    description,
    type: 'A',
    raw: { 'Tag Name': name, 'Tag Type': 'A', DevAddress: address, DataSource: 'PLC', NativeType: 'BOOL', ReadOnly: 'False' },
  }
}

describe('tagDiff', () => {
  it('reports added and removed names', () => {
    const diff = tagDiff([tag('Kept', '::[PLC]A'), tag('Gone', '::[PLC]B')], [tag('Kept', '::[PLC]A'), tag('New', '::[PLC]C')])
    expect(diff.added).toEqual(['New'])
    expect(diff.removed).toEqual(['Gone'])
    expect(diff.changed).toEqual([])
  })

  it('reports a re-addressed tag with both values', () => {
    const diff = tagDiff([tag('Flow', '::[PLC]Old_Address')], [tag('Flow', '::[PLC]New_Address')])
    expect(diff.changed).toEqual([{ name: 'Flow', field: 'DevAddress', before: '::[PLC]Old_Address', after: '::[PLC]New_Address' }])
  })

  it('reports a description change and ignores identical rows', () => {
    const diff = tagDiff([tag('Flow', '::[PLC]A', 'old')], [tag('Flow', '::[PLC]A', 'new')])
    expect(diff.changed).toEqual([{ name: 'Flow', field: 'description', before: 'old', after: 'new' }])
    expect(tagDiff([tag('Flow', '::[PLC]A')], [tag('Flow', '::[PLC]A')]).changed).toEqual([])
  })
})
