/**
 * OPC UA-style model scaffolding for FactoryTalk Optix.
 *
 * The convention this module enforces and explains is the information-model
 * shape every OPC UA client expects to find: a folder hierarchy of Objects
 * (FolderType), reusable ObjectTypes for equipment, typed Variables as their
 * members, and instances of those types carrying the type definition. Optix
 * exposes exactly those primitives through the bridge (`model/folder`,
 * `model/type`, `model/object`, `model/variable`), so the structure is real UA
 * modelling rather than a naming fashion.
 *
 * What it cannot do yet, measured on Studio 1.8.1 / bridge 1.0.9 (2026-11-14):
 * the `Description` attribute and typed `EngineeringUnits` / `EURange`
 * properties. Only `DisplayName` is writable as an attribute, and a plain
 * variable declares no property children to write (`DeclaredPropertyGuard`
 * refuses anything undeclared, deliberately - an orphan created by
 * GetOrCreateVariable access-violates Studio). They are emulated as child
 * String variables, which a UA client sees as components, not Properties, and
 * `MODEL_METADATA.emulated` says so in every report.
 *
 * Second limitation, also measured: children authored into an ObjectType carry
 * ModellingRule None, and a None member is NOT instantiated into instances
 * (the bridge comment at StudioMCPBridge.cs:1680 records the same finding from
 * a ScreenType). Until a bridge route calls SetModellingRuleRecursive, a typed
 * instance gets its members COPIED onto it, so the instance is complete while
 * the inheritance is one-way.
 */

/** Everything the convention places under this folder is model, not UI. */
export const MODEL_ROOT = "Model";

/** Reusable equipment templates live here, as ObjectTypes. */
export const TYPES_FOLDER = "Model/Types";

/** Plant / Area / Line, in that order, above the equipment folder. */
export const DEFAULT_HIERARCHY = ["Plant", "Area", "Line"];

/** More variables than this in one folder means a type or an array is overdue. */
export const MAX_FOLDER_VARIABLES = 12;

/** Studio's own limit is 40 characters; spaces and punctuation are refused by the model. */
const NAME_PATTERN = /^[A-Z][A-Za-z0-9_]{0,39}$/u;

/** The datatype names the bridge's ResolveDataType accepts, in one place. */
const DATA_TYPES = new Set([
	"Boolean",
	"Byte",
	"SByte",
	"Int16",
	"Int32",
	"Int64",
	"UInt16",
	"UInt32",
	"UInt64",
	"Float",
	"Double",
	"String",
	"DateTime",
	"NodeId",
	"LocalizedText",
	"Range",
	"Color",
	"ResourceUri"
]);

/** Analog types that must carry an engineering unit. */
const ANALOG_TYPES = new Set(["Float", "Double"]);

/**
 * Metadata Optix stores beside a variable, in the real OPC UA types where the
 * bridge can reach them.
 *
 * Measured on Optix 1.8.1 / bridge 1.0.9 (2026-11-15): `EngineeringUnits`
 * accepts a `LocalizedText`, `EURange` can be created as a `Range` but its value
 * cannot be assigned through `node/property` ("Conversion to Struct not
 * supported"), so the limits are written as `EURangeLow`/`EURangeHigh` Floats,
 * and `Description` remains a String child because a node attribute cannot be
 * set. The analog VariableType is out of reach: `model/variable` resolves data
 * types only. Every report repeats this so a caller never mistakes a component
 * for a UA Property.
 */
export const MODEL_METADATA = {
	units: { property: "EngineeringUnits", emulatedAs: "LocalizedText variable", datatype: "LocalizedText" },
	range: {
		property: "EURange",
		emulatedAs: "Range variable with EURangeLow/EURangeHigh Floats beside it",
		datatype: "Range"
	},
	description: { property: "Description", emulatedAs: "String variable", datatype: "String" },
	attribute: "DisplayName is written as the node's DisplayName attribute",
	emulated: true,
	why: "Studio 1.8.1 writes only DisplayName as an attribute; a Range value cannot be assigned through the bridge, and a plain variable declares no property children - DeclaredPropertyGuard refuses the rest so an orphan cannot access-violate Studio."
};

