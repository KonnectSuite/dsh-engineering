/**
 * The tool reference is checked against the registered tools.
 *
 * These tests read the same factories the plugins register at runtime, so a new
 * tool, a renamed argument or a changed row fails here before it can ship a
 * stale reference.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { collectTools, renderInventory, renderMarkdown } from '../scripts/gen-tool-reference.ts'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
const groups = collectTools()
const names = groups.flatMap(group => group.tools.map(tool => tool.name))

test('the committed reference matches the registered tools', () => {
  assert.equal(read('docs/reference/tools.md'), renderMarkdown(groups),
    'docs/reference/tools.md is stale; run pnpm docs:tools')
  assert.equal(read('docs/reference/tools.json'), renderInventory(groups),
    'docs/reference/tools.json is stale; run pnpm docs:tools')
})

test('the reference covers every registered tool', () => {
  // 73 tools live in the three vendored components; the six Optix tools come
  // from a separate package and are counted in the README instead.
  assert.equal(names.length, 114, 'the reference covers 114 tools; update this when a surface changes')
  for (const group of groups) assert.ok(group.tools.length > 0, `${group.group} registers no tools`)
})

test('tool names are unique across the bundle', () => {
  assert.equal(new Set(names).size, names.length, 'two tools register the same name')
})
