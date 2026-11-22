import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  L5X_DOCS_TOOL_NAME,
  checkInstructionRevision,
  docsTools,
  loadInstructionVersions,
} from '../packages/l5x/lib/docs.js'

/**
 * The L5X documentation surface is a read-only tool: five actions over the
 * authored corpus this package ships plus two structural indexes of the Studio
 * 5000 help installed on the host. These tests pin the behaviours the release
 * gate and the offline-edit contract depend on: ranking, exact identifiers,
 * the installed-help absence envelope, and the revision guard that must never
 * block an offline edit when its committed map is unavailable.
 */

const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url))
const KNOWLEDGE_ROOT = join(REPO_ROOT, 'packages', 'l5x', 'knowledge')
const GENERATOR = join(REPO_ROOT, 'scripts', 'gen-l5x-knowledge.mjs')
const TOOL = docsTools()[0]

const run = (args) => TOOL.execute(args, {})

const readJson = (relativePath) => JSON.parse(readFileSync(join(KNOWLEDGE_ROOT, relativePath), 'utf8'))

const readCollection = (id) => readJson(join(id, 'index.json'))

const walk = (directory, base = directory) => {
  const entries = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const absolute = join(directory, entry.name)
    if (entry.isDirectory()) entries.push(...walk(absolute, base))
    else entries.push(relative(base, absolute))
  }
  return entries.sort()
}

const installedHelpMajor = (major) => {
  const bases = [process.env['ProgramFiles(x86)'], process.env.ProgramFiles].filter(
    (base) => base !== undefined && base !== '',
  )
  return bases.some((base) =>
    existsSync(join(base, 'Rockwell Software', 'Studio 5000', 'Logix Designer', 'ENU', `v${major}`, 'Bin', 'Help', 'ENU', 'rs5000')),
  )
}

const haveBothHelpTrees = () => installedHelpMajor(37) && installedHelpMajor(36)

test('the adapter registers one read-only l5x_docs tool with the five actions', () => {
  assert.equal(L5X_DOCS_TOOL_NAME, 'l5x_docs')
  const tools = docsTools()
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'l5x_docs')
  const parameters = tools[0].parameters
  assert.deepEqual([...parameters.properties.action.enum].sort(), ['contents', 'lookup', 'read', 'search', 'status'])
  assert.deepEqual(parameters.required, ['action'])
  assert.equal(parameters.additionalProperties, false)
  // A read-only tool: every exposed action is a query, and the description
  // says where the help text comes from.
  assert.match(tools[0].description, /installed|authored/iu)
  for (const action of parameters.properties.action.enum) {
    assert.doesNotMatch(action, /write|apply|delete|create|update/u)
  }
})

test('search ranks an exact identifier first and sorts the rest by score', async () => {
  const result = await run({ action: 'search', query: 'ABS' })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'search')
  assert.ok(result.hits.length >= 1)
  assert.equal(result.hits[0].id, 'instruction-abs')
  assert.equal(result.hits[0].exact, true)
  const scores = result.hits.map((hit) => hit.score)
  assert.deepEqual(scores, [...scores].sort((left, right) => right - left))
  const ids = result.hits.map((hit) => hit.id)
  assert.equal(new Set(ids).size, ids.length)
})

test('search honours the limit and reports a total for the query', async () => {
  const result = await run({ action: 'search', query: 'rung', limit: 3 })
  assert.equal(result.ok, true)
  assert.equal(result.hits.length, 3)
  assert.ok(result.total >= result.hits.length)
  assert.ok(result.hits.every((hit) => typeof hit.snippet === 'string' && hit.snippet.length > 0))
})

test('read returns an authored page body as readable text', async () => {
  const result = await run({ action: 'read', id: 'instruction-abs' })
  assert.equal(result.ok, true)
  assert.equal(result.action, 'read')
  assert.equal(result.source, 'authored')
  assert.equal(result.collection, 'l5x-instruction-families')
  assert.match(result.text, /absolute value/iu)
  assert.equal(result.truncated, false)
})

test('lookup resolves an exact instruction mnemonic', async () => {
  const result = await run({ action: 'lookup', term: 'MOV' })
  assert.equal(result.ok, true)
  assert.ok(result.matches.length >= 1)
  assert.equal(result.matches[0].id, 'instruction-move')
  assert.ok(result.matches[0].identifiers.includes('MOV'))
})

test('an installed-help read reports SOURCE_NOT_INSTALLED with the roots it searched', async () => {
  const override = join(tmpdir(), `l5x-help-${process.pid}-absent`, 'rs5000')
  const previous = process.env.L5X_HELP_ROOT_V37_05
  process.env.L5X_HELP_ROOT_V37_05 = override
  try {
    const result = await run({
      action: 'read',
      id: 'help/clinset/Compute/absolute-value--abs-',
      collection: 'l5x-help-37-05',
      revision: '37.05.00',
    })
    assert.equal(result.ok, false)
    assert.equal(result.error.code, 'SOURCE_NOT_INSTALLED')
    assert.match(result.error.message, /no local help install/iu)
    assert.ok(Array.isArray(result.error.roots))
    assert.ok(result.error.roots.includes(override))
  } finally {
    if (previous === undefined) delete process.env.L5X_HELP_ROOT_V37_05
    else process.env.L5X_HELP_ROOT_V37_05 = previous
  }
})

