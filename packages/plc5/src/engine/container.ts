import { inflateSync } from 'node:zlib'

/**
 * A reader for the OLE2 compound file an RSLogix 5 `.RSP` project is stored in.
 *
 * RSLogix 5 keeps a project as compound-file storages: the directory tree names
 * a storage per program file, and each stream under it is either plain or
 * packed behind a 16-byte header whose payload is zlib. Reading the tree and
 * unpacking those payloads is what lets this component answer anything about a
 * project without the vendor product installed. Everything here is read-only:
 * the container is opened, walked, and never written.
 */

/** The magic every CFBF file starts with. */
const MAGIC = new Uint8Array([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])

const SECT_NOSTREAM = 0xFFFFFFFF
const SECT_MAX = 0xFFFFFFFE
const SECT_ENDOFCHAIN = 0xFFFFFFFE
const SECT_FATSECT = 0xFFFFFFFD

/** The packed-stream header version RSLogix 5 writes. */
const PACK_VERSION = 2
/** The zlib header byte that starts every deflate stream Python, .NET and RSLogix write. */
const ZLIB_LOW = 0x78

/** One named stream in the container. */
export interface CfbfStream {
  readonly index: number
  /** The slash-separated path from the container root, e.g. `PROJECT/RUNG DATA`. */
  readonly path: string
  /** The last path component. */
  readonly name: string
  /** The stored size, which for a packed stream is the packed size. */
  readonly size: number
  /** True when the payload is packed and this reader unpacked it. */
  readonly packed: boolean
  /** The unpacked size, when the payload was packed and unpacked. */
  readonly unpackedSize: number | undefined
}

/** A parsed `.RSP` container. */
export interface CfbfFile {
  readonly sectorSize: number
  readonly streams: readonly CfbfStream[]
  /** Read one stream's bytes, unpacked when it was packed; undefined when the path is absent. */
  read(path: string): Uint8Array | undefined
  /** Read one stream's bytes exactly as stored, packed header included. */
  raw(path: string): Uint8Array | undefined
}

/** A PLC-5 container parse failure. */
export class CfbfError extends Error {
  readonly code: string
  readonly fix: string

  constructor(code: string, message: string, fix: string) {
    super(message)
    this.name = 'CfbfError'
    this.code = code
    this.fix = fix
  }
}

