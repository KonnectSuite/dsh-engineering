import { describe, expect, it } from 'vitest'
import { fixtureBytes, harness } from './harness.ts'

describe('registration', () => {
  it('registers the offline tools in a stable order', () => {
    const { definitions } = harness()
    expect(definitions.map(definition => definition.name)).toEqual([
      'open_project',
      'project_overview',
      'list_components',
      'get_component',
      'search_logic',
      'find_references',
      'trace_dependencies',
      'resolve_tag',
      'usage_map',
      'run_checks',
      'compare_projects',
    ])
  })

  it('describes every parameter and never requires an undescribed one', () => {
    const { definitions } = harness()
    const parameters = definitions.flatMap(definition =>
      Object.entries(definition.parameters.properties).map(([name, schema]) => ({ tool: definition.name, name, schema })))
    expect(parameters.length).toBeGreaterThan(0)
    for (const { tool, name, schema } of parameters) {
      expect(schema.description, `${tool}.${name} has no description`).toBeTruthy()
      expect(String(schema.description).length).toBeGreaterThan(20)
    }
  })

  it('declares no required parameter that the schema omits', () => {
    const { definitions } = harness()
    for (const definition of definitions) {
      for (const required of definition.parameters.required) {
        expect(definition.parameters.properties[required], `${definition.name}.${required}`).toBeTruthy()
      }
    }
  })
})

describe('open and overview', () => {
  it('opens the export and returns a handle, a summary and next calls', async () => {
    const { call } = harness()
    const opened = await call('open_project', { path: 'sample.l5x' })
    expect(opened.error).toBeUndefined()
    expect(opened.summary).toContain('SampleController')
    expect(opened.data?.project_id).toBeTypeOf('string')
    expect(opened.data?.counts).toMatchObject({ programs: 2 })
    expect(opened.next?.[0]?.tool).toBe('project_overview')
  })

  it('resolves the single open project when project_id is omitted', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const overview = await call('project_overview')
    expect(overview.error).toBeUndefined()
    expect(String(overview.data?.revision)).toMatch(/^\d+\.\d+$/u)
    expect(overview.data?.controller).toMatchObject({ name: 'SampleController' })
  })

  it('refuses a read with no project open, and names the fix', async () => {
    const { call } = harness()
    const overview = await call('project_overview')
    expect(overview.error?.code).toBe('NO_PROJECT')
    expect(overview.error?.fix).toContain('open_project')
  })

  it('refuses an unknown handle and lists the open ones', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const overview = await call('project_overview', { project_id: 'nope' })
    expect(overview.error?.code).toBe('UNKNOWN_PROJECT')
    expect(overview.error?.candidates).toHaveLength(1)
  })
})

describe('components', () => {
  it('lists tags with a summary and a next page when more remain', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const listed = await call('list_components', { kind: 'tag', limit: 2 })
    expect(listed.error).toBeUndefined()
    expect(listed.summary).toContain('tags')
    expect(listed.data?.total).toBeTypeOf('number')
    expect((listed.data?.rows as unknown[]).length).toBe(2)
    expect(listed.next?.some(step => step.tool === 'list_components')).toBe(true)
  })

  it('filters by name, case-insensitively', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const listed = await call('list_components', { kind: 'tag', filter: 'motor' })
    const rows = listed.data?.rows as { name: string }[]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(row => row.name.toLowerCase().includes('motor'))).toBe(true)
  })

  it('reads one tag in full', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const tag = await call('get_component', { kind: 'tag', name: 'LineSpeed' })
    expect(tag.error).toBeUndefined()
    expect(tag.data?.component).toMatchObject({ name: 'LineSpeed', scope: 'controller' })
  })

  it('reads one routine with its body', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const routine = await call('get_component', { kind: 'routine', name: 'MainRoutine', scope: 'MainProgram' })
    expect(routine.error).toBeUndefined()
    const component = routine.data?.component as { body?: { type?: string } }
    expect(component.body?.type).toBe('RLL')
  })

  it('refuses an unknown component with candidates and a fix', async () => {
    const { call } = harness()
    await call('open_project', { path: 'sample.l5x' })
    const missing = await call('get_component', { kind: 'tag', name: 'Motor_9' })
    expect(missing.error?.code).toBe('COMPONENT_NOT_FOUND')
    expect(missing.error?.fix).toContain('list_components')
    expect(missing.error?.candidates.length).toBeGreaterThan(0)
  })
})

describe('staleness', () => {
  it('refuses a read after the export changes on disk', async () => {
    let bytes = fixtureBytes()
    const { call } = harness(() => bytes)
    await call('open_project', { path: 'sample.l5x' })
    bytes = new Uint8Array([...bytes, 0x0A])
    const overview = await call('project_overview')
    expect(overview.error?.code).toBe('STALE_EXPORT')
    expect(overview.error?.fix).toContain('open_project')
  })
})
