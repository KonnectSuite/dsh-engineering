/**
 * The SLC 500 row's contract, proved against the built package.
 *
 * Run with: node --import tsx --test test/slc500-tools.spec.mjs
 *
 * Every tool is exercised through the row's real `slc500Tools()` definitions and
 * a filesystem double that mirrors the host `FsService` shape (`resolve` yields a
 * target, `stat` yields a type, `readBytes` yields bytes). Fixtures live under the
 * OS temp directory and are never written by the row.
 *
 * @module test/slc500-tools
 */

import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { COLLECTION, docsTools, slc500Tools } from '../packages/slc/lib/index.js'

/** The ten tool names the row promises. */
const TOOL_NAMES = [
  'slc500_capabilities',
  'slc500_open',
  'slc500_ladder',
  'slc500_find',
  'slc500_io_census',
  'slc500_io_config',
  'slc500_data_read',
  'slc500_processor',
  'slc500_database',
  'slc500_docs',
]

/** A text export written in the documented section grammar. */
const SAMPLE_SLC = [
  '[PROJECT]',
  'name = DEMO_PUMP',
  '[PROCESSOR]',
  'type = SLC 5/04',
  'family = SLC 500',
  'series = C',
  'firmware = 1747',
  'memory_words = 8192',
  '[FILES]',
  'LAD 2 = 3',
  'LAD 3 = 1',
  '[DATA FILES]',
  'N7 = 10',
  'B3 = 5',
  '[DATA N7]',
  '0 = 123 ; speed preset',
  '1 = 456',
  '[DATA B3]',
  '0 = 0F ; start bits',
  '[LADDER 2]',
  'RUNG 0: XIC I:1/0 XIO O:0/0 TON T4:0.PRE 100 END',
  'RUNG 1: XIC B3:0/5 OTE O:0/0',
  'RUNG 2: END',
  '[LADDER 3]',
  'RUNG 0: XIC N7:0/0 OTE O:0/0',
  '[IO]',
  'slot 0 = processor',
  'slot 1 = 1746-IB16',
  '[SYMBOLS]',
  'I:1/0 = START_PB ; start push button',
  'O:0/0 = RUN_LAMP ; run lamp',
  'N7:0 = SPEED_SP',
  '',
].join('\n')

/** A second text export whose inventory disagrees with SAMPLE_SLC, for the dual-source check. */
const SAMPLE_ALT = [
  '[PROJECT]',
  'name = DEMO_PUMP_ALT',
  '[PROCESSOR]',
  'type = SLC 5/05',
  'family = SLC 500',
  'series = C',
  '[FILES]',
  'LAD 2 = 1',
  '[DATA FILES]',
  'N7 = 4',
  '[DATA N7]',
  '0 = 999',
  '[LADDER 2]',
  'RUNG 0: XIC I:1/0 OTE O:0/1',
  '[IO]',
  'slot 0 = processor',
  '[SYMBOLS]',
  'I:1/0 = START_PB_ALT ; start push button',
  '',
].join('\n')

/** A documentation export with a recognisable header. */
const SAMPLE_EAS = ['address,symbol,description,scope', 'I:1/0,START_PB,start push button,2', 'N7:0,SPEED_SP,speed preset,7', 'O:0/0,RUN_LAMP,run lamp,2', ''].join('\n')

/** A transcript shaped like the recorded automation snapshot. */
const SAMPLE_TRANSCRIPT = {
  project_name: 'DEMO_PUMP',
  processor: { type: 'SLC 5/04', family: 'SLC 500', series: 'C', firmware: '1747', memory_words: 8192 },
  files: [{ name: 'LAD 2', declared_rungs: 2, rungs: [{ rung: 0, text: 'XIC I:1/0 OTE O:0/0' }, { rung: 1, text: 'END' }] }],
  data_files: [{ name: 'N7', type_letter: 'N', values: { '0': '123' } }],
  symbols: [{ address: 'I:1/0', symbol: 'START_PB', description: 'start push button' }],
  io_modules: [{ slot: 1, module: '1746-IB16' }],
  status_words: { 'S:1': '0x0001', 'S:2': '0x0000' },
}

let directory
let files

