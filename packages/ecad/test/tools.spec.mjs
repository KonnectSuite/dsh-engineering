/**
 * The model-facing ECAD tools, end to end through a fake Cordis composition.
 *
 * The harness in `harness.mjs` mirrors the host contract (FsTarget resolution,
 * write intents, sandbox policy, effect disposal), so these specs exercise the
 * real tool bodies against committed synthetic DXFs. Every tool is called the way
 * a model would call it; no test reaches the customer print set.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ecadTools } from '../src/tools/index.ts'
import { ECAD_TOOL_NAMES } from '../src/tools/workspace.ts'
import { ECAD_RULES } from '../src/tools/shared.ts'
import { fixtureBytes, harness, WS } from './harness.mjs'
import { ok } from './helpers.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

/** The fixture set shared by the tool specs. */
function fixtureSet(extra = new Map()) {
  const files = new Map([
    ['/ws/Prints/tiny.dxf', fixtureBytes('tiny.dxf')],
    ['/ws/Prints/titleblock.dxf', fixtureBytes('titleblock.dxf')],
    ['/ws/Prints/index.dxf', fixtureBytes('index.dxf')],
    ['/ws/Prints/ACME-007.dxf', fixtureBytes('review.dxf')]
  ])
  for (const [path, value] of extra) files.set(path, value)
  return files
}

/** All four fixture drawings, for calls that take explicit paths. */
const ALL_PATHS = ['Prints/ACME-007.dxf', 'Prints/index.dxf', 'Prints/tiny.dxf', 'Prints/titleblock.dxf']

/** Assert one success envelope and return it. */
function succeed(envelope, what) {
  assert.equal(envelope.error, undefined, `${what}: ${JSON.stringify(envelope.error)}`)
  assert.equal(typeof envelope.summary, 'string')
  ok(envelope.summary.length > 0, `${what} has a summary`)
  assert.ok(envelope.data !== null && typeof envelope.data === 'object', `${what} has data`)
  assert.ok(Array.isArray(envelope.next), `${what} has next steps`)
  assert.ok(envelope.coverage !== null && typeof envelope.coverage === 'object', `${what} has coverage`)
  assert.equal(typeof envelope.coverage.complete, 'boolean')
  assert.ok(Array.isArray(envelope.coverage.unverified))
  return envelope
}

/** Assert one failure envelope and return it. */
function fail(envelope, code, what) {
  assert.ok(envelope.error !== undefined && envelope.error !== null, `${what}: expected an error envelope, got ${JSON.stringify(envelope).slice(0, 300)}`)
  assert.equal(envelope.error.code, code, `${what}: ${JSON.stringify(envelope.error)}`)
  ok(typeof envelope.error.message === 'string' && envelope.error.message.length > 0, `${what} names the failure`)
  ok(typeof envelope.error.fix === 'string' && envelope.error.fix.length > 0, `${what} names the fix`)
  return envelope
}

/** Read one written text file from the fake workspace. */
function writtenText(instance, path) {
  const bytes = instance.files.get(path)
  return bytes === undefined ? undefined : new TextDecoder().decode(bytes)
}

test('the tool factories build without a live session, for the generated reference', () => {
  const definitions = ecadTools({})
  assert.equal(definitions.length, 16)
  assert.deepEqual(definitions.map(definition => definition.name), [...ECAD_TOOL_NAMES])
  for (const definition of definitions) assert.doesNotThrow(() => JSON.stringify(definition.parameters))
})

test('the row registers exactly the sixteen documented tools', () => {
  const instance = harness(fixtureSet())
  const names = instance.definitions.map(definition => definition.name)
  assert.deepEqual(names, [...ECAD_TOOL_NAMES])
  assert.equal(new Set(names).size, 16)
  for (const definition of instance.definitions) {
    ok(definition.name.startsWith('ecad_'), `${definition.name} keeps the ecad_ namespace`)
    ok(typeof definition.description === 'string' && definition.description.length > 40, `${definition.name} is described`)
    assert.equal(definition.parameters.type, 'object')
    assert.equal(definition.parameters.additionalProperties, false)
    assert.equal(typeof definition.parameters.properties, 'object')
    assert.ok(Array.isArray(definition.parameters.required))
    assert.doesNotThrow(() => JSON.stringify({ name: definition.name, description: definition.description, parameters: definition.parameters }))
    assert.equal(typeof definition.output.render, 'function')
    assert.equal(typeof definition.execute, 'function')
  }
  assert.ok(instance.services.has('ecadSession'), 'the workspace session is provided to other entries')
})

