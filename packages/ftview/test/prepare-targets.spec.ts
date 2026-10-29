import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** One gfx display with a single named object. */
function files(): Map<string, string> {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
    '    <displaySettings width="800" height="600" backColor="#C6C6C6"/>',
    '    <object type="panel" name="Card" left="10" top="10" width="300" height="200" backColor="#FFFFFF" backStyle="solid"/>',
    '</gfx>',
    '',
  ].join('\n')
  return new Map([['export/Displays/Main.xml', xml]])
}

describe('DRAFT_TARGET_MISSING', () => {
  it('reports an object_set on a name the display does not have', async () => {
    const l5x = harness(files(), { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    await l5x.call('ftview_draft_object_set', { view_id: view, display: 'Main', object: 'Cardd', attributes_json: '{"backColor":"#13232F"}' })
    const checked = await l5x.call('ftview_validate', {})
    const rows = (checked.data?.findings ?? []).filter(finding => finding.rule === 'DRAFT_TARGET_MISSING')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.evidence).toMatchObject({ display: 'Main', object: 'Cardd', operation: 'object_set' })
    expect(checked.data?.by_rule?.DRAFT_TARGET_MISSING).toBe(1)
  })

  it('reports an object_delete on a name that is not there', async () => {
    const l5x = harness(files(), { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    await l5x.call('ftview_draft_object_delete', { view_id: view, display: 'Main', object: 'Ghost' })
    const checked = await l5x.call('ftview_validate', {})
    const rows = (checked.data?.findings ?? []).filter(finding => finding.rule === 'DRAFT_TARGET_MISSING')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.evidence).toMatchObject({ object: 'Ghost', operation: 'object_delete' })
  })

  it('accepts a set on an object the same draft just added', async () => {
    const l5x = harness(files(), { edit: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string
    await l5x.call('ftview_draft_object_add', {
      view_id: view,
      display: 'Main',
      type: 'text',
      name: 'Caption',
      attributes_json: '{"left":"20","top":"20","width":"120","height":"24"}',
    })
    await l5x.call('ftview_draft_object_set', { view_id: view, display: 'Main', object: 'Caption', attributes_json: '{"color":"#FFFFFF"}' })
    const checked = await l5x.call('ftview_validate', {})
    expect((checked.data?.findings ?? []).filter(finding => finding.rule === 'DRAFT_TARGET_MISSING')).toHaveLength(0)
  })
})
