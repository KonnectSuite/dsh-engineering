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
    expect(result.data?.paste_text).toBe('XIC(Start)OTE(Run);\nXIO(Stop)TON(Timer1,?,?);')
    expect(result.data?.diagram_svg).toBeUndefined()

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

  it('draws a diagram only when it is asked for', async () => {
    const l5x = preview()
    const quiet = await l5x.call('l5x_rung_preview', { rungs: 'XIC(Start)OTE(Run);' })
    expect(quiet.error).toBeUndefined()
    expect(quiet.data?.diagram_svg).toBeUndefined()
    expect(quiet.summary ?? '').toContain('No diagram was requested')

    const drawn = await l5x.call('l5x_rung_preview', { rungs: 'XIC(Start)OTE(Run);', diagram: 'yes' })
    expect(drawn.error).toBeUndefined()
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

  it('stacks a branch and draws its join without flattening', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(A)[XIC(B),XIC(C)]OTE(Run);' }])
    expect(raster.svg).toContain('XIC(B)')
    expect(raster.svg).toContain('XIC(C)')
    expect(raster.flattened).toEqual([])
    // The join adds a bar and one stub per path, so the connector colour appears more than the
    // single left bracket did.
    expect((raster.svg.match(/64748B/gu) ?? []).length).toBeGreaterThanOrEqual(3)
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

  it('stacks and joins a parallel branch with no layout note', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(Permit)[XIC(Auto),XIC(Bypass)]OTE(Run);' }], 'branch')
    expect(raster.flattened).toEqual([])
    expect(raster.svg).toContain('XIC(Auto)')
    expect(raster.svg).toContain('XIC(Bypass)')
  })

  it('draws a rung comment clear of a stacked branch', () => {
    const raster = renderLadderSvg([{ number: 0, text: 'XIC(Permit)[XIC(Auto),XIC(Bypass)]OTE(Run);', comment: 'Auto or bypass' }], 'branch comment')
    const comment = /<text x="[\d.]+" y="([\d.]+)" font-size="11\.5"[^>]*>Auto or bypass</u.exec(raster.svg)
    expect(comment).not.toBeNull()
    const boxes = [...raster.svg.matchAll(/<rect x="[\d.]+" y="([\d.]+)" width="[\d.]+" height="[\d.]+" rx="3"/gu)].map(match => Number(match[1]))
    expect(boxes.length).toBeGreaterThan(0)
    expect(Number(comment?.[1])).toBeLessThan(Math.min(...boxes))
  })
})
describe('l5x_routine_diagram', () => {
  /** A harness whose project is the open fixture. */
  async function opened() {
    const l5x = harness()
    const result = await l5x.call('open_project', { path: 'sample.l5x' })
    expect(result.error).toBeUndefined()
    return l5x
  }

  it('draws the rungs of an existing routine and names its instructions', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'MainRoutine' })
    expect(result.error).toBeUndefined()
    expect(result.data?.program).toBe('MainProgram')
    expect(result.data?.routine).toBe('MainRoutine')
    expect(Number(result.data?.rungs)).toBeGreaterThan(0)
    const list = result.data?.rung_list as { number: number; text: string }[]
    expect(list.length).toBe(Number(result.data?.rungs))
    expect(typeof list[0]?.text).toBe('string')
  })

  it('refuses a routine that does not exist and offers the program routines', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'NoSuchRoutine' })
    expect(result.error?.code).toBe('NOT_FOUND')
    expect(result.error?.candidates).toEqual(expect.arrayContaining(['MainProgram/MainRoutine (RLL)']))
  })

  it('refuses a structured-text routine because it has no ladder to draw', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'FaultHandler' })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
    expect(result.error?.message).toContain('ST')
  })

  it('pages through a long routine with start_rung and reports the next page', async () => {
    const l5x = await opened()
    const whole = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'MainRoutine' })
    const total = Number(whole.data?.rungs)
    expect(total).toBeGreaterThan(1)
    const first = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'MainRoutine', max_rungs: 1 })
    expect(first.data?.rungs).toBe(1)
    expect(typeof first.data?.next_start).toBe('number')
    const second = await l5x.call('l5x_routine_diagram', {
      program: 'MainProgram',
      routine: 'MainRoutine',
      max_rungs: 1,
      start_rung: Number(first.data?.next_start),
    })
    const firstList = first.data?.rung_list as { number: number }[]
    const secondList = second.data?.rung_list as { number: number }[]
    expect(secondList[0]?.number).toBeGreaterThan(firstList[0]?.number ?? -1)
    expect(String(second.summary)).toContain('Next page start_rung')
  })

  it('refuses a start_rung past the last rung and names the range', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_routine_diagram', { program: 'MainProgram', routine: 'MainRoutine', start_rung: 9999 })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
    expect(result.error?.message).toContain('No rung at or after 9999')
  })

  it('requires both program and routine', async () => {
    const l5x = await opened()
    const result = await l5x.call('l5x_routine_diagram', { program: 'MainProgram' })
    expect(result.error?.code).toBe('INVALID_ARGUMENT')
  })
})