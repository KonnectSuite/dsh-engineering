import test from 'node:test'
import assert from 'node:assert/strict'
import {
  boxDiagonal,
  documentMode,
  lineSegment,
  pathPoints,
  pointsToPath,
  polygonPoints,
  renderDisplayWithReport,
} from '../src/index.ts'

const EXPORTED = `<?xml version="1.0"?>
<gfx xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:noNamespaceSchemaLocation="Gfx-ME16.xsd">
  <displaySettings width="800" height="600" backColor="white" displayNumber="10"/>
  <line name="Rule" left="10" top="10" width="100" height="10" line="15 15 105 15 " lineWidth="10" foreColor="red" visible="true"/>
</gfx>`

const DRAFTED = `<?xml version="1.0"?>
<gfx>
  <polyline name="Curve" left="200" top="100" width="200" height="100" path="0 0 100 0 100 100" foreColor="yellow"/>
</gfx>`

const box = { left: 200, top: 100, width: 200, height: 100 }

test('a drafted coordinate list is percent of the object box', () => {
  const resolved = pathPoints('0 0 100 0 100 100', box, 'draft')
  assert.equal(resolved.rule, 'percent')
  assert.deepEqual(resolved.points, [
    { x: 200, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 200 },
  ])
  assert.equal(pointsToPath(resolved.points, false), 'M 200 100 L 400 100 L 400 200')
})

test('an exported coordinate list is display pixels, and the percentage clamps', () => {
  const exported = polygonPoints('400 125 569 125 569 214', box, 'export')
  assert.equal(exported.rule, 'absolute')
  assert.deepEqual(exported.points[0], { x: 400, y: 125 })

  // Measured: a drafted value above 100 clamps to the box edge; it never means pixels.
  const clamped = pathPoints('300 320 400 320 400 420', { left: 200, top: 100, width: 200, height: 100 }, 'draft')
  assert.deepEqual(clamped.points[0], { x: 400, y: 200 })
})

test('a line attribute is read as pixels when any value leaves the box', () => {
  const absolute = lineSegment('210 15 310 15', { left: 200, top: 10, width: 100, height: 10 }, 'draft')
  assert.equal(absolute.rule, 'absolute')
  assert.deepEqual(absolute.points, [{ x: 210, y: 15 }, { x: 310, y: 15 }])

  const percent = lineSegment('0 0 100 0', { left: 10, top: 10, width: 100, height: 10 }, 'draft')
  assert.equal(percent.rule, 'percent')
  assert.deepEqual(percent.points, [{ x: 10, y: 10 }, { x: 110, y: 10 }])
})

test('a geometry-less object falls back to the box diagonal, inset by one pixel', () => {
  const diagonal = boxDiagonal({ left: 10, top: 240, width: 170, height: 90 })
  assert.equal(diagonal.rule, 'box-diagonal')
  assert.deepEqual(diagonal.points, [{ x: 11, y: 241 }, { x: 179, y: 329 }])
  assert.equal(lineSegment(undefined, box, 'export'), undefined)
  assert.equal(pathPoints('', box, 'draft').points.length, 0)
})

test('the coordinate mode is read from the file, not assumed', () => {
  assert.deepEqual(documentMode(true, 5, 0), { mode: 'export', reason: 'settings' })
  assert.deepEqual(documentMode(true, 5, 5), { mode: 'export', reason: 'settings' })
  assert.deepEqual(documentMode(false, 4, 4), { mode: 'export', reason: 'imported-flags' })
  assert.deepEqual(documentMode(false, 4, 0), { mode: 'draft', reason: 'staged' })
})

test('an exported display draws its line coordinates instead of the box diagonal', () => {
  const { svg, report } = renderDisplayWithReport(EXPORTED)
  assert.equal(report.mode, 'export')
  assert.equal(report.modeReason, 'settings')
  assert.match(svg, /<line x1="15" y1="15" x2="105" y2="15"/u)
  assert.equal(report.geometry.length, 1)
  assert.equal(report.geometry[0].rule, 'absolute')
})

test('a drafted display resolves its percentages and says so', () => {
  const { svg, report } = renderDisplayWithReport(DRAFTED)
  assert.equal(report.mode, 'draft')
  assert.equal(report.modeReason, 'staged')
  assert.match(svg, /<path d="M 200 100 L 400 100 L 400 200"/u)
  assert.equal(report.geometry[0].rule, 'percent')
})

