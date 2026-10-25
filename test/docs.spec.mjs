import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { load } from 'js-yaml'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('package.json'))
const patch = load(read('cordis.patch.yml'))
const readme = read('README.md')
const changelog = read('CHANGELOG.md')

const locales = ['en', 'zh'].map(name => ({ name, value: JSON.parse(read(`locale/${name}.json`)) }))
const policy = patch[0]

const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix === '' ? key : `${prefix}.${key}`
  return child !== null && typeof child === 'object' ? keys(child, path) : [path]
})

/**
 * Read the README's policy table as data: one row per skill, with the tool
 * prefixes that skill governs. Section headings are level two; the table is
 * the first one under "What the policy changes".
 * @returns {{skill: string, prefixes: string[]}[]} rows of the policy table.
 */
function policyTable() {
  const section = readme.split(/^## /mu).find(part => part.startsWith('What the policy changes'))
  assert.ok(section, 'README has no "What the policy changes" section')
  const rows = section.split(/\r?\n/u)
    .filter(line => line.trimStart().startsWith('|'))
    .map(line => line.split('|').slice(1, -1).map(cell => cell.trim()))
    .filter(cells => cells.length >= 2 && cells[0] !== 'Skill' && !cells[0].startsWith('-'))
    .map(cells => ({
      skill: cells[0].replaceAll('`', ''),
      prefixes: [...cells[1].matchAll(/`([a-z0-9_]+)\*?`/gu)].map(match => match[1]),
    }))
    .filter(row => row.prefixes.length > 0)
  assert.ok(rows.length > 0, 'README policy table has no skill rows')
  return rows
}

test('the declared bundle patch exists', () => {
  assert.ok(manifest.dsh?.bundle?.patch, 'package.json declares no dsh.bundle.patch')
  assert.ok(existsSync(new URL(`../${manifest.dsh.bundle.patch}`, import.meta.url)))
})

test('the README policy table lists exactly the patch capabilities', () => {
  const table = policyTable()
  const linked = table.filter(row => row.skill !== '—')
  const unlinked = table.filter(row => row.skill === '—')
  assert.deepEqual(linked.map(row => row.skill), policy.config.toolPolicy.capabilities.map(row => row.skill),
    'README policy table skills disagree with cordis.patch.yml')
  assert.deepEqual(linked.flatMap(row => row.prefixes).sort(),
    policy.config.toolPolicy.capabilities.flatMap(row => row.prefixes).sort(),
    'README policy table prefixes disagree with cordis.patch.yml')
  const patched = policy.config.toolPolicy.capabilities.flatMap(row => row.prefixes)
  for (const prefix of unlinked.flatMap(row => row.prefixes)) {
    assert.ok(!patched.includes(prefix), `README documents ${prefix} as unlinked but the patch links it`)
  }
})

test('every patched row id appears in the README', () => {
  for (const entry of patch) {
    if (entry.id !== undefined) assert.ok(readme.includes(entry.id), `README omits row id ${entry.id}`)
    for (const row of entry.insert ?? []) assert.ok(readme.includes(row.id), `README omits row id ${row.id}`)
  }
})

test('every inserted package is a declared dependency', () => {
  const packageOf = name => name.startsWith('@') ? name.split('/').slice(0, 2).join('/') : name.split('/')[0]
  for (const entry of patch) {
    for (const row of entry.insert ?? []) {
      const name = packageOf(row.name)
      assert.ok(manifest.dependencies?.[name] || name === manifest.name, `${row.name} is inserted but ${name} is not declared in dependencies`)
    }
  }
})

test('the package version has a changelog heading', () => {
  assert.match(changelog, new RegExp(`^## \\[${manifest.version.replaceAll('.', '\\.')}\\]`, 'mu'),
    `CHANGELOG.md has no [${manifest.version}] heading`)
})

test('the locale files agree on keys', () => {
  const [english, chinese] = locales
  assert.deepEqual(keys(chinese.value).sort(), keys(english.value).sort(),
    'locale/en.json and locale/zh.json declare different keys')
})
