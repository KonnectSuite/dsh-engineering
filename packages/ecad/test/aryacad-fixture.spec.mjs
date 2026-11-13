/**
 * AryaCAD Electrical output, read by this row's review engine.
 *
 * The row no longer draws, so the question the port used to ask of its own writer
 * ("can we write what the CAD app writes?") is replaced by the question the review
 * work actually depends on: **can this engine read what AryaCAD Electrical writes?**
 * A drawing saved by AryaCAD Electrical carries its own conventions — the electrical
 * layers `ELECNEW` creates (`WIRES`, `JUNCTIONS`, `WIRENO`, `XREF`, `ELEC-SYMBOLS`,
 * `CABLES`), panel layers such as `PANEL-DEVICE`, and a title block whose labels are
 * plain text — so a fixture produced by that application is the honest test.
 *
 * The fixture is **not committed**: AryaCAD Electrical is GPL-3.0 and this bundle is
 * MIT, so its sample drawings cannot be vendored here. To run this spec, save a
 * drawing in AryaCAD Electrical (`ELECNEW` then `ELECINSERT`, then save) and copy the
 * result to `packages/ecad/test/fixtures/aryacad.dxf`, or copy one of that
 * application's own samples to that path on your own machine. Until the file exists
 * the spec skips and says so, rather than pretending the check happened.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { harness } from './harness.mjs'

const FIXTURE = fileURLToPath(new URL('./fixtures/aryacad.dxf', import.meta.url))
const SKIP = existsSync(FIXTURE)
  ? false
  : 'no fixtures/aryacad.dxf — save a drawing in AryaCAD Electrical and copy it there (GPL-3.0 application, MIT bundle, so the file is not committed)'

/** The bytes of the AryaCAD-authored drawing, read straight off disk. */
function aryacad() {
  return new Uint8Array(readFileSync(FIXTURE))
}

test('a drawing saved by AryaCAD Electrical opens with its coverage stated', { skip: SKIP }, async () => {
  const instance = harness(new Map([['/ws/Prints/aryacad.dxf', aryacad()]]))
  const answer = await instance.call('ecad_open', { path: 'Prints/aryacad.dxf' })
  assert.equal(answer.error, undefined, `the engine could not read AryaCAD output: ${JSON.stringify(answer.error)}`)
  assert.ok(answer.data.entities > 0, 'the drawing carries primitives')
  assert.equal(typeof answer.data.dxfVersion, 'string', 'the DXF version is reported')
  assert.equal(typeof answer.coverage.complete, 'boolean', 'the answer states whether it is complete')
  assert.ok(Array.isArray(answer.coverage.unverified), 'anything the answer does not cover is named')
  assert.ok(
    answer.data.unsupported === undefined || Object.keys(answer.data.unsupported).length === 0,
    `AryaCAD output should not need unsupported types: ${JSON.stringify(answer.data.unsupported)}`,
  )
})

test('the electrical layers AryaCAD creates reach the profile the checks run on', { skip: SKIP }, async () => {
  const instance = harness(new Map([['/ws/Prints/aryacad.dxf', aryacad()]]))
  // `infer` measures the indexed set, so the set has to be indexed first.
  const scan = await instance.call('ecad_scan', {})
  assert.equal(scan.error, undefined, JSON.stringify(scan.error))
  const profile = await instance.call('ecad_profile', { action: 'infer' })
  assert.equal(profile.error, undefined, JSON.stringify(profile.error))
  // The profile splits layers by role; `standardLayers` is the field that carries the
  // layers actually in use across the set, which is where an AryaCAD sheet's own
  // electrical layers land when nothing matched them by role.
  const inferred = profile.data.profile ?? {}
  const layers = new Set(
    [inferred.standardLayers, inferred.titleBlockLayers, inferred.wireLayers, inferred.tagLayers, inferred.xrefLayers, inferred.locLayers]
      .flatMap(names => (Array.isArray(names) ? names : []))
      .map(name => String(name).toUpperCase()),
  )
  assert.ok(layers.size > 0, `the inferred profile carries no layers at all: ${JSON.stringify(profile.data).slice(0, 400)}`)
  const electrical = ['WIRES', 'WIRENO', 'JUNCTIONS', 'XREF', 'ELEC-SYMBOLS', 'CABLES']
  const seen = electrical.filter(name => layers.has(name))
  assert.ok(seen.length > 0, `none of AryaCAD's electrical layers reached the profile; it holds ${[...layers].join(', ')}`)
})

test('text on an AryaCAD sheet is searchable, which is what review work asks for', { skip: SKIP }, async () => {
  const instance = harness(new Map([['/ws/Prints/aryacad.dxf', aryacad()]]))
  const answer = await instance.call('ecad_find', { path: 'Prints/aryacad.dxf', query: '[A-Z]{1,3}[0-9]+', regex: true })
  assert.equal(answer.error, undefined, JSON.stringify(answer.error))
  assert.ok(answer.data.matches > 0, 'the tag-shaped text a panel drawing carries is found')
  assert.ok(answer.data.rows.length > 0, 'the matches are carried as rows')
  for (const row of answer.data.rows) {
    assert.equal(typeof row.layer, 'string', 'a match names its layer')
    assert.equal(typeof row.text, 'string', 'a match carries the text')
  }
})

test('an AryaCAD drawing compares clean against itself, so a CAD edit would stand out', { skip: SKIP }, async () => {
  const bytes = aryacad()
  const instance = harness(new Map([
    ['/ws/Prints/aryacad.dxf', bytes],
    ['/ws/Prints/aryacad-copy.dxf', new Uint8Array(bytes)],
  ]))
  const answer = await instance.call('ecad_compare', { a: 'Prints/aryacad.dxf', b: 'Prints/aryacad-copy.dxf' })
  assert.equal(answer.error, undefined, JSON.stringify(answer.error))
  assert.deepEqual(
    { added: answer.data.added, removed: answer.data.removed, changed: answer.data.changed },
    { added: 0, removed: 0, changed: 0 },
    'the same drawing from the CAD app must not appear to have changed',
  )
})
