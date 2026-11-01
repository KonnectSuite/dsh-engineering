/**
 * The Logix identifier rules, checked before a name reaches a draft.
 *
 * The failure this guards is a build round trip: a name Studio 5000 refuses is
 * invisible in an export, so a draft used to accept it and the author learned at
 * build time. Each rule here names the repair, and the repair must itself pass.
 */
import { describe, expect, it } from 'vitest'
import { MAX_IDENTIFIER_LENGTH, checkIdentifier, suggestIdentifier } from '../src/engine/names.ts'

describe('identifier rules', () => {
  it('accepts the names Studio accepts', () => {
    for (const name of ['Start_PB', '_Pump1', 'A', 'Motor_Run_2', 'A1_B2']) {
      expect(checkIdentifier(name), name).toBeUndefined()
    }
  })

  it('refuses an empty name', () => {
    expect(checkIdentifier('')?.code).toBe('NAME_EMPTY')
    expect(checkIdentifier('   ')?.code).toBe('NAME_EMPTY')
  })

  it('refuses a leading digit and names the repair', () => {
    const issue = checkIdentifier('1Pump')
    expect(issue?.code).toBe('NAME_STARTS_WITH_DIGIT')
    expect(issue?.suggestion).toBe('_1Pump')
    expect(issue?.fix).toContain('_1Pump')
  })

  it('refuses characters outside letters, digits and underscore', () => {
    expect(checkIdentifier('Start PB')?.code).toBe('NAME_INVALID_CHARACTERS')
    expect(checkIdentifier('Start-PB')?.code).toBe('NAME_INVALID_CHARACTERS')
    expect(checkIdentifier('Start.PB')?.code).toBe('NAME_INVALID_CHARACTERS')
    expect(checkIdentifier('Start PB')?.message).toContain('a space')
    expect(checkIdentifier('-Start')?.code).toBe('NAME_INVALID_CHARACTERS')
  })

  it('refuses a name past the length limit, and accepts the limit itself', () => {
    expect(checkIdentifier('A'.repeat(MAX_IDENTIFIER_LENGTH + 1))?.code).toBe('NAME_TOO_LONG')
    expect(checkIdentifier('A'.repeat(MAX_IDENTIFIER_LENGTH))).toBeUndefined()
  })
})

describe('suggested repair', () => {
  it('suggests a name that passes the rules it was refused by', () => {
    for (const name of ['1Pump', 'Start PB', 'A!B', '-', '', 'A'.repeat(MAX_IDENTIFIER_LENGTH + 5)]) {
      const suggestion = checkIdentifier(name)?.suggestion
      expect(suggestion, name).toBeDefined()
      expect(checkIdentifier(suggestion ?? ''), name).toBeUndefined()
    }
  })

  it('keeps a legal name the caller can recognise', () => {
    expect(suggestIdentifier('Start PB')).toBe('Start_PB')
    expect(suggestIdentifier('1Pump')).toBe('_1Pump')
    expect(suggestIdentifier('Already_Fine')).toBe('Already_Fine')
  })

  it('never returns an empty suggestion', () => {
    expect(suggestIdentifier('')).toBe('_')
    expect(suggestIdentifier('!!!')).toBe('___')
  })
})
