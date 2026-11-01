/**
 * The repair flow, end to end, without the SDK: an export that Studio refuses, the check that names
 * the reason, the composed replacement, and a re-check on the written file.
 *
 * The builds behind this test: the broken export fails with
 * `RxCMP_E_OPERAND_TAGNOTFOUND - Referenced tag is undefined`, and the fixed export builds with
 * 0 warnings and 0 errors.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

const BROKEN = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Repair" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="Start" TagType="Base" DataType="BOOL"/>
      <Tag Name="Run" TagType="Base" DataType="BOOL"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[XIC(Missing)OTE(Run);]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`

describe('repairing an export Studio refuses', () => {
  it('names the unresolved symbol, then replaces the rung and re-checks clean', async () => {
    const files = new Map([['broken.l5x', new TextEncoder().encode(BROKEN)]])
    const l5x = harness(files, { editing: true })
    expect((await l5x.call('open_project', { path: 'broken.l5x' })).error).toBeUndefined()

    const before = await l5x.call('run_checks', {})
    expect(before.error).toBeUndefined()
    const findings = before.data?.findings as { rule: string; message: string }[]
    const unresolved = findings.filter(finding => finding.rule === 'UNRESOLVED_REFERENCE')
    expect(unresolved.length).toBe(1)
    expect(unresolved[0]?.message).toContain('Missing')

    const composed = await l5x.call('compose_rung', {
      program: 'Main',
      routine: 'R',
      mode: 'replace',
      rung: 0,
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['Start'] }, { instr: 'OTE', args: ['Run'] }] }),
    })
    expect(composed.error).toBeUndefined()
    const rungs = composed.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('XIC(Start)OTE(Run);')

    const applied = await l5x.call('draft_apply', { output_path: 'fixed.l5x' })
    expect(applied.error).toBeUndefined()

    const written = l5x.written.get('fixed.l5x') ?? ''
    expect(written).toContain('XIC(Start)OTE(Run);')
    expect(written).not.toContain('XIC(Missing)')

    files.set('fixed.l5x', new TextEncoder().encode(written))
    const reopened = harness(files, { editing: true })
    expect((await reopened.call('open_project', { path: 'fixed.l5x' })).error).toBeUndefined()
    const after = await reopened.call('run_checks', {})
    const left = (after.data?.findings as { rule: string }[]).filter(finding => finding.rule === 'UNRESOLVED_REFERENCE')
    expect(left.length).toBe(0)
  })
})
