/**
 * The live proof for the two channels the plugin gained after 0.96.0: the file channel's build check and the
 * typed navigation bar.
 *
 * Run manually, with Studio open on a project and `StudioMCPBridge` -> StartBridge already chosen:
 *
 *   node test/optix-live-nav.mjs build
 *   node test/optix-live-nav.mjs screens
 *   node test/optix-live-nav.mjs plan
 *   node test/optix-live-nav.mjs apply
 *   ... save (Ctrl+S) and build (Ctrl+Shift+B) in Studio, emulator stopped, then:
 *   node test/optix-live-nav.mjs serve
 *   node test/optix-live-nav.mjs verify
 *
 * `OPTIX_PROJECT_ROOT` names the project folder; default is the one this session measured.
 *
 * It proves, and nothing else can: the project's own NetSolution compiles out of tree, three screens are
 * authored entirely through tools, a window navigation bar is created and wired with relative pointers, and
 * every button's click is shown to change the loader's `Panel` in the served runtime. The screens it creates
 * are named by `OPTIX_LIVE_SCREENS` (default Home, Alarms, Settings); nothing is deleted, because a screen is
 * the operator's own surface and a deleted screen is a broken button.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const signal = AbortSignal.timeout(300000)
const stage = (process.argv[2] ?? 'status').toLowerCase()
const projectRoot = process.env.OPTIX_PROJECT_ROOT ?? 'C:\\Users\\KNPhu\\Desktop\\myWorkspaces\\Optix Demo\\OptixTemplate'
const screens = (process.env.OPTIX_LIVE_SCREENS ?? 'Home,Alarms,Settings').split(',').map((name) => name.trim()).filter(Boolean)
const step = (message) => console.log(`\n== ${message}`)

/** Mount the shipped row the way the harness does, keeping the tool definitions so they can be called. */
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
		tools: {
			register(definition) {
				tools.set(definition.name, definition)
				return () => tools.delete(definition.name)
			}
		},
		get: (key) => (key === 'attachments' ? attachments : undefined),
		inject: (names, callback) => callback(scope),
		effect: (factory) => {
			const dispose = factory()
			disposers.push(dispose)
			return dispose
		},
		on: () => () => {},
		emit: () => {},
		plugin: (module, options) => {
			if (typeof module?.apply === 'function') module.apply(scope, options)
			return {
				dispose: async () => {
					for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose()
				}
			}
		},
		provide: () => {},
		logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
	}
	module.apply(scope, module.Config({
		allowWrites: true,
		allowDestructive: true,
		allowInvoke: true,
		preview: true,
		allowPreviewInput: true,
		requestTimeoutMs: 120000
	}))
	return { tools, dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose() } }
}

const row = await mount()
const call = async (name, args) => {
	const definition = row.tools.get(name)
	assert.ok(definition !== undefined, `${name} is not mounted`)
	return definition.execute(args, { signal })
}

const status = async () => {
	const answer = await call('optix_status', {})
	const endpoint = answer.endpoints.find((entry) => entry.available)
	assert.ok(endpoint !== undefined, JSON.stringify(answer.endpoints))
	return { answer, endpoint, project: endpoint.health.project }
}