test('a page recorded for v37.05.00 is refused for a v36 request', async () => {
  const result = await run({
    action: 'read',
    id: 'help/clinset/Compute/absolute-value--abs-',
    collection: 'l5x-help-37-05',
    revision: '36.00.00',
  })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'INSTRUCTION_NOT_IN_REVISION')
  assert.deepEqual(result.error.revisions, ['37.05.00'])
})

test('the adapter revision guard refuses an authored page outside its revisions', async () => {
  const refused = await run({ action: 'read', id: 'instruction-abs', revision: '35.00.00' })
  assert.equal(refused.ok, false)
  assert.equal(refused.error.code, 'INSTRUCTION_NOT_IN_REVISION')
  assert.ok(refused.error.revisions.includes('36.00.00'))
  assert.ok(refused.error.revisions.includes('37.05.00'))

  const allowed = await run({ action: 'read', id: 'instruction-abs', revision: '37.05.00' })
  assert.equal(allowed.ok, true)
  assert.match(allowed.text, /absolute value/iu)

  const plain = await run({ action: 'read', id: 'instruction-abs' })
  assert.equal(plain.ok, true)
})

test('the exported revision check reports unverified instead of blocking', () => {
  const versions = loadInstructionVersions(KNOWLEDGE_ROOT)
  assert.notEqual(versions, null)
  assert.equal(versions.instructions.length, 328)

  assert.equal(checkInstructionRevision('ABS', '37.05.00', versions).code, null)
  assert.equal(checkInstructionRevision('ABS', '37.05.00', versions).verified, true)
  assert.equal(checkInstructionRevision('JSR', '35.00.00', versions).code, 'INSTRUCTION_NOT_IN_REVISION')
  assert.equal(checkInstructionRevision('JSR', '36.00.00', versions).code, null)
  const unverified = checkInstructionRevision('ABS', '37.05.00', null)
  assert.equal(unverified.verified, false)
  assert.equal(unverified.code, 'REVISION_UNVERIFIED')
})