function u16(bytes: Uint8Array, at: number): number {
  return bytes[at]! | (bytes[at + 1]! << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  return (bytes[at]! | (bytes[at + 1]! << 8) | (bytes[at + 2]! << 16) | (bytes[at + 3]! << 24)) >>> 0
}

function u64(bytes: Uint8Array, at: number): number {
  return u32(bytes, at) + u32(bytes, at + 4) * 2 ** 32
}

/** A directory entry id, where -1 means "none" (the CFBF constant 0xFFFFFFFF). */
function id32(bytes: Uint8Array, at: number): number {
  return u32(bytes, at) | 0
}

/**
 * Unpack a packed stream, or hand back the stored bytes when it is not packed.
 *
 * @param payload - the bytes as stored.
 * @returns the payload plus what the header declared, so the caller can report it.
 */
function unpack(payload: Uint8Array): { data: Uint8Array; packed: boolean; unpackedSize: number | undefined } {
  if (payload.length < 16 || u32(payload, 0) !== PACK_VERSION) {
    return { data: payload, packed: false, unpackedSize: undefined }
  }
  // Header: version (0), header length (4), packed length (8), unpacked length (12).
  const headerLength = u32(payload, 4)
  const packedLength = u32(payload, 8)
  const unpackedLength = u32(payload, 12)
  if (headerLength < 8 || headerLength + packedLength > payload.length) {
    return { data: payload, packed: false, unpackedSize: undefined }
  }
  if (payload[headerLength] !== ZLIB_LOW) {
    return { data: payload, packed: false, unpackedSize: undefined }
  }
  try {
    const data = new Uint8Array(inflateSync(payload.subarray(headerLength, headerLength + packedLength)))
    return { data, packed: true, unpackedSize: unpackedLength }
  } catch {
    // A payload this reader cannot unpack is still a payload worth reading as stored:
    // reporting the stream with its packed bytes beats refusing the whole project.
    return { data: payload, packed: false, unpackedSize: undefined }
  }
}

/**
 * Parse a CFBF (`.RSP`) container and list every stream in its directory tree.
 *
 * @param bytes - the whole file.
 * @returns the stream census and a reader for the stored bytes.
 * @throws CfbfError when the file is not structured storage.
 */
export function parseCfbf(bytes: Uint8Array): CfbfFile {
  for (let i = 0; i < 8; i++) {
    if (bytes[i] !== MAGIC[i]) {
      throw new CfbfError(
        'NOT_A_CONTAINER',
        'The file is not an OLE2 compound file, so it is not an RSLogix 5 .RSP container.',
        'Pass the .RSP project file itself; a Save-As text export is a different format.',
      )
    }
  }
  const sectorSize = 2 ** u16(bytes, 0x1e)
  const miniSize = 2 ** u16(bytes, 0x20)
  const numFatSectors = u32(bytes, 0x2c)
  const dirStart = u32(bytes, 0x30)
  const cutoff = u32(bytes, 0x38)
  const minifatStart = u32(bytes, 0x3c)
  const numMinifatSectors = u32(bytes, 0x40)
  const difatStart = u32(bytes, 0x44)
  const numDifatSectors = u32(bytes, 0x48)
  if (sectorSize < 128 || (sectorSize & (sectorSize - 1)) !== 0) {
    throw new CfbfError('NOT_A_CONTAINER', 'The container header declares an unusable sector size.', 'The file is corrupt; recover it from backup and retry.')
  }

  const sectorAt = (sector: number): number => (sector + 1) * sectorSize

  // The FAT lives in the sectors named by the DIFAT: 109 entries in the
  // header, then a chain of DIFAT sectors.
  const fatSectorList: number[] = []
  for (let i = 0; i < 109; i++) {
    const value = u32(bytes, 0x4c + i * 4)
    if (value !== SECT_NOSTREAM && value !== SECT_MAX) fatSectorList.push(value)
  }
  let chainSector = difatStart
  let guard = 0
  while (chainSector !== SECT_ENDOFCHAIN && chainSector !== SECT_NOSTREAM && guard++ < numDifatSectors + 8) {
    const base = sectorAt(chainSector)
    if (base + sectorSize > bytes.length) break
    const entries = sectorSize / 4
    for (let i = 0; i < entries - 1; i++) {
      const value = u32(bytes, base + i * 4)
      if (value !== SECT_NOSTREAM && value !== SECT_MAX) fatSectorList.push(value)
    }
    chainSector = u32(bytes, base + (entries - 1) * 4)
  }
  const fat = new Int32Array(numFatSectors * (sectorSize / 4))
  for (let i = 0; i < fatSectorList.length && i < numFatSectors; i++) {
    const base = sectorAt(fatSectorList[i]!)
    for (let j = 0; j < sectorSize / 4 && i * (sectorSize / 4) + j < fat.length; j++) {
      fat[i * (sectorSize / 4) + j] = u32(bytes, base + j * 4) | 0
    }
  }

  const chainOf = (start: number): number[] => {
    const sectors: number[] = []
    let sector = start
    let seen = 0
    while (sector !== SECT_ENDOFCHAIN && sector >= 0 && sector < fat.length && seen++ < fat.length) {
      sectors.push(sector)
      sector = fat[sector]!
    }
    return sectors
  }

  const readSectors = (sectors: readonly number[]): Uint8Array => {
    const out = new Uint8Array(sectors.length * sectorSize)
    for (let i = 0; i < sectors.length; i++) {
      const base = sectorAt(sectors[i]!)
      out.set(bytes.subarray(base, Math.min(base + sectorSize, bytes.length)), i * sectorSize)
    }
    return out
  }

  // The root entry's stream is the mini-stream container; read it first.
  const dirSectors = chainOf(dirStart)
  const dirBytes = readSectors(dirSectors)
  type DirEntry = {
    name: string
    type: number
    left: number
    right: number
    child: number
    start: number
    size: number
  }
  const entries: DirEntry[] = []
  for (let i = 0; i * 128 < dirBytes.length; i++) {
    const at = i * 128
    const nameLength = u16(dirBytes, at + 0x40)
    const type = dirBytes[at + 0x42] ?? 0
    if (nameLength < 2 || type === 0) {
      entries.push({ name: '', type: 0, left: -1, right: -1, child: -1, start: 0, size: 0 })
      continue
    }
    let name = ''
    for (let c = 0; c + 1 < nameLength - 2; c += 2) {
      name += String.fromCharCode(dirBytes[at + c]! | (dirBytes[at + c + 1]! << 8))
    }
    entries.push({
      name,
      type,
      left: id32(dirBytes, at + 0x44),
      right: id32(dirBytes, at + 0x48),
      child: id32(dirBytes, at + 0x4c),
      start: u32(dirBytes, at + 0x74),
      size: u64(dirBytes, at + 0x78),
    })
  }

  const root = entries[0]
  const miniContainer = root !== undefined && root.type === 5 ? readSectors(chainOf(root.start)) : new Uint8Array(0)

  // Mini FAT chains the 64-byte mini sectors inside the root stream.
  const minifat = new Int32Array(numMinifatSectors * (sectorSize / 4))
  {
    const miniFatSectors: number[] = []
    let sector = minifatStart
    let seen = 0
    while (sector !== SECT_ENDOFCHAIN && sector >= 0 && sector < fat.length && seen++ < fat.length) {
      miniFatSectors.push(sector)
      sector = fat[sector]!
    }
    for (let i = 0; i < miniFatSectors.length; i++) {
      const base = sectorAt(miniFatSectors[i]!)
      for (let j = 0; j < sectorSize / 4 && i * (sectorSize / 4) + j < minifat.length; j++) {
        minifat[i * (sectorSize / 4) + j] = u32(bytes, base + j * 4) | 0
      }
    }
  }

  const readStream = (entry: DirEntry): Uint8Array => {
    if (entry.size === 0) return new Uint8Array(0)
    if (entry.size < cutoff && entry.name !== '') {
      const out = new Uint8Array(entry.size)
      let sector = entry.start
      let at = 0
      let seen = 0
      while (sector !== SECT_ENDOFCHAIN && at < entry.size && seen++ < minifat.length) {
        const base = sector * miniSize
        const end = Math.min(base + miniSize, miniContainer.length, base + entry.size - at)
        out.set(miniContainer.subarray(base, end), at)
        at += miniSize
        sector = minifat[sector]!
      }
      return out
    }
    return readSectors(chainOf(entry.start)).subarray(0, entry.size)
  }

  // Walk the directory tree instead of the raw entry array: every storage owns a
  // red-black tree of siblings, and the same stream name ("ObjectData") appears
  // under many storages. Paths are the only way to address them apart.
  const streams: CfbfStream[] = []
  const rawByPath = new Map<string, Uint8Array>()
  const dataByPath = new Map<string, Uint8Array>()
  const visited = new Set<number>()
  const visit = (id: number, prefix: string): void => {
    if (id < 0 || id >= entries.length || visited.has(id)) return
    visited.add(id)
    const entry = entries[id]!
    if (entry.left >= 0) visit(entry.left, prefix)
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.type === 2 && entry.name !== '') {
      const stored = readStream(entry)
      const { data, packed, unpackedSize } = unpack(stored)
      streams.push({ index: id, path, name: entry.name, size: entry.size, packed, unpackedSize })
      rawByPath.set(path, stored)
      dataByPath.set(path, data)
    } else if (entry.type === 1 && entry.child >= 0) {
      visit(entry.child, path)
    }
    if (entry.right >= 0) visit(entry.right, prefix)
  }
  if (root !== undefined && root.child >= 0) visit(root.child, '')

  return {
    sectorSize,
    streams,
    read(path: string): Uint8Array | undefined {
      return dataByPath.get(path)
    },
    raw(path: string): Uint8Array | undefined {
      return rawByPath.get(path)
    },
  }
}

