/**
 * Real-corpus gate.
 *
 * These specs run against the owner's read-only print set when it is present on
 * this machine, and skip otherwise. The expected figures are the measured ones
 * from `docs/port/ecad.md` and the M1 report, so a change in the engine that
 * moves them is caught here rather than in a hand review.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildSheetModel,
  crossReference,
  defaultProfile,
  detectIndexSheet,
  detectTitleBlock,
  diffSheetModels,
  dxfBytes,
  extractInsertAttributes,
  inferProfile,
  openSheet,
  renderLayoutSvg,
  renderStackSvg,
  runChecks,
  verifyWritten
} from '../src/engine/index.ts'
import { corpusAvailable, corpusDir, ok } from './helpers.mjs'

const skip = corpusAvailable ? false : 'real corpus not present on this machine (read-only, never committed)'
const baseProfile = defaultProfile()

/** Open every sheet once; the specs share one pass. */
async function loadSet() {
  const files = readdirSync(corpusDir).filter(name => name.toLowerCase().endsWith('.dxf')).sort()
  const sheets = []
  for (const name of files) {
    const bytes = new Uint8Array(readFileSync(join(corpusDir, name)))
    const opened = await openSheet({ path: name, bytes })
    const model = buildSheetModel(opened)
    const inserts = extractInsertAttributes(opened)
    sheets.push({
      path: name,
      bytes,
      opened,
      model,
      inserts,
      titleBlock: detectTitleBlock(model, baseProfile, { inserts }),
      index: detectIndexSheet(model, baseProfile)
    })
  }
  return sheets
}

const sheetsPromise = corpusAvailable ? loadSet() : Promise.resolve([])

test('every print parses and the coverage counters match the recorded gate', { skip }, async () => {
  const sheets = await sheetsPromise
  assert.equal(sheets.length, 34)
  const totals = {}
  let primitives = 0
  let approximate = 0
  let truncated = 0
  const unsupported = {}
  for (const sheet of sheets) {
    for (const [kind, count] of Object.entries(sheet.model.stats.byKind)) totals[kind] = (totals[kind] ?? 0) + count
    for (const [type, count] of Object.entries(sheet.model.stats.unsupported)) unsupported[type] = (unsupported[type] ?? 0) + count
    primitives += sheet.model.stats.entities
    approximate += sheet.model.stats.approximate
    if (sheet.model.stats.truncated) truncated += 1
  }
  assert.equal(primitives, 83936)
  assert.equal(approximate, 1756)
  assert.equal(truncated, 0)
  assert.deepEqual(unsupported, {})
  for (const kind of ['line', 'polyline', 'text', 'arc', 'circle', 'insert', 'spline', 'ellipse', 'hatch', 'point', 'solid', 'mtext', 'viewport', 'dimension', 'leader']) {
    ok(totals[kind] > 0, `expected ${kind} primitives`)
  }
  assert.equal(totals.line, 51332)
  assert.equal(totals.text, 6902)
  assert.equal(totals.viewport, 34)
  assert.equal(totals.leader, 1)
})

test('every layout is present and model space carries the drawing', { skip }, async () => {
  const sheets = await sheetsPromise
  for (const sheet of sheets) {
    const modelLayouts = sheet.model.layouts.filter(layout => layout.kind === 'model')
    assert.equal(modelLayouts.length, 1, sheet.path)
    assert.equal(modelLayouts[0].id, 'Model')
    ok(modelLayouts[0].entities.length > 0, `${sheet.path} has no primitives`)
    const extents = modelLayouts[0].extents
    ok(extents.max[0] > extents.min[0] && extents.max[1] > extents.min[1], `${sheet.path} extents are degenerate`)
  }
})

test('the title block is read from the TITLE_BLOCK text on all 34 sheets', { skip }, async () => {
  const sheets = await sheetsPromise
  let withNumber = 0
  let withTitle = 0
  for (const sheet of sheets) {
    const fields = sheet.titleBlock.fields
    const expected = Number(/(\d+)\.dxf$/.exec(sheet.path)[1])
    ok(fields.sheetNumber, `${sheet.path} has no sheet number`)
    assert.equal(fields.sheetNumber.source, 'text')
    assert.equal(Number(/(\d+)$/.exec(fields.sheetNumber.value)[1]), expected, `${sheet.path} sheet number ${fields.sheetNumber.value}`)
    ok(fields.sheetNumber.confidence >= 0.8, `${sheet.path} sheet-number confidence ${fields.sheetNumber.confidence}`)
    ok(fields.title, `${sheet.path} has no title`)
    if (fields.sheetNumber) withNumber += 1
    if (fields.title) withTitle += 1
  }
  assert.equal(withNumber, 34)
  assert.equal(withTitle, 34)
})

