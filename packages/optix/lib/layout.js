/**
 * Layout arithmetic for designed screens: the grid, the regions, and the refusals.
 *
 * A kit component is a rectangle with content in it, so the one mistake that makes a generated
 * screen look amateur is arithmetic: a card that overflows the canvas, two cards that overlap,
 * a row of five buttons that fit only if nothing has a margin. This module owns that arithmetic
 * and refuses instead of drawing something that cannot look right. Everything is pure, so a
 * blueprint can be planned, tested and refused without a Studio or a bridge.
 *
 * Units are Optix `Size` values in pixels at the design canvas size (the window's Width/Height).
 * The screen's own design language is applied separately by `theme.js`; layout never picks a colour.
 */

/** A layout refusal carries a code so a caller can name it instead of parsing a sentence. */
export class LayoutError extends Error {
	/**
	 * @param code - Stable machine-readable refusal, such as `layout_overflow`.
	 * @param message - One sentence saying what would not fit and by how much.
	 */
	constructor(code, message) {
		super(message);
		this.name = "LayoutError";
		this.code = code;
	}
}

/** A refused placement is a `LayoutError` with a code, never a silent clamp. */
function refuse(code, message) {
	throw new LayoutError(code, message);
}

/** The default outer padding of a screen region, in pixels. */
export const PAD = 24;
/** The default gap between siblings, in pixels. */
export const GUTTER = 20;
/** The smallest comfortable touch target (HMI-TARGET-01): 44 by 44 pixels. */
export const MIN_TARGET = 44;
/** The header band is this tall on a designed screen; the status strip is `FOOTER` tall. */
export const HEADER = 88;
/** The status strip height. */
export const FOOTER = 56;
/** The 12-column grid the kit places into. */
export const COLUMNS = 12;

/**
 * The width classes a layout may answer to. A blueprint that names no width is laid out for the
 * window it is drawn in; these exist so a generated screen can be judged the way a web page is.
 */
export const WIDTH_CLASSES = [
	{ name: "compact", max: 1200 },
	{ name: "standard", max: 1700 },
	{ name: "wide", max: Number.POSITIVE_INFINITY }
];

/**
 * Classify a canvas width.
 *
 * @param width - Canvas width in pixels.
 * @returns The width class name: `compact`, `standard` or `wide`.
 */
export function widthClass(width) {
	if (!Number.isFinite(width) || width <= 0) refuse("layout_invalid_canvas", `a canvas needs a positive width in pixels, not ${String(width)}`);
	return WIDTH_CLASSES.find((entry) => width <= entry.max).name;
}

/**
 * A rectangle in canvas pixels. Every region, slot and component box is one of these.
 *
 * @param left - Left margin.
 * @param top - Top margin.
 * @param width - Width.
 * @param height - Height.
 * @returns The rectangle.
 */
export function rect(left, top, width, height) {
	return { left, top, width, height };
}

/**
 * The grid for a canvas: the usable width after the outer padding, one column and every column start.
 *
 * @param width - Canvas width.
 * @param options - `pad` (outer padding) and `gutter` (space between columns).
 * @returns `{width, pad, gutter, columns, column, usable, starts}`.
 */
export function grid(width, { pad = PAD, gutter = GUTTER } = {}) {
	if (!Number.isFinite(width) || width <= 0) refuse("layout_invalid_canvas", `a grid needs a positive width, not ${String(width)}`);
	const usable = width - 2 * pad;
	if (usable <= 0) refuse("layout_overflow", `a ${width}px canvas leaves no usable width after ${pad * 2}px of padding`);
	const column = (usable - gutter * (COLUMNS - 1)) / COLUMNS;
	if (column < 24) refuse("layout_too_narrow", `a ${width}px canvas gives each of ${COLUMNS} columns ${column.toFixed(1)}px, under the 24px floor`);
	const starts = [];
	for (let index = 0; index < COLUMNS; index += 1) starts.push(pad + index * (column + gutter));
	return { width, pad, gutter, columns: COLUMNS, column, usable, starts };
}

/**
 * The content region of a canvas, after the outer padding and the header and footer bands.
 *
 * @param input - `width`, `height`, optional `header` and `footer` band heights and `pad`.
 * @returns The content rectangle.
 */
export function region({ width, height, header = HEADER, footer = 0, pad = PAD }) {
	if (!Number.isFinite(height) || height <= 0) refuse("layout_invalid_canvas", `a canvas needs a positive height in pixels, not ${String(height)}`);
	const contentHeight = height - header - footer - 2 * pad;
	if (contentHeight < 120) refuse("layout_overflow", `a ${height}px canvas leaves ${contentHeight.toFixed(0)}px of content between a ${header}px header, a ${footer}px footer and ${pad * 2}px of padding`);
	return rect(pad, header + pad, width - 2 * pad, contentHeight);
}

