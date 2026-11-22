#!/usr/bin/env node
/**
 * Generate the committed RSLogix 500 authored-knowledge index.
 *
 * The pages under `packages/slc/knowledge/rslogix-500/pages/` are the source of
 * truth. This script validates their front matter, writes a byte-identical
 * `index.json` on every run, and validates the golden query set against the
 * committed page ids.
 *
 * Usage:
 *   node scripts/gen-slc-knowledge.mjs           write the index
 *   node scripts/gen-slc-knowledge.mjs --check   fail when index.json is stale
 *
 * @module scripts/gen-slc-knowledge
 */

import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const COLLECTION_DIR = join(REPO_ROOT, 'packages', 'slc', 'knowledge', 'rslogix-500')
const PAGES_DIR = join(COLLECTION_DIR, 'pages')
const INDEX_PATH = join(COLLECTION_DIR, 'index.json')
const GOLDENS_PATH = join(REPO_ROOT, 'packages', 'slc', 'knowledge', 'goldens.json')
const COLLECTION = 'rslogix-500'
const TITLE = 'RSLogix 500 (SLC 500 and MicroLogix) authored knowledge'
const REVISION = '12.00.00'

function fail(message) {
  process.stderr.write(`gen-slc-knowledge: ${message}\n`)
  process.exit(1)
}

/** Split a page into its YAML front matter and body. */
function splitFrontMatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/u.exec(text)
  if (match === null) return null
  return { frontMatter: match[1], body: match[2] }
}

/** Parse one inline scalar or a bracketed list of scalars. */
function parseScalar(raw) {
  const value = raw.trim()
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim()
    if (inner === '') return []
    const items = []
    let current = ''
    let quoted = false
    for (const character of inner) {
      if (character === '"') {
        quoted = !quoted
        continue
      }
      if (character === ',' && !quoted) {
        items.push(current.trim())
        current = ''
        continue
      }
      current += character
    }
    items.push(current.trim())
    return items.filter(item => item !== '')
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1)
  }
  return value
}

/** Parse the small front-matter shape these pages use. */
function parseFrontMatter(frontMatter) {
  const record = {}
  for (const line of frontMatter.split(/\r?\n/u)) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf(':')
    if (separator <= 0) fail(`unparseable front-matter line: ${line}`)
    const key = trimmed.slice(0, separator).trim()
    const value = trimmed.slice(separator + 1).trim()
    if (key === '') fail(`empty front-matter key in line: ${line}`)
    record[key] = parseScalar(value)
  }
  return record
}

function requireString(record, key, file) {
  const value = record[key]
  if (typeof value !== 'string' || value.trim() === '') fail(`${file}: front matter "${key}" must be a non-empty string`)
  return value.trim()
}

function optionalString(record, key, file) {
  const value = record[key]
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.trim() === '') fail(`${file}: front matter "${key}" must be a non-empty string when present`)
  return value.trim()
}

function stringList(record, key, file) {
  const value = record[key]
  if (value === undefined) return undefined
  if (!Array.isArray(value)) fail(`${file}: front matter "${key}" must be a bracketed list`)
  const items = value.map(item => String(item).trim()).filter(item => item !== '')
  if (items.length === 0) fail(`${file}: front matter "${key}" must not be empty`)
  return items
}

/** Build the committed index from the page files. */
function buildIndex() {
  if (!existsSync(PAGES_DIR)) fail(`missing pages directory: ${PAGES_DIR}`)
  const files = readdirSync(PAGES_DIR)
    .filter(name => name.endsWith('.md'))
    .sort((left, right) => (left < right ? -1 : left > right ? 1 : 0))
  if (files.length === 0) fail('no authored pages found')

  const pages = []
  const seenPageIds = new Set()
  const seenIdentifiers = new Map()
  for (const file of files) {
    const absolute = join(PAGES_DIR, file)
    const split = splitFrontMatter(readFileSync(absolute, 'utf8'))
    if (split === null) fail(`${file}: missing YAML front matter`)
    const record = parseFrontMatter(split.frontMatter)
    const id = requireString(record, 'id', file)
    if (!/^[a-z0-9][a-z0-9-]*$/u.test(id)) fail(`${file}: id "${id}" must be lowercase kebab-case`)
    if (seenPageIds.has(id)) fail(`${file}: duplicate page id "${id}"`)
    seenPageIds.add(id)
    const title = requireString(record, 'title', file)
    const section = optionalString(record, 'section', file)
    const revision = optionalString(record, 'revision', file) ?? REVISION
    const identifiers = stringList(record, 'identifiers', file)
    if (identifiers !== undefined) {
      for (const identifier of identifiers) {
        const previous = seenIdentifiers.get(identifier)
        if (previous !== undefined && previous !== id) fail(`${file}: identifier "${identifier}" is already claimed by page "${previous}"`)
        seenIdentifiers.set(identifier, id)
      }
    }
    if (split.body.trim() === '') fail(`${file}: page body is empty`)
    pages.push({
      id,
      title,
      ...(section === undefined ? {} : { section }),
      body: `pages/${basename(absolute)}`,
      ...(identifiers === undefined ? {} : { identifiers }),
      revision,
    })
  }
  pages.sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))

  return {
    schema: 1,
    collection: COLLECTION,
    title: TITLE,
    source: 'authored',
    revisions: [REVISION],
    pageCount: pages.length,
    pages,
  }
}

