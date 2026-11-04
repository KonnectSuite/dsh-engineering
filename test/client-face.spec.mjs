/**
 * The bundle's one browser half.
 *
 * A client bundle registers under its package name, and the shell only scans
 * packages a row mounts, so "the faces are in the bundle" means three things
 * that are easy to lose independently: the artifact registers the bundle's own
 * name, it carries every face, and the row that mounts it names the package
 * root. A mistake in any of them presents as a plugin that loaded and drew
 * nothing, with no error anywhere - which is why every one of them is a test.
 */
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runInNewContext } from 'node:vm'
import { CLIENT_ID, FACES, renderClient, renderHost, renderHostTypes, renderTypertHost } from '../scripts/build-client.mjs'
import { buildEcadFace } from '../scripts/build-ecad-face.mjs'
import { en, zh } from '../packages/ecad/src/client/locales.ts'
import { ECAD_METHODS, ECAD_NAMESPACE, ECAD_PACKAGE } from '../src/remote/ecad-contract.js'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('package.json'))

/** The ladder viewer's document-preview id, the FTView face's and the ECAD face's. */
const LADDER_PREVIEW_ID = '@deepseek-ai/dsh-client-ui-logix-project-viewer'
const FTVIEW_PREVIEW_ID = 'dsh-engineering-ftview-viewer/display'
const ECAD_PREVIEW_ID = 'dsh-engineering-ecad/drawing'

/**
 * A require stub for the registering factory.
 *
 * Property reads yield callable no-ops, and own-key/descriptor traps mirror a
 * real module surface so the bundler's `__toESM` namespace copy keeps working
 * when a face imports React as a namespace.
 * @returns the module stand-in.
 */
function stubModule() {
  const surface = [
    'createElement', 'jsx', 'jsxs', 'jsxDEV', 'Fragment', 'Children', 'Component', 'PureComponent',
    'useState', 'useReducer', 'useEffect', 'useMemo', 'useRef', 'useCallback', 'useContext',
    'createContext', 'memo', 'forwardRef', 'createRoot', 'render', 'default',
  ]
  const cache = new Map()
  const member = key => {
    if (!cache.has(key)) cache.set(key, () => undefined)
    return cache.get(key)
  }
  return new Proxy({}, {
    get: (_target, key) => (typeof key === 'symbol' || key === 'then' ? undefined : member(String(key))),
    ownKeys: () => surface,
    getOwnPropertyDescriptor: (_target, key) => (typeof key === 'symbol'
      ? undefined
      : { configurable: true, enumerable: true, get: () => member(String(key)) }),
  })
}

/** A document just complete enough for the faces' stylesheet injection. */
function fakeDocument() {
  const appended = []
  const element = tag => ({ tag, dataset: {}, textContent: '' })
  return {
    appended,
    createElement: element,
    querySelector: () => null,
    head: {
      append: node => appended.push(node),
      appendChild: node => appended.push(node),
    },
  }
}

/** Load `lib/client.js` the way the page does: one registration into a stub facade. */
function loadBundle() {
  const registrations = []
  const document = fakeDocument()
  runInNewContext(read('lib/client.js'), {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    document,
  })
  return { registrations, document }
}

/** A client context that records what the faces register. */
function fakeContext() {
  const registrations = []
  const ctx = {
    effect: run => run(),
    // Optional services (sessions, conversation, betterSidebar) are absent in a
    // plain profile; the faces must mount without them.
    inject: () => {},
    locale: {
      register: (namespace) => { registrations.push(`locale:${namespace}`); return () => {} },
      bind: namespace => key => `${namespace}.${key}`,
    },
    documentPreviews: {
      register: (descriptor) => {
        registrations.push(`preview:${descriptor.id}`)
        registrations.push(`preview-mode:${descriptor.id}:${(descriptor.extensions ?? []).join('|')}:${descriptor.loading}`)
        registrations.push(`preview-binary:${descriptor.id}:${(descriptor.binaryExtensions ?? []).join('|')}`)
        return () => {}
      },
    },
    slots: {
      inject: (_name, register) => register(),
      register: (options) => {
        registrations.push(`slot:${options.name}#${options.key ?? ''}`)
        return () => {}
      },
    },
  }
  return { ctx, registrations }
}

test('lib/client.js is the current build of every committed face', () => {
  assert.equal(read('lib/client.js'), renderClient(),
    'lib/client.js is stale: run pnpm build:client after changing a face bundle')
})

test('lib/index.js is the current host half', () => {
  assert.equal(read('lib/index.js'), renderHost(),
    'lib/index.js is stale: run pnpm build:client')
  assert.equal(read('lib/index.d.ts'), renderHostTypes(),
    'lib/index.d.ts is stale: run pnpm build:client')
})

