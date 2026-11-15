/**
 * P0 spike - the capability proof a design-language UI kit has to stand on.
 *
 * Run manually, with Studio open on a project and `StudioMCPBridge` -> StartBridge already chosen:
 *
 *   node test/optix-live-spike.mjs inspect
 *   node test/optix-live-spike.mjs theme
 *   node test/optix-live-spike.mjs nav
 *   node test/optix-live-spike.mjs dialog
 *   node test/optix-live-spike.mjs read
 *   node test/optix-live-spike.mjs cleanup
 *
 * It answers four questions the kit cannot be built on assumptions about:
 *   1. can the bridge create a StyleSheet node, put named styles in it, and point a presentation
 *      engine's `StyleSheet` property at it (a NodeId property written as a path)?
 *   2. can it create a NavigationPanel and place NavigationPanelItem tabs that point at screens?
 *   3. can it create a Dialog type and wire a button to `OpenDialog` (and the dialog's button to
 *      `CloseDialog`)?
 *   4. does every one of those read back as the same shape a Studio-authored project has?
 *
 * Every probe is one bridge call, so a refusal names itself instead of stopping a batch. The nodes are
 * named `Dsh*` and `cleanup` removes them again.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const signal = AbortSignal.timeout(300000)
const stage = (process.argv[2] ?? 'inspect').toLowerCase()
const projectRoot = process.env.OPTIX_PROJECT_ROOT ?? 'C:\\Users\\KNPhu\\Desktop\\myWorkspaces\\Optix Demo\\AryaOptixTemplate'
const step = (message) => console.log(`\n== ${message}`)

const SHEET = 'UI/DshStyleSheet'
const RAIL = 'UI/MainWindow/DshRail'
const DIALOGS = 'UI/DshDialogs'
const CONFIRM = `${DIALOGS}/DshConfirm`

async function mount() {
	const module = await import(pathToFileURL(join(root, 'entries/optix.js')).href)
	const tools = new Map()
	const disposers = []
	const attachments = {
		async saveImage({ name, mediaType }) {
			return { attachmentId: `live-${name}`, name, media_type: mediaType, width: 0, height: 0 }
		}
	}
	const scope = {
		tools: { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name) } },
		get: (key) => (key === 'attachments' ? attachments : undefined),
		inject: (names, callback) => callback(scope),
		effect: (factory) => { const dispose = factory(); disposers.push(dispose); return dispose },
		on: () => () => {},
		emit: () => {},
		plugin: (module, options) => {
			if (typeof module?.apply === 'function') module.apply(scope, options)
			return { dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose() } }
		},
		provide: () => {},
		logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
	}
	module.apply(scope, module.Config({
		allowWrites: true, allowDestructive: true, allowInvoke: true, preview: true, allowPreviewInput: true, requestTimeoutMs: 120000
	}))
	return { tools, dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose() } }
}

const row = await mount()
const call = async (name, args) => {
	const definition = row.tools.get(name)
	assert.ok(definition !== undefined, `${name} is not mounted`)
	return definition.execute(args, { signal })
}

/** One op, one bridge call: a refusal names itself and the next op still runs. */
const probe = async (label, op, project) => {
	try {
		const report = await call('optix_edit', { project, ops: [op], dry_run: false })
		const failed = (report.results ?? []).find((entry) => entry.ok !== true || (entry.error !== undefined && entry.error !== null))
		const row = (report.results ?? [])[0] ?? {}
		console.log(`  ${failed === undefined ? 'ok  ' : 'FAIL'} ${label}${failed === undefined ? '' : ' :: ' + JSON.stringify(failed.error ?? failed)}`)
		return { label, ok: failed === undefined, report, row }
	} catch (error) {
		console.log(`  FAIL ${label} :: ${error.message}`)
		return { label, ok: false, error: error.message }
	}
}

const childrenOf = (result) => result?.response?.map?.children ?? result?.map?.children ?? []
const readMap = async (project, path, depth = 1) =>
	childrenOf(await call('optix_read', { project, request: { action: 'map', path, depth, mode: 'detail', match: '' } }))

