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

test('inserts exactly the bundle rows', () => {
  assert.deepEqual(inserted.insert, [
    { id: 'l5x-read', name: '@aryacode/dsh-engineering/l5x' },
    { id: 'l5x-read-skill', name: '@aryacode/dsh-engineering/l5x/skill' },
    { id: 'l5x-editing', name: '@aryacode/dsh-engineering/l5x/editing', disabled: true },
    { id: 'l5x-studio', name: '@aryacode/dsh-engineering/l5x/studio', disabled: true },
    { id: 'l5x-live', name: '@aryacode/dsh-engineering/l5x/live', disabled: true },
    { id: 'viewers', name: '@aryacode/dsh-engineering' },
    { id: 'ftview-read', name: '@aryacode/dsh-engineering/ftview' },
    { id: 'ftview-read-skill', name: '@aryacode/dsh-engineering/ftview/skill' },
    { id: 'ftview-edit', name: '@aryacode/dsh-engineering/ftview/edit' },
    { id: 'ftview-studio', name: '@aryacode/dsh-engineering/ftview/studio' },
    { id: 'mwi-session', name: '@aryacode/dsh-engineering/mwi' },
    { id: 'mwi-read', name: '@aryacode/dsh-engineering/mwi/read' },
    { id: 'mwi-read-skill', name: '@aryacode/dsh-engineering/mwi/skill' },
    { id: 'mwi-verify', name: '@aryacode/dsh-engineering/mwi/verify' },
    { id: 'mwi-edit', name: '@aryacode/dsh-engineering/mwi/edit', disabled: true },
    { id: 'optix', name: '@aryacode/dsh-tool-ft-optix' },
  ])
})

test('mounts the one client face through the bundle package itself', () => {
  const clientRows = inserted.insert.filter(row => row.name === '@aryacode/dsh-engineering')
  assert.equal(clientRows.length, 1, 'a package registers one client bundle, so it needs exactly one mounted row')
  for (const row of inserted.insert) {
    assert.ok(!/-(l5x|ftview)-viewer$/u.test(row.name),
      `${row.name} names a retired viewer package; both faces ship in @aryacode/dsh-engineering`)
  }
})

test('keeps the expensive surfaces off by default', () => {
  const off = inserted.insert.filter(row => row.disabled === true).map(row => row.id)
  assert.deepEqual(off, ['l5x-editing', 'l5x-studio', 'l5x-live', 'mwi-edit'],
    'a read-only profile must not pay for draft, SDK, live or MotionWorks edit schemas')
})
