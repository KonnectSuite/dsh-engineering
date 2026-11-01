/**
 * The write contract: what `draft_apply` actually emits.
 *
 * Two shapes were observed correct while probing and had no test holding them: an array
 * tag carries the `Dimensions` attribute, and a multi-line Structured Text body becomes
 * one `<Line>` per line with no newline inside the CDATA — Studio refuses a `<Line>` that
 * holds one. Both are cheap to regress and expensive to discover at build time.
 */
import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

/** Open the fixture with the editing entry. */
async function opened() {
  const l5x = harness(new Map([['sample.l5x', fixtureBytes()]]), { editing: true })
  const open = await l5x.call('open_project', { path: 'sample.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

/** Apply one staged draft and return the XML it wrote. */
async function appliedXml(l5x: Awaited<ReturnType<typeof opened>>, draftId: string, path: string): Promise<string> {
  const result = await l5x.call('draft_apply', { draft_id: draftId, output_path: path })
  expect(result.error).toBeUndefined()
  return l5x.written.get(path) ?? ''
}

/** The body of one routine element. */
function routineBody(xml: string, name: string): string {
  const start = xml.indexOf(`<Routine Name="${name}"`)
  if (start < 0) return ''
  const end = xml.indexOf('</Routine>', start)
  return xml.slice(start, end)
}

/** The staged draft handle. */
function draftIdOf(staged: { data?: Record<string, unknown> }): string {
  return String((staged.data as { draft_id?: unknown } | undefined)?.draft_id ?? '')
}

describe('an array tag', () => {
  it('carries the Dimensions attribute the declaration needs', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_tag', { scope: 'controller', name: 'Recipe_Table', data_type: 'DINT', dimensions: '4 2', description: 'recipe rows' })
    expect(staged.error).toBeUndefined()
    const xml = await appliedXml(l5x, draftIdOf(staged), 'array.l5x')
    const declaration = /<Tag Name="Recipe_Table"[^>]*>/u.exec(xml)?.[0] ?? ''
    expect(declaration).toContain('Dimensions="4 2"')
    expect(declaration).toContain('DataType="DINT"')
  })

  it('leaves Dimensions off a scalar tag', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_tag', { scope: 'controller', name: 'Recipe_Total', data_type: 'DINT', description: 'recipe total' })
    expect(staged.error).toBeUndefined()
    const xml = await appliedXml(l5x, draftIdOf(staged), 'scalar.l5x')
    const declaration = /<Tag Name="Recipe_Total"[^>]*>/u.exec(xml)?.[0] ?? ''
    expect(declaration).not.toContain('Dimensions=')
  })
})

describe('a new Structured Text routine', () => {
  it('writes one Line element per source line, with no newline inside a CDATA', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_routine', {
      program: 'MainProgram', name: 'Structured', language: 'ST',
      code: 'Total := Total + 1;\nIF Total > 10 THEN Total := 0; END_IF;',
    })
    expect(staged.error).toBeUndefined()
    const xml = await appliedXml(l5x, draftIdOf(staged), 'st.l5x')
    const body = routineBody(xml, 'Structured')
    expect(body).toContain('Type="ST"')
    const numbers = [...body.matchAll(/<Line Number="(\d+)"/gu)].map(match => match[1])
    expect(numbers).toEqual(['0', '1'])
    // The invariant Studio enforces: a single <Line> must never span lines.
    expect(/<!\[CDATA\[[^\]]*\n/u.test(body)).toBe(false)
  })

  it('reopens what it wrote', async () => {
    const l5x = await opened()
    const staged = await l5x.call('draft_routine', { program: 'MainProgram', name: 'Structured', language: 'ST', code: 'Total := 1;' })
    expect(staged.error).toBeUndefined()
    const xml = await appliedXml(l5x, draftIdOf(staged), 'st2.l5x')
    const reopened = harness(new Map([['st2.l5x', new TextEncoder().encode(xml)]]))
    expect((await reopened.call('open_project', { path: 'st2.l5x' })).error).toBeUndefined()
    const listing = await reopened.call('list_components', { kind: 'routine' })
    const names = (listing.data?.rows as { name: string }[] | undefined)?.map(row => row.name) ?? []
    expect(names).toContain('Structured')
  })
})
