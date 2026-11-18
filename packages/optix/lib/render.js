/**
 * Render checks over what the runtime actually painted.
 *
 * `design.js` decides its rules from the model the bridge reports, and that model
 * is a description, not a picture: it holds a `FontSize 12` and a `Width 400` and
 * says nothing about what the browser ended up drawing. The rules here run on the
 * served page instead, through the same preview leg `optix_screenshot` uses, so
 * they need no bridge and no Studio - only the runtime serving the saved project.
 *
 * They catch what a model check structurally cannot, all four seen on the rebuilt
 * SMT demo (Studio 1.8.1.27, 2026-11-17): a header clock drawing the literal
 * `--:--` because nothing drives it (`VIEW-RENDER-01`); a card 496x247 whose rows
 * sit in its top 97 px and leave 150 px of painted surface empty
 * (`VIEW-RENDER-02`); an element drawn past the edge of the box the runtime gave
 * the screen, which is what a mounter oversized past the canvas does
 * (`VIEW-RENDER-03`); and text whose colour does not separate from what sits under
 * it (`VIEW-RENDER-04`), or that is painted in the very colour behind it and so
 * cannot be read at all (`VIEW-RENDER-05`). The two model rules that depend on a
 * size - the 44 px touch minimum and the 11 px font floor - are re-decided here
 * from the painted box and the painted font, because a `ScaleLayout` fit factor
 * scales a control's box and the model reports neither.
 *
 * Why the colour rules read the captured pixels and not the DOM's own colours. The
 * Web presentation engine does not paint a fill on the element that owns it
 * (measured 2026-11-17 on the served page): a `[data-type="rectangle"]` computes
 * `rgba(0,0,0,0)` and its fill sits on an untyped child div written
 * `width:100%; height:100%`, its border is an inset `box-shadow`, and a
 * `NavigationPanel` paints its tab strip with `background-image: linear-gradient(…)`
 * on class-styled divs. Only 14 elements in the whole served page carry a
 * non-transparent `backgroundColor`. Reading computed colours therefore reports a
 * card as unpainted and a rail tab as unpainted, which is exactly how the empty-band
 * rule went silent on a card that visibly held content in 90 px of a 247 px box. So
 * `VIEW-RENDER-04` and `VIEW-RENDER-05` ask what the captured image holds at the
 * place the text sits, and the DOM colours are used for the text itself.
 *
 * Honest limits, restated in every result:
 * - The ids the Web presentation engine writes into the DOM are NOT the guids the
 *   bridge reports (measured 2026-11-17: `getElementById` fails for every bridge
 *   guid), so a finding is located by its rendered type chain, never by a project path.
 * - A render proves the project **as saved**. A bridge edit made after the last
 *   save is not in what the browser drew.
 * - The `[data-type="…"]` spelling is the vendor's, not ours. When the page
 *   reports nothing measurable the check says `unchecked`, it does not guess.
 * - Paint order is DOM order. A `z-index` or a positioned overlay that reorders
 *   paint misleads the DOM-order rules; the pixel rules do not care how it was painted.
 * - `decodePng` reads an 8-bit non-interlaced RGB or RGBA image, which is what a
 *   screenshot is. A palette, 16-bit or interlaced file is refused and the colour
 *   rules fall back to the DOM, which is reported.
 *
 * @module dsh-tool-ft-optix/render
 */

import { inflateSync } from "node:zlib";

import { CONTRAST_MINIMUM, MIN_FONT_SIZE, TOUCH_MINIMUM, colour, contrastRatio } from "./design.js";

/**
 * How much of a painted surface its own text has to occupy.
 *
 * Calibrated on the demo cards, measured 2026-11-17: a 496x247 card holding a
 * title and three label/value rows put its text extent in its top 97 px, an
 * extent of 0.27 of the surface. A KPI tile with one label and one value is
 * deliberately sparse and is excluded by `MIN_TEXT_LEAVES` instead of by this
 * number, so the threshold can sit where the defect actually is.
 */
export const COVERAGE_MINIMUM = 0.3;

/** Fewer text elements than this inside a surface is a tile, not a card: a label and a value. */
export const MIN_TEXT_LEAVES = 3;

/** A surface has to be this much taller than its content before the gap is worth naming. */
export const EMPTY_BAND_MINIMUM = 60;

/** Pixels an element may hang past the served box before it is reported. */
export const OVERFLOW_TOLERANCE = 1;

/** How many unjudgeable elements are listed before the answer switches to counting them. */
export const UNCHECKED_REPORTED = 40;

/** Text the runtime paints when a value never arrives, or a format string never formatted. */
export const PLACEHOLDER_PATTERNS = [
	/^--(:--)+$/u,
	/^--$/u,
	/^\{[^{}]*\}$/u,
	/^(?:undefined|null|NaN|TBD|\?\?\?)$/iu
];

/** Rendered types that hold a surface an operator reads content on. */
export const SURFACE_TYPES = new Set([
	"rectangle",
	"panel",
	"ellipse",
	"screen",
	"card"
]);

/** Rendered types an operator presses, so the touch minimum is measured on their painted box. */
export const RENDERED_TARGET_TYPES = new Set([
	"button",
	"switch",
	"checkbox",
	"radiobutton",
	"togglebutton",
	"dropdownbutton",
	"spinbox",
	"combobox",
	"datetimepicker",
	"durationpicker",
	"listbox",
	"listview",
	"scrollview",
	"navigationpanelitem",
	"textbox",
	"editablelabel"
]);

