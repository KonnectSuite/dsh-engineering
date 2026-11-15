import assert from 'node:assert/strict'
import { test } from 'node:test'

import { mountOps } from '../packages/optix/lib/screens.js'

/**
 * Mounting is what turns an authored screen into something a render can show. A window renders only its
 * own children, and both packaged starters ship a window with none, so before this existed `optix_screen`
 * could author a correct screen that the preview never displayed: measured live 2026-11-14, a screen with
 * 18 objects and a flat white 1920x1080 frame next to it.
 *
 * The `Panel` pointer is written as a literal NodePath because the target is an ObjectType: the bridge
 * refuses a `DynamicLink` to a type with `source_not_variable`. That literal has to be a path the runtime
 * resolves: measured live 2026-11-14, `UI/Screens/LineOverview` left the pointer red and unresolved in
 * Studio because a bare path is read relative to the loader's parent, so the plan writes the
 * project-absolute form Studio itself writes whenever the project name is known.
 */

const canonical = { window: 'UI/MainWindow', loader: 'MainLoader', screen: 'UI/Screens/LineOverview', project: 'LineHMI', width: 1920, height: 1080, children: [] }

test('a window with no loader gets one, sized to the canvas, pointing at the screen', () => {
	const plan = mountOps(canonical)
	assert.ok(plan, 'a window with no children must get a plan')
	assert.equal(plan.mounted.loader, 'UI/MainWindow/MainLoader')
	assert.equal(plan.mounted.panel, 'UI/Screens/LineOverview')
	assert.deepEqual(plan.mounted.canvas, { width: 1920, height: 1080 })

	const [create, left, top, width, height, bind] = plan.ops
	assert.deepEqual(create, { op: 'create_widget', screen: 'UI/MainWindow', name: 'MainLoader', widget_type: 'PanelLoader' })
	assert.deepEqual(left, { op: 'set_property', path: 'UI/MainWindow/MainLoader', name: 'LeftMargin', value: '0.0' })
	assert.deepEqual(top, { op: 'set_property', path: 'UI/MainWindow/MainLoader', name: 'TopMargin', value: '0.0' })
	assert.deepEqual(width, { op: 'set_property', path: 'UI/MainWindow/MainLoader', name: 'Width', value: '1920.0' })
	assert.deepEqual(height, { op: 'set_property', path: 'UI/MainWindow/MainLoader', name: 'Height', value: '1080.0' })
	assert.deepEqual(bind, { op: 'bind', path: 'UI/MainWindow/MainLoader', name: 'Panel', raw_path: '/Objects/LineHMI/UI/Screens/LineOverview', mode: 'ReadWrite' })
})

test('the pointer is a raw NodePath, never a source path', () => {
	const plan = mountOps(canonical)
	const bind = plan.ops.find((op) => op.op === 'bind')
	assert.equal(bind.source_path, undefined, 'a source path to an ObjectType is refused by the bridge')
	assert.equal(bind.raw_path, '/Objects/LineHMI/UI/Screens/LineOverview')
	assert.equal(plan.mounted.link, bind.raw_path, 'the report must name the link it wrote')
})

test('without a project name the link is relative, and resolves from the loader parent', () => {
	const plan = mountOps({ ...canonical, project: undefined })
	const bind = plan.ops.find((op) => op.op === 'bind')
	assert.equal(bind.raw_path, '../Screens/LineOverview')
})

test('a screen in the same folder as the window needs no ascent', () => {
	const plan = mountOps({ ...canonical, project: undefined, window: 'UI/Screens', screen: 'UI/Screens/Detail' })
	assert.equal(plan.ops.find((op) => op.op === 'bind').raw_path, 'Detail')
})

test('nothing is planned when the window already holds that loader, or when a part is missing', () => {
	assert.equal(mountOps({ ...canonical, children: ['MainLoader'] }), undefined, 'a second loader of the same name would collide')
	assert.equal(mountOps({ ...canonical, window: undefined }), undefined, 'no window means nothing to mount into')
	assert.equal(mountOps({ ...canonical, screen: undefined }), undefined, 'no screen means nothing to point at')
	assert.equal(mountOps({ ...canonical, loader: '' }), undefined, 'a loader needs a name')
})

test('the batch is lossless JSON, because the host refuses anything else', () => {
	const plan = mountOps(canonical)
	assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan)
})
