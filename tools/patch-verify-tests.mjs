import { readFileSync, writeFileSync } from "node:fs"
const file = "packages/ftview/test/edit.spec.ts"
let text = readFileSync(file, "utf8")
const block = `
describe('verifying that an import landed', () => {
  it('reports staged objects the export does not contain', async () => {
    const { l5x, view } = await opened()
    await l5x.call('ftview_draft_object_add', {
      view_id: view,
      display: 'Main',
      type: 'panel',
      name: 'NeverImported',
      attributes_json: JSON.stringify({ left: 10, top: 10, width: 100, height: 40 }),
    })
    const verdict = await l5x.call('ftview_verify_import', { view_id: view })
    const data = verdict.data as { landed: boolean; missing: number; displays: { missing: string[] }[] }
    expect(data.landed).toBe(false)
    expect(data.missing).toBe(1)
    expect(data.displays[0]?.missing).toContain('NeverImported')
    expect(verdict.summary).toContain('did not fully land')
  })

  it('reports geometry drift on an object the export has', async () => {
    const { l5x, view } = await opened()
    const displays = await l5x.call('ftview_list', { view_id: view, kind: 'display' })
    const first = (displays.data as { displays: { name: string; objects: { name: string }[] }[] }).displays[1]
    const object = first?.objects.find(candidate => candidate.name !== undefined)
    if (first === undefined || object?.name === undefined) throw new Error('fixture has no named object')
    await l5x.call('ftview_draft_object_set', {
      view_id: view,
      display: first.name,
      object: object.name,
      attributes_json: JSON.stringify({ left: 404 }),
    })
    const verdict = await l5x.call('ftview_verify_import', { view_id: view })
    const data = verdict.data as { changed: number; displays: { changed: { object: string; drift: { field: string }[] }[] }[] }
    expect(data.landed).toBe(false)
    expect(data.changed).toBe(1)
    expect(data.displays[0]?.changed[0]?.drift.some(row => row.field === 'left')).toBe(true)
  })

  it('refuses when no draft is staged', async () => {
    const { l5x, view } = await opened()
    const verdict = await l5x.call('ftview_verify_import', { view_id: view })
    expect(verdict.error?.code).toBe('NO_DRAFT')
  })
})
\`\`\`
`
if (!text.trimEnd().endsWith('})')) throw new Error('unexpected file tail')
text = text.replace(/}\)\s*$/, `})\n${block}`)
writeFileSync(file, text, "utf8")
console.log("tests appended")