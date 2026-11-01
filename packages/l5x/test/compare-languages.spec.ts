/**
 * `compare_projects` on the languages that are not ladder.
 *
 * It is the tool a reviewer uses to judge an edit, and a comparison that answers "no changes"
 * while a Structured Text body or a diagram changed is worse than one that fails. Probing showed
 * it does see them — component `structured_text` for a body, `diagram` for FBD and SFC — and no
 * test held any of it, so this does.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** The synthetic export: one ladder, one FBD and one SFC routine. */
function synthetic(): string {
  return new TextDecoder().decode(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
}

/** Compare two export texts. */
async function compare(before: string, after: string) {
  const l5x = harness(new Map([
    ['a.l5x', new TextEncoder().encode(before)],
    ['b.l5x', new TextEncoder().encode(after)],
  ]), { editing: true })
  const one = await l5x.call('open_project', { path: 'a.l5x' })
  const two = await l5x.call('open_project', { path: 'b.l5x' })
  expect(one.error).toBeUndefined()
  expect(two.error).toBeUndefined()
  const result = await l5x.call('compare_projects', { before_id: one.data?.project_id, after_id: two.data?.project_id })
  expect(result.error).toBeUndefined()
  return result.data as { count: number; by_component: Record<string, number> }
}

describe('a change inside a Structured Text routine', () => {
  it('is reported as a structured_text change', async () => {
    const before = new TextDecoder().decode(fixtureBytes())
    const after = before.replace('<Line Number="0"><![CDATA[', '<Line Number="0"><![CDATA[// touched ')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.structured_text).toBe(1)
  })
})

describe('a change inside a diagram', () => {
  it('is reported as a diagram change when a function block operand changes', async () => {
    const before = synthetic()
    const after = before.replace('<IRef ID="1" Operand="Start"/>', '<IRef ID="1" Operand="StartPB"/>')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.diagram).toBe(1)
  })

  it('is reported as a diagram change when a chart step operand changes', async () => {
    const before = synthetic()
    const after = before.replace('<Step ID="1" Operand="Local"/>', '<Step ID="1" Operand="Local2"/>')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.diagram).toBe(1)
  })
})

describe('a change inside a rung', () => {
  it('is reported as a rung change', async () => {
    const before = synthetic()
    const after = before.replace('OTE(RunAlias);', 'OTE(RunAlias2);')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.rung).toBe(1)
  })
})

describe('a change to formatting only', () => {
  it('is not reported at all', async () => {
    const before = synthetic()
    // Whitespace between elements is not engineering content.
    const after = before.replace('\n  <Controller', '\n        <Controller')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(0)
  })
})


/** Two exports whose only difference is one tag description. */
const DIFF_OLD = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Diff\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"Speed\" TagType=\"Base\" DataType=\"REAL\" Description=\"Line speed\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"RLL\"><RLLContent><Rung Number=\"0\" Type=\"N\"><Text><![CDATA[OTE(Speed.0);]]></Text></Rung></RLLContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"
const DIFF_NEW = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Diff\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"Speed\" TagType=\"Base\" DataType=\"REAL\" Description=\"Line speed, ft/min\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"RLL\"><RLLContent><Rung Number=\"0\" Type=\"N\"><Text><![CDATA[OTE(Speed.0);]]></Text></Rung></RLLContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('a change record', () => {
  it('names the fields that differ', async () => {
    const l5x = harness(new Map([
      ['old.l5x', new TextEncoder().encode(DIFF_OLD)],
      ['new.l5x', new TextEncoder().encode(DIFF_NEW)],
    ]))
    const before = await l5x.call('open_project', { path: 'old.l5x' })
    const after = await l5x.call('open_project', { path: 'new.l5x' })
    const diff = await l5x.call('compare_projects', { before_id: before.data?.project_id, after_id: after.data?.project_id })
    const changes = (diff.data?.changes ?? []) as { component: string; changed_fields?: string[] }[]
    const tagChange = changes.find(change => change.component === 'tag')
    expect(tagChange).toBeDefined()
    expect((tagChange?.changed_fields ?? []).join(' ')).toContain('description')
  })
})


