/**
 * Modal popups from one description.
 */
import { describe, expect, it } from 'vitest'
import { popupLayout, type PopupObject } from '../src/edit/popup.ts'
import { harness } from './harness.ts'

/** A Studio-shaped display so the export opens with a known size. */
const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="1000" height="700" backColor="#C6C6C6"/>',
  '</gfx>',
  '',
].join('\n')

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const l5x = harness(new Map([['export/Displays/Overview.xml', GFX]]), { edit: true })
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, view: open.data?.view_id as string }
}

/** Rectangle of one popup object. */
function rect(object: PopupObject): { left: number; top: number; width: number; height: number } {
  return {
    left: Number(object.attributes.left),
    top: Number(object.attributes.top),
    width: Number(object.attributes.width),
    height: Number(object.attributes.height),
  }
}

/** True when two rectangles share area. */
function overlaps(a: { left: number; top: number; width: number; height: number }, b: { left: number; top: number; width: number; height: number }): boolean {
  return a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height
}

describe('popupLayout', () => {
  it('keeps the message and every button inside the popup', () => {
    const layout = popupLayout({
      title: 'CONFIRM',
      message: 'ARE YOU SURE YOU WANT\nTO START THE SYSTEM?',
      buttons: [{ label: 'NO' }, { label: 'YES' }],
    })
    const frame = { left: 0, top: 0, width: layout.width, height: layout.height }
    for (const object of layout.objects) {
      const box = rect(object)
      expect(box.left).toBeGreaterThanOrEqual(frame.left)
      expect(box.top).toBeGreaterThanOrEqual(frame.top)
      expect(box.left + box.width).toBeLessThanOrEqual(frame.width)
      expect(box.top + box.height).toBeLessThanOrEqual(frame.height)
    }
  })

  it('lays the buttons out side by side without overlap', () => {
    const layout = popupLayout({ message: 'STOP?', buttons: [{ label: 'NO' }, { label: 'YES' }, { label: 'CANCEL' }] })
    const buttons = layout.objects.filter(object => object.type.endsWith('Button'))
    expect(buttons).toHaveLength(3)
    for (let index = 1; index < buttons.length; index += 1) {
      expect(overlaps(rect(buttons[index - 1]!), rect(buttons[index]!))).toBe(false)
    }
  })

  it('uses closeButton by default and gotoButton when the button opens a display', () => {
    const layout = popupLayout({
      message: 'GO TO MANUAL?',
      buttons: [{ label: 'NO' }, { label: 'MANUAL', action: 'goto', display: 'Manual' }],
    })
    const buttons = layout.objects.filter(object => object.type.endsWith('Button'))
    expect(buttons[0]?.type).toBe('closeButton')
    expect(buttons[1]?.type).toBe('gotoButton')
    expect(buttons[1]?.attributes.display).toBe('Manual')
  })

  it('opens as an onTop display that carries no title bar', () => {
    const layout = popupLayout({ message: 'READY', buttons: [{ label: 'OK' }] })
    expect(layout.settings.displayType).toBe('onTop')
    expect(layout.settings.titleBar).toBe('false')
  })

  it('refuses a popup with no message, no buttons, or too many buttons', () => {
    expect(() => popupLayout({ message: '  ', buttons: [{ label: 'OK' }] })).toThrow(/needs a message/u)
    expect(() => popupLayout({ message: 'GO', buttons: [] })).toThrow(/at least one button/u)
    expect(() => popupLayout({ message: 'GO', buttons: [{ label: 'A' }, { label: 'B' }, { label: 'C' }, { label: 'D' }] })).toThrow(/at most 3/u)
  })

  it('refuses a popup too small for its content', () => {
    expect(() => popupLayout({ message: 'GO', buttons: [{ label: 'OK' }], width: 120, height: 90 })).toThrow(/too small/u)
  })
})

describe('ftview_draft_popup', () => {
  it('stages a new onTop display with its message and buttons', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_popup', {
      view_id: view,
      display: 'Confirm Popup',
      spec_json: JSON.stringify({
        title: 'CONFIRM',
        message: 'ARE YOU SURE YOU WANT\nTO START THE SYSTEM?',
        buttons: [{ label: 'NO', backColor: '#B91C1C' }, { label: 'YES' }],
      }),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.draft_id).toBeTypeOf('string')
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Displays/Confirm Popup.xml') ?? ''
    expect(written).toContain('displayType="onTop"')
    expect(written).toContain('PopupMessage')
    expect(written).toContain('PopupButton2')
    expect(written).toContain('YES')
  })

  it('refuses a message without buttons and a goto button without a display', async () => {
    const { l5x, view } = await opened()
    const noButtons = await l5x.call('ftview_draft_popup', {
      view_id: view,
      display: 'Confirm Popup',
      spec_json: JSON.stringify({ message: 'ARE YOU SURE?' }),
    })
    expect(noButtons.error?.code).toBe('INVALID_ARGUMENT')
    const noDisplay = await l5x.call('ftview_draft_popup', {
      view_id: view,
      display: 'Confirm Popup',
      spec_json: JSON.stringify({ message: 'GO?', buttons: [{ label: 'GO', action: 'goto' }] }),
    })
    expect(noDisplay.error?.code).toBe('INVALID_ARGUMENT')
    expect(noDisplay.error?.message).toMatch(/names none/u)
  })
})