const status = async () => {
	const answer = await call('optix_status', {})
	const endpoint = answer.endpoints.find((entry) => entry.available)
	assert.ok(endpoint !== undefined, JSON.stringify(answer.endpoints))
	return { answer, endpoint, project: endpoint.health.project }
}

try {
	step(`spike stage ${stage}`)
	const { project, endpoint } = await status()
	console.log(`bridge ${endpoint.health.bridge_version} project ${project}`)
	assert.ok(existsSync(join(projectRoot, `${project}.optix`)), `no ${project}.optix under ${projectRoot} (set OPTIX_PROJECT_ROOT)`)
	const objects = `/Objects/${project}`

	if (stage === 'inspect') {
		step('the project as it stands')
		console.log(`UI: ${(await readMap(project, 'UI')).map((node) => `${node.name}${node.n === undefined ? '' : `(${node.n})`}`).join(', ')}`)
		const engine = await readMap(project, 'UI/NativePresentationEngine')
		console.log(`native engine children: ${engine.map((node) => node.name).join(', ')}`)
		const window = await readMap(project, 'UI/MainWindow')
		console.log(`MainWindow children: ${window.map((node) => node.name).join(', ')}`)
		console.log(`screens: ${(await readMap(project, 'UI/Screens')).map((node) => node.name).join(', ')}`)
	}

	if (stage === 'theme') {
		step('a StyleSheet node with named button styles, and a pointer to it from both engines')
		await probe('create sheet node', { op: 'create_object', parent: 'UI', name: 'DshStyleSheet', object_type: 'StyleSheet' }, project)
		await probe('create ButtonStyles set', { op: 'create_object', parent: SHEET, name: 'ButtonStyles', object_type: 'BaseObjectType' }, project)
		await probe('create Primary ButtonStyle', { op: 'create_object', parent: `${SHEET}/ButtonStyles`, name: 'Primary', object_type: 'ButtonStyle' }, project)
		await probe('style Color', { op: 'set_property', path: `${SHEET}/ButtonStyles/Primary`, name: 'Color', value: '#0B3E5C' }, project)
		await probe('style TextColor', { op: 'set_property', path: `${SHEET}/ButtonStyles/Primary`, name: 'TextColor', value: '#FFFFFF' }, project)
		await probe('style Radius', { op: 'set_property', path: `${SHEET}/ButtonStyles/Primary`, name: 'Radius', value: '6.0' }, project)
		await probe('sheet token AccentColor', { op: 'set_property', path: SHEET, name: 'AccentColor', value: '#0FAFFF' }, project)
		await probe('sheet token Radius', { op: 'set_property', path: SHEET, name: 'Radius', value: '8.0' }, project)
		await probe('native engine StyleSheet pointer', { op: 'set_property', path: 'UI/NativePresentationEngine', name: 'StyleSheet', value: `${objects}/${SHEET}` }, project)
		await probe('web engine StyleSheet pointer', { op: 'set_property', path: 'UI/WebPresentationEngine', name: 'StyleSheet', value: `${objects}/${SHEET}` }, project)
	}

	if (stage === 'nav') {
		step('a NavigationPanel inside the window with two tabs that point at screens')
		await probe('create NavigationPanel', { op: 'create_object', parent: 'UI/MainWindow', name: 'DshRail', object_type: 'NavigationPanel' }, project)
		await probe('geometry left', { op: 'set_property', path: RAIL, name: 'LeftMargin', value: '0.0' }, project)
		await probe('geometry top', { op: 'set_property', path: RAIL, name: 'TopMargin', value: '64.0' }, project)
		await probe('geometry width', { op: 'set_property', path: RAIL, name: 'Width', value: '220.0' }, project)
		await probe('geometry height', { op: 'set_property', path: RAIL, name: 'Height', value: '600.0' }, project)
		await probe('tab width', { op: 'set_property', path: RAIL, name: 'TabWidth', value: '80.0' }, project)
		await probe('tab height', { op: 'set_property', path: RAIL, name: 'TabHeight', value: '44.0' }, project)
		await probe('create tab Home', { op: 'create_object', parent: RAIL, name: 'Panel1', object_type: 'NavigationPanelItem' }, project)
		await probe('tab Home title', { op: 'set_property', path: `${RAIL}/Panel1`, name: 'Title', value: '{"LocaleId":"en-US","Text":"Home"}' }, project)
		await probe('tab Home panel pointer', { op: 'set_property', path: `${RAIL}/Panel1`, name: 'Panel', value: `${objects}/UI/Screens/Home` }, project)
		await probe('create tab Alarms', { op: 'create_object', parent: RAIL, name: 'Panel2', object_type: 'NavigationPanelItem' }, project)
		await probe('tab Alarms title', { op: 'set_property', path: `${RAIL}/Panel2`, name: 'Title', value: '{"LocaleId":"en-US","Text":"Alarms"}' }, project)
		await probe('tab Alarms panel pointer', { op: 'set_property', path: `${RAIL}/Panel2`, name: 'Panel', value: `${objects}/UI/Screens/Alarms` }, project)
	}

	if (stage === 'dialog') {
		step('a Dialog type, its face, and the two native commands that open and close it')
		await probe('create Dialogs folder', { op: 'create_folder', parent: 'UI', name: 'DshDialogs' }, project)
		await probe('create Dialog type', { op: 'create_type', parent: DIALOGS, name: 'DshConfirm', base_type: 'Dialog' }, project)
		await probe('dialog label', { op: 'create_widget', screen: CONFIRM, name: 'DshConfirmText', widget_type: 'Label' }, project)
		await probe('dialog label text', { op: 'set_property', path: `${CONFIRM}/DshConfirmText`, name: 'Text', value: '{"LocaleId":"en-US","Text":"Delete this recipe?"}' }, project)
		await probe('dialog cancel button', { op: 'create_widget', screen: CONFIRM, name: 'DshConfirmCancel', widget_type: 'Button' }, project)
		await probe('cancel caption', { op: 'set_property', path: `${CONFIRM}/DshConfirmCancel`, name: 'Text', value: '{"LocaleId":"en-US","Text":"Cancel"}' }, project)
		await probe('cancel closes', { op: 'wire_event', path: `${CONFIRM}/DshConfirmCancel`, event_type: 'MouseClickEvent', command: 'CloseDialog' }, project)
		await probe('open button on the window', { op: 'create_widget', screen: 'UI/MainWindow', name: 'DshOpenDialog', widget_type: 'Button' }, project)
		await probe('open caption', { op: 'set_property', path: 'UI/MainWindow/DshOpenDialog', name: 'Text', value: '{"LocaleId":"en-US","Text":"Delete recipe"}' }, project)
		await probe('open dialog command', {
			op: 'wire_event', path: 'UI/MainWindow/DshOpenDialog', event_type: 'MouseClickEvent',
			command: 'OpenDialog', args: `Dialog=${objects}/${CONFIRM};AliasNode=`
		}, project)
	}

	if (stage === 'read') {
		step('read every spike node back')
		console.log(`sheet children: ${JSON.stringify(await readMap(project, SHEET, 3))}`)
		console.log(`native engine: ${JSON.stringify(await readMap(project, 'UI/NativePresentationEngine'))}`)
		console.log(`rail: ${JSON.stringify(await readMap(project, RAIL, 3))}`)
		console.log(`dialogs: ${JSON.stringify(await readMap(project, DIALOGS, 2))}`)
		const engine = await call('optix_read', { project, request: { action: 'map', path: 'UI/NativePresentationEngine', depth: 1, mode: 'detail' } })
		console.log(`engine property read: ${JSON.stringify(engine.response?.map?.properties ?? engine.response?.map ?? engine).slice(0, 1200)}`)
	}

	if (stage === 'fix') {
		step('the two writes that reported ok but did not land, retried the way the model stores them')
		await probe('engine Sheet via Value child (absolute)', { op: 'set_property', path: 'UI/NativePresentationEngine/StyleSheet', name: 'Value', value: `${objects}/${SHEET}` }, project)
		await probe('engine Sheet via Value child (project path)', { op: 'set_property', path: 'UI/NativePresentationEngine/StyleSheet', name: 'Value', value: SHEET }, project)
		await probe('item under the Panels collection', { op: 'create_object', parent: `${RAIL}/Panels`, name: 'PanelA', object_type: 'NavigationPanelItem' }, project)
		await probe('collection item title', { op: 'set_property', path: `${RAIL}/Panels/PanelA`, name: 'Title', value: '{"LocaleId":"en-US","Text":"Home"}' }, project)
		await probe('collection item panel', { op: 'set_property', path: `${RAIL}/Panels/PanelA`, name: 'Panel', value: `${objects}/UI/Screens/Home` }, project)
		await probe('collection item panel via Value child', { op: 'set_property', path: `${RAIL}/Panels/PanelA/Panel`, name: 'Value', value: `${objects}/UI/Screens/Home` }, project)
		step('read back')
		console.log(`engine: ${JSON.stringify(await readMap(project, 'UI/NativePresentationEngine'))}`)
		console.log(`rail Panels: ${JSON.stringify(await readMap(project, `${RAIL}/Panels`, 2))}`)
	}

	if (stage === 'polish') {
		step('make the spike renderable: one tab list, no flat siblings, and a second tab')
		for (const [label, path] of [['flat tab Home', `${RAIL}/Panel1`], ['flat tab Alarms', `${RAIL}/Panel2`]]) {
			try {
				const report = await call('optix_edit', { project, ops: [{ op: 'delete', path }], dry_run: false })
				console.log(`  ok   delete ${label} :: ${JSON.stringify(report.results?.[0] ?? report).slice(0, 160)}`)
			} catch (error) {
				console.log(`  FAIL delete ${label} :: ${error.message}`)
			}
		}
		await probe('second tab', { op: 'create_object', parent: `${RAIL}/Panels`, name: 'PanelB', object_type: 'NavigationPanelItem' }, project)
		await probe('second tab title', { op: 'set_property', path: `${RAIL}/Panels/PanelB`, name: 'Title', value: '{"LocaleId":"en-US","Text":"Alarms"}' }, project)
		await probe('second tab panel', { op: 'set_property', path: `${RAIL}/Panels/PanelB/Panel`, name: 'Value', value: `${objects}/UI/Screens/Alarms` }, project)
		await probe('first tab panel', { op: 'set_property', path: `${RAIL}/Panels/PanelA/Panel`, name: 'Value', value: `${objects}/UI/Screens/Home` }, project)
		step('read the tab pointers back')
		for (const name of ['PanelA', 'PanelB']) {
			const item = await call('optix_read', { project, request: { action: 'map', path: `${RAIL}/Panels/${name}`, depth: 2, mode: 'detail' } })
			console.log(`  ${name}: ${JSON.stringify(childrenOf(item))}`)
		}
	}

	if (stage === 'evidence') {
		step('what a runtime click will prove, in the model')
		const openButton = await call('optix_read', { project, request: { action: 'map', path: 'UI/MainWindow/DshOpenDialog', depth: 6, mode: 'detail' } })
		console.log(`open button: ${JSON.stringify(childrenOf(openButton)).slice(0, 3000)}`)
		const confirm = await call('optix_read', { project, request: { action: 'map', path: CONFIRM, depth: 4, mode: 'detail' } })
		console.log(`dialog: ${JSON.stringify(childrenOf(confirm)).slice(0, 2500)}`)
		const sheet = await call('optix_read', { project, request: { action: 'map', path: `${SHEET}/ButtonStyles/Primary`, depth: 3, mode: 'detail' } })
		console.log(`primary style: ${JSON.stringify(childrenOf(sheet))}`)
		const engine = await readMap(project, 'UI/NativePresentationEngine')
		console.log(`engine style sheet: ${JSON.stringify(engine.find((node) => node.name === 'StyleSheet'))}`)
	}

	if (stage === 'cleanup') {
		step('remove the spike nodes again')
		for (const [label, path] of [['open-dialog button', 'UI/MainWindow/DshOpenDialog'], ['rail', RAIL], ['sheet', SHEET], ['dialogs folder', DIALOGS]]) {
			try {
				const report = await call('optix_edit', { project, ops: [{ op: 'delete', path }], dry_run: false })
				console.log(`  ok   delete ${label} :: ${JSON.stringify(report.results?.[0] ?? report).slice(0, 200)}`)
			} catch (error) {
				console.log(`  FAIL delete ${label} :: ${error.message}`)
			}
		}
	}

	step('done')
} finally {
	await row.dispose().catch(() => {})
}
