import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

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
    expect(definitions.map(definition => definition.name).slice(9)).toEqual([
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
