import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** Open the fixture and return the harness. */
async function opened() {
  const l5x = harness()
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('run_checks', () => {
  it('returns findings with counts and a review caveat', async () => {
    const l5x = await opened()
    const checks = await l5x.call('run_checks', {})
    expect(checks.error).toBeUndefined()
    expect(Number(checks.data?.total)).toBeGreaterThan(0)
    expect(checks.data?.by_severity).toBeTypeOf('object')
    expect(checks.summary).toContain('finding')
    expect(checks.coverage?.unverified.join(' ')).toContain('heuristics')
  })

  it('filters by the rule the caller learned from the unfiltered answer', async () => {
    const l5x = await opened()
    const all = await l5x.call('run_checks', {})
    const findings = all.data?.findings as { rule: string }[]
    const rule = findings[0]?.rule
    expect(rule).toBeTypeOf('string')
    const filtered = await l5x.call('run_checks', { rule })
    const rows = filtered.data?.findings as { rule: string }[]
    expect(rows.every(row => row.rule === rule)).toBe(true)
  })

  it('filters by severity', async () => {
    const l5x = await opened()
    const filtered = await l5x.call('run_checks', { severity: 'warning' })
    const rows = filtered.data?.findings as { severity: string }[]
    expect(rows.every(row => row.severity === 'warning')).toBe(true)
  })

  it('does not report controller system flags as unresolved', async () => {
    const text = Buffer.from(fixtureBytes()).toString('utf8')
      .replace('XIC(Start) ,XIC(RunLatch)', 'XIC(S:FS) XIC(NotDeclared) ,XIC(RunLatch)')
    const l5x = harness(new Map([['sample.l5x', new TextEncoder().encode(text)]]))
    await l5x.call('open_project', { path: 'sample.l5x' })
    const checks = await l5x.call('run_checks', { rule: 'UNRESOLVED_REFERENCE' })
    const messages = (checks.data?.findings as { message: string }[]).map(row => row.message).join('\n')
    expect(messages).not.toContain('S:FS')
    expect(messages).toContain('NotDeclared')
  })

  it('does not call a module-defined tag unused', async () => {
    const text = Buffer.from(fixtureBytes()).toString('utf8').replace(
      '<Tag Name="SystemClock"',
      '<Tag Name="Local:1:C" TagType="Base" DataType="DINT" Radix="Decimal" Constant="false" ExternalAccess="Read/Write" Description="Module I/O counter" />\n            <Tag Name="SystemClock"',
    )
    const l5x = harness(new Map([['sample.l5x', new TextEncoder().encode(text)]]))
    await l5x.call('open_project', { path: 'sample.l5x' })
    const checks = await l5x.call('run_checks', { rule: 'UNUSED_TAG' })
    const messages = (checks.data?.findings as { message: string }[]).map(row => row.message).join('\n')
    expect(messages).not.toContain('Local:1:C')
  })

  it('accepts a baseline project for I/O change checks', async () => {
    const files = new Map<string, Uint8Array>([
      ['before.l5x', fixtureBytes()],
      ['after.l5x', fixtureBytes()],
    ])
    const l5x = harness(files)
    const before = await l5x.call('open_project', { path: 'before.l5x' })
    const after = await l5x.call('open_project', { path: 'after.l5x' })
    const checks = await l5x.call('run_checks', {
      project_id: after.data?.project_id,
      baseline_id: before.data?.project_id,
    })
    expect(checks.error).toBeUndefined()
    expect(checks.data?.total).toBeTypeOf('number')
  })
})

describe('compare_projects', () => {
  it('reports no changes between two opens of the same bytes', async () => {
    const files = new Map<string, Uint8Array>([
      ['before.l5x', fixtureBytes()],
      ['after.l5x', fixtureBytes()],
    ])
    const l5x = harness(files)
    const before = await l5x.call('open_project', { path: 'before.l5x' })
    const after = await l5x.call('open_project', { path: 'after.l5x' })
    const diff = await l5x.call('compare_projects', {
      before_id: before.data?.project_id,
      after_id: after.data?.project_id,
    })
    expect(diff.error).toBeUndefined()
    expect(diff.data?.count).toBe(0)
  })

  it('reports a changed tag with its component and kind', async () => {
    const original = new TextDecoder().decode(fixtureBytes())
    const edited = original.replace('Production line speed setpoint', 'Production line speed setpoint (rev B)')
    expect(edited).not.toBe(original)
    const files = new Map<string, Uint8Array>([
      ['before.l5x', new TextEncoder().encode(original)],
      ['after.l5x', new TextEncoder().encode(edited)],
    ])
    const l5x = harness(files)
    const before = await l5x.call('open_project', { path: 'before.l5x' })
    const after = await l5x.call('open_project', { path: 'after.l5x' })
    const diff = await l5x.call('compare_projects', {
      before_id: before.data?.project_id,
      after_id: after.data?.project_id,
    })
    expect(diff.error).toBeUndefined()
    expect(Number(diff.data?.count)).toBeGreaterThan(0)
    expect(diff.data?.by_component).toMatchObject({ tag: expect.any(Number) })
    const changes = diff.data?.changes as { component: string; key: string }[]
    expect(changes.some(change => change.component === 'tag' && change.key.includes('LineSpeed'))).toBe(true)
  })

  it('refuses an unknown handle', async () => {
    const l5x = await opened()
    const diff = await l5x.call('compare_projects', { before_id: 'nope', after_id: 'nope' })
    expect(diff.error?.code).toBe('UNKNOWN_PROJECT')
  })
})

/** A project with one rung that latches and two that drive the same output. */
const STANDARD_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content TargetName="Std">
 <Controller Name="Std" Use="Target">
  <DataTypes />
  <Tags />
  <Programs>
   <Program Name="MainProgram" Use="Target">
    <Tags />
    <Routines>
     <Routine Name="MainRoutine" Type="RLL">
      <RLLContent>
       <Rung Number="0" Type="N"><Text>OTL(Latch_1);</Text></Rung>
       <Rung Number="1" Type="N"><Text>OTE(Out_1);</Text></Rung>
       <Rung Number="2" Type="N"><Text>OTE(Out_1);</Text></Rung>
       <Rung Number="3" Type="N"><Text>OTU(Latch_1);</Text></Rung>
      </RLLContent>
     </Routine>
    </Routines>
   </Program>
  </Programs>
 </Controller>
</RSLogix5000Content>`

/** The rules reported for one document. */
async function rules(xml: string): Promise<readonly string[]> {
  const l5x = harness(new Map([['std.l5x', new TextEncoder().encode(xml)]]))
  const open = await l5x.call('open_project', { path: 'std.l5x' })
  expect(open.error).toBeUndefined()
  const checks = await l5x.call('run_checks', {})
  const findings = (checks.data?.findings ?? []) as readonly { rule: string }[]
  return findings.map(finding => finding.rule)
}

describe('standards rules', () => {
  it('flags an output driven from two rungs in one routine', async () => {
    expect(await rules(STANDARD_L5X)).toContain('DUPLICATE_OUTPUT')
  })

  it('does not flag a latch whose reset exists anywhere in the export', async () => {
    expect(await rules(STANDARD_L5X)).not.toContain('LATCH_WITHOUT_RESET')
  })

  it('flags a latch with no reset', async () => {
    const withoutReset = STANDARD_L5X.replace('<Rung Number="3" Type="N"><Text>OTU(Latch_1);</Text></Rung>', '')
    expect(await rules(withoutReset)).toContain('LATCH_WITHOUT_RESET')
  })

  it('names the craft basis so the reference can be cited', async () => {
    const l5x = harness(new Map([['std.l5x', new TextEncoder().encode(STANDARD_L5X)]]))
    await l5x.call('open_project', { path: 'std.l5x' })
    const checks = await l5x.call('run_checks', { rule: 'DUPLICATE_OUTPUT' })
    const findings = (checks.data?.findings ?? []) as readonly { evidence: { basis?: string } }[]
    expect(findings[0]?.evidence.basis).toBeTypeOf('string')
  })
})


describe('a run_checks baseline', () => {
  /** Two exports that differ in one module catalog number. */
  function pair() {
    const before = new TextDecoder().decode(fixtureBytes())
    const after = before.replace('CatalogNumber="1769-L33ER"', 'CatalogNumber="1769-L33ER-X"')
    expect(after).not.toBe(before)
    return harness(new Map([
      ['before.l5x', new TextEncoder().encode(before)],
      ['after.l5x', new TextEncoder().encode(after)],
    ]))
  }

  it('names the module field that changed, not just that it changed', async () => {
    const l5x = pair()
    const one = await l5x.call('open_project', { path: 'before.l5x' })
    const two = await l5x.call('open_project', { path: 'after.l5x' })
    const result = await l5x.call('run_checks', {
      project_id: two.data?.project_id,
      baseline_id: one.data?.project_id,
      rule: 'IO_MODULE_CHANGED',
    })
    expect(result.error).toBeUndefined()
    const rows = result.data?.findings as { message: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('catalogNumber')
    expect(rows[0]?.message).toContain('1769-L33ER-X')
  })

  it('reports no I/O change when the two exports match', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const one = await l5x.call('open_project', { path: 'sample.l5x' })
    const result = await l5x.call('run_checks', { baseline_id: one.data?.project_id, rule: 'IO_MODULE_CHANGED' })
    expect((result.data?.findings as unknown[]).length).toBe(0)
  })
})


/** An export that trips the four findings whose messages name their sites. */
const SITES_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Findings\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"B\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"Out\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"Latch\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs>\n      <Program Name=\"Main\" MainRoutineName=\"R\">\n        <Routines>\n          <Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n            <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(B)OTE(Out);]]></Text></Rung>\n            <Rung Number=\"2\" Type=\"N\"><Text><![CDATA[XIC(A)OTL(Latch);]]></Text></Rung>\n          </RLLContent></Routine>\n        </Routines>\n      </Program>\n    </Programs>\n    <Tasks>\n      <Task Name=\"Fast\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"Main\"/></ScheduledPrograms></Task>\n      <Task Name=\"Slow\" Type=\"PERIODIC\" Rate=\"100\"><ScheduledPrograms><ScheduledProgram Name=\"Main\"/></ScheduledPrograms></Task>\n    </Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('findings name the places they found', () => {
  it('names the tasks a program is scheduled in', async () => {
    const l5x = harness(new Map([['sites.l5x', new TextEncoder().encode(SITES_L5X)]]))
    await l5x.call('open_project', { path: 'sites.l5x' })
    const result = await l5x.call('run_checks', { rule: 'MULTIPLE_SCHEDULES' })
    const rows = result.data?.findings as { message: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Fast')
    expect(rows[0]?.message).toContain('Slow')
  })

  it('names the rungs an output is driven from, and keeps the tag casing', async () => {
    const l5x = harness(new Map([['sites.l5x', new TextEncoder().encode(SITES_L5X)]]))
    await l5x.call('open_project', { path: 'sites.l5x' })
    const duplicate = await l5x.call('run_checks', { rule: 'DUPLICATE_OUTPUT' })
    const outputRows = duplicate.data?.findings as { message: string }[]
    expect(outputRows[0]?.message).toContain('0, 1')

    const latch = await l5x.call('run_checks', { rule: 'LATCH_WITHOUT_RESET' })
    const latchRows = latch.data?.findings as { message: string }[]
    expect(latchRows[0]?.message).toContain('Latch')
    expect(latchRows[0]?.message).toContain('rung 2')
  })

  it('names the sites an output-like symbol is written from', async () => {
    const l5x = harness(new Map([['sites.l5x', new TextEncoder().encode(SITES_L5X)]]))
    await l5x.call('open_project', { path: 'sites.l5x' })
    const result = await l5x.call('run_checks', { rule: 'MULTIPLE_OUTPUT_WRITES' })
    const rows = result.data?.findings as { message: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('2 sites')
    expect(rows[0]?.message).toContain('rung 0')
  })
})


/** An export whose rung names an instruction this catalogue does not carry. */
const UNCATALOGUED_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Coverage\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"Out\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs>\n      <Program Name=\"Main\" MainRoutineName=\"R\">\n        <Routines>\n          <Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)FROB(Out,5);]]></Text></Rung>\n            <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(A)XIC(Out)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n        </Routines>\n      </Program>\n    </Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"Main\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('logic the catalogue could not check', () => {
  it('names the instruction it could not arity-check, and says why that is not an error', async () => {
    const l5x = harness(new Map([['coverage.l5x', new TextEncoder().encode(UNCATALOGUED_L5X)]]))
    await l5x.call('open_project', { path: 'coverage.l5x' })
    const result = await l5x.call('run_checks', { rule: 'UNCATALOGUED_INSTRUCTION' })
    const rows = result.data?.findings as { message: string; severity: string; evidence: { catalogue_size?: number; note?: string } }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.severity).toBe('info')
    expect(rows[0]?.message).toContain('FROB')
    expect(rows[0]?.evidence.catalogue_size).toBeGreaterThan(100)
    expect(String(rows[0]?.evidence.note)).toContain('Studio remains the arity gate')
  })

  it('stays quiet for catalogued instructions and for a declared AOI call', async () => {
    // The fixture calls Motor_Control, which is an AOI it declares, so it must not be flagged.
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    await l5x.call('open_project', { path: 'sample.l5x' })
    const result = await l5x.call('run_checks', { rule: 'UNCATALOGUED_INSTRUCTION' })
    expect(result.data?.findings).toEqual([])
  })
})


describe('a staged rung the catalogue cannot check', () => {
  it('says so when the draft is validated', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
    await l5x.call('open_project', { path: 'sample.l5x' })
    const staged = await l5x.call('draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', rung: 0, mode: 'replace',
      text: 'XIC(StartPB)FROB(FaultCount,5);',
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', { draft_id: staged.data?.draft_id })
    expect(validated.error).toBeUndefined()
    const checks = validated.data?.checks as { new_findings?: { rule: string }[] } | undefined
    const rules = (checks?.new_findings ?? []).map(finding => finding.rule)
    expect(rules).toContain('UNCATALOGUED_INSTRUCTION')
  })
})


/** An export whose rungs jump to a routine in another program and to a label that is not there. */
const TRANSFER_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Transfer\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"Out\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs>\n      <Program Name=\"P1\" MainRoutineName=\"R\">\n        <Routines>\n          <Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)JSR(Ghost);]]></Text></Rung>\n            <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(A)JMP(Skip);]]></Text></Rung>\n            <Rung Number=\"2\" Type=\"N\"><Text><![CDATA[LBL(Skip);]]></Text></Rung>\n            <Rung Number=\"3\" Type=\"N\"><Text><![CDATA[XIC(A)JSR(Sub);]]></Text></Rung>\n            <Rung Number=\"4\" Type=\"N\"><Text><![CDATA[XIC(A)JMP(Nowhere);]]></Text></Rung>\n            <Rung Number=\"5\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n          <Routine Name=\"Sub\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n        </Routines>\n      </Program>\n      <Program Name=\"P2\" MainRoutineName=\"Ghost\">\n        <Routines>\n          <Routine Name=\"Ghost\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n        </Routines>\n      </Program>\n    </Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P1\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('control transfer', () => {
  it('reports a jump to a routine its own program does not declare, and says where that name lives', async () => {
    const l5x = harness(new Map([['transfer.l5x', new TextEncoder().encode(TRANSFER_L5X)]]))
    await l5x.call('open_project', { path: 'transfer.l5x' })
    const result = await l5x.call('run_checks', { rule: 'UNRESOLVED_ROUTINE' })
    const rows = result.data?.findings as { message: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Ghost')
    expect(rows[0]?.message).toContain('exists in P2')
    // The JSR to Sub is in the same program and must not be reported.
    expect(rows[0]?.message).not.toContain('Sub')
  })

  it('reports a jump to a label no LBL in the routine uses', async () => {
    const l5x = harness(new Map([['transfer.l5x', new TextEncoder().encode(TRANSFER_L5X)]]))
    await l5x.call('open_project', { path: 'transfer.l5x' })
    const result = await l5x.call('run_checks', { rule: 'LABEL_NOT_FOUND' })
    const rows = result.data?.findings as { message: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Nowhere')
    // Skip has an LBL on rung 2, so it must not be reported.
    expect(rows[0]?.message).not.toContain('Skip')
  })
})


/** An export with a missing main routine, a duplicate routine name and an unscheduled program. */
const BINDING_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"36.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Binding\" ProcessorType=\"1756-L8\" MajorRev=\"36\" MinorRev=\"0\">\n    <Tags><Tag Name=\"A\" TagType=\"Base\" DataType=\"BOOL\"/><Tag Name=\"Out\" TagType=\"Base\" DataType=\"BOOL\"/></Tags>\n    <Programs>\n      <Program Name=\"P\" MainRoutineName=\"Ghost\">\n        <Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n          <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n        </RLLContent></Routine></Routines>\n      </Program>\n      <Program Name=\"Q\" MainRoutineName=\"R1\">\n        <Routines>\n          <Routine Name=\"R1\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n          <Routine Name=\"r1\" Type=\"RLL\"><RLLContent>\n            <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(A)OTE(Out);]]></Text></Rung>\n          </RLLContent></Routine>\n        </Routines>\n      </Program>\n    </Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"P\"/><ScheduledProgram Name=\"NoProg\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('named bindings that point at nothing', () => {
  async function findingsFor(rule: string) {
    const l5x = harness(new Map([['binding.l5x', new TextEncoder().encode(BINDING_L5X)]]))
    await l5x.call('open_project', { path: 'binding.l5x' })
    const result = await l5x.call('run_checks', { rule })
    return (result.data?.findings ?? []) as { message: string }[]
  }

  it('reports a program whose main routine it does not declare', async () => {
    const rows = await findingsFor('MAIN_ROUTINE_MISSING')
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Ghost')
  })

  it('reports a duplicate routine name under the spelling declared first', async () => {
    const rows = await findingsFor('DUPLICATE_ROUTINE_NAME')
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('R1')
    expect(rows[0]?.message).not.toContain('named r1')
  })

  it('reports a task that schedules a program the export does not declare', async () => {
    const rows = await findingsFor('SCHEDULED_PROGRAM_MISSING')
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('NoProg')
    expect(rows[0]?.message).toContain('T')
  })

  it('stays quiet on a project whose bindings all resolve', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    await l5x.call('open_project', { path: 'sample.l5x' })
    const result = await l5x.call('run_checks', {})
    const noisy = ((result.data?.findings ?? []) as { rule: string }[]).filter(finding => ['MAIN_ROUTINE_MISSING', 'DUPLICATE_ROUTINE_NAME', 'SCHEDULED_PROGRAM_MISSING'].includes(finding.rule))
    expect(noisy).toEqual([])
  })
})


/** An export with a module-defined tag, a radix literal, and two bits of one output word. */
const NOISE_L5X = ["<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<RSLogix5000Content SchemaRevision=\"1.0\" SoftwareRevision=\"37.00\" TargetType=\"Controller\" ContainsContext=\"false\">\n  <Controller Name=\"Noise\" ProcessorType=\"5069-L320\" MajorRev=\"37\" MinorRev=\"0\">\n    <Modules><Module Name=\"Card1\" CatalogNumber=\"5069-IB16\" ParentModule=\"Local\" ParentModPortId=\"1\" Major=\"1\" Minor=\"0\" Inhibited=\"false\"/></Modules>\n    <Tags>\n      <Tag Name=\"Flag\" TagType=\"Base\" DataType=\"BOOL\"/>\n      <Tag Name=\"Mask\" TagType=\"Base\" DataType=\"DINT\"/>\n      <Tag Name=\"Out1\" TagType=\"Base\" DataType=\"BOOL\"/>\n    </Tags>\n    <Programs>\n      <Program Name=\"Main\" MainRoutineName=\"R\">\n        <Routines><Routine Name=\"R\" Type=\"RLL\"><RLLContent>\n          <Rung Number=\"0\" Type=\"N\"><Text><![CDATA[XIC(Card1:I.Data[0].0)OTE(Out1);]]></Text></Rung>\n          <Rung Number=\"1\" Type=\"N\"><Text><![CDATA[XIC(Card1:I.Data[0].1)OTE(Out1);]]></Text></Rung>\n          <Rung Number=\"2\" Type=\"N\"><Text><![CDATA[XIC(Flag)MOVE(16#F000,Mask);]]></Text></Rung>\n          <Rung Number=\"3\" Type=\"N\"><Text><![CDATA[XIC(Card1:O.Data[0].0)OTE(Card1:O.Data[0].0);]]></Text></Rung>\n          <Rung Number=\"4\" Type=\"N\"><Text><![CDATA[XIC(Card1:O.Data[0].1)OTE(Card1:O.Data[0].1);]]></Text></Rung>\n        </RLLContent></Routine></Routines>\n      </Program>\n    </Programs>\n    <Tasks><Task Name=\"T\" Type=\"CONTINUOUS\"><ScheduledPrograms><ScheduledProgram Name=\"Main\"/></ScheduledPrograms></Task></Tasks>\n  </Controller>\n</RSLogix5000Content>"].join('')

describe('the noise a real project produced', () => {
  async function findings(rule: string) {
    const l5x = harness(new Map([['noise.l5x', new TextEncoder().encode(NOISE_L5X)]]))
    await l5x.call('open_project', { path: 'noise.l5x' })
    const result = await l5x.call('run_checks', { rule, limit: 50 })
    return (result.data?.findings ?? []) as { message: string }[]
  }

  it('resolves a tag the module declares, such as Card1:I.Data[0].0', async () => {
    // 236 of 537 findings on a real 60-routine project were these.
    expect(await findings('UNRESOLVED_REFERENCE')).toEqual([])
  })

  it('does not read a radix literal as a tag', async () => {
    // MOVE(16#F000, Mask) must not produce a reference to F000.
    const rows = await findings('UNRESOLVED_REFERENCE')
    expect(rows.some(row => row.message.includes('F000'))).toBe(false)
  })

  it('treats different bits of one output word as different outputs', async () => {
    // Two bits of Card1:O.Data[0] are not one output driven twice, but Out1 written on two
    // rungs is.
    const rows = await findings('DUPLICATE_OUTPUT')
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Out1')
    expect(rows.some(row => row.message.includes('Card1:O'))).toBe(false)
  })
})


describe('a serial-port instruction on a processor without one', () => {
  const project = (processorType: string) => `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Serial" ProcessorType="${processorType}" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="Start" TagType="Base" DataType="BOOL"/><Tag Name="Run" TagType="Base" DataType="BOOL"/>
      <Tag Name="chan" TagType="Base" DataType="DINT"/><Tag Name="ctl" TagType="Base" DataType="SERIAL_PORT_CONTROL"/>
      <Tag Name="cnt" TagType="Base" DataType="DINT"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[XIC(Start)ABL(chan,ctl,cnt)OTE(Run);]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

  it('reports the instruction through run_checks on a 5069', async () => {
    const l5x = harness(new Map([['serial.l5x', new TextEncoder().encode(project('5069-L320ERMS2'))]]))
    expect((await l5x.call('open_project', { path: 'serial.l5x' })).error).toBeUndefined()
    const result = await l5x.call('run_checks', { rule: 'SERIAL_PORT_INSTRUCTION_UNSUPPORTED' })
    expect(result.error).toBeUndefined()
    const findings = result.data?.findings as { rule: string; message: string }[]
    expect(findings.length).toBe(1)
    expect(findings[0]?.message).toContain('ABL')
  })

  it('reports nothing on a 1756-L73', async () => {
    const l5x = harness(new Map([['serial.l5x', new TextEncoder().encode(project('1756-L73'))]]))
    expect((await l5x.call('open_project', { path: 'serial.l5x' })).error).toBeUndefined()
    const result = await l5x.call('run_checks', { rule: 'SERIAL_PORT_INSTRUCTION_UNSUPPORTED' })
    expect(result.error).toBeUndefined()
    expect((result.data?.findings as unknown[]).length).toBe(0)
  })
})


