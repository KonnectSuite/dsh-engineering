import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { SlcError, readSlcProject } from '../src/engine/rslogix500.ts'

/** The error a promise rejected with, or undefined when it resolved. */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
    return undefined
  } catch (error) {
    return error
  }
}

describe('headless RSLogix 500 read', () => {
  it('refuses a path that is not a file before starting the vendor host', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'slc-read-'))
    try {
      const error = await rejection(readSlcProject(directory))
      expect(error).toBeInstanceOf(SlcError)
      const failure = error as SlcError
      expect(failure.code).toBe('SLC_FILE_MISSING')
      expect(failure.message).toContain(directory)
      expect(failure.fix).toContain('.RSS')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('names the missing path in the error, not a bare COM failure', async () => {
    const missing = join(tmpdir(), 'slc-read-does-not-exist.rss')
    const error = await rejection(readSlcProject(missing))
    expect(error).toBeInstanceOf(SlcError)
    expect((error as SlcError).message).toContain('slc-read-does-not-exist.rss')
    expect((error as SlcError).code).toBe('SLC_FILE_MISSING')
  })
})
