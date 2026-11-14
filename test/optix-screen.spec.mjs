import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { CONTRAST_MINIMUM, TOUCH_MINIMUM, contrastRatio, designFindings } from '../packages/optix/lib/design.js'
import { MAX_CARDS, MAX_NAV, SCREEN_THEME, screenOps } from '../packages/optix/lib/screens.js'

/**
 * The draft-screen half of the Optix lane. `packages/ftview/src/edit` already lays out a PanelView
 * display from a description; this is the same grammar aimed at Optix, where there is no display file
 * to write and the only way in is an operation batch the bridge serves.
 *
 * The test that matters is the round trip: the layout this module emits is fed through the design
 * checks the same lane reports, so a scaffold that trips its own rule fails here instead of shipping.
 */

const plugin = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')
const manifest = JSON.parse(readFileSync(new URL('../components.json', import.meta.url), 'utf8'))

/** The screen the lane is meant to produce: two cards with a mix of readouts and lamps, three buttons. */
const canonical = {
	name: 'AlarmSummary',
	width: 1280,
	height: 800,
	title: 'Alarm Summary',
	subtitle: 'Unit 3',
	cards: [
		{
			title: 'Unit 3 status',
			rows: [
				{ label: 'Active alarms', kind: 'value', tag: 'Model/Alarms/ActiveCount' },
				{ label: 'Pump A running', kind: 'lamp', tag: 'Model/Pumps/A/Running' },
				{ label: 'Setpoint', kind: 'value', tag: 'Model/Pumps/A/Setpoint' },
			],
		},
		{
			title: 'Line 2',
			rows: [
				{ label: 'Flow', kind: 'value', tag: 'Model/Line2/Flow' },
				{ label: 'Valve open', kind: 'lamp', tag: 'Model/Line2/Valve' },
			],
		},
	],
	nav: [
		{ label: 'Overview', target: 'UI/Screens/Overview' },
		{ label: 'Alarms', target: 'UI/Screens/Alarms' },
		{ label: 'Trends', target: 'UI/Screens/Trends' },
	],
}

/**
 * Turn an operation batch into the nodes `GET /bridge/nodes` would report, so the design checks can be
 * run offline. Only the shapes the bridge really produces are simulated: a create makes a node, a
 * `set_property` makes a property, a `wire_event` makes an EventHandler child.
 */
function described(ops) {
	const nodes = new Map()
	for (const op of ops) {
		if (op.op === 'create_widget') {
			const path = `${op.screen}/${op.name}`
			nodes.set(path, { path, name: op.name, type: op.widget_type, properties: [], children: [] })
			continue
		}
		const node = nodes.get(op.path)
		if (node === undefined) continue
		if (op.op === 'set_property') node.properties.push({ name: op.name, value: op.value })
		else if (op.op === 'bind') node.properties.push({ name: op.name, value: '' })
		else if (op.op === 'attach_expression') node.properties.push({ name: op.prop_name, value: op.expression })
		else if (op.op === 'wire_event') node.children.push({ name: 'EventHandler', type: 'EventHandler' })
	}
	return [...nodes.values()]
}

test('the layout is one batch a parent-before-child order the bridge validator needs', () => {
	const layout = screenOps(canonical)
	const created = new Set()
	for (const op of layout.ops) {
		if (op.op !== 'create_widget') continue
		assert.ok(
			op.screen === 'UI/Screens' || created.has(op.screen),
			`${op.name} is created under ${op.screen}, which nothing earlier in the batch creates`,
		)
		created.add(`${op.screen}/${op.name}`)
	}
	assert.equal(layout.ops[0].op, 'create_widget')
	assert.equal(layout.ops[0].widget_type, 'Screen')
	assert.equal(layout.ops[0].screen, 'UI/Screens')
	assert.equal(layout.path, 'UI/Screens/AlarmSummary')
	assert.equal(created.size, layout.objects.length)
	// The whole screen has to fit one call: the bridge only resolves a parent it created in the same
	// batch, so a chunked draft would report unresolved_parent for every child.
	assert.ok(layout.op_count > 40, 'a real screen is far past the ordinary batch ceiling')
	assert.ok(layout.op_count < 240, 'the ceiling the tool refuses at has to stay above a usable screen')
})