test('the skill names every tool and no tool it does not register', () => {
  const instance = harness(fixtureSet())
  const skill = readFileSync(join(HERE, '..', 'SKILL.md'), 'utf8')
  const registered = new Set(instance.definitions.map(definition => definition.name))
  const cited = new Set([...skill.matchAll(/`(ecad_[a-z_]+)`/gu)].map(match => match[1]))
  for (const name of registered) ok(skill.includes(name), `SKILL.md names ${name}`)
  for (const name of cited) assert.ok(registered.has(name), `SKILL.md cites ${name}, which is not registered`)
})

test('capabilities reports formats, limits, writes and what the build cannot do, without a service', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_capabilities'), 'capabilities')
  const data = envelope.data
  assert.equal(data.writes, false)
  assert.deepEqual(data.formats.supported, ['.dxf'])
  assert.deepEqual(data.formats.recognised, ['.dxf', '.dwg'])
  assert.equal(data.formats.dwg, false)
  assert.equal(data.limits.maxFileBytes, 64 * 1024 * 1024)
  assert.equal(data.tools.length, 16)
  assert.deepEqual(data.rules, [...ECAD_RULES])
  assert.equal(data.workspace.index.present, false)
  assert.equal(data.workspace.profile.source, 'default')
  ok(data.limitations.some(line => line.includes('DWG support is landing in this batch')), 'the DWG state is stated')
  ok(envelope.next.some(step => step.tool === 'ecad_scan'))
})

test('the row configures the panel service and resets its writes switch on dispose', () => {
  const instance = harness(fixtureSet(), { writes: true, service: true })
  assert.equal(instance.configureCalls.length, 1)
  assert.equal(instance.configureCalls[0].writes, true)
  assert.equal(instance.remoteService.writes, true)
  instance.disposeAll()
  assert.equal(instance.configureCalls.at(-1).writes, false)
  assert.equal(instance.remoteService.writes, false)
})

test('a service that refuses the policy is reported and does not stop the mount', async () => {
  const instance = harness(fixtureSet(), { writes: true, service: true, configureThrows: true })
  assert.equal(instance.definitions.length, 16)
  ok(instance.warnings.some(message => message.includes('did not accept the row policy')), `warnings: ${JSON.stringify(instance.warnings)}`)
  succeed(await instance.call('ecad_capabilities'), 'capabilities after service refusal')
})

test('the drawing panel and the tools share one writes policy', async () => {
  const instance = harness(fixtureSet(), { writes: true, service: true })
  const envelope = succeed(await instance.call('ecad_capabilities'), 'capabilities')
  assert.equal(envelope.data.writes, true)
  assert.equal(instance.remoteService.writes, true)
  const session = instance.services.get('ecadSession')
  assert.equal(session.writes, true)
})

test('profile reads the defaults, infers from drawings and saves only when confirmed', async () => {
  const instance = harness(fixtureSet())
  const read = succeed(await instance.call('ecad_profile', { action: 'read' }), 'profile read')
  assert.equal(read.data.source, 'default')
  assert.equal(read.data.profile.schema, 1)

  const inferred = succeed(await instance.call('ecad_profile', { action: 'infer', paths: ['Prints/ACME-007.dxf'] }), 'profile infer')
  ok(inferred.data.confidence > 0.5, `confidence ${inferred.data.confidence}`)
  ok(Array.isArray(inferred.data.evidence) && inferred.data.evidence.length > 3)
  assert.equal(inferred.data.saved, false)
  assert.equal(instance.files.has('/ws/.ecad/profile.json'), false, 'infer alone writes no profile')

  const saved = succeed(await instance.call('ecad_profile', { action: 'infer', confirm: true, paths: ['Prints/ACME-007.dxf'] }), 'profile infer+confirm')
  assert.equal(saved.data.saved, true)
  assert.equal(saved.data.profilePath, '.ecad/profile.json')
  ok(instance.files.has('/ws/.ecad/profile.json'), 'the confirmed profile is written')

  const reread = succeed(await instance.call('ecad_profile', { action: 'read' }), 'profile reread')
  assert.equal(reread.data.source, 'workspace')
  assert.equal(reread.data.path, '.ecad/profile.json')
})

