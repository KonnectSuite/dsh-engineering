/**
 * FTOptix.UI layout containers as `optix_edit` operations, without a Studio session.
 *
 * A screen built from absolute `LeftMargin`/`TopMargin` rectangles breaks the moment the canvas is a
 * different size: the rectangles stay where they were drawn and the panel is a letterboxed picture of a
 * screen rather than a layout. Optix ships real layout containers for this, and every one of them is a
 * widget type `create_widget` already carries (measured against the Studio 1.8.1.27 type catalogue and
 * bridge 1.0.9 on 2026-11-16):
 *
 * - `RowLayout` arranges its children left to right, `ContentAlignment`, `HorizontalGap`, `VerticalGap`;
 * - `ColumnLayout` arranges them top to bottom, `ContentAlignment`, `HorizontalGap`, `VerticalGap`;
 * - `ScaleLayout` scales one design canvas, `FillMode`, `OriginalWidth`, `OriginalHeight`, `FontScaling`;
 * - `GridLayout` places items in cells with `Columns`/`Rows` and a `GridLayoutProperties` child on every
 *   item - and it is the one container in this catalogue the module refuses to author.
 *
 * `GridLayout` is refused for two measured reasons (live on `AryaSMTLineDemo`, 2026-11-16 and 2026-11-17),
 * and `gridLayout()` emits what Rockwell's own shipped widgets use instead: a `ColumnLayout` holding one
 * `RowLayout` per row.
 *
 * 1. `Columns`/`Rows` are `String[]` on the live model. A `set_property` on them is refused with
 *    `unsupported_array_write` ("Array writes aren't supported via set_property - a scalar write to an
 *    array UA variable can crash Studio"), and the bridge's own guard comment (`StudioMCPBridge.cs:3982-3991`)
 *    records that a scalar write to an array variable has terminated Studio outright. `validate_ops` does
 *    not catch it for a node the batch is about to create - its catalogue declares `Columns` as `String` -
 *    so the refusal has to happen here, before the batch is sent.
 * 2. The per-cell `GridLayoutProperties` child was the last thing written before Studio died with a native
 *    `invalid unordered_map<K, T> key` in `HMISolution` (`FTOptixStudio.0.log`, 2026-11-16 21:23:34, then
 *    21:23:41; crash dump `FTOptixStudio.exe.10352.dmp`). The bridge creates that child happily (`via
 *    "proxy-property"`, `ColumnStart`/`RowStart` reading back perfectly), which is what makes it dangerous:
 *    nothing reported a failure.
 *
 * What replaces it is measured rendering, not a guess: two children at `Width -1` with
 * `HorizontalAlignment 3` split a 1060 px row into 530 + 20 gap + 514, and a `RowLayout` at `Height -1`
 * with `VerticalAlignment 3` took the whole leftover height (`optix-proof/smt/shots/probe-rc.png`,
 * 2026-11-17). Equal tracks therefore come from fill. An unequal track cannot be written as a `fr` template
 * at all, so it is written as the pixel width the geometry library already computed.
 *
 * Two measured constraints shape this module:
 *
 * 1. A layout container declares no fill or border of any kind - `Rectangle` is the only shape with
 *    `FillColor` - and the bridge refuses a property the type does not declare with `unknown_property`
 *    plus a valid list (`StudioMCPBridge.cs` around line 2174, measured 2026-11-16). A coloured band is
 *    therefore two nodes: the `Rectangle` that paints it and the layout container that arranges its
 *    contents. This module never writes `FillColor` on a container.
 * 2. A child of a layout is sized by its margins relative to the layout, not by a pinned box. The
 *    shipped starter proves the fill spelling: `Width` `-1.0` with `HorizontalAlignment` `3` (Stretch)
 *    means "container minus margins" (`templates/arya-optix-app/project/Nodes/UI/SettingsWidgets/
 *    SettingsWidgets.yaml`, measured 2026-11-16). `stretch()` and `stretchVertical()` emit exactly that.
 *
 * The module is a pure generator: it returns operation arrays and never touches Studio or the disk.
 * It deliberately does not import `screens.js` - screens imports this module, and a cycle between the
 * two would make an ESM import order decide which helper exists first.
 *
 * @module dsh-tool-ft-optix/containers
 */

