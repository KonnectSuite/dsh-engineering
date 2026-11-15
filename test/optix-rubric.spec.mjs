import assert from "node:assert/strict";
import test from "node:test";
import { RUBRIC_RULES, UNVERIFIED_RULES, describeScreen, rubricCatalogue, scoreScreen } from "../packages/optix/lib/rubric.js";

const node = (path, type, box = {}, extra = {}) => ({
	path,
	name: path.split("/").pop(),
	type,
	left: box.left ?? 0,
	top: box.top ?? 0,
	width: box.width ?? null,
	height: box.height ?? null,
	font_size: box.font_size ?? null,
	...extra
});

/** A screen that satisfies every rule the rubric can decide. */
const goodScreen = () => {
	const nodes = [
		node("Overview", "Screen", { width: 1280, height: 800 }),
		node("Overview/ShellHeader", "Rectangle", { top: 0, width: 1280, height: 64 }),
		node("Overview/ShellHeader/HeaderTitle", "Label", { left: 20, top: 8, width: 300, height: 28, font_size: 22 }),
		node("Overview/ShellHeader/HeaderChip", "Label", { left: 900, top: 16, width: 120, height: 20, font_size: 12 }),
		node("Overview/ShellHeader/HeaderClock", "Label", { left: 1040, top: 16, width: 80, height: 20, font_size: 12 }),
		node("Overview/ShellRail", "NavigationPanel", { left: 0, top: 64, width: 220, height: 706 }),
		node("Overview/ShellRail/Panels/RailItem1", "NavigationPanelItem", { width: 220, height: 44 }),
		node("Overview/ShellRail/Panels/RailItem2", "NavigationPanelItem", { width: 220, height: 44 }),
		node("Overview/ShellContent", "PanelLoader", { left: 220, top: 64, width: 1060, height: 706 }),
		node("Overview/ShellContent/AlarmGrid1", "AlarmGrid", { left: 240, top: 84, width: 600, height: 400 }),
		node("Overview/ShellFooter", "Rectangle", { top: 770, width: 1280, height: 30 }),
		node("Overview/ShellFooter/StatusText", "Label", { left: 12, top: 778, width: 400, height: 16, font_size: 11 })
	];
	return { name: "Overview", nodes, types: nodes.reduce((map, entry) => map.set(entry.type, (map.get(entry.type) ?? 0) + 1), new Map()) };
};

const goodRequest = () => ({
	screen: goodScreen(),
	language: "modern",
	canvas: { width: 1280, height: 800 },
	engine_refs: {
		"UI/NativePresentationEngine": "UI/Sheet_modern",
		"UI/WebPresentationEngine": "UI/Sheet_modern"
	}
});

test("describeScreen flattens a bridge map reply into the nodes the rubric reads", () => {
	const reply = {
		map: {
			browse_name: "Overview",
			dotnet_type: "Screen",
			properties: { Width: { value: "1280.0" }, Height: { value: "800.0" } },
			children: [
				{
					browse_name: "ShellHeader",
					dotnet_type: "Rectangle",
					properties: { TopMargin: { value: "0.0" }, Height: { value: "64.0" }, Width: { value: "1280.0" } },
					children: [{ browse_name: "HeaderTitle", dotnet_type: "Label", properties: { FontSize: { value: "22.0" } } }]
				}
			]
		}
	};
	const descriptor = describeScreen(reply);
	assert.equal(descriptor.name, "Overview");
	assert.equal(descriptor.nodes.length, 3);
	assert.equal(descriptor.nodes[1].path, "Overview/ShellHeader");
	assert.equal(descriptor.nodes[1].height, 64);
	assert.equal(descriptor.nodes[2].font_size, 22);
	assert.equal(descriptor.types.get("Label"), 1);
});

test("a designed screen grades professional", () => {
	const review = scoreScreen(goodRequest());
	assert.equal(review.score, 100);
	assert.equal(review.grade, "professional");
	assert.deepEqual(review.must_fix, []);
	assert.equal(review.findings.length, 0);
	assert.equal(review.evidence.header.path, "Overview/ShellHeader");
	assert.equal(review.evidence.navigation.items, 2);
	assert.equal(review.evidence.theme.sheets.length, 1);
});