before(() => {
  directory = mkdtempSync(join(tmpdir(), 'slc500-spec-'))
  files = {
    slc: join(directory, 'DEMO_PUMP.SLC'),
    alt: join(directory, 'DEMO_PUMP_ALT.SLC'),
    eas: join(directory, 'DEMO_PUMP.EAS'),
    rss: join(directory, 'DEMO_PUMP.RSS'),
    ach: join(directory, 'LEGACY.ACH'),
    rs1: join(directory, 'ARCHIVE.RS1'),
    transcript: join(directory, 'transcript.json'),
    missing: join(directory, 'NOT_THERE.SLC'),
  }
  writeFileSync(files.slc, SAMPLE_SLC, 'utf8')
  writeFileSync(files.alt, SAMPLE_ALT, 'utf8')
  writeFileSync(files.eas, SAMPLE_EAS, 'utf8')
  writeFileSync(files.rss, 'binary-ish bytes', 'utf8')
  writeFileSync(files.ach, 'aps-era bytes', 'utf8')
  writeFileSync(files.rs1, 'archive bytes', 'utf8')
  writeFileSync(files.transcript, JSON.stringify(SAMPLE_TRANSCRIPT, undefined, 2), 'utf8')
})

after(() => {
  try {
    process.env.SLC500_AUTOMATION_TRANSCRIPT = ''
  } catch {
    // ignore
  }
})

/** The host filesystem double: read-only, target-shaped, no write path. */
function fakeFs() {
  const contents = new Map(
    Object.values(files)
      .filter(path => path !== files.missing)
      .map(path => [path, readFileSync(path)]),
  )
  const target = path => ({ targetKey: path, displayPath: path })
  return {
    async resolve(path) {
      if (!contents.has(path)) {
        const error = new Error(`ENOENT: no such file or directory, open '${path}'`)
        error.code = 'ENOENT'
        throw error
      }
      return target(path)
    },
    async stat(target_) {
      return contents.has(target_.targetKey) ? { type: 'file' } : undefined
    },
    async readBytes(target_, _signal, _maxBytes) {
      const bytes = contents.get(target_.targetKey)
      if (bytes === undefined) throw new Error('ENOENT')
      return new Uint8Array(bytes)
    },
  }
}

/** Build the row once, gated the way the plugin entry registers it. */
function buildTools() {
  const fs = fakeFs()
  const definitions = slc500Tools(fs)
  const docs = docsTools({ fs, tools: { register() {} }, get() { return undefined } })
  const byName = new Map([...definitions, ...docs].map(definition => [definition.name, definition]))
  return { definitions, docs, byName, fs }
}

const exec = { cwd: directory }

async function call(tool, args) {
  return tool.execute(args, exec)
}

describe('the row contract', () => {
  test('registers exactly the ten promised tools and one docs tool', () => {
    const { definitions, docs } = buildTools()
    assert.equal(definitions.length, 9)
    assert.deepEqual(
      definitions.map(definition => definition.name),
      TOOL_NAMES.slice(0, 9),
    )
    assert.equal(docs.length, 1)
    assert.equal(docs[0].name, 'slc500_docs')
    assert.deepEqual([...definitions, ...docs].map(definition => definition.name), TOOL_NAMES)
    for (const definition of [...definitions, ...docs]) {
      assert.equal(typeof definition.description, 'string')
      assert.ok(definition.description.length > 20)
      assert.equal(definition.parameters.type, 'object')
      assert.equal(definition.parameters.additionalProperties, false)
    }
  })

  test('capabilities reports the read paths and never needs a project', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_capabilities'), {})
    assert.equal(answer.error, undefined)
    assert.equal(typeof answer.summary, 'string')
    assert.equal(answer.data.read_paths.text_export, true)
    assert.equal(answer.data.read_paths.slc_export, true)
    assert.equal(answer.data.read_paths.documentation_export, true)
    assert.equal(typeof answer.data.automation.class_registered, 'boolean')
    assert.deepEqual(answer.data.status_words, ['S:1', 'S:2', 'S:3', 'S:5', 'S:13', 'S:24'])
    assert.equal(answer.coverage.complete, false)
  })
})

