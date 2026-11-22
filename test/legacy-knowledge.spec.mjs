/**
 * The legacy-knowledge release gate.
 *
 * Covers the two authored knowledge corpora and their docs tools
 * (`migration_docs`, `plc5_docs`) and the six read-only `.PC5` text readers in
 * the PLC-5 package. Everything here reads the compiled `lib/` output, so the
 * test exercises the same code the bundle mounts.
 *
 * The `.PC5` fixtures are authored in this file and written to a fresh
 * directory under `os.tmpdir()`; nothing outside that directory is touched.
 */

import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as migration from '../packages/migration/lib/index.js'
import * as plc5 from '../packages/plc5/lib/index.js'

// ---------------------------------------------------------------------------
// A read-only filesystem service for the tool calls
// ---------------------------------------------------------------------------

const fileInfo = {
  async stat(target) {
    try {
      const info = await (await import('node:fs/promises')).stat(target.targetKey)
      return { type: info.isFile() ? 'file' : info.isDirectory() ? 'directory' : 'other' }
    } catch (error) {
      if (error !== null && typeof error === 'object' && error.code === 'ENOENT') return undefined
      throw error
    }
  },
  async list(target) {
    const entries = await (await import('node:fs/promises')).readdir(target.targetKey, { withFileTypes: true })
    return entries.map(entry => ({
      name: entry.name,
      type: entry.isFile() ? 'file' : entry.isDirectory() ? 'directory' : 'other',
    }))
  },
}

const workspace = {
  async resolve(path) {
    return { targetKey: path, displayPath: path }
  },
  ...fileInfo,
  async readBytes(target, _signal, maxBytes) {
    const { readFile: read } = await import('node:fs/promises')
    const bytes = await read(target.targetKey)
    return maxBytes === undefined ? bytes : bytes.subarray(0, maxBytes)
  },
  async writeText() {
    throw new Error('these tools are read-only: writeText must never be called')
  },
}

// ---------------------------------------------------------------------------
// Fixtures: one clean export, its variants, and the failure shapes
// ---------------------------------------------------------------------------

const CLEAN_EXPORT = `PC5 EXPORT 1
PROCESSOR PLC-5/40
PROJECT Legacy line 3
REVISION A
; Neutral text export written for the legacy knowledge tests.
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 1 XIC(I:010/00) OTE(O:013/00)
RUNG 2 XIO(B3:0/1) TON(T4:0,100,1)
RUNG 3 BST(XIC(N7:0/0)) NXB(XIC(N7:0/1)) BND() OTE(N7:1/0)
END_PROGRAM_FILE
DATA_FILE N7 "COUNTS" 100
DATA_FILE F8 "FLOATS" 20
DATA_FILE T4 "TIMERS" 10
DATA_FILE B3 "BITS" 10
END
`

const INDIRECT_EXPORT = `PC5 EXPORT 1
PROCESSOR PLC-5/40
PROJECT Legacy line 3
REVISION A
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 1 XIC(I:010/00) OTE(O:013/00)
RUNG 2 XIO(B3:0/1) TON(T4:0,100,1)
RUNG 3 BST(XIC(N7:0/0)) NXB(XIC(N7:0/1)) BND() OTE(N7:1/0)
RUNG 4 XIC(N7:[N10:0]) OTE(O:013/01)
RUNG 5 XIC(#N7:0) OTE(N7:2/0)
RUNG 6 XIC(?) OTE(N7:3/0)
END_PROGRAM_FILE
DATA_FILE N7 "COUNTS" 100
DATA_FILE T4 "TIMERS" 10
DATA_FILE B3 "BITS" 10
END
`

const UNKNOWN_MNEMONIC_EXPORT = `PC5 EXPORT 1
PROCESSOR PLC-5/40
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 1 XIC(I:010/00) OTE(O:013/00)
RUNG 2 FROBNICATE(N7:0) OTE(N7:1/1)
END_PROGRAM_FILE
DATA_FILE N7 "COUNTS" 10
END
`

