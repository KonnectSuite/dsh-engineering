import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_DEVICE_TAG_PATTERN,
  DEFAULT_SHEET_REFERENCE_PATTERN,
  DEFAULT_WIRE_LABEL_PATTERN,
  buildSheetModel,
  defaultProfile,
  detectTitleBlock,
  extractInsertAttributes,
  inferProfile,
  isEcadProfile,
  loadProfile,
  serializeProfile,
  validateProfile
} from '../src/engine/index.ts'
import { openFixture, ok } from './helpers.mjs'

/** Infer from the titleblock fixture, whose WD_M block carries the ACADE defaults. */
async function inferred() {
  const opened = await openFixture('titleblock.dxf')
  const model = buildSheetModel(opened)
  const inserts = extractInsertAttributes(opened)
  const titleBlock = detectTitleBlock(model, { ...defaultProfile() })
  return inferProfile([{ model, titleBlock, inserts }])
}

test('the default profile is the documented ACADE IEC baseline', () => {
  const profile = defaultProfile()
  assert.equal(profile.schema, 1)
  assert.deepEqual(profile.titleBlockLayers, ['TITLE_BLOCK'])
  ok(profile.titleBlockLabels.sheetNumber.includes('SHEET NUMBER'))
  assert.equal(profile.deviceTagPattern, DEFAULT_DEVICE_TAG_PATTERN)
  assert.equal(profile.wireLabelPattern, DEFAULT_WIRE_LABEL_PATTERN)
  assert.equal(profile.sheetReferencePattern, DEFAULT_SHEET_REFERENCE_PATTERN)
  ok(profile.minTextHeight > 0)
  ok(isEcadProfile(profile))
})

test('inferProfile reads WD_M and keeps its evidence', async () => {
  const result = await inferred()
  assert.equal(result.profile.wireLayers[0], 'WIRES')
  assert.deepEqual(result.profile.tagLayers, ['TAGS'])
  assert.deepEqual(result.profile.xrefLayers, ['XREF'])
  assert.deepEqual(result.profile.locLayers, ['LOC'])
  // TAGFMT %F%N derives the family+number pattern without the optional suffix letter.
  assert.equal(result.profile.deviceTagPattern, '^[A-Z]{1,3}[0-9]{1,4}$')
  assert.deepEqual(result.profile.titleBlockLayers, ['TITLE_BLOCK'])
  ok(result.profile.titleBlockLabels.date.includes('RELEASE DATE'))
  ok(result.profile.standardLayers.includes('TITLE_BLOCK'))
  assert.equal(result.profile.minTextHeight, 0.04)
  ok(result.confidence >= 0.9, `confidence ${result.confidence}`)
  ok(result.evidence.some(line => line.includes('WD_M WIRELAYS="WIRES"')))
  ok(result.evidence.some(line => line.includes('TAGFMT')))
  ok(result.evidence.some(line => line.includes('minTextHeight 0.04')))
})

test('inferProfile without insert rows does not invent WD_M evidence', async () => {
  const opened = await openFixture('tiny.dxf')
  const model = buildSheetModel(opened)
  const result = inferProfile([{ model, titleBlock: { fields: {} } }])
  assert.equal(result.profile.deviceTagPattern, DEFAULT_DEVICE_TAG_PATTERN)
  ok(result.evidence.some(line => line.includes('no title-block label matched')))
  ok(result.confidence < 0.9)
})

test('inferProfile on no sheets returns the default profile and says so', () => {
  const result = inferProfile([])
  assert.deepEqual(result.profile, defaultProfile())
  ok(result.evidence[0].includes('no sheets supplied'))
})

test('a profile round-trips through serializeProfile and loadProfile', () => {
  const profile = defaultProfile()
  profile.standardLayers = ['0', 'TITLE_BLOCK']
  const text = serializeProfile(profile)
  ok(text.endsWith('\n'))
  assert.deepEqual(loadProfile(text), profile)
  assert.deepEqual(loadProfile(JSON.parse(text)), profile)
})

test('the profile schema check rejects malformed documents', () => {
  assert.equal(validateProfile({}).ok, false)
  const wrongSchema = validateProfile({ ...defaultProfile(), schema: 2 })
  assert.equal(wrongSchema.ok, false)
  ok(wrongSchema.problems.some(problem => problem.includes('schema')))
  const badPattern = validateProfile({ ...defaultProfile(), wireLabelPattern: '([' })
  assert.equal(badPattern.ok, false)
  ok(badPattern.problems.some(problem => problem.includes('regular expression')))
  const badLabels = validateProfile({ ...defaultProfile(), titleBlockLabels: { nope: ['X'] } })
  assert.equal(badLabels.ok, false)
  const badHeight = validateProfile({ ...defaultProfile(), minTextHeight: -1 })
  assert.equal(badHeight.ok, false)
  assert.throws(() => loadProfile('not json'), error => error.code === 'INVALID_INPUT')
  assert.throws(() => loadProfile({ schema: 2 }), error => error.code === 'INVALID_INPUT')
  // A document carrying only the schema is legal and fills every field from the default.
  assert.deepEqual(loadProfile({ schema: 1 }), defaultProfile())
})

test('loadProfile keeps a supplied label override and fills absent fields', () => {
  const outcome = loadProfile(JSON.stringify({ schema: 1, titleBlockLayers: ['TB'], titleBlockLabels: { title: ['DRAWING TITLE'] } }))
  assert.deepEqual(outcome.titleBlockLayers, ['TB'])
  assert.deepEqual(outcome.titleBlockLabels.title, ['DRAWING TITLE'])
  ok(outcome.titleBlockLabels.revision.length > 0)
  assert.equal(outcome.wireLabelPattern, DEFAULT_WIRE_LABEL_PATTERN)
})
