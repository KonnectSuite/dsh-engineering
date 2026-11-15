import assert from "node:assert/strict";
import test from "node:test";
import {
	NAV_MAX_BUTTONS,
	buttonName,
	handlerChild,
	navTargets,
	panelOpens,
	panelProperty,
	planBar,
	planOps,
	verifyNavigation,
	verifyNext,
	wireOp,
} from "../packages/optix/lib/nav.js";

const TARGETS = [
	{ label: "Home", screen: "UI/Screens/Home" },
	{ label: "Alarms", screen: "UI/Screens/Alarms" },
];

test("navTargets resolves bare names, derives the caption and refuses a duplicate button", () => {
	const resolved = navTargets({ targets: [{ screen: "Home" }, { label: "Alarm page", screen: "UI/Screens/Alarms" }] });
	assert.deepEqual(resolved, [
		{ name: "Nav_Home", label: "Home", screen: "UI/Screens/Home" },
		{ name: "Nav_Alarms", label: "Alarm page", screen: "UI/Screens/Alarms" },
	]);
	assert.throws(() => navTargets({ targets: [] }), /name at least one target/u);
	assert.throws(() => navTargets({ targets: [{ label: "No screen" }] }), /needs screen/u);
	assert.throws(() => navTargets({ targets: [{ screen: "A/Home" }, { screen: "B/Home" }] }), /both become Nav_Home/u);
	assert.throws(() => navTargets({ targets: [{ screen: "UI/Screens/Home", name: "Nav_Home" }, { screen: "UI/Screens/Alarms", name: "Nav_Home" }] }), /both become Nav_Home/u);
	assert.equal(buttonName("UI/Screens/Alarm Summary"), "Nav_Alarm_Summary");
});

test("planBar places the bar in the band above the footer and sizes the buttons", () => {
	const plan = planBar({ window: "UI/MainWindow", width: 1280, height: 800, targets: navTargets({ targets: TARGETS }) });
	assert.deepEqual(plan.bar, { left: 24, top: 664, width: 1232, height: 56 });
	assert.equal(plan.buttons.length, 2);
	assert.equal(plan.buttons[0].path, "UI/MainWindow/Nav_Home");
	assert.equal(plan.buttons[0].slot.height, 44);
	assert.equal(plan.buttons[1].slot.left, plan.buttons[0].slot.left + plan.buttons[0].slot.width + 12);
	assert.equal(plan.buttons[0].exists, false);
});

test("planBar refuses what it cannot lay out instead of clipping it", () => {
	const targets = navTargets({ targets: Array.from({ length: NAV_MAX_BUTTONS + 1 }, (_, index) => ({ screen: `UI/Screens/S${index}` })) });
	assert.throws(() => planBar({ window: "UI/MainWindow", width: 1280, height: 800, targets }), /exceed the 6/u);
	assert.throws(() => planBar({ window: "UI/MainWindow", width: 280, height: 800, targets: navTargets({ targets: TARGETS }) }), /wide/u);
	assert.throws(() => planBar({ window: "UI/MainWindow", width: 1280, height: 200, targets: navTargets({ targets: TARGETS }) }), /no room for a navigation band/u);
	assert.throws(() => planBar({ window: "UI/MainWindow", targets: navTargets({ targets: TARGETS }) }), /needs the window width and height/u);
});

test("planOps creates, restates and wires exactly once", () => {
	const targets = navTargets({ targets: TARGETS });
	const plan = planBar({ window: "UI/MainWindow", width: 1280, height: 800, targets, existing: ["Nav_Home"] });
	const first = planOps(plan, { window: "UI/MainWindow", loader: "UI/MainWindow/MainLoader" });
	const creates = first.ops.filter((op) => op.op === "create_widget");
	assert.deepEqual(creates.map((op) => op.name), ["Nav_Alarms"]);
	assert.equal(first.wiring.length, 2);
	const wire = first.wiring[0];
	assert.deepEqual(wire, {
		op: "wire_event",
		path: "UI/MainWindow/Nav_Home",
		event_type: "MouseClickEvent",
		method_path: "UI/MainWindow/MainLoader/ChangePanel",
		object_raw: "../MainLoader",
		args: "NewPanel=UI/Screens/Home;AliasNode=",
	});
	const texts = first.ops.filter((op) => op.op === "set_property" && op.name === "Text").map((op) => op.path);
	assert.deepEqual(texts, ["UI/MainWindow/Nav_Home", "UI/MainWindow/Nav_Alarms"]);
	assert.ok(first.ops.some((op) => op.op === "set_property" && op.name === "BackgroundColor" && op.value === "#143243"));
	const second = planOps(plan, { window: "UI/MainWindow", loader: "UI/MainWindow/MainLoader", wired: new Set(["Nav_Home", "Nav_Alarms"]) });
	assert.equal(second.wiring.length, 0);
	assert.equal(second.ops.filter((op) => op.op === "wire_event").length, 0);
	assert.throws(() => planOps(plan, { window: "UI/MainWindow" }), /name the loader/u);
});

