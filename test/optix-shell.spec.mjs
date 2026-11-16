import assert from "node:assert/strict";
import test from "node:test";

import { HEADER_HEIGHT, FOOTER_HEIGHT, RAIL_WIDTH, SHELL_MAX_RAIL, SHELL_NAMES, ShellError, shellAudit, shellPlan } from "../packages/optix/lib/shell.js";

const screens = [
	{ name: "Home", screen: "UI/Screens/Home", title: "Home" },
	{ name: "Alarms", screen: "UI/Screens/Alarms", title: "Alarms" },
	{ name: "Settings", screen: "UI/Screens/Settings", title: "Settings" }
];

const base = { window: "UI/MainWindow", width: 1280, height: 720, language: "modern", screens };

test("shellPlan surrounds the native navigation panel with a header and a status strip", () => {
	const plan = shellPlan(base);
	assert.deepEqual(plan.header, { left: 0, top: 0, width: 1280, height: HEADER_HEIGHT });
	// The native panel hosts the panels it switches, so the rail fills the content area and its tab strip is
	// the left column; a separate loader beside it never got driven in the runtime.
	assert.deepEqual(plan.rail, { left: 0, top: HEADER_HEIGHT, width: 1280, height: 720 - HEADER_HEIGHT - FOOTER_HEIGHT });
	assert.deepEqual(plan.content, { left: RAIL_WIDTH, top: HEADER_HEIGHT, width: 1280 - RAIL_WIDTH, height: 720 - HEADER_HEIGHT - FOOTER_HEIGHT });
	assert.deepEqual(plan.footer, { left: 0, top: 720 - FOOTER_HEIGHT, width: 1280, height: FOOTER_HEIGHT });
	assert.equal(plan.loader, "");
	assert.equal(plan.counts.items, 3);
});

