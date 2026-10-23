/**
 * The tool reference and the policy are checked against the registered tools.
 *
 * These tests read the same factories the plugins register at runtime, so a new
 * tool, a renamed argument or a changed skill link fails here before it can
 * ship a stale reference or an unreachable tool.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'
import { collectTools, renderInventory, renderMarkdown } from '../scripts/gen-tool-reference.ts'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const groups = collectTools()
const names = groups.flatMap(group => group.tools.map(tool => tool.name))
const capabilities = load(read('cordis.patch.yml'))[0].config.toolPolicy.capabilities

test('the committed reference matches the registered tools', () => {
  assert.equal(read('docs/reference/tools.md'), renderMarkdown(groups),
    'docs/reference/tools.md is stale; run pnpm docs:tools')
  assert.equal(read('docs/reference/tools.json'), renderInventory(groups),
    'docs/reference/tools.json is stale; run pnpm docs:tools')
})

test('every registered tool is governed by one skill capability', () => {
  for (const name of names) {
    const covered = capabilities.some(capability => (capability.tools ?? []).includes(name)
      || (capability.prefixes ?? []).some(prefix => name.startsWith(prefix)))
    assert.ok(covered, `${name} is not linked to a skill, so its switch cannot hide it`)
  }
})

test('no capability names a tool the bundle does not register', () => {
  for (const capability of capabilities) {
    for (const name of capability.tools ?? []) {
      assert.ok(names.includes(name), `${capability.skill} names unknown tool ${name}`)
    }
  }
})

test('tool names are unique across the bundle', () => {
  assert.equal(new Set(names).size, names.length, 'two tools register the same name')
})