test('lib/typert.host.js is the current build of the Remote contract', () => {
  assert.equal(read('lib/typert.host.js'), renderTypertHost(),
    'lib/typert.host.js is stale: run pnpm build:client')
  assert.equal(manifest.exports['./typert'], './lib/typert.host.js',
    'the typert loader only imports a package artifact the package.json exports as "./typert"')
})

test('the Typert host artifact carries the facts the loader validates', async () => {
  const { TYPERT } = await import(new URL('../lib/typert.host.js', import.meta.url))
  assert.equal(TYPERT.package, manifest.name, 'the loader rejects a manifest owned by another package')
  assert.equal(TYPERT.face, 'host')
  assert.ok(Array.isArray(TYPERT.schemas))
  assert.deepEqual(TYPERT.model.events, [])
  assert.deepEqual(TYPERT.model.objects, [])
  assert.equal(TYPERT.model.services.length, 1)
  assert.equal(TYPERT.model.services[0].key, ECAD_NAMESPACE)
  assert.equal(TYPERT.invocations.length, ECAD_METHODS.length,
    'the artifact registers one invocation per ECAD Remote method')
  for (const invocation of TYPERT.invocations) {
    const spec = ECAD_METHODS.find(method => method.method === invocation.method)
    assert.ok(spec !== undefined, `unexpected ECAD method ${invocation.method}`)
    assert.equal(invocation.namespace, ECAD_NAMESPACE)
    assert.equal(invocation.service, ECAD_NAMESPACE,
      'the descriptor service is the Cordis service key, not a package name')
    assert.equal(invocation.method, spec.method)
    assert.equal(invocation.invocation.kind, 'direct')
    assert.equal(invocation.parameters.length, spec.parameters.length)
    for (const parameter of invocation.parameters) {
      assert.equal(parameter.source, 'json')
      assert.equal(parameter.codec.mode, 'strict')
      assert.equal(typeof parameter.codec.create, 'function')
      assert.equal(typeof parameter.codec.create().parse, 'function')
    }
    assert.equal(invocation.result.mode, 'strict')
    assert.equal(typeof invocation.result.create, 'function')
  }
  assert.equal(ECAD_PACKAGE, manifest.name)
})

test('the artifact registers exactly one bundle, under the package name', () => {
  const { registrations } = loadBundle()
  assert.equal(registrations.length, 1, 'one package gets one client bundle; a second registration is never asked for')
  const [registration] = registrations
  assert.equal(registration.id, manifest.name,
    'the registration id must equal the package name the shell resolves from the mounted row')
  assert.equal(registration.id, CLIENT_ID)
  assert.equal(typeof registration.factory, 'function')
})

test('the factory materializes every face and merges their declared services', () => {
  const [registration] = loadBundle().registrations
  const plugin = registration.factory(stubModule)
  assert.equal(typeof plugin.apply, 'function', 'the loader applies the module exports; apply must exist')
  assert.ok(Array.isArray(plugin.inject), 'inject must be an array of service names')
  const services = new Set(plugin.inject)
  for (const service of ['slots', 'locale', 'documentPreviews', 'remote', 'remote.workspaceFiles']) {
    assert.ok(services.has(service), `the merged face no longer declares the ${service} service`)
  }
  assert.equal(new Set(plugin.inject).size, plugin.inject.length, 'inject repeats a service name')
})

test('apply mounts the ladder preview, the ME display preview, the ECAD drawing preview and the row settings pages', () => {
  const [registration] = loadBundle().registrations
  const plugin = registration.factory(stubModule)
  const { ctx, registrations } = fakeContext()
  plugin.apply(ctx)
  for (const expected of [
    `preview:${LADDER_PREVIEW_ID}`,
    `preview:${FTVIEW_PREVIEW_ID}`,
    `preview:${ECAD_PREVIEW_ID}`,
    `preview-mode:${ECAD_PREVIEW_ID}:dxf|dwg:renderer`,
    `preview-binary:${ECAD_PREVIEW_ID}:dwg`,
    'locale:sidebarL5x',
    'locale:factorytalkView',
    'locale:sidebarEcad',
    'slot:sidebar.right.tab.document#' + LADDER_PREVIEW_ID,
    `slot:sidebar.right.tab.document#${FTVIEW_PREVIEW_ID}`,
    `slot:sidebar.right.tab.document#${ECAD_PREVIEW_ID}`,
    'slot:plugins.row.config#@aryacode/dsh-engineering#l5x',
    'slot:plugins.row.config#@aryacode/dsh-engineering#ftview',
    'slot:plugins.row.config#@aryacode/dsh-engineering#mwi',
  ]) {
    assert.ok(registrations.includes(expected), `apply did not register ${expected} (got ${registrations.join(', ')})`)
  }
})

