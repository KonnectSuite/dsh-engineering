/**
 * The ladder composer: patterns, structure trees, operand grounding and refusals.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** The first composed rung's NeutralText. */
const textOf = (result: { data?: Record<string, unknown> }): string => {
  const rungs = result.data?.rungs as { neutral_text: string }[] | undefined
  return rungs?.[0]?.neutral_text ?? ''
}

describe('patterns', () => {
  it('composes a start/stop latch in the export style', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      pattern: 'start_stop_latch',
      arguments_json: JSON.stringify({ start: 'StartPB', stop: 'StopPB', run: 'SystemRunning' }),
    })
    expect(result.error).toBeUndefined()
    expect(textOf(result)).toBe('[XIC(StartPB) ,XIC(SystemRunning) ]XIO(StopPB)OTE(SystemRunning);')
    expect((result.data?.rungs as unknown[]).length).toBe(1)
  })

  it('composes a fault latch as two rungs and stages both', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      pattern: 'fault_latch',
      arguments_json: JSON.stringify({ fault: 'FaultActive', reset: 'StartPB', latched: 'FaultActive' }),
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 7,
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.operation_count).toBe(2)
    expect((result.data?.rungs as unknown[]).length).toBe(2)
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
  })

  it('composes a TON delay with a literal preset', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      pattern: 'ton_delay',
      arguments_json: JSON.stringify({ enable: 'SystemRunning', timer: 'MainTimer', preset_ms: 1500 }),
    })
    expect(result.error).toBeUndefined()
    // A build proved the timer needs its accumulator operand: TON(MainTimer,3600000,0) builds and
    // TON(MainTimer,3600000) fails with RxCMP_E_AUDIT_INVALIDNOOFOPS.
    expect(textOf(result)).toBe('XIC(SystemRunning)TON(MainTimer,1500,0);')
  })

  it('composes an interlock chain from named conditions', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      pattern: 'interlock',
      arguments_json: JSON.stringify({ conditions: ['SystemRunning', 'StartPB'], output: 'SystemRunning' }),
    })
    expect(result.error).toBeUndefined()
    expect(textOf(result)).toBe('XIC(SystemRunning)XIC(StartPB)OTE(SystemRunning);')
  })
})

describe('structure trees', () => {
  it('composes a series with a nested parallel branch', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({
        series: [
          { instr: 'XIC', args: ['StartPB'] },
          { parallel: [[{ instr: 'XIO', args: ['StopPB'] }], [{ instr: 'XIC', args: ['EmergencyStop'] }]] },
          { instr: 'OTE', args: ['SystemRunning'] },
        ],
      }),
    })
    expect(result.error).toBeUndefined()
    expect(textOf(result)).toBe('XIC(StartPB)[XIO(StopPB) ,XIC(EmergencyStop) ]OTE(SystemRunning);')
  })

  it('accepts an AOI declared by the export and reports its grounding', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'Motor_Control', args: ['Motor1_AOI', 'SystemRunning', 'StopPB', '0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect((result.data?.rungs as { grounding: string }[])[0]?.grounding).toBe('aoi')
  })

  it('stages the composed rung and validates it', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['SystemRunning'] }, { instr: 'OTE', args: ['VFD_Running'] }] }),
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 7, comment: 'Composed rung.',
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.operation_count).toBe(1)
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
  })

  it('returns the text without a draft when no staging target is given', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['SystemRunning'] }, { instr: 'OTE', args: ['VFD_Running'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.draft_id).toBeUndefined()
  })
})

describe('refusals', () => {
  it('refuses an instruction the catalog does not know', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'NOTREAL', args: ['StartPB'] }] }) })
    expect(result.error?.code).toBe('UNKNOWN_INSTRUCTION')
    expect((result.error?.candidates ?? []).length).toBeGreaterThan(0)
  })

  it('refuses a BOOL slot given a REAL tag', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['LineSpeed'] }] }) })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('REAL')
  })

  it('refuses an undeclared tag with candidates', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartP'] }] }) })
    expect(result.error?.code).toBe('TAG_NOT_FOUND')
    expect(result.error?.candidates).toContain('StartPB')
  })

  it('refuses the wrong operand count', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB', 'StopPB'] }] }) })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('XIC takes 1')
  })

  it('refuses a pattern and a tree in one call', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { pattern: 'ton_delay', spec_json: '{}' })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })

  it('names every undefined tag in one spec at once', async () => {
    // Three typos should cost one refusal. Only a genuine TAG_NOT_FOUND is enriched, so other
    // refusals keep their own precedence.
    const l5x = await opened()
    const spec = { series: [
      { instr: 'XIC', args: ['NoSuchOne'] },
      { instr: 'XIC', args: ['NoSuchTwo'] },
      { instr: 'OTE', args: ['MissingOut'] },
    ] }
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify(spec) })
    expect(result.error?.code).toBe('TAG_NOT_FOUND')
    expect(result.error?.message).toContain('NoSuchOne')
    expect(result.error?.message).toContain('NoSuchTwo')
    expect(result.error?.message).toContain('MissingOut')
  })

  it('names every required pattern argument at once', async () => {
    // A caller that omits two arguments should not need two round trips to learn both.
    const l5x = await opened()
    const timer = await l5x.call('compose_rung', { pattern: 'ton_delay', arguments_json: '{}' })
    expect(timer.error?.code).toBe('INVALID_ARGUMENT')
    expect(timer.error?.message).toContain('ton_delay needs enable, timer')
    expect(timer.error?.message).toContain('missing: enable, timer')
    const scale = await l5x.call('compose_rung', {
      pattern: 'analog_scale',
      arguments_json: JSON.stringify({ source: 'SystemRunning', destination: 'SystemRunning', in_min: 0, in_max: 1, out_min: 0 }),
    })
    expect(scale.error?.message).toContain('source, destination, in_min, in_max, out_min, out_max')
    expect(scale.error?.message).toContain('missing: out_max')
  })

  it('refuses a timer slot given a BOOL tag', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      pattern: 'ton_delay', arguments_json: JSON.stringify({ enable: 'SystemRunning', timer: 'StartPB', preset_ms: 100 }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('timer')
  })

  it('refuses a rung that ends without an output instruction', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'XIC', args: ['SystemRunning'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_LADDER_SPEC')
    expect(result.error?.message).toContain('right power rail')
    expect(result.error?.message).toContain('XIC')
  })
})


