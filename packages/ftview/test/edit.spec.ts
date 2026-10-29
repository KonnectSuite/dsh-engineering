import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { addObject, renameDisplay, setObject } from '../src/edit/operations.ts'
import { targetPath } from '../src/core.ts'

/** A six-column tag CSV with one duplicate name. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;StartPB;Start pushbutton;False;PLC;BOOL',
  'A;StopPB;Stop pushbutton;False;PLC;BOOL',
  '',
].join('\n')

/** One export folder the editor can work over. */
function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Main.xml', '<Display name="Main"><Object name="StartPB" Tag="{[PLC]StartPB}"/></Display>'],
    ['export/Overview.xml', '<Display name="Overview"><Object name="Chart1"/></Display>'],
    ['export/tags.csv', CSV],
  ])
}

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const files = exportFiles()
  const l5x = harness(files, { edit: true })
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, files, view: open.data?.view_id as string }
}

describe('editing registration', () => {
  it('mounts the eleven edit tools after the read surface', () => {
    const { definitions } = harness(exportFiles(), { edit: true })
    expect(definitions.map(definition => definition.name).slice(17)).toEqual([
      'ftview_draft_display_set', 'ftview_draft_display_add', 'ftview_draft_tag_upsert',
      'ftview_draft_display_create', 'ftview_draft_object_add', 'ftview_draft_object_set',
      'ftview_draft_object_delete', 'ftview_draft_object_order', 'ftview_validate',
      'ftview_verify_import', 'ftview_apply',
    ])
  })
})

describe('stage, validate, apply', () => {
  it('writes an edited display to a new folder and leaves the source alone', async () => {
    const { l5x, files, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_set', {
      view_id: view, display: 'Main', object: 'StartPB', attribute: 'visible', value: '0',
    })
    expect(staged.error).toBeUndefined()
    const draftId = staged.data?.draft_id as string
    const validated = await l5x.call('ftview_validate', { draft_id: draftId })
    expect(validated.error).toBeUndefined()
    expect(validated.data?.changed_files).toEqual(['Main.xml'])
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/Main.xml')).toContain('visible="0"')
    expect(l5x.written.has('out/Overview.xml')).toBe(true)
    expect(files.get('export/Main.xml')).not.toContain('visible="0"')
  })

  it('updates one tag row in the copied CSV', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_tag_upsert', { view_id: view, name: 'StopPB', description: 'Stop button' })
    expect(staged.error).toBeUndefined()
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const csv = l5x.written.get('out/tags.csv') ?? ''
    expect(csv).toContain('Stop button')
    expect(csv).toContain('Start pushbutton')
  })

  it('adds a display by copying an existing one under a new name', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_add', { view_id: view, copy_from: 'Main', name: 'MainCopy' })
    expect(staged.error).toBeUndefined()
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/MainCopy.xml')).toContain('name="MainCopy"')
  })

  it('clears the draft after applying', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_tag_upsert', { view_id: view, name: 'StopPB', type: 'A' })
    const draftId = staged.data?.draft_id as string
    const first = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(first.error).toBeUndefined()
    const second = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out2' })
    expect(second.error?.code).toBe('UNKNOWN_DRAFT')
  })
})

describe('refusals', () => {
  it('refuses an unknown display', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_set', { view_id: view, display: 'Nope', attribute: 'visible', value: '0' })
    expect(staged.error?.code).toBe('COMPONENT_NOT_FOUND')
  })

  it('refuses a duplicate new display name', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_add', { view_id: view, copy_from: 'Main', name: 'Overview' })
    expect(staged.error?.code).toBe('COMPONENT_EXISTS')
  })

  it('refuses an output folder that already exists', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_tag_upsert', { view_id: view, name: 'StopPB', type: 'A' })
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id, output_root: 'export' })
    expect(applied.error?.code).toBe('OUTPUT_EXISTS')
  })
})

