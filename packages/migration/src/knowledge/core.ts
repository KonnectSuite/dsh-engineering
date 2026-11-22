/**
 * The v1 knowledge plane: one docs tool per engineering product, over committed
 * corpus indexes and, for vendor help, the locally installed pages.
 *
 * This file is a source library, not a package. `scripts/sync-knowledge-lib.mjs`
 * copies it (with `html.ts`) into each product's `src/knowledge/`; each product's
 * `src/docs.ts` calls {@link createDocsTool} once and registers the one tool it
 * returns. Nothing here imports a product, and nothing here writes a file: the
 * tool only answers what the committed index and the locally installed help say.
 *
 * The tool answers with one JSON envelope per call. Success is
 * `{ ok: true, action, ... }`; failure is
 * `{ ok: false, action, error: { code, message, fix } }`. The codes are stable:
 * INVALID_ACTION, NOT_FOUND, QUERY_REQUIRED, SOURCE_NOT_INSTALLED,
 * REVISION_REQUIRED and INSTRUCTION_NOT_IN_REVISION.
 *
 * Determinism is part of the contract: no clock, no randomness, no absolute
 * path in an answer. Two loads of the same corpus give byte-identical JSON. The
 * one runtime path an answer may name is the installed help root `status`
 * reports, because that is the local fact the caller needs.
 *
 * @module dsh-engineering-knowledge/core
 */

import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { htmlToText } from './html.ts'

/** The five actions this tool has; there are no others. */
export const DOCS_ACTIONS = ['contents', 'search', 'read', 'status', 'lookup'] as const

/** One action name. */
export type DocsAction = (typeof DOCS_ACTIONS)[number]

/** The most search hits one call may return. */
export const MAX_HITS = 8

/** The number of search hits one call returns when it names no limit. */
export const DEFAULT_HITS = 5

/** The most characters one read answer carries. */
export const MAX_READ_CHARS = 8000

/** The most characters one search hit snippet carries. */
export const MAX_SNIPPET_CHARS = 200

/** The BM25 term-frequency saturation constant. */
export const BM25_K1 = 1.2

/** The BM25 length-normalisation constant. */
export const BM25_B = 0.75

/**
 * The share of a query's terms that must occur somewhere in the selected
 * collections before a search answers with hits.
 *
 * Without a floor, a tiny authored collection answers any query at all: every
 * word that happens to occur in one page produces a positive BM25 score, so a
 * question about another product returns five weak hits instead of the honest
 * "no page matched". A query that matches fewer than three fifths of its own
 * terms is out of scope for this corpus, not a low-confidence answer. An exact
 * identifier or alias match always answers, however few of its words occur.
 */
export const MIN_MATCHED_TERM_FRACTION = 0.6

/** How much one field's tokens count toward a page's searchable text. */
export const FIELD_WEIGHTS = Object.freeze({ title: 3, identifiers: 3, section: 2, body: 1 })

/** The words dropped from queries and from indexed text, in declaration order. */
export const STOP_WORDS = Object.freeze([
  'the',
  'of',
  'and',
  'or',
  'to',
  'in',
  'is',
  'for',
  'on',
  'with',
  'this',
  'that',
])

/** The failure codes this library returns. */
export const DOCS_ERROR_CODES = Object.freeze({
  INVALID_ACTION: 'INVALID_ACTION',
  NOT_FOUND: 'NOT_FOUND',
  QUERY_REQUIRED: 'QUERY_REQUIRED',
  SOURCE_NOT_INSTALLED: 'SOURCE_NOT_INSTALLED',
  REVISION_REQUIRED: 'REVISION_REQUIRED',
  INSTRUCTION_NOT_IN_REVISION: 'INSTRUCTION_NOT_IN_REVISION',
})

const CODE_INVALID_ACTION = DOCS_ERROR_CODES.INVALID_ACTION
const CODE_NOT_FOUND = DOCS_ERROR_CODES.NOT_FOUND
const CODE_QUERY_REQUIRED = DOCS_ERROR_CODES.QUERY_REQUIRED
const CODE_SOURCE_NOT_INSTALLED = DOCS_ERROR_CODES.SOURCE_NOT_INSTALLED
const CODE_REVISION_REQUIRED = DOCS_ERROR_CODES.REVISION_REQUIRED
const CODE_INSTRUCTION_NOT_IN_REVISION = DOCS_ERROR_CODES.INSTRUCTION_NOT_IN_REVISION

const STOP_WORD_SET = new Set<string>(STOP_WORDS)
const DOCS_ACTION_SET = new Set<string>(DOCS_ACTIONS)

/** Where a collection's pages come from. */
export type KnowledgeSource = 'authored' | 'installed-help'

/** How ready a collection is for this host. */
export type CollectionStatus = 'ready' | 'index-only' | 'absent'

/**
 * One page in a committed collection index.
 *
 * Installed-help pages carry a relative help `path`; authored pages carry a
 * relative `body` file. Identifiers are the exact lookup terms: instruction
 * mnemonics, tag names, rule ids.
 */
export interface KnowledgePageEntry {
  /** Stable, description-shaped, unique within the collection. */
  readonly id: string
  readonly title: string
  readonly section?: string
  /** Relative help path for installed-help collections. */
  readonly path?: string
  /** Relative file under the collection directory, authored only. */
  readonly body?: string
  readonly identifiers?: readonly string[]
  /** Page-level revision override; defaults to the collection revision. */
  readonly revision?: string
}

/** The committed `index.json` of one collection. */
export interface KnowledgeIndex {
  readonly schema: 1
  readonly collection: string
  readonly title: string
  readonly source: KnowledgeSource
  readonly revisions: readonly string[]
  readonly pageCount: number
  readonly pages: readonly KnowledgePageEntry[]
  /** Identifier -> page id for lookup terms that are not on the page itself. */
  readonly aliases?: Readonly<Record<string, string>>
}

/** One collection the product's docs tool serves. */
export interface DocsCollectionSpec {
  /** Stable collection id; also the directory name under `knowledge/` by default. */
  readonly id: string
  /** Directory under the knowledge root, when it differs from the id. */
  readonly root?: string
}

/** What the adapter is asked when it maps a collection to an installed help root. */
export interface InstalledRootRequest {
  readonly collection: string
  readonly revision: string | null
}

/** The resolver's detailed answer: the root it found and the roots it searched. */
export interface InstalledRootLookup {
  readonly root: string | null
  readonly searched?: readonly string[]
}

/** What the adapter returns for one installed-help root lookup. */
export type InstalledRootResult = string | InstalledRootLookup | null

/**
 * Decide which installed help root serves a collection revision.
 *
 * The core never guesses a path: the adapter owns the mapping and returns
 * `null` when the install is absent, optionally naming the roots it searched.
 */
export type InstalledRootResolver = (request: InstalledRootRequest) => InstalledRootResult | Promise<InstalledRootResult>

/** What the adapter is asked to read when a page body lives in installed help. */
export interface InstalledPageRequest {
  readonly collection: string
  readonly page: KnowledgePageEntry
  /** The relative help path recorded in the index. */
  readonly path: string
  /** The root the resolver returned for this revision. */
  readonly root: string
  readonly revision: string | null
}

/**
 * Read one installed help page.
 *
 * The adapter may return raw WebHelp/CHM HTML or plain text; the core cuts it
 * to the topic body, decodes entities and collapses whitespace. `null` means
 * the resolved help tree has no such page.
 */
