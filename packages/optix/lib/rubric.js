/**
 * The design rubric: the difference between a screen that renders and a screen an operator would accept.
 *
 * It is deliberately small and mechanical. Every rule is something that can be *observed* in the project the
 * bridge reports — a band's geometry, a control's size, a font size, a navigation panel, an imported widget —
 * so a grade is evidence, not taste. Rules that need the runtime (does the dialog actually open, does the grid
 * actually show alarms) are reported as `unverified` and never counted as a pass.
 *
 * The score starts at 100: a critical finding costs 40, a warning costs 10, and `must_fix` names the node and
 * the one-line repair for each critical. `professional` needs 85 with no critical left.
 */

/** Rules the rubric can decide from the model alone. */
export const RUBRIC_RULES = {
	"VIEW-SHELL-01": { severity: "critical", title: "The screen has a header band", fix: "draw the shell: optix_ui action shell, or put a band at the top of the screen", weight: 40 },
	"VIEW-NAV-01": { severity: "critical", title: "The screen has navigation", fix: "add a native NavigationPanel with one item per screen (optix_ui action shell, optix_nav action plan)", weight: 40 },
	"HMI-TARGET-01": { severity: "critical", title: "Every control is at least 44x44", fix: "give the control at least 44 px of width and height, or move it out of the touch surface", weight: 40 },
	"VIEW-TYPE-02": { severity: "critical", title: "No text below 11 px", fix: "raise the font size to at least 11 px", weight: 40 },
	"HMI-CONTRAST-01": { severity: "critical", title: "The theme is bound on both engines", fix: "run optix_ui action theme apply, then read the engines back", weight: 40 },
	"VIEW-HDR-01": { severity: "warning", title: "The header says what and who", fix: "put the title (20 px or more), a status chip and the signed-in user in the header", weight: 10 },
	"VIEW-ASSET-01": { severity: "warning", title: "The overview shows the process", fix: "add a mimic or a hero image at least a quarter of the canvas wide, or a trend when the screen is analytical", weight: 10 },
	"VIEW-ADAPTER-01": { severity: "warning", title: "A vendor component carries real data", fix: "place an adapter (alarm grid, trend, gauge, data grid) instead of drawing a lookalike", weight: 10 },
	"VIEW-EMPTY-01": { severity: "warning", title: "The screen has substance", fix: "a designed screen carries a header, three to six content components and a status strip", weight: 10 },
	"VIEW-CONSIST-01": { severity: "critical", title: "Every screen shares one shell", fix: "make the header band the same height and the content host the same rectangle on every screen", weight: 40 }
};

/** Rules that need the runtime, so the rubric reports them rather than grading them. */
export const UNVERIFIED_RULES = {
	"VIEW-DLG-01": "a destructive command opens a confirm dialog - prove it by clicking it in the runtime",
	"VIEW-STATE-01": "the active tab follows the open screen - prove it by clicking a tab in the runtime",
	"VIEW-DATA-01": "a data component shows live values - prove it in the runtime after Save and Build"
};

/** Controls whose touch size matters. */
const CONTROLS = /Button|TextBox|ComboBox|SpinBox|CheckBox|RadioButton|Slider|CalendarPicker|ColorPicker|NavigationPanelItem/u;
/** Text-bearing types, for the font-size rule. */
const TEXTUAL = /Label|Button|TextBox|ComboBox|CheckBox|RadioButton/u;
/** Types that only a vendor import or a drawing can produce. */
const VENDOR = /AlarmGrid|AlarmHistoryGrid|AlarmBanner|AdvancedTrend|RecipesEditor|LoginForm|UserEditor|AnalogItemGauge|StationConnectionStatus|DataGrid|HistogramChart|^Trend$|AdvancedSVGImage|Mimic/u;

