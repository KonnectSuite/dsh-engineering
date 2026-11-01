import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A project with an FBD routine and the tags a block instance needs. */
const PROJECT = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Fbd" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="a1" TagType="Base" DataType="BOOL"/><Tag Name="a2" TagType="Base" DataType="BOOL"/>
      <Tag Name="r1" TagType="Base" DataType="REAL"/><Tag Name="r2" TagType="Base" DataType="REAL"/>
      <Tag Name="r3" TagType="Base" DataType="REAL"/>
      <Tag Name="add1" TagType="Base" DataType="FBD_MATH"/>
    </Tags>
    <Programs>
      <Program Name="Main" MainRoutineName="R">
        <Routines>
          <Routine Name="R" Type="RLL"><RLLContent>
            <Rung Number="0" Type="N"><Text><![CDATA[XIC(a1)OTE(a2);]]></Text></Rung>
          </RLLContent></Routine>
          <Routine Name="F" Type="FBD"><FBDContent SheetSize="B - 11 x 17 in" SheetOrientation="Landscape"/></Routine>
        </Routines>
      </Program>
    </Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

/** The ADD sheet Studio accepted: one block, three references, three wires. */
const SHEET = {
  program: 'Main',
  routine: 'F',
  sheet: 1,
  blocks: JSON.stringify([{ id: 2, type: 'ADD', tag: 'add1', structure: 'FBD_MATH', pins: ['SourceA', 'SourceB', 'Dest'], x: 300, y: 20 }]),
  refs: JSON.stringify([
    { id: 0, direction: 'in', tag: 'r1', x: 180, y: 60 },
    { id: 1, direction: 'in', tag: 'r2', x: 180, y: 100 },
    { id: 3, direction: 'out', tag: 'r3', x: 500, y: 80 },
  ]),
  wires: JSON.stringify([{ from: 0, to: 2, to_pin: 'SourceA' }, { from: 1, to: 2, to_pin: 'SourceB' }, { from: 2, to: 3, from_pin: 'Dest' }]),
}

/** Open the fixture project. */
async function opened() {
  const l5x = harness(new Map([['fbd.l5x', new TextEncoder().encode(PROJECT)]]), { editing: true })
  const result = await l5x.call('open_project', { path: 'fbd.l5x' })
  expect(result.error).toBeUndefined()
  return l5x
}

describe('draft_fbd', () => {
  it('writes the sheet in the shape Studio builds', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_fbd', SHEET)
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'out.L5X' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('out.L5X') ?? ''
    // This exact sheet passed a Logix Designer 37 build with zero warnings.
    expect(text).toContain('<Sheet Number="1">')
    expect(text).toContain('<Block Type="ADD" ID="2" X="300" Y="20" Operand="add1" VisiblePins="SourceA SourceB Dest" HideDesc="false"/>')
    expect(text).toContain('<IRef ID="0" X="180" Y="60" Operand="r1" HideDesc="false"/>')
    expect(text).toContain('<ORef ID="3" X="500" Y="80" Operand="r3" HideDesc="false"/>')
    expect(text).toContain('<Wire FromID="0" ToID="2" ToParam="SourceA"/>')
    expect(text).toContain('<Wire FromID="2" FromParam="Dest" ToID="3"/>')
    // The routine's own sheet attributes survive.
    expect(text).toContain('SheetSize="B - 11 x 17 in"')
  })

  it('refuses a routine that is not a function block diagram', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_fbd', { ...SHEET, routine: 'R' })
    expect(result.error?.code).toBe('UNSUPPORTED_TARGET')
  })

  it('refuses a block whose tag is not declared', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_fbd', { ...SHEET, blocks: JSON.stringify([{ id: 2, type: 'ADD', tag: 'missing', structure: 'FBD_MATH', pins: ['SourceA', 'SourceB', 'Dest'] }]) })
    expect(result.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(String(result.error?.fix)).toContain('draft_tag')
  })

  it('refuses a tag whose type is not the block structure', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_fbd', { ...SHEET, blocks: JSON.stringify([{ id: 2, type: 'ADD', tag: 'r3', structure: 'FBD_MATH', pins: ['SourceA', 'SourceB', 'Dest'] }]) })
    expect(result.error?.code).toBe('TYPE_MISMATCH')
  })

  it('refuses a wire that names no node', async () => {
    const l5x = await opened()
    // Staging is cheap and schema-only; the graph is judged when the draft is validated.
    const staged = await l5x.call('draft_fbd', { ...SHEET, wires: JSON.stringify([{ from: 0, to: 99, to_pin: 'SourceA' }]) })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error?.code).toBe('INVALID_CHANGE_SET')
  })

  it('refuses a pin the block does not show', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_fbd', { ...SHEET, wires: JSON.stringify([{ from: 0, to: 2, to_pin: 'Nope' }]) })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error?.code).toBe('INVALID_CHANGE_SET')
  })
})
