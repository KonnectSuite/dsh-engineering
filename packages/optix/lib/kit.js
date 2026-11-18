/**
 * The UI kit: the components a designed screen is made of, and the blueprint that composes them.
 *
 * The old scaffold drew a header, two cards and a button row, which is why every generated project
 * looked the same and looked entry level. This module gives a blueprint a vocabulary: a real header
 * band with a status chip, a clock, a language selector, a user badge and an alarm bell; KPI tiles with
 * a value and a unit; cards with rows, lamps and progress bars; a bar chart with a threshold marker; a
 * message feed; a status strip with a connection lamp. Every component is placed by `layout.js`, dressed
 * by the active design language's tokens, and built out of the primitives Studio itself draws with
 * (`Rectangle`, `Label`, `Ellipse`, `Image`), so the result is a normal Optix screen that Studio opens
 * and the runtime renders.
 *
 * The repeatable components are built as containers rather than as pinned rectangles. `layout.js` still
 * decides the area a component occupies, but its inner text and rows are placed by `RowLayout` and
 * `ColumnLayout` nodes, so changing the canvas keeps the component readable instead of leaving its parts
 * where they were drawn. A layout container has no fill (the bridge refuses a property the type does not
 * declare with `unknown_property`, measured 2026-11-16), so each component is still a `Rectangle` for paint
 * plus the layout that arranges what sits on it.
 *
 * Nothing here touches the model. `compileBlueprint` returns bridge operations, and the caller decides
 * whether to plan, validate or apply them.
 */
import {
	FOOTER,
	HEADER,
	LayoutError,
	PAD,
	columns,
	grid,
	region,
	requireSlot,
	rect,
	row,
	stack,
	widthClass
} from "./layout.js";
import { box, set, size } from "./screens.js";
import {
	ALIGN,
	CONTAINERS,
	CONTENT_ALIGN_COLUMN,
	CONTENT_ALIGN_ROW,
	FILL,
	FILL_MODE,
	columnLayout,
	gridLayout,
	layout as container,
	margins as marginOps,
	rowLayout,
	stretch,
	stretchVertical
} from "./containers.js";
import { DEFAULT_LANGUAGE, getLanguage } from "./languages.js";
import { adapterOps } from "./adapters.js";
import { CONTRAST_MINIMUM, contrastRatio } from "./design.js";

/**
 * The blueprints a blueprint's `pattern` may name, in the order the kit documents them.
 *
 * `overview` is the line-and-plant screen, `station` is the machine grid an operator scans for a red lamp,
 * `table` is the row-per-thing screen (alarms, units, recipes, the shift log), `faceplate` is one piece of
 * equipment with its detail under it, and `split` is the deliberate two-column screen that puts the numbers
 * beside the picture of them. `blank` is the empty canvas a hand-designed screen starts from.
 */
export const PATTERNS = ["overview", "blank", "station", "table", "faceplate", "split"];

/** The message feed shows at most this many cards; more is a screen, not a feed. */
export const MAX_MESSAGES = 8;

/** A station grid places at most this many machines. The ceiling is the batch, not the eye: one tile compiles
 * to 87-88 bridge operations (measured 2026-11-17: 1 tile 153 ops, 6 tiles 594, 8 tiles 768), a screen cannot
 * be split across calls, and `optix_screen` refuses a batch over `maxScreenOps`. Six tiles is the largest wall
 * that fits the ceiling it ships with. */
export const MAX_STATIONS = 6;

/** A table places at most this many columns and rows. A table is a screen, not a spreadsheet: every cell
 * is a node the bridge has to create, so a 20x20 table is 400 widgets and a screen nobody can read. */
export const MAX_TABLE_COLUMNS = 5;
export const MAX_TABLE_ROWS = 6;

/** The smallest band a card row can be given before its own 22 px label no longer fits inside it. */
export const MIN_ROW_BAND = 26;

/**
 * A refusal specific to a blueprint, so a caller can report the component that could not be placed.
 *
 * @param code - Stable code, such as `blueprint_unknown_pattern`.
 * @param message - One sentence naming what is wrong and what to give instead.
 */
function refuse(code, message) {
	throw new LayoutError(code, message);
}

/**
 * Normalise a token colour to the `#RRGGBB` form the bridge validates.
 *
 * `validate_ops` refuses a `0xRRGGBBAA` string with `Color must be #RRGGBB / #AARRGGBB hex or a UInt32
 * decimal` (measured live on bridge 1.0.9, 2026-11-15), so the kit speaks the spelling the model accepts.
 *
 * @param value - A token colour, with or without the leading `#`.
 * @returns The colour as `#RRGGBB`, or the fallback grey when the token is not a hex colour.
 */
