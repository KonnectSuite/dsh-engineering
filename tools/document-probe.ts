import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { harness } from '../packages/ftview/test/harness.ts'

const root = process.argv[2]
const files = new Map<string, string>()
function walk(directory: string): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else files.set(`${root}/${relative(root, full).replaceAll('\\', '/')}`, readFileSync(full, 'latin1'))
  }
}
walk(root)

const l5x = harness(files)
const opened = await l5x.call('ftview_open', { root })
const viewId = (opened.data as { view_id: string }).view_id
const displays = ['Arya Overview']
const target = displays.find(name => process.argv[3] !== undefined && name === process.argv[3]) ?? displays[0]!
const result = await l5x.call('ftview_document', { view_id: viewId, display: target, output: `${root}/../${target}.md` })
if (result.error !== undefined) throw new Error(result.error.message)
console.log(JSON.stringify(result.data))
console.log(result.summary)
