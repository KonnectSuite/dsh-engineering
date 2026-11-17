/**
 * The component contract: one manifest, checked against the patch, the packages,
 * the generated tool inventory, the skills and the README.
 *
 * Adding a component is a data change plus the files it names. These tests are the
 * part that notices when one of those files, rows or numbers was forgotten.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/** Every file under a directory, skipping what a package generates for itself. */
function textFilesUnder(directory) {
  const found = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) found.push(...textFilesUnder(path))
    else if (/\.(?:js|ts)$/u.test(entry.name) && !entry.name.endsWith('.d.ts')) found.push(path)
  }
  return found
}

/**
 * A self-relative lookup the packer cannot keep, with the reason it is allowed.
 * Each one is a decision, not a blind spot, so it has to say what it costs.
 */
const RESOLVER_EXCEPTIONS = new Map([
  // `vendor/<component>/package.json` does not exist: the bundle carries one
  // manifest at its root. `brandPackageVersion()` reads it inside a try/catch and
  // prints no version when it is absent, so an Arya-branded document footer loses
  // its version number. Copying each component's manifest into `vendor/<name>/`
  // would put a package boundary and a `type` field inside the bundle, which is a
  // wider change than the release that found it.
  ['l5x:package.json', 'the vendored tree carries no per-component manifest; brandPackageVersion() degrades to no version instead'],
])

