import test from 'node:test'
import assert from 'node:assert/strict'
import { ELEMENTS, FAMILIES, renderDisplayWithReport } from '../src/index.ts'

/** One display holding a single object of the named element. */
function displayFor(name, inner = '') {
  const open = `<${name} name="Subject" left="20" top="20" width="120" height="60" caption="X"`
  const body = inner === '' ? `${open}/>` : `${open}>${inner}</${name}>`
  return `<?xml version="1.0"?>
<gfx>
  <displaySettings width="400" height="300" backColor="white"/>
  ${body}
</gfx>`
}

const elements = Object.keys(ELEMENTS).sort()

test('the vocabulary covers every element the schema declares', () => {
  assert.ok(elements.length >= 91, `the snapshot declares ${elements.length} element(s)`)
  for (const [name, facts] of Object.entries(ELEMENTS)) {
    assert.ok(FAMILIES.includes(facts.family), `${name} has family ${facts.family}, which is not in FAMILIES`)
    assert.ok(Array.isArray(facts.attributes), `${name} has no attribute list`)
  }
})

test('every declared element either draws or becomes a placeholder, never a silent blank', () => {
  const dropped = []
  for (const name of elements) {
    const group = name === 'group' ? '<panel name="Inner" left="0" top="0" width="40" height="20" backColor="silver"/>' : ''
    const xml = displayFor(name, group)
    const { svg, report } = renderDisplayWithReport(xml)
    // `objects` counts nested objects too, so a group holding a panel is two:
    // the ratio `drawn/objects` then means the same thing at any nesting depth.
    const expected = name === 'group' ? 2 : 1
    assert.equal(report.objects, expected, `${name} was not counted as ${expected} object(s)`)
    const accounted = report.drawn > 0 || report.markers.some(marker => marker.type === name) || report.unknown.some(marker => marker.type === name)
    if (!accounted) dropped.push(name)
    assert.match(svg, /data-ftv-type="/u, `${name} produced no identity`)
  }
  assert.deepEqual(dropped, [], `these elements vanished without a trace: ${dropped.join(', ')}`)
})

test('an element the schema does not declare is drawn and reported as unknown', () => {
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="200" height="100" backColor="white"/>
  <notAViewObject name="Bogus" left="10" top="10" width="80" height="20" caption="Bogus"/>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml)
  assert.equal(report.unknown.length, 1)
  assert.equal(report.unknown[0].type, 'notAViewObject')
  assert.match(svg, />Bogus</u)
})

test('a vendor-absent name from an older template still paints', () => {
  const xml = `<?xml version="1.0"?>
<gfx>
  <displaySettings width="200" height="100" backColor="white"/>
  <listSelector name="Pick" left="10" top="10" width="120" height="40" caption="Recipes"/>
</gfx>`
  const { svg, report } = renderDisplayWithReport(xml)
  assert.match(svg, />Recipes</u)
  assert.equal(report.unknown[0].type, 'listSelector')
})
