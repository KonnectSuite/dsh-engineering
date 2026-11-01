/**
 * `compare_projects` on the languages that are not ladder.
 *
 * It is the tool a reviewer uses to judge an edit, and a comparison that answers "no changes"
 * while a Structured Text body or a diagram changed is worse than one that fails. Probing showed
 * it does see them — component `structured_text` for a body, `diagram` for FBD and SFC — and no
 * test held any of it, so this does.
 */
import { rmSync } from 'node:fs'
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

describe('alias and produce details', () => {
  it('names the alias target and the produce count', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="AliasInfo" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="Base" TagType="Base" DataType="DINT"/>
      <Tag Name="Short" TagType="Alias" DataType="DINT" AliasFor="Base"/>
      <Tag Name="Sent" TagType="Produced" DataType="DINT"><ProduceInfo ProduceCount="2" ProgrammaticallySendEventTrigger="true" UnicastPermitted="true"/></Tag>
    </Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['ai.l5x', new TextEncoder().encode(xml)]]))
    await l5x.call('open_project', { path: 'ai.l5x' })
    const alias = await l5x.call('get_component', { kind: 'tag', name: 'Short' })
    expect(alias.data?.component?.tagType).toBe('Alias')
    expect(alias.data?.component?.aliasFor).toBe('Base')
    const produced = await l5x.call('get_component', { kind: 'tag', name: 'Sent' })
    expect(produced.data?.component?.produceCount).toBe(2)
    expect(produced.data?.component?.produceUnicast).toBe(true)
    const listed = await l5x.call('list_components', { kind: 'tag', filter: 'Short' })
    expect(((listed.data?.rows ?? [])[0] as { aliasFor?: string } | undefined)?.aliasFor).toBe('Base')
  })
})

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


/** One AOI whose input parameter aliases into a tag array. */
const AOI_ALIAS_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"AoiAlias\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"WRK_PermArray\" TagType=\"Base\" DataType=\"BOOL\" Dimensions=\"32\"/></Tags>\n    <AddOnInstructionDefinitions>\n      <AddOnInstructionDefinition Name=\"AOI_PermCheck\" Revision=\"1\" ExecutePrescan=\"false\" ExecutePostscan=\"false\" ExecuteEnableInFalse=\"false\" CreatedDate=\"2026-01-01T00:00:00\" ModifiedDate=\"2026-01-01T00:00:00\">\n        <Parameters>\n          <Parameter Name=\"INP_Perm0\" TagType=\"Alias\" Usage=\"Input\" AliasFor=\"WRK_PermArray.0\" Required=\"true\" Visible=\"true\" ExternalAccess=\"Read/Write\"/>\n          <Parameter Name=\"Out\" Usage=\"Output\" DataType=\"BOOL\" Required=\"true\" Visible=\"true\" ExternalAccess=\"Read/Write\"/>\n        </Parameters>\n      </AddOnInstructionDefinition>\n    </AddOnInstructionDefinitions>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('an AOI parameter that aliases', () => {
  it('names the tag array element it points at', async () => {
    const l5x = harness(new Map([['a.l5x', new TextEncoder().encode(AOI_ALIAS_L5X)]]))
    await l5x.call('open_project', { path: 'a.l5x' })
    const aoi = await l5x.call('get_component', { kind: 'aoi', name: 'AOI_PermCheck' })
    const parameters = (aoi.data?.component?.parameters ?? []) as { name: string; tagType?: string; aliasFor?: string }[]
    const input = parameters.find(parameter => parameter.name === 'INP_Perm0')
    expect(input?.tagType).toBe('Alias')
    expect(input?.aliasFor).toBe('WRK_PermArray.0')
  })
})


