/**
 * Arya Automation Engineer: the preset shape, its persona, and the ledger fold.
 *
 * The projection is the part worth testing: it is what the Engineering tab shows,
 * and a mis-classified tool would claim a step happened that did not. The specs
 * drive it with the exact event shapes read out of a live session log
 * (`tool/call` carries the name; `tool/result` only carries the `callId`).
 */
import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import {
  ARYA_AUTOMATION_ENGINE_MODULE,
  ARYA_AUTOMATION_ENGINE_ROW_ID,
  ARYA_AUTOMATION_POLICY,
  ARYA_AUTOMATION_POLICY_ROW_ID,
  ARYA_AUTOMATION_PRESET_ID,
  ARYA_AUTOMATION_PRESET_NAME,
  ARYA_AUTOMATION_PRUNER,
  buildDefinition,
} from '../presets/arya-automation/definition.js'
import { automationPersona } from '../presets/arya-automation/files.js'
import { mountAryaAutomation } from '../presets/arya-automation/plugin.js'
import {
  ARYA_AUTOMATION_PROJECTION_KEY,
  applyEngineering,
  classifyTool,
  createAryaAutomationProjection,
} from '../presets/arya-automation/projection.js'
import { buildDefinition as buildAryaStandard } from '../presets/arya-standard/definition.js'

/**
 * The top-level row ids both presets mount, in the shipped order: the DSH
 * `standard` preset's row list from
 * `AryaCode/packages/bundle/web-app/presets/standard.patch.yml`, with this
 * package's own `arya-review-skills` row after `tool-skill`. Copied here at
 * authoring time on purpose: the baseline YAML lives in the harness repository,
 * so this spec does not read it at test time.
 */
const FULL_DSH_ROW_IDS = [
  'persona',
  'agent-instructions',
  'time-context',
  'tool-bash',
  'tool-pwsh',
  'tool-fs',
  'tool-fs-search',
  'tool-jobs',
  'tool-schedule',
  'skill-filesystem',
  'tool-skill',
  'arya-review-skills',
  'command-goal',
  'tool-goal',
  'planning',
  'compaction',
  'delegation',
  'tool-ask-user',
  'tool-todo',
  'tool-web',
  'present',
  'tool-plugin-manager',
  'tool-plugin-market',
]

/** The delegation group's children, in the shipped order. */
const DELEGATION_ROW_IDS = [
  'tool-subagent-control',
  'tool-subagent',
  'tool-subagent-fork',
  'workflow-ptc',
  'tool-workflow',
]

/**
 * One row by id, with a message that names the preset.
 * @param {{ plugins: object[] }} definition the built definition.
 * @param {string} id the row id to find.
 * @returns {object} the row.
 */
function rowOf(definition, id) {
  const row = definition.plugins.find((entry) => entry.id === id)
  assert.ok(row !== undefined, `${definition.id} has no ${id} row`)
  return row
}

/**
 * One child of the `compaction` group by id.
 * @param {{ plugins: object[] }} definition the built definition.
 * @param {string} id the child row id to find.
 * @returns {object} the row.
 */
function compactionRow(definition, id) {
  const row = rowOf(definition, 'compaction').config.find((entry) => entry.id === id)
  assert.ok(row !== undefined, `${definition.id} has no ${id} compaction row`)
  return row
}

test('the preset carries the identity the picker shows', () => {
  const definition = buildDefinition()
  assert.equal(definition.id, 'arya-automation')
  assert.equal(definition.name, 'Arya Automation Engineer')
  assert.equal(ARYA_AUTOMATION_PRESET_ID, 'arya-automation')
  assert.equal(ARYA_AUTOMATION_PRESET_NAME, 'Arya Automation Engineer')
  assert.ok(definition.description.length > 40)
  // after Arya Claude (5), so no two presets share a sort position
  assert.equal(definition.order, 6)
  // and beside the shipped presets: standard 1, Arya Standard 2, minimal 3
  assert.equal(buildAryaStandard().order, 2)
})

