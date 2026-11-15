/**
 * The pinned NetLogic snapshot and the tool that reads it.
 *
 * The snapshot is generated (`pnpm netlogic:sync`), so these tests are the only
 * thing that notices a half-written vendor tree or a page the index forgot.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { apply, answer, definition, SKILL, dataDirectory, loadSnapshot } from '../entries/netlogic.js'

const root = new URL('../', import.meta.url)
const netlogic = new URL('../packages/optix/netlogic/', import.meta.url)

test('the snapshot index covers every vendored page', () => {
  const { index, source } = loadSnapshot()
  const pages = readdirSync(new URL('pages/', netlogic)).filter(name => name.endsWith('.md')).sort()
  assert.equal(index.length, pages.length, 'index rows and page files disagree')
  assert.equal(source.pages, pages.length)
  assert.match(source.commit, /^[0-9a-f]{40}$/u)
  for (const row of index) {
    assert.ok(pages.includes(`${row.slug}.md`), `index row ${row.slug} has no page`)
    assert.ok(['normal', 'advanced', 'unsupported'].includes(row.risk), `${row.slug} has risk ${row.risk}`)
    assert.ok(row.title.length > 0 && row.section.length > 0, `${row.slug} has no title or section`)
    assert.ok(readFileSync(new URL(`pages/${row.slug}.md`, netlogic), 'utf8').trim().length > 0, `${row.slug} is empty`)
  }
})

test('the data directory is the vendored snapshot, not a checkout path', () => {
  assert.ok(dataDirectory()?.replaceAll('\\', '/').endsWith('netlogic'))
})

test('the contents list every page with its risk', () => {
  const result = answer({})
  assert.match(result.summary, /NetLogic pages/u)
  assert.equal(result.data.pages.length, loadSnapshot().index.length)
  assert.ok(result.data.pages.every(row => typeof row.slug === 'string' && typeof row.risk === 'string'))
  assert.equal(result.coverage.complete, false)
})

test('a query ranks pages by title, topic or symbol before body text', () => {
  const result = answer({ query: 'PeriodicTask' })
  assert.ok(result.data.hits.length > 0, 'no page matched a real symbol')
  assert.ok(result.data.hits.some(hit => hit.slug === 'netlogic-lifecycle'))
  assert.ok(result.data.hits.length <= 8)
})

test('a query with no match says so and suggests the contents', () => {
  const result = answer({ query: 'zzz-not-a-netlogic-topic' })
  assert.equal(result.data.hits.length, 0)
  assert.match(result.summary, /No NetLogic page matches/u)
  assert.ok(result.data.suggestion)
})

test('a request worded as a task routes to the page that answers it', () => {
  // The pages speak their own vocabulary ("Alarms"), so the router page carries the
  // phrases a request actually uses; without this the query would find nothing.
  const alarm = answer({ query: 'alarm banner' })
  assert.equal(alarm.data.hits[0].slug, 'index-by-task', 'the router page should answer a task-shaped request')
  assert.match(answer({ slug: 'index-by-task' }).data.markdown, /alarming\.md/u)

  const poll = answer({ query: 'a timer that polls' })
  assert.ok(poll.data.hits.some((hit) => ['threading', 'async-tasks', 'netlogic-lifecycle', 'index-by-task'].includes(hit.slug)))

  // A symbol still outranks prose: the honest answer for an API question is the page about that API.
  assert.equal(answer({ query: 'PeriodicTask' }).data.hits[0].slug, 'netlogic-lifecycle')
})

test('one page comes back verbatim, with its risk, commit and disclaimer', () => {
  const result = answer({ slug: 'netlogic-lifecycle' })
  assert.equal(result.data.slug, 'netlogic-lifecycle')
  assert.equal(result.data.risk, 'normal')
  assert.ok(result.data.markdown.length > 500)
  assert.ok(result.data.code_blocks > 0)
  assert.ok(result.data.disclaimer.includes('not be used in production'))
  assert.ok(result.data.source_url.includes(result.data.commit))
  assert.equal(result.coverage.complete, false)
})

test('an unsupported page keeps the repository warning', () => {
  const result = answer({ slug: 'manipulate-nodes' })
  assert.equal(result.data.risk, 'unsupported')
  assert.ok(result.data.markdown.toLowerCase().includes('not officially supported'))
})

test('a search limit is honoured and bounded', () => {
  assert.ok(answer({ query: 'sessions', limit: 2 }).data.hits.length <= 2)
})

test('a slug outside the snapshot is refused, never read', async () => {
  const traversal = await definition.execute({ slug: '../package' })
  assert.equal(traversal.error.code, 'INVALID_ARGUMENT')
  const missing = await definition.execute({ slug: 'no-such-page' })
  assert.equal(missing.error.code, 'COMPONENT_NOT_FOUND')
  assert.ok(missing.error.fix.includes('available slugs'))
})

test('apply registers the tool and the optix skill', () => {
  const tools = []
  const skills = []
  apply({
    tools: { register(definition) { tools.push(definition) } },
    get(name) { return name === 'skills' ? { register(skill) { skills.push(skill) } } : undefined },
  })
  assert.equal(tools.length, 1)
  assert.equal(tools[0].name, 'optix_netlogic')
  assert.equal(tools[0].parameters.required.length, 0)
  assert.equal(skills.length, 1)
  assert.equal(skills[0].name, SKILL.name)
  assert.equal(skills[0].source, 'custom')
  assert.equal(skills[0].provider, '@aryacode/dsh-engineering')
  assert.ok(skills[0].content.startsWith('---') === false, 'the skill content still carries frontmatter')
  assert.ok(existsSync(skills[0].path))
})

test('apply still registers the tool when the host has no skill service', () => {
  const tools = []
  apply({ tools: { register(definition) { tools.push(definition) } }, get() { return undefined } })
  assert.equal(tools.length, 1)
})