test('profile save requires confirmation and an invalid profile file is a typed failure', async () => {
  const instance = harness(fixtureSet())
  fail(await instance.call('ecad_profile', { action: 'save' }), 'ECAD_CONFIRMATION_REQUIRED', 'profile save unconfirmed')
  fail(await instance.call('ecad_profile', { action: 'nonsense' }), 'INVALID_ARGUMENT', 'profile unknown action')
  const broken = harness(fixtureSet(new Map([['/ws/.ecad/profile.json', '{not json']])))
  fail(await broken.call('ecad_profile', { action: 'read' }), 'ECAD_PROFILE_INVALID', 'profile invalid file')
})

test('scan indexes the workspace, detects the index sheet and reports formats', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_scan'), 'scan')
  const data = envelope.data
  assert.equal(data.sheets, 4)
  assert.deepEqual(data.formats, { dxf: 4 })
  assert.equal(data.indexPath, '.ecad/index.json')
  assert.ok(instance.files.has('/ws/.ecad/index.json'))
  assert.equal(data.indexSheet.path, 'Prints/index.dxf')
  assert.equal(data.indexSheet.entries, 6)
  assert.equal(data.sets.set, 3)
  assert.equal(data.sets.ACME, 1)
  assert.equal(data.skipped.length, 0)
  assert.equal(data.sample.length, 4)
  const index = JSON.parse(writtenText(instance, '/ws/.ecad/index.json'))
  assert.equal(index.schema, 1)
  assert.equal(index.sheets.length, 4)
  assert.equal(typeof index.scannedAt, 'string')
  ok(index.sheets.some(sheet => sheet.sheetNumber === 'ACME-007' && sheet.title === 'PUMP STATION'))
})

test('scan reports a DWG as skipped with the typed reason and a bad root as a failure', async () => {
  const withDwg = harness(fixtureSet(new Map([['/ws/Prints/legacy.dwg', new Uint8Array([1, 2, 3, 4])]])))
  const envelope = succeed(await withDwg.call('ecad_scan'), 'scan with dwg')
  assert.equal(envelope.data.sheets, 4)
  assert.equal(envelope.data.skipped.length, 1)
  assert.equal(envelope.data.skipped[0].path, 'Prints/legacy.dwg')
  assert.ok(envelope.data.skipped[0].reason.includes('DWG'))
  assert.equal(envelope.coverage.complete, false)
  fail(await withDwg.call('ecad_scan', { root: 'no-such-folder' }), 'ECAD_INVALID_ROOT', 'scan bad root')
})

test('scan refuses honestly when the provider cannot list directories', async () => {
  const instance = harness(fixtureSet(), { listDir: false })
  fail(await instance.call('ecad_scan'), 'ECAD_SCAN_UNAVAILABLE', 'scan without listDir')
})

test('open reads a drawing, writes its preview and caches per chat', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_open', { path: 'Prints/titleblock.dxf' }), 'open')
  const data = envelope.data
  assert.equal(data.path, 'Prints/titleblock.dxf')
  assert.equal(data.dxfVersion, 'AC1032')
  assert.ok(data.entities > 10)
  assert.equal(data.titleBlock.fields.title.value, 'PUMP STATION')
  ok(data.modelPath.startsWith('.ecad/previews/') && data.modelPath.endsWith('.json'))
  ok(instance.files.has(`/ws/${data.modelPath}`), 'the preview artifact is written where the panel reads it')
  assert.equal(data.format, undefined, 'DXF carries no format field')
  assert.equal(data.converted, undefined)

  const cached = succeed(await instance.call('ecad_open', { path: 'Prints/titleblock.dxf' }), 'open cached')
  assert.equal(cached.data.version, data.version)
  instance.files.set('/ws/Prints/titleblock.dxf', fixtureBytes('tiny.dxf'))
  const stillCached = succeed(await instance.call('ecad_open', { path: 'Prints/titleblock.dxf' }), 'open still cached')
  assert.equal(stillCached.data.version, data.version, 'a cached open does not re-read the file')
  const reloaded = succeed(await instance.call('ecad_open', { path: 'Prints/titleblock.dxf', reload: true }), 'open reload')
  assert.notEqual(reloaded.data.version, data.version)
})

