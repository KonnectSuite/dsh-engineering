/**
 * The live-values route for the display preview.
 *
 * `GET /engineering/ftview/live?root=<export>&ip=<controller>&slot=<n>&tags=A,B`
 *
 * The export folder is read to map each HMI tag to its controller tag (the same
 * `Address` column `ftview_live_map` reports). Only those controller tags are
 * read; an HMI memory tag is reported as not-live instead of being given a
 * value. The route is read-only and needs an explicit controller address and
 * slot on every request.
 *
 * @module dsh-engineering-ftview/live-route
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { isIPv4 } from 'node:net'
import { join } from 'node:path'
import { liveMapOf } from './live.ts'
import { TAG_NAME, readFromController, type LiveReader, type LiveValue } from './live-read.ts'
import { parseTagCsv } from './model.ts'

/** What the route needs to answer. */
export interface LiveRouteDeps {
  /** Performs the controller read; injectable for tests. */
  readonly read?: LiveReader
  /** Most HMI tags one request may ask for. Defaults to 64. */
  readonly maxTags?: number
  /** Optional IPv4 allowlist; empty permits any explicit address. */
  readonly allowedAddresses?: readonly string[]
}

/** One route answer. */
export interface LiveRouteAnswer {
  readonly status: number
  readonly body: Readonly<Record<string, unknown>>
}

/** Read the tag CSV from an export folder and map it. */
function mapOfExport(root: string) {
  const tagsFolder = join(root, 'Tags')
  if (!existsSync(tagsFolder)) return undefined
  const csv = readdirSync(tagsFolder).find(file => /\.csv$/iu.test(file))
  if (csv === undefined) return undefined
  const parsed = parseTagCsv(readFileSync(join(tagsFolder, csv), 'utf8'))
  return liveMapOf({
    root,
    name: 'live',
    displays: [],
    tags: parsed.rows,
    tagFiles: [csv],
    tagErrors: parsed.errors,
    diagnostics: [],
    files: [],
  })
}

/**
 * Answer one live-values request.
 *
 * @param url - The request URL, query included.
 * @param deps - Reader and limits.
 * @returns Status and JSON body.
 */
export async function liveRoute(url: URL, deps: LiveRouteDeps = {}): Promise<LiveRouteAnswer> {
  const query = url.searchParams
  const root = query.get('root') ?? ''
  const ip = query.get('ip') ?? ''
  const slot = Number.parseInt(query.get('slot') ?? '0', 10)
  const requested = (query.get('tags') ?? '').split(',').map(tag => tag.trim()).filter(tag => tag !== '')
  const maxTags = deps.maxTags ?? 64
  if (!isIPv4(ip)) return { status: 400, body: { error: 'ip must be an IPv4 address' } }
  if (!Number.isInteger(slot) || slot < 0 || slot > 31) return { status: 400, body: { error: 'slot must be 0..31' } }
  if (requested.length === 0) return { status: 400, body: { error: 'tags must name at least one HMI tag' } }
  if (requested.length > maxTags) return { status: 400, body: { error: `at most ${maxTags} tags per request` } }
  if (requested.some(tag => !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(tag))) return { status: 400, body: { error: 'tag names must be identifiers' } }
  if (deps.allowedAddresses !== undefined && deps.allowedAddresses.length > 0 && !deps.allowedAddresses.includes(ip)) {
    return { status: 403, body: { error: `${ip} is not in the configured address allowlist` } }
  }
  const map = mapOfExport(root)
  if (map === undefined) return { status: 400, body: { error: 'the export has no Tags folder' } }

  const byHmi = new Map(map.tags.map(tag => [tag.hmi, tag]))
  const controllerTags = new Set<string>()
  const notLive: { hmi: string; reason: string }[] = []
  for (const hmi of requested) {
    const tag = byHmi.get(hmi)
    if (tag === undefined) {
      notLive.push({ hmi, reason: 'not declared by the export' })
      continue
    }
    if (!tag.live || tag.plcTag === undefined) {
      notLive.push({ hmi, reason: tag.reason ?? 'not controller-backed' })
      continue
    }
    controllerTags.add(tag.plcTag)
  }
  for (const tag of controllerTags) {
    if (!TAG_NAME.test(tag)) return { status: 400, body: { error: `controller tag ${tag} is not a valid name` } }
  }

  let read
  try {
    read = await (deps.read ?? readFromController)(ip, slot, [...controllerTags], 3000)
  } catch (error) {
    return { status: 502, body: { error: error instanceof Error ? error.message : String(error), read_at: new Date().toISOString() } }
  }

  const values: Record<string, LiveValue & { controller_tag?: string }> = {}
  for (const hmi of requested) {
    const tag = byHmi.get(hmi)
    if (tag === undefined || !tag.live || tag.plcTag === undefined) continue
    const result = read.values[tag.plcTag]
    values[hmi] = result === undefined
      ? { quality: 'bad', error: 'the controller returned no value', controller_tag: tag.plcTag }
      : { ...result, controller_tag: tag.plcTag }
  }
  return {
    status: 200,
    body: {
      values,
      not_live: notLive,
      controller: read.controller,
      read_at: read.read_at,
      tags_read: [...controllerTags],
    },
  }
}

