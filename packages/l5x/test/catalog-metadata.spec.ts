/**
 * Structural invariants over the whole instruction catalogue.
 *
 * The catalogue now carries shape rules (array flags), bounds and accepted types.
 * Each field is checked by its own guard, but nothing stopped an edit from writing
 * two rules that contradict each other, or a bound whose minimum exceeds its
 * maximum. This suite fails the build on those contradictions, so a future edit
 * cannot quietly produce a slot no rung can ever satisfy.
 */
import { describe, expect, it } from 'vitest'
import { INSTRUCTIONS } from '../src/engine/instructions.ts'

const OPERAND_KINDS = ['BOOL', 'NUMBER', 'ANY', 'TIMER', 'COUNTER', 'STRING', 'EXPRESSION', 'ROUTINE', 'LABEL', 'KEYWORD'] as const

describe('catalog metadata is self-consistent', () => {
  it('has unique uppercase names and well-formed slots', () => {
    const names = new Set<string>()
    for (const instruction of INSTRUCTIONS) {
      expect(instruction.name, instruction.name).toBe(instruction.name.toUpperCase())
      expect(names.has(instruction.name), `duplicate ${instruction.name}`).toBe(false)
      names.add(instruction.name)
      for (const slot of instruction.operands) {
        expect(slot.name.trim(), `${instruction.name} has an unnamed slot`).not.toBe('')
        expect(OPERAND_KINDS, `${instruction.name} ${slot.name}`).toContain(slot.kind)
      }
    }
  })

  it('never combines contradictory array flags', () => {
    for (const instruction of INSTRUCTIONS) {
      for (const slot of instruction.operands) {
        // A slot cannot require one element, require the whole array, and forbid the whole array.
        const flags = [slot.arrayElement === true, slot.arrayTag === true, slot.noArray === true].filter(Boolean).length
        expect(flags, `${instruction.name} ${slot.name}`).toBeLessThanOrEqual(1)
      }
    }
  })

  it('has ordered bounds and non-empty type lists', () => {
    for (const instruction of INSTRUCTIONS) {
      for (const slot of instruction.operands) {
        if (slot.minimum !== undefined && slot.maximum !== undefined) {
          expect(slot.minimum, `${instruction.name} ${slot.name}`).toBeLessThanOrEqual(slot.maximum)
        }
        if (slot.types !== undefined) expect(slot.types.length, `${instruction.name} ${slot.name}`).toBeGreaterThan(0)
      }
    }
  })

  it('keeps a repeating tail only on the last slot', () => {
    for (const instruction of INSTRUCTIONS) {
      instruction.operands.forEach((slot, index) => {
        if (slot.rest === true) expect(index, instruction.name).toBe(instruction.operands.length - 1)
      })
    }
  })
})
