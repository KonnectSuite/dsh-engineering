import { ensureBackup } from './packages/mwi/src/session/backup.ts'
import { CodeEngine } from './packages/mwi/src/core/code-engine.ts'
const ws = 'C:/Users/KNPhu/OneDrive/Documents/AryaAI/Fixes'
const rec = ensureBackup(ws, ws + '/mwi-laminator/Laminator/Slave Cutters/Top Cutter/TopCutterS5.mwt')
const engine = new CodeEngine({ workspace: ws, stageRoot: ws + '/.motionworks/stage', codeDir: 'C:/Users/KNPhu/.arya/github/KonnectSuite/dsh-engineering/packages/mwi/code' })
const p = await engine.run('pous', { project: rec.directory })
for (const pou of p.pous as Array<{name:string,language?:string}>) {
  const t = await engine.run('read_text', { project: rec.directory, pou: pou.name })
  const body = String(t.body ?? '')
  if (body.length > 0) { console.log(pou.name, pou.language ?? t.language, body.length, body.slice(0,60).replace(/\n/g,'|')); break }
}
