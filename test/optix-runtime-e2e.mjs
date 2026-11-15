/**
 * The end-to-end run that needs no human and no desktop automation: walk the shipped Optix row through
 * phases 1, 2, 6 and 7 of the loop - scaffold a starter, start the runtime, look at the rendered screen in
 * a headless browser, read the runtime's own log, stop the runtime - by calling the tools the way an agent
 * calls them, not the modules behind them.
 *
 * Run manually (it starts the installed FTOptixRuntime.exe and a headless Chrome, so it is not part of the
 * default suite):
 *
 *   node test/optix-runtime-e2e.mjs [scratch-directory]
 *
 * What it proves: the row's tools mount, `optix_template` writes a project carrying this bundle's bridge
 * and a NetLogic node matching it, `optix_emulator start` returns only once the preview answers,
 * `optix_screenshot` renders that preview and returns a real image at the project's canvas size,
 * `optix_status` explains a bridge that is not there instead of just failing, `optix_emulator logs` reads
 * the runtime's log, and `optix_emulator stop` ends the runtime and clears the preview.
 *
 * What it cannot prove: anything behind the bridge. That needs Studio open with the project and
 * StartBridge chosen by the engineer - the two actions the loop reserves for them.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { inflateSync } from 'node:zlib'
import { existsSync } from 'node:fs'
import { mkdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const scratch = process.argv[2] ?? join(tmpdir(), `dsh-optix-e2e-${Date.now()}`)
const previewUrl = 'http://127.0.0.1:8081/'
const width = 1920
const height = 1080
const signal = AbortSignal.timeout(240000)
const step = (message) => console.log(`\n== ${message}`)

/**
 * Mount the shipped row the way the harness does, keeping the tool definitions so they can be called.
 * @returns {Promise<{ tools: Map<string, any>, saveImage: Function, images: Buffer[] }>} the mounted row.
 */
async function mount() {
  const module = await import(pathToFileURL(join(root, 'entries/optix.js')).href)
  const tools = new Map()
  const images = []
  const disposers = []
  const attachments = {
    async saveImage({ data, mediaType, name }) {
      const bytes = Buffer.from(data)
      images.push(bytes)
      return { attachmentId: `e2e-${images.length}`, name, media_type: mediaType, width: 0, height: 0 }
    },
  }
  const scope = {
    tools: {
      register(definition) {
        tools.set(definition.name, definition)
        return () => tools.delete(definition.name)
      },
    },
    get: (key) => (key === 'attachments' ? attachments : undefined),
    inject: (names, callback) => callback(scope),
    effect: (factory) => {
      const dispose = factory()
      disposers.push(dispose)
      return dispose
    },
    on: () => () => {},
    emit: () => {},
    // The row mounts the prebuilt engine as a child plugin, so the stub has to apply it to mount tools.
    plugin: (module, options) => {
      if (typeof module?.apply === 'function') module.apply(scope, options)
      return {
        dispose: async () => {
          for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose()
        },
      }
    },
    provide: () => {},
    logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
  }
  module.apply(scope, module.Config({
    allowWrites: true,
    allowDestructive: true,
    allowInvoke: true,
    preview: true,
    browser: 'launch',
    browserChannel: 'auto',
    browserHeadless: true,
    previewUrl,
    previewWidth: width,
    previewHeight: height,
    requestTimeoutMs: 60000,
  }))
  return {
    tools,
    images,
    // A mounted row keeps its preview browser and clients until they are disposed, so the run has to end
    // the way the harness ends a session.
    dispose: async () => {
      for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose()
    },
  }
}