function colour(value) {
	const digits = String(value ?? "").replace(/^#/u, "").trim();
	if (/^[0-9a-f]{6}$/iu.test(digits)) return `#${digits.toUpperCase()}`;
	if (/^[0-9a-f]{8}$/iu.test(digits)) return `#${digits.slice(-6).toUpperCase()}`;
	return "#8C8C8C";
}

/**
 * Pick the ink a label can actually be read in on this fill, out of the theme's own palette.
 *
 * Measured 2026-11-18 on the two screens the kit drew at 1060x706: the title on the accent band is 2.30:1
 * in modern-dark and 2.44:1 in modern, and a light label on a white chip is 1.27:1 in the dark languages.
 * Both were caught twice over on the same screen - once by the model-side HMI-CONTRAST-01 and once by the
 * render-side VIEW-RENDER-04 - so the kit no longer assumes the language pairs its accent with its
 * interactive ink. The candidate order is the intended pairing first (`accentText`), then the body ink,
 * then the window colour: the first that clears CONTRAST_MINIMUM wins. When no palette colour clears the
 * fill, the highest-contrast candidate is used and the residual is left for the checking tools to report
 * rather than hidden - a saturated alarm colour genuinely cannot clear 4.5:1 against a light neutral.
 *
 * @param fill - The `#RRGGBB` the label sits on.
 * @param candidates - Palette colours to choose from, in preference order.
 * @returns The chosen `#RRGGBB`.
 */
export function inkOn(fill, candidates) {
	const ordered = [...new Set(candidates.filter((c) => typeof c === "string" && c !== fill))];
	if (ordered.length === 0) return fill;
	const clear = ordered.find((c) => contrastRatio(c, fill) >= CONTRAST_MINIMUM);
	if (clear !== undefined) return clear;
	return ordered.reduce((best, c) => (contrastRatio(c, fill) > contrastRatio(best, fill) ? c : best), ordered[0]);
}

/**
 * Resolve a design language into the palette and type scale the kit draws with.
 *
 * @param language - A language name; blank means the default.
 * @returns `{name, tokens, colours, type, radius, borderWidth}` where `colours` are `#RRGGBB` strings.
 */
export function kitTheme(language = DEFAULT_LANGUAGE) {
	const resolved = typeof language === "string" && language.trim() !== "" ? getLanguage(language) : getLanguage(DEFAULT_LANGUAGE);
	const t = resolved.tokens;
	const font = Number.parseInt(String(t.FontPixelSize ?? "16"), 10) || 16;
	const colours = {
		window: colour(t.WindowColor ?? "#F2F4F7"),
		screen: colour(t.ScreenColor ?? t.WindowColor ?? "#F2F4F7"),
		surface: colour(t.DataInputBackgroundColor ?? "#FFFFFF"),
		surfaceAlt: colour(t.InteractiveBackgroundColor ?? t.DataInputBackgroundColor ?? "#FFFFFF"),
		interactive: colour(t.InteractiveColor ?? t.DataInputBackgroundColor ?? "#FFFFFF"),
		text: colour(t.TextColor ?? "#1F2933"),
		accent: colour(t.AccentColor ?? "#0FAFFF"),
		accentText: colour(t.AccentTextColor ?? "#FFFFFF"),
		border: colour(t.BorderColor ?? "#B3B3B3"),
		focus: colour(t.FocusColor ?? t.AccentColor ?? "#0FAFFF"),
		ok: colour("#30A46C"),
		warn: colour("#F5A524"),
		danger: colour("#E5484D")
	};
	// The chrome inks are resolved from the palette rather than assumed: the accent band and the table's
	// header band get whichever of the theme's own colours they can carry text in.
	colours.headerInk = inkOn(colours.accent, [colours.accentText, colours.text, colours.window]);
	colours.tableHeaderInk = inkOn(colours.surfaceAlt, [colours.accentText, colours.text, colours.window]);
	colours.chipInk = inkOn(colours.surface, [colours.text, colours.accentText, colours.window]);
	return {
		name: resolved.name,
		language: resolved,
		tokens: t,
		colours,
		type: {
			title: Math.round(font * 1.75),
			heading: Math.round(font * 1.35),
			subheading: Math.round(font * 1.15),
			body: font,
			small: Math.max(11, Math.round(font * 0.85)),
			micro: Math.max(10, Math.round(font * 0.75))
		},
		radius: String(t.Radius ?? "8.0"),
		borderWidth: String(t.BorderWidth ?? "1.0")
	};
}

/** One widget creation. */
function widget(parent, name, type) {
	return { op: "create_widget", screen: parent, name, widget_type: type };
}

/**
 * A rectangle with a fill, a hairline border and a corner radius, placed by its slot.
 *
 * `borderColour` is where a component's state lives when its ink cannot carry that state: a red alarm glyph
 * measures 3.91:1 on white and 4.35:1 on the dark surface, under the 4.5:1 floor in every language, so the
 * bell carries the danger colour in its border and the chip carries its state in the accent border. One write
 * per property, because a batch that writes a property twice is a batch whose order decides the render.
 */
function surface(parent, name, slot, fill, theme, { border = true, radius = true, borderColour } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Rectangle"), ...box(path, slot), set(path, "FillColor", fill)];
	if (border) ops.push(set(path, "BorderColor", borderColour ?? theme.colours.border), set(path, "BorderThickness", theme.borderWidth));
	if (radius) ops.push(set(path, "CornerRadius", theme.radius));
	return { path, ops };
}

/**
 * A `Rectangle` that fills the layout row it is placed in.
 *
 * The surface is sized by `Width`/`Height` `-1` with Stretch, which is how the shipped starter YAML sizes a
 * layout child and what was rendered live on 2026-11-17: two such children split a 1060 px row 530 + 20 gap +
 * 514 (`optix-proof/smt/shots/probe-rc.png`). A component that owns an unequal share of its row is given the
 * pixel width the geometry library computed for it, because the bridge cannot write a `fr` track at all.
 */
function cellSurface(parent, name, { width = FILL, height = FILL } = {}, fill, theme, { border = true, radius = true, borderColour } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Rectangle")];
	// Size and Stretch are one pair: a child with only the -1 renders at its content size, which is what the
	// first live SMT render showed on 2026-11-17 (four cards hugging their text inside a 1060 px row).
	ops.push(...(width === FILL ? stretch(path) : [set(path, "Width", size(width))]));
	ops.push(...(height === FILL ? stretchVertical(path) : [set(path, "Height", size(height))]));
	ops.push(set(path, "FillColor", fill));
	if (border) ops.push(set(path, "BorderColor", borderColour ?? theme.colours.border), set(path, "BorderThickness", theme.borderWidth));
	if (radius) ops.push(set(path, "CornerRadius", theme.radius));
	return { path, ops };
}

/** A text label, placed by its slot. Optix labels have no background, so chrome is always a sibling rectangle. */
function text(parent, name, slot, value, theme, { fontSize = theme.type.body, colour = theme.colours.text, weight = "400", align = 0 } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Label"), ...box(path, slot), set(path, "Text", String(value)), set(path, "FontSize", size(fontSize)), set(path, "TextColor", colour)];
	if (weight !== "400") ops.push(set(path, "FontWeight", weight));
	if (align !== 0) ops.push(set(path, "TextHorizontalAlignment", String(align)));
	return { path, ops };
}

/**
 * A label sized by its layout parent instead of by a pinned box.
 *
 * Inside a layout the parent decides the position, so only a size and the container-relative margins are
 * written; `Width` `-1` means "fill the parent minus the margins" (the starter's spelling, 2026-11-16).
 *
 * @param parent - The layout container that owns the label.
 * @param name - BrowseName.
 * @param value - Text to show.
 * @param theme - A `kitTheme()` result.
 * @param options - `width`, `height`, `fontSize`, `colour`, `weight`, `align`, `margins`, `verticalAlignment`.
 * @returns `{path, ops}` for the created label.
 */
function layoutText(parent, name, value, theme, { width = FILL, height = 22, fontSize = theme.type.body, colour = theme.colours.text, weight = "400", align = 0, margins = undefined, verticalAlignment = undefined } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Label"), set(path, "Width", size(width)), set(path, "Height", size(height))];
	if (margins !== undefined) ops.push(...marginOps(path, margins));
	ops.push(set(path, "Text", String(value)), set(path, "FontSize", size(fontSize)), set(path, "TextColor", colour));
	if (weight !== "400") ops.push(set(path, "FontWeight", weight));
	if (align !== 0) ops.push(set(path, "TextHorizontalAlignment", String(align)));
	if (verticalAlignment !== undefined) ops.push(set(path, "VerticalAlignment", String(verticalAlignment)));
	return { path, ops };
}

/** A filled ellipse: lamps and connection dots. */
function dot(parent, name, slot, fill) {
	const path = `${parent}/${name}`;
	return { path, ops: [widget(parent, name, "Ellipse"), ...box(path, slot), set(path, "FillColor", fill), set(path, "BorderColor", fill)] };
}

/**
 * The body of a designed screen: the header band, the content, the footer strip.
 *
 * @param blueprint - The screen's blueprint.
 * @param options - `screen` (path), `width`, `height`, `language`, `chrome` (`screen` draws the bands, `none` leaves them to the shell).
 * @returns `{ops, layout, theme, counts}`.
 */
export function compileBlueprint(blueprint, { screen, width, height, language = DEFAULT_LANGUAGE, chrome = "screen" } = {}) {
	if (blueprint === null || typeof blueprint !== "object" || Array.isArray(blueprint)) refuse("blueprint_invalid", "a blueprint is an object: {title, pattern, kpis, cards, chart, messages, status}");
	if (typeof screen !== "string" || screen.trim() === "") refuse("blueprint_no_screen", "a blueprint needs a screen path, such as UI/Screens/Home");
	if (!Number.isFinite(width) || !Number.isFinite(height)) refuse("blueprint_no_canvas", "a blueprint needs the canvas width and height in pixels");
	if (chrome !== "screen" && chrome !== "none") refuse("blueprint_chrome", `chrome is "screen" or "none", not ${String(chrome)}`);
	const pattern = typeof blueprint.pattern === "string" && blueprint.pattern.trim() !== "" ? blueprint.pattern.trim() : "overview";
	if (!PATTERNS.includes(pattern)) refuse("blueprint_unknown_pattern", `no pattern "${pattern}": choose ${PATTERNS.join(", ")}`);
	const theme = kitTheme(language);
	const ops = [];
	const nodes = [];
	const push = (entry) => {
		ops.push(...entry.ops);
		nodes.push(entry.path);
		return entry.path;
	};
	const path = String(screen).replace(/\/+$/u, "");
	const kind = widthClass(width);
	const count = (key) => (Array.isArray(blueprint[key]) ? blueprint[key].length : 0);

	if (pattern === "blank") {
		const area = chrome === "screen" ? region({ width, height, header: 0, footer: 0 }) : region({ width, height, header: 0, footer: 0, pad: PAD });
		return {
			ops,
			layout: { pattern, width, height, width_class: kind, chrome, region: area, slots: {} },
			theme,
			counts: { components: 0, operations: 0 }
		};
	}

	const band = chrome === "screen" ? HEADER : 0;
	const foot = chrome === "screen" ? FOOTER : 0;
	const content = region({ width, height, header: band, footer: foot });
	const slots = { header: null, kpis: [], cards: [], chart: null, messages: null, status: null, adapters: [], stations: [], table: null, hero: null };

	if (chrome === "screen") {
		const header = { left: 0, top: 0, width, height: HEADER };
		push(surface(path, "HeaderBand", header, theme.colours.accent, theme, { border: false, radius: false }));
		slots.header = header;
		const title = typeof blueprint.title === "string" && blueprint.title.trim() !== "" ? blueprint.title.trim() : "Untitled screen";
		const subtitle = typeof blueprint.subtitle === "string" ? blueprint.subtitle : "";
		push(text(path, "HeaderTitle", { left: PAD, top: 14, width: Math.max(160, Math.floor(width * 0.45)), height: 30 }, title.toUpperCase(), theme, { fontSize: theme.type.title, colour: theme.colours.headerInk, weight: "700" }));
		if (subtitle !== "") push(text(path, "HeaderSubtitle", { left: PAD, top: 48, width: Math.max(160, Math.floor(width * 0.45)), height: 22 }, subtitle, theme, { fontSize: theme.type.small, colour: theme.colours.headerInk }));
		let right = width - PAD;
		const placeRight = (name, component, componentWidth) => {
			right -= componentWidth;
			push(component(right, name));
			right -= 12;
		};
		const headerBar = blueprint.header ?? {};
		if (headerBar.bell !== false) {
			const bell = { left: right - 40, top: 14, width: 40, height: 40 };
			right -= 52;
			// The alarm affordance is the danger border, not a red glyph on a light chip: a red glyph
			// measures 3.91:1 on white and 4.35:1 on the dark surface, under the 4.5:1 floor in every
			// language, so the glyph takes the ink the chip can carry it in and the border carries the state.
			push(surface(path, "HeaderBell", bell, theme.colours.surface, theme, { radius: false, borderColour: theme.colours.danger }));
			push(text(path, "HeaderBellLabel", bell, "!", theme, { fontSize: theme.type.heading, colour: inkOn(theme.colours.surface, [theme.colours.danger, theme.colours.chipInk]), weight: "700", align: 2 }));
		}
		if (typeof headerBar.user === "string" && headerBar.user !== "") {
			const widthBox = 150;
			const slot = { left: right - widthBox, top: 14, width: widthBox, height: 40 };
			right -= widthBox + 12;
			push(surface(path, "HeaderUser", slot, theme.colours.surface, theme, { radius: true }));
			push(dot(path, "HeaderUserDot", { left: slot.left + 8, top: slot.top + 12, width: 16, height: 16 }, theme.colours.ok));
			push(text(path, "HeaderUserName", { left: slot.left + 30, top: slot.top + 10, width: widthBox - 38, height: 20 }, headerBar.user, theme, { fontSize: theme.type.small, colour: theme.colours.chipInk }));
		}
		if (typeof headerBar.language === "string" && headerBar.language !== "") {
			const slot = { left: right - 56, top: 14, width: 56, height: 40 };
			right -= 68;
			push(surface(path, "HeaderLanguage", slot, theme.colours.surface, theme, { radius: true }));
			push(text(path, "HeaderLanguageLabel", slot, headerBar.language.toUpperCase(), theme, { fontSize: theme.type.small, colour: theme.colours.chipInk, weight: "600", align: 2 }));
		}
		if (typeof headerBar.clock === "string" && headerBar.clock !== "") {
			const slot = { left: right - 96, top: 22, width: 96, height: 24 };
			right -= 108;
			push(text(path, "HeaderClock", slot, headerBar.clock, theme, { fontSize: theme.type.subheading, colour: theme.colours.headerInk, weight: "600", align: 1 }));
		}
		const chips = Array.isArray(headerBar.chips) ? headerBar.chips.slice(0, 4) : [];
		for (const [index, chip] of chips.entries()) {
			const label = typeof chip === "string" ? chip : String(chip?.text ?? "");
			if (label === "") continue;
			const chipWidth = Math.max(96, Math.min(200, 16 + label.length * 8));
			const slot = { left: right - chipWidth, top: 48, width: chipWidth, height: 26 };
			right -= chipWidth + 8;
			// A chip is a neutral plate on the band; its state is the border, so the label keeps one ink in
			// both states instead of swapping to a colour the band cannot carry.
			const chipFill = chip?.on === false ? theme.colours.interactive : theme.colours.surface;
			push(surface(path, `HeaderChip${index + 1}`, slot, chipFill, theme, { radius: true, borderColour: chip?.on === false ? theme.colours.border : theme.colours.accent }));
			push(text(path, `HeaderChip${index + 1}Label`, slot, label, theme, { fontSize: theme.type.micro, colour: inkOn(chipFill, [theme.colours.chipInk, theme.colours.text, theme.colours.window]), weight: "600", align: 2 }));
		}
	}

	// Content rows: a fixed KPI strip, the body (cards beside the chart), and the message feed.
	const hasKpis = count("kpis") > 0;
	const hasFeed = count("messages") > 0;
	const gap = 20;
	const kpiHeight = hasKpis ? 96 : 0;
	const feedHeight = hasFeed ? Math.min(200, Math.max(140, Math.floor(content.height * 0.24))) : 0;
	const bodyHeight = content.height - kpiHeight - feedHeight - (hasKpis ? gap : 0) - (hasFeed ? gap : 0);
	if (bodyHeight < 160) refuse("layout_overflow", `a ${height}px canvas leaves ${bodyHeight.toFixed(0)}px for the body once the header, the KPI strip, the feed and the status strip are placed`);
	let top = content.top;
	const body = rect(content.left, content.top + kpiHeight + (hasKpis ? gap : 0), content.width, bodyHeight);
	// Vendor-backed components get their own column, because an alarm grid or a trend needs the height and
	// cannot be squeezed under a chart. Without them the whole body belongs to the drawn components.
	const adapterSpecs = Array.isArray(blueprint.adapters) ? blueprint.adapters.slice(0, 2) : [];
	const [bodyArea, adapterArea] = adapterSpecs.length === 0 ? [body, null] : columns(body, [2, 1], { minWidth: 320 });
	const cards = Array.isArray(blueprint.cards) ? blueprint.cards.slice(0, 3) : [];
	const wantsChart = blueprint.chart !== null && typeof blueprint.chart === "object";
	const stations = Array.isArray(blueprint.stations) ? blueprint.stations.slice(0, MAX_STATIONS) : [];
	const tableSpec = blueprint.table !== null && typeof blueprint.table === "object" && !Array.isArray(blueprint.table) ? blueprint.table : null;
	const equipment = blueprint.equipment !== null && typeof blueprint.equipment === "object" && !Array.isArray(blueprint.equipment) ? blueprint.equipment : null;
	// A pattern names the content it needs. Naming a pattern without that content is a refusal, not a quiet
	// fall back to the overview drawing: a caller who asked for a station grid and got cards has to hear it.
	if (pattern === "station" && stations.length === 0) refuse("blueprint_pattern_content", "the station pattern needs stations[]: {name, on, values[]} per machine");
	if (pattern === "table" && tableSpec === null) refuse("blueprint_pattern_content", "the table pattern needs table: {title, columns[], widths[]?, rows[][]}");
	if (pattern === "split" && (cards.length === 0 || !wantsChart)) refuse("blueprint_pattern_content", "the split pattern needs cards[] and chart{} side by side");
	if (pattern === "faceplate" && equipment === null && stations.length === 0) refuse("blueprint_pattern_content", "the faceplate pattern needs equipment: {name, on, values[]} or at least one station");
	// A station grid and a table own the whole body band. Cards or a chart beside them would be two screens
	// in one band, and the grid is what the pattern asked for.
	const bodyOwned = pattern === "station" || pattern === "table";
	if (bodyOwned && wantsChart) refuse("blueprint_pattern_content", `the ${pattern} pattern places its own grid in the body: drop chart{} or choose the split pattern`);
	if (bodyOwned && cards.length > 0) refuse("blueprint_pattern_content", `the ${pattern} pattern places its own grid in the body: drop cards[] or choose the overview pattern`);
	if (!bodyOwned && cards.length === 0 && !wantsChart && adapterSpecs.length === 0 && pattern !== "faceplate") {
		refuse("blueprint_empty_body", "a screen needs at least one card, a chart or an adapter: give cards[], chart{} or adapters[]");
	}
	// The width a card column gets when the chart sits beside it. The bridge cannot write a `2fr,1fr`
	// track, so the 2:1 split the geometry library decided is written as this pixel width on the column.
	let cardColumnWidth;
	// The band the cards and the chart are laid out in. A faceplate takes the top of the body for the
	// equipment it is about and hands the rest to its detail; every other pattern has the whole body.
	let cardBand = bodyArea;
	if (pattern === "faceplate") {
		const heroHeight = 148;
		slots.hero = rect(bodyArea.left, bodyArea.top, bodyArea.width, heroHeight);
		cardBand = rect(bodyArea.left, bodyArea.top + heroHeight + gap, bodyArea.width, bodyArea.height - heroHeight - gap);
		if (cardBand.height < 160) refuse("layout_overflow", `a ${height}px canvas leaves ${cardBand.height.toFixed(0)}px under the 148px equipment band: a faceplate needs room for the detail as well as the machine`);
	}
	if (bodyOwned) {
		// Nothing to split: the pattern's own component takes the body band.
	} else if (pattern === "faceplate") {
		// A faceplate stacks its detail under the machine it is about. The equipment band is the screen's
		// subject and everything else is read against it, so the detail is one vertical stack rather than a
		// side-by-side pairing, and it shares the band left under the hero equally between its cards and its
		// chart.
		const detail = cards.length + (wantsChart ? 1 : 0);
		if (detail > 0) {
			// Name the faceplate, not the floor: the band is short because the equipment band took the top of
			// the body, and a caller who reads "140px floor" would go looking for a constant instead of
			// dropping a card.
			const perItem = Math.floor((cardBand.height - gap * (detail - 1)) / detail);
			if (perItem < 140) refuse("layout_overflow", `a faceplate leaves ${cardBand.height.toFixed(0)}px of detail under its 148px equipment band, which splits ${detail} item(s) into ${perItem}px: a card or a chart needs 140px, so drop one of them or give the screen more height`);
			const detailSlots = stack(cardBand, Array.from({ length: detail }, () => 1), { minHeight: 140 });
			slots.cards = detailSlots.slice(0, cards.length);
			if (wantsChart) slots.chart = detailSlots[cards.length];
		}
	} else if (cards.length > 0 && wantsChart && (kind !== "compact" || pattern === "split")) {
		// The geometry library decides how much of the body a card column takes; the layout tree inside that
		// area is what actually places the components, so their inner text moves with the component. The split
		// pattern asks for this branch whatever the width class is, because its whole point is the pairing.
		const [cardArea, chartArea] = columns(cardBand, [2, 1], { minWidth: 300 });
		slots.chart = chartArea;
		cardColumnWidth = cardArea.width;
		slots.cards = cards.length === 1 ? [cardArea] : stack(cardArea, cards.map(() => 1), { minHeight: 140 });
	} else if (cards.length > 0) {
		slots.cards = cards.length === 1 ? [cardBand] : stack(cardBand, cards.map(() => 1), { minHeight: 140 });
		if (wantsChart) {
			// A compact canvas stacks the chart under the cards rather than squeezing both side by side.
			refuse("layout_too_narrow", `a ${width}px canvas cannot carry ${cards.length} card(s) and a chart side by side: drop the chart or the cards for the compact width class`);
		}
	} else if (wantsChart) {
		slots.chart = cardBand;
	}
	if (hasKpis) {
		const kpiArea = rect(content.left, top, content.width, kpiHeight);
		top += kpiHeight + gap;
		const kpis = blueprint.kpis.slice(0, 4);
		const areaForKpis = row(kpiArea, kpis.length, { minWidth: kind === "compact" ? 150 : 180 });
		slots.kpis = areaForKpis;
		// One row of equally weighted tiles: a KPI tile keeps its parts together at any canvas width because
		// the row, not a coordinate, places it.
		const strip = gridLayout(path, "KpiStrip", {
			box: kpiArea,
			columns: kpis.length,
			rows: 1,
			horizontalGap: gap,
			verticalGap: 0,
		});
		ops.push(...strip.ops);
		nodes.push(strip.path);
		for (const [index, kpi] of kpis.entries()) {
			const tile = kpiTile(strip.rowPaths[0], `Kpi${index + 1}`, areaForKpis[index], kpi, theme);
			ops.push(...tile.ops);
			nodes.push(tile.path);
		}
	}
	const feedArea = hasFeed ? rect(content.left, content.top + content.height - feedHeight, content.width, feedHeight) : null;
	if (pattern === "station") {
		// A station screen is a wall of lamps, so the grid is decided by the lamp: a tile narrower than
		// 200 px cannot hold a name and a number on one line, and a band shorter than 110 px cannot hold
		// the name row plus two value rows. The split is chosen by measuring every candidate row count and
		// keeping the one whose tile is closest to 1.4:1 - the aspect a name row over two value rows reads
		// well at. Filling the width first (the obvious rule) gives six machines five across with one
		// stranded under them, and a short last row renders its tiles wider than the row above it, so the
		// wall stops reading as one instrument.
		const capacity = Math.max(1, Math.floor((bodyArea.width + gap) / (200 + gap)));
		let grid = null;
		for (let candidate = 1; candidate <= stations.length; candidate++) {
			const perRow = Math.ceil(stations.length / candidate);
			if (perRow > capacity) continue;
			if (stations.length > 1 && perRow < 2) continue;
			const height = Math.floor((bodyArea.height - gap * (candidate - 1)) / candidate);
			if (height < 110) continue;
			const tileWidth = Math.floor((bodyArea.width - gap * (perRow - 1)) / perRow);
			const score = Math.abs(Math.log(tileWidth / height / 1.4));
			if (!grid || score < grid.score) grid = { lines: candidate, perRow, tileHeight: height, tileWidth, score };
		}
		if (!grid) refuse("layout_overflow", `${stations.length} station(s) will not fit a ${bodyArea.width.toFixed(0)}x${bodyArea.height.toFixed(0)}px body: a station tile needs 200px across and 110px down, and this body holds ${capacity} tile(s) per row with no row left 110px tall. Drop machines, drop the KPI strip or the message feed, or give the screen more height.`);
		const { lines, perRow, tileHeight, tileWidth } = grid;
		const stationGrid = gridLayout(path, "Stations", { box: bodyArea, columns: perRow, rows: lines, rowHeights: Array.from({ length: lines }, () => tileHeight), horizontalGap: gap, verticalGap: gap });
		ops.push(...stationGrid.ops);
		slots.stations = stations.map((_, index) => {
			const line = Math.floor(index / perRow);
			const column = index % perRow;
			return rect(bodyArea.left + column * (tileWidth + gap), bodyArea.top + line * (tileHeight + gap), tileWidth, tileHeight);
		});
		for (const [index, station] of stations.entries()) {
			ops.push(...stationTile(stationGrid.rowPaths[Math.floor(index / perRow)], `Station${index + 1}`, slots.stations[index], station, theme).ops);
		}
	}
	if (pattern === "table") {
		// A Screen is not a layout container: a Rectangle created directly under it carries no coordinate,
		// because the kit's surfaces are placed by their container's margins and gaps. The table therefore
		// hangs off a ColumnLayout that owns the body band. That column keeps its numeric box and sits at the
		// top-left of it - Stretch on an axis IS the size on that axis, so writing 608 and alignment 3 would
		// throw the 608 away, which is the measurement the container rules were written from.
		const tableArea = columnLayout(path, "TableArea", { box: bodyArea, horizontalAlignment: ALIGN.LEFT, verticalAlignment: ALIGN.LEFT });
		ops.push(...tableArea.ops);
		const table = tableCard(tableArea.path, "Table1", bodyArea, tableSpec, theme);
		ops.push(...table.ops);
		slots.table = bodyArea;
	}
	if (pattern === "faceplate") {
		const faceColumn = columnLayout(path, "Body", { box: bodyArea, horizontalAlignment: ALIGN.LEFT, verticalAlignment: ALIGN.LEFT, verticalGap: gap });
		ops.push(...faceColumn.ops);
		ops.push(...stationTile(faceColumn.path, "Equipment", slots.hero, equipment ?? stations[0], theme).ops);
		for (const [index, spec] of cards.entries()) {
			ops.push(...cardComponent(faceColumn.path, `DataCard${index + 1}`, slots.cards[index], spec, theme).ops);
		}
		if (wantsChart) ops.push(...chartComponent(faceColumn.path, "Chart1", slots.chart, blueprint.chart, theme).ops);
	}
	if ((pattern === "overview" || pattern === "split") && (cards.length > 0 || wantsChart)) {
		// The body is a layout tree. Side by side it is one row holding a card column and the chart, and the
		// 2:1 split is the pixel width the geometry library computed for the column, because a `fr` track is
		// not writable through the bridge. Stacked it is one column. Either way a card's rows and a chart's
		// bars follow the component that holds them instead of a drawn box.
		const sideBySide = cards.length > 0 && wantsChart && kind !== "compact";
		let cardParent;
		let chartParent;
		if (sideBySide) {
			// The body band is pinned to the rectangle the geometry library computed, so its alignment is the
			// ordinal 0 (Left on the horizontal axis, Top on the vertical one): Stretch on an axis discards the
			// numeric size written on it (measured 2026-11-17), and here the split between the card column and
			// the adapter column depends on that width being real.
			const bodyRow = rowLayout(path, "Body", { box: bodyArea, horizontalAlignment: ALIGN.LEFT, verticalAlignment: ALIGN.LEFT, horizontalGap: gap });
			ops.push(...bodyRow.ops);
			nodes.push(bodyRow.path);
			const cardColumn = columnLayout(bodyRow.path, "BodyCards", { width: cardColumnWidth, height: FILL, horizontalAlignment: ALIGN.LEFT, verticalAlignment: ALIGN.STRETCH, verticalGap: gap });
			ops.push(...cardColumn.ops);
			nodes.push(cardColumn.path);
			cardParent = cardColumn.path;
			chartParent = bodyRow.path;
		} else {
			const bodyColumn = columnLayout(path, "Body", { box: bodyArea, horizontalAlignment: ALIGN.LEFT, verticalAlignment: ALIGN.LEFT, verticalGap: gap });
			ops.push(...bodyColumn.ops);
			nodes.push(bodyColumn.path);
			cardParent = bodyColumn.path;
			chartParent = bodyColumn.path;
		}
		for (const [index, spec] of cards.entries()) {
			const card = cardComponent(cardParent, `DataCard${index + 1}`, slots.cards[index], spec, theme);
			ops.push(...card.ops);
			nodes.push(card.path);
		}
		if (wantsChart) {
			const chart = chartComponent(chartParent, "Chart1", slots.chart, blueprint.chart, theme);
			ops.push(...chart.ops);
			nodes.push(chart.path);
		}
	}
	if (adapterArea !== null) {
		const rows = adapterSpecs.length === 1 ? [adapterArea] : stack(adapterArea, adapterSpecs.map(() => 1), { minHeight: 160 });
		for (const [index, spec] of adapterSpecs.entries()) {
			const placed = adapterOps({ kind: spec.kind, screen: path, name: spec.name ?? `Adapter${index + 1}`, slot: rows[index], typePath: spec.type_path ?? spec.typePath ?? "", bindings: spec.bindings ?? {} });
			ops.push(...placed.ops);
			nodes.push(placed.placed.path);
			slots.adapters.push({ path: placed.placed.path, kind: spec.kind, bound: placed.bound, unbound: placed.unbound });
		}
	}
	if (hasFeed) {
		const messages = blueprint.messages.slice(0, MAX_MESSAGES);
		// The feed is one card in one row, and the card holds a column of message tiles, so the feed reflows
		// with the canvas instead of keeping tiles at the coordinates they were drawn at.
		const feedRow = gridLayout(path, "Feed", { box: feedArea, columns: 1, rows: 1, horizontalGap: 0, verticalGap: 0 });
		ops.push(...feedRow.ops);
		nodes.push(feedRow.path);
		const feed = messageFeed(feedRow.rowPaths[0], "Messages", feedArea, { title: blueprint.feedTitle ?? "Messages", messages }, theme, kind);
		ops.push(...feed.ops);
		nodes.push(...feed.paths);
		slots.messages = feedArea;
	}
	if (chrome === "screen") {
		const strip = { left: 0, top: height - FOOTER, width, height: FOOTER };
		push(surface(path, "StatusStrip", strip, theme.colours.surfaceAlt, theme, { border: false, radius: false }));
		const status = blueprint.status ?? {};
		push(dot(path, "StatusLamp", { left: PAD, top: strip.top + 18, width: 16, height: 16 }, status.ok === false ? theme.colours.danger : theme.colours.ok));
		const label = typeof status.text === "string" && status.text !== "" ? status.text : "Connected";
		push(text(path, "StatusText", { left: PAD + 26, top: strip.top + 14, width: Math.floor(width * 0.6), height: 24 }, label, theme, { fontSize: theme.type.small, colour: theme.colours.text }));
		slots.status = strip;
	}

	return {
		ops,
		layout: { pattern, width, height, width_class: kind, chrome, region: content, slots },
		theme,
		counts: { components: nodes.length, operations: ops.length }
	};
}

/**
 * A KPI tile: a surface in one row of the caller's strip, with a label, a big value and an optional unit
 * stacked in a `ColumnLayout` body. The tile fills its half of the row (`Width`/`Height` `-1`); `slot` is the
 * rectangle the layout library reserved, reported to the caller for drawing and for the design check.
 *
 * @param parent - The `RowLayout` that owns the tile.
 * @param name - BrowseName, `Kpi1` in the blueprint.
 * @param slot - The reserved rectangle.
 * @param spec - `{label, value, unit}`.
 * @param theme - A `kitTheme()` result.
 * @returns `{path, ops}`.
 */
export function kpiTile(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 140, minHeight: 64 });
	const tile = cellSurface(parent, name, {}, theme.colours.surface, theme);
	const ops = [...tile.ops];
	const body = columnLayout(tile.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 10, bottom: 10 }, verticalGap: 2 });
	ops.push(...body.ops);
	const label = String(spec?.label ?? "KPI");
	const value = spec?.value === undefined || spec?.value === null ? "—" : String(spec.value);
	const unit = typeof spec?.unit === "string" ? spec.unit : "";
	ops.push(...layoutText(body.path, "Label", label.toUpperCase(), theme, { height: 18, fontSize: theme.type.micro, weight: "600" }).ops);
	ops.push(...layoutText(body.path, "Value", value, theme, { height: 34, fontSize: theme.type.title, weight: "700" }).ops);
	if (unit !== "") ops.push(...layoutText(body.path, "Unit", unit, theme, { height: 20, fontSize: theme.type.small }).ops);
	return { path: tile.path, ops };
}

