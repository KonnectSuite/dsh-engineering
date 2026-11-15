/**
 * The Optix object model, as the installed Studio describes it.
 * @module dsh-tool-ft-optix/schema
 *
 * `schema/optix-schema.json` is generated from the Studio help that ships with
 * the installed product (`scripts/gen-optix-schema.mjs`), so it names the types,
 * properties, methods, events and enum members of *this* Studio build rather than
 * a remembered one. It carries identifiers and data types only - no vendor prose -
 * which is why it can ship inside the plugin.
 *
 * What this module answers, and why each question is worth a tool call:
 * - `typeInfo` - the property of a concrete widget type, so a write is spelled
 *   right the first time instead of being refused by the bridge.
 * - `enumInfo` - the members an enum-valued property accepts.
 * - `find` - "which object type owns a property called X", the question behind a
 *   refusal that names a property the agent invented.
 * - `closest` - the spelling hint appended to such a refusal.
 */
import { readFileSync } from "node:fs";

const SCHEMA_URL = new URL("../schema/optix-schema.json", import.meta.url);

let cached;

/** Read and parse the shipped catalog once per process. */
export function loadSchema() {
	if (cached === undefined) {
		cached = JSON.parse(readFileSync(SCHEMA_URL, "utf8"));
	}
	return cached;
}

/** Identity of the catalog: which Studio it came from and what it holds. */
export function schemaVersion() {
	const schema = loadSchema();
	return {
		schema_version: schema.schemaVersion,
		studio_version: schema.studioVersion,
		generated_from: schema.generatedFrom,
		counts: schema.counts
	};
}

/** Every type name the catalog knows, both object and variable types. */
function typeTables(schema) {
	return {
		object: schema.types ?? {},
		variable: schema.variableTypes ?? {}
	};
}

/** All type names, object types first. */
export function typeNames() {
	const tables = typeTables(loadSchema());
	return [...Object.keys(tables.object), ...Object.keys(tables.variable)];
}

/**
 * The CLR namespace a NetLogic needs, from the help's own folder name.
 *
 * The help files a type under `FTOptix-UI`, while C# spells it `FTOptix.UI`; the
 * OPC UA base types live in `Opc.Ua`. Both spellings are useful - the folder one
 * is what the catalog stores - so this is derived rather than stored twice.
 */
function clrNamespace(namespace) {
	if (typeof namespace !== "string") return undefined;
	if (namespace === "OPC-UA") return "Opc.Ua";
	if (namespace.startsWith("FTOptix-")) return `FTOptix.${namespace.slice("FTOptix-".length).replace(/-/g, ".")}`;
	return undefined;
}

/** The C# type name for a catalog type, when it is a product type. */
function clrName(namespace, browseName) {
	const space = clrNamespace(namespace);
	return space === undefined ? undefined : `${space}.${browseName}`;
}

/** Follow `superType` links up the chain, guarding against a cycle in the doc. */
function superChain(schema, name, kind) {
	const tables = typeTables(schema);
	const table = tables[kind];
	const chain = [];
	const seen = new Set([name]);
	let current = table[name];
	while (current !== undefined && typeof current.superType === "string" && current.superType !== "") {
		const next = current.superType;
		if (seen.has(next)) break;
		seen.add(next);
		chain.push(next);
		current = table[next];
		if (current === undefined) {
			// The supertype may live in the other table (an object type deriving from a
			// variable type is not a thing, but a doc page can be filed under either).
			current = undefined;
		}
	}
	return chain;
}

/** Properties of one type including everything it inherits, own properties first. */
function allProperties(schema, name, kind) {
	const tables = typeTables(schema);
	const seen = new Set();
	const rows = [];
	for (const typeName of [name, ...superChain(schema, name, kind)]) {
		const type = tables[kind][typeName];
		if (type === undefined) continue;
		for (const property of type.properties ?? []) {
			if (seen.has(property.name)) continue;
			seen.add(property.name);
			rows.push({
				name: property.name,
				...(property.display === undefined || property.display === property.name ? {} : { display: property.display }),
				...(property.dataType === undefined ? {} : { dataType: property.dataType }),
				...(typeName === name ? {} : { inherited: true, declaredBy: typeName }),
				...(property.child === undefined ? {} : { child: property.child })
			});
		}
	}
	return rows;
}

/**
 * Everything the catalog knows about one type.
 * `properties` is the merged view a write needs; `own_properties` is what the type
 * page itself declares, which is what a reader of the docs would see.
 */
