import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { assertNever, isJsonValue } from "@deepseek-ai/dsh-util-values";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { connect } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { fileURLToPath } from "node:url";
import { chainReport, ocrProbe, samePreviewTarget, tesseractInstallCommand } from "./chain.js";
import { armBridge, bridgeVersion } from "./arm.js";
import { buildState, checkBuild, initNetSolution, readReferences, studioInstalls, writeReferences } from "./build.js";
import { applyStage, census, diffBackup, projectGates, projectInfo, readNode, readStage, restoreBackup, sources, stageOps, validateProject } from "./project.js";
import { scaffoldProject } from "./scaffold.js";
import { NAV_MAX_BUTTONS, buttonSlot, launchRuntimePage, navTargets, handlerChild, panelOpens, panelProperty, planBar, planOps, verifyNavigation, verifyNext } from "./nav.js";
import { DEFAULT_LANGUAGE, languageCatalogue, languageNames } from "./languages.js";
import { THEME_ENGINES, auditTheme, themePlan } from "./theme.js";
import { PATTERNS, compileBlueprint, kitCatalogue } from "./kit.js";
import { adapterCatalogue } from "./adapters.js";
import { writeAssets } from "./assets.js";
import { RAIL_WIDTH, SHELL_NAMES, shellPlan } from "./shell.js";
import { DIALOG_KINDS, dialogPlan } from "./dialogs.js";
import { describeScreen, rubricCatalogue, scoreScreen } from "./rubric.js";
import { diskState, emulatorLogs, emulatorStatus, restartEmulator, startEmulator, stopEmulator, studioProcesses } from "./emulator.js";
import { saveProject, saveStamp, studioWindow } from "./save.js";
import { listSkills, readSkill } from "./skills.js";
import { bridgeLog, runtimeLog } from "./logs.js";
import { findEntry, itemNames, libraryNames, libraryRoots, noStudioInstall, readCatalog, suggestNames } from "./library.js";
import { MAX_CARDS, MAX_NAV, SCREEN_THEME, mountOps as planMount, screenOps } from "./screens.js";
import { designFindings, INTERACTIVE_TYPES } from "./design.js";
import { pointerFacts, productionFindings, walkTree } from "./production.js";
import { DEFAULT_HIERARCHY, MODEL_METADATA, MODEL_ROOT, TYPES_FOLDER, modelFindings, planModel } from "./model.js";
import { MARKER, NETLOGIC_FOLDER, NETLOGIC_RULES, TEMPLATES, findNetLogicNode, netSolutionDir, buildNetSolution, checkName, fileFor, findProjectRoot, listNetLogics, liveNetLogicNodes, netLogicReport, readNetLogic, removeNetLogicFile, reviewNetLogic, templateCode, writeNetLogic } from "./netlogic.js";
import { childrenOf, closest, diffDump, enumInfo, find as findSchema, isDataType, isObjectType, loadSchema, schemaVersion, typeInfo, typeNames } from "./schema.js";
import { helpStatus, loadHelpIndex, pickInstall, readHelpPage, searchHelp } from "./help.js";
import { elementPropertyName, inspectSvg, projectImgsDir, propertyClass, repairPlan } from "./svg.js";
/** A "did you mean" tail for a name the catalog does not know. */
function suggestSuffix(wrong, candidates) {
	const near = closest(wrong, candidates);
	return near.length === 0 ? "" : `. Closest: ${near.join(", ")}`;
}
/** Read the SVG a call points at: `inline` text wins, else the file at `source`. */
async function svgText(args) {
	if (typeof args.inline === "string" && args.inline.trim() !== "") return args.inline;
	if (typeof args.source !== "string" || args.source.trim() === "") throw new Error("give inline SVG text or source: the path to a .svg file");
	const text = await readFile(args.source, "utf8");
	if (!/<svg[\s>]/iu.test(text)) throw new Error(`${args.source} does not look like an SVG drawing`);
	return text;
}
/** A required path argument, with a message that says what to pass. */
function requirePath(value, message) {
	if (typeof value !== "string" || value.trim() === "") throw new Error(message);
	return value.trim();
}
/** A hexadecimal colour argument, refusing anything Optix could not paint. */
function hexColour(value, label) {
	if (!/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/u.test(String(value ?? "").trim())) {
		throw new Error(`${label} must be a hexadecimal colour such as #30A46C`);
	}
	return String(value).trim();
}
/** Every node in a `map` reply, with its full path, depth first. */
function flattenTree(map, base = "") {
	if (map === void 0 || map === null) return [];
	const path = base === "" ? map.name ?? "" : `${base}/${map.name}`;
	const rows = [{ path, name: map.name, type: map.type }];
	for (const child of map.children ?? []) rows.push(...flattenTree(child, path));
	return rows;
}
/** One property value out of a `nodes` reply, whether it arrived as a map or a list. */
function nodeValue(detail, name) {
	const properties = detail?.properties;
	if (Array.isArray(properties)) {
		const row = properties.find((entry) => entry?.name === name);
		return row?.value;
	}
	return properties?.[name];
}
/** A pixel length the drawing declares, so a placed image is not stretched by accident. */
function svgLength(analysis, which) {
	const raw = analysis?.size?.[which];
	const number = Number.parseFloat(String(raw ?? ""));
	return Number.isFinite(number) && number > 0 ? Math.round(number) : void 0;
}
//#region lib/types/bridge.js
/** Bounded direct HTTP transport to the in-Studio Optix bridge. @module dsh-tool-ft-optix/bridge */
/** A failure after dispatch may leave a mutation's outcome uncertain. */
var BridgeError = class extends Error {
	/** Whether an authoring request may have reached Studio. */
	mayHaveApplied;
	/**
	* Describe a transport or bridge refusal.
	* @param message - Credential-free diagnostic.
	* @param mayHaveApplied - Whether inspecting the live model is required before retrying.
	*/
	constructor(message, mayHaveApplied) {
		super(message);
		this.name = "BridgeError";
		this.mayHaveApplied = mayHaveApplied;
	}
};
/**
* Validate a local endpoint and normalize its trailing slash.
* @param input - Configured URL.
* @returns The normalized loopback origin.
*/
function bridgeOrigin(input) {
	const url = new URL(input);
	if (url.protocol !== "http:" || !["127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("bridgeUrls must contain plain HTTP loopback origins without credentials, paths, queries, or fragments");
	return url.origin;
}
/**
* Check for a JSON object in an external response.
* @param value - Parsed bridge JSON.
* @returns Whether the value is a non-null object rather than an array.
*/
function jsonObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}
/**
* Bridge authoring changes this session made, per bridge origin.
*
* Every authoring route is a POST, and Studio holds those changes in memory until the
* engineer saves the project and builds it. The plugin cannot save: no bridge route and no
* documented API reach it, so the only honest thing it can do is count what is outstanding
* and say so, which stops an agent from pressing Ctrl+S in Studio or promising a preview
* that cannot show what it just wrote.
*/
const modelChanges = new Map();
/**
* Route that reads or validates: a POST there changes nothing the engineer must save.
* @param route - Bridge route name.
* @returns Whether the route leaves the project as it was.
*/
function readOnlyRoute(route) {
	return route === "validate_ops" || route === "expr/validate";
}
/**
* Count one authoring change against its bridge origin.
* @param origin - Bridge origin that accepted the change.
* @param route - Bridge route that changed the project.
*/
function recordModelChange(origin, route) {
	const entry = modelChanges.get(origin) ?? {
		pending: 0,
		first: "",
		last: "",
		routes: []
	};
	const at = (/* @__PURE__ */ new Date()).toISOString();
	entry.pending += 1;
	if (entry.first === "") entry.first = at;
	entry.last = at;
	entry.routes = [...entry.routes.filter((name) => name !== route), route].slice(-6);
	modelChanges.set(origin, entry);
}
/**
* What Studio still has to save for a bridge origin.
* @param origin - Bridge origin.
* @returns The outstanding count and the routes that changed it.
*/
function pendingModelChanges(origin) {
	const entry = modelChanges.get(origin);
	if (entry === void 0) return {
		pending: 0,
		routes: []
	};
	return {
		pending: entry.pending,
		first: entry.first,
		last: entry.last,
		routes: entry.routes
	};
}
/**
* Forget the outstanding changes for origins whose save an engineer confirmed.
* @param origins - Bridge origins to clear.
* @returns How many changes were cleared.
*/
function clearModelChanges(origins) {
	let cleared = 0;
	for (const origin of origins) {
		const entry = modelChanges.get(origin);
		if (entry === void 0) continue;
		cleared += entry.pending;
		modelChanges.delete(origin);
	}
	return cleared;
}
/** Save and build are the engineer's keystrokes, because no tool can perform them. */
const SAVE_HANDOFF = "Ask the engineer to save and build in Studio (Ctrl+S, then Ctrl+Shift+B) with the emulator stopped, then confirm; nothing in this plugin can save the project.";
/**
* Whether something accepts a TCP connection on a bridge origin's port.
* @param origin - Validated loopback origin.
* @returns True when the port accepts a connection.
*/
async function portListening(origin) {
	const url = new URL(origin);
	const port = Number(url.port === "" ? 80 : url.port);
	return await new Promise((resolve) => {
		const socket = connect({
			host: url.hostname === "[::1]" ? "::1" : url.hostname,
			port
		});
		const done = (value) => {
			socket.destroy();
			resolve(value);
		};
		socket.setTimeout(800);
		socket.once("connect", () => done(true));
		socket.once("timeout", () => done(false));
		socket.once("error", () => done(false));
	});
}
/**
* Name why a bridge origin did not answer, in the order an engineer would check it.
*
* "Open the project and run StartBridge" is the right instruction only when Studio is closed.
* When Studio is running and nothing listens, the cause is a project without the bridge node
* or a StartBridge that was never chosen after a build; when the port answers but the request
* did not, the port belongs to something else. An agent that only gets "unavailable" guesses,
* and guessing is what sends it into Studio's menus.
* @param origin - Bridge origin that did not answer.
* @param signal - Caller cancellation; optional.
* @returns The observed machine facts, the ranked causes and the next step.
*/
async function describeSilentBridge(origin, signal) {
	signal?.throwIfAborted();
	const url = new URL(origin);
	const port = Number(url.port === "" ? 80 : url.port);
	const listening = await portListening(origin);
	signal?.throwIfAborted();
	const studios = process.platform === "win32" ? await studioProcesses() : [];
	const causes = [];
	let next;
	if (!listening && studios.length === 0) {
		causes.push("FactoryTalk Optix Studio is not running on this machine.");
		next = "Ask the engineer to open the project in Studio, then right-click StudioMCPBridge and choose StartBridge. This plugin never opens or drives Studio.";
	} else if (!listening) {
		causes.push(`Studio is running, but nothing accepts a connection on 127.0.0.1:${port}.`);
		causes.push("Either the open project does not carry the StudioMCPBridge node, or StartBridge was not chosen after the last build.");
		next = "Ask the engineer which project is open and to choose StudioMCPBridge > StartBridge (the Output window then shows the listening line). If the project has no bridge, optix_bridge_arm adds one while the project is closed.";
	} else {
		causes.push(`Something accepts a connection on 127.0.0.1:${port} but did not answer like the Studio bridge.`);
		causes.push("Another program may own that port, or the bridge threw while handling the request.");
		next = "Ask the engineer to read Studio's Output window for the bridge line and to check the bridgeUrls value in this plugin's configuration; do not change the port in the project.";
	}
	return {
		port_listening: listening,
		studio_running: studios.length > 0,
		causes,
		next
	};
}
/** Direct bridge transport; writes are never automatically retried or redirected. */
var OptixBridgeGateway = class {
	config;
	disposed;
	pending = /* @__PURE__ */ new Set();
	/**
	* Bind validated limits and the plugin-disposal signal.
	* @param config - Resolved transport configuration.
	* @param disposed - Aborts all transport work when the plugin unloads.
	*/
	constructor(config, disposed) {
		this.config = config;
		this.disposed = disposed;
	}
	/**
	* Acquire one bounded JSON response without exposing query values in errors.
	* @param origin - Validated configured origin.
	* @param route - Plugin-owned bridge route.
	* @param signal - Caller cancellation.
	* @param query - Operation parameters.
	* @param method - HTTP verb.
	* @param body - Validation batch, when present.
	* @returns Validated lossless JSON; HTTP and bridge errors throw.
	*/
	request(origin, route, signal, query = {}, method = "GET", body) {
		const request = this.acquire(origin, route, signal, query, method, body);
		this.pending.add(request);
		request.then(() => this.pending.delete(request), () => this.pending.delete(request));
		return request;
	}
	/**
	* Wait for aborted requests to release response readers.
	* @returns Completion after every current transport request settles.
	*/
	async drain() {
		await Promise.allSettled(this.pending);
	}
	/** Acquire and release one response reader within the configured byte and time limits. */
	async acquire(origin, route, signal, query, method, body) {
		const deadline = AbortSignal.timeout(this.config.requestTimeoutMs);
		const combined = AbortSignal.any([
			signal,
			this.disposed,
			deadline
		]);
		combined.throwIfAborted();
		const payload = body === void 0 ? void 0 : JSON.stringify(body);
		if (payload && Buffer.byteLength(payload) > this.config.maxResponseBytes) throw new BridgeError("Bridge request exceeds maxResponseBytes", false);
		const url = new URL(`/bridge/${route}`, origin);
		// Percent-encode rather than `URLSearchParams`. The bridge reads each pair with
		// `Uri.UnescapeDataString`, which does NOT decode `+` as a space, while
		// `URLSearchParams` writes every space as `+`: a screen drafted through it kept the
		// plus signs and the Web presentation engine rendered "Plant+overview" and
		// "Station+health+at+a+glance" (live, Studio 1.8.1.27, 2026-11-14). %20 is read the
		// same way by both sides, so text, tag paths and titles arrive intact.
		const pairs = [];
		for (const [key, value] of Object.entries(query)) {
			if (value === void 0) continue;
			for (const entry of Array.isArray(value) ? value : [value]) pairs.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(entry))}`);
		}
		url.search = pairs.join("&");
		if (Buffer.byteLength(url.href) > this.config.maxResponseBytes) throw new BridgeError("Bridge query exceeds maxResponseBytes", false);
		try {
			const response = await fetch(url, {
				method,
				redirect: "error",
				signal: combined,
				headers: {
					...this.config.bridgeToken ? { Authorization: `Bearer ${this.config.bridgeToken}` } : {},
					...payload ? { "Content-Type": "application/json" } : {}
				},
				...method === "POST" ? { body: payload ?? "" } : {}
			});
			const reader = response.body?.getReader();
			if (!reader) throw new Error("Empty bridge response");
			const chunks = [];
			let size = 0;
			try {
				while (true) {
					const chunk = await reader.read();
					if (chunk.done) break;
					size += chunk.value.byteLength;
					if (size > this.config.maxResponseBytes) throw new Error("Bridge response exceeds maxResponseBytes");
					chunks.push(chunk.value);
				}
			} finally {
				await reader.cancel();
				reader.releaseLock();
			}
			const value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
			if (!isJsonValue(value)) throw new Error("Bridge returned non-lossless JSON");
			const json = value;
			if (!jsonObject(json)) throw new Error("Bridge returned a non-object response");
			if (!response.ok || json.error !== void 0 && route !== "expr/validate") throw new BridgeError(`Bridge ${route} refused the request (HTTP ${response.status}): ${JSON.stringify(json.error ?? json)}`, method === "POST" && route !== "validate_ops" && route !== "expr/validate");
			if (method === "POST" && !readOnlyRoute(route)) recordModelChange(origin, route);
			return json;
		} catch (error) {
			if (error instanceof BridgeError) throw error;
			throw new BridgeError(`Bridge ${route} ${combined.aborted ? "cancelled or timed out" : "unavailable or returned invalid JSON"}; inspect Studio before retrying authoring`, method === "POST" && route !== "validate_ops" && route !== "expr/validate");
		}
	}
	/**
	* Select exactly one loaded Studio project by its bridge-reported BrowseName.
	* @param project - Exact name returned by health discovery.
	* @param signal - Caller cancellation.
	* @returns The serving origin and its health facts.
	*/
	async select(project, signal) {
		if (!project.trim()) throw new Error("project must be non-empty");
		const matches = [];
		for (const origin of this.config.bridgeUrls) {
			signal.throwIfAborted();
			let health;
			try {
				health = await this.request(origin, "health", signal);
			} catch (error) {
				if (signal.aborted || this.disposed.aborted) throw error;
				continue;
			}
			if (health.project === project && health.model_loaded === true) matches.push({
				origin,
				health
			});
		}
		if (matches.length > 1) throw new Error("Ambiguous Studio project: configure a single serving bridge URL");
		const selected = matches[0];
		if (!selected) throw new Error(`No loaded bridge for project ${project}; open it in Studio and run StartBridge`);
		return selected;
	}
};
//#endregion
//#region lib/types/operations.js
/** Closed authoring requests and their Optix bridge routes. @module dsh-tool-ft-optix/operations */
const text$1 = {
	type: "string",
	required: true
};
const optionalText = { type: "string" };
const mode = {
	type: "string",
	enum: [
		"Read",
		"Write",
		"ReadWrite"
	]
};
/** Bridge-supported batch operations; unknown fields are rejected before validation or writes. */
const operations = {
	set_property: {
		route: "node/property",
		fields: {
			path: text$1,
			name: text$1,
			value: text$1,
			locale: optionalText
		}
	},
	bind: {
		route: "node/bind",
		fields: {
			path: text$1,
			name: text$1,
			source_path: optionalText,
			raw_path: optionalText,
			mode
		},
		aliases: {
			source_path: "source",
			raw_path: "raw"
		}
	},
	create_widget: {
		route: "ui/widget",
		fields: {
			screen: text$1,
			name: text$1,
			widget_type: text$1
		},
		aliases: { widget_type: "type" }
	},
	// A dynamic link is not a property write: `bind` reaches a node's NAMED property, while a
	// module-typed variable (a DataLogger's VariableToLog, an alarm's InputValue) only accepts
	// the link on the variable itself. Measured live 2026-11-15: `bind` on
	// Loggers/LineDataLogger/VariablesToLog/OEE name=Value answers "VariableToLog has no settable
	// property 'Value'", and the set-link route is the one that lands.
	set_link: {
		route: "node/set-link",
		fields: {
			path: text$1,
			source: text$1,
			mode
		}
	},
	create_variable: {
		route: "model/variable",
		fields: {
			parent: text$1,
			name: text$1,
			datatype: text$1,
			kind: {
				type: "string",
				enum: ["value", "analog"],
				description: "value creates the variable alone; analog adds the OPC UA metadata children (EngineeringUnits, EURange, EURangeLow/High) so a number carries its unit and limits."
			},
			units: optionalText,
			range: { type: "array", items: { type: "number" } },
			// The length a caller means when they say "an array of four", not the `dims` text `retype` takes.
			array: {
				type: "integer",
				description: "Array length, for a one-dimensional array."
			},
			dims: optionalText,
			display_name: optionalText
		}
	},
	create_folder: {
		route: "model/folder",
		fields: {
			parent: text$1,
			name: text$1
		}
	},
	create_object: {
		route: "model/object",
		fields: {
			parent: text$1,
			name: text$1,
			object_type: optionalText
		},
		aliases: { object_type: "type" }
	},
	create_type: {
		route: "model/type",
		fields: {
			parent: text$1,
			name: text$1,
			base_type: optionalText
		},
		aliases: { base_type: "base" }
	},
	create_alias: {
		route: "node/alias",
		fields: {
			parent_path: text$1,
			name: text$1,
			target_path: optionalText,
			kind: optionalText
		},
		aliases: {
			parent_path: "parent",
			target_path: "target"
		}
	},
	delete: {
		route: "node/delete",
		fields: { path: text$1 },
		destructive: true
	},
	move: {
		route: "node/move",
		fields: {
			path: text$1,
			new_parent: text$1,
			new_name: optionalText
		},
		destructive: true
	},
	reorder: {
		route: "node/reorder",
		fields: {
			path: text$1,
			position: {
				type: "string",
				enum: ["front", "back"]
			},
			index: { type: "integer" }
		},
		destructive: true
	},
	wire_event: {
		route: "node/event",
		fields: {
			path: text$1,
			event_type: text$1,
			method_path: optionalText,
			command: optionalText,
			variable: optionalText,
			value: optionalText,
			args: optionalText,
			object_raw: optionalText,
			replace: { type: "boolean" }
		},
		aliases: {
			event_type: "event",
			method_path: "method"
		}
	},
	attach_expression: {
		route: "node/attach-expression",
		fields: {
			path: text$1,
			prop_name: text$1,
			expression: text$1,
			sources: optionalText
		},
		aliases: { prop_name: "name" }
	},
	attach_formatter: {
		route: "node/attach-formatter",
		fields: {
			path: text$1,
			prop_name: text$1,
			format: text$1,
			sources: optionalText,
			mode
		},
		aliases: { prop_name: "name" }
	},
	attach_string_formatter: {
		route: "node/attach-string-formatter",
		fields: {
			path: text$1,
			prop_name: text$1,
			format: text$1,
			sources: optionalText,
			raw: { type: "boolean" },
			mode
		},
		aliases: { prop_name: "name" }
	},
	retype: {
		route: "node/retype",
		fields: {
			path: text$1,
			datatype: text$1,
			dims: optionalText
		},
		destructive: true
	},
	import_tags: {
		route: "station/import-tags",
		fields: {
			station: text$1,
			mode: {
				type: "string",
				enum: ["offline", "online"]
			},
			file: optionalText,
			tags: optionalText,
			replace: { type: "boolean" },
			timeout_s: { type: "number" },
			dry_run: { type: "boolean" }
		}
	}
};
/** Exact-one operation schema for the native tool registry. */
const operationSchema = { oneOf: Object.entries(operations).map(([op, spec]) => ({
	type: "object",
	additionalProperties: false,
	properties: {
		op: {
			type: "string",
			const: op,
			required: true
		},
		...spec.fields
	}
})) };
/** Resolve an operation name admitted by the public request type. */
function specification(op) {
	const spec = operations[op];
	if (!spec) throw new Error(`Unsupported Optix operation: ${op}`);
	return spec;
}
/**
* Check cross-field rules not expressible by the schema DSL.
* @param ops - Schema-validated batch operations.
*/
function checkOperations(ops) {
	for (const op of ops) {
		for (const [key, value] of Object.entries(op)) if (typeof value === "string" && value.length === 0 && key !== "value") throw new Error(`${op.op}: ${key} must be non-empty`);
		if (op.op === "bind" && Boolean(op.source_path) === Boolean(op.raw_path)) throw new Error("bind requires exactly one of source_path or raw_path");
		if (op.op === "set_link" && op.path === op.source) throw new Error(`${op.path}: a variable cannot be linked to itself`);
		if (op.op === "reorder" && (op.position !== void 0 === (op.index !== void 0) || typeof op.index === "number" && op.index < 0)) throw new Error("reorder requires position or a non-negative index");
		if (op.op === "wire_event") {
			if (Boolean(op.command) === Boolean(op.method_path)) throw new Error("wire_event requires exactly one of command or method_path");
			if (op.object_raw && !op.method_path) throw new Error("object_raw requires method_path");
			if (op.args && op.command && op.command !== "OpenDialog" && op.command !== "OpenKeyboard") throw new Error("command arguments require OpenDialog or OpenKeyboard");
		}
		if ((op.prop_name ?? op.name) === "DisplayName" && [
			"bind",
			"attach_expression",
			"attach_formatter",
			"attach_string_formatter"
		].includes(op.op)) throw new Error("DisplayName is an attribute and cannot carry a dynamic link or converter");
		if (op.op === "attach_string_formatter") {
			const count = typeof op.sources === "string" ? op.sources.split(",").filter((source) => source.trim()).length : 0;
			if ([...String(op.format).replaceAll("{{", "").replaceAll("}}", "").matchAll(/\{(\d+)\s*(?:,[^{}:]*)?(?::[^{}]*)?\}/g)].some((match) => Number(match[1]) >= count)) throw new Error("unbound_placeholder: every formatter placeholder needs a source");
		}
		if (op.op === "import_tags") {
			if ((op.mode ?? "offline") === "offline" && !op.file) throw new Error(`${op.station}: an offline import needs file=<absolute path to a .L5X or .TPY>`);
			if (op.dry_run === true && (op.mode ?? "offline") === "online") throw new Error("import_tags: dry_run previews an offline file; it cannot preview an online fetch");
		}
	}
}
/**
* Resolve a batch operation into a bridge route and query parameters.
* @param op - Validated operation.
* @returns The closed route and encoded field values.
*/
function operationRequest(op) {
	const spec = specification(op.op);
	const query = {};
	for (const [key, value] of Object.entries(op)) if (key !== "op") query[spec.aliases?.[key] ?? key] = key === "raw" ? value ? "1" : "0" : String(value);
	return {
		route: op.op === "set_property" && op.name === "DisplayName" ? "node/displayname" : spec.route,
		query
	};
}
/**
 * Expand one `create_variable` into the operations that give it OPC UA anatomy.
 *
 * A component variable is the case that keeps coming up: a Float with a unit and
 * a range. The bridge creates the numeric variable, and the metadata has to be
 * created beside it: `EngineeringUnits` as a real `LocalizedText` (the bridge
 * assigns a string into one), `EURange` as a real `Range` for the OPC UA shape,
 * and `EURangeLow`/`EURangeHigh` as Floats because a `Range` struct cannot be
 * assigned through `node/property` (measured live 2026-11-15: "Conversion to
 * Struct not supported"). The analog *VariableType* itself is not reachable:
 * `model/variable` resolves data types only, and `node/retype` changes the
 * DataType of an existing variable, so the variable stays a BaseDataVariable of
 * that DataType and the result says so.
 *
 * @param ops - Schema-validated operations.
 * @returns `{ ops, notes }`: the expanded batch and what the expansion could not do.
 */
function expandVariables(ops) {
	const expanded = [];
	const notes = [];
	for (const op of ops) {
		if (op.op !== "create_variable") {
			expanded.push(op);
			continue;
		}
		const { kind, units, range, array, dims, display_name, ...base } = op;
		expanded.push(base);
		const path = `${op.parent}/${op.name}`;
		const analog = kind === "analog";
		// `array: 4` is the natural way to ask for a one-dimensional array; `dims: "4 2"` covers the rest.
		const shape = dims !== void 0 ? String(dims) : array === void 0 ? void 0 : String(array);
		if (units !== void 0 || range !== void 0 || display_name !== void 0 || shape !== void 0) {
			if (op.datatype === void 0) throw new Error(`create_variable ${path} needs a datatype to carry units, a range, an array shape or a display name`);
		}
		if (range !== void 0) {
			if (!Array.isArray(range) || range.length !== 2 || range.some((bound) => typeof bound !== "number" || !Number.isFinite(bound)))
				throw new Error(`create_variable ${path} range must be two numbers, for example [0, 100]`);
			if (!analog) notes.push(`${path}: a range was given without kind "analog", so only the limits are created`);
		}
		if (analog) {
			if (units !== void 0) {
				expanded.push({ op: "create_variable", parent: path, name: "EngineeringUnits", datatype: "LocalizedText" });
				expanded.push({ op: "set_property", path: `${path}/EngineeringUnits`, name: "Value", value: String(units) });
			}
			expanded.push({ op: "create_variable", parent: path, name: "EURange", datatype: "Range" });
			notes.push(`${path}: created as a ${op.datatype} variable with EURange metadata; the analog VariableType (AnalogItemType) is not reachable through the bridge, and a Range value cannot be assigned, so the limits live in EURangeLow/EURangeHigh`);
		}
		if (range !== void 0) {
			expanded.push({ op: "create_variable", parent: path, name: "EURangeLow", datatype: "Float" });
			expanded.push({ op: "set_property", path: `${path}/EURangeLow`, name: "Value", value: String(range[0]) });
			expanded.push({ op: "create_variable", parent: path, name: "EURangeHigh", datatype: "Float" });
			expanded.push({ op: "set_property", path: `${path}/EURangeHigh`, name: "Value", value: String(range[1]) });
		}
		if (display_name !== void 0 && String(display_name).trim() !== "") expanded.push({ op: "set_property", path, name: "DisplayName", value: String(display_name) });
		if (shape !== void 0 && shape.trim() !== "") {
			expanded.push({ op: "retype", path, datatype: op.datatype, dims: shape });
			notes.push(`${path}: the array shape is applied with retype after the create, so the value is initialized element-wise`);
		}
	}
	return {
		ops: expanded,
		notes
	};
}
/**
* Determine whether a batch needs destructive-operation enablement.
* @param ops - Validated batch.
* @returns Whether any operation deletes, replaces, moves, reorders, or retypes existing model state.
*/
function isDestructive(ops) {
	return ops.some((op) => specification(op.op).destructive || op.op === "wire_event" && op.replace === true);
}
//#endregion
//#region lib/types/ocr.js
/** Local Tesseract canvas recognition without an MCP server. @module dsh-tool-ft-optix/ocr */
/**
* Parse Tesseract TSV output, rejecting malformed rows rather than trusting their coordinates.
* @param tsv - Bounded external OCR output.
* @returns Recognized words with normalized confidence and screenshot coordinates.
*/
function parseOcr(tsv) {
	const rows = tsv.split(/\r?\n/).filter((row) => row.length > 0);
	if (rows.shift() !== "level	page_num	block_num	par_num	line_num	word_num	left	top	width	height	conf	text") throw new Error("Tesseract returned an invalid TSV header");
	const words = [];
	for (const row of rows) {
		const fields = row.split("	");
		if (fields.length < 12) throw new Error("Tesseract returned an incomplete TSV row");
		if (fields[0] !== "5") continue;
		const numbers = fields.slice(1, 11).map(Number);
		if (numbers.some((value) => !Number.isFinite(value)) || numbers.slice(0, 9).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error("Tesseract returned invalid word coordinates");
		const confidence = Number(fields[10]);
		if (confidence < 0 || confidence > 100) throw new Error("Tesseract returned invalid word confidence");
		const text = fields.slice(11).join("	").trim();
		if (!text) continue;
		words.push({
			text,
			confidence: confidence / 100,
			x: Number(fields[6]),
			y: Number(fields[7]),
			width: Number(fields[8]),
			height: Number(fields[9]),
			line: fields.slice(1, 5).join(":")
		});
	}
	return words;
}
/**
* Recognize screenshot bytes through a configured host Tesseract installation.
* Cancellation and deadlines kill the owned process; completion awaits process close before removing its private image.
* @param config - Explicit OCR installation.
* @param image - Bounded viewport PNG bytes.
* @param psm - Tesseract page segmentation mode.
* @param timeoutMs - Process deadline.
* @param maxBytes - Maximum collected stdout and stderr bytes.
* @param signal - Caller and plugin cancellation.
* @returns Text, words, and mean word confidence; an empty frame has null confidence.
*/
async function recognize(config, image, psm, timeoutMs, maxBytes, signal) {
	signal.throwIfAborted();
	const directory = await mkdtemp(join(tmpdir(), "dsh-optix-ocr-"));
	try {
		const path = join(directory, "viewport.png");
		await writeFile(path, image, { signal });
		signal.throwIfAborted();
		const args = [
			path,
			"stdout",
			"-l",
			config.language,
			"--psm",
			String(psm),
			...config.tessdataDirectory ? ["--tessdata-dir", config.tessdataDirectory] : [],
			"-c",
			"tessedit_create_tsv=1"
		];
		const completed = Promise.withResolvers();
		const child = execFile(config.executable, args, {
			cwd: directory,
			env: scrubbedParentEnv(),
			windowsHide: true,
			timeout: timeoutMs,
			maxBuffer: maxBytes,
			encoding: "utf8",
			signal
		}, (error, stdout) => {
			if (error) completed.reject(new Error("Optix OCR failed; check the configured Tesseract executable, language data, deadline, and output limit", { cause: error }));
			else completed.resolve(stdout);
		});
		const closed = new Promise((resolve) => {
			child.once("close", () => {
				resolve();
			});
		});
		let tsv;
		try {
			tsv = await completed.promise;
		} finally {
			await closed;
		}
		signal.throwIfAborted();
		const words = parseOcr(tsv);
		const lines = /* @__PURE__ */ new Map();
		for (const word of words) {
			const line = lines.get(word.line) ?? [];
			line.push(word.text);
			lines.set(word.line, line);
		}
		return {
			text: [...lines.values()].map((line) => line.join(" ")).join("\n"),
			words,
			confidence: words.length ? words.reduce((total, word) => total + word.confidence, 0) / words.length : null
		};
	} finally {
		await rm(directory, {
			recursive: true,
			force: true
		});
	}
}
//#endregion
//#region lib/types/preview.js
/** Direct Chromium CDP preview without an MCP transport. @module dsh-tool-ft-optix/preview */
/**
* Resolve a preview URL without permitting remote or credential-bearing targets.
* @param input - Configured preview URL.
* @returns The normalized loopback URL.
*/
function previewTarget(input) {
	const url = new URL(input);
	bridgeOrigin(url.origin);
	if (url.username || url.password || url.hash) throw new Error("previewUrl cannot contain credentials or a fragment");
	return url.href;
}
/**
* Register optional direct-CDP preview tools; disposal disconnects owned clients and awaits their completion.
* @param ctx - Tool context with durable attachments for screenshots.
* @param config - Explicit browser target and limits.
*/
function applyPreview(ctx, config) {
	const attachments = ctx.get("attachments");
	if (!attachments) throw new Error("Optix preview requires a durable attachment provider");
	const disposed = new AbortController();
	const clients = /* @__PURE__ */ new Set();
	const pending = /* @__PURE__ */ new Set();
	const target = new URL(config.previewUrl);
	let busy = false;
	ctx.effect(() => async () => {
		disposed.abort();
		await Promise.allSettled([...clients].map((browser) => browser.close()));
		await Promise.allSettled(pending);
	});
	let launched;
	/**
	* Start the browser the plugin owns, once, and keep its page so the emulator keeps state between
	* calls. Playwright resolves a channel to an installed Chrome or Edge; `auto` tries both.
	* @param combined - The call's abort signal.
	* @returns The one page the preview tools act on.
	*/
	async function launchedPage(combined) {
		if (launched !== undefined && !launched.browser.isConnected()) launched = undefined;
		if (launched === undefined) {
			const { chromium } = await import("playwright-core");
			const channels = config.browserChannel === "auto" ? [
				"chrome",
				"msedge"
			] : [config.browserChannel];
			let browser;
			let failure;
			for (const channel of channels) try {
				browser = await chromium.launch({
					headless: config.browserHeadless,
					...config.browserPath ? {
						executablePath: config.browserPath
					} : {
						channel
					}
				});
				break;
			} catch (error) {
				failure = error;
			}
			if (browser === undefined) throw new Error(`Optix preview could not start a browser: ${String(failure)}; set browserChannel to chrome or msedge, or browserPath to the executable.`);
			clients.add(browser);
			browser.on("disconnected", () => {
				if (launched !== undefined && launched.browser === browser) launched = undefined;
			});
			launched = {
				browser,
				page: await (await browser.newContext({ viewport: {
					width: config.previewWidth,
					height: config.previewHeight
				} })).newPage()
			};
		}
		if (launched.page.isClosed()) launched.page = await (await launched.browser.newContext({ viewport: {
			width: config.previewWidth,
			height: config.previewHeight
		} })).newPage();
		combined.throwIfAborted();
		if (new URL(launched.page.url()).href !== target.href) await launched.page.goto(config.previewUrl, {
			timeout: config.requestTimeoutMs,
			waitUntil: "load"
		});
		return launched.page;
	}
	/** Connect to a browser the engineer started; the connection is ours, the browser is not. */
	async function attachedBrowser(combined) {
		const { chromium } = await import("playwright-core");
		const browser = await chromium.connectOverCDP(config.cdpUrl, {
			timeout: config.requestTimeoutMs,
			noDefaults: true
		});
		clients.add(browser);
		combined.throwIfAborted();
		return browser;
	}
	/** Acquire one preview page: attach leaves an external browser running, launch keeps its own alive. */
	function withPage(signal, run) {
		if (busy) return Promise.reject(/* @__PURE__ */ new Error("An Optix preview call is already running"));
		busy = true;
		const work = (async () => {
			const combined = AbortSignal.any([signal, disposed.signal]);
			combined.throwIfAborted();
			const launch = config.browser === "launch";
			let browser;
			let page;
			if (launch) {
				page = await launchedPage(combined);
				browser = launched.browser;
			} else {
				browser = await attachedBrowser(combined);
				const pages = browser.contexts().flatMap((context) => context.pages()).filter((candidate) => samePreviewTarget(new URL(candidate.url()), target));
				if (pages.length !== 1 || !pages[0]) {
					await browser.close().catch(() => {});
					clients.delete(browser);
					throw new Error("Open exactly one tab at the configured Optix previewUrl");
				}
				page = pages[0];
			}
			let disconnected;
			const release = () => {
				if (launch) return;
				disconnected = Promise.allSettled([browser.close()]);
				clients.delete(browser);
			};
			combined.addEventListener("abort", release, { once: true });
			try {
				combined.throwIfAborted();
				page.setDefaultTimeout(config.requestTimeoutMs);
				return await run(page);
			} finally {
				combined.removeEventListener("abort", release);
				release();
				if (disconnected) await disconnected;
			}
		})();
		pending.add(work);
		work.then(() => {
			pending.delete(work);
			busy = false;
		}, () => {
			pending.delete(work);
			busy = false;
		});
		return work;
	}
	/** Capture within the configured viewport and encoded image limits. */
	async function capture(page) {
		// The Web presentation engine paints its canvas after the websocket handshake, so a capture
		// taken at the "load" event is a blank white frame (measured on Studio 1.8.1, 2026-11-14:
		// 1280x720 of nothing). Wait for a canvas that has size, then let one frame settle.
		await page.waitForFunction(
			/* v8 ignore next */
			() => {
				const canvas = document.querySelector("canvas");
				return canvas !== null && canvas.width > 0 && canvas.height > 0;
			},
			void 0,
			{ timeout: config.requestTimeoutMs }
		).catch(() => {});
		await page.waitForTimeout(PREVIEW_SETTLE_MS);
		const viewport = await page.evaluate(
			/* v8 ignore next */
			() => ({
				width: innerWidth,
				height: innerHeight
			})
		);
		if (viewport.width * viewport.height > config.maxPreviewPixels) throw new Error("Optix preview exceeds maxPreviewPixels");
		const bytes = await page.screenshot({
			type: "png",
			scale: "css",
			timeout: config.requestTimeoutMs
		});
		if (bytes.byteLength > config.maxResponseBytes) throw new Error("Optix screenshot exceeds maxResponseBytes");
		return {
			bytes,
			width: viewport.width,
			height: viewport.height
		};
	}
	const ocr = config.ocr;
	if (ocr) ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_ocr",
		description: "Read rendered Optix canvas text by capturing the configured Chromium preview and invoking the configured host Tesseract executable directly, without MCP or Python. Returns word boxes in screenshot pixels, confidence fractions, and the durable source image reference. OCR can misread values; inspect optix_screenshot and verify against the live model before acting.",
		parameters: { psm: {
			type: "integer",
			required: true,
			description: "Tesseract page segmentation mode from 0 through 13; 6 for a text block, 11 for scattered HMI labels."
		} },
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Read Optix canvas text",
			kind: "read"
		}),
		async execute(args, exec) {
			if (args.psm < 0 || args.psm > 13) throw new Error("OCR psm must be between 0 and 13");
			return withPage(exec.signal, async (page) => {
				const { bytes, width, height } = await capture(page);
				const sourceImage = await attachments.saveImage({
					data: bytes,
					mediaType: "image/png",
					name: "optix-ocr-source.png"
				});
				const result = await recognize(ocr, bytes, args.psm, config.requestTimeoutMs, config.maxResponseBytes, AbortSignal.any([exec.signal, disposed.signal]));
				return {
					url: page.url(),
					sourceImage: {
						attachmentId: sourceImage.attachmentId,
						mediaType: sourceImage.mediaType,
						width: sourceImage.width,
						height: sourceImage.height,
						bytes: sourceImage.bytes
					},
					text: result.text,
					words: result.words.map((word) => ({ ...word })),
					confidence: result.confidence,
					coordinateSpace: {
						width,
						height,
						units: "viewport CSS pixels"
					}
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_screenshot",
		description: "Capture the configured Optix emulator browser viewport through direct CDP and return a durable image. Use after live authoring and emulator rebuild to verify rendering. Requires preview enabled, an attachment provider, and exactly one already-open preview tab.",
		parameters: {},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					url: {
						type: "string",
						required: true
					},
					unsaved_changes: {
						type: "integer",
						description: "Authoring changes the engineer has not saved yet; the render is the project as saved, so these are not in it."
					},
					attachment: {
						type: "object",
						additionalProperties: false,
						required: true,
						properties: {
							attachmentId: {
								type: "string",
								required: true
							},
							mediaType: {
								type: "string",
								enum: [
									"image/png",
									"image/jpeg",
									"image/webp",
									"image/gif"
								],
								required: true
							},
							bytes: {
								type: "integer",
								required: true
							},
							width: {
								type: "integer",
								required: true
							},
							height: {
								type: "integer",
								required: true
							},
							name: { type: "string" },
							originalDimensions: {
								type: "object",
								additionalProperties: false,
								properties: {
									width: {
										type: "integer",
										required: true
									},
									height: {
										type: "integer",
										required: true
									}
								}
							}
						}
					}
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: `Optix preview at ${value.url}: ${value.attachment.width}Ãƒâ€”${value.attachment.height}.${value.unsaved_changes > 0 ? ` This is the project as saved: ${value.unsaved_changes} authoring change${value.unsaved_changes === 1 ? "" : "s"} are not in it yet - ask the engineer for a save and build.` : ""}`
			}, {
				type: "image",
				attachment: {
					...value.attachment,
					attachmentId: value.attachment.attachmentId
				}
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Capture Optix preview",
			kind: "read"
		}),
		async execute(_args, exec) {
			return withPage(exec.signal, async (page) => {
				const { bytes } = await capture(page);
				const attachment = await attachments.saveImage({
					data: bytes,
					mediaType: "image/png",
					name: "optix-preview.png"
				});
				const unsaved = pendingModelChanges(config.bridgeUrls[0] ?? "").pending;
				return {
					url: page.url(),
					attachment,
					...(unsaved === 0 ? {} : { unsaved_changes: unsaved })
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_preview",
		description: "Inspect browser text or interact with the explicitly configured Optix emulator preview through direct CDP. Canvas controls may have no DOM text; inspect optix_screenshot and use viewport CSS-pixel coordinates. Input requires allowPreviewInput and may change runtime values.",
		parameters: { request: {
			required: true,
			oneOf: [
				{
					type: "object",
					additionalProperties: false,
					properties: { action: {
						type: "string",
						const: "text",
						required: true
					} }
				},
				{
					type: "object",
					additionalProperties: false,
					properties: {
						action: {
							type: "string",
							const: "click",
							required: true
						},
						x: {
							type: "number",
							required: true
						},
						y: {
							type: "number",
							required: true
						}
					}
				},
				{
					type: "object",
					additionalProperties: false,
					properties: {
						action: {
							type: "string",
							const: "type",
							required: true
						},
						text: {
							type: "string",
							required: true
						}
					}
				},
				{
					type: "object",
					additionalProperties: false,
					properties: {
						action: {
							type: "string",
							const: "key",
							required: true
						},
						key: {
							type: "string",
							required: true
						}
					}
				}
			]
		} },
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					action: {
						type: "string",
						required: true
					},
					url: {
						type: "string",
						required: true
					},
					text: { type: "string" }
				}
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Optix preview ${args.request.action}`,
			kind: args.request.action === "text" ? "read" : "edit"
		}),
		async execute(args, exec) {
			const request = args.request;
			if (request.action !== "text" && !config.allowPreviewInput) throw new Error("Preview input requires allowPreviewInput in plugin configuration");
			return withPage(exec.signal, async (page) => {
				switch (request.action) {
					case "text": {
						const value = await page.locator("body").innerText();
						if (Buffer.byteLength(value) > config.maxResponseBytes) throw new Error("Preview text exceeds maxResponseBytes");
						return {
							action: request.action,
							url: page.url(),
							text: value
						};
					}
					case "click": {
						const viewport = await page.evaluate(
							/* v8 ignore next */
							() => ({
								width: innerWidth,
								height: innerHeight
							})
						);
						if (request.x < 0 || request.y < 0 || request.x >= viewport.width || request.y >= viewport.height) throw new Error("Click coordinates must be inside the preview viewport");
						await page.mouse.click(request.x, request.y);
						break;
					}
					case "type":
						await page.keyboard.insertText(request.text);
						break;
					case "key":
						await page.keyboard.press(request.key);
						break;
					/* v8 ignore next -- closed schema union; unknown actions fail registry validation. */
					default: assertNever(request);
				}
				return {
					action: request.action,
					url: page.url()
				};
			});
		}
	})));
}
//#endregion
//#region lib/types/templates.js
/** Immutable user-supplied Optix starters and NetLogic acquisition. @module dsh-tool-ft-optix/templates */
const ids = ["arya-optix-ipc", "arya-optix-panel", "arya-optix-app"];
/**
* Parse the shipped manifest before exposing project file access.
* @param text - Manifest JSON acquired from the package assets.
* @returns JSON object containing the file list; rejects invalid manifests.
*/
function parseTemplateManifest(text) {
	const parsed = JSON.parse(text);
	if (!isJsonValue(parsed)) throw new Error("Optix template manifest is invalid");
	const manifest = parsed;
	if (!jsonObject(manifest) || !Array.isArray(manifest.files)) throw new Error("Optix template manifest is invalid");
	return {
		...manifest,
		files: manifest.files
	};
}
/**
* Register access to packaged starters without modifying an existing project.
* @param ctx - Harness tool runtime context.
* @param maxBytes - Maximum bytes returned by a file acquisition.
*/
function applyTemplates(ctx, maxBytes) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_template",
		description: "Our three packaged starters — Arya Optix IPC and OptixPanel, both blank, and the branded application starter whose operator shell, screens and dialog are already built — chosen between, not surveyed. With no arguments it answers with every manifest and its `questions` and writes nothing, which is how a template or standard request opens; with `template` it reads that starter's NetLogic and project files, or with `destination` scaffolds it into a project folder of its own. With `destination`, the starter is copied into `<destination>/<name>` (or into the destination itself when that folder already carries the project name, because Studio warns when the project name and its folder disagree), renamed, sized to the canvas you pass, and given ProjectFiles/NetSolution with the bridge this bundle ships; nothing is overwritten and no Studio connection is required. `width` and `height` are required with `destination`: ask the operator for the real screen box before scaffolding, because every screen drafted afterwards inherits that canvas. The manifest carries `questions` to ask before a copy, because the runtime target, the screen box, the project name and the destination are not recoverable by an edit afterwards. Studio still compiles the class and an engineer still runs StartBridge - those two are the only steps this cannot do.",
		parameters: {
			template: {
				type: "string",
				enum: ids,
				description: "Which starter: `arya-optix-ipc` and `arya-optix-panel` are blank, `arya-optix-app` is the branded application starter with the shell already built. Omit to receive every manifest and its questions, writing nothing."
			},
			path: {
				type: "string",
				description: "Exact manifest-listed project-relative file to read; omit to return the manifest and source directory. NetLogic: ProjectFiles/NetSolution/StudioMCPBridge.cs."
			},
			destination: {
				type: "string",
				description: "Absolute path of the workspace root (or of a folder already named after the project) to scaffold into. The project lands in `<destination>/<name>`; an existing non-empty project folder is refused, while a workspace root holding other work is fine."
			},
			name: {
				type: "string",
				description: "Project name for the copy, replacing the starter's own across the project's text files and file names. Omit to keep the shipped name."
			},
			width: {
				type: "integer",
				description: "Canvas width in pixels for the copy's MainWindow. Required with `destination`: ask the operator for the real screen box first, since every screen drafted later inherits this canvas. A panel target and a widescreen monitor differ."
			},
			height: {
				type: "integer",
				description: "Canvas height in pixels for the copy's MainWindow. Required with `destination`. Taller than wide means a portrait target."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Read Optix starter project",
			kind: "read"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (args.template === void 0) {
				/**
				 * A template or standard request opens here: every starter and the questions it needs
				 * answered, with nothing written. This is the cheap first call that keeps an agent from
				 * surveying the machine to work out what our own templates are.
				 */
				if (args.path !== void 0) throw new Error(`Name the starter whose file you want: ${ids.join(", ")}`);
				if (args.destination !== void 0) throw new Error(`Choose the starter to copy: ${ids.join(", ")}`);
				const shipped = await readFile(new URL("../bridge/StudioMCPBridge.cs", import.meta.url), "utf8");
				const starters = [];
				for (const id of ids) {
					const root = new URL(`../templates/${id}/`, import.meta.url);
					const manifest = parseTemplateManifest(await readFile(new URL("manifest.json", root), "utf8"));
					let bundled = "";
					try {
						bundled = bridgeVersion(await readFile(new URL("project/ProjectFiles/NetSolution/StudioMCPBridge.cs", root), "utf8"));
					} catch {
						bundled = "";
					}
					starters.push({
						template: id,
						manifest,
						sourceDirectory: fileURLToPath(new URL("project/", root)),
						bridgeVersion: bridgeVersion(shipped),
						bundledBridgeVersion: bundled,
						questions: manifest.questions ?? []
					});
				}
				exec.signal.throwIfAborted();
				return {
					starters,
					instructions: "These are our three starters - two blank projects and one branded application whose shell, rail, screens, dialog and stylesheet binding are already built - the shell a team starts from. Ask their questions before copying anything: which runtime, the screen box in pixels, the project name and the destination. Then choose one and pass `template`, `destination`, `name`, `width` and `height`. A house standard (levels, palette, naming, alarm strategy) is decided from `engineering_reference` and applied on top of the copy; nothing here creates an empty project. The branded starter is the fast path when a team wants to begin from a designed application rather than a bare project."
				};
			}
			const root = new URL(`../templates/${args.template}/`, import.meta.url);
			const manifest = parseTemplateManifest(await readFile(new URL("manifest.json", root), "utf8"));
			if (args.path !== void 0 && args.destination !== void 0) throw new Error("Choose one: `path` reads a file from the starter, `destination` scaffolds a copy of it. Both in one call is ambiguous.");
			if (args.destination !== void 0) {
				/**
				 * The canvas is asked for, not defaulted. Every screen drafted afterwards reads it from the
				 * live window (`optix_screen` sizes itself from the window), so a wrong answer here is not
				 * one edit later: it is the size of every screen in the project. Measured 2026-11-14: an
				 * agent scaffolded with no size question and produced a 1920x1080 project for a panel.
				 */
				if (typeof args.width !== "number" || typeof args.height !== "number") {
					throw new Error("Scaffolding needs the operator's screen box: pass width and height in pixels. Ask the runtime target and the display size first - every screen drafted afterwards inherits this canvas, and changing it later means re-editing every screen.");
				}
				const shipped = await readFile(new URL("../bridge/StudioMCPBridge.cs", import.meta.url), "utf8");
				const report = await scaffoldProject({
					templateRoot: fileURLToPath(root),
					destination: args.destination,
					sourceProjectName: typeof manifest.sourceProjectName === "string" ? manifest.sourceProjectName : "",
					name: args.name,
					width: typeof args.width === "number" ? Math.round(args.width) : void 0,
					height: typeof args.height === "number" ? Math.round(args.height) : void 0,
					shipped
				});
				exec.signal.throwIfAborted();
				/**
				 * Carried with the copy so the answer to "what should I have asked" is the same object
				 * the manifest exposes, and an agent that scaffolds without asking can see the gap.
				 */
				return {
					...report,
					questions: manifest.questions ?? []
				};
			}
			if (args.path === void 0) {
				/**
				 * The version named here is the one this package actually ships, read from the tracked
				 * bridge, alongside the older copy the starter project carries inside itself: the gap
				 * between the two is the reason `optix_bridge_arm` exists.
				 */
				const shipped = await readFile(new URL("../bridge/StudioMCPBridge.cs", import.meta.url), "utf8");
				let bundled = "";
				try {
					bundled = bridgeVersion(await readFile(new URL("project/ProjectFiles/NetSolution/StudioMCPBridge.cs", root), "utf8"));
				} catch {
					bundled = "";
				}
				return {
					manifest,
					sourceDirectory: fileURLToPath(new URL("project/", root)),
					bridgeVersion: bridgeVersion(shipped),
					bundledBridgeVersion: bundled,
					questions: manifest.questions ?? [],
					instructions: "Ask the manifest's questions before copying anything: which runtime, what screen size, whether the project keeps its shipped name, and where the copy goes. Then copy to a new directory, run optix_bridge_arm on the copy so it carries this bridge instead of the older one the starter ships, open the .optix file in the Studio this machine has (the manifest's `optixStudioVersion` is the version the starter was built with, not a requirement), compile NetSolution, and execute StartBridge. The class name StudioMCPBridge is retained; no MCP service is needed."
				};
			}
			const path = args.path;
			if (!path || path.includes("\\") || path.split("/").some((part) => !part || part === "." || part === "..") || !manifest.files.some((file) => file !== null && typeof file === "object" && !Array.isArray(file) && file.path === path && file.text === true)) throw new Error("Choose an exact text file path listed in the template manifest");
			const bytes = await readFile(new URL(`project/${path.split("/").map(encodeURIComponent).join("/")}`, root));
			exec.signal.throwIfAborted();
			if (bytes.byteLength > maxBytes) throw new Error("Template file exceeds maxResponseBytes");
			return {
				template: args.template,
				path,
				content: new TextDecoder("utf-8", { fatal: true }).decode(bytes)
			};
		}
	})));
}
//#endregion
//#region lib/types/arm.js
/**
 * Arm an existing project with the bridge it lacks, which is the usual reason every other
 * Optix tool answers `Bridge unavailable`. No bridge is assumed to be running here: the tool
 * works on the project directory, and the two steps that need Studio stay in its report.
 * @param ctx - Harness tool runtime context.
 */
