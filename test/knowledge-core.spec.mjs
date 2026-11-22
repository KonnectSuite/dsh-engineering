/**
 * The knowledge core, tested against a synthetic corpus in a temporary
 * directory.
 *
 * The corpus is built here, never committed, and removed afterwards: a test
 * that shipped a corpus would duplicate what the product packages commit, and a
 * test that read one of those packages would fail whenever a teammate is
 * mid-edit. Two collections cover both sources: `alpha` is authored (index
 * metadata plus `pages/*.md` bodies) and `help` is installed-help (index
 * metadata only, body read through a stub adapter).
 *
 * Run with:
 *   node --import tsx --test test/knowledge-core.spec.mjs
 *
 * @module dsh-engineering/test/knowledge-core.spec.mjs
 */

import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { after, before, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createDocsTool,
  DOCS_ACTIONS,
  MAX_HITS,
  MAX_READ_CHARS,
} from '../packages/knowledge/src/core.ts'
import { htmlToText } from '../packages/knowledge/src/html.ts'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/** The temporary directory the corpus lives in; set in `before`. */
let tempRoot = ''
/** `tempRoot/knowledge`; set in `before`. */
let knowledgeDir = ''
/** The fake installed-help root; set in `before`. */
let installRoot = ''

/** Resolver calls made by the stub adapter, oldest first. */
const resolverCalls = []
/** Reader calls made by the stub adapter, oldest first. */
const readCalls = []

/** Write one file under the temporary root, creating directories. */
function putFile(relative, content) {
  const path = join(tempRoot, relative)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, content, 'utf8')
}