describe('the offline text and documentation paths', () => {
  test('open reads a .SLC text export and inventories it', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_open'), { path: files.slc })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.source, 'text')
    assert.equal(answer.data.project.name, 'DEMO_PUMP')
    assert.equal(answer.data.project.processor.type, 'SLC 5/04')
    assert.equal(answer.data.project.files.length, 2)
    assert.equal(answer.data.project.total_rungs, 4)
    assert.equal(answer.data.project.symbols, 3)
    assert.equal(answer.data.project.io_modules, 2)
  })

  test('open compares a second source and names both values on a conflict', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_open'), { path: files.slc, export: files.alt })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.dual_source.export, 'text')
    assert.ok(Array.isArray(answer.data.dual_source.conflicts))
    assert.ok(answer.data.dual_source.conflicts.length > 0)
    for (const conflict of answer.data.dual_source.conflicts) {
      assert.equal(typeof conflict.field, 'string')
      assert.equal(typeof conflict.primary, 'string')
      assert.equal(typeof conflict.secondary, 'string')
    }
  })

  test('ladder returns rung text and excludes the terminal END', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_ladder'), { path: files.slc })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.file, 'LAD 2')
    assert.equal(answer.data.logic_rungs, 2)
    assert.equal(answer.data.rungs.length, 2)
    assert.match(answer.data.rungs[0].text, /XIC I:1\/0/u)
  })

  test('find matches symbols and data values by scope', async () => {
    const { byName } = buildTools()
    const symbols = await call(byName.get('slc500_find'), { path: files.slc, query: 'START', scope: 'symbols' })
    assert.equal(symbols.error, undefined)
    assert.equal(symbols.data.symbols.length, 1)
    assert.equal(symbols.data.symbols[0].address, 'I:1/0')

    const values = await call(byName.get('slc500_find'), { path: files.slc, query: '123', scope: 'data' })
    assert.equal(values.error, undefined)
    assert.ok(values.data.data.length >= 1)
  })

  test('data_read returns a value window and never calls a missing element zero', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_data_read'), { path: files.slc, file: 'N7', element: 0, count: 2 })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.file, 'N7')
    assert.equal(answer.data.declared_elements, 10)
    assert.deepEqual(answer.data.elements, [
      { element: 0, value: '123' },
      { element: 1, value: '456' },
    ])
    assert.match(answer.data.note, /missing/iu)
  })

  test('processor reports identity and the status addresses it can read', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_processor'), { path: files.slc })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.processor.type, 'SLC 5/04')
    assert.deepEqual(answer.data.status_addresses, ['S:1', 'S:2', 'S:3', 'S:5', 'S:13', 'S:24'])
    assert.deepEqual(answer.data.status_words, {})
    assert.equal(answer.coverage.complete, false)
  })

  test('io_census counts referenced cells and highest bit', async () => {
    const { byName, definitions } = buildTools()
    assert.ok(definitions.some(definition => definition.name === 'slc500_io_census'))
    const answer = await call(byName.get('slc500_io_census'), { path: files.slc })
    assert.equal(answer.error, undefined)
    assert.ok(Array.isArray(answer.data.cells))
    const inputCell = answer.data.cells.find(cell => cell.kind === 'I' && cell.slot === 1)
    assert.ok(inputCell !== undefined)
    assert.ok(inputCell.references >= 1)
    assert.equal(answer.data.note.includes('module'), true)
  })

  test('database parses a documentation export', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_database'), { path: files.eas })
    assert.equal(answer.error, undefined)
    assert.equal(answer.data.format, 'csv')
    assert.equal(answer.data.total, 3)
    assert.equal(answer.data.rows[0].address, 'I:1/0')
    assert.equal(answer.data.rows[0].symbol, 'START_PB')
  })

  test('documentation exports are routed to the database tool, not parsed as projects', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_open'), { path: files.eas })
    assert.equal(answer.error.code, 'USE_DATABASE_TOOL')
  })

  test('a missing file is a typed FILE_MISSING failure', async () => {
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_open'), { path: files.missing })
    assert.equal(answer.error.code, 'FILE_MISSING')
    assert.equal(typeof answer.error.fix, 'string')
  })
})