function applyBridgeArm(ctx, bridge) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_bridge_arm",
		description: "Report, and on confirmation write, the Studio bridge an existing Optix project needs so it can be read and authored at all. Works on the project directory, not through a bridge: it checks ProjectFiles/NetSolution, keeps whatever the project already holds under ProjectFiles/.dsh-backups, writes the bridge this bundle ships, and adds the StudioMCPBridge NetLogic node to Nodes/NetLogic/NetLogic.yaml when the project has none (a hand-built project usually does not, and StartBridge is unreachable without it; an existing node is left exactly as it is). With confirm false nothing is written. Studio still compiles the class and the engineer still runs StartBridge; no tool can do either from outside Studio.",
		parameters: {
			project: {
				type: "string",
				required: true,
				description: "Absolute path of the project directory holding the .optix file and ProjectFiles."
			},
			confirm: {
				type: "boolean",
				description: "false returns the plan and writes nothing; true writes the bridge, the NetLogic node and the node-file registration, after copying every file it touches into one backup folder."
			},
			restore: {
				type: "boolean",
				description: "true undoes the newest arming run by copying the files it touched back and deleting the files it created. Use it when an arm went to the wrong place; it is the undo of this tool, not a merge."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Arm the Optix project bridge",
			kind: "edit"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const shipped = await readFile(new URL("../bridge/StudioMCPBridge.cs", import.meta.url), "utf8");
			/**
			 * A project Studio has open answers on the bridge with its own name. Writing NetSolution
			 * while that is true races Studio's next save, so the name is read first and the write is
			 * refused for that same project instead of being attempted and lost.
			 */
			let bridgeOpen = "";
			let studioRunning = false;
			for (const origin of bridge.config.bridgeUrls) {
				try {
					const health = await bridge.request(origin, "health", exec.signal);
					studioRunning = true;
					bridgeOpen = typeof health.project === "string" ? health.project : "";
					break;
				} catch {
					continue;
				}
			}
			const report = await armBridge(args.project, shipped, {
				confirm: args.confirm === true,
				restore: args.restore === true,
				bridgeOpen,
				studioRunning
			});
			exec.signal.throwIfAborted();
			return report;
		}
	})));
}
//#endregion
//#region lib/emulator-tool.js
/**
 * Run the project's own web runtime, which is the scripted route to the preview: the
 * Studio CLI has `export` and no run verb, so the emulator leg otherwise needs a human
 * at the Studio toolbar. The port belongs to the project, not to this tool.
 * @param ctx - Harness tool runtime context.
 * @param settings - Resolved deployment settings, for the preview address to probe.
 */
