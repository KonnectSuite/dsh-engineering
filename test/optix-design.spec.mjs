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
	// strip. Compared with the window, three deliberately-sized screens read as a layout defect. The host box
	// is the mounter's DECLARED box, measured live 2026-11-17: the starter's own rail (TopMargin 64, Height
	// 706) handed the screen a rendered 1060×706, and a rail drifted to Height 800 handed it 1060×800. The
	// runtime clips what hangs off the window instead of shrinking the box, so the declared figure is the only
	// honest one, and `optix_design_check` names the overhang in its notes rather than clamping it away.
	const own = { ...screen, properties: box(0, 0, 1060, 706) }
	const host = { path: 'UI/MainWindow/ShellRail', width: 1060, height: 706 }
	assert.deepEqual(designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, host, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02'), [], 'a screen sized to its panel was reported as a mismatch with the window')

	const drifted = { ...host, height: 800 }
	const layout = designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, host: drifted, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.equal(layout.length, 1)
	assert.deepEqual(layout[0].evidence, {
		path: own.path,
		width: 1060,
		height: 706,
		canvas: '1060x800',
		host: drifted.path,
	})
	assert.ok(/ShellRail gives it 1060×800/u.test(layout[0].message))

	// With no host resolved the window is still the only figure available, and the evidence stays exactly the
	// shape it had before the host existed.
	const windowOnly = designFindings({ nodes: [own], screen: own, canvas: { width: 1280, height: 800 }, siblings: [] })
	const windowLayout = windowOnly.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-02')
	assert.deepEqual(windowLayout[0].evidence, { path: own.path, width: 1060, height: 706, canvas: '1280x800' })
	assert.ok(!('host' in windowLayout[0].evidence))
})

