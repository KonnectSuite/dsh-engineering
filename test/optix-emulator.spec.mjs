import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { emulatorStatus, projectFile, runtimeCandidates, startEmulator, stopEmulator } from '../packages/optix/lib/emulator.js'

/**
 * The emulator leg is the one the field session could not get past: the Studio CLI has no
 * run verb, so the only scripted route is the runtime executable under the Studio install.
 * These specs prove the discovery finds it, that a missing piece names itself instead of
 * launching something arbitrary, and that stop never touches a runtime the engineer opened.
 */

/** Scratch directories this spec makes, so the run leaves nothing behind. */
const created = []

const scratch = async (name) => {
  const root = await mkdtemp(join(tmpdir(), `dsh-optix-emulator-${name}-`))
  created.push(root)
  return root
}

after(async () => {
  for (const root of created) await rm(root, { recursive: true, force: true })
})

/** Point the install-root environment at a scratch tree so discovery is deterministic anywhere. */
const withFakeStudio = async (files, run) => {
  const root = await scratch('roots')
  const saved = {
    PROGRAMFILES: process.env.PROGRAMFILES,
    'PROGRAMFILES(X86)': process.env['PROGRAMFILES(X86)'],
  }
  for (const [relative, body] of Object.entries(files)) {
    const target = join(root, relative)
    await mkdir(join(target, '..'), { recursive: true })
    await writeFile(target, body)
  }
  process.env.PROGRAMFILES = root
  process.env['PROGRAMFILES(X86)'] = root
  try {
    return await run(root)
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

test('the runtime is found under the Studio install, version folder included', async () => {
  await withFakeStudio({
    'Rockwell Automation/FactoryTalk Optix/Studio 1.7.4.32/FTOptixRuntime/1.7.4.32/Win32_x64/FTOptixRuntime.exe': 'runtime',
  }, async (root) => {
    assert.deepEqual(await runtimeCandidates(), [
      join(root, 'Rockwell Automation', 'FactoryTalk Optix', 'Studio 1.7.4.32', 'FTOptixRuntime', '1.7.4.32', 'Win32_x64', 'FTOptixRuntime.exe'),
    ])
  })
})

test('a machine with no Studio install reports nothing rather than guessing', async () => {
  await withFakeStudio({}, async () => {
    assert.deepEqual(await runtimeCandidates(), [])
  })
})

test('the project file is the .optix the runtime loads', async () => {
  const project = await scratch('project')
  await writeFile(join(project, 'Line17.optix'), 'Project:')
  assert.equal(await projectFile(project), join(project, 'Line17.optix'))
  assert.equal(await projectFile(join(project, 'missing')), '')
})

test('status reads the address that answers and the one that does not', async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/html' })
    response.end('<html>hmi</html>')
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = server.address().port
  const project = await scratch('served')
  await writeFile(join(project, 'Boiler.optix'), 'Project:')
  try {
    const live = await emulatorStatus({ project, previewUrl: `http://127.0.0.1:${port}/` })
    assert.deepEqual(
      { serving: live.serving, status: live.status, project_file: live.project_file, running: live.running },
      { serving: true, status: 200, project_file: join(project, 'Boiler.optix'), running: false },
    )
    const dead = await emulatorStatus({ project, previewUrl: 'http://127.0.0.1:1/' })
    assert.deepEqual({ serving: dead.serving, status: dead.status }, { serving: false, status: 0 })
  } finally {
    server.close()
  }
})

test('start refuses a folder with no project file and names the folder it wanted', async () => {
  const empty = await scratch('empty')
  await assert.rejects(() => startEmulator({ project: empty }), /No \.optix project file under/)
})

test('start refuses when no runtime exists and names where it looked', async () => {
  const project = await scratch('noruntime')
  await writeFile(join(project, 'Plant.optix'), 'Project:')
  await withFakeStudio({}, async () => {
    await assert.rejects(() => startEmulator({ project }), /No FTOptixRuntime\.exe under/)
  })
})

test('stop only ends a runtime this tool started, never one opened in Studio', async () => {
  const project = await scratch('untracked')
  await writeFile(join(project, 'Weld.optix'), 'Project:')
  const report = await stopEmulator({ project, project_file: '' })
  assert.equal(report.stopped, false)
  assert.match(report.reason, /did not start a runtime/)
})