describe('display naming', () => {
  it('does not put a name attribute on a gfx display', () => {
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">\n  <displaySettings width="800" height="600"/>\n</gfx>\n'
    expect(renameDisplay(xml, 'Renamed')).toBe(xml)
  })

  it('renames the legacy display root that carries the name', () => {
    const renamed = renameDisplay('<Display name="Old"><Object name="A"/></Display>', 'New')
    expect(renamed).toContain('name="New"')
    expect(renamed).not.toContain('name="Old"')
  })
})
describe('resolved target paths', () => {
  it('uses the display path of a resolved target instead of "[object Object]"', () => {
    expect(targetPath({ targetKey: {}, displayPath: 'C:/Projects/out' })).toBe('C:/Projects/out')
    expect(targetPath('out')).toBe('out')
  })
})
describe('stateful controls', () => {
  it('writes button states and captions as children', () => {
    const xml = addObject('<gfx><displaySettings width="100" height="100"/></gfx>', {
      kind: 'object_add', file: 'x', type: 'momentaryButton', name: 'Start', attributes: { left: '0', top: '0', width: '10', height: '10' },
      caption: 'START', connections: { Value: 'AutoManual' },
    })
    expect(xml).toContain('<states>')
    expect(xml).toContain('caption="START"')
    expect(xml).not.toContain('caption="START" backColor')
    expect(xml.indexOf('<states>')).toBeLessThan(xml.indexOf('<connections>'))
  })

  it('writes gotoButton captions as a caption child', () => {
    const xml = addObject('<gfx><displaySettings/></gfx>', {
      kind: 'object_add', file: 'x', type: 'gotoButton', name: 'Nav', attributes: { left: '0', top: '0', width: '10', height: '10', display: 'Setup Screen' }, caption: 'SETUP',
    })
    expect(xml).toContain('<caption ')
    expect(xml).toContain('caption="SETUP"')
  })

  it('writes a visibility animation', () => {
    const xml = addObject('<gfx><displaySettings/></gfx>', {
      kind: 'object_add', file: 'x', type: 'panel', name: 'Banner', attributes: { left: '0', top: '0', width: '10', height: '10' },
      animations: { visibility: { expression: '{AutoRunning} = 0', expressionTrueState: 'visible' } },
    })
    expect(xml).toContain('<animateVisibility')
    expect(xml).toContain('expressionTrueState="visible"')
  })
})
describe('indicator binding', () => {
  it('binds a multistateIndicator through the Indicator connection', () => {
    const xml = addObject('<gfx><displaySettings/></gfx>', {
      kind: 'object_add', file: 'x', type: 'multistateIndicator', name: 'Lamp', attributes: { left: '0', top: '0', width: '10', height: '10' },
      states: [{ stateId: '0', value: 0, backColor: '#F5E11B' }, { stateId: '1', value: 1, backColor: '#45D483' }],
      connections: { Value: 'AutoManual' },
    })
    expect(xml).toContain('name="Indicator"')
    expect(xml).not.toContain('name="Value"')
  })
})
describe('changing a caption', () => {
  it('updates a button caption inside its states, not as an attribute', () => {
    let xml = addObject('<gfx><displaySettings/></gfx>', { kind: 'object_add', file: 'x', type: 'momentaryButton', name: 'B', attributes: { left: '0', top: '0', width: '10', height: '10' }, caption: 'OLD' })
    xml = setObject(xml, { kind: 'object_set', file: 'x', object: 'B', caption: 'NEW', attributes: {} })
    expect(xml).toContain('caption="NEW"')
    expect(xml).not.toContain('caption="OLD"')
    expect(xml).not.toMatch(/<momentaryButton[^>]*caption=/u)
  })

  it('updates a gotoButton caption child', () => {
    let xml = addObject('<gfx><displaySettings/></gfx>', { kind: 'object_add', file: 'x', type: 'gotoButton', name: 'N', attributes: { left: '0', top: '0', width: '10', height: '10', display: 'Main' }, caption: 'OLD' })
    xml = setObject(xml, { kind: 'object_set', file: 'x', object: 'N', caption: 'NEW', attributes: {} })
    expect(xml).toContain('caption="NEW"')
    expect(xml).not.toContain('caption="OLD"')
  })
})
describe('authoring into a new draft display', () => {
  it('adds objects to a display this draft just created', async () => {
    const { l5x, view } = await opened()
    const created = await l5x.call('ftview_draft_display_create', { view_id: view, name: 'Fresh', width: 800, height: 600 })
    expect(created.error).toBeUndefined()
    const draftId = created.data?.draft_id as string
    const added = await l5x.call('ftview_draft_object_add', {
      view_id: view, draft_id: draftId, display: 'Fresh', type: 'text', name: 'Hello',
      attributes_json: '{"left":"10","top":"10","width":"200","height":"40"}', caption: 'HELLO',
    })
    expect(added.error).toBeUndefined()
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'freshout' })
    expect(applied.error).toBeUndefined()
    const written = [...l5x.written.values()].join('\n')
    expect(written).toContain('name="Hello"')
    expect(written).toContain('HELLO')
  })
})
