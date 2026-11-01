/**
 * Operands that are not tag references.
 *
 * Every operand used to be resolved as a tag, so a computed expression, a routine
 * name and a label were all refused: CPT, CMP, JSR, JMP and LBL could not be
 * composed at all. These tests hold the three slot kinds that changed, and the
 * checks they still owe — a routine must exist, a label must be an identifier, an
 * expression must be balanced.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'
import { instructionByName } from '../src/engine/instructions.ts'

/** Open the fixture with the editing entry and return the harness. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** The neutral text of the first composed rung. */
function text(data: unknown): string {
  const rungs = (data as { rungs?: { neutral_text: string }[] } | undefined)?.rungs
  return rungs?.[0]?.neutral_text ?? ''
}

describe('a routine name is not a tag', () => {
  it('composes a JSR and keeps the routine spelling the export uses', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'JSR', args: ['mainroutine'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)JSR(MainRoutine);')
  })

  it('refuses a routine the export does not declare, and lists the ones it has', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['NoSuchRoutine'] }] }) })
    expect(result.error?.code).toBe('ROUTINE_NOT_FOUND')
    expect(result.error?.candidates).toContain('MainRoutine')
  })
})

describe('a label is not a tag', () => {
  it('composes JMP and LBL', async () => {
    const l5x = await opened()
    const jump = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JMP', args: ['StartLabel'] }] }) })
    expect(jump.error).toBeUndefined()
    expect(text(jump.data)).toBe('JMP(StartLabel);')
    const label = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'LBL', args: ['StartLabel'] }, { instr: 'XIC', args: ['StartPB'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(label.error).toBeUndefined()
    expect(text(label.data)).toBe('LBL(StartLabel)XIC(StartPB)OTE(SystemRunning);')
  })

  it('refuses a label that is not an identifier', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JMP', args: ['Start Label'] }] }) })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('label')
  })
})

describe('an expression is not a tag', () => {
  it('composes a CPT with operators in the source', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'CPT', args: ['LineSpeed + 5.0', 'FaultCount'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)CPT(LineSpeed + 5.0,FaultCount);')
  })

  it('composes a CMP comparison', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CMP', args: ['LineSpeed > 5.0'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('CMP(LineSpeed > 5.0)OTE(SystemRunning);')
  })

  it('refuses an unbalanced expression', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CPT', args: ['(LineSpeed + 5.0', 'FaultCount'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('balanced')
  })

  it('refuses an expression carrying a rung terminator', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'CPT', args: ['LineSpeed;5', 'FaultCount'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
  })
})

describe('the listing names the kinds', () => {
  it('reports EXPRESSION, ROUTINE and LABEL', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('list_instructions', { filter: 'cpt' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(rows.find(row => row.name === 'CPT')?.operands.map(slot => slot.kind)).toEqual(['EXPRESSION', 'NUMBER'])
    const jsr = (await l5x.call('list_instructions', { filter: 'jsr' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(jsr.find(row => row.name === 'JSR')?.operands[0]?.kind).toBe('ROUTINE')
    const jmp = (await l5x.call('list_instructions', { filter: 'jmp' })).data?.rows as { name: string; operands: { kind: string }[] }[]
    expect(jmp.find(row => row.name === 'JMP')?.operands[0]?.kind).toBe('LABEL')
  })
})


describe('the operand counts the vendor fields give', () => {
  it('catalogues the full operand list, not the short one the compact table had', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['MVM', 3], ['GSV', 4], ['SSV', 4], ['SQO', 6], ['SQL', 5], ['FAL', 6], ['FSC', 5], ['BSL', 4], ['BSR', 4],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('composes a masked move with its mask slot', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'MVM', args: ['LineSpeed', 'FaultCount', 'SystemClock'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)MVM(LineSpeed,FaultCount,SystemClock);')
  })

  it('composes a sequenced output with all six operands', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'SQO', args: ['FaultCount', '5', 'FaultCount', 'CycleCounter', '10', '0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('SQO(FaultCount,5,FaultCount,CycleCounter,10,0);')
  })

  it('composes a file arithmetic rung with an expression operand', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'FAL', args: ['CycleCounter', '10', '0', '1', 'FaultCount', 'LineSpeed + 1.0'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('FAL(CycleCounter,10,0,1,FaultCount,LineSpeed + 1.0);')
  })
})

describe('a keyword is not a tag', () => {
  it('composes a GSV whose class, instance and attribute are keywords', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'GSV', args: ['Program', 'MainProgram', 'LastScanTime', 'SystemClock'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('GSV(Program,MainProgram,LastScanTime,SystemClock)OTE(SystemRunning);')
  })

  it('refuses a keyword that is not an identifier', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'GSV', args: ['Program Class', 'Main', 'X', 'SystemClock'] }] }),
    })
    expect(result.error?.code).toBe('INVALID_OPERAND')
    expect(result.error?.message).toContain('keyword')
  })
})


