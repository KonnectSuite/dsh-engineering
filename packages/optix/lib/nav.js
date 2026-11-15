/**
 * Typed navigation for an Optix window: plan the bar the shell owns, wire it, and prove it in the
 * running project. @module dsh-tool-ft-optix/nav
 *
 * Why a bar in the window and not a row in each screen: the runtime instantiates a UI object per
 * session, and a handler resolves its DynamicLink relative to the node that owns it. A button drawn
 * inside a panel sits one level deeper at run time (`UIRoot/<loader>/<panel>/<button>`) than in the
 * design tree (`<window>/<screen>/<button>`), so its loader path resolves to the design-time loader
 * and the runtime answers "No behaviour or observer found that handles the method 'ChangePanel' on
 * node Root/Objects/<project>/UI/MainWindow/MainLoader" (measured live 2026-11-14). A button that is
 * a SIBLING of the loader resolves the same way in both trees. Rockwell's own
 * `Optix_Sample_PanelLoaderChangePanelNetLogic` wires its window-level button exactly that way.
 *
 * Why the wiring is not trusted until a click is observed: a handler that compiles is not proof that
 * the runtime found it. `verifyNavigation` clicks the button in the served preview and reads the
 * loader's `Panel` back through the bridge, so the evidence is the panel that changed, not the
 * operation that was acknowledged.
 */

import { createHash } from "node:crypto";
import { SCREEN_METRICS, SCREEN_THEME, box, set, size } from "./screens.js";

/** One button height: the 44 px the HMI target rule reports as the minimum (HMI-TARGET-01). */
export const NAV_BUTTON_HEIGHT = 44;
/** Space between two buttons. */
export const NAV_GAP = 12;
/** Preferred button width; wider windows do not stretch a button past this. */
export const NAV_BUTTON_WIDTH = 200;
/** Narrowest button worth drawing; below this the plan refuses rather than clipping the label. */
export const NAV_MIN_BUTTON_WIDTH = 120;
/** Button caption size, matching the scaffold's button text. */
export const NAV_TEXT_SIZE = 13;
/**
 * Most buttons one bar may hold. The window has the whole canvas width, not a panel's body, so this
 * is higher than `MAX_NAV` (the in-screen row); past it the bar is not readable and the answer is a
 * menu, not a wider bar.
 */
export const NAV_MAX_BUTTONS = 6;
/** How long the runtime gets to repaint after a click before the panel is read. */
export const NAV_SETTLE_MS = 900;

/** Last segment of a project path. */
function tail(path) {
	const segments = String(path).split("/").filter((segment) => segment !== "");
	return segments.at(-1) ?? "";
}

/**
 * The BrowseName a target's button takes: `Nav_<screen name>`, the name every draft this plugin has
 * drawn already uses, so an existing bar is recognised and re-wired instead of duplicated.
 * @param target - Project path of the screen the button opens.
 * @returns A Logix/Studio-safe browse name.
 */
export function buttonName(target) {
	const name = tail(target).replace(/[^A-Za-z0-9_]/gu, "_");
	if (name === "") throw new Error(`no screen name in ${JSON.stringify(target)}: name the screen, for example UI/Screens/Home`);
	return `Nav_${name}`;
}

/**
 * Normalise the `targets` argument: resolve bare screen names under the screens folder, derive the
 * caption and the button name, and refuse two targets that would become one button.
 * @param input - Raw targets (`[{label, screen, name}]`) and the folder bare names resolve under.
 * @returns `[{ name, label, screen }]` in the order the operator gave them.
 */
export function navTargets({ targets, screensFolder = "UI/Screens" } = {}) {
	if (!Array.isArray(targets) || targets.length === 0) {
		throw new Error("name at least one target: [{ label, screen }] where screen is a project path such as UI/Screens/Home");
	}
	const folder = String(screensFolder ?? "UI/Screens").replace(/\/+$/u, "");
	const resolved = [];
	const seen = new Set();
	targets.forEach((entry, index) => {
		if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
			throw new Error(`target ${index + 1} must be an object: { label, screen }`);
		}
		const raw = typeof entry.screen === "string" ? entry.screen.trim() : "";
		if (raw === "") throw new Error(`target ${index + 1} needs screen: a project path such as UI/Screens/Home`);
		const screen = raw.includes("/") ? raw.replace(/^\/+/u, "") : `${folder}/${raw}`;
		const name = typeof entry.name === "string" && entry.name.trim() !== "" ? entry.name.trim() : buttonName(screen);
		if (seen.has(name)) {
			throw new Error(`two targets both become ${name}: give one an explicit name, because a window cannot hold two siblings with one browse name`);
		}
		seen.add(name);
		const label = typeof entry.label === "string" && entry.label.trim() !== "" ? entry.label.trim() : tail(screen);
		resolved.push({ name, label, screen });
	});
	return resolved;
}

