/**
 * Design checks over a live Optix screen.
 *
 * These are the corpus rules that can be decided from the model the bridge
 * reports: a control too small to press (`HMI-TARGET-01`), a control with no
 * label of its own (`HMI-TARGET-02`), text whose colour does not stand out from
 * the fill it sits on (`HMI-CONTRAST-01`), a screen with no navigation area
 * (`VIEW-NAV-01`), a screen nothing leaves from (`VIEW-NAV-02`), a screen whose
 * size is not the box its mounting panel gives it (`VIEW-LAYOUT-02`), a layout
 * whose fixed children leave nothing for the sibling that fills (`VIEW-LAYOUT-03`),
 * a hand-built copy repeated across screens instead of a type with instances
 * (`OPTIX-UI-01`) and behaviour living inside a composition (`OPTIX-UI-02`),
 * an Advanced SVG image with nothing to animate (`OPTIX-IMG-01`), a literal
 * colour beside a style sheet that already decides it (`OPTIX-STYLE-01`), a
 * child drawn outside its parent (`OPTIX-LAYOUT-01`), a measurement shown
 * without the unit the model records (`OPTIX-DATA-01`) and text below the
 * readable floor (`VIEW-TYPE-02`, the same 11 px floor the offline rubric
 * applies).
 * The rule ids are the corpus ids, so a finding can be cited by
 * `engineering_reference`. The thresholds themselves come from the `hmi` domain
 * pages: 44 px and 4.5:1.
 *
 * Nothing here renders anything. A finding is a statement about the model: the
 * geometry, the colours and the wiring the bridge can read. Whether the screen
 * looks right is answered by `optix_preview` and `optix_screenshot`.
 *
 * @module dsh-tool-ft-optix/design
 */

/** Minimum comfortable touch target in pixels, the same figure the View checks use. */
export const TOUCH_MINIMUM = 44;

/** Contrast ratio small text needs to be legible. */
export const CONTRAST_MINIMUM = 4.5;

/** The floor a FontSize has to clear, the same figure `rubric.js` holds the View export to. */
export const MIN_FONT_SIZE = 11;

/** Controls an operator presses, so the touch minimum applies to them. */
export const INTERACTIVE_TYPES = new Set([
	"Button",
	"Switch",
	"CheckBox",
	"RadioButton",
	"ToggleButton",
	"DropDownButton",
	"SpinBox",
	"ComboBox",
	"DateTimePicker",
	"DurationPicker",
	"CalendarPicker",
	"CalendarPickerElement",
	"TextBox",
	"EditableLabel",
	"NavigationPanelItem",
	"ListBox",
	"ListView",
	"ScrollView"
]);

/** Types that carry text the operator has to read. */
const TEXT_TYPES = new Set(["Label", "Button", "TextBox", "EditableLabel", "ComboBox", "SpinBox"]);

/** Fills a label can sit on, and therefore compete with. */
const FILL_TYPES = new Set(["Rectangle", "Panel", "Ellipse", "Image", "Screen", "PanelLoader"]);

/** A composition that computes: behaviour living inside the layout. */
const BEHAVIOUR_TYPES = new Set(["NetLogic", "DelayedTask", "LongRunningTask"]);

const NAMED = Object.freeze({
	white: "#ffffff",
	black: "#000000",
	silver: "#c0c0c0",
	gray: "#808080",
	grey: "#808080",
	red: "#ff0000",
	green: "#008000",
	blue: "#0000ff",
	yellow: "#ffff00",
	cyan: "#00ffff",
	magenta: "#ff00ff",
	maroon: "#800000",
	navy: "#000080",
	teal: "#008080",
	olive: "#808000"
});

/**
 * Parse a colour to `#rrggbb`, or undefined.
 *
 * The shipped libraries spell a colour as `#rrggbb` in their own YAML. The
 * bridge reads the value through `ToString()`, and that spelling has not been
 * observed live, so the shapes .NET itself produces are tolerated too. An
 * unparseable colour is reported as unchecked rather than guessed.
 *
 * @param value - The reported property value.
 * @returns `#rrggbb`, or undefined when the value is not a colour.
 */
