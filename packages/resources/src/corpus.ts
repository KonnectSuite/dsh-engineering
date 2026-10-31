/**
 * Loading and searching the engineering corpus.
 *
 * The corpus is Markdown with front matter; `scripts/gen-resources.mjs` turns it
 * into `index.json` and `SOURCE.json`. This module reads only those generated
 * files plus the page bodies, so searching is deterministic and needs no model,
 * network or tokenizer.
 *
 * @module dsh-engineering-resources/corpus
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** One page as the index records it. */
export interface PageRow {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly level: string
  readonly basis: readonly string[]
  readonly tags: readonly string[]
  readonly applies_to: readonly string[]
  readonly rules: readonly string[]
  readonly words: number
  readonly bytes: number
  readonly sha256: string
}

/** The generated index. */
export interface CorpusIndex {
  readonly corpus: number
  readonly pages: readonly PageRow[]
}

/** Where the corpus lives, relative to the built module. */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** One hit from a search. */
export interface CorpusHit {
  readonly id: string
  readonly title: string
  readonly domain: string
  readonly level: string
  readonly rules: readonly string[]
  readonly score: number
}

/** The corpus in memory, or the reason it is unavailable. */
export interface Corpus {
  readonly index: CorpusIndex
  readonly digest: string
  readonly directory: string
}

let cached: Corpus | undefined

/**
 * Load the index and source pin once per process.
 *
 * @returns The corpus.
 * @throws when the generated files are missing, which means the build did not run.
 */
export function corpus(): Corpus {
  if (cached !== undefined) return cached
  const indexPath = join(ROOT, 'index.json')
  const sourcePath = join(ROOT, 'SOURCE.json')
  if (!existsSync(indexPath) || !existsSync(sourcePath)) {
    throw Object.assign(new Error('The engineering corpus is missing; run `pnpm resources:build` before packing.'), { code: 'RESOURCES_MISSING' })
  }
  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as CorpusIndex
  const source = JSON.parse(readFileSync(sourcePath, 'utf8')) as { digest: string }
  if (!Array.isArray(index.pages) || index.pages.length === 0) {
    throw Object.assign(new Error('The engineering corpus is empty; run `pnpm resources:build`.'), { code: 'RESOURCES_MISSING' })
  }
  cached = { index, digest: source.digest, directory: ROOT }
  return cached
}

/**
 * Read one page body.
 *
 * @param id - Page id, as listed by the contents.
 * @returns Markdown body.
 */
export function pageBody(id: string): string {
  const { index } = corpus()
  const row = index.pages.find(page => page.id === id)
  if (row === undefined) {
    throw Object.assign(new Error(`No resource page named "${id}".`), { code: 'COMPONENT_NOT_FOUND' })
  }
  const path = join(ROOT, 'corpus', row.domain, `${row.id}.md`)
  if (!existsSync(path)) {
    throw Object.assign(new Error(`The page file for "${id}" is missing from the corpus.`), { code: 'RESOURCES_MISSING' })
  }
  // Strip the front matter: the index already carries it, and repeating it in
  // the answer spends tokens for nothing.
  return readFileSync(path, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
}

/** Score one page against a query. Higher is better; zero is no hit. */
function scoreOf(row: PageRow, needle: string): number {
  if (row.id === needle) return 100
  if (row.rules.some(rule => rule.toLowerCase() === needle)) return 95
  if (row.title.toLowerCase() === needle) return 90
  if (row.tags.some(tag => tag.toLowerCase() === needle)) return 80
  if (row.id.includes(needle)) return 60
  if (row.title.toLowerCase().includes(needle)) return 55
  if (row.tags.some(tag => tag.toLowerCase().includes(needle))) return 45
  if (row.rules.some(rule => rule.toLowerCase().startsWith(needle))) return 40
  if (row.domain === needle) return 35
  return 0
}

/**
 * Rank pages by metadata, then by body text for the remainder.
 *
 * @param query - Free text, rule id, tag or page id.
 * @param limit - Most hits to return.
 * @param domain - Optional domain filter.
 * @returns Ranked hits, best first.
 */
export function search(query: string, limit = 8, domain?: string): readonly CorpusHit[] {
  const { index } = corpus()
  const needle = query.trim().toLowerCase()
  const tokens = needle.split(/\s+/u).filter(Boolean)
  const pool = domain === undefined ? index.pages : index.pages.filter(page => page.domain === domain)
  const scored = pool
    .map(row => ({ row, score: tokens.reduce((sum, token) => sum + scoreOf(row, token), 0) }))
    .filter(hit => hit.score > 0)
  if (scored.length < limit) {
    const seen = new Set(scored.map(hit => hit.row.id))
    for (const row of pool) {
      if (seen.has(row.id)) continue
      try {
        const body = pageBody(row.id).toLowerCase()
        if (tokens.every(token => body.includes(token))) scored.push({ row, score: 20 })
      } catch {
        // A missing page file is reported when it is read, not during ranking.
      }
    }
  }
  return scored
    .sort((left, right) => right.score - left.score || left.row.id.localeCompare(right.row.id))
    .slice(0, Math.min(Math.max(limit, 1), 20))
    .map(hit => ({ id: hit.row.id, title: hit.row.title, domain: hit.row.domain, level: hit.row.level, rules: hit.row.rules, score: hit.score }))
}

/** Domain order for the contents listing. */
export const DOMAINS = ['iec', 'rockwell', 'migration', 'yaskawa', 'view', 'optix', 'craft'] as const

/** The contents, grouped by domain, with word counts. */
export function contents(): { domains: readonly string[]; pages: readonly { id: string; title: string; domain: string; level: string; words: number }[] } {
  const { index } = corpus()
  return {
    domains: DOMAINS.filter(domain => index.pages.some(page => page.domain === domain)),
    pages: index.pages.map(page => ({ id: page.id, title: page.title, domain: page.domain, level: page.level, words: page.words })),
  }
}