/** The same project with one rung rewritten. */
const RUNG_OLD = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"RungDiff\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"B\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n        <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung>\n        <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(A)XIO(B)OTE(B);]]></Text></Rung>\n      </RLLContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"
const RUNG_NEW = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"RungDiff\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"B\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n        <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung>\n        <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(B)OTE(B);]]></Text></Rung>\n      </RLLContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('one rung changed', () => {
  it('is one rung change naming both texts', async () => {
    // On a real 10 MB project a single rung edit produced exactly one change:
    // rung TRAVEL::C07_Laser_Cooling::2 with the before and after text in changed_fields.
    const l5x = harness(new Map([
      ['old.l5x', new TextEncoder().encode(RUNG_OLD)],
      ['new.l5x', new TextEncoder().encode(RUNG_NEW)],
    ]))
    const before = await l5x.call('open_project', { path: 'old.l5x' })
    const after = await l5x.call('open_project', { path: 'new.l5x' })
    const diff = await l5x.call('compare_projects', { before_id: before.data?.project_id, after_id: after.data?.project_id })
    const changes = (diff.data?.changes ?? []) as { component: string; key: string; changed_fields?: string[] }[]
    const rungs = changes.filter(change => change.component === 'rung')
    expect(rungs.length).toBe(1)
    expect(rungs[0]?.key).toContain('R::1')
    const fields = (rungs[0]?.changed_fields ?? []).join(' ')
    expect(fields).toContain('XIC(A)XIO(B)OTE(B)')
    expect(fields).toContain('XIC(B)OTE(B)')
  })
})


/** The same SFC chart with one transition condition rewritten. */
const SFC_OLD = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"SfcDiff\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A1\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"A2\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"SFC\"><SFCContent SheetSize=\"Letter - 8.5 x 11 in\" SheetOrientation=\"Landscape\">\n        <Step ID=\"0\" X=\"300\" Y=\"100\" Operand=\"Step_1\" HideDesc=\"false\" DescX=\"340\" DescY=\"80\" DescWidth=\"0\" InitialStep=\"true\" PresetUsesExpr=\"false\" LimitHighUsesExpr=\"false\" LimitLowUsesExpr=\"false\" ShowActions=\"true\"/>\n        <Step ID=\"1\" X=\"300\" Y=\"300\" Operand=\"Step_2\" HideDesc=\"false\" DescX=\"340\" DescY=\"280\" DescWidth=\"0\" InitialStep=\"false\" PresetUsesExpr=\"false\" LimitHighUsesExpr=\"false\" LimitLowUsesExpr=\"false\" ShowActions=\"true\"/>\n        <Transition ID=\"2\" X=\"300\" Y=\"200\" Operand=\"T_1\" HideDesc=\"false\" DescX=\"340\" DescY=\"180\" DescWidth=\"0\"><Condition><STContent><Line Number=\"0\"><![CDATA[A1]]></Line></STContent></Condition></Transition>\n        <DirectedLink FromID=\"0\" ToID=\"2\" Show=\"true\"/>\n        <DirectedLink FromID=\"2\" ToID=\"1\" Show=\"true\"/>\n      </SFCContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"
const SFC_NEW = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"SfcDiff\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A1\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"A2\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines>\n      <Routine Name=\"R\" Type=\"SFC\"><SFCContent SheetSize=\"Letter - 8.5 x 11 in\" SheetOrientation=\"Landscape\">\n        <Step ID=\"0\" X=\"300\" Y=\"100\" Operand=\"Step_1\" HideDesc=\"false\" DescX=\"340\" DescY=\"80\" DescWidth=\"0\" InitialStep=\"true\" PresetUsesExpr=\"false\" LimitHighUsesExpr=\"false\" LimitLowUsesExpr=\"false\" ShowActions=\"true\"/>\n        <Step ID=\"1\" X=\"300\" Y=\"300\" Operand=\"Step_2\" HideDesc=\"false\" DescX=\"340\" DescY=\"280\" DescWidth=\"0\" InitialStep=\"false\" PresetUsesExpr=\"false\" LimitHighUsesExpr=\"false\" LimitLowUsesExpr=\"false\" ShowActions=\"true\"/>\n        <Transition ID=\"2\" X=\"300\" Y=\"200\" Operand=\"T_1\" HideDesc=\"false\" DescX=\"340\" DescY=\"180\" DescWidth=\"0\"><Condition><STContent><Line Number=\"0\"><![CDATA[A2]]></Line></STContent></Condition></Transition>\n        <DirectedLink FromID=\"0\" ToID=\"2\" Show=\"true\"/>\n        <DirectedLink FromID=\"2\" ToID=\"1\" Show=\"true\"/>\n      </SFCContent></Routine>\n    </Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('a sequential function chart', () => {
  it('decodes steps, transitions and links written without a Sheet wrapper', async () => {
    // A real SFC export writes the chart directly under SFCContent. Decoding only Sheet children
    // returned zero nodes, so the chart was invisible to the reader and to the diff.
    const l5x = harness(new Map([['sfc.l5x', new TextEncoder().encode(SFC_OLD)]]))
    await l5x.call('open_project', { path: 'sfc.l5x' })
    const routine = await l5x.call('get_component', { kind: 'routine', name: 'R', scope: 'P' })
    const body = (routine.data?.component?.body ?? {}) as { type?: string; nodes?: { kind: string }[] }
    expect(body.type).toBe('SFC')
    expect((body.nodes ?? []).length).toBeGreaterThanOrEqual(4)
    expect((body.nodes ?? []).some(node => node.kind === 'Transition')).toBe(true)
  })

  it('reports a changed transition condition', async () => {
    const l5x = harness(new Map([
      ['old.l5x', new TextEncoder().encode(SFC_OLD)],
      ['new.l5x', new TextEncoder().encode(SFC_NEW)],
    ]))
    const before = await l5x.call('open_project', { path: 'old.l5x' })
    const after = await l5x.call('open_project', { path: 'new.l5x' })
    const diff = await l5x.call('compare_projects', { before_id: before.data?.project_id, after_id: after.data?.project_id })
    const changes = (diff.data?.changes ?? []) as { component: string; key: string; changed_fields?: string[] }[]
    const diagram = changes.find(change => change.component === 'diagram' && change.key === 'P::R')
    expect(diagram).toBeDefined()
    // The diff must name the element that changed, not print two object dumps.
    const fields = (diagram?.changed_fields ?? []).join(' ')
    expect(fields).toContain('Line A1')
    expect(fields).toContain('Line A2')
  })
})


