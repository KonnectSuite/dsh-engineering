import { readFileSync, writeFileSync } from 'node:fs'

// Only the published package carries the release version. packages/ftview, packages/l5x,
// packages/optix and the rest are private workspace packages assembled into this one, so they are
// not part of a release number and must not be rewritten - an earlier list named two of them and
// threw on the first release after they diverged.
const files = ['package.json']
const from = process.argv[2]
const to = process.argv[3]
if (from === undefined || to === undefined) throw new Error('usage: node scripts/bump-version.mjs <from> <to>')
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const pattern = new RegExp('"version"\\s*:\\s*"' + from.replace(/\./gu, '\\.') + '"', 'u')
  if (!pattern.test(text)) throw new Error('no version ' + from + ' in ' + file)
  const next = text.replace(pattern, '"version": "' + to + '"')
  writeFileSync(file, next)
  console.log(file, '->', JSON.parse(next).version)
}