/** The `Size` value that means "fill the layout minus the margins" (measured in the shipped starter YAML). */
export const FILL = -1;

/**
 * The widget type names the bridge resolves for FTOptix.UI layout, so callers never spell them by hand.
 *
 * `grid` and `gridProperties` are in the Studio catalogue and are named here so a refusal can cite them,
 * but nothing in this module creates either - see the module note.
 */
export const CONTAINERS = Object.freeze({
	scale: "ScaleLayout",
	column: "ColumnLayout",
	row: "RowLayout",
	grid: "GridLayout",
	gridProperties: "GridLayoutProperties",
});

/** `HorizontalAlignment`/`VerticalAlignment`: 0 Left/Top, 1 Right/Bottom, 2 Center, 3 Stretch (schema enums). */
export const ALIGN = Object.freeze({ LEFT: 0, RIGHT: 1, CENTER: 2, STRETCH: 3 });

/** `ContentHorizontalAlignment` of a `RowLayout`: 0 Left, 1 Center, 2 Right (schema enum, not `ALIGN`). */
export const CONTENT_ALIGN_ROW = Object.freeze({ LEFT: 0, CENTER: 1, RIGHT: 2 });

/** `ContentVerticalAlignment` of a `ColumnLayout`: 0 Top, 1 Center, 2 Bottom (schema enum, not `ALIGN`). */
export const CONTENT_ALIGN_COLUMN = Object.freeze({ TOP: 0, CENTER: 1, BOTTOM: 2 });

/** `FillModeEnum` of a `ScaleLayout`: 0 Fit (whole canvas visible), 1 Stretch (kills the aspect ratio). */
export const FILL_MODE = Object.freeze({ FIT: 0, STRETCH: 1 });

/**
 * Properties that are array-typed on the live model, so a scalar `set_property` on them is refused.
 *
 * Named from the bridge's own guard comment (`StudioMCPBridge.cs:3982-3991`): array-ness lives in
 * `ArrayDimensions` and the CLR proxy type, not in the `DataType` name, and a scalar write that reaches the
 * assign path has terminated Studio outright (`NodeId[] AliasNodeArray`, confirmed live 2026-07-16).
 */
export const ARRAY_VALUED_PROPERTIES = Object.freeze({
	Columns: { type: "GridLayout", array: "String[]", fix: "A grid is a ColumnLayout of RowLayouts: call gridLayout()." },
	Rows: { type: "GridLayout", array: "String[]", fix: "A grid is a ColumnLayout of RowLayouts: call gridLayout()." },
	AliasNodeArray: { type: "NavigationPanelItem", array: "NodeId[]", fix: "Set the item's own Panel pointer instead of its alias array." },
});

/**
 * A design rectangle, validated.
 *
 * Coordinates in this module are *container-relative*: the margin properties of a child are measured
 * from its parent, which is why a caller that wants a canvas-absolute box puts it on the direct child
 * of the canvas instead.
 *
 * @param {number} left - Left margin in pixels.
 * @param {number} top - Top margin in pixels.
 * @param {number} width - Width in pixels.
 * @param {number} height - Height in pixels.
 * @returns {{left: number, top: number, width: number, height: number}} The same four numbers, checked.
 * @throws {Error} when any of the four is not a finite number.
 */
export function frame(left, top, width, height) {
	for (const [name, value] of Object.entries({ left, top, width, height })) {
		if (!Number.isFinite(value)) throw new Error(`a layout frame needs a numeric ${name}`);
	}
	return { left, top, width, height };
}

/**
 * A `Size` property value spelled the way the shipped YAML spells it.
 *
 * Duplicated from `screens.js` on purpose: importing it would create the cycle the module note warns
 * about, and the spelling is one line of arithmetic. `-1` becomes `-1.0`, which is the fill value.
 *
 * @param {number} value - A number of pixels, or `FILL`.
 * @returns {string} The value as `"<integer>.0"`.
 */
export function sizeOf(value) {
	return `${Math.round(value)}.0`;
}

/**
 * One `set_property` operation.
 *
 * @param {string} path - Node path.
 * @param {string} name - Property name as the FTOptix.UI type declares it.
 * @param {string} value - Value as the bridge's string coercion expects it (enums accept their ordinal).
 * @returns {{op: "set_property", path: string, name: string, value: string}} The operation.
 */
