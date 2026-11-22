/**
 * Every tool the capability report advertises must exist.
 *
 * The report once listed `propose_change`, `apply_change_set`, `trace_symbol`, a whole
 * references family and other names that no tool carries - a caller reading it would try
 * tools that cannot be called. This test walks every `tools` array in the payload and
 * requires each entry to be a registered tool.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

describe('the capability report', () => {
  it('advertises only tools that are registered', async () => {
    const l5x = harness(undefined, { editing: true, studio: true, live: true })
    const registered = new Set(l5x.definitions.map(definition => definition.name))
    const result = await l5x.call('l5x_studio_capabilities')
    expect(result.error).toBeUndefined()

    const advertised = new Set<string>()
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) {
        for (const item of value) walk(item)
        return
      }
      if (value === null || typeof value !== 'object') return
      const record = value as Record<string, unknown>
      if (Array.isArray(record.tools)) {
        for (const entry of record.tools) if (typeof entry === 'string') advertised.add(entry)
      }
      for (const child of Object.values(record)) walk(child)
    }
    walk(result.data)

    const phantom = [...advertised].filter(name => !registered.has(name)).sort()
    expect({ phantom, registered: registered.size }).toEqual({ phantom: [], registered: registered.size })
    expect(advertised.size).toBeGreaterThan(10)
  })
})
