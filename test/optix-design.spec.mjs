import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

import { CONTRAST_MINIMUM, MIN_FONT_SIZE, TOUCH_MINIMUM, colour, contrastRatio, designFindings } from '../packages/optix/lib/design.js'

/**
 * The Optix half of the design checks `packages/ftview/src/design.ts` runs over a View export. Optix
 * has no export to read: the only surface is the model the bridge reports, where `GET /bridge/map`
 * gives names and types and `GET /bridge/nodes` is the only call that reports a property value. These
 * tests hold the rule behaviour against that shape, including what the checks refuse to claim when the
 * model did not report enough to decide.
 */

const plugin = readFileSync(new URL('../packages/optix/lib/index.js', import.meta.url), 'utf8')

/** One described node, in the shape `designFindings` reads. */
function node(name, type, properties = [], children = []) {
	return { path: `UI/Screens/Overview/${name}`, name, type, properties, children }
}

/** Geometry properties, spelled the way the bridge reports a `Size`. */
function box(left, top, width, height) {
	return [
		{ name: 'LeftMargin', value: `${left}.0` },
		{ name: 'TopMargin', value: `${top}.0` },
		{ name: 'Width', value: `${width}.0` },
		{ name: 'Height', value: `${height}.0` },
	]
}

const screen = { path: 'UI/Screens/Overview', name: 'Overview', type: 'Screen', properties: [], children: [] }

test('a colour is read in every spelling the model actually produces', () => {
	assert.equal(colour('#2A4191'), '#2a4191')
	assert.equal(colour('#abc'), '#aabbcc')
	assert.equal(colour('#ff2a4191'), '#2a4191')
	assert.equal(colour('White'), '#ffffff')
	// The bridge renders a Color through ToString(); that spelling has never been observed live, so the
	// shapes .NET produces are tolerated rather than guessed at.
	assert.equal(colour('rgb [R:42, G:65, B:145]'), '#2a4191')
	// Observed live on Studio 1.8.1 / bridge 1.0.9 (2026-11-14): a FillColor comes back as
	// "4279114276 (UInt32)", a packed 0xAARRGGBB. Before this spelling was read, every label reported
	// "no readable TextColor" and no contrast figure was ever measured.
	assert.equal(colour('4294967295 (UInt32)'), '#ffffff')
	assert.equal(colour('4279114276 (UInt32)'), '#0e1a24')
	assert.equal(colour('#2a419'), undefined)
	assert.equal(colour('not a colour'), undefined)
	assert.equal(colour(undefined), undefined)
})

test('contrast is the WCAG figure, and the minimum is the one the corpus page states', () => {
	assert.equal(contrastRatio('#ffffff', '#000000'), 21)
	assert.equal(contrastRatio('#2a4191', '#2a4191'), 1)
	assert.equal(CONTRAST_MINIMUM, 4.5)
	assert.equal(TOUCH_MINIMUM, 44)
	// The pair the View scaffold used to ship: white on its header band.
	assert.ok(contrastRatio('#ffffff', '#0088c8') < CONTRAST_MINIMUM)
})

test('HMI-TARGET-01: a control an operator presses has to be pressable', () => {
	const small = node('Nav1', 'Button', [...box(24, 700, 200, 30)])
	const fine = node('Nav2', 'Button', [...box(240, 700, 200, 44)])
	const blind = node('Switch1', 'Switch', [])
	const result = designFindings({ nodes: [small, fine, blind], screen, canvas: undefined, siblings: [] })
	const targets = result.findings.filter((finding) => finding.rule === 'HMI-TARGET-01')
	assert.deepEqual(targets.map((finding) => finding.rule), ['HMI-TARGET-01'])
	assert.deepEqual(targets[0].evidence, { path: small.path, type: 'Button', width: 200, height: 30 })
	assert.match(targets[0].message, /the target minimum is 44px/u)
	assert.ok(result.unchecked.some((entry) => /Switch Switch1: no geometry reported/u.test(entry)))
})

