import { describe, expect, it } from 'vitest'
import type { DisplayFile, DisplayObject } from '../src/model.ts'
import { diffObjects } from '../src/objects-diff.ts'

/** One display file holding the objects a test declares. */
function display(name: string, objects: readonly DisplayObject[]): DisplayFile {
  return { file: `Displays/${name}.xml`, name, objects }
}

/** One object with the attributes a test cares about. */
function object(name: string, attributes: Record<string, string> = {}, connections?: Record<string, string>): DisplayObject {
  return { type: 'momentaryButton', name, attributes: { left: '10', top: '10', width: '80', height: '30', ...attributes }, ...(connections === undefined ? {} : { connections }) }
}

describe('diffObjects', () => {
  it('reports nothing when the displays match', () => {
    const before = [display('Main', [object('Start')])]
    const after = [display('Main', [object('Start')])]
    expect(diffObjects(before, after, 10)).toEqual({ displays: [], changedDisplays: 0, truncated: false })
  })

  it('reports the field that moved', () => {
    const before = [display('Main', [object('Start')])]
    const after = [display('Main', [object('Start', { left: '40' })])]
    const result = diffObjects(before, after, 10)
    expect(result.changedDisplays).toBe(1)
    expect(result.displays[0]?.changed).toEqual([{ name: 'Start', fields: ['left'] }])
    expect(result.displays[0]?.added).toEqual([])
    expect(result.displays[0]?.removed).toEqual([])
  })

  it('separates added and removed objects', () => {
    const before = [display('Main', [object('Start'), object('Stop')])]
    const after = [display('Main', [object('Stop'), object('Reset')])]
    const result = diffObjects(before, after, 10)
    expect(result.displays[0]?.added).toEqual(['Reset'])
    expect(result.displays[0]?.removed).toEqual(['Start'])
    expect(result.displays[0]?.changed).toEqual([])
  })

  it('treats a rewired object as changed, not replaced', () => {
    const before = [display('Main', [object('Lamp', {}, { Indicator: 'OldTag' })])]
    const after = [display('Main', [object('Lamp', {}, { Indicator: 'NewTag' })])]
    const result = diffObjects(before, after, 10)
    expect(result.displays[0]?.changed).toEqual([{ name: 'Lamp', fields: ['connections'] }])
  })

  it('ignores a display that only one side has', () => {
    const before = [display('Main', [object('Start')])]
    const after = [display('New', [object('Start')])]
    expect(diffObjects(before, after, 10).changedDisplays).toBe(0)
  })

  it('caps the displays it reports and says so', () => {
    const before = [display('A', [object('X')]), display('B', [object('Y')])]
    const after = [display('A', [object('X', { left: '99' })]), display('B', [object('Y', { left: '99' })])]
    const result = diffObjects(before, after, 1)
    expect(result.displays).toHaveLength(1)
    expect(result.changedDisplays).toBe(2)
    expect(result.truncated).toBe(true)
  })
})