test('every drawing read goes through the format module, so DWG is a typed refusal', async () => {
  const instance = harness(fixtureSet(new Map([['/ws/Prints/legacy.dwg', new Uint8Array([1, 2, 3, 4])]])))
  const calls = [
    ['ecad_open', { path: 'Prints/legacy.dwg' }],
    ['ecad_overview', { path: 'Prints/legacy.dwg' }],
    ['ecad_render', { path: 'Prints/legacy.dwg' }],
    ['ecad_compare', { a: 'Prints/legacy.dwg', b: 'Prints/tiny.dxf' }],
    ['ecad_draft_ops', { path: 'Prints/legacy.dwg', ops: [{ op: 'addText', layout: 'Model', p: [1, 1], text: 'x', height: 0.1 }] }],
    ['ecad_verify', { path: 'Prints/legacy.dwg' }],
    ['ecad_find', { query: 'x', path: 'Prints/legacy.dwg' }],
    ['ecad_checks', { path: 'Prints/legacy.dwg' }],
    ['ecad_cross_reference', { path: 'Prints/legacy.dwg' }]
  ]
  for (const [tool, args] of calls) fail(await instance.call(tool, args), 'ECAD_DWG_UNSUPPORTED', `${tool} on dwg`)
})

test('overview summarises explicit drawings and falls back to the index', async () => {
  const instance = harness(fixtureSet())
  fail(await instance.call('ecad_overview'), 'ECAD_NO_INDEX', 'overview without index')
  const drawings = succeed(await instance.call('ecad_overview', { path: 'Prints/titleblock.dxf', include_layers: true }), 'overview drawings')
  assert.equal(drawings.data.source, 'drawings')
  assert.equal(drawings.data.rows.length, 1)
  assert.equal(drawings.data.rows[0].titleBlock.fields.title.value, 'PUMP STATION')
  assert.ok(Array.isArray(drawings.data.rows[0].layers))
  succeed(await instance.call('ecad_scan'), 'scan first')
  const indexed = succeed(await instance.call('ecad_overview'), 'overview index')
  assert.equal(indexed.data.source, 'index')
  assert.equal(indexed.data.sheets, 4)
  assert.equal(indexed.data.rows.length, 4)
  assert.equal(indexed.data.totals.unsupported, 1)
  assert.ok(indexed.coverage.unverified.some(line => line.includes('index.json')))
})

test('find searches literals and regexes with a layer filter and a bounded result', async () => {
  const instance = harness(fixtureSet())
  succeed(await instance.call('ecad_scan'), 'scan first')
  const literal = succeed(await instance.call('ecad_find', { query: 'sheet' }), 'find literal')
  ok(literal.data.matches > 0, `matches ${literal.data.matches}`)
  assert.ok(literal.data.rows.every(row => typeof row.path === 'string' && typeof row.layer === 'string' && typeof row.id === 'string'))
  const regex = succeed(await instance.call('ecad_find', { query: 'M\\d', regex: true }), 'find regex')
  ok(regex.data.matches >= 2)
  const tagged = succeed(await instance.call('ecad_find', { query: 'M1', layer: 'TAGS' }), 'find layer filter')
  assert.ok(tagged.data.rows.length > 0)
  assert.ok(tagged.data.rows.every(row => row.layer === 'TAGS'))
  const capped = succeed(await instance.call('ecad_find', { query: 'SHEET', limit: 1 }), 'find capped')
  assert.equal(capped.data.returned, 1)
  assert.equal(capped.data.truncated, true)
  fail(await instance.call('ecad_find', { query: '(' , regex: true }), 'ECAD_INVALID_PATTERN', 'find bad regex')
  const fresh = harness(fixtureSet())
  fail(await fresh.call('ecad_find', { query: 'x' }), 'ECAD_NO_SHEETS', 'find without set')
})

test('cross-reference reports the candidate rows and their basis', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_cross_reference', { path: 'Prints/ACME-007.dxf' }), 'cross reference')
  const rows = envelope.data.rows
  const device = rows.find(row => row.kind === 'device-tag' && row.value === 'M1')
  ok(device, 'the duplicate device tag is a candidate')
  assert.equal(device.status, 'duplicate')
  assert.ok(device.confidence > 0 && device.confidence <= 1)
  ok(device.note.includes('candidate'))
  const wire = rows.find(row => row.kind === 'wire-label' && row.value === '12')
  assert.equal(wire.status, 'ok')
  const oneSided = rows.find(row => row.kind === 'wire-label' && row.value === '13')
  assert.equal(oneSided.status, 'one-sided')
  const reference = rows.find(row => row.kind === 'sheet-reference' && row.value === 'SHEET 2')
  assert.equal(reference.status, 'unresolved')
  assert.ok(envelope.coverage.unverified.some(line => line.includes('candidates')))
})