/** Write one collection's `index.json` with the committed formatting. */
function putIndex(collection, index) {
  putFile(join('knowledge', collection, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
}

/** The authored bodies, by page slug. */
const BODIES = {
  'timer-on': '## On delay\n\nWhen the rung goes true, the timer starts counting.\n',
  'timer-off': '## Off delay\n\nWhen the rung goes false, the timer starts counting.\n',
  'timer-reset': 'The reset instruction clears the timer.\n',
  'message-instruction': 'Send and receive data between controllers.\n',
  'mnemonic-page': 'The behavior starts counting when the rung goes true.\n',
  'heavy-page': 'ton ton ton ton ton ton ton ton ton\n',
  'zebra-body': 'zebra\n',
  'tie-a': 'wibble wobble tie breaker\n',
  'tie-b': 'wibble wobble tie breaker\n',
  'long-page': 'x'.repeat(9000),
}

/** The synthetic `alpha` index: authored collection. */
function alphaIndex() {
  const pages = [
    { id: 'timer-on', title: 'On-Delay Timer', section: 'Timers', identifiers: ['TONR'], body: 'pages/timer-on.md' },
    { id: 'timer-off', title: 'Off-Delay Timer', section: 'Timers', identifiers: ['TOFR'], body: 'pages/timer-off.md' },
    { id: 'timer-reset', title: 'Timer Reset', section: 'Timers', body: 'pages/timer-reset.md' },
    { id: 'message-instruction', title: 'Message Instruction', section: 'Messages', body: 'pages/message-instruction.md' },
    { id: 'mnemonic-page', title: 'On-Delay Timing Behavior', section: 'Timers', identifiers: ['TON'], body: 'pages/mnemonic-page.md' },
    { id: 'heavy-page', title: 'Timing Details', section: 'Timers', body: 'pages/heavy-page.md' },
    { id: 'zebra-title', title: 'Zebra Manual', section: 'Zebra' },
    { id: 'zebra-body', title: 'Gray Book', section: 'Gray', body: 'pages/zebra-body.md' },
    { id: 'tie-a', title: 'Tie Break Page', section: 'Ties', body: 'pages/tie-a.md' },
    { id: 'tie-b', title: 'Tie Break Page', section: 'Ties', body: 'pages/tie-b.md' },
    { id: 'long-page', title: 'Long Page', section: 'Appendix', body: 'pages/long-page.md' },
  ]
  for (let number = 1; number <= 10; number += 1) {
    const padded = String(number).padStart(2, '0')
    pages.push({ id: `common-${padded}`, title: 'Common Page', section: 'Common' })
  }
  return {
    schema: 1,
    collection: 'alpha',
    title: 'Alpha Instructions',
    source: 'authored',
    revisions: [],
    pageCount: pages.length,
    pages,
    aliases: { MSG: 'message-instruction' },
  }
}

/** The synthetic `help` index: installed-help collection, two revisions. */
function helpIndex() {
  return {
    schema: 1,
    collection: 'help',
    title: 'Installed Help',
    source: 'installed-help',
    revisions: ['36.00.00', '37.00.00'],
    pageCount: 3,
    pages: [
      { id: 'help-ton', title: 'TON Instruction', section: 'Instructions', path: 'topics/ton.htm', identifiers: ['TON'], revision: '37.00.00' },
      { id: 'help-msg', title: 'MSG Instruction', section: 'Instructions', path: 'topics/msg.htm', identifiers: ['MSG'], revision: '37.00.00' },
      { id: 'help-old', title: 'Legacy TON', section: 'Legacy', path: 'topics/old.htm', identifiers: ['TON'], revision: '36.00.00' },
    ],
  }
}

/** One Oxygen WebHelp page: header/TOC before the real topic body. */
const WEBHELP_PAGE = [
  '<!DOCTYPE html>',
  '<html><head><title>Vendor Help</title><script>var nav = true</script></head>',
  '<body>',
  '<a href="#wh_topic_body" class="sr-only sr-only-focusable">Jump to main content</a>',
  '<header><nav><a href="index.html">About FactoryTalk View ME</a><a href="quick-start.html">Quick start steps</a></nav></header>',
  '<div class="col-lg-9 col-md-9 col-sm-12" id="wh_topic_body">',
  '<h1>TON instruction</h1>',
  '<p>Use &amp; enjoy the TON timer.</p>',
  '<p>Second&nbsp;paragraph.</p>',
  '<table><tr><td>a</td><td>b</td></tr></table>',
  '</div></body></html>',
].join('\n')

/** Write the whole synthetic corpus. */
function writeCorpus() {
  const alpha = alphaIndex()
  putIndex('alpha', alpha)
  for (const [slug, body] of Object.entries(BODIES)) putFile(join('knowledge', 'alpha', 'pages', `${slug}.md`), body)
  putIndex('help', helpIndex())
}

/** The adapter resolver used by most tests. */
function resolver(request) {
  resolverCalls.push(request)
  if (request.revision === '36.00.00') return { root: join(tempRoot, 'help36'), searched: [join(tempRoot, 'help36')] }
  if (request.revision === '37.00.00') return { root: installRoot, searched: [installRoot] }
  return { root: null, searched: ['C:/fake/help/roots/latest'] }
}

/** The adapter reader used by most tests: one real page, nothing else. */
function reader(request) {
  readCalls.push(request)
  return request.path === 'topics/ton.htm' ? WEBHELP_PAGE : null
}

/** Build the main two-collection tool. */
function mainTool() {
  return createDocsTool({
    name: 'probe_docs',
    knowledgeRoot: knowledgeDir,
    collections: [{ id: 'alpha' }, { id: 'help' }],
    installedResolver: resolver,
    readInstalledPage: reader,
    logger: { warn() {} },
  })
}

/** Call an action the way the harness calls it: args first, exec second. */
function call(tool, args) {
  return tool.execute(args, {})
}

describe('knowledge core', () => {
  before(() => {
    tempRoot = mkdtempSync(join(tmpdir(), 'dsh-knowledge-'))
    knowledgeDir = join(tempRoot, 'knowledge')
    installRoot = join(tempRoot, 'help37')
    writeCorpus()
  })

  after(() => {
    rmSync(tempRoot, { recursive: true, force: true })
  })

  it('createDocsTool returns one tool with exactly the five actions', () => {
    assert.deepEqual([...DOCS_ACTIONS], ['contents', 'search', 'read', 'status', 'lookup'])
    assert.equal(MAX_HITS, 8)
    assert.equal(MAX_READ_CHARS, 8000)
    const tool = mainTool()
    assert.equal(tool.name, 'probe_docs')
    assert.equal(typeof tool.execute, 'function')
    assert.deepEqual(tool.parameters.properties.action.enum, [...DOCS_ACTIONS])
    assert.deepEqual(tool.parameters.required, ['action'])
    assert.equal(tool.parameters.additionalProperties, false)
    assert.equal(tool.output.schema.type, 'object')
    const blocks = tool.output.render({}, { ok: true, action: 'status' })
    assert.equal(blocks.length, 1)
    assert.equal(blocks[0].type, 'text')
    assert.match(blocks[0].text, /"action": "status"/u)
  })

  it('a query token that is an exact alias forces its page in, even at score 0', async () => {
    const result = await call(mainTool(), { action: 'search', query: 'MSG' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'search')
    // `msg` appears in no title, section or body: only the alias puts this page in.
    assert.equal(result.total, 1)
    assert.equal(result.hits.length, 1)
    assert.equal(result.hits[0].id, 'message-instruction')
    assert.equal(result.hits[0].exact, true)
    assert.equal(result.hits[0].score, 0)
    assert.ok(result.hits[0].snippet.length > 0)
  })

  it('an exact identifier ranks by score, with the exact flag only as a tie-break', async () => {
    const result = await call(mainTool(), { action: 'search', query: 'TON' })
    assert.equal(result.ok, true)
    assert.equal(result.total, 2)
    // mnemonic-page matches through its identifier, heavy-page through body tf;
    // the genuinely relevant heavy page out-scores it, so it leads.
    assert.equal(result.hits[0].id, 'heavy-page')
    assert.equal(result.hits[0].exact, undefined)
    assert.equal(result.hits[1].id, 'mnemonic-page')
    assert.equal(result.hits[1].exact, true)
    assert.ok(
      result.hits[0].score > result.hits[1].score,
      `expected the body page to out-score the exact page (${result.hits[0].score} vs ${result.hits[1].score})`,
    )
  })

  it('BM25 orders a title match above a body-only match', async () => {
    const result = await call(mainTool(), { action: 'search', query: 'zebra' })
    assert.equal(result.ok, true)
    assert.equal(result.total, 2)
    assert.equal(result.hits[0].id, 'zebra-title')
    assert.equal(result.hits[1].id, 'zebra-body')
    assert.ok(result.hits[0].score > result.hits[1].score)
    assert.ok(result.hits[0].score > 0)
  })

  it('ties are ordered by id and are identical across two fresh loads', async () => {
    const first = await call(mainTool(), { action: 'search', query: 'wibble', limit: 5 })
    assert.equal(first.ok, true)
    assert.equal(first.total, 2)
    assert.deepEqual(first.hits.map(hit => hit.id), ['tie-a', 'tie-b'])
    assert.equal(first.hits[0].score, first.hits[1].score)

    const second = await call(mainTool(), { action: 'search', query: 'wibble', limit: 5 })
    assert.deepEqual(second, first)
    assert.equal(JSON.stringify(second), JSON.stringify(first))
  })

  it('caps hits at 8 and defaults to 5', async () => {
    const capped = await call(mainTool(), { action: 'search', query: 'common', limit: 99 })
    assert.equal(capped.ok, true)
    assert.equal(capped.total, 10)
    assert.equal(capped.hits.length, MAX_HITS)
    assert.deepEqual(capped.hits.map(hit => hit.id), [
      'common-01',
      'common-02',
      'common-03',
      'common-04',
      'common-05',
      'common-06',
      'common-07',
      'common-08',
    ])

    const defaulted = await call(mainTool(), { action: 'search', query: 'common' })
    assert.equal(defaulted.total, 10)
    assert.equal(defaulted.hits.length, 5)

    const one = await call(mainTool(), { action: 'search', query: 'common', limit: 1 })
    assert.equal(one.hits.length, 1)
    assert.equal(one.hits[0].id, 'common-01')
  })

  it('a no-match search is a successful empty answer that names contents', async () => {
    const result = await call(mainTool(), { action: 'search', query: 'qwertyzzz' })
    assert.equal(result.ok, true)
    assert.equal(result.total, 0)
    assert.deepEqual(result.hits, [])
    assert.match(result.hint, /contents/u)
  })

  it('reads an authored page body as committed text', async () => {
    const result = await call(mainTool(), { action: 'read', id: 'timer-on' })
    assert.equal(result.ok, true)
    assert.equal(result.action, 'read')
    assert.equal(result.id, 'timer-on')
    assert.equal(result.title, 'On-Delay Timer')
    assert.equal(result.collection, 'alpha')
    assert.equal(result.source, 'authored')
    assert.equal(result.revision, null)
    assert.equal(result.truncated, false)
    assert.equal(result.text, '## On delay\n\nWhen the rung goes true, the timer starts counting.')
  })

  it('truncates a long authored page at 8000 characters', async () => {
    const result = await call(mainTool(), { action: 'read', id: 'long-page' })
    assert.equal(result.ok, true)
    assert.equal(result.truncated, true)
    assert.equal(result.text.length, MAX_READ_CHARS)
  })

  it('reads a metadata-only authored page as its title and section', async () => {
    const result = await call(mainTool(), { action: 'read', id: 'zebra-title' })
    assert.equal(result.ok, true)
    assert.equal(result.source, 'authored')
    assert.equal(result.truncated, false)
    assert.match(result.text, /^Zebra Manual/u)
    assert.match(result.text, /Zebra/u)
  })

  it('reads an installed-help page through the adapter and returns clean topic text', async () => {
    const tool = mainTool()
    const result = await call(tool, { action: 'read', id: 'help-ton' })
    assert.equal(result.ok, true)
    assert.equal(result.collection, 'help')
    assert.equal(result.source, 'installed-help')
    assert.equal(result.revision, '37.00.00')
    assert.equal(result.truncated, false)

    // The header, table of contents and skip link are gone; entities decode.
    assert.match(result.text, /^TON instruction/u)
    assert.match(result.text, /Use & enjoy the TON timer\./u)
    assert.match(result.text, /Second paragraph\./u)
    assert.match(result.text, /a \| b/u)
    assert.doesNotMatch(result.text, /Jump to main content/u)
    assert.doesNotMatch(result.text, /Quick start steps/u)
    assert.doesNotMatch(result.text, /About FactoryTalk View ME/u)

    const read = readCalls.find(entry => entry.path === 'topics/ton.htm')
    assert.ok(read !== undefined, 'the adapter reader was not asked for the indexed help path')
    assert.equal(read.collection, 'help')
    assert.equal(read.path, 'topics/ton.htm')
    assert.equal(read.root, installRoot)
    assert.equal(read.revision, '37.00.00')
    assert.equal(read.page.id, 'help-ton')

    const resolved = resolverCalls.find(entry => entry.collection === 'help' && entry.revision === '37.00.00')
    assert.ok(resolved !== undefined, 'the adapter resolver was not asked for the page revision')
  })

  it('reports SOURCE_NOT_INSTALLED when the collection has no adapter', async () => {
    const tool = createDocsTool({
      name: 'no_adapter_docs',
      knowledgeRoot: knowledgeDir,
      collections: [{ id: 'alpha' }, { id: 'help' }],
    })
    const result = await call(tool, { action: 'read', id: 'help-ton' })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'SOURCE_NOT_INSTALLED')
    assert.match(result.error.message, /installed-help/u)
    assert.match(result.error.fix, /installedResolver/u)
    assert.deepEqual(result.error.roots, [])
  })

  it('reports SOURCE_NOT_INSTALLED with the roots a resolver searched', async () => {
    const searched = ['C:/fake/help/37.00.00']
    const tool = createDocsTool({
      name: 'missing_docs',
      knowledgeRoot: knowledgeDir,
      collections: [{ id: 'help' }],
      installedResolver: () => ({ root: null, searched }),
      readInstalledPage: () => '',
    })
    const result = await call(tool, { action: 'read', id: 'help-ton' })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'SOURCE_NOT_INSTALLED')
    assert.deepEqual(result.error.roots, searched)
  })

  it('enforces the revision rules', async () => {
    const tool = mainTool()

    const required = await call(tool, { action: 'search', query: 'timer', collection: 'help' })
    assert.equal(required.ok, false)
    assert.equal(required.error.code, 'REVISION_REQUIRED')
    assert.deepEqual(required.error.revisions, ['36.00.00', '37.00.00'])

    const mismatch = await call(tool, { action: 'read', id: 'help-old', revision: '37.00.00' })
    assert.equal(mismatch.ok, false)
    assert.equal(mismatch.error.code, 'INSTRUCTION_NOT_IN_REVISION')
    assert.deepEqual(mismatch.error.revisions, ['36.00.00', '37.00.00'])

    // No revision means authored collections only; a revision adds the shard.
    const authoredOnly = await call(tool, { action: 'search', query: 'instruction' })
    assert.equal(authoredOnly.ok, true)
    assert.ok(authoredOnly.hits.length > 0)
    for (const hit of authoredOnly.hits) assert.equal(hit.collection, 'alpha')

    const withRevision = await call(tool, { action: 'search', query: 'instruction', revision: '37.00.00' })
    assert.equal(withRevision.ok, true)
    assert.ok(withRevision.hits.some(hit => hit.collection === 'help'), 'revision 37 should include the help shard')
    assert.ok(withRevision.hits.every(hit => hit.revision !== '36.00.00'))

    // The adapter's current revision fills an omitted one.
    const withCurrent = createDocsTool({
      name: 'current_docs',
      knowledgeRoot: knowledgeDir,
      collections: [{ id: 'alpha' }, { id: 'help' }],
      installedResolver: resolver,
      readInstalledPage: reader,
      currentRevision: () => '37.00.00',
    })
    const filled = await call(withCurrent, { action: 'search', query: 'instruction', collection: 'help' })
    assert.equal(filled.ok, true)
    assert.ok(filled.hits.some(hit => hit.collection === 'help'))
  })

  it('status reports ready, index-only and the installed root', async () => {
    const status = await call(mainTool(), { action: 'status' })
    assert.equal(status.ok, true)
    const alpha = status.collections.find(collection => collection.id === 'alpha')
    const help = status.collections.find(collection => collection.id === 'help')
    assert.deepEqual(alpha, {
      id: 'alpha',
      title: 'Alpha Instructions',
      source: 'authored',
      revisions: [],
      status: 'ready',
      installedRoot: null,
      pageCount: 21,
    })
    // Two recorded revisions: the core will not guess which one is installed.
    assert.equal(help.status, 'index-only')
    assert.equal(help.installedRoot, null)

    const resolved = createDocsTool({
      name: 'status_docs',
      knowledgeRoot: knowledgeDir,
      collections: [{ id: 'help' }],
      installedResolver: () => ({ root: installRoot, searched: [installRoot] }),
      readInstalledPage: () => '',
    })
    const ready = await call(resolved, { action: 'status' })
    assert.equal(ready.ok, true)
    assert.equal(ready.collections[0].status, 'ready')
    assert.equal(ready.collections[0].installedRoot, installRoot)
  })

  it('contents lists collections and groups the sections of one collection', async () => {
    const tool = mainTool()
    const all = await call(tool, { action: 'contents' })
    assert.equal(all.ok, true)
    assert.deepEqual(all.collections.map(collection => collection.id), ['alpha', 'help'])

    const alpha = await call(tool, { action: 'contents', collection: 'alpha' })
    assert.equal(alpha.ok, true)
    assert.equal(alpha.collection.id, 'alpha')
    assert.equal(alpha.sections[0].section, 'Timers')
    assert.equal(alpha.sections[0].pageCount, 5)
    assert.ok(alpha.sections[0].pages.some(page => page.id === 'timer-on'))
    assert.deepEqual(
      alpha.sections.map(section => section.section),
      ['Timers', 'Messages', 'Zebra', 'Gray', 'Ties', 'Appendix', 'Common'],
    )
  })

  it('fails unknown actions and missing arguments with stable codes', async () => {
    const tool = mainTool()
    const action = await call(tool, { action: 'explain' })
    assert.equal(action.ok, false)
    assert.equal(action.error.code, 'INVALID_ACTION')
    assert.ok(action.error.fix.includes('contents'))

    const missing = await call(tool, {})
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'INVALID_ACTION')

    const read = await call(tool, { action: 'read' })
    assert.equal(read.ok, false)
    assert.equal(read.error.code, 'NOT_FOUND')

    const unknown = await call(tool, { action: 'read', id: 'no-such-page' })
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, 'NOT_FOUND')
    assert.ok(Array.isArray(unknown.error.candidates))
  })

  it('htmlToText cuts WebHelp chrome and decodes entities generically', () => {
    const text = htmlToText(WEBHELP_PAGE)
    assert.match(text, /^TON instruction/u)
    assert.doesNotMatch(text, /Jump to main content/u)
    assert.equal(htmlToText('<p>a &amp; b&nbsp;c &#38; d</p>'), 'a & b c & d')
  })

  it('core.ts carries no clock or randomness', () => {
    const source = readFileSync(join(root, 'packages', 'knowledge', 'src', 'core.ts'), 'utf8')
    assert.doesNotMatch(source, /\bDate\b/u)
    assert.doesNotMatch(source, /Math\.random|randomUUID|new Date|Date\.now|performance\.now/u)
  })
})
