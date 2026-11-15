/**
 * The shipped Optix object-model catalog and the tool that reads it.
 *
 * The catalog is generated from the installed Studio help, so these tests hold
 * two things: that the shipped file still knows the types the tools rely on
 * (`AdvancedSVGImage` for the SVG path, `AnalogItemType` for the variable
 * kinds), and that the generator still parses the markup Studio's single-page
 * help emits — a fixture page in the same shape, so a Studio help change is
 * caught here rather than in a bundle.
 */
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
import assert from 'node:assert/strict'

import { buildSchema, referencePages, textOf } from '../scripts/gen-optix-schema.mjs'
import {
  childrenOf,
  closest,
  diffDump,
  enumInfo,
  find,
  isObjectType,
  loadNetlogicTypes,
  schemaVersion,
  typeInfo,
  typeNames,
} from '../packages/optix/lib/schema.js'

const SPEC_ROOT = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(SPEC_ROOT, '..')

test('the shipped catalog names the Studio build it came from', () => {
  const version = schemaVersion()
  assert.equal(version.schema_version, 1)
  assert.match(version.studio_version, /^\d+(?:\.\d+)+$/u)
  assert.ok(version.counts.types > 400, `only ${version.counts.types} object types`)
  assert.ok(version.counts.variableTypes > 50)
  assert.ok(version.counts.enums > 50)
})

test('a type carries its properties, super type, children and methods', () => {
  const svg = typeInfo('AdvancedSVGImage')
  assert.ok(svg !== undefined)
  assert.equal(svg.super_type, 'Container')
  assert.equal(svg.clr, 'FTOptix.UI.AdvancedSVGImage')
  const path = svg.properties_detail.find((property) => property.name === 'Path')
  assert.equal(path.dataType, 'ResourceUri')
  assert.deepEqual(childrenOf('AdvancedSVGImage'), ['AdvancedSVGImageElementProperty'])
  assert.equal(svg.methods[0].name, 'SetImageContent')
  assert.deepEqual(svg.methods[0].args, [{ name: 'ImageContent', dataType: 'String' }])
  assert.deepEqual(svg.events.map((event) => event.name).sort(), ['MouseDownEvent', 'MouseUpEvent'])
})

test('an enum carries its members, and a data type is known to be one', () => {
  assert.deepEqual(enumInfo('ImageFillModeEnum').values.map((value) => value.name), ['Fit', 'Stretch', 'Tile'])
  assert.equal(isObjectType('Button'), true)
  assert.equal(isObjectType('ImageFillModeEnum'), false)
})

test('the variable kinds the model writes are in the catalog', () => {
  const analog = typeInfo('AnalogItemType')
  assert.ok(analog !== undefined, 'AnalogItemType missing from the catalog')
  assert.equal(analog.clr, 'Opc.Ua.AnalogItemType')
  const names = analog.properties_detail.map((property) => property.name)
  assert.ok(names.includes('EURange'), `EURange missing from ${names.join(', ')}`)
  assert.ok(names.includes('EngineeringUnits'))
  assert.ok(typeInfo('BaseDataVariableType') !== undefined)
  assert.ok(typeInfo('NodePointer') !== undefined)
})

test("a curated map names the CLR type a NetLogic class should use", () => {
	const panelLoader = typeInfo('PanelLoader')
	assert.equal(panelLoader.clrType, 'FTOptix.UI.PanelLoader')
	assert.equal(panelLoader.netlogic_page, 'element-access.md')

	const analog = typeInfo('AnalogItemType')
	assert.equal(analog.clrType, 'Opc.Ua.AnalogItemType')
	assert.equal(analog.netlogic_page, 'engineering-units.md')

	const map = loadNetlogicTypes()
	const names = Object.keys(map.types)
	assert.ok(names.length >= 40, `the curated map holds ${names.length} types`)
	for (const name of names) {
		const entry = map.types[name]
		assert.match(entry.clr, /^[A-Z][A-Za-z0-9]*(?:\.[A-Z][A-Za-z0-9]*)+$/u, `${name} clr`)
		assert.ok(entry.kind === 'object' || entry.kind === 'variable', `${name} kind`)
		assert.ok(existsSync(join(REPO_ROOT, 'packages', 'optix', 'netlogic', 'pages', `${entry.page}`)), `${name} names a page that exists: ${entry.page}`)
	}
	for (const name of ['AdvancedSVGImage', 'Panel', 'PanelLoader', 'Alias', 'NodePointer', 'AnalogItemType']) {
		assert.ok(names.includes(name), `${name} should be curated`)
	}
})

