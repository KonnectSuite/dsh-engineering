import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'
import {
  classifyLog,
  classifyNotice,
  diskState,
  emulatorLogs,
  emulatorStatus,
  logPath,
  parseRuntimeProcesses,
  projectFile,
  restartEmulator,
  runtimeCandidates,
  startEmulator,
  stopEmulator,
} from '../packages/optix/lib/emulator.js'

/**
 * The emulator leg is the one the field session could not get past: the Studio CLI has no run
 * verb, so the only scripted route is the runtime executable under the Studio install, and the
 * agent's fallback — launching the exe itself and stopping it with Stop-Process — is exactly the
 * drift this tool exists to remove. These specs prove discovery, that a start only reports
 * `started` once the preview answers, that a dead runtime comes back with its own log and a named
 * diagnosis, that stop and restart work on a process this plugin did not start, and that a folder
 * or install that is missing names itself instead of launching something arbitrary.
 */

/** Scratch directories this spec makes, so the run leaves nothing behind. */
const created = []
/** Runtime processes this spec started, so a failure cannot leak one. */
const started = []

const scratch = async (name) => {
  const root = await mkdtemp(join(tmpdir(), `dsh-optix-emulator-${name}-`))
  created.push(root)
  return root
}

after(async () => {
  for (const pid of started) {
    try {
      process.kill(pid)
    } catch {}
  }
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

/** A free loopback port, so a fake runtime and the probe agree on where to look. */
const freePort = async () => {
  const server = http.createServer(() => {})
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  await new Promise((resolve) => server.close(resolve))
  return port
}

/** A fake runtime that serves one port, standing in for FTOptixRuntime.exe. */
const servingRuntime = async () => {
  const root = await scratch('serving')
  const script = join(root, 'runtime.mjs')
  await writeFile(script, [
    "import http from 'node:http'",
    'const port = Number(process.argv[2])',
    "http.createServer((_request, response) => { response.writeHead(200, { 'content-type': 'text/html' }); response.end('<html>hmi</html>') }).listen(port, '127.0.0.1')",
  ].join('\n'))
  const port = await freePort()
  return { script, port, args: [script, String(port)] }
}

/** A fake runtime that writes a known failure and exits, standing in for one that cannot bind. */
const failingRuntime = async (line) => {
  const root = await scratch('failing')
  const script = join(root, 'runtime.mjs')
  await writeFile(script, [
    `process.stderr.write(${JSON.stringify(`${line}\n`)})`,
    'process.exit(1)',
  ].join('\n'))
  return { script, args: [script] }
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
    assert.equal(live.log_path, logPath(join(project, 'Boiler.optix')))
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

test('start reports started only once the preview address answers', async () => {
  const project = await scratch('serving-project')
  await writeFile(join(project, 'Line.optix'), 'Project:')
  const runtime = await servingRuntime()
  const report = await startEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl: `http://127.0.0.1:${runtime.port}/`,
    waitMs: 15000,
  })
  started.push(report.pid)
  try {
    assert.equal(report.started, true)
    assert.equal(report.serving, true)
    assert.equal(report.status, 200)
    assert.ok(report.pid > 0)
    assert.equal(report.log_path, logPath(join(project, 'Line.optix')))
    assert.match(report.next, /serving the preview/)
    const status = await emulatorStatus({ project, previewUrl: `http://127.0.0.1:${runtime.port}/` })
    assert.deepEqual({ running: status.running, pids: status.pids, serving: status.serving }, { running: true, pids: [report.pid], serving: true })
  } finally {
    await stopEmulator({ project, project_file: '', force: true, previewUrl: `http://127.0.0.1:${runtime.port}/` })
  }
})

test('a runtime that dies comes back with its own log tail and a named diagnosis', async () => {
  const project = await scratch('failing-project')
  await writeFile(join(project, 'Weld.optix'), 'Project:')
  const runtime = await failingRuntime('System.Net.Sockets.SocketException: Address already in use')
  const report = await startEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl: 'http://127.0.0.1:1/',
    waitMs: 15000,
  })
  started.push(report.pid)
  assert.equal(report.started, true)
  assert.equal(report.serving, false)
  assert.equal(report.diagnosis.kind, 'port_in_use')
  assert.match(report.diagnosis.hint, /Another runtime already holds the port/)
  assert.ok(report.log_tail.length > 0, 'the runtime log is the evidence for the failure')
  assert.match(report.log_tail.join('\n'), /Address already in use/)
  assert.match(report.next, /exited with code 1/)
  const logs = await emulatorLogs({ project, project_file: '', lines: 10 })
  assert.equal(logs.exists, true)
  assert.match(logs.lines.join('\n'), /Address already in use/)
  assert.equal(logs.diagnosis.kind, 'port_in_use')
})

test('start does not launch a second runtime while the address already answers', async () => {
  const project = await scratch('reused-project')
  await writeFile(join(project, 'Mix.optix'), 'Project:')
  const runtime = await servingRuntime()
  const previewUrl = `http://127.0.0.1:${runtime.port}/`
  const first = await startEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl,
    waitMs: 15000,
  })
  started.push(first.pid)
  try {
    const second = await startEmulator({ project, runtime: process.execPath, args: runtime.args, previewUrl, waitMs: 5000 })
    assert.deepEqual({ started: second.started, reused: second.reused, serving: second.serving }, { started: false, reused: true, serving: true })
    assert.equal(second.pid, 0)
    assert.match(second.next, /already answers/)
  } finally {
    await stopEmulator({ project, project_file: '', force: true, previewUrl })
  }
})