/** How far a glyph may sit from the colour behind it and still be unreadable. */
export const INVISIBLE_MAX_DISTANCE = 20;
/** The band outside a text box that is read as what the text sits on. */
export const SAMPLE_RING_PX = 3;

/** How far inside a painted surface the sampler reads, so a 1 px border is not mistaken for its fill. */
export const SAMPLE_INSET_PX = 3;
/** How much of the band around a text box must lie inside its holder before that band is the colour behind it. */
export const BAND_INSIDE_MINIMUM = 0.5;
/** How much of a surface an overlay child must cover to be its paint. */
export const SURFACE_OVERLAY_COVERAGE = 0.9;

/**
 * Decode a PNG screenshot into raw pixels.
 *
 * Only an 8-bit non-interlaced RGB or RGBA image is decoded, which is what a
 * browser screenshot is; a palette, 16-bit or interlaced file returns undefined so
 * the caller reports the fallback instead of reading garbage. Scanline filters 0-4
 * are reversed. No dependency is added: `node:zlib` is Node's own.
 *
 * @param {Uint8Array|Buffer} bytes
 * @returns {{width:number,height:number,channels:number,pixels:Uint8Array}|undefined}
 */
export function decodePng(bytes) {
	if (bytes === undefined || bytes === null) return undefined;
	const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
	if (buffer.length < 24) return undefined;
	if (buffer.readUInt32BE(0) !== 0x89504e47 || buffer.readUInt32BE(4) !== 0x0d0a1a0a) return undefined;
	let width = 0;
	let height = 0;
	let bitDepth = 0;
	let colorType = 0;
	let interlace = 0;
	const parts = [];
	let offset = 8;
	while (offset + 12 <= buffer.length) {
		const length = buffer.readUInt32BE(offset);
		const kind = buffer.toString("latin1", offset + 4, offset + 8);
		const start = offset + 8;
		if (kind === "IHDR") {
			width = buffer.readUInt32BE(start);
			height = buffer.readUInt32BE(start + 4);
			bitDepth = buffer[start + 8];
			colorType = buffer[start + 9];
			interlace = buffer[start + 12];
		} else if (kind === "IDAT") {
			parts.push(buffer.subarray(start, start + length));
		} else if (kind === "IEND") {
			break;
		}
		offset = start + length + 4;
	}
	const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
	if (width <= 0 || height <= 0 || bitDepth !== 8 || channels === 0 || interlace !== 0) return undefined;
	const stride = width * channels;
	let raw;
	try {
		raw = inflateSync(Buffer.concat(parts));
	} catch {
		return undefined;
	}
	if (raw.length < height * (stride + 1)) return undefined;
	const pixels = new Uint8Array(stride * height);
	let read = 0;
	for (let row = 0; row < height; row += 1) {
		const filter = raw[read];
		read += 1;
		const here = row * stride;
		const above = here - stride;
		for (let column = 0; column < stride; column += 1) {
			const value = raw[read];
			read += 1;
			const left = column >= channels ? pixels[here + column - channels] : 0;
			const up = row > 0 ? pixels[above + column] : 0;
			const corner = row > 0 && column >= channels ? pixels[above + column - channels] : 0;
			let result = value;
			if (filter === 1) {
				result = value + left;
			} else if (filter === 2) {
				result = value + up;
			} else if (filter === 3) {
				result = value + Math.floor((left + up) / 2);
			} else if (filter === 4) {
				const estimate = left + up - corner;
				const leftError = Math.abs(estimate - left);
				const upError = Math.abs(estimate - up);
				const cornerError = Math.abs(estimate - corner);
				result = value + (leftError <= upError && leftError <= cornerError ? left : upError <= cornerError ? up : corner);
			} else if (filter !== 0) {
				return undefined;
			}
			pixels[here + column] = result & 0xff;
		}
	}
	return { width, height, channels, pixels };
}

function pixelHex(image, x, y) {
	const at = (y * image.width + x) * image.channels;
	const red = image.pixels[at].toString(16).padStart(2, "0");
	const green = image.pixels[at + 1].toString(16).padStart(2, "0");
	const blue = image.pixels[at + 2].toString(16).padStart(2, "0");
	return `#${red}${green}${blue}`;
}

/**
 * Read what the captured image paints under a box, from a band just outside it.
 *
 * The band is outside on purpose: the pixels inside a text box are the glyphs, and
 * the question is what is behind them. The modal colour of the band is the answer,
 * so a text sitting near a surface edge is read against the surface it mostly sits on.
 *
 * @returns {{hex:string, sampled:number, distinct:number}|undefined} undefined when the box falls outside the image
 */
