#!/usr/bin/env node
/**
 * gen-ftview-knowledge.mjs — deterministic generator for the FactoryTalk View
 * knowledge corpora that ship inside packages/ftview/knowledge.
 *
 * WHAT IT GENERATES
 *
 * 1. ftview-me (authored)
 *    index.json for our own operator knowledge about FactoryTalk View ME.
 *    The prose lives in pages/*.md; the index records each page's id (the file
 *    stem), title (first "# " heading), optional section and identifiers (from
 *    a single HTML-comment metadata line, see AUTHORS below), and the body path.
 *    Only our own words are committed here; no vendor page text.
 *
 * 2. ftview-me-help and ftview-se-help (installed-help)
 *    STRUCTURAL indexes of the locally installed OEM Help, parsed from
 *    oxygen-webhelp search metadata and the TOC. One entry per topic page:
 *    id (help path without ".html"), title, section (TOC chapter/group title),
 *    path (relative help path), and identifiers (vendor index.xml terms that
 *    point at exactly one page, plus non-empty context-help-map helpIDs).
 *    No vendor page body, description, keyword list or page text is stored, and
 *    the installed Help is never copied into pages/*.md at build time. A `read`
 *    against these collections parses the local install at call time; if the
 *    install is absent the tool reports SOURCE_NOT_INSTALLED and names the roots
 *    it searched.
 *
 * SOURCES PARSED FROM AN INSTALLED HELP ROOT
 *
 *   sitemap.xml                                     -> the topic-page set
 *   oxygen-webhelp/app/search/index/htmlFileInfoList.js -> path + title per page
 *   oxygen-webhelp/app/search/index/link-to-parent.js   -> TOC parent index
 *   index.xml                                       -> vendor index terms
 *   context-help-map.xml                            -> helpID -> page path
 *
 * INSTALL ROOTS (machine-specific; override with --me-root / --se-root)
 *
 *   FTView ME: C:\Program Files (x86)\Common Files\Rockwell\Help\FTViewME\Help
 *   FTView SE: C:\Program Files (x86)\Common Files\Rockwell\Help\FTViewSE\Help
 *
 * Measured on the authoring host (FactoryTalk View 15.00.00, CPR 9 SR 15):
 *   ME: 1,991 files, 1,548 HTML, 133.06 MB, 1,544 topic pages, sitemap 1,544 URLs
 *   SE: 3,063 files, 2,607 HTML, 136.54 MB, 2,603 topic pages, sitemap 2,603 URLs
 * The indexes in this repository were generated from that install. The revision
 * string in an index is the installed product version: detected from the
 * Windows uninstall registry, then falling back to the measured constant below.
 *
 * SECTION GRANULARITY (deterministic, per collection)
 *
 *   ME: section = the top-level TOC chapter (24 chapters).
 *       A second level was measured and rejected: 270 sections, 174 of them
 *       holding a single page.
 *   SE: section = the second TOC level (69 sections).
 *       The top level was measured and rejected: 6 chapters, one of which holds
 *       about 2,400 of the 2,603 pages.
 *   A page shallower than the chosen depth uses its own title as its section.
 *
 * DETERMINISM
 *
 *   - pages are sorted by id with a code-unit comparator, never locale order;
 *   - identifiers are de-duplicated and sorted the same way;
 *   - no timestamps, absolute paths, hostnames, build dates or install-root
 *     strings are written into the indexes;
 *   - JSON is stringify(2 spaces) plus one trailing newline, LF endings, UTF-8
 *     without a BOM. Two runs against the same install are byte-identical.
 *
 * USAGE
 *
 *   node scripts/gen-ftview-knowledge.mjs            # rewrite the corpora
 *   node scripts/gen-ftview-knowledge.mjs --check    # exit 1 when stale
 *   node scripts/gen-ftview-knowledge.mjs --me-root <dir> --se-root <dir>
 *   node scripts/gen-ftview-knowledge.mjs --me-revision 15.00.00
 *
 *   --check always checks the authored collection. Installed-help collections
 *   are checked only when their install root exists; on a machine without the
 *   OEM Help they are reported as skipped, not as stale (the committed indexes
 *   are still shipped and the tool still serves titles/sections from them).
 *
 * AUTHORS
 *
 *   Each page is pages/<id>.md. The first non-empty line must be "# Title".
 *   Section and identifiers are optional, on the first metadata comment:
 *
 *     # Export and import handoff
 *     <!-- section: Export and import; identifiers: BatchImport, importType, UTF-8 -->
 *
 *   The page body is our own explanation; the generator never invents prose.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import vm from 'node:vm'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = dirname(HERE)
const KNOWLEDGE_DIR = join(REPO_ROOT, 'packages', 'ftview', 'knowledge')

/** The two installed-help roots, as measured on the authoring host. */
const DEFAULT_HELP_ROOTS = {
  me: 'C:\\Program Files (x86)\\Common Files\\Rockwell\\Help\\FTViewME\\Help',
  se: 'C:\\Program Files (x86)\\Common Files\\Rockwell\\Help\\FTViewSE\\Help',
}

