/**
 * Live shell proof against a running Studio bridge - manual harness, not part of `pnpm test`.
 *
 * Proves `optix_ui action shell` on a real project: the canvas comes from the start window, the plan is
 * phased (chrome, rail, pointers) and each phase is validated strictly against the model the previous
 * one left, and the opt-in apply writes it.
 *
 *   node test/optix-live-shell.mjs          # plan (reads only)
 *   node test/optix-live-shell.mjs apply    # write the shell behind allowWrites
 *
 * Environment: OPTIX_PROJECT (default AryaOptixTemplate), OPTIX_BRIDGE_URL (default
 * http://127.0.0.1:8768). Requires Studio with the bridge started and `node scripts/assemble.mjs` run
 * after the last `packages/optix/lib/` edit.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const signal = AbortSignal.timeout(300_000);
const apply = (process.argv[2] ?? "").toLowerCase() === "apply";
const PROJECT = process.env.OPTIX_PROJECT ?? "AryaOptixTemplate";
const BRIDGE = process.env.OPTIX_BRIDGE_URL ?? "http://127.0.0.1:8768";
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
	const planned = await run("optix_ui", harness.tools, { action: "shell", project: PROJECT, mode: apply ? "apply" : "plan" });
	line("shell status", planned.status);
	line("canvas", planned.canvas);
	line("layout", planned.layout);
	line("screens", planned.screens.map((entry) => `${entry.name}=${entry.screen}`).join(", "));
	line("phases", planned.phases);
	line("op count", planned.op_count);
	if (planned.validation) line("validation", planned.validation.errors ?? planned.validation);
	if (planned.status === "refused" || planned.status === "refused_phase") {
		throw new Error(`shell refused: ${JSON.stringify(planned.validation?.errors ?? planned.error ?? {}).slice(0, 1500)}`);
	}
	assert.equal(planned.status, apply ? "applied" : "planned");
	if (apply) line("applied", planned.applied);
	console.log(apply ? "live shell apply ok - Save (Ctrl+S) and Build (Ctrl+Shift+B) in Studio to see it" : "live shell plan ok");
} finally {
	await harness.dispose();
}