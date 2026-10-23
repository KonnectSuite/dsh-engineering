import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'

const source = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patch = load(source)
const policy = patch[0]

test('is exactly one id-targeted override', () => {
  assert.ok(Array.isArray(patch))
  assert.equal(patch.length, 1)
  assert.equal(policy.id, 'tool-capability-policy')
  assert.equal(policy.name, undefined, 'phase 1 must not insert a plugin row')
  assert.equal(policy.insert, undefined)
  assert.equal(policy.disabled, undefined)
})

test('declares no inserted rows anywhere in the file', () => {
  assert.doesNotMatch(source, /^\s*-\s*insert:/mu)
  assert.doesNotMatch(source, /^\s{4,}name:/mu)
})

test('links each engineering prefix to a registered skill name', () => {
  const capabilities = policy.config.toolPolicy.capabilities
  assert.ok(Array.isArray(capabilities))
  for (const capability of capabilities) {
    assert.match(capability.skill, /^[a-z0-9][a-z0-9-]*$/u)
    assert.ok(capability.prefixes.length > 0, `${capability.skill} links no tools`)
  }
  assert.deepEqual(
    capabilities.map(capability => capability.skill),
    ['rockwell-l5x', 'factorytalk-view', 'motionworks-iec'],
  )
  assert.deepEqual(
    capabilities.flatMap(capability => capability.prefixes),
    ['l5x_', 'ftview_', 'mw_'],
  )
})

test('does not claim one prefix twice', () => {
  const prefixes = policy.config.toolPolicy.capabilities.flatMap(capability => capability.prefixes)
  assert.equal(new Set(prefixes).size, prefixes.length)
})

test('keeps eager exposure and the policy-only mount', () => {
  assert.equal(policy.config.toolPolicy.onDemand, false)
  assert.equal(policy.config.policyOnly, true)
})
