/**
 * Project a design language onto an Optix `StyleSheet`, as operations the bridge already serves.
 *
 * The module is deliberately small and literal: a token becomes a `set_property` on the sheet node,
 * a named style becomes a `ButtonStyle`/`LabelStyle`/… created inside its collection, and the
 * presentation engines are pointed at the sheet by writing the **`Value` child of their `StyleSheet`
 * pointer**. That last detail is not cosmetic — writing the engine's `StyleSheet` property answers
 * `ok` while the engine keeps its old sheet (measured on bridge 1.0.9), so every pointer write here
 * is expressed the way that actually takes effect and the caller reads it back.
 * @module dsh-tool-ft-optix/theme
 */

import { DEFAULT_LANGUAGE, getLanguage, validateLanguage } from "./languages.js";

/** Collections a stylesheet carries, in the order Studio creates them. */
export const STYLE_COLLECTIONS = Object.freeze([
	"ButtonStyles",
	"InputBoxStyles",
	"SwitchStyles",
	"GaugeStyles",
	"NavigationPanelStyles",
	"ChartStyles",
	"DataListStyles",
	"ToolTipStyles",
	"ScrollBarStyles",
	"AccordionStyles",
	"PieChartStyles",
	"HistogramChartStyles",
	"LabelStyles",
	"RadioButtonStyles",
	"CheckBoxStyles",
	"RectangleStyles",
	"ScreenStyles",
]);

/** The presentation engines a theme is bound on, in the order the shell binds them. */
export const THEME_ENGINES = Object.freeze(["UI/NativePresentationEngine", "UI/WebPresentationEngine"]);

/**
 * A property operation, in the shape `optix_edit` takes.
 * @param {string} path
 * @param {string} name
 * @param {string} value
 */
function set(path, name, value) {
	return { op: "set_property", path, name, value };
}

/**
 * The value a `NodeId` pointer takes for a node inside the project.
 *
 * Measured on bridge 1.0.9 (2026-11-15): `validate_ops` accepts only the project-relative spelling —
 * `UI/<Sheet>` validates, and both `/Objects/<Project>/UI/<Sheet>` and `/Objects/UI/<Sheet>` are
 * refused with `bad_value: NodeId value must be a resolvable node path`, whether or not the sheet
 * exists. The engine then reads the pointer back in the same relative form (`ref: "UI/DshStyleSheet"`).
 * `project` stays in the signature because the caller knows it and one day the absolute form may be
 * accepted again; it is not part of the value.
 * @param {string} project
 * @param {string} sheetPath - Project path of the sheet, e.g. `UI/Modern`.
 */
export function sheetPointer(project, sheetPath) {
	if (typeof project !== "string" || project.trim() === "") throw new Error("a sheet pointer needs the project name");
	if (typeof sheetPath !== "string" || sheetPath.trim() === "") throw new Error("a sheet pointer needs the sheet path");
	return sheetPath.trim();
}

/**
 * Compare two `NodeId` spellings.
 *
 * The model, the operation log and the saved YAML spell the same pointer three ways: relative
 * (`UI/Sheet`), absolute (`/Objects/<Project>/UI/Sheet`) and occasionally root-qualified
 * (`<Project>/UI/Sheet`). An audit must not call two spellings of one node a mismatch.
 * @param {string} left
 * @param {string} right
 */
