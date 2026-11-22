/**
 * IDE-free contract spec for the MotionWorks IEC row.
 *
 * MotionWorks IEC is not installed on this host. This spec proves the parts
 * that do not need it: the known v3 version line, the install probe and its
 * named locations, the NOT_INSTALLED envelope, the stubbed engine seam, the
 * synthetic help tree, and the honest wording of every not-runnable answer.
 * It imports the built package (`packages/mwi/lib`), so run it after a build:
 *
 *   node --import tsx --test test/mwi-idefree.spec.mjs
 */
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import {
  HELP_TREE_ENV,
  MWI_KNOWN_VERSIONS,
  MWI_LATEST_KNOWN_VERSION,
  MWI_VERSION_LINE,
  MwiEngineHost,
  MwiHostAdapter,
  ReadService,
  createStubEngine,
  mwiProbeStub,
  normalizeMwiVersion,
  probeHelpTree,
  probeMwiHost,
  readHelpTopic,
  readTools,
  searchHelpTopics,
  sessionTools,
  verifyTools,
  writeHelpTree,
} from '../packages/mwi/lib/index.js'
import { MwiError } from '../packages/mwi/lib/core/errors.js'
import { editTools } from '../packages/mwi/lib/tools/edit.js'

function callTool(tools, name, args = {}, cwd = process.cwd()) {
  const definition = tools.find(tool => tool.name === name)
  assert.ok(definition !== undefined, `tool ${name} is registered`)
  return definition.execute(args, { cwd })
}

function fakeRuntime(overrides = {}) {
  return {
    async status() { return { ide_running: true, is_project_open: true, active_project: 'C:/ws/.motionworks/stage/Line.mwt' } },
    ...overrides,
  }
}

function throwingRuntime() {
  return fakeRuntime({
    async status() { throw new MwiError('IDE_NOT_RUNNING', 'No IDE is running.', 'Start it with mw_ide_start.') },
  })
}

/** A workspace with the single staged project the read tools expect. */
function stagedWorkspace() {
  const root = mkdtempSync(join(tmpdir(), 'mwi-idefree-ws-'))
  const stage = join(root, '.motionworks', 'stage', 'Line')
  mkdirSync(stage, { recursive: true })
  writeFileSync(join(root, '.motionworks', 'stage', 'Line.mwt'), 'wrapper')
  writeFileSync(join(stage, 'PROJECT.TRE'), 'tree')
  return root
}

describe('MotionWorks IEC known versions', () => {
  it('names the real v3 line and never claims 1.19 as a product release', () => {
    assert.equal(MWI_KNOWN_VERSIONS[0], '3.0.3')
    assert.equal(MWI_KNOWN_VERSIONS.at(-1), '3.7.5')
    assert.equal(MWI_LATEST_KNOWN_VERSION, '3.7.5')
    assert.equal(MWI_VERSION_LINE, '3.0.3–3.7.5')
    assert.ok(!MWI_KNOWN_VERSIONS.includes('1.19'))
    assert.deepEqual(
      [...MWI_KNOWN_VERSIONS].sort((left, right) => left.localeCompare(right, 'en', { numeric: true })),
      [...MWI_KNOWN_VERSIONS],
    )
    assert.deepEqual(normalizeMwiVersion('Installed build 3.7.5.1'), { version: '3.7.5', build: '1', display: '3.7.5.1', known: true })
    assert.equal(normalizeMwiVersion('Ade 1.19'), undefined)
    assert.equal(normalizeMwiVersion('1.19.0')?.known, false)
  })
})

describe('host probe', () => {
  it('names every location it looked for on a non-Windows host', () => {
    const probe = probeMwiHost({ platform: 'linux', env: {}, exists: () => false, readDir: () => [], uninstallRegistry: () => [] })
    assert.equal(probe.installed, false)
    assert.equal(probe.versions.length, 0)
    assert.ok(probe.looked_for.length >= 4)
    for (const location of probe.looked_for) {
      assert.equal(typeof location.where, 'string')
      assert.equal(typeof location.found, 'boolean')
    }
    assert.match(String(probe.fix), /3\.0\.3/u)
    assert.match(probe.detail, /locations were inspected/u)
    const platform = probe.looked_for.find(location => location.kind === 'platform')
    assert.equal(platform?.found, false)
    assert.match(String(platform?.note), /Windows/u)
  })

  it('takes the installed version list from a declared environment list', () => {
    const probe = probeMwiHost({ platform: 'win32', env: { MWI_INSTALL_VERSIONS: '3.0.3.66, 3.7.5.1' }, exists: () => false, readDir: () => [], uninstallRegistry: () => [] })
    assert.equal(probe.installed, true)
    assert.deepEqual(probe.versions, ['3.0.3', '3.7.5'])
    assert.deepEqual(probe.displays, ['3.0.3.66', '3.7.5.1'])
  })
})