export function set(path, name, value) {
	return { op: "set_property", path, name, value };
}

/**
 * One `create_widget` operation.
 *
 * @param {string} parent - Path of the node that will own the new widget.
 * @param {string} name - BrowseName of the new widget.
 * @param {string} type - Widget type the bridge resolves, such as `RowLayout`.
 * @returns {{op: "create_widget", screen: string, name: string, widget_type: string}} The operation.
 */
export function widget(parent, name, type) {
	return { op: "create_widget", screen: parent, name, widget_type: type };
}

/**
 * The four geometry properties, as operations.
 *
 * @param {string} path - Node path.
 * @param {{left: number, top: number, width: number, height: number}} box - The frame.
 * @returns {object[]} Four `set_property` operations, in the order the batch restates geometry.
 */
export function geometry(path, box) {
	return [set(path, "LeftMargin", sizeOf(box.left)), set(path, "TopMargin", sizeOf(box.top)), set(path, "Width", sizeOf(box.width)), set(path, "Height", sizeOf(box.height))];
}

/**
 * The margin properties that are present, as operations.
 *
 * @param {string} path - Node path.
 * @param {{left?: number, top?: number, right?: number, bottom?: number}} edges - Margins to write; absent
 *   edges are left as the model has them, so a repair pass does not clear a margin it did not set.
 * @returns {object[]} One `set_property` per present edge.
 */
export function margins(path, edges) {
	const ops = [];
	if (edges.left !== undefined) ops.push(set(path, "LeftMargin", sizeOf(edges.left)));
	if (edges.top !== undefined) ops.push(set(path, "TopMargin", sizeOf(edges.top)));
	if (edges.right !== undefined) ops.push(set(path, "RightMargin", sizeOf(edges.right)));
	if (edges.bottom !== undefined) ops.push(set(path, "BottomMargin", sizeOf(edges.bottom)));
	return ops;
}

/**
 * Create one layout container and place it.
 *
 * @param {string} parent - Path of the owning node.
 * @param {string} name - BrowseName of the container.
 * @param {string} type - One of `CONTAINERS`.
 * @param {object} options - `box` for all four edges at once, or `left`/`top`/`width`/`height`
 *   individually (children of a layout usually carry only `width`/`height`); `margins`; the alignment
 *   pair; the gaps and, for a grid, `columns`/`rows`.
 * @param {object} [options.box] - A `frame()` rectangle.
 * @param {number} [options.left] - Left margin; requires `top`.
 * @param {number} [options.top] - Top margin; requires `left`.
 * @param {number} [options.width] - Width, or `FILL`.
 * @param {number} [options.height] - Height, or `FILL`.
 * @param {object} [options.margins] - Edge margins written after the box.
 * @param {number} [options.horizontalAlignment] - `ALIGN` value. Defaults to `ALIGN.STRETCH` when `width` is
 *   `FILL`, because a fill without Stretch renders at the content size (measured 2026-11-17).
 * @param {number} [options.verticalAlignment] - `ALIGN` value. Defaults to `ALIGN.STRETCH` when `height` is
 *   `FILL`, for the same reason.
 * @param {number} [options.contentAlignment] - Content alignment; the enum depends on the orientation.
 * @param {number} [options.horizontalGap] - Gap between siblings, in pixels.
 * @param {number} [options.verticalGap] - Gap between siblings, in pixels.
 * @returns {{path: string, ops: object[]}} The node path and its operations, parent first.
 * @throws {Error} when only one of `left`/`top` is given, the type is not a layout container this module
 *   authors, or the caller asks for a grid track template, which the bridge cannot write.
 */
