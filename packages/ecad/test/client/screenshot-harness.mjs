#!/usr/bin/env node
/**
 * The ECAD face's headless screenshot harness.
 *
 * It bundles a matching React pair for the page, serves the committed
 * `packages/ecad/lib/client.js` through its real module-loader registration
 * against a fake sheet model and a fake Remote bridge, then drives real Chrome
 * input through CDP and writes the review screenshots.
 *
 * This is review tooling, not product code: it lives under `test/client/` and is
 * not part of the published payload. Run it after rebuilding the face and the
 * client bundle:
 *
 *   node packages/ecad/test/client/screenshot-harness.mjs [--out <dir>]
 *
 * It needs a Chrome or Edge binary on the machine and no npm dependency beyond
 * the workspace's own esbuild.
 */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const HARNESS = join(HERE, 'harness')
const FACE = join(ROOT, 'packages/ecad/lib/client.js')

/** Where the screenshots go. */
const outArg = process.argv.indexOf('--out')
const OUT = resolve(outArg === -1 ? join(tmpdir(), 'ecad-cad-face-shots') : process.argv[outArg + 1])

/** Load the esbuild the workspace installed. */
function loadEsbuild() {
  const hoisted = join(ROOT, 'node_modules', 'esbuild', 'lib', 'main.js')
  if (existsSync(hoisted)) return createRequire(import.meta.url)(hoisted)
  const store = join(ROOT, 'node_modules', '.pnpm')
  const directory = readdirSync(store).find(name => name.startsWith('esbuild@'))
  if (directory === undefined) throw new Error('esbuild is not installed')
  return createRequire(import.meta.url)(join(store, directory, 'node_modules', 'esbuild', 'lib', 'main.js'))
}

/** The React pair the harness page runs: a matched 18.x pair from the checkout. */
function reactRoots() {
  const candidates = [
    join(ROOT, '..', '..', 'AryaCode', 'apps', 'web', 'node_modules'),
    join(ROOT, '..', '..', 'dsh-arya-market', 'node_modules'),
    join(ROOT, '..', '..', 'AryaCode', 'apps', 'desktop', 'node_modules'),
    join(ROOT, '..', 'AryaCode', 'apps', 'web', 'node_modules'),
  ]
  for (const root of candidates) {
    if (existsSync(join(root, 'react', 'package.json')) && existsSync(join(root, 'react-dom', 'package.json'))) return root
  }
  throw new Error('no matched react/react-dom pair found beside the checkout')
}

/** Alias the page's React imports to the matched pair. */
function reactAliases(reactRoot) {
  const paths = {
    react: join(reactRoot, 'react', 'index.js'),
    'react/jsx-runtime': join(reactRoot, 'react', 'jsx-runtime.js'),
    'react-dom': join(reactRoot, 'react-dom', 'index.js'),
    'react-dom/client': join(reactRoot, 'react-dom', 'client.js'),
  }
  return {
    name: 'react-alias',
    setup(build) {
      // Only the entry specifiers are aliased; react-dom's own `scheduler`
      // dependency resolves from its package location the way the bundler always
      // resolves a package dependency.
      build.onResolve({ filter: /^(react|react-dom|react-dom\/client|react\/jsx-runtime)$/ }, (args) => {
        const path = paths[args.path]
        if (path === undefined || !existsSync(path)) throw new Error(`no alias for ${args.path}`)
        return { path }
      })
    },
  }
}

/** Build the page's React globals IIFE. */
async function buildReactGlobals(reactRoot, directory) {
  const esbuild = loadEsbuild()
  const result = await esbuild.build({
    entryPoints: [join(HARNESS, 'react-globals.ts')],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"production"' },
    plugins: [reactAliases(reactRoot)],
  })
  writeFileSync(join(directory, 'react-globals.js'), result.outputFiles[0].text)
}

/** One Chrome target connection over the DevTools protocol. */
class Cdp {
  constructor(socket) {
    this.socket = socket
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Map()
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id !== undefined) {
        const entry = this.pending.get(message.id)
        if (entry === undefined) return
        this.pending.delete(message.id)
        if (message.error) entry.reject(new Error(`${entry.method}: ${message.error.message}`))
        else entry.resolve(message.result)
        return
      }
      const handlers = this.listeners.get(message.method) ?? []
      for (const handler of handlers) handler(message.params)
    })
  }

  send(method, params = {}) {
    const id = this.nextId++
    const promise = new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method })
    })
    this.socket.send(JSON.stringify({ id, method, params }))
    return promise
  }

  on(method, handler) {
    const list = this.listeners.get(method) ?? []
    list.push(handler)
    this.listeners.set(method, list)
  }
}

