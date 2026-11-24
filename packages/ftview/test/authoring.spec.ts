import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { ViewSession } from '../src/session.ts'

/** A Studio-shaped display: `<gfx>` root, schema declaration, nested group. */
const GFX = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
  '    <displaySettings width="800" height="600" backColor="#C6C6C6"/>',
  '    <panel name="Header" height="60" width="800" left="0" top="0"/>',
  '    <group name="Station">',
  '        <text name="Title" height="20" width="120" left="20" top="80" caption="Start"/>',
  '    </group>',
  '</gfx>',
  '',
].join('\n')

const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;SystemRunning;Running;False;PLC;BOOL',
  '',
].join('\n')

/** One export folder with a real display shape and one tag. */
function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Displays/Main Screen.xml', GFX],
    ['export/Tags/tags.csv', CSV],
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

/** Schema availability depends on the host; assert one of the two honest outcomes. */
function schemaOutcome(result: { data?: Record<string, unknown> }): { ran: boolean; errors: number } {
  const schema = result.data?.schema as { ran: boolean; findings: { error: boolean }[]; unavailable?: string } | undefined
  if (schema === undefined) return { ran: false, errors: 0 }
  expect(typeof schema.ran).toBe('boolean')
  if (!schema.ran) expect(typeof schema.unavailable).toBe('string')
  return { ran: schema.ran, errors: schema.findings.filter(finding => finding.error).length }
}

describe('authoring', { timeout: 30_000 }, () => {
  it('creates a display from a schema-shaped skeleton and applies it', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_create', { view_id: view, name: 'Arya Test', width: 1024, height: 768 })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('ftview_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error).toBeUndefined()
    expect(schemaOutcome(validated).errors).toBe(0)
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Displays/Arya Test.xml') ?? ''
    expect(written).toContain('<gfx')
    expect(written).toContain('width="1024"')
    expect(applied.data?.manifest).toBe('Displays/BatchImport_export.xml')
    expect(l5x.written.get('out/IMPORT.md') ?? '').toContain('Multiple displays batch import file')
    expect(l5x.written.get('out/Displays/BatchImport_export.xml') ?? '').toContain('importType=')
  })

  it('adds an object at the display root', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'Note',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '120' }),
      caption: 'Line 1',
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('ftview_validate', { draft_id: staged.data?.draft_id })
    expect(schemaOutcome(validated).errors).toBe(0)
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/Displays/Main Screen.xml') ?? '').toContain('<text name="Note"')
  })

  it('adds an object inside a named group', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'momentaryButton', name: 'StartButton', parent: 'Station',
      attributes_json: JSON.stringify({ height: '50', width: '100', left: '20', top: '110' }),
      connections_json: JSON.stringify({ Value: 'SystemRunning' }),
    })
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Displays/Main Screen.xml') ?? ''
    const group = written.slice(written.indexOf('<group name="Station"'), written.indexOf('</group>'))
    expect(group).toContain('<momentaryButton name="StartButton"')
    expect(group).toContain('expression="SystemRunning"')
  })

  it('says nothing when a connection tag is declared in the export', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'numericDisplay', name: 'Count',
      attributes_json: JSON.stringify({ height: '24', width: '120', left: '20', top: '150' }),
      connections_json: JSON.stringify({ Value: 'SystemRunning' }),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.unresolved_tags).toBeUndefined()
    expect(String(staged.summary)).not.toContain('not declared')
  })

  it('names a connection tag the export tag CSV does not declare', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'numericDisplay', name: 'Ghost',
      attributes_json: JSON.stringify({ height: '24', width: '120', left: '20', top: '180' }),
      connections_json: JSON.stringify({ Value: 'GhostTag' }),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.unresolved_tags).toEqual(['GhostTag'])
    expect(String(staged.summary)).toContain('GhostTag')
    expect(String(staged.summary)).toContain('not declared')
  })

  it('accepts a member of a declared tag without warning', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'numericDisplay', name: 'Member',
      attributes_json: JSON.stringify({ height: '24', width: '120', left: '20', top: '210' }),
      connections_json: JSON.stringify({ Value: 'SystemRunning.0' }),
    })
    expect(staged.data?.unresolved_tags).toBeUndefined()
  })

  it('changes a caption and a connection', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'Note',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '120' }),
    })
    await l5x.call('ftview_draft_object_set', { view_id: view, display: 'Main Screen', object: 'Note', caption: 'Line 2' })
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/Displays/Main Screen.xml') ?? '').toContain('caption="Line 2"')
  })

  it('deletes an object', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_delete', { view_id: view, display: 'Main Screen', object: 'Title' })
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('out/Displays/Main Screen.xml') ?? '').not.toContain('name="Title"')
  })

  it('reorders an object inside its group', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'Second', parent: 'Station',
      attributes_json: JSON.stringify({ height: '20', width: '100', left: '20', top: '140' }),
    })
    await l5x.call('ftview_draft_object_order', { view_id: view, display: 'Main Screen', object: 'Second', index: 0 })
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('out/Displays/Main Screen.xml') ?? ''
    expect(written.indexOf('name="Second"')).toBeLessThan(written.indexOf('name="Title"'))
  })

  it('refuses an attribute the schema does not declare for that element, before staging it', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'Bad',
      attributes_json: JSON.stringify({ height: '20', width: '100', left: '0', top: '0', notARealAttribute: 'x' }),
    })
    expect(staged.error?.code).toBe('SCHEMA_VOCABULARY_MISMATCH')
    expect(String(staged.error?.message)).toContain('notARealAttribute')
    // Nothing was staged, so there is no draft to apply and nothing to write.
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error?.code).toBe('NO_DRAFT')
    expect(l5x.written.size).toBe(0)
  })

  it('refuses to apply a document the vendor schema rejects', async () => {
    const { l5x, view } = await opened()
    // classId is the one attribute the schema makes mandatory on a display
    // object. The draft-time check deliberately does not block on a missing
    // attribute — an export may carry a partial object the engineer means to
    // finish — so the vendor gate at apply is what stops this one.
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'activeX', name: 'NoClass',
      attributes_json: JSON.stringify({ height: '20', width: '100', left: '0', top: '0' }),
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('ftview_validate', {})
    const schema = schemaOutcome(validated)
    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    if (schema.ran) {
      expect(schema.errors).toBeGreaterThan(0)
      expect(applied.error?.code).toBe('SCHEMA_INVALID')
    } else {
      expect(applied.error).toBeUndefined()
    }
  })
})