export function sampleBackground(image, box, origin = { x: 0, y: 0 }, ring = SAMPLE_RING_PX) {
	if (image === undefined || box === undefined) return undefined;
	const left = Math.max(0, Math.floor(box.x - origin.x - ring));
	const top = Math.max(0, Math.floor(box.y - origin.y - ring));
	const right = Math.min(image.width - 1, Math.ceil(box.x + box.width - origin.x + ring));
	const bottom = Math.min(image.height - 1, Math.ceil(box.y + box.height - origin.y + ring));
	const innerLeft = Math.floor(box.x - origin.x);
	const innerTop = Math.floor(box.y - origin.y);
	const innerRight = Math.ceil(box.x + box.width - origin.x);
	const innerBottom = Math.ceil(box.y + box.height - origin.y);
	const counts = new Map();
	let sampled = 0;
	for (let y = top; y <= bottom; y += 1) {
		for (let x = left; x <= right; x += 1) {
			if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) continue;
			const hex = pixelHex(image, x, y);
			counts.set(hex, (counts.get(hex) ?? 0) + 1);
			sampled += 1;
		}
	}
	if (sampled === 0) return undefined;
	let hex = "";
	let best = 0;
	for (const [candidate, count] of counts) {
		if (count > best) {
			hex = candidate;
			best = count;
		}
	}
	return { hex, sampled, distinct: counts.size };
}

/**
 * Read what a painted surface fills itself with, from a band just inside its own edge.
 *
 * The band is inside on purpose, and inset on purpose. A label the kit draws sits in a box equal to the
 * chip rectangle behind it, and the engine draws that rectangle's border as a 1 px inset shadow: sampling
 * outside the text box (measured 2026-11-18) read the header band's cyan through that border and reported
 * a chip label as 1.81:1 when its own fill measures 13.40:1. Reading inside the surface, past its border,
 * is the colour the text actually sits on.
 *
 * That answer belongs to a surface that is the text's own plate. Read for a label sitting deep inside a
 * surface the size of the window, this band is that surface's four sides, far from the label: measured the
 * same day it returned `#ffffff` for a white rail tab painted on a cyan gradient tab (1:1) and moved an
 * invisible cyan-on-cyan "Ready" out of `VIEW-RENDER-05` into a 2.44:1 `VIEW-RENDER-04`.
 * `bandInsideSurface` is what decides which band answers which label.
 *
 * @returns {{hex:string, sampled:number, distinct:number}|undefined} undefined when the inset region is too small to read
 */
export function sampleInterior(image, box, origin = { x: 0, y: 0 }, inset = SAMPLE_INSET_PX, band = SAMPLE_RING_PX) {
	if (image === undefined || box === undefined) return undefined;
	const left = Math.max(0, Math.floor(box.x - origin.x + inset));
	const top = Math.max(0, Math.floor(box.y - origin.y + inset));
	const right = Math.min(image.width - 1, Math.ceil(box.x + box.width - origin.x - inset));
	const bottom = Math.min(image.height - 1, Math.ceil(box.y + box.height - origin.y - inset));
	if (right - left < 1 || bottom - top < 1) return undefined;
	const counts = new Map();
	let sampled = 0;
	const read = (x, y) => {
		const hex = pixelHex(image, x, y);
		counts.set(hex, (counts.get(hex) ?? 0) + 1);
		sampled += 1;
	};
	// A frame, not the whole interior: the glyphs live in the middle of the surface, and the question is
	// what colour is behind them. A surface too thin to hold a frame is read whole.
	const framed = right - left >= band * 2 && bottom - top >= band * 2;
	if (!framed) {
		for (let y = top; y <= bottom; y += 1) for (let x = left; x <= right; x += 1) read(x, y);
	} else {
		for (let x = left; x <= right; x += 1) {
			for (let d = 0; d < band; d += 1) {
				read(x, top + d);
				read(x, bottom - d);
			}
		}
		for (let y = top + band; y <= bottom - band; y += 1) {
			for (let d = 0; d < band; d += 1) {
				read(left + d, y);
				read(right - d, y);
			}
		}
	}
	if (sampled === 0) return undefined;
	let hex = "";
	let best = 0;
	for (const [candidate, count] of counts) {
		if (count > best) {
			hex = candidate;
			best = count;
		}
	}
	return { hex, sampled, distinct: counts.size };
}

/**
 * How much of the band around a text box lies inside the surface the DOM says holds it.
 *
 * The two samplers answer opposite questions, and this decides between them. A band outside a label that
 * is flush with its plate reads through the plate's border onto whatever is behind the plate; a band just
 * inside the edge of a large surface reads that surface's own four sides, nowhere near the label. A
 * fraction near 1 means the band is already inside the holder, so it is the colour behind the text and the
 * ring sampler answers it. A fraction near 0 means the label is the plate, so the holder's inset frame does.
 *
 * @param box - The text box.
 * @param surfaceBox - The painted element the DOM puts the text on.
 * @returns The fraction, 0..1, of the band pixels sitting at least `inset` inside the surface.
 */
export function bandInsideSurface(box, surfaceBox, ring = SAMPLE_RING_PX, inset = SAMPLE_INSET_PX) {
	if (box === undefined || surfaceBox === undefined) return 1;
	const left = Math.floor(box.x - ring);
	const top = Math.floor(box.y - ring);
	const right = Math.ceil(box.x + box.width + ring);
	const bottom = Math.ceil(box.y + box.height + ring);
	const innerLeft = Math.floor(box.x);
	const innerTop = Math.floor(box.y);
	const innerRight = Math.ceil(box.x + box.width);
	const innerBottom = Math.ceil(box.y + box.height);
	const holdLeft = Math.floor(surfaceBox.x + inset);
	const holdTop = Math.floor(surfaceBox.y + inset);
	const holdRight = Math.ceil(surfaceBox.x + surfaceBox.width - inset);
	const holdBottom = Math.ceil(surfaceBox.y + surfaceBox.height - inset);
	let total = 0;
	let inside = 0;
	for (let y = top; y <= bottom; y += 1) {
		for (let x = left; x <= right; x += 1) {
			if (x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom) continue;
			total += 1;
			if (x >= holdLeft && x <= holdRight && y >= holdTop && y <= holdBottom) inside += 1;
		}
	}
	return total === 0 ? 1 : inside / total;
}

