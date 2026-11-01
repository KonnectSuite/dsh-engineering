/**
 * Rung shapes Studio refuses, in an export that already contains them.
 *
 * `compose_rung` cannot emit either of these because it builds and checks the rung
 * before staging. An export, a hand edit or an import has no such guard, so these
 * checks judge a rung the reader already has.
 */
import { describe, expect, it } from 'vitest'
import { rungFindings } from '../src/engine/rung-rules.ts'
import type { L5xRoutine, L5xRung } from '../src/model/types.ts'
import { fixtureBytes, harness, type Envelope } from './harness.ts'

/** One ladder routine around a list of rungs. */
function ladder(...texts: string[]): L5xRoutine {
  const rungs: L5xRung[] = texts.map((text, number) => ({ number, text }))
  return { program: 'Main', name: 'Ladder', type: 'RLL', description: '', body: { type: 'RLL', rungs } }
}

/** Rules reported for one routine. */
function rules(routine: L5xRoutine): readonly string[] {
  return rungFindings(routine).map(finding => finding.rule)
}

describe('a rung that drives nothing', () => {
  it('reports a rung that ends on a condition only', () => {
    const found = rungFindings(ladder('XIC(Start)XIC(Run);'))
    expect(found.length).toBe(1)
    expect(found[0]?.rule).toBe('RUNG_NO_OUTPUT')
    expect(found[0]?.message).toContain('XIC')
    expect(found[0]?.severity).toBe('warning')
  })

  it('reports a comparison left at the rail', () => {
    expect(rules(ladder('XIC(Start)EQU(Count,5);'))).toContain('RUNG_NO_OUTPUT')
  })

  it('reports a trailing branch whose every path reads the condition', () => {
    expect(rules(ladder('XIC(Start)[XIO(Stop) ,XIC(Fault) ];'))).toContain('RUNG_NO_OUTPUT')
  })

  it('accepts a rung that ends in an output', () => {
    expect(rules(ladder('XIC(Start)OTE(Run);'))).toEqual([])
    expect(rules(ladder('XIC(Start)TON(Tmr,500);'))).toEqual([])
  })

  it('accepts a branch whose paths end in outputs', () => {
    expect(rules(ladder('XIC(Start)[OTE(Run) ,OTL(Latched) ];'))).toEqual([])
  })

  it('leaves a rung its own parser could not read to the parse finding', () => {
    // A malformed rung is not additionally reported as having no output.
    expect(rules(ladder('XIC(Start'))).toEqual([])
  })
})

describe('a subroutine instruction that does not open the routine', () => {
  it('reports SBR when the first rung opens with something else', () => {
    expect(rules(ladder('XIC(Start)OTE(Run);', 'SBR();'))).toContain('SBR_NOT_FIRST')
  })

  it('accepts SBR opening the first rung', () => {
    expect(rules(ladder('SBR();', 'XIC(Start)OTE(Run);'))).toEqual([])
  })

  it('says nothing about a routine with no subroutine instruction', () => {
    expect(rules(ladder('XIC(Start)OTE(Run);'))).toEqual([])
  })
})

describe('through run_checks', () => {
  it('stays silent on the committed export, whose rungs all drive an output', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    expect((await l5x.call('open_project', { path: 'sample.l5x' })).error).toBeUndefined()
    const result: Envelope = await l5x.call('run_checks', {})
    expect(result.error).toBeUndefined()
    // The fixture is a compiling export; these rules must stay silent on it.
    const invented = ((result.data?.findings ?? []) as { rule: string }[]).filter(finding => finding.rule === 'RUNG_NO_OUTPUT' || finding.rule === 'SBR_NOT_FIRST')
    expect(invented).toEqual([])
  })
})