test('a missing instruction-versions.json warns and fails open', async () => {
  const root = mkdtempSync(join(tmpdir(), 'l5x-knowledge-no-versions-'))
  try {
    cpSync(KNOWLEDGE_ROOT, root, {
      recursive: true,
      filter: (source) => {
        const local = relative(KNOWLEDGE_ROOT, source)
        if (local === 'instruction-versions.json') return false
        if (local.startsWith(`l5x-help-`)) return false
        return true
      },
    })
    const warnings = []
    const guarded = docsTools({ knowledgeRoot: root, logger: { warn: (message) => warnings.push(message) } })[0]
    const result = await guarded.execute({ action: 'read', id: 'instruction-abs', revision: '35.00.00' }, {})
    assert.equal(result.ok, true)
    assert.match(result.text, /absolute value/iu)
    assert.ok(warnings.some((warning) => warning.includes('instruction-versions.json')))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('contents and status describe every committed collection', async () => {
  const status = await run({ action: 'status' })
  assert.equal(status.ok, true)
  const byId = new Map(status.collections.map((collection) => [collection.id, collection]))
  assert.deepEqual(
    [...byId.keys()],
    [
      'l5x-instruction-families',
      'l5x-revision-deltas',
      'l5x-offline-workflows',
      'l5x-errors',
      'l5x-ladder-idioms',
      'l5x-help-37-05',
      'l5x-help-36-00',
    ],
  )
  assert.equal(byId.get('l5x-instruction-families').pageCount, 74)
  assert.equal(byId.get('l5x-help-37-05').pageCount, 5493)
  assert.equal(byId.get('l5x-help-36-00').pageCount, 6581)
  assert.ok(['ready', 'index-only'].includes(byId.get('l5x-help-37-05').status))

  const contents = await run({ action: 'contents', collection: 'l5x-ladder-idioms' })
  assert.equal(contents.ok, true)
  assert.deepEqual(
    contents.sections.map((section) => section.section),
    ['Rung structure', 'Common idioms'],
  )
  assert.equal(contents.sections.reduce((total, section) => total + section.pageCount, 0), 11)
})

test('the committed indexes carry the measured page counts and no help bodies', () => {
  const v37 = readCollection('l5x-help-37-05')
  assert.equal(v37.pageCount, 5493)
  assert.equal(v37.pages.length, 5493)
  assert.deepEqual(v37.revisions, ['37.05.00'])
  assert.equal(v37.source, 'installed-help')
  // Root chrome pages are excluded; every committed page is a relative help path.
  assert.ok(v37.pages.every((page) => page.path.includes('/') && page.path.endsWith('.html')))
  const clinset = v37.pages.filter((page) => page.path.startsWith('help/clinset/'))
  assert.equal(clinset.length, 902)
  assert.equal(new Set(clinset.map((page) => page.path.split('/')[2])).size, 46)
  // Structural index only: no page bodies are copied out of the vendor help.
  assert.ok(v37.pages.every((page) => page.body === undefined && page.text === undefined))

  const v36 = readCollection('l5x-help-36-00')
  assert.equal(v36.pageCount, 6581)
  assert.equal(v36.pages.length, 6581)
  assert.deepEqual(v36.revisions, ['36.00.00'])
  assert.ok(v36.pages.every((page) => page.path.includes('.htm')))

  const versions = readJson('instruction-versions.json')
  assert.equal(versions.instructions.length, 328)
  const abs = versions.instructions.find((entry) => entry.mnemonic === 'ABS')
  assert.deepEqual(abs.revisions, ['36.00.00', '37.05.00'])
  assert.match(JSON.stringify(versions.provenance), /installed help/iu)
})

test('goldens are 25-40 realistic cases that resolve in the committed indexes', async () => {
  const goldens = readJson('goldens.json')
  assert.equal(goldens.schema, 1)
  assert.ok(goldens.cases.length >= 25 && goldens.cases.length <= 40)
  const kinds = { answer: 0, exact: 0, 'no-match': 0 }
  let revisionCases = 0
  for (const item of goldens.cases) {
    assert.match(item.id, /^q\d+$/u)
    assert.ok(item.kind in kinds)
    kinds[item.kind] += 1
    assert.ok(Array.isArray(item.expect) && item.expect.length <= 3)
    if (item.kind !== 'no-match') assert.ok(item.expect.length >= 1)
    if (item.revision !== undefined) revisionCases += 1
  }
  assert.ok(kinds.answer >= 15)
  assert.ok(kinds.exact >= 5)
  assert.ok(kinds['no-match'] >= 2)
  assert.ok(revisionCases >= 3)

  const known = new Set()
  for (const id of ['l5x-instruction-families', 'l5x-revision-deltas', 'l5x-offline-workflows', 'l5x-errors', 'l5x-ladder-idioms', 'l5x-help-37-05', 'l5x-help-36-00']) {
    for (const page of readCollection(id).pages) known.add(page.id)
  }
  for (const item of goldens.cases) {
    for (const expected of item.expect) assert.ok(known.has(expected), `${item.id} expects unknown id ${expected}`)
    const args = { action: 'search', query: item.query, limit: 8 }
    if (item.revision !== undefined) args.revision = item.revision
    const result = await run(args)
    assert.equal(result.ok, true, `${item.id} search failed`)
    const hitIds = result.hits.map((hit) => hit.id)
    if (item.kind === 'no-match') {
      assert.equal(result.hits.length, 0, `${item.id} expects no hits`)
    } else {
      for (const expected of item.expect) {
        assert.ok(hitIds.includes(expected), `${item.id} did not retrieve ${expected}`)
      }
    }
  }
})

test('the docs adapter tolerates a composition context that refuses undeclared reads', async () => {
  // A cordis plugin context is a proxy: reading a service the plugin did not
  // declare with `inject` throws. The docs adapter accepts optional overrides
  // from that context, but a refused read must fall back to the defaults
  // instead of taking the whole L5X tool surface down with it. This is the
  // shape of the bug that left a composed profile with a row reported active
  // and zero L5X tools registered.
  const context = new Proxy({}, {
    get() {
      throw new Error('cannot get property "knowledgeRoot" without inject')
    },
  })
  const tools = docsTools(context)
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, L5X_DOCS_TOOL_NAME)
  const status = await tools[0].execute({ action: 'status' }, {})
  assert.equal(status.ok, true)
  assert.ok(Array.isArray(status.collections) && status.collections.length >= 5)
})

test('the generator output is deterministic and up to date', () => {
  const help = haveBothHelpTrees()
  const runGenerator = (extra) => {
    const result = spawnSync(process.execPath, [GENERATOR, ...extra], { cwd: REPO_ROOT, encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)
    return result.stdout
  }
  const checkArgs = help ? ['--check'] : ['--check', '--skip-help']
  assert.match(runGenerator(checkArgs), /l5x knowledge is up to date/u)

  const first = mkdtempSync(join(tmpdir(), 'l5x-knowledge-a-'))
  const second = mkdtempSync(join(tmpdir(), 'l5x-knowledge-b-'))
  try {
    const extra = help ? [] : ['--skip-help']
    runGenerator(['--out', first, ...extra])
    runGenerator(['--out', second, ...extra])
    const firstFiles = walk(first)
    const secondFiles = walk(second)
    assert.deepEqual(firstFiles, secondFiles)
    assert.ok(firstFiles.includes('instruction-versions.json') || !help)
    for (const file of firstFiles) {
      assert.equal(readFileSync(join(first, file)).equals(readFileSync(join(second, file))), true, `${file} is not deterministic`)
    }
  } finally {
    rmSync(first, { recursive: true, force: true })
    rmSync(second, { recursive: true, force: true })
  }
})
