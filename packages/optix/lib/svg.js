/**
 * SVG conformance for FactoryTalk Optix's Advanced SVG image.
 * @module dsh-tool-ft-optix/svg
 *
 * An `AdvancedSVGImage` can recolor, fade, thicken or dash parts of a drawing at
 * runtime, but only parts the drawing declares: an element needs an `id`, and the
 * fill or stroke it changes must be a hexadecimal colour written as an XML
 * attribute or inline CSS. Measured against the installed Studio 1.8.1 help
 * (`creating-projects/graphic-objects/predefined/Advanced-SVG-image.html` and the
 * Advanced SVG tutorial): "If the image doesn't conform to these requirements,
 * the image will display as expected, but you will not be able to change the
 * image properties."
 *
 * That failure is silent in Studio - the drawing looks right and nothing else
 * happens - so the check belongs before the file is placed, not after a render.
 * Nothing here rewrites the file: a repair is a suggestion the caller applies,
 * because a silent rewrite of artwork is not this tool's call to make.
 */

/** Colours the named-colour repair can translate, and the hex the drawing means. */
const NAMED_COLOURS = {
	black: "#000000",
	white: "#FFFFFF",
	red: "#FF0000",
	lime: "#00FF00",
	green: "#008000",
	blue: "#0000FF",
	yellow: "#FFFF00",
	cyan: "#00FFFF",
	aqua: "#00FFFF",
	magenta: "#FF00FF",
	fuchsia: "#FF00FF",
	gray: "#808080",
	grey: "#808080",
	silver: "#C0C0C0",
	maroon: "#800000",
	olive: "#808000",
	navy: "#000080",
	teal: "#008080",
	purple: "#800080",
	orange: "#FFA500"
};

/** Constructs SVG 1.2 Tiny does not carry, so Optix may not draw them at all. */
const UNSUPPORTED = [
	["filter", /<filter[\s>]/iu],
	["feGaussianBlur", /<fe[A-Za-z]+[\s>]/u],
	["linearGradient", /<linearGradient[\s>]/u],
	["radialGradient", /<radialGradient[\s>]/u],
	["pattern", /<pattern[\s>]/u],
	["clipPath", /<clipPath[\s>]/u],
	["mask", /<mask[\s>]/u],
	["foreignObject", /<foreignObject[\s>]/u],
	["script", /<script[\s>]/u],
	["animation", /<(?:animate|animateMotion|animateTransform|set)[\s>]/u],
	["image", /<image[\s>]/u]
];

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u;

/** Parse `name="value"` and `name='value'` pairs out of an element's attribute text. */
function attributes(source) {
	const found = {};
	for (const match of source.matchAll(/([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/gu)) {
		found[match[1]] = match[3] ?? match[4] ?? "";
	}
	return found;
}

/** Parse one inline `style="a:b;c:d"` declaration list. */
function declarations(style) {
	const found = {};
	if (typeof style !== "string") return found;
	for (const part of style.split(";")) {
		const at = part.indexOf(":");
		if (at === -1) continue;
		found[part.slice(0, at).trim().toLowerCase()] = part.slice(at + 1).trim();
	}
	return found;
}

/** `rgb(255, 0, 0)` and `#f00` both become `#FF0000`; anything else is returned as-is. */
function toHex(value) {
	const text = String(value ?? "").trim();
	if (HEX.test(text)) {
		const upper = text.toUpperCase();
		return upper.length === 4 ? `#${upper[1]}${upper[1]}${upper[2]}${upper[2]}${upper[3]}${upper[3]}` : upper;
	}
	const rgb = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})/iu.exec(text);
	if (rgb !== null) {
		const channel = (part) => Math.max(0, Math.min(255, Number(part))).toString(16).toUpperCase().padStart(2, "0");
		return `#${channel(rgb[1])}${channel(rgb[2])}${channel(rgb[3])}`;
	}
	const named = NAMED_COLOURS[text.toLowerCase()];
	return named === undefined ? undefined : named;
}

/**
 * Whether one colour value can drive an `AdvancedSVGImageElementProperty`.
 *
 * A hex value or a named colour the repair table can translate is controllable
 * once repaired; `none` and `transparent` are not colours at all, and a
 * `url(#gradient)` refers to a paint server SVG 1.2 Tiny does not have.
 */