/** One module recorded as faulted and inhibited. */
const MODULE_FAULT_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Modules\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags/>\n    <Modules>\n      <Module Name=\"Local\" CatalogNumber=\"5069-L320ER\" Vendor=\"1\" ProductType=\"14\" ProductCode=\"0\" Major=\"37\" Minor=\"0\" ParentModule=\"Local\" ParentModPortId=\"1\" Inhibited=\"false\" MajorFault=\"false\"/>\n      <Module Name=\"Local:3\" CatalogNumber=\"5069-IB16\" Vendor=\"1\" ProductType=\"7\" ProductCode=\"0\" Major=\"1\" Minor=\"1\" ParentModule=\"Local\" ParentModPortId=\"1\" Inhibited=\"true\" MajorFault=\"true\"/>\n    </Modules>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('a module recorded as faulted', () => {
  it('reports its fault and inhibit state from the export', async () => {
    const l5x = harness(new Map([['m.l5x', new TextEncoder().encode(MODULE_FAULT_L5X)]]))
    await l5x.call('open_project', { path: 'm.l5x' })
    const module = await l5x.call('get_component', { kind: 'module', name: 'Local:3' })
    expect(module.data?.component?.majorFault).toBe(true)
    expect(module.data?.component?.inhibited).toBe(true)
    const listed = await l5x.call('list_components', { kind: 'module', filter: 'Local:3' })
    const row = (listed.data?.rows ?? [])[0] as { majorFault?: boolean; inhibited?: boolean } | undefined
    expect(row?.majorFault).toBe(true)
    expect(row?.inhibited).toBe(true)
  })
})


/** One unused tag in a project whose only routine is encrypted, and the same with readable logic. */
const UNUSED_ENCRYPTED = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"UnusedTags\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"Orphan\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><EncodedData EncodedType=\"Routine\" Name=\"R\"/></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"
const UNUSED_READABLE = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"UnusedTags\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"Orphan\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent><Rung Number=\"0\" Type=\"N\"><Text><![CDATA[NOP();]]></Text></Rung></RLLContent></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('unused-tag analysis on an encrypted export', () => {
  it('is skipped and says so, instead of reporting every tag unused', async () => {
    const l5x = harness(new Map([['u.l5x', new TextEncoder().encode(UNUSED_ENCRYPTED)]]))
    await l5x.call('open_project', { path: 'u.l5x' })
    const checks = await l5x.call('run_checks', {})
    const findings = (checks.data?.findings ?? []) as { rule: string }[]
    expect(findings.some(finding => finding.rule === 'UNUSED_TAG')).toBe(false)
    const skipped = (checks.data?.skipped_readings ?? []) as { rule: string; reason: string }[]
    expect(skipped.some(entry => entry.rule === 'UNUSED_TAG')).toBe(true)
    expect(String(skipped[0]?.reason)).toContain('encrypted')
    expect(String(checks.summary)).toContain('reading(s) skipped')
  })

  it('still reports an unused tag when the logic is readable', async () => {
    const l5x = harness(new Map([['u.l5x', new TextEncoder().encode(UNUSED_READABLE)]]))
    await l5x.call('open_project', { path: 'u.l5x' })
    const checks = await l5x.call('run_checks', {})
    const findings = (checks.data?.findings ?? []) as { rule: string }[]
    expect(findings.some(finding => finding.rule === 'UNUSED_TAG')).toBe(true)
  })
})


