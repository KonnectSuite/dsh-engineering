#!/usr/bin/env node
/**
 * Build the engineering resources index from the corpus.
 *
 * The corpus is Markdown with YAML front matter; this script is the only thing
 * that reads it as data. It validates every page (required fields, domains,
 * levels, rule-id uniqueness, size and word budgets) and writes `index.json`
 * plus `SOURCE.json` next to the corpus. `--check` rebuilds in memory and fails
 * when the committed index is stale, so CI catches a page edited without a
 * rebuild.
 *
 * Usage:
 *   node scripts/gen-resources.mjs [--check]
 *
 * @module dsh-engineering/scripts/gen-resources
 */

import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGE = join(ROOT, 'packages', 'resources')
const CORPUS = join(PACKAGE, 'corpus')
export const DOMAINS = ['iec', 'rockwell', 'yaskawa', 'view', 'optix', 'craft']
export const LEVELS = ['intro', 'practitioner', 'specialist']
const MAX_WORDS = 900
const MAX_BYTES = 12 * 1024
const RULE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+-\d{2}$/u

/** Parse the tiny YAML subset the front matter uses. */
export function parseFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(text)
  if (match === null) throw new Error('missing front matter delimited by --- lines')
  const fields = {}
  for (const line of match[1].split(/\r?\n/u)) {
    if (line.trim() === '' || line.trim().startsWith('#')) continue
    const separator = line.indexOf(':')
    if (separator < 0) throw new Error(`bad front-matter line: ${line}`)
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if (value.startsWith('[') && value.endsWith(']')) {
      fields[key] = value.slice(1, -1).split(',').map(entry => entry.trim()).filter(entry => entry !== '')
    } else {
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
      fields[key] = value
    }
  }
  return { fields, body: match[2] }
}

/** One page as the index and validator see it. */
export function readPage(path) {
  const text = readFileSync(path, 'utf8')
  const { fields, body } = parseFrontMatter(text)
  const id = fields.id
  const domain = fields.domain
  const problems = []
  for (const key of ['id', 'title', 'domain', 'level', 'basis', 'tags', 'applies_to', 'rules']) {
    if (fields[key] === undefined || (Array.isArray(fields[key]) && fields[key].length === 0)) problems.push(`missing ${key}`)
  }
  if (!DOMAINS.includes(domain)) problems.push(`unknown domain ${JSON.stringify(domain)}`)
  if (!LEVELS.includes(fields.level)) problems.push(`unknown level ${JSON.stringify(fields.level)}`)
  const basename = path.split(/[\\/]/u).pop()?.replace(/\.md$/u, '')
  if (id !== basename) problems.push(`id ${JSON.stringify(id)} does not match file name ${basename}`)
  if (!/^[a-z0-9]+(-[a-z0-9]+)+$/u.test(id ?? '')) problems.push(`id ${JSON.stringify(id)} is not kebab-case`)
  const rules = Array.isArray(fields.rules) ? fields.rules : [fields.rules].filter(Boolean)
  for (const rule of rules) if (!RULE.test(rule)) problems.push(`rule ${JSON.stringify(rule)} is not in DOMAIN-TOPIC-NN form`)
  const words = body.trim().split(/\s+/u).filter(Boolean).length
  const bytes = Buffer.byteLength(text)
  if (words > MAX_WORDS) problems.push(`${words} words exceeds ${MAX_WORDS}`)
  if (bytes > MAX_BYTES) problems.push(`${bytes} bytes exceeds ${MAX_BYTES}`)
  return {
    problems,
    page: {
      id,
      title: fields.title,
      domain,
      level: fields.level,
      basis: Array.isArray(fields.basis) ? fields.basis : [fields.basis],
      tags: Array.isArray(fields.tags) ? fields.tags : [fields.tags],
      applies_to: Array.isArray(fields.applies_to) ? fields.applies_to : [fields.applies_to],
      rules,
      words,
      bytes,
      sha256: createHash('sha256').update(body).digest('hex'),
    },
  }
}

/** Every page in the corpus, in stable order. */
export function buildCorpus(directory = CORPUS) {
  const pages = []
  const problems = []
  for (const domain of DOMAINS) {
    const folder = join(directory, domain)
    if (!existsSync(folder)) { problems.push(`missing domain folder ${domain}`); continue }
    for (const name of readdirSync(folder).filter(entry => entry.endsWith('.md')).sort()) {
      const result = readPage(join(folder, name))
      problems.push(...result.problems.map(problem => `${domain}/${name}: ${problem}`))
      pages.push(result.page)
    }
  }
  const ids = new Map()
  const ruleOwners = new Map()
  for (const page of pages) {
    if (ids.has(page.id)) problems.push(`duplicate id ${page.id}`)
    ids.set(page.id, true)
    for (const rule of page.rules) {
      const owner = ruleOwners.get(rule)
      if (owner !== undefined && owner !== page.id) problems.push(`rule ${rule} appears in ${owner} and ${page.id}`)
      ruleOwners.set(rule, page.id)
    }
  }
  pages.sort((left, right) => left.domain.localeCompare(right.domain) || left.id.localeCompare(right.id))
  const digest = createHash('sha256').update(pages.map(page => `${page.id}:${page.sha256}`).join('\n')).digest('hex')
  return { pages, problems, digest }
}

/** The files the build writes. */
export function buildFiles(directory = CORPUS) {
  const { pages, problems, digest } = buildCorpus(directory)
  if (problems.length > 0) throw new Error(`corpus validation failed:\n${problems.join('\n')}`)
  return {
    index: { corpus: 1, pages },
    source: { corpus: 1, built: new Date().toISOString(), digest, pages: pages.length },
    digest,
  }
}

/** Compare the committed index with a fresh build. */
export function checkCurrent(directory = CORPUS) {
  const { pageCount } = (() => ({ pageCount: readdirSync(directory).length }))()
  const files = buildFiles(directory)
  const indexPath = join(PACKAGE, 'index.json')
  const sourcePath = join(PACKAGE, 'SOURCE.json')
  if (!existsSync(indexPath) || !existsSync(sourcePath)) return { ok: false, reason: 'index.json or SOURCE.json is missing; run pnpm resources:build' }
  const index = JSON.parse(readFileSync(indexPath, 'utf8'))
  const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
  const expected = JSON.stringify(files.index)
  if (JSON.stringify(index) !== expected) return { ok: false, reason: 'index.json is stale; run pnpm resources:build' }
  if (source.digest !== files.digest) return { ok: false, reason: 'SOURCE.json digest does not match the corpus; run pnpm resources:build' }
  return { ok: true, pages: files.index.pages.length, digest: files.digest, pageCount }
}

const check = process.argv.includes('--check')
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (check) {
    const result = checkCurrent()
    if (!result.ok) {
      console.error(`resources: ${result.reason}`)
      process.exit(1)
    }
    console.log(`resources: ${result.pages} pages, digest ${result.digest.slice(0, 12)}, up to date`)
  } else {
    const files = buildFiles()
    writeFileSync(join(PACKAGE, 'index.json'), `${JSON.stringify(files.index, null, 2)}\n`, 'utf8')
    writeFileSync(join(PACKAGE, 'SOURCE.json'), `${JSON.stringify(files.source, null, 2)}\n`, 'utf8')
    console.log(`resources: wrote ${files.index.pages.length} pages, digest ${files.digest.slice(0, 12)}`)
  }
}