function colourState(value) {
	const text = String(value ?? "").trim();
	if (text === "") return "absent";
	if (HEX.test(text)) return "hex";
	if (/^url\(/iu.test(text)) return "unsupported";
	if (text.toLowerCase() === "none" || text.toLowerCase() === "transparent" || text.toLowerCase() === "currentcolor") return "unpaintable";
	if (/^rgba?\(/iu.test(text)) return "repairable";
	if (/^[a-z]+$/iu.test(text)) return NAMED_COLOURS[text.toLowerCase()] === undefined ? "unsupported" : "repairable";
	return "unsupported";
}

/** The property classes (`AdvancedSVGImagePropertyClass`) that make sense for one element. */
function propertiesFor(element) {
	const properties = [];
	const fill = colourState(element.fill);
	const stroke = colourState(element.stroke);
	// Colour and opacity are only drivable on something that is painted at all: a
	// `url(#gradient)` or `none` element renders, but Optix has no property to set
	// on it, and claiming otherwise would send the agent to bind a value that
	// cannot change anything.
	const painted = fill === "hex" || fill === "repairable" || stroke === "hex" || stroke === "repairable";
	if (painted) {
		properties.push("Color");
		properties.push("Opacity");
	}
	if (stroke !== "absent" || element.strokeWidth !== undefined) properties.push("StrokeWidth");
	if (element.strokeDasharray !== undefined) properties.push("StrokeDasharray");
	return properties;
}

/**
 * Inspect SVG text against the Advanced SVG image requirements.
 *
 * @param text - SVG source.
 * @returns Per-element ids, what each can control, and findings classified
 *   `blocks_control` (Optix will draw it but never animate it) or
 *   `may_not_display` (SVG 1.2 Tiny does not carry the construct).
 */
export function inspectSvg(text) {
	const source = typeof text === "string" ? text : "";
	const findings = [];
	if (source.trim() === "") {
		return {
			ids: [],
			controlable: [],
			findings: [{
				code: "empty",
				severity: "blocks_control",
				message: "The file is empty."
			}],
			conformant: false
		};
	}

	const svgTag = /<svg\b([^>]*)>/iu.exec(source);
	const svgAttributes = svgTag === null ? {} : attributes(svgTag[1]);
	const version = svgAttributes.version ?? "";
	const baseProfile = svgAttributes.baseProfile ?? "";
	if (version !== "" && !/^1\.[12]$/u.test(version)) {
		findings.push({
			code: "version_not_tiny",
			severity: "may_not_display",
			message: `The drawing declares SVG ${version}; Optix documents SVG 1.2 Tiny.`,
			repair: 'replace version="1.1" with version="1.2" baseProfile="tiny"'
		});
	}
	if (baseProfile !== "" && baseProfile.toLowerCase() !== "tiny" && baseProfile.toLowerCase() !== "full") {
		findings.push({
			code: "profile_unknown",
			severity: "may_not_display",
			message: `The drawing declares baseProfile="${baseProfile}"; Optix documents SVG 1.2 Tiny.`
		});
	}
	if (svgTag === null) {
		findings.push({
			code: "no_svg_element",
			severity: "blocks_control",
			message: "No <svg> element: this is not an SVG drawing."
		});
	}

	for (const [name, pattern] of UNSUPPORTED) {
		if (pattern.test(source)) {
			findings.push({
				code: `unsupported_${name}`,
				severity: "may_not_display",
				message: `The drawing uses <${name}>, which SVG 1.2 Tiny does not carry; Optix may not draw it.`
			});
		}
	}

	const ids = [];
	const controlable = [];
	let withId = 0;
	// Elements inside `<defs>` are paint servers and templates, not things an
	// operator sees, so they are never offered as controllable even when they
	// carry an id (a gradient's `id` is what `url(#…)` refers to).
	const paintedSource = source.replace(/<defs\b[\s\S]*?<\/defs>/giu, "");
	for (const match of paintedSource.matchAll(/<([A-Za-z][\w:-]*)\b([^>]*)>/gu)) {
		const tag = match[1];
		if (tag.toLowerCase() === "svg") continue;
		const attr = attributes(match[2]);
		if (attr.id === undefined || attr.id === "") continue;
		withId += 1;
		const style = declarations(attr.style);
		const element = {
			id: attr.id,
			tag,
			fill: attr.fill ?? style.fill,
			stroke: attr.stroke ?? style.stroke,
			opacity: attr.opacity ?? style.opacity,
			strokeWidth: attr["stroke-width"] ?? style["stroke-width"],
			strokeDasharray: attr["stroke-dasharray"] ?? style["stroke-dasharray"],
			source: attr.fill !== undefined ? "attribute" : style.fill !== undefined ? "style" : "none"
		};
		ids.push(element);
		let painted = false;
		for (const channel of ["fill", "stroke"]) {
			const value = element[channel];
			const state = colourState(value);
			if (state === "repairable") {
				painted = true;
				const hex = toHex(value);
				findings.push({
					code: `colour_not_hex_${channel}`,
					severity: "blocks_control",
					message: `#${element.id} sets ${channel}="${value}", which Optix cannot drive: it needs a hexadecimal colour.`,
					id: element.id,
					repair: `replace ${channel}="${value}" with ${channel}="${hex ?? "#RRGGBB"}"`
				});
			} else if (state === "unsupported") {
				painted = true;
				findings.push({
					code: `colour_unsupported_${channel}`,
					severity: "blocks_control",
					message: `#${element.id} sets ${channel}="${value}", which is not a hexadecimal colour Optix can drive.`,
					id: element.id,
					repair: `replace ${channel}="${value}" with a hexadecimal colour such as ${channel}="#30A46C"`
				});
			} else if (state === "unpaintable") {
				painted = true;
				findings.push({
					code: `colour_unpaintable_${channel}`,
					severity: "blocks_control",
					message: `#${element.id} sets ${channel}="${value}", so there is no colour to drive.`,
					id: element.id,
					repair: `draw #${element.id} with fill (or stroke) instead of ${value}`
				});
			}
		}
		const properties = propertiesFor(element);
		if (properties.length === 0) {
			// Only an element with no paint at all is the "nothing to control"
			// defect; an element painted with a value Optix cannot drive already
			// has its own finding above.
			const bare = element.fill === undefined && element.stroke === undefined && element.strokeWidth === undefined;
			findings.push({
				code: "nothing_to_control",
				severity: "blocks_control",
				message: bare
					? `#${element.id} sets neither fill nor stroke, so no Advanced SVG property applies to it.`
					: `#${element.id} carries no fill or stroke Optix can drive, so no Advanced SVG property applies to it.`,
				id: element.id,
				...(painted ? {} : { repair: `give #${element.id} a hexadecimal fill or stroke` })
			});
		}
		if (properties.length > 0) {
			controlable.push({
				id: element.id,
				tag,
				properties
			});
		}
	}
	if (withId === 0) {
		findings.push({
			code: "no_ids",
			severity: "blocks_control",
			message: "No element carries an id, so no part of this drawing can be controlled.",
			repair: "give each part you want to drive an id, for example <rect id=\"Conveyor\" …>"
		});
	}
	// Two ids that only differ by punctuation derive the same Optix child name, and
	// the bridge refuses the second create with a duplicate-name error. Caught here
	// so the drawing is renamed instead of the batch half-applying.
	const derived = new Map();
	for (const element of ids) {
		const name = elementPropertyName(element.id, "Color");
		const owner = derived.get(name);
		if (owner === undefined) {
			derived.set(name, element.id);
			continue;
		}
		findings.push({
			code: "property_name_collision",
			severity: "blocks_control",
			message: `#${owner} and #${element.id} both become the Optix element property ${name}.`,
			id: element.id,
			repair: `rename #${element.id} so its id differs by more than punctuation`
		});
	}

	const blocking = findings.some((finding) => finding.severity === "blocks_control");
	return {
		versions: {
			version,
			baseProfile
		},
		size: {
			width: svgAttributes.width ?? "",
			height: svgAttributes.height ?? ""
		},
		view_box: svgAttributes.viewBox ?? "",
		counts: {
			ids: withId,
			elements: [...source.matchAll(/<([A-Za-z][\w:-]*)\b/gu)].length
		},
		ids,
		controlable,
		findings,
		conformant: !blocking
	};
}

/**
 * The minimal edits that would make a drawing controllable, as text the caller
 * applies. Never applied here: artwork is the engineer's.
 */
export function repairPlan(analysis) {
	return (analysis?.findings ?? [])
		.filter((finding) => typeof finding.repair === "string" && finding.repair !== "")
		.map((finding) => ({
			code: finding.code,
			severity: finding.severity,
			repair: finding.repair
		}));
}

/**
 * A child-object name for one element-property entry.
 *
 * Optix keys an `AdvancedSVGImageElementProperty` by its BrowseName, and a
 * drawing id can carry characters a browse name should not, so the name is
 * derived and stable: `Conveyor_Color`.
 */
export function elementPropertyName(id, property) {
	const base = String(id ?? "").replace(/[^A-Za-z0-9_]/gu, "_").replace(/^(\d)/u, "_$1");
	return `${base === "" ? "Element" : base}_${property}`;
}

/** The `AdvancedSVGImagePropertyClass` member for a property name in tool input. */
export function propertyClass(property) {
	const text = String(property ?? "").trim().toLowerCase();
	if (text === "color" || text === "colour") return "Color";
	if (text === "opacity") return "Opacity";
	if (text === "strokewidth" || text === "stroke_width" || text === "stroke width") return "StrokeWidth";
	if (text === "strokedasharray" || text === "stroke_dasharray" || text === "stroke dasharray") return "StrokeDasharray";
	return undefined;
}