test('HMI-TARGET-02: an unlabelled control is reported, a missing property is not invented', () => {
	const blank = node('Nav1', 'Button', [...box(24, 700, 200, 60), { name: 'Text', value: '' }])
	const silent = node('Nav2', 'Button', box(240, 700, 200, 60))
	const labelled = node('Nav3', 'Button', [...box(456, 700, 200, 60), { name: 'Text', value: 'Alarms' }])
	const bound = node('Nav4', 'Button', [...box(672, 700, 200, 60), { name: 'Text', value: 'null' }])
	const result = designFindings({ nodes: [blank, silent, labelled, bound], screen, canvas: undefined, siblings: [] })
	const targets = result.findings.filter((finding) => finding.rule === 'HMI-TARGET-02')
	// A Text bound to a variable reports `null` until runtime: it is reported, because the button may
	// still be unlabelled in the only sense an operator can see.
	assert.deepEqual(targets.map((finding) => finding.evidence.path), [blank.path, bound.path])
	assert.equal(targets[0].severity, 'info')
	assert.ok(result.unchecked.some((entry) => /Button Nav2: no Text property reported/u.test(entry)))
})

test('HMI-CONTRAST-01 compares text with the fill it actually sits on', () => {
	const band = node('HeaderBar', 'Rectangle', [...box(0, 0, 1280, 88), { name: 'FillColor', value: '#0088C8' }])
	const title = node('Title', 'Label', [...box(24, 16, 600, 34), { name: 'TextColor', value: '#FFFFFF' }])
	const onSurface = node('CardTitle', 'Label', [
		...box(24, 200, 300, 22),
		{ name: 'TextColor', value: '#FFFFFF' },
	])
	const card = node('Card1', 'Rectangle', [...box(0, 150, 700, 300), { name: 'FillColor', value: '#13232F' }])
	const result = designFindings({ nodes: [band, card, title, onSurface], screen, canvas: undefined, siblings: [] })
	const contrast = result.findings.filter((finding) => finding.rule === 'HMI-CONTRAST-01')
	assert.deepEqual(contrast.map((finding) => finding.evidence.object ?? finding.evidence.path.split('/').pop()), ['Title'])
	assert.equal(contrast[0].evidence.background, '#0088c8')
	assert.equal(contrast[0].evidence.background_object, 'HeaderBar')
	assert.equal(contrast[0].evidence.ratio, 3.92)
	assert.match(contrast[0].message, /the minimum is 4.5:1/u)
})

test('the tightest fill wins, and a colour the model did not report is left unchecked', () => {
	const backdrop = node('Backdrop', 'Rectangle', [...box(0, 0, 1280, 800), { name: 'FillColor', value: '#0E1A24' }])
	const panel = node('Panel1', 'Rectangle', [...box(0, 0, 400, 200), { name: 'Color', value: '#FFFFFF' }])
	const label = node('Readout', 'Label', [...box(10, 10, 200, 30), { name: 'TextColor', value: '#0E1A24' }])
	const guess = node('Other', 'Label', [...box(500, 500, 200, 30)])
	const result = designFindings({ nodes: [backdrop, panel, label, guess], screen, canvas: undefined, siblings: [] })
	// #0E1A24 on #0E1A24 would be 1:1 against the backdrop; the panel is the smaller holder, so the
	// finding names the fill the text is really on — and here the pair passes, so nothing fires.
	assert.deepEqual(result.findings.filter((finding) => finding.rule === 'HMI-CONTRAST-01'), [])
	assert.ok(result.unchecked.some((entry) => /Label Other: no readable TextColor reported/u.test(entry)))
	assert.equal(label.name, 'Readout')
	assert.ok(result.described >= 4)
})