const MALFORMED_EXPORT = `PC5 EXPORT 1
PROCESSOR PLC-5/20
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 5 XIC(I:010/00) OTE(O:013/00)
RUNG 3 XIC(I:010/01) OTE(O:013/01)
RUNG 3 XIC(I:010/02) OTE(O:013/02)
PROGRAM_FILE 2 LADDER "DUPLICATE"
RUNG 1 XIC(N99:0) OTE(O:013/03)
END_PROGRAM_FILE
BOGUS RECORD HERE
DATA_FILE N7 "COUNTS" 10
DATA_FILE N7 "COUNTS" 10
`

const TRUNCATED_EXPORT = `PC5 EXPORT 1
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 1 XIC(I:010/00) OTE(O:013/00)
`

const EMPTY_EXPORT = `; no records here

`

const SCHEMA_NINE_EXPORT = `PC5 EXPORT 9
END
`

const UNSUPPORTED_NUL_EXPORT = Buffer.from('PC5 EXPORT 1\0\0\0binary noise', 'latin1')

const BINARY_PROJECT = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00])

const CHANGED_EXPORT = `PC5 EXPORT 1
PROCESSOR PLC-5/40
PROJECT Legacy line 3
REVISION B
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 1 XIC(I:010/00) OTE(O:013/00)
RUNG 2 XIO(B3:0/1) TON(T4:1,50,10)
RUNG 3 BST(XIC(N7:0/0)) NXB(XIC(N7:0/1)) BND() OTE(N7:1/0)
RUNG 4 XIC(I:010/02) OTE(O:013/02)
END_PROGRAM_FILE
DATA_FILE N7 "COUNTS" 100
DATA_FILE T4 "TIMERS" 20
DATA_FILE B3 "BITS" 10
DATA_FILE N10 "INDICES" 10
END
`

const SYNTHETIC_L5K = `; Synthetic .L5K for the legacy knowledge spec.
MODULE Local:1:I(0,0,1,0,0,1,0);
MODULE Local:1:O(0,0,1,0,0,1,0);
`

let directory = ''
const at = name => join(directory, name)
const paths = {}

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-legacy-knowledge-'))
  paths.clean = at('line3.pc5')
  paths.indirect = at('line3.indirect.pc5')
  paths.unknown = at('line3.unknown.pc5')
  paths.malformed = at('line3.malformed.pc5')
  paths.truncated = at('line3.truncated.pc5')
  paths.empty = at('line3.empty.pc5')
  paths.schemaNine = at('line3.schema9.pc5')
  paths.nul = at('line3.nul.txt')
  paths.binary = at('line3.container.pc5')
  paths.changed = at('line3.changed.pc5')
  paths.wrongExtension = at('line3.rsp')
  paths.l5k = at('line3.l5k')
  await writeFile(paths.clean, CLEAN_EXPORT, 'utf8')
  await writeFile(paths.indirect, INDIRECT_EXPORT, 'utf8')
  await writeFile(paths.unknown, UNKNOWN_MNEMONIC_EXPORT, 'utf8')
  await writeFile(paths.malformed, MALFORMED_EXPORT, 'utf8')
  await writeFile(paths.truncated, TRUNCATED_EXPORT, 'utf8')
  await writeFile(paths.empty, EMPTY_EXPORT, 'utf8')
  await writeFile(paths.schemaNine, SCHEMA_NINE_EXPORT, 'utf8')
  await writeFile(paths.nul, UNSUPPORTED_NUL_EXPORT)
  await writeFile(paths.binary, BINARY_PROJECT)
  await writeFile(paths.changed, CHANGED_EXPORT, 'utf8')
  await writeFile(paths.wrongExtension, CLEAN_EXPORT, 'utf8')
  await writeFile(paths.l5k, SYNTHETIC_L5K, 'utf8')
})

