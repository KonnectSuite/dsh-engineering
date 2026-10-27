import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { flag, list, text } from '../entries/config.js'

/**
 * A field marked `.volatile()` reaches apply() as a live reference, not as the
 * value. schemastery wraps it with createVolatile, so `config.edit` is
 * `{ get() }` — reading it directly made every switch look off. These tests pin
 * the resolution rule and the rows that depend on it.
 */

test('a plain value still reads as itself', () => {
  assert.equal(flag(true), true)
  assert.equal(flag(false), false)
  assert.equal(flag(undefined), false)
})

test('a volatile reference reads its snapshot', () => {
  assert.equal(flag({ get: () => true }), true)
  assert.equal(flag({ get: () => false }), false)
})

test('an absent or malformed field keeps the row default', () => {
  assert.equal(flag(undefined, true), true)
  assert.equal(flag({}, true), true)
  assert.equal(flag({ get: () => 'yes' }, true), true)
})

test('a volatile list reads its snapshot', () => {
  assert.deepEqual(list({ get: () => ['10.1.1.5'] }), ['10.1.1.5'])
  assert.deepEqual(list(['10.1.1.5']), ['10.1.1.5'])
  assert.deepEqual(list({ get: () => undefined }), [])
  assert.deepEqual(list(undefined), [])
})

test('every product row resolves volatile switches instead of comparing them', () => {
  for (const entry of ['l5x', 'ftview', 'mwi']) {
    const text = readFileSync(new URL(`../entries/${entry}.js`, import.meta.url), 'utf8')
    assert.match(text, /import \{ [^}]*flag[^}]*\} from '\.\/config\.js'/u, `entries/${entry}.js does not use the config resolver`)
    assert.doesNotMatch(text, /config\.\w+ === true/u, `entries/${entry}.js compares a volatile field to true`)
    assert.doesNotMatch(text, /config\.\w+ !== false/u, `entries/${entry}.js compares a volatile field to false`)
  }
})

test('l5x forwards resolved writes and addresses into the live row', () => {
  const text = readFileSync(new URL('../entries/l5x.js', import.meta.url), 'utf8')
  assert.match(text, /allowWrites: flag\(config\.allowWrites\)/u)
  assert.match(text, /list\(config\.allowedAddresses\)/u)
})

test('volatile-only updates remount the optional surfaces instead of claiming they are on', () => {
  for (const entry of ['l5x', 'mwi']) {
    const text = readFileSync(new URL(`../entries/${entry}.js`, import.meta.url), 'utf8')
    assert.match(text, /ctx\.on\('loader\/volatile-update', sync\)/u, `entries/${entry}.js does not react to volatile-only updates`)
  }
})

test('mwi resolves its workspace from config, marker, then process directory', () => {
  const entry = readFileSync(new URL('../entries/mwi.js', import.meta.url), 'utf8')
  assert.match(entry, /configureWorkspace\(text\(config\.workspace\)\)/u)
  const source = readFileSync(new URL('../packages/mwi/src/session/workspace.ts', import.meta.url), 'utf8')
  assert.match(source, /recordedWorkspace\(\)/u)
  assert.match(source, /mwi\.workspace/u)
  assert.match(source, /realpathSync/u)
})

test('a volatile string reads its snapshot', () => {
  assert.equal(text({ get: () => 'C:\\Projects' }), 'C:\\Projects')
  assert.equal(text('C:\\Projects'), 'C:\\Projects')
  assert.equal(text(undefined), '')
  assert.equal(text({ get: () => 42 }), '')
})
