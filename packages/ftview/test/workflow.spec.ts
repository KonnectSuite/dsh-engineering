/**
 * One pass through the workflow a model actually runs: open an export, author a
 * screen from a description, validate, apply, reopen what was written and package
 * it for the Studio wizard. Each step is a separate tool, so this is the contract
 * between them rather than a test of any single tool.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** One Studio-shaped display with a known canvas. */
function gfx(name: string): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME17.xsd">',
    `    <displaySettings displayType="replace" width="640" height="480" backColor="#C6C6C6"/>`,
    `    <text name="${name}Label" width="200" height="20" left="20" top="20" caption="${name}"/>`,
    '</gfx>',
    '',
  ].join('\n')
}

/** Six-column tag CSV declaring the tags the screen binds. */
const CSV = [
  ';###002 - THIS LINE CONTAINS VERSION INFORMATION. DO NOT REMOVE!!!',
  'Tag Type;Tag Name;Tag Description;Read Only;Data Source;Native Type',
  'A;BeltSpeed;Cutter belt speed;False;PLC;REAL',
  'A;CutOff;Cut off lamp;False;PLC;BOOL',
  '',
].join('\n')

/** An export with two displays and its tag database. */
function files(): Map<string, string> {
  return new Map([
    ['export/Displays/Main Screen.xml', gfx('Main Screen')],
    ['export/Displays/Setup.xml', gfx('Setup')],
    ['export/Tags/Line.csv', CSV],
  ])
}

describe('the authoring workflow end to end', () => {
  it('scaffolds an existing display that the schema accepts', async () => {
    const l5x = harness(files(), { edit: true, studio: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string

    const scaffolded = await l5x.call('ftview_draft_display_scaffold', {
      view_id: view,
      display: 'Setup',
      title: 'SETUP',
      subtitle: 'line parameters',
      footer: 'AryaCode test',
    })
    expect(scaffolded.error).toBeUndefined()
    expect(scaffolded.data?.slots).toBeDefined()

    const applied = await l5x.call('ftview_apply', { output_root: 'out-scaffold' })
    expect(applied.error).toBeUndefined()
    expect([...l5x.written.keys()]).toContain('out-scaffold/Displays/Setup.xml')
  })

  it('stages a popup that the schema accepts', async () => {
    const l5x = harness(files(), { edit: true, studio: true })
    const open = await l5x.call('ftview_open', { root: 'export' })
    const view = open.data?.view_id as string

    const staged = await l5x.call('ftview_draft_popup', {
      view_id: view,
      display: 'Confirm Popup',
      spec_json: JSON.stringify({
        title: 'CONFIRM',
        message: 'ARE YOU SURE YOU WANT TO START THE SYSTEM?',
        buttons: [{ label: 'NO', backColor: '#B91C1C' }, { label: 'YES', action: 'goto', display: 'Setup' }],
      }),
    })
    expect(staged.error).toBeUndefined()

    const applied = await l5x.call('ftview_apply', { output_root: 'out-popup' })
    expect(applied.error).toBeUndefined()
    expect([...l5x.written.keys()]).toContain('out-popup/Displays/Confirm Popup.xml')
  })

  it('authors, validates, applies, reopens and packages one screen', async () => {
    const l5x = harness(files(), { edit: true, studio: true })

    const open = await l5x.call('ftview_open', { root: 'export' })
    expect(open.error).toBeUndefined()
    const view = open.data?.view_id as string

    const created = await l5x.call('ftview_draft_display_create', {
      view_id: view,
      name: 'Stage',
      width: 640,
      height: 480,
    })
    expect(created.error).toBeUndefined()

    const staged = await l5x.call('ftview_draft_screen', {
      view_id: view,
      display: 'Stage',
      width: 640,
      height: 480,
      spec_json: JSON.stringify({
        title: 'CUTTER LINE',
        cards: [{ title: 'CUTTER', rows: [{ kind: 'value', label: 'Belt speed', tag: 'BeltSpeed' }, { kind: 'lamp', label: 'Cut off', tag: 'CutOff' }] }],
        nav: [{ label: 'SETUP', display: 'Setup' }],
      }),
      tags_json: JSON.stringify([{ name: 'BeltSpeed', description: 'Cutter belt speed' }, { name: 'CutOff', description: 'Cut off lamp' }]),
    })
    expect(staged.error).toBeUndefined()
    expect(staged.data?.unresolved_tags).toBeUndefined()

    const validated = await l5x.call('ftview_validate', { view_id: view })
    expect(validated.error).toBeUndefined()

    const applied = await l5x.call('ftview_apply', { output_root: 'out' })
    expect(applied.error).toBeUndefined()
    expect([...l5x.written.keys()]).toContain('out/Displays/Stage.xml')
    expect(l5x.written.get('out/IMPORT.md')).toContain('Stage')

    const reopened = await l5x.call('ftview_open', { root: 'out' })
    expect(reopened.error).toBeUndefined()
    const listed = await l5x.call('ftview_list', { view_id: reopened.data?.view_id as string, kind: 'display' })
    const names = (listed.data?.rows as readonly { name: string }[] | undefined)?.map(row => row.name) ?? []
    expect(names).toContain('Stage')

    const checked = await l5x.call('ftview_check', { view_id: reopened.data?.view_id as string })
    expect(checked.error).toBeUndefined()
    const findings = (checked.data?.findings as readonly { rule: string; evidence?: Record<string, unknown> }[] | undefined) ?? []
    expect(findings.filter(finding => finding.rule === 'TAG_NOT_BOUND')).toHaveLength(0)
    expect(findings.filter(finding => finding.rule === 'GOTO_TARGET_MISSING')).toHaveLength(0)

  })
})
