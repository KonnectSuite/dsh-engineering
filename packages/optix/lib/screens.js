/** Lay out an Optix screen as an `optix_edit` batch, without a Studio session. @module dsh-tool-ft-optix/screens */
/**
 * The Optix half of the same screen grammar `packages/ftview/src/edit` uses: the same slots, the same
 * refusals, and the same palette apart from the header band, which `SCREEN_THEME` explains. A screen
 * designed for a PanelView and a screen designed for Optix come out of one set of numbers.
 *
 * What differs is the target. FTView writes attribute maps into a display export; Optix has no such
 * file, so this module emits operations the bridge already serves. Every widget type and every
 * property name here is one the shipped libraries or the installed reference actually use:
 * `Rectangle`, `Label`, `Button` and `Screen` appear as `Type:`/`Supertype:` in
 * `<Studio>/Files/Libraries/**`, and `LeftMargin`, `TopMargin`, `Width`, `Height`, `FillColor`,
 * `BorderColor`, `CornerRadius`, `Text`, `FontSize`, `FontWeight` and `TextColor` are declared by
 * `Help/en/Reference/FTOptix-UI/ObjectTypes/{Label,Button}.html` and by the starter projects' own YAML.
 */
/** Outer padding of the body area. */
const PAD = 24;
/** Header band height. */
const HEADER = 88;
/** Footer band height. */
const FOOTER = 56;
/** Gap between cards and around the navigation row. */
const GAP = 20;
/** Inner padding of a card. */
const CARD_PAD = 14;
/** Height of one row inside a card. */
const ROW = 36;
/** Navigation row height. */
const NAV = 56;
/** Most cards one screen may describe. */
export const MAX_CARDS = 4;
/** Most navigation buttons one row may hold. */
export const MAX_NAV = 4;
/** Default caption of the footer line, matching the FTView scaffold's. */
export const DEFAULT_FOOTER = "AryaCode · FactoryTalk Optix";
/**
 * The palette the scaffold draws with.
 *
 * These are the colors the FTView scaffold uses, because they are the ones the design checks were
 * calibrated against. A project that already carries one of the StyleSheets Studio ships
 * (`FriendlyLight`, `FriendlyDark`, `MaterialDark`, `ISAStyleSheet`) should import it with
 * `optix_library` and point the presentation engine at it instead of inheriting this set; the shipped
 * sheets carry the same decisions as real properties, including a `FontPixelSize` the label styles
 * scale from.
 */
export const SCREEN_THEME = {
	backdrop: "#0E1A24",
	// The one place this port diverges from the FTView scaffold, and the design check is the reason.
	// White title text on the View header band #0088C8 measures 3.92:1 and the subtitle's #CFE0EA
	// measures 2.89:1, both under the 4.5:1 the check reports as HMI-CONTRAST-01: a scaffold that
	// trips its own rule is not a quality baseline. #005D8A is the same blue family at 7.16:1 for the
	// title and 5.29:1 for the subtitle. FTView's own band stays #0088C8 because its check compares a
	// text object's own fore and back attributes and cannot see a band behind it; Optix reports the
	// fill behind the text, so the same palette is measurable here.
	header: "#005D8A",
	surface: "#13232F",
	footer: "#143243",
	title: "#FFFFFF",
	footerText: "#CFE0EA",
	cardBorder: "#2C4557",
	valueFore: "#E2E8F0",
	lampOn: "#30A46C",
	lampOff: "#E5484D",
};
/**
 * @typedef {object} Slot
 * @property {number} left
 * @property {number} top
 * @property {number} width
 * @property {number} height
 */
/**
 * @typedef {object} ScreenCardRow
 * @property {string} label - Row caption.
 * @property {"value"|"lamp"} kind - A readout or a two-state indicator.
 * @property {string} tag - Model variable path the readout or indicator follows.
 */
/**
 * @typedef {object} ScreenCard
 * @property {string} title
 * @property {readonly ScreenCardRow[]} rows
 */
/**
 * @typedef {object} ScreenNav
 * @property {string} label - Button caption.
 * @property {string} target - Screen or panel the button should open.
 */
