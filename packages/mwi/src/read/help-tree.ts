/**
 * A help tree the tools can read without the IDE.
 *
 * MotionWorks IEC ships its help as CHMs under %ProgramData%; extracting them
 * needs the vendor install. This module owns the small, explicit tree format the
 * tests build under `os.tmpdir()` and a real extractor can write later, plus the
 * read-by-id and search path so `mw_help` is exercisable without the IDE.
 *
 * @module dsh-engineering-mwi/read/help-tree
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { MwiError } from '../core/errors.ts'

/** Environment variable pointing at an extracted help tree root. */
export const HELP_TREE_ENV = 'MWI_HELP_TREE'

/** The manifest format this module reads and writes. */
export const HELP_TREE_FORMAT = 'mwi-help-tree/1'

/** One help topic. */
export interface HelpTopic {
  /** Stable topic id used by `mw_help`. */
  readonly id: string
  /** Topic title. */
  readonly title: string
  /** Topic body; may be plain text in the fixture and HTML when read from a tree. */
  readonly text: string
  /** Extra search terms. */
  readonly keywords?: readonly string[]
  /** Where the topic came from (extractor name, document, version). */
  readonly source?: string
}

/** One manifest row. */
interface HelpTreeManifestRow {
  readonly id: string
  readonly title: string
  readonly file: string
  readonly keywords?: readonly string[]
}

/** The on-disk manifest. */
interface HelpTreeManifest {
  readonly format: string
  readonly topics: readonly HelpTreeManifestRow[]
}

/** One read topic. */
export interface HelpTopicDocument {
  /** Topic id. */
  readonly id: string
  /** Topic title. */
  readonly title: string
  /** Plain text after HTML tags and entities are stripped. */
  readonly text: string
  /** Absolute path of the topic file. */
  readonly path: string
  /** Where the tree came from. */
  readonly source: string
}

/** One search hit. */
export interface HelpTopicMatch {
  /** Topic id. */
  readonly id: string
  /** Topic title. */
  readonly title: string
  /** Text around the first matching term. */
  readonly snippet: string
  /** How strongly the topic matched. */
  readonly score: number
}

/** A help search result. */
export interface HelpSearchResult {
  /** Matching topics, best first. */
  readonly matches: readonly HelpTopicMatch[]
  /** Topics inspected. */
  readonly scanned: number
  /** Whether the limit hid further matches. */
  readonly truncated: boolean
}

/** What a help-tree probe found. */
export interface HelpTreeProbe {
  /** The tree root, when one is configured. */
  readonly root?: string
  /** Whether the manifest was found. */
  readonly found: boolean
  /** The locations that were inspected. */
  readonly looked_for: readonly { readonly where: string; readonly found: boolean; readonly note?: string }[]
  /** What to do when no tree is available. */
  readonly fix: string
}

/** Validate one topic id so a manifest cannot point outside the tree. */
function safeId(id: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(id)) {
    throw new MwiError('HELP_TOPIC_ID', `Help topic id ${JSON.stringify(id)} is not a simple id.`, 'Use letters, digits, dots, underscores and dashes only.')
  }
  return id
}

/** Escape text for the tiny HTML documents the fixture writes. */
function escapeHtml(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

/** Strip HTML tags and entities to readable text. */
function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<\/(?:p|div|h[1-6]|li|tr|table|section|article)>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
  const decoded = withoutBlocks
    .replaceAll('&nbsp;', ' ')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
  return decoded
    .split(/\r?\n/u)
    .map(line => line.replace(/[ \t]+/gu, ' ').trim())
    .filter(line => line !== '')
    .join('\n')
}

/**
 * Return the help-tree root configured on this host, when any.
 *
 * @param env - Environment to read; defaults to `process.env`.
 * @returns The configured root, or undefined.
 */
export function helpTreeRootFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): string | undefined {
  const root = env[HELP_TREE_ENV]
  return root === undefined || root === '' ? undefined : root
}

/** Read the manifest; a missing manifest is the not-installed answer. */
function readManifest(root: string): HelpTreeManifest {
  const manifestPath = join(root, 'index.json')
  if (!existsSync(manifestPath)) {
    throw new MwiError(
      'NOT_INSTALLED',
      `No MotionWorks IEC help tree is available at ${root}.`,
      helpFix(root),
    )
  }
  let manifest: HelpTreeManifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as HelpTreeManifest
  } catch {
    throw new MwiError('HELP_TREE_INVALID', `The help tree manifest at ${manifestPath} is not valid JSON.`, 'Rebuild the tree with the knowledge build, or set MWI_HELP_TREE to a complete tree.')
  }
  if (manifest.format !== HELP_TREE_FORMAT || !Array.isArray(manifest.topics)) {
    throw new MwiError('HELP_TREE_INVALID', `The help tree manifest at ${manifestPath} is not format ${HELP_TREE_FORMAT}.`, 'Rebuild the tree with the knowledge build, or set MWI_HELP_TREE to a complete tree.')
  }
  return manifest
}

/** The fix sentence for a missing tree. */
function helpFix(root: string | undefined): string {
  const where = root === undefined ? 'MWI_HELP_TREE is unset' : `MWI_HELP_TREE points at ${root}, which has no index.json`
  return `${where}. Point MWI_HELP_TREE at an extracted MotionWorks IEC help tree, or install MotionWorks IEC 3 Pro so its CHMs exist under %ProgramData%\\Yaskawa\\MotionWorks IEC 3 Pro\\<version>\\plc\\FW_LIB\\<library>; this host has no installed help tree.`
}

