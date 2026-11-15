/**
 * Live review proof against a running Studio bridge — manual harness, not part of `pnpm test`.
 *
 * Grades a screen that already exists in the live project against the design rubric, the same way an
 * operator would judge it: a header band with a title, a native navigation panel, fingertip-sized controls,
 * readable type, one theme on both engines, a vendor component and a shell that matches its siblings.
 *
 *   node test/optix-live-review.mjs
 *   node test/optix-live-review.mjs UI/Screens/UiProbe
 *
 * Environment: OPTIX_PROJECT (default AryaOptixTemplate), OPTIX_SCREEN (default UI/Screens/UiProbe),
 * OPTIX_BRIDGE_URL (default http://127.0.0.1:8768).
 *
 * Requires Studio with the bridge started (`StartBridge`) and `node scripts/assemble.mjs` run after the last
 * `packages/optix/lib/` edit, because the entry loads the vendored build. Read-only: it writes nothing.
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(join(root, "entries", "optix.js"));

const screenArg = (process.argv[2] ?? "").toLowerCase();
const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const PROJECT_ROOT = process.env.OPTIX_PROJECT_ROOT || join(process.env.USERPROFILE || "", "Desktop", "myWorkspaces", "Optix Demo", "AryaOptixTemplate");
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const SCREEN = screenArg === "" ? process.env.OPTIX_SCREEN || "UI/Screens/UiProbe" : process.argv[2];

const line = (label, value) => console.log(`${label.padEnd(22)} ${typeof value === "string" ? value : JSON.stringify(value)}`);

/** Mount the shipped entry exactly the way `test/optix-live-nav.mjs` does. */
async function mount() {
	const module = await import(pathToFileURL(join(root, "entries", "optix.js")).href);
	const tools = new Map();
	const disposers = [];
	const attachments = {
		async saveImage({ name, mediaType }) {
			return { attachmentId: `live-${name}`, name, media_type: mediaType, width: 0, height: 0 };
		}
	};
	const scope = {
		tools: {
			register(definition) {
				tools.set(definition.name, definition);
				return () => tools.delete(definition.name);
			}
		},
		get: (key) => (key === "attachments" ? attachments : void 0),
		inject: (names, callback) => callback(scope),
		effect: (factory) => {
			const dispose = factory();
			disposers.push(dispose);
			return dispose;
		},
		on: () => () => {},
		emit: () => {},
		plugin: (module, options) => {
			if (typeof module?.apply === "function") module.apply(scope, options);
			return {
				dispose: async () => {
					for (const dispose of disposers.splice(0)) if (typeof dispose === "function") await dispose();
				}
			};
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
		requestTimeoutMs: 120000
	}));
	const run = async (name, args) => {
		const definition = tools.get(name);
		if (!definition) throw new Error(`unknown tool ${name}; the row registered ${[...tools.keys()].join(", ")}`);
		return definition.execute(args, { signal: AbortSignal.timeout(300000) });
	};
	return { tools, run };
}

const health = await (await fetch(`${BRIDGE}/bridge/health`)).json();
assert.equal(health.project, PROJECT, `the bridge serves ${health.project}, not ${PROJECT}`);
assert.ok((await readFile(join(PROJECT_ROOT, `${PROJECT}.optix`), "utf8")).length > 0, `${PROJECT}.optix not found at ${PROJECT_ROOT}`);
line("project", PROJECT);
line("bridge", `${BRIDGE} (${health.bridge_version})`);
line("screen", SCREEN);

const harness = await mount();
const reviewed = await harness.run("optix_ui", { action: "review", project: PROJECT, screen: SCREEN, language: process.env.OPTIX_LANGUAGE || "modern" });
line("status", reviewed.status);
line("canvas", `${reviewed.canvas.width}x${reviewed.canvas.height}`);
line("nodes", reviewed.nodes);
line("score", `${reviewed.score} (${reviewed.grade})`);
line("must fix", reviewed.must_fix.length);
for (const entry of reviewed.must_fix) line("  critical", `${entry.rule} ${entry.path} - ${entry.detail}`);
for (const entry of reviewed.findings.filter((finding) => finding.severity === "warning")) line("  warning", `${entry.rule} ${entry.path} - ${entry.detail}`);
for (const entry of reviewed.unverified) line("  unverified", `${entry.rule} - ${entry.why}`);
line("next", reviewed.next);

assert.equal(reviewed.status, "reviewed", `review refused: ${JSON.stringify(reviewed).slice(0, 800)}`);
assert.ok(typeof reviewed.score === "number" && reviewed.score >= 0 && reviewed.score <= 100, `score out of range: ${reviewed.score}`);
assert.ok(Array.isArray(reviewed.must_fix), "must_fix is not a list");
assert.ok(reviewed.unverified.length > 0, "the runtime-only rules were not reported");
console.log(`live review ok — ${SCREEN} scored ${reviewed.score} (${reviewed.grade})`);