test('VIEW-NAV-01 and VIEW-NAV-02: a screen needs a way in and a way out', () => {
	const bare = designFindings({ nodes: [node('Readout', 'Label', box(10, 10, 200, 30))], screen, canvas: undefined, siblings: [] })
	assert.deepEqual(bare.findings.map((finding) => finding.rule), ['VIEW-NAV-01'])
	assert.equal(bare.findings[0].severity, 'info')

	const unwired = node('Nav1', 'Button', [...box(24, 700, 200, 60), { name: 'Text', value: 'Alarms' }])
	const out = designFindings({ nodes: [unwired], screen, canvas: undefined, siblings: [] })
	assert.deepEqual(out.findings.map((finding) => finding.rule), ['VIEW-NAV-02'])
	assert.equal(out.findings[0].severity, 'warning')
	assert.match(out.findings[0].message, /no way out through this screen/u)

	const wiredHandler = node('Nav2', 'Button', [...box(240, 700, 200, 60), { name: 'Text', value: 'Trends' }], [
		{ name: 'EventHandler', type: 'EventHandler' },
	])
	const wiredEvent = node('Nav3', 'Button', [...box(456, 700, 200, 60), { name: 'Text', value: 'Overview' }], [
		{ name: 'MouseClickEvent', type: 'MouseClickEvent' },
	])
	const wired = designFindings({ nodes: [unwired, wiredHandler, wiredEvent], screen, canvas: undefined, siblings: [] })
	assert.deepEqual(wired.findings.map((finding) => finding.rule), [])
})

test('navigation drawn in the shell counts for the screen inside it', () => {
	// The navigation bar sits beside the PanelLoader in the start window, so the screen below it has no
	// controls of its own and still has a way out. Measured live 2026-11-14: a bar inside a panel called
	// the design-time loader, so the shell is where the bar belongs.
	const bare = designFindings({ nodes: [node('Readout', 'Label', box(10, 10, 200, 30))], screen, canvas: undefined, siblings: [] })
	assert.deepEqual(bare.findings.map((finding) => finding.rule), ['VIEW-NAV-01'])
	const shell = { path: 'UI/MainWindow', controls: 2, wired: 2 }
	const withShell = designFindings({ nodes: [node('Readout', 'Label', box(10, 10, 200, 30))], screen, canvas: undefined, siblings: [], shell })
	assert.deepEqual(withShell.findings.map((finding) => finding.rule), [], 'a shell bar left the screen reported as unreachable')
	const unwiredShell = designFindings({ nodes: [node('Readout', 'Label', box(10, 10, 200, 30))], screen, canvas: undefined, siblings: [], shell: { path: 'UI/MainWindow', controls: 2, wired: 0 } })
	assert.deepEqual(unwiredShell.findings.map((finding) => finding.rule), ['VIEW-NAV-01'], 'an unwired shell bar must not read as navigation')
})

test('VIEW-LAYOUT-02 measures the screen against the canvas the project declares', () => {
	const own = { ...screen, properties: box(0, 0, 1024, 768) }
	const mismatch = designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, siblings: [] })
	const layout = mismatch.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.equal(layout.length, 1)
	assert.deepEqual(layout[0].evidence, {
		path: own.path,
		width: 1024,
		height: 768,
		canvas: '1280x800',
	})

	// A Screen type carries no geometry of its own; the full-bleed fill inside it is the next best
	// measurement, and the finding says where the number came from.
	const backdrop = node('Backdrop', 'Rectangle', [...box(0, 0, 1280, 720), { name: 'FillColor', value: '#0E1A24' }])
	const inferred = designFindings({ nodes: [backdrop], screen, canvas: { width: 1280, height: 800 }, siblings: [] })
	const inferredLayout = inferred.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.equal(inferredLayout.length, 1)
	assert.equal(inferredLayout[0].evidence.measured_from, 'the largest fill inside the screen')

	const matching = designFindings({ nodes: [node('Backdrop', 'Rectangle', [...box(0, 0, 1280, 800), { name: 'FillColor', value: '#0E1A24' }])], screen, canvas: { width: 1280, height: 800 }, siblings: [] })
	assert.deepEqual(matching.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02'), [])

	const blind = designFindings({ nodes: [], screen, canvas: undefined, siblings: [] })
	assert.ok(blind.unchecked.some((entry) => /no window canvas reported/u.test(entry)))
	assert.ok(blind.unchecked.some((entry) => /the screen node itself was not described/u.test(entry)))
})

