import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  INSTRUCTIONS,
  coveredMnemonics,
  instructionAdvice,
  lookupInstruction,
  type InstructionRow,
} from '../src/knowledge/instructions.ts'

const rows = INSTRUCTIONS as readonly InstructionRow[]
const MANUALS = ['1747-RM001', '1785-6.1', '1756-RM003', '1756-RM018A', 'observed']

describe('the instruction map', () => {
  it('states a shape, a class and a citation for every row', () => {
    expect(rows.length).toBeGreaterThanOrEqual(40)
    for (const row of rows) {
      expect(row.legacy.trim()).not.toBe('')
      expect(row.operands.trim()).not.toBe('')
      expect(row.advice.trim()).not.toBe('')
      expect(['slc', 'plc5', 'both']).toContain(row.family)
      expect(['mechanical', 'review']).toContain(row.work)
      expect(row.logix === null || row.logix.trim() !== '').toBe(true)
      expect(MANUALS.some(manual => row.basis.includes(manual))).toBe(true)
    }
  })

  it('looks a mnemonic up without caring about case', () => {
    expect(lookupInstruction('ton')?.legacy).toBe('TON')
    expect(lookupInstruction('Ton')?.logix).toBe('TON')
    expect(lookupInstruction('NOPE')).toBeUndefined()
  })

  it('renders the advice with its basis', () => {
    expect(instructionAdvice('TON')).toContain('Basis:')
    expect(instructionAdvice('BTW')).toContain('MSG')
    expect(instructionAdvice('NOPE')).toBeUndefined()
  })

  it('covers the mnemonics the resolver escalates', () => {
    const covered = coveredMnemonics()
    for (const mnemonic of ['TON', 'CTU', 'OSR', 'OSF', 'BTW', 'BTR', 'IIM', 'IOM', 'LIM', 'FOR', 'NXT']) {
      expect(covered).toContain(mnemonic)
    }
  })

  it('keeps the rows that a build or a manual corrected', () => {
    // The vendor build rejected a made-up FOR index tag, so the loop stays a review site.
    expect(lookupInstruction('FOR')?.work).toBe('review')
    // Logix OSR/OSF take only the storage bit; the converted rung keeps a second operand.
    expect(lookupInstruction('OSR')?.advice).toContain('storage bit')
    // Logix LIM takes three operands, not two.
    expect(lookupInstruction('LIM')?.operands.split(',').length).toBe(3)
    // An instruction with no Logix counterpart says so.
    expect(lookupInstruction('IIM')?.logix).toBeNull()
  })

  it('has a page for every PCE code the row documents', () => {
    const corpus = join(import.meta.dirname, '..', '..', 'resources', 'corpus', 'migration')
    const text = readFileSync(join(corpus, 'migration-pce-markers.md'), 'utf8')
    for (const code of [201, 110, 109, 105, 114, 116, 134, 135, 150, 152, 160]) {
      expect(text).toContain(String(code))
    }
  })
})