export type InstalledPageReader = (request: InstalledPageRequest) => string | null | Promise<string | null>

/** The configuration one product adapter passes to {@link createDocsTool}. */
export interface DocsToolConfig {
  /** The model-facing tool name, e.g. `l5x_docs`. */
  readonly name: string
  /** The model-facing description; defaults to a summary of the five actions. */
  readonly description?: string
  /** The package's knowledge directory. Defaults to `../../knowledge/` beside this module. */
  readonly knowledgeRoot?: string | URL
  /** The collections this product serves, in the order their answers should list them. */
  readonly collections: readonly DocsCollectionSpec[]
  /** Map a collection revision to its installed help root; `null` when absent. */
  readonly installedResolver?: InstalledRootResolver
  /** Read a page body from the resolved installed help tree. */
  readonly readInstalledPage?: InstalledPageReader
  /**
   * The revision the adapter knows from its session or project.
   *
   * Used only when a call omits `revision`, so an adapter that knows the open
   * project can let plain search work without the caller repeating it.
   */
  readonly currentRevision?: () => string | null | Promise<string | null>
  /** Optional warning sink for adapters; the core treats a load failure as an absent collection. */
  readonly logger?: { warn(message: string): void }
}

/** One described parameter schema. */
export interface DocsToolParameter {
  readonly type: 'string' | 'integer'
  readonly description: string
  readonly enum?: readonly string[]
  readonly default?: unknown
  readonly minimum?: number
  readonly maximum?: number
}

/** The `parameters` object the docs tool declares. */
export interface DocsToolParameters {
  readonly type: 'object'
  readonly properties: Readonly<Record<string, DocsToolParameter>>
  readonly required: readonly string[]
  readonly additionalProperties: false
}

/** One text block the registry renders for the model. */
export interface DocsTextBlock {
  readonly type: 'text'
  readonly text: string
}

/**
 * The tool definition {@link createDocsTool} returns.
 *
 * Structurally identical to every product package's local `ToolDefinition`, so
 * an adapter's `docsTools()` can return it without a cast.
 */
export interface DocsToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: DocsToolParameters
  readonly output: {
    readonly schema: { readonly type: 'object'; readonly additionalProperties: boolean }
    render(args: unknown, value: unknown): readonly DocsTextBlock[]
  }
  execute(args: Readonly<Record<string, unknown>>, exec: unknown): Promise<unknown>
}

/** One search hit. */
export interface DocsSearchHit {
  readonly id: string
  readonly title: string
  readonly collection: string
  readonly section?: string
  /** True when a query token was an exact identifier or alias match. */
  readonly exact?: boolean
  /** BM25 score, rounded to four decimals. */
  readonly score: number
  readonly snippet: string
  readonly revision?: string
}

/** One exact identifier match from `lookup`. */
export interface DocsLookupMatch {
  readonly id: string
  readonly title: string
  readonly collection: string
  readonly identifiers: readonly string[]
  readonly revisions: readonly string[]
}

/** One collection as `contents` and `status` summarise it. */
export interface DocsCollectionSummary {
  readonly id: string
  readonly title: string
  readonly source: KnowledgeSource | null
  readonly revisions: readonly string[]
  readonly status: CollectionStatus
  readonly installedRoot: string | null
  readonly pageCount: number
}

/** One page in a collection's section table of contents. */
export interface DocsContentsPage {
  readonly id: string
  readonly title: string
  readonly revision?: string
}

/** One section in a collection's table of contents. */
export interface DocsContentsSection {
  readonly section: string | null
  readonly pageCount: number
  readonly pages: readonly DocsContentsPage[]
}

/** The error body every failure envelope carries. */
export interface DocsErrorBody {
  readonly code: string
  readonly message: string
  readonly fix: string
  /** Known names the caller probably meant. */
  readonly candidates?: readonly string[]
  /** The install roots the adapter searched, for SOURCE_NOT_INSTALLED. */
  readonly roots?: readonly string[]
  /** The revisions the collection or page records, for revision failures. */
  readonly revisions?: readonly string[]
}

/** A failed answer. */
export interface DocsFailure {
  readonly ok: false
  readonly action: string
  readonly error: DocsErrorBody
}

/** A successful answer; the action-specific members are documented per action. */
export interface DocsSuccess {
  readonly ok: true
  readonly action: string
  readonly [key: string]: unknown
}

/** One docs tool answer. */
export type DocsEnvelope = DocsSuccess | DocsFailure

/** A failure the tool reports as a stable code, a message and the fix. */
class DocsError extends Error {
  readonly code: string
  readonly fix: string
  readonly candidates: readonly string[]
  readonly roots: readonly string[]
  readonly revisions: readonly string[]

  constructor(
    code: string,
    message: string,
    fix: string,
    extra: {
      readonly candidates?: readonly string[]
      readonly roots?: readonly string[]
      readonly revisions?: readonly string[]
    } = {},
  ) {
    super(message)
    this.name = 'DocsError'
    this.code = code
    this.fix = fix
    this.candidates = extra.candidates ?? []
    this.roots = extra.roots ?? []
    this.revisions = extra.revisions ?? []
  }
}

// ---------------------------------------------------------------------------
// Small deterministic helpers
// ---------------------------------------------------------------------------

/** Compare two strings by code unit, the deterministic order used for ties. */
function compareCodepoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

/** One non-empty trimmed string, or undefined. */
function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

/** The same strings without repeats, in first-seen order. */
function uniqueStrings(values: Iterable<string>): string[] {
  const seen = new Set<string>()
  const unique: string[] = []
  for (const value of values) {
    if (seen.has(value)) continue
    seen.add(value)
    unique.push(value)
  }
  return unique
}

/** Clamp a search limit to the contract's 1..8 range, defaulting on nonsense. */
function clampLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_HITS
  return Math.min(MAX_HITS, Math.max(1, Math.floor(value)))
}

/** Round a BM25 score to the four decimals an answer carries. */
function round4(value: number): number {
  return Math.round(value * 10000) / 10000
}

/** The message of an unknown thrown value. */
function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Edit distance between two short strings, for "did you mean" ordering. */
function editDistance(left: string, right: string): number {
  const a = left.length <= right.length ? left : right
  const b = left.length <= right.length ? right : left
  if (a.length === 0) return b.length
  let previous = new Array<number>(a.length + 1)
  let current = new Array<number>(a.length + 1)
  for (let index = 0; index <= a.length; index += 1) previous[index] = index
  for (let row = 1; row <= b.length; row += 1) {
    current[0] = row
    for (let column = 1; column <= a.length; column += 1) {
      const substitution = (previous[column - 1] ?? 0) + (a[column - 1] === b[row - 1] ? 0 : 1)
      const deletion = (previous[column] ?? 0) + 1
      const insertion = (current[column - 1] ?? 0) + 1
      current[column] = Math.min(substitution, deletion, insertion)
    }
    const swap = previous
    previous = current
    current = swap
  }
  return previous[a.length] ?? b.length
}

/**
 * The candidates closest to a value: exact prefix first, then containment, then
 * edit distance, with a codepoint tie-break. Always the same order.
 */