/**
 * A card: a surface whose body is a `ColumnLayout` of a title and one `RowLayout` per row. A row holds a
 * label and a value, a lamp and its state, or a scaled progress bar. The surface takes the height the
 * geometry library reserved for it and fills its column's width, so a stacked column of cards keeps the
 * bands the design check measured while every line inside a card is placed by the card.
 *
 * @param parent - The `ColumnLayout` that owns the card.
 * @param name - BrowseName, `DataCard1` in the blueprint.
 * @param slot - The reserved rectangle.
 * @param spec - `{title, rows[]}` where a row is `{label, value, unit, kind, on, percent}`.
 * @param theme - A `kitTheme()` result.
 * @returns `{path, ops}`.
 */
export function cardComponent(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 240, minHeight: 120 });
	const card = cellSurface(parent, name, { height: slot.height }, theme.colours.surface, theme);
	const ops = [...card.ops];
	const body = columnLayout(card.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 10, bottom: 10 }, verticalGap: 6 });
	ops.push(...body.ops);
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Panel";
	ops.push(...layoutText(body.path, "Title", title.toUpperCase(), theme, { height: 22, fontSize: theme.type.subheading, weight: "700" }).ops);
	const rows = Array.isArray(spec?.rows) ? spec.rows.slice(0, 8) : [];
	// A row pinned at 26 px is what made the served cards read as four fifths empty: three 26 px rows
	// inside a 247 px surface paint their text in the top 97 px, which the render check measures as
	// coverage 0.03-0.27 against a 0.30 minimum. A fill row is the only honest distribution a layout
	// container offers - `ContentVerticalAlignment` has no space-between member (0 Top, 1 Center, 2
	// Bottom) - and a fill row discards a numeric height on that axis, so the number is kept only where
	// an equal band would not hold the row's own 22 px label.
	const rowBand = rows.length === 0 ? MIN_ROW_BAND : (slot.height - 20 - 22 - 6 * rows.length) / rows.length;
	const rowHeight = rows.length <= 3 && rowBand >= MIN_ROW_BAND ? FILL : 26;
	for (const [index, entry] of rows.entries()) {
		const row = rowLayout(body.path, `Row${index + 1}`, { width: FILL, height: rowHeight, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
		ops.push(...row.ops);
		const label = String(entry?.label ?? "");
		ops.push(...layoutText(row.path, `Row${index + 1}Label`, label, theme, { height: 22, fontSize: theme.type.small, verticalAlignment: ALIGN.CENTER }).ops);
		const kind = entry?.kind === "lamp" || entry?.kind === "bar" ? entry.kind : "value";
		if (kind === "lamp") {
			const lampPath = `${row.path}/Row${index + 1}Lamp`;
			const lampColour = entry?.on === true ? theme.colours.ok : theme.colours.danger;
			ops.push(widget(row.path, `Row${index + 1}Lamp`, "Ellipse"), set(lampPath, "Width", size(16)), set(lampPath, "Height", size(16)), set(lampPath, "VerticalAlignment", String(ALIGN.CENTER)), set(lampPath, "FillColor", lampColour), set(lampPath, "BorderColor", lampColour));
			ops.push(...layoutText(row.path, `Row${index + 1}Value`, entry?.on === true ? "ON" : "OFF", theme, { width: 44, height: 22, fontSize: theme.type.small, verticalAlignment: ALIGN.CENTER }).ops);
		} else if (kind === "bar") {
			const percent = Math.max(0, Math.min(100, Number(entry?.percent ?? 0)));
			// A ScaleLayout is how a progress bar keeps its proportion: the fill is drawn on a 100 px design
			// canvas and the layout stretches that canvas to its row, so `percent` is the fill width.
			const meter = container(row.path, `Row${index + 1}Meter`, CONTAINERS.scale, { width: 120, height: 8, verticalAlignment: ALIGN.CENTER });
			ops.push(...meter.ops);
			ops.push(set(meter.path, "FillMode", String(FILL_MODE.STRETCH)), set(meter.path, "OriginalWidth", "100.0"), set(meter.path, "OriginalHeight", "8.0"), set(meter.path, "FontScaling", "false"));
			const fillPath = `${meter.path}/Row${index + 1}Fill`;
			ops.push(widget(meter.path, `Row${index + 1}Fill`, "Rectangle"), set(fillPath, "Width", size(Math.max(2, percent))), set(fillPath, "Height", size(8)), set(fillPath, "FillColor", theme.colours.accent), set(fillPath, "BorderColor", theme.colours.accent));
		} else {
			const unit = typeof entry?.unit === "string" ? entry.unit : "";
			const value = entry?.value === undefined || entry?.value === null ? "—" : String(entry.value);
			ops.push(...layoutText(row.path, `Row${index + 1}Value`, unit === "" ? value : `${value} ${unit}`, theme, { height: 22, fontSize: theme.type.small, weight: "600", align: 2, verticalAlignment: ALIGN.CENTER }).ops);
		}
	}
	return { path: card.path, ops };
}

/**
 * A station tile: the name of a machine, its lamp, and up to two of its numbers.
 *
 * This is the component an operator scans for a red lamp. The lamp is 22 px and pinned to the right end of
 * the head row so a row of tiles reads as one line of lamps at the height an operator actually works at;
 * a 16 px dot inside a 26 px row is the shape the render check cannot separate from its background. The
 * tile itself is created at fill on both axes, so the row that holds it decides its width and the band
 * that holds the row decides its height - the tile never carries a coordinate.
 *
 * @param parent - The layout that holds the tile.
 * @param name - The tile's BrowseName.
 * @param slot - The rectangle the grid library reserved for it.
 * @param spec - `{name, on, values[]}` where a value is `{label, value, unit}`.
 * @param theme - A `kitTheme()` result.
 * @returns `{path, ops}`.
 */
export function stationTile(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 180, minHeight: 100 });
	// The band the grid gave the tile is written on it, so a faceplate's equipment band stays the 148 px it
	// was promised instead of stretching to fill whatever the column has left. Inside a station grid the
	// band is the row's own height, so the tile fills its row either way.
	const tile = cellSurface(parent, name, { width: Number.isFinite(slot?.width) ? slot.width : FILL, height: Number.isFinite(slot?.height) ? slot.height : FILL }, theme.colours.surface, theme);
	const ops = [...tile.ops];
	const body = columnLayout(tile.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 10, bottom: 10 }, verticalGap: 4 });
	ops.push(...body.ops);
	const label = typeof spec?.name === "string" && spec.name.trim() !== "" ? spec.name.trim() : "Station";
	const head = rowLayout(body.path, "Head", { width: FILL, height: 26, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
	ops.push(...head.ops);
	ops.push(...layoutText(head.path, "StationName", label.toUpperCase(), theme, { width: FILL, height: 22, fontSize: theme.type.body, weight: "700", verticalAlignment: ALIGN.CENTER }).ops);
	const lampPath = `${head.path}/Lamp`;
	const lampColour = spec?.on === false ? theme.colours.danger : theme.colours.ok;
	// HorizontalAlignment 1 (Right) with a numeric size is what pins the lamp to the far end of the row:
	// alignment 3 on that axis would discard the 22 px written on it.
	ops.push(widget(head.path, "Lamp", "Ellipse"), set(lampPath, "Width", size(22)), set(lampPath, "Height", size(22)), set(lampPath, "HorizontalAlignment", String(ALIGN.RIGHT)), set(lampPath, "VerticalAlignment", String(ALIGN.CENTER)), set(lampPath, "FillColor", lampColour), set(lampPath, "BorderColor", lampColour));
	const values = Array.isArray(spec?.values) ? spec.values.slice(0, 2) : [];
	for (const [index, entry] of values.entries()) {
		const row = rowLayout(body.path, `Value${index + 1}`, { width: FILL, height: FILL, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
		ops.push(...row.ops);
		ops.push(...layoutText(row.path, `Value${index + 1}Label`, String(entry?.label ?? ""), theme, { width: FILL, height: 20, fontSize: theme.type.small, verticalAlignment: ALIGN.CENTER }).ops);
		const unit = typeof entry?.unit === "string" ? entry.unit : "";
		const value = entry?.value === undefined || entry?.value === null ? "—" : String(entry.value);
		const numberPath = `${row.path}/Value${index + 1}Number`;
		ops.push(...layoutText(row.path, `Value${index + 1}Number`, unit === "" ? value : `${value} ${unit}`, theme, { width: 96, height: 20, fontSize: theme.type.body, weight: "700", align: 2, verticalAlignment: ALIGN.CENTER }).ops);
		ops.push(set(numberPath, "HorizontalAlignment", String(ALIGN.RIGHT)));
	}
	return { path: tile.path, ops };
}

/**
 * A table: a title, one header band and up to `MAX_TABLE_ROWS` bands, each a painted row holding a RowLayout
 * of cell labels. A layout container paints nothing, so each row is a Rectangle and the RowLayout inside it
 * places the cells; the header band carries the alternate surface so the first line reads as a heading, and
 * the data bands are left at fill so they split the height the table was given instead of stacking at the
 * top of it.
 *
 * @param parent - The layout that holds the table.
 * @param name - The table's BrowseName.
 * @param slot - The rectangle the grid library reserved for it.
 * @param spec - `{title, columns[], widths[]?, rows[][]}` where `widths[]` are column weights.
 * @param theme - A `kitTheme()` result.
 * @returns `{path, ops}`.
 */
export function tableCard(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 320, minHeight: 160 });
	const heads = (Array.isArray(spec?.columns) ? spec.columns : []).map((column) => String(column ?? "")).filter((column) => column !== "").slice(0, MAX_TABLE_COLUMNS);
	if (heads.length === 0) refuse("table_no_columns", "a table needs columns[]: the header line every row is read against");
	const rows = Array.isArray(spec?.rows) ? spec.rows.slice(0, MAX_TABLE_ROWS) : [];
	const declared = Array.isArray(spec?.widths) ? spec.widths.map((value) => Number(value)) : [];
	const weights = heads.map((_, index) => (Number.isFinite(declared[index]) && declared[index] > 0 ? declared[index] : 1));
	// The gap the cell RowLayout will be built with is the gap the column widths are computed against, or
	// the last column lands short of the edge it was promised.
	const cellSlots = columns(rect(slot.left + 14, slot.top, slot.width - 28, 24), weights, { gutter: 8, minWidth: 60 });
	const table = cellSurface(parent, name, {}, theme.colours.surface, theme);
	const ops = [...table.ops];
	const body = columnLayout(table.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 10, bottom: 10 }, verticalGap: 6 });
	ops.push(...body.ops);
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Table";
	ops.push(...layoutText(body.path, "Title", title.toUpperCase(), theme, { height: 22, fontSize: theme.type.subheading, weight: "700" }).ops);
	const band = rows.length === 0 ? 0 : Math.floor((slot.height - 20 - 22 - 30 - 6 * (rows.length + 1)) / rows.length);
	if (rows.length > 0 && band < 30) refuse("layout_overflow", `a ${slot.height}px table splits ${rows.length} row(s) into ${band}px bands: a table row needs 30px, so give the screen more height or drop rows`);
	const headerBand = cellSurface(body.path, "HeaderBand", { width: FILL, height: 30 }, theme.colours.surfaceAlt, theme, { radius: false });
	ops.push(...headerBand.ops);
	const headerCells = rowLayout(headerBand.path, "Cells", { width: FILL, height: FILL, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
	ops.push(...headerCells.ops);
	for (const [index, column] of heads.entries()) {
		ops.push(...layoutText(headerCells.path, `Head${index + 1}`, column.toUpperCase(), theme, { width: cellSlots[index].width, height: 22, fontSize: theme.type.small, colour: theme.colours.tableHeaderInk, weight: "700", verticalAlignment: ALIGN.CENTER }).ops);
	}
	for (const [index, entry] of rows.entries()) {
		const rowBand = cellSurface(body.path, `Row${index + 1}`, { width: FILL, height: FILL }, index % 2 === 0 ? theme.colours.surface : theme.colours.surfaceAlt, theme, { radius: false });
		ops.push(...rowBand.ops);
		const cells = rowLayout(rowBand.path, "Cells", { width: FILL, height: FILL, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
		ops.push(...cells.ops);
		for (const [columnIndex, column] of heads.entries()) {
			const value = Array.isArray(entry) ? entry[columnIndex] : entry?.[column];
			const text = value === undefined || value === null || value === "" ? "—" : String(value);
			ops.push(...layoutText(cells.path, `Row${index + 1}Cell${columnIndex + 1}`, text, theme, { width: cellSlots[columnIndex].width, height: 22, fontSize: theme.type.small, verticalAlignment: ALIGN.CENTER }).ops);
		}
	}
	return { path: table.path, ops };
}

/**
 * A bar chart: a surface with a title, one row of bar columns and a baseline.
 *
 * Every bar column is a bottom-aligned `ColumnLayout` (value above the bar, label below it), so the bars
 * stand on one baseline and the labels stay under them at any width. The chart takes the width the geometry
 * library reserved for it and fills the height of the row or column that holds it.
 *
 * @param parent - The `RowLayout` or `ColumnLayout` that owns the chart.
 * @param name - BrowseName, `Chart1` in the blueprint.
 * @param slot - The reserved rectangle.
 * @param spec - `{title, values[], labels[], unit, threshold}`.
 * @param theme - A `kitTheme()` result.
 * @returns `{path, ops}`.
 */
export function chartComponent(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 260, minHeight: 140 });
	const card = cellSurface(parent, name, { width: slot.width }, theme.colours.surface, theme);
	const ops = [...card.ops];
	const body = columnLayout(card.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 10, bottom: 10 }, verticalGap: 6 });
	ops.push(...body.ops);
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Values";
	ops.push(...layoutText(body.path, "Title", title.toUpperCase(), theme, { height: 22, fontSize: theme.type.subheading, weight: "700" }).ops);
	const values = Array.isArray(spec?.values) ? spec.values.slice(0, 8).map((entry) => Number(entry ?? 0)).filter((entry) => Number.isFinite(entry)) : [];
	if (values.length === 0) refuse("blueprint_chart_empty", `${name} needs at least one numeric value in chart.values`);
	const labels = Array.isArray(spec?.labels) ? spec.labels : values.map((_value, index) => String(index + 1));
	const threshold = Number.isInteger(spec?.threshold) ? spec.threshold : -1;
	const plotHeight = slot.height - 96;
	if (plotHeight < 40) refuse("layout_overflow", `${name} leaves ${plotHeight.toFixed(0)}px to draw ${values.length} bar(s): give the chart more height or fewer values`);
	const unit = typeof spec?.unit === "string" ? spec.unit : "";
	const plot = gridLayout(body.path, "Plot", { width: FILL, height: FILL, columns: values.length, rows: 1, horizontalGap: 10, verticalGap: 0 });
	ops.push(...plot.ops);
	const peak = Math.max(...values, 1);
	const barRoom = Math.max(20, plotHeight - 60);
	for (const [index, value] of values.entries()) {
		const line = columnLayout(plot.rowPaths[0], `Bar${index + 1}`, { width: FILL, height: FILL, contentAlignment: CONTENT_ALIGN_COLUMN.BOTTOM, verticalGap: 2 });
		ops.push(...line.ops);
		const height = Math.max(4, Math.round((value / peak) * barRoom));
		const barPath = `${line.path}/Bar${index + 1}Fill`;
		const barColour = index === threshold ? theme.colours.danger : theme.colours.accent;
		ops.push(...layoutText(line.path, `Bar${index + 1}Value`, `${value}${unit}`, theme, { height: 18, fontSize: theme.type.micro, align: 2 }).ops);
		ops.push(widget(line.path, `Bar${index + 1}Fill`, "Rectangle"), set(barPath, "Width", size(FILL)), set(barPath, "Height", size(height)), set(barPath, "FillColor", barColour), set(barPath, "BorderColor", barColour));
		ops.push(...layoutText(line.path, `Bar${index + 1}Label`, String(labels[index] ?? index + 1), theme, { height: 18, fontSize: theme.type.micro, align: 2 }).ops);
	}
	const baselinePath = `${body.path}/Baseline`;
	ops.push(widget(body.path, "Baseline", "Rectangle"), set(baselinePath, "Width", size(FILL)), set(baselinePath, "Height", size(2)), set(baselinePath, "FillColor", theme.colours.border));
	return { path: card.path, ops };
}