test('a near miss is answered with the closest real names', () => {
  assert.deepEqual(closest('Txt', ['Text', 'TextBox', 'TextColor']), ['Text', 'TextBox', 'TextColor'])
  // The catalog is types, so a property spelling is answered by the nearest type
  // names; what matters is that a reply comes back and it is short and ranked.
  const near = closest('Txt', typeNames())
  assert.equal(near.length, 3)
  for (const name of near) assert.equal(typeof name, 'string')
})

test('a property search aggregates owners instead of repeating rows', () => {
  const rows = find('Width').matches.filter((match) => match.kind === 'property')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, 'Width')
  assert.ok(rows[0].owners > 10)
  assert.ok(Array.isArray(rows[0].sample))
})

test('a dump from the running Studio is compared against the catalog', () => {
  // Measured shape from bridge 1.0.9 on Studio 1.8.1.27: an object keyed by browse name, the module
  // version (not the Studio version), and only the renderable widget types.
  const diff = diffDump({
    studio_version: '22.0.0.61',
    types: {
      Button: { browse_name: 'Button', properties: [{ name: 'NotARealProperty', datatype: 'String', settable: true }, { name: 'Text', datatype: 'String', settable: true }] },
      ImaginaryWidget: { browse_name: 'ImaginaryWidget', properties: [] },
    },
  })
  assert.equal(diff.studio_version, '22.0.0.61')
  assert.ok(diff.added.includes('ImaginaryWidget'))
  const change = diff.changed.find((entry) => entry.type === 'Button')
  assert.deepEqual(change, { type: 'Button', property: 'NotARealProperty', was: null, now: 'String' })
  assert.equal(diff.dump_types, 2)
  assert.equal(diff.covered, 2)
  assert.equal(diff.same, false)
  // A documented type that differs from the runtime's OPC UA type is drift, not a difference: the help
  // calls Width a `Size` and the bridge reports `Single`, which on Studio 1.8.1.27 was 842 of 844 rows.
  const drift = diffDump({ studio_version: '22.0.0.61', types: { Button: { browse_name: 'Button', properties: [{ name: 'Width', datatype: 'Single' }] } } })
  assert.deepEqual(drift.changed, [])
  assert.deepEqual(drift.datatype_drift, [{ type: 'Button', property: 'Width', catalog: 'Size', studio: 'Single' }])
  assert.equal(drift.same, true)
  // An array of rows is accepted too, so a future dump shape cannot silently empty the diff.
  const arrayForm = diffDump({ version: '1.8.1.27', types: [{ name: 'ImaginaryWidget', properties: [] }] })
  assert.ok(arrayForm.added.includes('ImaginaryWidget'))
  assert.equal(arrayForm.studio_version, '1.8.1.27')
})

