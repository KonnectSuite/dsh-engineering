import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_LANGUAGE, LANGUAGES, getLanguage, languageCatalogue, languageNames, validateLanguage } from "../packages/optix/lib/languages.js";
import { STYLE_COLLECTIONS, THEME_ENGINES, auditTheme, samePointer, sheetPointer, themePlan } from "../packages/optix/lib/theme.js";

const PROJECT = "LineHMI";
const COLOUR = /^#[0-9A-Fa-f]{6}([0-9A-Fa-f]{2})?$/u;

test("the catalogue offers the languages the kit authors and defaults to modern", () => {
	assert.equal(DEFAULT_LANGUAGE, "modern");
	assert.deepEqual(languageNames, ["modern", "modern-dark", "isa101", "isa101-hc", "material-dark", "minimal-light", "kiosk"]);
	const catalogue = languageCatalogue();
	assert.equal(catalogue.length, languageNames.length);
	for (const entry of catalogue) {
		assert.equal(typeof entry.name, "string");
		assert.equal(typeof entry.title, "string");
		assert.equal(entry.default, entry.name === DEFAULT_LANGUAGE);
		assert.ok(entry.tokens > 0, `${entry.name} has tokens`);
		assert.ok(entry.styles > 0, `${entry.name} has named styles`);
	}
});

test("every language is usable: valid tokens, known style types, colours where colours are asked for", () => {
	for (const name of languageNames) {
		const language = getLanguage(name);
		assert.deepEqual(validateLanguage(language), [], `${name} validates`);
		for (const [token, value] of Object.entries(language.tokens)) {
			if (token.endsWith("Color")) assert.match(String(value), COLOUR, `${name}.${token} is a colour`);
		}
		for (const style of language.styles) {
			assert.ok(STYLE_COLLECTIONS.includes(style.collection), `${name} ${style.name} uses a real collection (${style.collection})`);
			assert.ok(style.properties !== undefined, `${name} ${style.name} carries properties`);
		}
	}
});

test("an unknown language is refused by name, and a known one falls back to the default for undefined", () => {
	assert.equal(getLanguage(undefined).name, DEFAULT_LANGUAGE);
	assert.equal(getLanguage("").name, DEFAULT_LANGUAGE);
	assert.throws(() => getLanguage("vaporwave"), /vaporwave/u);
});

test("themePlan writes tokens on the sheet, styles inside their collections, and both engine pointers via Value", () => {
	const plan = themePlan({ language: "modern", project: PROJECT });
	assert.equal(plan.sheet, "Sheet_modern");
	assert.equal(plan.sheet_path, "UI/Sheet_modern");
	assert.equal(plan.pointer, "UI/Sheet_modern");
	assert.equal(plan.ops[0].op, "create_object");
	assert.equal(plan.ops[0].object_type, "StyleSheet");
	assert.equal(plan.ops[0].parent, "UI");
	const tokenOps = plan.ops.filter((op) => op.path === plan.sheet_path);
	assert.ok(tokenOps.length >= 5, "token writes land on the sheet node");
	for (const style of plan.styles) {
		assert.ok(plan.ops.some((op) => op.op === "create_object" && op.parent.endsWith(style.collection) && op.name === style.name));
		for (const property of Object.keys(style.properties)) {
			assert.ok(plan.ops.some((op) => op.op === "set_property" && op.path === style.path && op.name === property));
		}
	}
	assert.equal(plan.pointer_ops.length, THEME_ENGINES.length);
	for (const [index, engine] of THEME_ENGINES.entries()) {
		assert.equal(plan.pointer_ops[index].path, `${engine}/StyleSheet`);
		assert.equal(plan.pointer_ops[index].name, "Value");
		assert.equal(plan.pointer_ops[index].value, plan.pointer);
	}
	assert.equal(plan.counts.ops, plan.ops.length + plan.pointer_ops.length);
});

test("a pointer is written project-relative because the bridge refuses the absolute spelling", () => {
	const plan = themePlan({ language: "modern", project: PROJECT });
	for (const op of plan.pointer_ops) assert.equal(op.value, "UI/Sheet_modern");
	assert.equal(sheetPointer(PROJECT, "UI/Sheet_modern"), "UI/Sheet_modern");
	assert.throws(() => sheetPointer("", "UI/Sheet_modern"), /project/u);
	// The audit accepts every spelling of one node as the same pointer.
	assert.ok(samePointer("UI/Sheet_modern", "/Objects/AryaOptixTemplate/UI/Sheet_modern"));
	assert.ok(samePointer("UI/Sheet_modern", "AryaOptixTemplate/UI/Sheet_modern"));
	assert.ok(!samePointer("UI/Sheet_modern", "UI/Sheet_isa101"));
	assert.ok(!samePointer("UI/Sheet_modern", undefined));
});

