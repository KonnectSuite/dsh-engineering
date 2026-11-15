/**
 * Vendor-backed components: the widgets Rockwell ships in the template library, placed and bound by the
 * generator instead of hand-drawn.
 *
 * Two rules hold everywhere here:
 *
 * - An adapter never imports. `optix_library` does that, and it is a visible step of its own, because the
 *   import writes hundreds of nodes into the project. An adapter refuses with `adapter_not_imported` and
 *   names the library item to import when the type path is not supplied.
 * - An adapter never guesses a binding. Each one declares the variables it wants (`requires`), and a
 *   parameter it cannot bind is reported in `unbound`, not invented. A component placed empty is still a
 *   component; a component wired to a guessed variable is a lie.
 *
 * The widget catalogue in `optix_library action list` is the source of truth for what exists: these are the
 * items that map onto the components a production screen needs.
 */

/** The adapter set, keyed by the component kind a blueprint names. */
export const ADAPTERS = {
	alarmBanner: {
		title: "Alarm banner",
		library: "Widgets",
		item: "AlarmBanner",
		requires: ["Model"],
		why: "the newest unacknowledged alarm, in the header where an operator cannot miss it"
	},
	alarmGrid: {
		title: "Alarm grid",
		library: "Widgets",
		item: "AlarmGrid",
		requires: ["Model"],
		why: "the live alarm list with acknowledgement, sorted by the alarm's own model"
	},
	alarmHistoryGrid: {
		title: "Alarm history",
		library: "Widgets",
		item: "AlarmHistoryGrid",
		requires: ["Model"],
		why: "what happened, from the alarm store rather than the live list"
	},
	trend: {
		title: "Trend",
		library: "Widgets",
		item: "AdvancedTrend",
		requires: ["Model"],
		why: "pens over time with a cursor, not a bar chart standing in for history"
	},
	recipeEditor: {
		title: "Recipe editor",
		library: "Widgets",
		item: "RecipesEditor",
		requires: [],
		why: "select, edit, save and download a recipe without a custom screen"
	},
	loginForm: {
		title: "Login form",
		library: "Widgets",
		item: "LoginForm",
		requires: ["Users alias"],
		why: "the shipped login panel, which is the only login surface Optix provides"
	},
	userEditor: {
		title: "User editor",
		library: "Widgets",
		item: "UserEditor",
		requires: ["Users alias"],
		why: "an administrator's view of the users and their groups"
	},
	gauge: {
		title: "Gauge",
		library: "Widgets",
		item: "AnalogItemGauge",
		requires: ["Model"],
		why: "one analogue value as an instrument, with its unit and range from the model"
	},
	stationStatus: {
		title: "Station status",
		library: "Widgets",
		item: "StationConnectionStatus",
		requires: [],
		why: "the status strip's right-hand side: is this station connected"
	},
	dataGrid: {
		title: "Data grid",
		library: "builtin",
		item: "DataGrid",
		requires: ["Model", "Query"],
		why: "a native table over a model path and a query, with columns the caller names"
	},
	histogram: {
		title: "Bar chart",
		library: "builtin",
		item: "HistogramChart",
		requires: ["Model", "Query"],
		why: "native bars; the kit draws one when no model path is given"
	},
	trendNative: {
		title: "Native trend",
		library: "builtin",
		item: "Trend",
		requires: ["Model", "Query"],
		why: "the native trend, for a project that has not imported AdvancedTrend"
	}
};

/** Component kinds a blueprint may name, in catalogue order. */
export function adapterNames() {
	return Object.keys(ADAPTERS);
}

/**
 * One adapter by kind.
 *
 * @param {string} kind A key of `ADAPTERS`.
 * @returns The adapter entry.
 * @throws {Error} `adapter_unknown` when the kind is not in the set.
 */
export function getAdapter(kind) {
	const adapter = ADAPTERS[kind];
	if (adapter === void 0) throw new Error(`adapter_unknown: no adapter "${kind}" - choose ${adapterNames().join(", ")}`);
	return adapter;
}

