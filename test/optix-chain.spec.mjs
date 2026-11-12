import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { chainReport, ocrProbe, tesseractInstallCommand, TESSERACT_PACKAGE_ID } from '../packages/optix/lib/chain.js'

/**
 * The Optix preview chain is four external preconditions the plugin neither starts nor
 * installs, so the contract that matters is what `optix_status` says when one is missing:
 * the first unmet link names itself. These specs run against a stub CDP endpoint and a
 * stub emulator, never against Studio.
 */

/**
 * Serve one loopback port; the CDP paths answer and everything else answers as the emulator would.
 * @param pages - Targets `/json/list` reports, built once the port is known.
 * @param emulatorStatus - Status the emulator path answers with.
 * @returns The server and its port.
 */
const serve = (pages, emulatorStatus = 200) => new Promise(resolve => {
  const server = createServer((request, response) => {
    if (request.url === '/json/version') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify({ Browser: 'HeadlessChrome/140.0.0.0' }))
      return
    }
    if (request.url === '/json/list') {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end(JSON.stringify(pages(port)))
      return
    }
    response.writeHead(emulatorStatus, { 'content-type': 'text/html' })
    response.end('<html>emulator</html>')
  })
  let port = 0
  server.listen(0, '127.0.0.1', () => {
    port = server.address().port
    resolve({ server, port })
  })
})

/** Run against a live stub, then close it. */
const withServer = async (pages, emulatorStatus, run) => {
  const { server, port } = await serve(pages, emulatorStatus)
  try {
    return await run(port)
  } finally {
    await new Promise(resolve => server.close(resolve))
  }
}

/** A port nothing is listening on any more. */
const closedPort = async () => {
  const { server, port } = await serve(() => [])
  await new Promise(resolve => server.close(resolve))
  return port
}

const settings = (port, overrides = {}) => ({
  preview: true,
  cdpUrl: `http://127.0.0.1:${port}`,
  previewUrl: `http://127.0.0.1:${port}/`,
  allowPreviewInput: false,
  requestTimeoutMs: 1000,
  ocr: null,
  ...overrides,
})

const oneTab = (port) => [{ type: 'page', url: `http://127.0.0.1:${port}/` }]

test('names the browser as the first missing link when nothing listens', async () => {
  const chain = await chainReport(settings(await closedPort()), AbortSignal.timeout(5000))
  assert.equal(chain.browser.listening, false)
  assert.equal(chain.emulator.listening, false)
  assert.ok(chain.browser.error)
  assert.match(chain.next, /--remote-debugging-port/)
})

test('names the preview switch before it probes any endpoint', async () => {
  const chain = await chainReport(settings(await closedPort(), { preview: false }), AbortSignal.timeout(5000))
  assert.match(chain.next, /set preview to true/)
})

test('reports the chain ready when exactly one tab matches the preview URL', async () => {
  await withServer(oneTab, 200, async (port) => {
    const chain = await chainReport(settings(port), AbortSignal.timeout(5000))
    assert.equal(chain.browser.listening, true)
    assert.equal(chain.browser.version, 'HeadlessChrome/140.0.0.0')
    assert.equal(chain.emulator.listening, true)
    assert.equal(chain.emulator.status, 200)
    assert.equal(chain.preview_tabs, 1)
    assert.equal(chain.next, '')
  })
})

test('counts only tabs that address the configured preview URL', async () => {
  await withServer((port) => [
    { type: 'page', url: `http://127.0.0.1:${port}/` },
    { type: 'page', url: `http://127.0.0.1:${port}/detail` },
    { type: 'page', url: 'http://127.0.0.1:9999/' },
    { type: 'iframe', url: `http://127.0.0.1:${port}/` },
    { type: 'page' },
  ], 200, async (port) => {
    const chain = await chainReport(settings(port), AbortSignal.timeout(5000))
    assert.equal(chain.preview_tabs, 1)
    assert.equal(chain.next, '')
  })
})

test('names the tab rule when the matching count is not one', async () => {
  await withServer((port) => [
    { type: 'page', url: `http://127.0.0.1:${port}/` },
    { type: 'page', url: `http://127.0.0.1:${port}/` },
  ], 200, async (port) => {
    const chain = await chainReport(settings(port), AbortSignal.timeout(5000))
    assert.equal(chain.preview_tabs, 2)
    assert.match(chain.next, /exactly one open tab/)
  })
})

