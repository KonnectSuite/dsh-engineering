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
import { readdirSync, readFileSync } from 'node:fs'
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
/** The wire tool names the face claims in the keyed tool-view slot. */
const ECAD_CARD_KEYS = [
  'ecad_capabilities', 'ecad_profile', 'ecad_scan', 'ecad_open', 'ecad_overview',
  'ecad_find', 'ecad_cross_reference', 'ecad_checks', 'ecad_render', 'ecad_compare',
  'ecad_draft_ops', 'ecad_draft_apply', 'ecad_draft_discard', 'ecad_verify',
  'ecad_document', 'ecad_backup',
]

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
  /** Every slot registration options object, so a test can read its shape. */
  const entries = []
  /** The injected props of the drawing body registration. */
  let bodyInject
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
        registrations.push(`slot:${options.name}#${options.key ?? options.id ?? ''}`)
        entries.push(options)
        if (options.name === 'sidebar.right.tab.document' && typeof options.inject === 'function') bodyInject = options.inject()
        return () => {}
      },
    },
  }
  return { ctx, registrations, entries: () => entries, injected: () => bodyInject }
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
    'slot:plugins.row.config#@aryacode/dsh-engineering#ecad',
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
  const { ctx, registrations: mounted, injected } = fakeContext()
  plugin.apply(ctx)
  for (const expected of [
    'locale:sidebarEcad',
    `preview:${ECAD_PREVIEW_ID}`,
    `preview-mode:${ECAD_PREVIEW_ID}:dxf|dwg:renderer`,
    `slot:sidebar.right.tab.document#${ECAD_PREVIEW_ID}`,
  ]) {
    assert.ok(mounted.includes(expected), `the ECAD face did not register ${expected} (got ${mounted.join(', ')})`)
  }
  // The body is handed the three bridges it needs: the reader, the writer and
  // the conversation draft. The writer is what edit mode calls; a body without
  // it would offer an apply it cannot perform.
  const body = injected()
  assert.ok(body !== undefined, 'the ECAD body registration injects no props')
  for (const method of ['open', 'apply', 'ask']) {
    assert.equal(typeof body[method], 'function', `the ECAD body is not injected with ${method}()`)
  }
})

test('the ECAD conversation surfaces register on the host slots they were built for', async () => {
  const registrations = loadFace('packages/ecad/lib/client.js')
  const plugin = registrations[0].factory(stubModule)
  const { ctx, entries } = fakeContext()
  plugin.apply(ctx)
  const slots = entries()
  // One keyed card per ECAD wire tool name: the keyed dispatch has no wildcard,
  // so a tool without its own key silently falls back to the generic row.
  const cards = slots.filter(entry => entry.name === 'tool.call.toolview')
  assert.deepEqual(cards.map(entry => entry.key).sort(), [...ECAD_CARD_KEYS].sort(),
    'the ECAD face claims every one of its wire tool names in tool.call.toolview')
  for (const card of cards) {
    assert.equal(card.locale, 'sidebarEcad', `the ${card.key} card is registered without the face dictionary`)
    assert.equal(card.children, undefined, `the ${card.key} card declares children it does not render`)
  }
  // The dock is a list entry whose injected reader is session-addressed; the slot
  // owner props carry the Session, so this is a real read, not a faked session.
  const dock = slots.find(entry => entry.name === 'conversation.input.dock')
  assert.ok(dock !== undefined, 'the face registers no composer dock entry')
  assert.equal(dock.id, 'ecad-sheet-set')
  assert.equal(dock.locale, 'sidebarEcad')
  assert.equal(typeof dock.inject, 'function')
  // Degraded path: the same bare context has no Remote carrier, so the reader
  // must answer undefined and leave the composer untouched rather than throw.
  const reader = dock.inject().readSheetSet
  assert.equal(typeof reader, 'function')
  assert.equal(await reader('session-without-remote'), undefined)
})

test('the ECAD card keys cover the generated tool inventory', () => {
  // docs/reference/tools.json is generated from the registered tools; a tool
  // added without a card key would fall back to the generic row silently.
  const inventory = JSON.parse(read('docs/reference/tools.json'))
  const ecadTools = inventory.tools.filter(name => name.startsWith('ecad_')).sort()
  assert.deepEqual([...ECAD_CARD_KEYS].sort(), ecadTools,
    'every generated ECAD tool must have a keyed card registration')
})

