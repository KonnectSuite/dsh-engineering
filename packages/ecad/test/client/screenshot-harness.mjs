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
import { spawn, spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, copyFileSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const HARNESS = join(HERE, 'harness')
const FACE = join(ROOT, 'packages/ecad/lib/client.js')

/**
 * How long one DevTools call may take. A call that never answers used to stop the run
 * silently, which is the worst possible failure for a tool whose whole job is to show
 * what the face is doing.
 */
const CDP_TIMEOUT_MS = 30_000

/**
 * Where the screenshots go.
 *
 * The page directory carries the browser profile, and Chrome re-launches itself, so the
 * process this harness spawned is not the one holding the profile: a killed or orphaned
 * run leaves that directory locked. A fresh name per run means the next run never has to
 * win the lock. It does not mean the leftovers are free: a Chrome profile costs over a
 * hundred megabytes once the browser has downloaded its component and on-device models
 * into it, so a run prunes the page directories its earlier runs left behind and keeps
 * its own small. (`artifacts/` is ignored, not tracked, so the cost is local disk only.)
 */
const outArg = process.argv.indexOf('--out')
const OUT = resolve(outArg === -1 ? join(tmpdir(), 'ecad-cad-face-shots') : process.argv[outArg + 1])
const PAGE = `page-${process.pid}`

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
    // A call whose response never arrives (a crashed renderer, a lost socket) used to
    // hang the whole run with no output at all. Name the call that stopped answering.
    let timer
    return Promise.race([
      promise,
      new Promise((resolveTimeout, rejectTimeout) => {
        timer = setTimeout(
          () => rejectTimeout(new Error(`${method}: no DevTools response after ${CDP_TIMEOUT_MS}ms (id ${id})`)),
          CDP_TIMEOUT_MS,
        )
        // The watchdog must not be what keeps the process alive on a clean run.
        timer.unref?.()
      }),
    ]).finally(() => clearTimeout(timer))
  }

  /**
   * Release the socket. Left open, it holds the event loop, so a run that failed printed
   * its stack and then sat there looking like it was still working.
   */
  close() {
    for (const entry of this.pending.values()) entry.reject(new Error(`${entry.method}: the DevTools socket closed`))
    this.pending.clear()
    try {
      this.socket.close()
    } catch {
      // Already closed.
    }
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
    // A wheel event carries its deltas instead of a button press; Chrome rejects the
    // call outright when they are missing.
    ...(type === 'mouseWheel'
      ? { deltaX: options.deltaX ?? 0, deltaY: options.deltaY ?? 0 }
      : {
          button: options.button ?? 'left',
          buttons: options.buttons ?? (type === 'mouseMoved' ? 0 : 1),
          clickCount: type === 'mouseMoved' ? 0 : 1,
        }),
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

/** The Windows virtual key code of the keys this harness presses. */
function keyCodeOf(keyName) {
  if (keyName === 'Escape') return 27
  if (keyName === 'ArrowLeft') return 37
  if (keyName === 'ArrowUp') return 38
  if (keyName === 'ArrowRight') return 39
  if (keyName === 'ArrowDown') return 40
  if (keyName === '0') return 48
  if (keyName === '-') return 189
  if (keyName === '+') return 107
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
  try {
    rmSync(directory, { recursive: true, force: true })
  } catch {
    // A leftover directory from an interrupted run; this run uses its own name anyway.
  }
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

  const base = `file:///${join(directory, PAGE, 'index.html').replaceAll('\\', '/')}`
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
  result.measurements.small = await evaluate(cdp, '({ renderMs: window.__HARNESS__.renderMs, primitives: window.__HARNESS__.primitives, modelEntities: window.__HARNESS__.model.stats.entities, layers: window.__HARNESS__.layerRowCount(), hidden: window.__HARNESS__.hiddenLayerCount(), zoom: window.__HARNESS__.zoomPercent() })')
  result.shots.push(await shot(cdp, directory, '01-light-view.png'))

  // Focus mode: the pane fills the window, then returns to the sidebar.
  await evaluate(cdp, 'document.querySelector("[data-ecad-focus]").click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.focus = await evaluate(cdp, `(() => {
    const root = document.querySelector('[data-ecad-pane="drawing"]')
    const rect = root.getBoundingClientRect()
    return { pressed: document.querySelector('[data-ecad-focus]')?.getAttribute('aria-pressed') ?? '', width: Math.round(rect.width), height: Math.round(rect.height), viewport: [innerWidth, innerHeight] }
  })()`)
  result.shots.push(await shot(cdp, directory, '01b-focus-mode.png'))
  await evaluate(cdp, 'document.querySelector("[data-ecad-focus]").click()')
  await new Promise(resolveWait => setTimeout(resolveWait, 180))

  await evaluate(cdp, 'window.__HARNESS__.setTheme("dark")')
  await new Promise(resolveWait => setTimeout(resolveWait, 150))
  result.shots.push(await shot(cdp, directory, '02-dark-view.png'))
  await evaluate(cdp, 'window.__HARNESS__.setTheme("light")')

  // Zoom in through the toolbar button, twice, and read the status line back.
  const zoomBefore = await evaluate(cdp, 'window.__HARNESS__.zoomPercent()')
  const transformBefore = await evaluate(cdp, 'window.__HARNESS__.viewTransform()')
  await evaluate(cdp, 'window.__HARNESS__.clickNamed("Zoom in")')
  await evaluate(cdp, 'window.__HARNESS__.clickNamed("Zoom in")')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.zoomIn = {
    before: zoomBefore,
    after: await evaluate(cdp, 'window.__HARNESS__.zoomPercent()'),
    transformChanged: (await evaluate(cdp, 'window.__HARNESS__.viewTransform()')) !== transformBefore,
  }
  result.shots.push(await shot(cdp, directory, '03-zoomed-in.png'))

  // The keyboard on the canvas: 0 frames the sheet, the arrows pan, − zooms out.
  await evaluate(cdp, 'document.querySelector("[data-ecad-canvas]").parentElement.focus()')
  await key(cdp, '0', 'Digit0')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.extents = await evaluate(cdp, 'window.__HARNESS__.zoomPercent()')
  const arrowBefore = await evaluate(cdp, 'window.__HARNESS__.viewTransform()')
  await key(cdp, 'ArrowRight', 'ArrowRight')
  await key(cdp, 'ArrowDown', 'ArrowDown')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.arrowPan = {
    changed: (await evaluate(cdp, 'window.__HARNESS__.viewTransform()')) !== arrowBefore,
  }
  await key(cdp, '-', 'Minus')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.zoomOutKey = await evaluate(cdp, 'window.__HARNESS__.zoomPercent()')
  result.shots.push(await shot(cdp, directory, '04-keyboard-view.png'))

  // A plain left-drag pans the sheet: the read-only pane has no selection to make.
  await key(cdp, '0', 'Digit0')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  const panBefore = await evaluate(cdp, 'window.__HARNESS__.viewTransform()')
  const panFrom = await harness(cdp, 'pointOn(200, 150)')
  const panTo = { x: panFrom.x + 90, y: panFrom.y + 50 }
  await drag(cdp, panFrom, panTo, {
    steps: 8,
    during: async () => {
      result.shots.push(await shot(cdp, directory, '05-pan-drag.png'))
    },
  })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.measurements.pan = {
    before: panBefore,
    after: await evaluate(cdp, 'window.__HARNESS__.viewTransform()'),
  }

  // The wheel zooms at the cursor, and the toolbar frames the sheet again.
  const wheelBefore = await evaluate(cdp, 'window.__HARNESS__.zoomPercent()')
  await mouse(cdp, 'mouseWheel', await harness(cdp, 'pointOn(140, 90)'), { deltaX: 0, deltaY: -240 })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.measurements.wheel = {
    before: wheelBefore,
    after: await evaluate(cdp, 'window.__HARNESS__.zoomPercent()'),
  }
  await evaluate(cdp, 'window.__HARNESS__.clickNamed("Zoom extents")')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))

  // The layer panel: hide one layer, count what disappears, show it again.
  const drawnBefore = await evaluate(cdp, 'window.__HARNESS__.primitiveCount()')
  await evaluate(cdp, `(() => {
    const row = document.querySelector('[data-ecad-layer-row="WIRES"]')
    if (row === null) throw new Error('harness: the WIRES layer row is not in the panel')
    row.querySelector('button[aria-pressed]').click()
    return true
  })()`)
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.measurements.layerHide = {
    drawnBefore,
    drawnAfter: await evaluate(cdp, 'window.__HARNESS__.primitiveCount()'),
    hidden: await evaluate(cdp, 'window.__HARNESS__.hiddenLayerCount()'),
  }
  result.shots.push(await shot(cdp, directory, '06-layer-hidden.png'))
  await evaluate(cdp, `(() => {
    const row = document.querySelector('[data-ecad-layer-row="WIRES"]')
    row.querySelector('button[aria-pressed]').click()
    return true
  })()`)
  await new Promise(resolveWait => setTimeout(resolveWait, 220))
  result.measurements.layerShow = {
    drawn: await evaluate(cdp, 'window.__HARNESS__.primitiveCount()'),
    hidden: await evaluate(cdp, 'window.__HARNESS__.hiddenLayerCount()'),
  }

  // Text search: the query highlights matches on the sheet and reports them. REV is the
  // word the harness sheet carries twice (the title block and the revision note).
  await setInputValue(cdp, '[data-ecad-search] input', 'REV')
  await new Promise(resolveWait => setTimeout(resolveWait, 320))
  result.measurements.search = {
    found: await evaluate(cdp, 'window.__HARNESS__.foundCount()'),
    badge: await evaluate(cdp, 'window.__HARNESS__.matchBadge()'),
  }
  result.shots.push(await shot(cdp, directory, '07-search-highlight.png'))
  await setInputValue(cdp, '[data-ecad-search] input', 'NO-SUCH-TEXT')
  await new Promise(resolveWait => setTimeout(resolveWait, 260))
  result.measurements.searchNone = {
    found: await evaluate(cdp, 'window.__HARNESS__.foundCount()'),
    badge: await evaluate(cdp, 'window.__HARNESS__.matchBadge()'),
  }
  await setInputValue(cdp, '[data-ecad-search] input', '')
  await new Promise(resolveWait => setTimeout(resolveWait, 220))

  // The deliverable controls the pane offers and the layout tabs it carries.
  result.measurements.sheetActions = await evaluate(cdp, `({
    print: window.__HARNESS__.actionButton('Print'),
    svg: window.__HARNESS__.actionButton('Export SVG'),
    png: window.__HARNESS__.actionButton('Export PNG'),
    layoutTabs: document.querySelectorAll('[role="tab"]').length,
  })`)

  // Print layout: the sheet-only arrangement the host print dialog prints.
  await cdp.send('Emulation.setEmulatedMedia', { media: 'print' })
  await new Promise(resolveWait => setTimeout(resolveWait, 250))
  result.shots.push(await shot(cdp, directory, '11-print-layout.png'))
  await cdp.send('Emulation.setEmulatedMedia', { media: '' })

  // A DWG source: the format badge and the converter provenance in the sheet panel.
  await open('?dwg=1')
  result.measurements.dwg = await evaluate(cdp, `(() => {
    const pane = document.querySelector('[data-ecad-pane]')
    return {
      format: pane?.getAttribute('data-ecad-format') ?? '',
      state: pane?.getAttribute('data-ecad-state') ?? '',
      namesConverter: (pane?.textContent ?? '').includes('acadrust'),
    }
  })()`)
  result.shots.push(await shot(cdp, directory, '12-dwg-source.png'))

  // A 10k-primitive sheet: the responsiveness claim.
  await open('?large=1')
  result.measurements.large = await evaluate(cdp, '({ renderMs: window.__HARNESS__.renderMs, primitives: window.__HARNESS__.primitives, modelEntities: window.__HARNESS__.model.stats.entities })')
  result.shots.push(await shot(cdp, directory, '13-large-sheet.png'))
  return result
}

/**
 * Kill the browser tree a run launched against `path`.
 *
 * Chrome re-launches itself, so the process a run spawned is not the root of the tree that
 * holds the profile, and a taskkill on that dead pid reaches nothing. The launch command
 * line carries the page directory, which is unique per run, so matching on it cannot reach
 * a concurrent run or a browser the owner opened themselves.
 */
function reapDirectory(path) {
  try {
    spawnSync('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${path}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
    ], { stdio: 'ignore' })
  } catch {
    // Nothing to reap, or the shell is not available; the delete below reports the lock.
  }
}

/** The whole run. */
async function main() {
  if (!existsSync(FACE)) throw new Error(`the committed face artifact is missing: ${FACE} (run node scripts/build-ecad-face.mjs)`)
  const directory = join(OUT, PAGE)
  mkdirSync(OUT, { recursive: true })
  // A run whose profile was locked leaves a page-<pid> tree behind, and that tree is a
  // whole Chrome profile: over a hundred megabytes of downloaded models. The next run
  // clears what its predecessors could not — which means
  // reaping the browser that still holds the directory, then deleting it.
  for (const name of readdirSync(OUT)) {
    if (!name.startsWith('page-') || name === PAGE) continue
    const stale = join(OUT, name)
    reapDirectory(stale)
    let removed = false
    for (let attempt = 0; attempt < 4 && !removed; attempt += 1) {
      try {
        rmSync(stale, { recursive: true, force: true })
        removed = true
      } catch {
        await new Promise(resolveWait => setTimeout(resolveWait, 400))
      }
    }
    if (!removed) console.error(`harness: could not remove the leftover page directory ${name}; it is still locked by an orphaned browser`)
  }
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
    // A fresh profile downloads Chrome's component and on-device models into the profile
    // directory this harness owns: measured at 112.8 MB for one run, most of it a single
    // model.tflite. None of it is wanted by a page that renders a sheet model, and the
    // download is what makes the profile too large and too locked to delete afterwards.
    '--disable-component-update',
    '--disable-background-networking',
    '--disable-features=OptimizationGuideModelDownloading,OptimizationHints,Translate,MediaRouter,DialMediaRouteProvider,InterestFeedContentSuggestions',
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--window-size=1440,980',
    'about:blank',
  ], { stdio: 'ignore' })
  // On Windows the Chrome child outlives this process when it is interrupted, and its
  // locked profile then breaks the next run. Reap the whole tree on any exit path.
  const reap = () => {
    try {
      spawnSync('taskkill.exe', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
    } catch {
      try {
        child.kill()
      } catch {
        // Already gone.
      }
    }
    // The process spawned above is not the browser: Chrome re-launches itself, so the tree
    // that holds the profile has a different root and a taskkill on the dead pid reaches
    // nothing — measured as a 112.8 MB profile that survived every retry.
    reapDirectory(profile)
  }
  process.once('exit', reap)
  process.once('SIGINT', () => {
    reap()
    process.exit(130)
  })
  process.once('SIGTERM', () => {
    reap()
    process.exit(143)
  })
  let cdp
  try {
    await waitForDevtools(port)
    cdp = await connectPage(port)
    const result = await capture(cdp, OUT)
    const summary = { out: OUT, chrome, ...result }
    writeFileSync(join(OUT, 'summary.json'), JSON.stringify(summary, null, 2))
    console.log(JSON.stringify({ out: OUT, shots: result.shots.length, measurements: result.measurements, pageErrors: result.pageErrors }, null, 2))
    if (result.pageErrors.length > 0) process.exitCode = 1
  } finally {
    // Ask the browser to shut down before the socket goes away: a clean exit releases the
    // profile, which is what lets the delete below succeed instead of leaving a locked
    // hundred-megabyte directory behind.
    try {
      await cdp?.send('Browser.close', {})
    } catch {
      // The socket may already be gone; the reaper below covers it.
    }
    cdp?.close()
    // Wait for the browser to actually exit before deleting its profile: a fixed pause
    // left the directory locked and the next run died on EPERM before it started.
    await new Promise(resolveExit => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolveExit()
        return
      }
      const timer = setTimeout(resolveExit, 5_000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolveExit()
      })
    })
    reap()
    for (let attempt = 0; attempt < 6; attempt += 1) {
      try {
        rmSync(profile, { recursive: true, force: true })
        break
      } catch {
        // The browser may still be releasing one file; retry, then say so out loud rather
        // than leaving a hundred-megabyte directory in a tracked tree with no trace.
        await new Promise(resolveWait => setTimeout(resolveWait, 400))
      }
    }
    if (existsSync(profile)) {
      console.error(`harness: the browser profile survived at ${profile}; the next run removes it`)
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error))
  process.exitCode = 1
})
