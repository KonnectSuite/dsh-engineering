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

/** The smallest `.optix` project file: a name and a Nodes list, as Studio writes them. */
const OPTIX = 'Name: Kymera\nGUID: 0123456789abcdef\nNodes:\n- File: Nodes/UI/UI.yaml\n- File: Nodes/NetLogic/NetLogic.yaml\n'

/** Create a scratch Optix project; `bridge` is the source its NetSolution already holds. */
const scratch = async ({ csproj = 'Kymera.HMI.csproj', bridge = null, netlogic = null } = {}) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optix-arm-'))
  const solution = join(root, 'ProjectFiles', 'NetSolution')
  await mkdir(solution, { recursive: true })
  if (csproj !== null) await writeFile(join(solution, csproj), '<Project Sdk="Microsoft.NET.Sdk" />')
  if (bridge !== null) await writeFile(join(solution, 'StudioMCPBridge.cs'), bridge)
  await writeFile(join(root, 'Kymera.optix'), OPTIX)
  if (netlogic !== null) {
    await mkdir(join(root, 'Nodes', 'NetLogic'), { recursive: true })
    await writeFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), netlogic)
  }
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
      /No \.optix file directly under .*: point project at the folder that holds the project file\./u,
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
    assert.match(report.next, /right-click the StudioMCPBridge NetLogic node and choose StartBridge/u)
    await assert.rejects(() => readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), /ENOENT/u)
  } finally {
    await cleanup(root)
  }
})

test('a confirmed call writes the bridge and keeps the human step in the report', async () => {
  const root = await scratch()
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.equal(report.armed, true)
    assert.equal(report.bridge_written, true)
    assert.ok(report.backup.startsWith(join(root, 'ProjectFiles', '.dsh-backups')), report.backup + ' is not in the backup folder')
    assert.equal(report.installed, false)
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
    assert.ok(report.backup.startsWith(join(root, 'ProjectFiles', '.dsh-backups')), report.backup + ' is not in the backup folder')
    assert.equal(await readFile(report.bridge_backup, 'utf8').then((text) => bridgeVersion(text)), '1.0.7')
    assert.equal(await readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), SHIPPED)
  } finally {
    await cleanup(root)
  }
})

test('a project already holding this bridge is not rewritten', async () => {
  const root = await scratch({ bridge: SHIPPED })
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.deepEqual({ up_to_date: report.up_to_date, bridge_written: report.bridge_written, node_written: report.node_written }, { up_to_date: true, bridge_written: false, node_written: true })
    assert.equal(await readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), SHIPPED)
    assert.match(report.next, /already holds the bridge this bundle ships/u)
  } finally {
    await cleanup(root)
  }
})

test('the NetLogic node a hand-built project lacks is written, so StartBridge is reachable', async () => {
  const root = await scratch({ bridge: SHIPPED })
  try {
    const report = await armBridge(root, SHIPPED, true)
    assert.equal(report.netlogic_node, 'created_file')
    const yaml = await readFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), 'utf8')
    assert.match(yaml, /^- Name: StudioMCPBridge$/mu)
    assert.match(yaml, /Name: StartBridge/u)
    assert.match(yaml, /Value: 180/u)
  } finally {
    await cleanup(root)
  }
})

test('a node the project already carries is left byte for byte alone', async () => {
  const root = await scratch({ bridge: SHIPPED })
  try {
    const path = join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml')
    await mkdir(join(root, 'Nodes', 'NetLogic'), { recursive: true })
    const handWritten = 'Name: NetLogic\nType: NetLogicCategoryFolder\nChildren:\n- Name: StudioMCPBridge\n  Type: NetLogic\n  Children:\n  - Name: BehaviourStartPriority\n    Type: BehaviourStartPriorityVariableType\n    DataType: Byte\n    Value: 42\n'
    await writeFile(path, handWritten)
    const report = await armBridge(root, SHIPPED, true)
    assert.equal(report.netlogic_node, 'present')
    assert.equal(await readFile(path, 'utf8'), handWritten)
  } finally {
    await cleanup(root)
  }
})

test('an unconfirmed call names the missing node without writing it', async () => {
  const root = await scratch({ bridge: SHIPPED })
  try {
    const report = await armBridge(root, SHIPPED, false)
    assert.equal(report.netlogic_node, 'missing')
    assert.match(report.next, /no StudioMCPBridge NetLogic node/u)
    await assert.rejects(() => readFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), 'utf8'), /ENOENT/u)
  } finally {
    await cleanup(root)
  }
})
test('a node file the project never registered is registered, and its body is not touched', async () => {
  const root = await scratch({ bridge: SHIPPED, netlogic: 'Name: NetLogic\nType: NetLogicCategoryFolder\nChildren:\n' })
  try {
    const optix = join(root, 'Kymera.optix')
    const before = await readFile(optix, 'utf8')
    const unregistered = before.replace('- File: Nodes/NetLogic/NetLogic.yaml\n', '')
    await writeFile(optix, unregistered)
    const report = await armBridge(root, SHIPPED, { confirm: true })
    assert.equal(report.netlogic_node, 'added')
    const after = await readFile(optix, 'utf8')
    assert.match(after, /^- File: Nodes\/UI\/UI\.yaml$/mu)
    assert.match(after, /^- File: Nodes\/NetLogic\/NetLogic\.yaml$/mu)
    assert.equal(report.optix_file_edited, true)
    const body = await readFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), 'utf8')
    assert.match(body, /^- Name: StudioMCPBridge$/mu)
  } finally {
    await cleanup(root)
  }
})

test('an arm can be undone in one call', async () => {
  const root = await scratch({})
  try {
    const report = await armBridge(root, SHIPPED, { confirm: true })
    assert.equal(report.armed, true)
    assert.ok(report.backup.endsWith('.dsh-backups\\arm-' + report.backup.split('arm-')[1]) || report.backup.includes('arm-'), report.backup)
    const undone = await armBridge(root, SHIPPED, { restore: true })
    assert.equal(undone.restored.length, report.changed_files.length)
    await assert.rejects(() => readFile(join(root, 'Nodes', 'NetLogic', 'NetLogic.yaml'), 'utf8'), /ENOENT/u)
    await assert.rejects(() => readFile(join(root, 'ProjectFiles', 'NetSolution', 'StudioMCPBridge.cs'), 'utf8'), /ENOENT/u)
  } finally {
    await cleanup(root)
  }
})