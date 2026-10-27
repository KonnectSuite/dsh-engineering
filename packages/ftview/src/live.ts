/**
 * Which HMI tags actually come from a controller.
 *
 * The full export server never carries the tag database, so the CSV the tool
 * copies is a snapshot; this module answers the narrower question a live viewer
 * needs: of the tags the application declares, which ones name a controller tag
 * that can be read over EtherNet/IP, and which are HMI memory.
 *
 * The mapping is read from the export's own CSV: the `Address` column holds
 * `::[<topic>]<tag>` for a controller-backed tag, and the `Data Source` column
 * names the HMI device. A tag with no address is memory and is never invented.
 *
 * @module dsh-engineering-ftview/live
 */

import type { Application, TagRow } from './model.ts'

/** One tag, with the controller reference the CSV states. */
export interface LiveTag {
  /** HMI tag name. */
  readonly hmi: string
  /** HMI tag type as the CSV writes it (D, A, S, …). */
  readonly type: string
  /** HMI device from the `Data Source` column, when named. */
  readonly device?: string
  /** Raw address text, when the row has one. */
  readonly address?: string
  /** Controller topic (`Laminator`, `PLC`, …). */
  readonly topic?: string
  /** Controller tag name inside that topic. */
  readonly plcTag?: string
  /** True when the tag can be read from a controller. */
  readonly live: boolean
  /** Why it cannot be read, when it cannot. */
  readonly reason?: 'memory' | 'direct-address'
}

/** The mapping for one application. */
export interface LiveMap {
  readonly application: string
  readonly tags: readonly LiveTag[]
  readonly totals: {
    readonly all: number
    readonly live: number
    readonly memory: number
    readonly direct: number
  }
  /** Controller topics named by the live tags. */
  readonly topics: readonly string[]
  /** HMI devices named by the CSV. */
  readonly devices: readonly string[]
}

/** A parsed `::[topic]tag` reference. */
export interface TagReference {
  readonly topic?: string
  readonly tag: string
}

/**
 * Parse a FactoryTalk View tag address.
 *
 * `::[Laminator]In_ABPower_IsOn` names the topic `Laminator` and the tag
 * `In_ABPower_IsOn`. A bare `::Tag` names a tag on the default topic. Anything
 * else (a direct PLC address such as `N7:0`) is not a symbolic tag read.
 *
 * @param value - The CSV `Address` cell.
 * @returns The reference, or undefined when the cell is not a tag address.
 */
export function parseAddress(value: string): TagReference | undefined {
  const text = value.trim()
  if (text === '') return undefined
  const topic = /^::\[([^\]]+)\](.+)$/u.exec(text)
  if (topic !== null) {
    const tag = (topic[2] ?? '').trim()
    return tag === '' ? undefined : { topic: (topic[1] ?? '').trim(), tag }
  }
  const bare = /^::(.+)$/u.exec(text)
  if (bare !== null) {
    const tag = (bare[1] ?? '').trim()
    return tag === '' ? undefined : { tag }
  }
  return undefined
}

/** One column by a case-insensitive name, whatever the export's spacing. */
function column(row: TagRow, name: string): string | undefined {
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(row.raw)) {
    if (key.trim().toLowerCase() === wanted) return value
  }
  return undefined
}

/**
 * Map every tag the application declares.
 *
 * @param app - The scanned export.
 * @returns The mapping and its coverage totals.
 */
export function liveMapOf(app: Application): LiveMap {
  const tags: LiveTag[] = []
  const topics = new Set<string>()
  const devices = new Set<string>()
  const totals = { all: 0, live: 0, memory: 0, direct: 0 }

  for (const row of app.tags) {
    const address = column(row, 'Address')?.trim()
    const device = column(row, 'Data Source')?.trim()
    if (device !== undefined && device !== '') devices.add(device)
    const reference = address === undefined ? undefined : parseAddress(address)
    const base = {
      hmi: row.name,
      type: row.type,
      ...(device === undefined || device === '' ? {} : { device }),
      ...(address === undefined || address === '' ? {} : { address }),
    }
    totals.all += 1
    if (reference === undefined) {
      const reason = address === undefined || address === '' ? 'memory' : 'direct-address'
      totals[reason === 'memory' ? 'memory' : 'direct'] += 1
      tags.push({ ...base, live: false, reason })
      continue
    }
    if (reference.topic !== undefined) topics.add(reference.topic)
    totals.live += 1
    tags.push({ ...base, topic: reference.topic, plcTag: reference.tag, live: true })
  }

  return {
    application: app.name,
    tags,
    totals,
    topics: [...topics].sort(),
    devices: [...devices].sort(),
  }
}