/** One produced tag and one consumed tag. */
const PROD_CONS_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"ProdCons\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags>\n      <Tag Name=\"FROM_FURN\" TagType=\"Produced\" DataType=\"DINT\"><ProduceInfo ProduceCount=\"1\" ProgrammaticallySendEventTrigger=\"false\"/></Tag>\n      <Tag Name=\"CCI_Nutro_dints\" TagType=\"Consumed\" DataType=\"DINT\"><ConsumeInfo Producer=\"CCI_Ethernet_Port_Controller\" RemoteTag=\"CCI_Nutro_dints\" RemoteInstance=\"0\" RPI=\"20\" Unicast=\"true\"/></Tag>\n      <Tag Name=\"Local\" TagType=\"Base\" DataType=\"BOOL\"/>\n    </Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('produced and consumed tags', () => {
  it('names the network role and the producer controller', async () => {
    const l5x = harness(new Map([['pc.l5x', new TextEncoder().encode(PROD_CONS_L5X)]]))
    await l5x.call('open_project', { path: 'pc.l5x' })
    const produced = await l5x.call('get_component', { kind: 'tag', name: 'FROM_FURN' })
    expect(produced.data?.component?.tagType).toBe('Produced')
    const consumed = await l5x.call('get_component', { kind: 'tag', name: 'CCI_Nutro_dints' })
    expect(consumed.data?.component?.tagType).toBe('Consumed')
    expect(consumed.data?.component?.consumerOf).toBe('CCI_Ethernet_Port_Controller')
    expect(consumed.data?.component?.remoteTag).toBe('CCI_Nutro_dints')
    const listed = await l5x.call('list_components', { kind: 'tag', filter: 'CCI_Nutro' })
    const row = (listed.data?.rows ?? [])[0] as { tagType?: string; consumerOf?: string } | undefined
    expect(row?.tagType).toBe('Consumed')
    expect(row?.consumerOf).toBe('CCI_Ethernet_Port_Controller')
  })
})