after(async () => {
  if (directory !== '') await rm(directory, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// Tool surface: the counts the bundle registers
// ---------------------------------------------------------------------------

const MIGRATION_TOOLS = [
  'migration_assess',
  'l5k_lint',
  'slc_read',
  'migration_compare',
  'migration_resolve',
  'migration_report',
  'migration_plan',
]

const PLC5_BINARY_TOOLS = [
  'plc5_capabilities',
  'plc5_open',
  'plc5_ladder',
  'plc5_find',
  'plc5_io_census',
  'plc5_io_config',
  'plc5_data_read',
  'plc5_processor',
]

const PLC5_TEXT_TOOLS = [
  'plc5_pc5',
  'plc5_verify',
  'plc5_instruction_inventory',
  'plc5_rung_digest',
  'plc5_indirect_census',
  'plc5_diff',
]

const migrationTools = migration.migrationTools(workspace)
const plc5Tools = plc5.plc5Tools(workspace)
const migrationDocs = migration.docsTools({})[0]
const plc5Docs = plc5.docsTools({})[0]

test('the migration surface registers seven working tools plus migration_docs', () => {
  assert.deepEqual(migrationTools.map(tool => tool.name), MIGRATION_TOOLS)
  assert.equal(migrationTools.length, 7)
  const docs = migration.docsTools({})
  assert.equal(docs.length, 1)
  assert.equal(docs[0].name, 'migration_docs')
  assert.equal(migrationTools.length + docs.length, 8)
  assert.equal(typeof migration.DOCS_TOOL_NAME, 'string')
  assert.equal(migration.DOCS_TOOL_NAME, 'migration_docs')
})

test('the PLC-5 surface registers eight working tools, six text readers and plc5_docs', () => {
  assert.deepEqual(plc5Tools.slice(0, 8).map(tool => tool.name), PLC5_BINARY_TOOLS)
  assert.deepEqual(plc5Tools.slice(8).map(tool => tool.name), PLC5_TEXT_TOOLS)
  assert.equal(plc5Tools.length, 14)
  const docs = plc5.docsTools({})
  assert.equal(docs.length, 1)
  assert.equal(docs[0].name, 'plc5_docs')
  assert.equal(plc5Tools.length + docs.length, 15)
  assert.equal(plc5.DOCS_TOOL_NAME, 'plc5_docs')
})

// ---------------------------------------------------------------------------
// Docs tool: five actions, envelopes and errors
// ---------------------------------------------------------------------------

const STUB_EXEC = {}

async function run(tool, args) {
  return tool.execute(args, STUB_EXEC)
}

function errorOf(result, code) {
  assert.ok(result !== null && typeof result === 'object', 'the tool returned no envelope')
  assert.equal(result.ok ?? false, false, `expected a failure envelope, got ${JSON.stringify(result).slice(0, 240)}`)
  assert.ok(result.error !== null && typeof result.error === 'object', 'the failure envelope has no error object')
  assert.equal(typeof result.error.message, 'string')
  assert.equal(typeof result.error.fix, 'string')
  if (code !== undefined) assert.equal(result.error.code, code)
  return result.error
}

test('migration_docs reports the authored collection and its table of contents', async () => {
  assert.equal(migrationDocs.name, 'migration_docs')
  assert.equal(typeof migrationDocs.description, 'string')
  assert.ok(migrationDocs.description.length > 120)
  assert.equal(migrationDocs.parameters.required.includes('action'), true)

  const status = await run(migrationDocs, { action: 'status' })
  assert.equal(status.ok, true)
  assert.equal(status.action, 'status')
  assert.equal(status.collections.length, 1)
  const summary = status.collections[0]
  assert.equal(summary.id, 'migration-logix')
  assert.equal(summary.source, 'authored')
  assert.equal(summary.status, 'ready')
  assert.equal(summary.installedRoot, null)
  assert.equal(summary.pageCount, 15)

  const contents = await run(migrationDocs, { action: 'contents' })
  assert.equal(contents.ok, true)
  assert.equal(contents.collections[0].pageCount, 15)

  const toc = await run(migrationDocs, { action: 'contents', collection: 'migration-logix' })
  assert.equal(toc.ok, true)
  assert.equal(toc.collection.id, 'migration-logix')
  const pageIds = toc.sections.flatMap(section => section.pages.map(page => page.id))
  assert.equal(pageIds.length, 15)
  assert.ok(pageIds.includes('instruction-map'))
  assert.ok(pageIds.includes('sfc-routine-present'))
})

test('migration_docs searches, reads and resolves exact identifiers', async () => {
  const search = await run(migrationDocs, { action: 'search', query: 'instruction mapping timer TON' })
  assert.equal(search.ok, true)
  assert.equal(search.action, 'search')
  assert.ok(Array.isArray(search.hits))
  assert.ok(search.hits.length > 0)
  assert.ok(search.hits.some(hit => hit.id === 'instruction-map'))
  for (const hit of search.hits) {
    assert.equal(typeof hit.id, 'string')
    assert.equal(typeof hit.title, 'string')
    assert.equal(typeof hit.score, 'number')
    assert.equal(typeof hit.snippet, 'string')
    assert.ok(hit.snippet.length > 0)
  }

  const read = await run(migrationDocs, { action: 'read', id: 'instruction-map' })
  assert.equal(read.ok, true)
  assert.equal(read.id, 'instruction-map')
  assert.equal(read.source, 'authored')
  assert.equal(read.truncated, false)
  assert.ok(read.text.includes('TON'))
  assert.ok(read.text.length <= 8000)

  const lookup = await run(migrationDocs, { action: 'lookup', term: 'SFC_ROUTINE_PRESENT' })
  assert.equal(lookup.ok, true)
  assert.equal(lookup.total, 1)
  assert.equal(lookup.matches[0].id, 'sfc-routine-present')
  assert.ok(lookup.matches[0].identifiers.includes('SFC_ROUTINE_PRESENT'))

  const noMatch = await run(migrationDocs, { action: 'search', query: 'kernel panic concurrency thread' })
  assert.equal(noMatch.ok, true)
  assert.deepEqual(noMatch.hits, [])
  assert.equal(noMatch.total, 0)
})

test('migration_docs answers typed failures instead of throwing', async () => {
  errorOf(await run(migrationDocs, { action: 'summarise' }), 'INVALID_ACTION')
  errorOf(await run(migrationDocs, { action: 'search' }), 'QUERY_REQUIRED')
  errorOf(await run(migrationDocs, { action: 'lookup' }), 'QUERY_REQUIRED')
  const notFound = errorOf(await run(migrationDocs, { action: 'read', id: 'no-such-page' }), 'NOT_FOUND')
  assert.ok(Array.isArray(notFound.candidates))
  assert.equal(notFound.code, 'NOT_FOUND')
  assert.equal(typeof notFound.message, 'string')
  assert.equal(typeof notFound.fix, 'string')
})

test('plc5_docs reports the authored collection and resolves exact identifiers', async () => {
  assert.equal(plc5Docs.name, 'plc5_docs')
  const status = await run(plc5Docs, { action: 'status' })
  assert.equal(status.ok, true)
  assert.equal(status.collections.length, 1)
  assert.equal(status.collections[0].id, 'plc5-program-text')
  assert.equal(status.collections[0].pageCount, 9)
  assert.equal(status.collections[0].status, 'ready')

  const read = await run(plc5Docs, { action: 'read', id: 'pc5-export' })
  assert.equal(read.ok, true)
  assert.ok(read.text.includes('PC5 EXPORT'))

  const lookup = await run(plc5Docs, { action: 'lookup', term: 'PLC5_COM_UNAVAILABLE' })
  assert.equal(lookup.ok, true)
  assert.equal(lookup.matches[0].id, 'error-codes')

  const taxonomy = await run(plc5Docs, { action: 'lookup', term: 'PLC5_COM_UNAVAILABLE' })
  assert.ok(taxonomy.matches[0].identifiers.includes('PLC5_COM_UNAVAILABLE'))

  const badAction = errorOf(await run(plc5Docs, { action: 'index' }), 'INVALID_ACTION')
  assert.ok(badAction.candidates.includes('contents'))
})

// ---------------------------------------------------------------------------
// Goldens: committed replay cases for both corpora
// ---------------------------------------------------------------------------

async function replayGoldens(tool, packageName) {
  const path = fileURLToPath(new URL(`../packages/${packageName}/knowledge/goldens.json`, import.meta.url))
  const document = JSON.parse(await readFile(path, 'utf8'))
  assert.equal(document.schema, 1)
  assert.equal(document.collection, 'all')
  assert.ok(Array.isArray(document.cases))
  assert.ok(document.cases.length >= 15 && document.cases.length <= 25)
  const ids = document.cases.map(item => item.id)
  assert.deepEqual(ids, [...ids].sort())
  assert.equal(new Set(ids).size, ids.length)
  const kinds = new Set(document.cases.map(item => item.kind))
  assert.deepEqual([...kinds].sort(), ['answer', 'exact', 'no-match'])
  assert.ok(document.cases.filter(item => item.kind === 'no-match').length >= 2)

  for (const item of document.cases) {
    assert.equal(typeof item.query, 'string')
    assert.ok(item.query.trim().length > 0)
    assert.ok(Array.isArray(item.expect))
    assert.ok(item.expect.length <= 3)
    assert.equal(new Set(item.expect).size, item.expect.length)
    if (item.kind === 'no-match') {
      assert.deepEqual(item.expect, [])
      const search = await run(tool, { action: 'search', query: item.query, limit: 8 })
      assert.equal(search.ok, true)
      assert.deepEqual(search.hits, [], `${item.id} expected no match for ${item.query}`)
      assert.equal(search.total, 0)
      continue
    }
    assert.ok(item.expect.length >= 1)
    if (item.kind === 'answer') {
      const search = await run(tool, { action: 'search', query: item.query, limit: 8 })
      assert.equal(search.ok, true)
      const hitIds = search.hits.map(hit => hit.id)
      for (const expected of item.expect) {
        assert.ok(hitIds.includes(expected), `${item.id} expected ${expected} among hits for ${item.query}`)
      }
    } else {
      const lookup = await run(tool, { action: 'lookup', term: item.query })
      assert.equal(lookup.ok, true)
      const matchIds = lookup.matches.map(match => match.id)
      for (const expected of item.expect) {
        assert.ok(matchIds.includes(expected), `${item.id} expected ${expected} among lookup matches for ${item.query}`)
      }
    }
  }
  return document.cases.length
}

test('migration goldens replay against the authored corpus', async () => {
  assert.equal(await replayGoldens(migrationDocs, 'migration'), 25)
})

test('plc5 goldens replay against the authored corpus', async () => {
  assert.equal(await replayGoldens(plc5Docs, 'plc5'), 22)
})

// ---------------------------------------------------------------------------
// The six .PC5 text readers
// ---------------------------------------------------------------------------

const toolByName = name => plc5Tools.find(tool => tool.name === name)

test('plc5_pc5 reports the structure of a clean export', async () => {
  const result = await run(toolByName('plc5_pc5'), { path: paths.clean })
  assert.equal(result.error, undefined)
  assert.equal(result.data.ended, true)
  assert.equal(result.data.schema, 1)
  assert.equal(result.data.header.processor, 'PLC-5/40')
  assert.equal(result.data.programFiles.length, 1)
  assert.equal(result.data.programFiles[0].number, 2)
  assert.equal(result.data.programFiles[0].rungs, 3)
  assert.equal(result.data.dataFiles.length, 4)
  assert.equal(result.data.issues.errors, 0)
  assert.equal(result.coverage.complete, false)
  assert.ok(Array.isArray(result.next))
})

test('plc5_pc5 reports truncation and malformed records', async () => {
  const truncated = await run(toolByName('plc5_pc5'), { path: paths.truncated })
  assert.equal(truncated.error, undefined)
  assert.equal(truncated.data.ended, false)
  assert.ok(truncated.data.issues.errors > 0)
  assert.ok(truncated.summary.includes('truncated'))

  const malformed = await run(toolByName('plc5_pc5'), { path: paths.malformed })
  assert.equal(malformed.error, undefined)
  assert.equal(malformed.data.ended, false)
  const codes = malformed.data.issues.shown.map(issue => issue.code)
  assert.ok(codes.includes('TRUNCATED_EXPORT'))
  assert.ok(codes.includes('UNKNOWN_RECORD'))
})

test('plc5_verify returns ok, warnings and errors verdicts', async () => {
  const clean = await run(toolByName('plc5_verify'), { path: paths.clean })
  assert.equal(clean.data.verdict, 'ok')
  assert.equal(clean.data.checks.length, 7)
  assert.ok(clean.data.checks.every(check => check.status !== 'fail'))

  const indirect = await run(toolByName('plc5_verify'), { path: paths.indirect })
  assert.equal(indirect.data.verdict, 'warnings')
  assert.ok(indirect.data.warnings.total > 0 || indirect.data.checks.some(check => check.status === 'warn'))

  const malformed = await run(toolByName('plc5_verify'), { path: paths.malformed })
  assert.equal(malformed.data.verdict, 'errors')
  assert.ok(malformed.data.errors.total > 0)
})

test('plc5_instruction_inventory counts mnemonics and reports unknown ones', async () => {
  const clean = await run(toolByName('plc5_instruction_inventory'), { path: paths.clean })
  assert.equal(clean.error, undefined)
  assert.ok(clean.data.totals.instructions > 0)
  assert.ok(clean.data.totals.distinctMnemonics > 0)
  assert.deepEqual(clean.data.totals.branchTokenKinds, ['BST', 'NXB', 'BND'])
  assert.equal(clean.data.unknown.length, 0)
  const mnemonics = clean.data.mnemonics.map(row => row.mnemonic)
  assert.deepEqual(mnemonics, [...mnemonics].sort())

  const unknown = await run(toolByName('plc5_instruction_inventory'), { path: paths.unknown })
  assert.equal(unknown.data.unknown.length, 1)
  assert.equal(unknown.data.unknown[0].mnemonic, 'FROBNICATE')
  assert.ok(unknown.data.unknown[0].sites.length > 0)
})

test('plc5_rung_digest summarises each program file', async () => {
  const result = await run(toolByName('plc5_rung_digest'), { path: paths.clean })
  assert.equal(result.error, undefined)
  assert.equal(result.data.files.length, 1)
  const file = result.data.files[0]
  assert.equal(file.rungs, 3)
  assert.equal(file.firstRung, 1)
  assert.equal(file.lastRung, 3)
  assert.equal(file.gaps, 0)
  assert.ok(file.instructions >= 5)
  assert.equal(file.branchTokens, 3)
})

test('plc5_indirect_census lists every non-plain operand site', async () => {
  const result = await run(toolByName('plc5_indirect_census'), { path: paths.indirect })
  assert.equal(result.error, undefined)
  assert.equal(result.data.totals.sites, 3)
  assert.equal(result.data.totals.bracket, 1)
  assert.equal(result.data.totals.fileIndirect, 1)
  assert.equal(result.data.totals.placeholder, 1)
  for (const site of result.data.sites) {
    assert.equal(typeof site.file, 'number')
    assert.equal(typeof site.rung, 'number')
    assert.equal(typeof site.mnemonic, 'string')
    assert.equal(typeof site.operand, 'string')
    assert.ok(['bracket', 'file-indirect', 'placeholder'].includes(site.kind))
  }

  const clean = await run(toolByName('plc5_indirect_census'), { path: paths.clean })
  assert.equal(clean.data.totals.sites, 0)
})

test('plc5_diff reports header, data-file and rung differences', async () => {
  const result = await run(toolByName('plc5_diff'), { path: paths.clean, otherPath: paths.changed })
  assert.equal(result.error, undefined)
  assert.equal(result.data.identical, false)
  const headerFields = result.data.header.map(row => row.field)
  assert.ok(headerFields.length > 0)
  const removedData = result.data.dataFiles.onlyInFirst.shown.map(file => file.file ?? file)
  const addedData = result.data.dataFiles.onlyInSecond.shown.map(file => file.file ?? file)
  assert.ok(removedData.includes('F8') || removedData.some(item => String(item).includes('F8')))
  assert.ok(addedData.includes('N10') || addedData.some(item => String(item).includes('N10')))
  assert.ok(result.data.rungs.totals.changed >= 1)
  assert.ok(result.data.rungs.totals.added >= 1)

  const identical = await run(toolByName('plc5_diff'), { path: paths.clean, otherPath: paths.clean })
  assert.equal(identical.error.code, 'INVALID_ARGUMENT')
})

test('every text reader fails honestly on unsupported input', async () => {
  const wrongExtension = await run(toolByName('plc5_pc5'), { path: paths.wrongExtension })
  assert.equal(wrongExtension.error.code, 'UNSUPPORTED_FORMAT')

  const binary = await run(toolByName('plc5_verify'), { path: paths.binary })
  assert.equal(binary.error.code, 'SOURCE_NOT_INSTALLED')

  const empty = await run(toolByName('plc5_instruction_inventory'), { path: paths.empty })
  assert.equal(empty.error.code, 'EMPTY_EXPORT')

  const schema = await run(toolByName('plc5_rung_digest'), { path: paths.schemaNine })
  assert.equal(schema.error.code, 'UNSUPPORTED_FORMAT')

  const nul = await run(toolByName('plc5_indirect_census'), { path: paths.nul })
  assert.equal(nul.error.code, 'UNSUPPORTED_FORMAT')

  const missing = await run(toolByName('plc5_diff'), { path: paths.clean, otherPath: at('absent.pc5') })
  assert.equal(missing.error.code, 'FILE_MISSING')
  assert.ok(Array.isArray(missing.error.candidates))

  const same = await run(toolByName('plc5_diff'), { path: paths.clean, otherPath: paths.clean })
  assert.equal(same.error.code, 'INVALID_ARGUMENT')

  const notAnExport = await run(toolByName('plc5_diff'), { path: paths.binary, otherPath: paths.clean })
  assert.equal(notAnExport.error.code, 'SOURCE_NOT_INSTALLED')

  const noPath = await run(toolByName('plc5_pc5'), {})
  assert.equal(noPath.error.code, 'INVALID_ARGUMENT')
})

test('the text readers are deterministic', async () => {
  const calls = [
    ['plc5_pc5', { path: paths.indirect }],
    ['plc5_verify', { path: paths.malformed }],
    ['plc5_instruction_inventory', { path: paths.clean }],
    ['plc5_rung_digest', { path: paths.clean }],
    ['plc5_indirect_census', { path: paths.indirect }],
    ['plc5_diff', { path: paths.clean, otherPath: paths.changed }],
  ]
  for (const [name, args] of calls) {
    const first = await run(toolByName(name), args)
    const second = await run(toolByName(name), args)
    assert.deepEqual(second, first, `${name} answered differently on a second identical read`)
  }

  const firstRead = await run(migrationDocs, { action: 'read', id: 'instruction-map' })
  const secondRead = await run(migrationDocs, { action: 'read', id: 'instruction-map' })
  assert.deepEqual(secondRead, firstRead)
})

// ---------------------------------------------------------------------------
// The existing tools keep working
// ---------------------------------------------------------------------------

test('the existing migration and PLC-5 tools still answer', async () => {
  const lint = await run(toolByName('l5k_lint') ?? migrationTools.find(tool => tool.name === 'l5k_lint'), {
    path: paths.l5k,
  })
  assert.equal(lint.error, undefined)
  assert.equal(typeof lint.summary, 'string')
  assert.equal(lint.data.format, 'L5K')

  const capabilities = await run(toolByName('plc5_capabilities'), {})
  assert.equal(capabilities.error, undefined)
  assert.equal(typeof capabilities.summary, 'string')

  const notRsp = await run(toolByName('plc5_open'), { path: paths.clean })
  assert.equal(notRsp.error.code, 'NOT_AN_RSP')
})