test('sheet 001 is the index sheet and its table is parsed by column', { skip }, async () => {
  const sheets = await sheetsPromise
  const indexSheets = sheets.filter(sheet => sheet.index)
  assert.equal(indexSheets.length, 1)
  const index = indexSheets[0].index
  assert.equal(indexSheets[0].path, 'FC1000495-001.dxf')
  assert.equal(index.heading, 'SHEET INDEX')
  assert.equal(index.entries.length, 80)
  const first = index.entries[0]
  assert.deepEqual([first.sheetNumber, first.title], ['21036-001', 'SHEET INDEX'])
  const second = index.entries[1]
  assert.deepEqual([second.sheetNumber, second.title], ['21036-002', '480VAC POWER DISTRIBUTION'])
  const spare = index.entries.find(entry => entry.title === 'SPARE SHEET')
  assert.ok(spare)
  const terminal = index.entries.find(entry => entry.title === 'TERMINAL ROTATION')
  assert.equal(terminal.sheetNumber, '33')
  // The "FILENAME SHT DESCRIPTION" column header is not a sheet entry.
  assert.equal(index.entries.filter(entry => entry.raw.includes('DESCRIPTION') && entry.sheetNumber === undefined).length, 0)
  assert.equal(index.entries.filter(entry => entry.title === 'FILENAME').length, 0)
})

test('the inferred profile is the ACADE default confirmed by the set', { skip }, async () => {
  const sheets = await sheetsPromise
  const inference = inferProfile(sheets.map(sheet => ({ model: sheet.model, titleBlock: sheet.titleBlock, inserts: sheet.inserts })))
  assert.equal(inference.confidence, 0.95)
  assert.deepEqual(inference.profile.titleBlockLayers, ['TITLE_BLOCK'])
  assert.deepEqual(inference.profile.wireLayers, ['WIRES'])
  assert.deepEqual(inference.profile.tagLayers, ['TAGS'])
  assert.deepEqual(inference.profile.xrefLayers, ['XREF'])
  assert.deepEqual(inference.profile.locLayers, ['LOC'])
  assert.equal(inference.profile.deviceTagPattern, '^[A-Z]{1,3}[0-9]{1,4}$')
  assert.equal(inference.profile.minTextHeight, 0.04)
  assert.equal(inference.profile.units, 0)
  assert.equal(inference.profile.standardLayers.length, 33)
  ok(inference.evidence.some(line => line.includes('WD_M TAGFMT="%F%N"')), 'TAGFMT evidence is recorded')
  ok(inference.evidence.some(line => line.includes('INSUNITS=0')), 'unset units are stated')
})

/** Shared inference for the cross-reference and checks specs. */
async function inferredProfile() {
  const sheets = await sheetsPromise
  return inferProfile(sheets.map(sheet => ({ model: sheet.model, titleBlock: sheet.titleBlock, inserts: sheet.inserts })))
}

test('cross-reference reports candidates with a note and a low confidence where evidence is thin', { skip }, async () => {
  const sheets = await sheetsPromise
  const inference = await inferredProfile()
  const rows = crossReference(sheets.map(sheet => ({ path: sheet.path, model: sheet.model })), inference.profile)
  ok(rows.length > 50, `expected candidate rows, got ${rows.length}`)
  const kinds = new Set(rows.map(row => row.kind))
  assert.deepEqual([...kinds].sort(), ['device-tag', 'sheet-reference', 'wire-label'])
  // Every sheet reference in this set resolves: the set is internally consistent.
  const references = rows.filter(row => row.kind === 'sheet-reference')
  assert.equal(references.length, 4)
  assert.deepEqual(references.map(row => row.status), ['ok', 'ok', 'ok', 'ok'])
  // Device tags: the known duplicate candidates in this set are L1 and MPE206.
  const duplicates = rows.filter(row => row.kind === 'device-tag' && row.status === 'duplicate').map(row => row.value)
  assert.deepEqual(duplicates.sort(), ['L1', 'MPE206'])
  // The set uses a WIRES layer on a few sheets and bare numbers on layer 0
  // everywhere else. Without layer evidence only duplicate candidates are
  // reported, at low confidence, so pattern noise never reads as wire evidence.
  const wireRows = rows.filter(row => row.kind === 'wire-label')
  ok(wireRows.length > 0)
  assert.deepEqual([...new Set(wireRows.map(row => row.status))], ['duplicate'])
  ok(wireRows.every(row => row.confidence <= 0.55), 'wire rows stay low-confidence')
  ok(rows.every(row => typeof row.note === 'string' && row.note.length > 0), 'every row carries its basis')
})

