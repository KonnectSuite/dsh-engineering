import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ERROR_BYTES, WARN_BYTES, findings, payload } from '../scripts/check-package.mjs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('package.json'))
const results = findings()
const errors = results.filter(result => result.level === 'error')

test('the published package passes every packaging check', () => {
  assert.deepEqual(errors.map(error => `${error.rule} ${error.message}`), [],
    'packaging findings; run `pnpm check:package` for the readable report')
})

test('the tarball stays under the size the market accepts', () => {
  // `files` is the tarball. A payload that only the author's checkout can build
  // still publishes, it just fails at mount; a payload that doubles in size
  // publishes and quietly gets slow to install. This is the number that moves.
  const shipped = payload()
  const total = shipped.reduce((sum, file) => sum + file.bytes, 0)
  assert.ok(total < WARN_BYTES, `the shipped files total ${(total / 1048576).toFixed(1)} MiB, over the ${(WARN_BYTES / 1048576).toFixed(0)} MiB this suite accepts (market hard cap ${(ERROR_BYTES / 1048576).toFixed(0)} MiB)`)
  assert.ok(shipped.some(file => file.path.startsWith('vendor/')), 'the vendored component tree is not part of the payload')
})

test('the licence notices travel with the code they cover', () => {
  assert.ok(manifest.files?.includes('NOTICE.md'), 'files does not ship NOTICE.md')
  const notice = read('NOTICE.md')
  for (const holder of ['acadrust', 'ACadSharp', 'MPL-2.0', 'StudioMCPBridge.cs', 'NetLogic']) {
    assert.ok(notice.includes(holder), `NOTICE.md does not name ${holder}`)
  }
  assert.ok(notice.includes('vendor/ecad/THIRD_PARTY_NOTICES.md'), 'NOTICE.md does not point at the full ECAD notice')
})

test('the manifest describes the bundle the docs describe', () => {
  // The description is the Plugins page text, the npm listing and the GitHub
  // repository line at once, so a stale one is stale in three public places.
  for (const product of ['Studio 5000', 'FactoryTalk View', 'FactoryTalk Optix', 'MotionWorks', 'ECAD', 'RSLogix']) {
    assert.ok(manifest.description.includes(product), `description omits ${product}`)
  }
  assert.ok(manifest.keywords.includes('dsh-plugin'), 'keywords omit dsh-plugin')
  assert.equal(manifest.publishConfig?.access, 'public')
})