/**
 * The pixel inside a box that stands out most from a given colour, and by how far.
 *
 * Distance 0 means the box holds nothing but that colour: whatever was meant to be
 * drawn there was drawn in the colour behind it.
 */
/** `#rrggbb` to its three channels; `colour()` returns the hex string, not the numbers. */
function hexChannels(hex) {
	return [1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16));
}

export function strongestPixel(image, box, origin = { x: 0, y: 0 }, against = "#000000") {
	if (image === undefined || box === undefined) return undefined;
	const baseHex = colour(against);
	if (baseHex === undefined) return undefined;
	const base = hexChannels(baseHex);
	const left = Math.max(0, Math.floor(box.x - origin.x));
	const top = Math.max(0, Math.floor(box.y - origin.y));
	const right = Math.min(image.width - 1, Math.ceil(box.x + box.width - origin.x) - 1);
	const bottom = Math.min(image.height - 1, Math.ceil(box.y + box.height - origin.y) - 1);
	let hex = "";
	let distance = -1;
	for (let y = top; y <= bottom; y += 1) {
		for (let x = left; x <= right; x += 1) {
			const candidate = pixelHex(image, x, y);
			const channels = hexChannels(candidate);
			const spread = Math.sqrt((channels[0] - base[0]) ** 2 + (channels[1] - base[1]) ** 2 + (channels[2] - base[2]) ** 2);
			if (spread > distance) {
				hex = candidate;
				distance = spread;
			}
		}
	}
	if (distance < 0) return undefined;
	return { hex, distance: Math.round(distance * 100) / 100 };
}

function isBeneath(candidate, surface) {
	let walker = candidate.parent;
	while (walker !== undefined) {
		if (walker === surface) return true;
		walker = walker.parent;
	}
	return false;
}

/**
 * Decide whether a rendered surface is painted, reading the overlay the engine paints it with.
 *
 * A typed element's own `backgroundColor` is transparent on this runtime: the fill
 * lives on an untyped child div written `width:100%; height:100%` (measured
 * 2026-11-17 - a card's `[data-type="rectangle"]` computes `rgba(0,0,0,0)` and its
 * child paints `rgb(19,35,47)`). Judging the typed element alone reports every card
 * as unpainted, which is what kept the empty-band rule silent on a card that visibly
 * held content in 90 px of a 247 px box.
 */
export function surfacePaint(entry, flat) {
	const own = paintedColour(entry.background);
	if (own !== undefined) return own;
	for (const candidate of flat) {
		if (candidate.index <= entry.index) continue;
		if (!isBeneath(candidate, entry)) continue;
		const paint = paintedColour(candidate.background);
		if (paint === undefined) continue;
		if (area(candidate.box) < area(entry.box) * SURFACE_OVERLAY_COVERAGE) continue;
		return paint;
	}
	return undefined;
}

/**
 * Walk the served page and hand back a normalized tree.
 *
 * This function is evaluated **inside the browser**, so it closes over nothing
 * from this module: every constant it needs is declared in its own body. The DOM
 * surface it uses is deliberately small and documented - `document.body`,
 * `document.querySelector`, `element.children`, `element.dataset`,
 * `element.textContent`, `element.getBoundingClientRect()`, `getComputedStyle` -
 * so the spec can run it against a fake DOM and pin that contract.
 *
 * @param options - `{max_nodes, max_depth}`.
 * @param env - Node-side override `{document, getComputedStyle, innerWidth, innerHeight}` for tests. Omitted in the page.
 * @returns `{viewport, window_element, canvas_box, nodes, counted, text, skipped, truncated}`.
 */
