/**
 * The render checks measure what the runtime drew, not what the model recorded.
 *
 * `optix_design_check` reads the model through the Studio bridge and can name a node. It cannot see a
 * clock drawing `--:--`, a card painted 496x247 holding its content in a 97 px band, or a control the
 * model sizes at 300 px that the runtime draws at 158 px. Those are only visible on the served page,
 * so this module measures the page the preview leg already opens.
 *
 * The page reports no project path and no bridge guid (a DOM element id is not the model's guid,
 * measured 2026-11-17: `getElementById` fails for every bridge guid), so a finding is located by its
 * rendered type chain. These tests run `measureDom` against a fake DOM to pin that contract, including
 * what it refuses to claim when the page reported too little to decide.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, it } from 'node:test'
import { deflateSync } from 'node:zlib'

import {
  COVERAGE_MINIMUM,
  EMPTY_BAND_MINIMUM,
  INVISIBLE_MAX_DISTANCE,
  MIN_TEXT_LEAVES,
  UNCHECKED_REPORTED,
  bandInsideSurface,
  decodePng,
  flattenTree,
  measureDom,
  paintedColour,
  renderFindings,
  sampleBackground,
  sampleInterior,
  strongestPixel,
  surfacePaint,
  windowBox,
} from '../packages/optix/lib/render.js'
import { CONTRAST_MINIMUM } from '../packages/optix/lib/design.js'
import { apply as registerOptix } from '../packages/optix/lib/index.js'

const plugin = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')

/** One element in the shape `measureDom` walks: dataset.type, a box, computed style, leaf text. */
function el({ type, tag = 'div', box, style = {}, text, children = [] }) {
  return {
    tagName: tag,
    dataset: type === undefined ? {} : { type },
    children,
    textContent: text ?? '',
    getBoundingClientRect: () => box,
    __style: {
      color: style.color,
      backgroundColor: style.background,
      fontSize: style.fontSize,
    },
  }
}

/** A page: a body whose children are walked, plus the window element and the canvas an engine may paint. */
function page({ children, canvas, window }) {
  return {
    document: {
      body: el({ tag: 'body', box: { x: 0, y: 0, width: 1280, height: 800 }, children }),
      querySelector: (selector) => (selector === 'canvas' ? canvas ?? null : selector === '[data-type="window"]' ? window ?? null : null),
    },
    getComputedStyle: (element) => element.__style,
    innerWidth: 1280,
    innerHeight: 800,
  }
}

const env = (surface) => ({
  document: surface.document,
  getComputedStyle: surface.getComputedStyle,
  innerWidth: surface.innerWidth,
  innerHeight: surface.innerHeight,
})

/** The served window: the runtime's canvas element, 1280x800 at the origin. */
const canvas = () => el({ tag: 'canvas', box: { x: 0, y: 0, width: 1280, height: 800 } })

/** The runtime's own window element, which is what the served page actually carries. */
const windowElement = (box = { x: 0, y: 0, width: 1280, height: 800 }, children = []) => el({ type: 'window', box, children })

const rules = (report) => renderFindings(report).findings.map((finding) => finding.rule)

