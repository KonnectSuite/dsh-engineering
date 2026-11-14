import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
	DEFAULT_HIERARCHY,
	MAX_FOLDER_VARIABLES,
	MODEL_METADATA,
	MODEL_ROOT,
	MODEL_RULES,
	TYPES_FOLDER,
	datatypeProblem,
	modelFindings,
	nameProblem,
	planModel
} from "../packages/optix/lib/model.js";

/** The screen the lane is meant to produce: one plant, one area, one line, a typed filler. */
const canonical = {
	plant: "Bottling",
	area: "Packaging",
	types: [
		{
			name: "Filler",
			tags: [
				{ name: "Speed", datatype: "Float", units: "bpm", range: [0, 60], description: "Filler speed" },
				{ name: "Running", datatype: "Boolean", description: "Filler running" }
			]
		}
	],
	lines: [
		{
			name: "LineA",
			equipment: [
				{ name: "Filler1", type: "Filler" },
				{ name: "Palletiser", tags: [{ name: "Count", datatype: "Int32", units: "pcs", description: "Cases palletised" }] }
			]
		}
	]
};

const plugin = readFileSync(new URL("../packages/optix/lib/index.js", import.meta.url), "utf8");

test("the plan builds the plant hierarchy, the types folder first and typed instances with copied members", () => {
	const plan = planModel(canonical);
	assert.deepEqual(plan.tree, [
		MODEL_ROOT,
		TYPES_FOLDER,
		"Model/Bottling",
		"Model/Bottling/Packaging",
		"Model/Bottling/Packaging/LineA",
		"Model/Bottling/Packaging/LineA/Filler1",
		"Model/Bottling/Packaging/LineA/Palletiser"
	]);
	assert.equal(plan.counts.folders, 1);
	assert.equal(plan.counts.types, 1);
	assert.equal(plan.counts.objects, 1);
	// Two type tags, two members copied onto the instance, one tag of its own.
	assert.equal(plan.counts.variables, 5);
	// Speed gets units + range + description, Running gets description only, Count gets all three.
	assert.equal(plan.counts.metadata, 10);
	const firstFolder = plan.ops.findIndex((op) => op.op === "create_folder" && op.name === "Types");
	const lastTypeOp = plan.ops.findLastIndex((op) => String(op.parent).startsWith(TYPES_FOLDER));
	assert.ok(firstFolder >= 0 && lastTypeOp > firstFolder, "types must be declared before an instance names one");
	const instance = plan.ops.find((op) => op.op === "create_object" && op.name === "Filler1");
	assert.equal(instance?.type, "Model/Types/Filler");
});

test("the plan refuses a spec it cannot lay out, in words an operator can act on", () => {
	assert.throws(() => planModel({ ...canonical, lines: [] }), /spec.lines needs at least one line/u);
	assert.throws(() => planModel({ ...canonical, plant: "bottling" }), /plant "bottling" is not PascalCase/u);
	assert.throws(() => planModel({ ...canonical, area: undefined }), /area needs a name/u);
	assert.throws(() => planModel(canonical, { hierarchy: ["Plant", "Area"] }), /three levels/u);
	assert.throws(
		() => planModel({ ...canonical, lines: [{ name: "LineA", equipment: [{ name: "Pump", type: "Missing" }] }] }),
		/names type "Missing", which spec.types does not declare/u
	);
	assert.throws(
		() => planModel({
			...canonical,
			lines: [{ name: "LineA", equipment: [{ name: "Filler1", type: "Filler", tags: [{ name: "Own", datatype: "Int32" }] }] }]
		}),
		/is an instance of "Filler"/u
	);
	assert.throws(
		() => planModel({
			...canonical,
			types: [{ name: "Filler", tags: [{ name: "Speed", datatype: "Float", range: "0..60" }] }],
			lines: [{ name: "LineA", equipment: [{ name: "Filler1", type: "Filler" }] }]
		}),
		/give it two numbers/u
	);
});

test("a path that already exists is skipped, so a second run adds nothing", () => {
	const first = planModel(canonical);
	const existing = new Set(first.ops.filter((op) => op.op !== "set_property").map((op) => op.path ?? `${op.parent}/${op.name}`));
	const second = planModel(canonical, { existing });
	assert.equal(second.ops.length, 0);
	assert.ok(second.skipped.length > 0, "every existing path is reported as skipped");
});

test("analog tags carry units and range, booleans carry only a description, and every tag names its metadata", () => {
	const plan = planModel(canonical);
	const units = plan.ops.find((op) => op.op === "create_variable" && op.name === MODEL_METADATA.units.property);
	assert.equal(units?.datatype, "String");
	const speedRange = plan.ops.find((op) => op.op === "create_variable" && op.parent === "Model/Bottling/Packaging/LineA/Filler1/Speed" && op.name === MODEL_METADATA.range.property);
	assert.equal(speedRange?.datatype, "String");
	const runningUnits = plan.ops.find((op) => op.op === "create_variable" && op.parent === "Model/Bottling/Packaging/LineA/Filler1/Running" && op.name === MODEL_METADATA.units.property);
	assert.equal(runningUnits, undefined, "a boolean has no engineering units");
	const value = plan.ops.find((op) => op.op === "set_property" && op.name === "Value" && op.value === "bpm");
	assert.ok(value !== void 0, "the units value travels as a Value write");
	assert.equal(MODEL_METADATA.emulated, true);
	const euRange = plan.ops.find((op) => op.op === "set_property" && op.name === "Value" && String(op.value).includes(".."));
	assert.equal(euRange?.value, "0..60");
});