test('checks against the real set name exactly the measured findings', { skip }, async () => {
  const sheets = await sheetsPromise
  const inference = await inferredProfile()
  const index = sheets.find(sheet => sheet.index)?.index
  const checkSheets = sheets.map(sheet => ({ path: sheet.path, model: sheet.model, titleBlock: sheet.titleBlock, index: sheet.index }))
  const findings = runChecks({ sheets: checkSheets, profile: inference.profile, index })
  const counts = {}
  for (const finding of findings) counts[finding.rule] = (counts[finding.rule] ?? 0) + 1
  assert.equal(counts['ECAD-TB-MISSING'] ?? 0, 0)
  assert.equal(counts['ECAD-SHEET-MISMATCH'] ?? 0, 0)
  assert.equal(counts['ECAD-TB-BLANK'], 68)
  assert.equal(counts['ECAD-INDEX-MISMATCH'], 3)
  assert.equal(counts['ECAD-DEVICE-DUPLICATE'], 2)
  assert.equal(counts['ECAD-WIRE-DUPLICATE'], 20)
  assert.equal(counts['ECAD-TEXT-TOO-SMALL'], 3)
  assert.equal(counts['ECAD-LAYER-UNKNOWN'] ?? 0, 0, 'the inferred standard layers are the measured ones')
  assert.equal(counts['ECAD-SCOPE'], 1)
  assert.equal(findings[findings.length - 1].rule, 'ECAD-SCOPE')
  // The index names sheets 33 and 34, for which the set carries no drawing, and
  // file 046 is the one sheet the index does not list.
  const indexFindings = findings.filter(finding => finding.rule === 'ECAD-INDEX-MISMATCH').map(finding => finding.message)
  ok(indexFindings.some(message => message.includes('"33"') && message.includes('TERMINAL ROTATION')))
  ok(indexFindings.some(message => message.includes('"34"') && message.includes('CABLE LAYOUT')))
  ok(indexFindings.some(message => message.includes('FC1000495-046.dxf')))
})

test('every sheet renders to SVG and a stacked review page is produced', { skip }, async () => {
  const sheets = await sheetsPromise
  let bytes = 0
  for (const sheet of sheets) {
    const svg = renderLayoutSvg(sheet.model, 'Model')
    ok(svg.startsWith('<svg'), `${sheet.path} did not render`)
    ok(svg.includes('data-ecad-kind="line"'), `${sheet.path} has no drawn line`)
    bytes += svg.length
  }
  ok(bytes > 15_000_000, `expected the whole set to render, got ${bytes} bytes`)
  const stack = renderStackSvg(
    sheets.slice(0, 3).map(sheet => ({ title: `${sheet.path} ${sheet.titleBlock.fields.sheetNumber?.value ?? ''}`, model: sheet.model })),
    { itemHeight: 500 }
  )
  ok(stack.includes('FC1000495-001.dxf'))
})

test('writing every sheet back and re-reading it changes nothing in the model', { skip }, async () => {
  const sheets = await sheetsPromise
  for (const sheet of sheets) {
    const bytes = dxfBytes(sheet.opened)
    ok(bytes.byteLength > 1000, `${sheet.path} wrote ${bytes.byteLength} bytes`)
    const reread = await openSheet({ path: sheet.path, bytes })
    const after = buildSheetModel(reread)
    const diff = diffSheetModels(sheet.model, after)
    assert.deepEqual(
      [diff.added.length, diff.removed.length, diff.changed.length],
      [0, 0, 0],
      `${sheet.path} round-trip differs: ${JSON.stringify(diff.changed.slice(0, 3).map(change => change.reason))}`
    )
    assert.equal(diff.truncated, false)
    const verification = await verifyWritten(sheet.opened, bytes, { changes: {}, baseModel: sheet.model })
    assert.equal(verification.ok, true, `${sheet.path}: ${JSON.stringify(verification.problems)}`)
  }
})