test('a composition without the tool UI registers no card and still mounts', () => {
  const registrations = loadFace('packages/ecad/lib/client.js')
  const plugin = registrations[0].factory(stubModule)
  const { ctx, entries } = fakeContext()
  // The shell's tool UI owns tool.call.toolview; a composition without it never
  // declares the slot, so slots.inject never runs that callback. The face must
  // mount, keep the dock, and claim no card.
  const inject = ctx.slots.inject
  ctx.slots.inject = (name, run) => (name === 'tool.call.toolview' ? () => {} : inject(name, run))
  plugin.apply(ctx)
  const slots = entries()
  assert.equal(slots.filter(entry => entry.name === 'tool.call.toolview').length, 0)
  assert.equal(slots.filter(entry => entry.name === 'conversation.input.dock').length, 1,
    'the composer dock does not depend on the tool UI')
})

test('the ECAD editing copy is part of the same dictionary', () => {
  // The mode switch, the staged list and the apply action all read from the
  // dictionary; a missing key would print a raw key in the panel.
  for (const key of ['viewMode', 'editMode', 'addTextTool', 'stagedOps', 'apply', 'applyFailureFix', 'moveAction', 'eraseAction', 'verification', 'dwgRoundTrip']) {
    assert.ok(Object.hasOwn(en, key), `the editing dictionary is missing ${key}`)
    assert.ok(Object.hasOwn(zh, key), `the editing dictionary is missing the Chinese ${key}`)
  }
})

test('the ECAD dictionaries agree on keys, and the body only asks for keys they define', () => {
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort(), 'en and zh disagree on the ECAD preview keys')
  for (const [key, value] of Object.entries(en)) {
    assert.ok(value.length > 0, `en.${key} is empty`)
    assert.ok(zh[key].length > 0, `zh.${key} is empty`)
  }
  // Every literal key the UI asks the locale service for must exist.
  for (const file of [
    'packages/ecad/src/client/EcadBody.tsx',
    'packages/ecad/src/client/EcadDraft.tsx',
    'packages/ecad/src/client/EcadCad.tsx',
    'packages/ecad/src/client/EcadCards.tsx',
    'packages/ecad/src/client/index.tsx',
  ]) {
    const source = read(file)
    for (const match of source.matchAll(/\bt\('([A-Za-z][\w.]*)'/gu)) {
      assert.ok(Object.hasOwn(en, match[1]), `${file} asks for the missing locale key ${match[1]}`)
    }
  }
  for (const key of ['sheetNumber', 'revision', 'date', 'sheetTitle', 'scale', 'project', 'customer', 'drawnBy', 'checkedBy']) {
    assert.ok(Object.hasOwn(en, key), `the title-block row key ${key} is missing from the dictionary`)
  }
})

test('every CAD tool has its label and hint in both dictionaries', async () => {
  const { CAD_TOOLS, PENDING_ENGINE_OPS, ENGINE_OPS_SUPPORTED } = await import('../packages/ecad/src/client/cadTools.ts')
  assert.ok(CAD_TOOLS.length >= 21, 'the tool palette lost tools')
  for (const tool of CAD_TOOLS) {
    assert.ok(Object.hasOwn(en, tool.labelKey), `the tool palette asks for the missing locale key ${tool.labelKey}`)
    assert.ok(Object.hasOwn(zh, tool.labelKey), `the tool palette asks for the missing Chinese locale key ${tool.labelKey}`)
    assert.ok(Object.hasOwn(en, tool.hintKey), `the tool palette asks for the missing locale key ${tool.hintKey}`)
    assert.ok(Object.hasOwn(zh, tool.hintKey), `the tool palette asks for the missing Chinese locale key ${tool.hintKey}`)
    if (tool.writes) assert.ok(ENGINE_OPS_SUPPORTED.has(tool.op) || PENDING_ENGINE_OPS.includes(tool.op), `${tool.id} names an unknown engine op`)
  }
  // The keyboard map the report documents: one shortcut per letter tool.
  const shortcuts = CAD_TOOLS.map(tool => tool.shortcut).filter(key => key !== undefined && key !== 'Del')
  assert.equal(new Set(shortcuts).size, shortcuts.length, 'two CAD tools share a keyboard shortcut')
})

