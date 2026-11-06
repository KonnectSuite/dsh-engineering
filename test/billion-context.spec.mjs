/**
 * billion-context's compaction gate as the preset observes it.
 *
 * The gate is an internal service name plus a process-global verdict, neither
 * of which is a published contract, so the spec pins both strings and the
 * fail-open behaviour around them. Every wait goes through the helper's injected
 * `sleep` seam, so no test sleeps: a fake sleep records the cadence and can
 * publish the service or the verdict on a chosen tick.
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  BILI_ATTACH_ENV,
  BILI_BUNDLE_NAME,
  BILI_GATE_SERVICE,
  BILI_KILL_ENV,
  BILI_REWRITES_ENV,
  BILI_STAND_DOWN_WARNING,
  BILI_TIMING,
  BILI_VERDICT_ACTIVE,
  BILI_VERDICT_GLOBAL,
  isBiliExpected,
  isBiliKillSwitched,
  isBiliVerdictActive,
  resolveStandDown,
} from '../presets/billion-context.js'

/**
 * A minimal plugin context with a service map and a warning sink.
 * @param {Record<string, unknown>} [services] services `ctx.get()` returns.
 * @param {string[]} [warnings] receives every `logger.warn` message.
 * @returns {{ get: (name: string) => unknown, logger: { warn: (message: string) => void }, services: object }}
 */
function hostCtx(services = {}, warnings = []) {
  return {
    services,
    get(name) {
      return services[name]
    },
    logger: {
      warn(message) {
        warnings.push(message)
      },
    },
  }
}

/**
 * A sleep seam that records the cadence and runs one callback per tick.
 * @param {number[]} waits receives every requested delay.
 * @param {(tick: number) => void} [onTick] runs after the delay is recorded.
 * @returns {(ms: number) => Promise<void>} the seam.
 */
function fakeSleep(waits, onTick) {
  return async (ms) => {
    waits.push(ms)
    if (typeof onTick === 'function') onTick(waits.length)
  }
}

/** Custom timings short enough that the loop counts stay small and exact. */
const TIMING = Object.freeze({ pollMs: 10, gateMs: 30, verdictMs: 30 })

test('the constants name bili\'s gate, verdict, bundle, switches and timings', () => {
  assert.equal(BILI_GATE_SERVICE, 'biliBasicCompactionPolicy')
  assert.equal(BILI_VERDICT_GLOBAL, '__BILI_DSH_COMPACTION_VERDICT__')
  assert.equal(BILI_VERDICT_ACTIVE, 'active')
  assert.equal(BILI_BUNDLE_NAME, 'billion-context')
  assert.deepEqual([...BILI_ATTACH_ENV], ['BILLION_CONTEXT_PROXY', 'BILLION_CONTEXT_ATTACH'])
  assert.deepEqual([...BILI_KILL_ENV], ['BILLION_CONTEXT_PLUGIN', 'BILI_NATIVE_DSH'])
  assert.equal(BILI_REWRITES_ENV, 'BILI_PROVIDER_REWRITES')
  assert.deepEqual({ ...BILI_TIMING }, { pollMs: 25, gateMs: 2000, verdictMs: 500 })
  assert.ok(BILI_STAND_DOWN_WARNING.includes('billion-context'))
  assert.ok(BILI_STAND_DOWN_WARNING.includes('keeping the Arya compaction engine'))
})

test('the kill switches are the ones bili itself reads', () => {
  assert.equal(isBiliKillSwitched({}), false)
  assert.equal(isBiliKillSwitched({ BILLION_CONTEXT_PLUGIN: '0' }), true)
  assert.equal(isBiliKillSwitched({ BILI_NATIVE_DSH: '0' }), true)
  // only the exact string is a kill; bili compares with === '0'
  assert.equal(isBiliKillSwitched({ BILLION_CONTEXT_PLUGIN: '1' }), false)
  assert.equal(isBiliKillSwitched({ BILLION_CONTEXT_PLUGIN: 'false' }), false)
  assert.equal(isBiliKillSwitched({ BILI_NATIVE_DSH: 'off' }), false)
  // BILI_PROVIDER_REWRITES is read with !== undefined, so any defined value kills
  assert.equal(isBiliKillSwitched({ [BILI_REWRITES_ENV]: '' }), true)
  assert.equal(isBiliKillSwitched({ [BILI_REWRITES_ENV]: '0' }), true)
  assert.equal(isBiliKillSwitched({ [BILI_REWRITES_ENV]: 'anything' }), true)
  // and a hostile environment is not a throw
  assert.equal(isBiliKillSwitched(null), false)
  const hostile = new Proxy({}, { get() { throw new Error('env') } })
  assert.equal(isBiliKillSwitched(hostile), false)
})