test('a NavigationPanel wires its screens through NodePointers, and that counts as navigation', () => {
	// The rebuilt SMT demo navigates through a `NavigationPanel` rail: its items carry a `Panel` NodePointer
	// and no EventHandler at all. Counting only handlers reported an application whose rail mounted all three
	// screens as having no navigation (measured live 2026-11-17).
	const readout = () => node('Readout', 'Label', box(10, 10, 200, 30))
	const rail = { path: 'UI/MainWindow', controls: 0, wired: 0, navigation_panels: 1 }
	const withRail = designFindings({ nodes: [readout()], screen, canvas: undefined, siblings: [], shell: rail })
	assert.deepEqual(withRail.findings.map((finding) => finding.rule), [], 'a NodePointer-wired rail left the screen reported as unreachable')
	const noRail = designFindings({ nodes: [readout()], screen, canvas: undefined, siblings: [], shell: { path: 'UI/MainWindow', controls: 0, wired: 0, navigation_panels: 0 } })
	assert.deepEqual(noRail.findings.map((finding) => finding.rule), ['VIEW-NAV-01'], 'a window with neither wired buttons nor a NavigationPanel must still read as having no way out')
})

test('HMI-CONTRAST-01 judges layout-placed text against the fill of its container', () => {
	// Text placed by a layout reports no LeftMargin/Width/Height of its own: on the rebuilt SMT screens 20 of
	// 42 described objects were labels and the rule ran on none of them. A card is a Rectangle, its Body is a
	// ColumnLayout, and the value readout sits inside that, so the card's fill is what the text competes with.
	const card = {
		path: 'UI/Screens/Overview/Card1',
		name: 'Card1',
		type: 'Rectangle',
		properties: [...box(24, 112, 506, 266), { name: 'FillColor', value: '#13232F' }],
		children: [{ name: 'Body', type: 'ColumnLayout' }],
	}
	const body = { path: 'UI/Screens/Overview/Card1/Body', name: 'Body', type: 'ColumnLayout', properties: [], children: [{ name: 'Value', type: 'Label' }] }
	const value = { path: 'UI/Screens/Overview/Card1/Body/Value', name: 'Value', type: 'Label', properties: [{ name: 'TextColor', value: '#6B7C88' }], children: [] }
	const result = designFindings({ nodes: [card, body, value], screen, canvas: undefined, siblings: [] })
	const contrast = result.findings.filter((finding) => finding.rule === 'HMI-CONTRAST-01')
	assert.equal(contrast.length, 1, 'text with no geometry of its own was left unchecked')
	assert.equal(contrast[0].evidence.background_object, 'Card1')
	assert.equal(contrast[0].evidence.measured_from, 'the fill on its container')
	assert.ok(contrast[0].evidence.ratio < CONTRAST_MINIMUM)

	// A label with no fill anywhere above it is still not invented: the gap is reported.
	const loose = { path: 'UI/Screens/Overview/Orphan/Body/Value', name: 'Value', type: 'Label', properties: [{ name: 'TextColor', value: '#6B7C88' }], children: [] }
	const orphan = designFindings({ nodes: [loose], screen, canvas: undefined, siblings: [] })
	assert.ok(orphan.unchecked.some((entry) => /no geometry reported and no container fill to compare against/u.test(entry)))

	// A header label sits in a layout that carries no colour, so what it actually competes with is the screen's
	// own backdrop. That is a different claim from the card comparison, and the evidence says which one it is.
	const backdrop = node('Backdrop', 'Rectangle', [...box(0, 0, 1060, 706), { name: 'FillColor', value: '#0E1A24' }])
	const header = { path: 'UI/Screens/Overview/Layout/Header/Title', name: 'Title', type: 'Label', properties: [{ name: 'TextColor', value: '#6B7C88' }], children: [] }
	const onBackdrop = designFindings({ nodes: [backdrop, header], screen, canvas: undefined, siblings: [] })
	const back = onBackdrop.findings.filter((finding) => finding.rule === 'HMI-CONTRAST-01')
	assert.equal(back.length, 1)
	assert.equal(back[0].evidence.background_object, 'Backdrop')
	assert.equal(back[0].evidence.measured_from, 'the largest fill in the screen')
})

