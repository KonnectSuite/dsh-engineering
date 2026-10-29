import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { addObject, renameDisplay, setObject } from '../src/edit/operations.ts'
import { targetPath } from '../src/core.ts'
import type { Application } from '../src/model.ts'
import type { EditDraft } from '../src/edit/drafts.ts'
import { verifyDraft } from '../src/edit/verify-draft.ts'

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
  it('mounts the edit tools after the read surface', () => {
    const { definitions } = harness(exportFiles(), { edit: true })
    expect(definitions.map(definition => definition.name).slice(20)).toEqual([
      'ftview_draft_display_set', 'ftview_draft_display_attrs', 'ftview_draft_display_add', 'ftview_draft_tag_upsert', 'ftview_draft_tags', 'ftview_draft_discard', 'ftview_draft_ops', 'ftview_draft_drop',
      'ftview_draft_display_create', 'ftview_draft_display_scaffold', 'ftview_draft_screen', 'ftview_draft_popup', 'ftview_draft_object_add',
      'ftview_draft_object_set',
      'ftview_draft_restyle',
      'ftview_draft_object_delete', 'ftview_bulk_set', 'ftview_draft_object_order', 'ftview_validate',
      'ftview_verify_import', 'ftview_apply', 'ftview_render',
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

  it('marks an edited existing display as an update in the import manifest', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_set', {
      view_id: view, display: 'Main', object: 'StartPB', attribute: 'visible', value: '0',
    })
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const manifest = l5x.written.get('out/Displays/BatchImport_export.xml') ?? ''
    expect(manifest).toContain('importFile="Main.xml" importType="update" display="Main"')
    expect(manifest).not.toContain('importType="create"')
    expect(l5x.written.get('out/IMPORT.md') ?? '').toContain('1 to update (Main)')
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

describe('draft layout check', () => {
  it('reports a button placed partly over a panel the same draft added', async () => {
    const { l5x, view } = await opened()
    const panel = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main', type: 'panel', name: 'TopPanel',
      attributes_json: '{"left":"0","top":"0","width":"400","height":"100"}',
    })
    expect(panel.error).toBeUndefined()
    const draftId = panel.data?.draft_id as string
    const button = await l5x.call('ftview_draft_object_add', {
      view_id: view, draft_id: draftId, display: 'Main', type: 'momentaryButton', name: 'Start',
      attributes_json: '{"left":"350","top":"50","width":"120","height":"40"}',
    })
    expect(button.error).toBeUndefined()
    const validated = await l5x.call('ftview_validate', { draft_id: draftId })
    expect(validated.error).toBeUndefined()
    const overlap = (validated.data?.findings as Array<{ rule: string }>).filter(finding => finding.rule === 'DRAFT_OVERLAP')
    expect(overlap).toHaveLength(1)
  })

  it('stays quiet when the same draft places objects side by side', async () => {
    const { l5x, view } = await opened()
    const panel = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main', type: 'panel', name: 'TopPanel',
      attributes_json: '{"left":"0","top":"0","width":"300","height":"100"}',
    })
    expect(panel.error).toBeUndefined()
    const draftId = panel.data?.draft_id as string
    const button = await l5x.call('ftview_draft_object_add', {
      view_id: view, draft_id: draftId, display: 'Main', type: 'momentaryButton', name: 'Start',
      attributes_json: '{"left":"320","top":"10","width":"120","height":"40"}',
    })
    expect(button.error).toBeUndefined()
    const validated = await l5x.call('ftview_validate', { draft_id: draftId })
    expect(validated.error).toBeUndefined()
    const overlap = (validated.data?.findings as Array<{ rule: string }>).filter(finding => finding.rule === 'DRAFT_OVERLAP')
    expect(overlap).toHaveLength(0)
  })
})