/** The identity an RSLogix 5 project records about its controller. */
export interface Plc5ContainerIdentity {
  /** The project name the file records, for example `F00607`. */
  readonly projectName: string
  readonly processorType: string
  readonly author: string
  readonly ip: string
  readonly route: string
  /** The ladder program files the project names, in file order. */
  readonly programFiles: readonly string[]
  readonly revisionNotes: string
}

/** Class names RSLogix 5 writes as object markers, never as a project or file name. */
const CLASS_NAMES = new Set([
  'CProc',
  'CProgHolder4',
  'CProgFile0',
  'CProgFile',
  'CLadFile',
  'CRung',
  'CBranch',
  'CBranchLeg',
  'CBlock',
  'CSfcFile',
  'CStFile',
  'CDataBlk',
  'CProgObj',
  'CDataObj',
  'CRevisionA',
])

/** The printable runs of a stream, the way a strings dump finds them. */
function printableRuns(bytes: Uint8Array, min: number): string[] {
  const runs: string[] = []
  let current = ''
  for (const byte of bytes) {
    if (byte >= 0x20 && byte < 0x7f) {
      current += String.fromCharCode(byte)
      continue
    }
    if (current.length >= min) runs.push(current)
    current = ''
  }
  if (current.length >= min) runs.push(current)
  return runs
}