test('checks returns stable rule ids, counts and the scope note', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_checks', { path: 'Prints/ACME-007.dxf' }), 'checks')
  assert.equal(envelope.data.sheets, 1)
  assert.deepEqual(envelope.data.rulesRun, [...ECAD_RULES])
  const byRule = envelope.data.counts.byRule
  assert.equal(byRule['ECAD-SCOPE'], 1)
  ok(byRule['ECAD-DEVICE-DUPLICATE'] >= 1, `device duplicate rule fired: ${JSON.stringify(byRule)}`)
  ok(byRule['ECAD-TEXT-TOO-SMALL'] >= 1, 'text-too-small fired on the 0.01 text')
  ok(byRule['ECAD-SHEET-REF-UNRESOLVED'] >= 1, 'the unresolved sheet reference fired')
  ok(envelope.data.findings.every(finding => typeof finding.rule === 'string' && typeof finding.severity === 'string' && typeof finding.message === 'string'))
  assert.equal(envelope.data.findings.at(-1).rule, 'ECAD-SCOPE')
  ok(typeof envelope.data.scope === 'string' && envelope.data.scope.includes('do not prove'))
  ok(envelope.coverage.unverified.some(line => line.includes('do not prove')))
})

test('render writes a bounded SVG artifact and refuses an unknown layout', async () => {
  const instance = harness(fixtureSet())
  const envelope = succeed(await instance.call('ecad_render', { path: 'Prints/titleblock.dxf' }), 'render')
  assert.equal(envelope.data.layout, 'Model')
  ok(envelope.data.svgPath.startsWith('.ecad/renders/') && envelope.data.svgPath.endsWith('.svg'))
  ok(envelope.data.characters > 1000, `characters ${envelope.data.characters}`)
  ok(instance.files.has(`/ws/${envelope.data.svgPath}`), 'the SVG is written under .ecad/renders')
  assert.ok(envelope.data.unsupported === 0)
  ok(envelope.coverage.unverified.some(line => line.includes('geometry and colour only')))
  const paper = succeed(await instance.call('ecad_render', { path: 'Prints/titleblock.dxf', layout: 'Layout1' }), 'render paper')
  assert.equal(paper.data.kind, 'paper')
  fail(await instance.call('ecad_render', { path: 'Prints/titleblock.dxf', layout: 'Nope' }), 'ECAD_UNKNOWN_LAYOUT', 'render unknown layout')
  const sanitized = succeed(await instance.call('ecad_render', { path: 'Prints/titleblock.dxf', name: '../../evil.svg' }), 'render sanitized name')
  assert.equal(sanitized.data.svgPath.includes('..'), false)
})

test('compare reports semantic changes and identical files as no change', async () => {
  const instance = harness(fixtureSet())
  const different = succeed(await instance.call('ecad_compare', { a: 'Prints/tiny.dxf', b: 'Prints/titleblock.dxf' }), 'compare different')
  ok(different.data.added + different.data.removed + different.data.changed > 0)
  assert.ok(Array.isArray(different.data.rows))
  assert.equal(different.data.tolerance, 0.001)
  assert.ok(different.data.rows.every(row => typeof row.reason === 'string'))
  const same = succeed(await instance.call('ecad_compare', { a: 'Prints/tiny.dxf', b: 'Prints/tiny.dxf' }), 'compare same')
  assert.deepEqual([same.data.added, same.data.removed, same.data.changed], [0, 0, 0])
  assert.equal(same.data.truncated, false)
})

test('draft_ops validates first and stages only a valid draft', async () => {
  const instance = harness(fixtureSet())
  const ops = [
    { op: 'addText', layout: 'Model', p: [1, 1], text: 'REVIEWED', height: 0.2 },
    { op: 'addRectangle', layout: 'Model', corner1: [0, 0], corner2: [2, 2] }
  ]
  const staged = succeed(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'draft-one' }), 'draft_ops valid')
  assert.equal(staged.data.staged, true)
  assert.equal(staged.data.draftId, 'draft-one')
  assert.equal(staged.data.draftPath, '.ecad/drafts/draft-one.json')
  ok(instance.files.has('/ws/.ecad/drafts/draft-one.json'))
  assert.deepEqual(staged.data.changes, { addText: 1, addRectangle: 1 })
  assert.equal(staged.data.validation.ok, true)

  const invalid = succeed(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops: [{ op: 'erase', layout: 'Model', ids: ['FFFF'] }], draft_id: 'draft-bad' }), 'draft_ops invalid')
  assert.equal(invalid.data.staged, false)
  assert.equal(invalid.data.validation.ok, false)
  assert.ok(invalid.data.validation.errors.length >= 1)
  ok(invalid.data.validation.errors[0].fix.length > 0)
  assert.equal(instance.files.has('/ws/.ecad/drafts/draft-bad.json'), false, 'an invalid draft is not staged')
  assert.equal(invalid.coverage.complete, false)

  fail(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf' }), 'INVALID_ARGUMENT', 'draft_ops without ops')
  fail(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, expect_version: 'deadbeef' }), 'ECAD_STALE_DOCUMENT', 'draft_ops stale version')
})

