import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { pointerFacts, productionFindings, reachableScreens, walkTree } from "../packages/optix/lib/production.js";

const plugin = readFileSync(new URL("../packages/optix/lib/index.js", import.meta.url), "utf8");

/** A handler node shaped the way the bridge's map tree reports one. */
const handlerWith = (pointerChildren, ref) => ({
	type: "EventHandler",
	name: "EH_MouseClickEvent_Nav1",
	children: [{
		name: "MethodsToCall",
		coll: "IUAObject",
		children: [{
			name: "MethodContainer1",
			type: "UAObject",
			children: [
				{
					name: "ObjectPointer",
					type: "NodePointer",
					...(ref === undefined ? {} : { ref }),
					children: pointerChildren
				},
				{ name: "Method", type: "UAVariable" }
			]
		}]
	}]
});

test("a pointer that still names the design-time object is the failure the runtime reports", () => {
	const absolute = pointerFacts(handlerWith([{ name: "Kind" }], "Root/Objects/AryaNewHMIProject_IPC/UI/MainWindow/MainLoader"));
	assert.equal(absolute.absolute, true);
	assert.equal(absolute.builtin, false);
	// A builtin singleton resolves in every session, so it is not the same defect.
	const builtin = pointerFacts(handlerWith([{ name: "Kind" }], "Root/Objects/Commands/VariableCommands"));
	assert.equal(builtin.absolute, false);
	assert.equal(builtin.builtin, true);
});

test("a pointer made of a relative dynamic link is the shape that survives a session", () => {
	const facts = pointerFacts(handlerWith([{ name: "Kind" }, { name: "DynamicLink" }], "../../../../../MainLoader@NodeId"));
	assert.equal(facts.present, true);
	assert.equal(facts.absolute, false);
	assert.equal(facts.linked, true);
	assert.equal(facts.hasKind, true);
});

test("shell-bar targets reach every panel, so shell navigation is not counted twice", () => {
	const edges = new Map([["UI/Screens/Home", ["UI/Screens/Pumps"]]]);
	assert.deepEqual([...reachableScreens("UI/Screens/Home", edges)].sort(), ["UI/Screens/Home", "UI/Screens/Pumps"]);
	// Without the shared shell edges the other screen looks unreachable...
	assert.deepEqual([...reachableScreens("UI/Screens/Home", edges)].includes("UI/Screens/Alarms"), false);
	// ...and with them it is reachable from any panel.
	const withShell = reachableScreens("UI/Screens/Home", edges, ["UI/Screens/Alarms"]);
	assert.equal(withShell.has("UI/Screens/Alarms"), true);
});

test("the walk describes widgets and handlers, never the property variables under them", () => {
	const tree = {
		name: "UI",
		type: "UAObject",
		children: [
			{ name: "Screens", coll: "IUAObject", children: [{ name: "Home", type: "ScreenType", children: [{ name: "LeftMargin", type: "UAVariable" }] }] }
		]
	};
	const paths = [];
	walkTree(tree, "UI", (entry, path) => paths.push(path));
	assert.deepEqual(paths, ["UI", "UI/Screens", "UI/Screens/Home"]);
});

test("a ready application reports no findings, and an absolute pointer stops the release", () => {
	const ready = productionFindings({
		projectName: "AryaNewHMIProject_IPC",
		screensFolder: "UI/Screens",
		screens: [{ path: "UI/Screens/Home", name: "Home" }],
		handlers: [],
		engines: [{ path: "UI/WebPresentationEngine", startingUser: "UI/Users/Operator" }],
		startTarget: "UI/Screens/Home",
		hasApplicationStyleSheet: true
	});
	assert.equal(ready.verdict, "ready");

	const blocked = productionFindings({
		projectName: "AryaNewHMIProject_IPC",
		screensFolder: "UI/Screens",
		screens: [{ path: "UI/Screens/Home", name: "Home" }],
		handlers: [{
			path: "UI/Screens/Home/Nav1/EH_MouseClickEvent_Nav1",
			owner: "UI/Screens/Home/Nav1",
			screen: "UI/Screens/Home",
			pointer: { present: true, absolute: true, linked: true, ref: "Root/Objects/AryaNewHMIProject_IPC/UI/MainWindow/MainLoader" }
		}],
		engines: [],
		startTarget: "UI/Screens/Home",
		hasApplicationStyleSheet: true
	});
	assert.equal(blocked.verdict, "not_ready");
	assert.equal(blocked.findings[0].rule, "OPTIX-PROD-01");
	assert.match(blocked.findings[0].fix, /repair:true/u);
});

test("a panel target that is not a screen is the dead navigation button", () => {
	const report = productionFindings({
		projectName: "AryaNewHMIProject_IPC",
		screensFolder: "UI/Screens",
		screens: [{ path: "UI/Screens/Home", name: "Home" }],
		handlers: [{
			path: "UI/MainWindow/Nav_Gone/EH_MouseClickEvent_Nav_Gone",
			owner: "UI/MainWindow/Nav_Gone",
			screen: undefined,
			pointer: { present: true, absolute: false, linked: true, ref: "../../MainLoader@NodeId" },
			target: "/Objects/AryaNewHMIProject_IPC/UI/Screens/Gone"
		}],
		engines: [],
		startTarget: "UI/Screens/Home",
		hasApplicationStyleSheet: true,
		shellPath: "UI/MainWindow"
	});
	assert.equal(report.verdict, "not_ready");
	assert.equal(report.findings.some((finding) => finding.rule === "OPTIX-PROD-02" && /Gone/u.test(finding.message)), true);
});

test("an engine on the built-in starting user is a release warning, not a silent default", () => {
	const report = productionFindings({
		projectName: "AryaNewHMIProject_IPC",
		screensFolder: "UI/Screens",
		screens: [{ path: "UI/Screens/Home", name: "Home" }],
		handlers: [],
		engines: [{ path: "UI/WebPresentationEngine", startingUser: "2/46" }],
		startTarget: "UI/Screens/Home",
		hasApplicationStyleSheet: true
	});
	assert.equal(report.verdict, "review");
	assert.equal(report.findings[0].rule, "OPTIX-PROD-04");
	assert.match(report.findings[0].message, /built-in user/u);
});

test("the tool reads the project once with ids, and repairs through the pointer property", () => {
	// The bridge only reports node ids for ids=1; ids=true silently yields none.
	assert.match(plugin, /ids: 1,/u);
	assert.match(plugin, /optix_production_check/u);
	assert.match(plugin, /name: "Value",\s*\n\s*value: ""/u);
	assert.match(plugin, /"node\/property"/u);
});
