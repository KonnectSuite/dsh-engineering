/**
 * Live screen proof against a running Studio bridge — manual harness, not part of `pnpm test`.
 *
 * Proves `optix_ui action screen` on a real project: the kit catalogue, a strict plan of a designed
 * blueprint against the start window's own canvas, and (opt-in) the apply that writes it. The blueprint
 * is a small operator screen — header band, two KPI tiles, a card of rows and a status strip — because
 * the point is the mechanism, not the content: every component is placed by the layout grid and validated
 * by the bridge before one operation is written.
 *
 *   node test/optix-live-screen.mjs                 # catalogue + plan (reads only)
 *   node test/optix-live-screen.mjs apply           # write the screen behind allowWrites
 *
 * Environment: OPTIX_PROJECT (default AryaOptixTemplate), OPTIX_SCREEN (default UI/Screens/Settings),
 * OPTIX_BRIDGE_URL (default http://127.0.0.1:8768).
 *
 * Requires Studio with the bridge started (`StartBridge`) and `node scripts/assemble.mjs` run after the
 * last `packages/optix/lib/` edit, because the entry loads the vendored build.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const signal = AbortSignal.timeout(300_000);
const apply = (process.argv[2] ?? "").toLowerCase() === "apply";
const mountScreen = (process.argv[2] ?? "").toLowerCase() === "mount";
const assetsOnly = (process.argv[2] ?? "").toLowerCase() === "assets";
const PROJECT = process.env.OPTIX_PROJECT ?? "AryaOptixTemplate";
const SCREEN = process.env.OPTIX_SCREEN ?? "UI/Screens/Settings";
const BRIDGE = process.env.OPTIX_BRIDGE_URL ?? "http://127.0.0.1:8768";
const PROJECT_ROOT = process.env.OPTIX_PROJECT_ROOT ?? join(process.env.USERPROFILE || "", "Desktop", "myWorkspaces", "Optix Demo", PROJECT);

const BLUEPRINT = {
	name: "Settings",
	title: "Line 1 Settings",
	subtitle: "Machine / Line 1",
	pattern: "overview",
	header: { clock: "14:50", user: "Operator", language: "EN", chips: [{ text: "Cycle started", on: true }] },
	kpis: [
		{ label: "OEE", value: 82, unit: "%" },
		{ label: "Output", value: 1240, unit: "pcs" }
	],
	cards: [
		{
			title: "Cutter",
			rows: [
				{ label: "Belt speed", value: 42, unit: "m/min" },
				{ label: "Running", kind: "lamp", on: true },
				{ label: "Load", kind: "bar", percent: 64 }
			]
		}
	],
	status: { text: "Comm. Driver - established", ok: true }
};

async function mount() {
	const module = await import(pathToFileURL(join(root, "entries/optix.js")).href);
	const tools = new Map();
	const disposers = [];
	const attachments = {
		async saveImage({ name, mediaType }) {
			return { attachmentId: `live-${name}`, name, media_type: mediaType, width: 0, height: 0 };
		}
	};
	const scope = {
		tools: { register(definition) { tools.set(definition.name, definition); return () => tools.delete(definition.name); } },
		get: (key) => (key === "attachments" ? attachments : undefined),
		inject: (_names, callback) => callback(scope),
		effect: (factory) => { const dispose = factory(); disposers.push(dispose); return dispose; },
		on: () => () => {},
		emit: () => {},
		plugin: (mod, options) => {
			if (typeof mod?.apply === "function") mod.apply(scope, options);
			return { dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === "function") await dispose(); } };
		},
		provide: () => {},
		logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
	};
	module.apply(scope, module.Config({
		allowWrites: true,
		allowDestructive: true,
		allowInvoke: true,
		preview: true,
		allowPreviewInput: true,
		requestTimeoutMs: 120_000
	}));
	return { tools, dispose: async () => { for (const dispose of disposers.splice(0)) if (typeof dispose === "function") await dispose(); } };
}

function line(label, value) {
	console.log(`${label.padEnd(22)} ${typeof value === "string" ? value : JSON.stringify(value)}`);
}

async function run(name, tools, args) {
	const definition = tools.get(name);
	if (definition === void 0) throw new Error(`tool ${name} is not registered: run node scripts/assemble.mjs`);
	return definition.execute(args, { signal });
}

const harness = await mount();
try {
	const catalogue = await run("optix_ui", harness.tools, { action: "components" });
	line("kit components", catalogue.components.map((entry) => entry.name).join(", "));
	line("adapters", catalogue.adapters?.adapters?.map((adapter) => adapter.kind).join(", ") ?? "(none)");
	assert.ok(catalogue.components.length >= 8);
	assert.ok(catalogue.patterns.includes("overview"));
	assert.ok((catalogue.adapters?.count ?? 0) >= 8);

	if (assetsOnly) {
		// Artwork is written into the project folder itself, not through the bridge: the runtime serves
		// ProjectFiles/imgs and nothing else works.
		const plannedAssets = await run("optix_ui", harness.tools, { action: "assets", project: PROJECT, project_root: PROJECT_ROOT, only: ["home", "alarms", "conveyor"] });
		line("asset plan", `${plannedAssets.count} file(s), written ${plannedAssets.written}`);
		assert.equal(plannedAssets.mode, "plan");
		assert.equal(plannedAssets.written, 0);
		const written = await run("optix_ui", harness.tools, { action: "assets", project: PROJECT, project_root: PROJECT_ROOT, mode: "apply", only: ["home", "alarms", "conveyor"] });
		line("asset apply", `${written.written} written into ${written.dir_relative}`);
		assert.equal(written.mode, "apply");
		assert.ok(written.written >= 3);
		console.log("live art ok");
		process.exit(0);
	}

	// The blueprint draws into a screen that must exist: optix_screen creates and mounts it, and this
	// harness only does that when asked, so a run against someone else's project stays read-only.
	const screenName = SCREEN.split("/").at(-1);
	const exists = await fetch(`${BRIDGE}/bridge/map?path=${encodeURIComponent(SCREEN)}&depth=0&mode=detail`, { signal })
		.then((response) => response.ok)
		.catch(() => false);
	if (!exists) {
		if (!mountScreen) {
			throw new Error(`${SCREEN} does not exist: run this with "mount" to create it with optix_screen first`);
		}
		const mounted = await run("optix_screen", harness.tools, { project: PROJECT, name: screenName, title: BLUEPRINT.title, subtitle: BLUEPRINT.subtitle, cards: [{ title: "STATUS" }], dry_run: false });
		line("mounted", `${SCREEN} (${mounted.status ?? mounted.action ?? "applied"})`);
		if (mounted.status === "refused") {
			const errors = mounted.validation?.errors ?? mounted.validation ?? mounted.error ?? {};
			throw new Error(`optix_screen refused: ${JSON.stringify(errors).slice(0, 1500)}`);
		}

	}

	const planned = await run("optix_ui", harness.tools, {
		action: "screen",
		project: PROJECT,
		screen: SCREEN,
		blueprint: BLUEPRINT,
		mode: "plan"
	});
	line("plan status", planned.status);
	line("canvas", `${planned.layout.width}x${planned.layout.height} (${planned.layout.width_class})`);
	line("operations", planned.op_count);
	line("components", planned.counts.components);
	line("validation", planned.validation?.ok === true ? "ok" : JSON.stringify(planned.validation?.errors ?? planned.validation).slice(0, 400));
	assert.equal(planned.status, "planned", `plan refused: ${JSON.stringify(planned.validation ?? {}).slice(0, 600)}`);
	console.log("live screen plan ok");

	if (apply) {
		const applied = await run("optix_ui", harness.tools, {
			action: "screen",
			project: PROJECT,
			screen: SCREEN,
			blueprint: BLUEPRINT,
			mode: "apply"
		});
		line("apply status", applied.status);
		line("applied", applied.applied);
		assert.equal(applied.status, "applied", `apply refused: ${JSON.stringify(applied).slice(0, 600)}`);
		console.log("live screen apply ok — Save (Ctrl+S) and Build (Ctrl+Shift+B) in Studio to see it");
	}
} finally {
	await harness.dispose();
}
