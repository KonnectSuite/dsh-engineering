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
  assert.deepEqual(contents.data.domains, ['iec', 'rockwell', 'migration', 'yaskawa', 'view', 'optix', 'hmi', 'craft'])
})

test('the product-neutral design pages answer a design query', async () => {
  const targets = await referenceTool.execute({ query: 'touch target size' })
  assert.ok(targets.data.hits.some(hit => hit.id === 'hmi-targets-and-labels'), 'no page owns touch target sizing')

  const contrast = await referenceTool.execute({ query: 'text contrast ratio' })
  assert.ok(contrast.data.hits.some(hit => hit.id === 'hmi-colour-and-contrast'), 'no page owns the contrast numbers')

  const page = await referenceTool.execute({ id: 'hmi-colour-and-contrast' })
  assert.ok(page.data.rules.includes('HMI-CONTRAST-01'))
  assert.match(page.data.markdown, /4\.5:1/u)
})

test('the general HMI/SCADA baseline is reachable and states the precedence', async () => {
  const contents = await referenceTool.execute({})
  const ids = contents.data.pages.map(page => page.id)
  for (const id of ['hmi-isa101-baseline', 'hmi-screen-architecture', 'hmi-standards-precedence']) {
    assert.ok(ids.includes(id), `the corpus is missing ${id}`)
  }

  const overview = await referenceTool.execute({ query: 'high performance hmi' })
  assert.ok(overview.data.hits.some(hit => hit.id === 'hmi-isa101-baseline'), 'no page answers for high-performance HMI')

  const architecture = await referenceTool.execute({ query: 'screen hierarchy navigation' })
  assert.ok(architecture.data.hits.some(hit => hit.id === 'hmi-screen-architecture'), 'no page owns screen architecture')

  const precedence = await referenceTool.execute({ id: 'hmi-standards-precedence' })
  assert.ok(precedence.data.rules.includes('HMI-PREC-01'))
  assert.match(precedence.data.markdown, /the user's explicit instruction/u)
  assert.match(precedence.data.markdown, /engineering_profile/u)
})

test('the Rockwell process style guide is the named vendor layer', async () => {
  const found = await referenceTool.execute({ query: 'rockwell hmi style guide' })
  assert.ok(found.data.hits.some(hit => hit.id === 'hmi-rockwell-process-style-guide'), 'no page answers for the Rockwell style guide')

  const page = await referenceTool.execute({ id: 'hmi-rockwell-process-style-guide' })
  assert.ok(page.data.rules.includes('HMI-RW-01'))
  assert.ok(page.data.rules.length === 8, `expected eight rules, got ${page.data.rules.length}`)
  assert.ok(page.data.basis.some(entry => /PROCES-WP023/u.test(entry)), 'the page does not cite the publication')
  assert.match(page.data.markdown, /#E0E0E0/u)
  assert.match(page.data.markdown, /#E22028/u)
  assert.match(page.data.markdown, /literature\.rockwellautomation\.com/u)

  const precedence = await referenceTool.execute({ id: 'hmi-standards-precedence' })
  assert.match(precedence.data.markdown, /hmi-rockwell-process-style-guide/u, 'precedence does not name the vendor layer')
})

test('the engagement order is reachable and says the machine is not the brief', async () => {
  const order = await referenceTool.execute({ query: 'start from standards not the machine' })
  assert.ok(order.data.hits.some(hit => hit.id === 'craft-engagement-order'), 'no page owns the engagement order')

  const page = await referenceTool.execute({ id: 'craft-engagement-order' })
  assert.deepEqual(page.data.rules, ['CRAFT-ORD-01', 'CRAFT-ORD-02', 'CRAFT-ORD-03', 'CRAFT-ORD-04'])
  assert.match(page.data.markdown, /An inventory tells you what exists; the brief and the standard tell you what to make/u)
  assert.match(page.data.markdown, /CRAFT-ORD-01/u)

  const contents = await referenceTool.execute({})
  assert.ok(contents.data.pages.some(entry => entry.id === 'craft-engagement-order'))
  assert.ok(contents.data.domains.includes('craft'))
})

test('the standards skill mounts through the skills service', () => {
  assert.deepEqual(skill.inject, ['skills'])
  const registered = []
  assert.equal(skill.registerSkill({ register: definition => registered.push(definition) }), true)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].name, 'engineering-standards')
  assert.ok(registered[0].content.length > 200, 'the skill body is read from SKILL.md')
})