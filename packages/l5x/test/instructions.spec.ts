/**
 * The instruction catalog: shape, aliases, coverage and the listing tool.
 */
import { describe, expect, it } from 'vitest'
import { INSTRUCTIONS, instructionByName, nearestInstructions, canonicalInstruction, NUMERIC_TYPES, TIMER_TYPES } from '../src/engine/instructions.ts'
import { fixtureBytes, harness } from './harness.ts'

/** Instructions the committed fixture rungs actually use. */
const FIXTURE_INSTRUCTIONS = ['XIC', 'XIO', 'OTE', 'TON', 'CTU', 'MOV']

describe('catalog', () => {
  it('gives every instruction a name, category, summary and typed operands', () => {
    expect(INSTRUCTIONS.length).toBeGreaterThan(40)
    for (const instruction of INSTRUCTIONS) {
      expect(instruction.name).toMatch(/^[A-Z][A-Z0-9]*$/u)
      expect(instruction.category.length).toBeGreaterThan(0)
      expect(instruction.summary.length).toBeGreaterThan(5)
      for (const slot of instruction.operands) {
        expect(slot.name.length).toBeGreaterThan(0)
        expect(['BOOL', 'NUMBER', 'ANY', 'TIMER', 'COUNTER']).toContain(slot.kind)
      }
    }
  })

  it('has no duplicate mnemonics', () => {
    const names = INSTRUCTIONS.map(instruction => instruction.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it('covers every instruction the fixture uses', () => {
    for (const name of FIXTURE_INSTRUCTIONS) expect(instructionByName(name), name).toBeDefined()
  })

  it('resolves the shorter spellings Studio also accepts', () => {
    expect(instructionByName('EQ')?.name).toBe('EQU')
    expect(instructionByName('GE')?.name).toBe('GEQ')
    expect(instructionByName('MOVE')?.name).toBe('MOV')
    expect(canonicalInstruction('lt')).toBe('LES')
  })

  it('declares the numeric and timer type families it validates against', () => {
    expect([...NUMERIC_TYPES]).toEqual(expect.arrayContaining(['INT', 'DINT', 'REAL']))
    expect([...TIMER_TYPES]).toEqual(expect.arrayContaining(['TIMER', 'TON']))
  })

  it('suggests close names for a typo', () => {
    expect(nearestInstructions('XICX')).toContain('XIC')
    expect(nearestInstructions('TONN')).toContain('TON')
  })
})

describe('list_instructions', () => {
  it('lists the catalog with operand kinds', async () => {
    const l5x = harness(fixtureBytes)
    const result = await l5x.call('list_instructions', {})
    expect(result.error).toBeUndefined()
    const rows = result.data?.rows as { name: string; operands: { name: string; kind: string; required: boolean }[] }[]
    const ton = rows.find(row => row.name === 'TON')
    expect(ton?.operands).toEqual([{ name: 'Timer', kind: 'TIMER', required: true }, { name: 'Preset', kind: 'NUMBER', required: true }])
  })

  it('filters by name and by category', async () => {
    const l5x = harness(fixtureBytes)
    const byName = await l5x.call('list_instructions', { filter: 'ton' })
    expect((byName.data?.rows as { name: string }[]).some(row => row.name === 'TON')).toBe(true)
    const byCategory = await l5x.call('list_instructions', { category: 'Comparison' })
    const names = (byCategory.data?.rows as { name: string }[]).map(row => row.name)
    expect(names).toContain('EQU')
    expect(names).not.toContain('TON')
  })
})
