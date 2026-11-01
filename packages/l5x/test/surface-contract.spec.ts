/**
 * The component kinds and diagram languages the tools advertise but the suite never touched.
 *
 * Probing showed every kind opens, an alarm really is listed, and `search_logic` reaches a
 * Sequential Function Chart step operand. None of that had a test: `alarm` appears nowhere in
 * the suite, and the synthetic export that carries a `TagBasedAlarm` and an SFC routine was
 * used by one FBD spec only. A kind that silently lists nothing looks the same as a project
 * with no alarms, so this holds the positive case.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** The synthetic export: one TagBasedAlarm, one FBD routine, one SFC routine, no AOI. */
function synthetic() {
  return new Uint8Array(readFileSync(new URL('./fixtures/engineering-synthetic.l5x', import.meta.url)))
}

/** Open the synthetic export and return the harness. */
async function opened() {
  const l5x = harness(new Map([['synthetic.l5x', synthetic()]]))
  const open = await l5x.call('open_project', { path: 'synthetic.l5x' })
  expect(open.error).toBeUndefined()
  return l5x
}

describe('a project with alarms', () => {
  it('lists the TagBasedAlarm by name, kind and description', async () => {
    const l5x = await opened()
    const listing = await l5x.call('list_components', { kind: 'alarm' })
    expect(listing.error).toBeUndefined()
    expect(listing.data?.rows).toEqual([{ name: 'ExampleAlarm', kind: 'TagBasedAlarm', description: 'Synthetic alarm' }])
  })

  it('opens the alarm it listed', async () => {
    const l5x = await opened()
    const component = await l5x.call('get_component', { kind: 'alarm', name: 'ExampleAlarm' })
    expect(component.error).toBeUndefined()
    expect((component.data?.component as { name?: string })?.name).toBe('ExampleAlarm')
  })

  it('counts alarms in the overview', async () => {
    const l5x = await opened()
    const overview = await l5x.call('project_overview', {})
    expect((overview.data?.counts as { alarms?: number })?.alarms).toBe(1)
  })
})

describe('every advertised component kind', () => {
  it('lists without error and opens its first row when it has one', async () => {
    const l5x = await opened()
    const kinds = ['program', 'task', 'tag', 'udt', 'routine', 'aoi', 'module', 'alarm'] as const
    for (const kind of kinds) {
      const listing = await l5x.call('list_components', { kind })
      expect(listing.error, `${kind} listing`).toBeUndefined()
      const rows = (listing.data?.rows ?? []) as { name?: string }[]
      if (rows.length === 0) continue
      const component = await l5x.call('get_component', { kind, name: rows[0]?.name ?? '' })
      expect(component.error, `${kind} open`).toBeUndefined()
    }
  })

  it('finds the kinds this export actually declares', async () => {
    const l5x = await opened()
    for (const kind of ['program', 'task', 'tag', 'udt', 'routine', 'module', 'alarm'] as const) {
      const listing = await l5x.call('list_components', { kind })
      expect(((listing.data?.rows ?? []) as unknown[]).length, `${kind} rows`).toBeGreaterThan(0)
    }
  })

  it('refuses an absent name with a repairable failure, not a crash', async () => {
    const l5x = await opened()
    for (const kind of ['routine', 'tag', 'udt'] as const) {
      const missing = await l5x.call('get_component', { kind, name: 'NoSuchThing' })
      expect(missing.error?.code, kind).toBe('COMPONENT_NOT_FOUND')
    }
  })
})

describe('searching a diagram language', () => {
  it('finds a Sequential Function Chart step operand', async () => {
    const l5x = await opened()
    // The SFC routine's Step carries Operand="Local"; that is its only label.
    const found = await l5x.call('search_logic', { query: 'Local' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBeGreaterThan(0)
  })

  it('finds an FBD reference operand', async () => {
    const l5x = await opened()
    const found = await l5x.call('search_logic', { query: 'Drive.RunCmd' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBeGreaterThan(0)
  })

  it('finds nothing for a topology element that carries no label', async () => {
    const l5x = await opened()
    const found = await l5x.call('search_logic', { query: 'DirectedLink' })
    expect(found.error).toBeUndefined()
    expect(found.data?.total).toBe(0)
  })
})