test('draft_apply writes a NEW drawing, verifies it and records the applied draft', async () => {
  const instance = harness(fixtureSet(), { writes: true })
  const ops = [{ op: 'addText', layout: 'Model', p: [1, 1], text: 'ARIA REVIEW', height: 0.2, layer: 'REVIEW' }]
  succeed(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'apply-one' }), 'stage')
  const applied = succeed(await instance.call('ecad_draft_apply', { draft_id: 'apply-one' }), 'apply')
  const data = applied.data
  assert.equal(applied.coverage.complete, true, JSON.stringify(applied.coverage.unverified))
  ok(data.outputPath.endsWith('.dxf'))
  ok(data.outputPath.includes('-ecad-'))
  assert.notEqual(data.outputPath, data.sourcePath)
  ok(instance.files.has(`/ws/${data.outputPath}`), 'the edited drawing is written')
  assert.match(data.outputVersion, /^[0-9a-f]{64}$/)
  assert.equal(data.verification.ok, true)
  assert.deepEqual(data.changes, { addText: 1 })
  assert.equal(data.format, undefined, 'DXF output carries no format field')
  ok(data.modelPath.startsWith('.ecad/previews/'))
  ok(instance.files.has('/ws/.ecad/drafts/apply-one.applied.json'), 'the applied record is kept for ecad_verify')
  assert.equal(instance.files.get('/ws/Prints/titleblock.dxf').byteLength, fixtureBytes('titleblock.dxf').byteLength, 'the source is untouched')
})

test('draft_apply refuses to overwrite, refuses when writes are off, and refuses a stale source', async () => {
  const off = harness(fixtureSet())
  const ops = [{ op: 'addText', layout: 'Model', p: [1, 1], text: 'X', height: 0.2 }]
  succeed(await off.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'no-writes' }), 'stage with writes off')
  fail(await off.call('ecad_draft_apply', { draft_id: 'no-writes' }), 'ECAD_WRITES_DISABLED', 'apply with writes off')

  const on = harness(fixtureSet(), { writes: true })
  succeed(await on.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'overwrite-check' }), 'stage')
  fail(await on.call('ecad_draft_apply', { draft_id: 'overwrite-check', overwrite: true }), 'ECAD_OVERWRITE_REFUSED', 'apply overwrite')

  on.files.set('/ws/Prints/existing.dxf', fixtureBytes('tiny.dxf'))
  succeed(await on.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'explicit-path' }), 'stage explicit')
  const applied = succeed(await on.call('ecad_draft_apply', { draft_id: 'explicit-path', output_path: 'Prints/existing.dxf' }), 'apply explicit path')
  assert.equal(applied.data.outputPath, 'Prints/existing-1.dxf', 'an existing output path is never overwritten')

  on.files.set('/ws/Prints/titleblock.dxf', fixtureBytes('tiny.dxf'))
  fail(await on.call('ecad_draft_apply', { draft_id: 'explicit-path' }), 'ECAD_STALE_SOURCE', 'apply after source changed')
})

