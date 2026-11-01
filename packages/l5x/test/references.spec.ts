import { describe, expect, it } from 'vitest'
import { harness, type Harness } from './harness.ts'

/** Open the fixture and return the harness. */
async function opened(): Promise<Harness> {
  const instance = harness()
  const open = await instance.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return instance
}

describe('search_logic', () => {
  it('finds literal text in ladder and ST logic', async () => {
    const l5x = await opened()
    const found = await l5x.call('search_logic', { query: 'Motor_1' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBeTypeOf('number')
    expect(Number(found.data?.total)).toBeGreaterThan(0)
    expect(found.summary).toMatch(/match/u)
  })

  it('answers zero matches without failing', async () => {
    const l5x = await opened()
    const found = await l5x.call('search_logic', { query: 'NoSuchOperandAnywhere' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBe(0)
    expect(found.summary).toContain('0 matches')
  })

  it('respects the limit and says when it truncated', async () => {
    const l5x = await opened()
    const found = await l5x.call('search_logic', { query: 'OT', limit: 1 })
    const matches = found.data?.matches as unknown[]
    expect(matches.length).toBeLessThanOrEqual(1)
    if (Number(found.data?.total) > 1) expect(found.data?.truncated).toBe(true)
  })
})

describe('find_references', () => {
  it('summarizes reads, writes and unknowns by access', async () => {
    const l5x = await opened()
    const found = await l5x.call('find_references', { symbol: 'Motor_1' })
    expect(found.error).toBeUndefined()
    expect(Number(found.data?.total)).toBeGreaterThan(0)
    expect(found.data?.by_access).toMatchObject({ read: expect.any(Number), write: expect.any(Number) })
    expect(found.summary).toContain('references to Motor_1')
  })

  it('returns bounded evidence rows when asked', async () => {
    const l5x = await opened()
    const found = await l5x.call('find_references', { symbol: 'Motor_1', detail: 'evidence', limit: 1 })
    const rows = found.data?.evidence as { access?: string }[]
    expect(rows).toHaveLength(1)
    expect(rows[0]?.access).toBeTypeOf('string')
  })

  it('answers an unknown symbol with zero references, not an error', async () => {
    const l5x = await opened()
    const found = await l5x.call('find_references', { symbol: 'DoesNotExist' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBe(0)
    expect(found.summary).toContain('0 references')
  })
})

describe('trace_dependencies', () => {
  it('returns a bounded graph and states that it is not runtime evidence', async () => {
    const l5x = await opened()
    const traced = await l5x.call('trace_dependencies', { symbol: 'Motor_1', depth: 2 })
    expect(traced.error).toBeUndefined()
    expect(Array.isArray(traced.data?.nodes)).toBe(true)
    expect(Array.isArray(traced.data?.edges)).toBe(true)
    expect(traced.coverage?.complete).toBe(false)
    expect(traced.coverage?.unverified).toContain('runtime causality')
  })

  it('resolves an AOI-qualified symbol instead of reporting it missing', async () => {
    const l5x = await opened()
    const traced = await l5x.call('trace_dependencies', { symbol: 'Motor_Control::EnableOut', depth: 2 })
    expect(traced.error).toBeUndefined()
    expect(traced.data?.resolution).toMatchObject({ resolved: true })
    expect(traced.summary).toContain('Motor_Control::EnableOut')
  })

  it('refuses an unresolved symbol with the scope fix', async () => {
    const l5x = await opened()
    const traced = await l5x.call('trace_dependencies', { symbol: 'No_Such_Member' })
    expect(traced.error?.code).toBe('UNRESOLVED_SYMBOL')
    expect(traced.error?.fix).toContain('AOI')
  })
})

describe('resolve_tag', () => {
  it('resolves a declared tag', async () => {
    const l5x = await opened()
    const resolved = await l5x.call('resolve_tag', { address: 'LineSpeed' })
    expect(resolved.error).toBeUndefined()
    expect(resolved.data?.resolved).toBe(true)
    expect(resolved.summary).toContain('resolves')
  })

  it('answers an undeclared address with the reason', async () => {
    const l5x = await opened()
    const resolved = await l5x.call('resolve_tag', { address: 'Not_A_Tag' })
    expect(resolved.error).toBeUndefined()
    expect(resolved.data?.resolved).toBe(false)
    expect(resolved.summary).toContain('does not resolve')
  })
})

describe('usage_map', () => {
  it('maps one declared tag and states its limits', async () => {
    const l5x = await opened()
    const mapped = await l5x.call('usage_map', { tag: 'FaultCount' })
    expect(mapped.error).toBeUndefined()
    expect(mapped.summary).toContain('FaultCount')
    expect(Array.isArray(mapped.data?.indexes)).toBe(true)
    expect(mapped.coverage?.unverified.join(' ')).toContain('dynamic indices')
  })

  it('refuses an undeclared tag with candidates and a fix', async () => {
    const l5x = await opened()
    const mapped = await l5x.call('usage_map', { tag: 'NoSuchTag' })
    expect(mapped.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(mapped.error?.fix).toContain('list_components')
    expect(mapped.error?.candidates.length).toBeGreaterThan(0)
  })
})


describe('a symbol declared in another scope', () => {
  it('names that scope instead of saying it is absent from the export', async () => {
    const l5x = harness()
    await l5x.call('open_project', { path: 'sample.l5x' })
    // VFD_SpeedRef is a program tag of MotorProgram, not a controller tag.
    const result = await l5x.call('trace_dependencies', { symbol: 'VFD_SpeedRef' })
    expect(result.error?.code).toBe('UNRESOLVED_SYMBOL')
    expect(String(result.error?.message)).toContain('declared in')
    expect(String(result.error?.message)).toContain('MotorProgram')
    expect(String(result.error?.fix)).toContain('scope')
  })

  it('traces it once the declaring scope is passed', async () => {
    const l5x = harness()
    await l5x.call('open_project', { path: 'sample.l5x' })
    const result = await l5x.call('trace_dependencies', { symbol: 'VFD_SpeedRef', scope: 'MotorProgram' })
    expect(result.error).toBeUndefined()
  })
})


describe('usage_map with the wrong scope', () => {
  it('names the scope that declares the tag', async () => {
    const l5x = harness()
    await l5x.call('open_project', { path: 'sample.l5x' })
    // VFD_SpeedRef is declared by MotorProgram, not by the controller.
    const result = await l5x.call('usage_map', { tag: 'VFD_SpeedRef' })
    expect(result.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(String(result.error?.message)).toContain('declared in')
    expect(String(result.error?.message)).toContain('MotorProgram')
    expect(String(result.error?.fix)).toContain('MotorProgram')
  })

  it('maps it when the declaring scope is passed', async () => {
    const l5x = harness()
    await l5x.call('open_project', { path: 'sample.l5x' })
    const result = await l5x.call('usage_map', { tag: 'VFD_SpeedRef', scope: 'MotorProgram' })
    expect(result.error).toBeUndefined()
  })
})


describe('a search for a base tag', () => {
  it('matches a subscripted and a bit reference', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Refs" ProcessorType="1756-L8" MajorRev="36" MinorRev="0">
    <Tags>
      <Tag Name="Flags" TagType="Base" DataType="DINT" Dimensions="4"/>
      <Tag Name="Out" TagType="Base" DataType="BOOL"/>
    </Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[XIC(Flags[2].3)OTE(Out);]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['refs.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    await l5x.call('open_project', { path: 'refs.l5x' })
    for (const symbol of ['Flags', 'Flags[2].3', 'Flags[2]']) {
      const result = await l5x.call('find_references', { symbol })
      expect(Number(result.data?.total ?? 0), symbol).toBeGreaterThan(0)
    }
    const partial = await l5x.call('find_references', { symbol: 'Fla' })
    expect(Number(partial.data?.total ?? 0)).toBe(0)
  })
})


describe('a one-shot storage bit', () => {
  it('is classified read/write rather than unknown', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="36.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Oneshot" ProcessorType="1756-L8" MajorRev="36" MinorRev="0">
    <Tags>
      <Tag Name="A" TagType="Base" DataType="BOOL"/>
      <Tag Name="Storage" TagType="Base" DataType="BOOL"/>
      <Tag Name="Out" TagType="Base" DataType="BOOL"/>
    </Tags>
    <Programs><Program Name="P" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[XIC(A)ONS(Storage)OTE(Out);]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="T" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="P"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['oneshot.l5x', new TextEncoder().encode(xml)]]))
    await l5x.call('open_project', { path: 'oneshot.l5x' })
    const result = await l5x.call('find_references', { symbol: 'Storage' })
    const byAccess = result.data?.by_access ?? {}
    expect(Number(byAccess.read_write ?? 0)).toBe(1)
    expect(Number(byAccess.unknown ?? 0)).toBe(0)
  })
})
