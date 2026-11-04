/**
 * The preview-artifact reader: the workspace read the pane does before it can
 * draw a sheet, and the parse that turns those bytes into a model.
 *
 * The transport is judged with a fake byte source, so every failure the pane
 * shows — a changed file, an oversized artifact, a truncated read, an unreadable
 * payload — is measured here instead of discovered in a preview tab.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EcadArtifactError,
  conversionOf,
  sourceFormatOf,
  PREVIEW_LIMIT,
  parsePreviewArtifact,
  readPreviewArtifact,
  readWorkspaceText,
} from '../../src/client/artifacts.ts'

/** A model just complete enough for the artifact parser. */
const MODEL = {
  schema: 1,
  path: 'Prints/DXF/A-101.dxf',
  version: 'v1',
  dxfVersion: 'AC1032',
  units: 4,
  layouts: [{ id: 'Model', name: 'Model', kind: 'model', extents: { min: [0, 0], max: [1, 1] }, entities: [] }],
  layers: [{ name: '0', color: 7, visible: true }],
  blocks: [],
  stats: { entities: 0, byKind: {}, unsupported: {}, approximate: 0, truncated: false },
}

/** The artifact the host writes to `.ecad/previews/<hash>.json`. */
const ARTIFACT = {
  schema: 1,
  contractVersion: 1,
  path: 'Prints/DXF/A-101.dxf',
  version: 'v1',
  generatedAt: '2026-11-04T00:00:00.000Z',
  model: MODEL,
}

/**
 * A byte source that serves fixed pages and records the requested ranges.
 * @param pages - the pages to serve, in order.
 * @returns the reader and the recorded offsets.
 */
function sourceOf(pages) {
  const offsets = []
  const read = async (sessionId, path, options) => {
    offsets.push(options.range.offset)
    assert.equal(sessionId, 's-1')
    assert.equal(path, '.ecad/previews/abc.json')
    const page = pages.shift()
    if (page === undefined) throw new Error('the reader asked for a page past the end')
    if (page.failure !== undefined) return { ok: false, error: { message: page.failure } }
    return {
      ok: true,
      value: {
        data: new TextEncoder().encode(page.text ?? ''),
        eof: page.eof ?? false,
        ...(page.version === undefined ? {} : { version: page.version }),
        ...(page.bytes === undefined ? {} : { bytes: page.bytes }),
      },
    }
  }
  return { read, offsets }
}

const PATH = '.ecad/previews/abc.json'

test('the artifact parses into the model plus its provenance', () => {
  const artifact = parsePreviewArtifact(JSON.stringify(ARTIFACT))
  assert.equal(artifact.model.path, 'Prints/DXF/A-101.dxf')
  assert.equal(artifact.version, 'v1')
  assert.equal(artifact.generatedAt, '2026-11-04T00:00:00.000Z')
})

test('a payload that is not a reliable sheet model is refused with a code the panel shows', () => {
  for (const [text, label] of [
    ['not json', 'malformed JSON'],
    [JSON.stringify({ ...ARTIFACT, schema: 2 }), 'a newer schema'],
    [JSON.stringify({ ...ARTIFACT, model: undefined }), 'a missing model'],
    [JSON.stringify({ ...ARTIFACT, model: { ...MODEL, layouts: [] } }), 'a model with no layouts'],
    [JSON.stringify({ ...ARTIFACT, model: { ...MODEL, stats: undefined } }), 'a model with no stats'],
  ]) {
    assert.throws(() => parsePreviewArtifact(text), (error) => error instanceof EcadArtifactError && error.code === 'ECAD_PREVIEW_INVALID', label)
  }
})

test('a chunked read reassembles the text and follows the page offsets', async () => {
  const { read, offsets } = sourceOf([
    { text: '{"schema":1,', version: 'v1', eof: false },
    { text: '"model":', version: 'v1', eof: false },
    { text: 'null}', version: 'v1', eof: true },
  ])
  const result = await readWorkspaceText(read, 's-1', PATH, new AbortController().signal, 13)
  assert.equal(result.text, '{"schema":1,"model":null}')
  assert.equal(result.version, 'v1')
  assert.deepEqual(offsets, [0, 12, 20])
})

