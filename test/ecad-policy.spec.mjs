/**
 * The ECAD write switch across the two rows that make it work.
 *
 * The package-root row mounts the ECAD Remote service and the `ecad` row mounts
 * the tools. A profile can apply those sibling rows in either order, and the
 * panel used to stay read-only when the service was not there at the moment the
 * tools row applied. These specs pin the policy contract that removes that
 * ordering dependency: the tools row publishes a live `ecadPolicy` service and
 * the Remote service reads it on every call.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { apply as applyToolsRow, POLICY_SERVICE } from '../entries/ecad.js'
import { createEcadService } from '../src/remote/ecad-service.js'

/** A tiny Cordis context that records what a row provides and mounts. */
function fakeContext() {
  const provided = new Map()
  const mounted = []
  return {
    provided,
    mounted,
    get(name) {
      return provided.get(name)
    },
    provide(name, value) {
      provided.set(name, value)
    },
    plugin(plugin) {
      mounted.push(plugin)
    },
    logger: { warn() {} },
  }
}

test('the tools row publishes a live write policy, not a snapshot', () => {
  const ctx = fakeContext()
  const config = { writes: { get: () => true }, maxFileBytes: { get: () => 4096 } }
  applyToolsRow(ctx, config)

  const policy = ctx.provided.get(POLICY_SERVICE)
  assert.ok(policy !== undefined, 'the tools row provides the policy service')
  assert.equal(policy.writes, true, 'the policy reads the volatile switch as true')
  assert.equal(policy.maxFileBytes, 4096)

  config.writes = { get: () => false }
  assert.equal(policy.writes, false, 'the policy follows the live row value')
  assert.equal(ctx.mounted.length, 2, 'the engine and skill rows still mount')
})

test('the panel service reads the policy even when it was mounted first', () => {
  const ctx = fakeContext()
  const service = createEcadService(ctx)

  // No tools row has applied yet: the safe default is read-only.
  assert.equal(service.writes, false)

  // The tools row mounts afterwards and publishes the live policy.
  const config = { writes: true }
  applyToolsRow(ctx, config)
  assert.equal(service.writes, true, 'the panel sees the row switch without a configure call')

  config.writes = false
  assert.equal(service.writes, false, 'turning the row switch off is seen live')
})

test('configure still controls the service when no row policy is mounted', () => {
  const ctx = fakeContext()
  const service = createEcadService(ctx)

  service.configure({ writes: true })
  assert.equal(service.writes, true)
  service.configure({ writes: false })
  assert.equal(service.writes, false)
})
