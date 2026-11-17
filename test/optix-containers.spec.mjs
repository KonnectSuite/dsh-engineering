/**
 * The layout containers a screen and a shell are built from, as operations only.
 *
 * The defect this pins: a scaffolded project used to be a set of absolutely placed rectangles, so a window
 * that was not the design size showed the design at its drawn coordinates instead of reflowing. Every
 * screen now has exactly one direct child - a full-canvas `ScaleLayout` - and everything else is placed by
 * `RowLayout` and `ColumnLayout` nodes. Studio's own `GridLayout` is never emitted: its `Columns`/`Rows` are
 * `String[]` and the bridge refuses a scalar write to them (`unsupported_array_write`, measured 2026-11-16 on
 * `AryaSMTLineDemo`), and the per-cell `GridLayoutProperties` child was the last thing written before Studio
 * died with a native `invalid unordered_map<K, T> key` (measured 2026-11-16). A grid here is a `ColumnLayout`
 * holding one `RowLayout` per row, which is the composition Rockwell's shipped widgets use and which renders
 * (measured 2026-11-17, `optix-proof/smt/shots/probe-rc.png`).
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
	ALIGN,
	CONTAINERS,
	FILL,
	FILL_MODE,
	arrayWriteRefusal,
	columnLayout,
	gridLayout,
	frame,
	layout,
	margins,
	rowLayout,
	scaleRoot,
	stretch,
	stretchVertical
} from "../packages/optix/lib/containers.js";
import { screenOps } from "../packages/optix/lib/screens.js";
import { shellPlan, SHELL_NAMES, HEADER_HEIGHT, FOOTER_HEIGHT } from "../packages/optix/lib/shell.js";
import { compileBlueprint } from "../packages/optix/lib/kit.js";

/** The design a screen spec is measured on: 1280x800, two cards, three navigation targets. */
const canonical = {
	name: "LineOverview",
	title: "Line overview",
	cards: [
		{ title: "Cutter", rows: [{ label: "Belt speed", value: 42 }, { label: "Running", kind: "lamp", tag: "Model/Line1/Running" }] },
		{ title: "Oven", rows: [{ label: "Zone 1", value: 181 }] }
	],
	nav: [{ label: "Overview", target: "UI/Screens/LineOverview" }, { label: "Alarms", target: "UI/Screens/Alarms" }, { label: "Settings", target: "UI/Screens/Settings" }]
};

/** Every create_widget operation, in batch order. */
function creates(ops) {
	return ops.filter((op) => op.op === "create_widget");
}

/** The property value the batch writes last on a node, or undefined. */
function property(ops, path, name) {
	const writes = ops.filter((op) => op.op === "set_property" && op.path === path && op.name === name);
	return writes.length === 0 ? undefined : writes.at(-1).value;
}