/** Wait for the DevTools endpoint to answer. */
async function waitForDevtools(port, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`)
      if (response.ok) return await response.json()
    } catch {
      // Not listening yet.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 150))
  }
  throw new Error('Chrome did not expose its DevTools endpoint')
}

/** Wait for one page target and connect. */
async function connectPage(port) {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`)
  const targets = await response.json()
  const page = targets.find(target => target.type === 'page')
  if (page === undefined) throw new Error('no page target')
  const socket = new WebSocket(page.webSocketDebuggerUrl)
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener('open', resolveOpen)
    socket.addEventListener('error', () => rejectOpen(new Error('DevTools socket failed')))
  })
  return new Cdp(socket)
}

/** Runtime.evaluate a value, waiting for promises. */
async function evaluate(cdp, expression) {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails !== undefined) {
    throw new Error(`page error: ${result.exceptionDetails.text ?? ''} ${result.exceptionDetails.exception?.description ?? ''}`)
  }
  return result.result?.value
}

/** The page-side harness helper, evaluated into a plain value. */
async function harness(cdp, call) {
  return evaluate(cdp, `window.__HARNESS__.${call}`)
}

/** Wait for the page's sheet to be ready. */
async function waitReady(cdp, timeoutMs = 60000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const done = await evaluate(cdp, 'Boolean(window.__HARNESS__)')
      if (done === true) return true
    } catch {
      // Still loading.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 200))
  }
  const failure = await evaluate(cdp, `JSON.stringify({
    harness: Boolean(window.__HARNESS__),
    error: String(window.__HARNESS_ERROR__ ?? ''),
    readyType: typeof window.__HARNESS_READY__,
    react: typeof window.__HARNESS_REACT__,
    loader: typeof window.__ModuleLoader__,
    scripts: [...document.scripts].map(s => s.src),
    body: document.body?.innerHTML?.slice(0, 500) ?? 'no body',
    url: location.href,
  })`).catch(() => 'unavailable')
  throw new Error(`the harness page never became ready (${failure})`)
}

/** Screenshot the current page. */
async function shot(cdp, directory, name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const file = join(directory, name)
  writeFileSync(file, Buffer.from(result.data, 'base64'))
  console.log(`  shot ${name}`)
  return file
}

/** Dispatch one mouse event. */
async function mouse(cdp, type, point, options = {}) {
  await cdp.send('Input.dispatchMouseEvent', {
    type,
    x: Math.round(point.x),
    y: Math.round(point.y),
    button: options.button ?? 'left',
    buttons: options.buttons ?? (type === 'mouseMoved' ? 0 : 1),
    clickCount: type === 'mouseMoved' ? 0 : 1,
    modifiers: options.modifiers ?? 0,
  })
}

/** Move the mouse between two points, optionally pausing for a screenshot. */
async function drag(cdp, from, to, options = {}) {
  await mouse(cdp, 'mouseMoved', from, { buttons: 0 })
  await mouse(cdp, 'mousePressed', from, { buttons: 1 })
  const steps = options.steps ?? 6
  for (let step = 1; step <= steps; step += 1) {
    const point = {
      x: from.x + ((to.x - from.x) * step) / steps,
      y: from.y + ((to.y - from.y) * step) / steps,
    }
    await mouse(cdp, 'mouseMoved', point, { buttons: 1 })
  }
  if (options.during !== undefined) await options.during()
  await mouse(cdp, 'mouseReleased', to, { buttons: 0 })
}

/** Click one point. */
async function click(cdp, point, modifiers = 0) {
  await mouse(cdp, 'mouseMoved', point, { buttons: 0 })
  await mouse(cdp, 'mousePressed', point, { buttons: 1, modifiers })
  await mouse(cdp, 'mouseReleased', point, { buttons: 0, modifiers })
}

