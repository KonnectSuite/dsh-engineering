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
import {
	MAX_STATIONS,
	MAX_TABLE_COLUMNS,
	MAX_TABLE_ROWS,
	MIN_ROW_BAND,
	compileBlueprint,
	kitCatalogue,
	kitTheme
} from "../packages/optix/lib/kit.js";

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

const machine = (name) => ({ name, on: true, values: [{ label: "Head speed", value: 68000, unit: "cph" }, { label: "Feeder", value: 12, unit: "active" }] });
const machines = (count) => Array.from({ length: count }, (_value, index) => machine(`Machine ${index + 1}`));
const cardSpec = (title, rows) => ({ title, rows });
const throughput = cardSpec("Throughput", [{ label: "Units / hour", value: 46800 }, { label: "Total units", value: 21490 }]);
const lineState = cardSpec("Line state", [{ label: "Running", kind: "lamp", on: true }, { label: "Faults", kind: "lamp", on: false }]);
const cycleChart = { title: "Station cycle", values: [42, 51, 47, 60, 55], labels: ["1", "2", "3", "4", "5"], unit: "s" };
const alarmTable = (rows, cols) => ({
	title: "Alarm summary",
	columns: ["Time", "Station", "Text", "Severity", "State"].slice(0, cols),
	widths: [2, 2, 4, 1.5, 1.5].slice(0, cols),
	rows: Array.from({ length: rows }, () => ["14:52:10", "Mounter 2", "Feeder empty", "High", "Active"].slice(0, cols))
});

/** The box each station tile was given, keyed `Row1/Station1`. */
function tileBoxes(result) {
	const boxes = new Map();
	for (const op of result.ops) {
		if (op.op !== "set_property" || (op.name !== "Width" && op.name !== "Height")) continue;
		const match = /\/(Row\d+)\/(Station\d+)$/.exec(op.path ?? "");
		if (!match) continue;
		const key = `${match[1]}/${match[2]}`;
		const box = boxes.get(key) ?? { width: undefined, height: undefined };
		box[op.name === "Width" ? "width" : "height"] = Number(op.value);
		boxes.set(key, box);
	}
	return boxes;
}

test("the station pattern lays a balanced wall: every row holds the same tile width", () => {
	// Six machines on a 608px body used to be five across with one stranded under them, and the short
	// last row rendered its tiles wider than the row above. The split is now chosen by the tile's aspect.
	for (const [count, perRow] of [[6, [3, 3]], [5, [2, 3]], [4, [2, 2]], [2, [2]]]) {
		const result = compileBlueprint({ title: "Station health", pattern: "station", stations: machines(count) }, { screen: "UI/Screens/Stations", width: 1280, height: 800 });
		const boxes = tileBoxes(result);
		assert.equal(boxes.size, count, `tiles for ${count} machines`);
		const first = boxes.get("Row1/Station1");
		const rows = new Map();
		for (const [key, box] of boxes) {
			const row = key.slice(0, key.lastIndexOf("/"));
			rows.set(row, (rows.get(row) ?? 0) + 1);
			assert.equal(box.width, first.width, `tile ${key} is ${box.width} wide against ${first.width}`);
			assert.equal(box.height, first.height, `tile ${key} is ${box.height} tall against ${first.height}`);
			assert.ok(box.width >= 200, `tile ${box.width} wide cannot hold a name and a number on one line`);
			assert.ok(box.height >= 110, `tile ${box.height} tall cannot hold a name row and two value rows`);
		}
		assert.deepEqual([...rows.values()].sort(), perRow, `${count} machines split into ${[...rows].join(", ")}`);
	}
	// The same wall on the demo's real host box, which is where the ragged row was measured.
	const demo = compileBlueprint({ title: "Station health", pattern: "station", stations: machines(6) }, { screen: "UI/Screens/Stations", width: 1060, height: 706 });
	const boxes = tileBoxes(demo);
	assert.equal(boxes.get("Row1/Station1").width, boxes.get("Row2/Station4").width);
	assert.deepEqual([...new Set([...boxes.values()].map((box) => `${box.width}x${box.height}`))], ["324x247"]);
});

