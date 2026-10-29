/**
 * Whole-screen layout from one description.
 */
import { describe, expect, it } from 'vitest'
import { screenLayout, type ScreenObject } from '../src/edit/screen.ts'
import { harness } from './harness.ts'

/** A Studio-shaped display with a known size. */
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

/** Rectangle of one placed object. */
function rect(object: ScreenObject): { left: number; top: number; width: number; height: number } {
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

const SPEC = {
  title: 'LAMINATOR',
  subtitle: 'cutter and stack status',
  cards: [
    { title: 'CUTTER', rows: [{ kind: 'value', label: 'Belt speed', tag: 'BeltSpeed' }, { kind: 'lamp', label: 'Cut off', tag: 'CutOff' }] },
    { title: 'STACK', rows: [{ kind: 'value', label: 'Fan fold count', tag: 'StackCount' }] },
  ],
  nav: [{ label: 'MAIN', display: 'MAIN' }, { label: 'MANUAL', display: 'MANUAL' }],
} as const

describe('screen palette', () => {
  it('stages header and footer in the requested palette and reports contrast', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      theme_json: JSON.stringify({ header: '#004A6B', footer: '#004A6B', titleColor: '#FFFFFF', footerColor: '#FFFFFF' }),
    })
    expect(staged.error).toBeUndefined()
    const theme = staged.data?.theme as Record<string, string>
    expect(theme.header).toBe('#004A6B')
    const contrast = staged.data?.contrast as readonly { pair: string; ratio: number; pass: boolean }[]
    expect(contrast).toHaveLength(2)
    expect(contrast.every(row => row.pass)).toBe(true)
    expect(staged.data?.theme).toMatchObject({ header: '#004A6B', footer: '#004A6B' })
  })

  it('flags a palette whose title would not be readable', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      theme_json: JSON.stringify({ header: '#F2F2F2', titleColor: '#FFFFFF' }),
    })
    expect(staged.error).toBeUndefined()
    const contrast = staged.data?.contrast as readonly { pair: string; pass: boolean }[]
    expect(contrast[0]).toMatchObject({ pair: 'title on header', pass: false })
  })

  it('refuses an unknown palette slot or a malformed colour', async () => {
    const { l5x, view } = await opened()
    const slot = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      theme_json: JSON.stringify({ accent: '#0088C8' }),
    })
    expect(slot.error?.code).toBe('INVALID_ARGUMENT')
    expect(slot.error?.message).toContain('accent')
    const colour = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      theme_json: JSON.stringify({ header: 'blue' }),
    })
    expect(colour.error?.code).toBe('INVALID_ARGUMENT')
    expect(colour.error?.fix).toContain('#0088C8')
  })
})