/** Fallback revision strings, measured with FactoryTalk View 15.00.00 (CPR 9 SR 15). */
const DEFAULT_REVISIONS = { me: '15.00.00', se: '15.00.00' }

/** Registry display-name fragments used to detect the installed version. */
const REVISION_PRODUCTS = {
  me: ['FactoryTalk View Studio Enterprise', 'FactoryTalk View Studio', 'FactoryTalk View ME Station'],
  se: ['FactoryTalk View Site Edition Server', 'FactoryTalk View Studio Enterprise', 'FactoryTalk View Site Edition Client'],
}

/**
 * The collections this package ships. `dir` is relative to the package's
 * knowledge directory; `root` (in the runtime adapter) is the same string.
 */
export const COLLECTIONS = [
  {
    id: 'ftview-me',
    title: 'FactoryTalk View ME operator knowledge',
    source: 'authored',
    dir: 'ftview-me',
  },
  {
    id: 'ftview-me-help',
    title: 'FactoryTalk View ME Help — installed structural index',
    source: 'installed-help',
    dir: 'ftview-me-help',
    helpRootKey: 'me',
    sectionDepth: 1,
  },
  {
    id: 'ftview-se-help',
    title: 'FactoryTalk View SE Help — installed structural index',
    source: 'installed-help',
    dir: 'ftview-se-help',
    helpRootKey: 'se',
    sectionDepth: 2,
  },
]

const HELP_MARKERS = [
  'sitemap.xml',
  'index.xml',
  'context-help-map.xml',
  join('oxygen-webhelp', 'app', 'search', 'index', 'htmlFileInfoList.js'),
  join('oxygen-webhelp', 'app', 'search', 'index', 'link-to-parent.js'),
]

/* ------------------------------------------------------------------------- */
/* deterministic ordering / text helpers                                      */
/* ------------------------------------------------------------------------- */

/** Code-unit comparison; never locale order. */
function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0
}

function sortedUnique(values) {
  const unique = new Set(values.filter((value) => typeof value === 'string' && value.length > 0))
  return [...unique].sort(compareText)
}

function normalizeNewlines(text) {
  return text.replace(/\r\n?/g, '\n')
}

function cleanText(value) {
  return normalizeNewlines(String(value)).replace(/\s+/gu, ' ').trim()
}

function decodeEntities(text) {
  const named = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
    dash: '-',
    ndash: '\u2013',
    mdash: '\u2014',
    hellip: '\u2026',
    copy: '\u00a9',
    reg: '\u00ae',
    trade: '\u2122',
    lsquo: '\u2018',
    rsquo: '\u2019',
    ldquo: '\u201c',
    rdquo: '\u201d',
    times: '\u00d7',
    frac12: '\u00bd',
    deg: '\u00b0',
  }
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/gu, (whole, body) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? Number.parseInt(body.slice(2), 16) : Number.parseInt(body.slice(1), 10)
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole
    }
    return Object.hasOwn(named, body) ? named[body] : whole
  })
}