const CRC_TABLE = Array.from({ length: 256 }, (_unused, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/**
 * An 8-bit non-interlaced truecolour PNG, which is the shape `decodePng` reads. The capture leg
 * hands the rules exactly this, so a test can hand it a page it drew itself and know every pixel.
 */
function buildPng({ width, height, paint, interlace = 0 }) {
  const stride = 1 + width * 3
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y += 1) {
    const row = y * stride
    raw[row] = 0
    for (let x = 0; x < width; x += 1) {
      const [red, green, blue] = paint(x, y)
      raw[row + 1 + x * 3] = red
      raw[row + 2 + x * 3] = green
      raw[row + 3 + x * 3] = blue
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  ihdr[12] = interlace
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

const cyan = [15, 175, 255]
// The rail's measured shape: white glyphs on the cyan the selected tab is painted with.
const glyphs = (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 20 ? [255, 255, 255] : cyan)
const glyphBox = { x: 10, y: 10, width: 20, height: 10 }
const pixelRules = (report, png) => renderFindings(report, { png }).findings.map((finding) => finding.rule)

describe('the page walk measures what the browser drew', () => {
  it('counts elements, names the text leaves, and reports the canvas box', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({
          type: 'rectangle',
          box: { x: 220, y: 150, width: 496, height: 247 },
          style: { background: 'rgb(19, 35, 47)' },
          children: [
            el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, text: 'Total units' }),
            el({ type: 'label', tag: 'span', box: { x: 420, y: 174, width: 72, height: 20 }, text: '352' }),
          ],
        }),
      ],
    })
    const report = measureDom({}, env(surface))
    assert.equal(report.counted, 3)
    assert.equal(report.text, 2)
    assert.equal(report.skipped, 0)
    assert.equal(report.truncated, false)
    assert.deepEqual(report.canvas_box, { x: 0, y: 0, width: 1280, height: 800 })
    assert.deepEqual(report.viewport, { width: 1280, height: 800 })
  })

  it('an element the browser gave no box to is skipped, not measured as a zero', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'rectangle', box: { x: 0, y: 0, width: 0, height: 0 }, text: 'hidden' }),
        el({ type: 'label', tag: 'span', box: { x: 10, y: 10, width: 60, height: 18 }, text: 'OEE' }),
      ],
    })
    const report = measureDom({}, env(surface))
    // A skipped element is not measured at all: it is counted nowhere, so no rule can read a zero from it.
    assert.equal(report.counted, 1)
    assert.equal(report.skipped, 1)
    assert.deepEqual(rules(report).filter((rule) => rule === 'VIEW-TYPE-02'), [])
  })

  it('descends through a container the browser gave no height to, because the whole app hangs under it', () => {
    // The served page measured 2026-11-17: body > div (no data-type, 1264x0) > div[data-type=window] 1280x800.
    // A walk that stops at a zero box reports an empty page for a screen that rendered.
    const served = windowElement({ x: 0, y: 0, width: 1280, height: 800 }, [
      el({ type: 'label', tag: 'span', box: { x: 16, y: 12, width: 90, height: 20 }, text: '--:--' }),
    ])
    const surface = page({
      canvas: undefined,
      window: served,
      children: [
        el({
          box: { x: 0, y: 0, width: 1264, height: 0 },
          children: [served],
        }),
      ],
    })
    const report = measureDom({}, env(surface))
    assert.equal(report.counted, 2)
    assert.equal(report.skipped, 1)
    assert.deepEqual(report.nodes[0].type, 'window')
    assert.deepEqual(report.window_element, { x: 0, y: 0, width: 1280, height: 800 })
    assert.equal(report.canvas_box, undefined)
    // The placeholder is found through the collapsed container, so the check is not silently clean.
    assert.deepEqual(rules(report), ['VIEW-RENDER-01'])
  })

  it('reads the served window from the window element when the page paints no canvas', () => {
    const surface = page({
      children: [windowElement({ x: 0, y: 0, width: 1280, height: 800 }, [
        el({ type: 'rectangle', box: { x: 1200, y: 100, width: 130, height: 60 }, style: { background: 'rgb(19, 35, 47)' } }),
      ])],
    })
    const report = measureDom({}, env(surface))
    assert.deepEqual(windowBox(report), { x: 0, y: 0, width: 1280, height: 800 })
    assert.deepEqual(rules(report), ['VIEW-RENDER-03'])
  })

  it('a page bigger than the cap says it was truncated instead of pretending to be complete', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'rectangle', box: { x: 0, y: 0, width: 400, height: 400 }, children: [
          el({ type: 'label', tag: 'span', box: { x: 10, y: 10, width: 60, height: 18 }, text: 'A' }),
          el({ type: 'label', tag: 'span', box: { x: 10, y: 40, width: 60, height: 18 }, text: 'B' }),
        ] }),
      ],
    })
    const report = measureDom({ max_nodes: 2 }, env(surface))
    assert.equal(report.truncated, true)
    assert.equal(report.counted, 2)
    const judged = renderFindings(report)
    assert.ok(judged.unchecked.some((line) => line.includes('max_nodes')), judged.unchecked.join(' | '))
  })

  it('a page that reported nothing is an unchecked answer, never a clean pass', () => {
    const surface = page({ canvas: null, children: [] })
    const judged = renderFindings(measureDom({}, env(surface)))
    assert.deepEqual(judged.findings, [])
    assert.equal(judged.measured.elements, 0)
    assert.ok(judged.unchecked.some((line) => line.includes('no element with a box')), judged.unchecked.join(' | '))
  })
})

describe('VIEW-RENDER-01: a placeholder is not a value', () => {
  it('names the text the runtime drew in place of a value', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'label', tag: 'span', box: { x: 1100, y: 20, width: 60, height: 24 }, text: '--:--' }),
        el({ type: 'label', tag: 'span', box: { x: 1100, y: 60, width: 120, height: 24 }, text: '{TotalUnits}' }),
        el({ type: 'label', tag: 'span', box: { x: 1100, y: 100, width: 120, height: 24 }, text: 'undefined' }),
      ],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    const fired = judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-01')
    assert.deepEqual(fired.map((finding) => finding.evidence.text), ['--:--', '{TotalUnits}', 'undefined'])
    assert.ok(fired[0].message.includes('placeholder'), fired[0].message)
    // Located by the chain the browser reports, because the page carries no project path.
    assert.equal(fired[0].evidence.located_at, 'label')
  })

  it('leaves a real value alone', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'label', tag: 'span', box: { x: 100, y: 20, width: 60, height: 24 }, text: '352' }),
        el({ type: 'label', tag: 'span', box: { x: 170, y: 20, width: 60, height: 24 }, text: '0.675' }),
        el({ type: 'label', tag: 'span', box: { x: 240, y: 20, width: 60, height: 24 }, text: 'Running' }),
        el({ type: 'label', tag: 'span', box: { x: 310, y: 20, width: 60, height: 24 }, text: '100%' }),
      ],
    })
    assert.deepEqual(rules(measureDom({}, env(surface))), [])
  })
})