test('bili is expected from the profile bundles, the overlays or an attach env', () => {
  assert.equal(isBiliExpected({ startedBundles: ['billion-context'] }, {}), true)
  assert.equal(isBiliExpected({ startedBundles: ['@deepseek-ai/dsh-web-app', 'billion-context'] }, {}), true)
  // the profile may name a scoped or suffixed form; bili's own walk is substring-based
  assert.equal(isBiliExpected({ startedBundles: ['@acme/billion-context-extra'] }, {}), true)
  assert.equal(isBiliExpected({ startedBundles: ['@deepseek-ai/dsh-web-app'] }, {}), false)
  assert.equal(isBiliExpected({}, {}), false)
  assert.equal(isBiliExpected(undefined, {}), false)
  assert.equal(isBiliExpected(null, {}), false)
  assert.equal(isBiliExpected('billion-context', {}), false)

  // a launcher's --patch overlay names the package on the row or inside insert
  assert.equal(isBiliExpected({ overlays: [{ id: 'bili-native', name: 'billion-context' }] }, {}), true)
  assert.equal(isBiliExpected({ overlays: [{ insert: [{ id: 'bili-native', name: 'billion-context' }] }] }, {}), true)
  assert.equal(isBiliExpected({ overlays: [{ id: 'unrelated' }] }, {}), false)
  assert.equal(isBiliExpected({ overlays: 'billion-context' }, {}), false)

  // an attach-mode proxy routes the wire even when the bundle is not listed
  assert.equal(isBiliExpected({}, { BILLION_CONTEXT_PROXY: 'http://127.0.0.1:8787' }), true)
  assert.equal(isBiliExpected({}, { BILLION_CONTEXT_ATTACH: 'http://127.0.0.1:8787' }), true)
  assert.equal(isBiliExpected({}, { BILLION_CONTEXT_PROXY: '   ' }), false)
  assert.equal(isBiliExpected({}, { BILLION_CONTEXT_PROXY: '' }), false)

  // the kill switches outrank every positive signal, as in bili's planNativeDsh()
  const bundles = { startedBundles: ['billion-context'] }
  const attach = { BILLION_CONTEXT_PROXY: 'http://127.0.0.1:8787' }
  assert.equal(isBiliExpected(bundles, { BILLION_CONTEXT_PLUGIN: '0' }), false)
  assert.equal(isBiliExpected(bundles, { BILI_NATIVE_DSH: '0' }), false)
  assert.equal(isBiliExpected(bundles, { [BILI_REWRITES_ENV]: '1' }), false)
  assert.equal(isBiliExpected({}, { ...attach, BILI_NATIVE_DSH: '0' }), false)
})

test('the overlay scan is cycle-safe and bounded', () => {
  const cyclic = []
  cyclic.push(cyclic)
  assert.equal(isBiliExpected({ overlays: cyclic }, {}), false)
  const nested = { a: { b: { c: ['one', 'two'] } } }
  nested.a.b.c.push(nested)
  assert.equal(isBiliExpected({ overlays: [nested] }, {}), false)
  assert.equal(isBiliExpected({ overlays: [{ deep: { name: 'billion-context' } }] }, {}), true)
  const hostile = new Proxy({ overlays: [] }, { get() { throw new Error('profile') } })
  assert.equal(isBiliExpected(hostile, {}), false)
})

test('only the exact active verdict counts', () => {
  assert.equal(isBiliVerdictActive({ [BILI_VERDICT_GLOBAL]: 'active' }), true)
  for (const value of ['ACTIVE', 'inactive', 'off', true, 1, null, undefined]) {
    assert.equal(isBiliVerdictActive({ [BILI_VERDICT_GLOBAL]: value }), false, String(value))
  }
  assert.equal(isBiliVerdictActive(null), false)
  assert.equal(isBiliVerdictActive(undefined), false)
  const hostile = new Proxy({}, { get() { throw new Error('scope') } })
  assert.equal(isBiliVerdictActive(hostile), false)
})