export function layout(parent, name, type, options = {}) {
	const path = `${parent}/${name}`;
	const authorable = [CONTAINERS.scale, CONTAINERS.column, CONTAINERS.row];
	if (!authorable.includes(type)) {
		if (type === CONTAINERS.grid || type === CONTAINERS.gridProperties) {
			throw new Error(`${type} is not authorable through the bridge: Columns/Rows are String[] and a scalar write to them is refused (unsupported_array_write), and the GridLayoutProperties child preceded a native Studio crash measured 2026-11-16. Use gridLayout(), which emits a ColumnLayout of RowLayouts`);
		}
		throw new Error(`${type} is not a layout container; use one of ${authorable.join(", ")}`);
	}
	if (options.columns !== undefined || options.rows !== undefined) {
		throw new Error(`layout ${path}: Columns/Rows are String[] on the live model and the bridge refuses them (unsupported_array_write) - a grid is a ColumnLayout of RowLayouts, so call gridLayout()`);
	}
	if (options.itemsHorizontalAlignment !== undefined || options.itemsVerticalAlignment !== undefined) {
		throw new Error(`layout ${path}: ItemsHorizontalAlignment/ItemsVerticalAlignment belong to a GridLayout, which this module does not author`);
	}
	const ops = [widget(parent, name, type)];
	if (options.box !== undefined) {
		ops.push(...geometry(path, options.box));
	} else {
		if ((options.left === undefined) !== (options.top === undefined)) throw new Error(`layout ${path} needs left and top together`);
		if (options.left !== undefined) ops.push(set(path, "LeftMargin", sizeOf(options.left)), set(path, "TopMargin", sizeOf(options.top)));
		if (options.width !== undefined) ops.push(set(path, "Width", sizeOf(options.width)));
		if (options.height !== undefined) ops.push(set(path, "Height", sizeOf(options.height)));
	}
	if (options.margins !== undefined) ops.push(...margins(path, options.margins));
	// A dimension only actually fills when Stretch is on the node as well as the -1 size. The probe that
	// measured 530 + 20 gap + 514 set both on each child; a child with the -1 alone renders at its content
	// size, which is what the first live SMT render showed on 2026-11-17 - four cards hugging their text
	// inside a 1060 px row. So a `FILL` size implies Stretch unless the caller names an alignment.
	const horizontal = options.horizontalAlignment ?? (options.width === FILL ? ALIGN.STRETCH : undefined);
	const vertical = options.verticalAlignment ?? (options.height === FILL ? ALIGN.STRETCH : undefined);
	if (horizontal !== undefined) ops.push(set(path, "HorizontalAlignment", String(horizontal)));
	if (vertical !== undefined) ops.push(set(path, "VerticalAlignment", String(vertical)));
	if (options.contentAlignment !== undefined) ops.push(set(path, "ContentAlignment", String(options.contentAlignment)));
	if (options.horizontalGap !== undefined) ops.push(set(path, "HorizontalGap", sizeOf(options.horizontalGap)));
	if (options.verticalGap !== undefined) ops.push(set(path, "VerticalGap", sizeOf(options.verticalGap)));
	return { path, ops };
}

/**
 * Create the `ScaleLayout` every screen and window canvas should start with.
 *
 * `ScaleLayout` is the one container that keeps a design canvas proportional: `FillMode` `0` (Fit) shows
 * the whole design box, `OriginalWidth`/`OriginalHeight` record that box, and `FontScaling` off keeps text
 * at its design pixel size instead of scaling with the window (measured against the Studio 1.8.1.27
 * catalogue, 2026-11-16). The canvas itself STRETCHES to its parent (`Width`/`Height` -1 with alignment
 * 3) and is not pinned to the design box: a `ScaleLayout` only has a size difference to scale when its
 * own box differs from `OriginalWidth`/`OriginalHeight`, so a canvas pinned to 1280x800 inside a loader
 * that is 1920x1080 stays 1280x800 and letterboxes the design with white margins - the exact render that
 * motivated this module (measured in the 2026-11-16 session). The design box is recorded only in
 * `OriginalWidth`/`OriginalHeight`; the caller still lays its content out in those pixels.
 *
 * Proven rendering on 2026-11-17 (`optix-proof/smt/shots/probe-scale4.png`): a 400x200 rectangle designed at
 * (100,100) in a 1280x800 canvas mounted in a 1060x736 content area rendered 330x165 - a fit factor of
 * 0.828, which is exactly `min(1060/1280, 736/800)` - and its 28 px label rendered at 28 px, which is
 * `FontScaling` off.
 *
 * @param {object} spec - `screen`, `width`, `height`, and optionally `parent` (defaults to `screen`) and `name`.
 * @param {string} spec.screen - Path of the screen or window that owns the canvas.
 * @param {number} spec.width - Design width in pixels.
 * @param {number} spec.height - Design height in pixels.
 * @param {string} [spec.parent] - Owner path when the canvas is not a direct child of the screen.
 * @param {string} [spec.name] - BrowseName, `Canvas` by default.
 * @returns {{path: string, ops: object[]}} The canvas path and the operations that make it.
 * @throws {Error} when the canvas is not a finite, positive box.
 */