/**
 * A message feed: one card with a title and a column of rows, each row holding the tiles of one line. The
 * tiles fill their half of the row, so the feed reflows instead of keeping tiles at fixed coordinates.
 *
 * @param parent - The `RowLayout` or `ColumnLayout` that owns the feed card.
 * @param name - BrowseName, `Messages` in the blueprint.
 * @param slot - The reserved rectangle.
 * @param spec - `{title, messages[]}` where a message is `{title, text}`.
 * @param theme - A `kitTheme()` result.
 * @param kind - Width class, `compact` fits two tiles per row.
 * @returns `{path, ops, paths}` where `paths` lists the card and every tile it created.
 */
export function messageFeed(parent, name, slot, spec, theme, kind) {
	requireSlot(slot, name, { minWidth: 240, minHeight: 96 });
	const card = cellSurface(parent, name, {}, theme.colours.surface, theme);
	const ops = [...card.ops];
	const paths = [card.path];
	const body = columnLayout(card.path, "Body", { width: FILL, height: FILL, margins: { left: 14, right: 14, top: 8, bottom: 10 }, verticalGap: 6 });
	ops.push(...body.ops);
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Messages";
	ops.push(...layoutText(body.path, "Title", title.toUpperCase(), theme, { height: 20, fontSize: theme.type.subheading, weight: "700" }).ops);
	const messages = Array.isArray(spec?.messages) ? spec.messages.slice(0, MAX_MESSAGES) : [];
	if (messages.length === 0) return { path: card.path, ops, paths };
	const perRow = kind === "compact" ? 2 : Math.min(3, messages.length);
	const lines = Math.max(1, Math.ceil(messages.length / perRow));
	// What is left for the tiles once the card's own padding and its title are taken out. Each row gets that
	// height divided by the number of rows: stretched rows inside one column were measured (2026-11-17) to
	// split the track equally - two rows in a 608 px column with a 10 px gap each rendered 299 px - and the
	// division written here is the same figure, written down so an unequal row height is possible later.
	const listHeight = Math.max(40, slot.height - 44);
	const tileHeight = Math.floor((listHeight - 8 * (lines - 1)) / lines);
	const list = gridLayout(body.path, "List", {
		width: FILL,
		height: FILL,
		columns: perRow,
		rows: lines,
		rowHeights: Array.from({ length: lines }, () => tileHeight),
		horizontalGap: 10,
		verticalGap: 8,
	});
	ops.push(...list.ops);
	for (const [index, message] of messages.entries()) {
		const tile = cellSurface(list.rowPaths[Math.floor(index / perRow)], `Message${index + 1}`, {}, theme.colours.surfaceAlt, theme);
		ops.push(...tile.ops);
		paths.push(tile.path);
		const tileBody = columnLayout(tile.path, "Body", { width: FILL, height: FILL, margins: { left: 10, right: 10, top: 6, bottom: 6 }, verticalGap: 2 });
		ops.push(...tileBody.ops);
		const heading = typeof message?.title === "string" ? message.title : `Message ${index + 1}`;
		const bodyText = typeof message?.text === "string" ? message.text : "";
		ops.push(...layoutText(tileBody.path, `Message${index + 1}Title`, heading, theme, { height: 18, fontSize: theme.type.small, weight: "600" }).ops);
		if (bodyText !== "") ops.push(...layoutText(tileBody.path, `Message${index + 1}Text`, bodyText, theme, { height: FILL, fontSize: theme.type.micro }).ops);
	}
	return { path: card.path, ops, paths };
}

