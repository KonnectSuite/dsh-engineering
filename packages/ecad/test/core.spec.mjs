/**
 * The local byte-writer fallback in the filesystem adapter.
 *
 * The shipped host filesystem service writes UTF-8 text only, so a drawing is
 * published with the local writer. These tests pin the promises that writer
 * keeps: it writes the bytes, a read-only session refuses, and a destination
 * outside the writable workspace refuses.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asFsService } from '../src/core.ts'

/** A host filesystem without a byte writer, like the shipped service. */
const hostWithoutByteWriter = {
  async resolve(path) { return { targetKey: path, displayPath: path } },
  async stat() { return undefined },
  async readBytes() { return new Uint8Array() },
}

test('the local fallback writes bytes when the host has no byte writer', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ecad-write-fallback-'))
  try {
    const fs = asFsService(hostWithoutByteWriter)
    assert.equal(typeof fs.writeBytes, 'function')
    const target = { targetKey: 'drawing', displayPath: join(dir, 'out.dwg') }
    const bytes = new Uint8Array([0x41, 0x43, 0x31, 0x30, 0x32, 0x37, 0x00, 0xff])
    await fs.writeBytes(target, bytes, { kind: 'createIfAbsent' }, undefined, { mode: 'workspace-write', workspaceRoot: dir })
    assert.deepEqual(new Uint8Array(await readFile(join(dir, 'out.dwg'))), bytes)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('the fallback refuses a read-only session and an outside destination', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'ecad-write-policy-'))
  const outside = await mkdtemp(join(tmpdir(), 'ecad-write-outside-'))
  try {
    const fs = asFsService(hostWithoutByteWriter)
    const inside = { targetKey: 'inside', displayPath: join(dir, 'out.dxf') }
    await assert.rejects(
      fs.writeBytes(inside, new Uint8Array([1]), { kind: 'createIfAbsent' }, undefined, { mode: 'read-only', workspaceRoot: dir }),
      error => error.code === 'ECAD_WRITE_REFUSED',
    )
    assert.equal(existsSync(join(dir, 'out.dxf')), false)

    const beyond = { targetKey: 'beyond', displayPath: join(outside, 'out.dxf') }
    await assert.rejects(
      fs.writeBytes(beyond, new Uint8Array([1]), { kind: 'createIfAbsent' }, undefined, { mode: 'workspace-write', workspaceRoot: dir }),
      error => error.code === 'ECAD_WRITE_REFUSED',
    )
    assert.equal(existsSync(join(outside, 'out.dxf')), false)

    // An additional writable root named by the policy is accepted.
    await fs.writeBytes(beyond, new Uint8Array([2]), { kind: 'createIfAbsent' }, undefined, {
      mode: 'workspace-write',
      workspaceRoot: dir,
      additionalWritableRoots: [outside],
    })
    assert.deepEqual(new Uint8Array(await readFile(join(outside, 'out.dxf'))), new Uint8Array([2]))

    // The create guard still holds.
    await writeFile(join(dir, 'exists.dxf'), 'x')
    await assert.rejects(
      fs.writeBytes({ targetKey: 'exists', displayPath: join(dir, 'exists.dxf') }, new Uint8Array([3]), { kind: 'createIfAbsent' }, undefined, { mode: 'workspace-write', workspaceRoot: dir }),
      error => error.code === 'EEXIST',
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
    await rm(outside, { recursive: true, force: true })
  }
})