describe('not-runnable answers', () => {
  it('answers compile, live and profile as NOT_INSTALLED with a fix and the probe list', () => {
    const adapter = new MwiHostAdapter(mwiProbeStub())
    for (const capability of ['compile', 'live', 'profile']) {
      const envelope = adapter.notRunnable(capability)
      assert.ok(envelope !== undefined, `${capability} envelope exists`)
      assert.equal(envelope.data.status, 'not-runnable')
      assert.equal(envelope.data.code, 'NOT_INSTALLED')
      assert.equal(envelope.data.capability, capability)
      assert.match(String(envelope.data.fix), /MotionWorks IEC 3 Pro/u)
      if (capability === 'compile') assert.match(String(envelope.data.fix), /3\.0\.3/u)
      assert.ok(Array.isArray(envelope.data.looked_for) && envelope.data.looked_for.length > 0)
      assert.equal(envelope.coverage.complete, false)
      assert.doesNotMatch(String(envelope.summary), /compiled=true|live-verified|passed/u)
      assert.throws(() => adapter.requireRunnable(capability), error => error.code === 'NOT_INSTALLED')
    }
  })

  it('gives the stubbed engine seam a run without Python', async () => {
    const engine = createStubEngine({ installed_help: request => ({ ok: true, query: request.query }) })
    const host = new MwiEngineHost(engine, mwiProbeStub())
    assert.deepEqual(await host.run('installed_help', { query: 'timer' }), { ok: true, query: 'timer' })
  })
})

describe('synthetic help tree without the IDE', () => {
  it('writes a tree under the OS temp directory, then reads and searches it', () => {
    const root = mkdtempSync(join(tmpdir(), 'mwi-idefree-help-'))
    writeHelpTree(root, [
      { id: 'timer-on', title: 'TON timer', text: 'The TON timer accumulates elapsed time while IN is TRUE.', keywords: ['timer', 'TON'] },
      { id: 'counter', title: 'CTU counter', text: 'The CTU counter increments on a rising edge.', keywords: ['counter'] },
    ])
    assert.equal(probeHelpTree(root).found, true)
    assert.equal(probeHelpTree(join(tmpdir(), 'mwi-no-tree-here')).found, false)
    assert.equal(readHelpTopic(root, 'timer-on').title, 'TON timer')
    const search = searchHelpTopics(root, 'timer')
    assert.deepEqual(search.matches.map(match => match.id), ['timer-on'])
    assert.equal(search.scanned, 2)
  })

  it('exercises mw_help read-by-id and search through the stubbed engine', async () => {
    const root = stagedWorkspace()
    const helpRoot = join(root, 'extracted-help')
    writeHelpTree(helpRoot, [
      { id: 'timer-on', title: 'TON timer', text: 'The TON timer accumulates elapsed time while IN is TRUE.' },
    ])
    const service = new ReadService(createStubEngine(), undefined, helpRoot)
    const tools = readTools(() => service)
    const byId = await callTool(tools, 'mw_help', { id: 'timer-on' }, root)
    assert.equal(byId.summary, 'Read help topic timer-on.')
    assert.equal(byId.data.document.id, 'timer-on')
    assert.match(String(byId.data.document.text), /elapsed time/u)
    const searched = await callTool(tools, 'mw_help', { source: 'help', query: 'timer' }, root)
    assert.equal(searched.data.document.source, 'help')
    assert.deepEqual(searched.data.document.topics.map(topic => topic.id), ['timer-on'])
  })
})

describe('mw_ide_status reports installed versions or the probe list', () => {
  it('lists the probe-detected versions while the IDE is not running', async () => {
    const probe = { ...mwiProbeStub(), installed: true, versions: ['3.7.5'], displays: ['3.7.5.1'] }
    const result = await callTool(sessionTools(() => throwingRuntime(), () => probe), 'mw_ide_status')
    assert.equal(result.data.ide_running, false)
    assert.deepEqual(result.data.installed_versions, ['3.7.5.1'])
    assert.ok(Array.isArray(result.data.known_versions))
    assert.match(String(result.summary), /Installed MotionWorks IEC v3 version/u)
  })

  it('names the probe locations when nothing is installed', async () => {
    const result = await callTool(sessionTools(() => throwingRuntime(), () => mwiProbeStub()), 'mw_ide_status')
    assert.equal(result.data.code, 'NOT_INSTALLED')
    assert.match(String(result.summary), /No MotionWorks IEC 3 Pro installation was detected/u)
    const installation = result.data.installation
    assert.ok(Array.isArray(installation.looked_for) && installation.looked_for.length > 0)
  })
})

describe('tool surface stays at the documented names and count', () => {
  it('registers 24 tools with the documented names', () => {
    const names = [
      ...sessionTools(() => fakeRuntime(), () => mwiProbeStub()).map(tool => tool.name),
      ...readTools(() => new ReadService(createStubEngine())).map(tool => tool.name),
      ...verifyTools(() => fakeRuntime(), new MwiHostAdapter(mwiProbeStub())).map(tool => tool.name),
      ...editTools(() => fakeRuntime()).map(tool => tool.name),
    ]
    assert.equal(names.length, 24)
    for (const name of names) assert.match(name, /^mw_/u)
    assert.equal(new Set(names).size, 24)
    assert.deepEqual(names.slice(0, 7), ['mw_project_find', 'mw_ide_status', 'mw_project_stage', 'mw_project_open', 'mw_ide_start', 'mw_worksheet_open', 'mw_project_close'])
    assert.equal(HELP_TREE_ENV, 'MWI_HELP_TREE')
  })
})