test('the CAD workspace controls are in the committed face', () => {
  const source = read('packages/ecad/lib/client.js')
  for (const marker of [
    'data-ecad-palette',
    'data-ecad-command-bar',
    'data-ecad-status',
    'data-ecad-context-menu',
    'data-ecad-properties',
    'data-ecad-layers',
    'data-ecad-print',
    'data-ecad-export-svg',
    'data-ecad-export-png',
    'data-ecad-marquee',
    'data-ecad-grip',
    'data-ecad-property-text',
    'data-ecad-attribute-editor',
    'data-ecad-current-layer',
    'data-ecad-layer-create',
    'data-ecad-stage-move',
    'data-ecad-stage-rotate',
    'data-ecad-apply',
    'data-ecad-open-written',
    'data-ecad-written-banner',
  ]) {
    assert.ok(source.includes(marker), `the committed ECAD face does not carry the ${marker} control`)
  }
  // The keyboard aids the report documents are part of the face.
  for (const key of ['F3', 'F7', 'F8']) {
    assert.ok(source.includes(key), `the committed ECAD face does not handle ${key}`)
  }
})

test('the CAD workspace locale strings exist in both languages', () => {
  for (const key of [
    'toolPalette', 'toolSelect', 'toolLine', 'toolPolyline', 'toolRectangle', 'toolCircle', 'toolArc',
    'toolRevisionCloud', 'toolLeader', 'toolText', 'toolBlock', 'toolMove', 'toolCopy', 'toolRotate',
    'toolScale', 'toolMirror', 'toolOffset', 'toolTrim', 'toolExtend', 'toolErase',
    'engineOpPending', 'commandBarLabel', 'contextMenuLabel', 'properties', 'layersCurrent',
    'statusBarLabel', 'snapEndpoint', 'snapMidpoint', 'snapCenter', 'snapNearest', 'snapGrid',
    'marqueeWindowLabel', 'marqueeCrossingLabel', 'gripOpPending', 'undo', 'redo', 'print',
    'exportSvg', 'exportPng', 'layerOpPending',
  ]) {
    assert.ok(Object.hasOwn(en, key), `the CAD dictionary is missing ${key}`)
    assert.ok(Object.hasOwn(zh, key), `the CAD dictionary is missing the Chinese ${key}`)
  }
})

test('every ECAD stylesheet defines exactly the classes its bodies read', () => {
  // Comments are removed first: prose such as "palette.ts" is not a selector.
  const pairs = [
    { css: 'packages/ecad/src/client/EcadBody.module.css', sources: ['packages/ecad/src/client/EcadBody.tsx', 'packages/ecad/src/client/EcadDraft.tsx', 'packages/ecad/src/client/EcadCad.tsx'] },
    { css: 'packages/ecad/src/client/EcadCards.module.css', sources: ['packages/ecad/src/client/EcadCards.tsx'] },
  ]
  for (const pair of pairs) {
    const css = read(pair.css).replaceAll(/\/\*[\s\S]*?\*\//gu, '')
    const sources = pair.sources.map(read)
    const defined = new Set([...css.matchAll(/\.([A-Za-z][A-Za-z0-9_-]*)/gu)].map(match => match[1]))
    const used = new Set(sources.flatMap(source => [...source.matchAll(/\bcss\.([A-Za-z][A-Za-z0-9_]*)/gu)].map(match => match[1])))
    assert.deepEqual([...used].filter(name => !defined.has(name)).sort(), [],
      `every css.<name> ${pair.sources.join(', ')} reads must exist in ${pair.css}`)
    assert.deepEqual([...defined].filter(name => !used.has(name)).sort(), [],
      `a class in ${pair.css} that ${pair.sources.join(', ')} never reads is dead; delete it or use it`)
    assert.deepEqual(sources.flatMap(source => [...source.matchAll(/\bcss\s*\[/gu)].map(match => match[0])), [],
      'a computed css[...] access hides the class name from this check')
  }
  // A stylesheet no pair names would never be checked, so the pair list is the
  // complete set of ECAD stylesheets.
  const modules = readdirSync(new URL('../packages/ecad/src/client', import.meta.url))
    .filter(name => name.endsWith('.module.css'))
    .map(name => `packages/ecad/src/client/${name}`)
  assert.deepEqual(modules.sort(), pairs.map(pair => pair.css).sort(),
    'every ECAD stylesheet must be paired with the sources that read it')
})
