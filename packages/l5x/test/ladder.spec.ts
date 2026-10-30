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
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 8,
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
    expect(textOf(result)).toBe('XIC(SystemRunning)TON(MainTimer,1500);')
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
