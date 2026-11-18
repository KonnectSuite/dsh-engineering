/**
 * Two defects a live session paid for, pinned so they cannot come back.
 *
 * 1. `optix_logs` returned a `Date` for a file's mtime, and the harness refuses a result it cannot represent
 *    exactly: the call failed with "value is not lossless JSON" and the runtime log - the one place a refused
 *    dynamic link is explained - could not be read. (session f7c609cb, 2026-11-16)
 * 2. `optix_emulator` refused `project_root` while every other file-channel tool took it, so a session that
 *    reached for the other spelling lost a step to a naming detail.
 */
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { jsonSafe, jsonTool } from "../packages/optix/lib/json.js";
import { looksLikePath, projectNameFromRoot, projectRef } from "../packages/optix/lib/refs.js";
import { tailFile } from "../packages/optix/lib/logs.js";

/** What the harness requires of a tool's output declaration. */
const output = { schema: { type: "json" }, render: () => [{ type: "text", text: "ok" }] };

test("jsonSafe turns a Date into an ISO string, so a log tail is a representable result", () => {
	const when = new Date("2026-11-16T20:00:00.000Z");
	assert.deepEqual(jsonSafe({ mtime: when }), { mtime: "2026-11-16T20:00:00.000Z" });
	assert.equal(jsonSafe(new Date(Number.NaN)), null);
});

test("jsonSafe maps the values JSON cannot hold exactly", () => {
	assert.deepEqual(jsonSafe({ bad: Number.NaN, worse: Number.POSITIVE_INFINITY }), {
		bad: null,
		worse: null
	});
	assert.deepEqual(jsonSafe([undefined, () => 1, Symbol("s")]), [null, null, null]);
	assert.deepEqual(jsonSafe({ big: 9007199254740993n }), { big: "9007199254740993" });
	assert.deepEqual(jsonSafe(new Map([["a", 1]])), { a: 1 });
	assert.deepEqual(jsonSafe(new Set([1, 2])), [1, 2]);
	assert.deepEqual(jsonSafe(new Error("refused")), { name: "Error", message: "refused" });
});

test("jsonSafe survives a cycle instead of spinning", () => {
	const loop = { name: "loop" };
	loop.self = loop;
	assert.deepEqual(jsonSafe(loop), { name: "loop", self: null });
});

test("jsonSafe keeps a shared sub-object at every place it is used", () => {
	// The shape `optix_render_check` returns: several findings each carrying the same window box. A global
	// visited set nulled every repeat after the first, so the second finding reported `window_box: null`
	// (measured 2026-11-17 on the live served page).
	const box = { x: 0, y: 0, width: 1280, height: 800 };
	const value = {
		findings: [
			{ rule: "VIEW-RENDER-03", evidence: { window_box: box } },
			{ rule: "VIEW-RENDER-03", evidence: { window_box: box } }
		],
		measured: { window_box: box }
	};
	const clean = jsonSafe(value);
	assert.deepEqual(clean.findings[0].evidence.window_box, box);
	assert.deepEqual(clean.findings[1].evidence.window_box, box);
	assert.deepEqual(clean.measured.window_box, box);
	// A shared object is copied, not aliased, so the result is plain JSON.
	assert.deepEqual(JSON.parse(JSON.stringify(clean)), clean);
	// A cycle deeper in the same value is still caught.
	const shared = { name: "shared" };
	const twin = { shared, other: shared };
	twin.self = twin;
	assert.deepEqual(jsonSafe(twin), { shared: { name: "shared" }, other: { name: "shared" }, self: null });
});

test("jsonSafe is idempotent and round-trips through JSON unchanged", () => {
	const value = {
		ok: true,
		when: new Date("2026-11-16T20:00:00.000Z"),
		nan: Number.NaN,
		list: [1, "two", null]
	};
	const once = jsonSafe(value);
	assert.deepEqual(jsonSafe(once), once);
	assert.deepEqual(JSON.parse(JSON.stringify(once)), once);
});

test("jsonTool sanitises whatever a registered tool returns", async () => {
	const tool = jsonTool({
		name: "optix_probe",
		description: "probe",
		parameters: {},
		output,
		async execute() {
			return { mtime: new Date("2026-11-16T20:00:00.000Z"), nan: Number.NaN, missing: void 0 };
		}
	});
	assert.deepEqual(await tool.execute({}, {}), {
		mtime: "2026-11-16T20:00:00.000Z",
		nan: null
	});
});

test("tailFile reports mtime as a string with a numeric twin", async () => {
	const folder = await mkdtemp(join(tmpdir(), "optix-log-"));
	try {
		const path = join(folder, "line.log");
		await writeFile(path, "one\ntwo\nthree", "utf8");
		const tail = await tailFile(path, 2);
		assert.equal(typeof tail.mtime, "string");
		// `mtimeMs` is a float while the ISO form is millisecond-precision, so they agree to a millisecond.
		assert.ok(Math.abs(new Date(tail.mtime).getTime() - tail.mtimeMs) <= 1);
		assert.equal(tail.text, "two\nthree");
		assert.equal(tail.matched, 3);
	} finally {
		await rm(folder, { recursive: true, force: true });
	}
});

test("projectRef accepts either spelling and reads a folder passed as project", () => {
	assert.deepEqual(projectRef({ project: "AryaSMTLineDemo" }), {
		project: "AryaSMTLineDemo",
		root: "",
		provided: true
	});
	assert.deepEqual(projectRef({ project_root: "C:\\x\\AryaSMTLineDemo" }), {
		project: "AryaSMTLineDemo",
		root: "C:\\x\\AryaSMTLineDemo",
		provided: true
	});
	// The exact call the session lost a step to: a folder under the wrong argument name.
	assert.deepEqual(projectRef({ project: "C:/x/AryaSMTLineDemo/" }), {
		project: "AryaSMTLineDemo",
		root: "C:/x/AryaSMTLineDemo/",
		provided: true
	});
	assert.deepEqual(projectRef({}), {
		project: "",
		root: "",
		provided: false
	});
	assert.equal(projectNameFromRoot("C:\\x\\AryaSMTLineDemo.optix"), "AryaSMTLineDemo");
	assert.equal(looksLikePath("AryaSMTLineDemo"), false);
	assert.equal(looksLikePath("./AryaSMTLineDemo"), true);
});
