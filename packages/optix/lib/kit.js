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

/** The blueprints a blueprint's `pattern` may name, in the order the kit documents them. */
export const PATTERNS = ["overview", "blank"];

/** The message feed shows at most this many cards; more is a screen, not a feed. */
export const MAX_MESSAGES = 6;

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

/** A rectangle with a fill, a hairline border and a corner radius, placed by its slot. */
function surface(parent, name, slot, fill, theme, { border = true, radius = true } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Rectangle"), ...box(path, slot), set(path, "FillColor", fill)];
	if (border) ops.push(set(path, "BorderColor", theme.colours.border), set(path, "BorderThickness", theme.borderWidth));
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
function cellSurface(parent, name, { width = FILL, height = FILL } = {}, fill, theme, { border = true, radius = true } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Rectangle")];
	// Size and Stretch are one pair: a child with only the -1 renders at its content size, which is what the
	// first live SMT render showed on 2026-11-17 (four cards hugging their text inside a 1060 px row).
	ops.push(...(width === FILL ? stretch(path) : [set(path, "Width", size(width))]));
	ops.push(...(height === FILL ? stretchVertical(path) : [set(path, "Height", size(height))]));
	ops.push(set(path, "FillColor", fill));
	if (border) ops.push(set(path, "BorderColor", theme.colours.border), set(path, "BorderThickness", theme.borderWidth));
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
	const slots = { header: null, kpis: [], cards: [], chart: null, messages: null, status: null, adapters: [] };

	if (chrome === "screen") {
		const header = { left: 0, top: 0, width, height: HEADER };
		push(surface(path, "HeaderBand", header, theme.colours.accent, theme, { border: false, radius: false }));
		slots.header = header;
		const title = typeof blueprint.title === "string" && blueprint.title.trim() !== "" ? blueprint.title.trim() : "Untitled screen";
		const subtitle = typeof blueprint.subtitle === "string" ? blueprint.subtitle : "";
		push(text(path, "HeaderTitle", { left: PAD, top: 14, width: Math.max(160, Math.floor(width * 0.45)), height: 30 }, title.toUpperCase(), theme, { fontSize: theme.type.title, colour: theme.colours.accentText, weight: "700" }));
		if (subtitle !== "") push(text(path, "HeaderSubtitle", { left: PAD, top: 48, width: Math.max(160, Math.floor(width * 0.45)), height: 22 }, subtitle, theme, { fontSize: theme.type.small, colour: theme.colours.accentText }));
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
			push(surface(path, "HeaderBell", bell, theme.colours.accentText, theme, { radius: false }));
			push(text(path, "HeaderBellLabel", bell, "!", theme, { fontSize: theme.type.heading, colour: theme.colours.danger, weight: "700", align: 2 }));
		}
		if (typeof headerBar.user === "string" && headerBar.user !== "") {
			const widthBox = 150;
			const slot = { left: right - widthBox, top: 14, width: widthBox, height: 40 };
			right -= widthBox + 12;
			push(surface(path, "HeaderUser", slot, theme.colours.accentText, theme, { radius: true }));
			push(dot(path, "HeaderUserDot", { left: slot.left + 8, top: slot.top + 12, width: 16, height: 16 }, theme.colours.ok));
			push(text(path, "HeaderUserName", { left: slot.left + 30, top: slot.top + 10, width: widthBox - 38, height: 20 }, headerBar.user, theme, { fontSize: theme.type.small, colour: theme.colours.text }));
		}
		if (typeof headerBar.language === "string" && headerBar.language !== "") {
			const slot = { left: right - 56, top: 14, width: 56, height: 40 };
			right -= 68;
			push(surface(path, "HeaderLanguage", slot, theme.colours.accentText, theme, { radius: true }));
			push(text(path, "HeaderLanguageLabel", slot, headerBar.language.toUpperCase(), theme, { fontSize: theme.type.small, colour: theme.colours.text, weight: "600", align: 2 }));
		}
		if (typeof headerBar.clock === "string" && headerBar.clock !== "") {
			const slot = { left: right - 96, top: 22, width: 96, height: 24 };
			right -= 108;
			push(text(path, "HeaderClock", slot, headerBar.clock, theme, { fontSize: theme.type.subheading, colour: theme.colours.accentText, weight: "600", align: 1 }));
		}
		const chips = Array.isArray(headerBar.chips) ? headerBar.chips.slice(0, 4) : [];
		for (const [index, chip] of chips.entries()) {
			const label = typeof chip === "string" ? chip : String(chip?.text ?? "");
			if (label === "") continue;
			const chipWidth = Math.max(96, Math.min(200, 16 + label.length * 8));
			const slot = { left: right - chipWidth, top: 48, width: chipWidth, height: 26 };
			right -= chipWidth + 8;
			push(surface(path, `HeaderChip${index + 1}`, slot, chip?.on === false ? theme.colours.surface : theme.colours.accentText, theme, { radius: true }));
			push(text(path, `HeaderChip${index + 1}Label`, slot, label, theme, { fontSize: theme.type.micro, colour: chip?.on === false ? theme.colours.text : theme.colours.text, weight: "600", align: 2 }));
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
	// The width a card column gets when the chart sits beside it. The bridge cannot write a `2fr,1fr`
	// track, so the 2:1 split the geometry library decided is written as this pixel width on the column.
	let cardColumnWidth;
	if (cards.length === 0 && !wantsChart && adapterSpecs.length === 0) refuse("blueprint_empty_body", "a screen needs at least one card, a chart or an adapter: give cards[], chart{} or adapters[]");
	if (cards.length > 0 && wantsChart && kind !== "compact") {
		// The geometry library decides how much of the body a card column takes; the layout tree inside that
		// area is what actually places the components, so their inner text moves with the component.
		const [cardArea, chartArea] = columns(bodyArea, [2, 1], { minWidth: 300 });
		slots.chart = chartArea;
		cardColumnWidth = cardArea.width;
		slots.cards = cards.length === 1 ? [cardArea] : stack(cardArea, cards.map(() => 1), { minHeight: 140 });
	} else if (cards.length > 0) {
		slots.cards = cards.length === 1 ? [bodyArea] : stack(bodyArea, cards.map(() => 1), { minHeight: 140 });
		if (wantsChart) {
			// A compact canvas stacks the chart under the cards rather than squeezing both side by side.
			refuse("layout_too_narrow", `a ${width}px canvas cannot carry ${cards.length} card(s) and a chart side by side: drop the chart or the cards for the compact width class`);
		}
	} else if (wantsChart) {
		slots.chart = bodyArea;
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
	if (cards.length > 0 || wantsChart) {
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
	for (const [index, entry] of rows.entries()) {
		const row = rowLayout(body.path, `Row${index + 1}`, { width: FILL, height: 26, contentAlignment: CONTENT_ALIGN_ROW.LEFT, horizontalGap: 8 });
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
			{ name: "card", props: ["title", "rows[].label", "rows[].value", "rows[].unit", "rows[].kind=value|lamp|bar", "rows[].percent", "rows[].on"], description: "A titled panel of label/value, label/lamp or label/progress rows, each row a row layout under the card's column layout." },
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