/** Validate the golden query set against the committed pages. */
function validateGoldens(index) {
  if (!existsSync(GOLDENS_PATH)) fail(`missing goldens file: ${GOLDENS_PATH}`)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(GOLDENS_PATH, 'utf8'))
  } catch (error) {
    fail(`goldens.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (parsed.schema !== 1) fail('goldens.json: schema must be 1')
  if (!Array.isArray(parsed.cases) || parsed.cases.length === 0) fail('goldens.json: cases must be a non-empty array')
  const pageIds = new Set(index.pages.map(page => page.id))
  const caseIds = new Set()
  let answer = 0
  let exact = 0
  let noMatch = 0
  for (const [position, item] of parsed.cases.entries()) {
    const where = `goldens.json cases[${position}]`
    if (typeof item !== 'object' || item === null || Array.isArray(item)) fail(`${where} must be an object`)
    const id = typeof item.id === 'string' && item.id.trim() !== '' ? item.id.trim() : fail(`${where}: id must be a non-empty string`)
    if (caseIds.has(id)) fail(`${where}: duplicate case id "${id}"`)
    caseIds.add(id)
    const kind = item.kind
    if (kind !== 'answer' && kind !== 'exact' && kind !== 'no-match') fail(`${where}: kind must be answer, exact or no-match`)
    if (typeof item.query !== 'string' || item.query.trim() === '') fail(`${where}: query must be a non-empty string`)
    if (!Array.isArray(item.expect)) fail(`${where}: expect must be an array of page ids`)
    if (item.expect.length > 3) fail(`${where}: expect must not name more than 3 pages`)
    for (const expected of item.expect) {
      if (typeof expected !== 'string' || !pageIds.has(expected)) fail(`${where}: expect names unknown page id "${String(expected)}"`)
    }
    if (kind === 'no-match') {
      if (item.expect.length !== 0) fail(`${where}: a no-match case must expect no page`)
      noMatch += 1
    } else if (kind === 'exact') {
      if (item.expect.length === 0) fail(`${where}: an exact case must expect at least one page`)
      exact += 1
    } else {
      if (item.expect.length === 0) fail(`${where}: an answer case must expect at least one page`)
      answer += 1
    }
  }
  if (answer < 10) fail(`goldens.json: at least 10 answer cases are required, found ${answer}`)
  if (exact < 3) fail(`goldens.json: at least 3 exact cases are required, found ${exact}`)
  if (noMatch < 2) fail(`goldens.json: at least 2 no-match cases are required, found ${noMatch}`)
  if (parsed.cases.length < 15 || parsed.cases.length > 25) fail(`goldens.json: expected 15-25 cases, found ${parsed.cases.length}`)
}

const index = buildIndex()
const rendered = `${JSON.stringify(index, undefined, 2)}\n`
validateGoldens(index)

if (process.argv.includes('--check')) {
  if (!existsSync(INDEX_PATH)) fail(`index.json is missing; run node scripts/gen-slc-knowledge.mjs`)
  const current = readFileSync(INDEX_PATH, 'utf8')
  if (current !== rendered) fail('index.json is stale; run node scripts/gen-slc-knowledge.mjs')
  process.stdout.write(`gen-slc-knowledge: ${index.pageCount} pages, index.json is current\n`)
} else {
  writeFileSync(INDEX_PATH, rendered, 'utf8')
  process.stdout.write(`gen-slc-knowledge: wrote ${index.pageCount} pages to ${INDEX_PATH}\n`)
}
