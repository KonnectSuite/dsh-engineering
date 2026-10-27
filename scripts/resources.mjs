#!/usr/bin/env node
/** Build the resources index, or check it is current. */

import { buildFiles, checkCurrent } from './gen-resources.mjs'
import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'resources')

if (process.argv.includes('--check')) {
  const result = checkCurrent()
  if (!result.ok) {
    console.error(`resources: ${result.reason}`)
    process.exit(1)
  }
  console.log(`resources: ${result.pages} pages, digest ${String(result.digest).slice(0, 12)}, up to date`)
} else {
  const files = buildFiles()
  writeFileSync(join(PACKAGE, 'index.json'), `${JSON.stringify(files.index, null, 2)}\n`, 'utf8')
  writeFileSync(join(PACKAGE, 'SOURCE.json'), `${JSON.stringify(files.source, null, 2)}\n`, 'utf8')
  console.log(`resources: wrote ${files.index.pages.length} pages, digest ${files.digest.slice(0, 12)}`)
}