describe('screenLayout', () => {
  it('puts the cards and the navigation row inside the body slot', () => {
    const layout = screenLayout({ ...SPEC, width: 1000, height: 700 })
    const body = layout.slots.body
    for (const card of layout.slots.cards) {
      expect(card.left).toBeGreaterThanOrEqual(body.left)
      expect(card.top).toBeGreaterThanOrEqual(body.top)
      expect(card.left + card.width).toBeLessThanOrEqual(body.left + body.width)
      expect(card.top + card.height).toBeLessThanOrEqual(body.top + body.height)
    }
    const nav = layout.slots.nav
    expect(nav).toBeDefined()
    expect(nav!.top + nav!.height).toBeLessThanOrEqual(body.top + body.height)
    for (const button of layout.slots.navButtons) {
      expect(button.top).toBeGreaterThanOrEqual(nav!.top)
      expect(button.top + button.height).toBeLessThanOrEqual(nav!.top + nav!.height)
    }
  })

  it('never overlaps two cards or two navigation buttons', () => {
    const layout = screenLayout({ ...SPEC, width: 1000, height: 700 })
    const cards = layout.slots.cards
    expect(overlaps(cards[0]!, cards[1]!)).toBe(false)
    const buttons = layout.slots.navButtons
    expect(overlaps(buttons[0]!, buttons[1]!)).toBe(false)
  })

  it('draws rows as reads and lamps with the right type and connection', () => {
    const layout = screenLayout({ ...SPEC, width: 1000, height: 700 })
    const value = layout.objects.find(object => object.name === 'Card1Row1Value')
    expect(value?.type).toBe('numericDisplay')
    expect(value?.connections).toEqual({ Value: 'BeltSpeed' })
    const lamp = layout.objects.find(object => object.name === 'Card1Row2Lamp')
    expect(lamp?.type).toBe('multistateIndicator')
    expect(lamp?.connections).toEqual({ Indicator: 'CutOff' })
    expect(lamp?.states?.map(state => state.stateId)).toEqual(['0', '1'])
    const nav = layout.objects.find(object => object.name === 'Nav2')
    expect(nav?.type).toBe('gotoButton')
    expect(nav?.attributes.display).toBe('MANUAL')
    expect(nav?.caption).toBe('MANUAL')
  })

  it('refuses more cards, more buttons, or an empty description', () => {
    const tooManyCards = { ...SPEC, cards: Array.from({ length: 5 }, (_, index) => ({ title: `C${index}`, rows: [] })) }
    expect(() => screenLayout({ ...tooManyCards, width: 1000, height: 700 })).toThrow(/cards/u)
    const tooManyNav = { ...SPEC, nav: Array.from({ length: 5 }, (_, index) => ({ label: `N${index}`, display: 'MAIN' })) }
    expect(() => screenLayout({ ...tooManyNav, width: 1000, height: 700 })).toThrow(/navigation/u)
    expect(() => screenLayout({ title: 'X', width: 1000, height: 700 })).toThrow(/at least one/u)
  })

  it('refuses a card whose rows do not fit', () => {
    const rows = Array.from({ length: 20 }, (_, index) => ({ kind: 'value' as const, label: `L${index}`, tag: `T${index}` }))
    expect(() => screenLayout({ title: 'X', cards: [{ title: 'BIG', rows }], width: 640, height: 480 })).toThrow(/rows/u)
  })
})

describe('ftview_draft_screen', () => {
  it('stages the whole screen in one call and validates cleanly', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_screen', { view_id: view, display: 'Overview', spec_json: JSON.stringify(SPEC) })
    expect(staged.error).toBeUndefined()
    const placed = staged.data?.placed as readonly { name: string }[]
    expect(staged.data?.operation_count).toBe(placed.length)
    expect(placed.map(item => item.name)).toContain('Nav1')
    expect(placed.map(item => item.name)).toContain('Card2Row1Value')
    const validate = await l5x.call('ftview_validate', {})
    expect(validate.error).toBeUndefined()
    const critical = (validate.data?.findings as readonly { severity: string }[]).filter(finding => finding.severity === 'critical')
    expect(critical, JSON.stringify(critical)).toEqual([])
  })

  it('stages HMI tags in the same draft as the screen', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      tags_json: JSON.stringify([{ name: 'BeltSpeed', description: 'Cutter belt speed' }]),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.tags).toEqual(['BeltSpeed'])
    expect(staged.summary).toContain('1 tag row')
    expect(staged.data?.operation_count).toBe((staged.data?.placed as readonly unknown[]).length + 1)
    // Validation and apply need a tag CSV in the export; staging is what this test proves.
    expect(staged.data?.placed).toBeDefined()
  })

  it('refuses a tag row without a description or type', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify(SPEC),
      tags_json: JSON.stringify([{ name: 'Empty' }]),
    })
    expect(staged.error?.code).toBe('INVALID_ARGUMENT')
    expect(staged.error?.message).toContain('Empty')
  })

  it('refuses malformed JSON and unknown row kinds', async () => {
    const { l5x, view } = await opened()
    const broken = await l5x.call('ftview_draft_screen', { view_id: view, display: 'Overview', spec_json: '{"title":' })
    expect(broken.error?.code).toBe('INVALID_ARGUMENT')
    const badKind = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Overview',
      spec_json: JSON.stringify({ title: 'X', cards: [{ title: 'C', rows: [{ kind: 'gauge', label: 'L', tag: 'T' }] }] }),
    })
    expect(badKind.error?.code).toBe('INVALID_ARGUMENT')
    expect(badKind.error?.message).toMatch(/kind/u)
  })
})
