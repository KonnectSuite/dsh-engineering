/**
 * Live proof for `optix_ui action dialog` against a running FactoryTalk Optix Studio bridge.
 *
 * Not part of `node scripts/test.mjs`: it needs a Studio with the project open and the bridge started
 * (`StudioMCPBridge` -> StartBridge), so it is a manual harness like `test/optix-live-theme.mjs`.
 *
 *   node test/optix-live-dialog.mjs          # plan only (nothing is written)
 *   node test/optix-live-dialog.mjs apply    # write the dialog behind allowWrites
 *
 * The plan is phased because a Dialog object type does not exist while its children validate: the
 * folder and the type are created first, then their labels and buttons, then the closing commands.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(join(root, "entries", "optix.js"));

const apply = (process.argv[2] ?? "").toLowerCase() === "apply";
const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const PROJECT_ROOT = process.env.OPTIX_PROJECT_ROOT || join(process.env.USERPROFILE || "", "Desktop", "myWorkspaces", "Optix Demo", "AryaOptixTemplate");
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const TRIGGER_SCREEN = process.env.OPTIX_TRIGGER_SCREEN || "UI/Screens/UiProbe";

const line = (label, value) => console.log(`${label.padEnd(22)} ${typeof value === "string" ? value : JSON.stringify(value)}`);

/**
 * Mount the shipped entry exactly the way `test/optix-live-nav.mjs` does.
 *
 * @returns The mounted harness `{tools, run}`.
 */
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
line("pending changes", String(health.pending_changes ?? 0));

const harness = await mount();
const planned = await harness.run("optix_ui", {
	action: "dialog",
	project: PROJECT,
	mode: "plan",
	name: "DshConfirmDelete",
	kind: "confirm",
	title: "Delete this recipe?",
	message: "The recipe is removed from this machine. This cannot be undone.",
	confirm_label: "Delete",
	cancel_label: "Keep",
	destructive: true,
	trigger_screen: TRIGGER_SCREEN,
	trigger_name: "BtnDeleteRecipe"
});
line("dialog status", planned.status);
line("dialog", planned.dialog);
line("buttons", planned.buttons.map((button) => button.label).join(" / "));
line("exists", planned.exists);
line("phases", planned.phases);
line("op count", planned.op_count);
line("validation", planned.validation ?? []);
assert.equal(planned.status, "planned", `dialog plan refused: ${JSON.stringify(planned.validation ?? planned.error ?? {}).slice(0, 1500)}`);

if (!apply) {
	console.log("live dialog plan ok - run with apply to write it");
	process.exit(0);
}

const applied = await harness.run("optix_ui", {
	action: "dialog",
	project: PROJECT,
	mode: "apply",
	name: "DshConfirmDelete",
	kind: "confirm",
	title: "Delete this recipe?",
	message: "The recipe is removed from this machine. This cannot be undone.",
	confirm_label: "Delete",
	cancel_label: "Keep",
	destructive: true,
	trigger_screen: TRIGGER_SCREEN,
	trigger_name: "BtnDeleteRecipe"
});
line("dialog status", applied.status);
line("phases", applied.phases);
line("applied", applied.applied);
if (applied.status !== "applied") {
	console.log(JSON.stringify(applied.validation ?? applied.error ?? {}, null, 2));
	assert.fail(`dialog apply ${applied.status}`);
}

// Read the model back: the type, its two buttons, and the trigger that opens it.
const readBack = async (path) => {
	const response = await fetch(`${BRIDGE}/bridge/map?depth=1&mode=detail&path=${encodeURIComponent(path)}`);
	return response.json();
};
const type = await readBack("UI/Dialogs/DshConfirmDelete");
line("type children", type.map?.children?.map((child) => child.name).join(", ") ?? "(missing)");
const trigger = await readBack(`${TRIGGER_SCREEN}/BtnDeleteRecipe`);
line("trigger", trigger.map?.name ?? "(missing)");
assert.equal(applied.status, "applied");
console.log("live dialog apply ok - save with optix_save (a dialog is model data, so no build is needed), then click BtnDeleteRecipe in the runtime");
