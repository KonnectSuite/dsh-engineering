import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDxfBytes, openSheet, sha256 } from '../src/engine/index.ts'
import { openFixture, ok } from './helpers.mjs'

test('sha256 matches the known digest of "abc"', () => {
  assert.equal(sha256(new TextEncoder().encode('abc')), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
})

test('openSheet reads a fixture and reports hash, version and units', async () => {
  const opened = await openFixture('tiny.dxf')
  assert.equal(opened.path, 'tiny.dxf')
  assert.match(opened.sha256, /^[0-9a-f]{64}$/)
  assert.equal(opened.dxfVersion, 'AC1032')
  assert.equal(typeof opened.units, 'number')
  ok(opened.db)
})

test('openSheet rejects empty, non-DXF, oversize, truncated and unparsable input with typed errors', async () => {
  await assert.rejects(openSheet({ path: 'empty.dxf', bytes: new Uint8Array() }), error => error.code === 'NON_DXF' && error.fix.length > 0)
  await assert.rejects(openSheet({ path: 'notes.txt', bytes: new TextEncoder().encode('hello world\nthis is not a drawing') }), error => error.code === 'NON_DXF')
  await assert.rejects(
    openSheet({ path: 'big.dxf', bytes: new Uint8Array(64), maxFileBytes: 8 }),
    error => error.code === 'TOO_LARGE' && error.message.includes('8-byte limit')
  )
  const fixture = await openFixture('tiny.dxf')
  const whole = new Uint8Array((await import('node:fs')).readFileSync(new URL('./fixtures/tiny.dxf', import.meta.url)))
  const truncated = whole.slice(0, Math.floor(whole.length / 2))
  await assert.rejects(openSheet({ path: 'truncated.dxf', bytes: truncated }), error => error.code === 'PARSE_FAILED' && error.message.includes('EOF'))
  assert.equal(fixture.dxfVersion, 'AC1032')
})

test('openSheet rejects missing arguments', async () => {
  await assert.rejects(openSheet({ path: '', bytes: new Uint8Array([1]) }), error => error.code === 'INVALID_INPUT')
  await assert.rejects(openSheet({ path: 'x.dxf', bytes: 'not bytes' }), error => error.code === 'INVALID_INPUT')
  await assert.rejects(openSheet({ path: 'x.dxf', bytes: new Uint8Array([1]), maxFileBytes: -1 }), error => error.code === 'INVALID_INPUT')
})

test('isDxfBytes accepts fixture bytes and rejects prose', async () => {
  const opened = await openFixture('tiny.dxf')
  assert.equal(isDxfBytes(new Uint8Array()), false)
  assert.equal(isDxfBytes(new TextEncoder().encode('PK\u0003\u0004 zip')), false)
  assert.equal(isDxfBytes(new TextEncoder().encode('0\nSECTION\n2\nHEADER\n0\nENDSEC\n')), true)
  ok(opened.dxfVersion.length > 0)
})
