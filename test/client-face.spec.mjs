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
import { CLIENT_ID, FACES, renderClient, renderHost, renderHostTypes } from '../scripts/build-client.mjs'

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const manifest = JSON.parse(read('package.json'))

/** The ladder viewer's document-preview id and the FTView face's. */
const LADDER_PREVIEW_ID = '@deepseek-ai/dsh-client-ui-logix-project-viewer'
const FTVIEW_PREVIEW_ID = 'dsh-engineering-ftview-viewer/display'

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
      register: (descriptor) => { registrations.push(`preview:${descriptor.id}`); return () => {} },
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

test('apply mounts the ladder preview, the ME display preview and the row settings pages', () => {
  const [registration] = loadBundle().registrations
  const plugin = registration.factory(stubModule)
  const { ctx, registrations } = fakeContext()
  plugin.apply(ctx)
  for (const expected of [
    `preview:${LADDER_PREVIEW_ID}`,
    `preview:${FTVIEW_PREVIEW_ID}`,
    'locale:sidebarL5x',
    'locale:factorytalkView',
    'slot:sidebar.right.tab.document#' + LADDER_PREVIEW_ID,
    `slot:sidebar.right.tab.document#${FTVIEW_PREVIEW_ID}`,
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
