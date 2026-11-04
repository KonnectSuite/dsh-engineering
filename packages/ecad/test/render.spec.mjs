import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderLayoutSvg, renderStackSvg } from '../src/engine/index.ts'
import { entity, layer, layout, sheetModel, ok } from './helpers.mjs'

/** A model that exercises every renderable kind. */
function renderModel(path = 'RENDER-1.dxf') {
  return sheetModel({
    path,
    layers: [layer('0'), layer('HIDDEN', 3, false), layer('FROZEN', 4, false), layer('TAGS', 2)],
    layouts: [
      layout('Model', [
        entity('1', 'line', { pts: [[0, 0], [10, 0]], color: 1 }),
        entity('2', 'polyline', { pts: [[0, 1], [2, 1], [2, 3]], closed: true, color: 2 }),
        entity('3', 'polyline', { pts: [[3, 1], [4, 2]], closed: false, color: 3 }),
        entity('4', 'arc', { c: [6, 2], r: 1.5, a0: 0, a1: 1.5, color: 4 }),
        entity('5', 'circle', { c: [9, 2], r: 1, color: 5 }),
        entity('6', 'ellipse', { c: [12, 2], rx: 2, ry: 1, rot: 0.3, closed: true, color: 6 }),
        entity('7', 'ellipse', { c: [16, 2], rx: 2, ry: 1, rot: 0, a0: 0, a1: 2, color: 7 }),
        entity('8', 'spline', { pts: [[18, 1], [19, 2], [20, 1]], color: 1, approx: true, src: 'SPLINE' }),
        entity('9', 'point', { p: [22, 2], color: 7 }),
        entity('10', 'solid', { pts: [[0, 5], [2, 5], [2, 6]], closed: true, color: 1, approx: true, src: 'SOLID' }),
        entity('11', 'hatch', { pts: [[4, 5], [6, 5], [6, 6]], closed: true, color: 2, approx: true, src: 'HATCH' }),
        entity('12', 'text', { t: 'A & B <tag> "q"', p: [0, 8], h: 0.5, rot: Math.PI / 2, ha: 1, va: 3, color: 7 }),
        entity('13', 'mtext', { t: 'line one\nline two', p: [8, 8], h: 0.4, w: 4, rot: 0, ha: 0, va: 1, color: 7 }),
        entity('14', 'dimension', { pts: [[10, 5], [12, 5], [11, 4]], p: [11, 4.5], t: '10', h: 0.2, color: 3, approx: true, src: 'DIMENSION' }),
        entity('15', 'leader', { pts: [[14, 5], [15, 6], [17, 6]], color: 4, approx: true, src: 'LEADER' }),
        entity('16', 'viewport', { p: [20, 8], w: 6, h: 4, color: 7, approx: true, src: 'VIEWPORT' }),
        entity('17', 'insert', { p: [0, 0], block: 'MOTOR', color: 7 }),
        entity('18', 'unsupported', { src: 'RAY', color: 7 }),
        entity('19', 'line', { pts: [[0, 9], [1, 9]], layer: 'HIDDEN', color: 3 }),
        entity('20', 'line', { pts: [[0, 10], [1, 10]], layer: 'FROZEN', color: 4 }),
        entity('21', 'text', { t: 'tag', p: [3, 9], h: 0.2, layer: 'TAGS', color: 2 })
      ]),
      layout('Layout1', [entity('p1', 'line', { pts: [[0, 0], [5, 5]], color: 7 })], 'paper')
    ]
  })
}

test('a layout renders to a self-contained SVG string', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model', { width: 800, height: 600 })
  ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"'))
  ok(svg.endsWith('</svg>'))
  ok(svg.includes('viewBox="0 0 800 600"'))
  ok(svg.includes('<rect x="0" y="0" width="800" height="600" fill="#ffffff"/>'))
  // Y is flipped: the drawing group has a negative Y scale.
  assert.match(svg, /scale\([0-9.]+ -[0-9.]+\)/)
})