test('the row list is Arya Standard\'s except the persona and the compaction knobs', () => {
  const automation = buildDefinition()
  const standard = buildAryaStandard()
  assert.deepEqual(automation.plugins.map((row) => row.id), standard.plugins.map((row) => row.id))

  const persona = automation.plugins.find((row) => row.id === 'persona').config
  assert.ok(persona.prefix.startsWith('You are an automation engineer'))
  assert.equal(persona.complete, false)
  assert.equal(persona.includeRuntimeContext, true)

  const group = automation.plugins.find((row) => row.id === 'compaction')
  assert.deepEqual(group.isolate, { compaction: true, toolResultPruner: true, aryaStandardPolicy: true })
  const policy = group.config.find((row) => row.id === ARYA_AUTOMATION_POLICY_ROW_ID)
  assert.equal(policy.name, '@aryacode/dsh-engineering/arya-standard-policy')
  for (const [key, value] of Object.entries(ARYA_AUTOMATION_POLICY)) {
    assert.equal(policy.config[key], value, `${key} is the engineering default`)
  }
  const engine = group.config.find((row) => row.id === ARYA_AUTOMATION_ENGINE_ROW_ID)
  assert.equal(engine.name, ARYA_AUTOMATION_ENGINE_MODULE)
  const pruner = group.config.find((row) => row.id === 'tool-result-pruner')
  assert.deepEqual(pruner.config, { ...ARYA_AUTOMATION_PRUNER })
  // with no stand-down, the manual command stays available
  assert.ok(group.config.some((row) => row.id === 'command-compact'))
  assert.equal(compactionRow(automation, 'command-compact').disabled, undefined)
})

test('the stand-down disables the compaction engine and /compact, and nothing else', () => {
  const cases = [
    { build: buildAryaStandard, engine: 'arya-standard-compaction', policy: 'arya-standard-policy' },
    { build: buildDefinition, engine: ARYA_AUTOMATION_ENGINE_ROW_ID, policy: ARYA_AUTOMATION_POLICY_ROW_ID },
  ]
  for (const { build, engine, policy } of cases) {
    const stoodDown = build(undefined, { standDownCompaction: true })
    const live = build(undefined, {})

    // only the two compressors change state; the row list itself is identical
    assert.deepEqual(stoodDown.plugins.map((row) => row.id), live.plugins.map((row) => row.id), stoodDown.id)
    assert.equal(compactionRow(stoodDown, engine).disabled, true, `${stoodDown.id}: the engine stands down`)
    assert.equal(compactionRow(stoodDown, 'command-compact').disabled, true, `${stoodDown.id}: /compact stands down`)
    assert.equal(compactionRow(live, engine).disabled, undefined, `${live.id}: the engine runs without bili`)
    assert.equal(compactionRow(live, 'command-compact').disabled, undefined, `${live.id}: /compact runs without bili`)

    // the policy row and the pruner are not compressors and stay mounted
    assert.equal(compactionRow(stoodDown, policy).disabled, undefined, `${stoodDown.id}: the policy stays`)
    assert.equal(compactionRow(stoodDown, 'tool-result-pruner').disabled, undefined, `${stoodDown.id}: the pruner stays`)
    assert.deepEqual(compactionRow(stoodDown, 'tool-result-pruner'), compactionRow(live, 'tool-result-pruner'))
    assert.deepEqual(compactionRow(stoodDown, policy), compactionRow(live, policy))

    // and the engine keeps its module, id and config while it stands down
    const engineRow = compactionRow(stoodDown, engine)
    assert.equal(engineRow.name, compactionRow(live, engine).name)
    assert.deepEqual(engineRow.config, compactionRow(live, engine).config)
  }
})

test('only the boolean true stands the engine down', () => {
  for (const build of [buildAryaStandard, buildDefinition]) {
    for (const value of [false, 0, 1, 'true', 'yes', null, undefined]) {
      const definition = build(undefined, { standDownCompaction: value })
      assert.equal(compactionRow(definition, definition.id === 'arya-automation'
        ? ARYA_AUTOMATION_ENGINE_ROW_ID
        : 'arya-standard-compaction').disabled, undefined, `${definition.id}: ${String(value)} is not a stand-down`)
    }
  }
})

/**
 * Remove every billion-context variable for one test, then put them back.
 * @param {() => Promise<void> | void} run the test body.
 * @returns {Promise<void>} resolves once the body and the restore finish.
 */
