/**
 * Smoke test for the copied component: proves the skeleton's source still
 * carries the placeholders a copy must rename, and that a built `lib/` exports
 * the entry shape. Run `pnpm -F @aryacode/dsh-engineering-<id> build` first;
 * without a build the export check is skipped, not failed.
 *
 * RENAME the package name, entry name and placeholder tool after copying.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const packageRoot = join(import.meta.dirname, '..')
const source = readFileSync(join(packageRoot, 'src', 'index.ts'), 'utf8')
const manifest = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'))

test('the skeleton is private and not a live component', () => {
  assert.equal(manifest.private, true)
  assert.equal(manifest.dsh, undefined, 'a copy must not claim dsh.component before it is wired')
})

test('the placeholders a copy must rename are present', () => {
  assert.ok(source.includes('engineering-scaffold-example'), 'entry name placeholder missing')
  assert.ok(source.includes('example_capabilities'), 'probe tool placeholder missing')
  assert.ok(source.includes('RENAME'), 'rename markers missing')
})

test('a built lib exports the entry shape', t => {
  const built = join(packageRoot, 'lib', 'index.js')
  if (!existsSync(built)) {
    t.skip('build the package first: pnpm -F <package-name> build')
    return
  }
  return import(pathToFileURL(built).href).then(entry => {
    assert.equal(typeof entry.name, 'string')
    assert.ok(Array.isArray(entry.inject))
    assert.equal(typeof entry.apply, 'function')
  })
})
