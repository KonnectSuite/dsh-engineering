import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'

const source = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patch = load(source)
const policy = patch[0]
const inserted = patch[1]

test('is one id-targeted override followed by one insert block', () => {
  assert.ok(Array.isArray(patch))
  assert.equal(patch.length, 2)
  assert.equal(policy.id, 'tool-capability-policy')
  assert.equal(policy.name, undefined, 'the policy layer must not insert a plugin row')
  assert.equal(policy.insert, undefined)
  assert.ok(Array.isArray(inserted.insert))
})

test('inserts exactly the bundle rows', () => {
  assert.deepEqual(inserted.insert, [
    { id: 'l5x-read', name: '@aryacode/dsh-engineering/l5x' },
    { id: 'l5x-read-skill', name: '@aryacode/dsh-engineering/l5x/skill' },
    { id: 'l5x-editing', name: '@aryacode/dsh-engineering/l5x/editing', disabled: true },
    { id: 'l5x-studio', name: '@aryacode/dsh-engineering/l5x/studio', disabled: true },
    { id: 'l5x-live', name: '@aryacode/dsh-engineering/l5x/live', disabled: true },
    { id: 'viewers', name: '@aryacode/dsh-engineering' },
    { id: 'ftview-read', name: '@aryacode/dsh-engineering/ftview' },
    { id: 'ftview-read-skill', name: '@aryacode/dsh-engineering/ftview/skill' },
    { id: 'ftview-edit', name: '@aryacode/dsh-engineering/ftview/edit' },
    { id: 'ftview-studio', name: '@aryacode/dsh-engineering/ftview/studio' },
    { id: 'mwi-session', name: '@aryacode/dsh-engineering/mwi' },
    { id: 'mwi-read', name: '@aryacode/dsh-engineering/mwi/read' },
    { id: 'mwi-read-skill', name: '@aryacode/dsh-engineering/mwi/skill' },
    { id: 'mwi-verify', name: '@aryacode/dsh-engineering/mwi/verify' },
    { id: 'mwi-edit', name: '@aryacode/dsh-engineering/mwi/edit', disabled: true },
    { id: 'optix', name: '@deepseek-ai/dsh-tool-ft-optix' },
  ])
})

test('mounts the one client face through the bundle package itself', () => {
  const clientRows = inserted.insert.filter(row => row.name === '@aryacode/dsh-engineering')
  assert.equal(clientRows.length, 1, 'a package registers one client bundle, so it needs exactly one mounted row')
  for (const row of inserted.insert) {
    assert.ok(!/-(l5x|ftview)-viewer$/u.test(row.name),
      `${row.name} names a retired viewer package; both faces ship in @aryacode/dsh-engineering`)
  }
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