test("a screen without a header band is entry level and names the repair", () => {
	const request = goodRequest();
	request.screen = {
		name: "Bare",
		nodes: [node("Bare", "Screen", { width: 1280, height: 800 }), node("Bare/Card", "Panel", { left: 24, top: 24, width: 400, height: 300 })],
		types: new Map([["Screen", 1], ["Panel", 1]])
	};
	const review = scoreScreen(request);
	const shell = review.findings.find((finding) => finding.rule === "VIEW-SHELL-01");
	assert.equal(shell.severity, "critical");
	assert.match(shell.detail, /no band at the top/u);
	assert.equal(review.grade, "entry-level");
	assert.ok(review.must_fix.some((entry) => entry.rule === "VIEW-SHELL-01" && entry.fix.includes("optix_ui action shell")));
	assert.ok(review.score <= 60);
});

test("navigation is graded on the native panel, not on a row of buttons", () => {
	const request = goodRequest();
	request.screen.nodes = request.screen.nodes.filter((entry) => !entry.type.startsWith("NavigationPanel"));
	request.screen.types.delete("NavigationPanel");
	request.screen.types.delete("NavigationPanelItem");
	const review = scoreScreen(request);
	assert.equal(review.findings.find((finding) => finding.rule === "VIEW-NAV-01").severity, "critical");
	assert.match(review.findings.find((finding) => finding.rule === "VIEW-NAV-01").detail, /no NavigationPanel/u);
});

test("a one-item rail is not navigation", () => {
	const request = goodRequest();
	request.screen.nodes = request.screen.nodes.filter((entry) => !entry.name.endsWith("RailItem2"));
	request.screen.types.set("NavigationPanelItem", 1);
	const review = scoreScreen(request);
	const nav = review.findings.find((finding) => finding.rule === "VIEW-NAV-01");
	assert.match(nav.detail, /has 1 item\(s\)/u);
	assert.equal(nav.path, "Overview/ShellRail");
});

test("a control smaller than a fingertip is a critical finding with its path", () => {
	const request = goodRequest();
	request.screen.nodes.push(node("Overview/ShellContent/CompactButton", "Button", { left: 300, top: 300, width: 30, height: 24 }));
	request.screen.types.set("Button", 1);
	const review = scoreScreen(request);
	const target = review.findings.find((finding) => finding.rule === "HMI-TARGET-01");
	assert.equal(target.severity, "critical");
	assert.equal(target.path, "Overview/ShellContent/CompactButton");
	assert.match(target.detail, /30x24 px/u);
});

test("text below 11 px is a critical finding", () => {
	const request = goodRequest();
	request.screen.nodes.push(node("Overview/ShellFooter/Tiny", "Label", { left: 10, top: 776, width: 100, height: 14, font_size: 9 }));
	request.screen.types.set("Label", 3);
	const review = scoreScreen(request);
	const type = review.findings.find((finding) => finding.rule === "VIEW-TYPE-02");
	assert.equal(type.path, "Overview/ShellFooter/Tiny");
	assert.match(type.detail, /9 px/u);
});

test("two engines pointing at different sheets fails the contrast rule", () => {
	const request = goodRequest();
	request.engine_refs = { "UI/NativePresentationEngine": "UI/Sheet_modern", "UI/WebPresentationEngine": "UI/DefaultStyleSheet" };
	const review = scoreScreen(request);
	const contrast = review.findings.find((finding) => finding.rule === "HMI-CONTRAST-01");
	assert.equal(contrast.severity, "critical");
	assert.match(contrast.detail, /different sheets/u);
	assert.equal(review.grade, "entry-level");
});

test("one engine answering is not the theme either", () => {
	const request = goodRequest();
	request.engine_refs = { "UI/NativePresentationEngine": "UI/Sheet_modern" };
	const review = scoreScreen(request);
	assert.match(review.findings.find((finding) => finding.rule === "HMI-CONTRAST-01").detail, /1 presentation engine/u);
});

test("a drawn screen warns about the missing vendor component and loses a grade point", () => {
	const request = goodRequest();
	request.screen.nodes = request.screen.nodes.filter((entry) => entry.type !== "AlarmGrid");
	request.screen.types.set("AlarmGrid", 0);
	const review = scoreScreen(request);
	assert.equal(review.score, 90);
	assert.equal(review.grade, "professional", "90 is still a professional score: a warning costs 10 and the bar is 85");
	assert.equal(review.findings.find((finding) => finding.rule === "VIEW-ADAPTER-01").severity, "warning");
	assert.ok(review.must_fix.length === 0);
});