test('draft_discard deletes the draft, and refuses it in memory when the provider cannot delete', async () => {
  const instance = harness(fixtureSet(), { writes: true })
  const ops = [{ op: 'addText', layout: 'Model', p: [1, 1], text: 'X', height: 0.2 }]
  succeed(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'discard-me' }), 'stage')
  const discarded = succeed(await instance.call('ecad_draft_discard', { draft_id: 'discard-me' }), 'discard')
  assert.equal(discarded.data.discarded, true)
  assert.equal(discarded.data.deleted, true)
  assert.equal(instance.files.has('/ws/.ecad/drafts/discard-me.json'), false)
  fail(await instance.call('ecad_draft_discard', { draft_id: 'discard-me' }), 'DRAFT_NOT_FOUND', 'discard twice')

  const noDelete = harness(fixtureSet(), { writes: true, delete: false })
  succeed(await noDelete.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'keep-file' }), 'stage')
  const refused = succeed(await noDelete.call('ecad_draft_discard', { draft_id: 'keep-file' }), 'discard without delete')
  assert.equal(refused.data.deleted, false)
  ok(noDelete.files.has('/ws/.ecad/drafts/keep-file.json'), 'the draft file stays on disk')
  ok(refused.coverage.unverified.some(line => line.includes('remains on disk')))
  fail(await noDelete.call('ecad_draft_apply', { draft_id: 'keep-file' }), 'DRAFT_NOT_FOUND', 'apply a discarded draft')
})

