/**
 * Rung comments: decode both export shapes and write them back.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** Open the fixture with the editing entry mounted. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('rung comment decoding', () => {
  it('reads the child <Comment> element current Studio exports write', async () => {
    const l5x = await opened()
    const routine = await l5x.call('get_component', { kind: 'routine', name: 'MotorControl', scope: 'MotorProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number; comment?: string }[] } }).body.rungs
    expect(rungs[0]?.comment).toBe('Child-element comment, the shape current Studio exports write.')
  })

  it('still reads the attribute form older exports used', async () => {
    const l5x = await opened()
    const routine = await l5x.call('get_component', { kind: 'routine', name: 'MotorControl', scope: 'MotorProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number; comment?: string }[] } }).body.rungs
    expect(rungs[1]?.comment).toBe('Speed ramp timer - wait 2 seconds before applying full speed')
  })
})

describe('rung comment writes', () => {
  it('sets a comment on an existing rung and applies it', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_rung_comment', {
      program: 'MotorProgram', routine: 'MotorControl', rung: 1, comment: 'Ramp timer: 2 s to full speed.',
    })
    expect(staged.error).toBeUndefined()
    const validated = await l5x.call('draft_validate', {})
    expect(validated.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'commented.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('commented.L5X') ?? ''
    expect(written).toContain('<Comment><![CDATA[Ramp timer: 2 s to full speed.]]></Comment>')
    expect(written).toContain('<Text><![CDATA[XIC(VFD_Running) TON(SpeedRampTimer,2000,0) ;]]></Text>')
  })

  it('clears a comment when the new text is empty', async () => {
    const l5x = await opened()
    await l5x.call('draft_rung_comment', { program: 'MotorProgram', routine: 'MotorControl', rung: 0, comment: '' })
    const applied = await l5x.call('draft_apply', { output_path: 'cleared.L5X' })
    expect(applied.error).toBeUndefined()
    const written = l5x.written.get('cleared.L5X') ?? ''
    const rung0 = written.slice(written.indexOf('Rung Number="0" Type="N"'), written.indexOf('Rung Number="1"'))
    expect(rung0).not.toContain('Child-element comment')
  })

  it('carries a comment on a newly inserted rung', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_rung', {
      program: 'MotorProgram', routine: 'MotorControl', mode: 'insert', rung: 4,
      text: 'XIC(VFD_Running)OTE(VFD_Running) ;', comment: 'Spare rung, documented on insert.',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5x.call('draft_apply', { output_path: 'inserted.L5X' })
    expect(applied.error).toBeUndefined()
    expect(l5x.written.get('inserted.L5X') ?? '').toContain('<Comment><![CDATA[Spare rung, documented on insert.]]></Comment>')
  })

  it('round-trips a comment that contains a CDATA terminator', async () => {
    const l5x = await opened()
    await l5x.call('draft_rung_comment', { program: 'MotorProgram', routine: 'MotorControl', rung: 2, comment: 'edge ]]> case' })
    const applied = await l5x.call('draft_apply', { output_path: 'roundtrip.L5X' })
    expect(applied.error).toBeUndefined()
    const text = l5x.written.get('roundtrip.L5X') ?? ''
    const reopened = harness(new Map([['roundtrip.L5X', new TextEncoder().encode(text)]]), { editing: true })
    const openedAgain = await reopened.call('open_project', { path: 'roundtrip.L5X' })
    expect(openedAgain.error).toBeUndefined()
    const routine = await reopened.call('get_component', { kind: 'routine', name: 'MotorControl', scope: 'MotorProgram' })
    const rungs = (routine.data?.component as { body: { rungs: { number: number; comment?: string }[] } }).body.rungs
    expect(rungs[2]?.comment).toBe('edge ]]> case')
  })
})
