/**
 * A rung composed into an export reads the way that export already reads.
 *
 * Logix Designer 36 renamed sixteen ladder instructions (EQU to EQ, SQR to SQRT,
 * …). The composer must accept either spelling and write the one the project
 * already uses, and `run_checks` must say so when a project mixes them — as a
 * warning, because the project still builds.
 *
 * The fixture is a v33 export whose rungs use the pre-v36 spelling. These tests
 * rewrite one attribute of a copy, so the bytes under test stay the real export.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness, type Envelope } from './harness.ts'

/** The fixture export with its controller revision rewritten. */
function fixtureAt(majorRev: string): Uint8Array {
  const text = new TextDecoder().decode(fixtureBytes())
  expect(text).toContain('MajorRev="33"')
  return new TextEncoder().encode(text.replace('MajorRev="33"', `MajorRev="${majorRev}"`))
}

/** The fixture export with every legacy MOV rung rewritten to MOVE. */
function fixtureWrittenInModernSpelling(): Uint8Array {
  return new TextEncoder().encode(new TextDecoder().decode(fixtureBytes()).replaceAll('MOV(', 'MOVE('))
}

/** Open one export and return the harness around it. */
async function opened(bytes: () => Uint8Array, options: { editing?: boolean } = {}) {
  const l5x = harness(new Map([['sample.l5x', bytes()]]), options)
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** The neutral text of the first composed rung. */
function neutralText(result: Envelope): string {
  const rungs = result.data?.rungs as { neutral_text: string }[] | undefined
  return rungs?.[0]?.neutral_text ?? ''
}

/** Findings of one rule. */
function findings(result: Envelope): { rule: string; severity: string; message: string; evidence: { used: string; preferred: string } }[] {
  return (result.data?.findings ?? []) as { rule: string; severity: string; message: string; evidence: { used: string; preferred: string } }[]
}

describe('run_checks names the revision mismatch', () => {
  it('reports a legacy mnemonic inside a v36 project, with its modern spelling', async () => {
    const l5x = await opened(() => fixtureAt('36'))
    const result = await l5x.call('run_checks', { rule: 'MNEMONIC_VERSION_MISMATCH' })
    expect(result.error).toBeUndefined()
    const mov = findings(result).find(finding => finding.evidence?.used === 'MOV')
    expect(mov).toBeDefined()
    expect(mov?.evidence.preferred).toBe('MOVE')
    expect(mov?.severity).toBe('warning')
    expect(mov?.message).toContain('MOVE')
    expect(mov?.message).toContain('v36')
  })

  it('stays quiet when the project predates the rename', async () => {
    const l5x = await opened(() => fixtureAt('33'))
    const result = await l5x.call('run_checks', { rule: 'MNEMONIC_VERSION_MISMATCH' })
    expect(result.error).toBeUndefined()
    expect(findings(result)).toEqual([])
  })
})

describe('compose_rung writes the spelling the project uses', () => {
  it('keeps the legacy spelling an older project already reads', async () => {
    const l5x = await opened(fixtureBytes, { editing: true })
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'MOV', args: ['LineSpeed', 'FaultCount'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(neutralText(result)).toContain('MOV(')
    expect(neutralText(result)).not.toContain('MOVE(')
  })

  it('follows a project that was written in the modern spelling', async () => {
    const l5x = await opened(fixtureWrittenInModernSpelling, { editing: true })
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'MOV', args: ['LineSpeed', 'FaultCount'] }] }),
    })
    expect(result.error).toBeUndefined()
    expect(neutralText(result)).toContain('MOVE(')
  })

  it('accepts a modern spelling the catalog files under its legacy name', async () => {
    const l5x = await opened(fixtureBytes, { editing: true })
    const result = await l5x.call('compose_rung', {
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['StartPB'] }, { instr: 'SQRT', args: ['LineSpeed', 'FaultCount'] }] }),
    })
    expect(result.error).toBeUndefined()
    // The project writes neither spelling, so the catalog name is emitted.
    expect(neutralText(result)).toContain('SQR(')
  })
})