test('a screen that cannot fit the display is refused with the reason, not a squeezed layout', () => {
	const refusals = [
		[{ name: 'Tiny', width: 180, height: 800 }, /too small for a scaffold/u],
		[{ name: 'Short', width: 1280, height: 160 }, /leaves no room for content below the header and footer/u],
		[{ ...canonical, cards: Array.from({ length: MAX_CARDS + 1 }, (_unused, index) => ({ title: `Card ${index}`, rows: [] })) }, /cards exceed the 4 this layout holds/u],
		[{ ...canonical, nav: Array.from({ length: MAX_NAV + 1 }, (_unused, index) => ({ label: `Nav ${index}`, target: 'UI/Screens/Overview' })) }, /navigation buttons exceed the 4/u],
		[{ name: 'Empty', width: 1280, height: 800 }, /describe at least one card or one navigation button/u],
		[{ ...canonical, width: 420, height: 320 }, /leaves no room for 2 card\(s\) at a readable size/u],
		[{ ...canonical, cards: [{ title: 'Crowded', rows: Array.from({ length: 20 }, (_unused, index) => ({ label: `Row ${index}`, kind: 'value' })) }] }, /has more rows than fit: 20/u],
	]
	for (const [spec, expected] of refusals) {
		assert.throws(() => screenOps(spec), expected)
	}
})

test('the scaffold passes the checks it is measured by', () => {
	const withWiring = { ...canonical, panel_loader: 'UI/MainWindow/DynamicPanelLoader' }
	const layout = screenOps(withWiring)
	const screen = { path: layout.path, name: layout.name, type: 'Screen', properties: [], children: [] }
	const result = designFindings({
		nodes: described(layout.ops),
		screen,
		canvas: { width: layout.width, height: layout.height },
		siblings: [],
	})
	assert.deepEqual(result.findings, [], `the draft this lane produces trips its own rules: ${JSON.stringify(result.findings)}`)
	assert.equal(result.described, layout.objects.length)
})

test('the header band is dark enough for the text the scaffold puts on it', () => {
	// The View scaffold's band is #0088C8. White title text on it measures 3.92:1 and the subtitle's
	// #CFE0EA measures 2.89:1, both under the minimum, so the Optix port carries a darker band: the
	// Optix check can see the fill behind the text and the View check cannot.
	assert.ok(
		contrastRatio(SCREEN_THEME.title, SCREEN_THEME.header) >= CONTRAST_MINIMUM,
		`title ${SCREEN_THEME.title} on header ${SCREEN_THEME.header} is ${contrastRatio(SCREEN_THEME.title, SCREEN_THEME.header).toFixed(2)}:1`,
	)
	assert.ok(
		contrastRatio(SCREEN_THEME.footerText, SCREEN_THEME.header) >= CONTRAST_MINIMUM,
		`subtitle ${SCREEN_THEME.footerText} on header ${SCREEN_THEME.header} is ${contrastRatio(SCREEN_THEME.footerText, SCREEN_THEME.header).toFixed(2)}:1`,
	)
	for (const [name, fore, back] of [
		['footer line', SCREEN_THEME.footerText, SCREEN_THEME.footer],
		['card label', SCREEN_THEME.footerText, SCREEN_THEME.surface],
		['card title', SCREEN_THEME.title, SCREEN_THEME.surface],
		['readout', SCREEN_THEME.valueFore, SCREEN_THEME.surface],
	]) {
		assert.ok(contrastRatio(fore, back) >= CONTRAST_MINIMUM, `${name} ${fore} on ${back} is ${contrastRatio(fore, back).toFixed(2)}:1`)
	}
})

