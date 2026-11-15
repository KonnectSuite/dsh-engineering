import assert from "node:assert/strict";
import test from "node:test";

import { HEADER_HEIGHT, FOOTER_HEIGHT, RAIL_WIDTH, SHELL_NAMES, ShellError, shellAudit, shellPlan } from "../packages/optix/lib/shell.js";

const screens = [
	{ name: "Home", screen: "UI/Screens/Home", title: "Home" },
	{ name: "Alarms", screen: "UI/Screens/Alarms", title: "Alarms" },
	{ name: "Settings", screen: "UI/Screens/Settings", title: "Settings" }
];

const base = { window: "UI/MainWindow", width: 1280, height: 720, language: "modern", screens };

test("shellPlan places four bands around the content on the window canvas", () => {
	const plan = shellPlan(base);
	assert.deepEqual(plan.header, { left: 0, top: 0, width: 1280, height: HEADER_HEIGHT });
	assert.deepEqual(plan.rail, { left: 0, top: HEADER_HEIGHT, width: RAIL_WIDTH, height: 720 - HEADER_HEIGHT - FOOTER_HEIGHT });
	assert.deepEqual(plan.content, { left: RAIL_WIDTH, top: HEADER_HEIGHT, width: 1280 - RAIL_WIDTH, height: 720 - HEADER_HEIGHT - FOOTER_HEIGHT });
	assert.deepEqual(plan.footer, { left: 0, top: 720 - FOOTER_HEIGHT, width: 1280, height: FOOTER_HEIGHT });
	assert.equal(plan.loader, "UI/MainWindow/ShellContent");
	assert.equal(plan.items.length, 3);
	assert.equal(plan.counts.items, 3);
});

test("shellPlan is phased so rail items validate against the rail the chrome created", () => {
	const plan = shellPlan(base);
	assert.deepEqual(plan.phases.map((phase) => phase.name), ["chrome", "rail", "attach", "pointers"]);
	assert.equal(plan.counts.ops, plan.phases.reduce((total, phase) => total + phase.ops.length, 0));
	// Every item is created inside the collection Studio makes with the panel.
	for (const phase of plan.phases.filter((entry) => entry.name === "rail")) {
		for (const op of phase.ops.filter((entry) => entry.op === "create_widget")) assert.match(op.screen, /ShellRail\/Panels$/u);
	}
	// The rail's loader property is materialised in its own batch, then its Value is written.
	assert.deepEqual(plan.phases.find((phase) => phase.name === "attach").ops, [
		{ op: "set_property", path: "UI/MainWindow/ShellRail", name: "AttachedPanelLoader", value: "UI/MainWindow/ShellContent" }
	]);
	// Pointers are written on the pointer's own Value child, in the project-relative spelling.
	for (const op of plan.phases.find((phase) => phase.name === "pointers").ops) {
		assert.equal(op.name, "Value");
		assert.match(String(op.path), /\/(Panel|AttachedPanelLoader)$/u);
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

test("shellPlan reuses a panel loader the window already has", () => {
	const plan = shellPlan({ ...base, loader: "UI/MainWindow/MainLoader", existing: ["MainLoader"] });
	assert.equal(plan.loader, "UI/MainWindow/MainLoader");
	assert.equal(plan.phases[0].ops.some((op) => op.op === "create_widget" && op.name === SHELL_NAMES.content), false);
	// The loader is still pointed at the first screen and attached to the rail.
	assert.ok(plan.phases[3].ops.some((op) => op.path === "UI/MainWindow/MainLoader/Panel" && op.value === "UI/Screens/Home"));
	assert.ok(plan.phases[3].ops.some((op) => op.path.endsWith("ShellRail/AttachedPanelLoader") && op.value === "UI/MainWindow/MainLoader"));
});

test("shellPlan reuses the content host it created last time", () => {
	const plan = shellPlan({ ...base, existing: [SHELL_NAMES.header, SHELL_NAMES.rail, SHELL_NAMES.content, SHELL_NAMES.footer] });
	assert.equal(plan.loader, `UI/MainWindow/${SHELL_NAMES.content}`);
	assert.equal(plan.exists.content, true);
	assert.equal(plan.phases[0].ops.some((op) => op.op === "create_widget" && op.name === SHELL_NAMES.content), false);
	// A second apply still points the host and the rail at the model it just left behind.
	assert.ok(plan.phases[3].ops.some((op) => op.path === `UI/MainWindow/${SHELL_NAMES.content}/Panel`));
});

test("shellPlan clamps the rail width and caps the items", () => {
	assert.equal(shellPlan({ ...base, railWidth: 100 }).rail.width, 160);
	assert.equal(shellPlan({ ...base, railWidth: 400 }).rail.width, 280);
	const many = shellPlan({ ...base, screens: [...screens, { screen: "UI/Screens/A" }, { screen: "UI/Screens/B" }, { screen: "UI/Screens/C" }, { screen: "UI/Screens/D" }] });
	assert.equal(many.items.length, 6);
	assert.equal(many.phases.find((phase) => phase.name === "rail").ops.filter((op) => op.op === "create_widget").length, 6);
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
	assert.deepEqual(missing.findings.map((entry) => entry.rule), ["SHELL-01", "SHELL-02", "SHELL-04"]);
	assert.match(missing.next, /shell/u);
	const unattached = shellAudit({
		window_children: [SHELL_NAMES.header, SHELL_NAMES.rail],
		rail_items: ["RailItem1", "RailItem2"],
		attached_loader: "",
		content_ref: "UI/Screens/Home"
	});
	assert.equal(unattached.ok, false);
	assert.equal(unattached.findings[0].rule, "SHELL-03");
	const empty = shellAudit({
		window_children: [SHELL_NAMES.header, SHELL_NAMES.rail],
		rail_items: ["RailItem1", "RailItem2"],
		attached_loader: "UI/MainWindow/ShellContent",
		content_ref: ""
	});
	assert.equal(empty.ok, true);
	assert.equal(empty.findings[0].severity, "warning");
});