function readText(path) {
  let text = readFileSync(path, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return normalizeNewlines(text)
}

function requireFile(path, what) {
  if (!existsSync(path)) {
    throw new Error(`${what} is missing: ${path}`)
  }
}

function formatIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`
}

/* ------------------------------------------------------------------------- */
/* WebHelp parsers                                                           */
/* ------------------------------------------------------------------------- */

function parseHtmlFileInfoList(helpRoot) {
  const path = join(helpRoot, 'oxygen-webhelp', 'app', 'search', 'index', 'htmlFileInfoList.js')
  requireFile(path, 'WebHelp page list')
  const text = readText(path)
  const match = /var\s+htmlFileInfoList\s*=\s*/u.exec(text)
  if (match === null) throw new Error('htmlFileInfoList.js does not contain "var htmlFileInfoList =".')
  let body = text.slice(match.index + match[0].length).trim()
  if (body.endsWith(';')) body = body.slice(0, -1).trim()
  let list
  try {
    list = JSON.parse(body)
  } catch (error) {
    throw new Error(`htmlFileInfoList.js is not the expected JSON array: ${error.message}`)
  }
  if (!Array.isArray(list)) throw new Error('htmlFileInfoList.js did not yield an array.')

  const entries = list.map((row, index) => {
    const parts = String(row).split('@@@')
    if (parts.length < 2) throw new Error(`htmlFileInfoList.js entry ${index} has no "@@@" separator.`)
    return { index, path: parts[0].replaceAll('\\', '/'), title: parts[1] }
  })
  return entries
}

function parseLinkToParent(helpRoot) {
  const path = join(helpRoot, 'oxygen-webhelp', 'app', 'search', 'index', 'link-to-parent.js')
  requireFile(path, 'WebHelp TOC parent map')
  const text = readText(path)
  const match = /var\s+linkToParent\s*=\s*/u.exec(text)
  if (match === null) throw new Error('link-to-parent.js does not contain "var linkToParent =".')
  let body = text.slice(match.index + match[0].length).trim()
  if (body.endsWith(';')) body = body.slice(0, -1).trim()
  // The vendored file is a JavaScript object literal (unquoted integer keys, no
  // trailing comments); JSON.parse would throw, so evaluate it in an empty VM.
  let parsed
  try {
    const context = vm.createContext({})
    parsed = vm.runInContext(`(${body})`, context, { timeout: 5000 })
  } catch (error) {
    throw new Error(`link-to-parent.js could not be evaluated: ${error.message}`)
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('link-to-parent.js did not evaluate to an object.')
  }
  const parents = new Map()
  for (const [key, value] of Object.entries(parsed)) {
    const index = Number(key)
    const parent = Number(value)
    if (!Number.isInteger(index) || !Number.isInteger(parent)) {
      throw new Error(`link-to-parent.js has a non-integer entry: ${key} -> ${value}`)
    }
    parents.set(index, parent)
  }
  return parents
}

function parseSitemap(helpRoot) {
  const path = join(helpRoot, 'sitemap.xml')
  requireFile(path, 'WebHelp sitemap')
  const text = readText(path)
  const locations = []
  const pattern = /<loc>\s*([^<]*?)\s*<\/loc>/gu
  let match = pattern.exec(text)
  while (match !== null) {
    locations.push(decodeEntities(match[1]).replaceAll('\\', '/'))
    match = pattern.exec(text)
  }
  if (locations.length === 0) throw new Error('sitemap.xml contains no <loc> entries.')
  return locations
}

/**
 * Vendor index terms: <term name="..."> may nest, and <target> entries may be
 * duplicated. Only terms whose distinct target set is exactly one page become
 * identifiers — multi-target terms are editorial cross-references, not names of
 * a single page.
 */
function parseIndexTerms(helpRoot) {
  const path = join(helpRoot, 'index.xml')
  requireFile(path, 'vendor index')
  const text = readText(path)
  const tagPattern = /<(\/?)([A-Za-z][A-Za-z0-9:._-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gu
  const termNames = []
  const targetsByTerm = new Map()

  let match = tagPattern.exec(text)
  while (match !== null) {
    const closing = match[1] === '/'
    const name = match[2].toLowerCase()
    const attrs = match[3]
    const selfClosing = match[4] === '/'

    if (name === 'term') {
      if (closing) {
        termNames.pop()
      } else {
        const nameMatch = /name="([^"]*)"/u.exec(attrs)
        termNames.push(nameMatch === null ? '' : decodeEntities(nameMatch[1]))
        if (!selfClosing) {
          // nothing to do; target children are recorded while the term is open
        }
      }
    } else if (name === 'target' && !closing && termNames.length > 0) {
      const closeIndex = text.indexOf('</target>', tagPattern.lastIndex)
      if (closeIndex === -1) throw new Error('index.xml has an unclosed <target> element.')
      const target = decodeEntities(text.slice(tagPattern.lastIndex, closeIndex)).trim().replaceAll('\\', '/')
      const leaf = termNames[termNames.length - 1]
      if (leaf.length > 0 && target.length > 0) {
        if (!targetsByTerm.has(leaf)) targetsByTerm.set(leaf, new Set())
        targetsByTerm.get(leaf).add(target)
      }
      tagPattern.lastIndex = closeIndex + '</target>'.length
    }
    match = tagPattern.exec(text)
  }
  return targetsByTerm
}

function parseContextHelpMap(helpRoot) {
  const path = join(helpRoot, 'context-help-map.xml')
  requireFile(path, 'context help map')
  const text = readText(path)
  const pairs = []
  const pattern = /<appContext\b([^>]*?)(?:\/>|>)/gu
  let match = pattern.exec(text)
  while (match !== null) {
    const attrs = match[1]
    const helpMatch = /helpID="([^"]*)"/u.exec(attrs)
    const pathMatch = /path="([^"]*)"/u.exec(attrs)
    if (helpMatch !== null && pathMatch !== null) {
      const helpID = decodeEntities(helpMatch[1]).trim()
      const helpPath = decodeEntities(pathMatch[1]).trim().replaceAll('\\', '/')
      if (helpID.length > 0 && helpPath.length > 0) pairs.push({ helpID, path: helpPath })
    }
    match = pattern.exec(text)
  }
  return pairs
}

/* ------------------------------------------------------------------------- */
/* installed-help index                                                      */
/* ------------------------------------------------------------------------- */

function ancestorsOf(parents, index, pathForError) {
  const chain = [index]
  let current = index
  for (let guard = 0; guard < 64; guard += 1) {
    const parent = parents.get(current)
    if (parent === undefined) {
      if (chain.length === 1) return chain
      throw new Error(`link-to-parent.js has no parent for page index ${current} (${pathForError}).`)
    }
    if (parent === -1) return chain.reverse()
    if (parent < 0 || !Number.isInteger(parent)) {
      throw new Error(`link-to-parent.js has an invalid parent ${parent} for page index ${current}.`)
    }
    chain.push(parent)
    current = parent
  }
  throw new Error(`TOC ancestry for ${pathForError} is deeper than 64 levels or has a cycle.`)
}

function buildInstalledHelpIndex(collection, helpRoot, revision) {
  for (const marker of [join(helpRoot, HELP_MARKERS[0]), join(helpRoot, HELP_MARKERS[1]), join(helpRoot, HELP_MARKERS[2]), join(helpRoot, HELP_MARKERS[3]), join(helpRoot, HELP_MARKERS[4])]) {
    requireFile(marker, `${collection.id} Help file`)
  }

  const info = parseHtmlFileInfoList(helpRoot)
  const parents = parseLinkToParent(helpRoot)
  const locations = parseSitemap(helpRoot)
  const termTargets = parseIndexTerms(helpRoot)
  const contextHelp = parseContextHelpMap(helpRoot)

  const topicPaths = new Set(locations.filter((location) => /\.html$/iu.test(location)))
  if (topicPaths.size !== locations.length) {
    throw new Error(`${collection.id} sitemap has ${locations.length - topicPaths.size} non-HTML location(s).`)
  }

  const byPath = new Map()
  for (const entry of info) {
    if (!topicPaths.has(entry.path)) continue
    if (byPath.has(entry.path)) throw new Error(`${collection.id} page list repeats ${entry.path}.`)
    byPath.set(entry.path, entry)
  }
  const missing = [...topicPaths].filter((path) => !byPath.has(path))
  if (missing.length > 0) {
    throw new Error(`${collection.id} page list is missing ${missing.length} sitemap page(s), first: ${missing[0]}`)
  }
  const byIndex = new Map(info.map((entry) => [entry.index, entry]))

  const identifiersByPath = new Map()
  const addIdentifier = (path, identifier) => {
    if (!topicPaths.has(path)) return
    if (!identifiersByPath.has(path)) identifiersByPath.set(path, [])
    identifiersByPath.get(path).push(identifier)
  }
  for (const [term, targets] of termTargets) {
    if (targets.size === 1) addIdentifier([...targets][0], term)
  }
  for (const pair of contextHelp) addIdentifier(pair.path, pair.helpID)

  const pages = []
  for (const path of [...topicPaths].sort(compareText)) {
    const entry = byPath.get(path)
    if (entry === undefined) throw new Error(`internal: no page-list entry for ${path}`)
    const title = cleanText(decodeEntities(entry.title))
    if (title.length === 0) throw new Error(`${collection.id} page ${path} has an empty title.`)
    const id = path.replace(/\.html$/iu, '')
    if (id === path) throw new Error(`${collection.id} page ${path} does not end in .html.`)

    const chain = ancestorsOf(parents, entry.index, path)
    const depth = collection.sectionDepth
    const sectionEntry = chain.length >= depth ? chain[depth - 1] : chain[chain.length - 1]
    const sectionSource = byIndex.get(sectionEntry)
    if (sectionSource === undefined) throw new Error(`${collection.id} TOC refers to unknown page index ${sectionEntry}.`)
    const section = cleanText(decodeEntities(sectionSource.title))
    if (section.length === 0) throw new Error(`${collection.id} page ${path} has an empty section title.`)

    const identifiers = sortedUnique(identifiersByPath.get(path) ?? [])
    const page = { id, title, section, path }
    if (identifiers.length > 0) page.identifiers = identifiers
    pages.push(page)
  }

  const ids = new Set(pages.map((page) => page.id))
  if (ids.size !== pages.length) throw new Error(`${collection.id} produced duplicate page ids.`)

  return {
    index: {
      schema: 1,
      collection: collection.id,
      title: collection.title,
      source: 'installed-help',
      revisions: [revision],
      pageCount: pages.length,
      pages,
    },
    stats: {
      pages: pages.length,
      sections: new Set(pages.map((page) => page.section)).size,
      identifiers: pages.reduce((total, page) => total + (page.identifiers?.length ?? 0), 0),
    },
  }
}

/* ------------------------------------------------------------------------- */
/* authored index                                                            */
/* ------------------------------------------------------------------------- */

function parseAuthoredPage(path) {
  const text = readText(path)
  const lines = text.split('\n')
  const titleLine = lines.find((line) => line.trim().length > 0)
  const titleMatch = titleLine === undefined ? null : /^#\s+(.+)$/u.exec(titleLine.trim())
  if (titleMatch === null) throw new Error(`authored page ${basename(path)} must start with "# Title".`)
  const title = cleanText(titleMatch[1])
  if (title.length === 0) throw new Error(`authored page ${basename(path)} has an empty title.`)

  const metaMatch = /<!--([\s\S]*?)-->/u.exec(text)
  let section
  let identifiers = []
  if (metaMatch !== null) {
    for (const field of metaMatch[1].split(';')) {
      const separator = field.indexOf(':')
      if (separator === -1) continue
      const key = field.slice(0, separator).trim().toLowerCase()
      const value = field.slice(separator + 1).trim()
      if (key === 'section' && value.length > 0) section = cleanText(value)
      if (key === 'identifiers') identifiers = sortedUnique(value.split(',').map((identifier) => cleanText(identifier)))
    }
  }
  return { title, section, identifiers }
}

function buildAuthoredIndex(collection, knowledgeDir) {
  const pagesDir = join(knowledgeDir, collection.dir, 'pages')
  if (!existsSync(pagesDir)) throw new Error(`authored corpus directory is missing: ${pagesDir}`)
  const files = readdirSync(pagesDir).filter((file) => /\.md$/iu.test(file)).sort(compareText)
  if (files.length === 0) throw new Error(`authored corpus directory is empty: ${pagesDir}`)

  const pages = []
  for (const file of files) {
    const id = file.replace(/\.md$/iu, '')
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) throw new Error(`authored page id "${id}" is not kebab-case.`)
    const parsed = parseAuthoredPage(join(pagesDir, file))
    const page = { id, title: parsed.title }
    if (parsed.section !== undefined) page.section = parsed.section
    page.body = `pages/${file}`
    if (parsed.identifiers.length > 0) page.identifiers = parsed.identifiers
    pages.push(page)
  }
  pages.sort((left, right) => compareText(left.id, right.id))

  return {
    index: {
      schema: 1,
      collection: collection.id,
      title: collection.title,
      source: 'authored',
      revisions: [],
      pageCount: pages.length,
      pages,
    },
    stats: {
      pages: pages.length,
      sections: new Set(pages.map((page) => page.section ?? '')).size,
      identifiers: pages.reduce((total, page) => total + (page.identifiers?.length ?? 0), 0),
    },
  }
}

/* ------------------------------------------------------------------------- */
/* revision detection                                                        */
/* ------------------------------------------------------------------------- */

function detectInstalledRevision(productNames) {
  if (process.platform !== 'win32') return null
  const conditions = productNames
    .map((name) => `$_.DisplayName -like '*${name.replaceAll("'", "''")}*'`)
    .join(' -or ')
  const script = [
    "$ErrorActionPreference = 'SilentlyContinue'",
    "$paths = @('HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*', 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\*')",
    `$item = Get-ItemProperty $paths | Where-Object { ${conditions} } | Select-Object -First 1`,
    'if ($item) { Write-Output $item.DisplayVersion }',
  ].join('; ')
  try {
    const output = execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true,
    })
    const version = cleanText(output)
    return /^\d+\.\d+\.\d+$/u.test(version) ? version : null
  } catch {
    return null
  }
}