const number = (value) => {
	const parsed = Number.parseFloat(String(value ?? "").replace(",", "."));
	return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Flatten a bridge `map` reply into the nodes the rubric reads.
 *
 * @param {object} reply A `GET /bridge/map?mode=detail` answer (`{map:{...}}` or the map itself).
 * @returns `{name, nodes, types}}` where every node is `{path, name, type, left, top, width, height, font_size}`.
 */
export function describeScreen(reply) {
	const root = (reply?.map ?? reply) ?? {};
	const nodes = [];
	const types = new Map();
	const walk = (node, path, depth) => {
		if (node === null || typeof node !== "object" || depth > 8) return;
		const name = node.browse_name ?? node.name ?? "";
		const here = path === "" ? name : `${path}/${name}`;
		const type = String(node.dotnet_type ?? node.type ?? "");
		const properties = node.properties ?? {};
		const property = (key) => properties[key]?.value ?? node[key];
		const entry = {
			path: here,
			name,
			type,
			left: number(property("LeftMargin")),
			top: number(property("TopMargin")),
			width: number(property("Width")),
			height: number(property("Height")),
			font_size: number(property("FontSize"))
		};
		nodes.push(entry);
		types.set(type, (types.get(type) ?? 0) + 1);
		for (const child of node.children ?? []) walk(child, here, depth + 1);
	};
	walk(root, "", 0);
	return { name: nodes[0]?.name ?? "", nodes, types };
}

const hasType = (screen, pattern) => [...screen.types.keys()].some((type) => pattern.test(type));
const isControl = (node) => CONTROLS.test(node.type);

/**
 * Grade one screen against the rubric.
 *
 * @param {{screen: object, language?: string, canvas?: {width: number, height: number},
 *   engine_refs?: Record<string, string>, siblings?: object[]}} request
 *   `screen` is a `describeScreen()` descriptor; `siblings` are the other screens, for the consistency rule.
 * @returns `{score, grade, language, must_fix, findings, unverified, evidence}}`.
 */
export function scoreScreen({ screen, window, language = "modern", canvas = { width: 0, height: 0 }, engine_refs = {}, siblings = [] } = {}) {
	if (screen === null || typeof screen !== "object" || !Array.isArray(screen.nodes)) throw new Error("rubric_needs_screen: pass a descriptor from describeScreen()");
	const findings = [];
	const evidence = {};
	const add = (rule, path, detail) => {
		const entry = RUBRIC_RULES[rule];
		findings.push({ rule, severity: entry.severity, title: entry.title, path: path ?? screen.name, detail, fix: entry.fix, weight: entry.weight });
	};

	const width = canvas.width > 0 ? canvas.width : 1280;
	const height = canvas.height > 0 ? canvas.height : 800;
	// A screen inside a shell inherits its header band and its rail from the window, so the shell rules look at
	// the window first and only fall back to the screen when the project has no shell yet.
	const windowNodes = Array.isArray(window?.nodes) ? window.nodes : [];
	const shellNodes = windowNodes.length > 0 ? [...windowNodes, ...screen.nodes] : screen.nodes;

	// A header band: a wide node pinned to the top that is tall enough to hold a title, or the shell's own band.
	// A band is a strip across the top: tall enough for a title, but not the content host and not the whole
	// canvas - a PanelLoader at 0,0 filling the window satisfies "wide and tall" and is not a header.
	const isBand = (node, owner) =>
		node !== owner[0] && !/PanelLoader$/u.test(node.type) &&
		node.top !== null && node.top <= 8 && node.width !== null && node.width >= width * 0.8 &&
		node.height !== null && node.height >= 48 && node.height <= height * 0.3;
	const header = shellNodes.find((node) => isBand(node, windowNodes.length > 0 ? windowNodes : screen.nodes)) ?? shellNodes.find((node) => /ShellHeader$|HeaderBand$/u.test(node.name));
	evidence.header = header === void 0 ? null : { path: header.path, height: header.height, width: header.width, from: windowNodes.some((node) => node.path === header.path) ? "window" : "screen" };
	if (header === void 0) add("VIEW-SHELL-01", screen.name, `no band at the top of the ${width}x${height} canvas is at least 48 px tall and 80% wide`);
	else {
		// The texts may be children of the band or siblings laid over it - a shell puts them beside the band,
		// the kit puts them inside it - so the test is where they sit, not where they hang in the tree.
		const band = { left: header.left ?? 0, top: header.top ?? 0, width: header.width ?? width, height: header.height ?? 0 };
		const inHeader = (node) =>
			node.path.startsWith(`${header.path}/`) ||
			(node.left !== null && node.top !== null && node.width !== null && node.height !== null &&
				node.left >= band.left && node.top >= band.top &&
				node.left + node.width <= band.left + band.width + 1 &&
				node.top + node.height <= band.top + band.height + 1);
		const title = shellNodes.find((node) => inHeader(node) && (node.font_size ?? 0) >= 20);
		const chip = shellNodes.find((node) => inHeader(node) && /Chip|State|Status/u.test(node.name));
		const user = shellNodes.find((node) => inHeader(node) && /User|Operator|Clock/u.test(node.name));
		evidence.header_content = { title: title?.path ?? null, chip: chip?.path ?? null, user: user?.path ?? null };
		if (title === void 0) add("VIEW-HDR-01", header.path, "the band has no text at 20 px or larger, so nothing reads as the screen title");
		if (chip === void 0 || user === void 0) add("VIEW-HDR-01", header.path, `the band is missing ${[chip === void 0 ? "a status chip" : "", user === void 0 ? "the user or clock" : ""].filter((part) => part !== "").join(" and ")}`);
	}

	// Navigation: the native panel is the one a production screen uses.
	const rails = shellNodes.filter((node) => /NavigationPanel$/u.test(node.type) && node !== (windowNodes[0] ?? screen.nodes[0]));
	const items = shellNodes.filter((node) => /NavigationPanelItem$/u.test(node.type) || /^RailItem\d+$/u.test(node.name));
	evidence.navigation = { rail: rails.map((rail) => rail.path), items: items.length, from: rails.some((rail) => windowNodes.some((node) => node.path === rail.path)) ? "window" : "screen" };
	if (rails.length === 0) add("VIEW-NAV-01", screen.name, "the screen carries no NavigationPanel: a row of buttons is not the navigation an operator expects");
	else if (items.length < 2) add("VIEW-NAV-01", rails[0].path, `the panel has ${items.length} item(s): a navigation needs at least two`);

	// Touch targets, and text that can be read.
	for (const node of screen.nodes) {
		if (isControl(node) && node.width !== null && node.height !== null && (node.width < 44 || node.height < 44)) add("HMI-TARGET-01", node.path, `${node.type} is ${node.width}x${node.height} px`);
		if (TEXTUAL.test(node.type) && node.font_size !== null && node.font_size > 0 && node.font_size < 11) add("VIEW-TYPE-02", node.path, `${node.type} is set at ${node.font_size} px`);
	}

	// The theme must be on both engines and be one sheet.
	const sheetRefs = Object.entries(engine_refs ?? {}).filter(([, ref]) => typeof ref === "string" && ref !== "");
	const distinct = [...new Set(sheetRefs.map(([, ref]) => ref))];
	evidence.theme = { engines: Object.keys(engine_refs ?? {}), sheets: distinct };
	if (sheetRefs.length < 2) add("HMI-CONTRAST-01", screen.name, `${sheetRefs.length} presentation engine(s) answered; both the native and the web engine must carry the language`);
	else if (distinct.length > 1) add("HMI-CONTRAST-01", screen.name, `the engines carry different sheets: ${distinct.join(", ")}`);

	// Substance: a mimic or a vendor component, and enough on the screen to be a screen.
	const vendor = screen.nodes.filter((node) => VENDOR.test(node.type) || VENDOR.test(node.name));
	const hero = screen.nodes.filter((node) => /Image|AdvancedSVGImage/u.test(node.type) && (node.width ?? 0) >= width * 0.25);
	evidence.components = { vendor: vendor.map((node) => `${node.name} (${node.type})`), hero: hero.map((node) => node.path) };
	if (vendor.length === 0 && hero.length === 0) add("VIEW-ADAPTER-01", screen.name, "nothing on the screen is a vendor component or a process drawing: it was drawn, not assembled");
	if (screen.nodes.length < 8) add("VIEW-EMPTY-01", screen.name, `the screen has ${screen.nodes.length} node(s)`);

	// One shell across screens: the header height and the content host must agree.
	if (siblings.length > 0) {
		// When the window carries the shell, every screen inherits the same band - only the screen's own content
		// host can disagree.
		const sharedBand = windowNodes.length > 0 ? (windowNodes.find((node) => isBand(node, windowNodes))?.height ?? null) : null;
		const shape = (descriptor) => {
			const band = descriptor.nodes.find((node) => node !== descriptor.nodes[0] && node.top !== null && node.top <= 8 && (node.height ?? 0) >= 48 && (node.width ?? 0) >= width * 0.8);
			const host = descriptor.nodes.find((node) => /PanelLoader$/u.test(node.type) && node !== descriptor.nodes[0]);
			return { band: sharedBand ?? band?.height ?? null, host: host === void 0 ? null : [host.left, host.top, host.width, host.height].join(",") };
		};
		const mine = shape(screen);
		const differing = siblings.map((descriptor) => ({ name: descriptor.name, shape: shape(descriptor) })).filter((entry) => entry.shape.band !== mine.band || entry.shape.host !== mine.host);
		evidence.consistency = { mine, differing };
		if (differing.length > 0) add("VIEW-CONSIST-01", screen.name, `${differing.length} other screen(s) put the shell elsewhere: ${differing.map((entry) => entry.name).join(", ")}`);
	}

	const critical = findings.filter((finding) => finding.severity === "critical");
	const warnings = findings.filter((finding) => finding.severity === "warning");
	const penalty = critical.reduce((total, finding) => total + finding.weight, 0) + warnings.reduce((total, finding) => total + finding.weight, 0);
	const score = Math.max(0, 100 - penalty);
	return {
		score,
		grade: critical.length === 0 && score >= 85 ? "professional" : score >= 70 ? "acceptable" : "entry-level",
		language,
		must_fix: critical.map((finding) => ({ rule: finding.rule, path: finding.path, fix: finding.fix, detail: finding.detail })),
		findings,
		unverified: Object.entries(UNVERIFIED_RULES).map(([rule, why]) => ({ rule, why })),
		evidence
	};
}

/**
 * The rubric an agent can read before it designs.
 *
 * @returns `{language_default, rules, unverified, grades}`.
 */
export function rubricCatalogue() {
	return {
		rules: Object.entries(RUBRIC_RULES).map(([rule, entry]) => ({ rule, severity: entry.severity, title: entry.title, fix: entry.fix })),
		unverified: Object.entries(UNVERIFIED_RULES).map(([rule, why]) => ({ rule, why })),
		grades: { professional: "score >= 85 and no critical finding", acceptable: "score 70-84", "entry-level": "score < 70 or a critical finding" }
	};
}
