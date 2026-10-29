/**
 * Display settings are edited where Studio keeps them.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A display that already has a settings element. */
const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="640" height="480" backColor="#C6C6C6" displayNumber="1"/>',
  '</gfx>',
  '',
].join('\n')

/** A display that lost its settings element. */
const BARE = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '</gfx>',
  '',
].join('\n')

/** Open one display folder with the editing entry mounted. */
async function opened(xml: string) {
  const l5x = harness(new Map([['export/Displays/Main.xml', xml]]), { edit: true })
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, view: open.data?.view_id as string }
}

describe('ftview_draft_display_set', () => {
  it('writes size and colour into displaySettings', async () => {
    const { l5x, view } = await opened(GFX)
    for (const [attribute, value] of [['width', '1200'], ['height', '800'], ['backColor', '#101820']]) {
      const staged = await l5x.call('ftview_draft_display_set', { view_id: view, display: 'Main', attribute, value })
      expect(staged.error).toBeUndefined()
    }
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('out/Displays/Main.xml') ?? ''
    expect(text).toContain('<displaySettings')
    expect(text).toContain('width="1200"')
    expect(text).toContain('height="800"')
    expect(text).toContain('backColor="#101820"')
    expect(text).not.toMatch(/<gfx[^>]*width=/u)
  })

  it('adds a settings element when the display has none', async () => {
    const { l5x, view } = await opened(BARE)
    const staged = await l5x.call('ftview_draft_display_set', { view_id: view, display: 'Main', attribute: 'displayType', value: 'onTop' })
    expect(staged.error).toBeUndefined()
    const validate = await l5x.call('ftview_validate', {})
    expect(validate.error).toBeUndefined()
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('out/Displays/Main.xml') ?? ''
    expect(text).toContain('<displaySettings')
    expect(text).toContain('displayType="onTop"')
  })

  it('still edits a named object attribute', async () => {
    const { l5x, view } = await opened(
      GFX.replace('</gfx>', '    <text name="Caption" left="10" top="10" width="100" height="20" caption="A"/>\n</gfx>'),
    )
    const staged = await l5x.call('ftview_draft_display_set', { view_id: view, display: 'Main', object: 'Caption', attribute: 'caption', value: 'B' })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('out/Displays/Main.xml') ?? ''
    expect(text).toContain('caption="B"')
  })
})
