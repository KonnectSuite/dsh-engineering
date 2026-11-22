#!/usr/bin/env node
/**
 * Generate the committed index for the PLC-5 knowledge collection.
 *
 * Page bodies under `knowledge/plc5-program-text/pages/` are authored markdown and
 * committed as-is; this script emits the index the `plc5_docs` tool reads, validates
 * the corpus (body for every metadata row, no orphan body, under the read cap, LF
 * endings, H1 title), validates the committed goldens against the page ids, and in
 * `--check` mode exits 1 when the committed index is stale.
 *
 * Deterministic by construction: pages sorted by id, fixed key order, no clock, no
 * absolute paths, no build metadata. Two clean runs are byte-identical.
 *
 * Usage:
 *   node scripts/gen-plc5-knowledge.mjs           # write knowledge/plc5-program-text/index.json
 *   node scripts/gen-plc5-knowledge.mjs --check   # exit 1 when the committed index is stale
 *
 * @module dsh-engineering/scripts/gen-plc5-knowledge
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE = 'plc5'
const COLLECTION = 'plc5-program-text'
const TITLE = 'Reading a PLC-5 program as text'
const INDEX_REL = `packages/${PACKAGE}/knowledge/${COLLECTION}/index.json`
const PAGES_REL = `packages/${PACKAGE}/knowledge/${COLLECTION}/pages`
const GOLDENS_REL = `packages/${PACKAGE}/knowledge/goldens.json`

/** The docs engine caps one read at this many characters; a longer page is truncated. */
const MAX_READ_CHARS = 8000

const GOLDEN_MIN = 15
const GOLDEN_MAX = 25
const GOLDEN_EXPECT_MAX = 3

/**
 * The authored pages, in the order a reader should approach them. The index sorts by
 * id and `contents` groups by section.
 *
 * @type {readonly { id: string, title: string, section: string, identifiers?: readonly string[] }[]}
 */
const PAGES = [
  {
    id: 'overview',
    title: 'What the PLC-5 program tools read',
    section: 'Overview',
    identifiers: [
      'plc5_open', 'plc5_ladder', 'plc5_find', 'plc5_io_census', 'plc5_io_config',
      'plc5_data_read', 'plc5_processor', 'plc5_capabilities', 'plc5_pc5',
      'plc5_instruction_inventory', 'plc5_rung_digest', 'plc5_indirect_census',
      'plc5_verify', 'plc5_diff', 'plc5_docs',
    ],
  },
  {
    id: 'instruction-set',
    title: 'PLC-5 instruction set: families and text forms',
    section: 'Program',
    identifiers: [
      'XIC', 'XIO', 'OTE', 'OTL', 'OTU', 'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES',
      'EQU', 'NEQ', 'LES', 'LEQ', 'GRT', 'GEQ', 'LIM', 'MEQ', 'ADD', 'SUB', 'MUL', 'DIV',
      'SQR', 'NEG', 'CPT', 'AND', 'OR', 'XOR', 'NOT', 'MOV', 'MVM', 'COP', 'FLL', 'CLR',
      'JMP', 'LBL', 'JSR', 'SBR', 'RET', 'FOR', 'NXT', 'AFI', 'TND', 'UID', 'UIE', 'SVC',
      'IIM', 'IOM', 'BSL', 'BSR', 'SQO', 'SQC', 'SQI', 'PID', 'MSG', 'BTW', 'BTR', 'DTR',
      'TOD', 'HSC',
    ],
  },
  {
    id: 'rung-grammar',
    title: 'Rung and address grammar in a text export',
    section: 'Program',
    identifiers: ['PC5 EXPORT', 'PROGRAM_FILE', 'END_PROGRAM_FILE', 'RUNG', 'DATA_FILE', 'BST', 'NXB', 'BND'],
  },
  {
    id: 'addressing',
    title: 'PLC-5 address grammar',
    section: 'Program',
    identifiers: ['N7:0', 'B3:0/0', 'T4:0.PRE', 'I:010/00', 'O:013/01', '#N7:0', 'N7:[N10:0]', 'F8:0', 'S:2/0'],
  },
  {
    id: 'io-configuration',
    title: 'I/O configuration: chassis, adapters, and program-only racks',
    section: 'Program',
    identifiers: ['plc5_io_config', 'plc5_io_census', 'plc5_open', 'plc5_ladder', 'BTW', 'BTR'],
  },
  {
    id: 'pc5-export',
    title: 'The .PC5 text export grammar',
    section: 'Text export',
    identifiers: ['PC5 EXPORT', 'PROGRAM_FILE', 'END_PROGRAM_FILE', 'RUNG', 'DATA_FILE', 'END'],
  },
  {
    id: 'pc5-pitfalls',
    title: 'Text export pitfalls: binaries, truncation, and stray bytes',
    section: 'Text export',
    identifiers: ['SOURCE_NOT_INSTALLED', 'UNSUPPORTED_FORMAT', 'NOT_AN_RSP', 'PC5 EXPORT'],
  },
  {
    id: 'text-tools',
    title: 'Reading a text export with the six read-only tools',
    section: 'Text export',
    identifiers: [
      'plc5_pc5', 'plc5_instruction_inventory', 'plc5_rung_digest', 'plc5_indirect_census',
      'plc5_verify', 'plc5_diff', 'UNSUPPORTED_FORMAT', 'SOURCE_NOT_INSTALLED',
    ],
  },
  {
    id: 'error-codes',
    title: 'PLC-5 tool error codes and fixes',
    section: 'Reference',
    identifiers: [
      'PLC5_COM_UNAVAILABLE', 'PLC5_POWERSHELL_MISSING', 'PLC5_OPEN_FAILED', 'PLC5_NO_PROJECT',
      'PLC5_TIMEOUT', 'NOT_AN_RSP', 'FILE_MISSING', 'NOT_A_FILE', 'ACCESS_DENIED',
      'INVALID_ARGUMENT', 'PARSE_ERROR', 'TRUNCATED_EXPORT', 'EMPTY_EXPORT',
      'UNSUPPORTED_FORMAT', 'SOURCE_NOT_INSTALLED',
    ],
  },
]

