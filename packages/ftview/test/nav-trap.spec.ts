/**
 * A display something navigates to, with no way back out, traps an operator.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

const main = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="640" height="480" backColor="#FFFFFF"/>',
  '    <gotoButton name="OpenPopup" left="20" top="20" width="120" height="40" display="Popup">',
  '        <states><state stateId="0"><caption caption="Open"/></state></states>',
  '    </gotoButton>',
  '</gfx>',
  '',
].join('\n')

const trapped = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="320" height="240" backColor="#FFFFFF"/>',
  '    <text name="Note" left="10" top="10" width="200" height="20" caption="You are here"/>',
  '</gfx>',
  '',
].join('\n')

const escapable = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="320" height="240" backColor="#FFFFFF"/>',
  '    <closeButton name="Close" left="10" top="200" width="80" height="30"/>',
  '</gfx>',
  '',
].join('\n')

function files(popup: string): Map<string, string> {
  return new Map([
    ['export/Displays/Main.xml', main],
    ['export/Displays/Popup.xml', popup],
    ['export/Tags/Tags.csv', 'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\n'],
  ])
}

describe('navigation trap', () => {
  it('reports a reachable display with no way out', async () => {
    const l5x = harness(files(trapped))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_design_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string; message: string }[]
    const finding = findings.find(item => item.rule === 'VIEW-NAV-02')
    expect(finding?.message).toContain('Popup')
  })

  it('stays quiet when the display closes itself', async () => {
    const l5x = harness(files(escapable))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_design_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string }[]
    expect(findings.some(item => item.rule === 'VIEW-NAV-02')).toBe(false)
  })
})
