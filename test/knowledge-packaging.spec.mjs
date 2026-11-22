/**
 * The knowledge-plane packaging invariants.
 *
 * The retrieval core is a source library copied into each consumer, and each
 * product's corpus is a payload directory that must reach `vendor/<product>/`
 * in the tarball. These checks fail when a copy is stale, a corpus index is
 * malformed, a consumer forgets its `knowledge/` payload, or the assembler drops
 * a directory the built docs tool resolves at runtime.
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'

const ROOT = resolve(import.meta.dirname, '..')
const CONSUMERS = ['l5x', 'ftview', 'migration', 'plc5', 'slc']
const CORE_FILES = ['core.ts', 'html.ts']

const read = (path) => readFileSync(join(ROOT, path), 'utf8')

test('the synced retrieval-core copies are current', () => {
  const result = spawnSync(process.execPath, ['scripts/sync-knowledge-lib.mjs', '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
  assert.equal(result.status, 0, `stale retrieval-core copy: ${result.stderr || result.stdout}`)
})

test('every consumer carries an identical copy of the core', () => {
  for (const consumer of CONSUMERS) {
    for (const file of CORE_FILES) {
      const source = read(`packages/knowledge/src/${file}`)
      const target = read(`packages/${consumer}/src/knowledge/${file}`)
      assert.equal(target, source, `packages/${consumer}/src/knowledge/${file} is not the synced copy`)
    }
  }
})

/** Every collection directory under one consumer's knowledge payload. */
function collections(consumer) {
  const root = join(ROOT, 'packages', consumer, 'knowledge')
  assert.ok(existsSync(root), `packages/${consumer}/knowledge is missing`)
  return readdirSync(root, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, dir: join(root, entry.name) }))
}

test('every consumer corpus is a valid schema-1 collection', () => {
  for (const consumer of CONSUMERS) {
    const found = collections(consumer)
    assert.ok(found.length > 0, `packages/${consumer}/knowledge carries no collection`)
    for (const collection of found) {
      const indexPath = join(collection.dir, 'index.json')
      assert.ok(existsSync(indexPath), `${consumer}/${collection.name}: index.json is missing`)
      const index = JSON.parse(readFileSync(indexPath, 'utf8'))
      assert.equal(index.schema, 1, `${consumer}/${collection.name}: schema is not 1`)
      assert.equal(typeof index.collection, 'string')
      assert.equal(typeof index.source, 'string')
      assert.ok(Array.isArray(index.pages) && index.pages.length > 0, `${consumer}/${collection.name}: no pages`)
      assert.ok(Array.isArray(index.revisions), `${consumer}/${collection.name}: revisions is not an array`)
      const ids = new Set()
      for (const page of index.pages) {
        assert.equal(typeof page.id, 'string')
        assert.ok(!ids.has(page.id), `${consumer}/${collection.name}: duplicate page id ${page.id}`)
        ids.add(page.id)
        assert.equal(typeof page.title, 'string')
        if (index.source === 'installed-help') {
          assert.equal(typeof page.path, 'string', `${consumer}/${collection.name}/${page.id}: installed-help page has no help path`)
          assert.equal(page.body, undefined, `${consumer}/${collection.name}/${page.id}: installed-help page carries a body`)
        } else {
          assert.equal(typeof page.body, 'string', `${consumer}/${collection.name}/${page.id}: authored page has no body file`)
          assert.ok(
            existsSync(join(collection.dir, page.body)),
            `${consumer}/${collection.name}/${page.id}: authored body file is missing`,
          )
        }
      }
    }
  }
})

test('the assembler ships every knowledge payload', () => {
  const source = read('scripts/assemble.mjs')
  const payload = source.match(/const PAYLOAD = \[([\s\S]*?)\]/u)
  assert.ok(payload, 'scripts/assemble.mjs has no PAYLOAD list')
  assert.match(payload[1], /['"]knowledge['"]/u, 'the assembler payload list does not copy knowledge/')
  assert.match(source, /COMPONENTS = \[[\s\S]*?['"]slc['"]/u, 'the SLC component is not assembled')
  assert.match(source, /VIEWER_PAYLOADS = \[[^\]]*['"]ecad['"]/u, 'the DXF/DWG viewer payload is not assembled')
})

test('the root manifest ships the vendor tree the docs tools read', () => {
  const manifest = JSON.parse(read('package.json'))
  assert.ok(manifest.files.includes('vendor/**/*'), 'package.json does not ship vendor/')
  assert.ok(manifest.exports['./slc'], 'package.json has no ./slc export')
})

test('each docs adapter resolves its knowledge directory beside the built module', () => {
  const core = read('packages/knowledge/src/core.ts')
  assert.match(
    core,
    /new URL\('\.\.\/\.\.\/knowledge\/', import\.meta\.url\)/u,
    'the shared core does not default its knowledge root beside the built module',
  )
  for (const consumer of CONSUMERS) {
    const docsPath = `packages/${consumer}/src/docs.ts`
    assert.ok(existsSync(join(ROOT, docsPath)), `${docsPath} is missing`)
    const source = read(docsPath)
    assert.match(source, /createDocsTool\(/u, `${docsPath} does not build its tool on the shared core`)
    assert.match(source, /collections:/u, `${docsPath} names no collection`)
  }
})