test('verify proves an applied draft and re-reads a drawing by path', async () => {
  const instance = harness(fixtureSet(), { writes: true })
  const ops = [{ op: 'addText', layout: 'Model', p: [1, 1], text: 'PROOF', height: 0.2 }]
  succeed(await instance.call('ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops, draft_id: 'proof' }), 'stage')
  const applied = succeed(await instance.call('ecad_draft_apply', { draft_id: 'proof' }), 'apply')
  const verified = succeed(await instance.call('ecad_verify', { draft_id: 'proof' }), 'verify draft')
  assert.equal(verified.data.mode, 'draft')
  assert.equal(verified.data.verification.ok, true)
  assert.equal(verified.data.outputPath, applied.data.outputPath)
  assert.equal(verified.data.outputChanged, false)
  assert.equal(verified.coverage.complete, true)
  fail(await instance.call('ecad_verify', { draft_id: 'never-applied' }), 'ECAD_NO_APPLIED_RECORD', 'verify unknown draft')
  const readback = succeed(await instance.call('ecad_verify', { path: 'Prints/titleblock.dxf' }), 'verify readback')
  assert.equal(readback.data.mode, 'readback')
  assert.match(readback.data.version, /^[0-9a-f]{64}$/)
  fail(await instance.call('ecad_verify', {}), 'INVALID_ARGUMENT', 'verify without arguments')
  fail(await instance.call('ecad_verify', { draft_id: 'x', path: 'Prints/titleblock.dxf' }), 'INVALID_ARGUMENT', 'verify both arguments')
})

test('document writes the review bundle with the measured findings and title blocks', async () => {
  const instance = harness(fixtureSet(), { writes: true })
  const envelope = succeed(await instance.call('ecad_document', { paths: ALL_PATHS, output: 'review-bundle', title: 'ACME review' }), 'document')
  assert.equal(envelope.data.outputRoot, 'review-bundle')
  assert.equal(envelope.data.sheets, 4)
  const names = envelope.data.files.map(file => file.name).sort()
  assert.deepEqual(names, ['README.md', 'coverage.md', 'cross-reference.csv', 'findings.csv', 'index.json', 'sheets.csv', 'title-blocks.csv'])
  ok(writtenText(instance, '/ws/review-bundle/sheets.csv').includes('ACME-007.dxf'))
  ok(writtenText(instance, '/ws/review-bundle/title-blocks.csv').includes('PUMP STATION'))
  ok(writtenText(instance, '/ws/review-bundle/findings.csv').includes('ECAD-'))
  ok(writtenText(instance, '/ws/review-bundle/cross-reference.csv').includes('M1'))
  const snapshot = JSON.parse(writtenText(instance, '/ws/review-bundle/index.json'))
  assert.equal(snapshot.sheets.length, 4)
  assert.equal(snapshot.findings.total, envelope.data.findings)
  assert.ok(snapshot.coverage.unsupported >= 0)
  fail(await instance.call('ecad_document', { paths: ALL_PATHS, output: 'review-bundle' }), 'ECAD_OUTPUT_EXISTS', 'document over an existing folder')
})

test('document defaults under .ecad and needs writes for a folder elsewhere', async () => {
  const off = harness(fixtureSet())
  const internal = succeed(await off.call('ecad_document', { paths: ALL_PATHS }), 'document default output')
  ok(internal.data.outputRoot.startsWith('.ecad/documentation/'), internal.data.outputRoot)
  fail(await off.call('ecad_document', { paths: ALL_PATHS, output: 'outside-bundle' }), 'ECAD_WRITES_DISABLED', 'document outside .ecad with writes off')
})

test('backup copies the sources byte for byte and verifies every copy', async () => {
  const instance = harness(fixtureSet(new Map([['/ws/Prints/legacy.dwg', new Uint8Array([9, 8, 7])]])), { writes: true })
  const envelope = succeed(await instance.call('ecad_backup', { paths: ALL_PATHS }), 'backup')
  assert.equal(envelope.data.files, 4)
  assert.equal(envelope.data.verified, true)
  ok(envelope.data.outputRoot.startsWith('backups/ecad/'))
  const manifest = JSON.parse(writtenText(instance, `/ws/${envelope.data.manifestPath}`))
  assert.equal(manifest.schema, 1)
  assert.equal(manifest.files.length, 4)
  ok(manifest.files.every(file => /^[0-9a-f]{64}$/u.test(file.sha256) && file.verified === true))
  for (const file of manifest.files) {
    const source = instance.files.get(`/ws/${file.path}`)
    const copy = instance.files.get(`/ws/${file.copyPath}`)
    assert.deepEqual(new Uint8Array(copy), new Uint8Array(source), `${file.path} is byte-identical`)
  }
  const dwg = succeed(await instance.call('ecad_backup', { paths: ['Prints/legacy.dwg'], output: 'dwg-backup' }), 'backup dwg bytes')
  assert.deepEqual(dwg.data.formats, ['dwg'], 'a raw byte backup keeps the DWG format label')
  assert.deepEqual(new Uint8Array(instance.files.get('/ws/dwg-backup/Prints/legacy.dwg')), new Uint8Array([9, 8, 7]))
})

test('backup needs the writes switch and never reuses an existing folder', async () => {
  const off = harness(fixtureSet())
  fail(await off.call('ecad_backup', { paths: ALL_PATHS }), 'ECAD_WRITES_DISABLED', 'backup with writes off')
  const on = harness(fixtureSet(), { writes: true })
  succeed(await on.call('ecad_backup', { paths: ALL_PATHS, output: 'backup-one' }), 'backup custom output')
  fail(await on.call('ecad_backup', { paths: ALL_PATHS, output: 'backup-one' }), 'ECAD_OUTPUT_EXISTS', 'backup over an existing folder')
})

test('every tool failure is an envelope, never a throw', async () => {
  const instance = harness(fixtureSet())
  const bad = [
    ['ecad_open', {}],
    ['ecad_overview', { path: 'Prints/missing.dxf' }],
    ['ecad_find', {}],
    ['ecad_cross_reference', { paths: [] }],
    ['ecad_checks', { path: 'Prints/missing.dxf' }],
    ['ecad_render', {}],
    ['ecad_compare', { a: 'Prints/tiny.dxf' }],
    ['ecad_draft_ops', { path: 'Prints/titleblock.dxf', ops: [] }],
    ['ecad_draft_apply', {}],
    ['ecad_draft_discard', {}],
    ['ecad_verify', {}],
    ['ecad_document', { paths: [] }],
    ['ecad_backup', { paths: [] }],
    ['ecad_profile', { action: 'infer', paths: [] }]
  ]
  for (const [tool, args] of bad) {
    const envelope = await instance.call(tool, args)
    ok(envelope !== null && typeof envelope === 'object')
    ok(envelope.error !== undefined, `${tool} returned an error envelope for ${JSON.stringify(args)}`)
    ok(typeof envelope.error.code === 'string' && envelope.error.code.length > 0)
    ok(typeof envelope.error.fix === 'string' && envelope.error.fix.length > 0)
  }
})

test('the provider receives FsTargets, write intents and the sandbox policy', async () => {
  const instance = harness(fixtureSet(), { writes: true, policy: true })
  succeed(await instance.call('ecad_open', { path: 'Prints/tiny.dxf' }), 'open')
  ok(instance.resolveCalls.length > 0)
  for (const call of instance.resolveCalls) {
    assert.equal(typeof call.target, 'object', 'resolve returns an FsTarget, like the host')
    assert.equal(typeof call.target.displayPath, 'string')
    ok(call.target.targetKey !== undefined)
  }
  ok(instance.policyResolveCalls.length > 0, 'the sandbox policy service was consulted')
  ok(instance.writeCalls.length > 0, 'writes happened')
  for (const call of instance.writeCalls) {
    assert.notEqual(call.policy, undefined, `write ${call.path} is stamped with the sandbox policy`)
  }
})
