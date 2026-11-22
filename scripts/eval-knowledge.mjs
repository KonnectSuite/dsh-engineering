/**
 * Knowledge-plane evaluation harness.
 *
 * Runs every product's committed goldens against the built docs tool and prints
 * a deterministic report. Thresholds are the release gate's; `--check` exits
 * non-zero when a product misses one.
 *
 * Usage:
 *   node scripts/eval-knowledge.mjs            # report only
 *   node scripts/eval-knowledge.mjs --check    # gate: exit 1 on a miss
 *   node scripts/eval-knowledge.mjs --product l5x
 *
 * The harness imports `packages/<product>/lib/docs.js` (build the packages
 * first) and calls the product's exported docs factory. It never writes to the
 * corpus and never touches the network.
 *
 * @module dsh-engineering/scripts/eval-knowledge
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Per-product configuration: the built module, the goldens file, and the gate thresholds. */
const PRODUCTS = [
  {
    id: 'l5x',
    module: 'packages/l5x/lib/docs.js',
    goldens: 'packages/l5x/knowledge/goldens.json',
    thresholds: { recallAt5: 0.95, mrrAt5: 0.85, ndcgAt10: 0.85 },
  },
  {
    id: 'ftview',
    module: 'packages/ftview/lib/docs.js',
    goldens: 'packages/ftview/knowledge/goldens.json',
    thresholds: { recallAt5: 0.9, mrrAt5: 0.8, ndcgAt10: 0.8 },
  },
  {
    id: 'migration',
    module: 'packages/migration/lib/docs.js',
    goldens: 'packages/migration/knowledge/goldens.json',
    thresholds: { recallAt5: 0.85, mrrAt5: 0.75, ndcgAt10: 0.75 },
  },
  {
    id: 'plc5',
    module: 'packages/plc5/lib/docs.js',
    goldens: 'packages/plc5/knowledge/goldens.json',
    thresholds: { recallAt5: 0.85, mrrAt5: 0.75, ndcgAt10: 0.75 },
  },
  {
    id: 'slc',
    module: 'packages/slc/lib/docs.js',
    goldens: 'packages/slc/knowledge/goldens.json',
    thresholds: { recallAt5: 0.85, mrrAt5: 0.75, ndcgAt10: 0.75 },
  },
]

/** The fixed acceptance numbers every product must also meet. */
const GLOBAL = {
  exact: 1.0,
  noMatch: 0.8,
  revisionSensitivity: 1.0,
  searchP95Ms: 150,
  readP95Ms: 120,
  maxHits: 8,
  maxReadChars: 8000,
  minCases: 15,
}

const args = process.argv.slice(2)
const CHECK = args.includes('--check')
const PRODUCT_FILTER = valueAfter('--product')
const OUT = join(ROOT, 'artifacts', 'eval-knowledge.json')

function valueAfter(flag) {
  const index = args.indexOf(flag)
  return index >= 0 && index + 1 < args.length ? args[index + 1] : undefined
}

function fail(message) {
  process.stderr.write(`eval-knowledge: ${message}\n`)
  process.exit(1)
}

/** Import a product's docs module and return its one docs tool definition. */
async function loadDocsTool(product) {
  const modulePath = join(ROOT, product.module)
  if (!existsSync(modulePath)) throw new Error(`missing built module ${product.module} (run the package build)`)
  const module = await import(pathToFileURL(modulePath).href)
  const factory = pickFactory(module)
  if (factory === undefined) throw new Error(`no docs factory exported by ${product.module}`)
  let created
  try {
    created = factory.length === 0 ? factory() : factory({})
  } catch (firstError) {
    try {
      created = factory({} )
    } catch {
      throw firstError
    }
  }
  const definitions = await created
  const list = Array.isArray(definitions) ? definitions : [definitions]
  const tool = list.find(entry => typeof entry?.name === 'string' && entry.name.endsWith('_docs'))
  if (tool === undefined) throw new Error(`${product.module} returned no *_docs tool definition`)
  if (typeof tool.execute !== 'function') throw new Error(`${tool.name} has no execute function`)
  return tool
}

function pickFactory(module) {
  for (const name of ['docsTools', 'default', 'docsTool']) {
    if (typeof module[name] === 'function') return module[name]
  }
  for (const value of Object.values(module)) {
    if (typeof value === 'function' && /docs/i.test(value.name)) return value
  }
  return undefined
}

function readGoldens(product) {
  const path = join(ROOT, product.goldens)
  if (!existsSync(path)) throw new Error(`missing goldens ${product.goldens}`)
  const parsed = JSON.parse(readFileSync(path, 'utf8'))
  if (parsed?.schema !== 1 || !Array.isArray(parsed.cases)) throw new Error(`${product.goldens} is not a schema-1 goldens file`)
  return parsed.cases
}