/**
 * Lay a navigation bar into the window's own body: the band the scaffold reserves above the footer.
 * Pure arithmetic - it reads no model, so a plan can be reviewed before anything is written.
 * @param input - Window path and canvas, resolved targets, the window's current children, theme.
 * @returns The bar rectangle, the buttons with their slots and whether each already exists.
 * @throws Error when the window is too small or too narrow for the buttons it is asked to hold.
 */
export function planBar(input) {
	const { window = "", width, height, targets, existing = [], theme: overrides = {} } = input ?? {};
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		throw new Error("planBar needs the window width and height in pixels; read them from the window's Width and Height properties");
	}
	if (!Array.isArray(targets) || targets.length === 0) {
		throw new Error("name at least one target: [{ label, screen }] where screen is a project path such as UI/Screens/Home");
	}
	if (targets.length > NAV_MAX_BUTTONS) {
		throw new Error(`${targets.length} navigation buttons exceed the ${NAV_MAX_BUTTONS} a bar holds at ${NAV_MIN_BUTTON_WIDTH}px: use a menu, or split the bar into two rows`);
	}
	const { PAD, HEADER, FOOTER, NAV } = SCREEN_METRICS;
	const bar = { left: PAD, top: height - FOOTER - PAD - NAV, width: width - PAD * 2, height: NAV };
	if (bar.width <= 0) {
		throw new Error(`window ${width}x${height} is narrower than two ${PAD}px margins`);
	}
	if (bar.top < HEADER + 48) {
		throw new Error(`window ${width}x${height} leaves ${bar.top}px above the footer and the header ends at ${HEADER}px: there is no room for a navigation band, so enlarge the window or move the bar with a hand-authored layout`);
	}
	const available = bar.width - NAV_GAP * (targets.length - 1);
	const buttonWidth = Math.min(NAV_BUTTON_WIDTH, Math.floor(available / targets.length));
	if (buttonWidth < NAV_MIN_BUTTON_WIDTH) {
		throw new Error(`${targets.length} buttons need at least ${targets.length * NAV_MIN_BUTTON_WIDTH + NAV_GAP * (targets.length - 1)}px and the bar is ${bar.width}px wide: drop a target or enlarge the window`);
	}
	const buttons = targets.map((entry, index) => ({
		...entry,
		path: `${window === "" ? "<window>" : window}/${entry.name}`,
		slot: {
			left: bar.left + index * (buttonWidth + NAV_GAP),
			top: bar.top + 6,
			width: buttonWidth,
			height: NAV_BUTTON_HEIGHT
		},
		exists: Array.isArray(existing) && existing.includes(entry.name),
		wired: false
	}));
	return { window, width, height, theme: { ...SCREEN_THEME, ...overrides }, bar, buttons };
}

/**
 * The one wiring operation a button needs.
 *
 * `object_raw` is the loader as a path relative to the button's parent, and `method_path` is the
 * loader's own project path; the bridge prefixes the pointer with the levels between the
 * ObjectPointer and the button, and it clears the absolute design-time NodeId the pointer still
 * carries, which is the value the runtime resolves first and fails on.
 * @param input - Window path, button name, loader project path and the screen it opens.
 * @returns One `wire_event` operation.
 */
export function wireOp({ window, name, loader, target }) {
	const loaderPath = String(loader ?? "").replace(/\/+$/u, "");
	if (loaderPath === "") throw new Error("a navigation button is wired to a PanelLoader: name the loader");
	if (tail(name) === "") throw new Error("wireOp needs the button name");
	return {
		op: "wire_event",
		path: `${window}/${name}`,
		event_type: "MouseClickEvent",
		method_path: `${loaderPath}/ChangePanel`,
		object_raw: `../${tail(loaderPath)}`,
		args: `NewPanel=${target};AliasNode=`
	};
}

/**
 * The operations one apply batch needs: create the missing buttons, restate the geometry and the
 * colours of all of them, and wire the ones that carry no handler yet.
 *
 * Restating properties makes a second apply a no-op rather than a duplicate, and only buttons without
 * a handler child are wired, because a second `wire_event` would add a second `EventHandler`.
 * @param plan - Result of `planBar`.
 * @param input - Window path, loader path, the names already wired, and a theme override.
 * @returns `{ ops, wiring }` - the batch and the subset that wires.
 */
