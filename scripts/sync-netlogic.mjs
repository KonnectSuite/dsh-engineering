/**
 * Vendor the FactoryTalk Optix NetLogic cheat sheet.
 *
 * The upstream repository is a maintenance snapshot, not a dependency: this script
 * pins one commit, copies its `pages/*.md` verbatim and writes the index the
 * `optix_netlogic` tool reads. Nothing is fetched at runtime.
 *
 * Usage:
 *   node scripts/sync-netlogic.mjs                 # resolve main, vendor it
 *   node scripts/sync-netlogic.mjs --commit <sha>  # pin an explicit commit
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const OUT = join(ROOT, 'packages', 'optix', 'netlogic')
const REPOSITORY = 'FactoryTalk-Optix/NetLogic_CheatSheet'
const API = 'https://api.github.com/repos'

const argument = (name) => {
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

/** GET a URL as text, refusing a non-200. */
async function getText(url) {
  const response = await fetch(url, { headers: { 'user-agent': 'dsh-engineering-netlogic-sync' } })
  if (!response.ok) throw new Error(`${url} returned ${String(response.status)}`)
  return await response.text()
}

/** One identifier-looking code span, ignoring shell/markup noise. */
const symbolOf = (span) => /^[A-Za-z_][A-Za-z0-9_.]{2,}$/u.test(span) ? span : undefined

/** Plain words from a heading, lower-cased and de-duplicated. */
const wordsOf = (text) => [...new Set(text.toLowerCase().match(/[a-z][a-z0-9_]{2,}/gu) ?? [])]

/** Index one markdown page. */
function indexPage(slug, markdown, section, advancedSection) {
  const title = /^#\s+(.+)$/mu.exec(markdown)?.[1]?.trim() ?? slug
  const headings = [...markdown.matchAll(/^#{2,4}\s+(.+)$/gmu)].map(match => match[1].trim())
  const symbols = [...new Set([...markdown.matchAll(/`([^`\n]+)`/gu)].map(match => symbolOf(match[1].trim())).filter(Boolean))]
  const topics = [...new Set([...wordsOf(title), ...headings.flatMap(wordsOf), ...symbols.map(symbol => symbol.toLowerCase())])].slice(0, 40)
  const lowLevel = advancedSection || /not officially supported|low-level feature/iu.test(markdown)
  return {
    slug,
    title,
    section,
    topics,
    symbols: symbols.slice(0, 40),
    risk: advancedSection ? 'unsupported' : lowLevel ? 'advanced' : 'normal',
    bytes: Buffer.byteLength(markdown),
  }
}

/** Map every page link in the README to its section heading. */
function sectionsOf(readme) {
  const sections = new Map()
  let current = 'General'
  let advanced = false
  for (const line of readme.split(/\r?\n/u)) {
    const heading = /^#{2,4}\s+(.+)$/u.exec(line)
    if (heading !== null) {
      current = heading[1].trim()
      advanced = /^advanced$/iu.test(current)
      continue
    }
    const page = /\]\(\.\/pages\/([A-Za-z0-9._-]+)\.md\)/u.exec(line)
    if (page !== null) sections.set(page[1], { section: current, advanced })
  }
  return sections
}

const commit = argument('commit') ?? JSON.parse(await getText(`${API}/${REPOSITORY}/commits/main`)).sha
console.log(`syncing ${REPOSITORY}@${commit.slice(0, 12)}`)

const readme = await getText(`https://raw.githubusercontent.com/${REPOSITORY}/${commit}/README.md`)
const sections = sectionsOf(readme)
const archive = join(tmpdir(), `netlogic-${commit}.tgz`)
const response = await fetch(`https://codeload.github.com/${REPOSITORY}/tar.gz/${commit}`)
if (!response.ok) throw new Error(`archive download returned ${String(response.status)}`)
writeFileSync(archive, Buffer.from(await response.arrayBuffer()))

const scratch = mkdtempSync(join(tmpdir(), 'netlogic-src-'))
const extracted = spawnSync('tar', ['-xzf', archive, '-C', scratch], { encoding: 'utf8', windowsHide: true })
if (extracted.status !== 0) throw new Error(`tar failed: ${extracted.stderr}`)
const root = join(scratch, readdirSync(scratch)[0] ?? '')
const pagesDir = join(root, 'pages')
const files = readdirSync(pagesDir).filter(name => name.endsWith('.md')).sort()
if (files.length === 0) throw new Error('the archive contains no pages/*.md')

rmSync(OUT, { recursive: true, force: true })
mkdirSync(join(OUT, 'pages'), { recursive: true })
const index = []
for (const file of files) {
  const slug = basename(file, '.md')
  const markdown = readFileSync(join(pagesDir, file), 'utf8')
  writeFileSync(join(OUT, 'pages', `${slug}.md`), markdown)
  const meta = sections.get(slug) ?? { section: 'General', advanced: false }
  index.push(indexPage(slug, markdown, meta.section, meta.advanced))
}
index.sort((left, right) => left.section.localeCompare(right.section) || left.title.localeCompare(right.title))

writeFileSync(join(OUT, 'index.json'), `${JSON.stringify(index, undefined, 2)}\n`)
writeFileSync(join(OUT, 'SOURCE.json'), `${JSON.stringify({
  repository: REPOSITORY,
  commit,
  fetched_at: new Date().toISOString(),
  pages: index.length,
  readme_sha256: createHash('sha256').update(readme).digest('hex'),
  risks: Object.fromEntries(['normal', 'advanced', 'unsupported'].map(risk => [risk, index.filter(row => row.risk === risk).length])),
}, undefined, 2)}\n`)
rmSync(scratch, { recursive: true, force: true })
rmSync(archive, { force: true })
console.log(`wrote ${index.length} pages to packages/optix/netlogic (${index.filter(row => row.risk !== 'normal').length} carrying a risk flag)`)
