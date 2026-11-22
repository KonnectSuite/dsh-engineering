/**
 * The FactoryTalk View knowledge lane, tested against the compiled package.
 *
 * Two corpora ship with the package:
 *
 * - `ftview-me` is authored operator knowledge under `knowledge/ftview-me/`
 *   (our own words: workflows, the export/import handoff, tag handling, error
 *   codes, and what an XML export cannot prove).
 * - `ftview-me-help` and `ftview-se-help` are structural indexes of the help
 *   that is installed on the machine. The indexes (titles, sections, relative
 *   paths, identifiers) are committed; the page bodies are read from the local
 *   install at call time and never ship.
 *
 * The suite reads `packages/ftview/lib/` — the same output the bundle mounts —
 * so a green run here is evidence about the shipped tool, not about a parallel
 * source tree. The installed-help reads are skipped on a machine without the
 * product help; everything else (authored knowledge, the committed indexes, the
 * goldens corpus, generator determinism) runs anywhere.
 *
 * Run with:
 *   node --import tsx --test test/ftview-knowledge.spec.mjs
 *
 * @module dsh-engineering/test/ftview-knowledge.spec.mjs
 */

import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import { createFtviewDocsTool, docsTools } from '../packages/ftview/lib/docs.js'
import {
  BM25_B,
  BM25_K1,
  DEFAULT_HITS,
  DOCS_ACTIONS,
  MAX_HITS,
  MAX_READ_CHARS,
} from '../packages/ftview/lib/knowledge/core.js'
import { buildKnowledge } from '../scripts/gen-ftview-knowledge.mjs'

// ---------------------------------------------------------------------------
// Locations and fixtures
// ---------------------------------------------------------------------------

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const knowledgeDir = join(root, 'packages', 'ftview', 'knowledge')
const generator = join(root, 'scripts', 'gen-ftview-knowledge.mjs')

const COLLECTION_IDS = ['ftview-me', 'ftview-me-help', 'ftview-se-help']
const PAGE_COUNTS = { 'ftview-me': 9, 'ftview-me-help': 1544, 'ftview-se-help': 2603 }
const SOURCES = {
  'ftview-me': 'authored',
  'ftview-me-help': 'installed-help',
  'ftview-se-help': 'installed-help',
}

/** The authored page ids, in the codepoint order the index records them. */
const AUTHORED_IDS = [
  'display-workflow',
  'errors-and-fixes',
  'export-import',
  'global-objects',
  'overview',
  'project-workflow',
  'runtime-and-transfer',
  'tags',
  'what-xml-cannot-prove',
]

/** Read one committed collection index. */
function readIndex(collection) {
  return JSON.parse(readFileSync(join(knowledgeDir, collection, 'index.json'), 'utf8'))
}

/** The committed page ids, by collection. */
function committedPages() {
  const pages = new Map()
  for (const collection of COLLECTION_IDS) {
    pages.set(collection, readIndex(collection).pages.map((page) => page.id))
  }
  return pages
}

/** Run one tool call and return the envelope. */
function call(tool, args) {
  return tool.execute(args, {})
}

/** Load the goldens corpus. */
function readGoldens() {
  return JSON.parse(readFileSync(join(knowledgeDir, 'goldens.json'), 'utf8'))
}

/** SHA-256 of a UTF-8 string, for the determinism comparisons. */
function digest(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** The two default install roots, derived the way the adapter derives them. */
function defaultHelpRoots() {
  const bases = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
    process.env.ProgramData,
    process.env.LOCALAPPDATA,
  ].filter((base) => typeof base === 'string' && base.length > 0)
  const roots = []
  for (const base of bases) {
    for (const product of ['FTViewME', 'FTViewSE']) {
      const candidate = join(base, 'Common Files', 'Rockwell', 'Help', product, 'Help')
      if (existsSync(join(candidate, 'sitemap.xml'))) roots.push(candidate)
    }
  }
  return roots
}

const helpRoots = defaultHelpRoots()
const installed = helpRoots.length === 2

const tool = createFtviewDocsTool()
const absentTool = createFtviewDocsTool({ helpRoots: { me: null, se: null } })

// ---------------------------------------------------------------------------
// Registration and the tool surface
// ---------------------------------------------------------------------------