test("shellPlan is phased so rail items validate against the rail the chrome created", () => {
	const plan = shellPlan(base);
	assert.deepEqual(plan.phases.map((phase) => phase.name), ["chrome", "rail", "pointers"]);
	assert.equal(plan.counts.ops, plan.phases.reduce((total, phase) => total + phase.ops.length, 0));
	// Every item is created inside the collection Studio makes with the panel.
	for (const phase of plan.phases.filter((entry) => entry.name === "rail")) {
		for (const op of phase.ops.filter((entry) => entry.op === "create_widget")) assert.match(op.screen, /ShellRail\/Panels$/u);
	}
	// The chrome creates no loader: the native panel is the content host.
	assert.equal(plan.phases[0].ops.some((op) => op.op === "create_widget" && op.widget_type === "PanelLoader"), false);
	// Pointers are written on the item's own Panel Value child, in the project-relative spelling.
	for (const op of plan.phases.find((phase) => phase.name === "pointers").ops) {
		assert.equal(op.name, "Value");
		assert.match(String(op.path), /\/Panel$/u);
		assert.match(String(op.value), /^UI\//u);
	}
});

test("shellPlan restates the bands it did not create", () => {
	const plan = shellPlan({ ...base, existing: [SHELL_NAMES.header, SHELL_NAMES.rail, SHELL_NAMES.footer] });
	const creates = plan.phases[0].ops.filter((op) => op.op === "create_widget").map((op) => op.name);
	assert.equal(creates.includes(SHELL_NAMES.header), false);
	assert.equal(creates.includes(SHELL_NAMES.rail), false);
	assert.equal(creates.includes(SHELL_NAMES.footer), false);
	assert.ok(creates.includes(SHELL_NAMES.title));
	// A restated band still carries its geometry, so a second apply repairs a drifted shell.
	assert.ok(plan.phases[0].ops.some((op) => op.path === `UI/MainWindow/${SHELL_NAMES.header}` && op.name === "Width"));
	assert.equal(plan.counts.created, creates.length);
});

test("a loader argument changes no node: the native panel is the content host", () => {
	const plan = shellPlan({ ...base, loader: "UI/MainWindow/MainLoader", existing: ["MainLoader"] });
	// Reported back for compatibility, but nothing is created, placed or pointed at it.
	assert.equal(plan.loader, "UI/MainWindow/MainLoader");
	assert.equal(plan.phases[0].ops.some((op) => op.op === "create_widget" && op.name === "MainLoader"), false);
	assert.equal(plan.ops.some((op) => String(op.path ?? "").includes("MainLoader")), false);
});

test("shellPlan reuses the rail and its items on a second apply", () => {
	const first = shellPlan(base);
	const second = shellPlan({ ...base, existing: [SHELL_NAMES.header, SHELL_NAMES.rail, SHELL_NAMES.footer], existingItems: first.items.map((item) => item.name) });
	assert.equal(second.phases.find((phase) => phase.name === "rail").ops.filter((op) => op.op === "create_widget").length, 0);
	// The items still point at their screens, so a second apply repairs a drifted pointer without a duplicate.
	assert.equal(second.phases.find((phase) => phase.name === "pointers").ops.length, 3);
});

test("shellPlan clamps the tab strip width and caps the items", () => {
	// The tab strip is the left column of the native panel; the panel itself fills the content area.
	assert.equal(shellPlan({ ...base, railWidth: 100 }).content.left, 160);
	assert.equal(shellPlan({ ...base, railWidth: 400 }).content.left, 280);
	assert.equal(shellPlan({ ...base, railWidth: 100 }).rail.width, 1280);
	const many = shellPlan({ ...base, screens: [...screens, ...Array.from({ length: SHELL_MAX_RAIL + 3 }, (_, index) => ({ screen: `UI/Screens/Extra${index}` }))] });
	// The cap is the module's own contract, so raising it does not leave a stale expectation behind.
	assert.equal(many.items.length, SHELL_MAX_RAIL);
	assert.equal(many.phases.find((phase) => phase.name === "rail").ops.filter((op) => op.op === "create_widget").length, SHELL_MAX_RAIL);
});

test("shellPlan refuses what cannot be a rail", () => {
	assert.throws(() => shellPlan({ ...base, window: "" }), (error) => error instanceof ShellError && error.code === "shell_no_window");
	assert.throws(() => shellPlan({ ...base, width: 0 }), (error) => error.code === "shell_no_canvas");
	assert.throws(() => shellPlan({ ...base, width: 800 }), (error) => error.code === "shell_too_narrow");
	assert.throws(() => shellPlan({ ...base, screens: [screens[0]] }), (error) => error.code === "shell_no_screens");
	assert.throws(() => shellPlan({ ...base, screens: [{ screen: "" }] }), /at least two screens/u);
});

test("shellAudit passes a shell that has all four bands", () => {
	const audit = shellAudit({
		window_children: [SHELL_NAMES.header, SHELL_NAMES.rail, SHELL_NAMES.footer, SHELL_NAMES.status],
		rail_items: ["RailItem1", "RailItem2"],
		attached_loader: "UI/MainWindow/ShellContent",
		content_ref: "UI/Screens/Home"
	});
	assert.equal(audit.ok, true);
	assert.equal(audit.score, 100);
});

test("shellAudit names what is missing", () => {
	const missing = shellAudit({ window_children: [], rail_items: [], attached_loader: "", content_ref: "" });
	assert.equal(missing.ok, false);
	assert.deepEqual(missing.findings.map((entry) => entry.rule), ["SHELL-01", "SHELL-02"]);
	assert.match(missing.next, /shell/u);
	const onlyBands = shellAudit({ window_children: [SHELL_NAMES.header, SHELL_NAMES.rail], rail_items: ["RailItem1", "RailItem2"], attached_loader: "", content_ref: "" });
	assert.equal(onlyBands.ok, true);
	assert.equal(onlyBands.findings.length, 0);
});