function closestTo(value: string, candidates: Iterable<string>, limit = 5): string[] {
  const target = compactKey(value)
  const scored: { candidate: string; rank: number; distance: number }[] = []
  for (const candidate of uniqueStrings(candidates)) {
    const key = compactKey(candidate)
    if (key === '') continue
    const prefix = key.startsWith(target) || target.startsWith(key)
    const containment = key.includes(target) || target.includes(key)
    const rank = key === target ? 0 : prefix ? 1 : containment ? 2 : 3
    scored.push({ candidate, rank, distance: editDistance(target, key) })
  }
  scored.sort(
    (left, right) =>
      left.rank - right.rank ||
      left.distance - right.distance ||
      compareCodepoint(left.candidate, right.candidate),
  )
  return scored.slice(0, limit).map(entry => entry.candidate)
}

// ---------------------------------------------------------------------------
// Tokenisation
// ---------------------------------------------------------------------------

/**
 * Split text into the searchable tokens the contract defines.
 *
 * Lowercase, ASCII alphanumerics plus `_`, everything else a separator; keep
 * tokens of 2..64 characters; drop the 12-word stop list.
 *
 * @param text - Any text.
 * @returns The tokens, in reading order.
 */
export function tokenize(text: string): string[] {
  const tokens: string[] = []
  for (const token of String(text ?? '').toLowerCase().split(/[^a-z0-9_]+/u)) {
    if (token.length < 2 || token.length > 64) continue
    if (STOP_WORD_SET.has(token)) continue
    tokens.push(token)
  }
  return tokens
}

/** The words of a term, lowercased and stripped of separators. */
function normalizedWords(value: string): string[] {
  return String(value ?? '')
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter(word => word !== '' && word.length <= 64)
}

/** A term's words joined by single spaces. */
function normalizeTerm(value: string): string {
  return normalizedWords(value).join(' ')
}

/** A term's words joined with no separator, so `MSG.` and `msg` compare equal. */
function compactKey(value: string): string {
  return normalizedWords(value).join('')
}

// ---------------------------------------------------------------------------
// Corpus loading
// ---------------------------------------------------------------------------

/** One index page with its body text (authored only) precomputed. */
interface LoadedPage {
  readonly entry: KnowledgePageEntry
  readonly collectionId: string
  readonly revision: string | null
  readonly bodyText: string | null
  readonly identifierKeys: ReadonlySet<string>
  readonly searchText: string
}

/** One identifier alias resolved to the page it names. */
interface LoadedAlias {
  readonly raw: string
  readonly compact: string
  readonly page: LoadedPage
}

/** One loaded collection. */
interface LoadedCollection {
  readonly spec: DocsCollectionSpec
  readonly index: KnowledgeIndex
  readonly id: string
  readonly pages: readonly LoadedPage[]
  readonly aliases: readonly LoadedAlias[]
  /** Page ids whose authored body file is missing; the collection is index-only. */
  readonly missingBodies: readonly string[]
}

/** One collection that could not be loaded. */
interface LoadedFailure {
  readonly spec: DocsCollectionSpec
  readonly error: unknown
}

/** Every configured collection, loaded or not, in configuration order. */
interface LoadedCorpus {
  readonly collections: readonly LoadedCollection[]
  readonly failures: readonly LoadedFailure[]
}

/** Normalise authored body text while keeping paragraph breaks. */
function normalizeBody(raw: string): string {
  return raw
    .replace(/\r\n?/gu, '\n')
    .replace(/\u0000/gu, '')
    .split('\n')
    .map(line => line.replace(/[ \t]+$/u, ''))
    .join('\n')
    .replace(/^\n+/u, '')
    .replace(/\n+$/u, '')
}

/** Read one authored body file under a collection directory, or null. */
function readAuthoredBody(directory: string, relative: string): string | null {
  try {
    return normalizeBody(readFileSync(join(directory, relative), 'utf8'))
  } catch {
    return null
  }
}

/** Require an object at a position inside index.json. */
function indexObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${what} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

/**
 * Read and validate one collection's committed `index.json`.
 *
 * The schema is checked here once; a missing or malformed index throws, and
 * {@link createDocsTool} treats that collection as absent instead of crashing.
 *
 * @param directory - The collection directory that holds `index.json`.
 * @returns The validated index.
 */