export function measureDom(options = {}, env = {}) {
	const MAX_NODES = options.max_nodes ?? 4000;
	const MAX_DEPTH = options.max_depth ?? 40;
	const doc = env.document ?? globalThis.document;
	const computed = env.getComputedStyle ?? ((element) => globalThis.getComputedStyle(element));
	const viewport = {
		width: env.innerWidth ?? globalThis.innerWidth,
		height: env.innerHeight ?? globalThis.innerHeight
	};
	const counted = {
		counted: 0,
		text: 0,
		skipped: 0,
		truncated: false
	};
	const round = (value) => Math.round(value * 10) / 10;
	const boxOf = (element) => {
		const rect = element.getBoundingClientRect();
		if (rect === undefined || rect === null || rect.width <= 0 || rect.height <= 0) {
			counted.skipped += 1;
			return undefined;
		}
		return {
			x: round(rect.x),
			y: round(rect.y),
			width: round(rect.width),
			height: round(rect.height)
		};
	};
	// A walk returns the nodes to attach, not one node: a container the browser gave no box to is not a
	// measurement, but it is not empty either. The runtime's own `#root` measures 1264x0 because its
	// window is positioned inside it, and the whole application hangs under that collapsed div. Stopping
	// at a zero box reports an empty page for a screen that rendered.
	const walk = (element, depth) => {
		if (counted.counted >= MAX_NODES || depth > MAX_DEPTH) {
			counted.truncated = true;
			return [];
		}
		const box = boxOf(element);
		if (box === undefined) {
			const bubbled = [];
			for (const child of element.children ?? []) {
				bubbled.push(...walk(child, depth + 1));
			}
			return bubbled;
		}
		const style = computed(element);
		const node = {
			type: ((element.dataset === undefined ? "" : element.dataset.type) ?? "").toLowerCase() || undefined,
			tag: element.tagName === undefined ? "" : String(element.tagName).toLowerCase(),
			box,
			color: style === undefined ? undefined : style.color,
			background: style === undefined ? undefined : style.backgroundColor,
			font_size: style === undefined ? undefined : style.fontSize,
			children: []
		};
		counted.counted += 1;
		for (const child of element.children ?? []) {
			node.children.push(...walk(child, depth + 1));
		}
		if (node.children.length === 0) {
			const text = (element.textContent ?? "").trim().split(/\s+/u).filter(Boolean).join(" ");
			if (text !== "") {
				node.text = text;
				counted.text += 1;
			}
		}
		return [node];
	};
	const nodes = [];
	const body = doc === undefined ? undefined : doc.body;
	if (body !== undefined && body !== null) {
		for (const child of body.children ?? []) {
			nodes.push(...walk(child, 1));
		}
	}
	const boxFrom = (element) => {
		if (element === undefined || element === null) return undefined;
		const rect = element.getBoundingClientRect();
		if (rect === undefined || rect === null || !(rect.width > 0) || !(rect.height > 0)) return undefined;
		return {
			x: round(rect.x),
			y: round(rect.y),
			width: round(rect.width),
			height: round(rect.height)
		};
	};
	const query = typeof doc?.querySelector === "function" ? (selector) => doc.querySelector(selector) : () => undefined;
	// The served window is the runtime's own window element. A canvas is the fallback for an engine that
	// paints one; this project's page has none at all, so a canvas-only assumption measures nothing.
	const window_element = boxFrom(query('[data-type="window"]'));
	const canvas_box = boxFrom(query("canvas"));
	return {
		viewport,
		window_element,
		canvas_box,
		nodes,
		...counted
	};
}

/**
 * Depth-first list of a measured tree.
 *
 * Each entry carries its rendered type `chain` - what a finding is located by,
 * since the DOM reports no project path - a `parent` link, and a document-order `index`, so a rule can ask
 * what was painted under an element and what text lies on a surface without re-scanning the page.
 *
 * @param nodes - Tree from `measureDom`.
 * @param chain - Names accumulated from the root. Internal.
 * @param parent - The entry above. Internal.
 * @returns Every measured element with a box, deepest fields last.
 */
export function flattenTree(nodes, chain = [], parent = undefined) {
	const out = [];
	for (const node of nodes ?? []) {
		const entry = {
			...node,
			chain: [...chain, node.type ?? node.tag ?? ""],
			parent
		};
		out.push(entry);
		out.push(...flattenTree(node.children, entry.chain, entry));
	}
	// Pre-order is paint order: an element painted earlier has the smaller index. Two rules need that
	// because the runtime paints a fill as a SIBLING underlay, not as an ancestor - a card's rectangle and
	// its labels are siblings, so parent links alone find no card under the text and no text under the card.
	out.forEach((entry, index) => {
		entry.index = index;
	});
	return out;
}

/**
 * The box the runtime drew its window into.
 *
 * The runtime's own `[data-type="window"]` element is the served window and is the authority. A canvas is
 * the fallback for an engine that paints one — this project's served page has no canvas at all, so a
 * canvas-only rule measures an empty page. The largest painted box is the last resort, and it is a guess.
 */
export function windowBox(report) {
	if (report.window_element !== undefined) return report.window_element;
	if (report.canvas_box !== undefined) return report.canvas_box;
	let best;
	for (const entry of flattenTree(report.nodes)) {
		if (best === undefined || area(entry.box) > area(best)) best = entry.box;
	}
	return best;
}

/** `rgb(226, 232, 240)` or `rgba(19, 35, 47, 0)` to `{hex, alpha}`; alpha 0 means nothing was painted. */
export function paintedColour(value) {
	if (typeof value !== "string") return undefined;
	const text = value.trim().toLowerCase();
	if (text === "transparent" || text === "none") return undefined;
	const channels = /^rgba?\(([^)]*)\)$/u.exec(text);
	if (channels !== null) {
		const parts = channels[1].split(",").map((part) => Number.parseFloat(part.trim()));
		if (parts.length < 3 || parts.slice(0, 3).some((part) => !Number.isFinite(part))) return undefined;
		const alpha = parts.length >= 4 ? parts[3] : 1;
		if (alpha <= 0) return undefined;
		return {
			hex: `#${parts.slice(0, 3).map((part) => Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0")).join("")}`,
			alpha
		};
	}
	const hex = colour(text);
	return hex === undefined ? undefined : {
		hex,
		alpha: 1
	};
}

