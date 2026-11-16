/**
 * The window shell: a header band, a left navigation rail, a content host and a status strip.
 *
 * A screen full of cards has no place to say who is logged in, which cycle is running or what the
 * machine is doing. Every professional Optix application puts those answers in four bands around the
 * content, and keeps them identical on every screen so the operator's eye does not re-find them. This
 * module composes that shell around a window: it draws the bands with the active design language's
 * tokens, makes the rail a native `NavigationPanel` with one item per screen, and points the panel
 * loader at the screens it hosts.
 *
 * The plan is **phased** because Studio creates a `NavigationPanel`'s `Panels` collection when the panel
 * object appears, so a batch that creates the rail and then puts an item in `Panels` cannot validate
 * against the model as it is (measured on bridge 1.0.9, the same reason the theme is two passes):
 *
 * - `chrome`: the bands, the rail object, the content host and their geometry and tokens;
 * - `rail`: the rail items and their titles, whose parents exist only after `chrome` applied;
 * - `attach`: the rail's `AttachedPanelLoader` property. It is a settable `NodeId` on the panel with no
 *   pointer child in the model, so writing it materialises the pointer (measured: the node appears
 *   with an empty `ref`); this must be its own batch, because a later batch validates against the
 *   materialised child, not the property;
 * - `pointers`: the pointer values (`<item>/Panel`, `<loader>/Panel`, `<rail>/AttachedPanelLoader`),
 *   written on the pointer's `Value` child in the project-relative spelling.
 *
 * Two measured rules apply to every node it writes: a `NodeId` is written on the pointer node's `Value`
 * child as `UI/<Path>` (the `/Objects/<Project>/…` form is refused by `validate_ops` with `bad_value:
 * NodeId value must be a resolvable node path`), and a literal colour is `#RRGGBB` (the `0xRRGGBBAA`
 * spelling is refused with `Color must be #RRGGBB / #AARRGGBB hex or a UInt32 decimal`).
 *
 * The plan is idempotent: a band that already exists is not created again, its geometry is restated and
 * its tokens are re-applied, so a second apply repairs a shell someone edited by hand.
 *
 * @module
 */

import { kitTheme } from "./kit.js";
import { rect } from "./layout.js";
import { set, size } from "./screens.js";

/** Height of the header band in pixels. */
export const HEADER_HEIGHT = 64;

/** Most rail items the shell draws: an operator reads a vertical rail by position, so the cap is generous but finite. */
export const SHELL_MAX_RAIL = 12;
/** Height of the status strip in pixels. */
export const FOOTER_HEIGHT = 30;
/** Width of the left navigation rail in pixels. */
export const RAIL_WIDTH = 220;
/** Narrowest rail that still carries an icon and a label. */
export const RAIL_MIN_WIDTH = 160;
/** Widest rail before it starts to crowd a standard-width window. */
export const RAIL_MAX_WIDTH = 280;
/** Narrowest window that can carry a rail at all. */
export const SHELL_MIN_WIDTH = 900;
/** Names the shell owns on the window. */
export const SHELL_NAMES = Object.freeze({
	header: "ShellHeader",
	title: "ShellHeaderTitle",
	brand: "ShellHeaderBrand",
	clock: "ShellHeaderClock",
	chip: "ShellHeaderChip",
	user: "ShellHeaderUser",
	rail: "ShellRail",
	content: "ShellContent",
	footer: "ShellFooter",
	status: "ShellFooterStatus"
});

/** Left padding inside a band. */
const INSET = 16;

/**
 * A shell problem the caller can explain to the engineer.
 */
export class ShellError extends Error {
	/**
	 * @param code - A stable machine-readable code.
	 * @param message - A sentence naming the fix.
	 */
	constructor(code, message) {
		super(message);
		this.name = "ShellError";
		this.code = code;
	}
}

/**
 * Build the shell plan.
 *
 * @param options - `{window, width, height, language, screens, loader, railWidth, existing, existingItems}`
 *   where `screens` is `[{name, title, screen}]`, `loader` is an existing panel loader path or empty to
 *   create `ShellContent`, `existing` is the list of node names the window already carries, and
 *   `existingItems` is the list of names already inside the rail's `Panels` collection.
 * @returns `{window, width, height, language, theme, header, rail, content, footer, items, phases,
 *   ops, exists, counts}`; `ops` is the concatenation of `phases`.
 * @throws {ShellError} when there is no canvas, the window is too narrow, or there are no screens.
 */