/** Six rungs, so the diagram pages. */
const SIX_RUNGS_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Pages\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"B\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent><Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung><Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung><Rung Number=\"2\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung><Rung Number=\"3\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung><Rung Number=\"4\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung><Rung Number=\"5\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(B);]]></Text></Rung></RLLContent></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('a paginated routine diagram', () => {
  it('writes each page to its own absolute path', async () => {
    const l5x = harness(new Map([['p.l5x', new TextEncoder().encode(SIX_RUNGS_L5X)]]), { editing: true })
    await l5x.call('open_project', { path: 'p.l5x' })
    // Keep test artifacts out of the repository and remove them afterwards.
    const folder = '.l5x-preview-test'
    const first = await l5x.call('l5x_routine_diagram', { program: 'P', routine: 'R', max_rungs: 3, output: folder })
    expect(first.error).toBeUndefined()
    expect(String(first.data?.diagram_svg ?? '').length).toBeGreaterThan(0)
    expect(String(first.summary)).toContain('0-2')
    const second = await l5x.call('l5x_routine_diagram', { program: 'P', routine: 'R', max_rungs: 3, start_rung: 3, output: folder })
    expect(second.error).toBeUndefined()
    expect(String(second.summary)).toContain('3-5')
    const firstPng = first.data?.diagram_png
    const secondPng = second.data?.diagram_png
    if (typeof firstPng === 'string' && typeof secondPng === 'string') {
      expect(firstPng).not.toBe(secondPng)
      expect(/^[A-Za-z]:[\\/]|^\//u.test(firstPng)).toBe(true)
      expect(firstPng).toContain('r0-2')
      expect(secondPng).toContain('r3-5')
    }
    rmSync(folder, { recursive: true, force: true })
  })
})


/** A standard task and a safety task. */
const TASK_CLASS_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Tasks\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags/>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks>\n      <Task Name=\"MainTask\" Type=\"CONTINUOUS\" Class=\"Standard\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task>\n      <Task Name=\"SafetyTask\" Type=\"PERIODIC\" Rate=\"20\" Priority=\"10\" Class=\"Safety\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task>\n    </Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('task class', () => {
  it('says which task is a safety task, in the reader and the listing', async () => {
    const l5x = harness(new Map([['t.l5x', new TextEncoder().encode(TASK_CLASS_L5X)]]))
    await l5x.call('open_project', { path: 't.l5x' })
    const safety = await l5x.call('get_component', { kind: 'task', name: 'SafetyTask' })
    expect(safety.data?.component?.safety).toBe(true)
    const main = await l5x.call('get_component', { kind: 'task', name: 'MainTask' })
    expect(main.data?.component?.safety).toBe(false)
    const listed = await l5x.call('list_components', { kind: 'task' })
    const rows = (listed.data?.rows ?? []) as { name: string; safety?: boolean }[]
    expect(rows.find(row => row.name === 'SafetyTask')?.safety).toBe(true)
    expect(rows.find(row => row.name === 'MainTask')?.safety).toBe(false)
  })
})


/** One standard program and one declared safety program. */
const PROGRAM_CLASS_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"ProgramClass\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags/>\n    <Programs>\n      <Program Name=\"Standard\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program>\n      <Program Name=\"Guard\" MainRoutineName=\"R\" Class=\"Safety\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program>\n    </Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"Standard\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('program class', () => {
  it('says which program is a safety program', async () => {
    const l5x = harness(new Map([['pc.l5x', new TextEncoder().encode(PROGRAM_CLASS_L5X)]]))
    await l5x.call('open_project', { path: 'pc.l5x' })
    const guard = await l5x.call('get_component', { kind: 'program', name: 'Guard' })
    expect(guard.data?.component?.safety).toBe(true)
    const listed = await l5x.call('list_components', { kind: 'program' })
    const rows = (listed.data?.rows ?? []) as { name: string; safety?: boolean }[]
    expect(rows.find(row => row.name === 'Guard')?.safety).toBe(true)
    expect(rows.find(row => row.name === 'Standard')?.safety).toBe(false)
  })
})