describe('VIEW-RENDER-02: a painted surface holding its content in a band', () => {
  /** The demo card as it rendered on 2026-11-17: 496x247, three rows in its top 80 px. */
  const sparseCard = (height) => page({
    canvas: canvas(),
    children: [
      el({
        type: 'rectangle',
        box: { x: 220, y: 150, width: 496, height },
        style: { background: 'rgb(19, 35, 47)' },
        children: [
          el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, text: 'Station 1' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 174, width: 72, height: 20 }, text: 'State' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 204, width: 120, height: 20 }, text: 'Units' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 204, width: 72, height: 20 }, text: '1 204' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 234, width: 120, height: 20 }, text: 'Fault' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 234, width: 72, height: 20 }, text: 'none' }),
        ],
      }),
    ],
  })

  it('fires where the model is quiet: the card is filled, the render is not', () => {
    const judged = renderFindings(measureDom({}, env(sparseCard(247))))
    const fired = judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-02')
    assert.equal(fired.length, 1)
    const evidence = fired[0].evidence
    assert.equal(evidence.text_elements, 6)
    assert.equal(evidence.empty_px, 167)
    assert.ok(evidence.coverage < COVERAGE_MINIMUM, `coverage ${evidence.coverage}`)
    assert.equal(evidence.measured_from, 'the painted text boxes inside the rendered surface')
    assert.ok(fired[0].message.includes('empty'), fired[0].message)
  })

  it('counts text that is a sibling of the painted card, which is how the runtime writes it', () => {
    // The served page holds a card rectangle and its labels as siblings under a layout, so a rule that only
    // reads a surface's own children finds no text on the card and reports nothing.
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'columnlayout', box: { x: 220, y: 150, width: 496, height: 247 }, children: [
          el({ type: 'rectangle', box: { x: 220, y: 150, width: 496, height: 247 }, style: { background: 'rgb(19, 35, 47)' } }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, text: 'Station 1' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 174, width: 72, height: 20 }, text: 'State' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 204, width: 120, height: 20 }, text: 'Units' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 204, width: 72, height: 20 }, text: '1 204' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 234, width: 120, height: 20 }, text: 'Fault' }),
          el({ type: 'label', tag: 'span', box: { x: 420, y: 234, width: 72, height: 20 }, text: 'none' }),
        ] }),
      ],
    })
    const fired = renderFindings(measureDom({}, env(surface))).findings.filter((finding) => finding.rule === 'VIEW-RENDER-02')
    assert.equal(fired.length, 1)
    assert.equal(fired[0].evidence.text_elements, 6)
    assert.equal(fired[0].evidence.empty_px, 167)
  })

  it('is quiet once the content fills the surface', () => {
    const filled = page({
      canvas: canvas(),
      children: [
        el({
          type: 'rectangle',
          box: { x: 220, y: 150, width: 496, height: 247 },
          style: { background: 'rgb(19, 35, 47)' },
          children: [
            el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 448, height: 20 }, text: 'Station 1' }),
            el({ type: 'label', tag: 'span', box: { x: 244, y: 250, width: 448, height: 20 }, text: 'Units 1 204' }),
            el({ type: 'label', tag: 'span', box: { x: 244, y: 330, width: 448, height: 20 }, text: 'Fault none' }),
          ],
        }),
      ],
    })
    assert.deepEqual(rules(measureDom({}, env(filled))), [])
  })

  it('leaves a sparse tile alone: a label and a value is a KPI tile, not a card', () => {
    const tile = page({
      canvas: canvas(),
      children: [
        el({
          type: 'rectangle',
          box: { x: 220, y: 150, width: 496, height: 247 },
          style: { background: 'rgb(19, 35, 47)' },
          children: [
            el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, text: 'OEE' }),
            el({ type: 'label', tag: 'span', box: { x: 420, y: 174, width: 72, height: 20 }, text: '0.675' }),
          ],
        }),
      ],
    })
    assert.ok(MIN_TEXT_LEAVES === 3)
    assert.deepEqual(rules(measureDom({}, env(tile))), [])
  })

  it('does not fire on a surface with nothing painted on it', () => {
    const unpainted = page({
      canvas: canvas(),
      children: [
        el({
          type: 'rectangle',
          box: { x: 220, y: 150, width: 496, height: 247 },
          style: { background: 'rgba(0, 0, 0, 0)' },
          children: [
            el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, text: 'A' }),
            el({ type: 'label', tag: 'span', box: { x: 244, y: 204, width: 120, height: 20 }, text: 'B' }),
            el({ type: 'label', tag: 'span', box: { x: 244, y: 234, width: 120, height: 20 }, text: 'C' }),
          ],
        }),
      ],
    })
    assert.deepEqual(rules(measureDom({}, env(unpainted))), [])
  })

  it('the empty band has to be worth naming', () => {
    // Same content, a surface only 120 px tall: 40 px left over is not a defect.
    const short = sparseCard(120)
    const judged = renderFindings(measureDom({}, env(short)))
    assert.ok(judged.findings.every((finding) => finding.rule !== 'VIEW-RENDER-02'), JSON.stringify(judged.findings))
    assert.ok(EMPTY_BAND_MINIMUM === 60)
  })
})