/**
 * Write a synthetic help tree for tests and fixtures.
 *
 * @param root - Directory to populate.
 * @param topics - Topics to write, in order.
 * @returns The absolute manifest path.
 */
export function writeHelpTree(root: string, topics: readonly HelpTopic[]): string {
  mkdirSync(root, { recursive: true })
  const topicsDir = join(root, 'topics')
  mkdirSync(topicsDir, { recursive: true })
  const rows: HelpTreeManifestRow[] = []
  for (const topic of topics) {
    const id = safeId(topic.id)
    const file = `topics/${id}.htm`
    const body = `<html><body><h1>${escapeHtml(topic.title)}</h1><p>${escapeHtml(topic.text)}</p></body></html>`
    writeFileSync(join(root, file), body, 'utf8')
    rows.push({
      id,
      title: topic.title,
      file,
      ...(topic.keywords === undefined ? {} : { keywords: topic.keywords }),
    })
  }
  const manifest: HelpTreeManifest = { format: HELP_TREE_FORMAT, topics: rows }
  const manifestPath = join(root, 'index.json')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8')
  return manifestPath
}

/**
 * Read one help topic by id.
 *
 * @param root - The tree root.
 * @param id - Topic id from `mw_help` listing.
 * @returns The topic with plain text.
 */
export function readHelpTopic(root: string, id: string): HelpTopicDocument {
  const manifest = readManifest(root)
  const row = manifest.topics.find(topic => topic.id === id)
  if (row === undefined) {
    throw new MwiError(
      'HELP_TOPIC_NOT_FOUND',
      `No help topic ${id} exists in the help tree at ${root}.`,
      'Call mw_help with source "help" and no id to list available topic ids.',
      manifest.topics.map(topic => topic.id).slice(0, 20),
    )
  }
  const path = join(root, row.file)
  let raw: string
  try {
    raw = readFileSync(path, 'utf8')
  } catch {
    throw new MwiError('HELP_TREE_INVALID', `The help topic file ${path} could not be read.`, 'Rebuild the tree with the knowledge build.')
  }
  return { id: row.id, title: row.title, text: htmlToText(raw), path, source: HELP_TREE_ENV }
}

/**
 * Search the help tree for text.
 *
 * @param root - The tree root.
 * @param query - Space-separated terms; every term must appear somewhere in the topic.
 * @param limit - Most matches.
 * @returns Matches, best first.
 */
export function searchHelpTopics(root: string, query: string, limit = 10): HelpSearchResult {
  const manifest = readManifest(root)
  const terms = query.toLowerCase().split(/\s+/u).map(term => term.trim()).filter(term => term !== '')
  const matches: HelpTopicMatch[] = []
  for (const row of manifest.topics) {
    let text = ''
    try {
      text = htmlToText(readFileSync(join(root, row.file), 'utf8'))
    } catch {
      text = ''
    }
    const title = row.title.toLowerCase()
    const keywords = (row.keywords ?? []).join(' ').toLowerCase()
    const body = text.toLowerCase()
    const haystack = `${title}\n${keywords}\n${body}`
    if (terms.length > 0 && !terms.every(term => haystack.includes(term))) continue
    let score = 0
    for (const term of terms) {
      if (title.includes(term)) score += 3
      if (keywords.includes(term)) score += 2
      if (body.includes(term)) score += 1
    }
    const firstTerm = terms[0]
    const index = firstTerm === undefined ? -1 : body.indexOf(firstTerm)
    const snippet = index === -1 ? text.slice(0, 160) : text.slice(Math.max(0, index - 40), index + 120)
    matches.push({ id: row.id, title: row.title, snippet: snippet.trim(), score })
  }
  matches.sort((left, right) => right.score - left.score || left.title.localeCompare(right.title, 'en'))
  return {
    matches: matches.slice(0, limit),
    scanned: manifest.topics.length,
    truncated: matches.length > limit,
  }
}

/**
 * Report whether an extracted help tree is available.
 *
 * @param root - The tree root; defaults to `MWI_HELP_TREE`.
 * @returns The probe answer.
 */
export function probeHelpTree(root: string | undefined = helpTreeRootFromEnv()): HelpTreeProbe {
  const manifestFound = root !== undefined && existsSync(join(root, 'index.json'))
  return {
    ...(root === undefined ? {} : { root }),
    found: manifestFound,
    looked_for: [
      { where: `${HELP_TREE_ENV} (${root ?? 'unset'})`, found: root !== undefined, note: root === undefined ? 'The environment variable is not set.' : 'The environment variable is set.' },
      { where: root === undefined ? '<root>/index.json' : join(root, 'index.json'), found: manifestFound, note: manifestFound ? 'Tree manifest found.' : 'No tree manifest there.' },
      { where: '%ProgramData%\\Yaskawa\\MotionWorks IEC 3 Pro\\<version>\\plc\\FW_LIB\\<library>\\*.chm', found: false, note: 'Installed CHMs are not extracted by this release; only a configured tree is read.' },
    ],
    fix: helpFix(root),
  }
}