const display = path => relative(root, path).replaceAll('\\', '/')

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

function readText(path) {
  return readFileSync(path, 'utf8')
}

function buildPages() {
  const pagesDir = join(root, PAGES_REL)
  const ids = [...new Set(PAGES.map(page => page.id))].sort(byCodePoint)
  if (ids.length !== PAGES.length) throw new Error('the page metadata repeats an id')

  const files = readdirSync(pagesDir)
    .filter(name => name.endsWith('.md'))
    .map(name => name.slice(0, -3))
    .sort(byCodePoint)
  const missing = ids.filter(id => !files.includes(id))
  const orphans = files.filter(id => !ids.includes(id))
  if (missing.length > 0) throw new Error(`no page body for: ${missing.join(', ')}`)
  if (orphans.length > 0) throw new Error(`page body with no metadata: ${orphans.join(', ')}`)

  const pages = []
  for (const page of PAGES) {
    if (typeof page.title !== 'string' || page.title.trim() === '') {
      throw new Error(`page "${page.id}" has no title`)
    }
    if (typeof page.section !== 'string' || page.section.trim() === '') {
      throw new Error(`page "${page.id}" has no section`)
    }
    const bodyPath = join(pagesDir, `${page.id}.md`)
    const text = readText(bodyPath)
    if (text.includes('\r')) throw new Error(`${display(bodyPath)} uses CRLF; commit LF only`)
    if (text.trim() === '') throw new Error(`${display(bodyPath)} is empty`)
    if (text.length > MAX_READ_CHARS) {
      throw new Error(`${display(bodyPath)} is ${text.length} characters; the docs read cap is ${MAX_READ_CHARS}`)
    }
    if (!text.startsWith('# ')) throw new Error(`${display(bodyPath)} must start with an H1 title`)
    const identifiers = [...new Set(page.identifiers ?? [])].sort(byCodePoint)
    for (const identifier of identifiers) {
      if (identifier.trim() === '') throw new Error(`page "${page.id}" has an empty identifier`)
    }
    pages.push({
      id: page.id,
      title: page.title,
      section: page.section,
      body: `pages/${page.id}.md`,
      ...(identifiers.length === 0 ? {} : { identifiers }),
    })
  }
  pages.sort((a, b) => byCodePoint(a.id, b.id))
  return pages
}

function buildIndex(pages) {
  return {
    schema: 1,
    collection: COLLECTION,
    title: TITLE,
    source: 'authored',
    revisions: [],
    pageCount: pages.length,
    pages,
  }
}