/** A safety I/O module and a safety AOI beside standard ones. */
const SAFETY_KIT_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"SafetyKit\" ProcessorType=\"5069-L320ER\" MajorRev=\"37\" MinorRev=\"0\">\n    <Tags/>\n    <Modules>\n      <Module Name=\"SA_DIG_IN_1\" CatalogNumber=\"1756-IB16S/A\" Vendor=\"1\" ProductType=\"35\" ProductCode=\"33\" Major=\"1\" Minor=\"11\" ParentModule=\"Local\" ParentModPortId=\"1\" Inhibited=\"false\" MajorFault=\"false\" SafetyNetwork=\"16#0000_4bc3_04a5_39a3\" SafetyEnabled=\"true\"/>\n      <Module Name=\"Local:3\" CatalogNumber=\"5069-IB16\" Vendor=\"1\" ProductType=\"7\" ProductCode=\"0\" Major=\"1\" Minor=\"1\" ParentModule=\"Local\" ParentModPortId=\"1\" Inhibited=\"false\" MajorFault=\"false\"/>\n    </Modules>\n    <AddOnInstructionDefinitions>\n      <AddOnInstructionDefinition Name=\"FC_SFTY_SSOV\" Class=\"Safety\" Revision=\"1.0\" ExecutePrescan=\"true\" ExecutePostscan=\"false\" ExecuteEnableInFalse=\"true\">\n        <Parameters><Parameter Name=\"In\" Usage=\"Input\" DataType=\"BOOL\" Required=\"true\" Visible=\"true\" ExternalAccess=\"Read/Write\"/></Parameters>\n      </AddOnInstructionDefinition>\n      <AddOnInstructionDefinition Name=\"FC_Adj_Ratio_SP\" Class=\"Standard\" Revision=\"1.0\" ExecutePrescan=\"false\" ExecutePostscan=\"false\" ExecuteEnableInFalse=\"false\">\n        <Parameters><Parameter Name=\"In\" Usage=\"Input\" DataType=\"BOOL\" Required=\"true\" Visible=\"true\" ExternalAccess=\"Read/Write\"/></Parameters>\n      </AddOnInstructionDefinition>\n    </AddOnInstructionDefinitions>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('safety hardware and safety instructions', () => {
  it('names the safety module and the safety AOI in their listings', async () => {
    const l5x = harness(new Map([['sk.l5x', new TextEncoder().encode(SAFETY_KIT_L5X)]]))
    await l5x.call('open_project', { path: 'sk.l5x' })
    const safetyModule = await l5x.call('get_component', { kind: 'module', name: 'SA_DIG_IN_1' })
    expect(safetyModule.data?.component?.safetyEnabled).toBe(true)
    expect(safetyModule.data?.component?.safetyNetwork).toContain('4bc3')
    const modules = await l5x.call('list_components', { kind: 'module' })
    const moduleRows = (modules.data?.rows ?? []) as { name: string; safetyEnabled?: boolean }[]
    expect(moduleRows.find(row => row.name === 'SA_DIG_IN_1')?.safetyEnabled).toBe(true)
    expect(moduleRows.find(row => row.name === 'Local:3')?.safetyEnabled).toBe(false)
    const aoi = await l5x.call('get_component', { kind: 'aoi', name: 'FC_SFTY_SSOV' })
    expect(aoi.data?.component?.safety).toBe(true)
    const aois = await l5x.call('list_components', { kind: 'aoi' })
    const aoiRows = (aois.data?.rows ?? []) as { name: string; safety?: boolean }[]
    expect(aoiRows.find(row => row.name === 'FC_SFTY_SSOV')?.safety).toBe(true)
    expect(aoiRows.find(row => row.name === 'FC_Adj_Ratio_SP')?.safety).toBe(false)
  })
})


/** A controller whose export remembers its route and project serial number. */
const ROUTED_L5X = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Use=\"Target\" Name=\"Routed\" ProcessorType=\"1756-L81ES\" MajorRev=\"36\" MinorRev=\"11\" CommPath=\"CIM_Prep\\10.211.100.100\\Backplane\\0\" ProjectSN=\"16#0163_1759\" MatchProjectToController=\"false\">\n    <Tags/>\n    <Programs><Program Name=\"P\" MainRoutineName=\"R\"><Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent/></Routine></Routines></Program></Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"

describe('controller metadata', () => {
  it('carries the saved communication path and project serial number', async () => {
    const l5x = harness(new Map([['r.l5x', new TextEncoder().encode(ROUTED_L5X)]]))
    await l5x.call('open_project', { path: 'r.l5x' })
    const overview = await l5x.call('project_overview')
    const controller = (overview.data?.controller ?? {}) as { commPath?: string; projectSerialNumber?: string }
    expect(controller.commPath).toContain('10.211.100.100')
    expect(controller.projectSerialNumber).toBe('16#0163_1759')
  })
})

