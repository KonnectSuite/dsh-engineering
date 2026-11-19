/**
 * The AryaCAD bridge section of `ecad_capabilities`.
 *
 * Authoring, plotting and the electrical netlist now live in AryaCAD Electrical,
 * mounted by the owner as their own MCP row. This row never starts that program and
 * never ships it; it only reports what the composition shows, so a caller learns
 * before it promises a plot. These specs cover the three states that matter: no
 * registry read face at all, a server whose tools are visible, and a server named
 * something other than the default.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { harness } from './harness.mjs'

/** The bridge tools a mounted AryaCAD Electrical row contributes. */
const MOUNTED_TOOLS = [
  'mcp__ocs__ocs_sessions',
  'mcp__ocs__ocs_execute',
  'mcp__ocs__ocs_read',
  'mcp__ocs__ocs_save_verified',
]

/** Read the `cad` section of a capabilities answer. */
async function cadSection(instance) {
  const answer = await instance.call('ecad_capabilities', {})
  assert.equal(answer.error, undefined, JSON.stringify(answer.error))
  return { answer, cad: answer.data.cad }
}

test('a host that cannot answer a registry read reports no bridge, never an error', async () => {
  const instance = harness(new Map(), { bridge: false })
  const { answer, cad } = await cadSection(instance)
  assert.deepEqual(
    { serverName: cad.serverName, entryTool: cad.entryTool, mounted: cad.mounted, tools: cad.tools },
    { serverName: 'ocs', entryTool: 'mcp__ocs__ocs_sessions', mounted: false, tools: [] },
    'the default server is named even when nothing can be read',
  )
  assert.match(cad.hint, /docs\/products\/ecad\/aryacad-bridge\.md/u, 'the hint points at the owner-facing document')
  assert.match(cad.hint, /never starts the CAD application/u, 'the hint states the ownership boundary')
  assert.match(cad.hint, /still discovering tools also reads as not mounted/u, 'a discovering bridge is not mistaken for an absent one')
  assert.match(answer.summary, /the AryaCAD bridge is not mounted/u, answer.summary)
})

test('a mounted bridge is listed sorted, with the entry tool named', async () => {
  const instance = harness(new Map())
  for (const name of MOUNTED_TOOLS) instance.addBridgeTool(name)
  const { answer, cad } = await cadSection(instance)
  assert.equal(cad.mounted, true, 'the tools of the configured server are visible')
  assert.deepEqual(cad.tools, [...MOUNTED_TOOLS].sort(), 'the tool names come back sorted')
  assert.equal(cad.entryTool, 'mcp__ocs__ocs_sessions', 'the entry tool is named for the caller to start with')
  assert.match(cad.hint, /Authoring, plotting and the electrical netlist/u, cad.hint)
  assert.match(answer.summary, /the AryaCAD bridge is mounted as mcp__ocs__ocs_sessions/u, answer.summary)
})

test('a server mounted after this row applied is still reported', async () => {
  const instance = harness(new Map())
  const before = await cadSection(instance)
  assert.equal(before.cad.mounted, false, 'the bridge is absent at first')
  instance.addBridgeTool('mcp__ocs__ocs_sessions')
  const after = await cadSection(instance)
  assert.equal(after.cad.mounted, true, 'the bridge is read per call, not once at mount time')
})

test('the configured server name is honoured, and another server is not mistaken for it', async () => {
  const instance = harness(new Map(), { config: { bridgeServerName: 'aryacad' } })
  for (const name of MOUNTED_TOOLS) instance.addBridgeTool(name)
  const { cad } = await cadSection(instance)
  assert.equal(cad.serverName, 'aryacad', 'the row reports the name it was configured with')
  assert.equal(cad.entryTool, 'mcp__aryacad__ocs_sessions', 'the entry tool follows the configured name')
  assert.deepEqual(cad.tools, [], 'tools of a differently named server are not counted')
  assert.equal(cad.mounted, false, 'a server that is not the configured one reads as not mounted')
  assert.match(cad.hint, /"aryacad"/u, 'the hint names the server the row looked for')
})

test('a configured name that is not a usable string falls back to the default', async () => {
  const instance = harness(new Map(), { config: { bridgeServerName: '   ' } })
  const { cad } = await cadSection(instance)
  assert.equal(cad.serverName, 'ocs', 'a blank server name cannot leave the row looking for nothing')
  assert.equal(cad.entryTool, 'mcp__ocs__ocs_sessions')
})

test('the bridge section is part of the contract the panel and the tools share', async () => {
  const instance = harness(new Map())
  const { answer } = await cadSection(instance)
  assert.deepEqual(answer.data.contract, {
    namespace: 'ecad',
    version: 2,
    methods: ['open', 'sheets', 'capabilities'],
  }, 'the Remote contract carries no write method any more')
  assert.ok(
    answer.data.tools.includes('ecad_capabilities'),
    'the tool that reports the bridge is itself in the claimed inventory',
  )
})