describe('the analog_scale pattern', () => {
  it('scales with float literals and the destination first', async () => {
    // Verified by a Logix Designer build: CPT(scaled,(raw - 0.0) / (100.0 - 0.0) * (50.0 - 0.0) + 0.0);
    // passed with 0 warnings and 0 errors. Integer literals would divide as integers at runtime.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Scale" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="raw" TagType="Base" DataType="REAL"/>
      <Tag Name="scaled" TagType="Base" DataType="REAL"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent>
        <Rung Number="0" Type="N"><Text><![CDATA[OTE(scaled);]]></Text></Rung>
      </RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['scale.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'scale.l5x' })).error).toBeUndefined()
    const result = await l5x.call('compose_rung', {
      pattern: 'analog_scale',
      arguments_json: JSON.stringify({ source: 'raw', destination: 'scaled', in_min: 0, in_max: 100, out_min: 0, out_max: 50 }),
    })
    expect(result.error).toBeUndefined()
    const rungs = result.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('CPT(scaled,(raw - 0.0) / (100.0 - 0.0) * (50.0 - 0.0) + 0.0);')
  })
})


describe('the totalizer pattern', () => {
  it('accumulates in place', async () => {
    // Verified by a Logix Designer build: XIC(run)ADD(total,rate,total); passed with 0 warnings and
    // 0 errors. Source B and the destination share a tag, which Studio allows for math.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="Total" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="run" TagType="Base" DataType="BOOL"/>
      <Tag Name="rate" TagType="Base" DataType="REAL"/>
      <Tag Name="total" TagType="Base" DataType="REAL"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent><Rung Number="0" Type="N"><Text><![CDATA[OTE(total);]]></Text></Rung></RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['total.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'total.l5x' })).error).toBeUndefined()
    const result = await l5x.call('compose_rung', {
      pattern: 'totalizer',
      arguments_json: JSON.stringify({ enable: 'run', rate: 'rate', total: 'total' }),
    })
    expect(result.error).toBeUndefined()
    const rungs = result.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('XIC(run)ADD(total,rate,total);')
  })
})


describe('the run_hour_meter pattern', () => {
  it('resets its own timer and counts once per interval', async () => {
    // Verified by a Logix Designer build: the two rungs below passed with 0 warnings and 0 errors.
    // The timer's accumulator operand is written as 0; two operands fail with INVALIDNOOFOPS.
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<RSLogix5000Content SchemaRevision="1.0" SoftwareRevision="37.00" TargetType="Controller" ContainsContext="false">
  <Controller Name="RunHour" ProcessorType="5069-L320ERMS2" MajorRev="37" MinorRev="0">
    <Tags>
      <Tag Name="run" TagType="Base" DataType="BOOL"/>
      <Tag Name="meter" TagType="Base" DataType="TIMER"/>
      <Tag Name="hours" TagType="Base" DataType="DINT"/>
    </Tags>
    <Programs><Program Name="Main" MainRoutineName="R"><Routines>
      <Routine Name="R" Type="RLL"><RLLContent><Rung Number="0" Type="N"><Text><![CDATA[OTE(run);]]></Text></Rung></RLLContent></Routine>
    </Routines></Program></Programs>
    <Tasks><Task Name="MainTask" Type="CONTINUOUS"><ScheduledPrograms><ScheduledProgram Name="Main"/></ScheduledPrograms></Task></Tasks>
  </Controller>
</RSLogix5000Content>`
    const l5x = harness(new Map([['runhour.l5x', new TextEncoder().encode(xml)]]), { editing: true })
    expect((await l5x.call('open_project', { path: 'runhour.l5x' })).error).toBeUndefined()
    const result = await l5x.call('compose_rung', {
      pattern: 'run_hour_meter',
      arguments_json: JSON.stringify({ run: 'run', timer: 'meter', hours: 'hours' }),
    })
    expect(result.error).toBeUndefined()
    const rungs = result.data?.rungs as { neutral_text: string }[]
    expect(rungs[0]?.neutral_text).toBe('XIO(meter.DN)XIC(run)TON(meter,3600000,0);')
    expect(rungs[1]?.neutral_text).toBe('XIC(meter.DN)ADD(hours,1,hours);')
  })
})