test("the station pattern caps the wall, and the densest natural screen fits the shipped ceiling", () => {
	const six = compileBlueprint({ title: "Station health", pattern: "station", stations: machines(6) }, { screen: "UI/Screens/Stations", width: 1280, height: 800 });
	const twelve = compileBlueprint({ title: "Station health", pattern: "station", stations: machines(12) }, { screen: "UI/Screens/Stations", width: 1280, height: 800 });
	// The cap is a slice, the kit's established behaviour for a pattern's content (cards, messages): a
	// twelve-machine request compiles the six-tile wall it can actually place.
	assert.equal(twelve.ops.length, six.ops.length, "a capped request must not emit a partial wall");
	assert.equal(tileBoxes(twelve).size, MAX_STATIONS);
	// Measured 2026-11-17: one tile is 87-88 bridge operations, so the wall is the kit's densest pattern.
	// 700 is the ceiling `optix_screen` ships with (packages/optix/lib/index.js:1869) and a screen cannot
	// be split across calls, so a station wall carrying the line's KPI strip has to fit under it.
	const withKpis = compileBlueprint({ title: "Station health", pattern: "station", stations: machines(6), kpis: [{ label: "OEE", value: 82, unit: "%" }, { label: "Faults", value: 0 }] }, { screen: "UI/Screens/Stations", width: 1280, height: 800 });
	assert.ok(withKpis.ops.length <= 700, `station wall plus a KPI strip is ${withKpis.ops.length} operations`);
	assert.equal(withKpis.counts.operations, withKpis.ops.length);
});

test("the station pattern refuses a body that cannot hold the wall and names what to drop", () => {
	assert.throws(() => compileBlueprint({
		title: "Station health",
		pattern: "station",
		stations: machines(6),
		kpis: [{ label: "OEE", value: 82, unit: "%" }],
		messages: ["Feeder empty on Mounter 2", "Zone 3 over limit"],
		status: { text: "Running", ok: true }
	}, { screen: "UI/Screens/Stations", width: 1060, height: 706 }), (error) => error instanceof LayoutError
		&& error.code === "layout_overflow"
		&& /200px across and 110px down/u.test(error.message)
		&& /drop the KPI strip or the message feed/u.test(error.message));
});

test("the table pattern paints a banded table and refuses rows that cannot hold a 30px band", () => {
	const result = compileBlueprint({ title: "Alarm summary", pattern: "table", table: alarmTable(6, 5) }, { screen: "UI/Screens/Alarms", width: 1280, height: 800 });
	const created = result.ops.filter((op) => op.op === "create_widget").map((op) => op.name);
	for (const required of ["TableArea", "Table1", "HeaderBand", "Row1", "Row6"]) {
		assert.equal(created.includes(required), true, `missing ${required}`);
	}
	// A layout container paints nothing, so each band is a Rectangle and the cells live in a RowLayout
	// inside it. The header band carries the alternate fill so the first line reads as a heading.
	assert.equal(result.ops.some((op) => op.op === "set_property" && op.path === "UI/Screens/Alarms/TableArea/Table1/Body/HeaderBand/Cells" && op.name === "Height"), true);
	assert.equal(result.ops.some((op) => op.op === "create_widget" && op.name === "Row1Cell1"), true);
	// Seven columns and seven rows are capped to what a 1280px body can hold a legible cell in.
	const capped = compileBlueprint({ title: "Alarm summary", pattern: "table", table: alarmTable(9, 9) }, { screen: "UI/Screens/Alarms", width: 1280, height: 800 });
	assert.equal(capped.ops.filter((op) => op.op === "create_widget" && /^Row\d+Cell\d+$/.test(op.name)).length, MAX_TABLE_ROWS * MAX_TABLE_COLUMNS);
	// TableArea keeps its numeric box and sits at the top-left of it: Stretch on an axis discards the size
	// written on it, so the column that owns the body band is aligned 0, not 3.
	const area = result.ops.find((op) => op.op === "set_property" && op.path === "UI/Screens/Alarms/TableArea" && op.name === "VerticalAlignment");
	assert.equal(area?.value, "0", "TableArea must keep the band it was given");
	assert.throws(() => compileBlueprint({
		title: "Alarm summary",
		pattern: "table",
		table: alarmTable(6, 5),
		kpis: [{ label: "Active", value: 3 }],
		messages: ["Feeder empty", "Zone over limit"],
		status: { text: "Running", ok: true }
	}, { screen: "UI/Screens/Alarms", width: 1060, height: 706 }), (error) => error.code === "layout_overflow" && /table row needs 30px/u.test(error.message));
});