test('the assembler carries every payload directory a component resolves at runtime', () => {
  const source = read('scripts/assemble.mjs')
  const list = /for \(const entry of \[([\s\S]*?)\]\) \{/u.exec(source)
  assert.ok(list, 'scripts/assemble.mjs has no payload copy list')
  const copied = new Set([...list[1].matchAll(/'([^']+)'/gu)].map(match => match[1]))

  // A module that reads a file or folder beside itself is a promise the packer has
  // to keep. Both forms resolve relative to the built file, so in
  // `vendor/<component>/lib/` they point at `vendor/<component>/<name>` - and if
  // `<name>` is not in the copy list the tool that reads it ships with nothing to
  // read. That is exactly how 0.99.0 shipped `optix_list_skills` and `optix_get_skill`
  // with no payload: the tarball carried `vendor/optix/lib/skills.js` and no
  // `vendor/optix/skills/`, so the list came back empty and every topic refused.
  const RESOLVERS = [
    /new URL\(\s*["'`]([^"'`]+?)["'`]\s*,\s*import\.meta\.url\s*\)/gu,
    /join\(\s*dirname\((?:fileURLToPath\(import\.meta\.url\)|import\.meta\.dirname)\)\s*,\s*((?:"\.\."(?:\s*,\s*"[^"]+")?)+)\)/gu,
  ]

  for (const component of components.filter(candidate => candidate.vendor === true)) {
    for (const packagePath of packagesOf(component)) {
      const name = packagePath.split('/').pop()
      const packageRoot = fileURLToPath(new URL(`../${packagePath}/`, import.meta.url))
      for (const tree of ['lib', 'src']) {
        const directory = join(packageRoot, tree)
        if (!existsSync(directory)) continue
        for (const file of textFilesUnder(directory)) {
          const moduleDir = dirname(file)
          for (const match of readFileSync(file, 'utf8').matchAll(RESOLVERS[0])) {
            // A template hole (`../templates/${id}/`) still names its directory in
            // the part before it, which is the part the packer has to carry.
            const spec = match[1].split('${')[0]
            const inside = relative(packageRoot, resolve(moduleDir, spec))
            if (inside.startsWith('..')) continue
            const wanted = inside.split(/[/\\]/u)[0]
            const exception = RESOLVER_EXCEPTIONS.get(`${name}:${wanted}`)
            if (exception !== undefined) {
              assert.ok(exception.length > 30, `${name}: the exception for ${wanted} must say what it costs`)
              continue
            }
            assert.ok(copied.has(wanted),
              `${packagePath}/${tree}: ${relative(packageRoot, file)} resolves "../${spec}" at runtime, but scripts/assemble.mjs never copies ${wanted} into vendor/${name}/ - the tool that reads it ships with an empty folder`)
          }
          for (const match of readFileSync(file, 'utf8').matchAll(RESOLVERS[1])) {
            const parts = [...match[1].matchAll(/"([^"]+)"/gu)].map(part => part[1])
            const spec = parts.join('/')
            const inside = relative(packageRoot, resolve(moduleDir, spec))
            if (inside.startsWith('..')) continue
            const wanted = inside.split(/[/\\]/u)[0]
            const exception = RESOLVER_EXCEPTIONS.get(`${name}:${wanted}`)
            if (exception !== undefined) {
              assert.ok(exception.length > 30, `${name}: the exception for ${wanted} must say what it costs`)
              continue
            }
            assert.ok(copied.has(wanted),
              `${packagePath}/${tree}: ${relative(packageRoot, file)} resolves "${spec}" at runtime, but scripts/assemble.mjs never copies ${wanted} into vendor/${name}/ - the tool that reads it ships with an empty folder`)
          }
        }
      }
    }
  }
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

test('every component states its default posture and the patch row agrees', () => {
  for (const component of components) {
    assert.ok(component.default === 'on' || component.default === 'off',
      `${component.id} has an unknown default ${component.default}`)
    const row = rows.find(candidate => candidate.id === component.id)
    assert.equal(row?.disabled === true, component.default === 'off',
      `${component.id}: default "${component.default}" and the patch row disagree on disabled`)
  }
})

test('every tool name stays inside its component namespace', () => {
  const namesByProduct = new Map()
  for (const group of inventory.groups) {
    namesByProduct.set(group.product, [...(namesByProduct.get(group.product) ?? []), ...group.tools])
  }
  const claimed = new Map()
  for (const component of components) {
    if (component.tools.count === 0) {
      assert.equal(component.namespace, null, `${component.id} registers no tools and must not declare a namespace`)
      continue
    }
    const namespace = component.namespace
    assert.ok(namespace !== null && typeof namespace === 'object', `${component.id} registers tools and declares no namespace`)
    if (namespace.legacy === true) {
      assert.deepEqual(namespace.prefixes, [], `${component.id} is a legacy exemption, so it cannot declare prefixes`)
      assert.ok(typeof namespace.note === 'string' && namespace.note.length > 40,
        `${component.id}: a legacy namespace exemption must say what it exempts and how it ends`)
      continue
    }
    assert.equal(namespace.legacy, false, `${component.id}: namespace.legacy must be false when prefixes are declared`)
    assert.ok(Array.isArray(namespace.prefixes) && namespace.prefixes.length > 0, `${component.id} declares no tool prefix`)
    for (const prefix of namespace.prefixes) {
      assert.match(prefix, /^[a-z][a-z0-9]*_$/u, `${component.id}: ${prefix} is not a lowercase tool prefix`)
      const owner = claimed.get(prefix)
      assert.equal(owner, undefined, `${component.id} and ${owner} share the tool prefix ${prefix}`)
      claimed.set(prefix, component.id)
    }
    if (component.tools.inReference === true) {
      const outside = (namesByProduct.get(component.tools.product) ?? [])
        .filter(name => !namespace.prefixes.some(prefix => name.startsWith(prefix)))
      assert.deepEqual(outside, [], `${component.id}: tool names outside its namespace: ${outside.join(', ')}`)
    }
  }
  const prefixes = [...claimed.keys()]
  for (const prefix of prefixes) {
    for (const other of prefixes) {
      if (prefix !== other) assert.ok(!other.startsWith(prefix), `the tool prefix ${prefix} is ambiguous beside ${other}`)
    }
  }
  // A grandfathered component must not already sit in a prefix a later component owns.
  for (const component of components) {
    if (component.namespace?.legacy !== true || component.tools.inReference !== true) continue
    const captured = (namesByProduct.get(component.tools.product) ?? [])
      .filter(name => prefixes.some(prefix => name.startsWith(prefix)))
    assert.deepEqual(captured, [], `${component.id}: legacy tool names already inside another component's namespace: ${captured.join(', ')}`)
  }
})

test('the default-on surface stays inside the recorded context budget', () => {
  const budget = catalog.contextBudget
  assert.ok(budget !== undefined, 'components.json declares no contextBudget')
  assert.ok(Number.isInteger(budget.defaultOnTools) && budget.defaultOnTools > 0,
    'contextBudget.defaultOnTools must be a positive integer')
  assert.ok(Number.isInteger(budget.defaultOnSchemaCharacters) && budget.defaultOnSchemaCharacters > 0,
    'contextBudget.defaultOnSchemaCharacters must be a positive integer')
  assert.ok(typeof budget.note === 'string' && budget.note.length > 60,
    'contextBudget needs a note saying what each ceiling covers')
  assert.ok(inventory.context !== undefined, 'docs/reference/tools.json has no context measurement; run pnpm docs:tools')

  const mounted = components.filter(component => component.default === 'on')
  const tools = mounted.reduce((total, component) => total + component.tools.count, 0)
  assert.ok(tools <= budget.defaultOnTools,
    `a fresh install mounts ${tools} tools; the recorded ceiling is ${budget.defaultOnTools}. Ship the component off by default, or raise the ceiling with the measurement.`)
  const characters = mounted.reduce((total, component) => component.tools.inReference === true
    ? total + (inventory.context.byProduct[component.tools.product] ?? 0)
    : total, 0)
  assert.ok(characters <= budget.defaultOnSchemaCharacters,
    `default-on generated definitions are ${characters} characters; the recorded ceiling is ${budget.defaultOnSchemaCharacters}. Ship the component off by default, or raise the ceiling with the measurement.`)
})