test('no billion-context means false immediately: no wait and no warning', async () => {
  const warnings = []
  const waits = []
  let result = await resolveStandDown(hostCtx({}, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: { BILLION_CONTEXT_PLUGIN: '0' },
    sleep: fakeSleep(waits),
    timing: TIMING,
  })
  assert.equal(result, false)
  assert.deepEqual(waits, [])
  assert.equal(warnings.length, 0)

  result = await resolveStandDown(hostCtx({}, warnings), {
    profileContext: { startedBundles: ['@deepseek-ai/dsh-web-app'] },
    env: {},
    sleep: fakeSleep(waits),
    timing: TIMING,
  })
  assert.equal(result, false)
  assert.deepEqual(waits, [])
  assert.equal(warnings.length, 0)
})

test('gate service present and verdict active resolves true without waiting', async () => {
  const warnings = []
  const waits = []
  const services = { [BILI_GATE_SERVICE]: Object.freeze({ owner: 'billion-context' }) }
  const scope = { [BILI_VERDICT_GLOBAL]: BILI_VERDICT_ACTIVE }
  const result = await resolveStandDown(hostCtx(services, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    scope,
    sleep: fakeSleep(waits),
    timing: TIMING,
  })
  assert.equal(result, true)
  assert.deepEqual(waits, [])
  assert.equal(warnings.length, 0)
})

test('an already-active gate wins even when the profile names no bundle', async () => {
  const services = { [BILI_GATE_SERVICE]: Object.freeze({ owner: 'billion-context' }) }
  const scope = { [BILI_VERDICT_GLOBAL]: BILI_VERDICT_ACTIVE }
  // A direct or custom bili row mounts nothing the profile's bundle list knows
  // about, so the live gate and verdict have to be enough on their own.
  for (const profileContext of [undefined, {}, { startedBundles: ['@deepseek-ai/dsh-web-app'] }]) {
    const warnings = []
    const waits = []
    const result = await resolveStandDown(hostCtx(services, warnings), {
      profileContext,
      env: {},
      scope,
      sleep: fakeSleep(waits),
      timing: TIMING,
    })
    assert.equal(result, true)
    assert.deepEqual(waits, [])
    assert.equal(warnings.length, 0)
  }
})

test('a live gate with an inactive verdict and no expectation returns false at once', async () => {
  const warnings = []
  const waits = []
  const result = await resolveStandDown(hostCtx({ [BILI_GATE_SERVICE]: {} }, warnings), {
    profileContext: { startedBundles: ['@deepseek-ai/dsh-web-app'] },
    env: {},
    scope: {},
    sleep: fakeSleep(waits),
    timing: TIMING,
  })
  assert.equal(result, false)
  // nothing is expected, so there is nothing to wait for and no warning to log
  assert.deepEqual(waits, [])
  assert.equal(warnings.length, 0)
})

test('the gate may publish a few ticks late, on the injected cadence', async () => {
  const warnings = []
  const waits = []
  const services = {}
  const scope = { [BILI_VERDICT_GLOBAL]: BILI_VERDICT_ACTIVE }
  const result = await resolveStandDown(hostCtx(services, warnings), {
    profileContext: { overlays: [{ id: 'bili-native', name: 'billion-context' }] },
    env: {},
    scope,
    sleep: fakeSleep(waits, (tick) => {
      if (tick === 2) services[BILI_GATE_SERVICE] = {}
    }),
    timing: TIMING,
  })
  assert.equal(result, true)
  // two 10 ms ticks: the service published during the second one
  assert.deepEqual(waits, [10, 10])
  assert.equal(warnings.length, 0)
})

test('the verdict gets its grace after the service appears', async () => {
  const warnings = []
  const waits = []
  const scope = {}
  const services = { [BILI_GATE_SERVICE]: {} }
  const result = await resolveStandDown(hostCtx(services, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    scope,
    sleep: fakeSleep(waits, (tick) => {
      if (tick === 2) scope[BILI_VERDICT_GLOBAL] = BILI_VERDICT_ACTIVE
    }),
    timing: TIMING,
  })
  assert.equal(result, true)
  assert.deepEqual(waits, [10, 10])
  assert.equal(warnings.length, 0)
})

