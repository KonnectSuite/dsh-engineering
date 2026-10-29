/**
 * The ladder preview: one viewer document per proposed answer, and refusals.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the read entry mounted, which owns the preview tool. */
function preview() {
  return harness(new Map([['sample.l5x', fixtureBytes()]]))
}

describe('l5x_rung_preview', () => {
  it('writes a viewer document with the rungs, comments and instructions', async () => {
    const l5x = preview()
    const result = await l5x.call('l5x_rung_preview', {
      title: 'PumpStart',
      rungs: 'XIC(Start)OTE(Run);\nXIO(Stop)TON(Timer1,?,?);',
      comments: 'start latch\nstop delay',
    })
    expect(result.error).toBeUndefined()
    expect(result.data?.path).toBe('.l5x-preview/PumpStart.L5X')
    expect(result.data?.rungs).toBe(2)
    expect(result.data?.instructions).toEqual(expect.arrayContaining(['XIC', 'OTE', 'XIO', 'TON']))

    const document = l5x.written.get('.l5x-preview/PumpStart.L5X') ?? ''
    expect(document.startsWith('<?xml version="1.0" encoding="UTF-8"')).toBe(true)
    expect(document).toContain('<RSLogix5000Content')
    expect(document).toContain('TargetType="Controller"')
    expect(document).toContain('<Controller Use="Target" Name="PumpStart"')
    expect(document).toContain('<Program Use="Target" Name="Preview"')
    expect(document).toContain('<Routine Use="Target" Name="MainRoutine" Type="RLL"')
    expect(document).toContain('<Rung Number="0" Type="N">')
    expect(document).toContain('<Comment>start latch</Comment>')
    expect(document).toContain('<Text>XIC(Start)OTE(Run);</Text>')
    expect(document).toContain('<Text>XIO(Stop)TON(Timer1,?,?);</Text>')
  })

  it('omits the comment element for a rung without a comment', async () => {
    const l5x = preview()
    await l5x.call('l5x_rung_preview', { rungs: 'XIC(Start)OTE(Run);\nXIC(Auto)OTE(Run);', comments: '\nsecond only' })
    const document = l5x.written.get('.l5x-preview/Preview.L5X') ?? ''
    expect((document.match(/<Comment>/gu) ?? []).length).toBe(1)
  })

  it('refuses a rung that does not parse and writes nothing', async () => {
    const l5x = preview()
    const result = await l5x.call('l5x_rung_preview', { rungs: 'XIC(Start' })
    expect(result.error?.code).toBe('INVALID_RUNG')
    expect(l5x.written.size).toBe(0)
  })

  it('refuses an empty body and an oversized comment list', async () => {
    const l5x = preview()
    expect((await l5x.call('l5x_rung_preview', { rungs: '\n\n' })).error?.code).toBe('INVALID_ARGUMENT')
    expect((await l5x.call('l5x_rung_preview', { rungs: 'XIC(A)OTE(B);', comments: 'a\nb' })).error?.code).toBe('INVALID_ARGUMENT')
  })

  it('accepts an explicit output path and escapes the title', async () => {
    const l5x = preview()
    const result = await l5x.call('l5x_rung_preview', {
      rungs: 'XIC(A)OTE("B&<>");',
      title: 'A & B',
      output: 'previews/answer.L5X',
    })
    expect(result.error).toBeUndefined()
    expect(l5x.written.has('previews/answer.L5X')).toBe(true)
    const document = l5x.written.get('previews/answer.L5X') ?? ''
    expect(document).toContain('Name="A-B"')
    expect(document).toContain('<Text>XIC(A)OTE("B&amp;&lt;&gt;");</Text>')
  })
})