export function typeInfo(name) {
	const schema = loadSchema();
	const tables = typeTables(schema);
	const kind = tables.object[name] !== undefined ? "object" : tables.variable[name] !== undefined ? "variable" : undefined;
	if (kind === undefined) return undefined;
	const type = tables[kind][name];
	const properties = allProperties(schema, name, kind);
	return {
		name,
		kind,
		namespace: type.namespace,
		clr_namespace: clrNamespace(type.namespace) ?? null,
		clr: clrName(type.namespace, name) ?? null,
		super_type: type.superType ?? "",
		super_types: superChain(schema, name, kind),
		properties: properties.map((property) => property.name),
		properties_detail: properties,
		methods: (type.methods ?? []).map((method) => ({
			name: method.name,
			...(method.args === undefined ? {} : { args: method.args })
		})),
		events: type.events ?? [],
		children: type.children ?? []
	};
}

/** The members an enum accepts, in numeric order. */
export function enumInfo(name) {
	const schema = loadSchema();
	const direct = schema.enums?.[name];
	if (direct !== undefined) {
		return {
			name,
			namespace: direct.namespace,
			values: direct.values ?? []
		};
	}
	const dataType = schema.dataTypes?.[name];
	if (dataType !== undefined && dataType.kind === "enum") {
		return {
			name,
			namespace: dataType.namespace,
			values: dataType.values ?? []
		};
	}
	return undefined;
}

/** Whether a data-type name is spellable at all (a primitive, a struct or an enum). */
export function isDataType(name) {
	const schema = loadSchema();
	if (schema.dataTypes?.[name] !== undefined) return true;
	// `Range`, `EUInformation` and friends are OPC UA structs whose pages carry no
	// table, so they are not in dataTypes; the primitive names are listed explicitly.
	return [
		"Boolean", "SByte", "Byte", "Int16", "UInt16", "Int32", "UInt32", "Int64", "UInt64",
		"Float", "Double", "String", "DateTime", "NodeId", "LocalizedText", "QualifiedName",
		"Guid", "ByteString", "XmlElement", "BaseDataType", "BaseVariableType"
	].includes(name);
}

/** Whether an object type name is spellable as a widget/object to create. */
export function isObjectType(name) {
	return loadSchema().types?.[name] !== undefined;
}

/** The type names that can be created as a child of `name` (its element-typed properties). */
export function childrenOf(name) {
	const info = typeInfo(name);
	if (info === undefined) return undefined;
	const tables = typeTables(loadSchema());
	const children = new Set(info.children);
	for (const property of info.properties_detail) {
		if (property.child !== undefined) children.add(property.child);
	}
	return [...children].filter((child) => tables.object[child] !== undefined || tables.variable[child] !== undefined);
}

/** Levenshtein distance, capped at `limit + 1` - only used to rank suggestions. */
function distance(left, right, limit) {
	if (left === right) return 0;
	if (Math.abs(left.length - right.length) > limit) return limit + 1;
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let row = 1; row <= left.length; row += 1) {
		const current = [row];
		let best = row;
		for (let column = 1; column <= right.length; column += 1) {
			const cost = left[row - 1].toLowerCase() === right[column - 1].toLowerCase() ? 0 : 1;
			current[column] = Math.min(previous[column] + 1, current[column - 1] + 1, previous[column - 1] + cost);
			if (current[column] < best) best = current[column];
		}
		if (best > limit) return limit + 1;
		previous = current;
	}
	return previous[right.length];
}

/**
 * Spellings close to `wrong`, best first. A wrong property name is the commonest
 * refusal this plugin sees, and "PhysicalWidth" -> "Width" is the fix.
 */
export function closest(wrong, candidates, limit = 3) {
	const scored = [];
	for (const candidate of candidates) {
		const value = distance(String(wrong), String(candidate), 6);
		if (value <= 6) scored.push({ candidate, value });
	}
	scored.sort((left, right) => left.value - right.value || String(left.candidate).localeCompare(String(right.candidate)));
	return scored.slice(0, limit).map((row) => row.candidate);
}

/**
 * Search types, their properties and enums. `kind` narrows to `type`, `property`
 * or `enum`; without it every kind is returned, most specific first.
 */
