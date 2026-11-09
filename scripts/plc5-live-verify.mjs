/**
 * Live verification of the PLC-5 tools against the owner's F00607.RSP project.
 *
 * Runs the built tools (`packages/plc5/lib`) against a copy of the project in
 * %TEMP%, so the original is hash-checked before and after and is provably
 * untouched. Every answer is printed and then asserted, so the run is evidence,
 * not eyeballing.
 *
 * Build first, then run:
 *   tsc -p packages/plc5/tsconfig.json
 *   node scripts/plc5-live-verify.mjs
 *
 * Two routes are possible. When the vendor automation server starts, the run
 * checks the full census, the ladder text, the search, the I/O census, the
 * chassis list, the data-file table and the processor identity against the
 * numbers the prototype recorded from this same file. When it does not start,
 * the run checks what the container reader proves on its own, records the exact
 * failure, and exits 2 — "verified what the file allows, the server route is
 * still unproven" — instead of passing off a partial answer as the whole.
 *
 * The COM open is the slow part, and a server that refuses to start makes
 * Windows wait about two minutes per call before it says so.
 */
import { createHash } from 'node:crypto'
import { copyFile, readFile, readdir, stat, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { plc5Tools } from '../packages/plc5/lib/tools.js'

/**
 * The project the run reads, and the hash it must still have afterwards.
 *
 * Both are overridable so the harness is not bound to one machine: point
 * `DSH_PLC5_SOURCE` at any `.RSP` and `DSH_PLC5_SHA` at its sha256, and drop the
 * census assertions below when the project differs from the reference one.
 */
const SOURCE = process.env.DSH_PLC5_SOURCE
  ?? 'C:\\Users\\Admin\\Desktop\\myWorkspace\\Carpenter Tech\\902 - DVIM Controls Upgrade\\PLC\\F00607.RSP'
const EXPECTED_SHA = process.env.DSH_PLC5_SHA
  ?? '2b65cb6a0f132d8457dbd5eae2b366011e46b46f520c7b22648f9719b620d6ec'

/** What the earlier prototype census of this exact file recorded. */
const EXPECTED = {
  programFiles: 52,
  /** Of those 52 program files, 38 carry ladder; the container names exactly those. */
  ladderFiles: 38,
  processorType: 'MML10PF3PX3R9',
  rungs: 2168,
  dataFiles: 226,
  symbols: 4189,
  chassis: 10,
  cells: 443,
  /** How many streams the container holds, none of them rung text. */
  streams: 53,
}

const fsService = {
  async resolve(path) {
    return { targetKey: path, displayPath: path }
  },
  async stat(target) {
    const info = await stat(target.targetKey)
    return { type: info.isDirectory() ? 'directory' : 'file', size: info.size, mtimeMs: info.mtimeMs }
  },
  async readBytes(target) {
    return new Uint8Array(await readFile(target.targetKey))
  },
  async list(target) {
    const entries = await readdir(target.targetKey, { withFileTypes: true })
    return entries.map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
  },
}

const exec = { cwd: process.cwd(), signal: undefined, sessionId: 'plc5-live-verify', agent: 'plc5-live-verify' }

const results = []

function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

function note(name, detail) {
  results.push({ name, ok: true, detail, skipped: true })
  console.log(`SKIP  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

async function sha256(path) {
  return createHash('sha256').update(await readFile(path)).digest('hex')
}

async function main() {
  const before = await sha256(SOURCE)
  if (before !== EXPECTED_SHA) {
    console.error(`ABORT: source hash is ${before}, not the recorded ${EXPECTED_SHA}`)
    process.exit(1)
  }
  const copy = join(tmpdir(), 'F00607-verify.RSP')
  await copyFile(SOURCE, copy)
  console.log(`copy: ${copy}\n`)

  const tools = new Map(plc5Tools(fsService).map(tool => [tool.name, tool]))
  const run = async (name, args) => {
    const started = Date.now()
    const answer = await tools.get(name).execute(args, exec)
    const ms = Date.now() - started
    console.log(`\n=== ${name} (${ms} ms) ===`)
    console.log(JSON.stringify(answer, undefined, 2).slice(0, 1800))
    if (answer?.error !== undefined) {
      record(`${name} returned an answer`, false, `${answer.error.code}: ${answer.error.message}`)
    } else {
      record(`${name} returned an answer`, true, `${ms} ms`)
    }
    return answer ?? {}
  }

  const capabilities = await run('plc5_capabilities', {})
  record('plc5_capabilities finds 32-bit PowerShell', capabilities.data?.powershell32 === true, String(capabilities.data?.powershell32))
  record('plc5_capabilities finds the COM server', capabilities.data?.com_server === true, String(capabilities.data?.com_server))

  const open = await run('plc5_open', { path: copy })
  const census = open.data ?? {}
  const route = census.source
  record('plc5_open names its route', route === 'automation server' || route === 'container reader', String(route))

  let blocked = ''

  if (route === 'automation server') {
    record('plc5_open project revision is a number', typeof census.revision === 'number', String(census.revision))
    record(`plc5_open program files = ${EXPECTED.programFiles}`, census.program_files === EXPECTED.programFiles, String(census.program_files))
    record(`plc5_open rungs = ${EXPECTED.rungs}`, census.rungs === EXPECTED.rungs, String(census.rungs))
    record(`plc5_open data files = ${EXPECTED.dataFiles}`, census.data_files === EXPECTED.dataFiles, String(census.data_files))
    record(`plc5_open symbols = ${EXPECTED.symbols}`, census.symbols === EXPECTED.symbols, String(census.symbols))

    const ladder = await run('plc5_ladder', { path: copy, file: 'MAIN DVIM', limit: 3 })
    const rungs = ladder.data?.rungs ?? []
    record('plc5_ladder returns 3 rungs', rungs.length === 3, `${rungs.length} rung(s)`)
    record('plc5_ladder rung text is non-empty', rungs.every(rung => typeof rung.text === 'string' && rung.text.length > 0), rungs.map(rung => rung.text.slice(0, 60)).join(' | '))
    record('plc5_ladder names the file', ladder.data?.file === 'MAIN DVIM', String(ladder.data?.file))

    // "PUMP" lives in symbol descriptions ("System Pump Disconnect Switches On"), not in
    // rung text, so the search must be judged on both lists it returns.
    const find = await run('plc5_find', { path: copy, pattern: 'PUMP', limit: 5 })
    const findHits = (find.data?.hits ?? []).length
    const findSymbols = (find.data?.symbols ?? []).length
    record('plc5_find finds PUMP in rungs or symbol descriptions', findHits + findSymbols > 0, `${findHits} rung(s), ${findSymbols} symbol(s)`)

    const io = await run('plc5_io_census', { path: copy })
    const ioData = io.data ?? {}
    record(`plc5_io_census cells = ${EXPECTED.cells}`, ioData.cells?.length === EXPECTED.cells, String(ioData.cells?.length))
    record(`plc5_io_census configured chassis = ${EXPECTED.chassis}`, ioData.chassis_configured === EXPECTED.chassis, String(ioData.chassis_configured))

    const config = await run('plc5_io_config', { path: copy })
    record('plc5_io_config lists the chassis', (config.data?.chassis ?? []).length === EXPECTED.chassis, String((config.data?.chassis ?? []).length))

    const data = await run('plc5_data_read', { path: copy, limit: 5 })
    record('plc5_data_read lists 5 of 226', (data.data?.data_files ?? []).length === 5, String((data.data?.data_files ?? []).length))

    const processor = await run('plc5_processor', { path: copy })
    record('plc5_processor names a type code', typeof processor.data?.type_code === 'number' && processor.data.type_code > 0, String(processor.data?.type_code))
  } else {
    // The vendor server did not start, so the tools answered from the file. Prove
    // what the file alone supports, and say plainly what stays unproven.
    const names = census.program_files ?? []
    record(`plc5_open container names ${EXPECTED.ladderFiles} ladder program files`, names.length === EXPECTED.ladderFiles, `${names.length} name(s)`)
    record('plc5_open container names MAIN DVIM', names.includes('MAIN DVIM'), names.slice(0, 3).join(', '))
    record('plc5_open container names the project', census.project_name === 'F00607', String(census.project_name))
    record('plc5_open container names the processor', census.processor_type === EXPECTED.processorType, String(census.processor_type))
    record('plc5_open container recovers the streams', census.stream_count === EXPECTED.streams, `${census.stream_count} stream(s)`)
    note('plc5_open rung counts, symbols and data-file tables', 'need the automation server')

    // The processor tool never needs the server for identity: the container carries it.
    const processor = await run('plc5_processor', { path: copy })
    record('plc5_processor reads the project from the container', processor.data?.project === 'F00607', String(processor.data?.project))
    record('plc5_processor reads the processor type from the container', processor.data?.processor_type === EXPECTED.processorType, String(processor.data?.processor_type))
    record('plc5_processor reads the route from the container', String(processor.data?.route ?? '').includes('Backplane'), String(processor.data?.route))

    const ladder = await run('plc5_ladder', { path: copy, file: 'MAIN DVIM', limit: 3 })
    record('plc5_ladder refuses cleanly when the server cannot start', ladder.error?.code === 'PLC5_COM_UNAVAILABLE', String(ladder.error?.code))
    blocked = ladder.error?.message ?? 'the automation server did not start'
    for (const tool of ['plc5_find', 'plc5_io_census', 'plc5_io_config', 'plc5_data_read']) {
      note(tool, 'needs the automation server')
    }
  }

  const after = await sha256(SOURCE)
  record('source project unchanged', after === EXPECTED_SHA, after === EXPECTED_SHA ? 'sha256 identical' : after)
  await unlink(copy).catch(() => undefined)

  const failed = results.filter(entry => !entry.ok)
  const skipped = results.filter(entry => entry.skipped === true)
  console.log(`\n${results.length - failed.length}/${results.length} checks passed${skipped.length === 0 ? '' : ` (${skipped.length} skipped)`}`)
  for (const entry of failed) console.log(`  FAILED: ${entry.name} — ${entry.detail}`)
  if (failed.length > 0) {
    process.exitCode = 1
  } else if (blocked !== '') {
    console.log(`\nBLOCKED: the RSLogix 5 automation server did not start, so the server route is unproven.`)
    console.log(`  ${blocked}`)
    process.exitCode = 2
  }
}

main().catch(error => {
  console.error(`verify crashed: ${error?.stack ?? error}`)
  process.exit(1)
})