/** Right-click one point, falling back to a synthetic contextmenu event. */
async function rightClick(cdp, point) {
  await mouse(cdp, 'mouseMoved', point, { buttons: 0 })
  await mouse(cdp, 'mousePressed', point, { button: 'right', buttons: 2 })
  await mouse(cdp, 'mouseReleased', point, { button: 'right', buttons: 0 })
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  const open = await evaluate(cdp, 'Boolean(document.querySelector("[data-ecad-context-menu]"))')
  if (open === true) return
  await evaluate(cdp, `(() => {
    const wrap = document.querySelector('[data-ecad-canvas]').parentElement
    wrap.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: ${Math.round(point.x)}, clientY: ${Math.round(point.y)} }))
    return true
  })()`)
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
}

/** Keydown/up one key. */
async function key(cdp, keyName, code, modifiers = 0) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, modifiers, windowsVirtualKeyCode: keyCodeOf(keyName) })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers, windowsVirtualKeyCode: keyCodeOf(keyName) })
}

/** Set one React-controlled input's value through the native setter and an input event. */
async function setInputValue(cdp, selector, value) {
  await evaluate(cdp, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)})
    if (element === null) throw new Error('no input for ${selector}')
    const prototype = element.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set
    setter.call(element, ${JSON.stringify(value)})
    element.dispatchEvent(new Event(element.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }))
    return true
  })()`)
}

/** Press a Ctrl-modified key chord. */
async function ctrlKey(cdp, keyName, code) {
  const windowsVirtualKeyCode = keyName.toUpperCase().charCodeAt(0)
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: keyName, code, modifiers: 2, windowsVirtualKeyCode })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: keyName, code, modifiers: 2, windowsVirtualKeyCode })
}

/** The Windows virtual key code of the keys this harness presses. */
function keyCodeOf(keyName) {
  if (keyName === 'Escape') return 27
  if (keyName === 'Delete') return 46
  if (keyName === 'F3') return 114
  if (keyName === 'F7') return 118
  if (keyName === 'F8') return 119
  return 0
}

/** Find a Chrome binary. */
function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  ].filter(Boolean)
  for (const candidate of candidates) if (existsSync(candidate)) return candidate
  throw new Error('no Chrome or Edge binary found; set CHROME_PATH')
}

/** The page the harness serves. */
function pageHtml() {
  return `<!doctype html>
