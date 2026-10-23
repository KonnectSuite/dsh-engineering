/**
 * The shared tool core: name rules, the output contract, failure translation,
 * the parameter builders and the typed bridge boundary.
 */
import { describe, expect, it } from 'vitest'
import { Bridge, assertSupportedPlatform, type BridgeResponse, type BridgeTransport } from '../src/core/bridge.ts'
import { MwiError } from '../src/core/errors.ts'
import { boolean, choice, integer, list, object, string } from '../src/core/params.ts'
import { jsonText, requiredString, tool, type ToolSpec } from '../src/core/tool.ts'

const parameters = object({
  project: string('Workspace project path.', {}),
  mode: choice('Operation mode.', ['make', 'build'], {}),
  count: integer('How many rows.', { minimum: 1 }),
  flag: boolean('Whether to include warnings.', {}),
  tags: list('Tags to read.', string('One tag name.', {})),
}, ['project'])

function spec(overrides: Partial<ToolSpec> = {}): ToolSpec {
  return {
    name: 'mw_example',
    description: 'An example tool.',
    parameters,
    async run() { return { ok: true } },
    ...overrides,
  }
}

describe('tool contract', () => {
  it('requires the mw_ prefix so the skill switch governs the tool', () => {
    expect(() => tool(spec({ name: 'project_open' }))).toThrow(/mw_ prefix/u)
  })

  it('requires a description', () => {
    expect(() => tool(spec({ description: '  ' }))).toThrow(/no description/u)
  })

  it('carries the canonical output declaration and renders JSON', async () => {
    const definition = tool(spec())
    expect(definition.output.schema).toEqual({ type: 'object', additionalProperties: true })
    expect(definition.output.render(undefined, { a: 1 })).toEqual(jsonText(undefined, { a: 1 }))
  })

  it('keeps every parameter described and required names declared', () => {
    expect(parameters.additionalProperties).toBe(false)
    expect(parameters.required).toEqual(['project'])
    for (const property of Object.values(parameters.properties)) {
      expect(property.description.length).toBeGreaterThan(0)
    }
  })

  it('returns the success document unchanged', async () => {
    const definition = tool(spec({ async run() { return { summary: 'done', data: {}, next: [] } } }))
    await expect(definition.execute({ project: 'Line' }, {})).resolves.toEqual({ summary: 'done', data: {}, next: [] })
  })

  it('maps an expected failure to the recoverable envelope', async () => {
    const definition = tool(spec({ async run() { throw new MwiError('WRONG_PROJECT', 'Wrong project.', 'Stage the intended project.') } }))
    await expect(definition.execute({}, {})).resolves.toEqual({
      error: { code: 'WRONG_PROJECT', message: 'Wrong project.', fix: 'Stage the intended project.', candidates: [] },
    })
  })

  it('marks an unexpected failure as a plugin defect', async () => {
    const definition = tool(spec({ async run() { throw new TypeError('boom') } }))
    const result = await definition.execute({}, {}) as { error: { code: string; message: string } }
    expect(result.error.code).toBe('INTERNAL')
    expect(result.error.message).toBe('boom')
  })

  it('refuses an empty required string with a fix', () => {
    expect(() => requiredString({}, 'path')).toThrow(MwiError)
  })
})

describe('bridge contract', () => {
  const transport = (response: BridgeResponse): BridgeTransport => ({
    async send() { return response },
  })

  it('returns the bridge result when the operation succeeded', async () => {
    const bridge = new Bridge(transport({ ok: true, result: { status: 'RUNNING' } }))
    await expect(bridge.run('ide-status', {})).resolves.toEqual({ status: 'RUNNING' })
  })

  it('turns a bridge refusal into a recoverable failure', async () => {
    const bridge = new Bridge(transport({ ok: false, error: { code: 'IDE_NOT_RUNNING', message: 'No IDE.' } }))
    await expect(bridge.run('ide-status', {})).rejects.toMatchObject({ code: 'IDE_NOT_RUNNING', message: 'No IDE.' })
  })

  it('refuses a non-Windows host before any IDE call', () => {
    expect(() => assertSupportedPlatform('linux')).toThrow(/Windows/u)
  })
})
