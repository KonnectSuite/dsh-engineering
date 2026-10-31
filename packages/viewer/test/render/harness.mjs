/**
 * End-to-end harness for the ladder face.
 *
 * It builds the page the shipped artifact expects (React from `window`, the one
 * shell primitive stubbed), serves it from a loopback server together with a
 * real .L5X export, and drives it with the system Chrome through
 * `playwright-core`. The face under test is the built `packages/viewer/lib/client.js`
 * — the same bytes the shell loads — so a rendering regression is measured on
 * the artifact, not on a rebuilt copy of the sources.
 *
 * The measurement is a leaf-text sweep over the ladder pane: every element that
 * owns text and overflows its own box is clipped to the reader. That is the
 * invariant the shell's UI claim rests on, so it is the one asserted.
 */

import { createServer } from 'node:http'
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { pipeline } from 'node:stream/promises'
import { Readable } from 'node:stream'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO = resolve(HERE, '../../../..')
const HARNESS = join(REPO, '.harness')
const VENDOR = join(REPO, '.harness-vendor')

/** Chrome first, then Edge: the same order the other renderers use. */
const BROWSERS = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
]

export function findBrowser() {
  return BROWSERS.find(candidate => existsSync(candidate))
}

function pnpmPackage(name) {
  const store = join(REPO, 'node_modules/.pnpm')
  const entry = readdirSync(store).filter(candidate => candidate.startsWith(`${name}@`)).sort().at(-1)
  if (entry === undefined) throw new Error(`harness: ${name} is not installed under node_modules/.pnpm`)
  return join(store, entry, 'node_modules', name)
}

async function download(url, target) {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`harness: ${url} answered ${response.status}`)
  mkdirSync(dirname(target), { recursive: true })
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target))
}

async function unzipTarball(tarball, target) {
  const require = createRequire(import.meta.url)
  const zlib = require('node:zlib')
  // React ships a plain tar inside the gzip; the harness needs only the package
  // tree, so the entries are extracted one by one without a tar dependency.
  const archive = zlib.gunzipSync(readFileSync(tarball))
  let offset = 0
  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512)
    if (header.every(byte => byte === 0)) break
    const name = header.subarray(0, 100).toString('utf8').replace(/\0.*$/su, '')
    const size = Number.parseInt(header.subarray(124, 136).toString('utf8').trim() || '0', 8)
    offset += 512
    const body = archive.subarray(offset, offset + size)
    offset += Math.ceil(size / 512) * 512
    if (name.endsWith('/')) continue
    const relative = name.replace(/^package\//u, '')
    const destination = join(target, relative)
    mkdirSync(dirname(destination), { recursive: true })
    writeFileSync(destination, body)
  }
}

