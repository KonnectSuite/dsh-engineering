/**
 * Build the live reference application on the running Studio bridge, then prove it.
 *
 * Not part of `node scripts/test.mjs`: it needs a Studio with the project open and the bridge started.
 *
 *   node test/optix-live-showcase.mjs status
 *   node test/optix-live-showcase.mjs clean,screens,rail,dialog,status
 *
 * After `dialog` the project holds unsaved work; press Ctrl+S then Ctrl+Shift+B in Studio (runtime stopped),
 * start the runtime with `optix_emulator`, and take the proof screenshots.
 */

import assert from "node:assert/strict";
import { join } from "node:path";
import { mount } from "./optix-live-scope.mjs";

const PROJECT = process.env.OPTIX_PROJECT || "AryaOptixTemplate";
const BRIDGE = process.env.OPTIX_BRIDGE_URL || "http://127.0.0.1:8768";
const PROJECT_ROOT_DIR =
	process.env.OPTIX_PROJECT_ROOT || join(process.env.USERPROFILE || "", "Desktop", "myWorkspaces", "Optix Demo", PROJECT);
const stages = new Set((process.argv[2] || "status").split(",").map((entry) => entry.trim()).filter(Boolean));

const WINDOW = "UI/MainWindow";
const RAIL = `${WINDOW}/ShellRail`;
const CONTENT = `${WINDOW}/ShellContent`;
const SCREENS = ["Overview", "Alarms", "Diagnostics"];
const SCREEN_PATHS = SCREENS.map((name) => `UI/Screens/${name}`);
const line = (label, value) => console.log(`${label.padEnd(24)} ${typeof value === "string" ? value : JSON.stringify(value)}`);

