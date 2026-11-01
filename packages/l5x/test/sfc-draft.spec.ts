import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** A project with no SFC routine: the tool has to create one first. */
const PROJECT = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Sfc" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="a1" TagType="Base" DataType="BOOL"/><Tag Name="a2" TagType="Base" DataType="BOOL"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R">
      <Routines>
        <Routine Name="R" Type="RLL"><RLLContent>
          <Rung Number="0" Type="N"><Text><![CDATA[XIC(a1)OTE(a2);]]></Text></Rung>
        </RLLContent></Routine>
      </Routines>
    </Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

const CHART = {
  program: 'Main',
  routine: 'Chart',
  steps: JSON.stringify([{ id: 0, name: 'Step_1', initial: true, x: 300, y: 100 }, { id: 1, name: 'Step_2', x: 300, y: 300 }]),
  transitions: JSON.stringify([{ id: 2, name: 'Tran_1', condition: 'a1', x: 300, y: 200 }]),
  links: JSON.stringify([{ from: 0, to: 2 }, { from: 2, to: 1 }]),
}

async function opened() {
  const l5x = harness(new Map([['sfc.l5x', new TextEncoder().encode(PROJECT)]]), { editing: true })
  const result = await l5x.call('open_project', { path: 'sfc.l5x' })
  expect(result.error).toBeUndefined()
  return l5x
}

describe('sequential function charts', () => {
  it('creates an SFC routine that builds', async () => {
    // Verified by a Logix Designer 37 build: an empty SFC routine imports and builds with 0 warnings.
    const l5x = await opened()
    const routine = await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    expect(routine.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'routine.L5X' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('routine.L5X')).toContain('<Routine Name="Chart" Type="SFC"><SFCContent SheetSize="Letter - 8.5 x 11 in" SheetOrientation="Landscape"/>')
  })

  it('refuses an SFC routine that carries a body', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC', code: 'XIC(a1)OTE(a2);' })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })

  it('writes steps, transitions and links in the shape a real export uses', async () => {
    const l5x = await opened()

    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const chart = await l5x.call('draft_sfc', CHART)
    expect(chart.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'chart.L5X' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('chart.L5X') ?? ''
    expect(text).toContain('<Step ID="0" X="300" Y="100" Operand="Step_1"')
    expect(text).toContain('InitialStep="true"')
    expect(text).toContain('InitialStep="false"')
    expect(text).toContain('<Transition ID="2" X="300" Y="200" Operand="Tran_1"')
    expect(text).toContain('<Condition><STContent><Line Number="0"><![CDATA[a1]]></Line></STContent></Condition>')
    expect(text).toContain('<DirectedLink FromID="0" ToID="2" Show="true"/>')
  })

  it('refuses a chart without exactly one initial step', async () => {
    const l5x = await opened()

    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const staged = await l5x.call('draft_sfc', { ...CHART, steps: JSON.stringify([{ id: 0, name: 'Step_1' }, { id: 1, name: 'Step_2' }]) })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error?.code).toBe('INVALID_CHANGE_SET')
    expect(String(validated.error?.message)).toContain('exactly one initial step')
  })

  it('refuses a link that names no node', async () => {
    const l5x = await opened()

    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const staged = await l5x.call('draft_sfc', { ...CHART, links: JSON.stringify([{ from: 0, to: 99 }]) })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error?.code).toBe('INVALID_CHANGE_SET')
  })

  it('refuses a routine that is not an SFC chart', async () => {
    const l5x = await opened()
    const result = await l5x.call('draft_sfc', { ...CHART, routine: 'R' })
    expect(result.error?.code).toBe('UNSUPPORTED_TARGET')
  })
})


