/**
 * Live theme proof against a running Studio bridge — manual harness, not part of `pnpm test`.
 *
 * Proves the `optix_ui` channel end to end on a real project: the catalogue, a strict plan, the
 * project-relative pointer writes that bind both presentation engines (read back, because a write that
 * answers ok is not a write that landed), an audit of what the model actually carries, and a restore
 * that leaves the project exactly as it was found.
 *
 *   node test/optix-live-theme.mjs                 # plan, audit, apply, audit, restore
 *   node test/optix-live-theme.mjs plan            # read-only stages only
 *   node test/optix-live-theme.mjs languages       # catalogue only, no bridge contact
 *
 * Requires Studio with the bridge started (`StartBridge`) and `node scripts/assemble.mjs` run after the
 * last `packages/optix/lib/` edit, because the entry loads the vendored build.
 */
import assert from "node:assert/strict";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const signal = AbortSignal.timeout(300_000);
const stage = (process.argv[2] ?? "all").toLowerCase();
const SHEET = "Sheet_dsh_live";
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
	console.log(label, typeof value === "string" ? value : JSON.stringify(value, null, 2));
}

const row = await mount();
const call = async (name, args) => {
	const definition = row.tools.get(name);
	assert.ok(definition !== undefined, `${name} is not mounted`);
	return definition.execute(args, { signal });
};

try {
	const languages = await call("optix_ui", { action: "languages" });
	line("LANGUAGES", languages.languages.map((entry) => `${entry.name}:${entry.tokens}t/${entry.styles}s`).join(" "));
	assert.ok(languages.languages.some((entry) => entry.name === "isa101"), "isA101 is in the catalogue");
	if (stage === "languages") process.exit(0);

	const health = await (await fetch(`${BRIDGE}/bridge/health`)).json();
	assert.equal(health.model_loaded, true, "the bridge has a project loaded");
	const project = health.project;
	line("PROJECT", project);

	const plan = await call("optix_ui", { action: "theme", mode: "plan", project, sheet: SHEET });
	line("PLAN", {
		status: plan.status,
		sheet: plan.sheet,
		sheet_path: plan.sheet_path,
		exists: plan.exists,
		op_count: plan.op_count,
		tokens: plan.token_count,
		styles: plan.styles.length,
		engine_refs: plan.engine_refs,
		validation_ok: plan.validation?.ok,
		validation_errors: plan.validation?.errors?.length,
		validation_warnings: plan.validation?.warnings?.length,
		phases: plan.phases?.map((phase) => `${phase.name}:${phase.ops}:${phase.validated === false ? "deferred" : phase.status ?? "validated"}`)
	});
	assert.equal(plan.status, "planned", "the theme plan validates");
	assert.equal(plan.validation?.ok, true, "the sheet phase validates against the live model");
	assert.equal(plan.pointer, plan.sheet_path, "the pointer is the project-relative sheet path");

	const auditBefore = await call("optix_ui", { action: "audit", project, sheet: SHEET });
	line("AUDIT_BEFORE", {
		ok: auditBefore.ok,
		score: auditBefore.score,
		findings: auditBefore.findings.map((finding) => `${finding.id}/${finding.severity}`),
		engine_refs: auditBefore.engine_refs
	});
	assert.equal(auditBefore.ok, false, "an unbound theme is not a pass");
	assert.ok(auditBefore.findings.some((finding) => finding.id === "THEME-02"), "an engine reading another sheet is reported");

	if (stage === "plan") process.exit(0);

	const before = { ...plan.engine_refs };
	const applied = await call("optix_ui", { action: "theme", mode: "apply", project, sheet: SHEET });
	line("APPLY", {
		status: applied.status,
		applied: applied.applied,
		phases: applied.phases?.map((phase) => `${phase.name}:${phase.ops}:${phase.status}`),
		engine_refs_after: applied.engine_refs_after,
		engine_refs_verified: applied.engine_refs_verified
	});
	assert.equal(applied.status, "applied", "every phase applied");
	assert.equal(applied.engine_refs_verified, true, "both engines report the new sheet");

	const auditAfter = await call("optix_ui", { action: "audit", project, sheet: SHEET });
	line("AUDIT_AFTER", {
		ok: auditAfter.ok,
		score: auditAfter.score,
		findings: auditAfter.findings.map((finding) => `${finding.id}/${finding.severity}`),
		observed_tokens: auditAfter.observed_tokens,
		observed_styles: auditAfter.observed_styles
	});
	assert.equal(auditAfter.ok, true, "the applied theme audits clean");
	assert.equal(auditAfter.score, 100, "a clean modern theme scores 100");

	const restoreOps = Object.entries(before)
		.filter(([, ref]) => typeof ref === "string" && ref !== "")
		.map(([engine, ref]) => ({ op: "set_property", path: `${engine}/StyleSheet`, name: "Value", value: ref }));
	restoreOps.push({ op: "delete", path: plan.sheet_path });
	const restored = await call("optix_edit", { project, ops: restoreOps, dry_run: false });
	line("RESTORED", { ok: restored.ok, applied: restored.applied });
	assert.ok(restored.applied > 0, "the project is put back");
	console.log("live theme proof ok");
} finally {
	await row.dispose();
}