test('a service that never appears keeps the engine, after 2000 ms, with one warning', async () => {
  const warnings = []
  const waits = []
  const result = await resolveStandDown(hostCtx({}, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    sleep: fakeSleep(waits),
  })
  assert.equal(result, false)
  // 2000 ms / 25 ms = 80 polls, and not one more
  assert.equal(waits.length, 80)
  assert.ok(waits.every((ms) => ms === 25))
  assert.deepEqual(warnings, [BILI_STAND_DOWN_WARNING])
})

test('a service that appears but never latches keeps the engine after 500 ms', async () => {
  const warnings = []
  const waits = []
  const services = { [BILI_GATE_SERVICE]: {} }
  const result = await resolveStandDown(hostCtx(services, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    scope: { [BILI_VERDICT_GLOBAL]: 'inactive' },
    sleep: fakeSleep(waits),
  })
  assert.equal(result, false)
  // 500 ms / 25 ms = 20 verdict polls
  assert.equal(waits.length, 20)
  assert.ok(waits.every((ms) => ms === 25))
  assert.deepEqual(warnings, [BILI_STAND_DOWN_WARNING])
})

test('a gate that appears after the 2000 ms window is not honoured', async () => {
  const warnings = []
  const waits = []
  const services = {}
  const result = await resolveStandDown(hostCtx(services, warnings), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    sleep: fakeSleep(waits, (tick) => {
      // gatePolls is ceil(30 / 10) = 3, so a fourth tick is past the window
      if (tick >= 4) services[BILI_GATE_SERVICE] = {}
    }),
    timing: TIMING,
  })
  assert.equal(result, false)
  assert.equal(waits.length, 3)
  assert.deepEqual(warnings, [BILI_STAND_DOWN_WARNING])
})

test('an attach-mode proxy alone is enough to make bili expected', async () => {
  const waits = []
  const services = { [BILI_GATE_SERVICE]: {} }
  const scope = { [BILI_VERDICT_GLOBAL]: BILI_VERDICT_ACTIVE }
  const result = await resolveStandDown(hostCtx(services, []), {
    profileContext: { startedBundles: [] },
    env: { BILLION_CONTEXT_PROXY: 'http://127.0.0.1:8787' },
    scope,
    sleep: fakeSleep(waits),
    timing: TIMING,
  })
  assert.equal(result, true)
  assert.deepEqual(waits, [])
})

test('a hostile context, logger or options still resolves false instead of throwing', async () => {
  const hostileGet = { get() { throw new Error('boom') } }
  let result = await resolveStandDown(hostileGet, {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    sleep: async () => {},
  })
  assert.equal(result, false)

  const throwingLogger = {
    get() {
      return undefined
    },
    logger: {
      warn() {
        throw new Error('log')
      },
    },
  }
  result = await resolveStandDown(throwingLogger, {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    sleep: async () => {},
  })
  assert.equal(result, false)

  // a getter that throws while the options object is being read
  const hostileOptions = new Proxy({}, {
    get() {
      throw new Error('options')
    },
  })
  result = await resolveStandDown(hostCtx(), hostileOptions)
  assert.equal(result, false)

  // no context and no options at all
  result = await resolveStandDown(undefined, { env: {}, sleep: async () => {} })
  assert.equal(result, false)
  result = await resolveStandDown(null, { env: {}, sleep: async () => {} })
  assert.equal(result, false)
})

test('an unparseable timing object falls back to the documented defaults', async () => {
  // The gate is already present and the verdict is active, so a fallback that
  // picked a broken cadence would still be observable as a non-zero wait.
  const waits = []
  const services = { [BILI_GATE_SERVICE]: {} }
  const result = await resolveStandDown(hostCtx(services, []), {
    profileContext: { startedBundles: ['billion-context'] },
    env: {},
    scope: { [BILI_VERDICT_GLOBAL]: BILI_VERDICT_ACTIVE },
    sleep: fakeSleep(waits),
    timing: { pollMs: -1, gateMs: 'wide', verdictMs: Number.NaN },
  })
  assert.equal(result, true)
  assert.deepEqual(waits, [])
})