test('stop ends the runtime and reports the preview cleared', async () => {
  const project = await scratch('stop-project')
  await writeFile(join(project, 'Press.optix'), 'Project:')
  const runtime = await servingRuntime()
  const previewUrl = `http://127.0.0.1:${runtime.port}/`
  const began = await startEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl,
    waitMs: 15000,
  })
  started.push(began.pid)
  const stopped = await stopEmulator({ project, project_file: '', force: true, previewUrl })
  assert.equal(stopped.stopped, true)
  assert.equal(stopped.found, 1)
  assert.deepEqual(stopped.stopped_pids, [began.pid])
  assert.equal(stopped.preview.serving, false)
  await new Promise((resolve) => setTimeout(resolve, 300))
  const after = await emulatorStatus({ project, previewUrl })
  assert.deepEqual({ running: after.running, serving: after.serving }, { running: false, serving: false })
})

test('restart replaces the running process', async () => {
  const project = await scratch('restart-project')
  await writeFile(join(project, 'Filler.optix'), 'Project:')
  const runtime = await servingRuntime()
  const previewUrl = `http://127.0.0.1:${runtime.port}/`
  const first = await startEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl,
    waitMs: 15000,
  })
  started.push(first.pid)
  const report = await restartEmulator({
    project,
    runtime: process.execPath,
    args: runtime.args,
    previewUrl,
    waitMs: 15000,
  })
  started.push(report.started.pid)
  assert.equal(report.stopped.stopped, true)
  assert.equal(report.started.serving, true)
  assert.notEqual(report.started.pid, first.pid)
  await stopEmulator({ project, project_file: '', force: true, previewUrl })
})

test('stop says there is nothing to stop instead of inventing a failure', async () => {
  const project = await scratch('untracked')
  await writeFile(join(project, 'Weld.optix'), 'Project:')
  const report = await stopEmulator({ project, project_file: '' })
  assert.equal(report.stopped, false)
  assert.equal(report.found, 0)
  assert.match(report.reason, /nothing to stop/)
})

test('a failure signature becomes a kind and a hint the agent can act on', () => {
  assert.equal(classifyLog('Address already in use').kind, 'port_in_use')
  assert.equal(classifyLog('error MSB3061: Cannot delete file').kind, 'file_locked')
  assert.equal(classifyLog('System.NullReferenceException: Object reference not set').kind, 'exception')
  assert.equal(classifyLog('License validation failed: the licence has expired').kind, 'licensing')
  assert.equal(classifyLog('all good, serving on 8081'), null)
})

test('a licence that only starts demo mode is a notice, not a failure', () => {
  // Measured on Studio 1.8.1 against a machine with no Optix licence: the runtime serves the preview and
  // says so in the log. Reporting that as a failure would send the agent chasing a licence it cannot fix.
  const log = [
    '14-11-2026 21:57:40.835 WARNING (urn:FTOptix:LicenseManager) [code=230000b]: Standard entitlement not found',
    '14-11-2026 21:57:40.835 INFO (urn:FTOptix:LicenseManager): Demo mode started. FactoryTalk Optix Runtime will be closed in 120 minutes',
    '14-11-2026 21:57:40.886 INFO (urn:FTOptix:WebUI): Server endpointUrl: http://127.0.0.1:8081',
  ].join('\n')
  assert.equal(classifyLog(log), null)
  assert.equal(classifyNotice(log).kind, 'demo_mode')
  assert.match(classifyNotice(log).hint, /120 minutes/u)
  assert.equal(classifyNotice('Module \'FTOptix.UI\' will be upgraded from version 21.2 to version 22.0'), null)
})

test('the process query parses one row, many rows and junk', () => {
  assert.deepEqual(
    parseRuntimeProcesses(JSON.stringify({ ProcessId: 12, CommandLine: 'x FTOptixRuntime.exe -c -l INFO C:\\p\\Line.optix' })),
    [{ pid: 12, command_line: 'x FTOptixRuntime.exe -c -l INFO C:\\p\\Line.optix' }],
  )
  assert.equal(parseRuntimeProcesses(JSON.stringify([{ ProcessId: 1, CommandLine: 'a' }, { ProcessId: 2, CommandLine: 'b' }])).length, 2)
  assert.deepEqual(parseRuntimeProcesses(''), [])
  assert.deepEqual(parseRuntimeProcesses('not json'), [])
})

test('diskState reports the newest write under Nodes as the saved state', async () => {
  const project = join(await scratch('disk'), 'Saved')
  const ui = join(project, 'Nodes', 'UI', 'UI.yaml')
  const screens = join(project, 'Nodes', 'UI', 'Screens', 'Screens.yaml')
  await mkdir(join(project, 'Nodes', 'UI', 'Screens'), { recursive: true })
  await writeFile(join(project, 'Saved.optix'), 'project')
  await writeFile(ui, 'window')
  await writeFile(screens, 'screen')
  // The stamp is the whole point of the function, so it is set rather than raced.
  const older = new Date('2026-01-01T00:00:00Z')
  const newer = new Date('2026-02-01T00:00:00Z')
  await utimes(ui, older, older)
  await utimes(screens, newer, newer)
  const state = await diskState(project)
  assert.equal(state.files, 2)
  assert.equal(state.newest_path, screens)
  assert.equal(state.newest_write, newer.getTime())
  assert.equal(state.newest_write_iso, newer.toISOString())
  assert.ok(state.project_bytes > 0)
})

test('diskState on a folder that is not a project is empty, not an error', async () => {
  const state = await diskState(join(await scratch('disk'), 'missing'))
  assert.equal(state.files, 0)
  assert.equal(state.newest_write, 0)
  assert.equal(state.project_write, 0)
  assert.equal(state.newest_write_iso, '')
})