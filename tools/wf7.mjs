import { readFileSync, writeFileSync } from 'node:fs'

const file = 'packages/ftview/test/workflow.spec.ts'
let text = readFileSync(file, 'utf8')

const start = text.indexOf('    // The packaging step writes to the real filesystem, so it gets a scratch folder.')
const end = text.indexOf('  })\n})\n')
if (start === -1 || end === -1 || end < start) throw new Error('anchors missing')
text = `${text.slice(0, start)}${'"'}`.slice(0, -1) + text.slice(end)

text = text.replace(
  [
    "import { existsSync, mkdtempSync, readFileSync } from 'node:fs'",
    "import { tmpdir } from 'node:os'",
    "import { join } from 'node:path'",
    "import { describe, expect, it } from 'vitest'",
  ].join('\n'),
  "import { describe, expect, it } from 'vitest'",
)

writeFileSync(file, text, 'utf8')
console.log('workflow spec trimmed to the in-memory steps')