test('a file that changes during the read is refused rather than mixed', async () => {
  const { read } = sourceOf([
    { text: 'a', version: 'v1', eof: false },
    { text: 'b', version: 'v2', eof: true },
  ])
  await assert.rejects(() => readWorkspaceText(read, 's-1', PATH, new AbortController().signal), (error) => error.code === 'ECAD_PREVIEW_CHANGED')
})

test('an oversized artifact is refused before the pane allocates it', async () => {
  const { read } = sourceOf([{ text: '{}', version: 'v1', bytes: PREVIEW_LIMIT + 1, eof: false }])
  await assert.rejects(() => readWorkspaceText(read, 's-1', PATH, new AbortController().signal), (error) => error.code === 'ECAD_PREVIEW_TOO_LARGE')
})

test('an empty page before the end is a failed read, not an infinite loop', async () => {
  const { read } = sourceOf([{ text: '', version: 'v1', eof: false }])
  await assert.rejects(() => readWorkspaceText(read, 's-1', PATH, new AbortController().signal), (error) => error.code === 'ECAD_PREVIEW_READ')
})

test('a workspace read failure surfaces as the reader error the pane prints', async () => {
  const { read } = sourceOf([{ failure: 'ECAD_NOT_A_FILE: "x" is not a readable file' }])
  await assert.rejects(() => readWorkspaceText(read, 's-1', PATH, new AbortController().signal), (error) => error.code === 'ECAD_PREVIEW_READ' && error.message.includes('not a readable file'))
})

test('an aborted read stops before another page is requested', async () => {
  const controller = new AbortController()
  const { read, offsets } = sourceOf([{ text: 'a', version: 'v1', eof: false }])
  controller.abort()
  await assert.rejects(() => readWorkspaceText(read, 's-1', PATH, controller.signal), (error) => error.name === 'AbortError')
  assert.deepEqual(offsets, [])
})

test('the artifact read end to end returns the model the pane draws', async () => {
  const { read } = sourceOf([{ text: JSON.stringify(ARTIFACT), version: 'v1', eof: true }])
  const artifact = await readPreviewArtifact(read, 's-1', PATH, new AbortController().signal)
  assert.equal(artifact.model.stats.entities, 0)
  assert.equal(artifact.model.layers[0].name, '0')
})

test('an older service payload without a format is a DXF sheet', () => {
  assert.equal(sourceFormatOf(undefined), 'dxf')
  assert.equal(sourceFormatOf({}), 'dxf')
  assert.equal(sourceFormatOf({ format: 'DXF' }), 'dxf')
  assert.equal(sourceFormatOf({ format: 'DWG' }), 'dwg')
})

test('a DWG source reports the conversion the service names', () => {
  assert.deepEqual(conversionOf(undefined), { warnings: 0, warningTexts: [] })
  assert.deepEqual(conversionOf({ converter: 'acadrust', version: '0.6.8', warnings: [] }), {
    converter: 'acadrust',
    version: '0.6.8',
    warnings: 0,
    warningTexts: [],
  })
  // A warning list is what the converter reports when it can name them.
  assert.deepEqual(conversionOf({ converter: 'acadrust', warnings: ['proxy entity dropped', 'text height clamped'] }), {
    converter: 'acadrust',
    warnings: 2,
    warningTexts: ['proxy entity dropped', 'text height clamped'],
  })
  // A bare count is enough for the badge; unknown fields are ignored.
  assert.deepEqual(conversionOf({ warnings: 3, unrelated: true, converter: 'acadrust' }), {
    converter: 'acadrust',
    warnings: 3,
    warningTexts: [],
  })
  assert.equal(conversionOf({}).warnings, 0)
})