test('VIEW-TYPE-02: text below the readable floor is reported, and a size the model did not report is not invented', () => {
	// The offline rubric has held the 11 px floor since the View side; the live check can run it because
	// FontSize is reported on a Label whether or not the label has geometry.
	const small = node('Fine', 'Label', [...box(10, 10, 200, 20), { name: 'TextColor', value: '#ffffff' }, { name: 'FontSize', value: '9.0' }])
	const legible = node('Readout', 'Label', [...box(10, 40, 200, 30), { name: 'TextColor', value: '#ffffff' }, { name: 'FontSize', value: '28.0' }])
	const unstated = node('Styled', 'Label', [...box(10, 80, 200, 30), { name: 'TextColor', value: '#ffffff' }])
	const result = designFindings({ nodes: [small, legible, unstated], screen, canvas: undefined, siblings: [] })
	const type = result.findings.filter((finding) => finding.rule === 'VIEW-TYPE-02')
	assert.equal(type.length, 1)
	assert.deepEqual(type[0].evidence, { path: small.path, type: 'Label', font_size: 9, minimum: MIN_FONT_SIZE })
	assert.ok(result.unchecked.some((entry) => /1 text object\(s\) report no FontSize \(Styled\)/u.test(entry)), 'a label whose size a style sheet may decide was not reported as unchecked')
	assert.equal(MIN_FONT_SIZE, 11)
})

test('VIEW-LAYOUT-02 compares with the box the mounting panel gives the screen, not with the window', () => {
	// The demo's screens are 1060×706 on purpose: the window is 1280×800 and its rail takes a 220 px tab
	// strip. Compared with the window, three deliberately-sized screens read as a layout defect.
	const own = { ...screen, properties: box(0, 0, 1060, 706) }
	const host = { path: 'UI/MainWindow/ShellRail', width: 1060, height: 736 }
	const againstHost = designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, host, siblings: [] })
	const layout = againstHost.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.equal(layout.length, 1)
	assert.deepEqual(layout[0].evidence, {
		path: own.path,
		width: 1060,
		height: 706,
		canvas: '1060x736',
		host: host.path,
	})
	assert.ok(/ShellRail gives it 1060×736/u.test(layout[0].message))

	const exact = { ...screen, properties: box(0, 0, 1060, 736) }
	assert.deepEqual(designFindings({ nodes: [exact], screen: exact, canvas: { width: 1280, height: 800 }, host, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02'), [])

	// With no host resolved the window is still the only figure available, and the evidence stays exactly the
	// shape it had before the host existed.
	const windowOnly = designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, siblings: [] })
	const windowLayout = windowOnly.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.deepEqual(windowLayout[0].evidence, { path: own.path, width: 1060, height: 706, canvas: '1280x800' })
	assert.ok(!('host' in windowLayout[0].evidence))
})