export function scaleRoot({ screen, width, height, parent = screen, name = "Canvas" } = {}) {
	if (typeof screen !== "string" || screen.trim() === "") throw new Error("a canvas needs the screen that owns it");
	if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("a canvas needs its design width and height in pixels");
	const placed = layout(parent, name, CONTAINERS.scale, { width: FILL, height: FILL, horizontalAlignment: ALIGN.STRETCH, verticalAlignment: ALIGN.STRETCH });
	const path = placed.path;
	return {
		path,
		ops: [
			...placed.ops,
			set(path, "FillMode", String(FILL_MODE.FIT)),
			set(path, "OriginalWidth", sizeOf(width)),
			set(path, "OriginalHeight", sizeOf(height)),
			// Off, because scaling a font that was measured against the contrast and touch rules moves the
			// text off the pixel size those rules were checked at.
			set(path, "FontScaling", "false"),
		],
	};
}

/**
 * A `RowLayout`.
 *
 * @param {string} parent - Owner path.
 * @param {string} name - BrowseName.
 * @param {object} [options] - The same options `layout()` takes; `contentAlignment` is
 *   `CONTENT_ALIGN_ROW`.
 * @returns {{path: string, ops: object[]}} The container path and its operations.
 */
export function rowLayout(parent, name, options = {}) {
	return layout(parent, name, CONTAINERS.row, options);
}

/**
 * A `ColumnLayout`.
 *
 * @param {string} parent - Owner path.
 * @param {string} name - BrowseName.
 * @param {object} [options] - The same options `layout()` takes; `contentAlignment` is
 *   `CONTENT_ALIGN_COLUMN`.
 * @returns {{path: string, ops: object[]}} The container path and its operations.
 */
export function columnLayout(parent, name, options = {}) {
	return layout(parent, name, CONTAINERS.column, options);
}

/**
 * A `set_property` the bridge will refuse mid-batch, caught here instead.
 *
 * `validate_ops` cannot see that a property is array-valued on a node the batch is about to create - its
 * catalogue entry declares `GridLayout.Columns` as `String` while array-ness lives in `ArrayDimensions` and in
 * the CLR proxy type - so a batch naming one validates, starts applying, and stops `indeterminate` part way
 * through with the model half built. Measured live 2026-11-16 on `AryaSMTLineDemo`: 35 ops validated `ok`, the
 * eleventh (`Columns`) refused, eleven ops already written.
 *
 * @param {object} op - One batch operation.
 * @returns {string|undefined} The reason to refuse the operation, or `undefined` when it is safe to send.
 */
export function arrayWriteRefusal(op) {
	if (op?.op !== "set_property") return undefined;
	const known = ARRAY_VALUED_PROPERTIES[op.name];
	if (known === undefined) return undefined;
	return `set_property ${op.name} on ${op.path ?? known.type} writes an array-typed variable (${known.array}): the bridge refuses it (unsupported_array_write) and validate_ops cannot see the array-ness before the batch starts. ${known.fix}`;
}

