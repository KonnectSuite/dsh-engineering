/**
 * Conditional tool admission.
 *
 * A row still registers every one of its tools, but each registration carries a
 * `when` condition. The host evaluates it once per model step: false keeps the
 * tool out of the request, so a fresh session pays for the skill catalog only.
 * The switch that reveals a row is the load of a skill that names one of its
 * tools — the same pairing the README already promises ("the tool schemas and
 * the method arrive together").
 *
 * These tests hold the two halves together: the table in
 * `entries/activation.js` against the prose in every SKILL.md, and the gate
 * against the events that are supposed to move it.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMPONENTS, activated, admits, apply as mountRow, mount } from '../entries/activation.js'

const ROOT = fileURLToPath(new URL('../', import.meta.url))
const catalog = JSON.parse(readFileSync(join(ROOT, 'components.json'), 'utf8'))
const reference = JSON.parse(readFileSync(join(ROOT, 'docs', 'reference', 'tools.json'), 'utf8'))

/** Every registered tool name and the row that owns it, by prefix. */
function ownership() {
  const names = new Set(reference.tools)
  for (const name of optixNames()) names.add(name)
  const owner = new Map()
  for (const name of names) {
    const row = Object.entries(COMPONENTS).find(([, spec]) => spec.prefixes.some(prefix => name.startsWith(prefix)))
    owner.set(name, row === undefined ? undefined : row[0])
  }
  return owner
}

