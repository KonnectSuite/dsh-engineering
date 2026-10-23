/** Temporary live probe: stage a copy of a real project with the new package. */
import { cpSync, mkdtempSync, mkdirSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PowerShellSessionRuntime } from '../src/session/service.ts'

const source = 'C:/Users/KNPhu/.arya/.arya-no-repo/mw-projects'
const workspace = mkdtempSync(join(tmpdir(), 'mwi-live-stage-'))
cpSync(join(source, 'TopCutterSigma5.mwt'), join(workspace, 'TopCutterSigma5.mwt'))
cpSync(join(source, 'TopCutterSigma5'), join(workspace, 'TopCutterSigma5'), { recursive: true })
const runtime = new PowerShellSessionRuntime(workspace)
try {
  const record = await runtime.stage('TopCutterSigma5.mwt')
  console.log('STAGED', JSON.stringify(record, null, 2))
  console.log('stage files:', readdirSync(join(workspace, '.motionworks', 'stage')).join(', '))
  console.log('identity:', readFileSync(join(workspace, '.motionworks', 'stage', 'TopCutterSigma5.identity.json'), 'utf8').slice(0, 200))
} catch (error) {
  console.log('STAGE ERROR', (error as { code?: string }).code, '-', (error as Error).message)
}