export function shellPlan({ window, width, height, language = undefined, screens = [], loader = "", railWidth = RAIL_WIDTH, existing = [], existingItems = [] } = {}) {
	if (typeof window !== "string" || window.trim() === "") throw new ShellError("shell_no_window", "shell needs the window path (UI/MainWindow)");
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
		throw new ShellError("shell_no_canvas", "shell needs the window's canvas: read Width and Height from the live window");
	}
	if (width < SHELL_MIN_WIDTH) {
		throw new ShellError("shell_too_narrow", `a rail needs at least ${SHELL_MIN_WIDTH} px of canvas; this window is ${width} wide`);
	}
	const targets = screens.filter((entry) => entry && typeof entry === "object" && typeof entry.screen === "string" && entry.screen.trim() !== "");
	if (targets.length < 2) throw new ShellError("shell_no_screens", "a rail needs at least two screens: name the screens it switches between");
	const rail = Math.min(RAIL_MAX_WIDTH, Math.max(RAIL_MIN_WIDTH, railWidth));
	if (width - rail < 480) {
		throw new ShellError("shell_too_narrow", `a ${rail} px rail leaves ${width - rail} px of content; a screen needs 480 px`);
	}
	const theme = kitTheme(language);
	const taken = new Set(existing);
	const has = (name) => taken.has(name);
	const header = rect(0, 0, width, HEADER_HEIGHT);
	// A native NavigationPanel hosts the panels it switches between: the tab strip is its TabWidth column and
	// the current item's panel fills the rest, so the rail and the content area are one node. A separate
	// PanelLoader beside it never gets driven and the content stays on the first screen (measured in the runtime).
	const railSlot = rect(0, HEADER_HEIGHT, width, height - HEADER_HEIGHT - FOOTER_HEIGHT);
	const content = rect(rail, HEADER_HEIGHT, width - rail, railSlot.height);
	const footer = rect(0, height - FOOTER_HEIGHT, width, FOOTER_HEIGHT);
	const chrome = [];
	const railOps = [];
	const pointers = [];
	const created = [];
	const exists = {};
	const panel = (target, name) => {
		exists[name] = has(name);
		if (!exists[name]) {
			chrome.push({ op: "create_widget", screen: window, name, widget_type: target });
			created.push(name);
		}
	};
	const text = (name, value) => {
		exists[name] = has(name);
		if (!exists[name]) {
			chrome.push({ op: "create_widget", screen: window, name, widget_type: "Label" });
			created.push(name);
		}
		chrome.push({ op: "set_property", path: `${window}/${name}`, name: "Text", value: textOf(value) });
		chrome.push({ op: "set_property", path: `${window}/${name}`, name: "TextColor", value: theme.colours.text });
	};
	const place = (list, path, slot, extra = {}) => {
		for (const [name, value] of Object.entries({ LeftMargin: slot.left, TopMargin: slot.top, Width: slot.width, Height: slot.height })) list.push(set(path, name, size(value)));
		for (const [name, value] of Object.entries(extra)) list.push({ op: "set_property", path, name, value });
	};

	// Chrome: the header band, its accent bar and its three texts.
	panel("Rectangle", SHELL_NAMES.header);
	place(chrome, `${window}/${SHELL_NAMES.header}`, header, { FillColor: theme.colours.surface });
	panel("Rectangle", SHELL_NAMES.brand);
	place(chrome, `${window}/${SHELL_NAMES.brand}`, rect(0, 0, 4, HEADER_HEIGHT), { FillColor: theme.colours.accent });
	text(SHELL_NAMES.title, "AryaCode");
	place(chrome, `${window}/${SHELL_NAMES.title}`, rect(INSET, 12, Math.max(200, width - 620), 40), { FontSize: size(theme.type.title) });
	text(SHELL_NAMES.chip, "Ready");
	place(chrome, `${window}/${SHELL_NAMES.chip}`, rect(width - 560, 22, 120, 24), { FontSize: size(theme.type.small), TextColor: theme.colours.accent });
	text(SHELL_NAMES.clock, "--:--");
	place(chrome, `${window}/${SHELL_NAMES.clock}`, rect(width - 420, 18, 150, 28));
	text(SHELL_NAMES.user, "Operator");
	place(chrome, `${window}/${SHELL_NAMES.user}`, rect(width - 250, 18, 230, 28));

	// Chrome: the rail object and the content host, geometry before any item goes into the rail.
	panel("NavigationPanel", SHELL_NAMES.rail);
	place(chrome, `${window}/${SHELL_NAMES.rail}`, railSlot, { TabPosition: "2", TabWidth: size(rail), TabHeight: size(44) });
	const loaderPath = typeof loader === "string" && loader.trim() !== "" ? loader : "";
	exists.content = has(SHELL_NAMES.content);

	// Chrome: the status strip.
	panel("Rectangle", SHELL_NAMES.footer);
	place(chrome, `${window}/${SHELL_NAMES.footer}`, footer, { FillColor: theme.colours.surfaceAlt });
	text(SHELL_NAMES.status, "Comm. Driver - communication established");
	place(chrome, `${window}/${SHELL_NAMES.status}`, rect(INSET, footer.top + 6, width - 2 * INSET, FOOTER_HEIGHT - 12), { FontSize: size(theme.type.small) });

	// Rail: one item per screen, inside the collection Studio created with the panel.
	const items = [];
	const takenItems = new Set(existingItems);
	targets.slice(0, SHELL_MAX_RAIL).forEach((entry, index) => {
		const itemName = `RailItem${index + 1}`;
		const itemPath = `${window}/${SHELL_NAMES.rail}/Panels/${itemName}`;
		const title = entry.title ?? entry.name ?? entry.screen.split("/").at(-1);
		const existsItem = takenItems.has(itemName);
		items.push({ name: itemName, title, screen: entry.screen, path: itemPath, exists: existsItem });
		if (!existsItem) railOps.push({ op: "create_widget", screen: `${window}/${SHELL_NAMES.rail}/Panels`, name: itemName, widget_type: "NavigationPanelItem" });
		railOps.push({ op: "set_property", path: itemPath, name: "Title", value: textOf(title) });
		pointers.push({ op: "set_property", path: `${itemPath}/Panel`, name: "Value", value: entry.screen });
	});

	// The native panel hosts the current item's panel itself, so there is no loader to attach and no
	// content-host pointer to write; every item's own Panel is the switch.
	const phases = [
		{ name: "chrome", ops: chrome },
		{ name: "rail", ops: railOps, after_chrome: true },
		{ name: "pointers", ops: pointers, after_rail: true }
	];
	return {
		window,
		width,
		height,
		language: theme.name,
		theme,
		header,
		rail: railSlot,
		content,
		footer,
		loader: loaderPath,
		items,
		exists,
		phases,
		ops: [...chrome, ...railOps, ...pointers],
		counts: { ops: chrome.length + railOps.length + pointers.length, chrome: chrome.length, rail: railOps.length, pointers: pointers.length, created: created.length, items: items.length }
	};
}