export function readKnowledgeIndex(directory: string): KnowledgeIndex {
  let raw: string
  try {
    raw = readFileSync(join(directory, 'index.json'), 'utf8')
  } catch (error) {
    throw new Error(`cannot read index.json: ${messageOf(error)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    throw new Error(`index.json is not valid JSON: ${messageOf(error)}`)
  }
  const record = indexObject(parsed, 'index.json')

  if (record.schema !== 1) throw new Error(`schema is ${String(record.schema)}; expected 1`)
  const collection = optionalString(record.collection)
  if (collection === undefined) throw new Error('collection must be a non-empty string')
  const title = optionalString(record.title) ?? collection
  if (record.source !== 'authored' && record.source !== 'installed-help') {
    throw new Error(`source is ${String(record.source)}; expected "authored" or "installed-help"`)
  }
  const source: KnowledgeSource = record.source

  const revisions: string[] = []
  if (record.revisions !== undefined) {
    if (!Array.isArray(record.revisions)) throw new Error('revisions must be an array of strings')
    for (const value of record.revisions) {
      if (typeof value !== 'string' || value.trim() === '') throw new Error('revisions must be an array of non-empty strings')
      revisions.push(value.trim())
    }
  }

  if (!Array.isArray(record.pages)) throw new Error('pages must be an array')
  const pages: KnowledgePageEntry[] = []
  const pageIds = new Set<string>()
  for (const [position, item] of record.pages.entries()) {
    const page = indexObject(item, `pages[${position}]`)
    const id = optionalString(page.id)
    if (id === undefined) throw new Error(`pages[${position}].id must be a non-empty string`)
    if (pageIds.has(id)) throw new Error(`page id "${id}" is duplicated`)
    pageIds.add(id)
    const pageTitle = optionalString(page.title) ?? id
    const identifiers: string[] = []
    if (page.identifiers !== undefined) {
      if (!Array.isArray(page.identifiers)) throw new Error(`pages[${position}].identifiers must be an array of strings`)
      for (const identifier of page.identifiers) {
        if (typeof identifier !== 'string') throw new Error(`pages[${position}].identifiers must be an array of strings`)
        const trimmed = identifier.trim()
        if (trimmed !== '') identifiers.push(trimmed)
      }
    }
    pages.push({
      id,
      title: pageTitle,
      ...(optionalString(page.section) === undefined ? {} : { section: optionalString(page.section) as string }),
      ...(optionalString(page.path) === undefined ? {} : { path: optionalString(page.path) as string }),
      ...(optionalString(page.body) === undefined ? {} : { body: optionalString(page.body) as string }),
      ...(identifiers.length === 0 ? {} : { identifiers }),
      ...(optionalString(page.revision) === undefined ? {} : { revision: optionalString(page.revision) as string }),
    })
  }

  const aliases: Record<string, string> = {}
  if (record.aliases !== undefined) {
    const aliasRecord = indexObject(record.aliases, 'aliases')
    for (const [key, value] of Object.entries(aliasRecord)) {
      if (typeof value !== 'string' || value.trim() === '') throw new Error(`aliases["${key}"] must be a page id`)
      const trimmed = key.trim()
      if (trimmed === '') throw new Error('aliases must not have an empty identifier')
      aliases[trimmed] = value.trim()
    }
  }

  const pageCount =
    typeof record.pageCount === 'number' && Number.isInteger(record.pageCount) && record.pageCount >= 0
      ? record.pageCount
      : pages.length

  return {
    schema: 1,
    collection,
    title,
    source,
    revisions,
    pageCount,
    pages,
    ...(Object.keys(aliases).length === 0 ? {} : { aliases }),
  }
}

/** Load one configured collection. */
function loadCollection(knowledgeRoot: string, spec: DocsCollectionSpec): LoadedCollection {
  const directory = resolve(knowledgeRoot, spec.root ?? spec.id)
  const index = readKnowledgeIndex(directory)
  const pages: LoadedPage[] = []
  const missingBodies: string[] = []
  for (const entry of index.pages) {
    const revision = entry.revision ?? (index.revisions.length === 1 ? (index.revisions[0] ?? null) : null)
    let bodyText: string | null = null
    if (index.source === 'authored' && entry.body !== undefined) {
      bodyText = readAuthoredBody(directory, entry.body)
      if (bodyText === null) missingBodies.push(entry.id)
    }
    const identifierKeys = new Set<string>()
    for (const identifier of entry.identifiers ?? []) identifierKeys.add(compactKey(identifier))
    const searchParts = [entry.title, entry.section ?? '', (entry.identifiers ?? []).join(' ')]
    if (bodyText !== null) searchParts.push(bodyText)
    pages.push({
      entry,
      collectionId: index.collection,
      revision,
      bodyText,
      identifierKeys,
      searchText: searchParts.filter(part => part !== '').join('\n'),
    })
  }
  const aliases: LoadedAlias[] = []
  for (const [raw, pageId] of Object.entries(index.aliases ?? {})) {
    const page = pages.find(candidate => candidate.entry.id === pageId)
    if (page === undefined) continue
    aliases.push({ raw, compact: compactKey(raw), page })
  }
  return { spec, index, id: index.collection, pages, aliases, missingBodies }
}

/** Resolve the knowledge root, defaulting to the package's `knowledge/` directory. */
function knowledgeRootOf(config: DocsToolConfig): string {
  const root = config.knowledgeRoot
  if (root === undefined) return fileURLToPath(new URL('../../knowledge/', import.meta.url))
  if (root instanceof URL) return fileURLToPath(root)
  return resolve(root)
}

/** Load every configured collection; a bad one becomes an absent one. */
function loadCorpus(config: DocsToolConfig): LoadedCorpus {
  const knowledgeRoot = knowledgeRootOf(config)
  const collections: LoadedCollection[] = []
  const failures: LoadedFailure[] = []
  for (const spec of config.collections) {
    try {
      collections.push(loadCollection(knowledgeRoot, spec))
    } catch (error) {
      failures.push({ spec, error })
      config.logger?.warn(`knowledge collection "${spec.id}" is not readable: ${messageOf(error)}`)
    }
  }
  return { collections, failures }
}

/** Whether a page applies to a requested revision. */
function pageAppliesToRevision(page: LoadedPage, revision: string | null): boolean {
  if (revision === null) return true
  if (page.revision === null) return true
  return page.revision === revision
}

// ---------------------------------------------------------------------------
// Revisions and installed help
// ---------------------------------------------------------------------------

/** The revision a call means: its own argument, else the adapter's current one. */
async function requestedRevisionOf(config: DocsToolConfig, raw: unknown): Promise<string | null> {
  const direct = optionalString(raw)
  if (direct !== undefined) return direct
  if (config.currentRevision === undefined) return null
  try {
    const current = await config.currentRevision()
    return optionalString(current) ?? null
  } catch {
    return null
  }
}

/** Resolve one installed help root, normalising the adapter's answer. */
async function resolveInstalledRoot(
  config: DocsToolConfig,
  collection: LoadedCollection,
  revision: string | null,
): Promise<{ root: string | null; searched: readonly string[] }> {
  const resolver = config.installedResolver
  if (resolver === undefined) return { root: null, searched: [] }
  const result = await resolver({ collection: collection.id, revision })
  if (result === null || result === undefined) return { root: null, searched: [] }
  if (typeof result === 'string') return { root: optionalString(result) ?? null, searched: [] }
  const searchedRaw: unknown = result.searched
  return {
    root: optionalString(result.root) ?? null,
    searched: Array.isArray(searchedRaw)
      ? searchedRaw.filter((entry): entry is string => typeof entry === 'string').map(entry => entry.trim()).filter(entry => entry !== '')
      : [],
  }
}

/** A REVISION_REQUIRED failure for an installed-help collection. */
function revisionRequired(collection: LoadedCollection): DocsError {
  const revisions = [...collection.index.revisions]
  const listed = revisions.length === 0 ? 'the adapter must supply one through currentRevision' : revisions.join(', ')
  return new DocsError(
    CODE_REVISION_REQUIRED,
    `Collection "${collection.id}" is a version-specific installed-help collection; the call did not say which revision to use.`,
    `Pass revision (${listed}). Call status to see the revisions this collection records.`,
    { revisions },
  )
}

/** A REVISION_REQUIRED failure for a page with no recorded revision. */
function revisionRequiredForPage(collection: LoadedCollection, id: string): DocsError {
  const revisions = [...collection.index.revisions]
  return new DocsError(
    CODE_REVISION_REQUIRED,
    `Page "${id}" carries no revision and collection "${collection.id}" records several; the call did not say which one to read.`,
    `Pass revision, one of: ${revisions.join(', ')}. Call status to see the revisions this collection records.`,
    { revisions },
  )
}

/** An INSTRUCTION_NOT_IN_REVISION failure. */
function instructionNotInRevision(
  id: string,
  recorded: string,
  requested: string,
  revisions: readonly string[],
): DocsError {
  const recordedRevisions = uniqueStrings(revisions.filter(revision => revision !== ''))
  return new DocsError(
    CODE_INSTRUCTION_NOT_IN_REVISION,
    `Page "${id}" is recorded for revision ${recorded}, but this call asked for "${requested}".`,
    `Read the page without revision for the plain read, or pass one of the recorded revisions: ${recordedRevisions.length === 0 ? '(none recorded)' : recordedRevisions.join(', ')}.`,
    { revisions: recordedRevisions },
  )
}

/** A SOURCE_NOT_INSTALLED failure. */
function sourceNotInstalled(
  config: DocsToolConfig,
  collection: LoadedCollection,
  revision: string | null,
  searched: readonly string[],
): DocsError {
  const adapterAbsent = config.installedResolver === undefined || config.readInstalledPage === undefined
  const where = searched.length === 0 ? 'no install root is known' : `searched: ${searched.join(', ')}`
  return new DocsError(
    CODE_SOURCE_NOT_INSTALLED,
    `Collection "${collection.id}" is installed-help; no local help install was found for revision ${revision === null ? '(unspecified)' : `"${revision}"`} (${where}).`,
    adapterAbsent
      ? 'The product adapter must pass installedResolver and readInstalledPage for this collection; until then only its committed index is searchable.'
      : 'Install the product help for this revision, or pass a revision that is installed; call status to see the root this adapter resolves.',
    { roots: searched },
  )
}

// ---------------------------------------------------------------------------
// BM25 search
// ---------------------------------------------------------------------------

/** One page's weighted term frequencies and length. */
interface SearchDocument {
  readonly page: LoadedPage
  readonly frequencies: ReadonlyMap<string, number>
  readonly length: number
}

/** Weighted term frequencies from the four fields the contract names. */
function weightedFrequencies(page: LoadedPage): { frequencies: Map<string, number>; length: number } {
  const frequencies = new Map<string, number>()
  const add = (text: string, weight: number): void => {
    if (text === '') return
    for (const token of tokenize(text)) frequencies.set(token, (frequencies.get(token) ?? 0) + weight)
  }
  add(page.entry.title, FIELD_WEIGHTS.title)
  add((page.entry.identifiers ?? []).join(' '), FIELD_WEIGHTS.identifiers)
  add(page.entry.section ?? '', FIELD_WEIGHTS.section)
  if (page.bodyText !== null) add(page.bodyText, FIELD_WEIGHTS.body)
  let length = 0
  for (const count of frequencies.values()) length += count
  return { frequencies, length }
}

/** Score every document against the query tokens with the contract's BM25. */
function scoreDocuments(documents: readonly SearchDocument[], tokens: readonly string[]): { page: LoadedPage; score: number }[] {
  const total = documents.length
  const lengthSum = documents.reduce((sum, document) => sum + document.length, 0)
  const averageLength = total === 0 || lengthSum === 0 ? 1 : lengthSum / total
  const documentFrequency = new Map<string, number>()
  for (const token of tokens) {
    let frequency = 0
    for (const document of documents) if (document.frequencies.has(token)) frequency += 1
    documentFrequency.set(token, frequency)
  }
  return documents.map(document => {
    let score = 0
    for (const token of tokens) {
      const frequency = document.frequencies.get(token)
      if (frequency === undefined) continue
      const df = documentFrequency.get(token) ?? 0
      if (df === 0) continue
      const idf = Math.max(0, Math.log(1 + (total - df + 0.5) / (df + 0.5)))
      const denominator = frequency + BM25_K1 * (1 - BM25_B + (BM25_B * document.length) / averageLength)
      score += (idf * (frequency * (BM25_K1 + 1))) / denominator
    }
    return { page: document.page, score: round4(score) }
  })
}

/** The pages a query token matches exactly through an identifier or an alias. */
function exactPages(
  collections: readonly LoadedCollection[],
  tokens: readonly string[],
  revision: string | null,
): Set<LoadedPage> {
  const exact = new Set<LoadedPage>()
  for (const collection of collections) {
    const aliasPages = new Map<string, LoadedPage>()
    for (const alias of collection.aliases) aliasPages.set(alias.compact, alias.page)
    for (const page of collection.pages) {
      if (!pageAppliesToRevision(page, revision)) continue
      for (const token of tokens) {
        if (page.identifierKeys.has(token)) {
          exact.add(page)
          break
        }
        if (aliasPages.get(token) === page) {
          exact.add(page)
          break
        }
      }
    }
  }
  return exact
}

/** A snippet: a 200-character window around the first query-token match. */
function snippetOf(page: LoadedPage, tokens: readonly string[]): string {
  const flat = page.searchText.replace(/\s+/gu, ' ').trim()
  if (flat === '') return page.entry.title
  const lower = flat.toLowerCase()
  let match = -1
  for (const token of tokens) {
    const index = lower.indexOf(token)
    if (index !== -1 && (match === -1 || index < match)) match = index
  }
  if (match === -1) match = 0
  let start = Math.max(0, match - 60)
  const end = Math.min(flat.length, start + MAX_SNIPPET_CHARS)
  start = Math.max(0, end - MAX_SNIPPET_CHARS)
  return flat.slice(start, end).trim()
}

/** Build one hit, in the contract's member order. */
function hitOf(page: LoadedPage, tokens: readonly string[], score: number, exact: boolean): DocsSearchHit {
  return {
    id: page.entry.id,
    title: page.entry.title,
    collection: page.collectionId,
    ...(page.entry.section === undefined ? {} : { section: page.entry.section }),
    ...(exact ? { exact: true } : {}),
    score: round4(score),
    snippet: snippetOf(page, tokens),
    ...(page.revision === null ? {} : { revision: page.revision }),
  }
}

// ---------------------------------------------------------------------------
// Shared selection rules
// ---------------------------------------------------------------------------

/**
 * The collections one action may read, applying the revision contract.
 *
 * Without a revision, only authored collections are covered: an installed-help
 * collection is a version-specific shard and is never silently chosen. Asking
 * for one by name without a revision is REVISION_REQUIRED.
 */
async function selectCollections(
  config: DocsToolConfig,
  corpus: LoadedCorpus,
  collectionArg: string | undefined,
  revision: string | null,
): Promise<LoadedCollection[]> {
  const matched = corpus.collections.filter(
    collection => collectionArg === undefined || collection.id === collectionArg || collection.spec.id === collectionArg,
  )

  if (collectionArg !== undefined && matched.length === 0) {
    const configured = config.collections.map(spec => spec.id)
    const failure = corpus.failures.find(item => item.spec.id === collectionArg)
    if (failure !== undefined) {
      throw new DocsError(
        CODE_NOT_FOUND,
        `Collection "${collectionArg}" has no readable knowledge index.`,
        'Regenerate the collection with the package knowledge generator, then retry. Call contents to list readable collections.',
        { candidates: configured.filter(id => id !== collectionArg) },
      )
    }
    throw new DocsError(
      CODE_NOT_FOUND,
      `Unknown collection "${collectionArg}".`,
      `${config.name} serves: ${configured.length === 0 ? '(none configured)' : configured.join(', ')}. Call contents to list the collections.`,
      { candidates: closestTo(collectionArg, configured) },
    )
  }

  const selected: LoadedCollection[] = []
  for (const collection of matched) {
    if (revision === null) {
      if (collection.index.source !== 'installed-help') {
        selected.push(collection)
        continue
      }
      if (collectionArg !== undefined) throw revisionRequired(collection)
      continue
    }
    if (collection.index.revisions.length === 0 || collection.index.revisions.includes(revision)) {
      selected.push(collection)
      continue
    }
    if (collectionArg !== undefined) {
      throw new DocsError(
        CODE_NOT_FOUND,
        `Collection "${collection.id}" covers ${collection.index.revisions.length === 0 ? 'no recorded revision' : `revision ${collection.index.revisions.join(', ')}`}, not "${revision}".`,
        `Pass a revision this collection covers, or omit collection to use every collection that matches "${revision}". Call status to see the revisions each collection records.`,
        { revisions: [...collection.index.revisions] },
      )
    }
  }
  return selected
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

/** A search with no matching page: successful, empty, and points at contents. */
function emptySearch(query: string, revision: string | null, limit: number, collection: string | undefined): DocsSuccess {
  return {
    ok: true,
    action: 'search',
    query,
    ...(collection === undefined ? {} : { collection }),
    revision,
    limit,
    total: 0,
    hits: [],
    hint: 'No page matched. Call contents to list the collections and sections this tool serves, or search with an identifier from a project or help page.',
  }
}

/** Run `search`. */
async function runSearch(config: DocsToolConfig, args: Readonly<Record<string, unknown>>): Promise<DocsEnvelope> {
  const query = optionalString(args.query)
  if (query === undefined) {
    throw new DocsError(
      CODE_QUERY_REQUIRED,
      'search needs a query.',
      'Pass query with the words to look for, for example "timer instructions". Call contents to see what this tool covers.',
    )
  }
  const tokens = uniqueStrings(tokenize(query))
  if (tokens.length === 0) {
    throw new DocsError(
      CODE_QUERY_REQUIRED,
      `The query "${query}" has no searchable terms.`,
      'Use at least one word of two or more letters that is not a common stop word (for example "timer", "TON", "import").',
    )
  }
  const limit = clampLimit(args.limit)
  const revision = await requestedRevisionOf(config, args.revision)
  const collectionArg = optionalString(args.collection)
  const corpus = loadCorpus(config)
  const selected = await selectCollections(config, corpus, collectionArg, revision)

  const documents: SearchDocument[] = []
  for (const collection of selected) {
    for (const page of collection.pages) {
      if (!pageAppliesToRevision(page, revision)) continue
      documents.push({ page, ...weightedFrequencies(page) })
    }
  }
  const exact = exactPages(selected, tokens, revision)
  if (documents.length === 0) return emptySearch(query, revision, limit, collectionArg)

  // A corpus answers only questions it is about. When most of a query's own
  // terms occur nowhere in the selected pages, the honest answer is no hits,
  // not the five weakest BM25 matches. An exact identifier or alias match is
  // a strong enough signal to answer on its own.
  if (exact.size === 0) {
    const matchedTerms = tokens.filter(token => documents.some(document => document.frequencies.has(token))).length
    if (matchedTerms / tokens.length < MIN_MATCHED_TERM_FRACTION) {
      return emptySearch(query, revision, limit, collectionArg)
    }
  }

  const scored = new Map<LoadedPage, number>()
  for (const entry of scoreDocuments(documents, tokens)) scored.set(entry.page, entry.score)

  // One ranking: a page's BM25 score orders the answer. An exact identifier or
  // alias match is always kept (it marks the hit and exempts the query from the
  // term floor), but being exact does not by itself outrank a better textual
  // match — the page a reader asked about should come first, not the widest
  // page that happens to carry the same word as an identifier.
  const ranked = [...documents]
    .map(document => ({
      page: document.page,
      score: scored.get(document.page) ?? 0,
      exact: exact.has(document.page),
    }))
    .filter(entry => entry.exact || entry.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score
        || Number(right.exact) - Number(left.exact)
        || compareCodepoint(left.page.entry.id, right.page.entry.id),
    )
    .map(entry => hitOf(entry.page, tokens, entry.score, entry.exact))

  const hits = ranked
  if (hits.length === 0) return emptySearch(query, revision, limit, collectionArg)
  return {
    ok: true,
    action: 'search',
    query,
    ...(collectionArg === undefined ? {} : { collection: collectionArg }),
    revision,
    limit,
    total: hits.length,
    hits: hits.slice(0, limit),
  }
}

/** Run `lookup`. */
async function runLookup(config: DocsToolConfig, args: Readonly<Record<string, unknown>>): Promise<DocsEnvelope> {
  const term = optionalString(args.term)
  if (term === undefined) {
    throw new DocsError(
      CODE_QUERY_REQUIRED,
      'lookup needs a term.',
      'Pass term as an instruction mnemonic, identifier or alias, for example "TON" or "MSG". Call contents to see the collections.',
    )
  }
  const target = compactKey(term)
  if (target === '') {
    throw new DocsError(
      CODE_QUERY_REQUIRED,
      `The term "${term}" has no identifier characters.`,
      'Pass term as letters, digits and underscores, for example "TON" or "MSG".',
    )
  }
  const revision = await requestedRevisionOf(config, args.revision)
  const collectionArg = optionalString(args.collection)
  const corpus = loadCorpus(config)
  const selected = await selectCollections(config, corpus, collectionArg, revision)

  interface LookupCandidate {
    readonly page: LoadedPage
    readonly collection: LoadedCollection
    readonly identifiers: readonly string[]
    readonly exactIdentifier: boolean
  }

  const matches: LookupCandidate[] = []
  const knownIdentifiers: string[] = []
  for (const collection of selected) {
    const aliasesFor = new Map<LoadedPage, LoadedAlias[]>()
    for (const alias of collection.aliases) {
      const list = aliasesFor.get(alias.page)
      if (list === undefined) aliasesFor.set(alias.page, [alias])
      else list.push(alias)
    }
    for (const page of collection.pages) {
      if (!pageAppliesToRevision(page, revision)) continue
      const identifiers = uniqueStrings(page.entry.identifiers ?? [])
      knownIdentifiers.push(...identifiers)
      const exactIdentifier = page.identifierKeys.has(target)
      const matchedAliases = (aliasesFor.get(page) ?? []).filter(alias => alias.compact === target)
      if (!exactIdentifier && matchedAliases.length === 0) continue
      const shown = [...identifiers]
      for (const alias of matchedAliases) {
        if (!shown.some(identifier => compactKey(identifier) === alias.compact)) shown.push(alias.raw)
      }
      matches.push({ page, collection, identifiers: shown, exactIdentifier })
    }
  }

  matches.sort(
    (left, right) =>
      Number(right.exactIdentifier) - Number(left.exactIdentifier) ||
      compareCodepoint(left.page.entry.title, right.page.entry.title) ||
      compareCodepoint(left.page.entry.id, right.page.entry.id),
  )

  if (matches.length === 0) {
    // Candidates may come from every committed index: identifiers are metadata.
    for (const collection of corpus.collections) {
      for (const page of collection.pages) knownIdentifiers.push(...(page.entry.identifiers ?? []))
    }
    const where = collectionArg === undefined ? '' : ` in collection "${collectionArg}"`
    throw new DocsError(
      CODE_NOT_FOUND,
      `No page declares the identifier "${term}"${where}.`,
      'Call contents to list the collections, or search with the term to find pages that mention it. When the term lives in installed help, pass revision (call status to see the recorded revisions).',
      { candidates: closestTo(term, knownIdentifiers, 8) },
    )
  }

  return {
    ok: true,
    action: 'lookup',
    term,
    ...(collectionArg === undefined ? {} : { collection: collectionArg }),
    revision,
    total: matches.length,
    matches: matches.map(match => ({
      id: match.page.entry.id,
      title: match.page.entry.title,
      collection: match.page.collectionId,
      identifiers: [...match.identifiers],
      revisions:
        match.page.revision === null ? [...match.collection.index.revisions] : [match.page.revision],
    })),
  }
}

/** One read answer. */
function readSuccess(
  page: LoadedPage,
  collection: LoadedCollection,
  rawText: string,
  revision: string | null,
): DocsSuccess {
  const text = rawText.trim()
  const truncated = text.length > MAX_READ_CHARS
  return {
    ok: true,
    action: 'read',
    id: page.entry.id,
    title: page.entry.title,
    collection: page.collectionId,
    source: collection.index.source,
    revision: revision ?? page.revision,
    text: truncated ? text.slice(0, MAX_READ_CHARS) : text,
    truncated,
  }
}

/** Run `read`. */
async function runRead(config: DocsToolConfig, args: Readonly<Record<string, unknown>>): Promise<DocsEnvelope> {
  const id = optionalString(args.id)
  if (id === undefined) {
    throw new DocsError(
      CODE_NOT_FOUND,
      'read needs a page id.',
      'Pass id from contents or from a search hit, for example "ton-instruction".',
    )
  }
  const collectionArg = optionalString(args.collection)
  const requested = await requestedRevisionOf(config, args.revision)
  const corpus = loadCorpus(config)

  const matches: { page: LoadedPage; collection: LoadedCollection }[] = []
  for (const collection of corpus.collections) {
    if (collectionArg !== undefined && collection.id !== collectionArg && collection.spec.id !== collectionArg) continue
    for (const page of collection.pages) if (page.entry.id === id) matches.push({ page, collection })
  }

  if (matches.length === 0) {
    const failure =
      collectionArg === undefined ? undefined : corpus.failures.find(item => item.spec.id === collectionArg)
    if (failure !== undefined) {
      throw new DocsError(
        CODE_NOT_FOUND,
        `Collection "${collectionArg}" has no readable knowledge index.`,
        'Regenerate the collection with the package knowledge generator, then retry. Call contents to list readable collections.',
        { candidates: closestPageIds(corpus, undefined, id) },
      )
    }
    const where = collectionArg === undefined ? '' : ` in collection "${collectionArg}"`
    throw new DocsError(
      CODE_NOT_FOUND,
      `No page has id "${id}"${where}.`,
      'Call contents to list page ids, or search for the words of the page. The closest ids are in candidates.',
      { candidates: closestPageIds(corpus, collectionArg, id) },
    )
  }

  // Prefer the candidate that actually belongs to the requested revision, so a
  // shared page id in two shards does not answer with the wrong shard's page.
  let chosen = matches[0] as { page: LoadedPage; collection: LoadedCollection }
  if (requested !== null) {
    const applicable = matches.find(
      candidate =>
        candidate.page.revision === requested ||
        (candidate.page.revision === null &&
          (candidate.collection.index.revisions.length === 0 ||
            candidate.collection.index.revisions.includes(requested))),
    )
    if (applicable !== undefined) chosen = applicable
  }

  const { page, collection } = chosen
  const collectionRevisions = [...collection.index.revisions]

  if (requested !== null) {
    if (page.revision !== null && page.revision !== requested) {
      throw instructionNotInRevision(id, page.revision, requested, [page.revision, ...collectionRevisions])
    }
    if (
      page.revision === null &&
      collectionRevisions.length > 0 &&
      !collectionRevisions.includes(requested)
    ) {
      throw instructionNotInRevision(
        id,
        collectionRevisions.length === 1 ? (collectionRevisions[0] as string) : collectionRevisions.join(', '),
        requested,
        collectionRevisions,
      )
    }
  }

  if (collection.index.source === 'authored') {
    if (page.entry.body === undefined) {
      const summary = [page.entry.title, page.entry.section ?? '', (page.entry.identifiers ?? []).join(', ')]
        .filter(part => part !== '')
        .join('\n\n')
      return readSuccess(page, collection, summary, requested)
    }
    if (page.bodyText === null) {
      throw new DocsError(
        CODE_NOT_FOUND,
        `Page "${id}" records a body file that is missing from the committed collection.`,
        'Regenerate the collection with the package knowledge generator so the page body is written, then retry. Call status to see the collection posture.',
        { candidates: closestPageIds(corpus, collectionArg, id) },
      )
    }
    return readSuccess(page, collection, page.bodyText, requested)
  }

  if (page.entry.path === undefined) {
    throw new DocsError(
      CODE_NOT_FOUND,
      `Page "${id}" is an installed-help page with no help path in the index.`,
      'Regenerate the installed-help index so the page records its relative help path, then retry.',
      { candidates: [] },
    )
  }

  let revision = requested ?? page.revision
  if (revision === null && collectionRevisions.length === 1) revision = collectionRevisions[0] ?? null
  if (revision === null && collectionRevisions.length > 1) throw revisionRequiredForPage(collection, id)

  const resolved = await resolveInstalledRoot(config, collection, revision)
  if (resolved.root === null || config.readInstalledPage === undefined) {
    throw sourceNotInstalled(config, collection, revision, resolved.searched)
  }

  let raw: string | null
  try {
    raw = await config.readInstalledPage({
      collection: collection.id,
      page: page.entry,
      path: page.entry.path,
      root: resolved.root,
      revision,
    })
  } catch (error) {
    throw new DocsError(
      CODE_NOT_FOUND,
      `Reading the installed help page "${page.entry.path}" failed: ${messageOf(error)}`,
      'Check that the installed help for this revision is intact, or regenerate the index. Call status to see the resolved root.',
      { candidates: [] },
    )
  }
  if (raw === null) {
    throw new DocsError(
      CODE_NOT_FOUND,
      `The installed help at the resolved root has no page at "${page.entry.path}".`,
      'The index and the installed help disagree; reinstall the help for this revision or regenerate the index. Call status to see the resolved root.',
      { candidates: [] },
    )
  }
  return readSuccess(page, collection, htmlToText(raw), revision)
}

/** The page ids closest to a missing id, for a NOT_FOUND answer. */
function closestPageIds(corpus: LoadedCorpus, collectionArg: string | undefined, value: string): string[] {
  const ids: string[] = []
  for (const collection of corpus.collections) {
    if (collectionArg !== undefined && collection.id !== collectionArg && collection.spec.id !== collectionArg) continue
    for (const page of collection.pages) ids.push(page.entry.id)
  }
  return closestTo(value, ids, 5)
}

/** How ready one loaded collection is. */
async function collectionPosture(
  config: DocsToolConfig,
  collection: LoadedCollection,
): Promise<{ status: CollectionStatus; installedRoot: string | null }> {
  if (collection.index.source === 'installed-help') {
    if (config.installedResolver === undefined) return { status: 'index-only', installedRoot: null }
    const revision = collection.index.revisions.length === 1 ? (collection.index.revisions[0] ?? null) : null
    const resolved = await resolveInstalledRoot(config, collection, revision)
    if (resolved.root === null) return { status: 'index-only', installedRoot: null }
    return {
      status: config.readInstalledPage === undefined ? 'index-only' : 'ready',
      installedRoot: resolved.root,
    }
  }
  return {
    status: collection.missingBodies.length === 0 ? 'ready' : 'index-only',
    installedRoot: null,
  }
}

/** Summarise every configured collection, in configuration order. */
async function summariseCollections(
  config: DocsToolConfig,
  corpus: LoadedCorpus,
): Promise<DocsCollectionSummary[]> {
  const summaries: DocsCollectionSummary[] = []
  for (const spec of config.collections) {
    const loaded = corpus.collections.find(collection => collection.spec === spec)
    if (loaded === undefined) {
      summaries.push({
        id: spec.id,
        title: spec.id,
        source: null,
        revisions: [],
        status: 'absent',
        installedRoot: null,
        pageCount: 0,
      })
      continue
    }
    const posture = await collectionPosture(config, loaded)
    summaries.push({
      id: loaded.id,
      title: loaded.index.title,
      source: loaded.index.source,
      revisions: [...loaded.index.revisions],
      status: posture.status,
      installedRoot: posture.installedRoot,
      pageCount: loaded.index.pageCount,
    })
  }
  return summaries
}

/** Run `status`. */
async function runStatus(config: DocsToolConfig): Promise<DocsEnvelope> {
  const corpus = loadCorpus(config)
  return { ok: true, action: 'status', collections: await summariseCollections(config, corpus) }
}

/** Run `contents`. */
async function runContents(config: DocsToolConfig, args: Readonly<Record<string, unknown>>): Promise<DocsEnvelope> {
  const collectionArg = optionalString(args.collection)
  const corpus = loadCorpus(config)
  if (collectionArg === undefined) {
    return { ok: true, action: 'contents', collections: await summariseCollections(config, corpus) }
  }

  const loaded = corpus.collections.find(
    collection => collection.id === collectionArg || collection.spec.id === collectionArg,
  )
  if (loaded === undefined) {
    const configured = config.collections.map(spec => spec.id)
    const failure = corpus.failures.find(item => item.spec.id === collectionArg)
    if (failure !== undefined) {
      throw new DocsError(
        CODE_NOT_FOUND,
        `Collection "${collectionArg}" has no readable knowledge index.`,
        'Regenerate the collection with the package knowledge generator, then retry. Call contents without a collection to list the collections this tool serves.',
        { candidates: configured.filter(id => id !== collectionArg) },
      )
    }
    throw new DocsError(
      CODE_NOT_FOUND,
      `Unknown collection "${collectionArg}".`,
      `${config.name} serves: ${configured.length === 0 ? '(none configured)' : configured.join(', ')}. Call contents without a collection to list them.`,
      { candidates: closestTo(collectionArg, configured) },
    )
  }

  const posture = await collectionPosture(config, loaded)
  const groups = new Map<string, DocsContentsPage[]>()
  for (const page of loaded.pages) {
    const section = page.entry.section ?? ''
    const item: DocsContentsPage = {
      id: page.entry.id,
      title: page.entry.title,
      ...(page.revision === null ? {} : { revision: page.revision }),
    }
    const group = groups.get(section)
    if (group === undefined) groups.set(section, [item])
    else group.push(item)
  }
  const sections: DocsContentsSection[] = [...groups.entries()].map(([section, pages]) => ({
    section: section === '' ? null : section,
    pageCount: pages.length,
    pages,
  }))
  const summary: DocsCollectionSummary = {
    id: loaded.id,
    title: loaded.index.title,
    source: loaded.index.source,
    revisions: [...loaded.index.revisions],
    status: posture.status,
    installedRoot: posture.installedRoot,
    pageCount: loaded.index.pageCount,
  }
  return { ok: true, action: 'contents', collection: summary, sections }
}

// ---------------------------------------------------------------------------
// Tool factory
// ---------------------------------------------------------------------------

/** The parameter object every docs tool declares. */
function docsParameters(): DocsToolParameters {
  return {
    type: 'object',
    properties: {
      action: {
        type: 'string',
        enum: [...DOCS_ACTIONS],
        description:
          'The knowledge action: contents lists collections or one collection\'s sections, search ranks pages for a query, read returns one page, status reports which corpus is readable on this host, lookup resolves an exact identifier.',
      },
      query: {
        type: 'string',
        description:
          'For search: the words to look for. Mnemonics, identifiers and plain questions all work. Other actions ignore it.',
      },
      id: {
        type: 'string',
        description: 'For read: the page id from contents or from a search hit.',
      },
      collection: {
        type: 'string',
        description: 'Optional collection id that restricts the action to one authored or installed-help collection.',
      },
      revision: {
        type: 'string',
        description:
          'Optional product revision, for example "37.05.00". Required for a version-specific installed-help collection; read answers INSTRUCTION_NOT_IN_REVISION when the page belongs to another revision.',
      },
      limit: {
        type: 'integer',
        description: 'For search: how many hits to return. Default 5, hard maximum 8.',
        minimum: 1,
        maximum: MAX_HITS,
      },
      term: {
        type: 'string',
        description: 'For lookup: an exact instruction mnemonic, identifier or alias, for example "TON".',
      },
    },
    required: ['action'],
    additionalProperties: false,
  }
}

/** The default model-facing description. */
function defaultDescription(name: string): string {
  return `Search the installed and authored help this product ships, offline. ${name} has five actions: contents lists the collections and their section tables of contents; search ranks pages for a query and always returns hits with a total; read returns one page as readable text; status reports which collections are readable on this host and which installed help root was found; lookup resolves an exact instruction mnemonic, identifier or alias. Answers are JSON envelopes with a stable code, message and fix on failure.`
}

/** The failure envelope for an unknown action. */
function invalidAction(toolName: string, action: string): DocsError {
  const shown = action === '' ? '(missing)' : `"${action}"`
  return new DocsError(
    CODE_INVALID_ACTION,
    `Unknown ${toolName} action ${shown}.`,
    `Pass action as one of: ${DOCS_ACTIONS.join(', ')}. Start with "contents" to list the collections, then "search" or "lookup".`,
    { candidates: [...DOCS_ACTIONS] },
  )
}

/** Turn any thrown value into the failure envelope. */
function failure(action: string, error: unknown): DocsFailure {
  if (error instanceof DocsError) {
    return {
      ok: false,
      action,
      error: {
        code: error.code,
        message: error.message,
        fix: error.fix,
        ...(error.candidates.length === 0 ? {} : { candidates: [...error.candidates] }),
        ...(error.roots.length === 0 && error.code !== CODE_SOURCE_NOT_INSTALLED
          ? {}
          : { roots: [...error.roots] }),
        ...(error.revisions.length === 0 ? {} : { revisions: [...error.revisions] }),
      },
    }
  }
  return {
    ok: false,
    action,
    error: {
      code: 'INTERNAL',
      message: messageOf(error),
      fix: 'Retry the call; if it fails the same way, report the message and the arguments used.',
    },
  }
}

/**
 * Build one product's docs tool.
 *
 * The factory is pure: it validates the configuration and returns the tool
 * definition without touching the filesystem, so a tool-reference generator or
 * a boot-time entry can call it. Corpus reads happen inside `execute`, per
 * call, which keeps the answer equal to what is committed and installed now.
 *
 * @param config - The tool identity, its collections, and any installed-help adapters.
 * @returns The one tool definition the product's `docsTools()` returns.
 */
export function createDocsTool(config: DocsToolConfig): DocsToolDefinition {
  if (typeof config.name !== 'string' || config.name.trim() === '') {
    throw new TypeError('createDocsTool requires a non-empty tool name')
  }
  if (!Array.isArray(config.collections)) {
    throw new TypeError('createDocsTool requires a collections array')
  }
  const seen = new Set<string>()
  for (const spec of config.collections) {
    if (typeof spec !== 'object' || spec === null || typeof spec.id !== 'string' || spec.id.trim() === '') {
      throw new TypeError('every collection spec requires a non-empty id')
    }
    if (seen.has(spec.id)) throw new TypeError(`duplicate collection id "${spec.id}"`)
    seen.add(spec.id)
  }

  const name = config.name.trim()
  const description = optionalString(config.description) ?? defaultDescription(name)
  return {
    name,
    description,
    parameters: docsParameters(),
    output: {
      schema: { type: 'object', additionalProperties: true },
      render(_args: unknown, value: unknown): readonly DocsTextBlock[] {
        return [{ type: 'text', text: JSON.stringify(value ?? null, undefined, 2) }]
      },
    },
    async execute(rawArgs: Readonly<Record<string, unknown>>): Promise<unknown> {
      const args: Readonly<Record<string, unknown>> =
        typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs) ? rawArgs : {}
      const action = optionalString(args.action) ?? ''
      try {
        if (!DOCS_ACTION_SET.has(action)) throw invalidAction(name, action)
        switch (action as DocsAction) {
          case 'contents':
            return await runContents(config, args)
          case 'search':
            return await runSearch(config, args)
          case 'read':
            return await runRead(config, args)
          case 'status':
            return await runStatus(config)
          case 'lookup':
            return await runLookup(config, args)
          default:
            throw invalidAction(name, action)
        }
      } catch (error) {
        return failure(action, error)
      }
    },
  }
}
