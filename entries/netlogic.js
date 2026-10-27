/**
 * FactoryTalk Optix NetLogic retrieval.
 *
 * The vendor repository (FactoryTalk-Optix/NetLogic_CheatSheet) is vendored as a
 * pinned snapshot by `scripts/sync-netlogic.mjs`. This entry exposes it as one tool
 * so a model can pull the page it needs instead of every page at once: the table of
 * contents costs a few hundred tokens, a page a few thousand.
 *
 * Every answer carries the page's risk flag and the upstream disclaimer. The
 * repository itself says the snippets may use non-public APIs, may break a project
 * and are not for production as-is; this module must not outrank that.
 *
 * @module dsh-engineering/entries/netlogic
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Plugin name in a composition. */
export const name = 'engineering-optix-netlogic'

/** The tool needs the registry; the skill is registered when the host offers it. */
export const inject = ['tools']

/** Registration metadata, kept here so a test can assert it without the file. */
export const SKILL = {
  name: 'factorytalk-optix',
  description: 'FactoryTalk Optix Studio engineering: inspect and author the loaded project through the Studio bridge, validate expressions, take preview screenshots, read NetLogic C# snippets from the pinned cheat-sheet snapshot, and start from a template.',
  whenToUse: 'The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, or the emulator preview. Route FactoryTalk View ME elsewhere.',
}

/** The upstream statement every page result repeats. */
export const DISCLAIMER = 'Reference only. The upstream repository states these snippets may use non-public APIs, may break a project, and must not be used in production as-is; adapt and test them in your own project.'

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIRS = [
  join(HERE, '..', 'vendor', 'optix', 'netlogic'),
  join(HERE, '..', 'packages', 'optix', 'netlogic'),
]
const SKILL_PATHS = [
  join(HERE, '..', 'vendor', 'optix', 'SKILL.md'),
  join(HERE, '..', 'packages', 'optix', 'SKILL.md'),
]

const RISKS = new Set(['normal', 'advanced', 'unsupported'])

/** The first existing path from a candidate list. */
function first(candidates) {
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  return undefined
}

/** The vendored snapshot directory, or undefined when it was not shipped. */
export function dataDirectory() {
  return first(DATA_DIRS)
}

/** Cached index and source pin; the snapshot is immutable for a process. */
let cachedSnapshot
function snapshot() {
  if (cachedSnapshot === undefined) cachedSnapshot = loadSnapshot()
  return cachedSnapshot
}

/** Cached page text, keyed by slug. */
const pageCache = new Map()

/** Read the generated index and source pin. */
export function loadSnapshot() {
  const directory = dataDirectory()
  if (directory === undefined) throw new Error('The NetLogic snapshot is missing; run `pnpm netlogic:sync` before packing.')
  const index = JSON.parse(readFileSync(join(directory, 'index.json'), 'utf8'))
  const source = JSON.parse(readFileSync(join(directory, 'SOURCE.json'), 'utf8'))
  if (!Array.isArray(index) || index.length === 0) throw new Error('The NetLogic index is empty; run `pnpm netlogic:sync`.')
  for (const row of index) {
    if (typeof row?.slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(row.slug)) throw new Error(`The NetLogic index has an invalid slug: ${String(row?.slug)}`)
    if (!RISKS.has(row.risk)) throw new Error(`The NetLogic index has an invalid risk for ${row.slug}: ${String(row.risk)}`)
  }
  return { directory, index, source }
}

/** Read one page's markdown, refusing anything outside the snapshot. */
export function pageOf(slug) {
  if (typeof slug !== 'string' || !/^[a-z0-9][a-z0-9-]*$/u.test(slug)) {
    throw Object.assign(new Error(`"${String(slug)}" is not a page slug.`), { code: 'INVALID_ARGUMENT' })
  }
  const cached = pageCache.get(slug)
  if (cached !== undefined) return cached
  const { directory } = snapshot()
  const path = join(directory, 'pages', `${slug}.md`)
  if (!existsSync(path)) throw Object.assign(new Error(`No page named "${slug}".`), { code: 'COMPONENT_NOT_FOUND' })
  const markdown = readFileSync(path, 'utf8')
  pageCache.set(slug, markdown)
  return markdown
}

/** Score one page against a query; higher is better, zero means no hit. */
function scoreOf(row, query) {
  const needle = query.toLowerCase()
  if (row.slug === needle) return 100
  if (row.title.toLowerCase() === needle) return 90
  if (row.symbols.some(symbol => symbol.toLowerCase() === needle)) return 80
  if (row.slug.includes(needle)) return 60
  if (row.title.toLowerCase().includes(needle)) return 55
  if (row.topics.some(topic => topic === needle)) return 45
  if (row.symbols.some(symbol => symbol.toLowerCase().startsWith(needle))) return 35
  return 0
}

/** Rank pages by metadata, then by body text for the remainder. */
export function search(index, query, limit = 8) {
  const scored = index.map(row => ({ row, score: scoreOf(row, query) })).filter(hit => hit.score > 0)
  if (scored.length < limit) {
    const seen = new Set(scored.map(hit => hit.row.slug))
    for (const row of index) {
      if (seen.has(row.slug)) continue
      const body = pageOf(row.slug)
      if (body.toLowerCase().includes(query.toLowerCase())) scored.push({ row, score: 20 })
    }
  }
  return scored
    .sort((left, right) => right.score - left.score || left.row.title.localeCompare(right.row.title))
    .slice(0, limit)
    .map(hit => ({ slug: hit.row.slug, title: hit.row.title, section: hit.row.section, risk: hit.row.risk, score: hit.score }))
}

