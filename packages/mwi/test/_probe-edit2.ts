/** Temporary probe: variable add and POU create live. */
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PowerShellSessionRuntime, BRIDGE_DIR } from '../src/session/service.ts'
import { Bridge } from '../src/core/bridge.ts'
import { PowerShellBridgeTransport } from '../src/core/ps-bridge.ts'

const workspace = readdirSync(tmpdir())
  .filter(name => name.startsWith('mwi-live-stage-'))
  .map(name => join(tmpdir(), name))
  .sort()
  .at(-1)
if (workspace === undefined) throw new Error('no live workspace')
const staged = join(workspace, '.motionworks', 'stage', 'TopCutterSigma5.mwt')
const stageRoot = join(workspace, '.motionworks', 'stage')
const runtime = new PowerShellSessionRuntime(workspace)
const bridge = new Bridge(new PowerShellBridgeTransport({ bridgeDir: BRIDGE_DIR, workspace, stageRoot }))
try {
  console.log('START', JSON.stringify(await runtime.start(staged)).slice(0, 120))
  const snapshot = await bridge.run('variable_snapshot', { pou: 'Initialize', require_saved: true }) as { groups?: { name: string; read_only?: boolean }[] }
  const group = snapshot.groups?.find(entry => entry.read_only !== true)?.name
  console.log('GROUP', group)
  if (group === undefined) throw new Error('no writable group on Initialize')
  const variable = await runtime.editVariable({
    pou: 'Initialize',
    operation: 'add',
    declaration: { name: 'AryaProbeFlag', type: 'BOOL', section: 'VAR', group, address: null, initial_value: null, description: 'probe' },
  })
  console.log('VARIABLE', JSON.stringify((variable as { verification?: unknown }).verification))
  const structure = await runtime.editStructure({
    scope: 'pou', operation: 'create', name: 'AryaProbeProgram', pou_type: 'PROGRAM', language: 'ST',
  })
  console.log('STRUCTURE', JSON.stringify((structure as { verification?: unknown }).verification))
} catch (error) {
  console.log('EDIT ERROR', (error as { code?: string }).code, '-', (error as Error).message.slice(0, 400))
} finally {
  try { console.log('CLOSE', JSON.stringify(await runtime.close({ userApproved: true, expectedProject: staged }))) } catch (error) { console.log('CLOSE ERROR', (error as Error).message) }
}
