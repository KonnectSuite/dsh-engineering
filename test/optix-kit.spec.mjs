import assert from "node:assert/strict";
import test from "node:test";

import {
	COLUMNS,
	LayoutError,
	PAD,
	columns,
	contains,
	grid,
	overlaps,
	rect,
	region,
	requireSlot,
	row,
	stack,
	widthClass
} from "../packages/optix/lib/layout.js";
import { compileBlueprint, kitCatalogue, kitTheme } from "../packages/optix/lib/kit.js";

/** A rectangle inside another, for the placement assertions. */
function inside(outer, inner) {
	return inner.left >= outer.left - 0.5
		&& inner.top >= outer.top - 0.5
		&& inner.left + inner.width <= outer.left + outer.width + 0.5
		&& inner.top + inner.height <= outer.top + outer.height + 0.5;
}

test("widthClass classifies a canvas and refuses a nonsense width", () => {
	assert.equal(widthClass(1024), "compact");
	assert.equal(widthClass(1280), "standard");
	assert.equal(widthClass(1700), "standard");
	assert.equal(widthClass(1920), "wide");
	assert.throws(() => widthClass(0), (error) => error instanceof LayoutError && error.code === "layout_invalid_canvas");
	assert.throws(() => widthClass(Number.NaN), /positive width/);
});

test("grid gives twelve columns with a floor, and refuses a canvas too narrow to hold them", () => {
	const wide = grid(1280);
	assert.equal(wide.columns, COLUMNS);
	assert.equal(wide.pad, PAD);
	assert.equal(wide.starts.length, COLUMNS);
	assert.equal(wide.usable, 1280 - 2 * PAD);
	assert.ok(wide.column > 60 && wide.column < 90, `column ${wide.column}`);
	assert.equal(wide.starts[0], PAD);
	assert.ok(Math.abs(wide.starts.at(-1) + wide.column - (1280 - PAD)) < 0.5);
	assert.throws(() => grid(400), (error) => error instanceof LayoutError && error.code === "layout_too_narrow");
});

test("region reserves the header, the footer and the padding", () => {
	const area = region({ width: 1280, height: 720, header: 88, footer: 56 });
	assert.deepEqual(area, { left: 24, top: 112, width: 1232, height: 720 - 88 - 56 - 48 });
	assert.throws(() => region({ width: 1280, height: 200, header: 88, footer: 56 }), /leaves -?4[0-9]px|content/);
});

test("stack and columns split by weight and refuse what cannot fit", () => {
	const area = rect(0, 0, 1000, 400);
	const rows = stack(area, [2, 1], { gutter: 20 });
	assert.equal(rows.length, 2);
	assert.ok(rows[0].height > rows[1].height);
	assert.equal(rows[1].top, 20 + rows[0].height);
	assert.throws(() => stack(rect(0, 0, 1000, 100), [1, 1, 1]), (error) => error instanceof LayoutError && error.code === "layout_overflow");
	const sideBySide = columns(area, [1, 1, 1], { gutter: 20 });
	assert.equal(sideBySide.length, 3);
	assert.ok(sideBySide.every((entry) => inside(area, entry)));
	assert.throws(() => columns(rect(0, 0, 300, 100), [1, 1, 1]), /floor/);
});

test("row places a count of components and names the shortfall when they do not fit", () => {
	const slots = row(rect(0, 0, 1200, 100), 4);
	assert.equal(slots.length, 4);
	assert.ok(slots.every((entry) => inside(rect(0, 0, 1200, 100), entry)));
	assert.throws(() => row(rect(0, 0, 500, 100), 4), (error) => error instanceof LayoutError && error.code === "layout_overflow");
	assert.throws(() => row(rect(0, 0, 500, 100), 0), /positive component count/);
});

test("contains, overlaps and requireSlot refuse a slot that escapes or is too small", () => {
	const outer = rect(0, 0, 100, 100);
	assert.equal(contains(outer, rect(10, 10, 20, 20)), true);
	assert.equal(contains(outer, rect(90, 90, 20, 20)), false);
	assert.equal(overlaps(rect(0, 0, 50, 50), rect(25, 25, 50, 50)), true);
	assert.equal(overlaps(rect(0, 0, 50, 50), rect(50, 50, 10, 10)), false);
	assert.equal(requireSlot(rect(0, 0, 100, 44), "panel", { container: outer }).height, 44);
	assert.throws(() => requireSlot(rect(0, 0, 20, 20), "lamp"), /floor/);
	assert.throws(() => requireSlot(rect(90, 90, 50, 50), "panel", { container: outer }), /escape/);
});