describe('ftview_docs registration', () => {
  it('exports exactly one ftview_docs tool with the five read-only actions', () => {
    const tools = docsTools()
    assert.equal(tools.length, 1)

    const [definition] = tools
    assert.equal(definition.name, 'ftview_docs')
    assert.equal(typeof definition.description, 'string')
    assert.ok(definition.description.includes('FactoryTalk View'))
    assert.ok(definition.description.includes('installed'))

    const parameters = definition.parameters
    assert.equal(parameters.type, 'object')
    assert.deepEqual(parameters.required, ['action'])
    assert.equal(parameters.additionalProperties, false)
    assert.deepEqual(parameters.properties.action.enum, [...DOCS_ACTIONS])
    assert.deepEqual([...DOCS_ACTIONS], ['contents', 'search', 'read', 'status', 'lookup'])
    assert.equal(parameters.properties.limit.minimum, 1)
    assert.equal(parameters.properties.limit.maximum, MAX_HITS)

    assert.equal(definition.output.schema.type, 'object')
    const rendered = definition.output.render({ action: 'status' }, { ok: true })
    assert.equal(rendered.length, 1)
    assert.equal(rendered[0].type, 'text')
    assert.deepEqual(JSON.parse(rendered[0].text), { ok: true })
  })
})

// ---------------------------------------------------------------------------
// contents: the committed inventory
// ---------------------------------------------------------------------------

describe('contents', () => {
  it('lists the three committed collections with their committed page counts', async () => {
    const value = await call(tool, { action: 'contents' })
    assert.equal(value.ok, true)
    assert.equal(value.action, 'contents')
    assert.deepEqual(value.collections.map((collection) => collection.id), COLLECTION_IDS)

    for (const collection of value.collections) {
      assert.equal(collection.pageCount, PAGE_COUNTS[collection.id])
      assert.equal(collection.source, SOURCES[collection.id])
      assert.equal(typeof collection.title, 'string')
      assert.ok(collection.title.length > 0)
    }
  })

  it('groups the authored collection into its sections without losing a page', async () => {
    const value = await call(tool, { action: 'contents', collection: 'ftview-me' })
    assert.equal(value.ok, true)
    assert.equal(value.collection.pageCount, AUTHORED_IDS.length)

    const ids = value.sections.flatMap((section) => section.pages.map((page) => page.id))
    assert.deepEqual([...ids].sort(), [...AUTHORED_IDS].sort())
    assert.equal(new Set(ids).size, ids.length)

    assert.deepEqual(
      value.sections.map((section) => section.section),
      ['Authoring', 'Diagnostics', 'Handoff', 'Foundations', 'Runtime', 'Data', 'Limits'],
    )
    for (const section of value.sections) {
      assert.equal(section.pageCount, section.pages.length)
      assert.ok(section.pageCount > 0)
    }
  })

  it('answers NOT_FOUND for a collection that is not served', async () => {
    const value = await call(tool, { action: 'contents', collection: 'no-such-collection' })
    assert.equal(value.ok, false)
    assert.equal(value.error.code, 'NOT_FOUND')
    assert.ok(value.error.fix.length > 0)
  })
})

// ---------------------------------------------------------------------------
// read: the authored corpus
// ---------------------------------------------------------------------------

describe('authored read', () => {
  it('reads one authored page as our own prose', async () => {
    const value = await call(tool, { action: 'read', id: 'overview' })
    assert.equal(value.ok, true)
    assert.equal(value.action, 'read')
    assert.equal(value.id, 'overview')
    assert.equal(value.collection, 'ftview-me')
    assert.equal(value.source, 'authored')
    assert.equal(value.title, 'FactoryTalk View ME at a glance')
    assert.equal(value.truncated, false)
    assert.ok(value.text.startsWith('# FactoryTalk View ME at a glance'))
    assert.ok(value.text.includes('ME Station'))
    assert.ok(value.text.length <= MAX_READ_CHARS)
  })

  it('carries the measured export figures in the handoff page', async () => {
    const value = await call(tool, { action: 'read', id: 'export-import' })
    assert.equal(value.ok, true)
    assert.ok(value.text.includes('23,140,746'))
    assert.ok(value.text.includes('BatchImport'))
    assert.ok(value.text.includes('65 displays'))
  })

  it('answers NOT_FOUND with a fix for an unknown page id', async () => {
    const value = await call(tool, { action: 'read', id: 'no-such-page' })
    assert.equal(value.ok, false)
    assert.equal(value.error.code, 'NOT_FOUND')
    assert.ok(value.error.fix.length > 0)
  })
})