/**
 * How to import the library item an adapter needs.
 *
 * @param {string} kind A key of `ADAPTERS`.
 * @returns The `optix_library` call, or `null` for a builtin widget.
 */
export function adapterImport(kind) {
	const adapter = getAdapter(kind);
	if (adapter.library === "builtin") return null;
	return { tool: "optix_library", action: "import", library: adapter.library, item: adapter.item };
}

/**
 * The operations that place one adapter, and what could not be bound.
 *
 * @param {{kind: string, screen: string, name: string, slot: {left: number, top: number, width: number, height: number},
 *   typePath?: string, bindings?: Record<string, string>}} request
 *   `typePath` is the imported type's project path (for example `UI/Components/Widgets/AlarmBanner`); `bindings`
 *   maps a property name on the widget to a value.
 * @returns `{ops, adapter, placed, bound, unbound, requires_import}`.
 * @throws {Error} `adapter_not_imported` when a library-backed adapter has no `typePath`; `adapter_bad_slot`
 *   when the rectangle cannot hold a control; `adapter_bad_name` when the name is not a Logix identifier.
 */
export function adapterOps({ kind, screen, name, slot, typePath = "", bindings = {} } = {}) {
	const adapter = getAdapter(kind);
	const identifier = String(name ?? "").trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(identifier)) throw new Error(`adapter_bad_name: "${String(name)}" is not a Logix identifier`);
	const parent = String(screen ?? "").trim();
	if (parent === "") throw new Error("adapter_no_screen: an adapter needs the screen it sits on");
	const box = slot ?? {};
	const width = Number(box.width);
	const height = Number(box.height);
	if (![box.left, box.top, width, height].every((value) => Number.isFinite(Number(value))) || width < 44 || height < 44) {
		throw new Error(`adapter_bad_slot: ${identifier} needs a rectangle at least 44x44; ${JSON.stringify(slot)} was given`);
	}
	const builtin = adapter.library === "builtin";
	const widget = builtin ? adapter.item : String(typePath ?? "").trim();
	if (!builtin && widget === "") {
		throw new Error(`adapter_not_imported: ${adapter.title} is a library item; import it first with tool "optix_library", action "import", library "${adapter.library}", item "${adapter.item}", then pass typePath (the imported type's project path)`);
	}
	const path = `${parent}/${identifier}`;
	const size = (value) => `${Math.round(Number(value) * 10) / 10}.0`;
	const ops = [builtin
		? { op: "create_widget", screen: parent, name: identifier, widget_type: widget }
		: { op: "create_object", parent, name: identifier, object_type: widget }];
	ops.push(...[
		["LeftMargin", box.left],
		["TopMargin", box.top],
		["Width", width],
		["Height", height]
	].map(([property, value]) => ({ op: "set_property", path, name: property, value: size(value) })));
	const names = Object.keys(bindings ?? {});
	for (const property of names) {
		ops.push({ op: "set_property", path, name: property, value: String(bindings[property]) });
	}
	return {
		ops,
		adapter: { kind, title: adapter.title, library: adapter.library, item: adapter.item },
		placed: { path, slot: { left: Number(box.left), top: Number(box.top), width, height } },
		bound: names,
		unbound: adapter.requires.filter((need) => !names.some((property) => property.toLowerCase().includes(need.toLowerCase().replace(/\s+/gu, "")))),
		requires_import: builtin ? null : adapterImport(kind)
	};
}

/**
 * The catalogue an agent reads before it designs a screen from these components.
 *
 * @returns `{adapters: [{kind, title, library, item, requires, why, import}], count}`.
 */
export function adapterCatalogue() {
	return {
		adapters: adapterNames().map((kind) => {
			const adapter = ADAPTERS[kind];
			return { kind, title: adapter.title, library: adapter.library, item: adapter.item, requires: adapter.requires, why: adapter.why, import: adapterImport(kind) };
		}),
		count: adapterNames().length
	};
}
