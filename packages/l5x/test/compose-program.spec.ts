/**
 * One program composed only through the tools, then read back.
 *
 * The Studio build of this exact shape passed 0/0 (composed-proof.L5X), so this
 * test keeps the repository's composition path honest: every rule added for
 * array elements, structure types, one-based positions and defaults appears in
 * one program, and the applied export must round-trip each rung unchanged.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { l5x, program, rllRoutine, task } from './l5x-build.ts'

const TAGS: readonly (readonly [string, string, string | undefined])[] = [
  ['Start', 'BOOL', undefined], ['Stop', 'BOOL', undefined], ['Run', 'BOOL', undefined],
  ['T', 'TIMER', undefined], ['Count', 'DINT', undefined], ['Arr', 'DINT', '10'], ['Mask', 'DINT', undefined],
  ['Dest', 'DINT', '10'], ['Ctrl', 'CONTROL', undefined], ['Msg', 'MESSAGE', undefined],
  ['Str1', 'STRING', undefined], ['Str2', 'STRING', undefined], ['Pos', 'DINT', undefined],
  ['AlarmA', 'ALARM_ANALOG', undefined], ['N', 'DINT', undefined], ['B1', 'BOOL', undefined], ['B2', 'BOOL', undefined], ['B3', 'BOOL', undefined],
  ['Pid', 'PID', undefined], ['PV', 'REAL', undefined], ['Tieback', 'REAL', undefined], ['CV', 'REAL', undefined], ['InBit', 'BOOL', undefined], ['InVal', 'REAL', undefined],
]

const RUNGS: readonly string[] = [
  'XIC(Start)XIO(Stop)OTE(Run);',
  'XIC(Run)TON(T,1000,0);',
  'XIC(T.DN)ADD(Count,1,Count);',
  'SQO(Arr,Mask,Dest[0],Ctrl,10,0);',
  'XIC(Run)MSG(Msg);',
  'FIND(Str1,Str2,1,Pos);',
  'ALMA(AlarmA,N,B1,B2,B3);',
  'BSL(Arr,Ctrl,B1,8);',
  'PID(Pid,PV,Tieback,CV,0,InBit,InVal);',
]

describe('a program composed only through the tools', () => {
  it('applies all tags and rungs and reads back unchanged', async () => {
    const base = l5x({ name: 'ComposedProgram', programs: program('Main', rllRoutine('MainRoutine', [])), tasks: task('MainTask', ['Main']) })
    const l5xTool = harness(new Map([['composed.l5x', new TextEncoder().encode(base)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'composed.l5x' })).error).toBeUndefined()
    for (const [name, dataType, dimensions] of TAGS) {
      const added = await l5xTool.call('draft_tag', { scope: 'controller', name, data_type: dataType, description: name, ...(dimensions === undefined ? {} : { dimensions }) })
      expect(added.error, name).toBeUndefined()
    }
    for (const [rung, text] of RUNGS.entries()) {
      const added = await l5xTool.call('draft_rung', { program: 'Main', routine: 'MainRoutine', mode: 'insert', rung, text })
      expect(added.error, text).toBeUndefined()
    }
    const applied = await l5xTool.call('draft_apply', { output_path: 'composed-out.l5x' })
    expect(applied.error).toBeUndefined()
    const output = String(l5xTool.written.get('composed-out.l5x'))
    const reopened = harness(new Map([['composed-out.l5x', new TextEncoder().encode(output)]]), { editing: false })
    const opened = await reopened.call('open_project', { path: 'composed-out.l5x' })
    expect(opened.error).toBeUndefined()
    expect((opened.data?.counts as { tags: number }).tags).toBe(TAGS.length)
    const routine = await reopened.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'Main' })
    const rungs = (routine.data?.component as { body: { rungs: { text: string }[] } }).body.rungs
    expect(rungs.map(rung => rung.text)).toEqual(RUNGS)
  })

  it('writes a timer with the accumulator Studio requires', async () => {
    // Studio's NeutralText is TON(Timer,2000,0). A caller composing a timer writes two operands, and the
    // short form is the one Studio rejected on paste; the composer supplies the trailing 0 instead.
    const base = l5x({ name: 'Accumulator', programs: program('Main', rllRoutine('MainRoutine', [])), tasks: task('MainTask', ['Main']) })
    const l5xTool = harness(new Map([['p.l5x', new TextEncoder().encode(base)]]), { editing: true })
    await l5xTool.call('open_project', { path: 'p.l5x' })
    for (const [name, dataType] of [['Start', 'BOOL'], ['Timer', 'TIMER']] as const) {
      await l5xTool.call('draft_tag', { scope: 'controller', name, data_type: dataType, description: name })
    }
    const composed = await l5xTool.call('compose_rung', {
      program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0,
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['Start'] }, { instr: 'TON', args: ['Timer', '2000'] }] }),
    })
    expect(composed.error).toBeUndefined()
    expect((composed.data as { rungs: { neutral_text: string }[] }).rungs[0].neutral_text).toBe('XIC(Start)TON(Timer,2000,0);')
    // An explicit accumulator is honoured and not doubled.
    const explicit = await l5xTool.call('compose_rung', {
      program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 1,
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['Start'] }, { instr: 'TON', args: ['Timer', '2000', '0'] }] }),
    })
    expect((explicit.data as { rungs: { neutral_text: string }[] }).rungs[0].neutral_text).toBe('XIC(Start)TON(Timer,2000,0);')
  })

  it('writes the ladder preview itself so the chat can draw a composed rung', async () => {
    // The composer used to end at "validate": nothing drew what it had just written, so a composed rung reached
    // the reader as NeutralText unless they asked again. It now writes the viewer document in the same call.
    const base = l5x({ name: 'PreviewPointer', programs: program('Main', rllRoutine('MainRoutine', [])), tasks: task('MainTask', ['Main']) })
    const l5xTool = harness(new Map([['p.l5x', new TextEncoder().encode(base)]]), { editing: true })
    await l5xTool.call('open_project', { path: 'p.l5x' })
    for (const [name, dataType] of [['Start', 'BOOL'], ['Run', 'BOOL']] as const) {
      await l5xTool.call('draft_tag', { scope: 'controller', name, data_type: dataType, description: name })
    }
    const composed = await l5xTool.call('compose_rung', {
      program: 'Main', routine: 'MainRoutine', mode: 'insert', rung: 0,
      spec_json: JSON.stringify({ series: [{ instr: 'XIC', args: ['Start'] }, { instr: 'OTE', args: ['Run'] }] }),
    })
    expect(composed.error).toBeUndefined()
    const previewPath = String((composed.data as { preview_path?: unknown } | undefined)?.preview_path ?? '')
    expect(previewPath).toBe('.l5x-preview/Main-MainRoutine.L5X')
    const xml = l5xTool.written.get(previewPath) ?? ''
    expect(xml).toContain('<Rung Number="0" Type="N">')
    expect(xml).toContain('XIC(Start)OTE(Run);')
    expect(composed.next?.map(step => step.tool)).toContain('present')
    // Only the scratch preview is written: the project file still waits for draft_apply.
    expect([...l5xTool.written.keys()].filter(path => path !== previewPath)).toEqual([])
    // The viewer parses this document client-side, so it has to be an L5X our own reader accepts.
    const reopened = harness(new Map([[previewPath, new TextEncoder().encode(xml)]]))
    expect((await reopened.call('open_project', { path: previewPath })).error).toBeUndefined()
    const drawn = await reopened.call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'Preview' })
    expect(drawn.error).toBeUndefined()
    const rungs = (drawn.data?.component as { body: { rungs: { text: string }[] } }).body.rungs
    expect(rungs.map(rung => rung.text)).toEqual(['XIC(Start)OTE(Run);'])
  })
})
