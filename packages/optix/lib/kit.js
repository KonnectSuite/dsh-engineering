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

/** A rectangle with a fill, a hairline border and a corner radius. */
function surface(parent, name, slot, fill, theme, { border = true, radius = true } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Rectangle"), ...box(path, slot), set(path, "FillColor", fill)];
	if (border) ops.push(set(path, "BorderColor", theme.colours.border), set(path, "BorderThickness", theme.borderWidth));
	if (radius) ops.push(set(path, "CornerRadius", theme.radius));
	return { path, ops };
}

/** A text label. Optix labels have no background, so chrome is always a sibling rectangle. */
function text(parent, name, slot, value, theme, { fontSize = theme.type.body, colour = theme.colours.text, weight = "400", align = 0 } = {}) {
	const path = `${parent}/${name}`;
	const ops = [widget(parent, name, "Label"), ...box(path, slot), set(path, "Text", String(value)), set(path, "FontSize", size(fontSize)), set(path, "TextColor", colour)];
	if (weight !== "400") ops.push(set(path, "FontWeight", weight));
	if (align !== 0) ops.push(set(path, "TextHorizontalAlignment", String(align)));
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
	if (hasKpis) {
		const kpiArea = rect(content.left, top, content.width, kpiHeight);
		top += kpiHeight + gap;
		const kpis = blueprint.kpis.slice(0, 4);
		const areaForKpis = row(kpiArea, kpis.length, { minWidth: kind === "compact" ? 150 : 180 });
		slots.kpis = areaForKpis;
		for (const [index, kpi] of kpis.entries()) {
			const { ops: kpiOps, path: kpiPath } = kpiTile(path, `Kpi${index + 1}`, areaForKpis[index], kpi, theme);
			ops.push(...kpiOps);
			nodes.push(kpiPath);
		}
	}
	const feedArea = hasFeed ? rect(content.left, content.top + content.height - feedHeight, content.width, feedHeight) : null;
	const cards = Array.isArray(blueprint.cards) ? blueprint.cards.slice(0, 3) : [];
	const wantsChart = blueprint.chart !== null && typeof blueprint.chart === "object";
	if (cards.length === 0 && !wantsChart && adapterSpecs.length === 0) refuse("blueprint_empty_body", "a screen needs at least one card, a chart or an adapter: give cards[], chart{} or adapters[]");
	if (cards.length > 0 && wantsChart && kind !== "compact") {
		const [cardArea, chartArea] = columns(bodyArea, [2, 1], { minWidth: 300 });
		if (cards.length === 1) {
			const card = cardComponent(path, "DataCard1", cardArea, cards[0], theme);
			ops.push(...card.ops);
			nodes.push(card.path);
			slots.cards.push(cardArea);
		} else {
			const rows = stack(cardArea, cards.map(() => 1), { minHeight: 140 });
			for (const [index, spec] of cards.entries()) {
				const card = cardComponent(path, `DataCard${index + 1}`, rows[index], spec, theme);
				ops.push(...card.ops);
				nodes.push(card.path);
				slots.cards.push(rows[index]);
			}
		}
		const chart = chartComponent(path, "Chart1", chartArea, blueprint.chart, theme);
		ops.push(...chart.ops);
		nodes.push(chart.path);
		slots.chart = chartArea;
	} else if (cards.length > 0) {
		const cardRows = cards.length === 1 ? [bodyArea] : stack(bodyArea, cards.map(() => 1), { minHeight: 140 });
		for (const [index, spec] of cards.entries()) {
			const card = cardComponent(path, `DataCard${index + 1}`, cardRows[index], spec, theme);
			ops.push(...card.ops);
			nodes.push(card.path);
			slots.cards.push(cardRows[index]);
		}
		if (wantsChart) {
			// A compact canvas stacks the chart under the cards rather than squeezing both side by side.
			refuse("layout_too_narrow", `a ${width}px canvas cannot carry ${cards.length} card(s) and a chart side by side: drop the chart or the cards for the compact width class`);
		}
	} else if (wantsChart) {
		const chart = chartComponent(path, "Chart1", bodyArea, blueprint.chart, theme);
		ops.push(...chart.ops);
		nodes.push(chart.path);
		slots.chart = bodyArea;
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
		const feed = messageFeed(path, "Messages", feedArea, { title: blueprint.feedTitle ?? "Messages", messages }, theme, kind);
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

/** A KPI tile: a label, a big value, an optional unit and a hairline rule. */
export function kpiTile(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 140, minHeight: 64 });
	const tile = surface(parent, name, slot, theme.colours.surface, theme);
	const ops = [...tile.ops];
	const label = String(spec?.label ?? "KPI");
	const value = spec?.value === undefined || spec?.value === null ? "â€”" : String(spec.value);
	const unit = typeof spec?.unit === "string" ? spec.unit : "";
	ops.push(...text(`${parent}/${name}`, "Label", { left: slot.left + 14, top: slot.top + 10, width: Math.max(60, slot.width - 28), height: 18 }, label.toUpperCase(), theme, { fontSize: theme.type.micro, colour: theme.colours.text, weight: "600" }).ops);
	ops.push(...text(`${parent}/${name}`, "Value", { left: slot.left + 14, top: slot.top + 28, width: Math.max(60, slot.width * 0.62), height: 34 }, value, theme, { fontSize: theme.type.title, colour: theme.colours.text, weight: "700" }).ops);
	if (unit !== "") ops.push(...text(`${parent}/${name}`, "Unit", { left: slot.left + 14 + Math.max(60, slot.width * 0.62), top: slot.top + 40, width: 60, height: 20 }, unit, theme, { fontSize: theme.type.small, colour: theme.colours.text }).ops);
	return { path: tile.path, ops };
}