/** A consumed tag read once in logic, and a produced tag. */
const NETWORK_TAGS_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="NetworkTags" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="CCI_Nutro_dints" TagType="Consumed" DataType="DINT"><ConsumeInfo Producer="CCI_Ethernet_Port_Controller" RemoteTag="CCI_Nutro_dints" RemoteInstance="0" RPI="20" Unicast="true"/></Tag>
      <Tag Name="FROM_FURN" TagType="Produced" DataType="DINT"><ProduceInfo ProduceCount="2" ProgrammaticallySendEventTrigger="false" UnicastPermitted="true"/></Tag>
    </Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines><Routine Name="R" Type="RLL"><RLLContent>
      <Rung Number="0" Type="N"><Text><![CDATA[XIC(CCI_Nutro_dints.0)OTE(FROM_FURN.0);]]></Text></Rung>
    </RLLContent></Routine></Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('who writes a networked tag', () => {
  it('names the producer controller for a consumed tag and the consumer count for a produced one', async () => {
    const l5x = harness(new Map([['n.l5x', new TextEncoder().encode(NETWORK_TAGS_L5X)]]))
    await l5x.call('open_project', { path: 'n.l5x' })
    const consumed = await l5x.call('find_references', { symbol: 'CCI_Nutro_dints' })
    expect(String(consumed.summary)).toContain('Consumed tag: written by CCI_Ethernet_Port_Controller as CCI_Nutro_dints')
    const produced = await l5x.call('find_references', { symbol: 'FROM_FURN' })
    expect(String(produced.summary)).toContain('Produced tag: 2 consumer(s) declared')
    // An empty graph must not read as "nothing feeds this".
    const upstream = await l5x.call('trace_dependencies', { symbol: 'CCI_Nutro_dints', direction: 'upstream' })
    expect(String(upstream.summary)).toContain('Value arrives from CCI_Ethernet_Port_Controller as CCI_Nutro_dints')
    const downstream = await l5x.call('trace_dependencies', { symbol: 'FROM_FURN', direction: 'downstream' })
    expect(String(downstream.summary)).toContain('Value leaves to 2 consumer(s)')
  })
})