test('names the emulator when the browser answers and the emulator does not', async () => {
  const dead = await closedPort()
  await withServer(oneTab, 200, async (port) => {
    const chain = await chainReport(settings(port, { previewUrl: `http://127.0.0.1:${dead}/` }), AbortSignal.timeout(5000))
    assert.equal(chain.browser.listening, true)
    assert.equal(chain.emulator.listening, false)
    assert.match(chain.next, /Nothing serves/)
  })
})

test('treats any HTTP answer as the emulator being up', async () => {
  await withServer(oneTab, 404, async (port) => {
    const chain = await chainReport(settings(port), AbortSignal.timeout(5000))
    assert.equal(chain.emulator.listening, true)
    assert.equal(chain.emulator.status, 404)
  })
})

test('names a configured OCR executable that is not installed', async () => {
  await withServer(oneTab, 200, async (port) => {
    const chain = await chainReport(settings(port, {
      ocr: { executable: 'tesseract-not-here', language: 'eng', tessdataDirectory: 'C:/definitely-not-here' },
    }), AbortSignal.timeout(5000))
    assert.equal(chain.ocr.configured, true)
    assert.equal(chain.ocr.installed, false)
    assert.match(chain.next, /was not found/)
  })
})

test('names missing language data when the executable is present', async () => {
  const tessdata = await mkdtemp(join(tmpdir(), 'optix-chain-'))
  try {
    await withServer(oneTab, 200, async (port) => {
      const chain = await chainReport(settings(port, {
        ocr: { executable: process.execPath, language: 'eng', tessdataDirectory: tessdata },
      }), AbortSignal.timeout(5000))
      assert.equal(chain.ocr.installed, true)
      assert.equal(chain.ocr.traineddata, false)
      assert.match(chain.next, /is not in/)
    })
  } finally {
    await rm(tessdata, { recursive: true, force: true })
  }
})

test('propagates the caller abort instead of reporting a dead chain', async () => {
  await assert.rejects(chainReport(settings(9), AbortSignal.abort()), (error) => error.name === 'AbortError')
})

test('in launch mode the CDP endpoint is not a precondition', async () => {
  await withServer(oneTab, 200, async (port) => {
    const chain = await chainReport(settings(port, {
      browser: 'launch',
      browserPath: process.execPath,
      previewUrl: `http://127.0.0.1:${await closedPort()}/`,
    }), AbortSignal.timeout(5000))
    assert.equal(chain.browser.mode, 'launch')
    assert.equal(chain.browser.cdp_url, undefined)
    assert.equal(chain.browser.launchable, true)
    assert.equal(chain.emulator.listening, false)
    assert.match(chain.next, /Nothing serves/)
  })
})

test('in launch mode a browser that is not installed names itself first', async () => {
  await withServer(oneTab, 200, async (port) => {
    const chain = await chainReport(settings(port, {
      browser: 'launch',
      browserPath: 'C:/definitely-not-here/browser.exe',
    }), AbortSignal.timeout(5000))
    assert.equal(chain.browser.launchable, false)
    assert.match(chain.next, /No Chromium-family browser is installed/)
  })
})

test('in launch mode the open-tab rule does not apply', async () => {
  await withServer(() => [], 200, async (port) => {
    const chain = await chainReport(settings(port, {
      browser: 'launch',
      browserPath: process.execPath,
    }), AbortSignal.timeout(5000))
    assert.equal(chain.preview_tabs, 0)
    assert.equal(chain.next, '')
  })
})

/**
 * Point the install-root and PATH probes at a scratch directory, so the OCR questions answer
 * the same way on every machine instead of depending on what this host happens to have.
 * @param files - Files to create under the scratch root, by relative path.
 * @param run - Called with the scratch root.
 * @returns Whatever `run` returned.
 */