describe('the .RSS boundary and legacy formats', () => {
  test('a .RSS without a transcript is typed, never guessed', async () => {
    delete process.env.SLC500_AUTOMATION_TRANSCRIPT
    const { byName } = buildTools()
    const answer = await call(byName.get('slc500_open'), { path: files.rss })
    assert.ok(answer.error !== undefined)
    assert.ok(['SOURCE_NOT_INSTALLED', 'NOT_LICENSED'].includes(answer.error.code))
    assert.equal(typeof answer.error.fix, 'string')
  })

  test('a redacted transcript reads a .RSS project through the automation path', async () => {
    process.env.SLC500_AUTOMATION_TRANSCRIPT = files.transcript
    try {
      const { byName } = buildTools()
      const answer = await call(byName.get('slc500_open'), { path: files.rss })
      assert.equal(answer.error, undefined)
      assert.equal(answer.data.source, 'automation')
      assert.equal(answer.data.project.name, 'DEMO_PUMP')
      assert.equal(answer.data.project.symbols, 1)
    } finally {
      delete process.env.SLC500_AUTOMATION_TRANSCRIPT
    }
  })

  test('.ACH and .RS1 are refused by name with a re-save fix', async () => {
    const { byName } = buildTools()
    for (const path of [files.ach, files.rs1]) {
      const answer = await call(byName.get('slc500_open'), { path })
      assert.equal(answer.error.code, 'UNSUPPORTED_FILE')
      assert.match(answer.error.fix, /export|re-save|RSLogix 500/iu)
    }
  })
})

describe('slc500_docs', () => {
  test('searches, reads, reports status and resolves identifiers against the authored collection', async () => {
    const { byName } = buildTools()
    const docs = byName.get('slc500_docs')
    assert.ok(docs !== undefined)
    assert.equal(docs.parameters.properties.action.enum.includes('lookup'), true)

    const contents = await call(docs, { action: 'contents' })
    assert.notEqual(contents.error?.code, 'TOOL_UNAVAILABLE', 'the docs corpus must be built into the package')
    assert.equal(contents.ok, true)
    const listed = contents.collections.find(collection => collection.id === COLLECTION)
    assert.ok(listed !== undefined)
    assert.equal(listed.pageCount, 7)
    assert.equal(listed.status, 'ready')

    const search = await call(docs, { action: 'search', query: 'timer' })
    assert.equal(search.ok, true)
    assert.ok(search.hits.length >= 1)
    assert.equal(search.hits[0].collection, COLLECTION)

    const pageId = search.hits[0].id
    const read = await call(docs, { action: 'read', id: pageId })
    assert.equal(read.ok, true)
    assert.equal(typeof read.text, 'string')
    assert.ok(read.text.length > 100)
    assert.equal(read.truncated, false)

    const status = await call(docs, { action: 'status' })
    assert.equal(status.ok, true)
    assert.equal(status.collections[0].status, 'ready')

    const lookup = await call(docs, { action: 'lookup', term: 'TON' })
    assert.equal(lookup.ok, true)
    assert.ok(lookup.matches.length >= 1)
    assert.equal(lookup.matches[0].collection, COLLECTION)

    const unknown = await call(docs, { action: 'read', id: 'does-not-exist' })
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, 'NOT_FOUND')
  })
})

describe('read-only proof', () => {
  test('the files the tools read are byte-identical after every call', async () => {
    const before = Object.fromEntries(
      Object.entries(files)
        .filter(([key]) => key !== 'missing')
        .map(([key, path]) => [key, createHash('sha256').update(readFileSync(path)).digest('hex')]),
    )
    const { definitions, docs } = buildTools()
    for (const definition of [...definitions, ...docs]) {
      await definition.execute({ action: definition.name === 'slc500_docs' ? 'contents' : undefined, path: files.slc }, exec)
    }
    const after_ = Object.fromEntries(
      Object.entries(files)
        .filter(([key]) => key !== 'missing')
        .map(([key, path]) => [key, createHash('sha256').update(readFileSync(path)).digest('hex')]),
    )
    assert.deepEqual(after_, before)
    const fs = fakeFs()
    assert.equal(typeof fs.writeText, 'undefined')
  })
})