/** The same project on a different processor and a different saved route. */
const CONTROLLER_VARIANT = (processor: string, commPath: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="Ctrl" ProcessorType="${processor}" MajorRev="36" MinorRev="11" CommPath="${commPath}" ProjectSN="16#0163_1759">
    <Tags/>
    <Programs><Program Name="P" MainRoutineName="R"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('a controller-level change', () => {
  it('reports the processor and the saved route instead of "no changes"', async () => {
    const l5x = harness(new Map([
      ['a.l5x', new TextEncoder().encode(CONTROLLER_VARIANT('1756-L81ES', 'CIM_Prep/10.211.100.100/Backplane/0'))],
      ['b.l5x', new TextEncoder().encode(CONTROLLER_VARIANT('1756-L82ES', 'CIM_Prep/10.211.100.101/Backplane/0'))],
    ]))
    const one = await l5x.call('open_project', { path: 'a.l5x' })
    const two = await l5x.call('open_project', { path: 'b.l5x' })
    const diff = await l5x.call('compare_projects', { before_id: one.data?.project_id, after_id: two.data?.project_id })
    const changes = (diff.data?.changes ?? []) as { component: string; changed_fields?: string[] }[]
    const controller = changes.find(change => change.component === 'controller')
    expect(controller).toBeDefined()
    const fields = (controller?.changed_fields ?? []).join(' ')
    expect(fields).toContain('processorType 1756-L81ES to 1756-L82ES')
    expect(fields).toContain('commPath')
  })
})

/** One export differing from the other only in a module revision, an AOI parameter and a tag radix. */
function deepVariant(moduleMinor: string, aoiType: string, radix: string, constant: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="Deep" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags><Tag Name="Speed" TagType="Base" DataType="REAL" Radix="${radix}" Constant="${constant}" ExternalAccess="Read/Write"/></Tags>
    <Modules><Module Name="Local:3" CatalogNumber="5069-IB16" Vendor="1" ProductType="7" ProductCode="0" Major="1" Minor="${moduleMinor}" ParentModule="Local" ParentModPortId="1" Inhibited="false" MajorFault="false"/></Modules>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="AOI_X" Class="Standard" Revision="1.0" ExecutePrescan="false" ExecutePostscan="false" ExecuteEnableInFalse="false">
        <Parameters><Parameter Name="In" Usage="Input" DataType="${aoiType}" Required="true" Visible="true" ExternalAccess="Read/Write"/></Parameters>
      </AddOnInstructionDefinition>
    </AddOnInstructionDefinitions>
    <Programs><Program Name="P" MainRoutineName="R"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
}

describe('changes below the component name', () => {
  it('reports a module revision, an AOI parameter type and a tag radix', async () => {
    // Probed before writing this: each of these was reported, so the test locks the coverage in.
    const before = deepVariant('11', 'BOOL', 'Float', 'false')
    const after = deepVariant('12', 'DINT', 'Decimal', 'true')
    const l5x = harness(new Map([
      ['a.l5x', new TextEncoder().encode(before)],
      ['b.l5x', new TextEncoder().encode(after)],
    ]))
    const one = await l5x.call('open_project', { path: 'a.l5x' })
    const two = await l5x.call('open_project', { path: 'b.l5x' })
    expect(one.error).toBeUndefined()
    expect(two.error).toBeUndefined()
    const diff = await l5x.call('compare_projects', { before_id: one.data?.project_id, after_id: two.data?.project_id })
    const changes = (diff.data?.changes ?? []) as { component: string; changed_fields?: string[] }[]
    const all = changes.map(change => `${change.component} ${(change.changed_fields ?? []).join(' ')}`).join('\n')
    expect(all).toContain('module minor 11 to 12')
    expect(all).toContain('aoi parameters')
    expect(all).toContain('tag radix Float to Decimal')
    expect(all).toContain('constant undefined to true')
  })
})

/** A safety instruction called from standard logic, and the same call inside a safety program. */
const SAFETY_CONTEXT_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="SafetyCtx" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags><Tag Name="A" TagType="Base" DataType="BOOL"/></Tags>
    <AddOnInstructionDefinitions>
      <AddOnInstructionDefinition Name="FC_SFTY_SSOV" Class="Safety" Revision="1.0" ExecutePrescan="true" ExecutePostscan="false" ExecuteEnableInFalse="true">
        <Parameters><Parameter Name="In" Usage="Input" DataType="BOOL" Required="true" Visible="true" ExternalAccess="Read/Write"/></Parameters>
      </AddOnInstructionDefinition>
    </AddOnInstructionDefinitions>
    <Programs>
      <Program Name="Standard" MainRoutineName="R"><Routines>
        <Routine Name="R" Type="RLL"><RLLContent>
          <Rung Number="0" Type="N"><Text><![CDATA[XIC(A)FC_SFTY_SSOV(A);]]></Text></Rung>
        </RLLContent></Routine>
      </Routines></Program>
      <Program Name="Guard" MainRoutineName="R" Class="Safety"><Routines>
        <Routine Name="R" Type="RLL"><RLLContent>
          <Rung Number="0" Type="N"><Text><![CDATA[XIC(A)FC_SFTY_SSOV(A);]]></Text></Rung>
        </RLLContent></Routine>
      </Routines></Program>
    </Programs>
    <Tasks>
      <Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Standard"/></ScheduledPrograms></Task>
      <Task Name="SafetyTask" Type="PERIODIC" Rate="20" Priority="10" Class="Safety"><ScheduledPrograms><ScheduledProgram Name="Guard"/></ScheduledPrograms></Task>
    </Tasks>
  </Controller>
</RSLogix5000Content>`

describe('a safety instruction outside a safety program', () => {
  it('is reported in standard logic and not in the safety program', async () => {
    const l5x = harness(new Map([['sc.l5x', new TextEncoder().encode(SAFETY_CONTEXT_L5X)]]))
    await l5x.call('open_project', { path: 'sc.l5x' })
    const checks = await l5x.call('run_checks', { rule: 'SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM' })
    const findings = (checks.data?.findings ?? []) as { message: string; severity: string }[]
    expect(findings.length).toBe(1)
    expect(findings[0]?.severity).toBe('warning')
    expect(String(findings[0]?.message)).toContain('standard program Standard')
    expect(String(findings[0]?.message)).not.toContain('Guard')
    // A finding must say what to do, not only what is wrong.
    expect(String(findings[0]?.message)).toContain('call it from a routine scheduled by a safety task')
  })
})

/** One safety program scheduled by a standard task, one by a safety task; one safety module without a network. */
const SAFETY_SCHEDULE_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Use="Target" Name="SafetySched" ProcessorType="5069-L320ER" MajorRev="37" MinorRev="0">
    <Tags/>
    <Modules>
      <Module Name="SA_BAD" CatalogNumber="1756-IB16S/A" Vendor="1" ProductType="35" ProductCode="33" Major="1" Minor="11" ParentModule="Local" ParentModPortId="1" Inhibited="false" MajorFault="false" SafetyEnabled="true"/>
      <Module Name="SA_OK" CatalogNumber="1756-IB16S/A" Vendor="1" ProductType="35" ProductCode="33" Major="1" Minor="11" ParentModule="Local" ParentModPortId="1" Inhibited="false" MajorFault="false" SafetyEnabled="true" SafetyNetwork="16#0000_4bc3"/>
    </Modules>
    <Programs>
      <Program Name="Misplaced" MainRoutineName="R" Class="Safety"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program>
      <Program Name="Guard" MainRoutineName="R" Class="Safety"><Routines><Routine Name="R" Type="RLL"><RLLContent/></Routine></Routines></Program>
    </Programs>
    <Tasks>
      <Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Misplaced"/></ScheduledPrograms></Task>
      <Task Name="SafetyTask" Type="PERIODIC" Rate="20" Priority="10" Class="Safety"><ScheduledPrograms><ScheduledProgram Name="Guard"/></ScheduledPrograms></Task>
    </Tasks>
  </Controller>
</RSLogix5000Content>`

describe('safety scheduling and safety network', () => {
  it('reports a safety program in a standard task and a safety module without a network', async () => {
    const l5x = harness(new Map([['ss.l5x', new TextEncoder().encode(SAFETY_SCHEDULE_L5X)]]))
    await l5x.call('open_project', { path: 'ss.l5x' })
    const schedule = await l5x.call('run_checks', { rule: 'SAFETY_PROGRAM_NOT_IN_SAFETY_TASK' })
    const scheduleFindings = (schedule.data?.findings ?? []) as { message: string }[]
    expect(scheduleFindings.length).toBe(1)
    expect(String(scheduleFindings[0]?.message)).toContain('Misplaced')
    expect(String(scheduleFindings[0]?.message)).toContain('MainTask')
    expect(String(scheduleFindings[0]?.message)).not.toContain('Guard')
    expect(String(scheduleFindings[0]?.message)).toContain('move it to a safety task')
    const network = await l5x.call('run_checks', { rule: 'SAFETY_MODULE_WITHOUT_SAFETY_NETWORK' })
    const networkFindings = (network.data?.findings ?? []) as { message: string }[]
    expect(networkFindings.length).toBe(1)
    expect(String(networkFindings[0]?.message)).toContain('SA_BAD')
    expect(String(networkFindings[0]?.message)).not.toContain('SA_OK')
    expect(String(networkFindings[0]?.message)).toContain('set its SafetyNetwork')
  })
})