function applyEmulator(ctx, settings) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_emulator",
		description: "Read, start, restart, stop or read the log of the Optix runtime that serves a project's web preview. This is the only sanctioned way to run the project: never launch FTOptixRuntime.exe yourself, never stop it with Stop-Process, and never use desktop automation on Studio's toolbar. It finds FTOptixRuntime.exe under the Studio install, loads the project's .optix file, and only reports `started` once the preview address actually answers; when it does not, it returns the runtime's own log tail and a named diagnosis. stop ends the runtime for that project even when this plugin did not start it, which is what a rebuild needs. The runtime loads the project as saved, so changes made through the bridge need the engineer's Save and Build first.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: ["status", "start", "stop", "restart", "logs"],
				description: "status probes the leg and the preview address; start launches the runtime and waits for it to serve; stop ends the project's runtime (including one Studio started); restart is stop then start; logs returns the runtime log tail."
			},
			project: {
				type: "string",
				required: true,
				description: "Absolute path of the project directory holding the .optix file."
			},
			runtime: {
				type: "string",
				description: "Runtime executable path; empty discovers it under the Studio install."
			},
			wait_ms: {
				type: "integer",
				description: "How long start waits for the preview address before reporting failure. Default 30000."
			},
			force: {
				type: "boolean",
				description: "stop: signal a process that ignored the first stop. start: start even though the preview address already answers."
			},
			lines: {
				type: "integer",
				description: "logs: how many trailing lines to return. Default 60."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Run the Optix project emulator",
			kind: "invoke"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const readsOnly = args.action === "status" || args.action === "logs";
			if (!readsOnly && !settings.allowInvoke) throw new Error("Starting, restarting or stopping a process needs allowInvoke in the Optix row's plugin configuration; status and logs work without it.");
			const origin = settings.bridgeUrls[0] ?? "";
			const unsaved = pendingModelChanges(origin);
			const disk = await diskState(args.project);
			// Files are the only evidence a Save reached disk: nothing in UAManagedCore can
			// save a project, so the newest write under Nodes/ is compared with the first
			// pending bridge change instead of trusting that a keystroke landed.
			const diskReport = {
				newest_write: disk.newest_write_iso,
				newest_path: disk.newest_path,
				nodes_files: disk.files,
				project_bytes: disk.project_bytes
			};
			const savedAfterEdit = unsaved.first === void 0 ? void 0 : Math.max(disk.newest_write, disk.project_write) >= unsaved.first;
			const saveVerdict = savedAfterEdit === void 0 ? void 0 : savedAfterEdit ? "The saved project is newer than the first pending bridge change, so the save reached disk." : `No file in the project is newer than the first pending bridge change (${new Date(unsaved.first).toISOString()}); the newest write under Nodes/ is ${disk.newest_write_iso || "older than any bridge change"}. Studio has not written that change to disk yet, so the runtime cannot load it.`;
			const withSaveState = (report) => {
				if (unsaved.pending === 0) return report;
				return {
					...report,
					unsaved_changes: unsaved.pending,
					...(savedAfterEdit === void 0 ? {} : { saved_after_edit: savedAfterEdit }),
					...(saveVerdict === void 0 ? {} : { save_verdict: saveVerdict }),
					save_handoff: SAVE_HANDOFF
				};
			};
			if (args.action === "start") return withSaveState(await startEmulator({
				project: args.project,
				runtime: args.runtime ?? "",
				previewUrl: settings.previewUrl,
				waitMs: args.wait_ms,
				force: args.force === true,
				signal: exec.signal
			}));
			if (args.action === "restart") return withSaveState(await restartEmulator({
				project: args.project,
				runtime: args.runtime ?? "",
				previewUrl: settings.previewUrl,
				waitMs: args.wait_ms,
				force: args.force === true,
				signal: exec.signal
			}));
			if (args.action === "stop") return await stopEmulator({
				project: args.project,
				project_file: "",
				force: args.force === true,
				previewUrl: settings.previewUrl,
				signal: exec.signal
			});
			if (args.action === "logs") return await emulatorLogs({
				project: args.project,
				project_file: "",
				lines: args.lines
			});
			const report = await emulatorStatus({
				project: args.project,
				previewUrl: settings.previewUrl
			}, exec.signal);
			if (!report.serving) report.next = report.project_file === "" ? "Point project at the folder holding the project's .optix file." : "Nothing serves the preview address: optix_emulator with action start launches the runtime and waits for it to answer.";
			return {
				...withSaveState(report),
				disk: diskReport,
				...(saveVerdict === void 0 ? {} : { save_verdict: saveVerdict })
			};
		}
	})));
}
//#endregion
//#region lib/types/index.js
/** Native FactoryTalk Optix discovery and live authoring tools. @module dsh-tool-ft-optix */
/** Cordis plugin name. */
const name = "tool-ft-optix";
/** Tools are dispatched through the harness policy and session pipeline. */
const inject = ["tools"];
/** Runtime configuration; no connection is opened during plugin registration. */
const Config = z.object({
	bridgeUrls: z.array(z.string()).default(["http://127.0.0.1:8768"]),
	bridgeToken: z.string().default(""),
	allowWrites: z.boolean().default(false),
	allowDestructive: z.boolean().default(false),
	allowInvoke: z.boolean().default(false),
	requestTimeoutMs: z.natural().min(1).max(2147483647).default(2e4),
	maxResponseBytes: z.natural().min(1).default(2e6),
	maxBatchOps: z.natural().min(1).default(40),
	maxScreenOps: z.natural().min(1).default(240),
	maxMapNodes: z.natural().min(1).default(800),
	maxMapDepth: z.natural().min(1).default(8),
	preview: z.boolean().default(false),
	browser: z.union([
		z.const("attach"),
		z.const("launch")
	]).default("launch"),
	browserChannel: z.union([
		z.const("auto"),
		z.const("chrome"),
		z.const("msedge")
	]).default("auto"),
	browserPath: z.string().default(""),
	browserHeadless: z.boolean().default(false),
	cdpUrl: z.string().default("http://127.0.0.1:9223"),
	previewUrl: z.string().default("http://127.0.0.1:8081/"),
	allowPreviewInput: z.boolean().default(false),
	previewWidth: z.natural().min(320).max(7680).default(1920),
	previewHeight: z.natural().min(200).max(4320).default(1080),
	maxPreviewPixels: z.natural().min(1).default(8e6),
	ocr: z.union([z.const(null), z.object({
		executable: z.string(),
		language: z.string(),
		tessdataDirectory: z.string()
	})]).default(null)
});
const projectParameter = {
	type: "string",
	required: true,
	description: "Exact loaded project BrowseName from optix_status."
};
const text = {
	type: "string",
	required: true
};
const jsonOutput = {
	schema: { type: "json" },
	render: (_args, value) => [{
		type: "text",
		text: JSON.stringify(value, null, 2)
	}]
};
/**
* The type filter the file channel validates against: documented object types, variable types,
* the OPC-UA base types the project uses for every variable and property, and library types
* `project.js` treats as legitimately undocumented.
* @param type - Type name as the project YAML writes it.
*/
function knownProjectType(type) {
	return isObjectType(type) || isDataType(type);
}
/**
* Resolve the project a file-channel tool was pointed at.
*
* `project` alone searches the places Studio projects live; `project_root` settles it. With
* only a folder, the name comes from the one `<Project>.optix` in it.
* @param args - Tool arguments carrying `project` and/or `project_root`.
*/
async function resolveProjectFolder(args) {
	const named = typeof args.project === "string" ? args.project.trim() : "";
	const folder = typeof args.project_root === "string" ? args.project_root.trim() : "";
	if (named === "" && folder === "") {
		throw new Error("give project (the project name, as optix_status reports it) or project_root (the folder that holds <Project>.optix)");
	}
	let project = named;
	if (project === "") {
		let entries;
		try {
			entries = await readdir(folder);
		} catch {
			throw new Error(`no folder ${folder} - point project_root at the Optix project folder`);
		}
		const hit = entries.find((entry) => entry.toLowerCase().endsWith(".optix") && !entry.toLowerCase().endsWith(".optix.design"));
		if (hit === void 0) throw new Error(`no <Project>.optix in ${folder} - point project_root at the Optix project folder`);
		project = basename(hit, ".optix");
	}
	const found = await findProjectRoot(project, folder === "" ? void 0 : folder);
	return { project, ...found };
}
/**
* Resolve defaults before constructing transport or registering tools.
* @param config - Plugin configuration.
* @returns Validated complete deployment settings.
*/
function resolve(config) {
	const resolved = {
		bridgeUrls: config.bridgeUrls ?? ["http://127.0.0.1:8768"],
		bridgeToken: config.bridgeToken ?? "",
		allowWrites: config.allowWrites ?? false,
		allowDestructive: config.allowDestructive ?? false,
		allowInvoke: config.allowInvoke ?? false,
		requestTimeoutMs: config.requestTimeoutMs ?? 2e4,
		maxResponseBytes: config.maxResponseBytes ?? 2e6,
		maxBatchOps: config.maxBatchOps ?? 40,
		maxScreenOps: config.maxScreenOps ?? 240,
		maxMapNodes: config.maxMapNodes ?? 800,
		maxMapDepth: config.maxMapDepth ?? 8,
		preview: config.preview ?? false,
		browser: config.browser ?? "launch",
		browserChannel: config.browserChannel ?? "auto",
		browserPath: config.browserPath ?? "",
		browserHeadless: config.browserHeadless ?? false,
		cdpUrl: config.cdpUrl ?? "http://127.0.0.1:9223",
		previewUrl: config.previewUrl ?? "http://127.0.0.1:8081/",
		allowPreviewInput: config.allowPreviewInput ?? false,
		previewWidth: config.previewWidth ?? 1920,
		previewHeight: config.previewHeight ?? 1080,
		maxPreviewPixels: config.maxPreviewPixels ?? 8e6,
		ocr: config.ocr ?? null
	};
	for (const key of [
		"requestTimeoutMs",
		"maxResponseBytes",
		"maxBatchOps",
		"maxScreenOps",
		"maxMapNodes",
		"maxMapDepth",
		"maxPreviewPixels"
	]) if (!Number.isSafeInteger(resolved[key]) || resolved[key] < 1) throw new Error(`${key} must be a positive safe integer`);
	if (resolved.requestTimeoutMs > 2147483647) throw new Error("requestTimeoutMs exceeds the Node timer range");
	resolved.bridgeUrls = resolved.bridgeUrls.map(bridgeOrigin);
	if (!resolved.bridgeUrls.length || new Set(resolved.bridgeUrls).size !== resolved.bridgeUrls.length) throw new Error("bridgeUrls must be non-empty and unique");
	if (/[\r\n]/.test(resolved.bridgeToken)) throw new Error("bridgeToken cannot contain header delimiters");
	resolved.cdpUrl = bridgeOrigin(resolved.cdpUrl);
	resolved.previewUrl = previewTarget(resolved.previewUrl);
	if (/[\0\r\n]/.test(resolved.browserPath)) throw new Error("browserPath must be a plain path without control characters");
	if (resolved.ocr) {
		if (!resolved.preview) throw new Error("Optix OCR requires preview enabled");
		if (!resolved.ocr.executable.trim() || resolved.ocr.executable.includes("\0")) throw new Error("OCR executable must be non-empty");
		if (!/^[a-zA-Z0-9_]+(?:\+[a-zA-Z0-9_]+)*$/.test(resolved.ocr.language)) throw new Error("OCR language must contain installed language names joined with +");
	}
	return resolved;
}
/**
* Require authoritative validation fields rather than treating a partial report as approval.
* @param value - External validation result.
* @param count - Number of submitted operations.
* @returns Whether strict preflight accepted every operation.
*/
function acceptedValidation(value, count) {
	if (typeof value.ok !== "boolean" || value.op_count !== count || !Array.isArray(value.errors) || !Array.isArray(value.warnings)) throw new Error("Bridge returned an incomplete batch validation report");
	return value.ok && value.errors.length === 0 && value.warnings.length === 0;
}
/** An OCR install is a package-manager download, so it gets far longer than a request. */
const OCR_INSTALL_TIMEOUT_MS = 300000;
/**
 * The plugin's own topic playbooks: one page per capability, each written from a live measurement.
 *
 * `SKILL.md` is the entry point and carries the rules that apply everywhere; these pages are the deep end
 * (the exact op, the exact API name, the trap that cost an afternoon). Two tools, because a session should
 * list first and read one page instead of loading every trap up front.
 * @param ctx - Cordis context with the harness tool runtime.
 */
