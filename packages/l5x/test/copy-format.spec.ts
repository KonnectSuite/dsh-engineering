import { describe, expect, it } from 'vitest'
import { harness, type Harness } from './harness.ts'
import { l5x, program, rllRoutine, tag, task } from './l5x-build.ts'

/**
 * What a rung looks like when it is copied out of a Studio routine: space-separated operands, no
 * parentheses, no terminator, and a branch written as `BST ... NXB ... BND`. The reader used to
 * accept only its own NeutralText, so the text the engineer actually holds was refused.
 */
async function opened(): Promise<Harness> {
  const source = l5x({
    name: 'CopyFormat',
    tags: [tag('Start'), tag('Stop'), tag('A'), tag('B'), tag('C'), tag('Run'), tag('Timer1', 'TIMER')].join(''),
    programs: program('MainProgram', rllRoutine('MainRoutine', [{ text: 'XIC(Start)OTE(Run);' }])),
    tasks: task('MainTask', ['MainProgram']),
  })
  const l5xTool = harness(new Map([['copy.l5x', new TextEncoder().encode(source)]]), { editing: true })
  const open = await l5xTool.call('l5x_open_project', { path: 'copy.l5x' })
  expect(open.error).toBeUndefined()
  return l5xTool
}

describe('text copied out of Studio', () => {
  it('stages a rung written the way Studio shows it', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC Start XIO Stop OTE Run',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'copied.l5x' })
    expect(applied.error).toBeUndefined()
    // The export still stores NeutralText: what Studio accepts is never written verbatim.
    expect(l5xTool.written.get('copied.l5x')).toContain('<Text><![CDATA[XIC(Start)XIO(Stop)OTE(Run);]]></Text>')
  })

  it('reads a branch written as BST, NXB and BND', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'BST XIC A NXB XIC B BND XIO C OTE Run',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'branch.l5x' })
    expect(applied.error).toBeUndefined()
    expect(l5xTool.written.get('branch.l5x')).toContain('<Text><![CDATA[[XIC(A),XIC(B)]XIO(C)OTE(Run);]]></Text>')
  })

  it('keeps an expression with operators as one operand', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC Start XIC Stop OTE Run',
    })
    expect(staged.error).toBeUndefined()
    const applied = await l5xTool.call('l5x_draft_apply', { output_path: 'plain.l5x' })
    expect(applied.error).toBeUndefined()
    expect(l5xTool.written.get('plain.l5x')).toContain('<Text><![CDATA[XIC(Start)XIC(Stop)OTE(Run);]]></Text>')
  })

  it('refuses the question mark Studio uses for an operand the engineer left unconnected', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'TON Timer1 ? ?',
    })
    expect(staged.error?.code).toBe('INVALID_LADDER')
    expect(staged.error?.message).toContain('unconnected')
    expect(staged.error?.fix).toContain('Replace every ?')
  })

  it('refuses a paste of two rungs in one field', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC Start OTE Run\nXIO Stop OTE Run',
    })
    expect(staged.error?.code).toBe('INVALID_LADDER')
    expect(staged.error?.message).toContain('2 rungs')
    expect(staged.error?.fix).toContain('l5x_compose_batch')
  })

  it('still accepts NeutralText, and names both formats when it refuses', async () => {
    const l5xTool = await opened()
    const staged = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'XIC(Start)XIO(Stop)OTE(Run);',
    })
    expect(staged.error).toBeUndefined()
    const bad = await l5xTool.call('l5x_draft_rung', {
      program: 'MainProgram', routine: 'MainRoutine', mode: 'insert', rung: 1, text: 'BST XIC Start OTE Run',
    })
    expect(bad.error?.code).toBe('INVALID_LADDER')
    expect(bad.error?.fix).toContain('NeutralText')
    expect(bad.error?.fix).toContain('copied out of a Studio routine')
  })

  it('previews a rung pasted in Studio copy format', async () => {
    const l5xTool = await opened()
    const preview = await l5xTool.call('l5x_rung_preview', {
      rungs: 'XIC Start XIO Stop OTE Run',
    })
    expect(preview.error).toBeUndefined()
    expect(preview.data?.paste_text).toBe('XIC Start XIO Stop OTE Run')
    const rungList = preview.data?.rung_list as readonly { readonly text?: string; readonly neutral_text?: string }[] | undefined
    expect(rungList?.[0]?.text).toBe('XIC Start XIO Stop OTE Run')
    expect(rungList?.[0]?.neutral_text).toBe('XIC(Start)XIO(Stop)OTE(Run);')
  })
})