export function planOps(plan, { window = "", loader, wired = new Set(), theme } = {}) {
	const windowPath = String(window === "" ? plan?.window ?? "" : window).trim();
	if (windowPath === "") throw new Error("planOps needs the window path");
	const colors = { ...plan.theme, ...(theme ?? {}) };
	const ops = [];
	const wiring = [];
	for (const button of plan.buttons) {
		if (!button.exists) ops.push({ op: "create_widget", screen: windowPath, name: button.name, widget_type: "Button" });
		ops.push(...box(button.path, button.slot));
		ops.push(
			set(button.path, "Text", button.label),
			set(button.path, "BackgroundColor", colors.footer),
			set(button.path, "TextColor", colors.footerText),
			set(button.path, "FontSize", size(NAV_TEXT_SIZE))
		);
		if (wired.has(button.name)) continue;
		const op = wireOp({ window: windowPath, name: button.name, loader, target: button.screen });
		ops.push(op);
		wiring.push(op);
	}
	return { ops, wiring };
}

/**
 * The child that makes a button live: the bridge names an event handler `EH_<event>_<button>`, and a
 * Studio-authored one carries `EventHandler` as its type. Either is evidence the wiring is present.
 * @param children - `children` from the bridge's `nodes` reply for the button.
 * @returns The handler child, or undefined.
 */
export function handlerChild(children = []) {
	return (children ?? []).find((child) => {
		const type = String(child?.dotnet_type ?? child?.type ?? child?.coll ?? "");
		const name = String(child?.browse_name ?? child?.name ?? "");
		return type === "EventHandler" || type.endsWith("EventHandler") || name.startsWith("EH_");
	});
}

/**
 * The loader's current panel, from the bridge's `nodes` reply for the loader.
 *
 * A `NodeId` property whose pointer has no value is rendered by the bridge the way Studio's property grid
 * renders it - `(Null)` - which is not a screen name; that is reported as unreadable instead of as a panel.
 * `CurrentPanel` is read when `Panel` carries nothing, because the runtime fills it with the displayed one.
 * @param nodesReply - Reply to `GET /bridge/nodes?path=<loader>`.
 * @returns The property value as a string, or `""` when the bridge did not report one.
 */
export function panelProperty(nodesReply) {
	const properties = nodesReply?.properties ?? [];
	const read = (name) => {
		const found = properties.find((entry) => String(entry?.name ?? "") === name);
		const value = String(found?.value ?? "").trim();
		return /^\(\s*null\s*\)$/iu.test(value) ? "" : value;
	};
	const panel = read("Panel");
	if (panel !== "") return panel;
	return read("CurrentPanel");
}

/**
 * A button's live rectangle, from the bridge's `nodes` reply for that button.
 *
 * A plan computes slots from geometry, but a bar the engineer later dragged has to be clicked where the
 * model says the button is, not where the plan would have put it. Verify reads the four margin properties
 * back through this, so a moved button is clicked at its real centre.
 * @param nodesReply - Reply to `GET /bridge/nodes?path=<window>/<button>`.
 * @param fallback - The planned slot to keep when a property is not reported.
 * @returns `{ left, top, width, height }` in canvas pixels.
 */
export function buttonSlot(nodesReply, fallback) {
	const read = (name) => {
		const property = (nodesReply?.properties ?? []).find((entry) => String(entry?.name ?? "") === name);
		const hit = /^(-?\d+(?:\.\d+)?)/u.exec(String(property?.value ?? ""));
		return hit === null ? void 0 : Math.round(Number(hit[1]));
	};
	const left = read("LeftMargin");
	const top = read("TopMargin");
	const width = read("Width");
	const height = read("Height");
	if (left === void 0 || top === void 0 || width === void 0 || height === void 0) return fallback;
	return { left, top, width, height };
}

/**
 * Whether a `Panel` value names the screen a button should open.
 *
 * The value is whatever the bridge renders for a NodePointer: usually a project path, sometimes an
 * opaque `ns=3;s=...` or `g=<guid>` node id. An opaque value is not evidence either way, so it
 * answers false and the caller reports the click as unverified rather than passing it.
 * @param value - Panel property value read back from the model.
 * @param target - Project path of the screen the button opens.
 * @returns True only when the value is readable and names that screen.
 */
