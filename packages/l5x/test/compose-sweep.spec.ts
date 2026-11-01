/**
 * Every modelled instruction must compose to text the ladder parser accepts.
 *
 * Individual suites cover the instructions with proven builds. This sweep walks
 * the whole catalogue with slot-shaped arguments so a future operand edit cannot
 * make an instruction emit text the parser rejects, or fail with an unexpected
 * error. Two refusals are expected and named: the catalogue deliberately does
 * not model eight instructions, and SBR() alone is refused (Studio aborts it).
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { l5x, program, rllRoutine, tag, task } from './l5x-build.ts'

interface Slot {
  readonly kind: string
  readonly required?: boolean
  readonly writable?: boolean
  readonly tag_only?: boolean
  readonly array_tag?: boolean
  readonly array_element?: boolean
  readonly no_array?: boolean
  readonly types?: readonly string[]
}

const UNMODELLED = new Set(['FAL', 'FSC', 'DCM', 'DCS', 'CROUT', 'EOT', 'SFR', 'SFP'])

function argumentFor(slot: Slot): string | undefined {
  const type = slot.types?.[0]
  if (type === 'PID') return 'Pid'
  if (type === 'MESSAGE') return 'Msg'
  if (type === 'ALARM_ANALOG') return 'AlarmA'
  if (type === 'ALARM_DIGITAL') return 'AlarmD'
  if (type === 'CONTROL') return 'Ctrl'
  if (type === 'REAL') return 'R'
  if (slot.array_tag === true) return 'Arr'
  if (slot.array_element === true) return 'Arr[0]'
  if (slot.no_array === true) return 'D'
  if (slot.writable === true) {
    if (slot.kind === 'BOOL') return 'B'
    if (slot.kind === 'STRING') return 'Str'
    if (slot.kind === 'TIMER') return 'T'
    if (slot.kind === 'COUNTER') return 'C'
    return 'D'
  }
  switch (slot.kind) {
    case 'BOOL': return 'B'
    case 'NUMBER': return '1'
    case 'ANY': return 'D'
    case 'TIMER': return 'T'
    case 'COUNTER': return 'C'
    case 'STRING': return 'Str'
    case 'EXPRESSION': return 'D + 1'
    case 'ROUTINE': return 'MainRoutine'
    case 'LABEL': return 'Lbl'
    default: return undefined
  }
}

describe('the whole catalogue composes', () => {
  it('emits parseable text for every modelled instruction', async () => {
    const tags = tag('B', 'BOOL') + tag('D', 'DINT') + tag('R', 'REAL') + tag('T', 'TIMER') + tag('C', 'COUNTER')
      + tag('Str', 'STRING') + tag('Ctrl', 'CONTROL') + tag('Msg', 'MESSAGE') + tag('Pid', 'PID')
      + tag('AlarmA', 'ALARM_ANALOG') + tag('AlarmD', 'ALARM_DIGITAL') + tag('Arr', 'DINT', ' Dimensions="10"')
    const base = l5x({ name: 'Sweep', tags, programs: program('Main', rllRoutine('MainRoutine', [])), tasks: task('MainTask', ['Main']) })
    const l5xTool = harness(new Map([['sweep.l5x', new TextEncoder().encode(base)]]), { editing: true })
    expect((await l5xTool.call('open_project', { path: 'sweep.l5x' })).error).toBeUndefined()
    const listed = await l5xTool.call('list_instructions', { limit: 200 })
    const rows = (listed.data?.rows ?? []) as { name: string; operands?: readonly Slot[] }[]
    expect(rows.length).toBeGreaterThan(120)
    let composed = 0
    let skipped = 0
    for (const row of rows) {
      const slots = (row.operands ?? []).filter(slot => slot.required !== false)
      // GSV/SSV/AHL class-instance-attribute slots need real vendor keywords; other suites cover GSV.
      if (slots.some(slot => slot.kind === 'KEYWORD')) { skipped += 1; continue }
      const args = slots.map(argumentFor)
      if (args.some(argument => argument === undefined)) { skipped += 1; continue }
      const compose = async (withOutput: boolean) => {
        const series = [{ instr: row.name, args }]
        if (withOutput) series.push({ instr: 'OTE', args: ['B'] })
        return l5xTool.call('compose_rung', { spec_json: JSON.stringify({ series }) })
      }
      let result = await compose(false)
      if (result.error?.code === 'INVALID_LADDER_SPEC' && /right power rail/u.test(result.error.message)) result = await compose(true)
      if (result.error) {
        const expected = UNMODELLED.has(row.name) && result.error.code === 'INSTRUCTION_NOT_MODELLED'
        const sbr = row.name === 'SBR' && result.error.code === 'INVALID_LADDER_SPEC'
        expect(expected || sbr, `${row.name}: ${result.error.code} ${result.error.message.split('\n')[0]}`).toBe(true)
        continue
      }
      const text = (result.data?.rungs as { neutral_text: string }[] | undefined)?.[0]?.neutral_text ?? ''
      const preview = await l5xTool.call('l5x_rung_preview', { rungs: text })
      expect(preview.error, `${row.name}: ${text}`).toBeUndefined()
      composed += 1
    }
    expect(skipped).toBeLessThanOrEqual(3)
    expect(composed).toBeGreaterThanOrEqual(120)
  })
})
