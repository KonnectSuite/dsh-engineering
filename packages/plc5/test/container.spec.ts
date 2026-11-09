import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { CfbfError, parseCfbf, readContainerIdentity } from '../src/engine/container.ts'

/**
 * A minimal valid OLE2 container shaped like an RSLogix 5 project: a `PROCESSOR`
 * storage and a `PROGRAM FILES` storage, each holding one plain `ObjectData`
 * stream, plus a packed `DATA FILES` stream beside them. Identity lives in the
 * plain streams; bulk payloads ride the 16-byte packed header.
 */
function buildContainer(): Buffer {
  const sectorSize = 512
  // Header sector, FAT, two directory sectors (six entries do not fit in one), mini FAT, mini stream.
  const file = Buffer.alloc(512 + 5 * sectorSize)

  const processorText = 'F00607\0MML10PF3PX3R9!A\\1.2.3.4\\Backplane\\1\0RSI RSLogix 5 '
  const programText = 'CProgFile0\0MAIN DVIM\0CProgFile\0'

  const text = 'DATA FILES!'
  const deflated = deflateSync(Buffer.from(text, 'latin1'))
  const packed = Buffer.alloc(16 + deflated.length)
  packed.writeUInt32LE(2, 0) // header version 2
  packed.writeUInt32LE(16, 4) // header length
  packed.writeUInt32LE(deflated.length, 8) // packed length
  packed.writeUInt32LE(text.length, 12) // unpacked length
  deflated.copy(packed, 16)

  // Header.
  Buffer.from('D0CF11E0A1B11AE1', 'hex').copy(file, 0)
  file.writeUInt16LE(3, 0x18) // sectored version
  file.writeUInt16LE(3, 0x1a) // format version
  file.writeUInt16LE(0xfffe, 0x1c) // byte order
  file.writeUInt16LE(9, 0x1e) // sector size shift
  file.writeUInt16LE(6, 0x20) // mini sector size shift
  file.writeUInt32LE(1, 0x2c) // one FAT sector
  file.writeUInt32LE(1, 0x30) // directory starts at sector 1
  file.writeUInt32LE(4096, 0x38) // mini stream cutoff
  file.writeUInt32LE(3, 0x3c) // mini FAT starts at sector 3
  file.writeUInt32LE(1, 0x40) // one mini FAT sector
  file.writeUInt32LE(0xfffffffe, 0x44) // no DIFAT chain
  file.writeUInt32LE(0, 0x48) // no DIFAT sectors
  for (let i = 0; i < 109; i++) file.writeUInt32LE(i === 0 ? 0 : 0xfffffffe, 0x4c + i * 4)

  // Sector 0: the FAT. Sector 0 is the FAT, sectors 1 and 2 chain the directory,
  // sector 3 is the mini FAT and sector 4 the mini stream.
  const fat = 512
  file.writeUInt32LE(0xfffffffd, fat) // sector 0 is the FAT
  file.writeUInt32LE(2, fat + 4) // sector 1 continues into sector 2
  file.writeUInt32LE(0xfffffffe, fat + 8) // sector 2 ends the directory chain
  file.writeUInt32LE(0xfffffffe, fat + 12) // sector 3 ends the mini FAT chain
  file.writeUInt32LE(0xfffffffe, fat + 16) // sector 4 ends the mini-stream chain

  // Sector 3: the mini FAT, one chain per 64-byte mini sector, all single-sector.
  const miniFat = 512 + 3 * sectorSize
  for (let i = 0; i < 3; i++) file.writeUInt32LE(0xfffffffe, miniFat + i * 4)

  // Sector 4: the mini stream. Mini sector 0 is the processor text, 1 the name list, 2 the packed payload.
  const mini = 512 + 4 * sectorSize
  Buffer.from(processorText, 'latin1').copy(file, mini)
  Buffer.from(programText, 'latin1').copy(file, mini + 64)
  packed.copy(file, mini + 128)

  // Sector 1: the directory. Root -> PROCESSOR/ObjectData, then PROGRAM FILES/ObjectData, then DATA FILES.
  const dir = 512 + sectorSize
  const entry = (index: number, name: string, type: number, left: number, right: number, child: number, start: number, size: number): void => {
    const e = dir + index * 128
    Buffer.from(name, 'utf16le').copy(file, e)
    file.writeUInt16LE((name.length + 1) * 2, e + 0x40)
    file.writeInt32LE(left, e + 0x44)
    file.writeInt32LE(right, e + 0x48)
    file.writeInt32LE(child, e + 0x4c)
    file.writeUInt8(type, e + 0x42)
    file.writeUInt8(type === 5 ? 1 : 0, e + 0x43)
    file.writeUInt32LE(start, e + 0x74)
    file.writeUInt32LE(size, e + 0x78)
  }
  const none = -1
  entry(0, 'Root Entry', 5, none, none, 1, 4, 192)
  entry(1, 'PROCESSOR', 1, none, 3, 2, 0, 0)
  entry(2, 'ObjectData', 2, none, none, none, 0, processorText.length)
  entry(3, 'PROGRAM FILES', 1, none, 5, 4, 0, 0)
  entry(4, 'ObjectData', 2, none, none, none, 1, programText.length)
  entry(5, 'DATA FILES', 2, none, none, none, 2, packed.length)

  return file
}

describe('the container reader', () => {
  it('refuses bytes that are not an OLE2 container', () => {
    const error = (() => {
      try {
        parseCfbf(Buffer.from('this is not a container'))
        return undefined
      } catch (e) {
        return e
      }
    })()
    expect(error).toBeInstanceOf(CfbfError)
    expect((error as CfbfError).code).toBe('NOT_A_CONTAINER')
  })

  it('walks the storage tree and paths the streams', () => {
    const file = parseCfbf(buildContainer())
    expect(file.sectorSize).toBe(512)
    expect(file.streams.map(stream => stream.path)).toEqual(['PROCESSOR/ObjectData', 'PROGRAM FILES/ObjectData', 'DATA FILES'])
    expect(file.streams.map(stream => stream.name)).toEqual(['ObjectData', 'ObjectData', 'DATA FILES'])
  })

  it('unpacks the packed stream and reports the declared sizes', () => {
    const file = parseCfbf(buildContainer())
    const stream = file.streams.find(candidate => candidate.path === 'DATA FILES')!
    expect(stream.packed).toBe(true)
    expect(stream.unpackedSize).toBe('DATA FILES!'.length)
    expect(Buffer.from(file.read('DATA FILES')!).toString('latin1')).toBe('DATA FILES!')
    // The stored bytes still carry the header, which is what a caller checking the codec needs.
    expect(Buffer.from(file.raw('DATA FILES')!).readUInt32LE(0)).toBe(2)
    expect(file.streams.find(candidate => candidate.path === 'PROCESSOR/ObjectData')!.packed).toBe(false)
  })

  it('reads a mini-stream payload', () => {
    const file = parseCfbf(buildContainer())
    expect(Buffer.from(file.read('PROCESSOR/ObjectData')!).toString('latin1')).toContain('MML10PF3PX3R9')
  })

  it('names the project, the processor and the ladder program files', () => {
    const identity = readContainerIdentity(buildContainer())
    expect(identity.projectName).toBe('F00607')
    expect(identity.processorType).toBe('MML10PF3PX3R9')
    expect(identity.route).toBe('A\\1.2.3.4\\Backplane\\1')
    expect(identity.ip).toBe('1.2.3.4')
    expect(identity.author).toContain('RSLogix 5')
    expect(identity.programFiles).toEqual(['MAIN DVIM'])
  })
})
