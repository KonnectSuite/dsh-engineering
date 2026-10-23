/** Temporary live probe: close the IDE with the staged project. */
import { readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PowerShellSessionRuntime } from '../src/session/service.ts'

const workspace = readdirSync(tmpdir())
  .filter(name => name.startsWith('mwi-live-stage-'))
  .map(name => join(tmpdir(), name))
  .sort()
  .at(-1)
if (workspace === undefined) throw new Error('no live workspace')
const staged = join(workspace, '.motionworks', 'stage', 'TopCutterSigma5.mwt')
const runtime = new PowerShellSessionRuntime(workspace)
try {
  const closed = await runtime.close({ userApproved: true, expectedProject: staged })
  console.log('CLOSED', JSON.stringify(closed))
  try {
    console.log('STATUS AFTER', JSON.stringify(await runtime.status()))
  } catch (error) {
    console.log('STATUS AFTER ERROR', (error as { code?: string }).code)
  }
} catch (error) {
  console.log('CLOSE ERROR', (error as { code?: string }).code, '-', (error as Error).message)
}
