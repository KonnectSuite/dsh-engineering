/**
 * The honest host answer: the known v3 version line, the install probe, the
 * NOT_INSTALLED envelope, the stubbable engine seam and the synthetic help tree.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { MwiError } from '../src/core/errors.ts'
import {
  MWI_KNOWN_VERSIONS,
  MWI_LATEST_KNOWN_VERSION,
  MWI_VERSION_LINE,
  MwiEngineHost,
  MwiHostAdapter,
  createStubEngine,
  mwiProbeStub,
  normalizeMwiVersion,
  probeMwiHost,
} from '../src/core/host.ts'
import { HELP_TREE_ENV, readHelpTopic, searchHelpTopics, probeHelpTree, writeHelpTree } from '../src/read/help-tree.ts'

describe('known version line', () => {
  it('lists the real v3 releases, oldest first, ending at 3.7.5', () => {
    expect(MWI_KNOWN_VERSIONS[0]).toBe('3.0.3')
    expect(MWI_KNOWN_VERSIONS.at(-1)).toBe('3.7.5')
    expect(MWI_LATEST_KNOWN_VERSION).toBe('3.7.5')
    expect(MWI_VERSION_LINE).toBe('3.0.3–3.7.5')
    expect([...MWI_KNOWN_VERSIONS].sort((left, right) => left.localeCompare(right, 'en', { numeric: true }))).toEqual([...MWI_KNOWN_VERSIONS])
    expect([...MWI_KNOWN_VERSIONS]).not.toContain('1.19')
  })

  it('normalises three- and four-part versions without inventing a release', () => {
    expect(normalizeMwiVersion('MotionWorks IEC 3 Pro version 3.0.3.66')).toEqual({ version: '3.0.3', build: '66', display: '3.0.3.66', known: true })
    expect(normalizeMwiVersion('Installed build 3.7.5.1')).toEqual({ version: '3.7.5', build: '1', display: '3.7.5.1', known: true })
    expect(normalizeMwiVersion('Ade 1.19')).toBeUndefined()
    expect(normalizeMwiVersion('1.19.0')?.known).toBe(false)
    expect(normalizeMwiVersion('no version here')).toBeUndefined()
  })
})

describe('installation probe', () => {
  it('reports every location it looked for on a non-Windows host', () => {
    const probe = probeMwiHost({ platform: 'linux', env: {}, exists: () => false, readDir: () => [], uninstallRegistry: () => [] })
    expect(probe.installed).toBe(false)
    expect(probe.versions).toEqual([])
    expect(probe.looked_for.length).toBeGreaterThan(3)
    for (const location of probe.looked_for) expect(typeof location.where).toBe('string')
    const platform = probe.looked_for.find(location => location.kind === 'platform')
    expect(platform?.found).toBe(false)
    expect(platform?.note).toContain('Windows')
    expect(probe.fix).toContain('3.0.3')
    expect(probe.detail).toContain('locations were inspected')
  })

  it('reads deliberately declared versions and installed builds', () => {
    const probe = probeMwiHost({
      platform: 'win32',
      env: { MWI_INSTALL_VERSIONS: '3.0.3.66, 3.7.5.1' },
      exists: () => false,
      readDir: () => [],
      uninstallRegistry: () => [],
    })
    expect(probe.installed).toBe(true)
    expect(probe.versions).toEqual(['3.0.3', '3.7.5'])
    expect(probe.displays).toEqual(['3.0.3.66', '3.7.5.1'])
    expect(probe.detail).toContain('Detected')
  })

  it('takes versions from the machine uninstall database', () => {
    const probe = probeMwiHost({
      platform: 'win32',
      env: {},
      exists: () => false,
      readDir: () => [],
      uninstallRegistry: () => [{ displayName: 'MotionWorks IEC 3 Pro', displayVersion: '3.7.5.1', installLocation: 'C:\\Yaskawa\\MotionWorks IEC 3 Pro' }],
    })
    expect(probe.installed).toBe(true)
    expect(probe.displays).toEqual(['3.7.5.1'])
    expect(probe.install_root).toBe('C:\\Yaskawa\\MotionWorks IEC 3 Pro')
    const registry = probe.looked_for.find(location => location.kind === 'registry')
    expect(registry?.found).toBe(true)
  })
})

describe('not-installed answers', () => {
  it('wraps compile, live and profile as not runnable with a fix', () => {
    const adapter = new MwiHostAdapter(mwiProbeStub())
    for (const capability of ['compile', 'live', 'profile'] as const) {
      const answer = adapter.capability(capability)
      expect(answer.runnable).toBe(false)
      expect(answer.code).toBe('NOT_INSTALLED')
      expect(answer.fix.length).toBeGreaterThan(40)
      expect(answer.message).toContain('inspected')
      expect(answer.known_versions).toContain('3.7.5')
      const envelope = adapter.notRunnable(capability)
      expect(envelope?.data).toMatchObject({ status: 'not-runnable', code: 'NOT_INSTALLED', capability })
      expect(envelope?.summary).toContain('is not runnable on this host')
      expect(envelope?.summary).not.toContain('passed')
      expect(envelope?.coverage?.complete).toBe(false)
      expect(() => adapter.requireRunnable(capability)).toThrow(MwiError)
    }
  })

  it('stays silent when the probe found the IDE', () => {
    const adapter = new MwiHostAdapter({ ...mwiProbeStub(), installed: true, versions: ['3.7.5'], displays: ['3.7.5.1'] })
    expect(adapter.notRunnable('compile')).toBeUndefined()
    expect(() => adapter.requireRunnable('compile')).not.toThrow()
  })
})

describe('stubbed engine seam', () => {
  it('answers injected verbs and marks unknown verbs as stubs', async () => {
    const engine = createStubEngine({ installed_help: (request) => ({ ok: true, query: request.query }) })
    await expect(engine.run('installed_help', { query: 'timer' })).resolves.toEqual({ ok: true, query: 'timer' })
    await expect(engine.run('anything', {})).resolves.toMatchObject({ stub: true })
    const host = new MwiEngineHost(engine, mwiProbeStub())
    await expect(host.run('installed_help', { query: 'ton' })).resolves.toMatchObject({ query: 'ton' })
  })
})

describe('synthetic help tree', () => {
  it('writes, reads and searches topics without the IDE', () => {
    const root = mkdtempSync(join(tmpdir(), 'mwi-help-'))
    writeHelpTree(root, [
      { id: 'timer-on', title: 'TON timer', text: 'The TON timer accumulates elapsed time while IN is TRUE.', keywords: ['timer', 'TON'] },
      { id: 'counter', title: 'CTU counter', text: 'The CTU counter increments on a rising edge.', keywords: ['counter'] },
    ])
    expect(probeHelpTree(root).found).toBe(true)
    expect(probeHelpTree(undefined).found).toBe(false)
    expect(readHelpTopic(root, 'timer-on')).toMatchObject({ id: 'timer-on', title: 'TON timer' })
    expect(readHelpTopic(root, 'timer-on').text).toContain('accumulates elapsed time')
    const matches = searchHelpTopics(root, 'timer')
    expect(matches.matches.map(match => match.id)).toEqual(['timer-on'])
    expect(matches.scanned).toBe(2)
    expect(matches.truncated).toBe(false)
    expect(() => readHelpTopic(root, 'missing')).toThrow(/HELP_TOPIC_NOT_FOUND|No help topic/u)
  })

  it('reports a missing tree instead of pretending to search one', () => {
    const probe = probeHelpTree(join(tmpdir(), 'mwi-no-such-help-tree'))
    expect(probe.found).toBe(false)
    expect(probe.fix).toContain('MWI_HELP_TREE')
    expect(probe.looked_for.some(location => location.where.includes('.chm'))).toBe(true)
    expect(HELP_TREE_ENV).toBe('MWI_HELP_TREE')
  })
})