/** Rule ids, severities and what each one is about. Kept exported for the docs and the tests. */
export const MODEL_RULES = {
	"OPTIX-MDL-01": {
		severity: "critical",
		title: "a variable lives outside the plant hierarchy",
		fix: "Move it under the equipment folder it belongs to (Model/<Plant>/<Area>/<Line>/<Equipment>) - a flat tag under Model is what makes an OPC UA browse tree useless."
	},
	"OPTIX-MDL-02": {
		severity: "warning",
		title: "an analog value has no engineering unit",
		fix: "Add the EngineeringUnits child (optix_model writes it from spec.tags[].units) so an operator reads a number with a unit, not a bare float."
	},
	"OPTIX-MDL-03": {
		severity: "warning",
		title: "a variable says nothing about what it means",
		fix: "Add a Description child (spec.tags[].description) - a browse tree of Pressure1..Pressure9 with no text is a flat model wearing a hierarchy."
	},
	"OPTIX-MDL-04": {
		severity: "warning",
		title: "a node name breaks the naming convention",
		fix: "Rename to PascalCase, at most 40 characters, letters/digits/underscore only - Studio refuses spaces and longer names later, and paths stop resolving now."
	},
	"OPTIX-MDL-05": {
		severity: "info",
		title: "a folder holds more variables than an operator can scan",
		fix: "Give the equipment a type (Model/Types) or model repeated signals as an array."
	},
	"OPTIX-MDL-06": {
		severity: "info",
		title: "equipment folders exist with no ObjectType behind them",
		fix: "Declare the equipment as a type (spec.types) and instantiate it, so every instance carries the same member set."
	}
};

/**
 * Validates a name the way Studio will, returning a sentence or undefined.
 * @param {string} name
 * @param {string} what
 */
export function nameProblem(name, what) {
	if (typeof name !== "string" || name.trim() === "") return `${what} needs a name`;
	if (!NAME_PATTERN.test(name))
		return `${what} "${name}" is not PascalCase letters/digits/underscore within 40 characters`;
	return void 0;
}

/**
 * Validates a datatype name against what the bridge can create.
 * @param {string} datatype
 * @param {string} what
 */
export function datatypeProblem(datatype, what) {
	if (typeof datatype !== "string" || datatype.trim() === "") return `${what} needs a datatype`;
	if (!DATA_TYPES.has(datatype)) return `${what} "${datatype}" is not one of ${[...DATA_TYPES].join(", ")}`;
	return void 0;
}

/** Joins a parent path and a name without doubling or dropping the separator. */
function join(parent, name) {
	if (parent === "") return name;
	return `${parent.replace(/\/+$/u, "")}/${name}`;
}

/** Segments of a project path. */
function segments(path) {
	return String(path)
		.split("/")
		.filter((part) => part !== "");
}

/**
 * Expands a spec into the ordered authoring operations the convention wants.
 *
 * The spec is deliberately small - it is what an engineer knows before
 * modelling, not a serialization of the whole model:
 *
 * {
 *   plant: "SouthPlant",
 *   area: "Bottling",
 *   hierarchy: ["Plant", "Area", "Line"],        // optional, this is the default
 *   types: [{ name: "Pump", tags: [{ name: "Running", datatype: "Boolean" }, ...] }],
 *   lines: [{
 *     name: "Line1",
 *     equipment: [{
 *       name: "Pump1",
 *       type: "Pump",                            // optional: instance of a spec type
 *       tags: [{ name: "Pressure", datatype: "Float", units: "bar",
 *                range: [0, 10], description: "Discharge pressure", initial: 0,
 *                display_name: "Discharge pressure" }]
 *     }]
 *   }]
 * }
 *
 * @param {object} spec
 * @param {{ hierarchy?: string[], existing?: Set<string> }} [options] existing = paths already in the model, so a re-run does not try to create them again
 * @returns {{ ops: object[], tree: string[], counts: object, questions: string[], skipped: string[], hierarchy: string[] }}
 */
