/**
 * The ladder preview: one viewer document per proposed answer, and refusals.
 */
import { describe, expect, it } from 'vitest'
import { renderLadderSvg } from '../src/engine/render-ladder.ts'
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

describe('rungs from a file', () => {
  it('renders the rungs held in a file', async () => {
    const files = new Map([['rungs.txt', new TextEncoder().encode('XIC(Start)OTE(Run);\nXIC(Stop)OTU(Run);\n')]])
    const l5x = harness(files)
    const result = await l5x.call('l5x_rung_preview', { rungs_file: 'rungs.txt', title: 'FromFile' })
    expect(result.error).toBeUndefined()
    expect(Number(result.data?.rungs)).toBe(2)
  })

  it('skips comment and blank lines so a pasted block works', async () => {
    const l5x = harness()
    const result = await l5x.call('l5x_rung_preview', { rungs: '// start latch\n\nXIC(Start)OTE(Run);\n# note\nXIC(Stop)OTU(Run);\n' })
    expect(result.error).toBeUndefined()
    expect(Number(result.data?.rungs)).toBe(2)
  })

  it('asks for rungs when neither rungs nor rungs_file is passed', async () => {
    const l5x = harness()
    const result = await l5x.call('l5x_rung_preview', {})
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })
})
describe('renderLadderSvg', () => {
  it('draws one box per instruction, labels the operands and numbers the rungs', () => {
    const raster = renderLadderSvg([
      { number: 0, text: 'XIC(Start)XIO(Stop)OTE(Run);' },
      { number: 1, text: 'XIC(Fault)OTL(Latched);' },
    ], 'Pump start')
    expect(raster.svg).toContain('XIC(Start)')
    expect(raster.svg).toContain('XIO(Stop)')
    expect(raster.svg).toContain('OTL(Latched)')
    expect(raster.svg).toContain('viewBox="0 0 ')
    expect(raster.rungs).toBe(2)
    expect(raster.width).toBeGreaterThan(300)
    expect(raster.height).toBeGreaterThan(80)
  })

  it('stacks a branch and reports that it flattened it', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(A)[XIC(B),XIC(C)]OTE(Run);' }])
    expect(raster.svg).toContain('XIC(B)')
    expect(raster.svg).toContain('XIC(C)')
    expect(raster.flattened).toEqual(['branch with 2 path(s)'])
  })

  it('escapes operands so a stray angle bracket cannot break the SVG', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(A<B)OTE(Run);' }])
    expect(raster.svg).toContain('&lt;')
    expect(raster.svg).not.toContain('A<B')
  })
})
describe('ladder diagram layout', () => {
  it('draws the rung comment above the rail and grows the canvas for it', () => {
    const plain = renderLadderSvg([{ number: 0, text: 'XIC(Start)OTE(Run);' }], 'plain')
    const commented = renderLadderSvg([{ number: 0, text: 'XIC(Start)OTE(Run);', comment: 'Start the line from the panel' }], 'commented')
    expect(commented.svg).toContain('Start the line from the panel')
    expect(commented.height).toBeGreaterThan(plain.height)
  })

  it('separates contacts from outputs by fill colour', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(Start)OTE(Run);' }], 'colours')
    expect(raster.svg).toContain('#14251F')
    expect(raster.svg).toContain('#1B2436')
    expect(raster.svg).toMatch(/XIC\(Start\)/u)
    expect(raster.svg).toMatch(/OTE\(Run\)/u)
  })

  it('stacks a parallel branch and notes it in the layout report', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(Permit)[XIC(Auto),XIC(Bypass)]OTE(Run);' }], 'branch')
    expect(raster.flattened.join(' ')).toContain('branch with 2 path(s)')
    expect(raster.svg).toContain('XIC(Auto)')
    expect(raster.svg).toContain('XIC(Bypass)')
  })
})