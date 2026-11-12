import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { armBridge, bridgeVersion } from '../packages/optix/lib/arm.js'

/**
 * An existing Optix project with no bridge is the reason `optix_status` answers `Bridge
 * unavailable`, and arming it writes into the engineer's own project directory. These specs
 * run against a scratch project tree, never against Studio: what is under test is that the
 * write is planned before it happens, that what was there is kept, and that the step no tool
 * can take - compiling and right-clicking StartBridge - stays in the report.
 */

const SHIPPED = 'public class StudioMCPBridge { private const string BridgeVersion = "1.0.8"; }'

/** Create a scratch Optix project; `bridge` is the source its NetSolution already holds. */
const scratch = async ({ csproj = 'Kymera.HMI.csproj', bridge = null } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optix-arm-'))
  const solution = join(root, 'ProjectFiles', 'NetSolution')
  await mkdir(solution, { recursive: true })
  if (csproj !== null) await writeFile(join(solution, csproj), '<Project Sdk="Microsoft.NET.Sdk" />')
  if (bridge !== null) await writeFile(join(solution, 'StudioMCPBridge.cs'), bridge)
  return root
}

const cleanup = (root) => rm(root, { recursive: true, force: true })

test('the bridge version is read from the source, not assumed', () => {
  assert.equal(bridgeVersion(SHIPPED), '1.0.8')
  assert.equal(bridgeVersion('public class Other {}'), '')
})

test('a folder that is not an Optix project names what it looked for', async () => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optix-arm-'))
  try {
    await assert.rejects(
      () => armBridge(root, SHIPPED, true),
      /No ProjectFiles\/NetSolution under .*: point project at the folder that holds the project's \.optix file\./u,
    )
  } finally {
    await cleanup(root)
  }
})

test('a NetSolution folder with no csproj refuses, because Studio would have nothing to compile', async () => {
  const root = await scratch({ csproj: null })
  try {
    await assert.rejects(() => armBridge(root, SHIPPED, true), /holds no \.csproj, so Studio has no NetSolution project to compile the bridge into\./u)
  } finally {
    await cleanup(root)
  }
})

test('an unconfirmed call reports the plan and writes nothing', async () => {
  const root = await scratch()
  try {
    const report = await armBridge(root, SHIPPED, false)
    assert.deepEqual(
      { installed: report.installed, armed: report.armed, backup: report.backup, bridge_version: report.bridge_version, net_solution: report.net_solution },
      { installed: false, armed: false, backup: '', bridge_version: '1.0.8', net_solution: 'Kymera.HMI.csproj' },
    )
    assert.match(report.next, /Call again with confirm true to write/u)
    assert.match(report.next, /right-click it and choose StartBridge/u)
    await assert.rejects(() => readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), /ENOENT/u)
  } finally {
    await cleanup(root)
  }
})

test('a confirmed call writes the bridge and keeps the human step in the report', async () => {
  const root = await scratch()
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.deepEqual({ armed: report.armed, backup: report.backup, installed: false }, { armed: true, backup: '', installed: false })
    assert.equal(await readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), SHIPPED)
    assert.equal(report.next.startsWith('Open the project in Studio'), true)
  } finally {
    await cleanup(root)
  }
})

test('replacing a bridge the project already holds copies it first', async () => {
  const root = await scratch({ bridge: 'public class StudioMCPBridge { private const string BridgeVersion = "1.0.7"; }' })
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.equal(report.armed, true)
    assert.equal(report.installed, true)
    assert.equal(report.installed_version, '1.0.7')
    assert.equal(report.up_to_date, false)
    assert.ok(report.backup.startsWith(join(root, 'ProjectFiles', '.dsh-backups')), `${report.backup} is not in the backup folder`)
    assert.equal(await readFile(report.backup, 'utf8').then((text) => bridgeVersion(text)), '1.0.7')
    assert.equal(await readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), SHIPPED)
  } finally {
    await cleanup(root)
  }
})

test('a project already holding this bridge is not rewritten', async () => {
  const root = await scratch({ bridge: SHIPPED })
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.deepEqual({ up_to_date: report.up_to_date, armed: report.armed, backup: report.backup }, { up_to_date: true, armed: false, backup: '' })
    assert.match(report.next, /already holds the bridge this bundle ships/u)
  } finally {
    await cleanup(root)
  }
})
