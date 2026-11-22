#!/usr/bin/env node
/**
 * Generate the committed index for the migration knowledge collection.
 *
 * The page bodies under `knowledge/migration-logix/pages/` are authored markdown and
 * are committed as-is. The index that tells the docs tool how to find them is not
 * written by hand: this script emits it from the page metadata below, validates the
 * corpus (every page has a body, no orphan body, every page reads under the
 * engine's read cap, every golden case points at a real page), and compares the
 * result with the committed file in `--check` mode.
 *
 * The output is deterministic: pages and keys are emitted in codepoint order, there
 * is no timestamp, no absolute path, no hostname and no build date, so two clean runs
 * are byte-identical and a review diff only ever shows a real change.
 *
 * Usage:
 *   node scripts/gen-migration-knowledge.mjs           # write knowledge/migration-logix/index.json
 *   node scripts/gen-migration-knowledge.mjs --check   # exit 1 when the committed index is stale
 *
 * @module dsh-engineering/scripts/gen-migration-knowledge
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const PACKAGE = 'migration'
const COLLECTION = 'migration-logix'
const TITLE = 'SLC 500 and PLC-5 to Logix migration'
const INDEX_REL = `packages/${PACKAGE}/knowledge/${COLLECTION}/index.json`
const PAGES_REL = `packages/${PACKAGE}/knowledge/${COLLECTION}/pages`
const GOLDENS_REL = `packages/${PACKAGE}/knowledge/goldens.json`

/** The docs engine caps one read at this many characters; a longer page is truncated. */
const MAX_READ_CHARS = 8000

/** Page ids that must be 15..25 in the golden set and 1..3 expected ids per case. */
const GOLDEN_MIN = 15
const GOLDEN_MAX = 25
const GOLDEN_EXPECT_MAX = 3

/**
 * The authored pages, in the order a reader should approach them. Order is not the
 * file order: the index sorts by id, and `contents` groups by section.
 *
 * @type {readonly { id: string, title: string, section: string, identifiers?: readonly string[] }[]}
 */
const PAGES = [
  {
    id: 'overview',
    title: 'SLC 500 and PLC-5 to Logix migration overview',
    section: 'Overview',
    identifiers: ['migration_assess', 'migration_plan', 'migration_report', 'slc_read'],
  },
  {
    id: 'instruction-map',
    title: 'Instruction mapping table: SLC 500 and PLC-5 to Logix',
    section: 'Mapping',
    identifiers: [
      'TON', 'TOF', 'RTO', 'CTU', 'CTD', 'RES', 'ONS', 'OSR', 'OSF', 'MOV', 'MVM', 'COP',
      'FLL', 'CLR', 'SCL', 'JSR', 'SBR', 'RET', 'FOR', 'NXT', 'BSL', 'BSR', 'SQO', 'SQC',
      'SQI', 'PID', 'FAL', 'CPT', 'MSG', 'BTW', 'BTR', 'IIM', 'IOM', 'SVC', 'DTR', 'TOD',
      'HSC', 'AFI', 'INDIRECT_ADDRESS',
    ],
  },
  {
    id: 'addressing',
    title: 'Address and tag translation',
    section: 'Mapping',
    identifiers: ['N7:0', 'B3:0/0', 'T4:0.PRE', 'S:24', 'S:1/15', 'I:1.0/0', 'O:2.0/0', 'F8:0', 'R6:0'],
  },
  {
    id: 'data-files',
    title: 'Data files, structures, and the symbol table',
    section: 'Mapping',
    identifiers: ['DATA_FILES_CARRIED', 'SYMBOL_TOO_LONG', 'TIMER', 'COUNTER', 'CONTROL', 'STRING'],
  },
  {
    id: 'io-configuration',
    title: 'I/O: chassis, modules, and the three inventories',
    section: 'Field devices',
    identifiers: ['LEGACY_CHASSIS_DECLARED', 'WIZARD_ANALOG_DEFAULT', 'MODULE_UNNAMED', 'MODULE_NAME_ILLEGAL', '1747-AENTR'],
  },
  {
    id: 'wizard-l5k',
    title: 'Running the migration wizard and auditing the .L5K',
    section: 'Workflow',
    identifiers: [
      'l5k_lint', 'TRAILING_COMMA', 'ROUTINE_PAREN', 'DUPLICATE_TAG', 'TAG_NAME_TOO_LONG',
      'PLACEHOLDER_TAG', 'ROUTINE_UNBALANCED', 'REVISION_BELOW_TARGET',
    ],
  },
  {
    id: 'markers',
    title: 'Structured-text markers and the conversion census',
    section: 'Workflow',
    identifiers: ['RESIDUAL_MARKERS', 'PCE', 'WIZARD_ARTIFACT', 'RxCMP_E_AUDIT_OUTPUTS'],
  },
  {
    id: 'indirect-addressing',
    title: 'Indirect addressing: census and rewrite',
    section: 'Workflow',
    identifiers: ['INDIRECT_ADDRESS', 'INDIRECT_LEFT', 'S:24'],
  },
  {
    id: 'sfc-routine-present',
    title: 'SFC_ROUTINE_PRESENT: what the marker means',
    section: 'Workflow',
    identifiers: ['SFC_ROUTINE_PRESENT', 'ROUTINE_MISSING'],
  },
  {
    id: 'assessment',
    title: 'Assessing a legacy project without a controller',
    section: 'Workflow',
    identifiers: [
      'migration_assess', 'slc_read', 'RUNGS_SAMPLED', 'LEGACY_INSTRUCTION', 'ADDRESS_ONLY_DATABASE',
      'UNSUPPORTED_FORMAT', 'FILE_MISSING', 'NOT_A_FILE', 'ACCESS_DENIED',
    ],
  },
  {
    id: 'compare',
    title: 'Comparing the legacy program with the Logix export',
    section: 'Workflow',
    identifiers: [
      'migration_compare', 'migration_resolve', 'ROUTINE_MISSING', 'SYMBOL_MISSING',
      'DATA_FILE_UNMAPPED', 'ROUTINE_ADDED', 'RUNG_SPLIT', 'RUNG_LOST', 'NO_ROUTINE_MATCHED',
    ],
  },
  {
    id: 'plan',
    title: 'The migration plan: eight stages, five decisions',
    section: 'Workflow',
    identifiers: ['migration_plan', 'target_cpu', 'target_revision', 'io_strategy', 'hmi_scope', 'acceptance', 'PLAN_MISSING', 'PLAN_UNREADABLE', 'PLAN_UNWRITABLE', 'INVALID_DECISION'],
  },
  {
    id: 'report',
    title: 'The migration report and its evidence',
    section: 'Workflow',
    identifiers: ['migration_report', 'REPORT_EXISTS', 'REPORT_UNWRITABLE', 'INTERNAL'],
  },
  {
    id: 'gates',
    title: 'Acceptance gates: what counts as migrated',
    section: 'Gates',
    identifiers: ['acceptance', 'REVISION_BELOW_TARGET', 'RxCMP_E_AUDIT_OUTPUTS'],
  },
  {
    id: 'error-codes',
    title: 'Migration error codes and fixes',
    section: 'Reference',
    identifiers: [
      'INVALID_ARGUMENT', 'FILE_MISSING', 'NOT_A_FILE', 'ACCESS_DENIED', 'UNSUPPORTED_FORMAT',
      'INVALID_DECISION', 'REPORT_EXISTS', 'REPORT_UNWRITABLE', 'SLC_COM_UNAVAILABLE',
      'SLC_POWERSHELL_MISSING', 'SLC_OPEN_FAILED', 'SLC_NO_PROJECT',
    ],
  },
]