/** A Studio help page in the shape the generator parses, for one object type. */
const OBJECT_PAGE = `<!doctype html><html><body><div class="- topic/body">
<h1 class="- topic/title title topictitle1">Demo Widget</h1>
<p class="- topic/p shortdesc">A demo widget that exists only in this test.</p>
<dl class="- topic/dl dl entry">
<dt class="- topic/dt dlterm">BrowseName</dt><dd class="- topic/dd ddef">DemoWidget</dd>
<dt class="- topic/dt dlterm">SuperType</dt>
<dd class="- topic/dd ddef"><a href="Container.html" title="the container">Container</a>(Container)</dd>
</dl>
<h2 class="- topic/sectiontitle h2">Properties</h2>
<table class="- topic/table table"><thead><tr><th>Name</th><th>BrowseName</th><th>DataType</th><th>Description</th></tr></thead>
<tbody>
<tr><td></td><td></td><td>Fill</td><td>FillColor2</td><td><a href="Color.html" title="colour">Colour</a></td><td></td></tr>
<tr><td></td><td></td><td>Width</td><td>Width</td><td>Size</td><td>(Inherited from Element)</td></tr>
</tbody></table>
<h2 class="- topic/sectiontitle h2">Methods</h2>
<div class="- topic/sectiondiv sectiondiv">
<p class="- topic/p p h3">Set something on the widget</p>
<dl><dt>BrowseName</dt><dd>SetThing</dd></dl>
<table class="- topic/table table"><caption>SetThingInputArguments</caption><thead><tr><th>Name</th><th>DataType</th><th>Description</th></tr></thead>
<tbody><tr><td>Value</td><td>String</td><td>the thing to set</td></tr></tbody></table>
</div>
<h2 class="- topic/sectiontitle h2">Events</h2>
<div class="- topic/sectiondiv sectiondiv">
<p class="- topic/p p h3">Mouse down event</p>
<dl><dt>BrowseName</dt><dd><a href="MouseDownEvent.html" title="event type">MouseDown event</a></dd></dl>
</div>
</div></body></html>`

/** An enum page, in the shape the generator parses. */
const ENUM_PAGE = `<!doctype html><html><body><div class="- topic/body">
<h1 class="- topic/title title topictitle1">Demo Mode</h1>
<dl><dt>BrowseName</dt><dd>DemoModeEnum</dd></dl>
<h2 class="- topic/sectiontitle h2">Values</h2>
<table class="- topic/table table"><thead><tr><th>Value</th><th>DisplayName</th><th>Description</th></tr></thead>
<tbody>
<tr><td>0</td><td>Off</td><td>nothing happens</td></tr>
<tr><td>1</td><td>On</td><td>something happens</td></tr>
</tbody></table>
</div></body></html>`

test('the generator reads a help page the way Studio writes one', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'optix-help-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const reference = join(root, 'Reference', 'FTOptix-Demo')
  mkdirSync(join(reference, 'ObjectTypes'), { recursive: true })
  mkdirSync(join(reference, 'DataTypes'), { recursive: true })
  writeFileSync(join(reference, 'ObjectTypes', 'DemoWidget.html'), OBJECT_PAGE)
  writeFileSync(join(reference, 'DataTypes', 'DemoModeEnum.html'), ENUM_PAGE)

  const pages = referencePages(root)
  assert.equal(pages.length, 2)
  const schema = buildSchema(root)

  const widget = schema.types.DemoWidget
  assert.ok(widget !== undefined, JSON.stringify(Object.keys(schema.types).slice(0, 5)))
  assert.equal(widget.namespace, 'FTOptix-Demo')
  assert.equal(widget.superType, 'Container')
  // `name` is the BrowseName and `display` the help's own label; the BrowseName is
  // what a property can be set by, so both are kept.
  const fill = widget.properties.find((property) => property.display === 'Fill')
  assert.ok(fill !== undefined, JSON.stringify(widget.properties))
  assert.equal(fill.name, 'FillColor2')
  assert.equal(fill.dataType, 'Color')
  assert.equal(widget.methods[0].name, 'SetThing')
  assert.deepEqual(widget.methods[0].args, [{ name: 'Value', dataType: 'String' }])
  assert.deepEqual(widget.events, [{ name: 'MouseDownEvent', display: 'MouseDown event' }])
  assert.deepEqual(schema.enums.DemoModeEnum.values, [
    { value: 0, name: 'Off' },
    { value: 1, name: 'On' },
  ])
  assert.equal(textOf('<p>a &amp; b</p>'), 'a & b')
})