describe('VIEW-RENDER-03: drawn outside the box the runtime serves', () => {
  it('names the pixels hanging past the served window', () => {
    const surface = page({
      canvas: canvas(),
      children: [el({ type: 'rectangle', box: { x: 1200, y: 100, width: 130, height: 60 } })],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    const fired = judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-03')
    assert.equal(fired.length, 1)
    assert.equal(fired[0].evidence.over_px.right, 50)
    assert.deepEqual(fired[0].evidence.window_box, { x: 0, y: 0, width: 1280, height: 800 })
    assert.ok(fired[0].message.includes('clips'), fired[0].message)
  })

  it('is quiet inside the box, and tolerant of a rounding pixel', () => {
    const inside = page({
      canvas: canvas(),
      children: [el({ type: 'rectangle', box: { x: 1150, y: 100, width: 130, height: 60 } })],
    })
    assert.deepEqual(rules(measureDom({}, env(inside))), [])
    const rounding = page({
      canvas: canvas(),
      children: [el({ type: 'rectangle', box: { x: 1151, y: 100, width: 129, height: 60 } })],
    })
    assert.deepEqual(rules(measureDom({}, env(rounding))), [])
  })

  it('falls back to the largest painted box when the engine reports no canvas', () => {
    const surface = page({
      canvas: null,
      children: [
        el({ type: 'screen', box: { x: 0, y: 0, width: 1060, height: 706 }, children: [
          el({ type: 'rectangle', box: { x: 1000, y: 10, width: 120, height: 40 } }),
        ] }),
      ],
    })
    const report = measureDom({}, env(surface))
    assert.deepEqual(windowBox(report), { x: 0, y: 0, width: 1060, height: 706 })
    assert.equal(renderFindings(report).findings.filter((finding) => finding.rule === 'VIEW-RENDER-03').length, 1)
  })

  it('leaves the container-sized label wrappers the engine writes, because only a surface or a control is judged', () => {
    // Measured on the live served page 2026-11-17: the engine gave a header `label` element a 1280x800 box at
    // (16,12) while the text it painted was 22.6x16 at (860,18). Judging every element called those wrappers
    // four overflow findings that clipped nothing.
    const served = page({
      canvas: canvas(),
      children: [
        el({ type: 'label', box: { x: 16, y: 12, width: 1280, height: 800 }, children: [
          el({ tag: 'span', box: { x: 860, y: 18, width: 22.6, height: 16 }, text: '10:45' }),
        ] }),
        el({ type: 'rowLayout', box: { x: 0, y: 0, width: 1400, height: 60 } }),
      ],
    })
    assert.deepEqual(rules(measureDom({}, env(served))), [])
    // The same overflow on a control is a finding, so the gate is about what is judged, not how far it hangs.
    const pressed = page({
      canvas: canvas(),
      children: [el({ type: 'button', box: { x: 1200, y: 700, width: 130, height: 60 } })],
    })
    assert.deepEqual(rules(measureDom({}, env(pressed))), ['VIEW-RENDER-03'])
  })
})

describe('VIEW-RENDER-04: contrast against what the browser actually painted', () => {
  it('reads what the browser painted under the text, not the fill the model infers', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({
          type: 'screen',
          box: { x: 0, y: 0, width: 1280, height: 800 },
          style: { background: 'rgb(14, 26, 36)' },
          children: [
            el({
              type: 'rectangle',
              box: { x: 220, y: 150, width: 496, height: 247 },
              style: { background: 'transparent' },
              children: [
                el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, style: { color: 'rgb(26, 26, 26)' }, text: 'Total units' }),
              ],
            }),
          ],
        }),
      ],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    const fired = judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-04')
    assert.equal(fired.length, 1)
    // The card painted nothing, so the screen's fill is what the text actually sits on.
    assert.equal(fired[0].evidence.background, '#0e1a24')
    assert.equal(fired[0].evidence.color, '#1a1a1a')
    assert.ok(fired[0].evidence.ratio < 4.5, `ratio ${fired[0].evidence.ratio}`)
  })

  it('says so when nothing on the chain was painted, instead of guessing a background', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'screen', box: { x: 0, y: 0, width: 1280, height: 800 }, children: [
          el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, style: { color: 'rgb(255, 255, 255)' }, text: 'OEE' }),
        ] }),
      ],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    assert.deepEqual(judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-04'), [])
    assert.ok(judged.unchecked.some((line) => line.includes('nothing painted was found under it')), judged.unchecked.join(' | '))
  })

  it('takes the sibling underlay the runtime paints a fill with, over the ancestor above it', () => {
    // The shape the served page actually has: a card rectangle and its labels are siblings, so the card is
    // painted before the text and is what a reader sees behind it. The screen behind the card is white here,
    // so an ancestor-only walk would judge dark text against white, call it a clean pass, and miss the real
    // defect: the text sits on the dark card.
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'screen', box: { x: 0, y: 0, width: 1280, height: 800 }, style: { background: 'rgb(255, 255, 255)' }, children: [
          el({ type: 'columnlayout', box: { x: 220, y: 150, width: 496, height: 247 }, children: [
            el({ type: 'rectangle', box: { x: 220, y: 150, width: 496, height: 247 }, style: { background: 'rgb(19, 35, 47)' } }),
            el({ type: 'label', tag: 'span', box: { x: 244, y: 174, width: 120, height: 20 }, style: { color: 'rgb(26, 26, 26)' }, text: 'Total units' }),
          ] }),
        ] }),
      ],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    const fired = judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-04')
    assert.equal(fired.length, 1, judged.findings.map((finding) => `${finding.rule} ${finding.evidence.background}`).join(' | '))
    assert.equal(fired[0].evidence.background, '#13232f')
    assert.ok(fired[0].evidence.ratio < 1.1, `ratio ${fired[0].evidence.ratio}`)
  })

  it('reads rgb, rgba and the transparent spelling', () => {
    assert.deepEqual(paintedColour('rgb(226, 232, 240)'), { hex: '#e2e8f0', alpha: 1 })
    assert.deepEqual(paintedColour('rgba(19, 35, 47, 0.5)'), { hex: '#13232f', alpha: 0.5 })
    assert.equal(paintedColour('rgba(19, 35, 47, 0)'), undefined)
    assert.equal(paintedColour('transparent'), undefined)
    assert.equal(paintedColour(undefined), undefined)
  })
})