try {
	step(`stage ${stage}`)
	const { answer, endpoint, project } = await status()
	console.log(`bridge ${endpoint.health.bridge_version} project ${project} pending ${answer.needs_save?.pending ?? 0}`)
	assert.ok(existsSync(join(projectRoot, `${project}.optix`)), `no ${project}.optix under ${projectRoot} (set OPTIX_PROJECT_ROOT)`)

	if (stage === 'build') {
		step('the project NetSolution compiles out of tree, without Studio')
		const state = await call('optix_build', { action: 'status', project, project_root: projectRoot })
		console.log(`build state ${state.build_state?.state ?? JSON.stringify(state)}`)
		const checked = await call('optix_build', { action: 'check', project, project_root: projectRoot })
		console.log(`check ok ${checked.ok} exit ${checked.exit_code} errors ${checked.errors.length} warnings ${checked.warnings.length} in ${checked.duration_ms} ms`)
		for (const error of checked.errors.slice(0, 10)) console.log(`  ${error}`)
		assert.equal(checked.ok, true, JSON.stringify(checked.errors))
		assert.equal(checked.isolated, true)
		const after = await call('optix_build', { action: 'status', project, project_root: projectRoot })
		console.log(`build state after check ${after.build_state?.state}`)
	} else if (stage === 'screens') {
		step('each screen is authored through optix_screen, mounted in the start window')
		const childrenOf = (result) => result.response?.map?.children ?? result.map?.children ?? result.children ?? result.nodes ?? []
		const listing = async (path) => childrenOf(await call('optix_read', { project, request: { action: 'map', path, depth: 1, mode: 'detail' } }))
		const before = await listing('UI/Screens')
		console.log(`screens before: ${before.map((node) => node.name).join(', ') || '(none)'}`)
		for (const name of screens) {
			if (before.some((node) => node.name === name)) {
				console.log(`${name}: already present`)
				continue
			}
			const applied = await call('optix_screen', {
				project,
				name,
				title: name.toUpperCase(),
				subtitle: 'live proof of the typed navigation bar',
				footer: 'AryaCode · FactoryTalk Optix',
				cards: [{ title: 'STATUS' }],
				dry_run: false
			})
			console.log(`${name}: ${applied.status} ops ${applied.applied ?? applied.ops?.length ?? '?'} wired ${JSON.stringify(applied.nav ?? null).slice(0, 200)}`)
		}
		const after = await listing('UI/Screens')
		console.log(`screens after: ${after.map((node) => node.name).join(', ')}`)
		const window = await listing('UI/MainWindow')
		console.log(`window children: ${window.map((node) => `${node.name}[${node.type}]`).join(', ')}`)
		for (const name of screens) assert.ok(after.some((node) => node.name === name), `${name} was not created`)
		assert.ok(window.some((node) => node.type === 'PanelLoader' || node.type === 'PanelLoaderType'), 'no PanelLoader was mounted in the window')
	} else if (stage === 'plan' || stage === 'apply') {
		const targets = screens.map((name) => ({ screen: `UI/Screens/${name}` }))
		const action = stage
		const result = await call('optix_nav', { project, action, targets })
		console.log(JSON.stringify(result, null, 2).slice(0, 8000))
		if (action === 'plan') {
			assert.equal(result.bar?.top, result.canvas.height - 56 - 24 - 56, JSON.stringify({ bar: result.bar, canvas: result.canvas }))
			assert.equal(result.buttons?.length, targets.length, JSON.stringify(result.buttons))
		} else {
			assert.ok(result.applied >= 1, JSON.stringify(result))
			console.log(`\nNow in Studio: stop the emulator, press Ctrl+S, then Ctrl+Shift+B, and run: node test/optix-live-nav.mjs verify`)
		}
	} else if (stage === 'serve') {
		step('the emulator starts and serves the saved project')
		const started = await call('optix_emulator', { action: 'start', project: projectRoot })
		console.log(JSON.stringify(started, null, 2).slice(0, 3000))
	} else if (stage === 'verify') {
		step('every button is clicked in the served runtime and the panel is read back')
		const verified = await call('optix_nav', { project, action: 'verify' })
		console.log(JSON.stringify(verified, null, 2).slice(0, 12000))
		for (const dead of verified.results.filter((row) => !row.ok)) console.log(`  DEAD ${dead.button} -> ${dead.target} (panel ${dead.panel_after})`)
		assert.equal(verified.status, 'verified', JSON.stringify(verified.next))
	} else if (stage !== 'status') {
		throw new Error(`unknown stage ${stage}: status, build, screens, plan, apply, serve, verify`)
	}
	step('done')
} finally {
	await row.dispose()
}
