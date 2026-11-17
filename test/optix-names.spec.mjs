/**
 * The name a project type may not take.
 *
 * The defect this pins (measured 2026-11-17 on `AryaSMTLineDemo`, Studio 1.8.1.27): a screen drafted as
 * `UI/Screens/Trend` made Studio generate `public class Trend : FTOptix.UI.Screen` in
 * `ProjectFiles/NetSolution/Private/UITypeDefinitions.cs`. That class sits in the global namespace, so it
 * shadowed `FTOptix.UI.Trend` for every NetLogic in the project. The shipped `Widgets/AdvancedTrend` had
 * brought `TrendPensLogic.cs`, which declares `private Trend myTrend;` unqualified under `using FTOptix.UI;`,
 * and the solution failed with `error CS0029: Cannot implicitly convert type 'FTOptix.UI.Trend' to 'Trend'`
 * plus four `error CS1061: 'Trend' does not contain a definition for 'Pens'` - so the project's own NetLogic
 * stopped compiling too, and `bin/AryaSMTLineDemo.dll` was removed and never rewritten until the screen was
 * renamed to `TrendView`. Neither `optix_library import` nor the screen emitters checked the name.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { TYPE_BEARING_WIDGETS, parseGeneratedTypes, typeBearingCreateRefusal, typeCollisions } from "../packages/optix/lib/names.js";

/** The two generated rows the measured failure came from. */
const MEASURED = `using System;
using UAManagedCore;

//-------------------------------------------
// WARNING: AUTO-GENERATED CODE, DO NOT EDIT!
//-------------------------------------------

[MapType(NamespaceUri = "AryaSMTLineDemo", Guid = "b6afb7d587c84ed9af8d02dd1d61c7b5")]
public class LineStatus : FTOptix.UI.Screen
{
}

[MapType(NamespaceUri = "AryaSMTLineDemo", Guid = "11111111111111111111111111111111")]
public class Trend : FTOptix.UI.Screen
{
}`;

test("the generated classes are read out of Studio's own file", () => {
	const generated = parseGeneratedTypes(MEASURED);
	assert.deepEqual(generated, [
		{ name: "LineStatus", base_type: "FTOptix.UI.Screen" },
		{ name: "Trend", base_type: "FTOptix.UI.Screen" }
	]);
});

test("a project type named after a built-in type is reported as shadowing it", () => {
	const report = typeCollisions(parseGeneratedTypes(MEASURED));
	assert.equal(report.generated, 2);
	assert.deepEqual(report.collisions, [{ name: "Trend", generated_as: "FTOptix.UI.Screen", shadows: "FTOptix.UI.Trend" }]);
	assert.deepEqual(report.duplicates, []);
});

test("a project type with a name the built-ins do not use is clean", () => {
	const report = typeCollisions(parseGeneratedTypes(MEASURED.replace(/class Trend :/u, "class TrendView :")));
	assert.deepEqual(report.collisions, []);
	assert.deepEqual(report.duplicates, []);
});

test("the same name generated twice is a duplicate, which is the other half of the hazard", () => {
	const report = typeCollisions([
		{ name: "AlarmGrid", base_type: "FTOptix.UI.Panel" },
		{ name: "AlarmGrid", base_type: "FTOptix.UI.Panel" }
	]);
	assert.deepEqual(report.duplicates, [{ name: "AlarmGrid", count: 2 }]);
	// `AlarmGrid` is a template-library panel, not a type in the catalog, so it is not a shadow.
	assert.deepEqual(report.collisions, []);
});

test("a batch that creates a screen named after a built-in type is refused before a byte is sent", () => {
	const refusal = typeBearingCreateRefusal({ op: "create_widget", screen: "UI/Screens", name: "Trend", widget_type: "Screen" });
	assert.ok(refusal, "the measured screen op must be refused");
	assert.match(refusal, /names the project type "Trend"/u);
	assert.match(refusal, /FTOptix\.UI\.Trend/u);
});

test("the refusal covers every kind Studio generates a class for, and the type route", () => {
	for (const widget_type of TYPE_BEARING_WIDGETS) {
		assert.ok(typeBearingCreateRefusal({ op: "create_widget", screen: "UI/Screens", name: "Trend", widget_type }), widget_type);
	}
	assert.ok(typeBearingCreateRefusal({ op: "create_type", parent: "UI", name: "Trend", base_type: "Panel" }));
});

test("an instance named after a built-in type is not refused: it generates no class", () => {
	// Measured: `create_object {parent:"UI/Screens/TrendView/Canvas", name:"Trend1", object_type:".../AdvancedTrendMain"}`
	// reports `node_class Object` and adds nothing to UITypeDefinitions.cs. A plain node name is not a hazard.
	assert.equal(typeBearingCreateRefusal({ op: "create_object", parent: "UI/Screens/TrendView/Canvas", name: "Trend", object_type: "UI/Components/Widgets/AdvancedTrend/AdvancedTrendMain" }), undefined);
	assert.equal(typeBearingCreateRefusal({ op: "create_widget", screen: "UI/Screens/TrendView", name: "Label", widget_type: "ScaleLayout" }), undefined);
	assert.equal(typeBearingCreateRefusal({ op: "create_variable", parent: "Model/Smt", name: "Trend", datatype: "NodeId" }), undefined);
	assert.equal(typeBearingCreateRefusal({ op: "set_property", path: "UI/Screens/TrendView", name: "Width", value: "-1" }), undefined);
});

test("an ordinary screen name passes the gate", () => {
	for (const name of ["TrendView", "LineStatus", "StationHealth", "AlarmSummary", "LineTrend", "TrendPens"]) {
		assert.equal(typeBearingCreateRefusal({ op: "create_widget", screen: "UI/Screens", name, widget_type: "Screen" }), undefined, name);
	}
});
