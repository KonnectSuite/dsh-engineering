/**
 * DWG converter specs.
 *
 * The always-run tests use the committed engine fixtures, so the converter's
 * contract is checked on every machine: the engine must read the DXF the
 * converter writes, and the render model of a drawing must survive
 * DXF → DWG → DXF unchanged. `tiny.dxf` and `titleblock.dxf` carry block
 * references with attribute values, which is exactly the case the converter's
 * attribute repair exists for; `index.dxf` carries no blocks.
 *
 * The corpus-backed tests use the owner's read-only print set (DWG and DXF
 * beside each other) and skip when it is absent. Corpus files are never copied
 * into the repository: the tests read them where they are.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSheetModel, diffSheetModels, openSheet } from '../src/engine/index.ts'
import {
  DEFAULT_MAX_CONVERT_BYTES,
  DwgError,
  converterInfo,
  dwgToDxf,
  dxfToDwg,
  isDwg,
  isDwgError
} from '../src/dwg/index.ts'
import { corpusAvailable, corpusDir, fixturesDir, ok } from './helpers.mjs'

/** The DWG half of the owner's print set, beside the DXF half. */
const dwgCorpusDir = join(dirname(corpusDir), 'DWG')

const skipCorpus = corpusAvailable
  ? false
  : 'real corpus not present on this machine (read-only, never committed)'

/** Read one committed fixture. */
function fixture(name) {
  return new Uint8Array(readFileSync(join(fixturesDir, name)))
}

/** Read one corpus DWG. */
function corpusDwg(name) {
  return new Uint8Array(readFileSync(join(dwgCorpusDir, name)))
}

/** Build the engine model of some bytes. */
async function modelOf(path, bytes) {
  const opened = await openSheet({ path, bytes })
  return { opened, model: buildSheetModel(opened) }
}

/** Total rows in a model diff. */
function changeCount(diff) {
  return diff.added.length + diff.removed.length + diff.changed.length
}

/** A concise diff description for an assertion message. */
function describe(diff) {
  return `added ${diff.added.length}, removed ${diff.removed.length}, changed ${diff.changed.length}`
}

test('converterInfo names the wasm transport and its version window', async () => {
  const info = await converterInfo()
  assert.equal(info.kind, 'wasm', 'the committed wasm asset is the shipping transport')
  assert.match(info.version, /^\d+\.\d+\.\d+$/, 'acadrust version is reported')
  ok(info.versions.includes('AC1032'), 'AC1032 is a supported version')
  ok(info.versions.includes('AC1027'), 'AC1027 is a supported version')
  assert.equal(info.versions.length, 9, 'R12 through R2018 is the declared window')
  // The answer is cached: a second call must not reload the module.
  const again = await converterInfo()
  assert.deepEqual(again, info)
})

test('isDwg reads the six-byte version marker and nothing else', () => {
  assert.equal(isDwg(new Uint8Array(Buffer.from('AC1032', 'latin1'))), true)
  assert.equal(isDwg(new Uint8Array(Buffer.from('AC1027 0000', 'latin1'))), true)
  assert.equal(isDwg(new Uint8Array(Buffer.from('AC1009', 'latin1'))), true)
  assert.equal(isDwg(fixture('tiny.dxf')), false, 'a DXF is not a DWG')
  assert.equal(isDwg(new Uint8Array(Buffer.from('AC10', 'latin1'))), false, 'too short')
  assert.equal(isDwg(new Uint8Array(0)), false, 'empty')
})

test('dxfToDwg → dwgToDxf keeps the engine model, including block attributes', async () => {
  const bytes = fixture('tiny.dxf')
  const original = await modelOf('tiny.dxf', bytes)

  const written = await dxfToDwg(bytes)
  assert.equal(isDwg(written.dwg), true, 'the output starts with a DWG version marker')
  assert.equal(written.version, 'AC1032', 'the DXF version is preserved by default')
  ok(
    written.warnings.some(line => line.includes('attribute')),
    'the reader reports the attribute lists it re-attached before writing'
  )

  const back = await dwgToDxf(written.dwg)
  assert.equal(back.version, 'AC1032')
  const roundTripped = await modelOf('tiny.dxf:roundtrip', back.dxf)
  const diff = diffSheetModels(original.model, roundTripped.model)
  assert.equal(changeCount(diff), 0, `the model changed: ${describe(diff)}`)
  assert.equal(roundTripped.model.stats.entities, original.model.stats.entities)
})

test('every committed fixture round-trips clean', async () => {
  for (const name of ['index.dxf', 'tiny.dxf', 'titleblock.dxf']) {
    const bytes = fixture(name)
    const original = await modelOf(name, bytes)
    const written = await dxfToDwg(bytes)
    const back = await dwgToDxf(written.dwg)
    const roundTripped = await modelOf(`${name}:roundtrip`, back.dxf)
    const diff = diffSheetModels(original.model, roundTripped.model)
    assert.equal(changeCount(diff), 0, `${name}: ${describe(diff)}`)
    assert.equal(back.version, original.opened.dxfVersion, `${name} kept its version`)
  }
})

test('targetVersion writes the requested DWG version', async () => {
  const bytes = fixture('tiny.dxf')
  for (const version of ['AC1015', 'AC1018']) {
    const written = await dxfToDwg(bytes, { targetVersion: version })
    assert.equal(written.version, version)
    const marker = new TextDecoder('latin1').decode(written.dwg.subarray(0, 6))
    assert.equal(marker, version, 'the DWG file header carries the requested version')
    const back = await dwgToDxf(written.dwg)
    assert.equal(back.version, version, 'the version survives the trip back')
    const model = await modelOf(`${version}.dxf`, back.dxf)
    assert.equal(model.model.stats.entities > 0, true, 'the written drawing has entities')
  }
})

