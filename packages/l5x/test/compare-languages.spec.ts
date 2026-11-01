/**
 * `compare_projects` on the languages that are not ladder.
 *
 * It is the tool a reviewer uses to judge an edit, and a comparison that answers "no changes"
 * while a Structured Text body or a diagram changed is worse than one that fails. Probing showed
 * it does see them — component `structured_text` for a body, `diagram` for FBD and SFC — and no
 * test held any of it, so this does.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** The synthetic export: one ladder, one FBD and one SFC routine. */
function synthetic(): string {
  return new TextDecoder().decode(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
}

/** Compare two export texts. */
async function compare(before: string, after: string) {
  const l5x = harness(new Map([
    ['a.l5x', new TextEncoder().encode(before)],
    ['b.l5x', new TextEncoder().encode(after)],
  ]), { editing: true })
  const one = await l5x.call('open_project', { path: 'a.l5x' })
  const two = await l5x.call('open_project', { path: 'b.l5x' })
  expect(one.error).toBeUndefined()
  expect(two.error).toBeUndefined()
  const result = await l5x.call('compare_projects', { before_id: one.data?.project_id, after_id: two.data?.project_id })
  expect(result.error).toBeUndefined()
  return result.data as { count: number; by_component: Record<string, number> }
}

describe('a change inside a Structured Text routine', () => {
  it('is reported as a structured_text change', async () => {
    const before = new TextDecoder().decode(fixtureBytes())
    const after = before.replace('<Line Number="0"><![CDATA[', '<Line Number="0"><![CDATA[// touched ')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.structured_text).toBe(1)
  })
})

describe('a change inside a diagram', () => {
  it('is reported as a diagram change when a function block operand changes', async () => {
    const before = synthetic()
    const after = before.replace('<IRef ID="1" Operand="Start"/>', '<IRef ID="1" Operand="StartPB"/>')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.diagram).toBe(1)
  })

  it('is reported as a diagram change when a chart step operand changes', async () => {
    const before = synthetic()
    const after = before.replace('<Step ID="1" Operand="Local"/>', '<Step ID="1" Operand="Local2"/>')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.diagram).toBe(1)
  })
})

describe('a change inside a rung', () => {
  it('is reported as a rung change', async () => {
    const before = synthetic()
    const after = before.replace('OTE(RunAlias);', 'OTE(RunAlias2);')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(1)
    expect(changes.by_component.rung).toBe(1)
  })
})

describe('a change to formatting only', () => {
  it('is not reported at all', async () => {
    const before = synthetic()
    // Whitespace between elements is not engineering content.
    const after = before.replace('\n  <Controller', '\n        <Controller')
    expect(after).not.toBe(before)
    const changes = await compare(before, after)
    expect(changes.count).toBe(0)
  })
})