async function call(tool, request) {
  const started = process.hrtime.bigint()
  const response = await tool.execute(request)
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6
  return { response, elapsedMs }
}

function hitIds(response) {
  if (response?.ok !== true || !Array.isArray(response.hits)) return []
  return response.hits.map(hit => String(hit.id))
}

function hitRevisions(response) {
  if (response?.ok !== true || !Array.isArray(response.hits)) return []
  return response.hits.map(hit => (typeof hit.revision === 'string' ? hit.revision : null))
}

function recallAt(ids, expected, k) {
  if (expected.length === 0) return null
  const top = new Set(ids.slice(0, k))
  return expected.filter(id => top.has(id)).length / expected.length
}

function mrrAt(ids, expected, k) {
  if (expected.length === 0) return null
  const index = ids.slice(0, k).findIndex(id => expected.includes(id))
  return index < 0 ? 0 : 1 / (index + 1)
}

function ndcgAt(ids, expected, k) {
  if (expected.length === 0) return null
  const top = ids.slice(0, k)
  let dcg = 0
  for (let i = 0; i < top.length; i += 1) {
    if (expected.includes(top[i])) dcg += 1 / Math.log2(i + 2)
  }
  const ideal = expected
    .map(() => 1)
    .slice(0, Math.min(expected.length, k))
    .reduce((sum, _, i) => sum + 1 / Math.log2(i + 2), 0)
  return ideal === 0 ? 0 : dcg / ideal
}

function p95(values) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
  return sorted[index]
}

function average(values) {
  const usable = values.filter(value => typeof value === 'number')
  if (usable.length === 0) return null
  return usable.reduce((sum, value) => sum + value, 0) / usable.length
}