test('the navigation row is pressable by the same figure the check reports', () => {
	const layout = screenOps(canonical)
	assert.ok(layout.slots.nav !== undefined)
	const buttons = layout.ops.filter((op) => op.op === 'create_widget' && op.widget_type === 'Button')
	assert.equal(buttons.length, canonical.nav.length)
	const heights = layout.ops
		.filter((op) => op.op === 'set_property' && /\/Nav\d+$/u.test(op.path) && op.name === 'Height')
		.map((op) => Number.parseFloat(op.value))
	assert.equal(heights.length, canonical.nav.length)
	for (const height of heights) assert.ok(height >= TOUCH_MINIMUM, `nav button is ${height} px tall, under ${TOUCH_MINIMUM}`)
})

test('navigation is only wired when the model supplied the loader, and says so when it did not', () => {
	const unwired = screenOps(canonical)
	assert.equal(unwired.ops.some((op) => op.op === 'wire_event'), false)
	assert.equal(unwired.pendingWiring.length, canonical.nav.length)
	for (const entry of unwired.pendingWiring) {
		// ChangePanel is a PanelLoader method and a UI object is instantiated per session, so the loader
		// path has to come from the live model rather than from a guess at the Window's children.
		assert.match(entry.shape.method_path, /<PanelLoader path>\/ChangePanel/u)
		assert.equal(entry.shape.event_type, 'MouseClickEvent')
		// ChangePanel's optional AliasNode still has to be present as a Null argument.
		assert.equal(entry.shape.args, `NewPanel=${entry.target};AliasNode=`)
	}
	const wired = screenOps({ ...canonical, panel_loader: 'UI/MainWindow/DynamicPanelLoader' })
	assert.equal(wired.pendingWiring.length, 0)
	const events = wired.ops.filter((op) => op.op === 'wire_event')
	assert.equal(events.length, canonical.nav.length)
	for (const op of events) assert.equal(op.method_path, 'UI/MainWindow/DynamicPanelLoader/ChangePanel')
})

test('a screen with buttons nothing leaves from is reported, not quietly passed', () => {
	const layout = screenOps(canonical)
	const screen = { path: layout.path, name: layout.name, type: 'Screen', properties: [], children: [] }
	const result = designFindings({
		nodes: described(layout.ops),
		screen,
		canvas: { width: layout.width, height: layout.height },
		siblings: [],
	})
	assert.deepEqual(result.findings.map((finding) => finding.rule), ['VIEW-NAV-02'])
	assert.match(result.findings[0].message, /none carries an event handler/u)
})

test('the readout is a bound label and the lamp is an expression, because Optix has no numericDisplay or indicator', () => {
	const layout = screenOps(canonical)
	const binds = layout.ops.filter((op) => op.op === 'bind')
	assert.equal(binds.length, 3)
	for (const op of binds) {
		assert.equal(op.name, 'Text')
		assert.match(op.source_path, /^Model\//u)
	}
	assert.equal(layout.expressions.length, 2)
	for (const entry of layout.expressions) {
		assert.equal(entry.prop_name, 'FillColor')
		assert.match(entry.expression, /^IIF\(\{0\} > 0, "#30A46C", "#E5484D"\)$/u)
		assert.match(entry.sources, /^Model\//u)
	}
	// The invented part of the port has to be the part the tool validates before it applies anything.
	assert.match(plugin, /expr\/validate/u)
	assert.match(plugin, /rejected_expressions/u)
})

test('the tool is mounted, allowed by the skill it teaches, and validates before it writes', () => {
	assert.match(plugin, /name: "optix_screen"/u)
	assert.match(plugin, /maxScreenOps/u)
	// Draft by default: the batch is validated and reported, and only dry_run:false writes.
	assert.match(plugin, /dry_run/u)
	assert.match(plugin, /allowWrite\(isDestructive\(layout\.ops\)\)/u)
	const optix = manifest.components.find((component) => component.id === 'optix')
	assert.ok(optix !== undefined)
	assert.ok(optix.skill.allow.includes('optix_screen'), 'the skill does not allow the tool it is meant to teach')
	assert.ok(optix.tools.count >= 16, `the manifest count has to include optix_screen: ${optix.tools.count}`)
})