test("wireOp keeps the loader pointer relative to the button", () => {
	assert.equal(wireOp({ window: "UI/MainWindow", name: "Nav_A", loader: "UI/MainWindow/MainLoader/", target: "UI/Screens/A" }).object_raw, "../MainLoader");
	assert.throws(() => wireOp({ window: "UI/MainWindow", name: "Nav_A", loader: "", target: "UI/Screens/A" }), /PanelLoader/u);
});

test("handlerChild and panelProperty read the bridge's own words", () => {
	assert.equal(handlerChild([{ browse_name: "Text" }, { browse_name: "EH_MouseClickEvent_Nav_Home" }]).browse_name, "EH_MouseClickEvent_Nav_Home");
	assert.equal(handlerChild([{ browse_name: "Text", dotnet_type: "Label" }]), undefined);
	assert.equal(panelProperty({ properties: [{ name: "Width", value: "1024.0" }, { name: "Panel", value: "/Objects/Demo/UI/Screens/Home" }] }), "/Objects/Demo/UI/Screens/Home");
	assert.equal(panelProperty({ properties: [] }), "");
});

test("panelOpens only accepts a readable panel", () => {
	assert.equal(panelOpens("/Objects/Demo/UI/Screens/Home", "UI/Screens/Home"), true);
	assert.equal(panelOpens("g=5f0c9e2a", "UI/Screens/Home"), false);
	assert.equal(panelOpens("ns=3;s=Home", "UI/Screens/Home"), false);
	assert.equal(panelOpens("", "UI/Screens/Home"), false);
	assert.equal(panelOpens("/Objects/Demo/UI/Screens/Alarms", "UI/Screens/Home"), false);
});

/** A page stand-in: records clicks, answers a scripted panel sequence, and hashes differently per step. */
function fakeRuntime({ panels, hash = () => `hash-${Math.random()}` }) {
	const clicks = [];
	let index = 0;
	return {
		clicks,
		page: {
			mouse: { click: (x, y) => clicks.push({ x, y }) },
			waitForTimeout: async () => {},
			screenshot: async () => Buffer.from("frame"),
		},
		panel: async () => {
			const value = panels[Math.min(index, panels.length - 1)];
			index += 1;
			return value;
		},
		hashPage: async () => hash(index),
	};
}

test("verifyNavigation proves a click by the panel it opens", async () => {
	const plan = planBar({ window: "UI/MainWindow", width: 1280, height: 800, targets: navTargets({ targets: TARGETS }) });
	const runtime = fakeRuntime({ panels: ["/Objects/Demo/UI/Screens/Home", "/Objects/Demo/UI/Screens/Alarms", "/Objects/Demo/UI/Screens/Home", "/Objects/Demo/UI/Screens/Alarms"] });
	const result = await verifyNavigation({
		page: runtime.page,
		buttons: plan.buttons,
		panel: runtime.panel,
		hashPage: runtime.hashPage,
	});
	assert.equal(result.status, "verified");
	assert.equal(result.clicked, 2);
	assert.equal(result.proven, 2);
	assert.equal(runtime.clicks.length, 2);
	// The first button whose screen is not already open is clicked first: Home is open, so Alarms goes first.
	assert.equal(result.rows[0].target, "UI/Screens/Alarms");
	assert.equal(result.rows[0].opened, true);
});

test("verifyNavigation reports an unreadable panel as evidence of a repaint, not a pass", async () => {
	const plan = planBar({ window: "UI/MainWindow", width: 1280, height: 800, targets: navTargets({ targets: TARGETS }) });
	const runtime = fakeRuntime({ panels: [""], hash: () => `same-${Math.random()}` });
	const result = await verifyNavigation({
		page: runtime.page,
		buttons: plan.buttons,
		panel: runtime.panel,
		hashPage: runtime.hashPage,
	});
	assert.equal(result.status, "partial");
	assert.equal(result.proven, 0);
	assert.equal(result.unverified, result.clicked);
	assert.equal(result.repaint_only, result.clicked);
	assert.equal(result.rows.every((row) => row.panel_read === false), true);
	assert.equal(result.rows.every((row) => row.ok === false), true);
	assert.match(verifyNext(result), /did not report the loader's Panel value/u);
});

test("verifyNext names the dead buttons", () => {
	const dead = verifyNext({
		status: "partial",
		rows: [{ button: "UI/MainWindow/Nav_Home", ok: false, panel_read: true }],
		unverified: 0,
	});
	assert.match(dead, /did not change the panel: UI\/MainWindow\/Nav_Home/u);
	assert.match(dead, /OPTIX-PROD-01/u);
	assert.match(verifyNext({ status: "verified" }), /Save and Build in Studio/u);
});