export function samePointer(left, right) {
	const normalise = (value) => String(value ?? "")
		.trim()
		.replace(/^\/Objects\/[^/]+\//u, "")
		.replace(/^\/+/u, "");
	if (normalise(left) === normalise(right)) return true;
	const a = normalise(left).split("/");
	const b = normalise(right).split("/");
	if (a.length === b.length) return false;
	const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
	return shorter.every((segment, index) => segment === longer[index + (longer.length - shorter.length)]);
}

/**
 * Plan a theme application.
 *
 * `exists` says the sheet node is already in the model, which switches the plan from "create the
 * sheet" to "restate its tokens". Both cases restate every token and every named style, so applying
 * a language twice is a no-op that still repairs a property someone changed by hand.
 * @param {object} options
 * @param {string} [options.language] - Language name; defaults to the catalogue default.
 * @param {string} [options.sheet] - Sheet node name; defaults to `Sheet_<language>`.
 * @param {string} options.project - Project name, needed for the plan's identity and the audit's context.
 * @param {string} [options.sheetPath] - Project path of the sheet; defaults to `UI/<sheet>`.
 * @param {boolean} [options.exists] - True when the sheet node is already present.
 * @param {string[]} [options.engines] - Engines to bind; defaults to both presentation engines.
 * @returns {{language: object, sheet: string, sheet_path: string, pointer: string, collections: string[], styles: object[], tokens: Record<string, string>, ops: object[], pointer_ops: object[], counts: object}}
 */
export function themePlan({
	language = DEFAULT_LANGUAGE,
	sheet,
	project,
	sheetPath,
	exists = false,
	existing = [],
	engines = THEME_ENGINES,
} = {}) {
	if (typeof project !== "string" || project.trim() === "") throw new Error("theme plans need project (the project name optix_status reports)");
	const design = getLanguage(language);
	const problems = validateLanguage(design);
	if (problems.length > 0) throw new Error(`language ${design.name} is not usable: ${problems.join("; ")}`);
	const name = String(sheet ?? `Sheet_${design.name}`).trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(name)) throw new Error(`sheet must be a Logix-style name, not "${name}"`);
	const path = String(sheetPath ?? `UI/${name}`).trim();
	if (!path.startsWith("UI/")) throw new Error(`sheet_path must live under UI, not "${path}"`);
	const tokens = {};
	for (const [token, value] of Object.entries(design.tokens)) tokens[token] = String(value);

	const sheetOps = [];
	if (!exists) sheetOps.push({ op: "create_object", parent: "UI", name, object_type: "StyleSheet" });
	for (const [token, value] of Object.entries(tokens)) sheetOps.push(set(path, token, value));
	const styles = design.styles.map((style) => ({
		collection: style.collection,
		type: style.type,
		name: style.name,
		path: `${path}/${style.collection}/${style.name}`,
		properties: { ...style.properties },
	}));
	// A style that is already in the sheet is restated, never created twice: a second apply is a no-op that
	// reasserts the tokens, which is what makes the theme callable after a language change.
	const already = new Set((existing ?? []).map((entry) => String(entry)));
	const styleOps = [];
	for (const style of styles) {
		if (!already.has(style.path)) styleOps.push({ op: "create_object", parent: `${path}/${style.collection}`, name: style.name, object_type: style.type });
		for (const [property, value] of Object.entries(style.properties)) styleOps.push(set(style.path, property, value));
	}

	const pointer = sheetPointer(project, path);
	const pointerOps = [];
	for (const engine of engines) {
		if (!/^UI\/[A-Za-z_][A-Za-z0-9_]*$/u.test(engine)) throw new Error(`engine must be a UI node, not "${engine}"`);
		pointerOps.push(set(`${engine}/StyleSheet`, "Value", pointer));
	}

	return {
		language: { name: design.name, title: design.title, dark: design.dark },
		sheet: name,
		sheet_path: path,
		pointer,
		collections: STYLE_COLLECTIONS,
		styles,
		tokens,
		sheet_ops: sheetOps,
		style_ops: styleOps,
		ops: [...sheetOps, ...styleOps],
		pointer_ops: pointerOps,
		existing_styles: styles.filter((style) => already.has(style.path)).map((style) => style.path),
		counts: { tokens: Object.keys(tokens).length, styles: styles.length, created_styles: styles.filter((style) => !already.has(style.path)).length, sheet_ops: sheetOps.length, style_ops: styleOps.length, ops: sheetOps.length + styleOps.length + pointerOps.length },
	};
}

