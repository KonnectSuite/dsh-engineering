import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { load } from 'js-yaml'

const source = readFileSync(new URL('../cordis.patch.yml', import.meta.url), 'utf8')
const patch = load(source)
const inserted = patch[0]

test('is one insert block and nothing else', () => {
  assert.ok(Array.isArray(patch))
  assert.equal(patch.length, 1)
  assert.ok(Array.isArray(inserted.insert))
})

test('never targets a row another bundle owns', () => {
  // An id-targeted patch entry requires that row to already exist in the
  // composed tree. When it does not, composition fails with
  // `patch: entry "..." not found` and the bundle refuses to apply — which is
  // what made 0.4.0 and 0.4.1 uninstallable. This bundle only ever inserts its
  // own rows.
  for (const entry of patch) {
    assert.equal(entry.id, undefined, `patch entry targets row "${entry.id}"; it must insert instead`)
    assert.ok(Array.isArray(entry.insert), 'every patch entry must be an insert block')
    for (const row of entry.insert) {
      assert.ok(typeof row.id === 'string' && row.id !== '' && typeof row.name === 'string')
    }
  }
})

test('is one row per product plus the component rows', () => {
  assert.deepEqual(inserted.insert, [
    { id: 'l5x', name: '@aryacode/dsh-engineering/l5x' },
    { id: 'ftview', name: '@aryacode/dsh-engineering/ftview' },
    { id: 'mwi', name: '@aryacode/dsh-engineering/mwi' },
    { id: 'ecad', name: '@aryacode/dsh-engineering/ecad', disabled: true },
    { id: 'viewers', name: '@aryacode/dsh-engineering' },
    { id: 'engineering-resources', name: '@aryacode/dsh-engineering/resources' },
    { id: 'migration', name: '@aryacode/dsh-engineering/migration' },
    { id: 'plc5', name: '@aryacode/dsh-engineering/plc5', disabled: true },
    { id: 'optix', name: '@aryacode/dsh-engineering/optix' },
    { id: 'engineering-preset', name: '@aryacode/dsh-engineering/preset' },
  ])
})

test('the optional surfaces stay inside the product row, not the row list', () => {
  // The optional surfaces are the entry's config: config in the patch would put
  // the fine-grained toggle back in the row list, which is the shape this change
  // exists to avoid. A row-wide `disabled` is a different decision — a component
  // that ships off by default — and components.spec checks it against the
  // manifest, so this test leaves it alone.
  for (const row of inserted.insert) {
    assert.equal(row.config, undefined, `${row.id} takes its defaults from the entry's Config schema`)
  }
})

test('the product entries it names exist and declare a config form', () => {
  for (const entry of ['l5x', 'ftview', 'mwi']) {
    const text = readFileSync(new URL(`../entries/${entry}.js`, import.meta.url), 'utf8')
    assert.match(text, /export const Config = z\.object\(/u, `entries/${entry}.js declares no Config schema`)
    assert.match(text, /export function apply\(ctx, config = \{\}\)/u, `entries/${entry}.js has no apply(ctx, config)`)
  }
})

test('row ids cannot shadow a harness service name', () => {
  // The row id is what a profile addressable switch is named, so it has to be a
  // stable lowercase id and must not collide with a harness service name. This
  // test used to carry a closed list of the current ids, which made every new
  // product row fail here before components.spec could judge it; the manifest
  // agreement there is the real set check.
  const reserved = new Set(['resources', 'tools', 'skills', 'fs', 'approval', 'session', 'storage', 'workspace', 'http'])
  for (const row of inserted.insert) {
    assert.ok(!reserved.has(row.id), `${row.id} would shadow the harness service of the same name`)
    assert.match(row.id, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u, `${row.id} is not a lowercase kebab-case row id`)
  }
})