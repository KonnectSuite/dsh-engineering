/**
 * A `next` step must name a tool that can be called.
 *
 * The capability report once advertised tools that do not exist; the same mistake can hide in
 * the `next` suggestions every tool returns. This walks those suggestions and requires each
 * name to be registered, with `present` allowed as the host tool it is.
 */
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'

/** Host tools a plugin may suggest that are not part of the plugin. */
const HOST_TOOLS = new Set(['present'])

describe('next-step suggestions', () => {
  it('name only tools that are registered', async () => {
    const l5x = harness(undefined, { editing: true })
    const registered = new Set(l5x.definitions.map(definition => definition.name))
    const opened = await l5x.call('l5x_open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()

    const envelopes = [
      opened,
      await l5x.call('l5x_project_overview'),
      await l5x.call('l5x_run_checks', { limit: 1 }),
      await l5x.call('l5x_list_components', { kind: 'program' }),
      await l5x.call('l5x_find_references', { symbol: 'SystemRunning' }),
      await l5x.call('l5x_get_component', { kind: 'program', name: 'MainProgram' }),
      await l5x.call('l5x_document_project', { output_root: 'docs-next' }),
      await l5x.call('l5x_trace_dependencies', { symbol: 'SystemRunning' }),
      await l5x.call('l5x_usage_map', { tag: 'SystemRunning' }),
    ]

    const phantom = new Set<string>()
    let suggestions = 0
    for (const envelope of envelopes) {
      for (const step of (envelope.next ?? [])) {
        if (typeof step?.tool !== 'string') continue
        suggestions += 1
        if (!registered.has(step.tool) && !HOST_TOOLS.has(step.tool)) phantom.add(step.tool)
      }
    }

    expect({ phantom: [...phantom].sort(), suggestions }).toEqual({ phantom: [], suggestions })
    expect(suggestions).toBeGreaterThan(5)
  })
})