describe('the touch and font floors, decided on the painted box', () => {
  it('measures a target on the box the runtime drew', () => {
    const surface = page({
      canvas: canvas(),
      children: [el({ type: 'button', box: { x: 300, y: 400, width: 90, height: 30 }, text: 'Acknowledge' })],
    })
    const judged = renderFindings(measureDom({}, env(surface)))
    const fired = judged.findings.filter((finding) => finding.rule === 'HMI-TARGET-01')
    assert.equal(fired.length, 1)
    assert.ok(fired[0].message.includes('90x30'), fired[0].message)
    assert.equal(fired[0].evidence.measured_from, 'the rendered box')
  })

  it('names text painted under the readable floor', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'label', tag: 'span', box: { x: 100, y: 100, width: 120, height: 14 }, style: { fontSize: '9px', color: 'rgb(226, 232, 240)', background: 'rgb(14, 26, 36)' }, text: 'Cycle time' }),
      ],
    })
    const fired = renderFindings(measureDom({}, env(surface))).findings.filter((finding) => finding.rule === 'VIEW-TYPE-02')
    assert.equal(fired.length, 1)
    assert.equal(fired[0].evidence.font_size, 9)
    assert.ok(fired[0].message.includes('ScaleLayout'), fired[0].message)
  })

  it('leaves a container that inherited a small font and painted no text alone', () => {
    const surface = page({
      canvas: canvas(),
      children: [
        el({ type: 'rowLayout', box: { x: 100, y: 100, width: 400, height: 200 }, style: { fontSize: '9px' }, children: [
          el({ type: 'label', tag: 'span', box: { x: 110, y: 110, width: 120, height: 20 }, style: { fontSize: '16px', color: 'rgb(226, 232, 240)', background: 'rgb(14, 26, 36)' }, text: 'OEE' }),
        ] }),
      ],
    })
    assert.deepEqual(rules(measureDom({}, env(surface))), [])
  })
})

describe('what the answer does when the page is bigger than the report', () => {
  it('lists the unjudgeable elements up to the cap, then counts the rest', () => {
    const children = Array.from({ length: UNCHECKED_REPORTED + 7 }, (_unused, index) =>
      el({ type: 'label', tag: 'span', box: { x: 10, y: 10 + index * 20, width: 60, height: 18 }, style: { color: 'rgb(255, 255, 255)' }, text: `L${index}` }),
    )
    const judged = renderFindings(measureDom({}, env(page({ canvas: canvas(), children }))))
    assert.equal(judged.measured.unchecked_total, UNCHECKED_REPORTED + 7)
    assert.equal(judged.unchecked.length, UNCHECKED_REPORTED + 1)
    assert.ok(judged.unchecked[UNCHECKED_REPORTED].includes('more unjudgeable'), judged.unchecked.at(-1))
  })
})

describe('the render check is a tool on the preview leg', () => {
  /** Mount with the same shim the harness hands the package, with the preview leg configured. */
  function mount({ preview }) {
    const registered = []
    const failures = []
    const attachments = { saveImage: async () => ({ attachmentId: 'a1', mediaType: 'image/png', width: 1, height: 1, bytes: 1 }) }
    const ctx = {
      effect: (fn) => {
        try {
          fn()
        } catch (error) {
          failures.push({ at: `effect #${failures.length}`, error })
        }
        return () => {}
      },
      tools: {
        register: (definition) => {
          registered.push(definition?.name ?? '?')
          return () => {}
        },
      },
      inject: (_deps, run) => ctx.effect(() => run(ctx)),
      get: (name) => (name === 'attachments' ? attachments : undefined),
      provide: () => {},
      plugin: () => {},
      logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
      on: () => () => {},
      emit: () => {},
    }
    registerOptix(ctx, { bridgeUrls: ['http://127.0.0.1:8768'], preview })
    return { registered, failures }
  }

  it('registers with the preview leg, and its schema compiles', () => {
    const { registered, failures } = mount({ preview: true })
    assert.deepEqual(failures.map((failure) => failure.error?.message ?? 'refused'), [], 'a refused schema means the tool is missing from the booted plugin')
    for (const name of ['optix_render_check', 'optix_screenshot', 'optix_preview']) {
      assert.ok(registered.includes(name), `${name} did not register`)
    }
    // OCR is a separate configuration: a host Tesseract is not assumed.
    assert.ok(!registered.includes('optix_ocr'), 'optix_ocr must stay unregistered until an ocr executable is configured')
  })

  it('is not registered when the preview leg is off, so it cannot promise a render nobody configured', () => {
    const { registered } = mount({ preview: false })
    assert.ok(!registered.includes('optix_render_check'))
    assert.ok(!registered.includes('optix_screenshot'))
  })

  it('measures inside the page it already opens, and clips the capture to the served window', () => {
    assert.ok(plugin.includes('page.evaluate(measureDom'), 'the walk must run in the page, not over the model')
    assert.ok(plugin.includes('renderFindings(report, {'), 'the judgement must be handed the captured pixels, not only the DOM')
    assert.ok(plugin.includes('...(clip ? { clip } : {})'), 'the capture must clip to the window box instead of shipping the letterbox')
    assert.ok(plugin.includes('window_box'), 'the crop has to be reported, not hidden')
  })
})