test('OPTIX-UI-01: the same hand-built children on two screens is a type with instances', () => {
	const shape = [
		{ name: 'Backdrop', type: 'Rectangle' },
		{ name: 'HeaderBar', type: 'Rectangle' },
		{ name: 'Title', type: 'Label' },
	]
	const result = designFindings({
		nodes: [],
		screen,
		canvas: undefined,
		siblings: [
			{ name: 'PumpA', children: shape },
			{ name: 'PumpB', children: shape },
			{ name: 'PumpC', children: [...shape, { name: 'Extra', type: 'Label' }] },
			{ name: 'Tiny', children: [{ name: 'One', type: 'Label' }] },
		],
	})
	const reuse = result.findings.filter((finding) => finding.rule === 'OPTIX-UI-01')
	assert.equal(reuse.length, 1)
	assert.deepEqual(reuse[0].evidence.screens, ['PumpA', 'PumpB'])
	assert.equal(reuse[0].evidence.children, 3)
	assert.match(reuse[0].message, /model that composition once as a type and instantiate it/u)
})

test('OPTIX-UI-02: behaviour living inside a composition is reported', () => {
	const logic = node('Logic1', 'NetLogic', [])
	const task = node('Poll', 'LongRunningTask', [])
	const result = designFindings({ nodes: [logic, task], screen, canvas: undefined, siblings: [] })
	const behaviour = result.findings.filter((finding) => finding.rule === 'OPTIX-UI-02')
	assert.deepEqual(behaviour.map((finding) => finding.evidence.type), ['NetLogic', 'LongRunningTask'])
	assert.match(behaviour[0].message, /move the behaviour to the object it belongs to/u)
})

test('the tool reads the model through the two calls that report it, and writes nothing', () => {
	assert.match(plugin, /name: "optix_design_check"/u)
	// GET /bridge/map gives names and types; only GET /bridge/nodes reports a property value, so the
	// tool walks the tree and describes each object, capped so a huge screen cannot blow the context.
	assert.match(plugin, /max_nodes/u)
	const block = plugin.slice(plugin.indexOf('name: "optix_design_check"'))
	assert.ok(block.length > 0)
	// The block ends where the next tool starts: optix_production_check legitimately writes when
	// asked to repair, and this assertion is only about the design check.
	const end = block.indexOf('name: "optix_production_check"')
	const designTool = block.slice(0, end === -1 ? block.indexOf('//#endregion') : end)
	assert.match(designTool, /"map"/u)
	assert.match(designTool, /"nodes"/u)
	assert.doesNotMatch(designTool, /allowWrite/u)
	assert.match(designTool, /optix_preview/u)
	assert.match(designTool, /optix_screenshot/u)
})

// --- The four rules added with the design-hardening batch. Each one is held to
// the same bar: it fires on the planted defect and stays silent on the screen a
// careful engineer draws.

/** A screen with geometry, so a child can be judged against its parent's box. */
function canvasScreen() {
	return { path: 'UI/Screens/Overview', name: 'Overview', type: 'Screen', properties: box(0, 0, 1920, 1080), children: [] }
}

test('OPTIX-IMG-01: an Advanced SVG image with nothing to animate is reported', () => {
	const result = designFindings({
		nodes: [],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		images: [{ path: 'UI/Screens/Overview/Pump', name: 'Pump', elements: 0 }],
	})
	const found = result.findings.filter((finding) => finding.rule === 'OPTIX-IMG-01')
	assert.equal(found.length, 1)
	assert.equal(found[0].severity, 'info')
	assert.equal(found[0].evidence.path, 'UI/Screens/Overview/Pump')
	// Bound to at least one element property it has something to drive: silent.
	const bound = designFindings({
		nodes: [],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		images: [{ path: 'UI/Screens/Overview/Pump', name: 'Pump', elements: 2 }],
	})
	assert.equal(bound.findings.filter((finding) => finding.rule === 'OPTIX-IMG-01').length, 0)
})

