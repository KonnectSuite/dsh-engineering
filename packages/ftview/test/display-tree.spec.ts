import { describe, expect, it } from 'vitest'
import { decodeEntities, encodeEntities, parseDisplayTree, findNamed, setAttribute, removeNode, insertChild, renderElement } from '../src/display-tree.ts'
import { signatureOf } from '../src/handoff.ts'

const GFX = [
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
  '    <displaySettings width="800" height="600"/>',
  '    <group name="Station">',
  '        <text name="Title" caption="Start &amp; Stop" height="20" width="100" left="10" top="10"/>',
  '    </group>',
  '    <panel name="Footer" height="40" width="800" left="0" top="560"/>',
  '</gfx>',
  '',
].join('\n')

describe('display tree', () => {
  it('keeps nesting and element order', () => {
    const tree = parseDisplayTree(GFX)
    expect(tree.issues).toEqual([])
    expect(tree.root.type).toBe('gfx')
    expect(tree.root.children.map(child => child.type)).toEqual(['displaySettings', 'group', 'panel'])
    const group = findNamed(tree.root, 'Station')
    expect(group?.children[0]?.type).toBe('text')
  })

  it('decodes entities on read and encodes them on write', () => {
    const tree = parseDisplayTree(GFX)
    const title = findNamed(tree.root, 'Title')
    expect(title).toBeDefined()
    expect(decodeEntities(title?.attributes.caption ?? '')).toBe('Start & Stop')
    expect(encodeEntities('A & B "q"')).toBe('A &amp; B &quot;q&quot;')
  })

  it('sets an attribute without touching the rest of the document', () => {
    const tree = parseDisplayTree(GFX)
    const title = findNamed(tree.root, 'Title') as NonNullable<ReturnType<typeof findNamed>>
    const updated = setAttribute(tree, title, 'left', '40')
    expect(updated).toContain('left="40"')
    expect(updated).toContain('<panel name="Footer"')
    expect(updated.length).toBe(GFX.length)
  })

  it('inserts a new element inside a group', () => {
    const tree = parseDisplayTree(GFX)
    const group = findNamed(tree.root, 'Station') as NonNullable<ReturnType<typeof findNamed>>
    const element = renderElement('text', { name: 'Sub', caption: 'Hi' }, undefined, 2)
    const updated = insertChild(tree, group, element, 0)
    expect(updated.indexOf('name="Sub"')).toBeLessThan(updated.indexOf('name="Title"'))
    expect(updated).toContain('</group>')
  })

  it('removes one element only', () => {
    const tree = parseDisplayTree(GFX)
    const footer = findNamed(tree.root, 'Footer') as NonNullable<ReturnType<typeof findNamed>>
    const updated = removeNode(tree, footer)
    expect(updated).not.toContain('name="Footer"')
    expect(updated).toContain('name="Title"')
  })
})

describe('handoff signatures', () => {
  it('treats identical displays as matched', () => {
    expect(signatureOf(GFX)).toEqual(signatureOf(GFX))
  })

  it('sees an attribute change and a missing object', () => {
    const changed = GFX.replace('left="10"', 'left="12"')
    expect(signatureOf(GFX)).not.toEqual(signatureOf(changed))
    const removed = GFX.replace('<panel name="Footer" height="40" width="800" left="0" top="560"/>', '')
    expect(signatureOf(GFX)).not.toEqual(signatureOf(removed))
  })
})