export function find(query, limit = 12) {
	const schema = loadSchema();
	const needle = String(query ?? "").trim();
	if (needle === "") return { query: needle, matches: [] };
	const lower = needle.toLowerCase();
	const matches = [];
	const tables = typeTables(schema);

	for (const [kind, table] of Object.entries({ object: tables.object, variable: tables.variable })) {
		for (const [name, type] of Object.entries(table)) {
			const lowerName = name.toLowerCase();
			if (lowerName === lower) matches.push({ score: 0, kind: "type", name, detail: type.namespace });
			else if (lowerName.startsWith(lower)) matches.push({ score: 1, kind: "type", name, detail: type.namespace });
			else if (lowerName.includes(lower)) matches.push({ score: 2, kind: "type", name, detail: type.namespace });
		}
	}

	for (const name of Object.keys(schema.enums ?? {})) {
		const lowerName = name.toLowerCase();
		if (lowerName === lower) matches.push({ score: 0, kind: "enum", name });
		else if (lowerName.startsWith(lower)) matches.push({ score: 1, kind: "enum", name });
		else if (lowerName.includes(lower)) matches.push({ score: 2, kind: "enum", name });
	}

	const propertyOwners = new Map();
	for (const [kind, table] of Object.entries({ object: tables.object, variable: tables.variable })) {
		for (const [name, unused] of Object.entries(table)) {
			for (const property of allProperties(schema, name, kind)) {
				if (property.name.toLowerCase() !== lower) continue;
				const row = propertyOwners.get(property.name) ?? {
					dataType: property.dataType,
					owners: []
				};
				row.owners.push(name);
				propertyOwners.set(property.name, row);
			}
		}
	}
	// One row per property name, with the types that carry it: "Width" belongs to
	// hundreds of types and a hundred identical rows answers nothing.
	for (const [name, row] of propertyOwners) {
		matches.push({
			score: 3,
			kind: "property",
			name,
			...(row.dataType === undefined ? {} : { dataType: row.dataType }),
			owners: row.owners.length,
			sample: row.owners.slice(0, 5)
		});
	}

	// Shorter names first among equal scores: `Text` beats `TextBox` for the query
	// "text", because the shortest containing name is usually the concept asked for.
	matches.sort((left, right) => left.score - right.score || String(left.name).length - String(right.name).length || String(left.name).localeCompare(String(right.name)) || String(left.type ?? "").localeCompare(String(right.type ?? "")));
	return { query: needle, matches: matches.slice(0, limit) };
}

/**
 * Compare a bridge `/bridge/schema/dump` against the shipped catalog.
 *
 * The dump reflects the *running* Studio, so the difference is what a Studio
 * upgrade changed. Two measured limits shape what this can honestly claim:
 * the dump carries only the renderable widget types the bridge's own UI
 * assembly exposes (101 of the catalog's 565 on Studio 1.8.1.27), and it
 * carries neither methods, events nor enum members. So a catalog name the dump
 * does not list proves nothing, and only names the dump does list are compared:
 * a name the catalog lacks is new in Studio, and a property the catalog lacks
 * on a type both know is new too. `covered` says how much was actually
 * comparable. Regenerating the catalog from the newer help is the fix, not
 * merging the two.
 *
 * The dump's `types` arrive as an object keyed by browse name (bridge 1.0.9);
 * an array is accepted too so a future shape does not silently empty the diff.
 *
 * Data-type drift is reported apart from a real difference. The help documents
 * some properties with a conceptual type where the runtime reports the OPC UA
 * one (`Width` is `Size` in the reference and `Single` from the bridge), so
 * naively counting those as changes buries the signal: on Studio 1.8.1.27 they
 * were 842 of 844 rows. `changed` therefore means a property the catalog does
 * not know at all, and `datatype_drift` carries the naming difference.
 */
export function diffDump(dump) {
	const schema = loadSchema();
	const known = new Set(Object.keys(schema.types ?? {}));
	const rows = Array.isArray(dump?.types)
		? dump.types
		: Object.entries(dump?.types ?? {}).map(([name, row]) => ({ name, ...row }));
	const added = [];
	const changed = [];
	const datatypeDrift = [];
	const seen = new Set();
	for (const row of rows) {
		const name = typeof row?.name === "string" ? row.name : typeof row?.browse_name === "string" ? row.browse_name : void 0;
		if (name === void 0) continue;
		seen.add(name);
		if (!known.has(name)) {
			added.push(name);
			continue;
		}
		const ours = new Map((schema.types[name]?.properties ?? []).map((property) => [property.name, property.dataType]));
		const properties = Array.isArray(row.properties)
			? row.properties
			: Object.entries(row.properties ?? {}).map(([propertyName, property]) => ({ name: propertyName, ...property }));
		for (const property of properties) {
			if (typeof property?.name !== "string") continue;
			const knownType = ours.get(property.name);
			if (knownType === undefined) {
				changed.push({ type: name, property: property.name, was: null, now: property.datatype ?? null });
				continue;
			}
			if (property.datatype !== void 0 && knownType !== void 0 && knownType !== property.datatype) {
				datatypeDrift.push({ type: name, property: property.name, catalog: knownType, studio: property.datatype });
			}
		}
	}
	return {
		studio_version: dump?.studio_version ?? dump?.version ?? "unknown",
		shipped_studio_version: schema.studioVersion,
		dump_types: rows.length,
		catalog_types: known.size,
		covered: seen.size,
		added,
		changed,
		datatype_drift: datatypeDrift,
		same: added.length === 0 && changed.length === 0
	};
}
