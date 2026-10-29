/**
 * A display that names artwork the export does not contain renders an empty box.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

const DISPLAY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="640" height="480" backColor="#FFFFFF"/>',
  '    <image name="Logo" left="10" top="10" width="120" height="60" imageName="Logo"/>',
  '</gfx>',
  '',
].join('\n')

function files(art: boolean): Map<string, string> {
  const map = new Map<string, string>([
    ['export/Displays/Main.xml', DISPLAY],
    ['export/Tags/Tags.csv', 'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\n'],
  ])
  if (art) map.set('export/Images/Logo.png', 'PNG')
  return map
}

describe('missing artwork', () => {
  it('reports an image the export does not ship', async () => {
    const l5x = harness(files(false))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string; message: string }[]
    const finding = findings.find(item => item.rule === 'IMAGE_MISSING')
    expect(finding?.message).toContain('Logo')
  })

  it('stays quiet when the file is beside the displays', async () => {
    const l5x = harness(files(true))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string }[]
    expect(findings.some(item => item.rule === 'IMAGE_MISSING')).toBe(false)
  })
})
