/**
 * The import step should say whether anyone looked at the screens.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { harness } from './harness.ts'

const DISPLAY = `<?xml version="1.0" encoding="UTF-8"?>
<gfx width="320" height="240" backColor="#FFFFFF">
  <object type="text" name="Title" left="10" top="10" width="120" height="20" caption="Line"/>
</gfx>`

/** One applied export folder with a single display. */
function exportFiles(): Map<string, string> {
  return new Map([
    ['export/Displays/Main.xml', DISPLAY],
    ['export/Tags/Tags.csv', 'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type\n'],
  ])
}

describe('import gate', () => {
  it('names the displays nobody drew', async () => {
    const l5x = harness(exportFiles(), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'export' })
    expect(opened.error).toBeUndefined()
    const workspace = mkdtempSync(join(tmpdir(), 'ftview-gate-'))
    mkdirSync(join(workspace, 'applied', 'Displays'), { recursive: true })
    writeFileSync(join(workspace, 'applied', 'Displays', 'Main.xml'), DISPLAY, 'utf8')
    const prepared = await l5x.call('ftview_studio_import_prepare', {
      export_root: join(workspace, 'applied'),
      displays: 'Main',
      output_root: join(workspace, 'package'),
    })
    expect(prepared.error).toBeUndefined()
    expect(prepared.data?.unrendered).toEqual(['Main'])
    expect(prepared.summary).toContain('never drawn')
    expect(prepared.next?.[0]?.tool).toBe('ftview_render')
  })

  it('says nothing once the display was drawn', async () => {
    const l5x = harness(exportFiles(), { edit: true })
    const opened = await l5x.call('ftview_open', { root: 'export' })
    expect(opened.error).toBeUndefined()
    const rendered = await l5x.call('ftview_render', { display: 'Main', output: 'renders' })
    expect(rendered.error).toBeUndefined()
    const workspace = mkdtempSync(join(tmpdir(), 'ftview-gate-'))
    mkdirSync(join(workspace, 'applied', 'Displays'), { recursive: true })
    writeFileSync(join(workspace, 'applied', 'Displays', 'Main.xml'), DISPLAY, 'utf8')
    const prepared = await l5x.call('ftview_studio_import_prepare', {
      export_root: join(workspace, 'applied'),
      displays: 'Main',
      output_root: join(workspace, 'package'),
    })
    expect(prepared.error).toBeUndefined()
    expect(prepared.data?.unrendered).toEqual([])
    expect(prepared.summary).toContain('drawn in this chat')
  })
})