describe('discarding a draft', () => {
  it('drops the staged operations and leaves the export untouched', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_display_create', { view_id: view, name: 'Arya Throwaway', width: 320, height: 240 })
    expect(staged.error).toBeUndefined()
    const discarded = await l5x.call('ftview_draft_discard', { draft_id: staged.data?.draft_id })
    expect(discarded.error).toBeUndefined()
    expect(discarded.data?.discarded).toBe(true)
    expect(discarded.data?.operations_dropped).toBe(1)
    const after = await l5x.call('ftview_validate', { draft_id: staged.data?.draft_id })
    expect(after.error).toBeDefined()
  })
})
describe('apply overwrite', { timeout: 30_000 }, () => {
  it('accepts overwrite: yes and replaces the file set with this draft', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'FirstPass',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '120' }),
    })
    const first = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(first.error).toBeUndefined()
    await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'SecondPass',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '150' }),
    })
    const second = await l5x.call('ftview_apply', { output_root: 'out', overwrite: 'yes' })
    expect(second.error).toBeUndefined()
    const written = l5x.written.get('out/Displays/Main Screen.xml') ?? ''
    expect(written).toContain('name="SecondPass"')
  })

  it('tracks the folder it wrote, normalising separators', () => {
    const session = new ViewSession({ resolve: async (path: string) => path, stat: async () => ({ type: 'directory' }), readBytes: async () => new Uint8Array() } as never, 50)
    expect(session.appliedAt('C:/Projects/Out')).toBeUndefined()
    session.recordApplied('C:\\Projects\\Out', ['Displays/A.xml', 'IMPORT.md'])
    const tracked = session.appliedAt('C:/Projects/Out')
    expect(tracked?.has('IMPORT.md')).toBe(true)
    expect(tracked?.size).toBe(2)
  })

  // Apply used to delete the draft, so `ftview_verify_import` — whose whole job is
  // comparing that draft with a fresh export after the vendor import — could never
  // run in the order apply recommends. The draft stays, marked with the folder it
  // wrote, and authoring after an apply starts a new draft instead of appending.
  it('keeps the applied draft so the import proof can still be made from it', async () => {
    const { l5x, view } = await opened()
    const staged = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'ProofObject',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '180' }),
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('ftview_apply', { draft_id: staged.data?.draft_id, output_root: 'out' })
    expect(applied.error).toBeUndefined()
    const kept = await l5x.call('ftview_draft_ops', { draft_id: staged.data?.draft_id })
    expect(kept.error).toBeUndefined()
    expect(kept.data?.operations).toHaveLength(1)
    const later = await l5x.call('ftview_draft_object_add', {
      view_id: view, display: 'Main Screen', type: 'text', name: 'AfterApply',
      attributes_json: JSON.stringify({ height: '24', width: '200', left: '20', top: '210' }),
    })
    expect(later.error).toBeUndefined()
    expect(later.data?.draft_id).not.toBe(staged.data?.draft_id)
  })
})