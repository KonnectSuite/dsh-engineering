/**
 * The component contract: one manifest, checked against the patch, the packages,
 * the generated tool inventory, the skills and the README.
 *
 * Adding a component is a data change plus the files it names. These tests are the
 * part that notices when one of those files, rows or numbers was forgotten.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { load } from 'js-yaml'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const exists = path => existsSync(new URL(`../${path}`, import.meta.url))

const catalog = JSON.parse(read('components.json'))
const components = catalog.components
const inventory = JSON.parse(read('docs/reference/tools.json'))
const tools = new Set(inventory.tools)
const patch = load(read('cordis.patch.yml'))
const rows = patch.flatMap(entry => entry.insert ?? [])
const readme = read('README.md')

const KINDS = new Set(['product', 'support', 'surface'])
const CAPABILITIES = new Set(['offline-file', 'live-ide', 'gateway-api', 'none'])
const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
const packagesOf = component => Array.isArray(component.package) ? component.package : [component.package]

/** The registered guidance body: SKILL.md with its frontmatter removed. */
const bodyOf = raw => raw.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, '')

/** The skill name a package registers, read from its SKILL constant. */
function registeredSkillName(packagePath) {
  const source = read(`${packagePath}/src/skill.ts`)
  const block = /export const SKILL = \{([\s\S]*?)\n\}/u.exec(source)
  assert.ok(block, `${packagePath}/src/skill.ts has no SKILL constant`)
  const name = /name:\s*'([^']+)'/u.exec(block[1] ?? '')
  assert.ok(name, `${packagePath}/src/skill.ts SKILL has no name`)
  return name[1]
}

test('the manifest covers every patch row exactly once', () => {
  const ids = components.map(component => component.id)
  assert.equal(new Set(ids).size, ids.length, 'components.json repeats an id')
  assert.deepEqual([...ids].sort(), rows.map(row => row.id).sort(), 'the manifest and cordis.patch.yml disagree on the row set')
  for (const component of components) {
    assert.ok(KINDS.has(component.kind), `${component.id} has an unknown kind ${component.kind}`)
    assert.ok(CAPABILITIES.has(component.capability), `${component.id} has an unknown capability ${component.capability}`)
    const row = rows.find(candidate => candidate.id === component.id)
    assert.equal(component.rowName, row?.name, `${component.id} rowName does not match the patch row`)
    if (component.kind === 'product') assert.notEqual(component.capability, 'none', `${component.id} is a product with no capability class`)
  }
})

test('every component names files that exist and documents it owns', () => {
  for (const component of components) {
    for (const path of packagesOf(component)) assert.ok(exists(path), `${component.id}: package ${path} does not exist`)
    if (component.entry !== null) assert.ok(exists(component.entry), `${component.id}: entry ${component.entry} does not exist`)
    assert.ok(component.docs.length > 0, `${component.id} owns no document`)
    for (const doc of component.docs) {
      assert.ok(exists(doc), `${component.id}: document ${doc} does not exist`)
      assert.ok(readme.includes(doc), `${component.id}: document ${doc} is not linked from the README`)
    }
  }
})

test('every row resolves to a declared bundle export', () => {
  const manifest = JSON.parse(read('package.json'))
  for (const component of components) {
    if (component.entry === null) continue
    const key = component.rowName === manifest.name ? '.' : `./${component.rowName.split('/').pop()}`
    const exported = manifest.exports?.[key]
    assert.ok(exported, `${component.id}: package.json declares no export ${key}`)
    const target = typeof exported === 'string' ? exported : exported.default
    assert.equal(target, `./${component.entry}`, `${component.id}: export ${key} points at ${target} rather than ./${component.entry}`)
  }
})

test('the assembler vendors exactly the components the manifest marks', () => {
  const source = read('scripts/assemble.mjs')
  const list = /export const COMPONENTS = \[([\s\S]*?)\]/u.exec(source)
  assert.ok(list, 'scripts/assemble.mjs has no COMPONENTS list')
  const vendored = [...list[1].matchAll(/"([^"]+)"/gu)].map(match => match[1]).sort()
  // The assembler names a component by its package directory; the manifest id is
  // the row id, and the two differ for engineering-resources (package `resources`).
  const expected = components.filter(component => component.vendor === true)
    .map(component => packagesOf(component)[0].split('/').pop())
    .sort()
  assert.deepEqual(vendored, expected, 'scripts/assemble.mjs and components.json disagree on which components are vendored')
})