async function withoutBiliEnv(run) {
  const names = ['BILLION_CONTEXT_PROXY', 'BILLION_CONTEXT_ATTACH', 'BILLION_CONTEXT_PLUGIN', 'BILI_NATIVE_DSH',
    'BILI_PROVIDER_REWRITES']
  const saved = new Map()
  for (const name of names) {
    saved.set(name, process.env[name])
    delete process.env[name]
  }
  try {
    await run()
  } finally {
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }
}

/**
 * A cordis-shaped context for the mount: services by name, one no-op effect, and
 * a warning sink.
 * @param {Record<string, unknown>} services the services `ctx.get()` returns.
 * @param {string[]} warnings receives every `logger.warn` message.
 * @returns {object} the fake context.
 */
function mountContext(services, warnings) {
  return {
    get(name) {
      return services[name]
    },
    effect() {},
    logger: {
      info() {},
      warn(message) {
        warnings.push(message)
      },
    },
  }
}

test('the mount stands the preset down only when billion-context\'s gate is active', async () => {
  await withoutBiliEnv(async () => {
    const verdict = '__BILI_DSH_COMPACTION_VERDICT__'
    const hadVerdict = Object.prototype.hasOwnProperty.call(globalThis, verdict)
    const previous = globalThis[verdict]
    try {
      // bili is not in the profile: the engine runs and nothing waits
      const live = []
      await mountAryaAutomation(mountContext({
        agentPresets: {
          register: async (definition) => {
            live.push(definition)
            return () => {}
          },
        },
        profileContext: { startedBundles: ['@deepseek-ai/dsh-web-app'] },
      }, []), {})
      assert.equal(live.length, 1, 'the preset registered')
      assert.equal(live[0].id, 'arya-automation')
      assert.equal(compactionRow(live[0], ARYA_AUTOMATION_ENGINE_ROW_ID).disabled, undefined)
      assert.equal(compactionRow(live[0], 'command-compact').disabled, undefined)

      // bili owns the lane: the definition arrives with both compressors disabled
      const stoodDown = []
      const services = {
        agentPresets: {
          register: async (definition) => {
            stoodDown.push(definition)
            return () => {}
          },
        },
        profileContext: { startedBundles: ['@deepseek-ai/dsh-web-app', 'billion-context'] },
        biliBasicCompactionPolicy: {},
      }
      globalThis[verdict] = 'active'
      await mountAryaAutomation(mountContext(services, []), {})
      assert.equal(stoodDown.length, 1, 'the preset registered')
      assert.equal(compactionRow(stoodDown[0], ARYA_AUTOMATION_ENGINE_ROW_ID).disabled, true)
      assert.equal(compactionRow(stoodDown[0], 'command-compact').disabled, true)
      assert.equal(compactionRow(stoodDown[0], ARYA_AUTOMATION_POLICY_ROW_ID).disabled, undefined)
      assert.equal(compactionRow(stoodDown[0], 'tool-result-pruner').disabled, undefined)
    } finally {
      if (hadVerdict) globalThis[verdict] = previous
      else delete globalThis[verdict]
    }
  })
})

test('both presets mount the full DSH standard row list, in the shipped order', () => {
  assert.equal(new Set(FULL_DSH_ROW_IDS).size, FULL_DSH_ROW_IDS.length, 'the baseline list has no duplicate id')
  for (const definition of [buildAryaStandard(), buildDefinition()]) {
    assert.deepEqual(definition.plugins.map((row) => row.id), FULL_DSH_ROW_IDS, definition.id)
    assert.equal(definition.plugins.length, FULL_DSH_ROW_IDS.length, definition.id)
  }
})

test('every row is a named plugin or group, and the shell switch picks one', () => {
  const windows = process.platform === 'win32'
  for (const definition of [buildAryaStandard(), buildDefinition()]) {
    assert.equal(new Set(definition.plugins.map((row) => row.id)).size, definition.plugins.length,
      `${definition.id} repeats a row id`)
    for (const row of definition.plugins) {
      assert.equal(typeof row.name, 'string', `${definition.id}/${row.id} has no module name`)
      assert.ok(row.name.length > 0, `${definition.id}/${row.id} has an empty module name`)
    }
    assert.equal(rowOf(definition, 'tool-bash').disabled, windows, `${definition.id}: tool-bash switch`)
    assert.equal(rowOf(definition, 'tool-pwsh').disabled, !windows, `${definition.id}: tool-pwsh switch`)
  }
})

