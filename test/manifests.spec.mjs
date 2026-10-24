import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const root = fileURLToPath(new URL('..', import.meta.url))
const skipped = new Set(['node_modules', '.git', 'lib', 'dist'])
const bom = [0xef, 0xbb, 0xbf]

/** Every package manifest the dev profile and the harness parse as JSON. */
function manifests(dir) {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (!skipped.has(entry.name)) found.push(...manifests(path))
    } else if (entry.name === 'package.json') {
      found.push(path)
    }
  }
  return found
}

test('every package manifest is BOM-free JSON', () => {
  const files = manifests(root)
  assert.ok(files.length >= 6, `expected the bundle and its packages, found ${files.length}`)
  for (const file of files) {
    const bytes = readFileSync(file)
    assert.notDeepEqual([...bytes.subarray(0, 3)], bom, `${file} starts with a UTF-8 BOM`)
    assert.doesNotThrow(() => JSON.parse(bytes.toString('utf8')), `${file} is not JSON`)
  }
})