<html data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="harness.css">
</head>
<body>
<div id="root"></div>
<script src="react-globals.js"></script>
<script src="bootstrap.js"></script>
</body>
</html>
`
}

/** Prepare the harness directory. */
async function preparePage(directory) {
  rmSync(directory, { recursive: true, force: true })
  mkdirSync(directory, { recursive: true })
  await buildReactGlobals(reactRoots(), directory)
  copyFileSync(FACE, join(directory, 'face.js'))
  copyFileSync(join(HARNESS, 'bootstrap.js'), join(directory, 'bootstrap.js'))
  copyFileSync(join(HARNESS, 'harness.css'), join(directory, 'harness.css'))
  writeFileSync(join(directory, 'index.html'), pageHtml())
}

/** The screenshots and measurements the run produces. */
async function capture(cdp, directory) {
  const result = { shots: [], measurements: {}, pageErrors: [] }
  cdp.on('Runtime.exceptionThrown', (params) => {
    result.pageErrors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'unknown exception')
  })
  await cdp.send('Runtime.enable')
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })

  const base = `file:///${join(directory, 'page', 'index.html').replaceAll('\\', '/')}`
  console.log(`  page url: ${base}`)
  const open = async (query = '') => {
    await cdp.send('Page.navigate', { url: `${base}${query}` })
    await new Promise(resolveWait => setTimeout(resolveWait, 400))
    console.log(`  navigated: ${await evaluate(cdp, 'location.href').catch(() => 'n/a')}`)
    await waitReady(cdp)
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  }

  await open('')
  await evaluate(cdp, 'window.__HARNESS__.setTheme("light")')
  await new Promise(resolveWait => setTimeout(resolveWait, 120))
  result.measurements.small = await evaluate(cdp, '({ renderMs: window.__HARNESS__.renderMs, primitives: window.__HARNESS__.primitives, modelEntities: window.__HARNESS__.model.stats.entities, editable: window.__HARNESS__.editable() })')
  result.shots.push(await shot(cdp, directory, '01-light-view.png'))

  await evaluate(cdp, 'window.__HARNESS__.setTheme("dark")')
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
  result.shots.push(await shot(cdp, directory, '02-dark-view.png'))
  await evaluate(cdp, 'window.__HARNESS__.setTheme("light")')

  // Edit mode: the second button of the view/edit switch.
  await evaluate(cdp, 'document.querySelector("[data-ecad-mode-switch] button:nth-of-type(2)").click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 180))
  result.measurements.mode = await evaluate(cdp, 'window.__HARNESS__.mode()')

  // Crossing marquee: drag right-to-left over the drawing, capture mid-drag.
  const start = await harness(cdp, 'emptyPoint()')
  const end = await harness(cdp, 'pointOn(140, 90)')
  await drag(cdp, start, end, {
    steps: 8,
    during: async () => {
      result.shots.push(await shot(cdp, directory, '03-marquee-crossing.png'))
    },
  })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.measurements.selectedAfterMarquee = await evaluate(cdp, 'window.__HARNESS__.selectedCount()')
  result.shots.push(await shot(cdp, directory, '04-multi-selection.png'))

  // Context menu on the sheet.
  const contextPoint = await harness(cdp, 'pointOn(110, 60)')
  await rightClick(cdp, contextPoint)
  result.shots.push(await shot(cdp, directory, '05-context-menu.png'))
  const menuOpen = await evaluate(cdp, 'Boolean(document.querySelector("[data-ecad-context-menu]"))')
  if (menuOpen !== true) result.pageErrors.push('context menu did not open')
  await key(cdp, 'Escape', 'Escape')
  await new Promise(resolveWait => setTimeout(resolveWait, 120))

  // A single line selection shows grips and the properties panel.
  await key(cdp, 'Escape', 'Escape')
  await new Promise(resolveWait => setTimeout(resolveWait, 100))
  await click(cdp, await harness(cdp, 'pointOn(110, 60)'))
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  result.shots.push(await shot(cdp, directory, '06-selection-grips.png'))

  // Grip drag on the line's right endpoint: preview then staged setLine.
  const gripFrom = await harness(cdp, 'pointOn(200, 60)')
  const gripTo = await harness(cdp, 'pointOn(215, 75)')
  await drag(cdp, gripFrom, gripTo, {
    steps: 6,
    during: async () => {
      result.shots.push(await shot(cdp, directory, '07-grip-drag.png'))
    },
  })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.measurements.draftAfterGrip = await evaluate(cdp, 'document.querySelector("[data-ecad-draft]")?.textContent ?? ""')
  result.shots.push(await shot(cdp, directory, '08-grip-staged.png'))

  // Apply the staged grip edit through the same draft/apply path the shell uses.
  await evaluate(cdp, 'document.querySelector("[data-ecad-apply]")?.click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 600))
  result.measurements.applyOutcome = await evaluate(cdp, 'document.querySelector("[data-ecad-apply-outcome]")?.textContent ?? ""')
  result.shots.push(await shot(cdp, directory, '08b-apply-outcome.png'))
  await evaluate(cdp, '(() => { const panel = document.querySelector("[data-ecad-apply-outcome]"); const buttons = panel ? [...panel.querySelectorAll("button")] : []; buttons[buttons.length - 1]?.click(); return true })()')
  await new Promise(resolveWait => setTimeout(resolveWait, 150))

  // A text entity's properties plus an open layer edit form.
  await evaluate(cdp, 'document.querySelectorAll("[data-ecad-id]").length')
  await click(cdp, await harness(cdp, 'pointOn(304, 40)'))
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
  await evaluate(cdp, 'document.querySelector("[data-ecad-layer-edit=\\"WIRES\\"]")?.click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
  result.shots.push(await shot(cdp, directory, '09-properties-layers.png'))

  // Stage a layer rename through the layer panel, then undo and redo it.
  await setInputValue(cdp, '[data-ecad-layer-rename]', 'WIRES-A')
  await evaluate(cdp, 'document.querySelector("[data-ecad-layer-rename-apply]")?.click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  result.measurements.layerDraft = await evaluate(cdp, 'document.querySelector("[data-ecad-draft]")?.textContent ?? ""')
  result.shots.push(await shot(cdp, directory, '09b-layer-staged.png'))
  await evaluate(cdp, 'document.querySelector("[data-ecad-canvas]").parentElement.focus()')
  await ctrlKey(cdp, 'z', 'KeyZ')
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  result.measurements.undoDraft = await evaluate(cdp, 'document.querySelector("[data-ecad-draft]")?.textContent ?? ""')
  await ctrlKey(cdp, 'y', 'KeyY')
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  result.measurements.redoDraft = await evaluate(cdp, 'document.querySelector("[data-ecad-draft]")?.textContent ?? ""')

  // Delete erases the selection through a staged erase op, and undo retracts it.
  await click(cdp, await harness(cdp, 'pointOn(110, 60)'))
  await new Promise(resolveWait => setTimeout(resolveWait, 120))
  await key(cdp, 'Delete', 'Delete')
  await new Promise(resolveWait => setTimeout(resolveWait, 200))
  result.measurements.deleteDraft = await evaluate(cdp, 'document.querySelector("[data-ecad-draft]")?.textContent ?? ""')
  await ctrlKey(cdp, 'z', 'KeyZ')
  await new Promise(resolveWait => setTimeout(resolveWait, 150))

  // A command preview: arm Line and pick its first point, then move.
  await evaluate(cdp, 'document.querySelector("[data-ecad-tool=\\"line\\"]")?.click()')
  await click(cdp, await harness(cdp, 'pointOn(60, 220)'))
  const previewTo = await harness(cdp, 'pointOn(150, 255)')
  await mouse(cdp, 'mouseMoved', previewTo, { buttons: 0 })
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
  result.shots.push(await shot(cdp, directory, '10-line-preview.png'))
  await key(cdp, 'Escape', 'Escape')

  // Print layout.
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.shots.push(await shot(cdp, directory, '11-print-layout.png'))
  await cdp.send('Emulation.setEmulatedMedia', { media: '' })
  result.measurements.sheetActions = await evaluate(cdp, `({
    print: Boolean(document.querySelector('[data-ecad-print]:not([disabled])')),
    svg: Boolean(document.querySelector('[data-ecad-export-svg]:not([disabled])')),
    png: Boolean(document.querySelector('[data-ecad-export-png]:not([disabled])')),
    layoutTabs: document.querySelectorAll('[role="tab"]').length,
  })`)

  // Read-only mode.
  await open('?readonly=1')
  result.measurements.readOnly = await evaluate(cdp, `({
    editable: window.__HARNESS__.editable(),
    modeSwitch: Boolean(document.querySelector('[data-ecad-mode-switch]')),
    paletteTools: document.querySelectorAll('[data-ecad-tool]').length,
    writeControls: document.querySelectorAll('[data-ecad-tool="line"], [data-ecad-tool="move"], [data-ecad-stage-erase]').length,
    layerMutation: document.querySelectorAll('[data-ecad-layer-create]').length,
  })`)
  result.shots.push(await shot(cdp, directory, '12-read-only.png'))

  // A 10k-primitive sheet: the responsiveness claim.
  await open('?large=1')
  result.measurements.large = await evaluate(cdp, '({ renderMs: window.__HARNESS__.renderMs, primitives: window.__HARNESS__.primitives, modelEntities: window.__HARNESS__.model.stats.entities })')
  result.shots.push(await shot(cdp, directory, '13-large-sheet.png'))
  return result
}

/** The whole run. */
async function main() {
  if (!existsSync(FACE)) throw new Error(`the committed face artifact is missing: ${FACE} (run node scripts/build-ecad-face.mjs)`)
  const directory = join(OUT, 'page')
  mkdirSync(OUT, { recursive: true })
  console.log(`harness page: ${directory}`)
  await preparePage(directory)
  const chrome = findChrome()
  const port = 9500 + (process.pid % 400)
  const profile = join(directory, 'profile')
  const child = spawn(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--allow-file-access-from-files',
    '--force-device-scale-factor=1',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,980',
    'about:blank',
  ], { stdio: 'ignore' })
  try {
    await waitForDevtools(port)
    const cdp = await connectPage(port)
    const result = await capture(cdp, OUT)
    const summary = { out: OUT, chrome, ...result }
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify({ out: OUT, shots: result.shots.length, measurements: result.measurements, pageErrors: result.pageErrors }, null, 2))
    if (result.pageErrors.length > 0) process.exitCode = 1
  } finally {
    child.kill()
    await new Promise(resolveWait => setTimeout(resolveWait, 400))
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // A locked profile is left for the OS to clean up.
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
