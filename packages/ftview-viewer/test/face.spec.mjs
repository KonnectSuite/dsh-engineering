import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'

const CLIENT = 'packages/ftview-viewer/lib/client.js'

/** A minimal React that keeps the element tree inspectable. */
const React = {
  createElement: (type, props, ...children) => ({ type, props: { ...(props ?? {}), children } }),
  useMemo: factory => factory(),
  useState: value => [value, () => {}],
  useEffect: () => {},
  useCallback: callback => callback,
  useRef: () => ({ current: null }),
}

/** Load the face registration out of the built bundle. */
function loadFace() {
  const source = readFileSync(CLIENT, 'utf8')
  let registration
  const sandbox = {
    window: { __ModuleLoader__: { load: value => { registration = value } } },
    require: id => {
      if (id === 'react') return React
      throw new Error(`unexpected require ${id}`)
    },
    TextDecoder,
    Uint8Array,
    console,
  }
  runInNewContext(source, sandbox)
  if (registration === undefined) throw new Error('the bundle did not register a module')
  return registration.factory(sandbox.require)
}

/** Walk an element tree and collect every string. */
function strings(node, out = []) {
  if (node === null || node === undefined) return out
  if (typeof node === 'string') {
    out.push(node)
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) strings(child, out)
    return out
  }
  if (typeof node === 'object') {
    if (typeof node.type === 'function') return strings(node.type(node.props), out)
    const html = node.props?.dangerouslySetInnerHTML?.__html
    if (typeof html === 'string') out.push(html)
    for (const value of Object.values(node.props ?? {})) strings(value, out)
  }
  return out
}

const DISPLAY = `<?xml version="1.0"?>
<gfx><displaySettings width="400" height="300" backColor="#E0E0E0"/>
<panel name="P" left="0" top="0" width="400" height="40" backColor="#002952"/>
<gotoButton name="Go" left="10" top="50" width="120" height="40" backColor="#B0B0B0" borderStyle="raised" borderWidth="2" borderColor="silver">
  <states><state stateId="0" backColor="#B0B0B0" borderColor="silver"><caption caption="Main Screen" fontFamily="Arial" fontSize="12" color="black" alignment="middleCenter"/></state></states>
</gotoButton></gfx>`

test('the face registers the preview, the sidebar viewer and the tab body', () => {
  const face = loadFace()
  assert.deepEqual([...face.inject], ['slots', 'locale', 'documentPreviews'])
  const registered = []
  const body = []
  const ctx = {
    locale: { register: () => {}, bind: () => key => key },
    documentPreviews: { register: definition => registered.push(definition) },
    slots: {
      inject: (name, callback) => callback(),
      register: (definition, component) => body.push({ definition, component }),
    },
    effect: callback => callback(),
    inject: (services, callback) => callback({}),
  }
  face.apply(ctx)
  assert.equal(registered.length, 1)
  assert.equal(registered[0].id, 'dsh-engineering-ftview-viewer/display')
  assert.deepEqual([...registered[0].extensions], ['xml'])
  assert.equal(body.length, 1)
  assert.equal(body[0].definition.name, 'sidebar.right.tab.document')
})

test('the tab body renders the display through the new renderer', () => {
  const face = loadFace()
  const body = []
  face.apply({
    locale: { register: () => {}, bind: () => key => key },
    documentPreviews: { register: () => {} },
    slots: { inject: (name, callback) => callback(), register: (definition, component) => body.push(component) },
    effect: callback => callback(),
    inject: (services, callback) => callback({}),
  })
  const component = body[0]
  const tree = component({ content: { kind: 'bytes', data: new TextEncoder().encode(DISPLAY) } })
  const text = strings(tree).join('\n')
  assert.match(text, /<svg [^>]*xmlns=/u)
  assert.match(text, /Main Screen/u)
  assert.match(text, /400×300/u)
})

test('the tab body reports an invalid file instead of rendering nothing', () => {
  const face = loadFace()
  const body = []
  face.apply({
    locale: { register: () => {}, bind: () => key => key },
    documentPreviews: { register: () => {} },
    slots: { inject: (name, callback) => callback(), register: (definition, component) => body.push(component) },
    effect: callback => callback(),
    inject: (services, callback) => callback({}),
  })
  const tree = body[0]({ content: { kind: 'bytes', data: new TextEncoder().encode('<not-a-display/>') } })
  assert.match(strings(tree).join('\n'), /invalid|not a FactoryTalk View display/u)
})

test('the built face bundle is present', () => {
  assert.ok(existsSync(CLIENT))
  const source = readFileSync(CLIENT, 'utf8')
  assert.match(source, /window\.__ModuleLoader__\.load\(/u)
  assert.equal(source.split('factory:').length, 2, 'exactly one factory')
})
