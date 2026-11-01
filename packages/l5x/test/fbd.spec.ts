/**
 * Function Block Diagram structure.
 *
 * A diagram is a wire graph the export never describes, so a sheet Studio refuses
 * is byte-for-byte the shape of one it accepts: a wire to an element that is not
 * there, two output references writing one tag, a connector with nothing on the
 * other side, a loop that cannot be scheduled.
 *
 * Half of these run the pure checker over hand-built nodes, because that is where
 * the rule lives. The rest go through `run_checks` on the committed synthetic
 * export, which already carries one FBD routine and one SFC routine.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validateDiagram } from '../src/engine/fbd.ts'
import type { L5xDiagramNode, L5xRoutine } from '../src/model/types.ts'
import { harness, type Envelope } from './harness.ts'

/** One routine wrapper around a node list. */
function routine(nodes: readonly L5xDiagramNode[]): L5xRoutine {
  return { program: 'Main', name: 'Diagram', type: 'FBD', description: '', body: { type: 'FBD', nodes } }
}

/** The synthetic export, which carries one FBD routine and one SFC routine. */
function synthetic(): Uint8Array {
  return new Uint8Array(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
}

/** Open one export and return the harness around it. */
async function opened(bytes: Uint8Array) {
  const l5x = harness(new Map([['synthetic.l5x', bytes]]))
  const open = await l5x.call('open_project', { path: 'synthetic.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** Findings of the rules that start with a prefix. */
function findings(result: Envelope, prefix: string): { rule: string; severity: string; message: string }[] {
  return ((result.data?.findings ?? []) as { rule: string; severity: string; message: string }[]).filter(finding => finding.rule.startsWith(prefix))
}

describe('a well-formed diagram', () => {
  it('reports nothing for a reference wired to an output reference', async () => {
    const l5x = await opened(synthetic())
    const result = await l5x.call('run_checks', {})
    expect(result.error).toBeUndefined()
    expect(findings(result, 'FBD_')).toEqual([])
    expect(findings(result, 'ICON_')).toEqual([])
    expect(findings(result, 'OCON_')).toEqual([])
    expect(findings(result, 'IREF_')).toEqual([])
    expect(findings(result, 'OREF_')).toEqual([])
  })

  it('never judges a Sequential Function Chart by function block rules', () => {
    // The synthetic export's SFC routine carries a DirectedLink; only an FBD body is judged.
    expect(validateDiagram({ program: 'Main', name: 'Chart', type: 'SFC', description: '', body: { type: 'other', note: 'SFC' } })).toEqual([])
  })
})

describe('broken diagrams', () => {
  it('refuses a wire that names an element the sheet does not contain', async () => {
    const broken = new TextDecoder().decode(synthetic()).replace('<Wire FromID="1" ToID="2"/>', '<Wire FromID="1" ToID="9"/>')
    const l5x = await opened(new TextEncoder().encode(broken))
    const result = await l5x.call('run_checks', { rule: 'FBD_DANGLING_WIRE' })
    const rows = findings(result, 'FBD_DANGLING_WIRE')
    expect(rows.length).toBe(1)
    expect(rows[0]?.severity).toBe('critical')
    expect(rows[0]?.message).toContain('ToID="9"')
  })

  it('refuses an output reference with no operand', async () => {
    const broken = new TextDecoder().decode(synthetic()).replace('<ORef ID="2" Operand="Drive.RunCmd"/>', '<ORef ID="2"/>')
    const l5x = await opened(new TextEncoder().encode(broken))
    const result = await l5x.call('run_checks', { rule: 'OREF_TAG_NOT_PROVIDED' })
    expect(findings(result, 'OREF_TAG_NOT_PROVIDED').length).toBe(1)
  })

  it('refuses two output references writing one tag on a sheet', async () => {
    const broken = new TextDecoder().decode(synthetic()).replace('<ORef ID="2" Operand="Drive.RunCmd"/>', '<ORef ID="2" Operand="Drive.RunCmd"/><ORef ID="3" Operand="drive.runcmd"/>')
    const l5x = await opened(new TextEncoder().encode(broken))
    const result = await l5x.call('run_checks', { rule: 'OREF_DUPLICATE_DESTINATION' })
    const rows = findings(result, 'OREF_DUPLICATE_DESTINATION')
    expect(rows.length).toBe(1)
    // Logix names are case-insensitive, so the two spellings are one destination.
    expect(rows[0]?.message).toContain('drive.runcmd')
  })
})

describe('connectors', () => {
  it('pairs an input connector with an output connector of the same name', () => {
    const nodes: L5xDiagramNode[] = [
      { kind: 'ICon', sheet: 0, id: '1', name: 'In' },
      { kind: 'OCon', sheet: 1, id: '2', name: 'In' },
      { kind: 'Wire', sheet: 1, fromId: '7', toId: '2' },
      { kind: 'IRef', sheet: 1, id: '7', operand: 'Start' },
      { kind: 'Wire', sheet: 0, fromId: '1', toId: '8' },
      { kind: 'ORef', sheet: 0, id: '8', operand: 'Done' },
    ]
    expect(validateDiagram(routine(nodes)).filter(finding => finding.rule.startsWith('ICON_') || finding.rule.startsWith('OCON_') || finding.rule.startsWith('FBD_'))).toEqual([])
  })

  it('reports an input connector with no output connector of that name', () => {
    const found = validateDiagram(routine([
      { kind: 'ICon', sheet: 0, id: '1', name: 'Missing' },
      { kind: 'Wire', sheet: 0, fromId: '1', toId: '2' },
      { kind: 'ORef', sheet: 0, id: '2', operand: 'Done' },
    ])).filter(finding => finding.rule === 'ICON_NO_MATCHING_OCON')
    expect(found.length).toBe(1)
    expect(found[0]?.message).toContain('Missing')
  })

  it('reports a connector with no name', () => {
    const rules = validateDiagram(routine([
      { kind: 'ICon', sheet: 0, id: '1' },
      { kind: 'OCon', sheet: 0, id: '2' },
    ])).map(finding => finding.rule)
    expect(rules).toContain('ICON_NAME_NOT_PROVIDED')
    expect(rules).toContain('OCON_NAME_NOT_PROVIDED')
  })

  it('reports a connector with no wire on its working side', () => {
    const rules = validateDiagram(routine([
      { kind: 'ICon', sheet: 0, id: '1', name: 'Link' },
      { kind: 'OCon', sheet: 0, id: '2', name: 'Link' },
    ])).map(finding => finding.rule)
    expect(rules).toContain('ICON_NO_OUTBOUND_WIRE')
    expect(rules).toContain('OCON_NO_INBOUND_WIRE')
  })
})

describe('wire loops', () => {
  it('reports a loop, because feedback goes through a tag rather than a wire', () => {
    const found = validateDiagram(routine([
      { kind: 'Add', sheet: 0, id: '1' },
      { kind: 'Add', sheet: 0, id: '2' },
      { kind: 'Wire', sheet: 0, fromId: '1', toId: '2' },
      { kind: 'Wire', sheet: 0, fromId: '2', toId: '1' },
    ])).filter(finding => finding.rule === 'FBD_FEEDBACK_CYCLE')
    expect(found.length).toBe(1)
    expect(found[0]?.message).toContain('->')
  })

  it('reports an acyclic sheet as clean', () => {
    expect(validateDiagram(routine([
      { kind: 'Add', sheet: 0, id: '1' },
      { kind: 'Add', sheet: 0, id: '2' },
      { kind: 'Wire', sheet: 0, fromId: '1', toId: '2' },
    ])).filter(finding => finding.rule === 'FBD_FEEDBACK_CYCLE')).toEqual([])
  })
})