// ---------------------------------------------------------------------------
// search: exact identifier layer and BM25 ranking
// ---------------------------------------------------------------------------

describe('search exact and ranking', () => {
  it('includes an exact identifier with exact:true', async () => {
    const value = await call(tool, { action: 'search', query: 'BatchImport' })
    assert.equal(value.ok, true)
    assert.equal(value.total, 1)
    assert.equal(value.hits.length, 1)
    const [hit] = value.hits
    assert.equal(hit.id, 'export-import')
    assert.equal(hit.collection, 'ftview-me')
    assert.equal(hit.exact, true)
    assert.ok(hit.score > 0)
    assert.equal(typeof hit.snippet, 'string')
  })

  it('ranks exact matches by score and keeps every exact hit flagged', async () => {
    const value = await call(tool, { action: 'search', query: 'ggfx' })
    assert.equal(value.ok, true)
    const exact = value.hits.filter((hit) => hit.exact === true)
    assert.ok(exact.some((hit) => hit.id === 'global-objects'))
    for (let index = 1; index < value.hits.length; index += 1) {
      assert.ok(
        value.hits[index - 1].score >= value.hits[index].score,
        `hits are not ordered by score at ${index}`,
      )
    }
    for (const hit of value.hits.filter((candidate) => candidate.exact !== true)) {
      assert.equal(hit.exact, undefined)
    }
  })

  it('orders scored hits by descending BM25 score with four-decimal scores', async () => {
    const value = await call(tool, { action: 'search', query: 'global object parameters', limit: 8 })
    assert.equal(value.ok, true)
    assert.equal(value.hits.length, 8)
    assert.ok(value.total > 8)

    const scored = value.hits.filter((hit) => hit.exact !== true)
    assert.equal(scored.length, 8)
    for (let index = 1; index < scored.length; index += 1) {
      assert.ok(scored[index - 1].score >= scored[index].score)
    }
    for (const hit of scored) {
      assert.equal(Number(hit.score.toFixed(4)), hit.score)
    }
    assert.equal(value.hits[0].id, 'me/help/meproj/global-object-parameters')
  })

  it('honours the default and maximum limits and repeats deterministically', async () => {
    const defaults = await call(tool, { action: 'search', query: 'global object parameters' })
    assert.equal(defaults.hits.length, DEFAULT_HITS)

    const full = await call(tool, { action: 'search', query: 'global object parameters', limit: MAX_HITS })
    assert.equal(full.hits.length, MAX_HITS)

    const clamped = await call(tool, { action: 'search', query: 'global object parameters', limit: 99 })
    assert.equal(clamped.hits.length, MAX_HITS)

    const repeat = await call(tool, { action: 'search', query: 'global object parameters', limit: 8 })
    assert.deepEqual(repeat.hits.map((hit) => hit.id), full.hits.map((hit) => hit.id))
    assert.deepEqual(repeat.hits.map((hit) => hit.score), full.hits.map((hit) => hit.score))
  })

  it('returns a successful empty result that names contents on a miss', async () => {
    const value = await call(tool, { action: 'search', query: 'xylophone marmalade' })
    assert.equal(value.ok, true)
    assert.equal(value.total, 0)
    assert.deepEqual(value.hits, [])
    assert.equal(typeof value.hint, 'string')
    assert.ok(value.hint.includes('contents'))
  })

  it('requires a query and rejects an unknown action', async () => {
    const missing = await call(tool, { action: 'search' })
    assert.equal(missing.ok, false)
    assert.equal(missing.error.code, 'QUERY_REQUIRED')

    const blank = await call(tool, { action: 'search', query: '   ' })
    assert.equal(blank.ok, false)
    assert.equal(blank.error.code, 'QUERY_REQUIRED')

    const unknown = await call(tool, { action: 'bogus' })
    assert.equal(unknown.ok, false)
    assert.equal(unknown.error.code, 'INVALID_ACTION')
    assert.deepEqual(unknown.error.candidates, [...DOCS_ACTIONS])
  })
})