function validateGoldens(pageIds) {
  const path = join(root, GOLDENS_REL)
  if (!existsSync(path)) return
  const goldens = JSON.parse(readText(path))
  if (goldens === null || typeof goldens !== 'object' || Array.isArray(goldens)) throw new Error('goldens.json must be an object')
  if (goldens.schema !== 1) throw new Error('goldens.json schema must be 1')
  if (goldens.collection !== 'all') throw new Error('goldens.json collection must be "all"')
  if (!Array.isArray(goldens.cases)) throw new Error('goldens.json cases must be an array')
  if (goldens.cases.length < GOLDEN_MIN || goldens.cases.length > GOLDEN_MAX) {
    throw new Error(`goldens.json must carry ${GOLDEN_MIN}..${GOLDEN_MAX} cases, found ${goldens.cases.length}`)
  }
  const ids = new Set()
  let previous = ''
  let noMatch = 0
  for (const item of goldens.cases) {
    if (item === null || typeof item !== 'object') throw new Error('goldens.json case must be an object')
    if (typeof item.id !== 'string' || item.id.trim() === '') throw new Error('goldens.json case has no id')
    if (ids.has(item.id)) throw new Error(`goldens.json repeats case id "${item.id}"`)
    ids.add(item.id)
    if (item.id < previous) throw new Error(`goldens.json cases are not sorted by id: "${item.id}"`)
    previous = item.id
    if (typeof item.query !== 'string' || item.query.trim() === '') throw new Error(`goldens.json case "${item.id}" has no query`)
    if (item.kind !== 'answer' && item.kind !== 'exact' && item.kind !== 'no-match') {
      throw new Error(`goldens.json case "${item.id}" has an invalid kind`)
    }
    if (!Array.isArray(item.expect)) throw new Error(`goldens.json case "${item.id}" expects an array`)
    if (item.expect.length > GOLDEN_EXPECT_MAX) throw new Error(`goldens.json case "${item.id}" expects more than ${GOLDEN_EXPECT_MAX} pages`)
    for (const expected of item.expect) {
      if (typeof expected !== 'string' || !pageIds.has(expected)) {
        throw new Error(`goldens.json case "${item.id}" expects unknown page "${String(expected)}"`)
      }
    }
    if (item.kind === 'no-match') {
      noMatch += 1
      if (item.expect.length !== 0) throw new Error(`goldens.json no-match case "${item.id}" must expect no page`)
    } else if (item.expect.length === 0) {
      throw new Error(`goldens.json case "${item.id}" must expect at least one page`)
    }
  }
  if (noMatch < 2) throw new Error('goldens.json must carry at least two no-match cases')
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage:
  node scripts/gen-plc5-knowledge.mjs           Write ${INDEX_REL}.
  node scripts/gen-plc5-knowledge.mjs --check   Exit 1 when the committed index is stale.`)
    return 0
  }
  const check = argv.includes('--check')
  const unknown = argv.filter(argument => argument !== '--check')
  if (unknown.length > 0) {
    console.error(`Unknown argument: ${unknown[0]}`)
    return 2
  }

  const pages = buildPages()
  validateGoldens(new Set(pages.map(page => page.id)))
  const index = buildIndex(pages)
  const serialized = `${JSON.stringify(index, null, 2)}\n`
  const indexPath = join(root, INDEX_REL)
  const sha256 = text => createHash('sha256').update(text).digest('hex')

  if (check) {
    if (!existsSync(indexPath)) {
      console.error(`gen-plc5-knowledge: ${INDEX_REL} is missing; run node scripts/gen-plc5-knowledge.mjs`)
      return 1
    }
    const committed = readText(indexPath)
    if (committed === serialized) {
      console.log(`gen-plc5-knowledge: ${INDEX_REL} is current (${pages.length} pages)`)
      return 0
    }
    console.error(`gen-plc5-knowledge: ${INDEX_REL} is stale (committed sha256 ${sha256(committed)}, expected ${sha256(serialized)})`)
    console.error('Run `node scripts/gen-plc5-knowledge.mjs` to regenerate it.')
    return 1
  }

  writeFileSync(indexPath, serialized)
  console.log(`gen-plc5-knowledge: wrote ${INDEX_REL} (${pages.length} pages, ${serialized.length} bytes)`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