/** A card with a title and rows of label/value, label/lamp or label/progress. */
export function cardComponent(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 240, minHeight: 120 });
	const card = surface(parent, name, slot, theme.colours.surface, theme);
	const ops = [...card.ops];
	const inner = `${parent}/${name}`;
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Panel";
	ops.push(...text(inner, "Title", { left: slot.left + 14, top: slot.top + 10, width: Math.max(80, slot.width - 28), height: 22 }, title.toUpperCase(), theme, { fontSize: theme.type.subheading, colour: theme.colours.text, weight: "700" }).ops);
	const rows = Array.isArray(spec?.rows) ? spec.rows.slice(0, 8) : [];
	const available = slot.height - 44;
	const rowHeight = rows.length > 0 ? Math.min(40, Math.max(26, available / Math.max(rows.length, 1))) : 0;
	for (const [index, entry] of rows.entries()) {
		const top = slot.top + 40 + index * rowHeight;
		const label = String(entry?.label ?? "");
		ops.push(...text(inner, `Row${index + 1}Label`, { left: slot.left + 14, top, width: Math.floor(slot.width * 0.55), height: Math.max(18, rowHeight - 6) }, label, theme, { fontSize: theme.type.small, colour: theme.colours.text }).ops);
		const kind = entry?.kind === "lamp" || entry?.kind === "bar" ? entry.kind : "value";
		const valueArea = { left: slot.left + 14 + Math.floor(slot.width * 0.55), top, width: Math.max(40, Math.floor(slot.width * 0.45) - 20), height: Math.max(18, rowHeight - 6) };
		if (kind === "lamp") {
			ops.push(...dot(inner, `Row${index + 1}Lamp`, { left: valueArea.left, top: top + 4, width: 16, height: 16 }, entry?.on === true ? theme.colours.ok : theme.colours.danger).ops);
			ops.push(...text(inner, `Row${index + 1}Value`, { ...valueArea, left: valueArea.left + 24, width: Math.max(40, valueArea.width - 24) }, entry?.on === true ? "ON" : "OFF", theme, { fontSize: theme.type.small, colour: theme.colours.text }).ops);
		} else if (kind === "bar") {
			const percent = Math.max(0, Math.min(100, Number(entry?.percent ?? 0)));
			const track = { left: valueArea.left, top: top + 9, width: valueArea.width, height: 8 };
			ops.push(...surface(inner, `Row${index + 1}Track`, track, theme.colours.surfaceAlt, theme, { radius: true }).ops);
			ops.push(...surface(inner, `Row${index + 1}Fill`, { ...track, width: Math.max(2, Math.round((track.width * percent) / 100)) }, theme.colours.accent, theme, { radius: true, border: false }).ops);
		} else {
			const unit = typeof entry?.unit === "string" ? entry.unit : "";
			const value = entry?.value === undefined || entry?.value === null ? "â€”" : String(entry.value);
			ops.push(...text(inner, `Row${index + 1}Value`, valueArea, unit === "" ? value : `${value} ${unit}`, theme, { fontSize: theme.type.small, colour: theme.colours.text, weight: "600", align: 1 }).ops);
		}
	}
	return { path: card.path, ops };
}

