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