/** Score one product's goldens and return { summary, cases, failures }. */
async function evaluateProduct(product, tool, cases) {
  const perCase = []
  const searchLatencies = []
  const readLatencies = []
  const failures = []
  const exactHits = []
  const exactTotal = []
  const noMatchHits = []
  const noMatchTotal = []
  const revisionHits = []
  const revisionTotal = []
  const readOk = []
  const readTotal = []
  const capOk = []

  for (const item of cases) {
    const expect = Array.isArray(item.expect) ? item.expect.map(String) : []
    const revision = typeof item.revision === 'string' ? item.revision : undefined
    const record = { id: String(item.id), kind: String(item.kind), expect, ok: false, ids: [], detail: '' }
    const kind = String(item.kind)

    if (kind === 'no-match') {
      noMatchTotal.push(1)
      const { response, elapsedMs } = await call(tool, { action: 'search', query: String(item.query) })
      searchLatencies.push(elapsedMs)
      const ids = hitIds(response)
      const success = response?.ok === true && ids.length === 0
      if (success) noMatchHits.push(1)
      record.ok = success
      record.ids = ids
      record.detail = success ? 'empty answer' : `expected no hits, got ${ids.length}`
      if (!success) failures.push(`${product.id}/${item.id}: ${record.detail}`)
      perCase.push(record)
      continue
    }

    if (kind === 'contents') {
      const { response } = await call(tool, { action: 'contents' })
      const ids = response?.ok === true && Array.isArray(response.collections)
        ? response.collections.map(collection => String(collection.id))
        : []
      const success = response?.ok === true && expect.every(id => ids.includes(id))
      record.ok = success
      record.ids = ids
      record.detail = `collections=${ids.join(',')}`
      if (!success) failures.push(`${product.id}/${item.id}: contents missed (expected ${expect.join(',')}; got ${ids.join(',')})`)
      perCase.push(record)
      continue
    }

    if (kind === 'exact') {
      exactTotal.push(1)
      const term = typeof item.term === 'string' ? item.term : String(item.query)
      const revisionArg = revision === undefined ? {} : { revision }
      const lookup = await call(tool, { action: 'lookup', term, ...revisionArg })
      const search = await call(tool, { action: 'search', query: String(item.query), limit: GLOBAL.maxHits, ...revisionArg })
      searchLatencies.push(search.elapsedMs)
      const lookupIds = lookup.response?.ok === true && Array.isArray(lookup.response.matches)
        ? lookup.response.matches.map(match => String(match.id))
        : []
      const searchIds = hitIds(search.response)
      const firstExact = search.response?.ok === true
        && Array.isArray(search.response.hits)
        && search.response.hits[0]?.exact === true
        && expect.includes(String(search.response.hits[0]?.id))
      const success = expect.length === 0
        ? lookupIds.length === 0
        : expect.includes(lookupIds[0] ?? '') || firstExact
      if (success) exactHits.push(1)
      record.ok = success
      record.ids = searchIds
      record.detail = `lookup=${lookupIds.slice(0, 3).join(',')} search=${searchIds.slice(0, 3).join(',')}`
      if (!success) failures.push(`${product.id}/${item.id}: exact layer missed (${record.detail})`)
      perCase.push(record)
      continue
    }

    // answer / revision-aware answer
    const request = { action: 'search', query: String(item.query), limit: GLOBAL.maxHits, ...(revision === undefined ? {} : { revision }) }
    const { response, elapsedMs } = await call(tool, request)
    searchLatencies.push(elapsedMs)
    const ids = hitIds(response)
    const recall = recallAt(ids, expect, 5)
    const mrr = mrrAt(ids, expect, 5)
    const ndcg = ndcgAt(ids, expect, 10)
    const ok = response?.ok === true && recall !== null && recall >= product.thresholds.recallAt5
    record.ok = ok
    record.ids = ids
    record.recallAt5 = recall
    record.mrrAt5 = mrr
    record.ndcgAt10 = ndcg
    record.detail = `recall@5=${recall === null ? 'n/a' : recall.toFixed(2)} mrr@5=${mrr === null ? 'n/a' : mrr.toFixed(2)}`
    // A single case below the per-case line is reported in the record and in
    // the case table, but the gate is the product aggregate below: one weaker
    // case among a corpus of many is not a release failure on its own.
    record.caseBelowLine = !ok
    if (revision !== undefined) {
      revisionTotal.push(1)
      const revisions = hitRevisions(response)
      const allMatch = response?.ok === true && revisions.every(value => value === null || value === revision)
      if (allMatch) revisionHits.push(1)
    }
    perCase.push(record)
  }

  // Read one golden page per kind=read case and measure the one-page / cap contract.
  for (const item of cases.filter(entry => entry.kind === 'read')) {
    readTotal.push(1)
    const { response, elapsedMs } = await call(tool, { action: 'read', id: String(item.id ?? item.page ?? item.expect?.[0] ?? '') })
    readLatencies.push(elapsedMs)
    const text = typeof response?.text === 'string' ? response.text : ''
    const ok = response?.ok === true && typeof response.id === 'string' && text.length > 0 && text.length <= GLOBAL.maxReadChars
    if (ok) readOk.push(1)
    if (!ok) failures.push(`${product.id}/${item.id}: read contract failed`)
  }

  // The hit cap is enforced at the tool boundary, not just advertised.
  const capProbe = await call(tool, { action: 'search', query: cases[0]?.query ?? 'instruction', limit: 99 })
  searchLatencies.push(capProbe.elapsedMs)
  const capPass = capProbe.response?.ok !== true || hitIds(capProbe.response).length <= GLOBAL.maxHits
  capOk.push(capPass ? 1 : 0)
  if (!capPass) failures.push(`${product.id}: search returned more than ${GLOBAL.maxHits} hits`)

  const summary = {
    product: product.id,
    cases: cases.length,
    recallAt5: average(perCase.filter(entry => entry.kind === 'answer' || entry.kind === 'revision').map(entry => entry.recallAt5)),
    mrrAt5: average(perCase.filter(entry => entry.kind === 'answer' || entry.kind === 'revision').map(entry => entry.mrrAt5)),
    ndcgAt10: average(perCase.filter(entry => entry.kind === 'answer' || entry.kind === 'revision').map(entry => entry.ndcgAt10)),
    exact: exactTotal.length === 0 ? null : exactHits.length / exactTotal.length,
    noMatch: noMatchTotal.length === 0 ? null : noMatchHits.length / noMatchTotal.length,
    revisionSensitivity: revisionTotal.length === 0 ? null : revisionHits.length / revisionTotal.length,
    read: readTotal.length === 0 ? null : readOk.length / readTotal.length,
    hitCap: capOk.every(Boolean),
    searchP95Ms: Math.round(p95(searchLatencies) * 100) / 100,
    readP95Ms: Math.round(p95(readLatencies) * 100) / 100,
    thresholds: product.thresholds,
  }

  const misses = []
  if (summary.cases < GLOBAL.minCases) misses.push(`only ${summary.cases} cases (need ${GLOBAL.minCases})`)
  if (summary.recallAt5 !== null && summary.recallAt5 < product.thresholds.recallAt5) misses.push(`recall@5 ${summary.recallAt5.toFixed(3)} < ${product.thresholds.recallAt5}`)
  if (summary.mrrAt5 !== null && summary.mrrAt5 < product.thresholds.mrrAt5) misses.push(`mrr@5 ${summary.mrrAt5.toFixed(3)} < ${product.thresholds.mrrAt5}`)
  if (summary.ndcgAt10 !== null && summary.ndcgAt10 < product.thresholds.ndcgAt10) misses.push(`ndcg@10 ${summary.ndcgAt10.toFixed(3)} < ${product.thresholds.ndcgAt10}`)
  if (summary.exact !== null && summary.exact < GLOBAL.exact) misses.push(`exact ${summary.exact.toFixed(3)} < ${GLOBAL.exact}`)
  if (summary.noMatch !== null && summary.noMatch < GLOBAL.noMatch) misses.push(`no-match ${summary.noMatch.toFixed(3)} < ${GLOBAL.noMatch}`)
  if (summary.revisionSensitivity !== null && summary.revisionSensitivity < GLOBAL.revisionSensitivity) misses.push(`revision sensitivity ${summary.revisionSensitivity.toFixed(3)} < ${GLOBAL.revisionSensitivity}`)
  if (summary.searchP95Ms > GLOBAL.searchP95Ms) misses.push(`search p95 ${summary.searchP95Ms}ms > ${GLOBAL.searchP95Ms}ms`)
  if (summary.readP95Ms > GLOBAL.readP95Ms) misses.push(`read p95 ${summary.readP95Ms}ms > ${GLOBAL.readP95Ms}ms`)
  if (!summary.hitCap) misses.push('hit cap not enforced')

  return { summary, cases: perCase, failures, misses }
}