test('conversions are deterministic', async () => {
  const bytes = fixture('titleblock.dxf')
  const first = await dxfToDwg(bytes)
  const second = await dxfToDwg(bytes)
  assert.deepEqual(
    new Uint8Array(first.dwg),
    new Uint8Array(second.dwg),
    'the same input produces the same DWG bytes'
  )
  const backFirst = await dwgToDxf(first.dwg)
  const backSecond = await dwgToDxf(second.dwg)
  assert.deepEqual(new Uint8Array(backFirst.dxf), new Uint8Array(backSecond.dxf))
})

test('concurrent calls do not share converter state', async () => {
  const [tiny, titleblock] = await Promise.all([
    dxfToDwg(fixture('tiny.dxf')),
    dxfToDwg(fixture('titleblock.dxf'))
  ])
  const [tinyBack, titleblockBack] = await Promise.all([
    dwgToDxf(tiny.dwg),
    dwgToDxf(titleblock.dwg)
  ])
  const tinyModel = await modelOf('tiny:concurrent', tinyBack.dxf)
  const titleblockModel = await modelOf('titleblock:concurrent', titleblockBack.dxf)
  ok(tinyModel.model.stats.entities > 0)
  ok(titleblockModel.model.stats.entities > 0)
  assert.notEqual(tiny.dwg.length, titleblock.dwg.length, 'each call converted its own input')
})

test('failures are typed with a code and a fix', async () => {
  await assert.rejects(
    () => dwgToDxf(fixture('tiny.dxf')),
    error => {
      ok(isDwgError(error), 'a DwgError is thrown')
      assert.equal(error.code, 'DWG_UNSUPPORTED')
      ok(error.fix.length > 0, 'the failure carries a fix sentence')
      return true
    }
  )
  await assert.rejects(
    () => dxfToDwg(fixture('tiny.dxf'), { targetVersion: 'AC9999' }),
    error => {
      assert.equal(error.code, 'DWG_UNSUPPORTED')
      ok(error.message.includes('AC9999'))
      return true
    }
  )
  await assert.rejects(
    () => dwgToDxf(new Uint8Array(1024).fill(0x41), { maxBytes: 16 }),
    error => {
      assert.equal(error.code, 'DWG_TOO_LARGE')
      return true
    }
  )
  await assert.rejects(
    () => dxfToDwg(new Uint8Array(Buffer.from('not a drawing', 'latin1'))),
    error => {
      assert.equal(error.code, 'DWG_READ_FAILED')
      return true
    }
  )
  await assert.rejects(
    () => dwgToDxf(new Uint8Array(0)),
    error => {
      assert.equal(error.code, 'DWG_UNSUPPORTED')
      ok(error instanceof DwgError)
      return true
    }
  )
})

test('the default byte limit matches the engine file limit', () => {
  assert.equal(DEFAULT_MAX_CONVERT_BYTES, 64 * 1024 * 1024)
})

test('the real DWGs convert and keep their model through a full round trip', { skip: skipCorpus }, async () => {
  // Smallest, a middle and the largest file of the set: 76 KB and 2.3 MB.
  for (const name of ['20136-004.dwg', '20136-001.dwg', '20136-035.dwg']) {
    const bytes = corpusDwg(name)
    const first = await dwgToDxf(bytes)
    assert.equal(first.version, new TextDecoder('latin1').decode(bytes.subarray(0, 6)))
    const dxfModel = await modelOf(`${name}:dxf`, first.dxf)
    ok(dxfModel.model.stats.entities > 0, `${name} produced an empty model`)

    const written = await dxfToDwg(first.dxf)
    const back = await dwgToDxf(written.dwg)
    const backModel = await modelOf(`${name}:roundtrip`, back.dxf)
    const diff = diffSheetModels(dxfModel.model, backModel.model)
    assert.equal(changeCount(diff), 0, `${name} model changed: ${describe(diff)}`)
    assert.equal(back.version, first.version, `${name} kept its version`)
  }
})

test('many conversions in one process stay healthy', async () => {
  // Regression: the converter used to reuse one wasm instance, whose Rust
  // allocator retained memory across conversions and eventually aborted with
  // "memory access out of bounds". Each conversion now starts from a fresh
  // instance; forty repeated conversions on a committed fixture pin that
  // lifecycle without depending on the read-only corpus.
  const bytes = fixture('titleblock.dxf')
  for (let index = 0; index < 40; index += 1) {
    const written = await dxfToDwg(bytes)
    ok(written.dwg.byteLength > 0, `conversion ${index} produced no DWG`)
    const back = await dwgToDxf(written.dwg)
    ok(back.dxf.byteLength > 0, `conversion ${index} produced no DXF`)
  }
})

test('the write path keeps a shipped DXF drawing intact', { skip: skipCorpus }, async () => {
  // The smallest and the largest shipped sheet: 134 KB and 6.5 MB.
  for (const name of ['FC1000495-004.dxf', 'FC1000495-035.dxf']) {
    const bytes = new Uint8Array(readFileSync(join(corpusDir, name)))
    const original = await modelOf(name, bytes)
    const written = await dxfToDwg(bytes)
    const back = await dwgToDxf(written.dwg)
    const roundTripped = await modelOf(`${name}:write`, back.dxf)
    const diff = diffSheetModels(original.model, roundTripped.model)
    assert.equal(changeCount(diff), 0, `${name}: ${describe(diff)}`)
    assert.equal(roundTripped.model.stats.entities, original.model.stats.entities)
  }
})