/**
 * @typedef {object} ScreenSpec
 * @property {string} name - Screen name; becomes the ScreenType's BrowseName.
 * @property {number} [width] - Design width, defaulting to the 1280 the starter Window declares.
 * @property {number} [height] - Design height, defaulting to the 800 the starter Window declares.
 * @property {string} [title]
 * @property {string} [subtitle]
 * @property {string} [footer]
 * @property {readonly ScreenCard[]} [cards]
 * @property {readonly ScreenNav[]} [nav]
 * @property {Partial<typeof SCREEN_THEME>} [theme]
 * @property {string} [screens_folder] - Where the ScreenType is created, default `UI/Screens`.
 * @property {string} [panel_loader] - Live PanelLoader path; needed only when navigation is wired.
 */
/** A `Size` value spelled the way the shipped YAML spells it. */
function size(value) {
	return `${Math.round(value)}.0`;
}
/**
 * A CSS colour as the `0xAARRGGBB` uint an ExpressionEvaluator expects.
 *
 * `#RRGGBB` is opaque, so the alpha byte is FF. An eight-digit `#AARRGGBB` keeps its own alpha. The
 * expression evaluator silently no-ops on a `"#RRGGBB"` string, which is why `optix_validate_expression`
 * and the bridge both reject one (measured live against bridge 1.0.9, 2026-11-14).
 */