/** A stable digest over what the calls answered, not how fast. */
function digest(runs) {
  const shape = runs.map(run => ({
    product: run.summary.product,
    cases: run.cases.map(entry => ({ id: entry.id, ids: entry.ids, ok: entry.ok })),
  }))
  return createHash('sha256').update(JSON.stringify(shape)).digest('hex')
}

async function main() {
  const selected = PRODUCT_FILTER === undefined ? PRODUCTS : PRODUCTS.filter(product => product.id === PRODUCT_FILTER)
  if (selected.length === 0) fail(`unknown product "${PRODUCT_FILTER}" (choices: ${PRODUCTS.map(product => product.id).join(', ')})`)

  const runs = []
  const problems = []
  const firstDigestRuns = []

  for (const product of selected) {
    let tool
    try {
      tool = await loadDocsTool(product)
    } catch (error) {
      problems.push(`${product.id}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    let cases
    try {
      cases = readGoldens(product)
    } catch (error) {
      problems.push(`${product.id}: ${error instanceof Error ? error.message : String(error)}`)
      continue
    }
    const run = await evaluateProduct(product, tool, cases)
    runs.push(run)
    firstDigestRuns.push(run)
    problems.push(...run.failures, ...run.misses.map(miss => `${product.id}: ${miss}`))
  }

  // Determinism: run the same calls again and compare the answer digest.
  const secondDigestRuns = []
  for (const product of selected) {
    if (!runs.some(run => run.summary.product === product.id)) continue
    try {
      const tool = await loadDocsTool(product)
      const cases = readGoldens(product)
      secondDigestRuns.push(await evaluateProduct(product, tool, cases))
    } catch {
      // The first pass already reported the import/goldens problem.
    }
  }
  const determinism = secondDigestRuns.length === runs.length && runs.length > 0
    ? digest(firstDigestRuns) === digest(secondDigestRuns)
    : null
  if (determinism === false) problems.push('determinism: two runs answered differently')

  const report = {
    schema: 1,
    generatedBy: 'scripts/eval-knowledge.mjs',
    thresholdSource: 'plan Part V.3 / gate item 5, adapted to the retired ECAD row',
    determinism,
    runs: runs.map(run => run.summary),
    cases: runs.flatMap(run => run.cases),
    problems,
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  process.stdout.write(`${JSON.stringify(report.runs, null, 2)}\n`)
  process.stdout.write(`determinism: ${determinism === null ? 'not measured' : determinism ? 'pass' : 'FAIL'}\n`)
  process.stdout.write(`report: ${OUT}\n`)

  if (problems.length > 0) {
    process.stderr.write(`${problems.length} problem(s):\n${problems.map(problem => `  - ${problem}`).join('\n')}\n`)
    if (CHECK) process.exit(1)
  } else {
    process.stdout.write('all products pass\n')
  }
}

main().catch(error => fail(error instanceof Error ? error.stack ?? error.message : String(error)))