function resolveRevisions(options, helpRoots) {
  const explicit = options.revisions ?? {}
  const revisions = { ...DEFAULT_REVISIONS }
  for (const key of ['me', 'se']) {
    if (typeof explicit[key] === 'string' && explicit[key].length > 0) {
      revisions[key] = explicit[key]
      continue
    }
    if (!existsSync(helpRoots[key])) continue
    const detected = detectInstalledRevision(REVISION_PRODUCTS[key])
    if (detected !== null) revisions[key] = detected
  }
  return revisions
}

/* ------------------------------------------------------------------------- */
/* build / check / write                                                     */
/* ------------------------------------------------------------------------- */

/**
 * Build every corpus in memory.
 * @returns {{ files: Map<string,string>, skipped: {collection: string, reason: string}[], revisions: {me: string, se: string} }}
 */
export function buildKnowledge(options = {}) {
  const repoRoot = resolve(options.repoRoot ?? REPO_ROOT)
  const knowledgeDir = join(repoRoot, 'packages', 'ftview', 'knowledge')
  const helpRoots = { ...DEFAULT_HELP_ROOTS, ...(options.helpRoots ?? {}) }
  const revisions = resolveRevisions(options, helpRoots)
  const files = new Map()
  const skipped = []

  for (const collection of COLLECTIONS) {
    const relativeIndex = `${collection.dir}/index.json`
    if (collection.source === 'authored') {
      files.set(relativeIndex, formatIndex(buildAuthoredIndex(collection, knowledgeDir).index))
      continue
    }

    const helpRoot = helpRoots[collection.helpRootKey]
    if (!existsSync(helpRoot)) {
      skipped.push({ collection: collection.id, reason: `install root not found: ${helpRoot}` })
      continue
    }
    const { index } = buildInstalledHelpIndex(collection, helpRoot, revisions[collection.helpRootKey])
    files.set(relativeIndex, formatIndex(index))
  }

  return { files, skipped, revisions }
}