test('every supported kind is drawn', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model')
  for (const needle of ['<line ', '<polygon ', '<polyline ', '<path ', '<circle ', '<ellipse ', '<rect ', '<text ', 'data-ecad-kind="hatch"', 'data-ecad-kind="solid"', 'data-ecad-kind="dimension"', 'data-ecad-kind="leader"', 'data-ecad-kind="viewport"', 'data-ecad-kind="mtext"']) {
    ok(svg.includes(needle), `expected ${needle}`)
  }
  // Insert markers and unsupported entities are not drawn; their flattened
  // children would be, but this synthetic model has none.
  assert.equal(svg.includes('data-ecad-id="17"'), false)
  assert.equal(svg.includes('data-ecad-id="18"'), false)
})

test('text is XML-escaped, rotated and anchored', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model')
  ok(svg.includes('A &amp; B &lt;tag&gt; &quot;q&quot;'))
  ok(svg.includes('text-anchor="middle"'))
  ok(svg.includes('rotate(-90)'), 'a 90° CAD rotation becomes rotate(-90) in the flipped group')
  ok(svg.includes('data-estimated-width='))
  const multiline = (svg.match(/data-ecad-id="13"/g) ?? []).length
  assert.equal(multiline, 2, 'MTEXT paragraphs render as two text elements')
})

test('ACI colours resolve and index 7 draws black on white', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model')
  ok(svg.includes('stroke="#FF0000"'))
  ok(svg.includes('stroke="#0000FF"'))
  ok(svg.includes('stroke="#000000"'), 'ACI 7 flips to black on a light background')
  const dark = renderLayoutSvg({ ...renderModel(), layers: [] }, 'Model', { background: '#101010' })
  ok(dark.includes('stroke="#FFFFFF"'))
})

test('hidden layers are filtered by option and by the layer visibility flag', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model', { hiddenLayers: ['TAGS'] })
  assert.equal(svg.includes('data-layer="TAGS"'), false)
  // Off/frozen layers are skipped unless explicitly asked for.
  assert.equal(svg.includes('data-layer="HIDDEN"'), false)
  assert.equal(svg.includes('data-layer="FROZEN"'), false)
  const withHidden = renderLayoutSvg(renderModel(), 'Model', { showHiddenLayers: true })
  ok(withHidden.includes('data-layer="HIDDEN"'))
  ok(withHidden.includes('data-layer="FROZEN"'))
})

test('fills are used for hatch and solid, and plain closed polylines stay outlines', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model')
  ok(/<polygon[^>]*data-ecad-id="11"[^>]*fill="#FFFF00"|<polygon[^>]*fill="#FFFF00"[^>]*data-ecad-id="11"/.test(svg), 'the hatch is a filled polygon')
  ok(/<polygon[^>]*data-ecad-id="10"[^>]*fill="#FF0000"|<polygon[^>]*fill="#FF0000"[^>]*data-ecad-id="10"/.test(svg), 'the solid is a filled polygon')
  ok(/<polygon points="0,1 2,1 2,3"[^>]*fill="none"/.test(svg), 'a closed polyline stays an outline')
})

test('the paper layout renders its own geometry', () => {
  const svg = renderLayoutSvg(renderModel(), 'Layout1')
  ok(svg.includes('data-ecad-id="p1"'))
  assert.equal(svg.includes('data-ecad-id="1"'), false)
})

test('a missing layout is a typed error', () => {
  assert.throws(() => renderLayoutSvg(renderModel(), 'NoSuchLayout'), error => error.code === 'MISSING_TARGET' && error.fix.includes('Model'))
})

test('the entity cap limits how many primitives are written', () => {
  const svg = renderLayoutSvg(renderModel(), 'Model', { maxEntities: 2 })
  assert.equal((svg.match(/data-ecad-id=/g) ?? []).length, 2)
})

test('renderStackSvg stacks titled sheets on one page', () => {
  const svg = renderStackSvg(
    [
      { title: 'Sheet A', model: renderModel('A.dxf') },
      { title: 'Sheet B', model: renderModel('B.dxf'), layoutId: 'Layout1' }
    ],
    { width: 600, itemHeight: 400, titleHeight: 24, gap: 8, margin: 10 }
  )
  ok(svg.startsWith('<svg'))
  ok(svg.includes('Sheet A'))
  ok(svg.includes('Sheet B'))
  ok(svg.includes('viewBox="0 0 600 '), 'the page grows with the stack')
  ok(svg.includes('data-ecad-id="p1"'))
  ok(svg.length > 1000)
})

test('renderStackSvg refuses an empty stack', () => {
  assert.throws(() => renderStackSvg([]), error => error.code === 'INVALID_INPUT')
})
