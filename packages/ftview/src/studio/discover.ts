/**
 * Bounded discovery of FactoryTalk View Studio ME tooling.
 *
 * Reads directories through the filesystem provider, never executes anything.
 * A missing install is reported as such; absence of a utility is not an error,
 * because the manual Studio workflow does not need it.
 *
 * @module dsh-engineering-ftview/studio/discover
 */

import { createHash } from 'node:crypto'
import type { FsService } from '../core.ts'

/** One executable the discovery found. */
export interface DiscoveredUtility {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

/** What the discovery found. */
export interface StudioDiscovery {
  readonly searched: readonly string[]
  readonly products: readonly string[]
  readonly schemas: readonly string[]
  readonly utilities: readonly DiscoveredUtility[]
  readonly help: readonly string[]
  readonly truncated: boolean
}

/** Directory depth the discovery walks below each root. */
const MAX_DEPTH = 4

/** Directory entries the discovery visits per root before it stops. */
const MAX_ENTRIES_PER_ROOT = 4000

/** Known install roots for FactoryTalk View on Windows. */
export const DEFAULT_SEARCH_ROOTS: readonly string[] = [
  'C:/Program Files (x86)/Rockwell Software',
  'C:/Program Files/Rockwell Software',
]

/** Walk one root and collect products, schemas, utilities and help files. */
async function walkRoot(
  fs: FsService,
  root: string,
  signal: AbortSignal | undefined,
  found: { products: string[]; schemas: string[]; utilities: DiscoveredUtility[]; help: string[]; truncated: boolean },
): Promise<void> {
  const queue: { path: string; depth: number }[] = [{ path: root, depth: 0 }]
  let visited = 0
  while (queue.length > 0) {
    signal?.throwIfAborted()
    const current = queue.shift() as { path: string; depth: number }
    let entries: readonly { name: string; type: string }[]
    try {
      entries = fs.listDir === undefined ? [] : await fs.listDir(current.path, signal)
    } catch {
      continue
    }
    for (const entry of entries) {
      visited += 1
      if (visited > MAX_ENTRIES_PER_ROOT) {
        found.truncated = true
        return
      }
      const path = `${current.path}/${entry.name}`
      if (entry.type === 'directory') {
        if (/FactoryTalk View/i.test(entry.name)) found.products.push(path)
        if (current.depth < MAX_DEPTH) queue.push({ path, depth: current.depth + 1 })
        continue
      }
      if (/^SEAddComponent\.exe$/iu.test(entry.name)) {
        try {
          const bytes = await fs.readBytes(path, signal, 64 * 1024 * 1024)
          found.utilities.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') })
        } catch {
          found.utilities.push({ path, bytes: 0, sha256: '' })
        }
        continue
      }
      if (/^Gfx-ME.*\.xsd$/iu.test(entry.name)) found.schemas.push(path)
      if (/\.chm$/iu.test(entry.name)) found.help.push(path)
    }
  }
}

/**
 * Discover View Studio tooling under the configured roots.
 *
 * @param fs - Filesystem provider.
 * @param roots - Absolute roots to search.
 * @param signal - Cancellation.
 * @returns What was found, plus the roots that were searched.
 */
export async function discoverStudio(fs: FsService, roots: readonly string[], signal: AbortSignal | undefined): Promise<StudioDiscovery> {
  const found = { products: [] as string[], schemas: [] as string[], utilities: [] as DiscoveredUtility[], help: [] as string[], truncated: false }
  const searched: string[] = []
  for (const root of roots) {
    const resolved = await fs.resolve(root, {
      ...(signal === undefined ? {} : { signal }),
    })
    const info = await fs.stat(resolved, signal)
    searched.push(resolved)
    if (info === undefined || info.type !== 'directory') continue
    await walkRoot(fs, resolved, signal, found)
  }
  return { searched, ...found }
}