// ---------------------------------------------------------------------------
// lookup: the exact identifier surface
// ---------------------------------------------------------------------------

describe('lookup', () => {
  it('resolves an authored identifier to its page', async () => {
    const value = await call(tool, { action: 'lookup', term: 'batch import' })
    assert.equal(value.ok, true)
    assert.equal(value.total, 1)
    assert.equal(value.matches[0].id, 'export-import')
    assert.ok(value.matches[0].identifiers.includes('BatchImport'))
  })

  it('resolves an installed-help context id to both help pages', async () => {
    const value = await call(tool, { action: 'lookup', term: '2228370' })
    assert.equal(value.ok, true)
    assert.deepEqual(value.matches.map((match) => match.id), [
      'me/help/meproj/define-global-object-parameters',
      'se/help/graphiceditor/define-global-object-parameters',
    ])
  })
})

// ---------------------------------------------------------------------------
// status: posture on this host, and the absent-install posture
// ---------------------------------------------------------------------------

describe('status posture', () => {
  it('reports the committed inventory and a honest posture per collection', async () => {
    const value = await call(tool, { action: 'status' })
    assert.equal(value.ok, true)
    assert.deepEqual(value.collections.map((collection) => collection.id), COLLECTION_IDS)

    for (const collection of value.collections) {
      assert.equal(collection.pageCount, PAGE_COUNTS[collection.id])
      assert.equal(collection.source, SOURCES[collection.id])
      assert.ok(Array.isArray(collection.revisions))

      if (collection.id === 'ftview-me') {
        assert.equal(collection.status, 'ready')
        assert.equal(collection.installedRoot, null)
      } else {
        assert.deepEqual(collection.revisions, ['15.00.00'])
        assert.ok(collection.status === 'ready' || collection.status === 'index-only')
        if (collection.status === 'ready') {
          assert.equal(typeof collection.installedRoot, 'string')
          assert.ok(collection.installedRoot.length > 0)
        } else {
          assert.equal(collection.installedRoot, null)
        }
      }
    }
  })

  it('reports index-only when no help install is resolvable', async () => {
    const value = await call(absentTool, { action: 'status' })
    assert.equal(value.ok, true)

    const authored = value.collections.find((collection) => collection.id === 'ftview-me')
    assert.equal(authored.status, 'ready')

    for (const id of ['ftview-me-help', 'ftview-se-help']) {
      const collection = value.collections.find((candidate) => candidate.id === id)
      assert.equal(collection.status, 'index-only')
      assert.equal(collection.installedRoot, null)
      assert.equal(collection.pageCount, PAGE_COUNTS[id])
      assert.deepEqual(collection.revisions, ['15.00.00'])
    }
  })
})

// ---------------------------------------------------------------------------
// SOURCE_NOT_INSTALLED and index-only search
// ---------------------------------------------------------------------------

describe('installed-help sources', () => {
  it('answers SOURCE_NOT_INSTALLED with searched roots when the install is absent', async () => {
    const value = await call(absentTool, { action: 'read', id: 'me/help/meproj/import-an-application' })
    assert.equal(value.ok, false)
    assert.equal(value.action, 'read')
    assert.equal(value.error.code, 'SOURCE_NOT_INSTALLED')
    assert.ok(value.error.message.includes('installed-help'))
    assert.ok(value.error.fix.length > 0)
    assert.ok(Array.isArray(value.error.roots))
  })

  it('still searches the committed index when the install is absent', async () => {
    const value = await call(absentTool, {
      action: 'search',
      query: 'import an application',
      collection: 'ftview-me-help',
      revision: '15.00.00',
      limit: 2,
    })
    assert.equal(value.ok, true)
    assert.ok(value.hits.length > 0)
    assert.equal(value.hits[0].id, 'me/help/meproj/import-an-application')
    assert.equal(value.hits[0].collection, 'ftview-me-help')
  })

  it('reads an installed help page from the local install', async (context) => {
    if (!installed) {
      context.skip('FactoryTalk View help is not installed on this machine')
      return
    }
    const value = await call(tool, { action: 'read', id: 'me/help/meproj/import-an-application' })
    assert.equal(value.ok, true)
    assert.equal(value.source, 'installed-help')
    assert.equal(value.revision, '15.00.00')
    assert.equal(value.truncated, false)
    assert.ok(value.text.startsWith('Import an application'))
    assert.ok(value.text.includes('Machine Edition Import Wizard'))
    assert.ok(!value.text.includes('wh_topic_body'))
    assert.ok(!value.text.includes('Jump to main content'))
    assert.ok(!value.text.includes('<html'))
  })

  it('rejects a page read outside its recorded revision', async (context) => {
    if (!installed) {
      context.skip('FactoryTalk View help is not installed on this machine')
      return
    }
    const value = await call(tool, {
      action: 'read',
      id: 'me/help/meproj/import-an-application',
      revision: '13.00.00',
    })
    assert.equal(value.ok, false)
    assert.equal(value.error.code, 'INSTRUCTION_NOT_IN_REVISION')
    assert.deepEqual(value.error.revisions, ['15.00.00'])
  })
})