test('every skill is registered, unique and inside its budget', () => {
  const names = new Set()
  const files = new Set()
  for (const component of components.filter(candidate => candidate.skill !== null)) {
    const skill = component.skill
    assert.ok(!names.has(skill.name), `two components register the skill ${skill.name}`)
    names.add(skill.name)
    assert.ok(!files.has(skill.file), `two components read the skill body ${skill.file}`)
    files.add(skill.file)
    assert.ok(exists(skill.file), `${component.id}: skill file ${skill.file} does not exist`)
    const body = bodyOf(read(skill.file))
    assert.ok(body.length > 500, `${component.id}: skill body is only ${body.length} characters`)
    if (skill.budget !== null) assert.ok(body.length <= skill.budget, `${component.id}: skill body ${body.length} exceeds its ${skill.budget} budget`)
    if (component.vendored !== true) assert.equal(skill.name, registeredSkillName(component.package), `${component.id}: manifest skill ${skill.name} is not the name ${component.package}/src/skill.ts registers`)
  }
})

test('no skill names a tool that no longer exists', () => {
  for (const component of components) {
    if (component.skill === null || component.vendored === true) continue
    const allowed = new Set(component.skill.allow ?? [])
    const body = bodyOf(read(component.skill.file))
    const cited = [...new Set([...body.matchAll(/`([a-z][a-z0-9]*(?:_[a-z0-9]+)+)`/gu)].map(match => match[1]))]
    const stale = cited.filter(word => !tools.has(word) && !allowed.has(word))
    assert.deepEqual(stale, [], `${component.id}: skill cites words that are neither tools nor allowed names: ${stale.join(', ')}`)
  }
})

test('the tool inventory and the component table agree', () => {
  const groups = inventory.groups
  const productTools = new Map()
  for (const group of groups) productTools.set(group.product, (productTools.get(group.product) ?? 0) + group.tools.length)
  assert.equal([...productTools.values()].reduce((total, count) => total + count, 0), inventory.tools.length, 'the group counts do not add up to the inventory')

  const claimed = new Map()
  for (const component of components) {
    if (component.tools.product === null || component.tools.inReference === false) continue
    assert.ok(!claimed.has(component.tools.product), `two components claim the tool product ${component.tools.product}`)
    claimed.set(component.tools.product, component)
  }
  for (const product of productTools.keys()) assert.ok(claimed.has(product), `the inventory has tools for ${product}, and no component claims them`)
  for (const component of components) {
    if (component.tools.product === null || component.tools.inReference === false) continue
    const count = productTools.get(component.tools.product)
    assert.ok(count !== undefined, `${component.id} claims the product ${component.tools.product}, which has no tool group`)
    assert.equal(component.tools.count, count, `${component.id} declares ${component.tools.count} tools and registers ${count}`)
  }

  const vendored = components.filter(component => component.tools.inReference === false).reduce((total, component) => total + component.tools.count, 0)
  const total = inventory.tools.length + vendored
  const stated = /·\s*(\d+)\s*tools\s*·/u.exec(readme)
  assert.ok(stated, 'the README states no tool count')
  assert.equal(Number(stated[1]), total, `the README says ${stated[1]} tools and the inventory plus vendored components is ${total}`)
})

test('every component with tools has a README row with its count', () => {
  for (const component of components) {
    if (component.tools.count === 0) continue
    const row = new RegExp(`\\|\\s*\\*\\*${escape(component.title)}\\*\\*\\s*\\|\\s*(\\d+)`, 'u').exec(readme)
    assert.ok(row, `the README table has no row for ${component.title}`)
    assert.equal(Number(row[1]), component.tools.count, `the README says ${row[1]} for ${component.title} and the manifest says ${component.tools.count}`)
  }
})

test('a vendored component whose tools are not generated says so in the README', () => {
  const gaps = components.filter(component => component.tools.inReference === false && component.tools.count > 0)
  if (gaps.length === 0) return
  assert.match(readme, /vendored Optix tools/iu, 'the README does not state that vendored tools are absent from the generated reference')
})

test('every probe and gate names a tool that exists', () => {
  for (const component of components) {
    if (component.tools.inReference === false) continue
    if (component.probe !== null) assert.ok(tools.has(component.probe), `${component.id}: probe ${component.probe} is not a registered tool`)
    if (component.gate !== null) {
      assert.ok(tools.has(component.gate.tool), `${component.id}: gate ${component.gate.tool} is not a registered tool`)
      assert.ok(component.gate.why.length > 20, `${component.id}: gate ${component.gate.tool} does not say what it proves`)
    }
  }
})

test('the README links the component contract', () => {
  assert.ok(readme.includes('docs/reference/components.md'), 'the README does not link the component contract')
})
