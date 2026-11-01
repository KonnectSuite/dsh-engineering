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