test("kitTheme projects a language into colours and a type scale", () => {
	const modern = kitTheme("modern");
	assert.equal(modern.name, "modern");
	for (const value of Object.values(modern.colours)) assert.match(value, /^#[0-9A-F]{6}$/u);
	assert.ok(modern.type.title > modern.type.body);
	assert.ok(modern.type.body >= 14);
	assert.equal(kitTheme("").name, "modern");
	assert.throws(() => kitTheme("neon-zoo"), /no design language/u);
});

test("compileBlueprint builds a full chrome screen that only names nodes it created", () => {
	const result = compileBlueprint({
		title: "Line 1 overview",
		subtitle: "Assembly / Line 1",
		pattern: "overview",
		header: { clock: "14:50", user: "M. Rosal", language: "EN", chips: [{ text: "Cycle started", on: true }] },
		kpis: [{ label: "OEE", value: 82, unit: "%" }, { label: "Output", value: 1240, unit: "pcs" }],
		cards: [{ title: "Cutter", rows: [{ label: "Belt speed", value: 42, unit: "m/min" }, { label: "Running", kind: "lamp", on: true }, { label: "Load", kind: "bar", percent: 64 }] }],
		chart: { title: "Reflow oven", values: [98, 181, 225, 61, 9], labels: ["1", "2", "3", "4", "5"], threshold: 2, unit: "°C" },
		messages: [{ title: "Maintenance reminder", text: "Conveyor 1 belt: 2 days left" }],
		status: { text: "Comm. Driver - established", ok: true }
	}, { screen: "UI/Screens/Home", width: 1280, height: 720 });

	assert.ok(result.ops.length > 60, `operations ${result.ops.length}`);
	const created = new Set();
	for (const op of result.ops) {
		if (op.op === "create_widget") {
			assert.equal(op.screen.startsWith("UI/Screens/Home"), true, op.screen);
			const path = `${op.screen}/${op.name}`;
			assert.equal(created.has(path), false, `duplicate node ${path}`);
			created.add(path);
		}
	}
	for (const op of result.ops) {
		if (op.op === "set_property") assert.equal(created.has(op.path), true, `set_property on unknown node ${op.path}`);
	}
	const names = [...created];
	for (const required of ["HeaderBand", "HeaderTitle", "HeaderChip1", "HeaderClock", "HeaderUserName", "Kpi1", "Kpi2", "DataCard1", "Chart1", "Messages", "StatusStrip"]) {
		assert.equal(names.some((name) => name.endsWith(`/${required}`)), true, `missing ${required}`);
	}
	assert.equal(result.layout.width_class, "standard");
	assert.equal(result.layout.chrome, "screen");
	assert.equal(result.layout.slots.chart !== null, true);
	assert.ok(result.counts.components > 20);
});

test("compileBlueprint refuses a body that cannot fit, an unknown pattern and a missing canvas", () => {
	const base = { title: "x", kpis: [{ label: "a", value: 1 }], cards: [{ title: "c", rows: [] }], chart: { title: "b", values: [1, 2] } };
	assert.throws(() => compileBlueprint(base, { screen: "UI/Screens/Home", width: 1000, height: 720 }), (error) => error instanceof LayoutError && error.code === "layout_too_narrow");
	assert.throws(() => compileBlueprint({ ...base, pattern: "wizard" }, { screen: "UI/Screens/Home", width: 1280, height: 720 }), /no pattern/);
	assert.throws(() => compileBlueprint(base, { screen: "", width: 1280, height: 720 }), /screen path/);
	assert.throws(() => compileBlueprint(base, { screen: "UI/Screens/Home" }), /canvas/);
	assert.throws(() => compileBlueprint({ title: "x" }, { screen: "UI/Screens/Home", width: 1280, height: 720 }), (error) => error instanceof LayoutError && error.code === "blueprint_empty_body");
	assert.throws(() => compileBlueprint({ title: "x", chart: { title: "b", values: [] } }, { screen: "UI/Screens/Home", width: 1280, height: 720 }), /numeric value/);
});

test("compileBlueprint honours chrome none and the blank pattern", () => {
	const shell = compileBlueprint({ title: "Line 1", pattern: "overview", cards: [{ title: "c", rows: [] }] }, { screen: "UI/Screens/Home", width: 1280, height: 720, chrome: "none" });
	assert.ok(shell.ops.every((op) => !op.path?.includes("HeaderBand")));
	assert.equal(shell.layout.chrome, "none");
	const blank = compileBlueprint({ pattern: "blank" }, { screen: "UI/Screens/Home", width: 800, height: 600 });
	assert.equal(blank.ops.length, 0);
	assert.equal(blank.counts.components, 0);
});

test("kitCatalogue describes the components and the grid the kit places into", () => {
	const catalogue = kitCatalogue("isa101");
	assert.equal(catalogue.language, "isa101");
	assert.ok(catalogue.components.length >= 8);
	assert.ok(catalogue.components.some((entry) => entry.name === "headerBand"));
	assert.ok(catalogue.patterns.includes("overview"));
	assert.equal(catalogue.grid.columns, 12);
	assert.ok(catalogue.tokens.includes("AccentColor"));
	assert.ok(catalogue.type_scale.body >= 14);
});
