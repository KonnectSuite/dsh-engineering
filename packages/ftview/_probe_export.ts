import { rmSync, readFileSync, existsSync, statSync, readdirSync } from 'node:fs'
import { exportApplication } from './src/vendor.ts'
import { scanApplication } from './src/model.ts'
const dest = (process.env.TEMP ?? '.') + '/ftview-export-extras'
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
const result = await exportApplication('Carpenter_EPS_Laminator001', dest)
if (result.error) { console.log('FAIL', result.error); process.exit(1) }
const files = result.value ?? []
console.log('files:', files.length)
for (const f of files.filter(f => /^(Alarms|Tags)\//i.test(f))) console.log('  ', f)
const fs = {
  resolve: async (p: string) => p,
  stat: async (p: string) => existsSync(p) ? { type: statSync(p).isDirectory() ? 'directory' : 'file' } : undefined,
  readBytes: async (p: string) => new Uint8Array(readFileSync(p)),
  listDir: async (p: string) => readdirSync(p, { withFileTypes: true }).map(e => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' })),
}
const app = await scanApplication(fs as never, dest, undefined, 4000)
console.log('displays:', app.displays.length, 'tags:', app.tags.length, 'tagFiles:', app.tagFiles.join(','), 'diagnostics:', app.diagnostics.length)