describe('ftview_draft_tags', () => {
  it('stages several tag rows in one call and writes them on apply', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_tags', {
      view_id: view,
      tags_json: JSON.stringify([
        { name: 'StopPB', description: 'Stop button', type: 'D' },
        { name: 'SP_Start', description: 'Start setpoint', type: 'A' },
      ]),
    })
    expect(staged.error).toBeUndefined()
    const draftId = staged.data?.draft_id as string
    const applied = await l5x.call('ftview_apply', { draft_id: draftId, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const csv = l5x.written.get('out/tags.csv') ?? ''
    expect(csv).toContain('Stop button')
    expect(csv).toContain('SP_Start')
  })

  it('refuses the batch when one entry has neither description nor type', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_tags', {
      view_id: view,
      tags_json: JSON.stringify([{ name: 'StopPB', description: 'Stop button' }, { name: 'Empty' }]),
    })
    expect(staged.error?.code).toBe('INVALID_ARGUMENT')
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error?.code).toBe('NO_DRAFT')
  })

  it('refuses malformed JSON and an empty array', async () => {
    const { l5x, view } = await opened()
    const broken = await l5x.call('ftview_draft_tags', { view_id: view, tags_json: '[' })
    expect(broken.error?.code).toBe('INVALID_ARGUMENT')
    const empty = await l5x.call('ftview_draft_tags', { view_id: view, tags_json: '[]' })
    expect(empty.error?.code).toBe('INVALID_ARGUMENT')
  })
  it('points at the renderer after writing a display', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view,
      display: 'Main',
      type: 'panel',
      name: 'HintPanel',
      attributes_json: JSON.stringify({ left: '40', top: '300', width: '200', height: '80' }),
    })
    const applied = await l5x.call('ftview_apply', { output_root: 'hint' })
    expect(applied.error).toBeUndefined()
    const steps = (applied.next ?? []) as Array<{ tool: string; args?: Record<string, unknown> }>
    const render = steps.find(step => step.tool === 'ftview_render')
    expect(render?.args?.display).toBe('Main')
  })
  it('stages many attributes in one call and reports each one', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_attrs', {
      view_id: view,
      display: 'Main',
      attributes_json: JSON.stringify({ backColor: '#101820', width: 640, visible: true }),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.operation_count).toBe(3)
    const operations = staged.data?.operations as Array<{ attribute: string; value: string }>
    expect(operations.map(operation => operation.attribute)).toEqual(['backColor', 'width', 'visible'])
    expect(operations[1]?.value).toBe('640')
  })

  it('refuses a batch that is not a JSON object of scalars', async () => {
    const { l5x, view } = await opened()
    const broken = await l5x.call('ftview_draft_display_attrs', { view_id: view, display: 'Main', attributes_json: '[' })
    expect(broken.error?.code).toBe('INVALID_ARGUMENT')
    const array = await l5x.call('ftview_draft_display_attrs', { view_id: view, display: 'Main', attributes_json: '["a"]' })
    expect(array.error?.code).toBe('INVALID_ARGUMENT')
    const nested = await l5x.call('ftview_draft_display_attrs', { view_id: view, display: 'Main', attributes_json: '{"states":{"a":1}}' })
    expect(nested.error?.code).toBe('INVALID_ARGUMENT')
  })


  it('does not move an object when only its caption changes', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_set', { view_id: view, display: 'Main', object: 'StartPB', caption: 'Start' })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id as string, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Main.xml') ?? ''
    expect(written).toContain('Start')
    expect(written).not.toContain('left="10"')
    expect(written).not.toContain('top="10"')
  })

  it('reports what a bulk change would touch before staging it', async () => {
    const { l5x, view } = await opened()
    const dry = await l5x.call('ftview_bulk_set', {
      view_id: view, match_json: JSON.stringify({ name: 'Start*' }), attributes_json: JSON.stringify({ visible: '0' }), dry_run: 'yes',
    })
    expect(dry.error).toBeUndefined()
    expect(dry.data?.matched).toBe(1)
    expect(dry.data?.dry_run).toBe(true)
    const abandoned = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(abandoned.error?.code).toBe('NO_DRAFT')
  })

  it('stages one change per matching object across displays', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_bulk_set', {
      view_id: view, match_json: JSON.stringify({ name: '*' }), attributes_json: JSON.stringify({ visible: '0' }),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.matched).toBe(2)
    expect(staged.data?.displays).toBe(2)
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id as string, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/Main.xml')).toContain('visible="0"')
    expect(l5x.written.get('out/Overview.xml')).toContain('visible="0"')
  })

  it('refuses a bulk change that matches nothing and names the types it saw', async () => {
    const { l5x, view } = await opened()
    const result = await l5x.call('ftview_bulk_set', {
      view_id: view, match_json: JSON.stringify({ type: 'keypadButton' }), attributes_json: JSON.stringify({ visible: '0' }),
    })
    expect(result.error?.code).toBe('NO_MATCH')
    expect(result.error?.fix).toContain('Object')
  })
})

describe('object drift between a draft and an export', () => {
  const application = {
    root: 'export',
    name: 'Line',
    displays: [
      {
        file: 'Main.xml',
        name: 'Main',
        parseError: undefined,
        objects: [
          { type: 'panel', name: 'Frame', attributes: { left: '20', top: '20', width: '100', height: '40' } },
        ],
      },
    ],
    tags: [],
  } as unknown as Application
  const draft = (operations: unknown[]) => ({ id: 'd1', operations } as unknown as EditDraft)

  it('reports a staged object the export does not contain', () => {
    const verdict = verifyDraft(draft([
      { kind: 'object_add', file: 'Main.xml', type: 'panel', name: 'NeverImported', attributes: { left: '10' } },
    ]), application)
    expect(verdict.landed).toBe(false)
    expect(verdict.missing).toBe(1)
    expect(verdict.displays[0]?.missing).toContain('NeverImported')
  })

  it('reports geometry drift on an object the export has', () => {
    const verdict = verifyDraft(draft([
      { kind: 'object_set', file: 'Main.xml', object: 'Frame', attributes: { left: '404' } },
    ]), application)
    expect(verdict.landed).toBe(false)
    expect(verdict.changed).toBe(1)
    const row = verdict.displays[0]?.changed[0]?.drift.find(entry => entry.field === 'left')
    expect(row?.staged).toBe('404')
    expect(row?.landed).toBe('20')
  })

  it('accepts a draft whose staged values match the export', () => {
    const verdict = verifyDraft(draft([
      { kind: 'object_set', file: 'Main.xml', object: 'Frame', attributes: { left: '20', top: '20' } },
    ]), application)
    expect(verdict.landed).toBe(true)
    expect(verdict.matched).toBe(1)
  })
})