test('the delegation group carries the shipped children and providers', () => {
  for (const definition of [buildAryaStandard(), buildDefinition()]) {
    const group = rowOf(definition, 'delegation')
    assert.equal(group.name, 'cordis:group')
    assert.equal(group.group, true)
    assert.deepEqual(group.isolate, { workflowEngine: true })
    assert.deepEqual(group.config.map((row) => row.id), DELEGATION_ROW_IDS)

    assert.deepEqual(group.config.find((row) => row.id === 'tool-subagent').config,
      { provider: 'spawn', toolName: 'subagent', modelSelection: true, modelDiscovery: true })
    assert.deepEqual(group.config.find((row) => row.id === 'tool-subagent-fork').config,
      { provider: 'fork', toolName: 'subagent_fork' })
    assert.deepEqual(group.config.find((row) => row.id === 'workflow-ptc').config, { provider: 'spawn' })
    assert.equal(group.config.find((row) => row.id === 'tool-workflow').name, '@deepseek-ai/dsh-tool-workflow')
    assert.equal(group.config.find((row) => row.id === 'tool-subagent-control').name,
      '@deepseek-ai/dsh-tool-subagent-control')
  }
})

test('the Host plugin rows follow the profile context', () => {
  for (const build of [buildAryaStandard, buildDefinition]) {
    const withoutContext = build(undefined, {})
    const withContext = build(undefined, { profileContext: true })

    const manager = rowOf(withoutContext, 'tool-plugin-manager')
    assert.equal(manager.name, '@deepseek-ai/dsh-plugin-manager/tools', withoutContext.id)
    assert.equal(manager.disabled, true, `${withoutContext.id}: no profile service disables the manager`)
    assert.equal(rowOf(withContext, 'tool-plugin-manager').disabled, false,
      `${withContext.id}: a profile service enables the manager`)

    for (const definition of [withoutContext, withContext]) {
      const market = rowOf(definition, 'tool-plugin-market')
      assert.equal(market.name, '@deepseek-ai/dsh-plugin-market/tools', definition.id)
      assert.equal(market.disabled, true, `${definition.id}: the market stays disabled`)
    }
  }
})

test('the persona states the loop, the gates and the honesty rules', () => {
  const persona = automationPersona()
  for (const phrase of ['The loop is a contract', '# Gates', 'Identity discipline', '# Honesty',
    'Read before writing', 'Act in a copy', 'Verify with the vendor engine', 'Hand off what is human',
    'Never write to a running controller', 'never invent an instruction']) {
    assert.ok(persona.toLowerCase().includes(phrase.toLowerCase()), `missing: ${phrase}`)
  }
  for (const forbidden of ['apply_patch', '${', 'You are Codex']) {
    assert.equal(persona.includes(forbidden), false, `persona contains ${forbidden}`)
  }
  assert.ok(persona.includes('studio_sdk_status'), 'names the probes')
})

test('tool names classify into the five steps', () => {
  assert.equal(classifyTool('open_project'), 'read')
  assert.equal(classifyTool('run_checks'), 'check')
  assert.equal(classifyTool('verify_offline_l5x'), 'verify')
  assert.equal(classifyTool('build_acd_from_draft'), 'verify')
  assert.equal(classifyTool('compose_rung'), 'write')
  assert.equal(classifyTool('download_project'), 'live')
  assert.equal(classifyTool('write_live_tag'), 'live')
  assert.equal(classifyTool('todo_write'), null)
  assert.equal(classifyTool(''), null)
  assert.equal(classifyTool(undefined), null)
})

/** A fresh projection state. */
function initialState() {
  return createAryaAutomationProjection().init()
}

/** One engineering call event. */
function call(callId, name, args = '{}', time = 1) {
  return { type: 'tool/call', time, data: { turn: 1, step: 1, callId, name, arguments: args } }
}

/** The matching result event. */
function result(callId, isError = false, time = 2) {
  return { type: 'tool/result', time, data: { turn: 1, step: 1, message: { role: 'tool', toolCallId: callId, isError, content: [] } } }
}