/** Pixels out of a computed `font-size`. */
function fontOf(value) {
	if (typeof value !== "string" && typeof value !== "number") return undefined;
	const parsed = Number.parseFloat(String(value));
	return Number.isFinite(parsed) ? parsed : undefined;
}

function area(box) {
	return box.width * box.height;
}

function clipTo(box, surface) {
	const x = Math.max(box.x, surface.x);
	const y = Math.max(box.y, surface.y);
	const right = Math.min(box.x + box.width, surface.x + surface.width);
	const bottom = Math.min(box.y + box.height, surface.y + surface.height);
	if (right <= x || bottom <= y) return undefined;
	return {
		x,
		y,
		width: right - x,
		height: bottom - y
	};
}

function union(boxes) {
	let x = Number.POSITIVE_INFINITY;
	let y = Number.POSITIVE_INFINITY;
	let right = Number.NEGATIVE_INFINITY;
	let bottom = Number.NEGATIVE_INFINITY;
	for (const box of boxes) {
		x = Math.min(x, box.x);
		y = Math.min(y, box.y);
		right = Math.max(right, box.x + box.width);
		bottom = Math.max(bottom, box.y + box.height);
	}
	if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;
	return {
		x,
		y,
		width: right - x,
		height: bottom - y
	};
}

/** How a finding names an element the model has no path for. */
function locate(entry) {
	const chain = entry.chain.filter((part) => part !== "");
	return chain.length > 0 ? chain.join(" > ") : entry.tag;
}

/** The point a rule samples for one element. */
function centerOf(box) {
	return {
		x: box.x + box.width / 2,
		y: box.y + box.height / 2
	};
}

