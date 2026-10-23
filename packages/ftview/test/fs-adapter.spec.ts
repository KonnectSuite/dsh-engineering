/**
 * The string-path adapter over the harness filesystem.
 *
 * The harness service takes opaque targets. The model composes paths as
 * strings, so this adapter must resolve every path and still hand the service a
 * target. A provider that returns strings is passed through for tests.
 */
import { describe, expect, it } from 'vitest'
import { stringFs, type FsTarget, type RawFsService } from '../src/core.ts'

function target(path: string): FsTarget {
  return { targetKey: path, displayPath: path }
}

describe('stringFs', () => {
  it('returns display paths and passes resolved targets to every operation', async () => {
    const seen: string[] = []
    const service: RawFsService = {
      async resolve(path) { return target(path.replaceAll('\\', '/')) },
      async stat(value) { seen.push(`stat:${(value as FsTarget).displayPath}`); return { type: 'file' } },
      async readBytes(value) { seen.push(`read:${(value as FsTarget).displayPath}`); return new Uint8Array([1]) },
      async listDir(value) { seen.push(`list:${(value as FsTarget).displayPath}`); return [{ name: 'a.xml', type: 'file' }] },
      async writeText(value, text) { seen.push(`write:${(value as FsTarget).displayPath}:${text}`) },
    }
    const fs = stringFs(service)
    expect(await fs.resolve('C:\\Line\\a.xml')).toBe('C:/Line/a.xml')
    expect(await fs.stat('a.xml')).toEqual({ type: 'file' })
    expect(await fs.readBytes('a.xml', undefined)).toEqual(new Uint8Array([1]))
    expect(await fs.listDir?.('root')).toEqual([{ name: 'a.xml', type: 'file' }])
    await fs.writeText?.('out/a.xml', 'text', { kind: 'createIfAbsent' }, undefined)
    expect(seen).toEqual(['stat:a.xml', 'read:a.xml', 'list:root', 'write:out/a.xml:text'])
  })

  it('passes through a provider that already returns strings', async () => {
    const service: RawFsService = {
      async resolve(path) { return path },
      async stat() { return undefined },
      async readBytes() { return new Uint8Array() },
    }
    const fs = stringFs(service)
    expect(await fs.resolve('a.xml')).toBe('a.xml')
    expect(await fs.stat('a.xml')).toBeUndefined()
    expect(fs.listDir).toBeUndefined()
    expect(fs.writeText).toBeUndefined()
  })
})