test("two warnings drop a designed screen to acceptable", () => {
	const request = goodRequest();
	request.screen.nodes = request.screen.nodes.filter((entry) => entry.type !== "AlarmGrid" && !entry.name.endsWith("HeaderChip"));
	request.screen.types.set("AlarmGrid", 0);
	const review = scoreScreen(request);
	const warnings = review.findings.filter((finding) => finding.severity === "warning");
	assert.equal(warnings.length, 2);
	assert.equal(review.score, 80);
	assert.equal(review.grade, "acceptable");
	assert.equal(review.must_fix.length, 0);
});

test("a header without a title or a chip warns", () => {
	const request = goodRequest();
	request.screen.nodes = request.screen.nodes.filter((entry) => !entry.name.endsWith("HeaderTitle") && !entry.name.endsWith("HeaderChip"));
	request.screen.types.set("Label", 1);
	const review = scoreScreen(request);
	const headerReview = review.findings.filter((finding) => finding.rule === "VIEW-HDR-01");
	assert.ok(headerReview.length >= 1);
	assert.match(headerReview.map((finding) => finding.detail).join(" "), /title|chip/u);
	assert.equal(review.grade, "acceptable");
});

test("screens that disagree about the shell fail consistency even when each one is designed", () => {
	const request = goodRequest();
	const sibling = goodScreen();
	sibling.name = "Sibling";
	sibling.nodes = sibling.nodes.map((entry) => (entry.name === "ShellHeader" ? { ...entry, height: 96 } : entry));
	request.siblings = [sibling];
	const review = scoreScreen(request);
	const consistency = review.findings.find((finding) => finding.rule === "VIEW-CONSIST-01");
	assert.equal(consistency.severity, "critical");
	assert.match(consistency.detail, /Sibling/u);
	assert.equal(review.evidence.consistency.differing.length, 1);
});

test("runtime-only rules are reported and never counted as a pass", () => {
	const review = scoreScreen(goodRequest());
	assert.deepEqual(review.unverified.map((entry) => entry.rule).sort(), Object.keys(UNVERIFIED_RULES).sort());
	assert.equal(review.score, 100, "unverified rules must not change the score");
	const catalogue = rubricCatalogue();
	assert.equal(catalogue.rules.length, Object.keys(RUBRIC_RULES).length);
	assert.match(catalogue.grades.professional, /no critical/u);
});

test("a screen inside a shell inherits the band and the rail from the window", () => {
	const request = goodRequest();
	request.window = request.screen;
	request.screen = {
		name: "Plain",
		nodes: [node("Plain", "Screen", { width: 1280, height: 800 }), node("Plain/DataCard1", "Panel", { left: 240, top: 96, width: 400, height: 300 }), node("Plain/AlarmGrid1", "AlarmGrid", { left: 660, top: 96, width: 560, height: 300 }), node("Plain/N1", "Panel", {}), node("Plain/N2", "Panel", {}), node("Plain/N3", "Panel", {}), node("Plain/N4", "Panel", {}), node("Plain/N5", "Panel", {})],
		types: new Map([["Screen", 1], ["Panel", 6], ["AlarmGrid", 1]])
	};
	const review = scoreScreen(request);
	assert.equal(review.evidence.header.from, "window");
	assert.equal(review.evidence.navigation.from, "window");
	assert.equal(review.grade, "professional", JSON.stringify(review.findings));
});

test("a content host filling the window is not a header band", () => {
	const request = goodRequest();
	request.screen = {
		name: "Hostless",
		nodes: [node("Hostless", "Window", { width: 1280, height: 800 }), node("Hostless/MainLoader", "PanelLoader", { left: 0, top: 0, width: 1280, height: 800 }), node("Hostless/MainLoader/Card", "Panel", { left: 24, top: 24, width: 300, height: 200 })],
		types: new Map([["Window", 1], ["PanelLoader", 1], ["Panel", 1]])
	};
	const review = scoreScreen(request);
	assert.equal(review.evidence.header, null);
	assert.equal(review.findings.find((finding) => finding.rule === "VIEW-SHELL-01").severity, "critical");
});

test("a request without a descriptor is refused by name", () => {
	assert.throws(() => scoreScreen({}), /rubric_needs_screen/u);
});