test("themePlan restates an existing sheet instead of creating it, and binds only the engines named", () => {
	const plan = themePlan({ language: "isa101", project: PROJECT, exists: true, engines: ["UI/NativePresentationEngine"] });
	assert.ok(!plan.ops.some((op) => op.op === "create_object" && op.object_type === "StyleSheet"));
	assert.ok(plan.ops.some((op) => op.op === "create_object" && op.object_type === "ButtonStyle"));
	assert.equal(plan.pointer_ops.length, 1);
	assert.equal(plan.pointer_ops[0].path, "UI/NativePresentationEngine/StyleSheet");
	assert.equal(plan.pointer, sheetPointer(PROJECT, plan.sheet_path));
});

test("themePlan refuses a plan that cannot be addressed", () => {
	assert.throws(() => themePlan({ language: "modern" }), /project/u);
	assert.throws(() => themePlan({ language: "modern", project: PROJECT, sheet: "has space" }), /Logix-style name/u);
	assert.throws(() => themePlan({ language: "modern", project: PROJECT, sheetPath: "Screens/Root" }), /under UI/u);
	assert.throws(() => themePlan({ language: "modern", project: PROJECT, engines: ["UI/MainWindow/Width"] }), /engine must be a UI node/u);
	assert.throws(() => themePlan({ language: "vaporwave", project: PROJECT }), /vaporwave/u);
});

test("auditTheme passes only when both engines read the sheet and the tokens and styles are there", () => {
	const plan = themePlan({ language: "modern", project: PROJECT });
	const audit = auditTheme({
		language: "modern",
		sheet_path: plan.sheet_path,
		engine_refs: Object.fromEntries(THEME_ENGINES.map((engine) => [engine, plan.sheet_path])),
		observed_tokens: Object.keys(plan.tokens),
		observed_styles: plan.styles.map((style) => style.path)
	});
	assert.equal(audit.ok, true);
	assert.equal(audit.score, 100);
	assert.deepEqual(audit.findings, []);
	assert.deepEqual(audit.missing_tokens, []);
	assert.deepEqual(audit.missing_styles, []);
});

test("auditTheme fails an engine that still reads the default sheet", () => {
	const plan = themePlan({ language: "modern", project: PROJECT });
	const audit = auditTheme({
		language: "modern",
		sheet_path: plan.sheet_path,
		engine_refs: { "UI/NativePresentationEngine": plan.sheet_path, "UI/WebPresentationEngine": "UI/DefaultStyleSheet" },
		observed_tokens: Object.keys(plan.tokens),
		observed_styles: plan.styles.map((style) => style.path)
	});
	assert.equal(audit.ok, false);
	const finding = audit.findings.find((entry) => entry.id === "THEME-02");
	assert.ok(finding, "THEME-02 is reported");
	assert.equal(finding.severity, "critical");
	assert.match(finding.message, /UI\/WebPresentationEngine/u);
});

test("auditTheme reports missing tokens and styles as warnings, not as a pass", () => {
	const plan = themePlan({ language: "isa101", project: PROJECT });
	const tokens = Object.keys(plan.tokens);
	const audit = auditTheme({
		language: "isa101",
		sheet_path: plan.sheet_path,
		engine_refs: Object.fromEntries(THEME_ENGINES.map((engine) => [engine, plan.sheet_path])),
		observed_tokens: tokens.slice(0, tokens.length - 2),
		observed_styles: plan.styles.slice(1).map((style) => style.path)
	});
	assert.equal(audit.ok, true);
	assert.ok(audit.score < 100);
	assert.ok(audit.missing_tokens.length === 2);
	assert.ok(audit.missing_styles.length === 1);
	assert.ok(audit.findings.some((entry) => entry.id === "THEME-03"));
	assert.ok(audit.findings.some((entry) => entry.id === "THEME-04"));
});

test("auditTheme refuses to audit nothing", () => {
	const audit = auditTheme({ language: "modern" });
	assert.equal(audit.ok, false);
	assert.equal(audit.findings[0].id, "THEME-01");
	assert.match(audit.next, /optix_ui action theme/u);
});

test("the catalogues a caller reads are frozen against accidental edit", () => {
	assert.ok(Object.isFrozen(STYLE_COLLECTIONS));
	assert.ok(Object.isFrozen(THEME_ENGINES));
	assert.ok(Object.isFrozen(LANGUAGES));
	assert.deepEqual(STYLE_COLLECTIONS.slice(0, 3), ["ButtonStyles", "InputBoxStyles", "SwitchStyles"]);
});
