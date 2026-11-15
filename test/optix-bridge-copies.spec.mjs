import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * The bridge is the contract, so it is the one file that must never drift.
 *
 * A project is armed two ways: `optix_template` scaffolds a starter and writes this bundle's
 * bridge over the copy, and `optix_bridge_arm` writes it into a project that has none. Both paths
 * also declare the bridge's exported methods as a NetLogic node, because Studio binds the node's
 * `Class: Method` children to the class's `[ExportMethod]` methods. A copy of the source that lags
 * the tracked one, or a node that declares a method the class does not implement, is the defect
 * that leaves a new project answering `Bridge unavailable` with no visible cause. These specs fail
 * in CI instead of in the field.
 */

const root = fileURLToPath(new URL('..', import.meta.url))
const bridgeRoot = join(root, 'packages', 'optix')

/** Every copy of the bridge source the bundle ships, tracked or template. */
const bridgeCopies = async () => {
  const found = ['packages/optix/bridge/StudioMCPBridge.cs']
  const templates = join(bridgeRoot, 'templates')
  for (const name of await readdir(templates)) {
    found.push(`packages/optix/templates/${name}/project/ProjectFiles/NetSolution/StudioMCPBridge.cs`)
  }
  return found.sort()
}

/** The `[ExportMethod]` names a bridge source declares, in file order. */
const exportedMethods = (source) => {
  const names = []
  const lines = source.split(/\r?\n/gu)
  for (let index = 0; index < lines.length; index += 1) {
    if (!/\[ExportMethod\]/u.test(lines[index])) continue
    for (let ahead = index + 1; ahead < lines.length; ahead += 1) {
      const hit = /public\s+(?:void|string|bool|int|object|Task<[^>]+>|Task)\s+(\w+)\s*\(/u.exec(lines[ahead])
      if (hit === null) {
        if (!/^\s*(\/\/|\[|\s*$)/u.test(lines[ahead])) break
        continue
      }
      names.push(hit[1])
      break
    }
  }
  return names
}

/** The `Class: Method` names a NetLogic.yaml declares for a named node. */
const nodeMethods = (yaml, node = 'StudioMCPBridge') => {
  const lines = yaml.split(/\r?\n/gu)
  const start = lines.findIndex((line) => new RegExp(`^- Name:\\s*${node}\\s*$`, 'u').test(line))
  assert.notEqual(start, -1, `${node} is not declared in this NetLogic.yaml`)
  const names = []
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^- Name:/u.test(lines[index])) break
    if (!/^\s+- Class:\s*Method\s*$/u.test(lines[index])) continue
    const next = lines[index + 1] ?? ''
    const hit = /^\s+Name:\s*(\w+)\s*$/u.exec(next)
    assert.notEqual(hit, null, `a Class: Method child has no plain Name at line ${index + 1}`)
    names.push(hit[1])
  }
  return names
}

test('every shipped copy of the bridge is the tracked one, byte for byte', async () => {
  const tracked = await readFile(join(bridgeRoot, 'bridge', 'StudioMCPBridge.cs'), 'utf8')
  const copies = await bridgeCopies()
  assert.ok(copies.length >= 3, 'the tracked bridge and both starters should each carry the source')
  for (const copy of copies) {
    const text = await readFile(join(root, copy), 'utf8')
    assert.equal(text, tracked, `${copy} has drifted from packages/optix/bridge/StudioMCPBridge.cs`)
  }
})

test('each starter declares exactly the methods its bridge implements', async () => {
  const source = await readFile(join(bridgeRoot, 'bridge', 'StudioMCPBridge.cs'), 'utf8')
  const implemented = exportedMethods(source)
  assert.ok(implemented.includes('StartBridge'), 'the bridge must export StartBridge')
  assert.ok(implemented.includes('StopBridge'), 'the bridge must export StopBridge')
  for (const name of await readdir(join(bridgeRoot, 'templates'))) {
    const yaml = await readFile(join(bridgeRoot, 'templates', name, 'project', 'Nodes', 'NetLogic', 'NetLogic.yaml'), 'utf8')
    assert.deepEqual(
      nodeMethods(yaml).sort(),
      implemented.sort(),
      `${name} declares a different method set than the bridge implements: a node method the class lacks fails at load, and a method the node omits cannot be chosen from the right-click menu`,
    )
  }
})

test('arming a project that has no bridge writes that same method set', async () => {
  const source = await readFile(join(bridgeRoot, 'bridge', 'StudioMCPBridge.cs'), 'utf8')
  const arm = await readFile(join(bridgeRoot, 'lib', 'arm.js'), 'utf8')
  // The node is a template literal in arm.js; the methods it declares are its `Class: Method` rows.
  const declared = [...arm.matchAll(/^\s+- Class: Method\n\s+Name: (\w+)\n/gmu)].map((hit) => hit[1])
  assert.deepEqual([...new Set(declared)].sort(), exportedMethods(source).sort(), 'arm.js writes a node that does not match the bridge it installs')
})

test('the bridge declares the version the bundle reports', async () => {
  const source = await readFile(join(bridgeRoot, 'bridge', 'StudioMCPBridge.cs'), 'utf8')
  const version = /BridgeVersion\s*=\s*"([^"]+)"/u.exec(source)?.[1] ?? ''
  assert.match(version, /^\d+\.\d+\.\d+$/u)
  // The health document is hand-built JSON, so this field is written with escaped quotes.
  assert.match(source, /template_library\\":true/u, 'the health answer must name the template_library capability the library tool gates on')
  const recorded = JSON.parse(await readFile(join(bridgeRoot, 'bridge', 'source.json'), 'utf8'))
  assert.match(recorded.sha256 ?? '', /^[0-9a-f]{64}$/u)
  assert.ok(Array.isArray(recorded.localChanges) && recorded.localChanges.length > 0, 'the fork must record what it changed')
  assert.equal(relative(root, join(bridgeRoot, 'bridge', 'source.json')).startsWith('packages'), true)
})