/** A bar chart with a title, a baseline, a threshold marker and value labels. */
export function chartComponent(parent, name, slot, spec, theme) {
	requireSlot(slot, name, { minWidth: 260, minHeight: 140 });
	const card = surface(parent, name, slot, theme.colours.surface, theme);
	const ops = [...card.ops];
	const inner = `${parent}/${name}`;
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Values";
	ops.push(...text(inner, "Title", { left: slot.left + 14, top: slot.top + 10, width: Math.max(80, slot.width - 28), height: 22 }, title.toUpperCase(), theme, { fontSize: theme.type.subheading, colour: theme.colours.text, weight: "700" }).ops);
	const values = Array.isArray(spec?.values) ? spec.values.slice(0, 8).map((entry) => Number(entry ?? 0)).filter((entry) => Number.isFinite(entry)) : [];
	if (values.length === 0) refuse("blueprint_chart_empty", `${name} needs at least one numeric value in chart.values`);
	const labels = Array.isArray(spec?.labels) ? spec.labels : values.map((_value, index) => String(index + 1));
	const threshold = Number.isInteger(spec?.threshold) ? spec.threshold : -1;
	const plot = { left: slot.left + 20, top: slot.top + 44, width: slot.width - 40, height: slot.height - 96 };
	if (plot.height < 40) refuse("layout_overflow", `${name} leaves ${plot.height.toFixed(0)}px to draw ${values.length} bar(s): give the chart more height or fewer values`);
	const peak = Math.max(...values, 1);
	const barGap = 10;
	const barWidth = Math.max(12, Math.floor((plot.width - barGap * (values.length - 1)) / values.length));
	for (const [index, value] of values.entries()) {
		const height = Math.max(4, Math.round((value / peak) * plot.height));
		const left = plot.left + index * (barWidth + barGap);
		const onThreshold = index === threshold;
		ops.push(...surface(inner, `Bar${index + 1}`, { left, top: plot.top + plot.height - height, width: barWidth, height }, onThreshold ? theme.colours.danger : theme.colours.accent, theme, { border: false }).ops);
		ops.push(...text(inner, `Bar${index + 1}Label`, { left, top: plot.top + plot.height + 6, width: barWidth, height: 18 }, String(labels[index] ?? index + 1), theme, { fontSize: theme.type.micro, colour: theme.colours.text, align: 2 }).ops);
		ops.push(...text(inner, `Bar${index + 1}Value`, { left, top: plot.top + plot.height - height - 20, width: barWidth, height: 18 }, `${value}${typeof spec?.unit === "string" ? spec.unit : ""}`, theme, { fontSize: theme.type.micro, colour: theme.colours.text, align: 2 }).ops);
	}
	ops.push(...surface(inner, "Baseline", { left: plot.left, top: plot.top + plot.height, width: plot.width, height: 2 }, theme.colours.border, theme, { border: false, radius: false }).ops);
	return { path: card.path, ops };
}