// ---------------------------------------------------------------------------
// The goldens corpus
// ---------------------------------------------------------------------------

describe('goldens corpus', () => {
  it('is a sorted, deterministic corpus of 20 to 35 cases', () => {
    const raw = readFileSync(join(knowledgeDir, 'goldens.json'), 'utf8')
    assert.ok(raw.endsWith('\n'))
    assert.ok(!raw.includes('\r'))

    const goldens = readGoldens()
    assert.equal(JSON.stringify(goldens, null, 2) + '\n', raw)
    assert.equal(goldens.schema, 1)
    assert.equal(goldens.collection, 'all')
    assert.ok(Array.isArray(goldens.cases))
    assert.ok(goldens.cases.length >= 20 && goldens.cases.length <= 35)

    const ids = goldens.cases.map((entry) => entry.id)
    assert.equal(new Set(ids).size, ids.length)
    assert.deepEqual(ids, [...ids].sort())

    const byKind = { answer: 0, exact: 0, 'no-match': 0, contents: 0 }
    for (const entry of goldens.cases) {
      assert.equal(typeof entry.query, 'string')
      assert.ok(Array.isArray(entry.expect))
      assert.ok(entry.expect.length <= 3)
      assert.deepEqual(entry.expect, [...entry.expect].sort())
      assert.ok(Object.hasOwn(byKind, entry.kind), `unknown kind ${entry.kind} in ${entry.id}`)
      byKind[entry.kind] += 1
    }
    assert.ok(byKind.answer >= 12, `answer cases: ${byKind.answer}`)
    assert.ok(byKind.exact >= 4, `exact cases: ${byKind.exact}`)
    assert.ok(byKind['no-match'] >= 2, `no-match cases: ${byKind['no-match']}`)
    assert.ok(byKind.contents >= 1, `contents cases: ${byKind.contents}`)
  })

  it('only cites ids that exist in the committed corpora', () => {
    const pages = committedPages()
    const pageIds = new Set([...pages.values()].flat())
    for (const entry of readGoldens().cases) {
      for (const id of entry.expect) {
        const isPage = pageIds.has(id)
        const isCollection = entry.kind === 'contents' && COLLECTION_IDS.includes(id)
        assert.ok(isPage || isCollection, `${entry.id} cites unknown id ${id}`)
      }
    }
  })

  it('matches the behaviour of the committed tool for every case', async () => {
    const goldens = readGoldens()
    for (const entry of goldens.cases) {
      const label = `${entry.id} (${entry.kind}): ${entry.query}`

      if (entry.kind === 'contents') {
        const value = await call(tool, { action: 'contents' })
        assert.equal(value.ok, true, label)
        assert.deepEqual(value.collections.map((collection) => collection.id), entry.expect, label)
        continue
      }

      const value = await call(tool, { action: 'search', query: entry.query, limit: MAX_HITS })
      assert.equal(value.ok, true, label)
      const hits = value.hits
      const hitIds = hits.map((hit) => hit.id)

      if (entry.kind === 'no-match') {
        assert.equal(value.total, 0, label)
        assert.deepEqual(hits, [], label)
        continue
      }

      if (entry.kind === 'answer') {
        for (const id of entry.expect) assert.ok(hitIds.includes(id), `${label}: missing ${id}`)
        continue
      }

      // kind === 'exact': the exact identifier is flagged and ranks with the
      // scored hits by score; where several pages share the identifier any of
      // them may lead, so the first hit only has to be one of the expected ids.
      assert.equal(hits[0].exact, true, label)
      assert.ok(entry.expect.includes(hits[0].id), `${label}: first hit ${hits[0].id} is not expected`)
      for (const id of entry.expect) {
        const hit = hits.find((candidate) => candidate.id === id)
        assert.ok(hit !== undefined, `${label}: missing exact hit ${id}`)
        assert.equal(hit.exact, true, `${label}: ${id} is not marked exact`)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Generator determinism
// ---------------------------------------------------------------------------

describe('generator determinism', () => {
  /** The committed revisions, as the indexes record them. */
  function committedRevisions() {
    return {
      me: readIndex('ftview-me-help').revisions[0] ?? null,
      se: readIndex('ftview-se-help').revisions[0] ?? null,
    }
  }

  it('builds byte-identical corpora on two consecutive runs', () => {
    const first = buildKnowledge()
    const second = buildKnowledge()

    assert.deepEqual([...first.files.keys()].sort(), [...second.files.keys()].sort())
    assert.deepEqual(first.skipped, second.skipped)
    assert.deepEqual(first.revisions, second.revisions)
    for (const [relativePath, content] of first.files) {
      assert.equal(second.files.get(relativePath), content, relativePath)
      assert.ok(content.endsWith('\n'), `${relativePath} has no trailing newline`)
    }
    // The authored index is always reproduced; the installed-help indexes are
    // committed whether or not this machine has the help installed.
    assert.ok(first.files.has('ftview-me/index.json'))
    for (const collection of COLLECTION_IDS) {
      assert.ok(existsSync(join(knowledgeDir, collection, 'index.json')), collection)
    }
  })

  it('reproduces the committed corpora when the recorded revisions match', () => {
    const built = buildKnowledge()
    const committed = committedRevisions()
    const sameRevisions =
      built.revisions.me === committed.me && built.revisions.se === committed.se

    // The authored corpus is reproducible anywhere, installed help or not.
    assert.equal(
      built.files.get('ftview-me/index.json'),
      readFileSync(join(knowledgeDir, 'ftview-me', 'index.json'), 'utf8'),
    )
    if (built.skipped.length > 0 || !sameRevisions) return

    for (const [relativePath, content] of built.files) {
      assert.equal(readFileSync(join(knowledgeDir, relativePath), 'utf8'), content, relativePath)
    }
  })

  it('reports the corpora current in --check mode', (context) => {
    const built = buildKnowledge()
    const committed = committedRevisions()
    const sameRevisions =
      built.revisions.me === committed.me && built.revisions.se === committed.se
    if (built.skipped.length > 0 || !sameRevisions) {
      context.skip('this machine cannot reproduce the committed installed-help corpora')
      return
    }

    const stdout = execFileSync(process.execPath, [generator, '--check'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    assert.ok(stdout.includes('current'), stdout)
    assert.ok(stdout.includes('3 file(s)'), stdout)
    assert.equal(stdout.includes('stale'), false)

    // The same bytes come out twice, which is what makes the check meaningful.
    const before = digest(readFileSync(join(knowledgeDir, 'ftview-me-help', 'index.json'), 'utf8'))
    const rebuilt = buildKnowledge()
    assert.equal(rebuilt.files.get('ftview-me-help/index.json'), built.files.get('ftview-me-help/index.json'))
    assert.equal(
      digest(rebuilt.files.get('ftview-me-help/index.json')),
      digest(built.files.get('ftview-me-help/index.json')),
      before,
    )
  })
})

// ---------------------------------------------------------------------------
// Retrieval constants the corpus was designed against
// ---------------------------------------------------------------------------

describe('retrieval constants', () => {
  it('uses the contract BM25 values', () => {
    assert.equal(BM25_K1, 1.2)
    assert.equal(BM25_B, 0.75)
    assert.equal(MAX_READ_CHARS, 8000)
  })
})
