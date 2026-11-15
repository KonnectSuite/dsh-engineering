/**
 * The Advanced SVG gate.
 *
 * `optix_svg` is only allowed to hand an agent a drawing Optix can actually
 * drive: an Advanced SVG image controls an element through its `id`, and only a
 * hexadecimal fill or stroke that is written as an attribute or inline style is
 * reachable. These tests hold the two halves of that promise — a good drawing is
 * passed without a finding, a bad one is refused with the exact fix — plus the
 * name mapping between an SVG element and the Optix element-property node.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { elementPropertyName, inspectSvg, propertyClass, repairPlan } from '../packages/optix/lib/svg.js'

const GOOD = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="240" height="120" viewBox="0 0 240 120">
  <rect id="Conveyor" x="10" y="40" width="200" height="30" fill="#30A46C" stroke="#143243"/>
  <circle id="Lamp" cx="30" cy="20" r="10" fill="#E5484D" style="stroke:#000000;stroke-width:2"/>
</svg>`

const BAD = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="100" height="50">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs>
  <rect id="Plate" width="50" height="50" fill="rgb(12, 34, 56)"/>
  <rect id="Overlay" width="10" height="10" fill="url(#g)"/>
</svg>`

test('a drawing Optix can drive is passed without a finding', () => {
  const analysis = inspectSvg(GOOD)
  assert.equal(analysis.conformant, true)
  assert.deepEqual(analysis.findings, [])
  assert.equal(analysis.size.width, '240')
  assert.equal(analysis.size.height, '120')
  assert.equal(analysis.view_box, '0 0 240 120')
  assert.deepEqual(analysis.controlable.map((entry) => entry.id), ['Conveyor', 'Lamp'])
  for (const entry of analysis.controlable) {
    assert.ok(entry.properties.includes('Color'), JSON.stringify(entry))
    assert.ok(entry.properties.includes('Opacity'))
  }
  // A stroke width read from an inline style is what makes StrokeWidth drivable.
  assert.ok(analysis.controlable.find((entry) => entry.id === 'Lamp').properties.includes('StrokeWidth'))
  assert.deepEqual(repairPlan(analysis), [])
})

test('an element inside defs is never offered as controllable', () => {
  const analysis = inspectSvg(BAD)
  assert.equal(analysis.conformant, false)
  const gradient = analysis.controlable.find((entry) => entry.id === 'g')
  assert.equal(gradient, undefined, JSON.stringify(analysis.controlable))
  // The gradient itself is reported as a construct SVG 1.2 Tiny does not carry,
  // but that is a rendering risk, not something that stops an agent driving a
  // property, so it must not be classified as blocking.
  const unsupported = analysis.findings.find((finding) => finding.code === 'unsupported_linearGradient')
  assert.ok(unsupported !== undefined, JSON.stringify(analysis.findings))
  assert.equal(unsupported.severity, 'may_not_display')
})

test('a colour Optix cannot drive blocks control and comes with the fix', () => {
  const analysis = inspectSvg(BAD)
  const blocking = analysis.findings.filter((finding) => finding.severity === 'blocks_control')
  assert.ok(blocking.length > 0)
  const paintServer = blocking.find((finding) => finding.code === 'colour_unsupported_fill' && finding.id === 'Overlay')
  assert.ok(paintServer !== undefined, JSON.stringify(analysis.findings))
  assert.match(paintServer.repair, /fill="#30A46C"/u)
  // rgb() is a colour, just not a hexadecimal one: repairable, with the value.
  const rgb = analysis.findings.find((finding) => finding.code === 'colour_not_hex_fill')
  assert.ok(rgb !== undefined, JSON.stringify(analysis.findings))
  assert.match(rgb.repair, /#0C2238/u)
  const plan = repairPlan(analysis)
  assert.ok(plan.every((entry) => typeof entry.repair === 'string' && entry.repair.length > 0))
})

test('a drawing with nothing to control is refused', () => {
  const flat = '<svg version="1.2" baseProfile="tiny" width="10" height="10"><rect width="10" height="10"/></svg>'
  const analysis = inspectSvg(flat)
  assert.equal(analysis.conformant, false)
  const codes = analysis.findings.map((finding) => finding.code)
  assert.ok(codes.includes('no_ids'), JSON.stringify(codes))
  assert.deepEqual(analysis.controlable, [])
})

test('an empty or missing drawing is answered, not thrown at', () => {
  assert.equal(inspectSvg('').findings[0].code, 'empty')
  assert.equal(inspectSvg(undefined).conformant, false)
})

test('a non-tiny SVG version is reported as a rendering risk', () => {
  const analysis = inspectSvg('<svg version="2.0" width="5" height="5"><rect id="a" fill="#000000" width="5" height="5"/></svg>')
  const finding = analysis.findings.find((entry) => entry.code === 'version_not_tiny')
  assert.ok(finding !== undefined, JSON.stringify(analysis.findings))
  assert.equal(finding.severity, 'may_not_display')
})

test('an element id becomes the Optix element-property node name', () => {
  assert.equal(elementPropertyName('Conv-1', 'Color'), 'Conv_1_Color')
  assert.equal(elementPropertyName('1st', 'Color'), '_1st_Color')
  assert.equal(elementPropertyName('Lamp', 'StrokeWidth'), 'Lamp_StrokeWidth')
})

test('two ids that derive one node name are refused before the batch runs', () => {
  // `A-1` and `A_1` sanitise to the same Optix child name, and the bridge refuses
  // a duplicate name inside a collection: the second create would fail with the
  // first already applied.
  assert.equal(elementPropertyName('A-1', 'Color'), elementPropertyName('A_1', 'Color'))
  const collision = '<svg version="1.2" baseProfile="tiny" width="9" height="9"><rect id="A-1" fill="#000000" width="9" height="9"/><rect id="A_1" fill="#FFFFFF" width="9" height="9"/></svg>'
  const analysis = inspectSvg(collision)
  assert.equal(analysis.conformant, false)
  const finding = analysis.findings.find((entry) => entry.code === 'property_name_collision')
  assert.ok(finding !== undefined, JSON.stringify(analysis.findings))
  assert.match(finding.message, /A-1/u)
  assert.match(finding.message, /A_1/u)
})

test('a property is spelled the way the class enum takes it', () => {
  assert.equal(propertyClass('Color'), 'Color')
  assert.equal(propertyClass('colour'), 'Color')
  assert.equal(propertyClass('opacity'), 'Opacity')
  assert.equal(propertyClass('stroke_width'), 'StrokeWidth')
  assert.equal(propertyClass('Stroke dasharray'), 'StrokeDasharray')
  assert.equal(propertyClass('hue'), undefined)
})