export function planModel(spec, options = {}) {
	const hierarchy = options.hierarchy ?? spec?.hierarchy ?? DEFAULT_HIERARCHY;
	const existing = options.existing ?? new Set();
	if (!Array.isArray(hierarchy) || hierarchy.length !== 3)
		throw new Error("hierarchy must name three levels, in order, for example Plant, Area, Line");
	for (const level of hierarchy) {
		const problem = nameProblem(level, "hierarchy level");
		if (problem !== void 0) throw new Error(problem);
	}
	if (spec === void 0 || typeof spec !== "object") throw new Error("spec is required: plant, area, lines");
	const plantProblem = nameProblem(spec.plant, "plant");
	if (plantProblem !== void 0) throw new Error(plantProblem);
	const areaProblem = nameProblem(spec.area, "area");
	if (areaProblem !== void 0) throw new Error(areaProblem);
	if (!Array.isArray(spec.lines) || spec.lines.length === 0) throw new Error("spec.lines needs at least one line");

	const ops = [];
	const tree = [MODEL_ROOT];
	const skipped = [];
	const questions = [];
	const counts = { folders: 0, types: 0, objects: 0, variables: 0, metadata: 0 };
	const specTypes = new Map();

	/** Adds one op unless the path already exists, and records the skip. */
	const create = (op, path) => {
		if (existing.has(path)) {
			skipped.push(path);
			return false;
		}
		ops.push(op);
		return true;
	};

	// Types first: an instance may only name a type that exists.
	const declaredTypes = Array.isArray(spec.types) ? spec.types : [];
	if (declaredTypes.length > 0) {
		tree.push(TYPES_FOLDER);
		create({ op: "create_folder", parent: MODEL_ROOT, name: "Types" }, TYPES_FOLDER);
	}
	for (const type of declaredTypes) {
		const problem = nameProblem(type?.name, "type");
		if (problem !== void 0) throw new Error(problem);
		if (specTypes.has(type.name)) throw new Error(`type "${type.name}" is declared twice`);
		specTypes.set(type.name, type);
		const typePath = join(TYPES_FOLDER, type.name);
		if (create({ op: "create_type", parent: TYPES_FOLDER, name: type.name }, typePath)) counts.types += 1;
		writeTags(typePath, type.tags ?? [], `type ${type.name}`);
	}

	const plantPath = join(MODEL_ROOT, spec.plant);
	const areaPath = join(plantPath, spec.area);
	tree.push(plantPath, areaPath);
	create({ op: "create_folder", parent: MODEL_ROOT, name: spec.plant }, plantPath);
	create({ op: "create_folder", parent: plantPath, name: spec.area }, areaPath);

	for (const line of spec.lines) {
		const lineProblem = nameProblem(line?.name, "line");
		if (lineProblem !== void 0) throw new Error(lineProblem);
		const linePath = join(areaPath, line.name);
		tree.push(linePath);
		if (create({ op: "create_folder", parent: areaPath, name: line.name }, linePath)) counts.folders += 1;
		if (!Array.isArray(line.equipment) || line.equipment.length === 0)
			questions.push(`Line ${line.name} has no equipment - which machines sit on it?`);
		for (const equipment of line.equipment ?? []) {
			const equipmentProblem = nameProblem(equipment?.name, "equipment");
			if (equipmentProblem !== void 0) throw new Error(equipmentProblem);
			const equipmentPath = join(linePath, equipment.name);
			tree.push(equipmentPath);
			const type = equipment.type === void 0 ? void 0 : specTypes.get(equipment.type);
			if (equipment.type !== void 0 && type === void 0)
				throw new Error(`equipment "${equipment.name}" names type "${equipment.type}", which spec.types does not declare`);
			if (type !== void 0) {
				if (Array.isArray(equipment.tags) && equipment.tags.length > 0)
					throw new Error(
						`equipment "${equipment.name}" is an instance of "${type.name}" - put its tags on the type, or leave type unset to give it its own`
					);
				if (create({ op: "create_object", parent: linePath, name: equipment.name, type: join(TYPES_FOLDER, type.name) }, equipmentPath))
					counts.objects += 1;
				// The type's members are copied onto the instance: ModellingRule is
				// None until a bridge route can set it, and a None member is not
				// instantiated (see the module comment). Same names, datatypes and
				// metadata, so a UA client sees a complete instance.
				writeTags(equipmentPath, type.tags ?? [], `instance ${equipmentPath}`);
			} else {
				create({ op: "create_folder", parent: linePath, name: equipment.name }, equipmentPath);
				writeTags(equipmentPath, equipment.tags ?? [], `equipment ${equipment.name}`);
			}
		}
	}
	return { ops, tree, counts, questions, skipped, hierarchy };

	/**
	 * Emits the variable ops for one owner path: the variable itself, its
	 * DisplayName, its initial value, and the metadata children this bridge can
	 * hold (units, range, description).
	 */
	function writeTags(ownerPath, tags, label) {
		if (!Array.isArray(tags)) throw new Error(`${label} tags must be an array`);
		const seen = new Set();
		for (const tag of tags) {
			const problem = nameProblem(tag?.name, `${label} tag`);
			if (problem !== void 0) throw new Error(problem);
			if (seen.has(tag.name)) throw new Error(`${label} declares tag "${tag.name}" twice`);
			seen.add(tag.name);
			const datatypeIssue = datatypeProblem(tag.datatype, `${label} tag "${tag.name}"`);
			if (datatypeIssue !== void 0) throw new Error(datatypeIssue);
			const tagPath = join(ownerPath, tag.name);
			if (tag.range !== void 0 && (!Array.isArray(tag.range) || tag.range.length !== 2 || tag.range.some((bound) => typeof bound !== "number" || !Number.isFinite(bound))))
				throw new Error(`${label} tag "${tag.name}" has range ${JSON.stringify(tag.range)} - give it two numbers, for example [0, 10]`);
			// One operation, expanded by the editor into the variable plus its OPC UA
			// metadata (see `expandVariables` in index.js): units travel as a
			// LocalizedText, the limits as EURangeLow/High Floats beside a Range.
			const analog = ANALOG_TYPES.has(tag.datatype);
			if (!create({
				op: "create_variable",
				parent: ownerPath,
				name: tag.name,
				datatype: tag.datatype,
				...(analog && (tag.units !== void 0 || tag.range !== void 0 || tag.description !== void 0) ? { kind: "analog" } : {}),
				...(tag.units === void 0 ? {} : { units: tag.units }),
				...(tag.range === void 0 ? {} : { range: tag.range }),
				...(typeof tag.display_name !== "string" || tag.display_name.trim() === "" ? {} : { display_name: tag.display_name })
			}, tagPath)) continue;
			counts.variables += 1;
			if (tag.units !== void 0) counts.metadata += 1;
			if (tag.range !== void 0) counts.metadata += 2;
			if (tag.initial !== void 0 && tag.initial !== null)
				ops.push({ op: "set_property", path: tagPath, name: "Value", value: String(tag.initial) });
			// Description stays a String child: the attribute itself is refused by the bridge.
			if (typeof tag.description === "string" && tag.description.trim() !== "") {
				const metadataPath = join(tagPath, "Description");
				if (create({ op: "create_variable", parent: tagPath, name: "Description", datatype: "String" }, metadataPath)) {
					ops.push({ op: "set_property", path: metadataPath, name: "Value", value: String(tag.description) });
					counts.metadata += 1;
				}
			}
		}
	}
}