function applySkills(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_list_skills",
		description: "List the plugin's own Optix topic playbooks - one page per capability (authoring loop, bindings and expressions, runtime C#, alarms, data logger/trend/SQL, dialogs and login, screens and layout, verifying and releasing, PLC tag import). Each row reports the topic name, its title, a one-line summary and its size, so a session can pick the page it needs and read only that one with optix_get_skill. Read-only.",
		parameters: {
			query: {
				type: "string",
				description: "Optional case-insensitive filter over the topic name, title and summary."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "List the Optix topic playbooks",
			kind: "read"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const rows = await listSkills();
			const query = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
			const filtered = query === "" ? rows : rows.filter(row => `${row.name} ${row.title} ${row.summary}`.toLowerCase().includes(query));
			return {
				count: filtered.length,
				topics: filtered,
				total_bytes: filtered.reduce((sum, row) => sum + row.bytes, 0),
				next: filtered.length > 0 ? `optix_get_skill name="${filtered[0].name}" for the full page` : "No topic matched that filter."
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_get_skill",
		description: "Read one Optix topic playbook in full, by the name optix_list_skills reported. Each page is written from a measurement on a live project: the exact tool calls and property names, plus the traps that make a feature report success while rendering nothing. Use it before authoring a feature that has a page - the page is cheaper than rediscovering the trap. Read-only.",
		parameters: {
			name: {
				type: "string",
				required: true,
				description: "Topic name from optix_list_skills, for example \"alarms\" or \"data-logger-trend-sql\"."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Read the Optix playbook: ${typeof args?.name === "string" ? args.name : "topic"}`,
			kind: "read"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			return await readSkill(args.name);
		}
	})));
}
/**
 * The runtime log and the bridge log: the only place a silent failure shows up.
 *
 * A blank chart, a label with no text, an alarm that never fires - the model looks right in every case, and
 * the reason is one line in a log ("No behaviour or observer found", "Missing source variable 'Source0'",
 * "Unable to resolve Store object"). Both are plain files on the host; this tool reads their tails.
 * @param ctx - Cordis context with the harness tool runtime.
 */
function applyLogs(ctx) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_logs",
		description: "Read the tail of the Optix runtime log (the latest run of the project, per project) or the bridge plugin's log, optionally filtered to lines containing a word such as \"error\", \"store\", \"formatter\" or \"behaviour\". This is where a silent failure is explained: a component that refused a dynamic link, a method that is not a behaviour, a store that never opened. Read-only; it never starts or stops anything.",
		parameters: {
			which: {
				type: "string",
				description: "Which log to read: runtime (default) or bridge.",
				enum: ["runtime", "bridge"]
			},
			project: {
				type: "string",
				description: "Absolute project folder, used to pick the runtime log that belongs to it. Omit for the newest runtime log."
			},
			lines: {
				type: "number",
				description: "How many trailing lines to return, 1 to 2000. Defaults to 80."
			},
			filter: {
				type: "string",
				description: "Optional case-insensitive substring; only lines containing it are returned."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: (args) => ({
			card: "generic",
			title: `Read the ${typeof args?.which === "string" ? args.which : "runtime"} log`,
			kind: "read"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const count = typeof args.lines === "number" && Number.isFinite(args.lines) ? Math.min(2000, Math.max(1, Math.trunc(args.lines))) : 80;
			const filter = typeof args.filter === "string" ? args.filter : "";
			const which = typeof args.which === "string" ? args.which : "runtime";
			return which === "bridge" ? await bridgeLog(count, filter) : await runtimeLog(args.project, count, filter);
		}
	})));
}
/**
 * Save the project by sending Studio its own Ctrl+S until the design model on disk moves.
 *
 * Nothing in UAManagedCore can save a project, so every authoring call in this plugin ends with the
 * operator pressing Ctrl+S - which is why a round of checks used to stop at "ask the engineer". This
 * tool performs that keystroke itself: it raises the Studio window (the foreground lock is the whole
 * difficulty), sends Ctrl+S only once the foreground is confirmed, and then proves the write by
 * watching the newest mtime under `Nodes/` and `ProjectFiles/NetSolution/bin`. `ok` is never true on
 * a keystroke alone.
 *
 * It is a write path, so it needs `allowWrites`; it starts no process and edits no file.
 * @param ctx - Cordis context with the harness tool runtime.
 * @param settings - Resolved deployment settings.
 */
function applySave(ctx, settings) {
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_save",
		description: "Save the open Optix project through Studio and prove the write landed. Studio exposes no save API to a NetLogic bridge, so this raises the Studio window, sends Ctrl+S, and retries until a file under Nodes/ or ProjectFiles/NetSolution/bin is newer than it was before the first keystroke; it reports attempts, how many keystrokes were delivered, whether the foreground was confirmed, and the latency. ok is true only when the design model on disk actually moved - a keystroke that went to another window is reported as foreground_refused, and a delivered Ctrl+S that changed nothing is no_write. Saving rebuilds the .NET solution; a NetLogic or bridge change additionally needs a Studio restart before the new class answers. Requires allowWrites.",
		parameters: {
			project: {
				type: "string",
				required: true,
				description: "Absolute path of the project directory holding the .optix file."
			},
			timeout_s: {
				type: "integer",
				description: "How long to keep retrying. Default 60, at most 600."
			},
			interval_s: {
				type: "integer",
				description: "Pause between attempts after a delivered keystroke. Default 4, at most 30."
			}
		},
		output: {
			schema: { type: "json" },
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Save the Optix project",
			kind: "invoke"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			if (!settings.allowWrites) throw new Error("Saving writes the project to disk, so it needs allowWrites in the Optix row's plugin configuration.");
			return await saveProject({
				projectRoot: args.project,
				timeoutMs: args.timeout_s === void 0 ? void 0 : args.timeout_s * 1000,
				intervalMs: args.interval_s === void 0 ? void 0 : args.interval_s * 1000
			});
		}
	})));
}

/**
 * How long a preview frame is allowed to settle after the canvas first reports a size.
 * Measured on Studio 1.8.1 (2026-11-14): the Web presentation engine creates its canvas at
 * load and paints a frame or two later, so an immediate screenshot is a blank page.
 */
const PREVIEW_SETTLE_MS = 900;
/**
 * Report the host Tesseract that `optix_ocr` reads with, and install it on request.
 * Registered whether or not OCR is configured, so a missing OCR tool can be explained
 * rather than guessed at, and so the fix is one config value where Tesseract is already
 * on the machine. No Python service and no OCR daemon is ever installed.
 * @param ctx - Cordis context with the harness tool runtime.
 * @param settings - Resolved deployment settings.
 */
function applyOcrSetup(ctx, settings) {
	/** Run a host command and resolve its combined output, rejecting with that output on failure. */
	function hostRun(command, args, timeoutMs, signal) {
		const completed = Promise.withResolvers();
		const child = execFile(command, args, {
			env: scrubbedParentEnv(),
			windowsHide: true,
			timeout: timeoutMs,
			maxBuffer: settings.maxResponseBytes,
			encoding: "utf8",
			signal
		}, (_error, stdout, stderr) => {
			const output = `${stdout ?? ""}\n${stderr ?? ""}`.trim();
			completed.resolve(output);
		});
		signal.addEventListener("abort", () => {
			child.kill();
		}, {
			once: true
		});
		return completed.promise;
	}
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_ocr_setup",
		description: "Report the host Tesseract install that optix_ocr reads canvas text with, and with install set to true install it through the Windows package manager. Detection names the executable, whether it is on this machine, and whether the language data is present; the install is idempotent and never installs a Python service or an OCR daemon. Run this before telling an engineer that canvas text cannot be read.",
		parameters: {
			install: {
				type: "boolean",
				required: true,
				description: "true installs Tesseract through winget when it is missing; false only reports the state."
			}
		},
		output: {
			schema: {
				type: "json"
			},
			render: (_args, value) => [{
				type: "text",
				text: JSON.stringify(value, null, 2)
			}]
		},
		presentCall: () => ({
			card: "generic",
			title: "Check the OCR install",
			kind: "edit"
		}),
		async execute(args, exec) {
			let probe = await ocrProbe(settings.ocr);
			let installedNow = false;
			if (args.install && !probe.installed && probe.discovered === "") {
				const command = await tesseractInstallCommand();
				if (command.length === 0) throw new Error("Tesseract is not installed and winget is not on PATH: install Tesseract-OCR yourself, then set ocrExecutable to its tesseract.exe");
				await hostRun(command[0], command.slice(1), OCR_INSTALL_TIMEOUT_MS, exec.signal);
				probe = await ocrProbe(null);
				installedNow = true;
			}
			const executable = probe.installed ? probe.executable : probe.discovered;
			const tessdataDirectory = executable === "" ? "" : probe.installed ? probe.tessdataDirectory : join(dirname(executable), "tessdata");
			const traineddata = executable === "" ? false : probe.traineddata;
			let version = "";
			if (executable !== "") version = (await hostRun(executable, ["--version"], settings.requestTimeoutMs, exec.signal)).match(/v?(\d+\.\d+[^\s)]*)/u)?.[1] ?? "";
			let next = "";
			if (!settings.preview) next = "preview is off on the Optix row: turn it on before optix_ocr can read the canvas.";
			else if (executable === "") next = args.install ? "The package manager did not install Tesseract: install Tesseract-OCR yourself, then set ocrExecutable to its tesseract.exe." : "Tesseract is not on this machine: call this tool with install set to true to install it through winget.";
			else if (!traineddata) next = `Tesseract is installed but ${probe.language}.traineddata is not in ${tessdataDirectory}: set ocrTessdataDirectory to the folder that holds it.`;
			else if (settings.ocr === null) next = `Set the Optix row's ocrExecutable to ${executable} to register optix_ocr.`;
			else next = "optix_ocr is registered: call it with psm 11 for scattered HMI labels and verify each value against the live model.";
			return {
				preview: settings.preview,
				registered: settings.ocr !== null && probe.installed && traineddata,
				installed: executable !== "",
				executable,
				...version === "" ? {} : {
					version
				},
				language: probe.language,
				tessdataDirectory,
				traineddata,
				...installedNow ? {
					installedNow: true
				} : {},
				next
			};
		}
	})));
}
/**
* Register native tools and abort transport work on plugin disposal.
* @param ctx - Cordis context with the harness tool runtime.
* @param config - Connection and authoring settings.
*/
function apply(ctx, config = {}) {
	const settings = resolve(config);
	// The gateway is built before the authoring faces so a face that only probes the bridge
	// (arming, which reads whether Studio already has the project open) shares the one transport.
	const disposed = new AbortController();
	const bridge = new OptixBridgeGateway(settings, disposed.signal);
	ctx.effect(() => async () => {
		disposed.abort();
		await bridge.drain();
	});
	applyTemplates(ctx, settings.maxResponseBytes);
	applyBridgeArm(ctx, bridge);
	applyEmulator(ctx, settings);
	applySave(ctx, settings);
	applySkills(ctx);
	applyLogs(ctx);
	applyOcrSetup(ctx, settings);
	if (settings.preview) ctx.inject(["attachments"], (scope) => {
		applyPreview(scope, settings);
	});
	let editing = false;
	/** One process-local authoring owner prevents interleaved batches. */
	async function exclusive(run) {
		if (editing) throw new Error("An Optix authoring call is already running; wait for its result before submitting another");
		editing = true;
		try {
			return await run();
		} finally {
			editing = false;
		}
	}
	/** Config enablement is checked before any live operation is dispatched. */
	function allowWrite(destructive = false) {
		if (!settings.allowWrites) throw new Error("Optix live authoring is disabled; set allowWrites in the plugin configuration");
		if (destructive && !settings.allowDestructive) throw new Error("This operation requires allowDestructive in the plugin configuration");
	}
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_status",
		description: "Report the state of the FactoryTalk Optix tool chain: loaded Studio projects through configured local bridges, the preview, emulator and OCR chain with the first missing link named, and whether the live project has authoring changes the engineer still has to save. Call it when a project is in play - to check which project is loaded, before a preview or screenshot, after authoring, or when a bridge answers nothing - not to find out what to build: a new build starts from the brief, our two packaged starters and `engineering_reference`, and an inventory of the machine is not a brief (CRAFT-ORD-01). No MCP or Python service is required.",
		parameters: {
			saved: {
				type: "boolean",
				description: "Set true only after the engineer confirms they saved and built the project. It clears the outstanding-change count, which nothing else can clear because no tool can save the project."
			},
			project: {
				type: "string",
				description: "Optional project name. With project or project_root, the answer also carries build_state: whether bin/<Project>.dll is newer than the newest .cs, and whether the references file resolves."
			},
			project_root: {
				type: "string",
				description: "Optional folder that holds <Project>.optix, for the build report."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Discover Optix projects",
			kind: "read"
		}),
		async execute(args, exec) {
			const endpoints = [];
			for (const origin of settings.bridgeUrls) {
				exec.signal.throwIfAborted();
				try {
					endpoints.push({
						origin,
						available: true,
						health: await bridge.request(origin, "health", exec.signal),
						needs_save: pendingModelChanges(origin)
					});
				} catch (error) {
					if (exec.signal.aborted || disposed.signal.aborted) throw error;
					const diagnosis = await describeSilentBridge(origin, exec.signal);
					endpoints.push({
						origin,
						available: false,
						error: "Bridge unavailable",
						diagnosis,
						next: diagnosis.next,
						needs_save: pendingModelChanges(origin)
					});
				}
			}
			const outstanding = settings.bridgeUrls.reduce((total, origin) => total + pendingModelChanges(origin).pending, 0);
			const saved = args?.saved === true;
			const cleared = saved ? clearModelChanges(settings.bridgeUrls) : 0;
			let buildStateReport;
			const wantsBuild = (typeof args?.project === "string" && args.project.trim() !== "")
				|| (typeof args?.project_root === "string" && args.project_root.trim() !== "");
			if (wantsBuild) {
				try {
					const resolved = await resolveProjectFolder(args);
					buildStateReport = await buildState(resolved.root);
				} catch (error) {
					buildStateReport = { error: error.message };
				}
			}
			return {
				endpoints,
				authoring: settings.allowWrites,
				destructive: settings.allowDestructive,
				invoke: settings.allowInvoke,
				preview_chain: await chainReport(settings, exec.signal),
				...(buildStateReport === undefined ? {} : { build_state: buildStateReport }),
				...(outstanding === 0 && !saved ? {} : {
					needs_save: {
						pending: saved ? 0 : outstanding,
						...(cleared > 0 ? { cleared } : {}),
						routes: settings.bridgeUrls.flatMap((origin) => pendingModelChanges(origin).routes),
						next: saved ? "Count cleared after the engineer's save." : SAVE_HANDOFF
					}
				}),
				...(outstanding === 0 || saved ? {} : { next: `${outstanding} authoring change${outstanding === 1 ? "" : "s"} exist in Studio's live model only. ${SAVE_HANDOFF}` })
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_read",
		description: "Read the live Optix model, screens, widget types, schemas, variable members, or CLR diagnostics. Start with map, inspect declared properties with type_schema, then author. Disk files may be stale while Studio is open.",
		parameters: {
			project: projectParameter,
			request: {
				required: true,
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "map",
								required: true
							},
							path: { type: "string" },
							depth: { type: "integer" },
							max: { type: "integer" },
							mode: {
								type: "string",
								enum: ["overview", "detail"]
							},
							match: { type: "string" },
							ids: { type: "boolean" }
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "node",
								required: true
							},
							path: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: { action: {
							type: "string",
							const: "screens",
							required: true
						} }
					},
					{
						type: "object",
						additionalProperties: false,
						properties: { action: {
							type: "string",
							const: "ui_types",
							required: true
						} }
					},
					{
						type: "object",
						additionalProperties: false,
						properties: { action: {
							type: "string",
							const: "schema",
							required: true
						} }
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "type_schema",
								required: true
							},
							type: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "type_info",
								required: true
							},
							path: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "variable_members",
								required: true
							},
							path: text,
							name: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "clr_type",
								required: true
							},
							name: text
						}
					}
				]
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Read Optix ${args.request.action}`,
			kind: "read"
		}),
		async execute(args, exec) {
			const routes = {
				map: "map",
				node: "nodes",
				screens: "screens",
				ui_types: "types/ui",
				schema: "schema/dump",
				type_schema: "types/schema",
				type_info: "node/typeinfo",
				variable_members: "node/varmembers",
				clr_type: "diag/clrtype"
			};
			const request = args.request;
			const query = {};
			for (const [key, value] of Object.entries(request)) if (key !== "action") query[key] = typeof value === "boolean" ? value ? "1" : "0" : String(value);
			if (request.action === "map") {
				const max = request.max ?? settings.maxMapNodes;
				const depth = request.depth ?? Math.min(3, settings.maxMapDepth);
				if (max < 1 || max > settings.maxMapNodes || depth < 1 || depth > settings.maxMapDepth) throw new Error("Requested map exceeds configured node or depth limits");
				query.max = String(max);
				query.depth = String(depth);
				if (!Object.hasOwn(query, "mode")) query.mode = "overview";
			}
			const { origin } = await bridge.select(args.project, exec.signal);
			return {
				project: args.project,
				origin,
				response: await bridge.request(origin, routes[request.action], exec.signal, query)
			};
		}
	})));
	/**
	* Validate a typed batch strictly, then apply it one operation at a time.
	*
	* One implementation of the batch contract, shared by `optix_edit` and
	* `optix_model`: `validate_ops` first so a refused batch writes nothing, the
	* serving project re-checked before every write so a reloaded or switched
	* project cannot receive a half batch, and partial/indeterminate reported
	* honestly rather than retried.
	* @param input - Origin, target project, health snapshot, signal and the batch.
	* @returns The same report shape `optix_edit` returns.
	*/
	async function runValidatedBatch({ origin, project, ops, health: selectedHealth, signal, apply = true }) {
		if (!ops.length || ops.length > settings.maxBatchOps) throw new Error("Batch must contain 1..maxBatchOps operations");
		const normalized = ops.map((op) => op.prop_name === void 0 ? op : {
			...op,
			name: op.prop_name
		});
		const validation = await bridge.request(origin, "validate_ops", signal, {}, "POST", {
			ops: normalized,
			strict: true
		});
		if (!acceptedValidation(validation, ops.length)) return {
			status: "refused",
			applied: 0,
			validation
		};
		if (!apply) return {
			status: "validated",
			applied: 0,
			validation
		};
		const results = [];
		for (const [index, op] of ops.entries()) {
			let dispatched = false;
			try {
				const health = await bridge.request(origin, "health", signal);
				if (health.project !== project || health.model_loaded !== true || health.pid !== selectedHealth.pid || health.project_path !== selectedHealth.project_path) throw new Error("Serving Studio project changed during the batch");
				const request = operationRequest(op);
				dispatched = true;
				const result = await bridge.request(origin, request.route, signal, request.query, "POST");
				if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the authoring operation", true);
				results.push(result);
			} catch (error) {
				return {
					status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
					applied: results.length,
					failed_index: index,
					results,
					validation,
					error: String(error),
					retry: "Inspect the live model; do not replay the entire batch automatically"
				};
			}
		}
		// A wiring operation written with a relative pointer path still leaves the
		// absolute design-time NodeId in the pointer, and the runtime resolves that id
		// first (the live failure is "No behaviour or observer found that handles the
		// method 'ChangePanel'"). Clearing it belongs to every caller that wires an
		// event, not only to optix_screen, so it happens here too.
		const pointerClearing = await clearPointerValues(origin, ops, signal);
		return {
			status: "completed",
			applied: results.length,
			results,
			validation,
			...(pointerClearing.cleared === 0 ? {} : { pointer_values_cleared: pointerClearing.cleared }),
			...(pointerClearing.failed.length === 0 ? {} : { pointer_values_uncleared: pointerClearing.failed })
		};
	}
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_edit",
		description: "Strictly validate then sequentially apply a typed Optix authoring batch. dry_run defaults to true. Live writes require allowWrites; destructive operations also require allowDestructive. Stops on first failure; reports partial or indeterminate outcomes. No automatic retry or batch rollback. Re-read the model before retrying an indeterminate operation.",
		parameters: {
			project: projectParameter,
			ops: {
				type: "array",
				items: operationSchema,
				required: true
			},
			dry_run: { type: "boolean" }
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: args.dry_run === false ? "Author Optix model" : "Validate Optix edits",
			kind: args.dry_run === false ? "edit" : "read"
		}),
		async execute(args, exec) {
			const requested = args.ops;
			if (!requested.length || requested.length > settings.maxBatchOps) throw new Error("Batch must contain 1..maxBatchOps operations");
			checkOperations(requested);
			const expansion = expandVariables(requested);
			const ops = expansion.ops;
			if (ops.length > settings.maxBatchOps) throw new Error(`These operations expand to ${ops.length} bridge calls, over the batch limit of ${settings.maxBatchOps}: split the variables into more than one call`);
			const dryRun = args.dry_run !== false;
			if (!dryRun) allowWrite(isDestructive(requested) || isDestructive(ops));
			return exclusive(async () => {
				const { origin, health: selectedHealth } = await bridge.select(args.project, exec.signal);
				const report = await runValidatedBatch({
					origin,
					project: args.project,
					ops,
					health: selectedHealth,
					signal: exec.signal,
					apply: !dryRun
				});
				return expansion.notes.length === 0 ? report : {
					...report,
					...(report.applied === void 0 ? {} : { applied: report.applied }),
					expanded_ops: ops.length,
					notes: expansion.notes
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_schema",
		description: "Read the Optix object model of the installed Studio: one object type with its properties (data types and inheritance), methods, events and allowed child types; one enum with its members; or a search across types by name or by property. Generated from the installed Studio help, so it names this build rather than a remembered one. Ask it before writing a property, choosing a widget type or picking an enum value - a wrong property name or enum member is the commonest reason the bridge refuses a batch. A curated type also answers `clrType` (the C# type a NetLogic class should name, e.g. FTOptix.UI.PanelLoader) and `netlogic_page` (the cheat-sheet page to read first). action refresh compares the shipped catalog with the running Studio's own type dump and reports what a Studio upgrade added, removed or changed.",
		parameters: {
			project: projectParameter,
			action: {
				type: "string",
				required: true,
				enum: [
					"type",
					"enum",
					"find",
					"children",
					"refresh"
				],
				description: "type reads one object type; enum reads one enum; find searches types, enums and properties; children lists the types that may be created inside a type; refresh diffs the shipped catalog against the running Studio."
			},
			name: {
				type: "string",
				description: "Type or enum name for action type, enum or children. A fully qualified name such as FTOptix.UI.AdvancedSVGImage is accepted."
			},
			query: {
				type: "string",
				description: "Type name, enum name or property name to search for with action find."
			},
			limit: {
				type: "integer",
				description: "Most matches for action find. Default 12."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Read the Optix object model",
			kind: "read"
		}),
		async execute(args, exec) {
			const catalog = schemaVersion();
			if (args.action === "refresh") {
				// The dump reflects the RUNNING Studio, so it is the only way to see a
				// Studio upgrade the shipped catalog predates.
				const { origin, health } = await bridge.select(args.project, exec.signal);
				const dump = await bridge.request(origin, "schema/dump", exec.signal);
				return {
					...catalog,
					project: health.project,
					dump: diffDump(dump)
				};
			}
			if (args.action === "find") {
				if (typeof args.query !== "string" || args.query.trim() === "") throw new Error("action find needs query: a type name, an enum name or a property name");
				return {
					...catalog,
					...findSchema(args.query, args.limit === void 0 ? 12 : args.limit)
				};
			}
			const wanted = typeof args.name === "string" ? args.name.trim() : "";
			if (wanted === "") throw new Error(`action ${args.action} needs name: an object type name from action find`);
			// A NetLogic writes `FTOptix.UI.AdvancedSVGImage`; the catalog keys on the
			// browse name. Accept both rather than making the caller guess.
			const name = !isObjectType(wanted) && wanted.includes(".") ? wanted.slice(wanted.lastIndexOf(".") + 1) : wanted;
			if (args.action === "enum") {
				const info = enumInfo(name);
				if (info === undefined) throw new Error(`${wanted} is not an enum in this Studio build${suggestSuffix(name, Object.keys(loadSchema().enums ?? {}))}`);
				return {
					...catalog,
					enum: info
				};
			}
			if (args.action === "children") {
				const children = childrenOf(name);
				if (children === undefined) throw new Error(`${wanted} is not a type in this Studio build${suggestSuffix(name, typeNames())}`);
				return {
					...catalog,
					type: name,
					children
				};
			}
			const info = typeInfo(name);
			if (info === undefined) throw new Error(`${wanted} is not a type in this Studio build${suggestSuffix(name, typeNames())}`);
			return {
				...catalog,
				type: info
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_docs",
		description: "Search Rockwell's own Studio help, which is installed beside the IDE - 2,591 pages on 1.8.1.27 - without asking a model. action search ranks a shipped index (title, headings, snippet) so a question like \"how does ChangeUser work\" lands on Session.ChangeUser in one call; action read returns one page's text from the installed Help (the pages are read, not shipped: they are 266 MB of generated HTML); action status says whether the index matches the installed Studio. Use it before guessing an API name, a menu path or a property meaning, and treat what it returns as Rockwell documentation, not as a claim about this project's model - optix_read and optix_schema answer that. Navigation is the known gap: ChangePanel is not in the installed help at all, so optix_nav and docs/optix-nav.md are the source for it.",
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: [
					"search",
					"read",
					"status"
				],
				description: "search ranks the index; read returns one page from the installed Help; status reports freshness and where pages are read from."
			},
			query: {
				type: "string",
				description: "Words to search for with action search: an API name (ChangeUser), a menu label or a topic."
			},
			id: {
				type: "string",
				description: "Exact page id from action search, for action read (for example Reference/FTOptix-UI/ObjectTypes/PanelLoader)."
			},
			section: {
				type: "string",
				description: "Optional path filter for search, for example Reference or creating-projects."
			},
			limit: {
				type: "integer",
				description: "Most hits for action search. Default 8."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Search the installed Studio help",
			kind: "read"
		}),
		async execute(args) {
			const index = await loadHelpIndex();
			const base = {
				action: args.action,
				pages: index.pageCount,
				studio_version: index.studioVersion
			};
			if (args.action === "status") {
				const installs = await studioInstalls();
				const status = await helpStatus(index, { installs });
				return {
					...base,
					...status,
					next: status.stale ? ["run node scripts/gen-optix-help.mjs after a Studio upgrade, so the index matches the help on disk"] : status.help_folder_present ? ["optix_docs action search with the API name or menu label"] : ["install FactoryTalk Optix Studio to read pages; search still works from the shipped index"]
				};
			}
			if (args.action === "read") {
				if (typeof args.id !== "string" || args.id.trim() === "") throw new Error("action read needs id: a page id from action search");
				const install = pickInstall(await studioInstalls());
				const page = await readHelpPage(index, args.id.trim(), { install });
				return {
					...base,
					...page,
					next: ["this is Rockwell documentation; optix_read or optix_schema answers what THIS project holds"]
				};
			}
			if (typeof args.query !== "string" || args.query.trim() === "") throw new Error("action search needs query: words, an API name or a menu label");
			const result = searchHelp(index, args.query, {
				limit: args.limit === void 0 ? 8 : args.limit,
				section: typeof args.section === "string" ? args.section : ""
			});
			return {
				...base,
				...result,
				next: result.hits.length === 0 ? ["try fewer words or a section filter (Reference, creating-projects); optix_schema answers the object model"] : ["optix_docs action read with an id from hits"]
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_svg",
		description: "Work with SVG artwork the way an Advanced SVG image needs it. action inspect checks a drawing BEFORE it is placed: Optix can only drive a part that carries an id and whose fill or stroke is a hexadecimal colour on that part, and a drawing that breaks that rule renders correctly while silently refusing every property. action add copies the file into <project>/ProjectFiles/imgs (the folder the Web presentation engine serves as /projectfiles) and sets the image Path to %PROJECTDIR%/imgs/<name>.svg, creates the AdvancedSVGImage and sets its Path to %PROJECTDIR%/imgs/<name>.svg (the Web presentation engine cannot read an absolute path). action bind creates the SVG element property that drives one part - a literal colour, a bound tag, or a boolean with two colours - and reports the node it wrote. action list shows the images on a screen and what each one animates. Nothing here edits your artwork: a repair is a suggestion.",
		parameters: {
			project: projectParameter,
			action: {
				type: "string",
				required: true,
				enum: [
					"inspect",
					"add",
					"bind",
					"list"
				],
				description: "inspect reads a drawing; add places it; bind drives one part; list reports what a screen animates."
			},
			source: { type: "string", description: "Path to the .svg file, for inspect or add." },
			inline: { type: "string", description: "SVG text, for inspect or add, instead of source." },
			project_root: { type: "string", description: "Folder holding the project's .optix file, for add. Omit to search the usual places." },
			screen: { type: "string", description: "Path of the container to add the image to (for add), or the screen to report (for list)." },
			name: { type: "string", description: "BrowseName for the new image node, for add. Also the file stem: <name>.svg." },
			box: {
				type: "object",
				additionalProperties: false,
				description: "Where the image sits, for add.",
				properties: {
					left: { type: "integer", description: "Left margin in pixels. Default 0." },
					top: { type: "integer", description: "Top margin in pixels. Default 0." },
					width: { type: "integer", description: "Width in pixels. Default: the drawing's own width, else 200." },
					height: { type: "integer", description: "Height in pixels. Default: the drawing's own height, else 200." }
				}
			},
			node: { type: "string", description: "Path of the AdvancedSVGImage, for bind." },
			id: { type: "string", description: "The element id inside the drawing whose property to drive, for bind." },
			property: {
				type: "string",
				enum: [
					"Color",
					"Opacity",
					"StrokeWidth",
					"StrokeDasharray"
				],
				description: "Which Advanced SVG image property to drive, for bind."
			},
			value: { type: "string", description: "Literal value for bind, for example #30A46C or 0.45." },
			source_path: { type: "string", description: "Live-model tag or variable path to bind the property to, for bind." },
			bool_colours: {
				type: "object",
				additionalProperties: false,
				description: "Drive a colour from a boolean tag, for bind: true and false render with these colours.",
				properties: {
					on: { type: "string", required: true, description: "Colour when the tag is true, in hexadecimal." },
					off: { type: "string", required: true, description: "Colour when the tag is false, in hexadecimal." }
				}
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: args.action === "inspect" ? "Inspect SVG" : args.action === "list" ? "List SVG images" : "Author SVG image",
			kind: args.action === "inspect" || args.action === "list" ? "read" : "edit"
		}),
		async execute(args, exec) {
			if (args.action === "inspect") {
				const text = await svgText(args);
				const analysis = inspectSvg(text);
				const repairs = repairPlan(analysis);
				return {
					...analysis,
					repairs,
					next: analysis.conformant
						? "Conformant: every controllable part is listed in controlable. Place it with action add, then drive a part with action bind."
						: "Not controllable as drawn: apply the repairs, re-run action inspect, and place it only once conformant. Optix will render this file, but every property you ask for will be ignored."
				};
			}

			if (args.action === "list") {
				const { origin } = await bridge.select(args.project, exec.signal);
				const screen = requirePath(args.screen, "action list needs screen: the screen or panel path to report");
				const tree = await bridge.request(origin, "map", exec.signal, {
					path: screen,
					mode: "detail",
					depth: 4,
					max: 400
				});
				const images = [];
				// A `map` reply's root node IS the requested node, so the walk has to start from its parent
				// or every composed path loses the first segment ("ProbeHardening/Art" instead of
				// "UI/ProbeHardening/Art", measured live against bridge 1.0.9).
				const parent = screen.includes("/") ? screen.slice(0, screen.lastIndexOf("/")) : "";
				for (const node of flattenTree(tree.map, parent)) {
					if (node.type !== "AdvancedSVGImage") continue;
					const detail = await bridge.request(origin, "nodes", exec.signal, { path: node.path }).catch(() => void 0);
					// A `nodes` reply names children `browse_name` where a `map` reply names them `name`;
					// looking for `name` here found nothing and reported every image as driving no part.
					const collection = [...(detail?.children ?? [])].find((child) => (child.name ?? child.browse_name) === "SVGElementProperties");
					const rows = collection === void 0 ? [] : await bridge.request(origin, "map", exec.signal, {
						path: `${node.path}/SVGElementProperties`,
						mode: "detail",
						depth: 1,
						max: 100
					}).then((reply) => (reply.map?.children ?? []).map((child) => ({ name: child.name, type: child.type }))).catch(() => []);
					images.push({
						path: node.path,
						path_property: nodeValue(detail, "Path"),
						element_properties: rows
					});
				}
				return {
					project: args.project,
					screen,
					images,
					next: images.length === 0
						? "No AdvancedSVGImage on that screen. Add one with action add, after action inspect says the drawing is conformant."
						: "Each element_properties row is a part this image drives; a drawing with none animates nothing."
				};
			}

			const { origin, health } = await bridge.select(args.project, exec.signal);
			allowWrite(false);

			if (args.action === "bind") {
				const node = requirePath(args.node, "action bind needs node: the AdvancedSVGImage path");
				const id = requirePath(args.id, "action bind needs id: the element id inside the drawing");
				const klass = propertyClass(args.property);
				if (klass === undefined) throw new Error(`property "${args.property}" is not one of Color, Opacity, StrokeWidth, StrokeDasharray`);
				// bool_colours needs source_path as well (the tag that chooses), so it is an
				// alternative to source_path, not an addition to it.
				const modes = [
					args.value !== void 0,
					args.source_path !== void 0 && args.bool_colours === void 0,
					args.bool_colours !== void 0
				].filter(Boolean).length;
				if (modes !== 1) throw new Error("action bind takes exactly one of value, source_path or bool_colours; bool_colours also needs source_path (the boolean tag)");
				const element = elementPropertyName(id, klass);
				const collection = `${node}/SVGElementProperties`;
				const target = `${collection}/${element}`;
				const existing = await bridge.request(origin, "nodes", exec.signal, { path: target }).catch(() => void 0);
				// A `nodes` reply describes the node as properties/children and does not repeat its
				// own name, so "does it exist" is any descriptive field rather than a name check.
				const alreadyThere = existing !== void 0 && (existing.browse_name !== void 0 || existing.name !== void 0 || existing.node_class !== void 0 || existing.properties !== void 0 || existing.children !== void 0);
				const ops = [];
				if (!alreadyThere) {
					// The element property is created at its collection path explicitly: the
					// bridge would otherwise route it there and report the routing as a note.
					ops.push({
						op: "create_widget",
						screen: collection,
						name: element,
						widget_type: "AdvancedSVGImageElementProperty"
					}, {
						op: "set_property",
						path: target,
						name: "ID",
						value: id
					}, {
						op: "set_property",
						path: target,
						name: "Property",
						value: klass
					});
				}
				// bool_colours is tested first: it also carries source_path (the boolean that chooses), so a
				// plain "is there a source" test would bind the boolean straight to a colour and drop the two
				// colours on the floor (measured 2026-11-15, where the probe bound a Bool to a Color).
				if (args.bool_colours !== void 0) {
					const on = hexColour(args.bool_colours.on, "bool_colours.on");
					const off = hexColour(args.bool_colours.off, "bool_colours.off");
					if (args.source_path === void 0) throw new Error("bool_colours needs source_path: the boolean tag that chooses between the two colours");
					// The element property's Value is BaseDataType and the engine takes the colour as an ARGB
					// integer, which is what the ExpressionEvaluator's hex literal produces.
					ops.push({
						op: "attach_expression",
						path: target,
						prop_name: "Value",
						expression: `if({0}, 0xFF${on.slice(1)}, 0xFF${off.slice(1)})`,
						sources: args.source_path
					});
				} else if (args.source_path !== void 0) {
					ops.push({
						op: "bind",
						path: target,
						name: "Value",
						source_path: args.source_path,
						mode: "Read"
					});
				} else {
					ops.push({
						op: "set_property",
						path: target,
						name: "Value",
						value: args.value
					});
				}
				const result = await runValidatedBatch({
					origin,
					project: args.project,
					ops,
					health,
					signal: exec.signal,
					apply: true
				});
				const detail = await bridge.request(origin, "nodes", exec.signal, { path: target }).catch(() => void 0);
				return {
					...result,
					node: target,
					...(result.status === "completed" ? {
						written: {
							id,
							property: klass,
							...(args.value === void 0 ? {} : { value: args.value }),
							...(args.source_path === void 0 ? {} : { source_path: args.source_path }),
							...(args.bool_colours === void 0 ? {} : { bool_colours: args.bool_colours })
						},
						read_back: nodeValue(detail, "Value")
					} : {}),
					next: result.status === "completed"
						? "Saved in the live model only: the drawing shows the change after the engineer saves and builds in Studio, then optix_emulator start and optix_screenshot."
						: "Read the refusal, fix it, and re-read the live model before retrying."
				};
			}

			// action add
			const text = await svgText(args);
			const analysis = inspectSvg(text);
			if (!analysis.conformant) {
				return {
					status: "refused",
					reason: "the drawing cannot be controlled as written",
					findings: analysis.findings,
					repairs: repairPlan(analysis),
					next: "Apply the repairs, then call action inspect again. A non-conformant drawing renders but ignores every Advanced SVG property, which is a silent failure at runtime."
				};
			}
			const screen = requirePath(args.screen, "action add needs screen: the container to place the image in");
			const name = requirePath(args.name, "action add needs name: the BrowseName and the file stem");
			const { root } = await findProjectRoot(args.project, args.project_root);
			// Measured on Studio 1.8.1.27 (2026-11-15): the Web presentation engine asks for
			// /projectfiles/imgs/<name>.svg and answers 404 unless the file sits under <project>/ProjectFiles,
			// which is what an AdvancedSVGImage renders blank without. The resource URI the node carries is
			// still %PROJECTDIR%/imgs/<name>.svg - the variable, not the folder, is the indirection.
			const imgs = projectImgsDir(root);
			await mkdir(imgs, { recursive: true });
			const file = join(imgs, `${name}.svg`);
			await writeFile(file, text, "utf8");
			const resourceUri = `%PROJECTDIR%/imgs/${name}.svg`;
			const width = args.box?.width ?? svgLength(analysis, "width") ?? 200;
			const height = args.box?.height ?? svgLength(analysis, "height") ?? 200;
			const path = `${screen}/${name}`;
			const ops = [{
				op: "create_widget",
				screen,
				name,
				widget_type: "AdvancedSVGImage"
			}, {
				op: "set_property",
				path,
				name: "Path",
				value: resourceUri
			}, {
				op: "set_property",
				path,
				name: "LeftMargin",
				value: String(args.box?.left ?? 0)
			}, {
				op: "set_property",
				path,
				name: "TopMargin",
				value: String(args.box?.top ?? 0)
			}, {
				op: "set_property",
				path,
				name: "Width",
				value: String(width)
			}, {
				op: "set_property",
				path,
				name: "Height",
				value: String(height)
			}];
			const result = await runValidatedBatch({
				origin,
				project: args.project,
				ops,
				health,
				signal: exec.signal,
				apply: true
			});
			const detail = await bridge.request(origin, "nodes", exec.signal, { path }).catch(() => void 0);
			return {
				...result,
				file,
				resource_uri: resourceUri,
				node: path,
				controlable: analysis.controlable,
				...(result.status === "completed" ? { read_back: nodeValue(detail, "Path") } : {}),
				next: result.status === "completed"
					? `Drive a part with action bind: node "${path}", id one of ${analysis.controlable.map((row) => row.id).join(", ") || "(none)"}. Then the engineer saves and builds, and optix_emulator start plus optix_screenshot shows it.`
					: "Read the refusal and fix it before retrying."
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_validate_expression",
		description: "Validate an Optix ExpressionEvaluator formula without attaching it or changing the model. Sources are comma-separated node paths in placeholder order.",
		parameters: {
			project: projectParameter,
			expression: text,
			sources: { type: "string" }
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Validate Optix expression",
			kind: "read"
		}),
		async execute(args, exec) {
			const { origin } = await bridge.select(args.project, exec.signal);
			return bridge.request(origin, "expr/validate", exec.signal, {
				expression: args.expression,
				...args.sources === void 0 ? {} : { sources: args.sources }
			}, "POST");
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_action",
		description: "Apply one bridge-validated Optix action outside the batch validator: create NetLogic, ensure a web engine, add a translation, convert an instance to a type, or invoke an exported method. Invocation requires allowInvoke and a session-safe bridge; conversion requires allowDestructive. No retries. A successful model change does not save Studio or prove runtime rendering.",
		parameters: {
			project: projectParameter,
			request: {
				required: true,
				oneOf: [
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "create_netlogic",
								required: true
							},
							parent: text,
							name: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "ensure_web_engine",
								required: true
							},
							port: {
								type: "integer",
								required: true
							},
							ip: {
								type: "string",
								const: "127.0.0.1",
								required: true
							}
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "add_translation",
								required: true
							},
							key: text,
							value: text,
							locale: text
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "convert_to_type",
								required: true
							},
							path: text,
							type_name: text,
							types_folder: text,
							replace: {
								type: "boolean",
								required: true
							}
						}
					},
					{
						type: "object",
						additionalProperties: false,
						properties: {
							action: {
								type: "string",
								const: "invoke",
								required: true
							},
							path: text,
							method: text,
							args: { type: "string" }
						}
					}
				]
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Optix ${args.request.action.replaceAll("_", " ")}`,
			kind: "edit"
		}),
		async execute(args, exec) {
			const request = args.request;
			allowWrite(request.action === "convert_to_type");
			if (request.action === "invoke" && !settings.allowInvoke) throw new Error("Method invocation requires allowInvoke in plugin configuration");
			if (request.action === "ensure_web_engine" && (request.port < 1 || request.port > 65535)) throw new Error("Web engine port must be 1..65535");
			return exclusive(async () => {
				const { origin, health } = await bridge.select(args.project, exec.signal);
				if (request.action === "invoke" && health.invoke_session !== "root") throw new Error("invoke_unsupported_bridge: install the session-safe bridge before invoking methods");
				const routes = {
					create_netlogic: "model/netlogic",
					ensure_web_engine: "setup/web-engine",
					add_translation: "i18n/translation",
					convert_to_type: "node/convert-to-type",
					invoke: "node/invoke"
				};
				const query = {};
				for (const [key, value] of Object.entries(request)) if (key !== "action") query[key] = String(value);
				try {
					const result = await bridge.request(origin, routes[request.action], exec.signal, query, "POST");
					if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the authoring action", true);
					return {
						status: "completed",
						response: result
					};
				} catch (error) {
					return {
						status: error instanceof BridgeError && error.mayHaveApplied ? "indeterminate" : "failed",
						error: String(error),
						retry: "Inspect the live model before retrying"
					};
				}
			});
		}
	})));
	/**
	 * The shipped catalog is disk state, so it is read again per call rather than cached: a Studio
	 * install updated between calls must not answer from the older catalog.
	 */
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_library",
		description: "Reach the template library FactoryTalk Optix ships instead of building only from builtin widget types. action list reads the installed Studio catalog from disk (Widgets, GraphicElements, StyleSheets, Keyboards, Misc, Scripts) with no bridge and no Studio session, naming each item with the display name and usage text the library ships. action import pulls one item and the types it depends on into the loaded project through the bridge: it needs allowWrites, the project open in Studio with the bridge started, and a 1.0.9 bridge that advertises template_library in optix_status. An imported component belongs at the root of UI in a structural folder named for its library - UI/Components/Widgets/AlarmBanner, UI/Components/StyleSheets/FriendlyDark - so it never lands loose beside the project's screens; dest defaults to that folder and the folders are created when missing. An import is not batch-reversible, so read the model back with optix_read before any retry. Use it to pick a named component for a design already decided, not to survey what the machine happens to ship: a new build starts from the brief and the published standards (CRAFT-ORD-01).",
		parameters: {
			action: {
				type: "string",
				enum: ["list", "import"],
				required: true
			},
			library: {
				type: "string",
				description: "Library folder name from action list, for example Widgets or GraphicElements."
			},
			item: {
				type: "string",
				description: "Item browse name or display name; the bridge accepts either."
			},
			dest: {
				type: "string",
				description: "Project folder to import under. Defaults to UI/Components/<library>, the structural home for template-library components at the root of UI; the folder chain is created when missing. Name a different folder only to follow a project that already organizes its components elsewhere."
			},
			class: {
				type: "string",
				description: "NodeClass of the imported item (default ObjectType)."
			},
			replace: {
				type: "string",
				description: "Comma-separated type browse names whose conflict is resolved by replacing, for example LoginForm,Login."
			},
			preserve: {
				type: "boolean",
				description: "Keep dependency objects in their original library folders instead of beside the import (default false)."
			},
			query: {
				type: "string",
				description: "For action list: only items whose name or shipped description contains this text."
			},
			detail: {
				type: "boolean",
				description: "For action list: include the usage text each item ships with. Off by default because it is long; a query always includes it."
			},
			project: {
				type: "string",
				description: "Exact loaded project BrowseName from optix_status. Required for action import."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Optix library ${args.action}`,
			kind: args.action === "list" ? "read" : "edit"
		}),
		async execute(args, exec) {
			const roots = await libraryRoots();
			if (roots.length === 0) return noStudioInstall();
			const root = roots.at(-1);
			const catalog = await readCatalog(root.libraries, exec.signal);
			if (args.action === "list") {
				const wanted = args.library?.trim() ?? "";
				if (wanted !== "" && !libraryNames(catalog).some((entry) => entry.toLowerCase() === wanted.toLowerCase())) return {
					status: "refused",
					error: "library_not_found",
					library: wanted,
					did_you_mean: suggestNames(wanted, libraryNames(catalog)),
					next: `This Studio ships ${libraryNames(catalog).join(", ")}.`
				};
				const needle = args.query?.trim().toLowerCase() ?? "";
				const verbose = args.detail === true || needle !== "";
				const libraries = catalog.filter((entry) => wanted === "" || entry.library.toLowerCase() === wanted.toLowerCase()).map((entry) => {
					const items = entry.items
						.filter((item) => needle === "" || item.name.toLowerCase().includes(needle) || (item.display ?? "").toLowerCase().includes(needle) || (item.description ?? "").toLowerCase().includes(needle))
						.map((item) => ({
							name: item.name,
							display: item.display ?? item.name,
							...item.display_zh === void 0 ? {} : { display_zh: item.display_zh },
							owned_types: item.owned_types,
							components: item.components,
							...verbose ? { description: item.description ?? "" } : {}
						}));
					return {
						library: entry.library,
						item_count: entry.item_count,
						matched: items.length,
						groups: entry.groups,
						items
					};
				});
				const matched = libraries.reduce((sum, entry) => sum + entry.matched, 0);
				return {
					status: "completed",
					studio: root.version,
					libraries,
					matched,
					coverage: "Catalog text is the shipped library's own: it proves what can be imported, not how an imported item renders or behaves at runtime. Items held inside a group folder are reported as groups, not as importable names, because only the top-level form is documented.",
					next: matched === 0 ? "Name a library or a different query; the counts above are what this Studio ships." : "Import one with action import (dest defaults to UI, class defaults to ObjectType), then read it back with optix_read."
				};
			}
			if (args.library === void 0 || args.item === void 0) return {
				status: "failed",
				error: "import needs library and item",
				next: "Run action list first: it names the libraries and items this Studio ships."
			};
			if (args.project?.trim() === void 0 || args.project?.trim() === "") return {
				status: "failed",
				error: "import needs project: the loaded project BrowseName from optix_status",
				next: "Open the project in Studio, run StartBridge, then call optix_status."
			};
			const found = findEntry(catalog, args.library, args.item);
			if (found === null) {
				const entry = catalog.find((candidate) => candidate.library.toLowerCase() === args.library.trim().toLowerCase());
				if (entry === void 0) return {
					status: "refused",
					error: "library_not_found",
					library: args.library,
					did_you_mean: suggestNames(args.library, libraryNames(catalog)),
					next: `This Studio ships ${libraryNames(catalog).join(", ")}.`
				};
				return {
					status: "refused",
					error: "item_not_found",
					library: entry.library,
					item: args.item,
					groups: entry.groups,
					did_you_mean: suggestNames(args.item, itemNames(entry)),
					next: "The name may live inside a group folder listed above; nested item paths are unverified, so prefer a top-level name."
				};
			}
			allowWrite(args.replace !== void 0 && args.replace.trim() !== "");
			return exclusive(async () => {
				const { origin, health } = await bridge.select(args.project, exec.signal);
				if (health.template_library !== true) throw new Error("library_import_unsupported_bridge: this Studio bridge does not serve the template-library import; run optix_bridge_arm on the project, compile NetSolution in Studio, start the bridge, then call optix_status again");
				const folder = args.dest?.trim() === "" || args.dest === void 0 ? libraryComponentFolder(found.library.library) : args.dest.trim();
				const folders = await ensureFolders(origin, folder, exec.signal);
				const query = {
					dest: folder,
					class: args.class?.trim() === "" || args.class === void 0 ? "ObjectType" : args.class,
					library: args.library,
					item: args.item
				};
				if (args.replace !== void 0 && args.replace.trim() !== "") query.replace = args.replace;
				if (args.preserve === true) query.preserve = "1";
				try {
					const result = await bridge.request(origin, "library/import", exec.signal, query, "POST");
					if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the library import", true);
					return {
						status: "completed",
						imported: {
							library: found.library.library,
							name: found.item.name,
							display: found.item.display ?? found.item.name,
							guid: found.item.guid,
							dest: folder
						},
						folders_created: folders,
						response: result,
						coverage: "The bridge reports the node it created; rendering, runtime behaviour and the installed Optix version are not established by this call.",
						next: `Read ${result.created_path ?? "the imported node"} back with optix_read, then run optix_design_check on the screen that hosts it.`
					};
				} catch (error) {
					return {
						status: error instanceof BridgeError && error.mayHaveApplied ? "indeterminate" : "failed",
						error: String(error),
						retry: "Inspect the live model before retrying"
					};
				}
			});
		}
	})));
	/**
	 * Where a template-library component lives: at the root of UI, under a structural folder named for
	 * the library it came from (`UI/Components/Widgets/AlarmBanner`), so imported types never pile up
	 * loose beside the screens and style sheets an operator reads the project through.
	 */
	const LIBRARY_COMPONENT_ROOT = "UI/Components";
	/** Project folder that holds one library's imported components. */
	function libraryComponentFolder(library) {
		return `${LIBRARY_COMPONENT_ROOT}/${library}`;
	}
	/**
	 * Make a structural folder chain exist, one FolderType at a time. Measured against Studio 1.8.1
	 * (2026-11-14): `/bridge/model/folder` takes parent and name, refuses a duplicate name, and a folder
	 * is an organizational node, not a UI control, so it never shows up in a screen.
	 * @param origin - Bridge origin.
	 * @param path - Folder path to guarantee, for example UI/Components/Widgets.
	 * @param signal - Abort signal.
	 * @returns The folders this call created, oldest first.
	 */
	async function ensureFolders(origin, path, signal) {
		const created = [];
		let current = "";
		for (const segment of path.split("/")) {
			current = current === "" ? segment : `${current}/${segment}`;
			const probe = await bridge.request(origin, "nodes", signal, { path: current }).catch(() => void 0);
			if (probe?.path !== void 0) continue;
			const parent = current.includes("/") ? current.slice(0, current.lastIndexOf("/")) : "";
			const response = await bridge.request(origin, "model/folder", signal, {
				parent,
				name: segment
			}, "POST");
			if (response.ok !== true) throw new BridgeError(`Bridge did not create the folder ${current}`, true);
			created.push(current);
		}
		return created;
	}
	/**
	 * Read the window a screen has to live inside: its canvas size and any PanelLoader already mounted
	 * in it. Measured against Studio 1.8.1 (2026-11-14): the window declares Width and Height as Size
	 * properties spelled "1920 (Float)", and the presentation engine names the start window through a
	 * NodePointer, which is the window the operator actually lands on.
	 */
	async function liveScreenHost(origin, signal) {
		const directory = await bridge.request(origin, "map", signal, { path: "UI", depth: 2, max: 200 });
		const children = directory?.map?.children ?? [];
		const engine = children.find((entry) => entry.type === "NativeUIPresentationEngine") ?? children.find((entry) => entry.type === "WebUIPresentationEngine");
		const pointer = (engine?.children ?? []).find((entry) => entry.name === "StartWindow");
		const referenced = pointer === void 0 || pointer.ref === void 0 ? void 0 : String(pointer.ref).split("/").pop();
		const windowEntry = referenced === void 0 ? children.find((entry) => entry.type === "WindowType") : children.find((entry) => entry.name === referenced) ?? children.find((entry) => entry.type === "WindowType");
		if (windowEntry === void 0) return { window: void 0, width: void 0, height: void 0, panel_loader: void 0, panel_loaders: [] };
		const windowPath = `UI/${windowEntry.name}`;
		const nodes = await bridge.request(origin, "nodes", signal, { path: windowPath });
		const size = (name) => {
			const property = (nodes?.properties ?? []).find((entry) => entry.name === name);
			const measured = /^(\d+(?:\.\d+)?)/u.exec(String(property?.value ?? ""));
			return measured === null ? void 0 : Math.round(Number(measured[1]));
		};
		const panelLoaders = (nodes?.children ?? []).filter((entry) => entry.dotnet_type === "PanelLoader").map((entry) => `${windowPath}/${entry.browse_name}`);
		// The window's own children are what a second screen's draft must not replace: the shell bar is
		// shared, so a button already drawn by an earlier draft is only re-wired, never created again.
		const windowChildren = (nodes?.children ?? []).map((entry) => String(entry.browse_name ?? ""));
		return {
			window: windowPath,
			width: size("Width"),
			height: size("Height"),
			panel_loader: panelLoaders.length === 1 ? panelLoaders[0] : void 0,
			panel_loaders: panelLoaders,
			window_children: windowChildren
		};
	}
	/**
	 * Plan one template-library composite for a screen. The bridge imports a library item as an
	 * ObjectType (a library of types, not of instances), so a composite reaches a screen in three
	 * steps the bridge already serves: import the type once under UI, instantiate it under the screen,
	 * then place it. Measured live against Studio 1.8.1 (2026-11-14): Widgets/AlarmBanner imported to
	 * UI/AlarmBanner (clr RowLayoutType), instantiated as UI/Screens/LibraryProof/Banner1, and its own
	 * children (a Label, two Buttons, a NetLogic object) came with it - which is the difference between
	 * a hand-drawn rectangle and the composite Rockwell ships.
	 * @param origin - Bridge origin.
	 * @param screenPath - Screen the instances are created under.
	 * @param items - Requested composites: library, item, optional name and rect.
	 * @param catalog - Shipped catalog from readCatalog.
	 * @param slots - Scaffold slots, for the default card-sized rect.
	 * @param signal - Abort signal.
	 * @returns The plan, per-item, with what already exists and what has to be written.
	 */
	async function planLibraryItems(origin, screenPath, items, catalog, slots, signal) {
		const plan = [];
		for (const [index, item] of items.entries()) {
			const found = findEntry(catalog, item.library, item.item);
			if (found === null) {
				const library = catalog.find((candidate) => candidate.library.toLowerCase() === String(item.library).trim().toLowerCase());
				return {
					error: library === void 0 ? {
						code: "library_not_found",
						library: item.library,
						did_you_mean: suggestNames(item.library, libraryNames(catalog)),
						next: `This Studio ships ${libraryNames(catalog).join(", ")}.`
					} : {
						code: "item_not_found",
						library: library.library,
						item: item.item,
						groups: library.groups,
						did_you_mean: suggestNames(item.item, itemNames(library)),
						next: "The name may live inside a group folder listed above; nested item paths are unverified, so prefer a top-level name."
					}
				};
			}
			const name = item.name ?? found.item.name;
			const rect = item.left !== void 0 && item.top !== void 0 && item.width !== void 0 && item.height !== void 0
				? { left: item.left, top: item.top, width: item.width, height: item.height }
				: slots.cards?.[index] ?? slots.body;
			const typePath = `${libraryComponentFolder(found.library.library)}/${found.item.name}`;
			const instancePath = `${screenPath}/${name}`;
			const typeProbe = await bridge.request(origin, "nodes", signal, { path: typePath }).catch(() => void 0);
			const instanceProbe = await bridge.request(origin, "nodes", signal, { path: instancePath }).catch(() => void 0);
			plan.push({
				library: found.library.library,
				item: found.item.name,
				display: found.item.display ?? found.item.name,
				name,
				type_path: typePath,
				instance_path: instancePath,
				rect,
				type_present: typeProbe?.path !== void 0,
				instance_present: instanceProbe?.path !== void 0
			});
		}
		return { plan };
	}
	/**
	 * Apply a library plan: import each absent type, instantiate it under the screen, then place it.
	 * Imports are not reversible, so a failure reports the step it stopped at and never replays the
	 * ones already acknowledged.
	 * @param origin - Bridge origin.
	 * @param screenPath - Screen the instances are created under.
	 * @param plan - Output of planLibraryItems.
	 * @param signal - Abort signal.
	 * @returns { ok, steps, placed } or { ok: false, steps, placed, failed, error }.
	 */
	async function applyLibraryPlan(origin, screenPath, plan, signal) {
		const steps = [];
		const placed = [];
		for (const entry of plan) {
			const step = { item: entry.item, library: entry.library, instance_path: entry.instance_path };
			try {
				const folder = libraryComponentFolder(entry.library);
				if (entry.type_present !== true) {
					step.folders = await ensureFolders(origin, folder, signal);
					const imported = await bridge.request(origin, "library/import", signal, {
						dest: folder,
						class: "ObjectType",
						library: entry.library,
						item: entry.item
					}, "POST");
					if (imported.ok !== true) throw new BridgeError(`Bridge did not import ${entry.library}/${entry.item}`, true);
					step.imported = imported.created_path ?? entry.type_path;
				}
				if (entry.instance_present !== true) {
					const created = await bridge.request(origin, "model/object", signal, {
						parent: screenPath,
						name: entry.name,
						type: entry.type_path
					}, "POST");
					if (created.ok !== true) throw new BridgeError(`Bridge did not instantiate ${entry.type_path} under ${screenPath}`, true);
					step.instantiated = created.created_path ?? entry.instance_path;
				}
				const properties = {
					LeftMargin: entry.rect.left,
					TopMargin: entry.rect.top,
					Width: entry.rect.width,
					Height: entry.rect.height
				};
				step.properties = {};
				for (const [prop_name, value] of Object.entries(properties)) {
					const written = await bridge.request(origin, "node/property", signal, {
						path: entry.instance_path,
						name: prop_name,
						value: String(value)
					}, "POST");
					if (written.ok !== true) throw new BridgeError(`Bridge did not place ${entry.instance_path} (${prop_name})`, true);
					step.properties[prop_name] = written.value ?? String(value);
				}
				placed.push(entry.instance_path);
				steps.push(step);
			} catch (error) {
				return { ok: false, steps, placed, failed: entry, error: String(error) };
			}
		}
		return { ok: true, steps, placed };
	}
	/**
	 * Clear the absolute NodeId a freshly wired ObjectPointer carries, so its relative link is what the
	 * runtime resolves.
	 *
	 * Measured live on Studio 1.8.1.27 (2026-11-14): `node/event` writes the design-time NodeId into
	 * `ObjectPointer.Value` and the relative target into `DynamicLink`; at run time the session instance
	 * does not live at that NodeId, so the dispatcher answers "No behaviour or observer found that
	 * handles the method ...". Setting the value to an empty string writes a Null NodeId (`"via": "self"`)
	 * and the click then switches the panel. The pointer is cleared in a second, applied-only batch
	 * because the event handler is created by the wiring call and a hypothetical validation cannot see
	 * it yet.
	 */
	async function clearPointerValues(origin, ops, signal) {
		let cleared = 0;
		const failed = [];
		for (const op of ops) {
			if (op.op !== "wire_event" || op.object_raw === void 0) continue;
			const name = op.path.split("/").filter((segment) => segment !== "").at(-1);
			const pointerPath = `${op.path}/EH_${op.event_type}_${name}/MethodsToCall/MethodContainer1/ObjectPointer`;
			try {
				const written = await bridge.request(origin, "node/property", signal, {
					path: pointerPath,
					name: "Value",
					value: ""
				}, "POST");
				if (written.ok === true) cleared += 1;
				else failed.push(pointerPath);
			} catch (error) {
				failed.push(`${pointerPath}: ${String(error)}`);
			}
		}
		return { cleared, failed };
	}
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_screen",
		description: `Draft or apply a whole Optix screen as one ordered operation batch: backdrop, header band, title, content surface, up to ${MAX_CARDS} data cards with value and lamp rows, and a row of up to ${MAX_NAV} navigation buttons. The slot math, the refusals and the palette are the ones the FactoryTalk View scaffold uses, so one design brief lays out both products. dry_run defaults to true: the batch is validated against the live model and nothing is written. Applying requires allowWrites. The screen is created as a ScreenType because a bare Screen instance does not load at runtime. Navigation is wired only when a PanelLoader is available, because a UI object is instantiated per session and an absolute design-time path does not resolve at runtime: the tool reads the start window and uses its single mounted PanelLoader unless panel_loader names one; without a loader the buttons are created and the wiring each one needs is reported instead. The canvas defaults to the start window's own size. The batch is validated in one call and applied operation by operation, so a failure names the operation that stopped and the batch is never replayed automatically. Composites named in library_items are stamped in as the shipped library's own types - imported once at the root of UI under a structural folder per library (UI/Components/Widgets, UI/Components/StyleSheets), instantiated under this screen, then placed - so a screen can be built from the components Rockwell ships instead of from hand-drawn panels.`,
		parameters: {
			project: projectParameter,
			name: text,
			width: {
				type: "integer",
				description: "Design width. Omitted: the start window's own Width read from the live model, so a drafted screen matches its canvas; 1280 only when the window cannot be read."
			},
			height: {
				type: "integer",
				description: "Design height. Omitted: the start window's own Height read from the live model; 800 only when the window cannot be read."
			},
			title: { type: "string" },
			subtitle: { type: "string" },
			footer: { type: "string" },
			cards: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						title: {
							type: "string",
							required: true
						},
						rows: {
							type: "array",
							items: {
								type: "object",
								additionalProperties: false,
								properties: {
									label: {
										type: "string",
										required: true
									},
									kind: {
										type: "string",
										enum: ["value", "lamp"],
										required: true,
										description: "value is a label whose text is a dynamic link to tag; lamp is a square whose fill colour is driven by an expression over tag."
									},
									tag: {
										type: "string",
										description: "Model variable path the row follows."
									}
								}
							}
						}
					}
				},
				description: `Up to ${MAX_CARDS} cards. Each row needs a label, a kind, and the Model path it reads.`
			},
			nav: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						label: {
							type: "string",
							required: true
						},
						target: {
							type: "string",
							required: true,
							description: "Screen or panel path the button opens."
						}
					}
				},
				description: `Up to ${MAX_NAV} buttons.`
			},
			screens_folder: {
				type: "string",
				description: "Where the ScreenType is created. Default UI/Screens."
			},
			library_items: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						library: {
							type: "string",
							required: true,
							description: "Shipped library, for example Widgets."
						},
						item: {
							type: "string",
							required: true,
							description: "Top-level item name, for example AlarmBanner. Run optix_library action list for this machine's names."
						},
						name: {
							type: "string",
							description: "Instance name under the screen. Default: the item name."
						},
						left: { type: "integer" },
						top: { type: "integer" },
						width: { type: "integer" },
						height: { type: "integer" }
					}
				},
				description: "Template-library composites stamped onto the screen after the scaffold, in the shipped library's own types rather than hand-drawn panels. Each one is imported once as an ObjectType under UI (the bridge imports types, not instances), instantiated under this screen, and placed. Geometry defaults to the matching card slot, then the content surface. The plan is reported, and applying is not reversible: a failure names the composite it stopped at."
			},
			panel_loader: {
				type: "string",
				description: "Live PanelLoader path. Omitted: the single PanelLoader mounted in the start window, when there is exactly one. Without a loader navigation is reported rather than wired."
			},
			mount: {
				type: "boolean",
				description: "Mount the finished screen in the start window. A window shows only its own children, and a freshly scaffolded starter ships a window with none, so a screen nothing loads is a screen no render ever shows. On by default: when the window holds no PanelLoader the batch creates one at the canvas origin, sizes it to the screen and points its Panel at it. Pass false to author the screen alone."
			},
			mount_name: {
				type: "string",
				description: "Name for the PanelLoader this batch creates. Default MainLoader."
			},
			theme: {
				type: "object",
				additionalProperties: false,
				properties: Object.fromEntries(Object.entries(SCREEN_THEME).map(([key, value]) => [key, {
					type: "string",
					description: `Default ${value}.`
				}])),
				description: "Override one or more scaffold colours. Prefer importing a StyleSheet Studio ships over re-picking a palette."
			},
			include_ops: {
				type: "boolean",
				description: "Return the full operation batch. Off by default because a screen is a long batch; the tool applies it itself."
			},
			dry_run: { type: "boolean" }
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: args.dry_run === false ? `Build Optix screen ${args.name}` : `Draft Optix screen ${args.name}`,
			kind: args.dry_run === false ? "edit" : "read"
		}),
		async execute(args, exec) {
			return exclusive(async () => {
				const { origin, health: selectedHealth } = await bridge.select(args.project, exec.signal);
				// The canvas and the loader come from the live window rather than from a starter default: a
				// 1280x800 screen inside a 1920x1080 window is the layout defect the design check reports, and
				// the only PanelLoader that can change a panel is the one mounted in the window the operator
				// lands on. Measured against Studio 1.8.1 (2026-11-14).
				const host = await liveScreenHost(origin, exec.signal);
				// A navigation button is wired to a node path, so a target that does not exist yet cannot be
				// wired in the same batch that creates the screen - and a batch whose wiring is refused would
				// throw away the whole layout. Instead the target is probed first: with a missing target the
				// buttons are still built and their wiring is reported, so screens can be created in either
				// order and one follow-up optix_edit batch (wire_event, shape reported here) completes them.
				const requestedTargets = [...new Set((args.nav ?? []).map((entry) => entry.target))];
				// The screen this batch creates is not a missing target. Probing it before it exists
				// reported every self-navigating draft as unwireable, and one entry in `missingTargets`
				// also drops the loader from the batch, so a second screen's own button was drawn and
				// never wired (measured live 2026-11-14: Nav_LineDetail had no event until it was
				// wired by hand, while Nav_LineOverview - created by the earlier draft - did).
				const createdFolder = args.screens_folder === void 0 || args.screens_folder === "" ? "UI/Screens" : args.screens_folder;
				const createdPath = `${createdFolder}/${args.name}`;
				const missingTargets = [];
				for (const target of requestedTargets) {
					if (target === createdPath || target.endsWith(`/${createdPath}`)) continue;
					const probe = await bridge.request(origin, "nodes", exec.signal, { path: target }).catch(() => void 0);
					if (probe === void 0 || probe.path === void 0) missingTargets.push(target);
				}
				const namedLoader = args.panel_loader === void 0 || args.panel_loader === "" ? host.panel_loader : args.panel_loader;
				const usableLoader = missingTargets.length === 0 ? namedLoader : void 0;
				const spec = {
					name: args.name,
					width: args.width ?? host.width ?? 1280,
					height: args.height ?? host.height ?? 800,
					...(args.title === void 0 ? {} : { title: args.title }),
					...(args.subtitle === void 0 ? {} : { subtitle: args.subtitle }),
					...(args.footer === void 0 ? {} : { footer: args.footer }),
					...(args.cards === void 0 ? {} : { cards: args.cards }),
					...(args.nav === void 0 ? {} : { nav: args.nav }),
					...(args.screens_folder === void 0 || args.screens_folder === "" ? {} : { screens_folder: args.screens_folder }),
					...(usableLoader === void 0 ? {} : { panel_loader: usableLoader }),
					// The navigation bar is drawn into the start window, beside the loader, because a button
					// created inside a panel resolves its loader path against the design tree at run time and
					// the runtime then points at the design-time loader. Measured live 2026-11-14; the shipped
					// PanelLoader sample wires its window-level button the same way. A button whose target
					// screen does not exist yet is still drawn, but its wiring waits (missing_targets), because
					// a wiring call the bridge refuses would discard the whole batch.
					...(namedLoader === void 0 || host.window === void 0 ? {} : { shell: { window: host.window, loader: namedLoader, width: host.width, height: host.height, children: host.window_children, missing_targets: missingTargets } }),
					...(args.theme === void 0 ? {} : { theme: args.theme })
				};
				let layout;
				try {
					layout = screenOps(spec);
				} catch (error) {
					return {
						status: "refused",
						error: String(error),
						next: "Shrink the card count, drop a row, or name a larger display."
					};
				}
				if (layout.op_count > settings.maxScreenOps) return {
					status: "refused",
					error: `${layout.op_count} operations exceed maxScreenOps ${settings.maxScreenOps}`,
					op_count: layout.op_count,
					next: "Drop a card, drop a row, or raise maxScreenOps. The whole batch must be validated in one call because the bridge only resolves a parent it created in the same batch, so the screen cannot be split."
				};
				const dryRun = args.dry_run !== false;
				// Template-library composites are planned before anything is written: the catalog is read to
				// refuse a name this machine does not ship, and the live model is probed for the type and the
				// instance so applying reports what it actually had to create.
				const requestedLibrary = args.library_items ?? [];
				let libraryPlan = [];
				if (requestedLibrary.length > 0) {
					const roots = await libraryRoots();
					if (roots.length === 0) return noStudioInstall();
					const catalog = await readCatalog(roots.at(-1).libraries, exec.signal);
					const planned = await planLibraryItems(origin, layout.path, requestedLibrary, catalog, layout.slots, exec.signal);
					if (planned.error !== void 0) return {
						status: "refused",
						...planned.error
					};
					libraryPlan = planned.plan;
				}
				allowWrite(libraryPlan.length > 0 || isDestructive(layout.ops));
				// A screen is not visible until something loads it: the start window renders only its own
				// children, and a freshly scaffolded starter ships a window with none. Measured live: a screen
				// with 18 objects was authored into a starter and the preview stayed a flat white 1920x1080
				// frame, because nothing pointed at it. One loader, one pointer, appended to the same batch so
				// the screen exists by the time the pointer is written.
				const mountName = args.mount_name === void 0 || args.mount_name === "" ? "MainLoader" : args.mount_name;
				const mountPlan = args.mount === false || host.window === void 0 || (host.panel_loaders ?? []).length > 0 ? void 0 : planMount({
					window: host.window,
					loader: mountName,
					screen: layout.path,
					project: selectedHealth.project,
					width: spec.width,
					height: spec.height,
					children: host.window_children ?? []
				});
				const mounted = mountPlan?.mounted;
				const batchOps = [...layout.ops, ...(mountPlan?.ops ?? [])];
				const brief = {
					screen: layout.path,
					width: layout.width,
					height: layout.height,
					op_count: layout.op_count,
					objects: layout.objects,
					slots: layout.slots,
					theme: layout.theme,
					...(libraryPlan.length === 0 ? {} : { library: libraryPlan }),
					// Every key here has to hold a real JSON value: an explicit undefined makes the whole result
				// unrepresentable ("value is not lossless JSON"), and the host harness refuses the call even
				// though the batch already ran. Omit the keys that have nothing to say instead.
				host: {
						...(host.window === void 0 ? {} : { window: host.window }),
						...(host.width === void 0 || host.height === void 0 ? {} : { canvas: { width: host.width, height: host.height } }),
						...(spec.panel_loader === void 0 ? {} : { panel_loader: spec.panel_loader }),
						panel_loaders: host.panel_loaders ?? [],
						nav_targets_missing: missingTargets,
						...(mounted === void 0 ? {} : { mounted })
					}
				};
				const normalized = batchOps.map((op) => op.prop_name === void 0 ? op : {
					...op,
					name: op.prop_name
				});
				const validation = await bridge.request(origin, "validate_ops", exec.signal, {}, "POST", {
					ops: normalized,
					strict: true
				});
				const expressions = [];
				for (const item of layout.expressions) {
					const checked = await bridge.request(origin, "expr/validate", exec.signal, {
						expression: item.expression,
						sources: item.sources ?? ""
					}, "POST");
					expressions.push({
						path: item.path,
						prop_name: item.prop_name,
						expression: item.expression,
						sources: item.sources,
						result: checked
					});
				}
				const rejected = expressions.filter((item) => item.result?.ok !== true);
				const pendingWiring = layout.pendingWiring.map((entry) => ({
					...entry,
					// The scaffold cannot know the loader when it is withheld for a missing target, so its
					// reported shape carries a placeholder. The live loader is known here, and a shape that
					// names it is the one that can be applied later without editing. `object_raw` and
					// `method_path` have to agree: the pointer resolves the loader relative to the button, and
					// the absolute alternative is what the runtime rejects at run time.
					...(usableLoader === void 0 && namedLoader !== void 0 && entry.shape !== void 0 ? { shape: { ...entry.shape, method_path: `${namedLoader}/ChangePanel`, object_raw: `../${namedLoader.split("/").filter((segment) => segment !== "").at(-1)}` } } : {}),
					...(missingTargets.includes(entry.target) ? { reason: `${entry.target} does not exist yet, so wiring it in this batch would be refused; apply this op once that screen exists.` } : {})
				}));
				const report = {
					...brief,
					...(args.include_ops === true ? { ops: batchOps } : {}),
					validation,
					expressions,
					pending_wiring: pendingWiring
				};
				if (!acceptedValidation(validation, batchOps.length) || rejected.length > 0) return {
					status: "refused",
					applied: 0,
					...report,
					...(rejected.length > 0 ? {
						rejected_expressions: rejected,
						next: "The lamp colours are the only invented part of this layout: replace the expression or drop the lamp rows, then draft again."
					} : { next: "Read the reported errors; the layout itself is sound." })
				};
				if (dryRun) return {
					status: "validated",
					applied: 0,
					...report,
					coverage: "Validation is the bridge's own hypothetical check: it proves the operations resolve against the live model, not that the screen renders. Navigation is unverified until a click is observed in the runtime.",
					next: pendingWiring.length === 0 ? `Apply with dry_run:false${libraryPlan.length === 0 ? "" : ` (it also imports and places ${libraryPlan.map((entry) => `${entry.library}/${entry.item}`).join(", ")})`}, then read the screen back with optix_read and run optix_design_check on it.` : missingTargets.length > 0 ? `Navigation stays pending: ${missingTargets.join(", ")} ${missingTargets.length === 1 ? "does" : "do"} not exist yet, and a button cannot be wired to a node that is not there. Create the missing screen(s), then apply the reported wire_event ops as one optix_edit batch - or draft this screen last.` : host.window === void 0 ? `No start window was read from the live model, so navigation is unverified: read UI, find the window, and name its PanelLoader.` : `${host.window} hosts ${host.panel_loaders.length === 0 ? "no PanelLoader" : `${host.panel_loaders.length} PanelLoaders`}, so navigation cannot be wired: create or name the loader (optix_edit create_widget widget_type PanelLoader under the window), then draft again.`
				};
				const results = [];
				for (const [index, op] of batchOps.entries()) {
					let dispatched = false;
					try {
						const health = await bridge.request(origin, "health", exec.signal);
						if (health.project !== args.project || health.model_loaded !== true || health.pid !== selectedHealth.pid || health.project_path !== selectedHealth.project_path) throw new Error("Serving Studio project changed during the batch");
						const request = operationRequest(op);
						dispatched = true;
						const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
						if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the authoring operation", true);
						results.push(result);
					} catch (error) {
						return {
							status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
							applied: results.length,
							failed_index: index,
							...report,
							results,
							error: String(error),
							retry: "Inspect the live model; do not replay the entire batch automatically"
						};
					}
				}
				// The composites go in after the scaffold, because an instance can only be created under a
				// screen that already exists. Imports are not reversible, so a failure stops there and
				// reports the step; the scaffold is already in place and is not replayed.
				let pointerClearing = { cleared: 0, failed: [] };
				if (batchOps.some((op) => op.op === "wire_event" && op.object_raw !== void 0)) pointerClearing = await clearPointerValues(origin, batchOps, exec.signal);
				let libraryApplied;
				if (libraryPlan.length > 0) {
					libraryApplied = await applyLibraryPlan(origin, layout.path, libraryPlan, exec.signal);
					if (libraryApplied.ok !== true) return {
						status: "partial",
						applied: results.length,
						...report,
						library_applied: { steps: libraryApplied.steps, placed: libraryApplied.placed },
						failed_library: libraryApplied.failed.instance_path,
						error: libraryApplied.error,
						retry: "The scaffold is in place. Inspect the live model, then stamp the remaining composites with optix_library import + optix_edit create_widget, or re-draft the screen once the failure is cleared."
					};
				}
				return {
					status: "completed",
					applied: results.length,
					...report,
					...(pointerClearing.cleared === 0 ? {} : { pointer_values_cleared: pointerClearing.cleared }),
					...(pointerClearing.failed.length === 0 ? {} : { pointer_values_uncleared: pointerClearing.failed }),
					...(libraryApplied === void 0 ? {} : { library_applied: { steps: libraryApplied.steps, placed: libraryApplied.placed } }),
					results,
					coverage: "Every operation the bridge acknowledged, and the absolute NodeId behind each wired pointer cleared so its relative link is what the runtime resolves. Rendering and whether a navigation button actually changes the panel are not established by this call.",
					next: "Read the screen back with optix_read, run optix_design_check on it, then look at it with optix_preview and optix_screenshot."
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_design_check",
		description: "Run the HMI design rules against a screen in the live model: a control smaller than the touch minimum, a control with no text of its own, text whose colour does not stand out from the fill it sits on, a screen with no navigation area, a screen whose controls carry no event handler, a screen whose size is not the window canvas, the same hand-built composition repeated across screens, behaviour living inside a composition, an Advanced SVG image with nothing to animate, a literal colour beside a style sheet that already decides it, a child drawn outside its parent, and a measurement shown without the unit the model records. Rule ids are the corpus ids, so a finding is citable with engineering_reference. Read-only: nothing is written. Each finding is a statement about the model the bridge reports, not about how the screen renders.",
		parameters: {
			project: projectParameter,
			screen: {
				type: "string",
				required: true,
				description: "Screen path to check, for example UI/Screens/AlarmSummary."
			},
			window: {
				type: "string",
				description: "Window whose Width and Height are the canvas. Default UI/MainWindow."
			},
			screens_folder: {
				type: "string",
				description: "Folder the other screens are read from for the reuse rule. Default UI/Screens."
			},
			depth: {
				type: "integer",
				description: "How deep the screen tree is walked. Default 3."
			},
			max_nodes: {
				type: "integer",
				description: "How many objects are described in full. Default 60; anything past it is reported as unchecked."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Design check ${args.screen}`,
			kind: "read"
		}),
		async execute(args, exec) {
			const window = args.window ?? "UI/MainWindow";
			const screensFolder = args.screens_folder ?? "UI/Screens";
			const maxNodes = args.max_nodes ?? 60;
			const depth = args.depth ?? 3;
			return exclusive(async () => {
				const { origin } = await bridge.select(args.project, exec.signal);
				const tree = await bridge.request(origin, "map", exec.signal, {
					path: args.screen,
					mode: "detail",
					depth,
					max: 400
				});
				if (tree.map === void 0) return {
					status: "failed",
					error: "The bridge returned no tree for that screen",
					response: tree,
					next: "Confirm the path with optix_read action map on UI/Screens."
				};
				const nodes = [];
				// A property of a widget is a UAVariable child in the model, and `nodes` reports its value -
				// walking it as an object both doubles the node count and buries the widgets that the rules
				// actually talk about (a 24-widget screen has ~184 nodes, so the 60-object budget described
				// the backdrop's properties and never reached the buttons). Read values through `properties`.
				const walk = (entry, path) => {
					const node = {
						name: entry.name,
						type: entry.type ?? "",
						path,
						...(entry.coll === void 0 ? {} : { coll: entry.coll }),
						children: (entry.children ?? []).map((child) => ({
							name: child.name,
							type: child.type ?? child.coll ?? ""
						})),
						...(entry.n === void 0 ? {} : { descendants: entry.n }),
						...(entry.more === void 0 ? {} : { more: entry.more })
					};
					nodes.push(node);
					for (const child of entry.children ?? []) {
						if ((child.type ?? "") === "UAVariable") continue;
						walk(child, `${path}/${child.name}`);
					}
				};
				walk(tree.map, args.screen);
				const screen = nodes[0];
				const described = [];
				const notDescribed = [];
				for (const node of nodes) {
					if (described.length >= maxNodes) {
						notDescribed.push(node.path);
						continue;
					}
					try {
						const detail = await bridge.request(origin, "nodes", exec.signal, { path: node.path });
						described.push({
							path: node.path,
							name: node.name,
							type: node.type,
							properties: detail.properties ?? [],
							children: node.children
						});
					} catch (error) {
						notDescribed.push(`${node.path}: ${String(error)}`);
					}
				}
				let canvas;
				const canvasNotes = [];
				try {
					const windowNode = await bridge.request(origin, "nodes", exec.signal, { path: window });
					const width = Number.parseFloat(windowNode.properties?.find((entry) => entry.name === "Width")?.value ?? "");
					const height = Number.parseFloat(windowNode.properties?.find((entry) => entry.name === "Height")?.value ?? "");
					if (Number.isFinite(width) && Number.isFinite(height)) canvas = { width, height };
					else canvasNotes.push(`${window} reports no Width/Height`);
				} catch (error) {
					canvasNotes.push(`${window}: ${String(error)}`);
				}
				let siblings = [];
				try {
					const folder = await bridge.request(origin, "map", exec.signal, {
						path: screensFolder,
						mode: "detail",
						depth: 2,
						max: 400
					});
					siblings = (folder.map?.children ?? [])
						.filter((entry) => `${screensFolder}/${entry.name}` !== args.screen)
						.map((entry) => ({
							name: entry.name,
							children: (entry.children ?? []).map((child) => ({
								name: child.name,
								type: child.type ?? child.coll ?? ""
							}))
						}));
					if (folder.map?.more !== void 0) canvasNotes.push(`${screensFolder} holds more screens than the map reported`);
				} catch (error) {
					canvasNotes.push(`${screensFolder}: ${String(error)}`);
				}
				// The shell's navigation bar counts for every screen in it: the buttons live beside the
				// PanelLoader in the start window, so a screen with no controls of its own is not
				// unreachable when the shell carries wired buttons.
				let shell;
				try {
					const shellMap = await bridge.request(origin, "map", exec.signal, {
						path: window,
						mode: "detail",
						depth: 2,
						max: 200
					});
					const shellControls = (shellMap.map?.children ?? []).filter((entry) => INTERACTIVE_TYPES.has(entry.type ?? entry.coll ?? ""));
					shell = {
						path: window,
						controls: shellControls.length,
						wired: shellControls.filter((entry) => (entry.children ?? []).some((child) => child.type === "EventHandler" || child.type === "MouseClickEvent")).length
					};
					if (shellMap.map?.more !== void 0) canvasNotes.push(`${window} holds more children than the map reported`);
				} catch (error) {
					canvasNotes.push(`${window} navigation: ${String(error)}`);
				}
				// The four newer rules need facts the screen tree cannot carry: how many element
				// properties an Advanced SVG image binds, which widget types the project's style
				// sheet already styles, the units the model records for the signals a label shows,
				// and the palette the other screens follow. Every read is bounded, and a read that
				// fails becomes an `unchecked` line rather than a silent pass.
				const images = [];
				const imageNodes = described.filter((node) => node.type === "AdvancedSVGImage");
				for (const node of imageNodes.slice(0, 8)) {
					try {
						const collection = await bridge.request(origin, "map", exec.signal, {
							path: `${node.path}/SVGElementProperties`,
							mode: "detail",
							depth: 1,
							max: 40
						});
						images.push({
							path: node.path,
							name: node.name,
							elements: (collection.map?.children ?? []).length
						});
					} catch (error) {
						canvasNotes.push(`${node.path} element properties: ${String(error)}`);
					}
				}
				if (imageNodes.length > 8) canvasNotes.push(`${imageNodes.length - 8} Advanced SVG image(s) were not measured for OPTIX-IMG-01`);
				let styled = [];
				const uiRoot = screensFolder.includes("/") ? screensFolder.slice(0, screensFolder.lastIndexOf("/")) : "";
				const sheetPath = uiRoot === "" ? "DefaultStyleSheet" : `${uiRoot}/DefaultStyleSheet`;
				try {
					const sheet = await bridge.request(origin, "map", exec.signal, {
						path: sheetPath,
						mode: "detail",
						depth: 1,
						max: 120
					});
					styled = (sheet.map?.children ?? [])
						.map((entry) => String(entry.coll ?? ""))
						.filter((name) => name.endsWith("Style"))
						.map((name) => name.slice(0, -"Style".length));
				} catch (error) {
					canvasNotes.push(`${sheetPath}: ${String(error)}`);
				}
				const units = {};
				for (const node of described) {
					if (node.type !== "Label" && node.type !== "TextBox") continue;
					if (Object.keys(units).length >= 8) break;
					const link = /^\/Objects\/[^/]+\/(.+)$/u.exec(String(node.properties.find((entry) => entry.name === "Text")?.value ?? "").trim());
					if (link === null || link[1].includes("@") || units[link[1]] !== void 0) continue;
					try {
						const detail = await bridge.request(origin, "nodes", exec.signal, { path: `${link[1]}/EngineeringUnits` });
						// A LocalizedText reports as "NamespaceIndex: -1, TextId: , Text: %, LocaleId: en-US (LocalizedText)".
						const text = String(detail.properties?.find((entry) => entry.name === "Value")?.value ?? "")
							.replace(/^.*\bText:\s*/u, "")
							.replace(/\s*\(LocalizedText\)$/u, "")
							.trim();
						if (text !== "") units[link[1]] = text;
					} catch {
						// The label may show something that is not a modelled signal; OPTIX-DATA-01 stays silent.
					}
				}
				const report = designFindings({
					nodes: described,
					screen,
					canvas,
					siblings,
					...(shell === void 0 ? {} : { shell }),
					...(images.length === 0 ? {} : { images }),
					styled,
					palette: Object.values(SCREEN_THEME),
					units
				});
				const unchecked = [...report.unchecked, ...canvasNotes];
				if (notDescribed.length > 0) unchecked.push(`${notDescribed.length} object(s) were not described: ${notDescribed.slice(0, 5).join(", ")}${notDescribed.length > 5 ? ", Ã¢â‚¬Â¦" : ""}`);
				if (screen.descendants !== void 0 && screen.descendants > described.length) unchecked.push(`${screen.name} holds ${screen.descendants} descendants; only ${described.length} were read`);
				const warnings = report.findings.filter((finding) => finding.severity === "warning");
				return {
					status: "completed",
					screen: args.screen,
					...(canvas === void 0 ? {} : { canvas }),
					objects: described.length,
					screens_compared: siblings.length,
					findings: report.findings,
					summary: {
						findings: report.findings.length,
						warnings: warnings.length,
						info: report.findings.length - warnings.length
					},
					unchecked,
					coverage: "Every finding is a statement about the geometry, colours and wiring the bridge reports. Contrast compares a text colour with the smallest fill that contains the control. A screen with no reported size cannot be compared with the canvas. Nothing here renders the screen or runs it: look at it with optix_preview and optix_screenshot.",
					next: warnings.length === 0 ? "No warning-level finding. Look at the screen with optix_preview and optix_screenshot before calling it done." : "Fix the warning findings with optix_edit (size, colour, wiring), then check again."
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_production_check",
		description: "Review the whole project the way a commissioning engineer does before release, in one pass: event handlers that still name an absolute design-time object (the runtime instantiates UI per session, so those buttons are dead even though they exist - OPTIX-PROD-01), handlers that point at a screen which is not there (OPTIX-PROD-02), screens the operator cannot reach from the panel the loader starts on (OPTIX-PROD-03), presentation engines left on engineering defaults such as an anonymous starting user or the stock style sheet (OPTIX-PROD-04) and screens that live outside the screen folder (OPTIX-PROD-05). Returns a release verdict with per-rule findings, each naming the node and the fix. repair:true clears the absolute pointer value of every handler OPTIX-PROD-01 reports, which is exactly the measured cause of a navigation button that clicks but never switches; it needs allowWrites and writes only that value.",
		parameters: {
			project: projectParameter,
			window: {
				type: "string",
				description: "Window that carries the PanelLoader the checks start from. Default UI/MainWindow."
			},
			screens_folder: {
				type: "string",
				description: "Folder the screens live in. Default UI/Screens."
			},
			depth: {
				type: "integer",
				description: "How deep the UI tree is read in one bridge call. Default 8."
			},
			max_handlers: {
				type: "integer",
				description: "How many event handlers are inspected in full. Default 120."
			},
			repair: {
				type: "boolean",
				description: "Clear the absolute design-time value of every pointer OPTIX-PROD-01 reports. Requires allowWrites."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Production check",
			kind: "read"
		}),
		async execute(args, exec) {
			const window = args.window ?? "UI/MainWindow";
			const screensFolder = args.screens_folder ?? "UI/Screens";
			const depth = args.depth ?? 8;
			const maxHandlers = args.max_handlers ?? 120;
			if (args.repair === true) allowWrite(true);
			return exclusive(async () => {
				const { origin, health } = await bridge.select(args.project, exec.signal);
				// One structural read of the whole UI tree carries every widget, every handler and
				// every pointer reference the rules need. Reading node by node is what made the
				// per-screen check slow on a real project, so this tool walks the tree once and
				// then asks for the few values the tree does not carry (arguments, engine settings).
				const tree = await bridge.request(origin, "map", exec.signal, {
					path: "UI",
					mode: "detail",
					depth,
					// The bridge only reports node ids for `ids=1`; `ids=true` is ignored (measured 2026-11-14).
					ids: 1,
					max: 4000
				});
				if (tree.map === void 0) return {
					status: "failed",
					error: "The bridge returned no tree for UI",
					response: tree,
					next: "Confirm the project is loaded with optix_status."
				};
				const nodes = [];
				walkTree(tree.map, "UI", (entry, path) => nodes.push({ entry, path }));
				const byId = new Map();
				for (const node of nodes) if (typeof node.entry.id === "string") byId.set(node.entry.id, node.path);
				const pathOf = (value) => {
					if (typeof value !== "string") return void 0;
					const id = /(\d+\/[0-9a-f-]{36})/u.exec(value)?.[1];
					if (id === void 0) return void 0;
					return byId.get(id) ?? `#${id}`;
				};
				const propertyValue = (properties, name) => properties?.find((entry) => entry.name === name)?.value;
				const coverage = [];
				const screens = nodes
					.filter((node) => node.path.startsWith(`${screensFolder}/`) && node.path.slice(screensFolder.length + 1).indexOf("/") === -1 && `${node.entry.type ?? ""}`.includes("Screen"))
					.map((node) => ({ path: node.path, name: node.entry.name }));
				coverage.push(`${nodes.length} object(s) read from one map of UI at depth ${depth}`);
				const handlers = [];
				const handlerNodes = nodes.filter((node) => `${node.entry.type ?? ""}` === "EventHandler").slice(0, maxHandlers);
				for (const node of handlerNodes) {
					const owner = node.path.replace(/\/EH_[^/]+$/u, "");
					const parent = screens
						.map((screen) => screen.path)
						.filter((path) => owner === path || owner.startsWith(`${path}/`))
						.sort((left, right) => right.length - left.length)[0];
					const screenPath = parent ?? (owner === window || owner.startsWith(`${window}/`) ? window : owner);
					let target;
					// A method that takes no arguments (every handler inside the shipped libraries) has no
					// InputArguments node at all; only a handler the tree lists but the read cannot resolve
					// is worth reporting as an unknown.
					const argumentsPath = `${node.path}/MethodsToCall/MethodContainer1/InputArguments`;
					if (nodes.some((entry) => entry.path === argumentsPath)) try {
						const arguments_ = await bridge.request(origin, "nodes", exec.signal, { path: argumentsPath });
						target = pathOf(propertyValue(arguments_.properties, "NewPanel"));
					} catch {
						coverage.push(`${node.path}: arguments could not be read`);
					}
					handlers.push({
						path: node.path,
						owner,
						screen: screenPath,
						pointer: pointerFacts(node.entry),
						target
					});
				}
				if (nodes.filter((node) => `${node.entry.type ?? ""}` === "EventHandler").length > handlerNodes.length) coverage.push(`${nodes.filter((node) => `${node.entry.type ?? ""}` === "EventHandler").length - handlerNodes.length} handler(s) past max_handlers were not inspected`);
				// A handler nested inside a shipped composite sits deeper than one structural read
				// reaches, so its ObjectPointer arrives without the DynamicLink that makes it work.
				// Re-read only the handlers that look dead, one short map each, before judging them.
				for (const handler of handlers) {
					if (!(handler.pointer.present === true && handler.pointer.ref === void 0 && handler.pointer.linked !== true)) continue;
					try {
						const detail = await bridge.request(origin, "map", exec.signal, { path: handler.path, mode: "detail", depth: 5, ids: 1, max: 200 });
						if (detail.map !== void 0) handler.pointer = pointerFacts(detail.map);
					} catch {
						coverage.push(`${handler.path}: the pointer could not be re-read, so it was not judged`);
					}
				}
				const engines = [];
				for (const node of nodes.filter((entry) => /^UI\/(?:Native|Web)PresentationEngine$/u.test(entry.path))) {
					try {
						const detail = await bridge.request(origin, "nodes", exec.signal, { path: node.path });
						engines.push({
							path: node.path,
							styleSheet: pathOf(propertyValue(detail.properties, "StyleSheet")),
							startingUser: pathOf(propertyValue(detail.properties, "StartingUser")) ?? String(propertyValue(detail.properties, "StartingUser") ?? "").replace(/\s*\([^)]*\)$/u, "")
						});
					} catch {
						coverage.push(`${node.path}: settings could not be read`);
					}
				}
				let startTarget;
				const loader = nodes.find((node) => `${node.entry.type ?? ""}` === "PanelLoader" && node.path.startsWith(`${window}/`));
				if (loader === void 0) coverage.push(`no PanelLoader under ${window}, so reachability was not checked`);
				else startTarget = void 0;
				if (loader !== void 0) try {
					const detail = await bridge.request(origin, "nodes", exec.signal, { path: loader.path });
					const panelValue = propertyValue(detail.properties, "Panel");
					startTarget = pathOf(panelValue);
					if (startTarget === void 0) coverage.push(`${loader.path}: the start panel value read ${JSON.stringify(panelValue)} and did not resolve to a screen`);
				} catch {
					coverage.push(`${loader.path}: Panel could not be read`);
				}
				const hasApplicationStyleSheet = nodes.some((node) => `${node.entry.type ?? ""}`.includes("StyleSheet") && !/\/DefaultStyleSheet$/u.test(node.path) && !/DefaultStyleSheet\//u.test(node.path));
				const report = productionFindings({
					projectName: health.project,
					screensFolder,
					screens,
					handlers,
					engines,
					startTarget,
							shellPath: window,
							hasApplicationStyleSheet
				});
				let repaired = [];
				let unrepaired = [];
				if (args.repair === true) {
					for (const finding of report.findings) {
						if (finding.rule !== "OPTIX-PROD-01") continue;
						const pointerPath = `${finding.evidence.path}/MethodsToCall/MethodContainer1/ObjectPointer`;
						try {
							const written = await bridge.request(origin, "node/property", exec.signal, {
								path: pointerPath,
								name: "Value",
								value: ""
							}, "POST");
							if (written.ok === true) repaired.push(pointerPath);
							else unrepaired.push(pointerPath);
						} catch (error) {
							unrepaired.push(`${pointerPath}: ${String(error)}`);
						}
					}
					if (repaired.length > 0) coverage.push(`${repaired.length} absolute pointer value(s) cleared; wire the handler again in the runtime if the button still does not switch`);
				}
				const verdict = report.verdict;
				return {
					status: "completed",
					project: health.project,
					verdict,
					counts: report.counts,
					findings: report.findings,
					...(repaired.length === 0 ? {} : { repaired }),
					...(unrepaired.length === 0 ? {} : { unrepaired }),
					coverage: [...report.coverage, ...coverage],
					next: verdict === "ready" ? "Nothing blocks release by these rules. Run optix_design_check per screen and look at the runtime before signing off." : verdict === "review" ? "Fix the warning-level findings, run optix_production_check again, then check each screen." : "Fix the critical findings first: a dead handler or a dead navigation button is invisible until an operator clicks it. repair:true clears the pointer values this check reports."
				};
			});
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_model",
		description: "Scaffold or review the OPC UA information model under Model, the way a structured Optix project is laid out: one folder level per plant, area and line, equipment as ObjectTypes under Model/Types, signals as variables on the type, equipment instances of those types, and the metadata a tag can carry (DisplayName through the attribute route, EngineeringUnits/EURange/Description as child variables). action plan answers with the ordered operations and the folder tree without writing; action apply submits them through the same strictly validated batch optix_edit uses; action check reads the live Model tree and reports OPTIX-MDL-01..06 with a structured/needs-work verdict. Two measured limits are reported honestly: Optix variables cannot take a UA Description attribute or typed properties yet, so units/range/description are child String variables, and a type's members are COPIED onto its instances because the bridge writes them with ModellingRule None (so they would not instantiate on their own). An existing flat model is reported, never rewritten.",
		parameters: {
			project: projectParameter,
			action: {
				type: "string",
				description: "plan returns the ops and tree the spec would create; apply creates them (needs allowWrites); check reads Model and reports the rules. Default plan."
			},
			spec: {
				type: "object",
				additionalProperties: true,
				description: "The model to build: { plant, area, lines: [{ name, equipment: [{ name, type?, tags?: [{ name, datatype, initial?, display_name?, units?, range?, description? }] }] }], types?: [{ name, tags }] }. Ask the operator for the plant name, the area name and what equipment sits on each line before calling this."
			},
			hierarchy: {
				type: "array",
				items: {
					type: "string"
				},
				description: "Three level names between Model and the line, in order. Default Plant, Area, Line."
			},
			depth: {
				type: "integer",
				description: "How deep the Model tree is read for check and for the existing-path scan. Default 8."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "OPC UA model",
			kind: "read"
		}),
		async execute(args, exec) {
			const action = args.action ?? "plan";
			if (action === "plan" || action === "apply" || action === "check") {
				// Known actions: the enum lives in the parameter description because the schema is open.
			} else throw new Error(`action must be plan, apply or check (got ${String(action)})`);
			if (action === "apply") allowWrite(true);
			const hierarchy = args.hierarchy === void 0 ? DEFAULT_HIERARCHY : args.hierarchy;
			const depth = args.depth ?? 8;

			/** Reads the whole Model tree through /bridge/nodes, one call per folder, object, type and variable. */
			async function readModel(origin, signal) {
				const nodes = [];
				const coverage = [];
				const limit = 400;
				let truncated = false;
				let calls = 0;
				const queue = [{ path: MODEL_ROOT, datatype: void 0 }];
				while (queue.length > 0) {
					if (calls >= limit) {
						truncated = true;
						break;
					}
					const item = queue.shift();
					calls += 1;
					let detail;
					try {
						detail = await bridge.request(origin, "nodes", signal, { path: item.path });
					} catch (error) {
						coverage.push(`${item.path}: ${String(error)}`);
						continue;
					}
					const browse = String(detail?.browse_name ?? item.path.split("/").filter((segment) => segment !== "").at(-1) ?? "");
					const nodeClass = String(detail?.node_class ?? "");
					const dotnet = String(detail?.dotnet_type ?? "");
					const kind = nodeClass === "ObjectType" ? "type" : nodeClass === "Variable" ? "variable" : dotnet === "Folder" ? "folder" : dotnet === "BaseObject" ? "object" : nodeClass === "Object" ? "folder" : "other";
					/** Variable children arrive either as children (typed instances, folders) or as properties; both spellings are read once. */
					const variableTypes = new Map();
					for (const child of Array.isArray(detail?.children) ? detail.children : []) {
						if (String(child?.type ?? "") !== "UAVariable") continue;
						const name = String(child?.browse_name ?? child?.name ?? "");
						if (name !== "" && !variableTypes.has(name)) variableTypes.set(name, "");
					}
					for (const property of Array.isArray(detail?.properties) ? detail.properties : []) {
						const name = String(property?.name ?? "");
						if (name !== "") variableTypes.set(name, String(property?.datatype ?? ""));
					}
					const members = [...variableTypes.keys()];
					nodes.push({
						path: item.path,
						name: browse,
						kind,
						...(item.datatype === void 0 ? {} : { datatype: item.datatype }),
						...(members.length === 0 ? {} : { members })
					});
					if (kind === "variable") continue;
					const insideTypes = item.path === MODEL_ROOT ? false : item.path.startsWith(`${TYPES_FOLDER}/`) || item.path === TYPES_FOLDER;
					if (!insideTypes) {
						for (const [name, datatype] of variableTypes) queue.push({ path: `${item.path}/${name}`, datatype });
					}
					for (const child of Array.isArray(detail?.children) ? detail.children : []) {
						if (String(child?.type ?? "") === "UAVariable") continue;
						const name = String(child?.browse_name ?? child?.name ?? "");
						if (name === "") continue;
						queue.push({ path: `${item.path}/${name}` });
					}
				}
				coverage.push(`${calls} node read(s) from ${MODEL_ROOT}`);
				if (truncated) coverage.push(`the model read stopped after ${limit} nodes, so the findings describe part of the tree`);
				return { nodes, coverage, truncated };
			}

			/** Collects every path that already exists under Model, so a re-run only adds what is missing. */
			async function existingPaths(origin, signal) {
				const paths = new Set([MODEL_ROOT]);
				let truncated = false;
				try {
					const tree = await bridge.request(origin, "map", signal, {
						path: MODEL_ROOT,
						mode: "detail",
						depth,
						ids: 1,
						max: 4000
					});
					const step = (entry, path) => {
						paths.add(path);
						for (const child of Array.isArray(entry?.children) ? entry.children : []) {
							const name = String(child?.name ?? "");
							if (name !== "") step(child, `${path}/${name}`);
						}
					};
					if (tree?.map !== void 0) step(tree.map, MODEL_ROOT);
					if (tree?.map?.more !== void 0 || tree?.more !== void 0) truncated = true;
				} catch (error) {
					return { paths, truncated: true, note: `${MODEL_ROOT} could not be mapped: ${String(error)}` };
				}
				return { paths, truncated };
			}

			return exclusive(async () => {
				const { origin, health } = await bridge.select(args.project, exec.signal);
				if (action === "check") {
					const read = await readModel(origin, exec.signal);
					const report = modelFindings({ nodes: read.nodes, hierarchy, truncated: read.truncated });
					return {
						status: "completed",
						project: health.project,
						verdict: report.verdict,
						counts: report.counts,
						findings: report.findings,
						metadata: report.metadata,
						...(report.note === void 0 ? {} : { note: report.note }),
						coverage: [...read.coverage, ...report.coverage],
						next: report.verdict === "structured" ? "The model follows the convention these rules measure. Bind the screen rows to the signal paths and keep new tags inside the same hierarchy." : "Fix the critical findings first - a signal outside the plant hierarchy is the thing that stops a model being navigable - then the warnings, then run optix_model check again."
					};
				}
				const existing = await existingPaths(origin, exec.signal);
				const plan = planModel(args.spec, {
					hierarchy,
					...(existing === void 0 ? {} : { existing: existing.paths })
				});
				if (action === "plan") return {
					status: "planned",
					project: health.project,
					hierarchy: plan.hierarchy,
					counts: plan.counts,
					tree: plan.tree,
					op_count: plan.ops.length,
					ops: plan.ops,
					questions: plan.questions,
					...(plan.skipped.length === 0 ? {} : { skipped: plan.skipped }),
					metadata: MODEL_METADATA,
					...(existing?.note === void 0 ? {} : { note: existing.note }),
					next: "Apply with action:\"apply\" (it needs allowWrites), then save the project in Studio and run action:\"check\" to see the same tree through the rules."
				};
				if (plan.ops.length === 0) return {
					status: "completed",
					project: health.project,
					hierarchy: plan.hierarchy,
					counts: plan.counts,
					tree: plan.tree,
					applied: 0,
					skipped: plan.skipped,
					questions: plan.questions,
					metadata: MODEL_METADATA,
					next: "Every path in the spec already exists. Run action:\"check\" to judge the live model, or change the spec."
				};
				const batch = await runValidatedBatch({
					origin,
					project: args.project,
					ops: expandVariables(plan.ops).ops,
					health,
					signal: exec.signal
				});
				if (batch.status !== "validated" && batch.status !== "completed") return {
					status: batch.status,
					project: health.project,
					applied: batch.applied,
					...(batch.failed_index === void 0 ? {} : { failed_index: batch.failed_index }),
					...(batch.error === void 0 ? {} : { error: batch.error }),
					validation: batch.validation,
					retry: "Inspect the live Model tree before retrying; a plan is idempotent because existing paths are skipped."
				};
				return {
					status: "completed",
					project: health.project,
					hierarchy: plan.hierarchy,
					counts: plan.counts,
					tree: plan.tree,
					applied: batch.applied,
					questions: plan.questions,
					...(plan.skipped.length === 0 ? {} : { skipped: plan.skipped }),
					...(batch.pointer_values_cleared === void 0 ? {} : { pointer_values_cleared: batch.pointer_values_cleared }),
					metadata: MODEL_METADATA,
					inheritance: "copied",
					next: "Save the project in Studio (the model is only in memory until you do), then run action:\"check\". A typed instance carries copies of its type's members because the bridge writes members with ModellingRule None."
				};
			});
		}
	})));

	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_script",
		description: "Add, read, review, edit, delete, compile and run FactoryTalk Optix NetLogic C# classes. A NetLogic is two writes that must agree: a node whose BrowseName equals the class name (created here through the bridge) and a .cs file in the project's ProjectFiles\\NetSolution, which Studio's SDK-style csproj globs on the next build. action list pairs every .cs with its live node and says which side is missing; read returns the source; review checks the source against the lifecycle, threading, observer, logging and naming rules (OPTIX-NL-03..12) and can compile it; add creates the node and writes a template or the code you pass; edit replaces the source (guarded by expect_sha256) and compiles it; delete removes the node and, unless the file belongs to a shipped library item, the file; build runs dotnet build and returns the diagnostics; run executes an [ExportMethod] at design time through the bridge (needs allowInvoke), which is how a design-time NetLogic is exercised. kind runtime gives Start/Stop that the runtime calls; kind design gives [ExportMethod] helpers Studio does not auto-run at design time. add and edit refuse code with a critical finding unless force is true, so a class that breaks the documented lifecycle does not reach the project. Studio still has to build the solution for a new or edited class to be loaded - say that rather than implying the write took effect in Studio.",
		parameters: {
			project: projectParameter,
			action: {
				type: "string",
				description: "list (default) sends no writes; read returns a class; review checks a class against OPTIX-NL-03..12 and optionally compiles it; add creates a node plus its .cs; edit replaces the .cs and builds; delete removes node and file; build compiles the NetSolution; run executes a design-time [ExportMethod]."
			},
			project_root: {
				type: "string",
				description: "Folder that holds <project>.optix. Optional: searched in Documents\\Rockwell Automation\\FactoryTalk Optix\\Projects, the Desktop and AryaCode\\KonnectSuite when omitted, and refused with the candidates when several match."
			},
			name: {
				type: "string",
				description: "NetLogic node name and C# class name - Optix binds the node to a class by name, so they must match. Required for read, add, edit, delete."
			},
			parent: {
				type: "string",
				description: "Folder that will own the node, for add. Default NetLogic. Place a runtime NetLogic under the object whose children it reads when it uses Owner."
			},
			kind: {
				type: "string",
				description: "runtime (Start/Stop run in the runtime) or design ([ExportMethod] helpers, run by right-click Execute or action run). Default runtime."
			},
			template: {
				type: "string",
				description: "For add with no code: blank, periodic (runtime class with a PeriodicTask, cached nodes, try/catch and dispose), observer (runtime class subscribing to VariableChange and unsubscribing in Stop), nav (runtime class bound inside a PanelLoader, exposing Open(screenPath) through ChangePanel - the navigation template), or login (runtime class exposing PerformLogin(username, password, out bool) through the Users alias, PasswordVariable.RemoteRead() and Session.ChangeUser). Default blank."
			},
			code: {
				type: "string",
				description: "Full C# source for add or edit. The class it declares must equal name; for edit pass the whole file, not a fragment."
			},
			expect_sha256: {
				type: "string",
				description: "For edit: the sha256 you read, so a file that changed underneath is not overwritten silently."
			},
			method: {
				type: "string",
				description: "For run: the [ExportMethod] name to execute at design time."
			},
			args: {
				type: "string",
				description: "For run: comma-separated string arguments for the method."
			},
			force: {
				type: "boolean",
				description: "For delete: remove a file this tool did not write (a shipped library class, say). For add and edit: write code that the review rates block. Off means such code is refused with the findings."
			},
			lint: {
				type: "boolean",
				description: "For add and edit: review the code and report findings. Default true; a critical finding is refused unless force is true."
			},
			build: {
				type: "boolean",
				description: "For add and edit: run dotnet build afterwards. Default true; the compile result is the only proof the class is real."
			}
		},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "NetLogic",
			kind: "write"
		}),
		async execute(args, exec) {
			const action = args.action ?? "list";
			const allowed = ["list", "read", "review", "add", "edit", "delete", "build", "run"];
			if (!allowed.includes(action)) throw new Error(`action must be one of ${allowed.join(", ")} (got ${String(action)})`);
			if (action === "add" || action === "edit" || action === "delete") allowWrite(true);
			if (action === "run" && settings.allowInvoke !== true) throw new Error("Running a NetLogic method needs allowInvoke on the Optix row");
			const resolved = await findProjectRoot(args.project, args.project_root);
			const root = resolved.root;
			const wanted = args.name === void 0 || String(args.name).trim() === "" ? void 0 : String(args.name).trim();
			if (action !== "list" && action !== "build" && wanted === void 0) throw new Error(`action ${action} needs name`);
			if (wanted !== void 0) checkName(wanted);
			if (action === "build") {
				const compile = await buildNetSolution(root);
				return {
					status: compile.ok ? "completed" : "failed",
					action,
					project_root: root,
					net_solution: netSolutionDir(root),
					build: compile,
					next: compile.ok ? "The assembly compiled on disk. A running Studio still has its own copy loaded: build in Studio (Ctrl+Shift+B) before a class is exercisable with action run." : compile.locked ? "The Optix runtime holds bin/&lt;project&gt;.dll open, so the copy step failed after the C# compiled. Stop the emulator (optix_emulator action stop), build again, then start it." : "Read the diagnostics, fix the class, then build again."
				};
			}
			const requester = async (origin) => (route, signal, query) => bridge.request(origin, route, signal, query);
			const liveNodes = async () => {
				try {
					const selected = await bridge.select(args.project, exec.signal);
					return { origin: selected.origin, nodes: await liveNetLogicNodes(await requester(selected.origin), exec.signal) };
				} catch {
					return { origin: void 0, nodes: [] };
				}
			};
			if (action === "list") {
				const files = await listNetLogics(root);
				const live = await liveNodes();
				const byName = new Map(live.nodes.map((node) => [node.name, node.path]));
				const entries = files.map((entry) => ({
					...netLogicReport(resolved, entry, {
						node: byName.get(entry.name) ?? ""
					}),
					in_project: byName.has(entry.name)
				}));
				const known = new Set(files.map((entry) => entry.name));
				const orphans = live.nodes.filter((node) => !known.has(node.name)).map((node) => ({
					node: node.path,
					reason: "the project has this node but ProjectFiles\\NetSolution has no matching class file"
				}));
				return {
					status: "completed",
					action,
					project_root: resolved.root,
					optix_file: resolved.optixFile,
					net_solution: netSolutionDir(root),
					count: entries.length,
					entries,
					...(orphans.length === 0 ? {} : {
						nodes_without_file: orphans
					}),
					next: "read one with action read; add one with action add (kind runtime or design). A class only runs after Studio builds the solution."
				};
			}
			if (action === "read") {
				const entry = await readNetLogic(root, wanted).catch((error) => {
					if (!/no .*\.cs in /u.test(String(error?.message ?? error))) throw error;
					return void 0;
				});
				const live = await liveNodes();
				const node = live.nodes.find((candidate) => candidate.name === wanted)
					?? (live.origin === void 0 ? void 0 : await findNetLogicNode(await requester(live.origin), exec.signal, wanted).catch(() => void 0));
				return {
					...netLogicReport(resolved, entry, {
						node: node === void 0 ? "" : node.path,
						code: entry.code
					}),
					status: "completed",
					action,
					...(node === void 0 ? {
						note: "no NetLogic node with this name in the open project - the file is an orphan until one exists"
					} : {})
				};
			}
			if (action === "build") {
				const compile = await buildNetSolution(root);
				return {
					status: compile.ok ? "completed" : "failed",
					action,
					project_root: root,
					compile,
					next: compile.ok ? "Ask the engineer to build in Studio so the loaded assembly includes this code." : "Fix the reported errors; nothing in Studio changes until it compiles."
				};
			}
			if (action === "review") {
				const entry = await readNetLogic(root, wanted);
				const review = reviewNetLogic(entry.code, { name: wanted, kind: entry.kind === "unknown" ? (args.kind ?? "runtime") : entry.kind });
				const compile = args.build === false ? void 0 : await buildNetSolution(root);
				return {
					...netLogicReport(resolved, entry, {
						status: "completed",
						action,
						review,
						...(compile === void 0 ? {} : { compile }),
						next: review.verdict === "block" ? "Fix the critical findings before this class is relied on; then review again and build in Studio." : review.verdict === "review" ? "The class compiles but the warnings above are the measured ways a runtime NetLogic fails silently. Fix them, then build in Studio." : "Nothing found by the static rules. A Studio build is still what puts this class in the loaded assembly."
					})
				};
			}
			if (action === "add") {
				const kind = args.kind ?? "runtime";
				if (kind !== "runtime" && kind !== "design") throw new Error("kind must be runtime or design");
				const template = args.template ?? "blank";
				if (!TEMPLATES.includes(template)) throw new Error(`template must be one of ${TEMPLATES.join(", ")}`);
				const file = fileFor(root, wanted);
				if (existsSync(file) && (args.code === void 0 || String(args.code).trim() === "")) throw new Error(`${wanted}.cs already exists - use action edit, or pass code to replace it`);
				const code = args.code === void 0 || String(args.code).trim() === "" ? templateCode({
					name: wanted,
					kind,
					template
				}) : args.code;
				// Review before the node exists: a refused class must not leave a node
				// without a file behind it.
				const review = args.lint === false ? void 0 : reviewNetLogic(code, { name: wanted, kind });
				if (review !== void 0 && review.verdict === "block" && args.force !== true) {
					const critical = review.findings.filter((finding) => finding.severity === "critical").map((finding) => `${finding.rule} line ${finding.line}: ${finding.message}`);
					throw new Error(`refusing ${wanted} - the review rates this code block: ${critical.join("; ")}. Fix the findings, or pass force:true to write it anyway.`);
				}
				const created = await liveNodes();
				if (created.origin === void 0) throw new Error("the bridge is not answering, so the NetLogic node cannot be created - ask the engineer to open the project and start the bridge");
				let nodeResult;
				try {
					nodeResult = await bridge.request(created.origin, "model/netlogic", exec.signal, {
						parent: args.parent ?? NETLOGIC_FOLDER,
						name: wanted
					}, "POST");
				} catch (error) {
					if (String(error).includes("name_exists")) nodeResult = { ok: true, existed: true };
					else throw error;
				}
				const stored = await writeNetLogic(root, wanted, code);
				const compile = args.build === false ? void 0 : await buildNetSolution(root);
				return {
					...netLogicReport(resolved, stored, {
						status: "completed",
						action,
						node_result: nodeResult,
						kind,
						...(review === void 0 ? {} : { review }),
						...(compile === void 0 ? {} : { compile }),
						next: compile !== void 0 && !compile.ok ? (compile.locked ? "The C# compiled but the Optix runtime holds bin/&lt;project&gt;.dll open, so the copy failed. Stop the emulator, add again (or build), then start it." : "The class does not compile yet - fix the diagnostics before asking for a Studio build.") : "Ask the engineer to build the solution in Studio (or restart the bridge) so the compiled class is loaded; then a runtime NetLogic runs with its parent's runtime, and a design-time one is exercisable with action run."
					})
				};
			}
			if (action === "edit") {
				if (args.code === void 0 || String(args.code).trim() === "") throw new Error("edit needs code (the whole class)");
				const review = args.lint === false ? void 0 : reviewNetLogic(args.code, { name: wanted, kind: args.kind ?? "runtime" });
				if (review !== void 0 && review.verdict === "block" && args.force !== true) {
					const critical = review.findings.filter((finding) => finding.severity === "critical").map((finding) => `${finding.rule} line ${finding.line}: ${finding.message}`);
					throw new Error(`refusing to write ${wanted} - the review rates this code block: ${critical.join("; ")}. Fix the findings, or pass force:true to write it anyway.`);
				}
				const stored = await writeNetLogic(root, wanted, args.code, {
					expectSha256: args.expect_sha256
				});
				const compile = args.build === false ? void 0 : await buildNetSolution(root);
				return {
					...netLogicReport(resolved, stored, {
						status: "completed",
						action,
						...(review === void 0 ? {} : { review }),
						...(compile === void 0 ? {} : { compile }),
						next: compile !== void 0 && !compile.ok ? (compile.locked ? "The C# compiled but the Optix runtime holds bin/&lt;project&gt;.dll open, so the copy failed. Stop the emulator, then build." : "Fix the diagnostics, then edit again - Studio still runs the previous build.") : "Ask the engineer to build in Studio so this code becomes the loaded class."
					})
				};
			}
			if (action === "delete") {
				// Read the file directly: a node can outlive its class, and that orphan
				// is the case delete must still clean up.
				const deleteFile = fileFor(root, wanted);
				const deleteCode = existsSync(deleteFile) ? await readFile(deleteFile, "utf8") : void 0;
				if (deleteCode !== void 0 && !deleteCode.includes(MARKER) && args.force !== true) throw new Error(`${wanted}.cs was not written by this tool (no marker comment) - a shipped library class is part of a composite. Pass force:true only if you mean to break that composite.`);
				const live = await liveNodes();
				const node = live.origin === void 0 ? void 0 : await findNetLogicNode(await requester(live.origin), exec.signal, wanted).catch(() => void 0);
				if (deleteCode === void 0 && node === void 0) throw new Error(`no ${wanted}.cs in ${netSolutionDir(root)} and no NetLogic node of that name in the open project`);
				const hadFile = existsSync(deleteFile);
				let nodeDeleted = false;
				if (node !== void 0 && live.origin !== void 0) {
					if (node.path.startsWith("UI/Components/")) throw new Error(`${node.path} lives inside an imported library composite - delete the composite instead, not its logic`);
					await bridge.request(live.origin, "node/delete", exec.signal, { path: node.path }, "POST");
					nodeDeleted = true;
				}
				const file = await removeNetLogicFile(root, wanted);
				return {
					status: "completed",
					action,
					project_root: root,
					name: wanted,
					node: node === void 0 ? "" : node.path,
					node_deleted: nodeDeleted,
					file: file.file,
					file_removed: !existsSync(deleteFile) && (file.removed || hadFile),
					...(!hadFile ? {} : nodeDeleted ? { file_note: "Deleting the NetLogic node also removed its class file." } : {}),
					next: deleteCode === void 0 ? "The node is gone; its class file was already absent. Ask the engineer to build in Studio so the class leaves the loaded assembly, then save." : "Ask the engineer to build in Studio so the deleted class leaves the assembly, then save."
				};
			}
			// run
			const method = args.method;
			if (typeof method !== "string" || method.trim() === "") throw new Error("run needs method (the [ExportMethod] name)");
			const live = await liveNodes();
			if (live.origin === void 0) throw new Error("the bridge is not answering");
			const node = live.nodes.find((candidate) => candidate.name === wanted || candidate.path === args.name)
				?? await findNetLogicNode(await requester(live.origin), exec.signal, wanted).catch(() => void 0);
			if (node === void 0) throw new Error(`no NetLogic node named ${wanted} in the open project`);
			const query = { path: node.path,
				method: method.trim() };
			if (typeof args.args === "string" && args.args !== "") query.args = args.args;
			let result;
			try {
				result = await bridge.request(live.origin, "node/invoke", exec.signal, query, "POST");
			} catch (error) {
				// The bridge answers "No behaviour or observer found" when the class is
				// not in the NetLogic assembly Studio has loaded, which is what a file
				// written after Studio opened the project looks like: the C# compiles
				// (this tool ran dotnet build) but Studio has not rebuilt yet.
				const text = String(error?.message ?? error);
				if (!/No behaviour or observer found|execution_failed/u.test(text)) throw error;
				return {
					status: "not-loaded",
					action,
					project_root: root,
					node: node.path,
					method: method.trim(),
					compiled: void 0,
					next: `${wanted} compiles, but Studio's loaded NetLogic assembly predates it. Build the project in Studio (Build > Build Solution, or Ctrl+Shift+B) and run this again; the file is already on disk at ProjectFiles/NetSolution/${wanted}.cs.`
				};
			}
			return {
				status: result.ok === true ? "completed" : "failed",
				action,
				project_root: root,
				node: node.path,
				method: method.trim(),
				result,
				next: "A design-time method runs against Project.Current the way right-click Execute does; a throwing method is reported in the result, and a runtime-only class has nothing to run here."
			};
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_project",
		description: "Read and edit a FactoryTalk Optix project as files, for what the bridge cannot do: a C# file, a new chapter, a rename, a repair, or a project Studio has closed. `check` validates every chapter (YAML, node names, references, absolute pointers) and reports the gates that would refuse a write; `census` counts files, nodes, types, NetLogic and screens; `node` reads one node by project path; `sources` lists chapters and backups; `stage` replays a batch of edits in memory and writes only a manifest; `apply` writes a staged batch from per-file backups with an all-or-nothing rollback; `diff` compares a backup with disk after Studio opened the project; `restore` puts a backup back. A write refuses while Studio has this project open or while the bridge holds unsaved changes, because Studio saves only on Ctrl+S and that save would overwrite the file edit: close the project (or use optix_edit) and stage again. Prefer optix_edit for the live model; use this for the files.",
		parameters: {
			action: {
				type: "string",
				required: true,
				description: "check | census | node | sources | stage | apply | diff | restore"
			},
			project: {
				type: "string",
				description: "Project name as optix_status reports it. Give this or project_root."
			},
			project_root: {
				type: "string",
				description: "Folder that holds <Project>.optix. The only way to aim at a project Studio has never opened, and needed when the name alone matches several folders."
			},
			path: {
				type: "string",
				description: "For node: project path below the project folder, e.g. UI/MainWindow or Model/DshSpeed."
			},
			ops: {
				type: "array",
				items: { type: "json" },
				description: "For stage: ordered edits. {op:'write_file', path, content, expect_sha256?}, {op:'replace_text', path, find, replace, count?}, {op:'insert_node', path, node_path, node:{Name, Type, ...}}, {op:'remove_node', path, node_path}, {op:'set_node_value', path, node_path, key, value}, {op:'set_project_name', name}. path is project-relative (Nodes/UI/UI.yaml); node_path is a node path inside that file, empty for the file root's children."
			},
			stage_id: {
				type: "string",
				description: "For apply: a stage id from stage, or latest (the default)."
			},
			backup_id: {
				type: "string",
				description: "For diff and restore: the backup id apply reported; empty means the newest."
			},
			force: {
				type: "boolean",
				description: "For apply: write even when a staged file changed on disk since staging. It never bypasses the Studio or unsaved-bridge gates. For restore: put the backup back even when the file changed after the apply."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Optix project ${String(args?.action ?? "check")}`,
			kind: /^(?:check|census|node|sources|diff)$/u.test(String(args?.action ?? "")) ? "read" : "write"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const action = String(args?.action ?? "").trim();
			const { project, root } = await resolveProjectFolder(args);
			const info = await projectInfo(project, root);
			const base = { action, project, project_root: info.root };
			if (action === "node") {
				const wanted = typeof args.path === "string" ? args.path.trim() : "";
				if (wanted === "") throw new Error("node needs path: a project path such as UI/MainWindow");
				return { ...base, node: await readNode(info, wanted) };
			}
			if (action === "sources") return { ...base, ...(await sources(info)), backups: await listBackups(info.root) };
			if (action === "diff") {
				const id = typeof args.backup_id === "string" ? args.backup_id.trim() : "";
				return { ...base, ...(await diffBackup(info, id)) };
			}
			const processes = await studioProcesses().catch(() => []);
			const bridgePending = settings.bridgeUrls.reduce((total, origin) => total + pendingModelChanges(origin).pending, 0);
			const gates = await projectGates(info, { bridgePending, processes });
			if (action === "check") {
				const validation = await validateProject(info, { typeCheck: knownProjectType });
				return {
					...base,
					validation,
					gates,
					next: validation.ok
						? gates.can_write
							? "The files are consistent and writable: stage the edits, then apply."
							: `The files are consistent, but a write is gated: ${gates.next}`
						: `Fix the ${validation.critical} critical finding${validation.critical === 1 ? "" : "s"} first: ${validation.findings.filter((finding) => finding.severity === "critical").slice(0, 3).map((finding) => finding.message).join("; ")}`
				};
			}
			if (action === "census") return { ...base, census: await census(info), gates };
			if (action === "stage") {
				allowWrite();
				if (!Array.isArray(args.ops) || args.ops.length === 0) throw new Error("stage needs ops: an ordered list of edits (see the parameter description)");
				if (args.ops.some((op) => op !== null && typeof op === "object" && op.op === "remove_node")) allowWrite(true);
				const staged = await stageOps(info, args.ops, { typeCheck: knownProjectType });
				return {
					...base,
					...staged,
					gates,
					next: gates.can_write ? staged.next : `Staged, but a write is gated: ${gates.next}`
				};
			}
			if (action === "apply") {
				allowWrite();
				const id = typeof args.stage_id === "string" ? args.stage_id.trim() : "";
				const manifest = await readStage(info.root, id);
				if (Array.isArray(manifest.ops) && manifest.ops.some((op) => op !== null && typeof op === "object" && op.op === "remove_node")) allowWrite(true);
				const applied = await applyStage(info, id, { bridgePending, processes, force: args.force === true, typeCheck: knownProjectType });
				return { ...base, ...applied };
			}
			if (action === "restore") {
				allowWrite();
				const id = typeof args.backup_id === "string" ? args.backup_id.trim() : "";
				const restored = await restoreBackup(info, id, { force: args.force === true, processes });
				return { ...base, ...restored };
			}
			throw new Error(`unknown action ${action || "(none)"}; use check, census, node, sources, stage, apply, diff or restore`);
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_build",
		description: "Compile a FactoryTalk Optix project's NetLogic C# outside Studio and report whether the runtime DLL is current. `status` reads bin/<Project>.dll against the newest .cs and the references file; `check` copies ProjectFiles/NetSolution to a scratch folder and runs dotnet build there, so a compile error is found without writing bin/ or obj/ into the project; `build` runs dotnet build in place, which is the only way outside Studio to produce the DLL the runtime loads (stop the emulator first, or the build fails because the DLL is locked); `references` rewrites <Project>.references from the installed Studio (a project without it cannot compile); `init` writes the csproj, sln and references a project copied or generated outside Studio does not have. None of this saves or builds the Studio project itself: that is still the engineer's Ctrl+S then Ctrl+Shift+B, and optix_status says when it is owed.",
		parameters: {
			action: {
				type: "string",
				required: true,
				description: "status | check | build | references | init"
			},
			project: {
				type: "string",
				description: "Project name as optix_status reports it. Give this or project_root."
			},
			project_root: {
				type: "string",
				description: "Folder that holds <Project>.optix."
			},
			force: {
				type: "boolean",
				description: "For references: rewrite a file whose paths already resolve. For init: rewrite an existing csproj and sln (existing .cs files are never touched)."
			},
			keep: {
				type: "boolean",
				description: "For check: keep the scratch folder and report its path, for reading a build log."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: `Optix build ${String(args?.action ?? "status")}`,
			kind: /^(?:status|check)$/u.test(String(args?.action ?? "")) ? "read" : "write"
		}),
		async execute(args, exec) {
			exec.signal.throwIfAborted();
			const action = String(args?.action ?? "").trim();
			const { project, root } = await resolveProjectFolder(args);
			const base = { action, project, project_root: root };
			if (action === "status") {
				let build;
				try {
					build = await buildState(root);
				} catch (error) {
					return {
						...base,
						build: null,
						error: error.message,
						next: "Run optix_build action init to write the csproj, sln and references this project is missing."
					};
				}
				return { ...base, build, next: build.next };
			}
			if (action === "check") {
				const checked = await checkBuild(root, { keep: args.keep === true });
				return { ...base, ...checked };
			}
			const info = await projectInfo(project, root);
			const processes = await studioProcesses().catch(() => []);
			const bridgePending = settings.bridgeUrls.reduce((total, origin) => total + pendingModelChanges(origin).pending, 0);
			const gates = await projectGates(info, { bridgePending, label: `build ${action}`, processes });
			if (action === "references") {
				allowWrite();
				if (!gates.can_write) throw new Error(`${gates.blockers[0].message} ${gates.blockers[0].next}`);
				const written = await writeReferences(root, { force: args.force === true });
				return { ...base, gates, references: written, ...(written.written ? { build_state: await buildState(root).catch(() => null) } : {}) };
			}
			if (action === "init") {
				allowWrite();
				if (!gates.can_write) throw new Error(`${gates.blockers[0].message} ${gates.blockers[0].next}`);
				const created = await initNetSolution(root, { dryRun: false, force: args.force === true });
				return { ...base, gates, ...created };
			}
			if (action === "build") {
				allowWrite();
				if (!gates.can_write) throw new Error(`${gates.blockers[0].message} ${gates.blockers[0].next}`);
				const built = await buildNetSolution(root, { timeoutMs: 240_000 });
				return {
					...base,
					gates,
					build: built,
					build_state: await buildState(root).catch(() => null),
					next: built.ok
						? "The runtime DLL is written. optix_emulator action start serves it; Studio still owns the project's own build."
						: built.locked
							? "A file is locked: stop the runtime with optix_emulator action stop, then build again."
							: "Fix the C# errors and build again; nothing in the project was saved by Studio."
				};
			}
			throw new Error(`unknown action ${action || "(none)"}; use status, check, build, references or init`);
		}
	})));
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_nav",
		description: `Plan, apply, reconcile or prove the window-level navigation bar of an Optix project, up to ${NAV_MAX_BUTTONS} buttons in one row. plan reads the start window, its PanelLoader and the screen each button should open, then reports the bar rectangle, every button's slot and whether it already exists; nothing is written. apply validates the whole batch and then creates the missing buttons, restates geometry and colours, and wires each new button through the loader's ChangePanel. A button drawn inside a panel resolves its loader path against the design tree at run time and the runtime then answers that nothing handles ChangePanel, which is the measured cause of a screen that never changes; a button beside the loader resolves the same way in both trees, and Rockwell's own PanelLoader sample wires a window-level button the same way. Only buttons with no handler child are wired, so a second apply is a no-op rather than a second handler. reconcile reports targets whose screen is missing, buttons that carry no handler and Nav_ buttons the window holds that this bar does not name. verify is the proof: it opens a headless browser at the window's own size, clicks each button in the served preview and reads the loader's Panel back through the bridge, so a pass means the panel changed rather than that an operation was acknowledged. apply needs allowWrites; verify needs preview and allowPreviewInput and a running emulator. The runtime serves the saved project, so a bridge-authored bar is only clickable after Studio saves and builds.`,
		parameters: {
			action: {
				type: "string",
				required: true,
				enum: ["plan", "apply", "reconcile", "verify"],
				description: "plan reads and reports; apply creates and wires behind the write gate; reconcile reports missing screens, unhandled buttons and stale bar entries; verify clicks each button in the running project and reads the loader's Panel back."
			},
			project: projectParameter,
			project_root: {
				type: "string",
				description: "Folder that holds <Project>.optix. verify probes the emulator for that project; the other actions read the live Studio model."
			},
			targets: {
				type: "array",
				items: { type: "json" },
				description: `Buttons in bar order: [{ label, screen, name }]. screen is a project path such as UI/Screens/Home, or a bare name resolved under screens_folder; name defaults to Nav_<screen name> and must be unique. At most ${NAV_MAX_BUTTONS}.`
			},
			screens_folder: {
				type: "string",
				description: "Folder a bare screen name resolves under. Default UI/Screens."
			},
			window: {
				type: "string",
				description: "Window project path. Default: the start window the presentation engine points at."
			},
			loader: {
				type: "string",
				description: "PanelLoader project path that hosts the screens. Default: the window's single PanelLoader."
			},
			theme: {
				type: "json",
				description: "Palette overrides for the bar: footer (button fill) and footerText (caption), as #RRGGBB."
			},
			settle_ms: {
				type: "integer",
				description: "verify: how long the runtime gets to repaint after each click before the panel is read. Default 900."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: args.action === "verify" ? "Prove Optix navigation" : args.action === "apply" ? "Wire Optix navigation" : "Plan Optix navigation",
			kind: args.action === "apply" || args.action === "verify" ? "edit" : "read"
		}),
		async execute(args, exec) {
			return exclusive(async () => {
				const action = typeof args.action === "string" ? args.action : "";
				const actions = ["plan", "apply", "reconcile", "verify"];
				if (!actions.includes(action)) throw new Error(`unknown action ${action || "(none)"}; use ${actions.join(", ")}`);
				const noLoader = "no PanelLoader in the window: a screen is not visible and a button cannot change it. Create one with optix_edit create_widget widget_type PanelLoader under the window, then plan again.";
				const origin = settings.bridgeUrls[0] ?? "";
				const { health: selectedHealth } = await bridge.select(args.project, exec.signal);
				// The window and the loader come from the live model: a bar drawn into a project that
				// renders a different window is the defect this tool exists to stop.
				const host = await liveScreenHost(origin, exec.signal);
				const windowPath = typeof args.window === "string" && args.window.trim() !== "" ? args.window.trim() : host.window ?? "";
				if (windowPath === "") throw new Error("no start window in the live model: name one with window, or read UI with optix_read to see what the presentation engine points at");
				const windowNodes = await bridge.request(origin, "nodes", exec.signal, { path: windowPath });
				const measure = (name) => {
					const property = (windowNodes?.properties ?? []).find((entry) => entry.name === name);
					const hit = /^(\d+(?:\.\d+)?)/u.exec(String(property?.value ?? ""));
					return hit === null ? void 0 : Math.round(Number(hit[1]));
				};
				const measuredWidth = measure("Width");
				const measuredHeight = measure("Height");
				const width = measuredWidth === void 0 ? host.width : measuredWidth;
				const height = measuredHeight === void 0 ? host.height : measuredHeight;
				if (width === void 0 || height === void 0) throw new Error(`could not read the canvas of ${windowPath}: its Width and Height properties were not reported, so a button slot cannot be placed`);
				const loader = typeof args.loader === "string" && args.loader.trim() !== "" ? args.loader.trim() : host.panel_loader ?? "";
				const children = (windowNodes?.children ?? []).map((entry) => String(entry.browse_name ?? ""));
				const screensFolder = typeof args.screens_folder === "string" && args.screens_folder.trim() !== "" ? args.screens_folder.trim() : "UI/Screens";
				const requested = Array.isArray(args.targets) ? args.targets : [];
				// Verify proves the bar that is there, so with no targets named it takes the window's own
				// Nav_* buttons: a proof that only checks what the caller already listed proves nothing.
				const resolvedTargets = requested.length > 0
					? navTargets({ targets: requested, screensFolder })
					: action === "verify"
						? children.filter((name) => name.startsWith("Nav_") && name.length > 4).map((name) => ({ name, label: name.slice(4), screen: `${screensFolder}/${name.slice(4)}` }))
						: navTargets({ targets: requested, screensFolder });
				if (action === "verify" && resolvedTargets.length === 0) throw new Error(`no Nav_* button in ${windowPath} to prove: name targets to verify, or run action plan to build a bar`);
				// Only a button with no handler child is wired: a second wire_event would leave the
				// button with two EventHandlers, and a second apply must be a no-op.
				const existing = [];
				const wired = new Set();
				const probes = new Map();
				for (const target of resolvedTargets) {
					if (!children.includes(target.name)) continue;
					existing.push(target.name);
					const probe = await bridge.request(origin, "nodes", exec.signal, { path: `${windowPath}/${target.name}` }).catch(() => void 0);
					probes.set(target.name, probe);
					if (handlerChild(probe?.children) !== void 0) wired.add(target.name);
				}
				const plan = planBar({ window: windowPath, width, height, targets: resolvedTargets, existing, theme: args.theme ?? {} });
				plan.buttons.forEach((button) => {
					button.wired = wired.has(button.name);
				});
				// Verify clicks where the model says the button is: a bar dragged after the plan was
				// written must not be clicked at the planned slot.
				for (const button of plan.buttons) {
					const probe = probes.get(button.name);
					if (probe !== void 0) button.slot = buttonSlot(probe, button.slot);
				}
				let ops = [];
				let wiring = [];
				if (loader !== "") {
					const planned = planOps(plan, { window: windowPath, loader, wired, theme: args.theme });
					ops = planned.ops;
					wiring = planned.wiring;
				}
				const base = {
					action,
					project: selectedHealth.project,
					window: windowPath,
					canvas: { width, height },
					bar: plan.bar,
					buttons: plan.buttons,
					...(loader === "" ? { problem: noLoader } : { loader })
				};
				const missingScreens = [];
				for (const target of resolvedTargets) {
					const probe = await bridge.request(origin, "nodes", exec.signal, { path: target.screen }).catch(() => void 0);
					if (probe?.path === void 0) missingScreens.push(target.screen);
				}
				const extras = children.filter((name) => name.startsWith("Nav_") && !plan.buttons.some((button) => button.name === name));
				const unwiredButtons = plan.buttons.filter((button) => !wired.has(button.name)).map((button) => button.name);
				if (action === "plan" || action === "reconcile") {
					const status = loader === "" ? "blocked" : missingScreens.length > 0 || wiring.length > 0 ? "planned" : "ready";
					const next = loader === "" ? noLoader : missingScreens.length > 0 ? `These screens do not exist yet: ${missingScreens.join(", ")}. A button cannot be wired to a node that is not there, so create them, then plan again.` : wiring.length > 0 ? `Run action apply with allowWrites: ${wiring.length} button(s) need ChangePanel wiring${extras.length === 0 ? "" : `, and the window holds ${extras.length} button(s) this bar does not name (${extras.join(", ")})`}.` : "Every button exists and carries a handler; nothing to write. Save and Build in Studio, start the emulator, then run action verify - a wired handler is not proof until a click is observed.";
					return {
						status,
						...base,
						wired: [...wired],
						missing_screens: missingScreens,
						unwired_buttons: unwiredButtons,
						extra_buttons: extras,
						op_count: ops.length,
						pending_wiring: wiring,
						next
					};
				}
				if (action === "apply") {
					if (loader === "") return {
						status: "blocked",
						...base,
						next: noLoader
					};
					if (ops.length === 0) return {
						status: "noop",
						...base,
						wired: [...wired],
						applied: 0,
						next: "Every button already exists and carries a handler: nothing to write. Run action verify for the proof."
					};
					allowWrite();
					const validation = await bridge.request(origin, "validate_ops", exec.signal, {}, "POST", {
						ops,
						strict: true
					});
					if (!acceptedValidation(validation, ops.length)) return {
						status: "refused",
						applied: 0,
						...base,
						wired: [...wired],
						validation,
						next: "The bridge refused the batch before anything was written: read validation for the operation it would not resolve, then plan again."
					};
					const results = [];
					for (const [index, op] of ops.entries()) {
						let dispatched = false;
						try {
							const health = await bridge.request(origin, "health", exec.signal);
							if (health.project !== selectedHealth.project || health.model_loaded !== true || health.pid !== selectedHealth.pid || health.project_path !== selectedHealth.project_path) throw new Error("Serving Studio project changed during the batch");
							const request = operationRequest(op);
							dispatched = true;
							const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
							if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the authoring operation", true);
							results.push(result);
						} catch (error) {
							return {
								status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
								applied: results.length,
								failed_index: index,
								...base,
								validation,
								results,
								error: String(error),
								next: "Inspect the live model before retrying: the bar may hold some buttons and not others, so plan again and apply only what is missing."
							};
						}
					}
					// The runtime resolves the pointer's absolute design-time NodeId before the relative
					// link this batch wrote, so clearing it is part of wiring, not an optional cleanup.
					const pointerClearing = await clearPointerValues(origin, ops, exec.signal);
					return {
						status: "completed",
						applied: results.length,
						...base,
						wired: [...wired, ...wiring.map((op) => op.path.split("/").filter((segment) => segment !== "").at(-1) ?? "")],
						validation,
						results,
						...(pointerClearing.cleared === 0 ? {} : { pointer_values_cleared: pointerClearing.cleared }),
						...(pointerClearing.failed.length === 0 ? {} : { pointer_values_uncleared: pointerClearing.failed }),
						next: "Save the project in Studio (Ctrl+S) and Build it (Ctrl+Shift+B), then run optix_emulator action restart and optix_nav action verify. The bridge authored the model; only Studio writes the file the runtime loads."
					};
				}
				if (!settings.preview) throw new Error("The navigation proof opens the served preview: set preview true in the Optix row's plugin configuration");
				if (!settings.allowPreviewInput) throw new Error("Clicking a button in the running project is input: set allowPreviewInput true in the Optix row's plugin configuration");
				if (loader === "") return {
					status: "blocked",
					...base,
					next: noLoader
				};
				const folder = await resolveProjectFolder(args);
				const leg = await emulatorStatus({ project: folder.root, previewUrl: settings.previewUrl }, exec.signal);
				const emulator = {
					url: leg.url,
					serving: leg.serving,
					status: leg.status,
					...(leg.log_path === "" ? {} : { log_path: leg.log_path })
				};
				if (!leg.serving) return {
					status: "blocked",
					...base,
					emulator,
					...(leg.log_tail === void 0 ? {} : { log_tail: leg.log_tail }),
					next: "The preview address does not answer, so there is nothing to click: save and build the project in Studio, run optix_emulator action start (or restart), then verify again."
				};
				const panel = async () => panelProperty(await bridge.request(origin, "nodes", exec.signal, { path: loader }));
				const initialPanel = await panel();
				const { browser, page } = await launchRuntimePage(settings, {
					width,
					height,
					signal: exec.signal
				});
				let proof;
				try {
					proof = await verifyNavigation({
						page,
						buttons: plan.buttons,
						panel,
						settleMs: args.settle_ms === void 0 ? 900 : args.settle_ms,
						signal: exec.signal
					});
				} finally {
					await browser.close().catch(() => {});
				}
				return {
					status: proof.status,
					...base,
					emulator,
					initial_panel: initialPanel,
					...(initialPanel === "" ? { panel_unreadable: "the bridge did not report the loader's Panel value, so a repaint is the only evidence available" } : {}),
					results: proof.rows,
					clicked: proof.clicked,
					proven: proof.proven,
					unverified: proof.unverified,
					next: verifyNext(proof)
				};
			});
		}
	})));
	/**
	 * The design-language channel: list the languages the kit authors, project one onto a native
	 * `StyleSheet` and bind the presentation engines, or audit what the model actually carries.
	 *
	 * Every pointer write goes on the pointer node's `Value` child and is read back before the answer
	 * claims it landed: on bridge 1.0.9 the engine's own `StyleSheet` property answers `ok` while the
	 * engine keeps the sheet it already had. A theme is also the one part of a screen the runtime reads
	 * before it draws anything, so a wrong sheet is not a cosmetic defect - it is the whole palette.
	 */
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_ui",
		description: `Design languages for Optix screens, and the kit that draws them: ${languageNames.join(", ")}. action languages lists what the theme can author (default ${DEFAULT_LANGUAGE}); action theme plans or applies a language as a native StyleSheet and binds both presentation engines; action audit judges what the model reports against the language that was asked for; action components lists the kit's components and the grid; action shell draws the window chrome - a header band, a native navigation rail with one item per screen, the content host and the status strip - around the screens; action screen compiles a blueprint into a designed screen - header band with chips, clock, language and user, KPI tiles, cards with rows, lamps and progress bars, a bar chart, a message feed and a status strip - placed by a 12-column grid, never by guessed coordinates, and refuses what cannot fit. A NodeId pointer is written on the pointer's own Value child and read back, because the engine's StyleSheet property accepts a write and keeps the old sheet. Nothing is written until mode apply behind allowWrites.`,
		parameters: {
			project: {
				type: "string",
				description: "Exact loaded project BrowseName from optix_status. Required for theme and audit."
			},
			action: {
				type: "string",
				required: true,
				description: "languages lists the catalogue; theme plans or applies one; audit judges the model; components lists the kit and the vendor adapters; shell draws the window chrome and its navigation rail; screen compiles a blueprint into a designed screen; dialog writes a confirm/message/faceplate type and can wire a button that opens it; assets writes the authored icons and process drawings into ProjectFiles/imgs.",
				enum: ["languages", "theme", "audit", "components", "shell", "screen", "dialog", "assets", "review"]
			},
			mode: {
				type: "string",
				description: "theme and screen: plan (default) reports the operations without writing; apply writes behind allowWrites.",
				enum: ["plan", "apply"]
			},
			language: {
				type: "string",
				description: `Design language; default ${DEFAULT_LANGUAGE}. One of ${languageNames.join(", ")}.`
			},
			pattern: {
				type: "string",
				description: `screen: the layout pattern; default overview. One of ${PATTERNS.join(", ")}.`,
				enum: [...PATTERNS]
			},
			blueprint: {
				type: "json",
				description: "screen: the screen description {name, title, subtitle, pattern, header{chips,clock,language,user,bell}, kpis[], cards[{title,rows[]}], chart{title,values,labels,unit,threshold}, messages[], status{text,ok}}. Components are placed by the layout grid, not by coordinates."
			},
			screen: {
				type: "string",
				description: "screen: project path of the screen to draw into, such as UI/Screens/Home. Default UI/Screens/<blueprint.name>."
			},
			width: {
				type: "integer",
				description: "screen: canvas width in pixels; default the start window's own width from the live model."
			},
			height: {
				type: "integer",
				description: "screen: canvas height in pixels; default the start window's own height."
			},
			chrome: {
				type: "string",
				description: "screen: screen draws the header and status bands inside the screen (default); none leaves them to the window shell.",
				enum: ["screen", "none"]
			},
			sheet: {
				type: "string",
				description: "StyleSheet node name; default Sheet_<language>. Reuse an existing sheet by naming it."
			},
			sheet_path: {
				type: "string",
				description: "Project path of the sheet; default UI/<sheet>. audit needs it when no sheet is named."
			},
			engines: {
				type: "array",
				items: { type: "json" },
				description: `Presentation engine paths to bind; default both ${THEME_ENGINES.join(" and ")}.`
			},
			screens: {
				type: "array",
				items: { type: "json" },
				description: "shell: the rail's screens as [{screen, title}], such as [{screen: \"UI/Screens/Home\", title: \"Home\"}]; default every Screen under UI/Screens that the model reports."
			},
			loader: {
				type: "string",
				description: "shell: project path of an existing PanelLoader to host the screens; default creates UI/MainWindow/ShellContent."
			},
			rail_width: {
				type: "integer",
				description: `shell: rail width in pixels, ${160} to ${280}; default ${RAIL_WIDTH}.`
			},
			kind: {
				type: "string",
				description: `dialog: the dialog shape; default confirm. One of ${DIALOG_KINDS.join(", ")}.`,
				enum: [...DIALOG_KINDS]
			},
			name: {
				type: "string",
				description: "dialog: the object type name an operator opens, such as ConfirmDelete."
			},
			title: {
				type: "string",
				description: "dialog: the heading shown at the top of the dialog."
			},
			message: {
				type: "string",
				description: "dialog: the sentence inside the dialog, such as the consequence of the destructive command."
			},
			confirm_label: {
				type: "string",
				description: "dialog: the confirm button's text; default Confirm (a message dialog closes with Close unless this is named)."
			},
			cancel_label: {
				type: "string",
				description: "dialog: the cancel button's text; default Cancel."
			},
			destructive: {
				type: "boolean",
				description: "dialog: mark the confirm button as destructive so the design review expects it before a delete."
			},
			parent: {
				type: "string",
				description: "dialog: the folder the dialog type lives in; default UI/Dialogs, created when missing."
			},
			trigger_screen: {
				type: "string",
				description: "dialog: a screen that gets a button opening this dialog, such as UI/Screens/Alarms."
			},
			trigger_name: {
				type: "string",
				description: "dialog: the name of that button, such as BtnDeleteRecipe."
			},
			only: {
				type: "array",
				items: { type: "string" },
				description: "assets: the icon or drawing names to write, such as [\"home\", \"alarms\"]; default the whole set."
			}
		},
		output: jsonOutput,
		presentCall: (args) => ({
			card: "generic",
			title: args.action === "audit" ? "Audit an Optix design language" : args.action === "review" ? "Grade an Optix screen" : args.action === "dialog" ? (args.mode === "apply" ? "Write an Optix dialog" : "Plan an Optix dialog") : args.action === "shell" ? (args.mode === "apply" ? "Draw the Optix window shell" : "Plan the Optix window shell") : args.action === "screen" ? (args.mode === "apply" ? "Draw a designed Optix screen" : "Plan a designed Optix screen") : args.action === "components" ? "The Optix UI kit" : args.action === "assets" ? (args.mode === "apply" ? "Write Optix artwork" : "Plan Optix artwork") : args.action === "theme" && args.mode === "apply" ? "Apply an Optix design language" : "Optix design languages",
			kind: (args.action === "theme" || args.action === "screen" || args.action === "shell" || args.action === "dialog" || args.action === "assets") && args.mode === "apply" ? "edit" : "read"
		}),
		async execute(args, exec) {
			return exclusive(async () => {
				const action = typeof args.action === "string" ? args.action : "";
				const actions = ["languages", "theme", "audit", "components", "shell", "screen", "dialog", "assets", "review"];
				const kidsOf = (value) => value?.map?.children ?? value?.children ?? [];
				const childName = (entry) => String(entry?.browse_name ?? entry?.name ?? "");
				if (!actions.includes(action)) throw new Error(`unknown action ${action || "(none)"}; use ${actions.join(", ")}`);
				if (action === "languages") return {
					languages: languageCatalogue(),
					default: DEFAULT_LANGUAGE,
					next: "Pick a language and run action theme with mode plan: the plan names the sheet node, every token and every named style before anything is written."
				};
				if (action === "components") {
					const picked = typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE;
					return {
						action,
						...kitCatalogue(picked),
						adapters: adapterCatalogue(),
						rubric: rubricCatalogue(),
						next: "Describe the screen as a blueprint and run action screen with mode plan: the plan names every component and its slot before anything is written. A vendor component (adapters[].kind) needs its library item imported first, and type_path names the imported type. Action review grades a screen against rubric.rules after it exists."
					};
				}
				if (action === "assets") {
					const folder = await resolveProjectFolder(args);
					const write = args.mode === "apply";
					if (write) allowWrite();
					const only = Array.isArray(args.only) && args.only.length > 0 ? args.only.map((name) => String(name).trim()).filter((name) => name !== "") : void 0;
					const written = await writeAssets(folder.root, { only, dryRun: !write });
					return {
						action,
						mode: write ? "apply" : "plan",
						project: folder.project,
						...written,
						next: write
							? `Start the runtime with optix_emulator action start; an Image's Path is %PROJECTDIR%/imgs/<name>.svg and the Web Presentation Engine serves ${written.dir_relative}.`
							: "Run the same call with mode apply to write these files into ProjectFiles/imgs, or name only: [\"home\", \"alarms\"] for a subset."
					};
				}
				if (typeof args.project !== "string" || args.project.trim() === "") throw new Error("theme and audit read the live model: give project (the project name optix_status reports)");
				const origin = settings.bridgeUrls[0] ?? "";
				const { health: selectedHealth } = await bridge.select(args.project, exec.signal);
				if (action === "review") {
					const screenPath = typeof args.screen === "string" && args.screen.trim() !== "" ? args.screen.trim() : "";
					if (screenPath === "") throw new Error("review needs screen: a project path such as UI/Screens/Home");
					const host = await liveScreenHost(origin, exec.signal);
					const measure = (value) => {
						const parsed = Number.parseFloat(String(value ?? ""));
						return Number.isFinite(parsed) ? Math.round(parsed) : 0;
					};
					const canvas = { width: measure(host.width), height: measure(host.height) };
					const reply = await bridge.request(origin, "map", exec.signal, { path: screenPath, depth: "6", max: String(settings.maxMapNodes), mode: "detail" });
					const pickedLanguage = typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE;
					const screen = describeScreen(reply);
					// `map` reports the tree but not the property values, and every rule in the rubric is geometry or a
					// font size, so each node is read once through `nodes` and its values merged in. Bounded so a huge
					// screen cannot turn a review into a crawl.
					const hydrate = async (descriptor, base) => {
						const rootName = descriptor.nodes[0]?.name ?? "";
						const projectPath = (node) => (node.path === rootName ? base : `${base}${node.path.slice(rootName.length)}`);
						const wanted = descriptor.nodes.filter((node) => node !== descriptor.nodes[0]).slice(0, 400);
						for (let index = 0; index < wanted.length; index += 8) {
							await Promise.all(wanted.slice(index, index + 8).map(async (node) => {
								const detail = await bridge.request(origin, "nodes", exec.signal, { path: projectPath(node) }).catch(() => void 0);
								const values = new Map((detail?.properties ?? []).map((entry) => [String(entry.name ?? ""), String(entry.value ?? "")]));
								const read = (key) => {
									const parsed = Number.parseFloat(values.get(key) ?? "");
									return Number.isFinite(parsed) ? parsed : null;
								};
								node.left = read("LeftMargin") ?? node.left;
								node.top = read("TopMargin") ?? node.top;
								node.width = read("Width") ?? node.width;
								node.height = read("Height") ?? node.height;
								node.font_size = read("FontSize") ?? node.font_size;
							}));
						}
						return descriptor;
					};
					await hydrate(screen, screenPath);
					const engineRefs = {};
					for (const engine of THEME_ENGINES) {
						const engineMap = await bridge.request(origin, "map", exec.signal, { path: engine, depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
						const pointer = kidsOf(engineMap).find((entry) => childName(entry) === "StyleSheet");
						engineRefs[engine] = typeof pointer?.ref === "string" ? pointer.ref : "";
					}
					const windowMap = await bridge.request(origin, "map", exec.signal, { path: host.window, depth: "3", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
					const windowScreen = windowMap === void 0 ? void 0 : describeScreen(windowMap);
					const siblings = [];
					const siblingsReply = await bridge.request(origin, "map", exec.signal, { path: "UI/Screens", depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
					for (const entry of kidsOf(siblingsReply)) {
						const name = childName(entry);
						const path = `UI/Screens/${name}`;
						if (name === "" || path === screenPath || siblings.length >= 3) continue;
						const siblingMap = await bridge.request(origin, "map", exec.signal, { path, depth: "4", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
						if (siblingMap !== void 0) siblings.push(describeScreen(siblingMap));
					}
					if (windowScreen !== void 0) await hydrate(windowScreen, host.window);
					const reviewed = scoreScreen({ screen, window: windowScreen, language: pickedLanguage, canvas, engine_refs: engineRefs, siblings: screenPath === host.window ? [] : siblings });
					return {
						status: "reviewed",
						action,
						project: selectedHealth.project,
						screen: screenPath,
						canvas,
						nodes: screen.nodes.length,
						...reviewed,
						next: reviewed.grade === "professional"
							? "The design holds up on the model. Save and Build, then prove the parts the rubric cannot: run optix_nav verify for the navigation and click a destructive command for its dialog."
							: `Repair the must_fix list, then run review again: ${reviewed.must_fix.length} critical finding(s) and a score of ${reviewed.score} put this screen at ${reviewed.grade}.`
					};
				}
				if (action === "screen") {
					const mode = args.mode === "apply" ? "apply" : "plan";
					const blueprint = args.blueprint;
					if (blueprint === null || typeof blueprint !== "object" || Array.isArray(blueprint)) throw new Error("screen needs blueprint: the screen description {name, title, pattern, header, kpis, cards, chart, messages, status}");
					const host = await liveScreenHost(origin, exec.signal);
					const blueprintName = typeof blueprint.name === "string" ? blueprint.name.trim() : "";
					const screenPath = (typeof args.screen === "string" && args.screen.trim() !== "" ? args.screen.trim() : blueprintName === "" ? "" : `UI/Screens/${blueprintName}`).replace(/\/+$/u, "");
					if (screenPath === "") throw new Error("screen needs screen (a project path such as UI/Screens/Home) or blueprint.name");
					const target = await bridge.request(origin, "map", exec.signal, { path: screenPath, depth: "0", mode: "detail" }).catch(() => void 0);
					if (target === void 0) throw new Error(`no screen at ${screenPath}: create and mount it with optix_screen first, then compile the blueprint into it`);
					const width = Number.isInteger(args.width) && args.width > 0 ? args.width : host.width;
					const height = Number.isInteger(args.height) && args.height > 0 ? args.height : host.height;
					if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error(`the start window's own canvas could not be read: give width and height (the screen is ${screenPath})`);
					const pickedLanguage = typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE;
					const planned = compileBlueprint(
						{ ...blueprint, pattern: typeof args.pattern === "string" && args.pattern.trim() !== "" ? args.pattern.trim() : blueprint.pattern },
						{ screen: screenPath, width, height, language: pickedLanguage, chrome: args.chrome === "none" ? "none" : "screen" }
					);
					const validate = async (ops) => bridge.request(origin, "validate_ops", exec.signal, {}, "POST", { ops, strict: true });
					const accepted = (validation) => validation?.ok === true && (validation.errors ?? []).length === 0;
					const validation = await validate(planned.ops);
					const valid = accepted(validation);
					const base = {
						action,
						mode,
						project: selectedHealth.project,
						screen: screenPath,
						pattern: planned.layout.pattern,
						language: planned.theme.name,
						layout: planned.layout,
						counts: planned.counts,
						op_count: planned.ops.length
					};
					if (mode === "plan") return {
						status: valid ? "planned" : "refused",
						...base,
						validation,
						next: valid
							? "Run action screen with mode apply and allowWrites: the same operations write the screen, then Save and Build in Studio before the runtime draws them."
							: "The bridge refused the blueprint before anything was written: read validation for the component whose slot or property it would not resolve."
					};
					if (!valid) return { status: "refused", ...base, validation, next: "Nothing was written. Fix what validation names, then plan again." };
					allowWrite();
					const results = [];
					for (const [index, op] of planned.ops.entries()) {
						let dispatched = false;
						try {
							const now = await bridge.request(origin, "health", exec.signal);
							if (now.project !== selectedHealth.project || now.model_loaded !== true || now.pid !== selectedHealth.pid) throw new Error("Serving Studio project changed during the screen batch");
							const request = operationRequest(op);
							dispatched = true;
							const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
							if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge a screen operation", true);
							results.push(result);
						} catch (error) {
							return {
								status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
								...base,
								applied: results.length,
								failed_index: index,
								error: String(error),
								next: "Inspect the screen before retrying: a half-applied screen still renders, so plan again and apply only what is missing."
							};
						}
					}
					return {
						status: "applied",
						...base,
						applied: results.length,
						next: "Save the project in Studio (Ctrl+S) and Build it (Ctrl+Shift+B), then restart the emulator: the runtime draws the saved screen with the project's style sheet."
					};
				}
				if (action === "shell") {
					const mode = args.mode === "apply" ? "apply" : "plan";
					const host = await liveScreenHost(origin, exec.signal);
					const screensReply = await bridge.request(origin, "nodes", exec.signal, { path: "UI/Screens" }).catch(() => void 0);
					const screenChildren = screensReply?.children ?? screensReply?.nodes ?? [];
					const fromModel = screenChildren
						.filter((child) => typeof child === "object" && child !== null && /screen/iu.test(String(child.dotnet_type ?? child.type ?? "")))
						.map((child) => String(child.browse_name ?? child.name ?? ""))
						.filter((name) => name !== "")
						.map((name) => ({ name, screen: `UI/Screens/${name}`, title: name }));
					const asked = Array.isArray(args.screens)
						? args.screens.map((entry) => {
							const value = typeof entry === "string" ? { screen: entry } : entry;
							const screenPath = String(value?.screen ?? "");
							return screenPath === "" ? void 0 : { screen: screenPath, title: typeof value?.title === "string" && value.title.trim() !== "" ? value.title.trim() : screenPath.split("/").at(-1) };
						}).filter(Boolean)
						: [];
					const targets = asked.length > 0 ? asked : fromModel;
					const windowMap = await bridge.request(origin, "nodes", exec.signal, { path: host.window }).catch(() => void 0);
					const windowChildren = (windowMap?.children ?? windowMap?.nodes ?? []).map((child) => String(child.browse_name ?? child.name ?? ""));
					// A second apply must not recreate the rail items the first one left behind.
					const railPanels = await bridge.request(origin, "nodes", exec.signal, { path: `${host.window}/${SHELL_NAMES.rail}/Panels` }).catch(() => void 0);
					const existingItems = (railPanels?.children ?? railPanels?.nodes ?? []).map((child) => String(child.browse_name ?? child.name ?? ""));
					const planned = shellPlan({
						window: host.window,
						width: host.width,
						height: host.height,
						language: typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE,
						screens: targets,
						loader: typeof args.loader === "string" ? args.loader.trim() : "",
						railWidth: Number.isInteger(args.rail_width) && args.rail_width > 0 ? args.rail_width : RAIL_WIDTH,
						existing: windowChildren,
						existingItems
					});
					const validate = async (ops) => bridge.request(origin, "validate_ops", exec.signal, {}, "POST", { ops, strict: true });
					const accepted = (validation) => validation?.ok === true && (validation.errors ?? []).length === 0;
					// Phased like the theme: Studio creates the rail's Panels collection with the panel, so
					// items and pointer writes validate only against the model the chrome phase leaves behind.
					const chromeValidation = await validate(planned.phases[0].ops);
					const valid = accepted(chromeValidation);
					const base = {
						action,
						mode,
						project: selectedHealth.project,
						language: planned.language,
						window: planned.window,
						canvas: { width: planned.width, height: planned.height },
						layout: { header: planned.header, rail: planned.rail, content: planned.content, footer: planned.footer },
						screens: planned.items,
						loader: planned.loader,
						counts: planned.counts,
						op_count: planned.ops.length,
						phases: planned.phases.map((phase) => ({ name: phase.name, ops: phase.ops.length, validated: phase.name === "chrome" ? valid : false }))
					};
					if (mode === "plan") return {
						status: valid ? "planned" : "refused",
						...base,
						validation: chromeValidation,
						next: valid
							? "Run action shell with mode apply and allowWrites: it draws the chrome, then the rail items, then the pointers, validating each phase against the model the previous one left. Save and Build in Studio before the runtime draws it."
							: "The bridge refused the shell chrome before anything was written: read validation for the band it would not resolve."
					};
					if (!valid) return { status: "refused", ...base, validation: chromeValidation, next: "Nothing was written. Fix what validation names, then plan again." };
					allowWrite();
					const results = [];
					const report = [];
					for (const phase of planned.phases) {
						if (phase.ops.length === 0) {
							report.push({ name: phase.name, ops: 0, status: "skipped" });
							continue;
						}
						const phaseValidation = phase.name === "chrome" ? chromeValidation : await validate(phase.ops);
						if (!accepted(phaseValidation)) return {
							status: "refused_phase",
							...base,
							phase: phase.name,
							applied: results.length,
							validation: phaseValidation,
							phases: report,
							next: `The ${phase.name} phase was refused before anything in it was written. The earlier phases are on the model; plan again - a second apply restates what is missing.`
						};
						for (const [index, op] of phase.ops.entries()) {
							let dispatched = false;
							try {
								const now = await bridge.request(origin, "health", exec.signal);
								if (now.project !== selectedHealth.project || now.model_loaded !== true || now.pid !== selectedHealth.pid) throw new Error("Serving Studio project changed during the shell batch");
								const request = operationRequest(op);
								dispatched = true;
								const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
								if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge a shell operation", true);
								results.push(result);
							} catch (error) {
								return {
									status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
									...base,
									phase: phase.name,
									applied: results.length,
									failed_index: index,
									phases: report,
									error: String(error),
									next: "Inspect the window before retrying: a half-applied shell still draws, so plan again and apply only what is missing - the plan skips a band that already exists."
								};
							}
						}
						report.push({ name: phase.name, ops: phase.ops.length, status: "applied" });
					}
					return {
						status: "applied",
						...base,
						applied: results.length,
						phases: report,
						next: "Save the project in Studio (Ctrl+S) and Build it (Ctrl+Shift+B), then restart the emulator. The rail switches the loader through ChangePanel; a tab that compiles is not a tab that works until a click is seen in the runtime."
					};
				}
				if (action === "dialog") {
					const mode = args.mode === "apply" ? "apply" : "plan";
					const folder = typeof args.parent === "string" && args.parent.trim() !== "" ? args.parent.trim().replace(/\/+$/u, "") : "UI/Dialogs";
					const identifier = typeof args.name === "string" ? args.name.trim() : "";
					const kind = typeof args.kind === "string" && args.kind.trim() !== "" ? args.kind.trim() : "confirm";
					const triggerScreen = typeof args.trigger_screen === "string" ? args.trigger_screen.trim() : "";
					const triggerName = typeof args.trigger_name === "string" ? args.trigger_name.trim() : "";
					// Three reads, because the plan must not recreate what the earlier apply left behind.
					const folderReply = await bridge.request(origin, "nodes", exec.signal, { path: folder }).catch(() => void 0);
					const typeReply = identifier === "" ? void 0 : await bridge.request(origin, "nodes", exec.signal, { path: `${folder}/${identifier}` }).catch(() => void 0);
					const triggerReply = triggerScreen !== "" && triggerName !== ""
						? await bridge.request(origin, "nodes", exec.signal, { path: `${triggerScreen}/${triggerName}` }).catch(() => void 0)
						: void 0;
					const planned = dialogPlan({
						name: identifier,
						kind,
						parent: folder,
						title: typeof args.title === "string" ? args.title : "",
						message: typeof args.message === "string" ? args.message : "",
						confirmLabel: typeof args.confirm_label === "string" && args.confirm_label.trim() !== "" ? args.confirm_label.trim() : undefined,
						cancelLabel: typeof args.cancel_label === "string" && args.cancel_label.trim() !== "" ? args.cancel_label.trim() : undefined,
						destructive: args.destructive === true,
						triggerScreen,
						triggerName,
						project: selectedHealth.project,
						// The canvas is the screen the trigger sits on, not the window: a trigger placed past the
						// screen's own height is clipped away in the runtime, so a caller-supplied height wins.
						canvas: { height: Number(args.canvas?.height) || Number.parseFloat(String((await liveScreenHost(origin, exec.signal)).height ?? "")) || 720 },
						width: Number.isInteger(args.width) && args.width > 0 ? args.width : undefined,
						height: Number.isInteger(args.height) && args.height > 0 ? args.height : undefined,
						language: typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE,
						folderExists: Boolean(folderReply),
						typeExists: Boolean(typeReply),
						existingChildren: (typeReply?.children ?? []).map((child) => String(child.browse_name ?? child.name ?? "")),
						triggerExists: Boolean(triggerReply)
					});
					const validate = async (ops) => bridge.request(origin, "validate_ops", exec.signal, {}, "POST", { ops, strict: true });
					const accepted = (validation) => validation?.ok === true && (validation.errors ?? []).length === 0;
					// The folder (and the type after it) has to exist before its children validate, so the
					// first phase is the only one a plan can prove against the model as it stands.
					const first = planned.phases[0];
					const firstValidation = await validate(first.ops);
					const base = {
						action,
						mode,
						project: selectedHealth.project,
						dialog: planned.path,
						kind: planned.kind,
						title: planned.title,
						message: planned.message,
						buttons: planned.buttons.map((button) => ({ name: button.name, label: button.label })),
						exists: planned.exists,
						counts: planned.counts,
						op_count: planned.ops.length,
						phases: planned.phases.map((phase) => ({ name: phase.name, ops: phase.ops.length, validated: phase === first ? accepted(firstValidation) : false }))
					};
					if (mode === "plan") return {
						status: accepted(firstValidation) ? "planned" : "refused",
						...base,
						validation: firstValidation,
						next: accepted(firstValidation)
							? "Run the same call with mode apply: it creates the folder and the dialog type, then fills it, then wires the buttons that close it (and the trigger that opens it), validating each phase against the model the previous one left."
							: "The bridge refused the first phase before anything was written: read validation for the folder it would not create."
					};
					allowWrite();
					const results = [];
					const report = [];
					for (const phase of planned.phases) {
						if (phase.ops.length === 0) {
							report.push({ name: phase.name, ops: 0, status: "skipped" });
							continue;
						}
						const phaseValidation = phase === first ? firstValidation : await validate(phase.ops);
						if (!accepted(phaseValidation)) return {
							status: "refused_phase",
							...base,
							phase: phase.name,
							applied: results.length,
							validation: phaseValidation,
							phases: report,
							next: `The ${phase.name} phase was refused before anything in it was written. The earlier phases are on the model; plan again - a second apply restates what is missing.`
						};
						for (const [index, op] of phase.ops.entries()) {
							let dispatched = false;
							try {
								const now = await bridge.request(origin, "health", exec.signal);
								if (now.project !== selectedHealth.project || now.model_loaded !== true || now.pid !== selectedHealth.pid) throw new Error("Serving Studio project changed during the dialog batch");
								const request = operationRequest(op);
								dispatched = true;
								const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
								if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge a dialog operation", true);
								results.push(result);
							} catch (error) {
								return {
									status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
									...base,
									phase: phase.name,
									applied: results.length,
									failed_index: index,
									phases: report,
									error: String(error),
									next: "Inspect the dialog node before retrying: a half-applied dialog still exists as a type, so plan again and apply only what is missing."
								};
							}
						}
						report.push({ name: phase.name, ops: phase.ops.length, status: "applied" });
					}
					return {
						status: "applied",
						...base,
						applied: results.length,
						phases: report,
						next: "Save and Build in Studio, then click the trigger (or open the dialog from a NetLogic). A dialog whose buttons close it is still a dialog nobody saw until a click in the runtime shows it."
					};
				}
				const childrenOf = (reply) => reply?.map?.children ?? reply?.children ?? [];
				const nameOf = (entry) => String(entry?.browse_name ?? entry?.name ?? "");
				const language = typeof args.language === "string" && args.language.trim() !== "" ? args.language.trim() : DEFAULT_LANGUAGE;
				const sheetName = typeof args.sheet === "string" && args.sheet.trim() !== "" ? args.sheet.trim() : `Sheet_${language}`;
				const sheetPath = typeof args.sheet_path === "string" && args.sheet_path.trim() !== "" ? args.sheet_path.trim() : `UI/${sheetName}`;
				const engines = Array.isArray(args.engines) && args.engines.length > 0
					? args.engines.map((entry) => String(typeof entry === "object" && entry !== null ? entry.path ?? "" : entry)).filter((entry) => entry !== "")
					: [...THEME_ENGINES];
				const ui = await bridge.request(origin, "map", exec.signal, { path: "UI", depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
				const uiChildren = childrenOf(ui).map(nameOf);
				const readEngineRefs = async () => {
					const refs = {};
					for (const engine of engines) {
						const engineMap = await bridge.request(origin, "map", exec.signal, { path: engine, depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
						const pointer = kidsOf(engineMap).find((entry) => childName(entry) === "StyleSheet");
						refs[engine] = typeof pointer?.ref === "string" ? pointer.ref : "";
					}
					return refs;
				};
				const engineRefs = await readEngineRefs();
				const exists = uiChildren.includes(sheetName) || Object.values(engineRefs).includes(sheetPath);
				// A sheet that already exists keeps whichever named styles an earlier apply wrote: read them so the
				// second apply restates tokens instead of re-creating nodes (which the bridge refuses as already_exists).
				const existingStyles = [];
				if (exists) {
					const probe = themePlan({ language, sheet: sheetName, project: selectedHealth.project, sheetPath, exists, engines });
					for (const collection of [...new Set(probe.styles.map((style) => style.collection))]) {
						const reply = await bridge.request(origin, "nodes", exec.signal, { path: `${sheetPath}/${collection}` }).catch(() => void 0);
						for (const child of reply?.children ?? []) existingStyles.push(`${sheetPath}/${collection}/${String(child.browse_name ?? child.name ?? "")}`);
					}
				}
				const plan = themePlan({ language, sheet: sheetName, project: selectedHealth.project, sheetPath, exists, existing: existingStyles, engines });
				// A project that already points its engines at a sheet the bridge did not write (a Studio or vendor
				// stylesheet, e.g. FriendlyLight) renders that sheet correctly while a bridge-written one is rejected
				// by the runtime at first paint. Rebinding it silently would paint the project blank, so a binding is
				// only rewritten when the caller names the sheet or when the engines already read the generated one.
				const foreignBinding = Object.values(engineRefs).filter((ref) => typeof ref === "string" && ref !== "" && !ref.endsWith(`/${sheetName}`) && ref !== sheetPath);
				const keepBinding = args.sheet === void 0 && foreignBinding.length > 0;
				if (keepBinding) plan.pointer_ops = [];
				const styleNames = plan.styles.map((style) => style.path);
				const base = {
					action,
					language: plan.language,
					sheet: plan.sheet,
					sheet_path: plan.sheet_path,
					pointer: plan.pointer,
					exists,
					engine_refs: engineRefs,
					kept_binding: keepBinding,
					engine_refs_foreign: foreignBinding,
					token_count: Object.keys(plan.tokens).length,
					styles: styleNames
				};
				if (action === "theme") {
					const mode = args.mode === "apply" ? "apply" : "plan";
					// Two phases, because Studio creates a sheet's 17 style collections when the sheet
					// object appears - a batch that creates the sheet and then puts a style in one of
					// those collections cannot validate. Phase 1 is the sheet and its tokens; phase 2
					// is the named styles and the engine pointers, validated only once the sheet exists.
					const phases = [
						{ name: "sheet", ops: plan.sheet_ops },
						{ name: "styles", ops: plan.style_ops, after_sheet: true },
						{ name: "engines", ops: plan.pointer_ops, after_sheet: true }
					];
					const validate = async (ops) => bridge.request(origin, "validate_ops", exec.signal, {}, "POST", { ops, strict: true });
					const accepted = (validation) => validation?.ok === true && (validation.errors ?? []).length === 0;
					const sheetValidation = await validate(plan.sheet_ops);
					const sheetOk = accepted(sheetValidation);
					const opCount = plan.counts.ops;
					if (mode === "plan") {
						// Phase 2 is validated lazily: its parents are the collections Studio will create,
						// so a refusal here would be about the model's current shape, not the plan.
						return {
							status: sheetOk ? "planned" : "refused",
							...base,
							mode,
							op_count: opCount,
							phases: phases.map((phase) => ({ name: phase.name, ops: phase.ops.length, validated: phase.name === "sheet" ? sheetOk : false })),
							validation: sheetValidation,
							next: sheetOk
								? `Apply is two passes: ${plan.sheet_ops.length} operation(s) create the sheet and its tokens, then ${plan.style_ops.length} named styles and ${plan.pointer_ops.length} engine pointer write(s) validate against the sheet Studio has just created. Run action theme with mode apply and allowWrites.`
								: "The bridge refused the sheet phase before anything was written: read validation for the operation it would not resolve."
						};
					}
					if (!sheetOk) return { status: "refused", ...base, mode, op_count: opCount, validation: sheetValidation, next: "Nothing was written. Read validation, then plan again." };
					allowWrite();
					const results = [];
					const report = [];
					for (const phase of phases) {
						if (phase.ops.length === 0) {
							report.push({ name: phase.name, ops: 0, status: "skipped" });
							continue;
						}
						const validation = phase.name === "sheet" ? sheetValidation : await validate(phase.ops);
						if (!accepted(validation)) return {
							status: "refused_phase",
							...base,
							mode,
							phase: phase.name,
							applied: results.length,
							validation,
							phases: report,
							next: `The ${phase.name} phase was refused before anything in it was written. The sheet is on the model now; read validation and plan again - a second apply restates what is missing.`
						};
						for (const [index, op] of phase.ops.entries()) {
							let dispatched = false;
							try {
								const now = await bridge.request(origin, "health", exec.signal);
								if (now.project !== selectedHealth.project || now.model_loaded !== true || now.pid !== selectedHealth.pid || now.project_path !== selectedHealth.project_path) throw new Error("Serving Studio project changed during the theme batch");
								const request = operationRequest(op);
								dispatched = true;
								const result = await bridge.request(origin, request.route, exec.signal, request.query, "POST");
								if (result.ok !== true) throw new BridgeError("Bridge did not acknowledge the theme operation", true);
								results.push(result);
							} catch (error) {
								return {
									status: !dispatched || error instanceof BridgeError && !error.mayHaveApplied ? "partial" : "indeterminate",
									...base,
									mode,
									phase: phase.name,
									applied: results.length,
									failed_index: index,
									phases: report,
									error: String(error),
									next: "Inspect the sheet before retrying: a half-applied theme still reads as a sheet, so plan again and apply only what is missing."
								};
							}
						}
						report.push({ name: phase.name, ops: phase.ops.length, status: "applied" });
					}
					// Read the engines back: the write that matters is the pointer's Value, and only the
					// read-back says whether it took. ok is not proof.
					const after = await readEngineRefs();
					const verified = engines.every((engine) => after[engine] === plan.sheet_path);
					return {
						status: verified ? "applied" : "applied_unverified",
						...base,
						mode,
						applied: results.length,
						phases: report,
						engine_refs_after: after,
						engine_refs_verified: verified,
						next: verified
							? "Save the project in Studio (Ctrl+S) and Build it (Ctrl+Shift+B), then restart the emulator: the runtime draws with this sheet on its next load. Run action audit after the save to prove the file carries it."
							: `The sheet was written but ${engines.filter((engine) => after[engine] !== plan.sheet_path).join(", ")} does not point at it: write the pointer's Value child again, or name the sheet_path the engine already reads.`
					};
				}
				const sheetMap = await bridge.request(origin, "map", exec.signal, { path: plan.sheet_path, depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
				const observedTokens = childrenOf(sheetMap).map(nameOf).filter((name) => Object.hasOwn(plan.tokens, name));
				const observedStyles = [];
				for (const collection of plan.collections) {
					const collectionMap = await bridge.request(origin, "map", exec.signal, { path: `${plan.sheet_path}/${collection}`, depth: "1", max: String(settings.maxMapNodes), mode: "detail" }).catch(() => void 0);
					for (const entry of childrenOf(collectionMap)) observedStyles.push(`${plan.sheet_path}/${collection}/${nameOf(entry)}`);
				}
				const audit = auditTheme({ language, sheet_path: plan.sheet_path, engine_refs: engineRefs, observed_tokens: observedTokens, observed_styles: observedStyles });
				return {
					action,
					...audit,
					sheet: plan.sheet,
					sheet_path: plan.sheet_path,
					exists,
					engine_refs: engineRefs,
					observed_tokens: observedTokens.length,
					observed_styles: observedStyles.length,
					expected: { tokens: plan.counts.tokens, styles: plan.counts.styles }
				};
			});
		}
	})));
}
//#endregion
export { Config, apply, inject, name };