/** The coverage every answer carries. */
const COVERAGE = {
  complete: false,
  unverified: [
    'C# compiles against the installed Optix version',
    'the snippet is safe for this project',
    'runtime behaviour in the emulator or on the panel',
  ],
}

/**
 * Answer one call.
 *
 * @param args - `slug` for one page, `query` to search, or neither for the contents.
 * @returns The tool envelope.
 */
export function answer(args = {}) {
  const { index, source } = snapshot()
  const slug = typeof args.slug === 'string' && args.slug.trim() !== '' ? args.slug.trim() : undefined
  if (slug !== undefined) {
    const markdown = pageOf(slug)
    const row = index.find(entry => entry.slug === slug)
    return {
      summary: `Read ${row.title} (${row.risk}) from ${source.repository}@${source.commit.slice(0, 8)}.`,
      data: {
        slug,
        title: row.title,
        section: row.section,
        risk: row.risk,
        commit: source.commit,
        source_url: `https://github.com/${source.repository}/blob/${source.commit}/pages/${slug}.md`,
        code_blocks: Math.floor((markdown.match(/^```/gmu) ?? []).length / 2),
        disclaimer: DISCLAIMER,
        markdown,
      },
      next: [{ tool: 'optix_edit', why: 'Apply the adapted snippet through the Studio bridge, then validate.' }],
      coverage: COVERAGE,
    }
  }
  const query = typeof args.query === 'string' && args.query.trim() !== '' ? args.query.trim() : undefined
  if (query === undefined) {
    return {
      summary: `${index.length} NetLogic pages from ${source.repository}@${source.commit.slice(0, 8)}.`,
      data: {
        commit: source.commit,
        disclaimer: DISCLAIMER,
        pages: index.map(row => ({ slug: row.slug, title: row.title, section: row.section, risk: row.risk })),
      },
      next: [{ tool: 'optix_netlogic', args: { query: 'sessions' }, why: 'Read the page for a topic before writing NetLogic.' }],
      coverage: COVERAGE,
    }
  }
  const requested = typeof args.limit === 'number' && Number.isInteger(args.limit) ? args.limit : 8
  const limit = Math.min(Math.max(requested, 1), 20)
  const hits = search(index, query, limit)
  return {
    summary: hits.length === 0
      ? `No NetLogic page matches "${query}".`
      : `${hits.length} NetLogic page(s) match "${query}".`,
    data: { commit: source.commit, query, hits, ...(hits.length === 0 ? { suggestion: 'Call optix_netlogic with no arguments for the contents, then pass one slug.' } : {}) },
    next: hits.length === 0
      ? [{ tool: 'optix_netlogic', why: 'List the contents and pick a slug.' }]
      : [{ tool: 'optix_netlogic', args: { slug: hits[0].slug }, why: 'Read the best-matching page.' }],
    coverage: COVERAGE,
  }
}

/** The failure envelope every engineering tool returns. */
function failure(error) {
  const code = typeof error?.code === 'string' ? error.code : 'INTERNAL'
  return {
    error: {
      code,
      message: error instanceof Error ? error.message : String(error),
      fix: code === 'COMPONENT_NOT_FOUND'
        ? 'Call optix_netlogic with no arguments for the available slugs.'
        : 'Correct the argument and retry; the snapshot is local and needs no network.',
      candidates: [],
    },
  }
}

/** The tool definition this entry registers. */
export const definition = {
  name: 'optix_netlogic',
  description: 'Read the pinned FactoryTalk Optix NetLogic cheat-sheet snapshot: return the contents with no arguments, ranked pages for a query, or one page in full for a slug. Every page result carries its risk flag, the upstream commit and the upstream disclaimer.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Topic, method or symbol to search for, for example "sessions", "PeriodicTask" or "alarm".' },
      slug: { type: 'string', description: 'Exact page slug from the contents, for example "netlogic-lifecycle".' },
      limit: { type: 'integer', description: 'Most search hits to return; defaults to 8, maximum 20.', minimum: 1, maximum: 20 },
    },
    additionalProperties: false,
    required: [],
  },
  output: {
    schema: { type: 'object', additionalProperties: true },
    render(_args, value) {
      return [{ type: 'text', text: JSON.stringify(value, undefined, 2) }]
    },
  },
  async execute(args) {
    try {
      return answer(args ?? {})
    } catch (error) {
      return failure(error)
    }
  },
}

/**
 * Register the retrieval tool and, when the host offers it, the Optix skill.
 *
 * @param ctx - Plugin context with the tool registry and an optional skills service.
 */
export function apply(ctx) {
  ctx.tools.register(definition)
  const skillPath = first(SKILL_PATHS)
  const skills = typeof ctx.get === 'function' ? ctx.get('skills') : undefined
  if (skillPath === undefined || skills === undefined || typeof skills.register !== 'function') {
    try {
      ctx.logger?.warn?.('optix-netlogic: the skill was not registered; the tool is available.')
    } catch {
      // A logger that refuses must not turn a missing skill into a crash.
    }
    return
  }
  const raw = readFileSync(skillPath, 'utf8')
  const content = raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')
  skills.register({
    ...SKILL,
    content,
    path: skillPath,
    source: 'custom',
    provider: '@aryacode/dsh-engineering',
    invocation: { modelInvocable: true, userInvocable: true },
  })
}
