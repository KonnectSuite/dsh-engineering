/**
 * The sheet workflow's pure export helper: the current view as a standalone SVG.
 *
 * The pane draws with theme tokens; an exported drawing must not carry a
 * `var(--…)` colour into a file opened outside the app, so this renders the
 * scene's own geometry on a white ground with the drawing's own colours. The
 * tests judge the document shape and the escaping without a browser; the body's
 * PNG path rasterises this same document.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { svgDocumentOf } from '../../src/client/svgExport.ts'
import { fitBox, sceneOf } from '../../src/client/scene.ts'

/** One entity with the fields this repository's model emits, defaulted. */
const entity = overrides => ({ id: 'e', k: 'line', layer: '0', color: 7, pts: [[0, 0], [10, 0]], ...overrides })

/** A sheet with a line, a circle, a filled hatch and text that needs escaping. */
const MODEL = {
  schema: 1,
  path: 'Prints/A-101.dxf',
  version: 'v1',
  dxfVersion: 'AC1032',
  units: 4,
  layouts: [{
    id: 'Model',
    name: 'Model',
    kind: 'model',
    extents: { min: [0, 0], max: [100, 60] },
    entities: [
      entity({ id: 'line', pts: [[0, 0], [100, 0]] }),
      entity({ id: 'circle', k: 'circle', c: [50, 30], r: 10 }),
      entity({ id: 'hatch', k: 'hatch', pts: [[10, 10], [30, 10], [30, 20], [10, 20]], approx: true, src: 'HATCH' }),
      entity({ id: 'text', k: 'text', p: [5, 50], t: 'A&B <C>', h: 4 }),
    ],
  }],
  layers: [{ name: '0', color: 7, visible: true }],
  blocks: [],
  stats: { entities: 4, byKind: {}, unsupported: {}, approximate: 1, truncated: false },
}

const LAYERS = new Map([['0', MODEL.layers[0]]])
const SCENE = sceneOf(MODEL.layouts[0], LAYERS, new Set())
const FIT = fitBox(SCENE.bounds, 800, 600, 24)
const VIEW = { zoom: 1, panX: 0, panY: 0 }
const OPTIONS = { title: 'A-101 · Model & revision', width: 800, height: 600 }

test('the exported SVG is one standalone document on a white ground', () => {
  const svg = svgDocumentOf(SCENE, FIT, VIEW, OPTIONS)
  assert.ok(svg.startsWith('<?xml version="1.0" encoding="UTF-8"?>'))
  assert.match(svg, /<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="800" height="600" viewBox="0 0 800 600"/u)
  assert.match(svg, /<rect width="800" height="600" fill="#ffffff"\/>/u)
  // The fit and the view are the two transform groups the pane draws through.
  assert.match(svg, /<g transform="translate\(0 0\) scale\(1\)">/u)
  assert.match(svg, /<g transform="translate\([-\d. ]+ [-\d. ]+\) scale\([\d. ]+ -[\d. ]+\)">/u)
  assert.match(svg, /<title>A-101 · Model &amp; revision<\/title>/u)
})

test('the exported SVG carries every primitive with the drawing ink, never a theme var', () => {
  const svg = svgDocumentOf(SCENE, FIT, VIEW, OPTIONS)
  assert.match(svg, /<line /u)
  assert.match(svg, /<circle /u)
  assert.match(svg, /<path /u)
  assert.match(svg, /<text /u)
  assert.equal(svg.includes('var(--'), false, 'an exported drawing must not depend on the theme tokens')
  // Text content is escaped, so the file stays well-formed XML.
  assert.match(svg, /A&amp;B &lt;C&gt;/u)
})

test('the exported SVG encodes the current view, so a zoomed sheet exports zoomed', () => {
  const zoomed = svgDocumentOf(SCENE, FIT, { zoom: 2, panX: -40, panY: 30 }, OPTIONS)
  assert.match(zoomed, /<g transform="translate\(-40 30\) scale\(2\)">/u)
})
