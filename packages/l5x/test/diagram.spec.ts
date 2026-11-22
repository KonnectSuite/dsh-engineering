/**
 * The whole-project ladder diagram: one page for every RLL rung.
 */
import { describe, expect, it, vi } from 'vitest'
import { splitLabel } from '../src/engine/render-ladder.ts'
import { renderProjectDiagram } from '../src/tools/diagram.ts'

vi.setConfig({ testTimeout: 30_000 })
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the fixture project and a fresh output folder. */
async function opened(program?: string) {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
  const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-'))
  const result = await l5x.call('l5x_diagram', {
    project_id: open.data?.project_id as string,
    output,
    ...(program === undefined ? {} : { program }),
  })
  return { l5x, result, output }
}

describe('l5x_diagram', () => {
  it('draws every ladder rung as one page', async () => {
    const { result } = await opened()
    expect(result.error).toBeUndefined()
    expect(result.data?.rungs as number).toBeGreaterThan(2)
    const svg = result.data?.diagram_svg as string
    expect(existsSync(svg)).toBe(true)
    const text = readFileSync(svg, 'utf8')
    expect(text).toContain('<svg')
    expect(text).toContain('rung(s) drawn as instruction chains')
    expect(text).toMatch(/XIC\(|OTE\(|XIO\(/u)
    expect(result.data?.diagram_png === undefined || typeof result.data?.diagram_png === 'string').toBe(true)
  })

  it('restricts the page to one program', async () => {
    const { result } = await opened('MotorProgram')
    expect(result.error).toBeUndefined()
    expect(result.data?.programs).toEqual(['MotorProgram'])
  })

  it('refuses a program that has no ladder routines', async () => {
    const { result } = await opened('NoSuchProgram')
    expect(result.error?.code).toBe('NOT_FOUND')
    expect((result.error?.candidates ?? []).length).toBeGreaterThan(0)
  })

  it('caps the page and says how many rungs were left off', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-cap-'))
    const result = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, max_rungs: 2 })
    expect(result.error).toBeUndefined()
    expect(result.data?.rungs).toBe(2)
    expect(result.data?.omitted as number).toBeGreaterThan(0)
    expect(result.summary).toContain('more follow, so page on with start_rung')
  })

  it('pages a long project with start_rung', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    expect(open.error).toBeUndefined()
    const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-'))
    const first = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, max_rungs: 1 })
    expect(first.error).toBeUndefined()
    expect(first.data?.start_rung).toBe(0)
    expect(typeof first.data?.next_start).toBe('number')
    const second = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, max_rungs: 1, start_rung: 1 })
    expect(second.error).toBeUndefined()
    expect(second.data?.start_rung).toBe(1)
    expect(second.summary).toContain('from rung offset 1')
  }, 30000)

  it('restricts the page to one routine', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-'))
    const one = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, routine: 'MainRoutine' })
    expect(one.error).toBeUndefined()
    expect(one.data?.routines).toBe(1)
    const missing = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, routine: 'NoSuchRoutine' })
    expect(missing.error?.code).toBe('NOT_FOUND')
  }, 30000)

  it('breaks a long operand across two lines instead of shortening it', () => {
    const label = 'MOVE(BottomKnife_MP200Iec:O.Data[0],BottomKnife_MP200Iec:O.Data[1])'
    const lines = splitLabel(label)
    expect(lines).toHaveLength(2)
    expect(lines.join('')).toBe(label)
    expect(lines.every(line => line.length <= 36)).toBe(true)
    expect(splitLabel('XIC(Start)')).toEqual(['XIC(Start)'])
  })

  it('captions the page with the range it covers', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-'))
    const result = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, max_rungs: 1 })
    expect(result.error).toBeUndefined()
    const svg = readFileSync(result.data?.diagram_svg as string, 'utf8')
    expect(svg).toContain('1-1 of')
  }, 30000)

  it('gives a wrapped row more vertical room than a single-line row', () => {
    const device = (op: string, operand: string) => ({ op, operand })
    const row = (devices: { op: string; operand: string }[]) => ({ program: 'MainProgram', routine: 'Main', number: 0, comment: '', devices })
    const short = renderProjectDiagram([row(Array.from({ length: 6 }, () => device('XIC', 'A')))], 'T')
    const long = renderProjectDiagram([
      row(Array.from({ length: 6 }, () => device('MOVE', 'BottomKnife_MP200Iec:I.Data[3],BottomKnife_MP200Iec:O.DegreePosition'))),
    ], 'T')
    expect(long.height).toBeGreaterThan(short.height)
    expect(long.svg).toContain('BottomKnife_MP200Iec:O.DegreePosition')
  })
})


describe('paging a project diagram', () => {
  it('gives each page its own image path', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    const first = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, max_rungs: 2 })
    const second = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, max_rungs: 2, start_rung: 2 })
    expect(first.error).toBeUndefined()
    expect(second.error).toBeUndefined()
    const firstPng = first.data?.diagram_png
    const secondPng = second.data?.diagram_png
    if (typeof firstPng === 'string' && typeof secondPng === 'string') {
      // Page two must not overwrite page one's file.
      expect(firstPng).not.toBe(secondPng)
      expect(firstPng).toContain('r1-2')
      expect(secondPng).toContain('r3-4')
    }
  })
})

describe('a defaulted output folder', () => {
  it('writes the page to an absolute path instead of reporting a relative one', async () => {
    const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
    const open = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    expect(open.error).toBeUndefined()
    // No output argument: this tool defaults it, and this harness resolves paths relatively.
    const result = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, max_rungs: 3 })
    expect(result.error).toBeUndefined()
    expect(result.data?.rungs).toBe(3)
    expect(result.data?.image_error).toBeUndefined()
    expect(String(result.summary)).not.toContain('is not absolute')
  })
})
