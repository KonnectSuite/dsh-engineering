import { readFileSync, writeFileSync } from 'node:fs'

const changelog = 'CHANGELOG.md'
let text = readFileSync(changelog, 'utf8')

// Earlier PowerShell writes turned the leading "f" of two entries into a form feed.
text = text.replace(/\u000c/gu, 'f')
text = text.replace(/\n## \[0\.25\.0\]/u, '\n\n## [0.25.0]')

const entry = [
  '## [0.26.0] - 2026-10-29',
  '',
  '### Added',
  '',
  '- **`ftview_render` can draw the staged draft, not just the export.** Pass `source: "draft"` and the render reflects everything staged but not yet applied, so a screen can be looked at before `ftview_apply` and before anyone imports it. A draft that does not touch the display is refused with `NOT_FOUND` instead of silently drawing the committed file.',
  '',
].join('\n')

if (!text.startsWith('## [0.25.1]')) throw new Error('unexpected changelog head')
writeFileSync(changelog, entry + text, 'utf8')

const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
pkg.version = '0.26.0'
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
console.log('version', pkg.version)
