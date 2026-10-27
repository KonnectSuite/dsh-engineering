import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCorpus, checkCurrent } from '../scripts/gen-resources.mjs'
import { referenceTool } from '../packages/resources/src/tools.ts'
import * as skill from '../packages/resources/src/skill.ts'

test('the committed corpus index is current', () => {
  const result = checkCurrent()
  assert.equal(result.ok, true, result.reason)
  assert.ok(result.pages >= 30, `expected at least 30 pages, got ${result.pages}`)
})

test('ids and rule ids are unique across the corpus', () => {
  const { problems, pages } = buildCorpus()
  assert.deepEqual(problems, [])
  const ids = new Set(pages.map(page => page.id))
  assert.equal(ids.size, pages.length)
  const rules = new Set(pages.flatMap(page => page.rules))
  assert.ok(rules.size >= 60, `expected a rule per topic, got ${rules.size}`)
})

test('every page has a provenance and an applicability list', () => {
  const { pages } = buildCorpus()
  for (const page of pages) {
    assert.ok(page.basis.length > 0, `${page.id} has no basis`)
    assert.ok(page.applies_to.length > 0, `${page.id} has no applies_to`)
  }
})

test('a topic query returns the page that owns it', async () => {
  const stateMachine = await referenceTool.execute({ query: 'state machine' })
  assert.ok(stateMachine.data.hits.some(hit => hit.id === 'iec-state-machines'))

  const alarmColour = await referenceTool.execute({ query: 'alarm' })
  assert.ok(alarmColour.data.hits.some(hit => hit.domain === 'view'))

  const naming = await referenceTool.execute({ query: 'tag naming' })
  assert.ok(naming.data.hits.some(hit => hit.id === 'rockwell-tag-naming' || hit.id === 'craft-naming'))
})

test('a page answer carries its rules and body, without front matter', async () => {
  const page = await referenceTool.execute({ id: 'view-hpm-01' })
  assert.match(page.data.markdown, /VIEW-HPM-01/u)
  assert.doesNotMatch(page.data.markdown, /^---/u)
  assert.ok(page.data.rules.includes('VIEW-HPM-01'))
  assert.ok(page.data.corpus_digest.length === 64)
})

test('an unknown page returns a repairable failure', async () => {
  const missing = await referenceTool.execute({ id: 'no-such-page' })
  assert.equal(missing.error.code, 'COMPONENT_NOT_FOUND')
  assert.match(missing.error.fix, /engineering_reference/u)
})

test('the contents lists every domain', async () => {
  const contents = await referenceTool.execute({})
  assert.deepEqual(contents.data.domains, ['iec', 'rockwell', 'yaskawa', 'view', 'optix', 'craft'])
})

test('the standards skill mounts through the skills service', () => {
  assert.deepEqual(skill.inject, ['skills'])
  const registered = []
  assert.equal(skill.registerSkill({ register: definition => registered.push(definition) }), true)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'engineering-standards')
  assert.ok(registered[0].content.length > 200, 'the skill body is read from SKILL.md')
})