test("a conventional model reads as structured, a flat tag reads as needs-work", () => {
	const structured = modelFindings({
		nodes: [
			{ path: "Model/Bottling", name: "Bottling", kind: "folder" },
			{ path: "Model/Bottling/Packaging", name: "Packaging", kind: "folder" },
			{ path: "Model/Bottling/Packaging/LineA", name: "LineA", kind: "folder" },
			{ path: "Model/Bottling/Packaging/LineA/Filler1", name: "Filler1", kind: "object" },
			{ path: "Model/Types", name: "Types", kind: "folder" },
			{ path: "Model/Types/Filler", name: "Filler", kind: "type" },
			{
				path: "Model/Bottling/Packaging/LineA/Filler1/Speed",
				name: "Speed",
				kind: "variable",
				datatype: "Float",
				members: [MODEL_METADATA.units.property, MODEL_METADATA.range.property, MODEL_METADATA.description.property]
			}
		]
	});
	assert.equal(structured.verdict, "structured");
	assert.deepEqual(structured.findings, []);

	const flat = modelFindings({
		nodes: [
			{ path: "Model/Bottling", name: "Bottling", kind: "folder" },
			{ path: "Model/Bottling/Packaging", name: "Packaging", kind: "folder" },
			{ path: "Model/Bottling/Packaging/LineA", name: "LineA", kind: "folder" },
			{ path: "Model/Bottling/Packaging/LineA/Filler1", name: "Filler1", kind: "folder" },
			{ path: "Model/Bottling/Packaging/LineA/Filler2", name: "Filler2", kind: "folder" },
			{ path: "Model/flat_tag", name: "flat_tag", kind: "variable", datatype: "Float" }
		]
	});
	assert.equal(flat.verdict, "needs-work");
	const rules = flat.findings.map((finding) => finding.rule);
	for (const rule of ["OPTIX-MDL-01", "OPTIX-MDL-02", "OPTIX-MDL-03", "OPTIX-MDL-04", "OPTIX-MDL-06"]) {
		assert.ok(rules.includes(rule), `expected ${rule} in ${rules.join(", ")}`);
	}
	assert.equal(flat.findings.find((finding) => finding.rule === "OPTIX-MDL-01").severity, "critical");
});

test("a folder holding more than the convention allows is reported, not rejected", () => {
	const nodes = [
		{ path: "Model/P", name: "P", kind: "folder" },
		{ path: "Model/P/A", name: "A", kind: "folder" },
		{ path: "Model/P/A/L", name: "L", kind: "folder" },
		{ path: "Model/P/A/L/E", name: "E", kind: "folder" }
	];
	for (let index = 0; index < MAX_FOLDER_VARIABLES + 1; index += 1) {
		nodes.push({ path: `Model/P/A/L/E/Signal${index}`, name: `Signal${index}`, kind: "variable", datatype: "Int32", members: [MODEL_METADATA.units.property, MODEL_METADATA.description.property] });
	}
	const report = modelFindings({ nodes });
	const rules = report.findings.map((finding) => finding.rule);
	assert.ok(rules.includes("OPTIX-MDL-05"));
});

test("the rules name their corpus ids and every rule carries a fix", () => {
	for (const [id, rule] of Object.entries(MODEL_RULES)) {
		assert.match(id, /^OPTIX-MDL-\d\d$/u);
		assert.ok(["critical", "warning", "info"].includes(rule.severity), id);
		assert.ok(rule.fix.length > 20, `${id} needs a fix sentence`);
	}
	assert.deepEqual(DEFAULT_HIERARCHY, ["Plant", "Area", "Line"]);
});

test("the helpers judge names and datatypes the way the bridge will", () => {
	assert.equal(nameProblem("Filler1", "tag"), undefined);
	assert.match(String(nameProblem("filler 1", "tag")), /not PascalCase/u);
	assert.match(String(nameProblem("A".repeat(41), "tag")), /40 characters/u);
	assert.equal(datatypeProblem("Float", "tag"), undefined);
	assert.match(String(datatypeProblem("REAL", "tag")), /Float, Double/u);
});

test("the tool is registered, refuses an unknown action and can only write through the validated batch", () => {
	assert.match(plugin, /name: "optix_model"/u);
	assert.match(plugin, /action must be plan, apply or check/u);
	assert.match(plugin, /if \(action === "apply"\) allowWrite\(true\);/u);
	assert.match(plugin, /await runValidatedBatch\(\{/u);
	assert.match(plugin, /planModel\(args\.spec/u);
	assert.match(plugin, /modelFindings\(\{ nodes: read\.nodes/u);
});