/**
 * Judge what the model says against what the language asked for.
 *
 * The caller supplies what it read: which sheet each engine points at, and which tokens the sheet
 * node actually carries. A theme that did not land, or landed and was half overwritten by hand, is
 * reported as findings rather than thrown, because an audit is a report.
 * @param {object} options
 * @param {string} [options.language]
 * @param {string} options.sheet_path - Project path of the sheet the plan wrote.
 * @param {Record<string, string>} [options.engine_refs] - Engine path to the sheet path it reads.
 * @param {string[]} [options.observed_tokens] - Token names present on the sheet node.
 * @param {string[]} [options.observed_styles] - Style paths present under the collections.
 * @returns {{ok: boolean, language: string, score: number, findings: object[], missing_tokens: string[], missing_styles: string[], next: string}}
 */
export function auditTheme({ language = DEFAULT_LANGUAGE, sheet_path: sheetPath, engine_refs: engineRefs = {}, observed_tokens: observedTokens = [], observed_styles: observedStyles = [] } = {}) {
	const design = getLanguage(language);
	const wanted = themePlan({ language: design.name, project: "_", sheetPath });
	const findings = [];
	if (typeof sheetPath !== "string" || sheetPath === "") {
		return {
			ok: false,
			language: design.name,
			score: 0,
			findings: [{ id: "THEME-01", severity: "critical", message: "no sheet path was given, so nothing can be audited" }],
			missing_tokens: [],
			missing_styles: [],
			next: "Run optix_ui action theme plan first; the plan names the sheet path.",
		};
	}
	const engineMissing = THEME_ENGINES.filter((engine) => engineRefs[engine] !== undefined && !samePointer(engineRefs[engine], sheetPath));
	if (engineMissing.length > 0) {
		findings.push({
			id: "THEME-02",
			severity: "critical",
			message: `${engineMissing.join(", ")} still read${engineMissing.length === 1 ? "s" : ""} another sheet (${engineMissing.map((engine) => `${engine} -> ${engineRefs[engine] || "(null)"}`).join(", ")}); the language is not applied at runtime`,
			fix: "Write the StyleSheet pointer's Value child in the project-relative form (UI/<Sheet>) and read it back; the engine property itself accepts the write and keeps the old sheet.",
		});
	}
	const tokenNames = new Set(observedTokens.map((token) => String(token)));
	const missingTokens = Object.keys(design.tokens).filter((token) => observedTokens.length > 0 && !tokenNames.has(token));
	if (missingTokens.length > 0) {
		findings.push({
			id: "THEME-03",
			severity: "warning",
			message: `the sheet is missing ${missingTokens.length} token(s): ${missingTokens.join(", ")}`,
			fix: "Re-apply the language; a token someone deleted by hand is restored by the next apply.",
		});
	}
	const styleNames = new Set(observedStyles.map((style) => String(style)));
	const missingStyles = wanted.styles.map((style) => style.path).filter((path) => observedStyles.length > 0 && !styleNames.has(path));
	if (missingStyles.length > 0) {
		findings.push({
			id: "THEME-04",
			severity: "warning",
			message: `the sheet is missing ${missingStyles.length} named style(s): ${missingStyles.join(", ")}`,
			fix: "Re-apply the language; a screen that references a missing style falls back to the sheet defaults.",
		});
	}
	const critical = findings.filter((finding) => finding.severity === "critical").length;
	const penalty = critical * 40 + (findings.length - critical) * 10;
	return {
		ok: critical === 0,
		language: design.name,
		score: Math.max(0, 100 - penalty),
		findings,
		missing_tokens: missingTokens,
		missing_styles: missingStyles,
		next:
			findings.length === 0
				? "The language is applied on every engine the shell uses; a screen that references these styles reads its colours from here."
				: "Apply the theme again (plan then apply), save in Studio, then audit once more.",
	};
}