test("a faceplate that cannot hold its detail says so in faceplate terms", () => {
	// The old message read "a row of 133px is under the 140px floor in a 440px area", which sends the
	// reader looking for a constant instead of dropping a card.
	assert.throws(() => compileBlueprint({ title: "Mounter 1", pattern: "faceplate", equipment: machine("Mounter 1"), cards: [throughput, lineState], chart: cycleChart }, { screen: "UI/Screens/Faceplate", width: 1060, height: 706 }), (error) => error instanceof LayoutError
		&& error.code === "layout_overflow"
		&& /a faceplate leaves/u.test(error.message)
		&& /under its 148px equipment band/u.test(error.message));
	const built = compileBlueprint({ title: "Mounter 1", pattern: "faceplate", equipment: machine("Mounter 1"), cards: [throughput] }, { screen: "UI/Screens/Faceplate", width: 1060, height: 706 });
	const created = built.ops.filter((op) => op.op === "create_widget").map((op) => op.name);
	for (const required of ["Body", "Equipment", "DataCard1", "StationName"]) {
		assert.equal(created.includes(required), true, `missing ${required}`);
	}
	// The equipment band keeps the 148px it was promised rather than stretching to fill the column.
	const equipment = built.ops.filter((op) => op.op === "set_property" && op.path === "UI/Screens/Faceplate/Body/Equipment");
	assert.equal(equipment.some((op) => op.name === "Height" && Number(op.value) > 100 && Number(op.value) !== -1), true, "the equipment band must keep its numeric height");
});

test("a card's rows fill the band the geometry gave the card instead of stacking at its top", () => {
	const heights = (blueprint, options) => compileBlueprint(blueprint, options)
		.ops.filter((op) => op.op === "set_property" && /\/DataCard1\/Body\/Row\d+$/u.test(op.path ?? "") && op.name === "Height")
		.map((op) => Number(op.value));
	// Three 26px rows inside a 247px surface paint their text in the top 97px, which the render check
	// measures as coverage 0.03-0.27 against a 0.30 minimum. A fill row is the honest distribution.
	const two = heights({ title: "Line status", pattern: "overview", cards: [throughput] }, { screen: "UI/Screens/Home", width: 1280, height: 800 });
	assert.deepEqual(two, [-1, -1], `card rows ${two}`);
	const three = heights({ title: "Line status", pattern: "overview", cards: [cardSpec("Throughput", [{ label: "a", value: 1 }, { label: "b", value: 2 }, { label: "c", value: 3 }])] }, { screen: "UI/Screens/Home", width: 1280, height: 800 });
	assert.deepEqual(three, [-1, -1, -1], `card rows ${three}`);
	// Past three rows an equal band would not hold the row's own 22px label, so the number is kept.
	const five = heights({ title: "Line status", pattern: "overview", cards: [cardSpec("Throughput", Array.from({ length: 5 }, (_v, index) => ({ label: `row ${index + 1}`, value: index })))] }, { screen: "UI/Screens/Home", width: 1280, height: 800 });
	assert.equal(five.length, 5);
	assert.ok(five.every((height) => height >= MIN_ROW_BAND), `card rows ${five}`);
	assert.ok(five.every((height) => height !== -1), `a card with ${five.length} rows must keep a numeric band`);
});

test("a pattern that needs its own content refuses instead of drawing an empty screen", () => {
	for (const blueprint of [
		{ title: "Station health", pattern: "station" },
		{ title: "Alarm summary", pattern: "table" },
		{ title: "Mounter 1", pattern: "faceplate" }
	]) {
		assert.throws(() => compileBlueprint(blueprint, { screen: "UI/Screens/Probe", width: 1280, height: 800 }), (error) => error instanceof LayoutError && error.code === "blueprint_pattern_content", `${blueprint.pattern} with no content`);
	}
	assert.throws(() => compileBlueprint({ title: "Alarm summary", pattern: "table", table: { title: "t", columns: [], rows: [] } }, { screen: "UI/Screens/Probe", width: 1280, height: 800 }), (error) => error.code === "table_no_columns");
});

test("the catalogue names the patterns and the components the kit compiles", () => {
	const catalogue = kitCatalogue("modern");
	for (const pattern of ["overview", "split", "station", "table", "faceplate", "blank"]) {
		assert.equal(catalogue.patterns.includes(pattern), true, `pattern ${pattern}`);
	}
	for (const component of ["headerBand", "kpiTile", "card", "stationTile", "tableCard", "barChart", "messageFeed", "statusStrip"]) {
		assert.equal(catalogue.components.some((entry) => entry.name === component), true, `component ${component}`);
	}
	const tile = catalogue.components.find((entry) => entry.name === "stationTile");
	assert.ok(/one tile width across every row/u.test(tile.description), `stationTile description: ${tile.description}`);
	const card = catalogue.components.find((entry) => entry.name === "card");
	assert.ok(/fill so they split the card's height/u.test(card.description), `card description: ${card.description}`);
});
