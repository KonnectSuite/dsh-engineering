/**
 * The skill is a published surface, so its two failure modes get tests.
 *
 * Its body must fit the component's budget (the host shows it in full), and
 * every backticked snake_case name in it must name something real: a registered
 * tool, a compose pattern, a host-side Studio tool, or a parameter. A skill that
 * advertises a name no tool carries leaves the assistant hunting for a phantom.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { harness } from './harness.ts'
import { PATTERNS } from '../src/engine/ladder.ts'

const raw = readFileSync(new URL('../SKILL.md', import.meta.url), 'utf8')
const body = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')

interface ComponentEntry {
  readonly id?: string
  readonly package?: string
  readonly skill?: { readonly budget?: number }
}
const components = JSON.parse(readFileSync(new URL('../../../components.json', import.meta.url), 'utf8')) as {
  readonly components: readonly ComponentEntry[]
}
const budget = components.components.find(entry => entry.id === 'l5x' || entry.package === 'packages/l5x')?.skill?.budget

const tokens = [...new Set([...body.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/gu)].map(match => match[1]!))]

// The Studio lane runs in the host as MCP tools, not in this plugin's registry; the skill documents
// both lanes, so these names are expected to be absent from the plugin definitions.
const HOST_TOOLS = new Set([
  'engineering_reference',
  'l5x_build_acd_from_draft',
  'l5x_controller_approval_status',
  'l5x_export_acd_to_l5x',
  'l5x_go_online',
  'l5x_read_controller_mode',
  'l5x_read_live_tag',
  'l5x_studio_review_evidence',
  'l5x_studio_sdk_status',
  'l5x_verify_offline_l5x',
])
const PARAMETERS = new Set(['project_id', 'spec_json', 'arguments_json', 'paste_text', 'neutral_text'])

describe('the skill surface', () => {
  it('fits the component budget', () => {
    expect(budget).toBeGreaterThan(0)
    expect(body.length).toBeLessThanOrEqual(budget as number)
  })

  it('names only real tools, patterns, host tools and parameters', () => {
    // A scanner that finds nothing would pass trivially; hold one known tool first.
    expect(tokens).toContain('l5x_open_project')
    const registered = harness(undefined, { editing: true, live: { allowWrites: true } }).definitions.map(definition => definition.name)
    const known = new Set<string>([...registered, ...PATTERNS, ...HOST_TOOLS, ...PARAMETERS])
    expect(tokens.filter(token => !known.has(token))).toEqual([])
  })
})
