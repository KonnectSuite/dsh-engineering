/**
 * The diagram face: an FBD sheet and an SFC chart drawn as SVG.
 *
 * The parser needs a DOM, so the e2e render suite judges `parseProject` in a browser. This file judges
 * what can be judged without one: that the drawing places the elements the export positions, draws a
 * line for every wire and link that resolves, and says nothing at all for an empty routine.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diagramSvg } from '../packages/viewer/src/client/diagram.ts'

/** One element with the fields the drawing reads, defaulted. */
const element = overrides => ({
  kind: 'IRef', id: '', x: 0, y: 0, label: '', pins: '', condition: '', initial: false,
  from: '', to: '', fromPin: '', toPin: '', ...overrides,
})

/** The FBD sheet composed for this repository's proof, as the parser projects it. */
const FBD = {
  language: 'FBD',
  elements: [
    element({ kind: 'IRef', id: '0', x: 180, y: 60, label: 'r1' }),
    element({ kind: 'IRef', id: '1', x: 180, y: 140, label: 'r2' }),
    element({ kind: 'Block', id: '2', x: 300, y: 20, label: 'add1', pins: 'SourceA SourceB Dest' }),
    element({ kind: 'ORef', id: '3', x: 520, y: 80, label: 'r3' }),
    element({ kind: 'Wire', from: '0', to: '2', toPin: 'SourceA' }),
    element({ kind: 'Wire', from: '1', to: '2', toPin: 'SourceB' }),
    element({ kind: 'Wire', from: '2', to: '3', fromPin: 'Dest' }),
  ],
}

/** A two-step chart with one transition between the steps. */
const SFC = {
  language: 'SFC',
  elements: [
    element({ kind: 'Step', id: '0', x: 300, y: 100, label: 'Step_1', initial: true }),
    element({ kind: 'Transition', id: '2', x: 300, y: 200, label: 'Tran_1', condition: 'Timer.DN' }),
    element({ kind: 'Step', id: '1', x: 300, y: 300, label: 'Step_2' }),
    element({ kind: 'DirectedLink', from: '0', to: '2' }),
    element({ kind: 'DirectedLink', from: '2', to: '1' }),
  ],
}

test('an FBD sheet draws its blocks and every wire', () => {
  const svg = diagramSvg(FBD)
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/u)
  assert.equal((svg.match(/<rect /gu) ?? []).length, 4)
  assert.equal((svg.match(/<line /gu) ?? []).length, 3)
  // The block, its pins and the pin a wire lands on are all legible on the drawing.
  for (const text of ['add1', 'SourceA', 'SourceB', 'Dest', 'r3']) assert.ok(svg.includes(text), text)
})

test('a chart draws its steps, its transition and the condition it carries', () => {
  const svg = diagramSvg(SFC)
  assert.equal((svg.match(/<rect /gu) ?? []).length, 3)
  assert.equal((svg.match(/<line /gu) ?? []).length, 2)
  assert.ok(svg.includes('initial'), 'the initial step is not marked')
  assert.ok(svg.includes('Timer.DN'), 'the transition condition is not drawn')
  assert.ok(svg.includes('Step_2'))
})

test('a wire that names an element the routine does not carry draws nothing', () => {
  const svg = diagramSvg({ language: 'FBD', elements: [element({ kind: 'Wire', from: '9', to: '8' })] })
  // No element to place means no drawing at all, rather than an empty frame.
  assert.equal(svg, '')
})

test('a routine with no elements draws nothing', () => {
  assert.equal(diagramSvg({ language: 'SFC', elements: [] }), '')
})
