/**
 * Design checks over a live Optix screen.
 *
 * These are the corpus rules that can be decided from the model the bridge
 * reports: a control too small to press (`HMI-TARGET-01`), a control with no
 * label of its own (`HMI-TARGET-02`), text whose colour does not stand out from
 * the fill it sits on (`HMI-CONTRAST-01`), a screen with no navigation area
 * (`VIEW-NAV-01`), a screen nothing leaves from (`VIEW-NAV-02`), a screen whose
 * size is not the canvas the project declares (`VIEW-LAYOUT-02`), a hand-built
 * copy repeated across screens instead of a type with instances
 * (`OPTIX-UI-01`) and behaviour living inside a composition (`OPTIX-UI-02`).
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

/** Geometry of a node, or undefined when it does not report all four. */
function rectOf(node) {
	const left = numberValue(property(node, "LeftMargin"));
	const top = numberValue(property(node, "TopMargin"));
	const width = numberValue(property(node, "Width"));
	const height = numberValue(property(node, "Height"));
	if (left === undefined || top === undefined || width === undefined || height === undefined) return undefined;
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
 * Run the design checks over one screen.
 *
 * @param input - `{ nodes, screen, canvas, siblings }`: the described nodes of
 *   the screen (each `{ path, name, type, properties }`), the screen node
 *   itself, the canvas the project's Window declares, and the other screens'
 *   `{ name, children }` for the reuse rule.
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
	for (const node of nodes) {
		if (!TEXT_TYPES.has(node.type)) continue;
		const fore = colour(property(node, "TextColor") ?? property(node, "ForegroundColor"));
		if (fore === undefined) {
			unchecked.push(`${node.type} ${node.name}: no readable TextColor reported`);
			continue;
		}
		const own = geometry.get(node.path);
		if (own === undefined) {
			unchecked.push(`${node.type} ${node.name}: no geometry reported`);
			continue;
		}
		const holder = fills.find((entry) => entry.node.path !== node.path && contains(entry.rect, own));
		if (holder === undefined) {
			unchecked.push(`${node.type} ${node.name}: no fill behind it to compare against`);
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
				ratio: Number(ratio.toFixed(2))
			}
		});
	}

	// VIEW-NAV-01 and VIEW-NAV-02: the screen has a way in and a way out.
	const controls = nodes.filter((node) => INTERACTIVE_TYPES.has(node.type));
	const wired = controls.filter((node) => node.children?.some((child) => child.type === "EventHandler" || child.type === "MouseClickEvent") === true);
	if (controls.length === 0) findings.push({
		rule: "VIEW-NAV-01",
		severity: "info",
		message: `${screen.name} holds no control an operator can press, so it has no navigation area of its own.`,
		evidence: {
			path: screen.path,
			controls: 0
		}
	});
	else if (wired.length === 0) findings.push({
		rule: "VIEW-NAV-02",
		severity: "warning",
		message: `${screen.name} has ${controls.length} control(s) and none carries an event handler, so an operator who lands here has no way out through this screen.`,
		evidence: {
			path: screen.path,
			controls: controls.length,
			wired: 0
		}
	});

	// VIEW-LAYOUT-02: the screen is the size the panel actually is.
	if (input.canvas !== undefined) {
		const own = geometry.get(screen.path);
		const backdrop = nodes
			.filter((node) => node.path !== screen.path && FILL_TYPES.has(node.type))
			.map((node) => geometry.get(node.path))
			.filter((rect) => rect !== undefined)
			.sort((left, right) => area(right) - area(left))[0];
		const rect = own ?? backdrop;
		if (rect === undefined) unchecked.push(`${screen.name}: neither the screen nor a full-bleed fill reports a Width/Height`);
		else if (rect.width !== input.canvas.width || rect.height !== input.canvas.height) findings.push({
			rule: "VIEW-LAYOUT-02",
			severity: "info",
			message: `${screen.name} is ${rect.width}×${rect.height} while the window canvas is ${input.canvas.width}×${input.canvas.height}; a different canvas scales or letterboxes on the same panel.`,
			evidence: {
				path: screen.path,
				width: rect.width,
				height: rect.height,
				canvas: `${input.canvas.width}x${input.canvas.height}`,
				...(own === undefined ? { measured_from: "the largest fill inside the screen" } : {})
			}
		});
	} else unchecked.push("no window canvas reported");

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

	if (!described.has(screen.path)) unchecked.push(`${screen.path}: the screen node itself was not described`);
	return {
		findings,
		unchecked,
		described: described.size
	};
}