/**
 * A grid the bridge can actually author: a `ColumnLayout` holding one `RowLayout` per row.
 *
 * Studio's own `GridLayout` cannot be configured through the bridge (see the module note: `Columns`/`Rows`
 * are `String[]` and are refused, and the per-cell `GridLayoutProperties` child preceded a native Studio
 * crash). So a grid here is the composition Rockwell's own shipped widgets use. Equal columns come free:
 * children at `Width -1` with `HorizontalAlignment 3` split their row (measured 2026-11-17 - two cards took
 * 530 px and 514 px of a 1060 px row across a 20 px gap). A row that takes the leftover height is `Height
 * -1` with `VerticalAlignment 3`; a row with a fixed height is given that height, which is what the emitters
 * do when the design check has already reserved the band.
 *
 * Callers place an item into `rowPaths[row]`. An unequal track has no `fr` spelling the bridge will write, so
 * it is an explicit pixel width on the item - the width the geometry library already computed for it.
 *
 * Two behaviours measured on a live 2026-11-17 probe, because they decide what a caller may pass:
 * rows left at `FILL` **split the column equally** (two `Height -1` rows in a 608 px column with a 10 px gap
 * both rendered 299 px, so `(608 - 10) / 2`), and a fixed size on a row or an item is never shrunk to make
 * room - a child declared 900 wide inside an 800 px design track rendered 1192.5 px and starved its
 * `Width -1` sibling to zero width. `VIEW-LAYOUT-03` in `design.js` is the check that catches that before a
 * screen is saved. Gaps are not scaled by a parent `ScaleLayout`, so a gap is a real cost at any zoom.
 *
 * @param {string} parent - Owner path.
 * @param {string} name - BrowseName of the column that owns the rows.
 * @param {object} [options] - `layout()` options, plus `columns` and `rows` as COUNTS (a `fr` array is
 *   accepted and read only for its length) and `rowHeights` for fixed bands.
 * @param {number|Array} [options.columns] - Column count.
 * @param {number|Array} [options.rows] - Row count.
 * @param {number[]} [options.rowHeights] - Height per row; `FILL` for a row that takes the leftover height.
 * @returns {{path: string, rowPaths: string[], columns: number, rows: number, ops: object[]}} The column
 *   path, the path of every row in order, the counts, and the operations, parent first.
 * @throws {Error} when a row or column count is not a positive integer.
 */
export function gridLayout(parent, name, options = {}) {
	const count = (value, label) => {
		if (value === undefined) return 1;
		const n = Array.isArray(value) ? value.length : Number(value);
		if (!Number.isInteger(n) || n < 1) throw new Error(`grid ${parent}/${name} needs ${label} as a positive integer count, not ${JSON.stringify(value)}`);
		return n;
	};
	const columns = count(options.columns, "columns");
	const rowCount = count(options.rows, "rows");
	const rowHeights = Array.isArray(options.rowHeights) ? options.rowHeights : undefined;
	const rest = { ...options };
	delete rest.columns;
	delete rest.rows;
	delete rest.rowHeights;
	// The column stacks its rows, so the gap between items of a row belongs to the row, not to the column.
	delete rest.horizontalGap;
	const column = layout(parent, name, CONTAINERS.column, rest);
	const ops = [...column.ops];
	const rowPaths = [];
	for (let index = 0; index < rowCount; index += 1) {
		const row = layout(column.path, `Row${index + 1}`, CONTAINERS.row, {
			width: FILL,
			height: rowHeights ? (rowHeights[index] ?? FILL) : FILL,
			horizontalAlignment: ALIGN.STRETCH,
			verticalAlignment: ALIGN.STRETCH,
			horizontalGap: options.horizontalGap,
		});
		ops.push(...row.ops);
		rowPaths.push(row.path);
	}
	return { path: column.path, rowPaths, columns, rows: rowCount, ops };
}

/**
 * Make a layout child fill its parent horizontally.
 *
 * `Width` `-1.0` plus `HorizontalAlignment` `3` (Stretch) is the spelling the shipped starter YAML uses
 * for a row that spans its parent (measured 2026-11-16). A pinned `Width` on the same node would win over
 * the fill, so this is the pair rather than one property.
 *
 * @param {string} path - Node path.
 * @returns {object[]} Two `set_property` operations.
 */
export function stretch(path) {
	return [set(path, "HorizontalAlignment", String(ALIGN.STRETCH)), set(path, "Width", sizeOf(FILL))];
}

/**
 * Make a layout child fill its parent vertically.
 *
 * @param {string} path - Node path.
 * @returns {object[]} Two `set_property` operations.
 */
export function stretchVertical(path) {
	return [set(path, "VerticalAlignment", String(ALIGN.STRETCH)), set(path, "Height", sizeOf(FILL))];
}

/**
 * Put a plain child at the center of its container.
 *
 * @param {string} path - Node path.
 * @returns {object[]} Two `set_property` operations.
 */
export function center(path) {
	return [set(path, "HorizontalAlignment", String(ALIGN.CENTER)), set(path, "VerticalAlignment", String(ALIGN.CENTER))];
}