/** The Optix tools, which are not generated into the reference. */
function optixNames() {
  const built = readFileSync(join(ROOT, 'packages', 'optix', 'lib', 'index.js'), 'utf8')
  const names = new Set([...built.matchAll(/name: ['"]?(optix_[a-z0-9_]+)['"]?/gu)].map(match => match[1]))
  names.add('optix_netlogic')
  return names
}

/** The skill bodies the rows register, as `{ skill, component, file }`. */
function skills() {
  return catalog.components
    .filter(component => component.skill !== null && component.skill !== undefined)
    .map(component => ({ skill: component.skill.name, component: component.id, file: join(ROOT, component.skill.file) }))
}

const TOKEN = /\b[a-z][a-z0-9]*_[a-z0-9_]+\b/gu

test('the table matches the prose: a skill reveals a row exactly when it names one of its tools', () => {
  const owner = ownership()
  const expected = new Map(Object.keys(COMPONENTS).map(id => [id, new Set()]))
  for (const { skill, file } of skills()) {
    const body = readFileSync(file, 'utf8')
    const named = new Set([...body.matchAll(TOKEN)].map(match => match[0]))
    const rows = new Set()
    for (const name of named) {
      const row = owner.get(name)
      if (row !== undefined) rows.add(row)
    }
    for (const row of rows) expected.get(row).add(skill)
  }
  for (const [id, spec] of Object.entries(COMPONENTS)) {
    assert.deepEqual(
      [...spec.skills].sort(),
      [...expected.get(id)].sort(),
      `${id}: entries/activation.js and the SKILL.md prose disagree about the revealers`,
    )
  }
})

test('every tool a row registers carries a gate, and the gate is closed for a fresh agent', async () => {
  const registrations = await mountAll()
  const owner = ownership()
  const rows = new Set()
  for (const { name, options } of registrations) {
    const row = owner.get(name)
    assert.ok(row !== undefined, `${name}: registered but owned by no component, so no gate can find it`)
    rows.add(row)
    assert.equal(typeof options?.when, 'function', `${name}: registered without a when condition`)
    assert.equal(await options.when({ agent: freshAgent() }), false, `${name}: declared to an agent that loaded no skill`)
    assert.equal(await options.when({}), true, `${name}: must fail open when the host passes no agent`)
  }
  assert.equal(rows.size, 8, `only ${rows.size} rows registered gated tools`)
  assert.ok(registrations.length >= 190, `only ${registrations.length} registrations were mounted`)
})

test('a skill load reveals its own rows and nothing else', async () => {
  const h = harness()
  let other
  mount(h.ctx, 'l5x', {
    name: 'probe-l5x',
    apply(child) {
      child.tools.register({ name: 'l5x_probe' })
      other = activated('ftview').when
    },
  })
  const when = h.registered.get('l5x_probe').options.when
  assert.equal(await when({ agent: freshAgent() }), false)
  const agent = freshAgent()
  h.emit('tools/result', { name: 'skill', arguments: { name: 'rockwell-l5x' }, agent }, { isError: false })
  assert.equal(await when({ agent }), true, 'the l5x row did not reveal')
  assert.equal(await other({ agent }), false, 'loading rockwell-l5x revealed FactoryTalk View')
})

test('a failed skill call reveals nothing', async () => {
  const { ctx, emit } = harness()
  let when
  mountRow(ctx, 'resources', { apply(child) { child.tools.register({ name: 'engineering_probe' }); when = activated('engineering-resources').when } })
  const agent = freshAgent()
  emit('tools/result', { name: 'skill', arguments: { name: 'engineering-standards' }, agent }, { isError: true })
  assert.equal(await when({ agent }), false)
})

test('the /name gesture reveals through the durable session event', async () => {
  const { ctx, emit } = harness()
  let when
  mountRow(ctx, 'migration', { apply(child) { child.tools.register({ name: 'migration_probe' }); when = activated('migration').when } })
  const agent = freshAgent()
  emit('session/event', agent.session, {
    type: 'user/message',
    data: { source: { kind: 'skill-invocation', name: 'legacy-to-logix-migration', form: 'instructions' } },
  })
  assert.equal(await when({ agent }), true)
})

test('resume recovers from the request header the host already declared', async () => {
  const when = activated('l5x').when
  const resumed = { session: { id: 's-resumed', requestHeader: () => ({ tools: [{ name: 'l5x_open_project' }] }) } }
  assert.equal(await when({ agent: resumed }), true)
  const unrelated = { session: { id: 's-other', requestHeader: () => ({ tools: [{ name: 'run_code' }] }) } }
  assert.equal(await when({ agent: unrelated }), false)
})

test('a disposed agent loses its marks', async () => {
  const { ctx, emit } = harness()
  let when
  mountRow(ctx, 'slc', { apply(child) { child.tools.register({ name: 'slc500_probe' }); when = activated('slc').when } })
  const agent = freshAgent()
  emit('tools/result', { name: 'skill', arguments: { name: 'rslogix-500' }, agent }, { isError: false })
  assert.equal(await when({ agent }), true)
  emit('agent/disposed', { agent })
  assert.equal(await when({ agent }), false)
})

test('an unknown row is always visible, so a typo cannot hide a tool', () => {
  assert.equal(admits('no-such-row', freshAgent()), true)
  assert.throws(() => activated('no-such-row'), /unknown component/u)
})

test('the idle catalog stays inside the recorded budget', () => {
  const budget = catalog.contextBudget
  assert.ok(Number.isInteger(budget.defaultOnCatalogCharacters) && budget.defaultOnCatalogCharacters > 0)
  const mounted = new Set(catalog.components.filter(component => component.default === 'on').map(component => component.id))
  let total = 0
  for (const { skill, component, file } of skills()) {
    if (!mounted.has(component)) continue
    total += skill.length + catalogDescription(file, skill).length + 10
  }
  assert.ok(total <= budget.defaultOnCatalogCharacters, `${total} catalog characters exceed the recorded ${budget.defaultOnCatalogCharacters}`)
})

/** Rows whose registration description is a constant, not front matter. */
const CONSTANTS = {
  'engineering-standards': 'packages/resources/src/skill.ts',
  'factorytalk-optix': 'entries/optix-skill.js',
}

/** The description the catalog shows for a row: front matter, or the row's constant. */
function catalogDescription(file, skill) {
  const body = readFileSync(file, 'utf8')
  const front = body.match(/^---\r?\n([\s\S]*?)\r?\n---/u)
  if (front !== null) {
    const line = front[1].match(/^description:\s*([\s\S]*?)(?=\r?\n[a-z]+:|\s*$)/mu)
    if (line !== null) return line[1].trim().replace(/\s+/gu, ' ')
  }
  const constant = CONSTANTS[skill]
  assert.ok(typeof constant === 'string', `${skill}: no front matter and no recorded description source`)
  const source = readFileSync(join(ROOT, constant), 'utf8')
  const match = source.match(/description:\s*'([^']+)'/u)
  assert.ok(match !== null, `${skill}: no description in ${constant}`)
  return match[1]
}

/** A stub root that records listeners, executes plugins and keeps registrations. */
function harness() {
  const listeners = new Map()
  const registered = new Map()
  const services = new Map()
  // The Optix preview tools refuse to register without a durable attachment sink.
  services.set('attachments', { put: async () => 'attachment', get: async () => undefined })
  const reply = () => {}
  const ctx = {
    root: undefined,
    tools: { register(definition, options) { registered.set(definition.name, { definition, options }) } },
    get(name) { return name === 'skills' ? { register() {} } : services.get(name) },
    provide(name, value) { services.set(name, value) },
    effect(callback) { const dispose = callback(); return typeof dispose === 'function' ? dispose : () => {} },
    on(event, listener) {
      const list = listeners.get(event) ?? []
      list.push(listener)
      listeners.set(event, list)
      return () => {}
    },
    emit() {},
    inject(_names, callback) { callback(ctx) },
    plugin(part, config) {
      if (typeof part === 'function') return part(ctx, config)
      if (part !== null && typeof part === 'object' && typeof part.apply === 'function') return part.apply(ctx, config)
      return undefined
    },
    logger: { debug() {}, info() {}, warn() {}, error: reply },
    fs: {
      resolve(target) { return { targetKey: String(target), displayPath: String(target) } },
      stat: async () => ({ size: 0 }),
      readBytes: async () => new Uint8Array(),
      readText: async () => '',
      writeText: async () => undefined,
      exists: async () => false,
      listDir: async () => [],
      readdir: async () => [],
    },
  }
  ctx.root = ctx
  return {
    ctx,
    registered,
    emit(event, ...args) {
      for (const listener of listeners.get(event) ?? []) listener(...args)
    },
  }
}

function freshAgent() {
  return { session: { id: `s-${Math.random().toString(36).slice(2)}`, requestHeader: () => undefined } }
}

/** The switches a stub mount needs, so every optional part of a row is exercised. */
const MOUNT_CONFIG = {
  l5x: { editing: true, studio: true, live: true, allowWrites: true },
  ftview: { edit: true, studio: true },
  mwi: { edit: true },
  optix: { bridgeUrls: ['http://127.0.0.1:5599'], preview: true, allowInvoke: true, allowWrites: true, allowDestructive: true },
}

/** Mount every entry and collect each registration with its options. */
async function mountAll() {
  const collected = []
  const { ctx } = harness()
  ctx.tools = { register(definition, options) { collected.push({ name: definition.name, options }) } }
  const entries = ['l5x', 'ftview', 'mwi', 'resources', 'migration', 'plc5', 'slc', 'optix']
  for (const entry of entries) {
    const module = await import(`../entries/${entry}.js`)
    module.apply(ctx, MOUNT_CONFIG[entry] ?? {})
  }
  return collected
}