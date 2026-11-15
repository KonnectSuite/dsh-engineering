/**
 * The design-hardening run: exercise the tools that need a live Studio, through the shipped row, against
 * the bridge the engineer started.
 *
 * Run manually, with Studio open on a project and `StudioMCPBridge` -> StartBridge already chosen:
 *
 *   node test/optix-live-e2e.mjs
 *
 * What it proves, and nothing else can prove it: the shipped catalog can be diffed against the object model
 * the running Studio reports, `optix_svg` places a drawing in the project and binds an element property
 * that the bridge accepts, `optix_edit create_variable` writes the analog anatomy the model layer now
 * promises (units and range limits as real children), and `optix_design_check` reports a planted defect.
 *
 * Every node it creates is named `ProbeHardening*` and deleted at the end, so the open project is left as
 * it was apart from the unsaved-changes counter the bridge already keeps. It writes nothing to disk: bridge
 * writes live in Studio's memory until the engineer saves.
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const signal = AbortSignal.timeout(180000)
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
	module.apply(scope, module.Config({ allowWrites: true, allowDestructive: true, allowInvoke: true, preview: true, requestTimeoutMs: 60000 }))
	return { tools, dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === 'function') await dispose() } }
}

const GOOD = `<?xml version="1.0"?>
<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="240" height="120" viewBox="0 0 240 120">
  <rect id="Conveyor" x="10" y="40" width="200" height="30" fill="#30A46C" stroke="#143243"/>
  <rect id="Lamp" x="10" y="10" width="20" height="20" fill="#E5484D"/>
</svg>`

const BAD = '<svg version="1.2" baseProfile="tiny" width="9" height="9"><rect width="9" height="9" fill="rgb(1,2,3)"/></svg>'

const scratch = await mkdtemp(join(tmpdir(), 'optix-live-'))
const row = await mount()
const call = async (name, args) => {
	const definition = row.tools.get(name)
	assert.ok(definition !== undefined, `${name} is not mounted`)
	return definition.execute(args, { signal })
}
try {
	step('phase 3: the bridge answers and names the project')
	const status = await call('optix_status', {})
	const endpoint = status.endpoints.find((entry) => entry.available)
	assert.ok(endpoint !== undefined, JSON.stringify(status.endpoints))
	const project = endpoint.health.project
	console.log(`bridge ${endpoint.health.bridge_version} project ${project} needs_save ${status.needs_save?.pending ?? 0}`)

	// A previous interrupted run may have left its probe nodes behind; a duplicate name is refused by the
	// bridge, which would make every later assertion fail for the wrong reason.
	const drop = async (path) => {
		await call('optix_edit', { project, dry_run: false, ops: [{ op: 'delete', path }] }).catch(() => undefined)
	}
	await drop('UI/ProbeHardening')
	await drop('Model/ProbeHardening')

	step('W1: the shipped catalog answers, and it can be diffed against the running Studio')
	const type = (await call('optix_schema', { project, action: 'type', name: 'AdvancedSVGImage' })).type
	console.log(`AdvancedSVGImage: super ${type.super_type}, ${type.properties_detail.length} properties, methods ${type.methods.map((method) => method.name).join(',')}`)
	assert.equal(type.super_type, 'Container')
	assert.ok(type.properties_detail.some((property) => property.name === 'Path'), JSON.stringify(type.properties_detail))
	const known = await call('optix_schema', { project, action: 'find', query: 'width' })
	assert.ok(known.matches.some((match) => match.kind === 'property' && match.name === 'Width'), JSON.stringify(known.matches))
	const refresh = await call('optix_schema', { project, action: 'refresh' })
	const diff = refresh.dump
	console.log(`refresh: dump ${diff.dump_types} types (module ${diff.studio_version}), catalog ${diff.catalog_types}, added ${diff.added.length}, changed ${diff.changed.length}, same ${diff.same}`)
	assert.ok(Array.isArray(diff.added), JSON.stringify(diff))

	step('W3: a drawing is gated before anything is written')
	const good = await call('optix_svg', { project, action: 'inspect', inline: GOOD })
	console.log(`good drawing conformant ${good.conformant}, controllable ${good.controlable.map((entry) => `${entry.id}[${entry.properties.join('/')}]`).join(' ')}`)
	assert.equal(good.conformant, true, JSON.stringify(good.findings))
	const bad = await call('optix_svg', { project, action: 'inspect', inline: BAD })
	console.log(`bad drawing conformant ${bad.conformant}: ${bad.findings.map((finding) => finding.code).join(', ')}`)
	assert.equal(bad.conformant, false)
	assert.ok(bad.repairs.length > 0, JSON.stringify(bad.findings))

	step('W3: the drawing is placed in the project and bound to an element property')
	const drawing = join(scratch, 'Conveyor.svg')
	await writeFile(drawing, GOOD, 'utf8')
	const panel = await call('optix_edit', {
		project,
		dry_run: false,
		ops: [{ op: 'create_widget', screen: 'UI', name: 'ProbeHardening', widget_type: 'Panel' }]
	})
	assert.equal(panel.status, 'completed', JSON.stringify(panel))
	const added = await call('optix_svg', {
		project,
		action: 'add',
		source: drawing,
		screen: 'UI/ProbeHardening',
		name: 'Art',
		box: { left: 20, top: 20, width: 240, height: 120 }
	})
	console.log(`placed ${added.resource_uri} at ${added.node} (status ${added.status}), path read back ${JSON.stringify(added.read_back)}`)
	assert.equal(added.status, 'completed', JSON.stringify(added))
	assert.equal(added.node, 'UI/ProbeHardening/Art')
	assert.match(added.resource_uri, /^%PROJECTDIR%\/imgs\//u)
	// Measured 2026-11-15: the Web presentation engine fetches /projectfiles/imgs/<name>.svg, so a drawing
	// left in <project>/imgs is a 404 and a blank image. The file has to be under ProjectFiles.
	assert.match(added.file, /ProjectFiles[\\/]imgs[\\/]Art\.svg$/u, added.file)
	assert.ok(existsSync(added.file), `the drawing is on disk at ${added.file}`)

	step('W5: the image with no bound property is reported, and binding one clears it')
	const before = await call('optix_design_check', { project, screen: 'UI/ProbeHardening' })
	const beforeRules = [...new Set((before.findings ?? []).map((finding) => finding.rule))]
	console.log(`before bind: ${beforeRules.join(', ') || '(none)'}`)
	assert.ok(beforeRules.includes('OPTIX-IMG-01'), `the drawing has no element property yet: ${JSON.stringify(before.findings)}`)

	const bound = await call('optix_svg', {
		project,
		action: 'bind',
		node: 'UI/ProbeHardening/Art',
		id: 'Conveyor',
		property: 'Color',
		value: '#2FA8E0'
	})
	console.log(`bound element ${bound.element ?? 'Conveyor'}: value read back ${JSON.stringify(bound.read_back)}`)
	// Binding the same part twice must update it, not fail on the node it created the first time.
	const rebound = await call('optix_svg', {
		project,
		action: 'bind',
		node: 'UI/ProbeHardening/Art',
		id: 'Conveyor',
		property: 'Color',
		value: '#2FA8E0'
	})
	assert.equal(rebound.status, 'completed', JSON.stringify(rebound.validation ?? rebound))
	const listed = await call('optix_svg', { project, action: 'list', screen: 'UI/ProbeHardening' })
	console.log(`list: ${JSON.stringify(listed.images)}`)
	assert.equal(listed.images.length, 1)
	assert.ok(listed.images[0].element_properties.length >= 1, JSON.stringify(listed.images))

	const after = await call('optix_design_check', { project, screen: 'UI/ProbeHardening' })
	const afterRules = [...new Set((after.findings ?? []).map((finding) => finding.rule))]
	console.log(`after bind: ${afterRules.join(', ') || '(none)'}`)
	assert.ok(!afterRules.includes('OPTIX-IMG-01'), `the element property exists now: ${JSON.stringify(after.findings)}`)

	step('W6: an analog variable carries units and range limits as real children')
	await call('optix_edit', {
		project,
		dry_run: false,
		ops: [{ op: 'create_folder', parent: 'Model', name: 'ProbeHardening' }]
	})
	const analog = await call('optix_edit', {
		project,
		dry_run: false,
		ops: [{
			op: 'create_variable',
			parent: 'Model/ProbeHardening',
			name: 'BeltSpeed',
			datatype: 'Float',
			kind: 'analog',
			units: 'm/min',
			range: [0, 120],
			display_name: 'Belt speed',
			array: 4
		}]
	})
	console.log(`create_variable applied ${analog.applied} ops, expanded to ${analog.expanded_ops} bridge calls`)
	for (const note of analog.notes ?? []) console.log(`  note: ${note}`)
	const read = await call('optix_read', {
		project,
		request: { action: 'map', path: 'Model/ProbeHardening/BeltSpeed', mode: 'detail', depth: 2 }
	})
	// `optix_read` wraps the bridge reply, so the tree lives under `response.map`; a `nodes` answer would
	// live under `response` directly.
	const tree = read.response?.map ?? read.map ?? read.response
	const children = (tree?.children ?? []).map((child) => child.name)
	console.log(`children: ${children.join(', ')}`)
	for (const name of ['EngineeringUnits', 'EURange', 'EURangeLow', 'EURangeHigh']) {
		assert.ok(children.includes(name), `${name} missing from ${children.join(', ')}`)
	}

	step('clean up the probe nodes')
	for (const path of ['UI/ProbeHardening', 'Model/ProbeHardening']) {
		const deleted = await call('optix_edit', { project, dry_run: false, ops: [{ op: 'delete', path }] })
		console.log(`deleted ${path}: ${JSON.stringify(deleted.results?.[0] ?? deleted)}`)
	}
	console.log('\nLIVE E2E OK: catalog answered, drawing placed and bound, analog anatomy written, design check ran.\n')
} finally {
	await row.dispose()
	await rm(scratch, { recursive: true, force: true })
}
