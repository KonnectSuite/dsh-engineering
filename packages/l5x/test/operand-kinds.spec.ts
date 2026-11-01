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
