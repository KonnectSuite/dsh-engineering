/**
 * Mnemonic spellings across Logix Designer revisions.
 *
 * Three facts are worth holding still: the rename table is complete and unique,
 * lookup resolves both published spellings at any revision, and a composed rung
 * writes the spelling the project already reads.
 */
import { describe, expect, it } from 'vitest'
import {
  MNEMONIC_PAIRS,
  MNEMONIC_RENAME_MAJOR,
  alternateMnemonic,
  mnemonicMismatch,
  mnemonicMismatchesIn,
  mnemonicPair,
  mnemonicsIn,
  preferredMnemonic,
  spellingForProject,
  usesModernMnemonics,
} from '../src/engine/mnemonics.ts'
import { instructionByName } from '../src/engine/instructions.ts'

describe('rename table', () => {
  it('declares every rename once, in the published spelling case', () => {
    expect(MNEMONIC_PAIRS.length).toBe(16)
    for (const { legacy, modern } of MNEMONIC_PAIRS) {
      expect(legacy).toMatch(/^[A-Z][A-Z0-9_]*$/u)
      expect(modern).toMatch(/^[A-Z][A-Z0-9_]*$/u)
      expect(legacy).not.toBe(modern)
    }
    const names = MNEMONIC_PAIRS.flatMap(({ legacy, modern }) => [legacy, modern])
    expect(new Set(names).size).toBe(names.length)
  })

  it('states the revision that introduced the modern spelling', () => {
    expect(MNEMONIC_RENAME_MAJOR).toBe(36)
  })
})

describe('revision', () => {
  it('treats an absent or unparsable revision as pre-rename', () => {
    expect(usesModernMnemonics('36')).toBe(true)
    expect(usesModernMnemonics('38')).toBe(true)
    expect(usesModernMnemonics('35')).toBe(false)
    expect(usesModernMnemonics('')).toBe(false)
    expect(usesModernMnemonics('unknown')).toBe(false)
  })

  it('resolves a pair from either spelling', () => {
    expect(mnemonicPair('sqr')?.modern).toBe('SQRT')
    expect(mnemonicPair('SQRT')?.legacy).toBe('SQR')
    expect(mnemonicPair('XIC')).toBeUndefined()
  })

  it('names the alternate spelling', () => {
    expect(alternateMnemonic('SQR')).toBe('SQRT')
    expect(alternateMnemonic('MOVE')).toBe('MOV')
    expect(alternateMnemonic('XIC')).toBeUndefined()
  })

  it('prefers the spelling the revision publishes', () => {
    expect(preferredMnemonic('SQR', '38')).toBe('SQRT')
    expect(preferredMnemonic('SQR', '35')).toBe('SQR')
    expect(preferredMnemonic('MOVE', '38')).toBe('MOVE')
    expect(preferredMnemonic('MOVE', '35')).toBe('MOV')
    expect(preferredMnemonic('XIC', '38')).toBe('XIC')
  })
})

describe('catalog lookup', () => {
  it('resolves both published spellings of every renamed instruction', () => {
    const unresolved = MNEMONIC_PAIRS.flatMap(({ legacy, modern }) => [legacy, modern]).filter(name => instructionByName(name) === undefined)
    expect(unresolved).toEqual([])
  })

  it('keeps the catalog name canonical, because the viewer labels by it', () => {
    expect(instructionByName('SQRT')?.name).toBe('SQR')
    expect(instructionByName('EXPT')?.name).toBe('XPY')
    expect(instructionByName('TO_BCD')?.name).toBe('TOD')
    expect(instructionByName('TRN')?.name).toBe('TRUNC')
    expect(instructionByName('MOVE')?.name).toBe('MOV')
  })
})

describe('composed spelling', () => {
  it('follows the spelling the project already writes', () => {
    expect(spellingForProject('SQR', new Set(['SQRT']))).toBe('SQRT')
    expect(spellingForProject('SQR', new Set(['SQR']))).toBe('SQR')
    expect(spellingForProject('TRUNC', new Set(['TRN']))).toBe('TRN')
  })

  it('falls back to the spelling the project revision publishes', () => {
    // A build of a fresh v37 project refused MOV, EQU and SQR: those revisions have no such
    // instructions, so the fallback follows MajorRev rather than the catalogue's legacy name.
    expect(spellingForProject('MOV', new Set(), '37')).toBe('MOVE')
    expect(spellingForProject('EQU', new Set(), '37')).toBe('EQ')
    expect(spellingForProject('SQR', new Set(), '37')).toBe('SQRT')
    expect(spellingForProject('MOV', new Set(), '19')).toBe('MOV')
    expect(spellingForProject('SQR', new Set(), '')).toBe('SQR')
    expect(spellingForProject('TRUNC', new Set(), '37')).toBe('TRUNC')
  })

  it('prefers the catalog name when the project writes both', () => {
    expect(spellingForProject('SQR', new Set(['SQR', 'SQRT']))).toBe('SQR')
  })

  it('leaves an instruction that was never renamed alone', () => {
    expect(spellingForProject('XIC', new Set(['XIC']))).toBe('XIC')
  })
})

describe('review finding', () => {
  it('flags the other revision spelling and names the preferred one', () => {
    expect(mnemonicMismatch('EQU', '38')).toEqual({ used: 'EQU', preferred: 'EQ', majorVersion: '38' })
    expect(mnemonicMismatch('EQ', '38')).toBeUndefined()
    expect(mnemonicMismatch('EQ', '35')).toEqual({ used: 'EQ', preferred: 'EQU', majorVersion: '35' })
    expect(mnemonicMismatch('XIC', '38')).toBeUndefined()
  })

  it('reads the mnemonics out of a rung, not out of its tags', () => {
    const names = mnemonicsIn('XIC(Start)[XIO(Stop),TON(Tmr,500)]OTE(Motor);')
    expect(names).toEqual(['XIC', 'XIO', 'TON', 'OTE'])
    expect(names).not.toContain('START')
  })

  it('reports each mismatched mnemonic once per rung', () => {
    expect(mnemonicMismatchesIn('EQU(a,b)EQU(c,d)XIC(e);', '38')).toEqual([{ used: 'EQU', preferred: 'EQ', majorVersion: '38' }])
  })
})


describe('the mnemonic scan', () => {
  it('finds adjacent instructions', () => {
    expect(mnemonicsIn('XIC(A)OTE(B)')).toEqual(['XIC', 'OTE'])
  })

  it('never reports a name inside another instruction operand list', () => {
    // A safety-function operand reads "CABLE (ROPE) PULL SWITCH"; a plain scan reported CABLE as an
    // uncatalogued instruction on a production project.
    const rung = 'DCS(N_PULL_ROPE_DCS,CABLE (ROPE) PULL SWITCH,EQUIVALENT - ACTIVE HIGH,500,AUTOMATIC,AUTOMATIC,Local:7:I.Pt00.Data)'
    expect(mnemonicsIn(rung)).toEqual(['DCS'])
  })
})