describe('nine more operand counts, from the systematic audit', () => {
  it('catalogues the full operand list for the five the audit flagged', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['BTD', 5], ['MEQ', 3], ['OSR', 2], ['OSF', 2], ['AVE', 6],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('composes a masked compare', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'MEQ', args: ['FaultCount', '255', 'LineSpeed'] }, { instr: 'OTE', args: ['SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('MEQ(FaultCount,255,LineSpeed)OTE(SystemRunning);')
  })

  it('composes a one-shot with its storage and output bit', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'OSR', args: ['StartPB', 'SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('XIC(StartPB)OSR(StartPB,SystemRunning);')
  })
})


describe('the motion family', () => {
  it('catalogues every instruction box field, not the placeholder operand', () => {
    const expected: readonly (readonly [string, number])[] = [
      ['MAJ', 17], ['MAM', 20], ['MAPC', 14], ['MAS', 9], ['MATC', 12], ['MAH', 2],
      ['MDF', 2], ['MDW', 2], ['MGS', 3], ['MGSP', 2], ['MRP', 5], ['MSF', 2], ['MSO', 2],
    ]
    for (const [name, count] of expected) {
      expect(instructionByName(name)?.operands.length, name).toBe(count)
    }
  })

  it('names the axis and motion control operands a motion call starts with', () => {
    expect(instructionByName('MSO')?.operands.map(slot => slot.name)).toEqual(['Axis', 'MotionControl'])
    expect(instructionByName('MGS')?.operands.map(slot => slot.name)).toEqual(['Group', 'MotionControl', 'StopMode'])
  })

  it('leaves the operand type open where the catalogue cannot verify it', () => {
    // AXIS and MOTION_GROUP are datatypes this catalogue does not model; ANY is the honest slot.
    expect(instructionByName('MSO')?.operands.every(slot => slot.kind === 'ANY')).toBe(true)
  })

  it('composes a motion instruction through the ordinary operand path', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'MSO', args: ['Motor_1', 'SystemClock'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('MSO(Motor_1,SystemClock);')
  })
})


describe('a loop instruction names its routine', () => {
  it('catalogues FOR with the routine, the index, the bounds and the step', () => {
    expect(instructionByName('FOR')?.operands.map(slot => slot.name)).toEqual(['Routine', 'Index', 'Initial value', 'Terminal value', 'Step size'])
    expect(instructionByName('FOR')?.operands[0]?.kind).toBe('ROUTINE')
  })

  it('composes a FOR loop over a routine that exists', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'FOR', args: ['MainRoutine', '0', '1', '10', '1'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('FOR(MainRoutine,0,1,10,1);')
  })
})

describe('a JSR parameter list varies', () => {
  it('accepts as many parameters as the caller passes', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['MainRoutine', 'StartPB', 'StopPB', 'SystemRunning'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('JSR(MainRoutine,StartPB,StopPB,SystemRunning);')
  })

  it('still accepts a call with no parameters', async () => {
    const l5x = await opened()
    const result = await l5x.call('compose_rung', { spec_json: JSON.stringify({ series: [{ instr: 'JSR', args: ['MainRoutine'] }] }) })
    expect(result.error).toBeUndefined()
    expect(text(result.data)).toBe('JSR(MainRoutine);')
  })

  it('tells a reader the parameter slot repeats', async () => {
    const l5x = harness(fixtureBytes)
    const rows = (await l5x.call('list_instructions', { filter: 'jsr' })).data?.rows as { name: string; operands: { rest?: boolean }[] }[]
    expect(rows.find(row => row.name === 'JSR')?.operands[1]?.rest).toBe(true)
  })
})
