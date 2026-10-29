/**
 * Binding checks: a screen that names a tag the CSV does not declare.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A comma-delimited Studio tag export with two tags. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;StartPB;Start pushbutton;False;PLC;BOOL',
  'A;BeltSpeed;Belt speed setpoint;False;PLC;REAL',
  '',
].join('\n')

/** One display that binds two known tags and one unknown tag. */
const DISPLAY = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="640" height="480" backColor="#C6C6C6"/>',
  '    <object type="numericDisplay" name="Speed"><connections><connection name="Value" expression="BeltSpeed"/></connections></object>',
  '    <object type="numericDisplay" name="SpeedTypo"><connections><connection name="Value" expression="BeltSped"/></connections></object>',
  '    <object type="momentaryButton" name="Start"><connections><connection name="Value" expression="StartPB"/></connections></object>',
  '    <object type="numericDisplay" name="Literal"><connections><connection name="Value" expression="123"/></connections></object>',
  '    <object type="numericDisplay" name="System"><connections><connection name="Value" expression="{::[Shortcut]Tag}"/></connections></object>',
  '</gfx>',
  '',
].join('\n')

/** Open the fixture. */
async function opened() {
  const l5x = harness(new Map([
    ['export/Displays/Main.xml', DISPLAY],
    ['export/tags.csv', CSV],
  ]))
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('TAG_NOT_BOUND', () => {
  it('reports the misspelled tag and nothing else', async () => {
    const l5x = await opened()
    const checked = await l5x.call('ftview_check', {})
    expect(checked.error).toBeUndefined()
    const findings = (checked.data?.findings ?? []) as Array<Record<string, unknown>>
    const unbound = findings.filter(finding => finding.rule === 'TAG_NOT_BOUND')
    expect(unbound).toHaveLength(1)
    expect(unbound[0]?.evidence).toMatchObject({ display: 'Main', object: 'SpeedTypo', expression: 'BeltSped' })
    expect(String(unbound[0]?.message)).toContain('"BeltSped"')
  })

  it('stays quiet on an export with no tag CSV', async () => {
    const l5x = harness(new Map([['export/Displays/Main.xml', DISPLAY]]))
    const open = await l5x.call('ftview_open', { root: 'export' })
    expect(open.error).toBeUndefined()
    const checked = await l5x.call('ftview_check', {})
    const findings = (checked.data?.findings ?? []) as Array<Record<string, unknown>>
    expect(findings.filter(finding => finding.rule === 'TAG_NOT_BOUND')).toHaveLength(0)
  })
})