async function post(route, body) {
	const response = await fetch(`${BRIDGE}${route}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body)
	});
	return response.json();
}

async function children(path) {
	const reply = await (await fetch(`${BRIDGE}/bridge/nodes?path=${encodeURIComponent(path)}`)).json();
	return reply.children ?? [];
}

async function exists(path) {
	const parent = path.slice(0, path.lastIndexOf("/"));
	const name = path.slice(path.lastIndexOf("/") + 1);
	return (await children(parent)).some((child) => child.browse_name === name);
}

async function remove(path) {
	if (!(await exists(path))) return false;
	// The delete route takes its target as a query parameter, not in the body (body-only answers `bad_query`).
	const reply = await (
		await fetch(`${BRIDGE}/bridge/node/delete?path=${encodeURIComponent(path)}`, { method: "POST" })
	).json();
	if (reply.error) throw new Error(`delete ${path}: ${JSON.stringify(reply.error)}`);
	return true;
}

const harness = await mount();
const health = await (await fetch(`${BRIDGE}/bridge/health`)).json();
assert.equal(health.project, PROJECT, `the bridge serves ${health.project}, not ${PROJECT}`);

const run = (name, args) => harness.run(name, args);

if (stages.has("clean")) {
	// The rail items point at screens this stage is about to delete, so they go first.
	const railItems = await children(`${RAIL}/Panels`);
	for (const item of railItems) await remove(`${RAIL}/Panels/${item.browse_name}`);
	const removed = [];
	for (const path of [
		...SCREEN_PATHS,
		"UI/Screens/Settings",
		"UI/Screens/UiProbe",
		`${WINDOW}/MainLoader`,
		"UI/DshStyleSheet",
		"UI/Dialogs/DshConfirmDelete",
		"UI/DshDialogs/DshConfirm"
	]) {
		if (await remove(path)) removed.push(path);
	}
	line("removed", removed.length ? removed : "nothing left to remove");
}

if (stages.has("screens")) {
	const blueprints = {
		Overview: {
			pattern: "overview",
			title: "LINE 1 · OVERVIEW",
			subtitle: "live reference build",
			kpis: [
				{ label: "OEE", value: "87", unit: "%" },
				{ label: "Rate", value: "42", unit: "/min" },
				{ label: "Cycle", value: "1.4", unit: "s" }
			],
			// A compact canvas (1060 px is `compact`) carries a chart or cards, not both, so this screen leads
			// with the chart the way the Rockwell demo leads with its temperature chart.
			cards: [],
			chart: { title: "REFLOW OVEN · Temperature", values: [98, 181, 225, 161, 99], labels: ["1", "2", "3", "4", "5"], unit: "°C", threshold: 2 },
			messages: [
				{ title: "Maintenance reminder", text: "Conveyor 1 belt check in 2 days" },
				{ title: "Shift note", text: "Line 1 has run 6 h without a stop" }
			],
			status: { text: "Comm. Driver · Communication established · Station CDSY8", ok: true }
		},
		Alarms: {
			pattern: "overview",
			title: "LINE 1 · ALARMS",
			subtitle: "active and recent, newest first",
			kpis: [
				{ label: "Active", value: "1" },
				{ label: "Unacked", value: "1" },
				{ label: "Cleared today", value: "37" }
			],
			cards: [
				{
					title: "ACTIVE",
					rows: [
						{ label: "Reject jam", kind: "lamp", on: true },
						{ label: "Low air pressure", kind: "lamp", on: false },
						{ label: "Door open", kind: "lamp", on: false }
					]
				},
				{
					title: "RESPONSE",
					rows: [
						{ label: "Acknowledged", value: "12" },
						{ label: "Median ack", value: "8", unit: "s" },
						{ label: "Reset budget", kind: "bar", percent: 45 }
					]
				}
			],
			messages: [{ title: "Reject jam", text: "Station 2 reject gate did not open" }],
			status: { text: "Alarm manager · connected", ok: true }
		},
		Diagnostics: {
			pattern: "overview",
			title: "LINE 1 · DIAGNOSTICS",
			subtitle: "station, network and session",
			kpis: [
				{ label: "Ping", value: "2", unit: "ms" },
				{ label: "Sessions", value: "1" },
				{ label: "Uptime", value: "6.2", unit: "h" }
			],
			cards: [
				{
					title: "NETWORK",
					rows: [
						{ label: "Link", kind: "lamp", on: true },
						{ label: "Packets lost", value: "0", unit: "%" }
					]
				},
				{
					title: "STATION",
					rows: [
						{ label: "Station", value: "CDSY8" },
						{ label: "Cycle state", value: "Started" }
					]
				}
			],
			status: { text: "Diagnostics · sampled 1 s ago", ok: true }
		}
	};
	const screensExisted = [];
	for (const name of SCREENS) {
		// `optix_ui screen` compiles into a screen that exists; a bare `Screen` object is a model write.
		if (await exists(`UI/Screens/${name}`)) {
			screensExisted.push(name);
			continue;
		}
		const reply = await (
			await fetch(
				`${BRIDGE}/bridge/model/object?parent=UI/Screens&name=${encodeURIComponent(name)}&type=Screen`,
				{ method: "POST" }
			)
		).json();
		if (reply.error) throw new Error(`create screen ${name}: ${JSON.stringify(reply.error)}`);
	}
	if (screensExisted.length) line("reused screens", screensExisted);
	for (const name of SCREENS) {
		const result = await run("optix_ui", {
			action: "screen",
			project: PROJECT,
			screen: `UI/Screens/${name}`,
			blueprint: blueprints[name],
			width: 1060,
			height: 706,
			chrome: "none",
			mode: "apply"
		});
		line(`${name}`, `${result.status} ${result.applied ?? 0} ops`);
		assert.equal(result.status, "applied", `${name}: ${JSON.stringify(result.validation ?? result)}`);
	}
}

if (stages.has("rail")) {
	const theme = await run("optix_ui", { action: "theme", project: PROJECT, language: "modern", mode: "apply" });
	line("theme", `${theme.status} ${theme.applied ?? 0} ops`);
	assert.equal(theme.status, "applied", JSON.stringify(theme.validation ?? theme));

	const shell = await run("optix_ui", {
		action: "shell",
		project: PROJECT,
		mode: "apply",
		screens: SCREEN_PATHS
	});
	line("shell", `${shell.status} ${shell.applied ?? 0} ops`);
	assert.equal(shell.status, "applied", JSON.stringify(shell.validation ?? shell));

	const pointer = await run("optix_edit", {
		dry_run: false,
		project: PROJECT,
		ops: [{ op: "set_property", path: `${CONTENT}/Panel`, name: "Value", value: SCREEN_PATHS[0] }]
	});
	line("content pointer", pointer.status ?? JSON.stringify(pointer));

	const items = await children(`${RAIL}/Panels`);
	line("rail items", items.map((item) => item.browse_name));
}

if (stages.has("dialog")) {
	const dialog = await run("optix_ui", {
		action: "dialog",
		project: PROJECT,
		mode: "apply",
		name: "ConfirmResetLine",
		kind: "confirm",
		title: "Reset the line?",
		message: "Reset clears the cycle counters and cannot be undone while the line is running.",
		confirm_label: "Reset",
		cancel_label: "Keep running",
		destructive: true,
		trigger_screen: "UI/Screens/Alarms",
		trigger_name: "BtnResetLine"
	});
	line("dialog", `${dialog.status} ${dialog.applied ?? 0} ops`);
	assert.equal(dialog.status, "applied", JSON.stringify(dialog.validation ?? dialog));
}

if (stages.has("status")) {
	const windowChildren = (await children(WINDOW)).map((child) => child.browse_name);
	line("window", windowChildren);
	for (const item of await children(`${RAIL}/Panels`)) {
		const reply = await (await fetch(`${BRIDGE}/bridge/map?path=${encodeURIComponent(`${RAIL}/Panels/${item.browse_name}`)}&depth=1&mode=detail`)).json();
		const pointer = (reply.map?.children ?? []).find((child) => child.name === "Panel");
		line(`item ${item.browse_name}`, pointer?.ref ?? "(no pointer)");
	}
	for (const engine of ["UI/NativePresentationEngine", "UI/WebPresentationEngine"]) {
		const reply = await (await fetch(`${BRIDGE}/bridge/map?path=${encodeURIComponent(engine)}&depth=1&mode=detail`)).json();
		const pointer = (reply.map?.children ?? []).find((child) => child.name === "StyleSheet");
		line(engine.split("/").pop(), pointer?.ref ?? "(no pointer)");
	}
	for (const screenPath of SCREEN_PATHS) {
		const review = await run("optix_ui", { action: "review", project: PROJECT, screen: screenPath });
		line(
			`review ${screenPath.split("/").pop()}`,
			`${review.status} score=${review.score} grade=${review.grade} must_fix=${(review.must_fix ?? []).map((entry) => entry.rule).join(",") || "none"}`
		);
	}
	line("screens", (await children("UI/Screens")).map((child) => `${child.browse_name}[${child.dotnet_type}]`));
	line("pending", String(health.pending_changes ?? 0));
}

if (stages.has("serve")) {
	// The saved project is what the runtime serves: save and build in Studio first (Ctrl+S then Ctrl+Shift+B).
	const emulator = await run("optix_emulator", { action: "start", project: PROJECT_ROOT_DIR });
	line("runtime", `${emulator.started ? "started" : "reused"} serving=${emulator.serving} ${emulator.status ?? ""}`);
	assert.equal(emulator.serving, true, "the runtime did not answer");

	const before = await run("optix_preview", { request: { action: "text" } });
	line("page", (before.text ?? "").split("\n").slice(0, 6).join(" | "));
	const shot = await run("optix_screenshot", {});
	line("screenshot", shot.path ?? shot.attachment_id ?? JSON.stringify(shot).slice(0, 120));

	// The rail occupies (0,64)-(220,770); the second 44 px tab centres at y = 130.
	await run("optix_preview", { request: { action: "click", x: 110, y: 130 } });
	await new Promise((resolve) => setTimeout(resolve, 900));
	const after = await run("optix_preview", { request: { action: "text" } });
	line("after click", (after.text ?? "").split("\n").slice(0, 6).join(" | "));
	const shot2 = await run("optix_screenshot", {});
	line("screenshot 2", shot2.path ?? shot2.attachment_id ?? JSON.stringify(shot2).slice(0, 120));
}