/** A message feed: a card with one small card per message, title and body. */
export function messageFeed(parent, name, slot, spec, theme, kind) {
	requireSlot(slot, name, { minWidth: 240, minHeight: 96 });
	const card = surface(parent, name, slot, theme.colours.surface, theme);
	const ops = [...card.ops];
	const paths = [card.path];
	const inner = `${parent}/${name}`;
	const title = typeof spec?.title === "string" && spec.title !== "" ? spec.title : "Messages";
	ops.push(...text(inner, "Title", { left: slot.left + 14, top: slot.top + 8, width: Math.max(80, slot.width - 28), height: 20 }, title.toUpperCase(), theme, { fontSize: theme.type.subheading, colour: theme.colours.text, weight: "700" }).ops);
	const messages = Array.isArray(spec?.messages) ? spec.messages.slice(0, MAX_MESSAGES) : [];
	const perRow = kind === "compact" ? 2 : Math.min(3, messages.length);
	const rowHeight = Math.max(52, Math.floor((slot.height - 40) / Math.max(1, Math.ceil(messages.length / Math.max(1, perRow)))));
	const messageWidth = Math.floor((slot.width - 28 - (perRow - 1) * 10) / Math.max(1, perRow));
	for (const [index, message] of messages.entries()) {
		const column = index % perRow;
		const line = Math.floor(index / perRow);
		const boxed = { left: slot.left + 14 + column * (messageWidth + 10), top: slot.top + 34 + line * (rowHeight + 8), width: messageWidth, height: Math.min(rowHeight, slot.top + slot.height - 10 - (slot.top + 34 + line * (rowHeight + 8))) };
		if (boxed.height < 40) break;
		const tile = surface(inner, `Message${index + 1}`, boxed, theme.colours.surfaceAlt, theme);
		ops.push(...tile.ops);
		paths.push(tile.path);
		const heading = typeof message?.title === "string" ? message.title : `Message ${index + 1}`;
		const body = typeof message?.text === "string" ? message.text : "";
		ops.push(...text(inner, `Message${index + 1}Title`, { left: boxed.left + 10, top: boxed.top + 6, width: boxed.width - 20, height: 18 }, heading, theme, { fontSize: theme.type.small, colour: theme.colours.text, weight: "600" }).ops);
		if (body !== "") ops.push(...text(inner, `Message${index + 1}Text`, { left: boxed.left + 10, top: boxed.top + 24, width: boxed.width - 20, height: boxed.height - 30 }, body, theme, { fontSize: theme.type.micro, colour: theme.colours.text }).ops);
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
			{ name: "kpiTile", props: ["label", "value", "unit"], description: "One number with its unit, large enough to read at a glance." },
			{ name: "card", props: ["title", "rows[].label", "rows[].value", "rows[].unit", "rows[].kind=value|lamp|bar", "rows[].percent", "rows[].on"], description: "A titled panel of label/value, label/lamp or label/progress rows." },
			{ name: "barChart", props: ["title", "values[]", "labels[]", "unit", "threshold"], description: "A bar chart with a baseline, a value label per bar and one bar marked as the alarm threshold." },
			{ name: "messageFeed", props: ["title", "messages[].title", "messages[].text"], description: "A feed of small cards for reminders, maintenance notes and operator messages." },
			{ name: "statusStrip", props: ["text", "ok"], description: "The bottom strip: a connection lamp and one line of status, the way the vendor demos do it." },
			{ name: "lamp", props: ["on"], description: "A state dot, green when on and red when not." },
			{ name: "divider", props: [], description: "A hairline rule between two sections." },
			{ name: "heroImage", props: ["path"], description: "An image region for a process picture or a mimic, sized by the layout." }
		],
		grid: { columns: grid(1280).columns, gutter: grid(1280).gutter, pad: grid(1280).pad, width_classes: ["compact", "standard", "wide"], min_target: 44 }
	};
}