function covers(box, point) {
	return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

/**
 * What the browser actually painted under one element at the point it sits on.
 *
 * Ancestors are candidates (pre-order puts them earlier), but so is a sibling underlay: the runtime draws a
 * card's or a header band's fill as a `rectangle` element beside the labels, not above them. The topmost
 * painted candidate that came before this element is what a reader sees behind it. The approximation is
 * DOM order, so a `z-index` or a positioned overlay that reorders paint can mislead this; nothing in this
 * project's served page does.
 */
function paintUnder(entry, flat) {
	const point = centerOf(entry.box);
	let best;
	for (const candidate of flat) {
		if (candidate.index >= entry.index) continue;
		if (!covers(candidate.box, point)) continue;
		if (paintedColour(candidate.background) === undefined) continue;
		if (best === undefined || candidate.index > best.index) best = candidate;
	}
	return best;
}

/**
 * The text a reader sees on one painted surface, whatever element holds it.
 *
 * A wrapper the engine sizes to its container is not content of the surface it happens to overlap, so an
 * entry bigger than the surface is not counted.
 */
function textOver(surface, flat) {
	const out = [];
	for (const entry of flat) {
		if (entry.index <= surface.index) continue;
		if (typeof entry.text !== "string" || entry.text === "") continue;
		if (area(entry.box) > area(surface.box)) continue;
		if (!covers(surface.box, centerOf(entry.box))) continue;
		out.push(entry);
	}
	return out;
}

/**
 * Decide the render rules over one measured page.
 *
 * @param report - What `measureDom` returned.
 * @param options - `{png, origin}`: the captured screenshot of the same page and where its
 *   top-left corner sits in the browser viewport. With the pixels, the colour rules read what
 *   was painted; without them they fall back to the DOM, which misses a gradient or an inset
 *   border, and say so in `unchecked`.
 * @returns `{findings, unchecked, measured}` in the finding shape `designFindings` uses.
 */
export function renderFindings(report, options = {}) {
	const findings = [];
	const unchecked = [];
	const flat = flattenTree(report?.nodes);
	const textNodes = flat.filter((entry) => typeof entry.text === "string" && entry.text !== "");
	if (flat.length === 0) {
		unchecked.push("the served page reported no element with a box: nothing was measured");
		return {
			findings,
			unchecked,
			measured: {
				elements: 0,
				text_elements: 0
			}
		};
	}
	if (report.truncated) unchecked.push(`the page holds more elements than max_nodes/max_depth allow; ${report.skipped} took no space and were skipped`);
	const canvas = windowBox(report);
	if (canvas === undefined) unchecked.push("no canvas and no element box was reported, so nothing can be judged against the served window");
	const origin = options.origin ?? { x: 0, y: 0 };
	const image = decodePng(options.png);
	if (options.png !== undefined && image === undefined) {
		unchecked.push("the captured image could not be decoded (only an 8-bit non-interlaced RGB or RGBA PNG reads), so the colour rules fell back to the DOM");
	}

	// VIEW-RENDER-01: the value never arrived, so a placeholder got painted in its place.
	for (const entry of textNodes) {
		if (!PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(entry.text))) continue;
		findings.push({
			rule: "VIEW-RENDER-01",
			severity: "warning",
			message: `Rendered text "${entry.text}" is a placeholder, not a value: the control that should drive it is drawing its own default.`,
			evidence: {
				located_at: locate(entry),
				text: entry.text,
				box: entry.box,
				measured_from: "the text the browser painted"
			}
		});
	}

	// VIEW-RENDER-02: a surface big enough to hold content, holding it in a band at the top.
	for (const entry of flat) {
		if (entry.type === undefined || !SURFACE_TYPES.has(entry.type)) continue;
		// `surfacePaint`, not the element's own colour: the runtime paints a surface through an
		// untyped overlay child, so judging `entry.background` calls every card unpainted.
		if (surfacePaint(entry, flat) === undefined) continue;
		const leaves = textOver(entry, flat);
		if (leaves.length < MIN_TEXT_LEAVES) continue;
		const inside = leaves
			.map((leaf) => clipTo(leaf.box, entry.box))
			.filter((box) => box !== undefined);
		if (inside.length === 0) continue;
		const extent = union(inside);
		if (extent === undefined) continue;
		const coverage = area(clipTo(extent, entry.box) ?? extent) / area(entry.box);
		const empty = entry.box.height - extent.height;
		if (coverage >= COVERAGE_MINIMUM || empty < EMPTY_BAND_MINIMUM) continue;
		findings.push({
			rule: "VIEW-RENDER-02",
			severity: "warning",
			message: `${locate(entry)} renders ${leaves.length} text elements filling ${Math.round(coverage * 100)}% of its ${entry.box.width}x${entry.box.height} box, leaving ${Math.round(empty)} px of painted surface empty.`,
			evidence: {
				located_at: locate(entry),
				box: entry.box,
				text_elements: leaves.length,
				coverage: Math.round(coverage * 100) / 100,
				empty_px: Math.round(empty),
				minimum: COVERAGE_MINIMUM,
				measured_from: "the painted text boxes inside the rendered surface"
			}
		});
	}

	// VIEW-RENDER-03: drawn outside the box the runtime serves.
	// Only a painted surface or a control is judged. The Web presentation engine gives a `label` element a
	// container-sized box (measured 2026-11-17: a header label element reported 1280x800 at (16,12) while the
	// text it painted was 22.6x16 at (860,18)), so judging every element reports the vendor's own wrappers as
	// overflow. The defect this rule exists for is the measured one: a `rectangle` child designed 900 wide
	// rendered 1192.5 px and starved its sibling to zero.
	if (canvas !== undefined) {
		for (const entry of flat) {
			if (entry.type === undefined) continue;
			if (!SURFACE_TYPES.has(entry.type) && !RENDERED_TARGET_TYPES.has(entry.type)) continue;
			const over = {
				left: canvas.x - entry.box.x,
				top: canvas.y - entry.box.y,
				right: entry.box.x + entry.box.width - (canvas.x + canvas.width),
				bottom: entry.box.y + entry.box.height - (canvas.y + canvas.height)
			};
			const worst = Math.max(over.left, over.top, over.right, over.bottom);
			if (worst <= OVERFLOW_TOLERANCE) continue;
			findings.push({
				rule: "VIEW-RENDER-03",
				severity: "warning",
				message: `${locate(entry)} is drawn ${Math.round(worst)} px outside the ${canvas.width}x${canvas.height} box the runtime serves; the runtime clips there instead of shrinking it.`,
				evidence: {
					located_at: locate(entry),
					box: entry.box,
					window_box: canvas,
					over_px: {
						left: Math.max(0, Math.round(over.left)),
						top: Math.max(0, Math.round(over.top)),
						right: Math.max(0, Math.round(over.right)),
						bottom: Math.max(0, Math.round(over.bottom))
					},
					measured_from: "the painted box against the served canvas"
				}
			});
		}
	}

	// VIEW-RENDER-04 and VIEW-RENDER-05: read the captured pixels when there are any.
	// The engine paints a fill through an untyped overlay child and a NavigationPanel paints its tabs with a
	// `background-image` gradient, so a computed `backgroundColor` is not what a reader sees behind the text;
	// the pixels are. The DOM supplies which surface holds the text and the text's own colour; the pixels
	// supply what that surface is filled with.
	for (const entry of textNodes) {
		const foreground = paintedColour(entry.color);
		// The surface the text sits on is decided by the DOM (which painted element covers this point, latest
		// first). Its colour comes from the band around the text box when that band is already inside the
		// surface, and from the surface's own inset frame when the text box is flush with it - the chip whose
		// label fills it. A gradient tab has no `backgroundColor` to find, so it falls through to the band
		// outside the text box, which is where a gradient is visible.
		const holder = paintUnder(entry, flat);
		const plate = holder !== undefined && bandInsideSurface(entry.box, holder.box) < BAND_INSIDE_MINIMUM;
		const inside = plate && image !== undefined ? sampleInterior(image, holder.box, origin) : undefined;
		const sampled = image === undefined ? undefined : (inside ?? sampleBackground(image, entry.box, origin));
		const from = inside === undefined ? "the captured pixels in the band around the text box" : `the captured pixels inside ${locate(holder)}, past its border`;
		if (sampled !== undefined) {
			const drawn = strongestPixel(image, entry.box, origin, sampled.hex);
			if (drawn === undefined) {
				unchecked.push(`${locate(entry)}: its box fell outside the captured image, so nothing was read under it`);
				continue;
			}
			// VIEW-RENDER-05: the box holds one colour. Whatever was meant to be drawn there was drawn in
			// the colour behind it, so the operator cannot read it at all - a weaker claim than a ratio,
			// and the reason a same-colour label never reaches VIEW-RENDER-04.
			if (drawn.distance <= INVISIBLE_MAX_DISTANCE) {
				findings.push({
					rule: "VIEW-RENDER-05",
					severity: "warning",
					message: `${locate(entry)} paints "${entry.text}" in ${sampled.hex}: its captured box holds no pixel more than ${drawn.distance} away from the colour behind it, so nothing there is readable.`,
					evidence: {
						located_at: locate(entry),
						text: entry.text,
						color: foreground?.hex ?? drawn.hex,
						background: sampled.hex,
						pixel_distance: drawn.distance,
						maximum: INVISIBLE_MAX_DISTANCE,
						sampled_px: sampled.sampled,
						measured_from: `${from} and inside the text box`
					}
				});
				continue;
			}
			const against = foreground?.hex ?? drawn.hex;
			const ratio = contrastRatio(against, sampled.hex);
			if (ratio >= CONTRAST_MINIMUM) continue;
			findings.push({
				rule: "VIEW-RENDER-04",
				severity: "warning",
				message: `${locate(entry)} paints "${entry.text}" as ${against} on ${sampled.hex}: ${Math.round(ratio * 100) / 100}:1, under the ${CONTRAST_MINIMUM}:1 the corpus holds.`,
				evidence: {
					located_at: locate(entry),
					text: entry.text,
					color: against,
					background: sampled.hex,
					ratio: Math.round(ratio * 100) / 100,
					pixel_distance: drawn.distance,
					sampled_px: sampled.sampled,
					measured_from: from
				}
			});
			continue;
		}
		// No captured image: the DOM path, which finds an overlay sibling but not a gradient or an inset border.
		if (foreground === undefined) {
			unchecked.push(`${locate(entry)}: the browser reported no readable text colour`);
			continue;
		}
		// `holder` was already resolved above, from the same DOM, for the pixel path.
		if (holder === undefined) {
			unchecked.push(`${locate(entry)}: nothing painted was found under it, so contrast was not judged`);
			continue;
		}
		const background = paintedColour(holder.background);
		const ratio = contrastRatio(foreground.hex, background.hex);
		if (ratio >= CONTRAST_MINIMUM) continue;
		findings.push({
			rule: "VIEW-RENDER-04",
			severity: "warning",
			message: `${locate(entry)} paints "${entry.text}" as ${foreground.hex} on ${background.hex}: ${Math.round(ratio * 100) / 100}:1, under the ${CONTRAST_MINIMUM}:1 the corpus holds.`,
			evidence: {
				located_at: locate(entry),
				text: entry.text,
				color: foreground.hex,
				background: background.hex,
				ratio: Math.round(ratio * 100) / 100,
				measured_from: "the colours the browser resolved for the text and what it painted under it, with no captured image to read"
			}
		});
	}

	// HMI-TARGET-01 and VIEW-TYPE-02, re-decided on the painted box and the painted font.
	for (const entry of flat) {
		if (entry.type !== undefined && RENDERED_TARGET_TYPES.has(entry.type)) {
			const side = Math.min(entry.box.width, entry.box.height);
			if (side < TOUCH_MINIMUM) findings.push({
				rule: "HMI-TARGET-01",
				severity: "warning",
				message: `${locate(entry)} renders ${entry.box.width}x${entry.box.height}; the target minimum is ${TOUCH_MINIMUM}px. The model can report a size the runtime does not draw.`,
				evidence: {
					located_at: locate(entry),
					box: entry.box,
					measured_from: "the rendered box"
				}
			});
		}
		const size = fontOf(entry.font_size);
		// A container can inherit a small font and paint no text of its own; only text that was drawn is a readable floor question.
		if (typeof entry.text !== "string" || entry.text === "" || size === undefined || size >= MIN_FONT_SIZE) continue;
		findings.push({
			rule: "VIEW-TYPE-02",
			severity: "warning",
			message: `${locate(entry)} paints text at ${size}px, under the ${MIN_FONT_SIZE}px readable floor; a ScaleLayout fit factor shrinks text the model records as readable.`,
			evidence: {
				located_at: locate(entry),
				font_size: size,
				...(entry.text === undefined ? {} : { text: entry.text }),
				measured_from: "the computed font-size the browser applied"
			}
		});
	}

	return {
		findings,
		// A page can hold hundreds of text elements the same rule cannot judge; the count is the honest part.
		unchecked: unchecked.length > UNCHECKED_REPORTED
			? [...unchecked.slice(0, UNCHECKED_REPORTED), `and ${unchecked.length - UNCHECKED_REPORTED} more unjudgeable element(s) not listed`]
			: unchecked,
		measured: {
			elements: flat.length,
			text_elements: textNodes.length,
			unchecked_total: unchecked.length,
			viewport: report.viewport,
			// Which route judged the colour rules matters to the reader: a DOM-only judgement
			// cannot see a gradient or an inset border.
			paint_read: image === undefined ? "dom" : "captured pixels",
			...(canvas === undefined ? {} : { window_box: canvas }),
			thresholds: {
				coverage: COVERAGE_MINIMUM,
				empty_band_px: EMPTY_BAND_MINIMUM,
				contrast: CONTRAST_MINIMUM,
				touch_px: TOUCH_MINIMUM,
				font_px: MIN_FONT_SIZE,
				pixel_distance: INVISIBLE_MAX_DISTANCE
			}
		}
	};
}