test('OPTIX-STYLE-01: a literal colour outside the palette is reported, a palette one is not', () => {
	const themed = node('Start', 'Button', [{ name: 'BackgroundColor', value: '#123456' }])
	const house = node('Stop', 'Button', [{ name: 'BackgroundColor', value: '#143243' }])
	const result = designFindings({
		nodes: [themed, house],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		styled: ['Button'],
		palette: ['#0E1A24', '#143243', '#FFFFFF'],
	})
	const found = result.findings.filter((finding) => finding.rule === 'OPTIX-STYLE-01')
	assert.equal(found.length, 1)
	assert.equal(found[0].evidence.path, 'UI/Screens/Overview/Start')
	assert.deepEqual(found[0].evidence.literals, { BackgroundColor: '#123456' })
	assert.equal(found[0].evidence.style_collection, 'ButtonStyle')
	// A type the sheet does not style is nobody's business: silent.
	const unstyled = designFindings({
		nodes: [themed],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		styled: ['Label'],
		palette: ['#143243'],
	})
	assert.equal(unstyled.findings.filter((finding) => finding.rule === 'OPTIX-STYLE-01').length, 0)
})

test('OPTIX-LAYOUT-01: a child drawn outside its parent is a warning, a label over a fill is not', () => {
	const screenNode = canvasScreen()
	const card = { ...node('Card', 'Panel', box(40, 120, 600, 400)), path: 'UI/Screens/Overview/Card' }
	// Geometry is absolute on the canvas, so a child inside the card starts inside
	// the card's own 40,120 600×400 box.
	const inside = { ...node('Value', 'Label', box(60, 140, 200, 40)), path: 'UI/Screens/Overview/Card/Value' }
	const outside = { ...node('Badge', 'Label', box(620, 140, 200, 40)), path: 'UI/Screens/Overview/Card/Badge' }
	const result = designFindings({
		nodes: [card, inside, outside],
		screen: screenNode,
		canvas: { width: 1920, height: 1080 },
		siblings: [],
	})
	const found = result.findings.filter((finding) => finding.rule === 'OPTIX-LAYOUT-01')
	assert.equal(found.length, 1)
	assert.equal(found[0].severity, 'warning')
	assert.equal(found[0].evidence.path, 'UI/Screens/Overview/Card/Badge')
	assert.equal(found[0].evidence.parent, 'UI/Screens/Overview/Card')
	// Overlap between siblings is how text goes on a fill, so nothing is reported.
	assert.equal(result.findings.filter((finding) => finding.rule === 'OPTIX-LAYOUT-01').length, 1)
})

test('OPTIX-DATA-01: a number shown without its unit is reported, a formatted one is not', () => {
	const bare = node('Speed', 'Label', [{ name: 'Text', value: '/Objects/LineHMI/Model/Line1/Cutter/BeltSpeed' }])
	const formatted = node('Speed2', 'Label', [
		{ name: 'Text', value: '/Objects/LineHMI/Model/Line1/Cutter/BeltSpeed' },
		{ name: 'Formatter', value: 'F1 m/min' },
	])
	const result = designFindings({
		nodes: [bare, formatted],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		units: { 'Model/Line1/Cutter/BeltSpeed': 'm/min' },
	})
	const found = result.findings.filter((finding) => finding.rule === 'OPTIX-DATA-01')
	assert.equal(found.length, 1)
	assert.equal(found[0].evidence.path, 'UI/Screens/Overview/Speed')
	assert.equal(found[0].evidence.target, 'Model/Line1/Cutter/BeltSpeed')
	assert.equal(found[0].evidence.units, 'm/min')
	assert.match(found[0].message, /m\/min/u)
	// With no unit recorded in the model there is nothing to miss: silent.
	const noUnits = designFindings({
		nodes: [bare],
		screen: canvasScreen(),
		canvas: { width: 1920, height: 1080 },
		siblings: [],
		units: {},
	})
	assert.equal(noUnits.findings.filter((finding) => finding.rule === 'OPTIX-DATA-01').length, 0)
})
