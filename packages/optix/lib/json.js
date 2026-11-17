/**
 * Make a tool result representable as lossless JSON.
 *
 * A tool result is handed to the host harness as structured data, and the harness refuses a value it
 * cannot represent exactly - the whole call fails with "value is not lossless JSON", taking with it the
 * fact the session asked for. That happened on a live session: `optix_logs` returned a `Date` for a file's
 * mtime and the runtime log - the only place a silent binding failure shows up - could not be read at all
 * (session f7c609cb, 2026-11-16). One sanitiser at the registration seam means no tool can repeat it.
 */
import { defineTool } from "@deepseek-ai/dsh-tools";

/** Values that carry a JSON form of their own (a `Date` is the one measured in the wild). */
const MAX_DEPTH = 32;

/**
 * Convert a value to lossless JSON: dates become ISO strings, non-finite numbers and undefined become null,
 * bigints become strings, maps and sets become arrays/objects, and everything else is copied.
 * @param value - The value a tool wants to return.
 * @param seen - Objects already visited, so a cycle cannot spin.
 * @param depth - Current recursion depth, bounded by MAX_DEPTH.
 * @returns A value JSON can hold exactly.
 */
export function jsonSafe(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
	if (depth > MAX_DEPTH) return null;
	if (value === null) return null;
	const type = typeof value;
	if (type === "string" || type === "boolean") return value;
	if (type === "number") return Number.isFinite(value) ? value : null;
	if (type === "undefined" || type === "function" || type === "symbol") return null;
	if (type === "bigint") return value.toString();
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
	if (value instanceof Error) return {
		name: value.name,
		message: value.message
	};
	if (value instanceof RegExp) return String(value);
	if (value instanceof Uint8Array) return [...value];
	if (typeof value.toJSON === "function") {
		if (seen.has(value)) return null;
		seen.add(value);
		return jsonSafe(value.toJSON(), seen, depth + 1);
	}
	if (typeof value !== "object") return null;
	if (seen.has(value)) return null;
	seen.add(value);
	if (Array.isArray(value)) return value.map((entry) => jsonSafe(entry, seen, depth + 1));
	if (value instanceof Map) {
		const out = {};
		for (const [key, entry] of value) out[String(key)] = jsonSafe(entry, seen, depth + 1);
		return out;
	}
	if (value instanceof Set) return [...value].map((entry) => jsonSafe(entry, seen, depth + 1));
	const out = {};
	for (const [key, entry] of Object.entries(value)) {
		const clean = jsonSafe(entry, seen, depth + 1);
		if (entry === void 0) continue;
		out[key] = clean;
	}
	return out;
}

/**
 * Wrap a tool definition so its result is sanitised before the harness sees it.
 *
 * The definition is otherwise untouched: parameters, output schema, `presentCall` and the panic path all
 * stay exactly as declared, so a tool cannot drift from the contract the rest of the plugin tests.
 * @param tool - A `defineTool` definition, exactly as the plugin's other tools declare one.
 * @returns The same definition, guarded, already passed through `defineTool`.
 */
export function jsonTool(tool) {
	const execute = tool.execute;
	return defineTool({
		...tool,
		async execute(args, exec) {
			return jsonSafe(await execute.call(tool, args, exec));
		}
	});
}