function describeDiff(knowledgeDir, expected) {
  const issues = []
  for (const [relativePath, content] of [...expected.entries()].sort((left, right) => compareText(left[0], right[0]))) {
    const target = join(knowledgeDir, relativePath)
    if (!existsSync(target)) {
      issues.push(`${relativePath}: missing`)
      continue
    }
    if (!statSync(target).isFile()) {
      issues.push(`${relativePath}: not a file`)
      continue
    }
    if (readFileSync(target, 'utf8') !== content) issues.push(`${relativePath}: stale`)
  }
  return issues
}

function parseArgs(argv) {
  const options = { check: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--check') {
      options.check = true
    } else if (arg === '--me-root') {
      options.helpRoots = { ...(options.helpRoots ?? {}), me: argv[++index] }
    } else if (arg === '--se-root') {
      options.helpRoots = { ...(options.helpRoots ?? {}), se: argv[++index] }
    } else if (arg === '--me-revision') {
      options.revisions = { ...(options.revisions ?? {}), me: argv[++index] }
    } else if (arg === '--se-revision') {
      options.revisions = { ...(options.revisions ?? {}), se: argv[++index] }
    } else if (arg === '--help' || arg === '-h') {
      options.help = true
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return options
}

function printHelp() {
  const script = 'node scripts/gen-ftview-knowledge.mjs'
  console.log(`FactoryTalk View knowledge generator

  ${script}                 rewrite packages/ftview/knowledge (authored + installed)
  ${script} --check         exit 1 when the committed corpora are stale
  ${script} --me-root DIR   parse the ME Help from DIR instead of the default
  ${script} --se-root DIR   parse the SE Help from DIR instead of the default
  ${script} --me-revision V override the ME revision string
  ${script} --se-revision V override the SE revision string

The authored corpus is always checked. Installed-help collections are skipped
when their install root is absent (the committed indexes still ship).`)
}

export function main(argv = process.argv.slice(2)) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    console.error(`gen-ftview-knowledge: ${error.message}`)
    return 2
  }
  if (options.help) {
    printHelp()
    return 0
  }

  const knowledgeDir = join(REPO_ROOT, 'packages', 'ftview', 'knowledge')
  let built
  try {
    built = buildKnowledge(options)
  } catch (error) {
    console.error(`gen-ftview-knowledge: ${error.message}`)
    return 2
  }

  for (const skip of built.skipped) {
    console.log(`skipped ${skip.collection}: ${skip.reason}`)
  }

  if (options.check) {
    const issues = describeDiff(knowledgeDir, built.files)
    if (issues.length > 0) {
      for (const issue of issues) console.error(`stale: ${issue}`)
      console.error(`gen-ftview-knowledge: ${issues.length} knowledge file(s) are stale; run the generator.`)
      return 1
    }
    console.log(`knowledge corpora are current (${built.files.size} file(s) checked${built.skipped.length > 0 ? `, ${built.skipped.length} skipped` : ''}).`)
    return 0
  }

  for (const [relativePath, content] of [...built.files.entries()].sort((left, right) => compareText(left[0], right[0]))) {
    const target = join(knowledgeDir, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  console.log(`wrote ${built.files.size} knowledge file(s) under packages/ftview/knowledge.`)
  return 0
}

const invokedDirectly = (() => {
  const entry = process.argv[1]
  if (typeof entry !== 'string') return false
  return pathToFileURL(resolve(entry)).href === import.meta.url
})()

if (invokedDirectly) {
  process.exitCode = main()
}