function colorUint(hex) {
	const digits = String(hex).replace(/^#/, "");
	return digits.length === 8 ? `0x${digits.toUpperCase()}` : `0xFF${digits.toUpperCase()}`;
}
/**
 * The lamp formula: one Boolean source in, two uint colours out.
 *
 * The evaluator's conditionals are `if(cond, a, b)` — `IIF` is not a function it knows, and the bridge's
 * `expr/validate` refuses a formula that names one. Verified live against bridge 1.0.9 on 2026-11-14:
 * `if({0}, 0xFF30A46C, 0xFFE5484D)` validates with one source, `IIF({0}, ...)` does not.
 */
function lampExpression(theme) {
	return `if({0}, ${colorUint(theme.lampOn)}, ${colorUint(theme.lampOff)})`;
}
/** One `set_property` operation. */
function set(path, name, value) {
	return { op: "set_property", path, name, value };
}
/** Geometry every UI widget carries, as four operations. */
function box(path, slot) {
	return [
		set(path, "LeftMargin", size(slot.left)),
		set(path, "TopMargin", size(slot.top)),
		set(path, "Width", size(slot.width)),
		set(path, "Height", size(slot.height)),
	];
}
/** A filled rectangle: the only shape needed for bands, cards and lamps. */
function rectangle(parent, name, slot, fill, border) {
	const path = `${parent}/${name}`;
	const ops = [{ op: "create_widget", screen: parent, name, widget_type: "Rectangle" }, ...box(path, slot), set(path, "FillColor", fill)];
	if (border !== undefined) ops.push(set(path, "BorderColor", border), set(path, "CornerRadius", "8.0"));
	return { path, ops };
}
/** A text label. Optix labels carry `TextColor`, not a background, so chrome is a sibling rectangle. */
function label(parent, name, slot, text, theme, fontSize, color, bold) {
	const path = `${parent}/${name}`;
	const ops = [
		{ op: "create_widget", screen: parent, name, widget_type: "Label" },
		...box(path, slot),
		set(path, "Text", text),
		set(path, "FontSize", size(fontSize)),
		set(path, "TextColor", color),
	];
	if (bold === true) ops.push(set(path, "FontWeight", "700"));
	return { path, ops };
}
/**
 * Lay out the fixed chrome: backdrop, header band, title, subtitle, content surface, footer band, footer line.
 *
 * @param spec - Width, height, title, subtitle, footer and theme.
 * @returns The parent path, the operations in creation order, and the free boxes.
 * @throws Error when the display is too small to scaffold at all.
 */
export function scaffoldOps(spec) {
	const width = spec.width;
	const height = spec.height;
	if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error("a screen needs a width and a height in pixels");
	if (width < 200 || height < 150) throw new Error(`display ${width}x${height} is too small for a scaffold`);
	const theme = { ...SCREEN_THEME, ...(spec.theme ?? {}) };
	const inner = width - PAD * 2;
	const body = { left: PAD, top: HEADER + PAD, width: inner, height: height - HEADER - FOOTER - PAD * 2 };
	if (body.height < 60) throw new Error(`display ${width}x${height} leaves no room for content below the header and footer`);
	const slots = {
		backdrop: { left: 0, top: 0, width, height },
		header: { left: 0, top: 0, width, height: HEADER },
		title: { left: PAD, top: 16, width: inner, height: 34 },
		subtitle: { left: PAD, top: 52, width: inner, height: 22 },
		body,
		footer: { left: 0, top: height - FOOTER, width, height: FOOTER },
		footerText: { left: PAD, top: height - FOOTER + 16, width: inner, height: 24 },
	};
	const parent = `${spec.screens_folder ?? "UI/Screens"}/${spec.name}`;
	const ops = [{ op: "create_widget", screen: spec.screens_folder ?? "UI/Screens", name: spec.name, widget_type: "Screen" }];
	const objects = [{ path: parent, kind: "Screen" }];
	const chrome = (name, kind) => objects.push({ path: `${parent}/${name}`, kind });
	ops.push(...rectangle(parent, "Backdrop", slots.backdrop, theme.backdrop).ops);
	chrome("Backdrop", "Rectangle");
	ops.push(...rectangle(parent, "HeaderBar", slots.header, theme.header).ops);
	chrome("HeaderBar", "Rectangle");
	ops.push(...label(parent, "Title", slots.title, spec.title ?? spec.name, theme, 22, theme.title, true).ops);
	chrome("Title", "Label");
	if (spec.subtitle !== undefined && spec.subtitle !== "") {
		ops.push(...label(parent, "Subtitle", slots.subtitle, spec.subtitle, theme, 12, theme.footerText, false).ops);
		chrome("Subtitle", "Label");
	}
	ops.push(...rectangle(parent, "ContentSurface", slots.body, theme.surface).ops);
	chrome("ContentSurface", "Rectangle");
	ops.push(...rectangle(parent, "FooterBar", slots.footer, theme.footer).ops);
	chrome("FooterBar", "Rectangle");
	ops.push(...label(parent, "FooterText", slots.footerText, spec.footer ?? DEFAULT_FOOTER, theme, 11, theme.footerText, false).ops);
	chrome("FooterText", "Label");
	// The chrome is reported alongside the content: a draft that lists only the cards hides the seven
	// objects the screen is actually made of, and the design check is run against the whole screen.
	return { parent, ops, slots, theme, objects };
}
/**
 * Lay out a whole screen and emit it as one operation batch.
 *
 * The batch is ordered so a parent is always created before its children, which the bridge's batch
 * validator requires: its hypothetical model only resolves forward references inside a single call, so
 * a chunked batch reports `unresolved_parent` for every child.
 *
 * @param spec - The screen description.
 * @returns The operations, the free boxes, the object paths, and the expressions worth validating.
 * @throws Error when the description cannot fit the display.
 */
/**
 * The operations that make a finished screen visible, or nothing when there is nothing to do.
 *
 * A window renders only its own children, and both packaged starters ship a window with none, so a screen
 * that nothing loads is a screen no render ever shows: measured live on 2026-11-14, a screen with 18
 * objects was authored into a starter and the preview stayed a flat white 1920x1080 frame. This plans one
 * PanelLoader in the start window, at the canvas origin and canvas size, with its `Panel` pointer written
 * as a literal NodePath (the raw form, because the target is an ObjectType and a `DynamicLink` to a type is
 * unresolvable at bind time - the bridge answers `source_not_variable`).
 *
 * That literal has to be the path the runtime resolves. Measured live: `UI/Screens/LineOverview` left the
 * pointer red and unresolved in Studio, because a bare path is read relative to the loader's own parent;
 * Studio writes project-absolute links (`/Objects/<project>/@BrowseName`), so the pointer is written that
 * way whenever the project name is known, and falls back to a relative `../...` path when it is not.
 * @param spec - `window`, `loader` name, `screen` path, `width`, `height`, the children already there, and
 * the project browse name when the caller knows it.
 * @returns {{ ops: object[], mounted: object } | undefined} the plan, or undefined when it cannot apply.
 */
export function mountOps(spec) {
	if (!spec.window || !spec.screen || !spec.loader) return undefined;
	if ((spec.children ?? []).includes(spec.loader)) return undefined;
	const loaderPath = `${spec.window}/${spec.loader}`;
	const width = size(spec.width ?? 1920);
	const height = size(spec.height ?? 1080);
	const target = spec.project ? `/Objects/${spec.project}/${spec.screen}` : relativeLink(spec.window, spec.screen);
	return {
		ops: [
			{ op: "create_widget", screen: spec.window, name: spec.loader, widget_type: "PanelLoader" },
			set(loaderPath, "LeftMargin", size(0)),
			set(loaderPath, "TopMargin", size(0)),
			set(loaderPath, "Width", width),
			set(loaderPath, "Height", height),
			{ op: "bind", path: loaderPath, name: "Panel", raw_path: target, mode: "ReadWrite" },
		],
		mounted: {
			loader: loaderPath,
			panel: spec.screen,
			link: target,
			canvas: { width: spec.width ?? 1920, height: spec.height ?? 1080 },
		},
	};
}
/**
 * The form of a NodePath a DynamicLink resolves, from the node that owns it to another node.
 *
 * A DynamicLink value is read relative to the owner's parent, so a sibling folder needs one `..` per level
 * below the shared ancestor. Used only when the project name is unknown: an absolute `/Objects/...` path is
 * what Studio itself writes.
 * @param from - Project-relative path of the node holding the link.
 * @param target - Project-relative path of the node the link must reach.
 * @returns The relative path, for example `../Screens/LineOverview`.
 */
function relativeLink(from, target) {
	const source = from.split("/").filter((segment) => segment !== "");
	const goal = target.split("/").filter((segment) => segment !== "");
	let shared = 0;
	while (shared < source.length && shared < goal.length && source[shared] === goal[shared]) shared += 1;
	const up = source.length - shared;
	return `${"../".repeat(up)}${goal.slice(shared).join("/")}`;
}
export function screenOps(spec) {
	const scaffold = scaffoldOps(spec);
	const { parent, slots, theme } = scaffold;
	const ops = [...scaffold.ops];
	const cards = spec.cards ?? [];
	const nav = spec.nav ?? [];
	if (cards.length > MAX_CARDS) throw new Error(`${cards.length} cards exceed the ${MAX_CARDS} this layout holds`);
	if (nav.length > MAX_NAV) throw new Error(`${nav.length} navigation buttons exceed the ${MAX_NAV} this layout holds`);
	if (cards.length === 0 && nav.length === 0) throw new Error("describe at least one card or one navigation button");
	const objects = [...scaffold.objects];
	const cardSlots = [];
	const expressions = [];
	const navSlot = nav.length === 0 ? undefined : { left: slots.body.left, top: slots.body.top + slots.body.height - NAV, width: slots.body.width, height: NAV };
	const usable = navSlot === undefined ? slots.body.height : slots.body.height - NAV - GAP;
	const columns = cards.length <= 1 ? 1 : 2;
	const rowsOfCards = cards.length === 0 ? 0 : Math.ceil(cards.length / columns);
	const cardWidth = cards.length === 0 ? 0 : Math.floor((slots.body.width - GAP * (columns - 1)) / columns);
	const cardHeight = rowsOfCards === 0 ? 0 : Math.floor((usable - GAP * (rowsOfCards - 1)) / rowsOfCards);
	if (cards.length > 0 && (cardWidth < 180 || cardHeight < 120)) {
		throw new Error(`display ${spec.width}x${spec.height} leaves no room for ${cards.length} card(s) at a readable size`);
	}
	cards.forEach((card, index) => {
		const slot = {
			left: slots.body.left + (index % columns) * (cardWidth + GAP),
			top: slots.body.top + Math.floor(index / columns) * (cardHeight + GAP),
			width: cardWidth,
			height: cardHeight,
		};
		cardSlots.push(slot);
		const name = `Card${index + 1}`;
		const panel = rectangle(parent, name, slot, theme.surface, theme.cardBorder);
		ops.push(...panel.ops);
		objects.push({ path: panel.path, kind: "Rectangle" });
		const title = label(parent, `${name}Title`, { left: slot.left + CARD_PAD, top: slot.top + 12, width: slot.width - CARD_PAD * 2, height: 22 }, card.title, theme, 13, theme.title, true);
		ops.push(...title.ops);
		objects.push({ path: title.path, kind: "Label" });
		const rowTop = slot.top + 44;
		const labelWidth = Math.floor((slot.width - CARD_PAD * 2) * 0.45);
		const valueLeft = slot.left + CARD_PAD + labelWidth;
		const valueWidth = slot.width - CARD_PAD * 2 - labelWidth;
		(card.rows ?? []).forEach((item, rowIndex) => {
			const top = rowTop + rowIndex * ROW;
			if (top + ROW > slot.top + slot.height) throw new Error(`card ${JSON.stringify(card.title)} has more rows than fit: ${card.rows.length}`);
			const caption = label(parent, `${name}Row${rowIndex + 1}Label`, { left: slot.left + CARD_PAD, top, width: labelWidth, height: ROW - 6 }, item.label, theme, 11, theme.footerText, false);
			ops.push(...caption.ops);
			objects.push({ path: caption.path, kind: "Label" });
			if (item.kind === "lamp") {
				const lamp = rectangle(parent, `${name}Row${rowIndex + 1}Lamp`, { left: valueLeft + 8, top: top + 4, width: 26, height: 26 }, theme.lampOff);
				ops.push(...lamp.ops);
				objects.push({ path: lamp.path, kind: "Rectangle" });
				if (item.tag !== undefined && item.tag !== "") {
					// The `{0}` placeholder and the `sources` list are the shape the shipped label styles use:
					// an ExpressionEvaluator whose Source0 is a dynamic link. The formula is `if(...)` with uint
					// colours because that is what the evaluator accepts; the tool still validates it through
					// `expr/validate` before applying, so a wrong formula is reported rather than written.
					const formula = lampExpression(theme);
					ops.push({
						op: "attach_expression",
						path: lamp.path,
						prop_name: "FillColor",
						expression: formula,
						sources: item.tag,
					});
					expressions.push({ path: lamp.path, prop_name: "FillColor", expression: formula, sources: item.tag });
				}
				return;
			}
			const value = label(parent, `${name}Row${rowIndex + 1}Value`, { left: valueLeft, top, width: valueWidth, height: ROW - 6 }, "", theme, 12, theme.valueFore, true);
			ops.push(...value.ops);
			objects.push({ path: value.path, kind: "Label" });
			if (item.tag !== undefined && item.tag !== "") {
				// FTView uses a numericDisplay here. Optix has no numericDisplay widget in the shipped
				// vocabulary, so the readout is a label whose text is a dynamic link to the Model variable.
				ops.push({ op: "bind", path: value.path, name: "Text", source_path: item.tag });
			}
		});
	});
	const pendingWiring = [];
	const shell = spec.shell;
	if (navSlot !== undefined && shell !== undefined && shell.window !== undefined && shell.loader !== undefined && shell.loader !== "") {
		// The navigation bar belongs to the SHELL, beside the loader, not inside each panel. The runtime
		// resolves a handler's DynamicLink relative to the node that owns it: a button created inside a
		// screen is one level deeper in a session (UIRoot/<loader>/<panel>/<button>) than it is in the
		// design tree, so a loader path written there resolves to the DESIGN-TIME loader and the runtime
		// answers "No behaviour or observer found that handles the method 'ChangePanel' on node
		// Root/Objects/.../UI/MainWindow/MainLoader" (measured live 2026-11-14). A button that is a
		// SIBLING of the loader resolves in both trees; Rockwell's own Optix_Sample_PanelLoaderChangePanelNetLogic
		// wires its window-level button exactly that way ("../../../../../PanelLoader1/RuntimeNetLogic1@NodeId").
		// `object_raw` is the path relative to the button's parent, which the bridge prefixes with the four
		// levels between the ObjectPointer and the button.
		const loaderName = shell.loader.split("/").filter((segment) => segment !== "").at(-1);
		const windowWidth = shell.width ?? spec.width;
		const windowHeight = shell.height ?? spec.height;
		// The panels keep their footer at the bottom of the window, and a panel's cards already stop
		// short by NAV because the in-panel layout reserved it; the shell bar goes in that reserved
		// band, directly above the footer, so it never covers the panel's own text.
		const contentBottom = windowHeight - FOOTER - PAD;
		const bar = { left: PAD, top: contentBottom - NAV + 6, width: windowWidth - PAD * 2, height: NAV };
		// One bar is shared by every screen, so each button is named for the panel it opens and lands
		// in the next free slot: a second screen's draft ADDS its own buttons instead of replacing the
		// first screen's, which is what two drafts that both named their button Nav1 did.
		const existingNav = (shell.children ?? []).filter((child) => typeof child === "string" && child.startsWith("Nav_")).length;
		const missing = new Set(shell.missing_targets ?? []);
		const PITCH = 232;
		const buttonWidth = 220;
		nav.forEach((entry, index) => {
			const tail = entry.target.split("/").filter((segment) => segment !== "").at(-1);
			const name = entry.name ?? `Nav_${tail}`;
			const path = `${shell.window}/${name}`;
			const shape = {
				op: "wire_event",
				path,
				event_type: "MouseClickEvent",
				method_path: `${shell.loader}/ChangePanel`,
				object_raw: `../${loaderName}`,
				args: `NewPanel=${entry.target};AliasNode=`,
			};
			const present = (shell.children ?? []).includes(name);
			if (present) {
				// Already drawn by another screen's draft: keep its geometry, refresh what it opens.
				if (!missing.has(entry.target)) ops.push(shape);
				return;
			}
			// NAV - 12 keeps the button at 44 px, the minimum the HMI target rule reports.
			// The fill is set explicitly because a `Button` with no `BackgroundColor` takes the style
			// sheet's own grey, and white text on it measures 1.4:1 - measured live 2026-11-14, where
			// the shell bar rendered as white-on-pale-grey under the theme everywhere else.
			const slot = { left: bar.left + (existingNav + index) * PITCH, top: bar.top + 6, width: buttonWidth, height: NAV - 12 };
			ops.push(
				{ op: "create_widget", screen: shell.window, name, widget_type: "Button" },
				...box(path, slot),
				set(path, "Text", entry.label),
				set(path, "BackgroundColor", theme.footer),
				set(path, "TextColor", theme.footerText),
				set(path, "FontSize", size(13)),
			);
			objects.push({ path, kind: "Button" });
			if (missing.has(entry.target)) {
				// The button exists, the panel it opens does not: report the wiring so it can be applied
				// once that screen has been drafted, rather than losing the whole batch to a refusal.
				pendingWiring.push({ button: path, label: entry.label, target: entry.target, shape });
				return;
			}
			ops.push(shape);
		});
	} else if (navSlot !== undefined) {
		const buttonWidth = Math.floor((navSlot.width - GAP * (nav.length - 1)) / nav.length);
		nav.forEach((entry, index) => {
			const name = `Nav${index + 1}`;
			// NAV - 12, not the FTView scaffold's NAV - 16: a 40 px button is under the 44 px target the
			// design check reports as HMI-TARGET-01, and this scaffold is what the check is run against.
			const slot = { left: navSlot.left + index * (buttonWidth + GAP), top: navSlot.top + 6, width: buttonWidth, height: NAV - 12 };
			const path = `${parent}/${name}`;
			ops.push(
				{ op: "create_widget", screen: parent, name, widget_type: "Button" },
				...box(path, slot),
				set(path, "Text", entry.label),
				set(path, "TextColor", theme.title),
				set(path, "FontSize", size(13)),
			);
			objects.push({ path, kind: "Button" });
			if (spec.panel_loader === undefined || spec.panel_loader === "") {
				pendingWiring.push({
					button: path,
					label: entry.label,
					target: entry.target,
					shape: { op: "wire_event", path, event_type: "MouseClickEvent", method_path: `${spec.panel_loader ?? "<PanelLoader path>"}/ChangePanel`, args: `NewPanel=${entry.target};AliasNode=` },
				});
				return;
			}
			// ChangePanel is a PanelLoader method, and a UI object is instantiated per session, so the
			// loader path has to come from the live model rather than from a guess at the Window's children.
			ops.push({ op: "wire_event", path, event_type: "MouseClickEvent", method_path: `${spec.panel_loader}/ChangePanel`, args: `NewPanel=${entry.target};AliasNode=` });
		});
	}
	return {
		name: spec.name,
		path: parent,
		width: spec.width,
		height: spec.height,
		theme,
		ops,
		op_count: ops.length,
		objects,
		slots: { ...slots, cards: cardSlots, ...(navSlot === undefined ? {} : { nav: navSlot }) },
		expressions,
		pendingWiring,
	};
}
