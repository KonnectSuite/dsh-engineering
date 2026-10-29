/**
 * The whole-project ladder diagram: one page for every RLL rung.
 */
import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fixtureBytes, harness } from './harness.ts'

/** A harness with the fixture project and a fresh output folder. */
async function opened(program?: string) {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]))
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
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
    const open = await l5x.call('open_project', { path: 'sample.l5x' })
    const output = mkdtempSync(join(tmpdir(), 'l5x-diagram-cap-'))
    const result = await l5x.call('l5x_diagram', { project_id: open.data?.project_id as string, output, max_rungs: 2 })
    expect(result.error).toBeUndefined()
    expect(result.data?.rungs).toBe(2)
    expect(result.data?.omitted as number).toBeGreaterThan(0)
    expect(result.summary).toContain('left off the page')
  })
})