test('a forced mode overrides the detection', () => {
  const { report } = renderDisplayWithReport(EXPORTED, { mode: 'draft' })
  assert.equal(report.mode, 'draft')
  assert.equal(report.modeReason, 'forced')
})

test('a polyPolygon needs two innerPolygons, and the second one is drawn', () => {
  const two = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="800" height="600" backColor="white"/>
  <polyPolygon name="Two" left="400" top="125" width="170" height="90" foreColor="white">
    <innerPolygon polygon="0 0 100 0 100 100"/>
    <innerPolygon polygon="10 10 90 10 90 90"/>
  </polyPolygon>
</gfx>`
  const good = renderDisplayWithReport(two)
  assert.equal((good.svg.match(/<path /gu) ?? []).length, 2)
  assert.equal(good.report.markers.length, 0)

  const one = two.replace('    <innerPolygon polygon="10 10 90 10 90 90"/>\n', '')
  const bad = renderDisplayWithReport(one)
  assert.equal(bad.report.markers.length, 1)
  assert.match(bad.report.markers[0].reason, /two innerPolygon/u)
  assert.match(bad.svg, /polyPolygon Two/u)
})

test('an object the preview cannot draw says why in the drawing', () => {
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="200" height="100" backColor="white"/>
  <activeX name="Chart1" left="10" top="10" width="80" height="40"/>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml)
  assert.equal(report.markers.length, 1)
  assert.match(report.markers[0].reason, /ActiveX/u)
  assert.match(svg, /activeX Chart1/u)
})

test('a trend keeps its painted placeholder and is reported as outside the vocabulary', () => {
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="800" height="600" backColor="white"/>
  <trend name="T1" left="200" top="30" width="200" height="100" borderColor="#b0b0b0"/>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml)
  assert.match(svg, />trend</u)
  assert.equal(report.unknown[0].type, 'trend')
})

test('an arc whose angles are equal is the ellipse the editor draws', () => {
  // Installed export, Probe1: startAngle="0" endAngle="0" with a solid backColor;
  // Studio paints a filled ellipse, while a zero-length sweep paints nothing.
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="800" height="600" backColor="white"/>
  <arc name="A1" left="205" top="240" width="170" height="90" backStyle="solid" backColor="#263051" startAngle="0" endAngle="0"/>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml)
  assert.match(svg, /<ellipse cx="290" cy="285" rx="85" ry="45" fill="#263051"/u)
  assert.doesNotMatch(svg, /<path /u)
  assert.equal(report.markers.length, 1)
  assert.match(report.markers[0].reason, /full ellipse/u)
})

test('a bar graph with no controller value draws its frame and says so', () => {
  // Installed export, Probe1: backStyle="transparent" and borderStyle="none", so
  // the graph painted nothing at all once the value was missing.
  const connected = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="800" height="600" backColor="white"/>
  <barGraph name="B1" left="205" top="355" width="170" height="90" minValue="0" maxValue="100" backStyle="transparent" fillColor="lime">
    <connections><connection name="Value" expression="{Tag}"/></connections>
  </barGraph>
</gfx>`
  const bare = renderDisplayWithReport(connected)
  assert.match(bare.svg, /barGraph · no value/u)
  assert.match(bare.svg, /stroke-dasharray="3 3"/u)
  assert.equal(bare.report.markers.length, 1)
  assert.match(bare.report.markers[0].reason, /controller value/u)

  const fed = renderDisplayWithReport(connected, { tagValues: { '{Tag}': 50 } })
  assert.match(fed.svg, /<rect x="205" y="355" width="85" height="90" fill="#00ff00"/u)
  assert.equal(fed.report.markers.length, 0)
})

test('a bar graph threshold value is a setting, not an object', () => {
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="800" height="600" backColor="white"/>
  <barGraph name="B1" left="10" top="10" width="200" height="20" backColor="#001c38">
    <thresh1Value>70</thresh1Value>
  </barGraph>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml, { tagValues: { '{Tag}': 10 } })
  assert.doesNotMatch(svg, /data-ftv-type="thresh1Value"/u)
  assert.equal(report.objects, 1)
})
