import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A six-column tag CSV with one duplicate name. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;StartPB;Start pushbutton;False;PLC;BOOL',
  'A;StopPB;Stop pushbutton;False;PLC;BOOL',
  'A;StartPB;Duplicate start;False;PLC;BOOL',
  '',
].join('\n')

/** One export folder with two displays, a tag CSV and a non-display XML. */
function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Main.xml', '<Display name="Main"><Object name="StartPB" Tag="{[PLC]StartPB}"/><Object name="StartPB"/></Display>'],
    ['export/Overview.xml', '<Display name="Overview"><Object name="Chart1"/></Display>'],
    ['export/tags.csv', CSV],
    ['export/notes.xml', '<Notes/>'],
  ])
}

/** Open the fixture once. */
async function opened() {
  const l5x = harness(exportFiles())
  const open = await l5x.call('ftview_open', { root: 'export' })
  expect(open.error).toBeUndefined()
  return { l5x, view: open.data?.view_id as string }
}

describe('registration', () => {
  it('registers the six read intents in a stable order', () => {
    const { definitions } = harness(exportFiles())
    expect(definitions.map(definition => definition.name)).toEqual([
      'ftview_open', 'ftview_list', 'ftview_get', 'ftview_find', 'ftview_check', 'ftview_compare',
    ])
  })

  it('describes every parameter', () => {
    const { definitions } = harness(exportFiles())
    for (const definition of definitions) {
      for (const [name, schema] of Object.entries(definition.parameters.properties)) {
        expect(schema.description, `${definition.name}.${name}`).toBeTypeOf('string')
        expect(schema.description.length, `${definition.name}.${name}`).toBeGreaterThan(20)
      }
    }
  })
})

describe('open and read', () => {
  it('summarizes the export and keeps a view handle', async () => {
    const { l5x } = await opened()
    const open = await l5x.call('ftview_open', { root: 'export' })
    expect(open.summary).toContain('2 displays')
    expect(open.data?.tags).toBe(3)
    expect(open.data?.view_id).toBeTypeOf('string')
  })

  it('lists displays and tags', async () => {
    const { l5x, view } = await opened()
    const displays = await l5x.call('ftview_list', { view_id: view, kind: 'display' })
    expect(displays.data?.total).toBe(2)
    const tags = await l5x.call('ftview_list', { view_id: view, kind: 'tag' })
    expect(tags.data?.total).toBe(3)
  })

  it('reads one display with its objects and one tag row', async () => {
    const { l5x, view } = await opened()
    const display = await l5x.call('ftview_get', { view_id: view, kind: 'display', name: 'Main' })
    expect(display.data?.object_count).toBe(2)
    const tag = await l5x.call('ftview_get', { view_id: view, kind: 'tag', name: 'StartPB' })
    expect(tag.data?.description).toBe('Start pushbutton')
  })

  it('refuses an unknown component with candidates', async () => {
    const { l5x, view } = await opened()
    const missing = await l5x.call('ftview_get', { view_id: view, kind: 'tag', name: 'Start' })
    expect(missing.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(missing.error?.candidates).toContain('StartPB')
  })

  it('finds matches across displays, objects and tags', async () => {
    const { l5x, view } = await opened()
    const found = await l5x.call('ftview_find', { view_id: view, query: 'startpb' })
    const kinds = (found.data?.matches as { kind: string }[]).map(match => match.kind)
    expect(kinds).toContain('object')
    expect(kinds).toContain('tag')
  })
})

describe('check', () => {
  it('reports duplicate names and unparsed files', async () => {
    const { l5x, view } = await opened()
    const checked = await l5x.call('ftview_check', { view_id: view })
    const rules = (checked.data?.by_rule as Record<string, number>) ?? {}
    expect(rules.DUPLICATE_TAG_NAME).toBeGreaterThan(0)
    expect(rules.DUPLICATE_OBJECT_NAME).toBeGreaterThan(0)
    expect(rules.UNPARSED_FILE).toBeGreaterThan(0)
    expect((checked.data?.coverage as { schema: string }).schema).toBe('not run')
  })
})

describe('compare', () => {
  it('reports changed files between two exports', async () => {
    const files = exportFiles()
    files.set('after/Main.xml', '<Display name="Main"><Object name="StartPB"/><Object name="StopPB"/></Display>')
    files.set('after/Overview.xml', files.get('export/Overview.xml') as string)
    files.set('after/tags.csv', CSV.replace('A;StopPB;Stop pushbutton;False;PLC;BOOL\n', ''))
    const l5x = harness(files)
    const before = await l5x.call('ftview_open', { root: 'export' })
    const after = await l5x.call('ftview_open', { root: 'after' })
    const compared = await l5x.call('ftview_compare', {
      before_id: before.data?.view_id,
      after_id: after.data?.view_id,
    })
    expect(compared.error).toBeUndefined()
    const changed = compared.data?.files_changed as string[]
    expect(changed).toContain('Main.xml')
    expect((compared.data?.tags as { removed: string[] }).removed).toContain('StopPB')
  })
})
