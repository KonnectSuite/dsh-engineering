/** Temporary live probe: start the IDE, open the staged project, open a worksheet, close. */
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
const log = (label: string, value: unknown): void => { console.log(label, JSON.stringify(value, null, 2).slice(0, 1200)) }

try {
  const started = await runtime.start(staged)
  log('STARTED', started)
  const status = await runtime.status()
  log('STATUS', status)
  if (status.is_project_open !== true) {
    const opened = await runtime.open(staged, { userApproved: false })
    log('OPENED', opened)
  }
  const after = await runtime.status()
  log('AFTER', after)
  const worksheet = await runtime.worksheet({ kind: 'variables', inspectOnly: false })
  log('WORKSHEET', worksheet)
} catch (error) {
  console.log('LIVE ERROR', (error as { code?: string }).code, '-', (error as Error).message)
}