/** Width and height out of a PNG's IHDR, so the image is measured rather than trusted. */
function pngSize(bytes) {
  assert.equal(bytes.subarray(1, 4).toString('latin1'), 'PNG', 'the preview must be a PNG')
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

/**
 * Count the distinct colours in a PNG, so "the screen rendered" is a measurement and not a file size.
 * A blank page is one colour; a drawn screen is many. Handles the 8-bit RGB and RGBA PNGs a browser
 * screenshot produces, with all five scanline filters.
 * @param bytes - The PNG file.
 * @returns Distinct colours found (capped) and how much of the image the most common one covers.
 */
function pngColours(bytes) {
  const channels = bytes[25] === 6 ? 4 : bytes[25] === 2 ? 3 : 0
  assert.ok(channels > 0, `the screenshot must be 8-bit RGB or RGBA (colour type ${bytes[25]})`)
  const parts = []
  for (let at = 8; at < bytes.length;) {
    const length = bytes.readUInt32BE(at)
    const type = bytes.subarray(at + 4, at + 8).toString('latin1')
    if (type === 'IDAT') parts.push(bytes.subarray(at + 8, at + 8 + length))
    at += 12 + length
    if (type === 'IEND') break
  }
  const raw = inflateSync(Buffer.concat(parts))
  const width = bytes.readUInt32BE(16)
  const height = bytes.readUInt32BE(20)
  const stride = width * channels
  const previous = Buffer.alloc(stride)
  const current = Buffer.alloc(stride)
  const counts = new Map()
  const paeth = (a, b, c) => {
    const p = a + b - c
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
  }
  for (let row = 0; row < height; row += 1) {
    const start = row * (stride + 1)
    const filter = raw[start]
    raw.copy(current, 0, start + 1, start + 1 + stride)
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? current[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      if (filter === 1) current[x] = (current[x] + left) & 0xff
      else if (filter === 2) current[x] = (current[x] + up) & 0xff
      else if (filter === 3) current[x] = (current[x] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) current[x] = (current[x] + paeth(left, up, upLeft)) & 0xff
    }
    for (let x = 0; x < stride; x += channels) {
      const key = `${current[x]},${current[x + 1]},${current[x + 2]}`
      counts.set(key, (counts.get(key) ?? 0) + 1)
      if (counts.size > 4096) break
    }
    current.copy(previous)
  }
  const commonest = Math.max(...counts.values())
  return { distinct: counts.size, commonest_share: Number((commonest / (width * height)).toFixed(4)) }
}

step('mount the shipped row')
const row = await mount()
const { tools, images } = row
const call = (name, args) => tools.get(name).execute(args, { signal })
console.log(`${tools.size} tools mounted: ${[...tools.keys()].sort().join(', ')}`)
for (const needed of ['optix_template', 'optix_emulator', 'optix_status', 'optix_screenshot'])
  assert.ok(tools.has(needed), `${needed} must be mounted`)

step('phase 1: optix_template scaffolds a starter')
await mkdir(scratch, { recursive: true })
const scaffolded = await call('optix_template', { template: 'arya-optix-ipc', destination: scratch, name: 'E2ELine', width, height })
const project = scaffolded.project_root ?? join(scratch, 'E2ELine')
console.log(JSON.stringify({
  project,
  bridge_version: scaffolded.bridge_version,
  replaced_bundled_bridge: scaffolded.replaced_bundled_bridge,
  screen: scaffolded.screen === undefined ? undefined : { width: scaffolded.screen.width, height: scaffolded.screen.height, changed: scaffolded.screen.changed },
  next: scaffolded.next,
}, null, 2))

step('the scaffolded copy carries this bundle, and its NetLogic node matches the bridge')
const shipped = await readFile(join(root, 'packages/optix/bridge/StudioMCPBridge.cs'), 'utf8')
const bridgeOnDisk = await readFile(join(project, 'ProjectFiles/NetSolution/StudioMCPBridge.cs'), 'utf8')
assert.equal(createHash('sha256').update(bridgeOnDisk).digest('hex'), createHash('sha256').update(shipped).digest('hex'))
const netlogic = await readFile(join(project, 'Nodes/NetLogic/NetLogic.yaml'), 'utf8')
const declared = [...netlogic.matchAll(/^\s+- Class: Method\n\s+Name: (\w+)\n/gmu)].map((hit) => hit[1]).sort()
assert.deepEqual(declared, ['CheckFormula', 'SetupProject', 'StartBridge', 'StopBridge'])
const uiYaml = await readFile(join(project, 'Nodes/UI/UI.yaml'), 'utf8')
assert.match(uiYaml, new RegExp(`Value: ${width}(?:\\.0+)?\\b`, 'u'), `the starter's window does not carry width ${width}`)
assert.match(uiYaml, new RegExp(`Value: ${height}(?:\\.0+)?\\b`, 'u'), `the starter's window does not carry height ${height}`)
assert.match(uiYaml, /Name: WebPresentationEngine[\s\S]{0,400}?Value: 8081/u, 'the starter must serve the preview port')
console.log(`bridge ${scaffolded.bridge_version} Ã‚Â· methods ${declared.join(', ')} Ã‚Â· canvas ${width}x${height} Ã‚Â· web engine on 8081`)

step('clean slate: a runtime left over from an earlier run must not be mistaken for this one')
const cleared = await call('optix_emulator', { action: 'stop', project, force: true })
console.log(JSON.stringify({ stopped: cleared.stopped, found: cleared.found, stopped_pids: cleared.stopped_pids, origins: cleared.origins, preview: cleared.preview }, null, 2))
const before = await call('optix_emulator', { action: 'status', project })
assert.equal(before.serving, false, 'the preview port must be free before the start under test')

step('phase 2: optix_emulator starts the runtime and waits for it')
const started = await call('optix_emulator', { action: 'start', project, wait_ms: 90000 })
console.log(JSON.stringify({ started: started.started, serving: started.serving, status: started.status, waited_ms: started.waited_ms, pid: started.pid, notice: started.notice?.kind, next: started.next }, null, 2))
if (started.serving !== true) {
  const logs = await call('optix_emulator', { action: 'logs', project, lines: 40 })
  console.log((logs.lines ?? []).join('\n'))
  await call('optix_emulator', { action: 'stop', project, force: true })
  throw new Error(`the runtime did not serve ${previewUrl}: ${started.diagnosis?.kind ?? 'unknown'}`)
}
assert.equal(started.started, true)
assert.ok(started.pid > 0, 'a start that serves must name the process it started')

step('phase 3 without Studio: optix_status explains the bridge that is not there')
const status = await call('optix_status', {})
const endpoint = status.endpoints[0]
console.log(JSON.stringify({
  available: endpoint.available,
  error: endpoint.error,
  diagnosis: endpoint.diagnosis,
  needs_save: endpoint.needs_save?.pending,
  emulator_listening: status.preview_chain?.emulator?.listening,
}, null, 2))
assert.equal(endpoint.available, false, 'with no Studio open the bridge must not read as available')
assert.equal(endpoint.error, 'Bridge unavailable', 'with no Studio open the status call must say what is missing')
assert.ok(Array.isArray(endpoint.diagnosis?.causes) && endpoint.diagnosis.causes.length > 0, 'the diagnosis must rank the causes')
assert.match(endpoint.diagnosis.next, /Studio/u)
assert.equal(status.preview_chain?.emulator?.listening, true, 'the status call must see the runtime this plugin started')

step('phase 6: optix_screenshot renders the served project in a headless browser')
const shot = await call('optix_screenshot', {})
const image = images.at(-1)
const size = pngSize(image)
const colours = pngColours(image)
// The starters are starting points, not demo projects: the window they ship has no UI children, so the
// honest render of a freshly scaffolded project is its own empty background. The second leg below draws a
// project that does have screens, which is where colour variety is the expected result.
const drawsContent = /Name: (?:Panel|PanelLoader|Label|Button|Rectangle|Screen)\b/u.test(uiYaml)
console.log(JSON.stringify({ url: shot.url, bytes: image.length, width: size.width, height: size.height, colours, draws_content: drawsContent }, null, 2))
assert.equal(shot.url, previewUrl)
assert.equal(size.width, width, 'the render must be the canvas width the project serves')
assert.equal(size.height, height, 'the render must be the canvas height the project serves')
if (drawsContent) {
  assert.ok(colours.distinct >= 4, `a window with content must render more than one colour (${colours.distinct})`)
} else {
  assert.equal(colours.distinct, 1, 'a starter window with no children renders one flat background')
}

step('the runtime log is readable through the tool')
const logs = await call('optix_emulator', { action: 'logs', project, lines: 40 })
console.log(JSON.stringify({ log_path: logs.log_path, bytes: logs.bytes, lines: (logs.lines ?? []).length, diagnosis: logs.diagnosis, notice: logs.notice?.kind }, null, 2))
assert.ok((logs.lines ?? []).length > 0, 'the runtime writes a log; the tool reads it back')
assert.equal(logs.diagnosis, undefined, 'a runtime that is serving has no failure to diagnose')

step('phase 7: optix_emulator stops the runtime and the preview goes dead')
const stopped = await call('optix_emulator', { action: 'stop', project })
console.log(JSON.stringify({ stopped: stopped.stopped, found: stopped.found, stopped_pids: stopped.stopped_pids, origins: stopped.origins, preview: stopped.preview }, null, 2))
assert.equal(stopped.stopped, true)
assert.equal(stopped.preview.serving, false)
const after = await call('optix_emulator', { action: 'status', project })
assert.equal(after.serving, false)
assert.deepEqual(after.pids ?? [], [])

step('phase 6b: a project that does have screens renders as a drawn screen')
// A second, optional leg: point argv[3] at any saved project with screens and the same tool has to return a
// picture with content in it. The default is the live-run project this repo's own notes name.
const drawn = process.argv[3] ?? 'C:\\Users\\KNPhu\\AryaCode\\KonnectSuite\\hmi-e2e\\AryaNewHMIProject_IPC'
if (!existsSync(join(drawn, 'Nodes'))) console.log(`skipped: no saved project at ${drawn}`)
else {
  await call('optix_emulator', { action: 'stop', project, force: true })
  const first = await call('optix_emulator', { action: 'start', project: drawn, wait_ms: 90000 })
  console.log(JSON.stringify({ project: drawn, started: first.started, serving: first.serving, waited_ms: first.waited_ms, notice: first.notice?.kind }, null, 2))
  assert.equal(first.serving, true, `${drawn} must serve its preview`)
  const drawnShot = await call('optix_screenshot', {})
  const drawnImage = images.at(-1)
  const drawnSize = pngSize(drawnImage)
  const drawnColours = pngColours(drawnImage)
  console.log(JSON.stringify({ url: drawnShot.url, bytes: drawnImage.length, width: drawnSize.width, height: drawnSize.height, colours: drawnColours }, null, 2))
  assert.ok(drawnColours.distinct >= 4, `a project with screens must render more than one colour (${drawnColours.distinct})`)
  assert.ok(drawnColours.commonest_share < 0.99, `a drawn screen must not be one colour covering everything (${drawnColours.commonest_share})`)
  const stoppedDrawn = await call('optix_emulator', { action: 'stop', project: drawn, previewUrl })
  assert.equal(stoppedDrawn.preview.serving, false)
}


if (scratch === process.argv[2]) console.log(`\nthe scratch project is left in place: ${project}`)
else {
  await rm(scratch, { recursive: true, force: true })
  console.log('\nthe scratch project was removed')
}

await row.dispose()

console.log('\nE2E OK: scaffold -> runtime serving -> rendered PNG -> diagnosis -> log -> stopped, through the row\'s own tools, with no desktop automation and no human in Studio.')