const display = path => relative(root, path).replaceAll('\\', '/')

function fail(message) {
  console.error(`gen-migration-knowledge: ${message}`)
  process.exitCode = 2
}

function readText(path) {
  return readFileSync(path, 'utf8')
}

/** Codepoint order for every string the generator emits. */
const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

/** The page list the index carries, sorted by id, with only schema fields present. */
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
    const bodyRel = `pages/${page.id}.md`
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
      body: bodyRel,
      ...(identifiers.length === 0 ? {} : { identifiers }),
    })
  }
  pages.sort((a, b) => byCodePoint(a.id, b.id))
  return pages
}

/** The committed index object, key order fixed for a stable JSON body. */
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

/**
 * Validate the committed goldens file: shape, ordering, kinds, and page references.
 *
 * Goldens are a check on the corpus, not generated text: the queries stay authored so
 * a reviewer can see what the collection is expected to answer.
 */
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
    if (idSetHas(ids, item.id)) throw new Error(`goldens.json repeats case id "${item.id}"`)
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

/** Set membership without relying on a version-specific Set helper. */
function idSetHas(set, value) {
  return set.has(value)
}

function main(argv) {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(`Usage:
  node scripts/gen-migration-knowledge.mjs           Write ${INDEX_REL}.
  node scripts/gen-migration-knowledge.mjs --check   Exit 1 when the committed index is stale.`)
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
      fail(`${INDEX_REL} is missing; run node scripts/gen-migration-knowledge.mjs`)
      return 1
    }
    const committed = readText(indexPath)
    if (committed === serialized) {
      console.log(`gen-migration-knowledge: ${INDEX_REL} is current (${pages.length} pages)`)
      return 0
    }
    fail(`${INDEX_REL} is stale (committed sha256 ${sha256(committed)}, expected ${sha256(serialized)})`)
    console.error('Run `node scripts/gen-migration-knowledge.mjs` to regenerate it.')
    return 1
  }

  writeFileSync(indexPath, serialized)
  console.log(`gen-migration-knowledge: wrote ${INDEX_REL} (${pages.length} pages, ${serialized.length} bytes)`)
  return 0
}

process.exitCode = main(process.argv.slice(2))