/** A program whose main routine calls one declared routine and one that does not exist. */
const JSR_MISSING_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Calls" ProcessorType="1756-L8" MajorRev="36" MinorRev="0">
    <Tags><Tag Name="A" TagType="Base" DataType="BOOL"/><Tag Name="Unused" TagType="Base" DataType="BOOL"/></Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[XIC(A)JSR(S,0);]]></Text></Rung>
        <Rung Number="1" Type="N"><Text><![CDATA[XIC(A)JSR(Nope,0);]]></Text></Rung>
      </RLLContent></Routine>
      <Routine Name="S" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[RET();]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('a JSR naming a routine the program does not declare', () => {
  it('reports only the missing target', async () => {
    const l5x = harness(new Map([['calls.l5x', new TextEncoder().encode(JSR_MISSING_L5X)]]))
    await l5x.call('open_project', { path: 'calls.l5x' })
    const result = await l5x.call('run_checks', { rule: 'JSR_ROUTINE_MISSING' })
    const rows = (result.data?.findings ?? []) as { message: string; severity: string }[]
    expect(rows.length).toBe(1)
    expect(rows[0]?.message).toContain('Nope')
    expect(rows[0]?.message).not.toContain('JSR(S')
    expect(rows[0]?.severity).toBe('critical')
  })

  it('pages critical findings before informational ones', async () => {
    // The same project carries an unused tag, which is informational. The page must lead with the
    // call that cannot build.
    const l5x = harness(new Map([['calls.l5x', new TextEncoder().encode(JSR_MISSING_L5X)]]))
    await l5x.call('open_project', { path: 'calls.l5x' })
    const result = await l5x.call('run_checks', { limit: 5 })
    const rows = (result.data?.findings ?? []) as { rule: string; severity: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0]?.severity).toBe('critical')
    expect(rows.some(row => row.rule === 'JSR_ROUTINE_MISSING')).toBe(true)
  })

  it('reports the severity split in the summary', async () => {
    const l5x = harness(new Map([['calls.l5x', new TextEncoder().encode(JSR_MISSING_L5X)]]))
    await l5x.call('open_project', { path: 'calls.l5x' })
    const result = await l5x.call('run_checks', { limit: 1 })
    expect(result.summary).toContain('critical')
    expect(result.summary).toContain('warning')
    expect(result.summary).toContain('info')
    expect(result.summary).toContain('ordered by severity')
  })
})


/** Rungs that move a string literal into a tag, the way a recipe selector does. */
const STRING_LITERAL_L5X = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Literals" ProcessorType="1756-L8" MajorRev="36" MinorRev="0">
    <Tags>
      <Tag Name="Pick" TagType="Base" DataType="DINT"/>
      <Tag Name="Text" TagType="Base" DataType="STRING"/>
    </Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[[EQ(Pick,1) MOVE('C',Text) ,EQ(Pick,2) MOVE('E',Text) ,EQ(Pick,3) MOVE('O''Brien',Text) ];]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('a string literal in a rung', () => {
  it('is not reported as an unresolved tag', async () => {
    // A real project produced eight unresolved references, one per letter moved out of a literal.
    const l5x = harness(new Map([['literals.l5x', new TextEncoder().encode(STRING_LITERAL_L5X)]]))
    await l5x.call('open_project', { path: 'literals.l5x' })
    const result = await l5x.call('run_checks', { rule: 'UNRESOLVED_REFERENCE' })
    const rows = (result.data?.findings ?? []) as { message: string }[]
    expect(rows).toEqual([])
  })
})