describe('tags a chart needs are created with it', () => {
  it('declares steps as SFC_STEP and transitions as BOOL when they are missing', async () => {
    const l5x = await opened()
    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const chart = await l5x.call('draft_sfc', CHART)
    expect(chart.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'tags.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('tags.L5X') ?? ''
    // This chart, with these generated tags, built in Logix Designer with 0 warnings.
    expect(written).toContain('<Tag Name="Step_1" TagType="Base" DataType="SFC_STEP"')
    expect(written).toContain('<DataValueMember Name="Status" DataType="DINT" Radix="Hex" Value="16#a020_0201"/>')
    expect(written).toContain('<DataValueMember Name="X" DataType="BOOL" Value="1"/>')
    expect(written).toContain('<Tag Name="Tran_1" TagType="Base" DataType="BOOL"')
  })

  it('does not redeclare a tag the project already has', async () => {
    const l5x = await opened()
    await l5x.call('draft_tag', { scope: 'controller', name: 'Tran_1', data_type: 'BOOL', description: 'existing' })
    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const chart = await l5x.call('draft_sfc', {
      ...CHART,
      steps: JSON.stringify([{ id: 0, name: 'Step_1', initial: true }]),
      transitions: JSON.stringify([{ id: 2, name: 'Tran_1', condition: 'Step_1.DN' }]),
      links: JSON.stringify([{ from: 0, to: 2 }, { from: 2, to: 0 }]),
    })
    expect(chart.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'existing.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('existing.L5X') ?? ''
    expect((written.match(/<Tag Name="Tran_1"/gu) ?? []).length).toBe(1)
  })
})


describe('actions and numeric conditions', () => {
  it('creates an SFC_ACTION tag and emits the qualifier', async () => {
    const l5x = await opened()
    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const chart = await l5x.call('draft_sfc', {
      ...CHART,
      steps: JSON.stringify([{ id: 0, name: 'Step_1', initial: true, actions: [{ id: 4, name: 'Action_1', qualifier: 'NonStored' }] }, { id: 1, name: 'Step_2' }]),
    })
    expect(chart.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'action.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('action.L5X') ?? ''
    // This chart, with this generated action tag, built in Logix Designer with 0 warnings.
    expect(written).toContain('<Tag Name="Action_1" TagType="Base" DataType="SFC_ACTION"')
    expect(written).toContain('<Action ID="4" Operand="Action_1" Qualifier="NonStored" IsBoolean="true" PresetUsesExpr="false"/>')
  })

  it('keeps a numeric comparison condition verbatim', async () => {
    const l5x = await opened()
    await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    const chart = await l5x.call('draft_sfc', {
      ...CHART,
      transitions: JSON.stringify([{ id: 2, name: 'Tran_1', condition: 'c1 > 5' }]),
    })
    expect(chart.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'numeric.L5X' })
    expect(applied.error).toBeUndefined()
    // A numeric comparison is accepted by the SFC compiler; only a bare literal is not.
    expect(l5x.written.get('numeric.L5X')).toContain('<![CDATA[c1 > 5]]>')
  })
})


describe('an SFC Reset action', () => {
  it('is refused when nothing stores the same tag', async () => {
    // Studio answers RxSFC_E_RESET_WITHOUT_STORED; catching it at compose time names the fix.
    const l5x = harness(new Map([['q.l5x', new TextEncoder().encode(RESET_FIXTURE)]]), { editing: true })
    await l5x.call('open_project', { path: 'q.l5x' })
    const routine = await l5x.call('draft_routine', { program: 'Main', name: 'Chart', language: 'SFC' })
    expect(routine.error).toBeUndefined()
    const chart = await l5x.call('draft_sfc', {
      program: 'Main', routine: 'Chart',
      steps: JSON.stringify([{ id: 0, name: 'S1', initial: true, actions: [{ id: 10, name: 'A1', qualifier: 'Reset' }] }, { id: 1, name: 'S2' }]),
      transitions: JSON.stringify([{ id: 20, name: 'T1', condition: 'S1.DN' }, { id: 21, name: 'T2', condition: 'c1 > 5' }]),
      links: JSON.stringify([{ from: 0, to: 20 }, { from: 20, to: 1 }, { from: 1, to: 21 }, { from: 21, to: 0 }]),
    })
    expect(chart.error?.code).toBe('INVALID_ARGUMENT')
    expect(String(chart.error?.message)).toContain('RxSFC_E_RESET_WITHOUT_STORED')
  })
})

/** A minimal project for the Reset action case. */
const RESET_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="ResetCase" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags><Tag Name="a1" TagType="Base" DataType="BOOL"/><Tag Name="c1" TagType="Base" DataType="DINT"/></Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent><Rung Number="0" Type="N"><Text><![CDATA[XIC(a1)OTE(a1);]]></Text></Rung></RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
