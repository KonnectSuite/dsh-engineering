/**
 * The staged operations can be read back and trimmed one at a time.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

const DISPLAY = `<?xml version="1.0" encoding="UTF-8"?>
<gfx width="320" height="240" backColor="#FFFFFF">
  <object type="text" name="Title" left="10" top="10" width="120" height="20" caption="Line"/>
</gfx>`

function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Displays/Main.xml', DISPLAY],
    ['export/Tags/Tags.csv', 'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\n'],
  ])
}

/** One opened export and a draft holding two staged changes. */
async function staged(): Promise<{ l5x: ReturnType<typeof harness>; draftId: string }> {
  const l5x = harness(exportFiles(), { edit: true })
  expect((await l5x.call('ftview_open', { root: 'export' })).error).toBeUndefined()
  await l5x.call('ftview_draft_display_set', { display: 'Main', object: 'Title', attribute: 'caption', value: 'Line 1' })
  const second = await l5x.call('ftview_draft_display_set', { display: 'Main', object: 'Title', attribute: 'left', value: '20' })
  expect(second.error).toBeUndefined()
  return { l5x, draftId: second.data?.draft_id as string }
}

describe('draft inspection', () => {
  it('lists every staged operation with its index and target', async () => {
    const { l5x } = await staged()
    const listed = await l5x.call('ftview_draft_ops', {})
    expect(listed.error).toBeUndefined()
    expect(listed.data?.operation_count).toBe(2)
    const operations = listed.data?.operations as { index: number; kind: string; target: string }[]
    expect(operations.map((operation) => operation.index)).toEqual([0, 1])
    expect(operations.map((operation) => operation.kind)).toEqual(['display_set', 'display_set'])
    expect(operations[0]?.target).toBe('Main/Title caption')
    expect(operations[1]?.target).toBe('Main/Title left')
  })

  it('drops one staged operation and keeps the rest', async () => {
    const { l5x } = await staged()
    const dropped = await l5x.call('ftview_draft_drop', { index: 0 })
    expect(dropped.error).toBeUndefined()
    expect(dropped.data?.operation_count).toBe(1)
    const listed = await l5x.call('ftview_draft_ops', {})
    expect(listed.data?.operation_count).toBe(1)
    expect((listed.data?.operations as { index: number }[])[0]?.index).toBe(0)
  })

  it('refuses an index outside the draft', async () => {
    const { l5x } = await staged()
    const refused = await l5x.call('ftview_draft_drop', { index: 7 })
    expect(refused.error?.code).toBe('DRAFT_INDEX_RANGE')
    expect(refused.error?.message).toContain('2')
    expect((await l5x.call('ftview_draft_ops', {})).data?.operation_count).toBe(2)
  })
})
