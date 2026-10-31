import { readFileSync, writeFileSync } from 'node:fs'

const files = ['package.json', 'packages/ftview/package.json', 'packages/l5x/package.json']
const from = process.argv[2]
const to = process.argv[3]
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const pattern = new RegExp('"version"\\s*:\\s*"' + from.replace(/\./gu, '\\.') + '"', 'u')
  if (!pattern.test(text)) throw new Error('no version ' + from + ' in ' + file)
  const next = text.replace(pattern, '"version": "' + to + '"')
  writeFileSync(file, next)
  console.log(file, '->', JSON.parse(next).version)
}