test("a ScaleLayout root stretches to its parent and records the design canvas as its original size", () => {
	const root = scaleRoot({ screen: "UI/Screens/Home", width: 1280, height: 800 });
	assert.equal(root.path, "UI/Screens/Home/Canvas");
	const created = creates(root.ops);
	assert.equal(created.length, 1);
	assert.equal(created[0].widget_type, CONTAINERS.scale);
	assert.equal(created[0].screen, "UI/Screens/Home");
	// The canvas is not pinned to the design box: a ScaleLayout only scales when its own size differs from
	// OriginalWidth/OriginalHeight, and a 1280x800 canvas inside a 1920x1080 loader letterboxes the design
	// with white margins (measured in the 2026-11-16 session). So it fills its parent instead.
	assert.equal(property(root.ops, root.path, "LeftMargin"), undefined);
	assert.equal(property(root.ops, root.path, "TopMargin"), undefined);
	assert.equal(property(root.ops, root.path, "Width"), "-1.0");
	assert.equal(property(root.ops, root.path, "Height"), "-1.0");
	assert.equal(property(root.ops, root.path, "HorizontalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(root.ops, root.path, "VerticalAlignment"), String(ALIGN.STRETCH));
	assert.notEqual(property(root.ops, root.path, "Width"), "1280.0");
	// Measured in the Studio 1.8.1.27 catalogue: FillMode 0 is Fit, and a Fit canvas needs the design box it
	// scales, or the layout divides by zero and the runtime refuses to render it.
	assert.equal(property(root.ops, root.path, "FillMode"), String(FILL_MODE.FIT));
	assert.equal(property(root.ops, root.path, "OriginalWidth"), "1280.0");
	assert.equal(property(root.ops, root.path, "OriginalHeight"), "800.0");
	assert.equal(property(root.ops, root.path, "FontScaling"), "false");
	const dumped = JSON.stringify(root.ops);
	assert.doesNotMatch(dumped, /FillColor|BackgroundColor/u, "a layout container declares no fill and the bridge refuses the property");
});

test("a grid is a ColumnLayout holding one RowLayout per row", () => {
	const grid = gridLayout("UI/Screens/Home", "Content", { columns: 2, rows: 2, horizontalGap: 20, verticalGap: 20, rowHeights: [120, 96] });
	assert.equal(grid.path, "UI/Screens/Home/Content");
	assert.equal(grid.columns, 2);
	assert.equal(grid.rows, 2);
	assert.deepEqual(grid.rowPaths, ["UI/Screens/Home/Content/Row1", "UI/Screens/Home/Content/Row2"]);
	assert.equal(grid.ops[0].widget_type, CONTAINERS.column);
	// The column owns the vertical gap between its rows; each row owns the horizontal gap between its items.
	assert.equal(property(grid.ops, grid.path, "VerticalGap"), "20.0");
	assert.equal(property(grid.ops, grid.path, "HorizontalGap"), undefined);
	assert.equal(creates(grid.ops).filter((op) => op.widget_type === CONTAINERS.row).length, 2);
	assert.equal(property(grid.ops, grid.rowPaths[0], "Width"), "-1.0");
	assert.equal(property(grid.ops, grid.rowPaths[0], "Height"), "120.0");
	assert.equal(property(grid.ops, grid.rowPaths[1], "Height"), "96.0");
	assert.equal(property(grid.ops, grid.rowPaths[0], "HorizontalAlignment"), String(ALIGN.STRETCH));
	// A fixed row height needs the ordinal 0 on that axis (Left horizontally, Top vertically): Stretch (3)
	// discards the numeric size written on the same axis (measured 2026-11-17 on
	// UI/Screens/AlarmSummary/Canvas/Layout/Content/Row3 - Height 300 with VerticalAlignment 3 rendered as a
	// fill, the same 300 with alignment 0 rendered 300).
	assert.equal(property(grid.ops, grid.rowPaths[0], "VerticalAlignment"), String(ALIGN.LEFT));
	assert.equal(property(grid.ops, grid.rowPaths[0], "HorizontalGap"), "20.0");
	// A row with no reserved height takes what is left, which is the pair measured to work in the runtime.
	const filling = gridLayout("UI/Screens/Home", "Content", { columns: 2, rows: 1 });
	assert.equal(property(filling.ops, filling.rowPaths[0], "Height"), "-1.0");
	assert.equal(property(filling.ops, filling.rowPaths[0], "VerticalAlignment"), String(ALIGN.STRETCH));
	// A row that mixes the two takes its own height and fills only the axis that asked to fill.
	const mixed = gridLayout("UI/Screens/Home", "Content", { columns: 2, rows: 2, rowHeights: [120, FILL] });
	assert.equal(property(mixed.ops, mixed.rowPaths[0], "VerticalAlignment"), String(ALIGN.LEFT));
	assert.equal(property(mixed.ops, mixed.rowPaths[1], "VerticalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(mixed.ops, mixed.rowPaths[1], "Height"), "-1.0");
	// An `fr` array is accepted only for its length: no `fr` spelling is ever written, because the bridge
	// refuses the array property it would live in.
	const fromFr = gridLayout("UI/Screens/Home", "Content", { columns: ["2fr", "1fr"], rows: ["1fr", "1fr"] });
	assert.equal(fromFr.columns, 2);
	assert.equal(fromFr.rows, 2);
	assert.doesNotMatch(JSON.stringify(fromFr.ops), /fr/u, "no fr track template is written anywhere");
});

test("an array-valued property is refused before the batch is sent", () => {
	// Measured live 2026-11-16: a 35-op batch validated ok, then op 11 (`Columns`) answered
	// unsupported_array_write with eleven operations already applied - status indeterminate.
	const reason = arrayWriteRefusal({ op: "set_property", path: "UI/Screens/Probe1/Canvas/Grid", name: "Columns", value: "1fr,1fr" });
	assert.match(String(reason), /writes an array-typed variable \(String\[\]\)/u);
	assert.match(String(reason), /validate_ops cannot see the array-ness/u);
	assert.match(String(reason), /ColumnLayout of RowLayouts/u);
	assert.match(String(arrayWriteRefusal({ op: "set_property", path: "UI/MainWindow/ShellRail/Panels/RailItem1", name: "AliasNodeArray", value: "1" })), /NodeId\[\]/u);
	// A scalar property on the same node is not refused, and neither is a create naming the same node.
	assert.equal(arrayWriteRefusal({ op: "set_property", path: "UI/Screens/Probe1/Canvas/Grid", name: "HorizontalGap", value: "20.0" }), undefined);
	assert.equal(arrayWriteRefusal({ op: "create_widget", screen: "UI/Screens/Probe1/Canvas", name: "Grid", widget_type: CONTAINERS.grid }), undefined);
});

test("the shapes the bridge refuses are refused before a batch is built", () => {
	// Measured live 2026-11-16: set_property Columns -> unsupported_array_write, and the batch stopped there.
	assert.throws(() => layout("UI/Screens/Home", "Content", CONTAINERS.grid, { columns: 2 }), /GridLayout is not authorable through the bridge/u);
	assert.throws(() => layout("UI/Screens/Home", "Cells", CONTAINERS.gridProperties, {}), /GridLayoutProperties is not authorable through the bridge/u);
	assert.throws(() => layout("UI/Screens/Home", "Content", CONTAINERS.column, { columns: 2 }), /Columns\/Rows are String\[\] on the live model/u);
	assert.throws(() => layout("UI/Screens/Home", "Content", CONTAINERS.row, { rows: 2 }), /so call gridLayout\(\)/u);
	assert.throws(() => layout("UI/Screens/Home", "Content", CONTAINERS.column, { itemsHorizontalAlignment: 0 }), /belong to a GridLayout/u);
	assert.throws(() => gridLayout("UI/Screens/Home", "Content", { columns: 0 }), /needs columns as a positive integer count/u);
	assert.throws(() => gridLayout("UI/Screens/Home", "Content", { columns: 2, rows: 0 }), /needs rows as a positive integer count/u);
	assert.throws(() => layout("UI/Screens/Home", "Content", "Panel", {}), /is not a layout container/u);
});

test("fill and stretch are the two-property pair the starter YAML uses", () => {
	const width = stretch("UI/Screens/Home/Layout/Header");
	assert.deepEqual(width.map((op) => [op.name, op.value]), [["HorizontalAlignment", String(ALIGN.STRETCH)], ["Width", "-1.0"]]);
	const height = stretchVertical("UI/Screens/Home/Layout/Content");
	assert.deepEqual(height.map((op) => [op.name, op.value]), [["VerticalAlignment", String(ALIGN.STRETCH)], ["Height", "-1.0"]]);
	assert.equal(FILL, -1);
});

test("the layout builders carry the properties the Studio catalogue declares, and only those", () => {
	const row = rowLayout("UI/Screens/Home", "Header", { width: FILL, height: HEADER_HEIGHT, contentAlignment: 0, horizontalGap: 8, verticalGap: 4 });
	assert.equal(row.path, "UI/Screens/Home/Header");
	assert.equal(row.ops[0].widget_type, CONTAINERS.row);
	assert.equal(property(row.ops, row.path, "ContentAlignment"), "0");
	assert.equal(property(row.ops, row.path, "HorizontalGap"), "8.0");
	assert.equal(property(row.ops, row.path, "VerticalGap"), "4.0");
	assert.equal(property(row.ops, row.path, "Width"), "-1.0");
	assert.equal(property(row.ops, row.path, "Height"), `${HEADER_HEIGHT}.0`);
	assert.doesNotMatch(JSON.stringify(row.ops), /FillColor/u);

	const column = columnLayout("UI/Screens/Home", "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14 } });
	assert.equal(column.ops[0].widget_type, CONTAINERS.column);
	assert.deepEqual(margins(column.path, { left: 14, right: 14 }).map((op) => op.name), ["LeftMargin", "RightMargin"]);
	assert.equal(property(column.ops, column.path, "LeftMargin"), "14.0");
	assert.equal(property(column.ops, column.path, "RightMargin"), "14.0");
});

test("a screen puts every node inside a container and gives each card a row of the content grid", () => {
	const layout2 = screenOps({ ...canonical, nav: [], width: 1280, height: 800 });
	const screenPath = "UI/Screens/LineOverview";
	const folder = "UI/Screens";
	// Exactly one node is a direct child of the screen, and it is the scale canvas. A rectangle pinned to the
	// screen would be the absolute placement this whole change removes.
	const directChildren = creates(layout2.ops).filter((op) => op.screen === screenPath);
	assert.deepEqual(directChildren.map((op) => op.widget_type), [CONTAINERS.scale]);
	// The canvas and the chrome column fill their parents rather than pinning the 1280x800 design box, so a
	// loader larger than the design still gives the ScaleLayout a size to scale from.
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "Width"), "-1.0");
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "Height"), "-1.0");
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "HorizontalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "VerticalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "OriginalWidth"), "1280.0");
	assert.equal(property(layout2.ops, layout2.canvas.canvas, "OriginalHeight"), "800.0");
	assert.equal(property(layout2.ops, layout2.canvas.chrome, "Width"), "-1.0");
	assert.equal(property(layout2.ops, layout2.canvas.chrome, "Height"), "-1.0");
	assert.equal(property(layout2.ops, layout2.canvas.chrome, "HorizontalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(layout2.ops, layout2.canvas.chrome, "VerticalAlignment"), String(ALIGN.STRETCH));
	assert.equal(creates(layout2.ops).filter((op) => op.screen === folder).length, 1, "only the Screen node is created in the folder");
	// Every other created node names a node this batch creates first, including the canvas and the containers.
	const order = new Set();
	for (const op of creates(layout2.ops)) order.add(`${op.screen}/${op.name}`);
	for (const op of creates(layout2.ops).filter((entry) => entry.screen !== folder)) {
		assert.ok(order.has(op.screen) || op.screen === screenPath, `${op.name} is created under ${op.screen}, which the batch does not create`);
	}
	// Header / content / footer are the three bands of one ColumnLayout.
	const header = "UI/Screens/LineOverview/Canvas/Layout/Header";
	const content = "UI/Screens/LineOverview/Canvas/Layout/Content";
	const footer = "UI/Screens/LineOverview/Canvas/Layout/Footer";
	assert.equal(layout2.canvas.header, header);
	assert.equal(layout2.canvas.content, content);
	assert.equal(layout2.canvas.footer, footer);
	assert.equal(creates(layout2.ops).find((op) => op.screen === layout2.canvas.chrome && op.name === "Header").widget_type, CONTAINERS.row);
	assert.equal(creates(layout2.ops).find((op) => op.screen === layout2.canvas.chrome && op.name === "Content").widget_type, CONTAINERS.column);
	assert.equal(creates(layout2.ops).find((op) => op.screen === layout2.canvas.chrome && op.name === "Footer").widget_type, CONTAINERS.row);
	assert.equal(property(layout2.ops, header, "Height"), "88.0");
	assert.equal(property(layout2.ops, content, "Height"), "-1.0");
	assert.equal(property(layout2.ops, header, "Width"), "-1.0");
	assert.equal(property(layout2.ops, footer, "Height"), "56.0");
	// Two cards start one row of two columns: the content column holds a single RowLayout and both cards are
	// its children, splitting it by stretching (measured 2026-11-17: 530 + 20 gap + 514 of a 1060 px row).
	assert.deepEqual(layout2.canvas.contentRows, [`${content}/Row1`]);
	assert.equal(creates(layout2.ops).find((op) => op.screen === content && op.name === "Row1").widget_type, CONTAINERS.row);
	assert.equal(property(layout2.ops, `${content}/Row1`, "Width"), "-1.0");
	// The row takes the height the design check reserved rather than stretching: several stretched rows
	// inside one ColumnLayout splitting the height equally has not been measured, so the emitters never rely
	// on it. With one row of cards that reserved height is the whole content band.
	assert.match(String(property(layout2.ops, `${content}/Row1`, "Height")), /^\d+\.0$/u);
	assert.equal(property(layout2.ops, `${content}/Row1`, "HorizontalGap"), "20.0");
	const cards = creates(layout2.ops).filter((op) => op.widget_type === "Rectangle" && /^Card\d+$/u.test(op.name));
	assert.equal(cards.length, 2);
	for (const card of cards) {
		const cardPath = `${card.screen}/${card.name}`;
		assert.equal(card.screen, `${content}/Row1`, "a card is an item of the content row, not a screen child");
		assert.equal(property(layout2.ops, cardPath, "Width"), "-1.0");
		assert.equal(property(layout2.ops, cardPath, "Height"), "-1.0");
		// The pair, not the size alone: the first live render (2026-11-17) showed four cards hugging their
		// text inside a 1060 px row because the -1 was written without Stretch, and Optix then sizes the child
		// to its content. A card that fills a row has to be stretched on both axes.
		assert.equal(property(layout2.ops, cardPath, "HorizontalAlignment"), String(ALIGN.STRETCH));
		assert.equal(property(layout2.ops, cardPath, "VerticalAlignment"), String(ALIGN.STRETCH));
		const body = creates(layout2.ops).find((op) => op.screen === cardPath && op.name === "Body");
		assert.equal(body.widget_type, CONTAINERS.column);
		assert.equal(property(layout2.ops, `${cardPath}/Body`, "HorizontalAlignment"), String(ALIGN.STRETCH));
		assert.equal(property(layout2.ops, `${cardPath}/Body`, "VerticalAlignment"), String(ALIGN.STRETCH));
	}
});

test("a fill size implies Stretch, and a pinned size does not", () => {
	// The rule the first live render proved: `Width -1` alone renders at the content size, so a fill has to
	// carry its alignment. A pinned pixel width must not be stretched, or the design check's reserved slot is
	// a lie and the component is drawn outside it.
	const filled = columnLayout("UI/Screens/Home", "Body", { width: FILL, height: FILL });
	assert.equal(property(filled.ops, filled.path, "HorizontalAlignment"), String(ALIGN.STRETCH));
	assert.equal(property(filled.ops, filled.path, "VerticalAlignment"), String(ALIGN.STRETCH));

	const pinned = rowLayout("UI/Screens/Home", "Rail", { width: 220, height: FILL });
	assert.equal(property(pinned.ops, pinned.path, "Width"), "220.0");
	assert.equal(property(pinned.ops, pinned.path, "HorizontalAlignment"), undefined);
	assert.equal(property(pinned.ops, pinned.path, "VerticalAlignment"), String(ALIGN.STRETCH));

	const named = columnLayout("UI/Screens/Home", "Feed", { width: FILL, height: FILL, horizontalAlignment: ALIGN.CENTER });
	assert.equal(property(named.ops, named.path, "HorizontalAlignment"), String(ALIGN.CENTER));
	assert.equal(property(named.ops, named.path, "VerticalAlignment"), String(ALIGN.STRETCH));
});

test("a numeric size beside Stretch is refused, because the runtime throws the number away", () => {
	// Measured 2026-11-17 on UI/Screens/AlarmSummary/Canvas/Layout/Content/Row3, one variable at a time:
	// Height 300 + VerticalAlignment 3 rendered 158 (the fill spelling); the same 300 with alignment 0 rendered
	// 300. Width 500 + HorizontalAlignment 3 rendered 1012; the same 500 with alignment 0 rendered 500. So
	// Stretch on an axis IS the size on that axis, and a number written beside it is discarded - on either
	// axis, whatever the parent's orientation. A model that carries such a number is a model whose numbers
	// are lies, so the pair never leaves this module.
	assert.throws(() => rowLayout("UI/Screens/Home", "Row3", { width: 500, height: FILL, horizontalAlignment: ALIGN.STRETCH }), /Width 500 with horizontalAlignment 3 is discarded by the runtime/u);
	assert.throws(() => columnLayout("UI/Screens/Home", "Row3", { width: FILL, height: 300, verticalAlignment: ALIGN.STRETCH }), /Height 300 with verticalAlignment 3 is discarded by the runtime/u);
	// A `box` call is covered too, because its numbers arrive through the frame.
	assert.throws(() => layout("UI/Screens/Home", "Body", CONTAINERS.row, { box: frame(244, 176, 1012, 300), verticalAlignment: ALIGN.STRETCH }), /Height 300 with verticalAlignment 3/u);
	// The honest spellings still build: a pinned box writes no alignment, a fill writes the pair.
	const pinned = rowLayout("UI/Screens/Home", "Row3", { width: 500, height: 300 });
	assert.equal(property(pinned.ops, pinned.path, "HorizontalAlignment"), undefined);
	assert.equal(property(pinned.ops, pinned.path, "VerticalAlignment"), undefined);
	const filled = rowLayout("UI/Screens/Home", "Row3", { width: FILL, height: FILL, horizontalAlignment: ALIGN.STRETCH, verticalAlignment: ALIGN.STRETCH });
	assert.equal(property(filled.ops, filled.path, "Width"), "-1.0");
	assert.equal(property(filled.ops, filled.path, "Height"), "-1.0");
});

test("a finished screen keeps the same tree, adds bound readouts and a navigation row", () => {
	const layout2 = screenOps({ ...canonical, width: 1280, height: 800 });
	const content = "UI/Screens/LineOverview/Canvas/Layout/Content";
	const nav = "UI/Screens/LineOverview/Canvas/Nav";
	assert.equal(property(layout2.ops, nav, "HorizontalGap"), "20.0");
	assert.equal(creates(layout2.ops).find((op) => op.screen === "UI/Screens/LineOverview/Canvas" && op.name === "Nav").widget_type, CONTAINERS.row);
	// The navigation row takes a band out of the content column, so the content and its row are given a
	// height instead of stretching to everything left over.
	const contentRow = layout2.canvas.contentRows[0];
	assert.notEqual(property(layout2.ops, content, "Height"), "-1.0");
	assert.notEqual(property(layout2.ops, contentRow, "Height"), "-1.0");
	// Buttons are sized by their row, not pinned: Width/Height plus a vertical alignment, no Left/Top margin.
	const buttons = creates(layout2.ops).filter((op) => op.widget_type === "Button");
	assert.equal(buttons.length, canonical.nav.length);
	for (const button of buttons) {
		const path = `${button.screen}/${button.name}`;
		assert.equal(button.screen, nav);
		assert.equal(property(layout2.ops, path, "LeftMargin"), undefined);
		assert.equal(property(layout2.ops, path, "TopMargin"), undefined);
		assert.equal(property(layout2.ops, path, "Height"), "44.0");
	}
	// The card rows are labels and lamps inside the card's column layout, with no absolute placement of
	// their own; the content row still holds the two cards.
	const cardBodies = creates(layout2.ops).filter((op) => op.widget_type === CONTAINERS.column && op.name === "Body");
	assert.equal(cardBodies.length, 2);
	for (const card of ["Card1", "Card2"]) {
		const body = `${contentRow}/${card}/Body`;
		assert.ok(creates(layout2.ops).some((op) => `${op.screen}/${op.name}` === body), `${card} has no column-layout body`);
		assert.ok(layout2.ops.every((op) => op.op !== "set_property" || !String(op.path).startsWith(`${body}/`) || !["LeftMargin", "TopMargin"].includes(op.name)), `${card} pins its own readouts`);
	}
});

test("the kit places its repeatable components in rows and columns", () => {
	const result = compileBlueprint({
		title: "Line overview",
		kpis: [{ label: "OEE", value: 82, unit: "%" }, { label: "Output", value: 1240, unit: "pcs" }],
		cards: [{ title: "Cutter", rows: [{ label: "Belt speed", value: 42, unit: "m/min" }, { label: "Running", kind: "lamp", on: true }, { label: "Load", kind: "bar", percent: 64 }] }],
		chart: { title: "Oven", values: [98, 181, 225], labels: ["1", "2", "3"], threshold: 1 },
		messages: [{ title: "Reminder", text: "Conveyor 1 belt: 2 days left" }]
	}, { screen: "UI/Screens/Home", width: 1280, height: 720 });
	const created = creates(result.ops);
	const byPath = new Map(created.map((op) => [`${op.screen}/${op.name}`, op]));
	const strip = byPath.get("UI/Screens/Home/KpiStrip");
	const body = byPath.get("UI/Screens/Home/Body");
	const feed = byPath.get("UI/Screens/Home/Feed");
	assert.equal(strip.widget_type, CONTAINERS.column);
	// A card beside a chart is an unequal pair, and an unequal pair is two pixel widths inside one row: the
	// bridge cannot write a `2fr,1fr` template, so the geometry library's widths are what place them.
	assert.equal(body.widget_type, CONTAINERS.row);
	assert.equal(feed.widget_type, CONTAINERS.column);
	const cardColumn = byPath.get("UI/Screens/Home/Body/BodyCards");
	assert.equal(cardColumn.widget_type, CONTAINERS.column);
	assert.notEqual(property(result.ops, "UI/Screens/Home/Body/BodyCards", "Width"), "-1.0");
	assert.match(String(property(result.ops, "UI/Screens/Home/Body/BodyCards", "Width")), /^\d+\.0$/u);
	assert.match(String(property(result.ops, "UI/Screens/Home/Body/Chart1", "Width")), /^\d+\.0$/u);
	// A KPI tile is an item of the strip's row with a column-layout body: its label and value have no margin.
	const stripRow = "UI/Screens/Home/KpiStrip/Row1";
	for (const name of ["Kpi1", "Kpi2"]) {
		const path = `${stripRow}/${name}`;
		assert.equal(byPath.get(path)?.widget_type, "Rectangle", `${name} is not an item of the KPI row`);
		assert.equal(property(result.ops, path, "Width"), "-1.0");
		assert.equal(property(result.ops, path, "Height"), "-1.0");
		assert.equal(byPath.get(`${path}/Body`)?.widget_type, CONTAINERS.column);
	}
	assert.equal(byPath.get("UI/Screens/Home/Body/BodyCards/DataCard1")?.widget_type, "Rectangle");
	assert.equal(byPath.get("UI/Screens/Home/Body/Chart1")?.widget_type, "Rectangle");
	// Bars are one bottom-aligned column per bar in the plot's single row.
	const plotRow = "UI/Screens/Home/Body/Chart1/Body/Plot/Row1";
	assert.equal(byPath.get(plotRow)?.widget_type, CONTAINERS.row);
	for (const name of ["Bar1", "Bar2", "Bar3"]) {
		assert.equal(byPath.get(`${plotRow}/${name}`)?.widget_type, CONTAINERS.column);
		assert.equal(property(result.ops, `${plotRow}/${name}`, "ContentAlignment"), "2");
	}
	const messages = byPath.get("UI/Screens/Home/Feed/Row1/Messages");
	assert.equal(messages?.widget_type, "Rectangle");
	const list = byPath.get("UI/Screens/Home/Feed/Row1/Messages/Body/List");
	assert.equal(list?.widget_type, CONTAINERS.column);
	assert.equal(byPath.get("UI/Screens/Home/Feed/Row1/Messages/Body/List/Row1/Message1")?.widget_type, "Rectangle");
});

test("no emitted batch asks the bridge for a grid it cannot author", () => {
	const batches = [
		screenOps({ ...canonical, width: 1280, height: 800 }).ops,
		compileBlueprint({ title: "Line overview", kpis: [{ label: "OEE", value: 82 }], cards: [{ title: "Cutter", rows: [{ label: "Belt speed", value: 42 }] }], chart: { title: "Oven", values: [1, 2] }, messages: [{ title: "Reminder", text: "Belt" }] }, { screen: "UI/Screens/Home", width: 1280, height: 720 }).ops,
		shellPlan({ window: "UI/MainWindow", width: 1280, height: 720, screens: [{ name: "Home", screen: "UI/Screens/Home", title: "Home" }, { name: "Alarms", screen: "UI/Screens/Alarms", title: "Alarms" }] }).ops
	];
	for (const ops of batches) {
		const dumped = JSON.stringify(ops);
		// The two node types whose creation either dies in Studio or renders nothing.
		assert.doesNotMatch(dumped, /GridLayoutProperties/u);
		assert.doesNotMatch(dumped, /"widget_type":"GridLayout"/u);
		// The array-valued properties the bridge refuses, and the cell properties that only a GridLayout reads.
		assert.doesNotMatch(dumped, /"name":"(Columns|Rows|ColumnStart|ColumnSpan|RowStart|RowSpan|ItemsHorizontalAlignment|ItemsVerticalAlignment)"/u);
	}
});

test("the shell lays its bands out in row layouts over the same rectangles", () => {
	const plan = shellPlan({
		window: "UI/MainWindow",
		width: 1280,
		height: 720,
		screens: [
			{ name: "Home", screen: "UI/Screens/Home", title: "Home" },
			{ name: "Alarms", screen: "UI/Screens/Alarms", title: "Alarms" }
		]
	});
	const byPath = new Map(creates(plan.ops).map((op) => [`${op.screen}/${op.name}`, op]));
	const headerRow = byPath.get(`UI/MainWindow/${SHELL_NAMES.headerRow}`);
	assert.equal(headerRow.widget_type, CONTAINERS.row);
	assert.equal(property(plan.ops, `UI/MainWindow/${SHELL_NAMES.headerRow}`, "Width"), "1280.0");
	assert.equal(property(plan.ops, `UI/MainWindow/${SHELL_NAMES.headerRow}`, "Height"), `${HEADER_HEIGHT}.0`);
	const footerRow = byPath.get(`UI/MainWindow/${SHELL_NAMES.footerRow}`);
	assert.equal(footerRow.widget_type, CONTAINERS.row);
	assert.equal(property(plan.ops, `UI/MainWindow/${SHELL_NAMES.footerRow}`, "Height"), `${FOOTER_HEIGHT}.0`);
	// The bands keep a Rectangle for paint, because a layout container has no fill.
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.header}`).widget_type, "Rectangle");
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.footer}`).widget_type, "Rectangle");
	// The texts live in the rows; the rail stays a window child, because a navigation item resolves its
	// panel one level deeper at run time when it is moved into a container (measured 2026-11-14).
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.headerRow}/${SHELL_NAMES.title}`).screen, `UI/MainWindow/${SHELL_NAMES.headerRow}`);
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.footerRow}/${SHELL_NAMES.status}`).screen, `UI/MainWindow/${SHELL_NAMES.footerRow}`);
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.rail}`).widget_type, "NavigationPanel");
	assert.equal(byPath.get(`UI/MainWindow/${SHELL_NAMES.rail}`).screen, "UI/MainWindow");
});