/**
 * Pull the processor identity and program-file names out of the container.
 *
 * The container is the only view that needs no vendor product. RSLogix 5 keeps
 * each subsystem in a storage, and the payload in that storage's single
 * `ObjectData` stream: `PROCESSOR/ObjectData` carries the type string
 * (`MML10PF3PX3R9`), the project name, the author string and the RSWho route
 * (`045_VIM\10.164.108.113\Backplane\1\CH A\1`); `PROGRAM FILES/ObjectData`
 * names the ladder program files in order. Those payloads are plain, but the
 * reader unpacks any stream that is packed, because the same codec is used
 * across the file.
 *
 * @param bytes - the whole `.RSP` file.
 * @returns what the container itself says.
 */
export function readContainerIdentity(bytes: Uint8Array): Plc5ContainerIdentity {
  const file = parseCfbf(bytes)
  const storage = (name: string): Uint8Array => {
    const stream = file.streams.find(candidate => candidate.path === name || candidate.path.startsWith(`${name}/`))
    return stream === undefined ? new Uint8Array(0) : (file.read(stream.path) ?? new Uint8Array(0))
  }

  const processorRuns = printableRuns(storage('PROCESSOR'), 4)
  // The recorded route run reads `7MML10PF3PX3R9!045_VIM\10.164.108.113\Backplane\...`:
  // a length byte rendered as a leading digit, the type string, then `!` and the route.
  const routeRun = processorRuns.find(run => run.includes('\\Backplane\\')) ?? ''
  const parts = routeRun.split('!')
  const processorType = (parts[0] ?? '').replace(/^\d+/u, '')
  const route = parts[1] ?? ''
  const projectName = processorRuns.find(run => /^[A-Z][A-Z0-9_-]{1,15}$/u.test(run) && !CLASS_NAMES.has(run)) ?? ''
  const author = (processorRuns.find(run => /RSLogix\s*5/u.test(run)) ?? '').replace(/^!/u, '')
  const ipMatch = (route !== '' ? route : processorRuns.join(' ')).match(/\d{1,3}(?:\.\d{1,3}){3}/u)

  // The name list sits between the `CProgFile0` marker and the closing `CProgFile` record;
  // slicing there keeps object markers and every unrelated run out of the list.
  const programRuns = printableRuns(storage('PROGRAM FILES'), 3)
  const firstMarker = programRuns.indexOf('CProgFile0')
  const closingMarker = firstMarker < 0 ? -1 : programRuns.indexOf('CProgFile', firstMarker + 1)
  const nameRuns = firstMarker < 0 ? programRuns : programRuns.slice(firstMarker + 1, closingMarker < 0 ? undefined : closingMarker)
  const programFiles = [...new Set(nameRuns.filter(run => /^[A-Z][A-Z0-9 _-]{2,24}$/u.test(run) && !CLASS_NAMES.has(run)))].slice(0, 200)

  const revisionNotes = printableRuns(storage('REVISION NOTES'), 8)
    .filter(run => /^Rev#/u.test(run))
    .slice(0, 5)
    .join(' | ')
  return {
    projectName,
    processorType,
    author,
    ip: ipMatch?.[0] ?? '',
    route,
    programFiles,
    revisionNotes,
  }
}