describe('the captured pixels are readable without a new dependency', () => {
  it('decodes the 8-bit truecolour PNG the capture leg produces', () => {
    const image = decodePng(buildPng({ width: 8, height: 4, paint: () => cyan }))
    assert.equal(image.width, 8)
    assert.equal(image.height, 4)
    assert.equal(image.channels, 3)
    assert.equal(image.pixels.length, 8 * 4 * 3)
    assert.deepEqual([image.pixels[0], image.pixels[1], image.pixels[2]], cyan)
  })

  it('refuses what it cannot read, so the caller reports the fallback instead of reading garbage', () => {
    assert.equal(decodePng(Buffer.from('not a png at all')), undefined)
    assert.equal(decodePng(undefined), undefined)
    assert.equal(decodePng(buildPng({ width: 4, height: 4, paint: () => cyan, interlace: 1 })), undefined)
  })

  it('samples the band around the glyphs, because the glyphs are not their own background', () => {
    const sampled = sampleBackground(decodePng(buildPng({ width: 40, height: 40, paint: glyphs })), glyphBox)
    assert.equal(sampled.hex, '#0fafff')
    assert.ok(sampled.sampled > 0)
  })

  it('reads a box that holds one colour as holding nothing but that colour', () => {
    const drawn = strongestPixel(decodePng(buildPng({ width: 40, height: 40, paint: () => cyan })), glyphBox, { x: 0, y: 0 }, '#0fafff')
    assert.equal(drawn.hex, '#0fafff')
    assert.equal(drawn.distance, 0)
  })

  it('reads a box that holds a glyph as holding a colour far from what is behind it', () => {
    const drawn = strongestPixel(decodePng(buildPng({ width: 40, height: 40, paint: glyphs })), glyphBox, { x: 0, y: 0 }, '#0fafff')
    assert.equal(drawn.hex, '#ffffff')
    assert.ok(drawn.distance > 100, `distance ${drawn.distance}`)
  })
})

describe('the colour rules judge the captured pixels, not the colours the DOM reports', () => {
  const labelPage = ({ color, box = glyphBox, text = 'Ready' }) => measureDom({}, env(page({
    canvas: canvas(),
    children: [el({ type: 'label', tag: 'span', box, style: { color }, text })],
  })))

  it('reports text drawn in the colour behind it as unreadable, and does not also report a ratio', () => {
    const judged = renderFindings(labelPage({ color: 'rgb(15, 175, 255)' }), { png: buildPng({ width: 1280, height: 800, paint: () => cyan }) })
    assert.deepEqual(judged.findings.map((finding) => finding.rule), ['VIEW-RENDER-05'])
    assert.equal(judged.findings[0].evidence.background, '#0fafff')
    assert.equal(judged.findings[0].evidence.pixel_distance, 0)
    assert.equal(judged.measured.paint_read, 'captured pixels')
  })

  it('reports a low-contrast label against the colour actually painted under it', () => {
    const judged = renderFindings(labelPage({ color: 'rgb(255, 255, 255)' }), { png: buildPng({ width: 1280, height: 800, paint: glyphs }) })
    assert.deepEqual(judged.findings.map((finding) => finding.rule), ['VIEW-RENDER-04'])
    assert.equal(judged.findings[0].evidence.background, '#0fafff')
    assert.ok(judged.findings[0].evidence.ratio < CONTRAST_MINIMUM, `ratio ${judged.findings[0].evidence.ratio}`)
  })

  it('is quiet when the pixels say the text separates from what is under it', () => {
    // The header band case: white title on #005d8a measures 7.16:1, so it is not a defect.
    const headerBand = (x, y) => (x >= 10 && x < 30 && y >= 10 && y < 20 ? [255, 255, 255] : [0, 93, 138])
    assert.deepEqual(pixelRules(labelPage({ color: 'rgb(255, 255, 255)' }), buildPng({ width: 1280, height: 800, paint: headerBand })), [])
  })

  it('says which route judged the colours, and reports the fallback when the image will not decode', () => {
    const judged = renderFindings(labelPage({ color: 'rgb(255, 255, 255)' }), { png: Buffer.from('not a png at all') })
    assert.equal(judged.measured.paint_read, 'dom')
    assert.ok(judged.unchecked.some((line) => line.includes('could not be decoded')), judged.unchecked.join('\n'))
  })
})

