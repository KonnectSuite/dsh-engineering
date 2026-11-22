/**
 * An operand on a multidimensional array element, with a member.
 *
 * `Timer[0].DN` composed; `Alarm_Timer[0,8].DN` was refused with
 * `INVALID_OPERAND: "Alarm_Timer[0,8].DN" is not a tag or a number.` The address
 * resolver splits comma-separated indices correctly — the character-class gate in
 * front of it did not admit a comma, so the operand never reached the resolver.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { l5x, program, rllRoutine, tag } from './l5x-build.ts'

/** A project with a two-dimensional and a one-dimensional TIMER. */
function project(): Map<string, Uint8Array> {
  const xml = l5x({
    tags: [
      tag('Run', 'BOOL'),
      tag('Tmr', 'TIMER', ' Dimensions="2,16"'),
      tag('Single', 'TIMER', ' Dimensions="8"'),
    ].join(''),
    programs: program('Main', rllRoutine('MainRoutine', [{ text: 'XIC(Run)OTE(Run);' }])),
  })
  return new Map([['array.L5X', new TextEncoder().encode(xml)]])
}

async function opened() {
  const l5x = harness(project(), { editing: true })
  const open = await l5x.call('l5x_open_project', { path: 'array.L5X' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** Compose one rung from a contact and a coil. */
async function compose(l5x: Awaited<ReturnType<typeof opened>>, operand: string) {
  return await l5x.call('l5x_compose_rung', {
    spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: [operand] }, { instr: 'OTE', args: ['Run'] }] }),
  })
}

/** The NeutralText of the rung the composer returned. */
function neutralText(result: Awaited<ReturnType<typeof compose>>): string {
  const rungs = (result.data as { rungs?: readonly { neutral_text?: string }[] } | undefined)?.rungs ?? []
  return rungs[0]?.neutral_text ?? ''
}

describe('an operand on a multidimensional array element', () => {
  it('composes a timer member through two subscripts', async () => {
    const l5x = await opened()
    const result = await compose(l5x, 'Tmr[0,8].DN')
    expect(result.error).toBeUndefined()
    expect(neutralText(result)).toBe('XIC(Tmr[0,8].DN)OTE(Run);')
  })

  it('still composes the one-subscript form', async () => {
    const l5x = await opened()
    const result = await compose(l5x, 'Single[0].DN')
    expect(result.error).toBeUndefined()
    expect(neutralText(result)).toBe('XIC(Single[0].DN)OTE(Run);')
  })

  it('refuses the wrong rank rather than calling it "not a tag"', async () => {
    const l5x = await opened()
    // One subscript against a two-dimensional declaration is a real refusal, and the
    // message must name the rank, not the address shape.
    const result = await compose(l5x, 'Tmr[0].DN')
    expect(result.error?.message ?? String(result.summary)).not.toContain('is not a tag or a number')
  })
})
