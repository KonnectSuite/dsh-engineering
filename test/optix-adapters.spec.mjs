import assert from "node:assert/strict";
import test from "node:test";
import { ADAPTERS, adapterCatalogue, adapterImport, adapterNames, adapterOps, getAdapter } from "../packages/optix/lib/adapters.js";
import { compileBlueprint } from "../packages/optix/lib/kit.js";

const slot = { left: 10, top: 20, width: 400, height: 300 };

test("the adapter catalogue names every vendor component and its import", () => {
	const catalogue = adapterCatalogue();
	assert.equal(catalogue.count, adapterNames().length);
	assert.ok(catalogue.adapters.some((adapter) => adapter.kind === "alarmBanner" && adapter.library === "Widgets"));
	const imported = adapterCatalogue().adapters.filter((adapter) => adapter.import !== null);
	assert.ok(imported.length > 0);
	for (const adapter of imported) {
		assert.equal(adapter.import.tool, "optix_library");
		assert.equal(adapter.import.library, adapter.library);
		assert.equal(adapter.import.item, adapter.item);
	}
	assert.equal(adapterImport("dataGrid"), null);
});

test("getAdapter refuses a kind the kit does not have", () => {
	assert.throws(() => getAdapter("piechart9000"), (error) => error.message.includes("adapter_unknown"));
	assert.deepEqual(Object.keys(ADAPTERS).length > 5, true);
});

test("a library adapter is placed only against an imported type", () => {
	const placed = adapterOps({ kind: "alarmGrid", screen: "UI/Screens/Alarms", name: "AlarmGrid1", slot, typePath: "UI/Components/Widgets/AlarmGrid", bindings: { Model: "Model/Alarms" } });
	assert.deepEqual(placed.ops[0], { op: "create_object", parent: "UI/Screens/Alarms", name: "AlarmGrid1", object_type: "UI/Components/Widgets/AlarmGrid" });
	assert.equal(placed.placed.path, "UI/Screens/Alarms/AlarmGrid1");
	assert.deepEqual(placed.ops.slice(1, 5).map((op) => op.name), ["LeftMargin", "TopMargin", "Width", "Height"]);
	assert.deepEqual(placed.bound, ["Model"]);
	assert.deepEqual(placed.unbound, []);
	const box = placed.ops.find((op) => op.name === "Width");
	assert.equal(box.value, "400.0");
	assert.throws(
		() => adapterOps({ kind: "alarmGrid", screen: "UI/Screens/Alarms", name: "AlarmGrid1", slot }),
		(error) => error.message.startsWith("adapter_not_imported:") && error.message.includes('item "AlarmGrid"')
	);
});

test("a builtin adapter creates the widget by name and reports what it could not bind", () => {
	const placed = adapterOps({ kind: "dataGrid", screen: "UI/Screens/Trends", name: "Grid1", slot, bindings: { Model: "Model/Recipes" } });
	assert.deepEqual(placed.ops[0], { op: "create_widget", screen: "UI/Screens/Trends", name: "Grid1", widget_type: "DataGrid" });
	assert.equal(placed.requires_import, null);
	assert.deepEqual(placed.unbound, ["Query"]);
});

test("an adapter refuses a rectangle too small to be a control, and a name that is not an identifier", () => {
	assert.throws(() => adapterOps({ kind: "dataGrid", screen: "UI/Screens/Trends", name: "Grid1", slot: { left: 0, top: 0, width: 40, height: 300 } }), (error) => error.message.startsWith("adapter_bad_slot:"));
	assert.throws(() => adapterOps({ kind: "dataGrid", screen: "UI/Screens/Trends", name: "Grid 1", slot }), (error) => error.message.startsWith("adapter_bad_bad_name") || error.message.startsWith("adapter_bad_name"));
	assert.throws(() => adapterOps({ kind: "dataGrid", name: "Grid1", slot }), (error) => error.message.startsWith("adapter_no_screen:"));
});

test("a blueprint carrying an adapter compiles the drawn chrome around it", () => {
	const compiled = compileBlueprint(
		{ title: "ALARMS", pattern: "overview", adapters: [{ kind: "alarmGrid", type_path: "UI/Components/Widgets/AlarmGrid", bindings: { Model: "Model/Alarms" } }] },
		{ screen: "UI/Screens/Alarms", width: 1280, height: 800 }
	);
	assert.equal(compiled.layout.slots.adapters.length, 1);
	assert.equal(compiled.layout.slots.adapters[0].path, "UI/Screens/Alarms/Adapter1");
	assert.deepEqual(compiled.layout.slots.adapters[0].bound, ["Model"]);
	const created = compiled.ops.filter((op) => op.op === "create_object");
	assert.equal(created.length, 1);
	assert.equal(created[0].object_type, "UI/Components/Widgets/AlarmGrid");
	// The chrome is still drawn around it, so the screen is not a blank canvas with a grid on it.
	assert.ok(compiled.ops.some((op) => op.op === "create_widget" && op.name === "HeaderBand"));
	assert.ok(compiled.ops.some((op) => op.op === "create_widget" && op.name === "StatusStrip"));
});

test("a blueprint with adapters alone is a body, not an empty screen", () => {
	const compiled = compileBlueprint({ title: "TRENDS", pattern: "overview", adapters: [{ kind: "trendNative", name: "Trend1" }] }, { screen: "UI/Screens/Trends", width: 1280, height: 800 });
	assert.ok(compiled.counts.operations > 20);
	assert.equal(compiled.layout.slots.adapters[0].unbound.includes("Model"), true);
	assert.throws(() => compileBlueprint({ title: "EMPTY", pattern: "overview" }, { screen: "UI/Screens/Empty", width: 1280, height: 800 }), (error) => error.code === "blueprint_empty_body");
});