describe('the interior sampler: what a surface is filled with, past its own border', () => {
  // Measured 2026-11-18 on the served StationWall: the kit draws a chip's label in a box equal to the chip
  // rectangle behind it (96x26 at 550,48), and the engine paints that rectangle's 1px border as an inset
  // shadow in the band's own colour. Reading the band outside the text box read the band's cyan and called a
  // 13.40:1 label a 1.81:1 defect - four chrome labels reported on one screen and the same four on the next.
  // The chip's own fill is what a reader sees behind the glyphs, so the sampler reads inside the surface.
  const chip = (x, y) => {
    if (x < 10 || x > 29 || y < 10 || y > 29) return [0, 188, 212]
    if (x === 10 || y === 10 || x === 29 || y === 29) return [0, 188, 212]
    return [28, 28, 28]
  }

  it('reads a surface past its border, because the engine draws that border inside the box it fills', () => {
    const image = decodePng(buildPng({ width: 40, height: 40, paint: chip }))
    const box = { x: 10, y: 10, width: 20, height: 20 }
    // The route Batch F used: the band outside the box, which is the band behind the chip.
    assert.equal(sampleBackground(image, box).hex, '#00bcd4')
    // The route Batch H uses: inside the surface, past its border, which is the fill the glyphs sit in.
    assert.equal(sampleInterior(image, box).hex, '#1c1c1c')
  })

  it('refuses an interior too small to read, so the caller falls back to the band instead of guessing', () => {
    const image = decodePng(buildPng({ width: 40, height: 40, paint: () => cyan }))
    assert.equal(sampleInterior(image, { x: 0, y: 0, width: 4, height: 4 }), undefined)
  })

  const chipBox = { x: 550, y: 48, width: 96, height: 26 }
  const chipPage = (ink) => measureDom({}, env(page({
    canvas: canvas(),
    children: [
      el({ type: 'screen', box: { x: 0, y: 0, width: 1280, height: 800 }, style: { background: 'rgb(18, 18, 18)' }, children: [
        el({ type: 'rectangle', box: { x: 0, y: 0, width: 1280, height: 76 }, style: { background: 'rgb(0, 188, 212)' } }),
        el({ type: 'rectangle', box: chipBox, style: { background: 'rgb(28, 28, 28)' } }),
        el({ type: 'label', tag: 'span', box: chipBox, style: { color: ink }, text: 'Line 1' }),
      ] }),
    ],
  })))
  const chipPng = (ink) => buildPng({
    width: 1280,
    height: 800,
    paint: (x, y) => {
      if (x < 550 || x > 645 || y < 48 || y > 73) return [0, 188, 212]
      if (x === 550 || y === 48 || x === 645 || y === 73) return [0, 188, 212]
      if (x >= 560 && x <= 630 && y >= 55 && y <= 66) return ink
      return [28, 28, 28]
    },
  })
  const contrast = (judged) => judged.findings.filter((finding) => finding.rule === 'VIEW-RENDER-04' || finding.rule === 'VIEW-RENDER-05')

  it('is quiet when the label box coincides with the chip and the ring around it is the band', () => {
    const judged = renderFindings(chipPage('rgb(228, 228, 228)'), { png: chipPng([228, 228, 228]) })
    assert.deepEqual(
      contrast(judged).map((finding) => `${finding.rule} ${finding.evidence.background}`),
      [],
      contrast(judged).map((finding) => finding.message).join(' | '),
    )
  })

  it('still reports a label the chip fill cannot carry, and names the interior as the route it read', () => {
    const judged = renderFindings(chipPage('rgb(44, 44, 44)'), { png: chipPng([44, 44, 44]) })
    const fired = contrast(judged)
    assert.equal(fired.length, 1, fired.map((finding) => finding.message).join(' | '))
    assert.equal(fired[0].rule, 'VIEW-RENDER-04')
    // Against the chip's fill, not the band's cyan: the band made this label 1.81:1 and pointed the fix at
    // the wrong surface.
    assert.equal(fired[0].evidence.background, '#1c1c1c')
    assert.equal(fired[0].evidence.color, '#2c2c2c')
    assert.ok(fired[0].evidence.ratio < CONTRAST_MINIMUM, `ratio ${fired[0].evidence.ratio}`)
    assert.ok(fired[0].evidence.measured_from.includes('past its border'), fired[0].evidence.measured_from)
    assert.ok(fired[0].evidence.measured_from.includes('rectangle'), fired[0].evidence.measured_from)
  })

  it('falls back to the band when the surface holding the text paints with what the DOM does not report', () => {
    // The rail's selected tab: a NavigationPanel paints it with a `background-image` gradient, so nothing on
    // the chain carries a `backgroundColor` and there is no interior to read. The band outside the text box is
    // where a gradient is visible, and that finding has to survive the interior route.
    const surface = measureDom({}, env(page({
      canvas: canvas(),
      children: [
        el({ type: 'navigationpanel', box: { x: 0, y: 0, width: 220, height: 800 }, children: [
          el({ type: 'label', tag: 'span', box: { x: 20, y: 60, width: 120, height: 22 }, style: { color: 'rgb(255, 255, 255)' }, text: 'Station Wall' }),
        ] }),
      ],
    })))
    const judged = renderFindings(surface, {
      png: buildPng({ width: 1280, height: 800, paint: (x, y) => (x >= 24 && x <= 130 && y >= 64 && y <= 78 ? [255, 255, 255] : [15, 175, 255]) }),
    })
    const fired = contrast(judged)
    assert.equal(fired.length, 1, fired.map((finding) => finding.message).join(' | '))
    assert.equal(fired[0].rule, 'VIEW-RENDER-04')
    assert.equal(fired[0].evidence.background, '#0fafff')
    assert.ok(fired[0].evidence.ratio < CONTRAST_MINIMUM, `ratio ${fired[0].evidence.ratio}`)
    assert.equal(fired[0].evidence.measured_from, 'the captured pixels in the band around the text box')
  })

  it('reads the band, not the frame of a surface the text sits deep inside', () => {
    // The same day's second measurement: on the served StationWall the element the DOM puts the rail tab on
    // is a rectangle the size of the whole window, so reading that holder's inset frame read its four sides -
    // white at the content edge - and called a white tab on a cyan gradient 1:1, while the invisible
    // cyan-on-cyan "Ready" moved out of VIEW-RENDER-05 into a 2.44:1 VIEW-RENDER-04. A label deep inside a
    // large surface is judged on the band around the label; the holder's own frame answers only the flush one.
    const plate = { x: 0, y: 0, width: 1280, height: 800 }
    const tab = { x: 50, y: 240, width: 120, height: 22 }
    assert.equal(bandInsideSurface(chipBox, chipBox), 0)
    assert.equal(bandInsideSurface(tab, plate), 1)
    const surface = measureDom({}, env(page({
      canvas: canvas(),
      children: [
        el({ type: 'screen', box: plate, style: { background: 'rgb(255, 255, 255)' }, children: [
          el({ type: 'rectangle', box: plate, style: { background: 'rgb(255, 255, 255)' } }),
          el({ type: 'navigationpanel', box: { x: 0, y: 64, width: 220, height: 736 }, children: [
            el({ type: 'label', tag: 'span', box: tab, style: { color: 'rgb(255, 255, 255)' }, text: 'Station Wall' }),
          ] }),
        ] }),
      ],
    })))
    const judged = renderFindings(surface, {
      png: buildPng({
        width: 1280,
        height: 800,
        paint: (x, y) => {
          if (x >= 60 && x <= 160 && y >= 244 && y <= 258) return [255, 255, 255]
          if (x >= 40 && x <= 180 && y >= 230 && y <= 272) return cyan
          return [255, 255, 255]
        },
      }),
    })
    const fired = contrast(judged)
    assert.equal(fired.length, 1, fired.map((finding) => finding.message).join(' | '))
    assert.equal(fired[0].rule, 'VIEW-RENDER-04')
    assert.equal(fired[0].evidence.background, '#0fafff')
    assert.equal(fired[0].evidence.color, '#ffffff')
    assert.equal(fired[0].evidence.ratio, 2.44)
    assert.equal(fired[0].evidence.measured_from, 'the captured pixels in the band around the text box')
  })
})