test('no engineering component is a dependency any more', () => {
  // `@aryacode/dsh-tool-ft-optix` is a legitimate dependency; the retired
  // components all sat under the `@aryacode/dsh-engineering-` prefix.
  const components = Object.keys(manifest.dependencies ?? {}).filter(name => name.startsWith('@aryacode/dsh-engineering-'))
  assert.deepEqual(components, [], 'the bundle must not depend on its own retired component packages')
  for (const face of FACES) {
    if (face.packageName === undefined) continue
    assert.ok(!(manifest.dependencies ?? {})[face.packageName],
      `${face.packageName} is still a dependency; the ${face.name} face ships inside this package`)
  }
})

test('the declared client-face inject list is the union of the retired viewers', () => {
  const declared = [...manifest.dsh.client.inject]
  const union = []
  for (const face of FACES) {
    if (face.packageName === undefined) continue
    const retired = JSON.parse(read(`${face.file.replace(/\/lib\/client\.js$/u, '')}/package.json`))
    for (const name of retired.dsh.client.inject) if (!union.includes(name)) union.push(name)
  }
  assert.deepEqual(declared, union,
    'dsh.client.inject must preload every client package either face needs, and nothing more')
})

/** Load one committed face bundle the way the page does, into a stub loader. */
function loadFace(file) {
  const registrations = []
  const document = fakeDocument()
  runInNewContext(read(file), {
    window: { __ModuleLoader__: { load: registration => registrations.push(registration) } },
    document,
  })
  return registrations
}

test('the ECAD face artifact is the current build of its sources', async () => {
  assert.equal(read('packages/ecad/lib/client.js'), await buildEcadFace(),
    'packages/ecad/lib/client.js is stale: run node scripts/build-ecad-face.mjs')
})

test('the ECAD face mounts its drawing preview without a Remote carrier or Better Sidebar', () => {
  const registrations = loadFace('packages/ecad/lib/client.js')
  assert.equal(registrations.length, 1, 'a face bundle carries exactly one registration')
  const [registration] = registrations
  assert.equal(registration.id, '@aryacode/dsh-engineering-ecad')
  const plugin = registration.factory(stubModule)
  assert.deepEqual([...plugin.inject].sort(), ['documentPreviews', 'locale', 'remote', 'remote.workspaceFiles', 'slots'])
  // The same bare context the other faces are judged in: no remote carrier, no
  // sessions, no conversation and no Better Sidebar. A face that throws here
  // would take the whole merged bundle down at boot.
  const { ctx, registrations: mounted } = fakeContext()
  plugin.apply(ctx)
  for (const expected of [
    'locale:sidebarEcad',
    `preview:${ECAD_PREVIEW_ID}`,
    `preview-mode:${ECAD_PREVIEW_ID}:dxf|dwg:renderer`,
    `slot:sidebar.right.tab.document#${ECAD_PREVIEW_ID}`,
  ]) {
    assert.ok(mounted.includes(expected), `the ECAD face did not register ${expected} (got ${mounted.join(', ')})`)
  }
})

test('the ECAD dictionaries agree on keys, and the body only asks for keys they define', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'en and zh disagree on the ECAD preview keys')
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.length > 0, `en.${key} is empty`)
    assert.ok(zh[key].length > 0, `zh.${key} is empty`)
  }
  // Every literal key the body asks the locale service for must exist.
  for (const file of ['packages/ecad/src/client/EcadBody.tsx', 'packages/ecad/src/client/index.tsx']) {
    const source = read(file)
    for (const match of source.matchAll(/\bt\('([A-Za-z][\w.]*)'/gu)) {
      assert.ok(Object.hasOwn(en, match[1]), `${file} asks for the missing locale key ${match[1]}`)
    }
  }
  for (const key of ['sheetNumber', 'revision', 'date', 'sheetTitle', 'scale', 'project', 'customer', 'drawnBy', 'checkedBy']) {
    assert.ok(Object.hasOwn(en, key), `the title-block row key ${key} is missing from the dictionary`)
  }
})

test('the ECAD stylesheet defines exactly the classes its body reads', () => {
  // Comments are removed first: prose such as "palette.ts" is not a selector.
  const css = read('packages/ecad/src/client/EcadBody.module.css').replaceAll(/\/\*[\s\S]*?\*\//gu, '')
  const source = read('packages/ecad/src/client/EcadBody.tsx')
  const defined = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/gu)].map(match => match[1]))
  const used = new Set([...source.matchAll(/\bcss\.([A-Za-z][A-Za-z0-9_]*)/gu)].map(match => match[1]))
  assert.deepEqual([...used].filter(name => !defined.has(name)).sort(), [],
    'every css.<name> the body reads must exist in the stylesheet')
  assert.deepEqual([...defined].filter(name => !used.has(name)).sort(), [],
    'a class the body never reads is dead; delete it or use it')
  assert.deepEqual([...source.matchAll(/\bcss\s*\[/gu)].map(match => match[0]), [],
    'a computed css[...] access hides the class name from this check')
})