test('a read, a check and their results fill the ledger', () => {
  const projection = createAryaAutomationProjection()
  let state = projection.init()
  state = applyEngineering(state, call('c1', 'open_project', '{"path":"C:/P/Line.L5X"}', 10))
  state = applyEngineering(state, result('c1', false, 11))
  state = applyEngineering(state, call('c2', 'run_checks', '{}', 12))
  state = applyEngineering(state, result('c2', false, 13))
  state = applyEngineering(state, call('c3', 'compose_rung', '{"project_id":"proj-1"}', 14))
  state = applyEngineering(state, result('c3', false, 15))

  const view = projection.wire.view(state)
  const stage = Object.fromEntries(view.stages.map((entry) => [entry.id, entry]))
  assert.equal(stage.read.done, true)
  assert.equal(stage.check.done, true)
  assert.equal(stage.write.done, true)
  assert.equal(stage.verify.done, false, 'a draft is not a verification')
  assert.equal(view.failures, 0)
  assert.equal(view.artifacts[0].value, 'proj-1')
  assert.ok(view.artifacts.some((artifact) => artifact.value === 'C:/P/Line.L5X'))
  assert.deepEqual(view.checks.map((check) => check.name), ['run_checks'])
})

test('a failed check stays red until a later attempt replaces it', () => {
  const projection = createAryaAutomationProjection()
  let state = projection.init()
  state = applyEngineering(state, call('c1', 'run_checks', '{}', 10))
  state = applyEngineering(state, result('c1', true, 11))
  state = applyEngineering(state, call('c2', 'verify_offline_l5x', '{}', 12))
  state = applyEngineering(state, result('c2', false, 13))

  let view = projection.wire.view(state)
  assert.equal(view.failures, 1)
  assert.equal(view.checks.find((check) => check.name === 'run_checks').ok, false)
  assert.equal(view.checks.find((check) => check.name === 'verify_offline_l5x').ok, true)
  assert.equal(view.stages.find((stage) => stage.id === 'verify').done, true)

  // the retry passes: the failure count stays (it happened), the row flips
  state = applyEngineering(state, call('c3', 'run_checks', '{}', 20))
  state = applyEngineering(state, result('c3', false, 21))
  view = projection.wire.view(state)
  assert.equal(view.checks.find((check) => check.name === 'run_checks').ok, true)
})

test('non-engineering tools and results are ignored', () => {
  const projection = createAryaAutomationProjection()
  let state = projection.init()
  state = applyEngineering(state, call('c1', 'todo_write', '{"todos":[]}', 10))
  state = applyEngineering(state, result('c1', false, 11))
  state = applyEngineering(state, call('c2', 'pwsh', '{"command":"dir"}', 12))
  state = applyEngineering(state, result('c2', false, 13))
  const view = projection.wire.view(state)
  assert.equal(view.hasActivity, false)
  assert.deepEqual(view.artifacts, [])
  assert.deepEqual(view.checks, [])
})

test('approvals and live writes are counted, not judged', () => {
  const projection = createAryaAutomationProjection()
  let state = projection.init()
  state = applyEngineering(state, { type: 'approval/policy', data: { policy: 'ask' }, time: 1 })
  state = applyEngineering(state, { type: 'approval/asked', data: {}, time: 2 })
  state = applyEngineering(state, { type: 'approval/decided', data: {}, time: 3 })
  state = applyEngineering(state, call('c1', 'write_live_tag', '{"ip_address":"192.168.1.10"}', 4))
  state = applyEngineering(state, result('c1', false, 5))
  state = applyEngineering(state, call('c2', 'read_live_tags', '{}', 6))
  state = applyEngineering(state, result('c2', false, 7))
  const view = projection.wire.view(state)
  assert.deepEqual(view.gates, { asked: 1, decided: 1, policy: 'ask' })
  assert.deepEqual(view.live, { reads: 1, writes: 1 })
  assert.equal(view.stages.find((stage) => stage.id === 'live').done, true)
})

test('the projection registers under its own key and version', () => {
  const projection = createAryaAutomationProjection()
  assert.equal(projection.key, 'aryaAutomation')
  assert.equal(projection.key, ARYA_AUTOMATION_PROJECTION_KEY)
  assert.equal(projection.stateVersion, 1)
  assert.equal(typeof projection.init, 'function')
  assert.deepEqual(projection.wire.view(initialState()), {
    hasActivity: false,
    stages: projection.wire.view(initialState()).stages,
    artifacts: [],
    checks: [],
    gates: { asked: 0, decided: 0, policy: '' },
    live: { reads: 0, writes: 0 },
    last: null,
    failures: 0,
  })
})