export function panelOpens(value, target) {
	const text = String(value ?? "").trim();
	if (text === "") return false;
	const wanted = String(target ?? "").replace(/^\/+|\/+$/gu, "");
	if (wanted === "") return false;
	if (text === wanted || text.endsWith(`/${wanted}`)) return true;
	if (/^(ns=\d+;s=|g=)/u.test(text)) return false;
	return tail(text) === tail(wanted);
}

/** SHA-256 of one screenshot, used to tell a repaint from a click that landed on nothing. */
async function screenshotHash(page) {
	const bytes = await page.screenshot({ type: "png" });
	return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Open a headless page on the served preview at the window's own size, so model pixels and viewport
 * pixels are the same number and a slot centre is a click point.
 *
 * The click is scripted on purpose: `optix_preview` is the interactive reader, this is the prover.
 * Nothing here needs the engineer's browser, a desktop session, or a foreground window.
 * @param config - Resolved plugin settings (`previewUrl`, `browserChannel`, `browserPath`,
 * `requestTimeoutMs`).
 * @param input - Viewport size, settle time and abort signal.
 * @returns `{ browser, page }`; the caller closes the browser.
 */
export async function launchRuntimePage(config, { width, height, settleMs = NAV_SETTLE_MS, signal } = {}) {
	const { chromium } = await import("playwright-core");
	const channels = config.browserChannel === "auto" ? ["chrome", "msedge"] : [config.browserChannel];
	let browser;
	let failure;
	if (typeof config.browserPath === "string" && config.browserPath !== "") {
		browser = await chromium.launch({ headless: true, executablePath: config.browserPath });
	} else {
		for (const channel of channels) {
			try {
				browser = await chromium.launch({ headless: true, channel });
				break;
			} catch (error) {
				failure = error;
			}
		}
	}
	if (browser === undefined) {
		throw new Error(`could not start a headless browser for the navigation proof: ${String(failure)}; set browserChannel to chrome or msedge, or browserPath to the executable`);
	}
	signal?.throwIfAborted();
	const context = await browser.newContext({ viewport: { width: Math.round(width), height: Math.round(height) }, deviceScaleFactor: 1 });
	const page = await context.newPage();
	await page.goto(config.previewUrl, { timeout: config.requestTimeoutMs, waitUntil: "load" });
	await page.waitForTimeout(settleMs);
	return { browser, page };
}

/**
 * Read the served page's own text, which is the runtime-side evidence a bridge cannot give.
 * @param page - Page from `launchRuntimePage`.
 * @returns The visible text, or `""` when the page exposes none.
 */
export async function pageText(page) {
	try {
		return String(await page.evaluate(() => document.body?.innerText ?? "") ?? "");
	} catch {
		return "";
	}
}

/** Letters and digits only, upper-cased, so `Alarm Summary` and `ALARM_SUMMARY` compare equal. */
function nameKey(value) {
	return String(value ?? "").replace(/[^0-9a-z]+/giu, "").toUpperCase();
}

/** Does one line of the served page name this button's screen? */
function lineNamesScreen(line, button) {
	const key = nameKey(line);
	if (key === "") return false;
	for (const name of [button.screen, button.label]) {
		const wanted = nameKey(String(name ?? "").split("/").pop() ?? "");
		if (wanted !== "" && key.includes(wanted)) return true;
	}
	return false;
}

/** The first non-empty line of the served page - a screen's title is the usual first line. */
function firstLine(text) {
	return String(text ?? "").split(/\r?\n/u).map((line) => line.trim()).find((line) => line !== "") ?? "";
}

/** Which of the planned buttons is already open, judged by the page's first line when the panel is unreadable. */
function screenFromText(text, buttons) {
	const line = firstLine(text);
	if (line === "") return "";
	const hit = buttons.find((button) => lineNamesScreen(line, button));
	return hit === void 0 ? "" : hit.screen;
}

/** Lines visible after the click that were not visible before it, so a constant nav label never counts. */
function addedLines(before, after) {
	const seen = new Set(String(before ?? "").split(/\r?\n/u).map((line) => line.trim()));
	return String(after ?? "").split(/\r?\n/u).map((line) => line.trim()).filter((line) => line !== "" && !seen.has(line));
}

/**
 * Click each button in the running project and report what opened.
 *
 * Two proofs are accepted, strongest first: the loader's `Panel` read back through the bridge, and the served
 * page naming the target on a line that was not on screen before the click (the bridge cannot report a `NodeId`
 * property on this version). A repaint alone is reported as evidence and never counted as a pass, and a nav bar
 * always shows its labels, so a name that was already visible is not proof either.
 * @param input - Page, planned buttons, a `panel()` reader, settle time, abort signal and overrides for tests.
 * @returns One row per button: the click point, both proofs, and whether the button is proven.
 */
export async function verifyNavigation({ page, buttons, panel, settleMs = NAV_SETTLE_MS, signal, hashPage = screenshotHash, readText = pageText } = {}) {
	if (page === void 0) throw new Error("verifyNavigation needs a page from launchRuntimePage");
	if (!Array.isArray(buttons) || buttons.length === 0) throw new Error("verifyNavigation needs at least one planned button");
	if (typeof panel !== "function") throw new Error("verifyNavigation needs a panel() reader: the loader's Panel value from the bridge");
	const pending = [...buttons];
	const rows = [];
	const read = async () => {
		try {
			return String(await readText(page) ?? "");
		} catch {
			return "";
		}
	};
	let text = await read();
	let current = String(await panel() ?? "");
	if (current === "") current = screenFromText(text, buttons);
	while (pending.length > 0) {
		signal?.throwIfAborted();
		const openIndex = pending.findIndex((button) => !panelOpens(current, button.screen));
		const button = openIndex === -1 ? pending.shift() : pending.splice(openIndex, 1)[0];
		if (button === undefined) break;
		const before = current;
		const textBefore = text;
		const hashBefore = await hashPage(page);
		const x = Math.round(button.slot.left + button.slot.width / 2);
		const y = Math.round(button.slot.top + button.slot.height / 2);
		await page.mouse.click(x, y);
		await page.waitForTimeout(settleMs);
		const after = String(await panel() ?? "");
		const textAfter = await read();
		const hashAfter = await hashPage(page);
		const opened = panelOpens(after, button.screen);
		const names = addedLines(textBefore, textAfter).some((line) => lineNamesScreen(line, button));
		const screenAfter = after !== "" ? after : names ? button.screen : before;
		rows.push({
			button: button.path,
			label: button.label,
			target: button.screen,
			click: { x, y },
			screen_before: before,
			screen_after: screenAfter,
			panel_after: after,
			panel_read: after !== "",
			opened,
			page_names_target: names,
			proven_by: opened ? "panel" : names ? "page text" : "",
			screen_changed: hashBefore !== hashAfter,
			ok: opened || names
		});
		current = screenAfter;
		text = textAfter;
	}
	const proven = rows.filter((row) => row.ok).length;
	const repaintOnly = rows.filter((row) => !row.ok && row.screen_changed).length;
	return {
		rows,
		clicked: rows.length,
		proven,
		failed: rows.filter((row) => !row.ok).length,
		unverified: rows.filter((row) => !row.ok).length,
		repaint_only: repaintOnly,
		proven_by: [...new Set(rows.map((row) => row.proven_by).filter((value) => value !== ""))],
		status: proven === rows.length ? "verified" : proven > 0 || repaintOnly > 0 ? "partial" : "unverified"
	};
}

/**
 * Turn the verify result into the sentence an operator needs next.
 * @param result - Return value of `verifyNavigation`.
 * @returns The next step, naming the failure that actually occurred.
 */
export function verifyNext(result) {
	if (result.status === "verified") {
		const how = (result.proven_by ?? []).includes("page text") ? "the served page named each target after its click" : "the loader reported each screen";
		return `Every button opened its screen in the running project - ${how}. Save and Build in Studio before release, because the bridge authored the model but only Studio writes the file the runtime loads.`;
	}
	const dead = result.rows.filter((row) => !row.ok).map((row) => row.button);
	if (dead.length > 0 && result.rows.some((row) => row.ok)) {
		return `These buttons did not open their screen: ${dead.join(", ")}. Read the handler back with optix_production_check (OPTIX-PROD-01 is an absolute design-time pointer the runtime resolves first), then run optix_nav action plan again - the runtime is serving the saved project, so a Studio Save and Build may simply not have happened.`;
	}
	if (dead.length > 0 && (result.proven ?? 0) === 0 && (result.repaint_only ?? 0) > 0) {
		return "The clicks changed the page but nothing named the target screen, and the bridge did not report the loader's Panel value: click the buttons in optix_preview with allowPreviewInput and read the screen in Studio before calling the bar wired.";
	}
	if (dead.length > 0) {
		return `These buttons had no visible effect: ${dead.join(", ")}. Check that the bar is inside the window canvas with optix_nav action plan, then Save and Build in Studio and run action verify again.`;
	}
	return "No button was clicked: check that the window holds the bar with optix_nav action plan, then Save and Build in Studio and run action verify again.";
}