/** One display file answer. */
export interface DisplayAnswer {
  readonly status: number
  readonly body: string
  readonly contentType: string
}

/**
 * Read one display file from an export, for preview navigation.
 *
 * The name is restricted to a display-file name so the route cannot reach
 * outside `Displays/`.
 *
 * @param url - Request URL with `root` and `name`.
 * @returns The XML, or a short error.
 */
export function displayRoute(url: URL): DisplayAnswer {
  const root = url.searchParams.get('root') ?? ''
  const name = url.searchParams.get('name') ?? ''
  if (!/^[A-Za-z0-9 _().-]{1,120}$/u.test(name)) {
    return { status: 400, body: JSON.stringify({ error: 'name must be a display file name' }), contentType: 'application/json' }
  }
  const file = join(root, 'Displays', `${name}.xml`)
  if (!existsSync(file)) {
    return { status: 404, body: JSON.stringify({ error: `no display named ${name}` }), contentType: 'application/json' }
  }
  try {
    return { status: 200, body: readFileSync(file, 'utf8'), contentType: 'application/xml; charset=utf-8' }
  } catch (error) {
    return { status: 500, body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), contentType: 'application/json' }
  }
}

/** An answer that may carry binary image data. */
export interface BinaryAnswer {
  readonly status: number
  readonly body: string | Uint8Array
  readonly contentType: string
}

/**
 * Serve the Global Objects files beside an export.
 *
 * Reference objects (`isReferenceObject="true"`) inherit states, captions and
 * children from a global object; without these files a preview draws only the
 * local placement, which is exactly the header/footer that goes missing.
 *
 * @param url - Request URL with `root`.
 * @returns JSON `{ files: [{ name, xml }] }`.
 */
export function globalsRoute(url: URL): DisplayAnswer {
  const root = url.searchParams.get('root') ?? ''
  const folder = join(root, 'Global Objects')
  if (!existsSync(folder)) return { status: 200, body: JSON.stringify({ files: [] }), contentType: 'application/json' }
  try {
    const files = readdirSync(folder)
      .filter(file => /\.xml$/iu.test(file))
      .slice(0, 100)
      .map(file => ({ name: file.replace(/\.xml$/iu, ''), xml: readFileSync(join(folder, file), 'utf8') }))
    return { status: 200, body: JSON.stringify({ files }), contentType: 'application/json' }
  } catch (error) {
    return { status: 500, body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), contentType: 'application/json' }
  }
}

/**
 * Serve one bitmap from the export's `Images/` folder.
 *
 * @param url - Request URL with `root` and `name`.
 * @returns The image bytes, or a short error.
 */
export function imageRoute(url: URL): BinaryAnswer {
  const root = url.searchParams.get('root') ?? ''
  const name = url.searchParams.get('name') ?? ''
  // Studio stores the bitmap as `<name>.bmp`, but a display object refers to the
  // image by name only (`imageName="Equilateral triangle"`), so the extension is
  // optional here and the lookup is case-insensitive.
  if (!/^[A-Za-z0-9 _().-]{1,120}(\.(bmp|jpg|jpeg|png|gif))?$/iu.test(name)) {
    return { status: 400, body: JSON.stringify({ error: 'name must be an image file name' }), contentType: 'application/json' }
  }
  const folder = join(root, 'Images')
  const entries = existsSync(folder) ? readdirSync(folder) : []
  const candidates = /\.[A-Za-z0-9]{2,4}$/u.test(name)
    ? [name]
    : [name, `${name}.bmp`, `${name}.png`, `${name}.jpg`, `${name}.jpeg`, `${name}.gif`]
  const resolved = candidates
    .map(candidate => entries.find(entry => entry.toLowerCase() === candidate.toLowerCase()))
    .find(entry => entry !== undefined)
  if (resolved === undefined) {
    return { status: 404, body: JSON.stringify({ error: `no image named ${name}` }), contentType: 'application/json' }
  }
  const file = join(folder, resolved)
  if (!existsSync(file)) {
    return { status: 404, body: JSON.stringify({ error: `no image named ${name}` }), contentType: 'application/json' }
  }
  const extension = name.split('.').pop()?.toLowerCase() ?? ''
  const type = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
  try {
    return { status: 200, body: readFileSync(file), contentType: type }
  } catch (error) {
    return { status: 500, body: JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), contentType: 'application/json' }
  }
}