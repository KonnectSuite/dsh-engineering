/**
 * The display scaffold: geometry, slots and the staged draft.
 */
import { describe, expect, it } from 'vitest'
import { scaffoldLayout } from '../src/edit/scaffold.ts'
import { harness } from './harness.ts'

/** A Studio-shaped display with a known size. */
const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="1000" height="700" backColor="#C6C6C6"/>',
  '</gfx>',
  '',
].join('\n')

/** One export folder with one empty display. */
function exportFiles(): Map<string, string> {
  return new Map([['export/Displays/Overview.xml', GFX]])
}

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const files = exportFiles()
  const l5x = harness(files, { edit: true })
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, view: open.data?.view_id as string }
}

describe('scaffoldLayout', () => {
  it('keeps the body between the header and the footer, inside the margins', () => {
    const layout = scaffoldLayout({ width: 1000, height: 700, title: 'LAMINATOR', subtitle: 'overview', footer: 'AryaCode' })
    const { header, body, footer, title } = layout.slots
    expect(header).toEqual({ left: 0, top: 0, width: 1000, height: 88 })
    expect(footer.left).toBe(0)
    expect(footer.top + footer.height).toBe(700)
    expect(body.top).toBeGreaterThanOrEqual(header.height)
    expect(body.top + body.height).toBeLessThanOrEqual(footer.top)
    expect(title.left).toBeGreaterThan(0)
    expect(title.top + title.height).toBeLessThanOrEqual(header.height)
  })

  it('draws backdrop, header, title, content, footer and footer text in z-order', () => {
    const layout = scaffoldLayout({ width: 800, height: 600, title: 'T' })
    expect(layout.objects.map(item => item.name)).toEqual(['Backdrop', 'HeaderBar', 'Title', 'ContentSurface', 'FooterBar', 'FooterText'])
    expect(layout.objects[0]?.type).toBe('panel')
    expect(layout.objects[2]?.attributes.caption).toBe('T')
    expect(layout.objects[2]?.attributes.backStyle).toBe('transparent')
    expect(layout.slots.subtitle).toBeUndefined()
  })

  it('adds the subtitle line only when asked', () => {
    const withSubtitle = scaffoldLayout({ width: 800, height: 600, title: 'T', subtitle: 'S' })
    expect(withSubtitle.objects.map(item => item.name)).toContain('Subtitle')
    expect(withSubtitle.slots.subtitle).toBeDefined()
  })

  it('refuses a display too small to hold the chrome', () => {
    expect(() => scaffoldLayout({ width: 200, height: 160, title: 'T' })).toThrow(/no room|too small/u)
  })
})

describe('ftview_draft_display_scaffold', () => {
  it('reads the display size and stages the whole chrome', async () => {
    const { l5x, view } = await opened()
    const result = await l5x.call('ftview_draft_display_scaffold', { view_id: view, display: 'Overview', title: 'LAMINATOR' })
    expect(result.error).toBeUndefined()
    expect(result.data?.operation_count).toBe(6)
    const slots = result.data?.slots as { body: { width: number; height: number; left: number; top: number } }
    expect(slots.body.width).toBe(1000 - 48)
    expect(slots.body.left).toBe(24)
    expect(slots.body.top).toBe(88 + 24)
    const placed = result.data?.placed as readonly { name: string }[]
    expect(placed.map(item => item.name)).toEqual(['Backdrop', 'HeaderBar', 'Title', 'ContentSurface', 'FooterBar', 'FooterText'])
  })

  it('accumulates into the same draft on a second call', async () => {
    const { l5x, view } = await opened()
    const first = await l5x.call('ftview_draft_display_scaffold', { view_id: view, display: 'Overview', title: 'A' })
    const second = await l5x.call('ftview_draft_display_scaffold', { view_id: view, display: 'Overview', title: 'B' })
    expect(second.data?.draft_id).toBe(first.data?.draft_id)
    expect(second.data?.operation_count).toBe(12)
  })

  it('accepts an explicit size for a display the draft creates', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_display_create', { view_id: view, name: 'Blank', width: 640, height: 480 })
    const result = await l5x.call('ftview_draft_display_scaffold', { view_id: view, display: 'Blank', title: 'BLANK', width: 640, height: 480 })
    expect(result.error).toBeUndefined()
    expect(result.data?.operation_count).toBe(7)
  })

  it('refuses when the size cannot be read and none is passed', async () => {
    const files = new Map([['export/Displays/Odd.xml', '<?xml version="1.0"?>\n<gfx></gfx>\n']])
    const l5x = harness(files, { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const result = await l5x.call('ftview_draft_display_scaffold', { view_id: open.data?.view_id as string, display: 'Odd', title: 'X' })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })

  it('produces a display with no critical validation findings', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_scaffold', { view_id: view, display: 'Overview', title: 'READY', subtitle: 'all slots clear' })
    expect(staged.error).toBeUndefined()
    const validate = await l5x.call('ftview_validate', {})
    expect(validate.error).toBeUndefined()
    const findings = (validate.data?.findings ?? []) as readonly { severity: string; rule: string; message: string }[]
    const critical = findings.filter(finding => finding.severity === 'critical')
    expect(critical, JSON.stringify(critical)).toEqual([])
  })
})