export function colour(value) {
	if (typeof value !== "string") return undefined;
	const text = value.trim().toLowerCase();
	if (NAMED[text] !== undefined) return NAMED[text];
	if (/^#[0-9a-f]{6}$/u.test(text)) return text;
	if (/^#[0-9a-f]{8}$/u.test(text)) return `#${text.slice(3)}`;
	if (/^#[0-9a-f]{3}$/u.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
	// The bridge reports a Color as `ToString()` of the packed uint: "4294967295 (UInt32)" measured live
	// on Optix 1.8.1 (2026-11-14). Drop the alpha byte: 0xAARRGGBB.
	const packed = /^(\d+) \((?:u?int32|uint|color)\)$/u.exec(text);
	if (packed !== null) {
		const rgb = Number.parseInt(packed[1], 10).toString(16).padStart(8, "0").slice(2);
		return `#${rgb}`;
	}
	const channels = /r(?:gb)?\D+(\d{1,3})\D+(\d{1,3})\D+(\d{1,3})/u.exec(text);
	if (channels !== null) {
		const parts = [1, 2, 3].map((index) => Number.parseInt(channels[index], 10));
		if (parts.every((part) => part >= 0 && part <= 255)) return `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
	}
	return undefined;
}

/** Relative luminance of one `#rrggbb` colour. */
function luminance(hex) {
	const channels = [1, 3, 5].map((index) => {
		const value = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
		return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
	});
	const [r = 0, g = 0, b = 0] = channels;
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio between two `#rrggbb` colours. */
export function contrastRatio(foreground, background) {
	const a = luminance(foreground);
	const b = luminance(background);
	return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Number out of a reported property value (`400.0`, `44`, `44 px`). */
function numberValue(value) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : undefined;
}

/** One property of a described node. */
function property(node, name) {
	return node.properties.find((entry) => entry.name === name)?.value;
}

/** Geometry of a node, or undefined when it does not report a real box. */
function rectOf(node) {
	const left = numberValue(property(node, "LeftMargin"));
	const top = numberValue(property(node, "TopMargin"));
	const width = numberValue(property(node, "Width"));
	const height = numberValue(property(node, "Height"));
	if (left === undefined || top === undefined || width === undefined || height === undefined) return undefined;
	// A size of -1 is `Fill`, a request for the parent's room rather than a dimension. Read as a number it is a
	// box with negative area, which made HMI-TARGET-01 report a fill-sized control as "-1×-1, below the 44px
	// minimum" and let OPTIX-LAYOUT-01 call any child of a fill container outside its parent. A node that names
	// no positive size reports no geometry, and the rules say so instead of measuring an invention.
	if (!(width > 0) || !(height > 0)) return undefined;
	return { left, top, width, height };
}

/** Does one rectangle hold the centre of another. */
function contains(outer, inner) {
	const x = inner.left + inner.width / 2;
	const y = inner.top + inner.height / 2;
	return x >= outer.left && x <= outer.left + outer.width && y >= outer.top && y <= outer.top + outer.height;
}

/** Area of a rectangle, so the tightest holder wins. */
function area(rect) {
	return rect.width * rect.height;
}

/** Text a control carries, or undefined when it reports none. */
function textOf(node) {
	const value = property(node, "Text");
	if (value === undefined) return undefined;
	const text = String(value).trim();
	return text === "" || text === "null" ? "" : text;
}

/**
 * The node a link points at, or undefined.
 *
 * A bound property reports as `DynamicLink` text: a project-absolute
 * `/Objects/<Project>/Model/...` path measured live on Optix 1.8.1 (2026-11-15),
 * either bare or with an `@Attribute` tail. An attribute tail is not a node of
 * the model, so it is left out.
 *
 * @param value - The reported property value.
 * @returns The project-relative node path, or undefined.
 */
function linkTarget(value) {
	if (typeof value !== "string") return undefined;
	const text = value.trim();
	const match = /^\/Objects\/([^/]+)\/(.+)$/u.exec(text);
	if (match === null) return undefined;
	const rest = match[2];
	if (rest.includes("@")) return undefined;
	return rest;
}

/** The literal colours a node sets on itself, as `{property: #rrggbb}`. */
function literalsOf(node) {
	const found = {};
	for (const name of ["BackgroundColor", "FillColor", "TextColor", "ForegroundColor"]) {
		const value = colour(property(node, name));
		if (value !== undefined) found[name] = value;
	}
	return found;
}

/**
 * Run the design checks over one screen.
 *
 * @param input - `{ nodes, screen, canvas, host, siblings, images, styled, palette, units, shell }`:
 *   the described nodes of the screen (each `{ path, name, type, properties }`),
 *   the screen node itself, the canvas the project's Window declares, the box the
 *   object that mounts this screen gives it as `{ path, width, height }` (which
 *   replaces the window for the layout rule when it is known), the other
 *   screens' `{ name, children }` for the reuse rule, each `AdvancedSVGImage` as
 *   `{ path, name, elements }` (how many element properties it binds), the widget
 *   types the project's `DefaultStyleSheet` styles, the palette the house theme
 *   uses, `units` as `{ nodePath: "bar" }` for modelled signals, and the start
 *   window's own navigation as `{ path, controls, wired, navigation_panels }`.
 * @returns `{ findings, unchecked, described }`: findings in rule order, the
 *   checks the model could not support, and how many objects were examined.
 */
export function designFindings(input) {
	const findings = [];
	const unchecked = [];
	const nodes = input.nodes;
	const screen = input.screen;
	const described = new Set(nodes.map((node) => node.path));

	const geometry = new Map();
	for (const node of nodes) {
		const rect = rectOf(node);
		if (rect !== undefined) geometry.set(node.path, rect);
	}

	// HMI-TARGET-01: a control an operator presses has to be pressable.
	for (const node of nodes) {
		if (!INTERACTIVE_TYPES.has(node.type)) continue;
		const rect = geometry.get(node.path);
		if (rect === undefined) {
			unchecked.push(`${node.type} ${node.name}: no geometry reported`);
			continue;
		}
		const side = Math.min(rect.width, rect.height);
		if (side < TOUCH_MINIMUM) findings.push({
			rule: "HMI-TARGET-01",
			severity: "warning",
			message: `${node.type} ${node.name} is ${rect.width}×${rect.height}; the target minimum is ${TOUCH_MINIMUM}px.`,
			evidence: {
				path: node.path,
				type: node.type,
				width: rect.width,
				height: rect.height
			}
		});
	}

	// HMI-TARGET-02: a control says what it does, or nothing does.
	for (const node of nodes) {
		if (!INTERACTIVE_TYPES.has(node.type)) continue;
		const text = textOf(node);
		if (text === undefined) {
			unchecked.push(`${node.type} ${node.name}: no Text property reported`);
			continue;
		}
		if (text !== "") continue;
		findings.push({
			rule: "HMI-TARGET-02",
			severity: "info",
			message: `${node.type} ${node.name} carries no text of its own; an unlabelled control is a guess for the operator.`,
			evidence: {
				path: node.path,
				type: node.type
			}
		});
	}

	// HMI-CONTRAST-01: text competes with the fill it sits on.
	const fills = nodes
		.filter((node) => FILL_TYPES.has(node.type))
		.map((node) => ({
			node,
			rect: geometry.get(node.path),
			fill: colour(property(node, "FillColor") ?? property(node, "Color"))
		}))
		.filter((entry) => entry.rect !== undefined && entry.fill !== undefined)
		.sort((left, right) => area(left.rect) - area(right.rect));
	// A fill that reports a colour but no box still paints what it holds, because a container sizes its
	// children and the child sits on that surface. Text placed by a layout reports no geometry of its own:
	// measured live 2026-11-17 on the rebuilt SMT screens, 20 of 42 described objects were labels reading
	// "no geometry reported" and the rule never ran on a single one of them. The ancestor chain is the
	// fallback holder, so a value readout is judged against the card it is drawn on.
	const fillByPath = new Map();
	for (const node of nodes) {
		if (!FILL_TYPES.has(node.type)) continue;
		const fill = colour(property(node, "FillColor") ?? property(node, "Color"));
		if (fill !== undefined) fillByPath.set(node.path, { node, fill });
	}
	const ancestorFill = (path) => {
		const cut = path.lastIndexOf("/");
		if (cut === -1) return undefined;
		let parent = path.slice(0, cut);
		while (parent !== "") {
			const found = fillByPath.get(parent);
			if (found !== undefined) return found;
			const up = parent.lastIndexOf("/");
			if (up === -1) return undefined;
			parent = parent.slice(0, up);
		}
		return undefined;
	};
	// A label with no fill on any ancestor still paints on something: a container that carries no colour of
	// its own shows the screen's backdrop through it, and that is the last figure available before the check
	// gives up. `fills` is sorted smallest-first, so the last entry is the largest surface on the screen.
	const backdrop = fills.length > 0 ? fills[fills.length - 1] : undefined;
	for (const node of nodes) {
		if (!TEXT_TYPES.has(node.type)) continue;
		const fore = colour(property(node, "TextColor") ?? property(node, "ForegroundColor"));
		if (fore === undefined) {
			unchecked.push(`${node.type} ${node.name}: no readable TextColor reported`);
			continue;
		}
		const own = geometry.get(node.path);
		const ancestor = own === undefined ? ancestorFill(node.path) : undefined;
		const holder = own === undefined
			? ancestor ?? backdrop
			: fills.find((entry) => entry.node.path !== node.path && contains(entry.rect, own));
		if (holder === undefined) {
			unchecked.push(own === undefined
				? `${node.type} ${node.name}: no geometry reported and no container fill to compare against`
				: `${node.type} ${node.name}: no fill behind it to compare against`);
			continue;
		}
		const ratio = contrastRatio(fore, holder.fill);
		if (ratio < CONTRAST_MINIMUM) findings.push({
			rule: "HMI-CONTRAST-01",
			severity: "warning",
			message: `${node.type} ${node.name} has contrast ${ratio.toFixed(2)}:1 (${fore} on ${holder.fill} from ${holder.node.name}); the minimum is ${CONTRAST_MINIMUM}:1.`,
			evidence: {
				path: node.path,
				type: node.type,
				foreground: fore,
				background: holder.fill,
				background_object: holder.node.name,
				ratio: Number(ratio.toFixed(2)),
				...(own === undefined ? { measured_from: ancestor === undefined ? "the largest fill in the screen" : "the fill on its container" } : {})
			}
		});
	}

	// VIEW-TYPE-02: text has to be readable at the operator's distance. The offline rubric has carried this
	// rule since the View side (rubric.js), and the live check can run it too because FontSize is reported
	// on a Label whether or not the label has geometry — which is exactly the case the contrast rule used
	// to skip. A text object that reports no FontSize is not passed silently: a style sheet may be deciding
	// its size, and that is said once instead of claimed for every node.
	const unreportedFont = [];
	for (const node of nodes) {
		if (!TEXT_TYPES.has(node.type)) continue;
		const size = numberValue(property(node, "FontSize"));
		if (size === undefined) {
			unreportedFont.push(node.name);
			continue;
		}
		if (size > 0 && size < MIN_FONT_SIZE) findings.push({
			rule: "VIEW-TYPE-02",
			severity: "warning",
			message: `${node.type} ${node.name} sets FontSize ${size}; text below ${MIN_FONT_SIZE}px is not readable at an operator's distance.`,
			evidence: {
				path: node.path,
				type: node.type,
				font_size: size,
				minimum: MIN_FONT_SIZE
			}
		});
	}
	if (unreportedFont.length > 0) unchecked.push(
		`${unreportedFont.length} text object(s) report no FontSize (${unreportedFont.slice(0, 6).join(", ")}${unreportedFont.length > 6 ? ", …" : ""}): a style sheet may decide their size`
	);

	// VIEW-NAV-01 and VIEW-NAV-02: the screen has a way in and a way out. Navigation drawn in the SHELL
	// counts for every screen: the bar sits beside the PanelLoader in the start window, which is where
	// Rockwell's own samples put it, because a button created inside a panel resolves its loader path
	// against the design tree and the runtime then calls the design-time loader (measured 2026-11-14).
	// A native NavigationPanel counts the same way: its items are wired by a `Panel` NodePointer, not by an
	// event handler, so counting only handlers reported the rebuilt SMT application as having no navigation
	// at all while its rail mounted all three screens (measured 2026-11-17).
	const shell = input.shell;
	const shellNavigation = shell !== void 0 && (shell.wired > 0 || (shell.navigation_panels ?? 0) > 0) ? shell : void 0;
	const controls = nodes.filter((node) => INTERACTIVE_TYPES.has(node.type));
	const wired = controls.filter((node) => node.children?.some((child) => child.type === "EventHandler" || child.type === "MouseClickEvent") === true);
	if (controls.length === 0) {
		if (shellNavigation === void 0) findings.push({
			rule: "VIEW-NAV-01",
			severity: "info",
			message: `${screen.name} holds no control an operator can press, so it has no navigation area of its own.`,
			evidence: {
				path: screen.path,
				controls: 0
			}
		});
	} else if (wired.length === 0 && shellNavigation === void 0) findings.push({
		rule: "VIEW-NAV-02",
		severity: "warning",
		message: `${screen.name} has ${controls.length} control(s) and none carries an event handler, so an operator who lands here has no way out through this screen.`,
		evidence: {
			path: screen.path,
			controls: controls.length,
			wired: 0
		}
	});

	// VIEW-LAYOUT-02: the screen is the size the panel actually is. The box to compare with is the one the
	// mounting object gives the screen, not the window it is drawn inside: a screen sized for the content
	// area of a NavigationPanel (a 1280-wide window with a 220-wide tab strip leaves 1060) is not a mismatch
	// with the window, and comparing it with the window reported three deliberately-sized SMT screens as a
	// defect (measured 2026-11-17). With no host resolved the window canvas is still the only figure
	// available, and the finding says that is what it used.
	const host = input.host;
	const canvas = host ?? input.canvas;
	// The screen's own box: what the screen node reports, or the largest surface inside it when it reports no
	// Width/Height of its own. Both layout rules need this one figure, so it is computed once.
	const ownRect = geometry.get(screen.path);
	const largestFill = nodes
		.filter((node) => node.path !== screen.path && FILL_TYPES.has(node.type))
		.map((node) => geometry.get(node.path))
		.filter((rect) => rect !== undefined)
		.sort((left, right) => area(right) - area(left))[0];
	const screenRect = ownRect ?? largestFill;
	if (canvas !== undefined) {
		const rect = screenRect;
		if (rect === undefined) unchecked.push(`${screen.name}: neither the screen nor a full-bleed fill reports a Width/Height`);
		else if (rect.width !== canvas.width || rect.height !== canvas.height) findings.push({
			rule: "VIEW-LAYOUT-02",
			severity: "info",
			message: `${screen.name} is ${rect.width}×${rect.height} while ${host === undefined ? `the window canvas is ${canvas.width}×${canvas.height}` : `${host.path} gives it ${canvas.width}×${canvas.height}`}; a different canvas scales or letterboxes on the same panel.`,
			evidence: {
				path: screen.path,
				width: rect.width,
				height: rect.height,
				canvas: `${canvas.width}x${canvas.height}`,
				...(host === undefined ? {} : { host: host.path }),
				...(ownRect === undefined ? { measured_from: "the largest fill inside the screen" } : {})
			}
		});
	} else unchecked.push("no window canvas reported");

	// VIEW-LAYOUT-03: a layout track is eaten by the children that name a size. Measured 2026-11-17 on a probe
	// screen: a `RowLayout` holding a child declared 900 wide and a sibling at `Width -1` across a 20 px gap
	// rendered the sibling at **w=0** - the fixed child had already taken 1192.5 px because a `ScaleLayout`
	// above it stretched it by 1.325, and a layout neither shrinks nor clips a child to make room for its
	// neighbours. The comparison has to happen in the space the numbers are written in: the children of a
	// `ScaleLayout` are declared in its design box (`OriginalWidth`/`OriginalHeight`), so that box is the track,
	// and the rendered overflow is that same shortfall times the fit factor.
	//
	// A track is resolved from the top down, because that is the only way the model states it. A `ScaleLayout`
	// resets the space to its design box; a layout that splits along an axis leaves its filling children
	// whatever its own track minus what its other children named on that axis; a layout that splits along the
	// other axis passes its own track straight through. With nothing above naming a size the screen's own box is
	// the seed - a screen node usually reports no `Width`/`Height` of its own, and its full-bleed fill does.
	const LAYOUT_AXES = new Map([["RowLayout", "Width"], ["ColumnLayout", "Height"], ["GridLayout", "Width"]]);
	const isVariableType = (type) => type === "UAVariable" || /(?:Variable|Property)Type$/u.test(type);
	const childNodes = new Map();
	for (const node of nodes) {
		const cut = node.path.lastIndexOf("/");
		if (cut === -1) continue;
		const parent = node.path.slice(0, cut);
		const list = childNodes.get(parent);
		if (list === undefined) childNodes.set(parent, [node]);
		else list.push(node);
	}
	const parentOf = (node) => {
		const cut = node.path.lastIndexOf("/");
		if (cut === -1) return undefined;
		return nodes.find((entry) => entry.path === node.path.slice(0, cut));
	};
	const childrenOf = (node) => childNodes.get(node.path) ?? [];
	const gapOf = (node, key) => numberValue(property(node, key === "Width" ? "HorizontalGap" : "VerticalGap")) ?? 0;
	// The box one node hands the next on a single axis: `size` in the coordinate space that node's own children
	// declare in, `rendered` in the pixels it draws at, and `x`/`y` for the factor between them when a
	// `ScaleLayout` is what set the space. FillMode 1 (Stretch) scales the two axes independently (measured
	// 1.325 × 1.6); any other mode is the uniform fit factor.
	const boxOf = (node, key, seen = new Set()) => {
		if (seen.has(node.path)) return undefined;
		seen.add(node.path);
		const own = numberValue(property(node, key));
		if (own > 0) return { size: own, rendered: own };
		const parent = parentOf(node);
		if (parent === undefined) {
			const seed = key === "Width" ? screenRect?.width : screenRect?.height;
			return seed === undefined ? undefined : { size: seed, rendered: seed, from: "the screen box" };
		}
		const designWidth = numberValue(property(parent, "OriginalWidth"));
		const designHeight = numberValue(property(parent, "OriginalHeight"));
		if (parent.type === "ScaleLayout" && designWidth > 0 && designHeight > 0) {
			const wide = boxOf(parent, "Width", new Set(seen));
			const tall = boxOf(parent, "Height", new Set(seen));
			if (wide === undefined || tall === undefined) return undefined;
			// Without both rendered axes there is no factor to report, but the design box is still the track the
			// children declare in, so the design-space comparison stands on its own.
			const known = Number.isFinite(wide.rendered) && Number.isFinite(tall.rendered);
			const fit = numberValue(property(parent, "FillMode")) === 1
				? undefined
				: known ? Math.min(wide.rendered / designWidth, tall.rendered / designHeight) : 1;
			const x = fit ?? (known ? wide.rendered / designWidth : 1);
			const y = fit ?? (known ? tall.rendered / designHeight : 1);
			// What the design box actually draws at: the design size times the factor, which for a Fit mode is
			// the uniform one and so leaves the leftover of the host box as centring margin, not as track.
			return {
				size: key === "Width" ? designWidth : designHeight,
				rendered: known ? key === "Width" ? designWidth * x : designHeight * y : undefined,
				x,
				y,
				from: `${parent.name} design box`
			};
		}
		const inherited = boxOf(parent, key, seen);
		if (inherited === undefined) return undefined;
		// A layout only spends its track on the axis it splits along. Children of a `RowLayout` sit side by side,
		// so their heights do not eat the vertical track; the row's own height passes through to them.
		if (LAYOUT_AXES.get(parent.type) !== key) return inherited;
		const siblings = childrenOf(parent).filter((child) => !isVariableType(child.type));
		const taken = siblings.reduce((total, child) => {
			if (child.path === node.path) return total;
			const size = numberValue(property(child, key));
			return total + (size > 0 ? size : 0);
		}, 0);
		const gaps = gapOf(parent, key) * Math.max(siblings.length - 1, 0);
		const leftover = inherited.size - taken - gaps;
		const scale = (key === "Width" ? inherited.x : inherited.y) ?? 1;
		return {
			size: leftover,
			rendered: inherited.rendered === undefined ? undefined : inherited.rendered - taken * scale - gaps,
			...(inherited.x === undefined ? {} : { x: inherited.x, y: inherited.y }),
			from: `${parent.name} leftover`
		};
	};
	for (const node of nodes) {
		const key = LAYOUT_AXES.get(node.type);
		if (key === undefined) continue;
		const kids = childrenOf(node).filter((child) => !isVariableType(child.type));
		if (kids.length < 2) continue;
		const track = boxOf(node, key);
		if (track === undefined) {
			unchecked.push(`${node.type} ${node.name}: no ancestor names a size on ${key}, so its track cannot be compared with its children`);
			continue;
		}
		const gap = numberValue(property(node, key === "Width" ? "HorizontalGap" : "VerticalGap")) ?? 0;
		const fixed = [];
		const filling = [];
		const unknown = [];
		for (const kid of kids) {
			const size = numberValue(property(kid, key));
			if (size === undefined) {
				unknown.push(kid.name);
				continue;
			}
			if (size < 0) filling.push(kid);
			else fixed.push({ kid, size });
		}
		if (unknown.length > 0) unchecked.push(`${node.type} ${node.name}: ${unknown.length} child(ren) report no ${unknown.length === 1 ? key : `${key}s`} (${unknown.slice(0, 6).join(", ")}${unknown.length > 6 ? ", …" : ""}), so they count as nothing against its ${track.size} px track`);
		const used = fixed.reduce((total, entry) => total + entry.size, 0) + gap * Math.max(kids.length - 1, 0);
		// A child at -1 needs the track to be strictly bigger than what the named sizes already took; a layout
		// whose children all name a size is only short when they add up to more than the track.
		const short = filling.length > 0 ? used >= track.size : used > track.size;
		if (!short) continue;
		// The factor belongs to the ScaleLayout that set this track, which boxOf already carried down it.
		const factor = (key === "Width" ? track.x : track.y) ?? 1;
		// A ScaleLayout scales the sizes its children declare but not the gaps between them (measured 2026-11-17:
		// a 20 px row gap and a 10 px column gap stayed exact through a 1.325 × 1.6 stretch), so the rendered
		// figure is the scaled fixed sizes plus the exact gaps.
		const rendered = Math.round(fixed.reduce((total, entry) => total + entry.size * factor, 0) + gap * Math.max(kids.length - 1, 0));
		const over = track.rendered === undefined ? 0 : rendered - track.rendered;
		const axisWord = key === "Width" ? "width" : "height";
		const trackNoun = key === "Width" ? "widths" : "heights";
		findings.push({
			rule: "VIEW-LAYOUT-03",
			severity: "warning",
			message: filling.length > 0
				? `${node.type} ${node.name} has a ${track.size} px ${axisWord} track, and its ${fixed.length} fixed ${trackNoun} plus ${kids.length - 1} ${gap} px gap${kids.length - 1 === 1 ? "" : "s"} already take ${used} px: ${filling.map((kid) => `${kid.name} at ${key} -1`).join(", ")} render at zero - a layout neither shrinks nor clips a child to make room for its neighbours.`
				: `${node.type} ${node.name} has a ${track.size} px ${axisWord} track and its ${fixed.length} fixed children take ${used} px, so they are drawn past it rather than shrunk to fit.`,
			evidence: {
				path: node.path,
				type: node.type,
				track: track.size,
				...(track.from === undefined ? {} : { track_from: track.from }),
				axis: key,
				fixed: fixed.map((entry) => `${entry.kid.name}: ${entry.size}`),
				gap,
				used,
				...(filling.length === 0 ? {} : { fill_siblings: filling.map((kid) => kid.name) }),
				...(factor === 1 ? {} : { scaled_by: factor, rendered: rendered }),
				...(over > 0 ? { past_the_box: over } : {})
			}
		});
	}

	// OPTIX-UI-01: a repeated composition should be a type with instances.
	const shapes = new Map();
	for (const sibling of input.siblings ?? []) {
		const children = sibling.children ?? [];
		if (children.length < 3) continue;
		const key = children.map((child) => `${child.name}:${child.type}`).sort().join("|");
		const owners = shapes.get(key) ?? [];
		owners.push(sibling.name);
		shapes.set(key, owners);
	}
	for (const [key, owners] of shapes) {
		if (owners.length < 2) continue;
		const parts = key.split("|");
		findings.push({
			rule: "OPTIX-UI-01",
			severity: "info",
			message: `${owners.join(", ")} hold the same ${parts.length} hand-built children (${parts.slice(0, 4).join(", ")}${parts.length > 4 ? ", …" : ""}); model that composition once as a type and instantiate it.`,
			evidence: {
				screens: owners,
				children: parts.length
			}
		});
	}

	// OPTIX-UI-02: a screen that computes is a screen that cannot be reused.
	for (const node of nodes) {
		if (!BEHAVIOUR_TYPES.has(node.type)) continue;
		findings.push({
			rule: "OPTIX-UI-02",
			severity: "info",
			message: `${node.type} ${node.name} lives inside the screen composition; move the behaviour to the object it belongs to so the screen stays reusable.`,
			evidence: {
				path: node.path,
				type: node.type
			}
		});
	}

	// OPTIX-IMG-01: an animation object with nothing to animate.
	for (const image of input.images ?? []) {
		if (image.elements > 0) continue;
		findings.push({
			rule: "OPTIX-IMG-01",
			severity: "info",
			message: `${image.name} is an Advanced SVG image with no SVG element properties, so it is a static picture drawn with the object that exists to animate one.`,
			evidence: {
				path: image.path,
				elements: 0
			}
		});
	}

	// OPTIX-STYLE-01: a literal colour next to a style sheet that already decides it.
	const styled = new Set(input.styled ?? []);
	const palette = new Set((input.palette ?? []).map((value) => colour(value)).filter((value) => value !== undefined));
	for (const node of nodes) {
		if (!styled.has(node.type)) continue;
		const literals = literalsOf(node);
		const outside = Object.entries(literals).filter(([, value]) => !palette.has(value));
		if (outside.length === 0) continue;
		findings.push({
			rule: "OPTIX-STYLE-01",
			severity: "info",
			message: `${node.type} ${node.name} writes ${outside.map(([name, value]) => `${name} ${value}`).join(", ")} as a literal while the project's DefaultStyleSheet already styles ${node.type}; a literal outside the palette bypasses the theme every other screen follows.`,
			evidence: {
				path: node.path,
				type: node.type,
				literals: Object.fromEntries(outside),
				style_collection: `${node.type}Style`
			}
		});
	}

	// OPTIX-LAYOUT-01: a child drawn outside the box that holds it. Overlap between
	// siblings is NOT judged here: a label drawn over a fill is the normal way to
	// put text on a card, so calling that a defect would flag correct screens.
	for (const node of nodes) {
		if (node.path === screen.path) continue;
		const rect = geometry.get(node.path);
		if (rect === undefined) continue;
		const parentPath = node.path.slice(0, node.path.lastIndexOf("/"));
		const parent = geometry.get(parentPath);
		if (parent === undefined) continue;
		if (contains(parent, rect)) continue;
		findings.push({
			rule: "OPTIX-LAYOUT-01",
			severity: "warning",
			message: `${node.type} ${node.name} sits at ${rect.left},${rect.top} ${rect.width}×${rect.height}, which leaves the ${parent.width}×${parent.height} box of ${parentPath.slice(parentPath.lastIndexOf("/") + 1)}; the part outside is clipped or drawn over its neighbours.`,
			evidence: {
				path: node.path,
				parent: parentPath,
				child: rect,
				parent_rect: parent
			}
		});
	}

	// OPTIX-DATA-01: a measurement shown without the unit the model records.
	const units = input.units ?? {};
	for (const node of nodes) {
		if (node.type !== "Label" && node.type !== "TextBox") continue;
		const target = linkTarget(property(node, "Text"));
		if (target === undefined) continue;
		const unit = units[target];
		if (unit === undefined || String(unit).trim() === "") continue;
		if (property(node, "Formatter") !== undefined || property(node, "TextFormatter") !== undefined) continue;
		findings.push({
			rule: "OPTIX-DATA-01",
			severity: "info",
			message: `${node.type} ${node.name} shows ${target} with no formatter while the model records the unit ${unit}; an operator reads a bare number and cannot tell what it measures.`,
			evidence: {
				path: node.path,
				type: node.type,
				target,
				units: String(unit)
			}
		});
	}

	if (!described.has(screen.path)) unchecked.push(`${screen.path}: the screen node itself was not described`);
	return {
		findings,
		unchecked,
		described: described.size
	};
}