/**
 * Split a rectangle into rows (a stack) by weight.
 *
 * @param area - The rectangle to split.
 * @param weights - Relative heights; `[2, 1]` gives the first row twice the second.
 * @param options - `gutter` and `minHeight` (the floor every row must clear).
 * @returns One rectangle per weight, top to bottom.
 */
export function stack(area, weights = [1], { gutter = GUTTER, minHeight = MIN_TARGET } = {}) {
	if (weights.length === 0) refuse("layout_empty", "a stack needs at least one row");
	const gaps = gutter * (weights.length - 1);
	const free = area.height - gaps;
	if (free <= 0) refuse("layout_overflow", `${weights.length} rows cannot fit in ${area.height}px with ${gaps}px of gaps`);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	const rows = [];
	let top = area.top;
	for (const weight of weights) {
		const height = (free * weight) / total;
		if (height < minHeight) refuse("layout_overflow", `a row of ${height.toFixed(0)}px is under the ${minHeight}px floor in a ${area.height}px area`);
		rows.push(rect(area.left, top, area.width, height));
		top += height + gutter;
	}
	return rows;
}

/**
 * Split a rectangle into columns by weight.
 *
 * @param area - The rectangle to split.
 * @param weights - Relative widths.
 * @param options - `gutter` and `minWidth` (the floor every column must clear).
 * @returns One rectangle per weight, left to right.
 */
export function columns(area, weights = [1], { gutter = GUTTER, minWidth = 160 } = {}) {
	if (weights.length === 0) refuse("layout_empty", "columns need at least one entry");
	const gaps = gutter * (weights.length - 1);
	const free = area.width - gaps;
	if (free <= 0) refuse("layout_overflow", `${weights.length} columns cannot fit in ${area.width}px with ${gaps}px of gaps`);
	const total = weights.reduce((sum, weight) => sum + weight, 0);
	const boxes = [];
	let left = area.left;
	for (const weight of weights) {
		const width = (free * weight) / total;
		if (width < minWidth) refuse("layout_too_narrow", `a column of ${width.toFixed(0)}px is under the ${minWidth}px floor in a ${area.width}px area`);
		boxes.push(rect(left, area.top, width, area.height));
		left += width + gutter;
	}
	return boxes;
}

/**
 * Place components on one row of a region, evenly spaced, refusing what cannot fit at a usable size.
 *
 * @param area - The row rectangle.
 * @param count - How many components share the row.
 * @param options - `gutter` and `minWidth`.
 * @returns One slot per component.
 */
export function row(area, count, { gutter = GUTTER, minWidth = 160 } = {}) {
	if (!Number.isInteger(count) || count <= 0) refuse("layout_empty", `a row needs a positive component count, not ${String(count)}`);
	const needed = count * minWidth + (count - 1) * gutter;
	if (needed > area.width) refuse("layout_overflow", `${count} components need ${needed}px at ${minWidth}px each but the row is ${area.width.toFixed(0)}px wide`);
	return columns(area, Array.from({ length: count }, () => 1), { gutter, minWidth: 0 });
}

/**
 * Whether one rectangle contains another.
 *
 * @param outer - The container.
 * @param inner - The candidate.
 * @returns True when `inner` is fully inside `outer`.
 */
export function contains(outer, inner) {
	return inner.left >= outer.left - 0.5 && inner.top >= outer.top - 0.5 && inner.left + inner.width <= outer.left + outer.width + 0.5 && inner.top + inner.height <= outer.top + outer.height + 0.5;
}

/**
 * Whether two rectangles overlap by more than a rounding error.
 *
 * @param left - First rectangle.
 * @param right - Second rectangle.
 * @returns True when they share area.
 */
export function overlaps(left, right) {
	return left.left < right.left + right.width - 0.5 && right.left < left.left + left.width - 0.5 && left.top < right.top + right.height - 0.5 && right.top < left.top + left.height - 0.5;
}

/**
 * Refuse a slot that is too small to be a control or that escapes its container.
 *
 * @param slot - The placed rectangle.
 * @param what - A name for the refusal message.
 * @param options - `container` (must contain the slot), `minWidth` and `minHeight`.
 * @returns The slot, for chaining.
 */
export function requireSlot(slot, what, { container, minWidth = MIN_TARGET, minHeight = MIN_TARGET } = {}) {
	if (slot.width < minWidth || slot.height < minHeight) refuse("layout_overflow", `${what} would be ${slot.width.toFixed(0)}x${slot.height.toFixed(0)}px, under the ${minWidth}x${minHeight}px floor`);
	if (container !== undefined && !contains(container, slot)) refuse("layout_overflow", `${what} would escape its container (${slot.left.toFixed(0)},${slot.top.toFixed(0)} ${slot.width.toFixed(0)}x${slot.height.toFixed(0)})`);
	return slot;
}
