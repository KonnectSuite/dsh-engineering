import { describe, expect, it } from 'vitest'
import { globMatches, matchesBulk, selectBulk } from '../src/edit/bulk.ts'
import type { DisplayFile, DisplayObject } from '../src/model.ts'

/** One parsed object with the fields the matcher reads. */
function object(name: string, type = 'text', attributes: Record<string, string> = {}): DisplayObject {
  return { type, name, attributes }
}

/** Two displays with a handful of objects each. */
function displays(): DisplayFile[] {
  return [
    { file: 'export/Main.xml', name: 'Main', objects: [object('Title'), object('NavStart', 'gotoButton'), object('Tank', 'numericDisplay', { visible: '0' })] },
    { file: 'export/Manual.xml', name: 'Manual', objects: [object('Title'), object('NavStart', 'gotoButton'), object('caption')] },
  ]
}

describe('bulk matching', () => {
  it('matches a name without wildcards case-insensitively', () => {
    expect(globMatches('title', 'Title')).toBe(true)
    expect(globMatches('Title', 'Title2')).toBe(false)
  })

  it('honours * wildcards and treats them as literals elsewhere', () => {
    expect(globMatches('Nav*', 'NavStart')).toBe(true)
    expect(globMatches('*Start', 'NavStart')).toBe(true)
    expect(globMatches('Nav.*', 'NavXStart')).toBe(false)
    expect(globMatches('Nav.', 'NavX')).toBe(false)
  })

  it('requires every stated part of the match', () => {
    expect(matchesBulk(object('Tank', 'numericDisplay', { visible: '0' }), { type: 'numericDisplay', attribute: { visible: '0' } })).toBe(true)
    expect(matchesBulk(object('Tank', 'numericDisplay', { visible: '1' }), { type: 'numericDisplay', attribute: { visible: '0' } })).toBe(false)
    expect(matchesBulk(object('Tank', 'numericDisplay'), { name: 'Tank*', type: 'text' })).toBe(false)
  })

  it('never selects structural child elements', () => {
    expect(matchesBulk(object('caption', 'caption'), { name: '*' })).toBe(false)
    expect(matchesBulk(object('states', 'states'), { name: '*' })).toBe(false)
  })

  it('selects across displays and reports which ones changed', () => {
    const selection = selectBulk(displays(), { type: 'gotoButton' }, 10)
    expect(selection.targets.map(target => target.display)).toEqual(['Main', 'Manual'])
    expect(selection.displays).toEqual(['Main', 'Manual'])
    expect(selection.truncated).toBe(false)
  })

  it('stops at the limit and says it truncated', () => {
    const selection = selectBulk(displays(), { name: '*' }, 2)
    expect(selection.targets).toHaveLength(2)
    expect(selection.truncated).toBe(true)
  })

  it('restricts the search to the named displays', () => {
    const selection = selectBulk(displays(), { name: '*' }, 10, ['manual'])
    expect(selection.displays).toEqual(['Manual'])
    expect(selection.targets.every(target => target.display === 'Manual')).toBe(true)
  })
})