const withFakeHost = async (files, run) => {
  const root = await mkdtemp(join(tmpdir(), 'dsh-optix-ocr-'))
  const names = ['PROGRAMFILES', 'PROGRAMFILES(X86)', 'LOCALAPPDATA', 'PATH']
  const saved = Object.fromEntries(names.map(name => [name, process.env[name]]))
  try {
    for (const [relative, contents] of Object.entries(files)) {
      const target = join(root, relative)
      await mkdir(join(target, '..'), { recursive: true })
      await writeFile(target, contents)
    }
    for (const name of names) process.env[name] = root
    return await run(root)
  } finally {
    for (const [name, value] of Object.entries(saved)) process.env[name] = value
    await rm(root, { recursive: true, force: true })
  }
}

test('an OCR install that is not there says so and offers no command it cannot run', async () => {
  await withFakeHost({}, async () => {
    const probe = await ocrProbe(null)
    assert.deepEqual(
      { configured: probe.configured, installed: probe.installed, discovered: probe.discovered, traineddata: probe.traineddata },
      { configured: false, installed: false, discovered: '', traineddata: false },
    )
    assert.deepEqual(await tesseractInstallCommand(), [])
  })
})

test('the OCR install command names the Windows package and no Python footprint', async () => {
  await withFakeHost({ winget: '@echo off', 'winget.cmd': '@echo off' }, async (root) => {
    const command = await tesseractInstallCommand()
    assert.ok(command[0].startsWith(root), `${command[0]} is not the scratch winget`)
    assert.deepEqual(command.slice(1), [
      'install',
      '--id',
      TESSERACT_PACKAGE_ID,
      '--accept-package-agreements',
      '--accept-source-agreements',
    ])
  })
})

test('a configured Tesseract with its language data reports ready', async () => {
  await withFakeHost({ 'ocr/tesseract.exe': '', 'ocr/tessdata/eng.traineddata': '' }, async (root) => {
    const probe = await ocrProbe({
      executable: join(root, 'ocr', 'tesseract.exe'),
      language: 'eng',
      tessdataDirectory: join(root, 'ocr', 'tessdata'),
    })
    assert.deepEqual({ installed: probe.installed, traineddata: probe.traineddata }, { installed: true, traineddata: true })
  })
})

test('missing language data is named separately from a present executable', async () => {
  await withFakeHost({ 'ocr/tesseract.exe': '' }, async (root) => {
    const probe = await ocrProbe({
      executable: join(root, 'ocr', 'tesseract.exe'),
      language: 'eng',
      tessdataDirectory: join(root, 'ocr', 'tessdata'),
    })
    assert.deepEqual({ installed: probe.installed, traineddata: probe.traineddata }, { installed: true, traineddata: false })
  })
})

test('Tesseract installed while the row points nowhere is discovered, not reinstalled', async () => {
  await withFakeHost({ 'Tesseract-OCR/tesseract.exe': '', 'Tesseract-OCR/tessdata/eng.traineddata': '' }, async (root) => {
    const probe = await ocrProbe(null)
    assert.equal(probe.discovered, join(root, 'Tesseract-OCR', 'tesseract.exe'))
    assert.equal(probe.traineddata, true)
  })
})

// The live machine put its language data beside the executable and the row left the
// directory empty, so an empty value has to mean the installer's own tessdata.
test('an empty tessdata directory falls back to the installer tessdata beside the executable', async () => {
  await withFakeHost({ 'ocr/tesseract.exe': '', 'ocr/tessdata/eng.traineddata': '' }, async (root) => {
    const probe = await ocrProbe({
      executable: join(root, 'ocr', 'tesseract.exe'),
      language: 'eng',
      tessdataDirectory: '',
    })
    assert.deepEqual(
      { installed: probe.installed, tessdata: probe.tessdata, traineddata: probe.traineddata },
      { installed: true, tessdata: join(root, 'ocr', 'tessdata'), traineddata: true },
    )
  })
})

test('a chain probe outside a tool call still answers', async () => {
  const port = await closedPort()
  await withFakeHost({ 'Google/Chrome/Application/chrome.exe': '' }, async () => {
    const chain = await chainReport(settings(port, { browser: 'launch' }))
    assert.equal(chain.browser.launchable, true)
    assert.equal(chain.emulator.listening, false)
    assert.match(chain.next, /optix_emulator with action start/)
  })
})
