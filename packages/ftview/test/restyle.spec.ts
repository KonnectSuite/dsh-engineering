import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { parseDisplay } from '../src/model.ts'
import { restyleDisplay } from '../src/edit/restyle.ts'
import { SCAFFOLD_THEME } from '../src/edit/scaffold.ts'

/** A display with one of each shell shape, a reference object and an indicator. */
function gfx(background = '#EEEEEE', button = '#6A6A6A'): Map<string, string> {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
    `    <displaySettings width="800" height="600" backColor="${background}"/>`,
    `    <object type="panel" name="Card" left="10" top="10" width="300" height="200" backColor="${background}" borderColor="#FFFFFF" backStyle="solid"/>`,
    `    <object type="text" name="Heading" left="20" top="20" width="200" height="30" color="${background}"><text>HEADING</text></object>`,
    `    <object type="numericDisplay" name="Speed" left="20" top="60" width="120" height="30" backColor="${background}" borderColor="#FFFFFF" color="#000000"/>`,
    `    <object type="momentaryButton" name="Start" left="20" top="100" width="120" height="40" backColor="${button}" borderColor="#000000"/>`,
    '    <object type="gotoButton" name="ToMain" display="Main" left="20" top="150" width="120" height="40" isReferenceObject="true" linkBaseObject="Header.ToMain"/>',
    '    <object type="multistateIndicator" name="Lamp" left="200" top="100" width="40" height="40" backColor="#FF0000"/>',
    '    <object type="connections" name="ignored"><connection name="Value" expression="Speed"/></object>',
    '</gfx>',
    '',
  ].join('\n')
  return new Map([['export/Displays/Main.xml', xml]])
}

describe('restyleDisplay', () => {
  it('repaints the shells and leaves meaning-carrying objects alone', () => {
    const [file, text] = [...gfx().entries()][0] as [string, string]
    const parsed = parseDisplay(file, text)
    const result = restyleDisplay(parsed, SCAFFOLD_THEME)
    expect(result.settings).toEqual({ backColor: SCAFFOLD_THEME.backdrop })
    const byObject = new Map(result.changes.map(change => [change.object, change.attributes]))
    expect(byObject.get('Card')).toEqual({ backColor: SCAFFOLD_THEME.surface, borderColor: SCAFFOLD_THEME.header })
    expect(byObject.get('Heading')).toEqual({ color: SCAFFOLD_THEME.titleColor })
    expect(byObject.get('Speed')).toEqual({ backColor: SCAFFOLD_THEME.surface, borderColor: SCAFFOLD_THEME.header, color: SCAFFOLD_THEME.titleColor })
    expect(byObject.get('Start')).toEqual({ backColor: SCAFFOLD_THEME.header, borderColor: SCAFFOLD_THEME.header })
    expect([...byObject.keys()]).not.toContain('ToMain')
    expect([...byObject.keys()]).not.toContain('Lamp')
    expect(result.skipped.map(entry => entry.object).sort()).toEqual(['Lamp', 'ToMain'])
    expect(result.skipped.find(entry => entry.object === 'ToMain')?.reason).toContain('reference')
  })

  it('takes palette overrides', () => {
    const [file, text] = [...gfx().entries()][0] as [string, string]
    const result = restyleDisplay(parseDisplay(file, text), { ...SCAFFOLD_THEME, header: '#AA0000' })
    const start = result.changes.find(change => change.object === 'Start')
    expect(start?.attributes.backColor).toBe('#AA0000')
  })

  it('reports nothing to change when the display already matches', () => {
    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
      `    <displaySettings width="800" height="600" backColor="${SCAFFOLD_THEME.backdrop}"/>`,
      `    <object type="panel" name="Card" left="10" top="10" width="300" height="200" backColor="${SCAFFOLD_THEME.surface}" borderColor="${SCAFFOLD_THEME.header}" backStyle="solid"/>`,
      '</gfx>',
      '',
    ].join('\n')
    const result = restyleDisplay(parseDisplay('export/Displays/Main.xml', xml), SCAFFOLD_THEME)
    expect(result.changes).toHaveLength(0)
  })
})

describe('ftview_draft_restyle', () => {
  it('stages one operation per changed object and refuses a second identical pass', async () => {
    const l5x = harness(gfx(), { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    const first = await l5x.call('ftview_draft_restyle', { view_id: view, display: 'Main' })
    expect(first.error).toBeUndefined()
    expect((first.data?.changes as unknown[]).length).toBe(4)
    expect(first.data?.settings).toEqual({ backColor: SCAFFOLD_THEME.backdrop })
        expect(first.data?.operation_count).toBe(5)
    const staged = await l5x.call('ftview_draft_ops', {})
    expect((staged.data?.operations as unknown[]).length).toBe(5)
    const second = await l5x.call('ftview_draft_restyle', { view_id: view, display: 'Main' })
    expect(second.error?.code).toBe('NO_CHANGES')
  })

  it('refuses a display that is not in the export', async () => {
    const l5x = harness(gfx(), { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const missing = await l5x.call('ftview_draft_restyle', { view_id: open.data?.view_id as string, display: 'Nope' })
    expect(missing.error?.code).toBe('NOT_FOUND')
  })
})