/**
 * Inspects a described model and reports where it stops being an OPC UA
 * information model.
 *
 * `nodes` is a flat description, one entry per node, in the shape the bridge
 * read gives us:
 *   { path, name, kind: "folder"|"object"|"type"|"variable", datatype?,
 *     members: string[] }        // child node names, including metadata children
 *
 * @param {{ nodes: object[], hierarchy?: string[], truncated?: boolean }} input
 */
export function modelFindings(input) {
	const hierarchy = input?.hierarchy ?? DEFAULT_HIERARCHY;
	const nodes = Array.isArray(input?.nodes) ? input.nodes : [];
	const findings = [];
	const coverage = [];
	const folders = nodes.filter((node) => node.kind === "folder");
	const variables = nodes.filter((node) => node.kind === "variable");
	const types = nodes.filter((node) => node.kind === "type");
	const membersOf = (node) => new Set(Array.isArray(node.members) ? node.members : []);
	const depthOf = (node) => segments(node.path).length;
	const equipmentPaths = folders.filter((node) => depthOf(node) === hierarchy.length + 2);
	const minimumDepth = hierarchy.length + 3;

	for (const variable of variables) {
		const depth = depthOf(variable);
		if (depth < minimumDepth) {
			findings.push({
				rule: "OPTIX-MDL-01",
				severity: MODEL_RULES["OPTIX-MDL-01"].severity,
				path: variable.path,
				message: `${variable.path} sits ${depth} level(s) deep, inside a hierarchy that needs ${minimumDepth} (${hierarchy.join(" / ")} / equipment / signal)`
			});
		}
		const members = membersOf(variable);
		if (ANALOG_TYPES.has(variable.datatype) && !members.has(MODEL_METADATA.units.property)) {
			findings.push({
				rule: "OPTIX-MDL-02",
				severity: MODEL_RULES["OPTIX-MDL-02"].severity,
				path: variable.path,
				message: `${variable.path} is ${variable.datatype} with no ${MODEL_METADATA.units.property}`
			});
		}
		if (!members.has(MODEL_METADATA.description.property)) {
			findings.push({
				rule: "OPTIX-MDL-03",
				severity: MODEL_RULES["OPTIX-MDL-03"].severity,
				path: variable.path,
				message: `${variable.path} carries no ${MODEL_METADATA.description.property}`
			});
		}
		if (!NAME_PATTERN.test(variable.name ?? "")) {
			findings.push({
				rule: "OPTIX-MDL-04",
				severity: MODEL_RULES["OPTIX-MDL-04"].severity,
				path: variable.path,
				message: `${variable.path} breaks the naming convention (PascalCase, <= 40 characters)`
			});
		}
	}

	for (const folder of folders) {
		const own = variables.filter(
			(variable) => depthOf(variable) === depthOf(folder) + 1 && variable.path.startsWith(`${folder.path}/`)
		);
		if (own.length > MAX_FOLDER_VARIABLES) {
			findings.push({
				rule: "OPTIX-MDL-05",
				severity: MODEL_RULES["OPTIX-MDL-05"].severity,
				path: folder.path,
				message: `${folder.path} holds ${own.length} variables directly (over ${MAX_FOLDER_VARIABLES})`
			});
		}
	}

	if (equipmentPaths.length >= 2 && types.length === 0) {
		findings.push({
			rule: "OPTIX-MDL-06",
			severity: MODEL_RULES["OPTIX-MDL-06"].severity,
			path: TYPES_FOLDER,
			message: `${equipmentPaths.length} equipment folders exist and ${TYPES_FOLDER} declares no ObjectType`
		});
	}

	coverage.push(`${variables.length} variable(s), ${folders.length} folder(s), ${types.length} type(s) read from ${MODEL_ROOT}`);
	if (variables.length === 0) coverage.push(`${MODEL_ROOT} holds no variables yet - nothing to judge`);
	if (input?.truncated === true) coverage.push("the model read was truncated, so depth and folder counts are lower bounds");

	const order = { critical: 0, warning: 1, info: 2 };
	findings.sort((left, right) => order[left.severity] - order[right.severity] || left.path.localeCompare(right.path));
	for (const finding of findings) {
		const rule = MODEL_RULES[finding.rule];
		if (rule !== void 0) finding.fix = rule.fix;
	}
	const counts = {
		critical: findings.filter((finding) => finding.severity === "critical").length,
		warning: findings.filter((finding) => finding.severity === "warning").length,
		info: findings.filter((finding) => finding.severity === "info").length,
		variables: variables.length,
		folders: folders.length,
		types: types.length,
		equipment: equipmentPaths.length
	};
	return {
		verdict: counts.critical > 0 || counts.warning > 0 ? "needs-work" : "structured",
		counts,
		findings,
		coverage,
		metadata: MODEL_METADATA,
		...(equipmentPaths.length === 0 && variables.length > 0
			? { note: `${MODEL_ROOT} has variables but no ${hierarchy.join(" / ")} folders` }
			: {})
	};
}