/** The self-describing catalogue `optix_ui action components` returns. */
export function kitCatalogue(language = DEFAULT_LANGUAGE) {
	const theme = kitTheme(language);
	return {
		language: theme.name,
		tokens: Object.keys(theme.tokens).sort(),
		type_scale: theme.type,
		patterns: PATTERNS,
		components: [
			{ name: "headerBand", props: ["title", "subtitle", "chips[]", "clock", "language", "user", "bell"], description: "The band every operator reads first: brand area, screen title, state chips, live clock, language selector, user badge and an alarm bell." },
			{ name: "kpiTile", props: ["label", "value", "unit"], description: "One number with its unit, large enough to read at a glance, arranged by a column layout inside a row of the KPI strip." },
			{ name: "card", props: ["title", "rows[].label", "rows[].value", "rows[].unit", "rows[].kind=value|lamp|bar", "rows[].percent", "rows[].on"], description: "A titled panel of label/value, label/lamp or label/progress rows, each row a row layout under the card's column layout. Up to three rows are left at fill so they split the card's height instead of painting their text in its top quarter." },
			{ name: "stationTile", props: ["name", "on", "values[].label", "values[].value", "values[].unit"], description: "One machine: its name, a 22px lamp pinned to the right of the name row, and up to two numbers. The tile carries the box its row was given, so a wall of them keeps one tile width across every row." },
			{ name: "tableCard", props: ["title", "columns[]", "widths[]", "rows[][]"], description: `A header band and up to ${MAX_TABLE_ROWS} banded rows of up to ${MAX_TABLE_COLUMNS} cells: each band is a painted rectangle holding a row layout, because a layout container paints nothing and an unpainted band cannot be read as a row.` },
			{ name: "barChart", props: ["title", "values[]", "labels[]", "unit", "threshold"], description: "A bar chart with a baseline, a value label per bar and one bar marked as the alarm threshold, one bottom-aligned column layout per bar in a single row." },
			{ name: "messageFeed", props: ["title", "messages[].title", "messages[].text"], description: "A feed of small cards for reminders, maintenance notes and operator messages, one row per line of tiles inside the feed." },
			{ name: "statusStrip", props: ["text", "ok"], description: "The bottom strip: a connection lamp and one line of status, the way the vendor demos do it." },
			{ name: "lamp", props: ["on"], description: "A state dot, green when on and red when not." },
			{ name: "divider", props: [], description: "A hairline rule between two sections." },
			{ name: "heroImage", props: ["path"], description: "An image region for a process picture or a mimic, sized by the layout." }
		],
		grid: { columns: grid(1280).columns, gutter: grid(1280).gutter, pad: grid(1280).pad, width_classes: ["compact", "standard", "wide"], min_target: 44 }
	};
}