describe('a surface counts as painted when its fill is on the overlay child the engine writes', () => {
  // Measured on the served page: a card's [data-type="rectangle"] computes rgba(0,0,0,0) and its
  // child div paints rgb(19,35,47), so judging the element's own colour calls every card unpainted.
  const card = () => el({
    type: 'rectangle',
    box: { x: 220, y: 150, width: 496, height: 247 },
    style: { background: 'rgba(0, 0, 0, 0)' },
    children: [
      el({
        box: { x: 220, y: 150, width: 496, height: 247 },
        style: { background: 'rgb(19, 35, 47)' },
        children: [
          el({ type: 'label', tag: 'span', box: { x: 244, y: 176, width: 90, height: 18 }, style: { color: 'rgb(226, 232, 240)' }, text: 'Throughput' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 200, width: 70, height: 16 }, style: { color: 'rgb(226, 232, 240)' }, text: 'Units / hour' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 220, width: 60, height: 18 }, style: { color: 'rgb(226, 232, 240)' }, text: '46,800' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 242, width: 60, height: 16 }, style: { color: 'rgb(226, 232, 240)' }, text: 'Total units' }),
          el({ type: 'label', tag: 'span', box: { x: 244, y: 262, width: 60, height: 18 }, style: { color: 'rgb(226, 232, 240)' }, text: '21,490' }),
        ],
      }),
    ],
  })

  it('reports the card that renders its text in its top band and leaves the rest empty', () => {
    const report = measureDom({}, env(page({ canvas: canvas(), children: [card()] })))
    const judged = renderFindings(report)
    assert.deepEqual(judged.findings.map((finding) => finding.rule), ['VIEW-RENDER-02'])
    const [finding] = judged.findings
    assert.equal(finding.evidence.text_elements, 5)
    assert.ok(finding.evidence.coverage < COVERAGE_MINIMUM, `coverage ${finding.evidence.coverage}`)
    assert.ok(finding.evidence.empty_px >= EMPTY_BAND_MINIMUM, `empty ${finding.evidence.empty_px}`)
  })

  it('surfacePaint reads the overlay child, because the element itself reports no fill', () => {
    const report = measureDom({}, env(page({ canvas: canvas(), children: [card()] })))
    const flat = flattenTree(report.nodes)
    const rectangle = flat.find((entry) => entry.type === 'rectangle')
    assert.equal(paintedColour(rectangle.background), undefined, 'the measured shape: the typed element computes a transparent background')
    assert.notEqual(surfacePaint(rectangle, flat), undefined, 'the fill has to be found on the overlay')
  })
})
