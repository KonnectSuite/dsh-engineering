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
const inserted = patch[0]

const keys = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) => {
  const path = prefix === '' ? key : `${prefix}.${key}`
  return child !== null && typeof child === 'object' ? keys(child, path) : [path]
})

test('the declared bundle patch exists', () => {
  assert.ok(manifest.dsh?.bundle?.patch, 'package.json declares no dsh.bundle.patch')
  assert.ok(existsSync(new URL(`../${manifest.dsh.bundle.patch}`, import.meta.url)))
})

test('the README documents the row switches', () => {
  const section = readme.split(/^## /mu).find(part => part.startsWith('Switches'))
  assert.ok(section, 'README has no "Switches" section')
  for (const row of inserted.insert.filter(row => row.disabled === true)) {
    assert.ok(section.includes(row.id), `README does not explain that ${row.id} is off by default`)
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

test('every dependency resolves from a registry', () => {
  // A URL, git, or workspace spec here lands in a *subdependency* of whatever
  // bundle a profile installs, and pnpm refuses those outright
  // (ERR_PNPM_EXOTIC_SUBDEP). 0.4.0 shipped an Optix tarball URL and every
  // market install failed, so this is a test, not a convention.
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      assert.doesNotMatch(spec, /^(?:https?|git|file|link|workspace):/u,
        `${section}.${name} is ${spec}; it must be a registry version range`)
    }
  }
})

test('every vendored component dependency is declared here', () => {
  // `vendor/<component>` is the component's own code, and it imports the
  // component's own libraries. Vendoring drops the component manifest, so the
  // bundle has to carry those dependencies: a missing one surfaces at mount as
  // ERR_MODULE_NOT_FOUND and the row fails to import.
  for (const component of ['l5x', 'ftview', 'mwi', 'optix']) {
    const componentManifest = JSON.parse(read(`packages/${component}/package.json`))
    for (const [name, range] of Object.entries(componentManifest.dependencies ?? {})) {
      assert.equal(manifest.dependencies?.[name], range,
        `${component} imports ${name}@${range}, but the bundle does not declare it`)
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

test('every engineering skill names the one backup tree', () => {
  // One place for every product's backup is the promise; a skill that describes
  // its own location is a skill the agent will follow somewhere else.
  const tree = '<workspace>/backups/<product>/<subject>/<UTC stamp>/'
  const products = { l5x: '`l5x` product', ftview: '`ftview` product', mwi: '`motionworks` product' }
  for (const [folder, marker] of Object.entries(products)) {
    const text = read(`packages/${folder}/SKILL.md`)
    assert.ok(text.includes(tree), `${folder} SKILL.md does not show the shared backup tree`)
    assert.ok(text.includes('backup-manifest.json'), `${folder} SKILL.md does not name the manifest`)
    assert.ok(text.includes('_backups'), `${folder} SKILL.md does not warn off the legacy folder`)
    assert.ok(text.includes(marker), `${folder} SKILL.md does not name its own product folder`)
  }
  const architecture = read('docs/architecture.md')
  assert.ok(architecture.includes(tree), 'docs/architecture.md does not show the shared backup tree')
  for (const folder of ['motionworks', 'l5x', 'ftview', 'optix']) {
    assert.ok(architecture.includes(`\`${folder}\``), `docs/architecture.md omits the ${folder} backup folder`)
  }
})
