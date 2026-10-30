/**
 * The alarm setup names a display; the terminal needs that display to exist.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

const DISPLAY = `<?xml version="1.0" encoding="UTF-8"?>
<gfx width="320" height="240" backColor="#FFFFFF">
  <object type="text" name="Title" left="10" top="10" width="120" height="20" caption="Line"/>
</gfx>`

function alarms(name: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<alarms version="1.0">
  <alarm display-name="${name}">
    <triggers><trigger id="T1" type="value" exp="{[Line]Alarm_Word.0}"/></triggers>
  </alarm>
</alarms>`
}

function files(name: string): Map<string, string> {
  return new Map([
    ['export/Displays/Main.xml', DISPLAY],
    ['export/Alarms/Alarms.xml', alarms(name)],
    ['export/Tags/Tags.csv', '###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!\nTag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\nA;Alarm_Word;Alarm word;False;PLC;INT\n'],
  ])
}

describe('alarm display check', () => {
  it('reports a display name the export does not have', async () => {
    const l5x = harness(files('Alarm Screen'))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    expect(opened.error).toBeUndefined()
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id, alarms: 'export/Alarms/Alarms.xml' })
    expect(checked.error).toBeUndefined()
    const findings = checked.data?.findings as readonly { rule: string; message: string }[]
    const finding = findings.find(item => item.rule === 'ALARM_DISPLAY_MISSING')
    expect(finding?.message).toContain('Alarm Screen')
  })

  it('reads an Alarms.xml inside the export without being told the path', async () => {
    const l5x = harness(files('Main'))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string }[]
    expect(findings.some(item => item.rule === 'ALARM_TRIGGER_WITHOUT_MESSAGE')).toBe(true)
  })

  it('resolves an alarm tag the export tag CSV declares', async () => {
    const l5x = harness(files('Main'))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string }[]
    expect(findings.some(item => item.rule === 'ALARM_TAG_NOT_IN_HMI')).toBe(false)
  })

  it('flags an alarm tag the export tag CSV does not declare', async () => {
    const withoutTag = new Map([
      ['export/Displays/Main.xml', DISPLAY],
      ['export/Alarms/Alarms.xml', alarms('Main')],
      ['export/Tags/Tags.csv', '###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!\nTag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\nA;Other;Other tag;False;PLC;INT\n'],
    ])
    const l5x = harness(withoutTag)
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id })
    const findings = checked.data?.findings as readonly { rule: string; message: string }[]
    const finding = findings.find(item => item.rule === 'ALARM_TAG_NOT_IN_HMI')
    expect(finding?.message).toContain('Alarm_Word')
  })

  it('stays quiet when the alarm display exists', async () => {
    const l5x = harness(files('Main'))
    const opened = await l5x.call('ftview_open', { root: 'export' })
    const checked = await l5x.call('ftview_check', { view_id: opened.data?.view_id, alarms: 'export/Alarms/Alarms.xml' })
    const findings = checked.data?.findings as readonly { rule: string }[]
    expect(findings.some(item => item.rule === 'ALARM_DISPLAY_MISSING')).toBe(false)
  })
})