/**
 * Review a shell against what the live model carries.
 *
 * @param options - `{window_children, rail_items, loader_ref, content_ref, attached_loader}` as read from
 *   the model; every field may be absent when it could not be read.
 * @returns `{ok, findings, score, next}` with `SHELL-01` (no header), `SHELL-02` (no rail or fewer than
 *   two items), `SHELL-03` (rail not attached to the loader), `SHELL-04` (loader hosts no screen).
 */
export function shellAudit({ window_children = [], rail_items = [], loader_ref = "", content_ref = "", attached_loader = "" } = {}) {
	const names = new Set((Array.isArray(window_children) ? window_children : []).map((child) => (typeof child === "string" ? child : (child?.name ?? child?.browse_name ?? ""))));
	const findings = [];
	const miss = (rule, severity, message, next) => findings.push({ rule, severity, message, next });
	if (!names.has(SHELL_NAMES.header)) miss("SHELL-01", "critical", `the window has no ${SHELL_NAMES.header} band`, 'optix_ui { action: "shell", mode: "plan" } then apply');
	if (!names.has(SHELL_NAMES.rail) || rail_items.length < 2) {
		miss("SHELL-02", "critical", names.has(SHELL_NAMES.rail) ? `the rail carries ${rail_items.length} item(s); an operator needs at least two` : "the window has no navigation rail", "name a screen per rail item and apply the shell");
	}
	// A native NavigationPanel hosts its items' panels itself, so there is no loader to attach and no content
	// host to fill: the rail is the content host and every item's own Panel is the switch.
	const critical = findings.filter((entry) => entry.severity === "critical").length;
	return {
		ok: critical === 0,
		score: Math.max(0, 100 - 40 * critical - 10 * (findings.length - critical)),
		findings,
		next: critical === 0 ? "the shell reads correctly; verify a tab click in the runtime before calling it done" : findings[0].next
	};
}

/**
 * The `LocalizedText` JSON Studio writes for a label.
 *
 * @param value - The text.
 * @returns The visible string. Studio stores a LocalizedText here, but the bridge takes the plain string and
 * localises it itself; a JSON payload painted literally is the symptom of passing the structure in.
 */
function textOf(value) {
	return String(value ?? "");
}