/** React 19's DOM renderer is a peer of the shell, not of this repository. */
async function ensureVendor() {
  if (existsSync(join(VENDOR, 'react-dom/package.json')) && existsSync(join(VENDOR, 'scheduler/package.json'))) return
  const modules = {
    'react-dom': '19.3.1',
    'scheduler': '0.28.0',
  }
  for (const [name, version] of Object.entries(modules)) {
    const tarball = join(VENDOR, `${name}-${version}.tgz`)
    const target = join(VENDOR, name)
    if (existsSync(join(target, 'package.json'))) continue
    process.stdout.write(`harness: fetching ${name}@${version} for the page\n`)
    await download(`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, tarball)
    await unzipTarball(tarball, target)
  }
}

const PRIMITIVES = `window.__PRIMITIVES__ = {
  MenuSurface: props => props.children ?? null,
  MenuItem: props => props.children ?? null,
}
`

/** Console capture installed before the face loads: React's warnings carry the
 * offending key as an argument, and only the page can stringify it in order. */
const CONSOLE_HOOK = `window.__CONSOLE__ = []
const realError = console.error
console.error = (...args) => {
  try { window.__CONSOLE__.push(args.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join(' ')) } catch { window.__CONSOLE__.push('unstringifiable console.error') }
  realError.apply(console, args)
}
`

/** The shell's loader: capture the plugin instead of mounting it into a slot. */
const LOADER = `window.__ModuleLoader__ = { load: plugin => { window.__L5X_CAPTURED__ = plugin } }
`

const REACT_ENTRY = `
import * as React from 'react'
import * as JSX from 'react/jsx-runtime'
import * as ReactDOM from 'react-dom'
import { createRoot } from 'react-dom/client'
window.__REACT__ = React
window.__JSX__ = JSX
window.__REACT_DOM__ = ReactDOM
window.__CREATE_ROOT__ = createRoot
`

function escape(text) {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
}

/**
 * Script bodies are not HTML: only a literal closing tag would end the block, so
 * the bytes are inserted unchanged apart from that one sequence.
 */
function inline(code) {
  return code.replace(/<\/script/giu, '<\\/script')
}

async function page({ face, xml, width }) {
  const esbuild = createRequire(import.meta.url)(join(pnpmPackage('esbuild'), 'lib/main.js'))
  mkdirSync(HARNESS, { recursive: true })
  const alias = {
    'react': pnpmPackage('react'),
    'react/jsx-runtime': join(pnpmPackage('react'), 'jsx-runtime.js'),
    'react-dom': join(VENDOR, 'react-dom'),
    'react-dom/client': join(VENDOR, 'react-dom/client.js'),
    'scheduler': join(VENDOR, 'scheduler'),
  }
  const build = async (options) => {
    const result = await esbuild.build({
      bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2022',
      jsx: 'automatic', logLevel: 'silent', ...options,
    })
    return result.outputFiles[0].text
  }
  const vite = await build({ stdin: { contents: REACT_ENTRY, resolveDir: REPO, sourcefile: 'react-entry.js' }, alias })
  const mount = await build({ entryPoints: [join(HERE, 'mount.ts')], alias: {} })
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>ladder face harness</title>
<style>html,body{margin:0;height:100%;background:#f6f7f9;font:13px/1.45 "Segoe UI",sans-serif}
#root{height:100vh;display:flex;flex-direction:column}</style></head>
<body><div id="root"></div>
<script>${inline(CONSOLE_HOOK)}</script>
<script>${inline(LOADER)}</script>
<script>${inline(PRIMITIVES)}</script>
<script>${inline(vite)}</script>
<script>${inline(readFileSync(face, 'utf8'))}</script>
<script>${inline(mount)}</script>
</body></html>`
  writeFileSync(join(HARNESS, 'index.html'), html)
  writeFileSync(join(HARNESS, 'fixture.L5X'), xml)
  writeFileSync(join(HARNESS, 'measure.js'), MEASURE)
  return HARNESS
}

const MEASURE = `(() => {
  const pane = document.querySelector('[data-l5x-project-view]')
  if (pane === null) return { error: 'no ladder pane' }
  const clipped = []
  /* The sweep covers the rungs, not the navigator: a tree row or a table cell is
     allowed to shorten a name (Studio's organizer does), a rung is not. */
  for (const element of pane.querySelectorAll('[data-l5x-rung] *')) {
    if (element.children.length > 0) continue
    const text = (element.textContent ?? '').trim()
    if (text === '') continue
    const width = element.scrollWidth - element.clientWidth
    const height = element.scrollHeight - element.clientHeight
    if (width > 1 || height > 1) {
      clipped.push({
        text: text.length > 90 ? text.slice(0, 90) + '…' : text,
        width, height,
        tag: element.tagName.toLowerCase(),
      })
    }
  }
  const blocks = [...pane.querySelectorAll('[data-l5x-instruction]')].map(element => {
    const mnemonic = element.querySelector('strong')?.textContent?.trim() ?? ''
    const tags = element.querySelectorAll('[data-l5x-tag-name]').length
    const rows = [...element.querySelectorAll('[data-l5x-operand-row]')].map(row => ({
      label: row.querySelector('[data-l5x-operand-label]')?.textContent?.trim() ?? '',
      operand: row.querySelector('[data-l5x-operand]')?.textContent?.trim() ?? '',
      value: row.querySelector('[data-l5x-operand-value]')?.textContent?.trim() ?? '',
    }))
    return { mnemonic, tags, rows }
  })
  const boxes = [...pane.querySelectorAll('[data-l5x-instruction]')].slice(0, 6).map(element => {
    const rect = element.getBoundingClientRect()
    return {
      text: (element.textContent ?? '').trim().slice(0, 60),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      top: Math.round(rect.top),
      children: [...element.children].map(child => ({
        width: Math.round(child.getBoundingClientRect().width),
        text: (child.textContent ?? '').trim().slice(0, 40),
      })),
    }
  })
  const layout = [...pane.querySelectorAll('[data-l5x-rung]')].slice(0, 3).map(section => ({
    rung: section.getAttribute('data-rung'),
    height: Math.round(section.getBoundingClientRect().height),
    items: [...section.querySelectorAll('[data-l5x-instruction]')].map(element => {
      const rect = element.getBoundingClientRect()
      const tag = element.querySelector('[data-l5x-tag-name]')?.getBoundingClientRect()
      const comment = element.querySelector('[data-l5x-instruction-comment]')?.getBoundingClientRect()
      return {
        mnemonic: element.querySelector('strong')?.textContent?.trim() ?? '',
        top: Math.round(rect.top),
        height: Math.round(rect.height),
        tag: tag === undefined ? null : { top: Math.round(tag.top), bottom: Math.round(tag.bottom) },
        comment: comment === undefined ? null : { top: Math.round(comment.top), bottom: Math.round(comment.bottom) },
      }
    }),
  }))
  const labels = [...pane.querySelectorAll('[data-l5x-tag-name]')].map(element => {
    const rect = element.getBoundingClientRect()
    const owner = element.closest('[data-l5x-instruction]')?.getBoundingClientRect()
    return {
      text: (element.textContent ?? '').trim(),
      left: Math.round(rect.left), right: Math.round(rect.right),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      ownerLeft: owner === undefined ? null : Math.round(owner.left),
      ownerRight: owner === undefined ? null : Math.round(owner.right),
    }
  })
  const overlaps = []
  for (let first = 0; first < labels.length; first += 1) {
    for (let second = first + 1; second < labels.length; second += 1) {
      const a = labels[first]
      const b = labels[second]
      const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (across > 1 && down > 1) overlaps.push(a.text + ' / ' + b.text)
    }
  }
  const comments = [...pane.querySelectorAll('[data-l5x-instruction-comment]')].map(element => {
    const rect = element.getBoundingClientRect()
    return {
      text: (element.textContent ?? '').trim(),
      left: Math.round(rect.left), right: Math.round(rect.right),
      top: Math.round(rect.top), bottom: Math.round(rect.bottom),
    }
  })
  const commentOverlaps = []
  for (let first = 0; first < comments.length; first += 1) {
    for (let second = first + 1; second < comments.length; second += 1) {
      const a = comments[first]
      const b = comments[second]
      const across = Math.min(a.right, b.right) - Math.max(a.left, b.left)
      const down = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      if (across > 4 && down > 4) commentOverlaps.push(a.text.slice(0, 40) + ' / ' + b.text.slice(0, 40))
    }
  }
  return {
    width: pane.clientWidth,
    documentHeight: document.documentElement.scrollHeight,
    labels,
    overlaps,
    commentOverlaps,
    escaped: labels.filter(label => label.ownerLeft !== null && (label.left < label.ownerLeft - 1 || label.right > label.ownerRight + 1)).map(label => label.text),
    layout,
    paneHeight: Math.round(pane.getBoundingClientRect().height),
    rungs: pane.querySelectorAll('[data-rung]').length,
    instructions: pane.querySelectorAll('[data-l5x-instruction]').length,
    heading: document.body.innerText.split('\\n').slice(0, 6),
    logged: window.__CONSOLE__,
    clipped,
    blocks,
    boxes,
  }
})()`

/** The assertions the release evidence rests on. */
export function judge(measurement, options = {}) {
  const failures = []
  const requireValues = options.requireValues ?? true
  if (measurement.error !== undefined) return [measurement.error]
  if (measurement.instructions === 0) failures.push('no instruction rendered, so nothing was verified')
  if (measurement.clipped.length > 0) {
    failures.push(`${measurement.clipped.length} clipped text node(s): ${measurement.clipped.slice(0, 6).map(item => `"${item.text}"`).join(', ')}`)
  }
  for (const line of measurement.logged ?? []) failures.push(`console: ${line}`)
  const timers = measurement.blocks.filter(block => ['TON', 'TOF', 'RTO'].includes(block.mnemonic))
  for (const timer of timers) {
    const labels = timer.rows.map(row => row.label)
    if (labels.some(label => /^\\d+$/u.test(label))) {
      failures.push(`${timer.mnemonic} labels its operands by index (${labels.join('/')}) instead of Timer/Preset/Accumulator`)
      break
    }
  }
  const valued = measurement.blocks.find(block => block.rows.some(row => row.value !== ''))
  if (requireValues && valued === undefined) failures.push('no operand value chip rendered, so the exported values were not shown')
  const doubled = measurement.blocks.filter(block => block.tags > 1)
  if (doubled.length > 0) failures.push(`${doubled.length} instruction(s) painted more than one tag label: ${doubled.map(block => block.mnemonic).join(', ')}`)
  if (measurement.overlaps.length > 0) failures.push(`${measurement.overlaps.length} overlapping tag label(s): ${measurement.overlaps.slice(0, 4).join(' | ')}`)
  if ((measurement.commentOverlaps ?? []).length > 0) {
    failures.push(`${measurement.commentOverlaps.length} instruction comment(s) overprinting a neighbour: ${measurement.commentOverlaps.slice(0, 3).join(' | ')}`)
  }
  if (measurement.escaped.length > 0) failures.push(`${measurement.escaped.length} tag label(s) escaping their cell: ${measurement.escaped.slice(0, 4).join(' | ')}`)
  return failures
}

/**
 * Build the page, drive it, screenshot it and judge the result.
 *
 * @param {object} options
 * @param {string} [options.file] .L5X export to render, repo-relative.
 * @param {string} [options.shot] Screenshot path; PNG is written there.
 * @param {number} [options.width] Viewport width.
 * @param {number} [options.height] Viewport height.
 * @param {boolean} [options.bundle] Mount the package's shipped `lib/client.js`
 *   (both faces merged under one registration) instead of this face's artifact.
 * @param {boolean} [options.requireValues] Assert the exported values reached the
 *   screen. False only where the export records no values for the routine.
 */
export async function renderLadderFace(options = {}) {
  const file = resolve(REPO, options.file ?? '../_e2e/out/CT9-Source.L5X')
  if (!existsSync(file)) throw new Error(`harness: no export at ${file}`)
  const shot = options.shot === undefined ? undefined : resolve(REPO, options.shot)
  const width = options.width ?? 1680
  const height = options.height ?? 1200
  const executablePath = findBrowser()
  if (executablePath === undefined) throw new Error('harness: neither Chrome nor Edge is installed')
  await ensureVendor()
  const face = options.bundle === true ? join(REPO, 'lib/client.js') : join(REPO, 'packages/viewer/lib/client.js')
  if (!existsSync(face)) {
    throw new Error(`harness: ${face} is missing; run node scripts/build-viewer-face.mjs${options.bundle === true ? ' and node scripts/build-client.mjs' : ''}`)
  }
  const root = await page({ face, xml: readFileSync(file, 'utf8'), width })

  const { chromium } = await import('playwright-core')
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/fixture') {
      response.writeHead(200, { 'content-type': 'application/xml' })
      response.end(readFileSync(file))
      return
    }
    const target = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    if (!existsSync(join(root, target))) {
      response.writeHead(404, { 'content-type': 'text/plain' })
      response.end('not found')
      return
    }
    response.writeHead(200, { 'content-type': extname(target) === '.js' ? 'text/javascript' : 'text/html' })
    response.end(readFileSync(join(root, target)))
  })
  await new Promise(done => server.listen(0, '127.0.0.1', done))
  const address = `http://127.0.0.1:${server.address().port}/`
  const browser = await chromium.launch({ executablePath, headless: true, args: ['--force-device-scale-factor=1', '--hide-scrollbars'] })
  const problems = []
  try {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 })
    const tab = await context.newPage()
    tab.on('pageerror', error => { problems.push(`page error: ${error.message}`) })
    await tab.goto(address, { waitUntil: 'load' })
    let state
    try {
      const harness = await tab.waitForFunction(() => window.__HARNESS__, undefined, { timeout: 20_000 })
      state = await harness.jsonValue()
    } catch {
      throw new Error(`harness: the page never reported a state; ${problems.join('; ') || 'no console output'}`)
    }
    if (state.status !== 'mounted') throw new Error(`harness: ${state.status}: ${state.detail ?? ''}`)
    await tab.waitForFunction(() => document.querySelectorAll('[data-l5x-instruction]').length > 0, undefined, { timeout: 30_000 })
    // Every routine the organizer lists: the row prints an icon, the name and a
    // language tag, which is what separates a routine from a program or a task.
    const discovered = await tab.evaluate(() => [...document.querySelectorAll('[data-l5x-project-view] button')]
      .map(button => (button.textContent ?? '').trim())
      .filter(text => /^(?:\W+)?\S+ (?:RLL|ST|FBD|SFC|IL)$/u.test(text))
      .map(text => text.replace(/^\W+/u, '').split(/\s+/u)[0]))
    /**
     * Select one routine the way a reader does: click its organizer row.
     * @param {string} name Routine name as the organizer prints it.
     */
    const openRoutine = async name => {
      // The organizer labels a routine with its name plus a language tag, so the
      // row is matched on the leading name and clicked the way a reader would.
      const clicked = await tab.evaluate(routineName => {
        const buttons = [...document.querySelectorAll('button')]
        const row = buttons.find(element => (element.textContent ?? '').replace(/^\W+/u, '').trim().startsWith(`${routineName} `))
        if (row === undefined) return { ok: false, sample: buttons.map(button => (button.textContent ?? '').trim().slice(0, 40)).slice(0, 60) }
        row.click()
        return { ok: true }
      }, name)
      if (!clicked.ok) throw new Error(`harness: no organizer row for routine ${name}; buttons: ${clicked.sample.join(' | ')}`)
      await tab.waitForFunction(routineName => {
        const current = document.querySelector('[data-l5x-project-view]')
        return current !== null && (current.textContent ?? '').includes(`/ ${routineName}`)
      }, name, { timeout: 10_000 })
      await tab.waitForTimeout(400)
    }
    if (options.routine !== undefined) await openRoutine(options.routine)
    await tab.waitForTimeout(400)
    const probe = options.probe === undefined ? undefined : await tab.evaluate(options.probe)
    if (shot !== undefined) {
      mkdirSync(dirname(shot), { recursive: true })
      await tab.screenshot({ path: shot, fullPage: false })
    }
    const measurement = await tab.evaluate(MEASURE)
    const scenario = options.scenario === undefined ? undefined : await options.scenario(tab)
    const cases = [{ routine: options.routine ?? '(default view)', measurement, failures: judge(measurement, options) }]
    // One browser per batch: every routine of an export is visited in this page.
    const queue = options.routines === '*' ? discovered : (options.routines ?? [])
    for (const [index, name] of queue.entries()) {
      if (name === options.routine) continue
      await openRoutine(name)
      const other = await tab.evaluate(MEASURE)
      const routineShot = options.shots === undefined ? undefined : join(options.shots, `routine-${String(index).padStart(2, '0')}.png`)
      if (routineShot !== undefined) {
        mkdirSync(dirname(routineShot), { recursive: true })
        await tab.screenshot({ path: routineShot, fullPage: false })
      }
      cases.push({ routine: name, measurement: other, shot: routineShot, failures: judge(other, options) })
    }
    return { measurement, cases, discovered, probe, scenario, failures: [...problems, ...cases.flatMap(item => item.failures), ...(scenario?.failures ?? [])], shot, address }
  } finally {
    await browser.close()
    await new Promise(done => server.close(done))
  }
}
