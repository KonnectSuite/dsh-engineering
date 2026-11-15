#!/usr/bin/env node
/**
 * Manual visual probe for `optix_svg` against the live project: draft a screen (which mounts it in
 * the window), place an Advanced SVG image on it, bind one element colour, and take the screenshot
 * that proves the colour actually renders.
 *
 * A save and a build belong between the phases because the runtime loads the project as saved:
 *
 *   node test/optix-visual.mjs prepare            # draft the screen, place the image, bind red
 *   <engineer saves and builds>
 *   node test/optix-visual.mjs shot red
 *   node test/optix-visual.mjs colour "#30A46C"    # rebind the same element to green
 *   <engineer saves and builds>
 *   node test/optix-visual.mjs shot green
 *   node test/optix-visual.mjs cleanup             # delete the screen, the loader and the image
 *
 * It is not in the default suite: it needs a bridge, a rendered window and a human save.
 */
import { copyFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PROJECT = process.env.OPTIX_PROJECT ?? 'C:\\Users\\KNPhu\\Desktop\\myWorkspaces\\Optix Demo\\OptixStandard'
const SCREEN = 'ProbeVisual'
const IMAGE = 'Art'

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<svg version="1.2" baseProfile="tiny" xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200">
  <rect id="Frame" x="0" y="0" width="400" height="200" fill="#13232F" stroke="#2C4557" stroke-width="4"/>
  <circle id="Lamp" cx="200" cy="100" r="70" fill="#E5484D" stroke="#FFFFFF" stroke-width="6"/>
</svg>
`

function mount() {
	const definitions = new Map()
	const images = []
	const disposers = []
	const scope = {
		tools: { register: (definition) => definitions.set(definition.name, definition) },
		get: (name) => (name === 'attachments' ? {
			saveImage: async ({ data, mediaType, name }) => {
				const path = join(tmpdir(), `.optix-visual-${name}`)
				writeFileSync(path, Buffer.from(data))
				images.push(path)
				return { attachmentId: `sha256:${'0'.repeat(64)}`, name, mediaType, media_type: mediaType }
			},
		} : void 0),
		inject: (names, callback) => callback(scope),
		effect: (factory) => {
			const disposer = factory()
			if (typeof disposer === 'function') disposers.push(disposer)
		},
		on: () => () => {},
		emit: () => {},
		plugin: (module, options) => {
			if (typeof module?.apply === 'function') module.apply(scope, options)
			return {
				dispose: async () => {
					for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose()
				},
			}
		},
		provide: () => {},
		logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} },
	}
	return { scope, definitions, images, dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose() } }
}

const mounted = mount()
const plugin = await import('../entries/optix.js')
plugin.apply(mounted.scope, plugin.Config({
	allowWrites: true,
	allowDestructive: true,
	allowInvoke: true,
	preview: true,
	browser: 'launch',
	browserChannel: 'auto',
	browserHeadless: false,
	requestTimeoutMs: 60000,
}))
const disposeChild = async () => { await mounted.dispose() }

async function call(name, args) {
	const definition = mounted.definitions.get(name)
	if (!definition) throw new Error(`no tool ${name}`)
	return definition.execute(args, { signal: AbortSignal.timeout(120000) })
}

const phase = process.argv[2]

try {
	if (phase === 'prepare') {
		const variable = await call('optix_edit', {
			project: 'OptixStandard',
			dry_run: false,
			ops: [{ op: 'create_variable', parent: 'Model', name: 'ProbeSpeed', datatype: 'Float', kind: 'analog', units: 'm/min', range: [0, 120] }],
		})
		console.log('variable:', variable.status, variable.applied, JSON.stringify(variable.notes ?? []).slice(0, 200))
		const screen = await call('optix_screen', {
			project: 'OptixStandard',
			name: SCREEN,
			title: 'SVG PROBE',
			subtitle: 'design hardening probe',
			cards: [{ title: 'PROBE', rows: [{ kind: 'value', label: 'Probe speed', tag: 'Model/ProbeSpeed' }] }],
			dry_run: false,
		})
		console.log('screen:', screen.status, JSON.stringify(screen.host?.mounted ?? null), JSON.stringify(screen.findings ?? screen.error ?? '').slice(0, 400))
		const added = await call('optix_svg', {
			project: 'OptixStandard',
			action: 'add',
			screen: `UI/Screens/${SCREEN}`,
			name: IMAGE,
			inline: SVG,
			box: { left: 120, top: 240, width: 400, height: 200 },
		})
		console.log('add:', added.status, added.node ?? '', added.resource_uri ?? '', JSON.stringify(added.validation?.errors ?? []).slice(0, 300))
		const bound = await call('optix_svg', {
			project: 'OptixStandard',
			action: 'bind',
			node: added.node,
			id: 'Lamp',
			property: 'Color',
			value: '#E5484D',
		})
		console.log('bind red:', bound.written ?? bound.error, 'read back:', JSON.stringify(bound.read_back ?? null))
		console.log('NEXT: save and build in Studio, then: node test/optix-visual.mjs shot red')
	} else if (phase === 'colour') {
		const value = process.argv[3]
		const listed = await call('optix_svg', { project: 'OptixStandard', action: 'list', screen: `UI/Screens/${SCREEN}` })
		const node = listed.images?.[0]?.path
		if (!node) throw new Error(`no image on UI/Screens/${SCREEN}: ${JSON.stringify(listed.images)}`)
		const bound = await call('optix_svg', { project: 'OptixStandard', action: 'bind', node, id: 'Lamp', property: 'Color', value })
		console.log('bind', value, ':', JSON.stringify(bound).slice(0, 900))
		console.log('NEXT: save and build in Studio, then: node test/optix-visual.mjs shot changed')
	} else if (phase === 'shot') {
		const label = process.argv[3] ?? 'shot'
		const status = await call('optix_emulator', { action: 'status', project: PROJECT })
		if (!status.serving) {
			const started = await call('optix_emulator', { action: 'start', project: PROJECT, wait_ms: 90000 })
			console.log('runtime:', started.started, started.serving, started.waited_ms ?? '', started.notice ?? '')
		}
		const shot = await call('optix_screenshot', {})
		console.log('screenshot:', shot.url, shot.width + 'x' + shot.height, 'attachment', shot.attachment)
		const last = mounted.images[mounted.images.length - 1]
		if (last) {
			const path = join(process.cwd(), `.tmp-visual-${label}.png`)
			copyFileSync(last, path)
			console.log('wrote', path)
		}
	} else if (phase === 'cleanup') {
		const removed = await call('optix_edit', {
			project: 'OptixStandard',
			dry_run: false,
			ops: [
				{ op: 'delete', path: `UI/Screens/${SCREEN}` },
				{ op: 'delete', path: 'UI/MainWindow/MainLoader' },
				{ op: 'delete', path: 'Model/ProbeSpeed' },
			],
		})
		console.log('delete:', JSON.stringify(removed.results ?? removed.error))
		const stopped = await call('optix_emulator', { action: 'stop', project: PROJECT, force: true })
		console.log('runtime stopped:', stopped.stopped, JSON.stringify(stopped.stopped_pids ?? []))
		console.log('NEXT: save and build in Studio so the deletion reaches the files')
	} else {
		console.log('usage: prepare | colour <#hex> | shot <label> | cleanup')
		process.exitCode = 2
	}
} finally {
	await disposeChild()
	await mounted.dispose()
}