test('VIEW-LAYOUT-03: a fixed child eats the track its fill sibling needed', () => {
	// Measured live 2026-11-17 on a probe screen: a ScaleLayout designed 800×500 stretched into a 1060×800 host
	// (x 1.325, y 1.6) held a RowLayout whose children were a Rectangle declared 900 wide and a sibling at
	// Width -1 across a 20 px gap. The fixed child rendered 1192.5 px and the fill sibling rendered at w=0 at
	// x=1433 - a layout neither shrinks nor clips a child. The check has to catch it in the space the numbers
	// are written in (900 + 20 against an 800 px design track) and report the rendered overflow as well.
	const canvas = {
		path: 'UI/Screens/Probe/Canvas', name: 'Canvas', type: 'ScaleLayout',
		properties: [...box(0, 0, 1060, 800), { name: 'OriginalWidth', value: '800.0' }, { name: 'OriginalHeight', value: '500.0' }, { name: 'FillMode', value: '1 (FillModeEnum)' }],
		children: [{ name: 'Content', type: 'ColumnLayout' }],
	}
	const content = { path: `${canvas.path}/Content`, name: 'Content', type: 'ColumnLayout', properties: box(0, 0, -1, -1), children: [{ name: 'Row1', type: 'RowLayout' }] }
	const row = { path: `${content.path}/Row1`, name: 'Row1', type: 'RowLayout', properties: [...box(0, 0, -1, -1), { name: 'HorizontalGap', value: '20.0' }], children: [{ name: 'Wide', type: 'Rectangle' }, { name: 'Narrow', type: 'Rectangle' }] }
	const wide = { path: `${row.path}/Wide`, name: 'Wide', type: 'Rectangle', properties: box(0, 0, 900, 60), children: [] }
	const narrow = { path: `${row.path}/Narrow`, name: 'Narrow', type: 'Rectangle', properties: box(920, 0, -1, 60), children: [] }
	const probeScreen = { ...screen, properties: box(0, 0, 1060, 800) }
	const run = (nodes) => designFindings({ nodes, screen: probeScreen, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-03')

	const starved = run([canvas, content, row, wide, narrow])
	assert.equal(starved.length, 1, 'a 900 px child in an 800 px design track left its -1 sibling unreported')
	assert.deepEqual(starved[0].evidence, {
		path: row.path,
		type: 'RowLayout',
		track: 800,
		track_from: 'Canvas design box',
		axis: 'Width',
		fixed: ['Wide: 900'],
		gap: 20,
		used: 920,
		fill_siblings: ['Narrow'],
		scaled_by: 1.325,
		rendered: 1213,
		past_the_box: 153,
	})
	assert.ok(/render at zero/u.test(starved[0].message))

	// Room left over is not a finding, and children that fill the track exactly are not either: the gap counts,
	// and a layout with no -1 child is short only when its sizes add up to more than the track.
	assert.deepEqual(run([canvas, content, row, { ...wide, properties: box(0, 0, 700, 60) }, narrow]), [])
	const exactPair = { ...narrow, properties: box(700, 0, 100, 60) }
	assert.deepEqual(run([canvas, content, row, { ...wide, properties: box(0, 0, 680, 60) }, exactPair]), [], 'children that fill the track exactly were reported as overflow')
	const overflow = run([canvas, content, row, { ...wide, properties: box(0, 0, 780, 60) }, exactPair])
	assert.equal(overflow.length, 1)
	assert.ok(/drawn past it rather than shrunk/u.test(overflow[0].message))
	assert.equal(overflow[0].evidence.used, 900)
	assert.equal(overflow[0].evidence.past_the_box, 126)
	assert.equal(overflow[0].evidence.scaled_by, 1.325)
	assert.ok(!('fill_siblings' in overflow[0].evidence), 'a row with no -1 child has no sibling left without room')

	// The vertical axis resolves its track from the nearest ancestor that names a height, with no ScaleLayout
	// in the way, and reports the shortfall without a factor.
	const hostScreen = { ...screen, properties: box(0, 0, 1060, 706) }
	const stack = { path: 'UI/Screens/Overview/Stack', name: 'Stack', type: 'ColumnLayout', properties: [...box(0, 0, -1, -1), { name: 'VerticalGap', value: '20.0' }], children: [{ name: 'Header', type: 'Rectangle' }, { name: 'Body', type: 'Rectangle' }] }
	const header = { path: `${stack.path}/Header`, name: 'Header', type: 'Rectangle', properties: box(0, 0, 1060, 700), children: [] }
	const body = { path: `${stack.path}/Body`, name: 'Body', type: 'Rectangle', properties: box(0, 720, 1060, -1), children: [] }
	const vertical = designFindings({ nodes: [hostScreen, stack, header, body], screen: hostScreen, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-03')
	assert.equal(vertical.length, 1)
	assert.deepEqual(vertical[0].evidence, {
		path: stack.path,
		type: 'ColumnLayout',
		track: 706,
		axis: 'Height',
		fixed: ['Header: 700'],
		gap: 20,
		used: 720,
		fill_siblings: ['Body'],
		past_the_box: 14,
	})
})

test('VIEW-LAYOUT-03: a child whose alignment is Stretch competes for the leftover whatever size it names', () => {
	// Measured 2026-11-17 on UI/Screens/AlarmSummary/Canvas/Layout/Content/Row3, one variable at a time: Height
	// 300 + VerticalAlignment 3 rendered 158 (the leftover fill) and Width 500 + HorizontalAlignment 3 rendered
	// 1012. So a stretched child spends no part of the track, and counting its number as a fixed size invents a
	// starvation the runtime never causes.
	const canvas = {
		path: 'UI/Screens/Probe/Canvas', name: 'Canvas', type: 'ScaleLayout',
		properties: [...box(0, 0, 1060, 800), { name: 'OriginalWidth', value: '800.0' }, { name: 'OriginalHeight', value: '500.0' }, { name: 'FillMode', value: '1 (FillModeEnum)' }],
		children: [{ name: 'Content', type: 'ColumnLayout' }],
	}
	const content = { path: `${canvas.path}/Content`, name: 'Content', type: 'ColumnLayout', properties: box(0, 0, -1, -1), children: [{ name: 'Row1', type: 'RowLayout' }] }
	const row = { path: `${content.path}/Row1`, name: 'Row1', type: 'RowLayout', properties: [...box(0, 0, -1, -1), { name: 'HorizontalGap', value: '20.0' }], children: [{ name: 'Wide', type: 'Rectangle' }, { name: 'Stretch', type: 'Rectangle' }] }
	const wide = { path: `${row.path}/Wide`, name: 'Wide', type: 'Rectangle', properties: box(0, 0, 700, 60), children: [] }
	const stretched = { path: `${row.path}/Stretch`, name: 'Stretch', type: 'Rectangle', properties: [...box(720, 0, 300, 60), { name: 'HorizontalAlignment', value: '3 (Int32)' }], children: [] }
	const probeScreen = { ...screen, properties: box(0, 0, 1060, 800) }
	const run = (nodes) => designFindings({ nodes, screen: probeScreen, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-03')

	// 700 + 20 leaves 80 px of the 800 px design track for the stretched child: no finding. Read as a fixed
	// 300 it would be 1020 against 800, which is the false positive this classification exists to stop.
	assert.deepEqual(run([canvas, content, row, wide, stretched]), [])

	// With the fixed child at 790 the leftover is gone, and the stretched sibling is named by the number it
	// wrote that the runtime threw away.
	const starved = run([canvas, content, row, { ...wide, properties: box(0, 0, 790, 60) }, stretched])
	assert.equal(starved.length, 1)
	assert.deepEqual(starved[0].evidence, {
		path: row.path,
		type: 'RowLayout',
		track: 800,
		track_from: 'Canvas design box',
		axis: 'Width',
		fixed: ['Wide: 790'],
		gap: 20,
		used: 810,
		fill_siblings: ['Stretch'],
		scaled_by: 1.325,
		rendered: 1067,
		past_the_box: 7,
	})
	assert.ok(/Stretch at Width 300 with WidthAlignment 3 \(discarded\)/u.test(starved[0].message), starved[0].message)
})

test('VIEW-LAYOUT-04: a size beside a Stretch alignment is reported as discarded, on either axis', () => {
	// The four states measured 2026-11-17 on Row3: Height 300 + VerticalAlignment 3 rendered 158; the same 300
	// with alignment 0 rendered 300; Width 500 + HorizontalAlignment 3 rendered 1012; the same 500 with
	// alignment 0 rendered 500. The model keeps the number, so the check names it.
	const column = { path: 'UI/Screens/Overview/Content', name: 'Content', type: 'ColumnLayout', properties: [...box(0, 0, -1, -1), { name: 'VerticalGap', value: '20.0' }], children: [{ name: 'Row3', type: 'RowLayout' }] }
	const row3 = { path: `${column.path}/Row3`, name: 'Row3', type: 'RowLayout', properties: [...box(0, 0, 500, 300), { name: 'HorizontalAlignment', value: '3 (Int32)' }, { name: 'VerticalAlignment', value: '3 (Int32)' }], children: [] }
	const run = (nodes) => designFindings({ nodes, screen, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-04')

	const both = run([column, row3])
	assert.equal(both.length, 2, 'one axis each was expected')
	assert.deepEqual(both.map((finding) => finding.evidence), [
		{ path: row3.path, type: 'RowLayout', axis: 'Width', size: 500, alignment: 3, parent: column.path },
		{ path: row3.path, type: 'RowLayout', axis: 'Height', size: 300, alignment: 3, parent: column.path },
	])
	assert.ok(/draws at the leftover, not at 300 px/u.test(both[1].message), both[1].message)
	assert.ok(/Pass -1 to fill the track, or alignment 0\/1\/2 to keep 300/u.test(both[1].message))

	// The honest spellings: a stretched child that asks for the leftover, and a pinned child with alignment 0.
	assert.deepEqual(run([column, { ...row3, properties: [...box(0, 0, -1, -1), { name: 'HorizontalAlignment', value: '3 (Int32)' }, { name: 'VerticalAlignment', value: '3 (Int32)' }] }]), [])
	assert.deepEqual(run([column, { ...row3, properties: [...box(0, 0, 500, 300), { name: 'HorizontalAlignment', value: '0 (Int32)' }, { name: 'VerticalAlignment', value: '0 (Int32)' }] }]), [])
	// Only a layout's own child is judged: this is where it was measured, and a ScaleLayout child is not claimed.
	const scaled = { path: 'UI/Screens/Overview/Canvas', name: 'Canvas', type: 'ScaleLayout', properties: [...box(0, 0, 1060, 800), { name: 'OriginalWidth', value: '800.0' }, { name: 'OriginalHeight', value: '500.0' }], children: [{ name: 'Marker', type: 'Rectangle' }] }
	const marker = { path: `${scaled.path}/Marker`, name: 'Marker', type: 'Rectangle', properties: [...box(0, 0, 300, 300), { name: 'HorizontalAlignment', value: '3 (Int32)' }], children: [] }
	assert.deepEqual(run([scaled, marker]), [])
})

test('VIEW-LAYOUT-03: a layout\'s own margins come off the track before its children spend it', () => {
	// Measured live 2026-11-17 on UI/Screens/LineStatus. The `Content` ColumnLayout at `Width -1` with
	// LeftMargin 24 and RightMargin 24 inside a 1060 px canvas rendered 1012 px wide at x=244, and its
	// RowLayout child rendered 1012 px too. With Card1 at Width 1050 across a 20 px gap, Card2 rendered at
	// w=0 at x=1314 - 58 px past the row's own right edge at 1256. The first version of the rule read the
	// track as the 1060 px design box and reported a 10 px overflow: the direction was right, the number was
	// 48 px off, and a screen whose margins are bigger than that would have been missed entirely.
	const spaced = (left, top, right, bottom, width, height) => [
		{ name: 'LeftMargin', value: `${left}.0` },
		{ name: 'TopMargin', value: `${top}.0` },
		{ name: 'RightMargin', value: `${right}.0` },
		{ name: 'BottomMargin', value: `${bottom}.0` },
		{ name: 'Width', value: `${width}.0` },
		{ name: 'Height', value: `${height}.0` },
	]
	const canvas = {
		path: 'UI/Screens/LineStatus/Canvas', name: 'Canvas', type: 'ScaleLayout',
		properties: [...spaced(0, 0, 0, 0, 1060, 706), { name: 'OriginalWidth', value: '1060.0' }, { name: 'OriginalHeight', value: '706.0' }, { name: 'FillMode', value: '0 (FillModeEnum)' }],
		children: [{ name: 'Layout', type: 'ColumnLayout' }],
	}
	const layout = { path: `${canvas.path}/Layout`, name: 'Layout', type: 'ColumnLayout', properties: spaced(0, 0, 0, 0, -1, -1), children: [{ name: 'Content', type: 'ColumnLayout' }] }
	const content = { path: `${layout.path}/Content`, name: 'Content', type: 'ColumnLayout', properties: spaced(24, 24, 24, 24, -1, -1), children: [{ name: 'Row1', type: 'RowLayout' }] }
	const row = { path: `${content.path}/Row1`, name: 'Row1', type: 'RowLayout', properties: [...spaced(0, 0, 0, 0, -1, 247), { name: 'HorizontalGap', value: '20.0' }], children: [{ name: 'Card1', type: 'Rectangle' }, { name: 'Card2', type: 'Rectangle' }] }
	const card1 = { path: `${row.path}/Card1`, name: 'Card1', type: 'Rectangle', properties: spaced(0, 0, 0, 0, 1050, -1), children: [] }
	const card2 = { path: `${row.path}/Card2`, name: 'Card2', type: 'Rectangle', properties: spaced(0, 0, 0, 0, -1, -1), children: [] }
	const lineStatus = { ...screen, path: 'UI/Screens/LineStatus', name: 'LineStatus', properties: spaced(0, 0, 0, 0, 1060, 706) }
	const nodes = [lineStatus, canvas, layout, content, row, card1, card2]
	const run = (list) => designFindings({ nodes: list, screen: lineStatus, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-03')

	const starved = run(nodes)
	assert.equal(starved.length, 1, 'a 1050 px card inside a 1012 px track left its -1 sibling unreported')
	assert.deepEqual(starved[0].evidence, {
		path: row.path,
		type: 'RowLayout',
		track: 1012,
		track_from: 'Canvas design box',
		axis: 'Width',
		fixed: ['Card1: 1050'],
		gap: 20,
		used: 1070,
		fill_siblings: ['Card2'],
		past_the_box: 58,
	})

	// The margins are the whole difference at 1020 px: 1020 + 20 does not fit the 1012 px track the margins
	// leave, and fits the 1060 px track when they are gone. Same card, same gap, one variable.
	const shortAt = (track, used, over) => [{
		rule: 'VIEW-LAYOUT-03',
		severity: 'warning',
		message: `RowLayout Row1 has a ${track} px width track, and its 1 fixed widths plus 1 20 px gap already take ${used} px: Card2 at Width -1 render at zero - a layout neither shrinks nor clips a child to make room for its neighbours.`,
		evidence: {
			path: row.path, type: 'RowLayout', track, track_from: 'Canvas design box', axis: 'Width',
			fixed: ['Card1: 1020'], gap: 20, used, fill_siblings: ['Card2'], past_the_box: over,
		},
	}]
	const at1020 = (list) => list.map((entry) => entry === card1 ? { ...card1, properties: spaced(0, 0, 0, 0, 1020, -1) } : entry);
	assert.deepEqual(run(at1020(nodes)), shortAt(1012, 1040, 28), 'the margins were not spent before the children were')
	assert.deepEqual(run(at1020(nodes.map((entry) => entry === content ? { ...content, properties: spaced(0, 0, 0, 0, -1, -1) } : entry))), [],
		'a card that fits the unmarginated track was reported as short')
	// A vertical track pays for TopMargin and BottomMargin the same way, and the margins are what make the
	// same children short: 640 + 20 fits in 706 but not in 706 - 30 - 30.
	const stack = { path: 'UI/Screens/Overview/Stack', name: 'Stack', type: 'ColumnLayout', properties: [...spaced(0, 30, 0, 30, -1, -1), { name: 'VerticalGap', value: '20.0' }], children: [{ name: 'Header', type: 'Rectangle' }, { name: 'Body', type: 'Rectangle' }] }
	const header = { path: `${stack.path}/Header`, name: 'Header', type: 'Rectangle', properties: spaced(0, 0, 0, 0, 1060, 640), children: [] }
	const body = { path: `${stack.path}/Body`, name: 'Body', type: 'Rectangle', properties: spaced(0, 0, 0, 0, 1060, -1), children: [] }
	const verticalRun = (list) => designFindings({ nodes: list, screen: lineStatus, canvas: undefined, siblings: [] })
		.findings.filter((finding) => finding.rule === 'VIEW-LAYOUT-03')
	const vertical = verticalRun([lineStatus, stack, header, body])
	assert.equal(vertical.length, 1)
	assert.deepEqual(vertical[0].evidence.track, 646, 'TopMargin 30 and BottomMargin 30 were not taken off the 706 px height')
	assert.equal(vertical[0].evidence.used, 660)
	assert.equal(vertical[0].evidence.past_the_box, 14)
	assert.deepEqual(verticalRun([lineStatus, { ...stack, properties: [...spaced(0, 0, 0, 0, -1, -1), { name: 'VerticalGap', value: '20.0' }] }, header, body]), [],
		'the same stack without margins was reported as short')
})

test('a size of -1 is Fill, not a box, so no rule measures it as one', () => {
	// Read as a number, -1 is a rectangle with negative area. Before this was refused, HMI-TARGET-01 reported a
	// control placed by a layout as "-1×-1; the target minimum is 44px" and OPTIX-LAYOUT-01 called every child
	// of a fill-sized container outside its parent. The gap is reported instead of measured.
	const stretchButton = node('StretchButton', 'Button', box(0, 0, -1, -1), [{ name: 'Text', type: 'LocalizedText' }])
	const result = designFindings({ nodes: [stretchButton], screen, canvas: undefined, siblings: [] })
	assert.deepEqual(result.findings.filter((finding) => finding.rule === 'HMI-TARGET-01'), [], 'a fill-sized control was reported with invented geometry')
	assert.ok(result.unchecked.some((entry) => /Button StretchButton: no geometry reported/u.test(entry)))
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
