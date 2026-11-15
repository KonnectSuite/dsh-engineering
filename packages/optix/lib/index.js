import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { assertNever, isJsonValue } from "@deepseek-ai/dsh-util-values";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { fileURLToPath } from "node:url";
import { chainReport, ocrProbe, samePreviewTarget, tesseractInstallCommand } from "./chain.js";
import { armBridge, bridgeVersion } from "./arm.js";
import { scaffoldProject } from "./scaffold.js";
import { emulatorStatus, startEmulator, stopEmulator } from "./emulator.js";
import { findEntry, itemNames, libraryNames, libraryRoots, noStudioInstall, readCatalog, suggestNames } from "./library.js";
import { MAX_CARDS, MAX_NAV, SCREEN_THEME, screenOps } from "./screens.js";
import { designFindings, INTERACTIVE_TYPES } from "./design.js";
import { pointerFacts, productionFindings, walkTree } from "./production.js";
import { DEFAULT_HIERARCHY, MODEL_METADATA, MODEL_ROOT, TYPES_FOLDER, modelFindings, planModel } from "./model.js";
import { MARKER, NETLOGIC_FOLDER, NETLOGIC_RULES, TEMPLATES, findNetLogicNode, netSolutionDir, buildNetSolution, checkName, fileFor, findProjectRoot, listNetLogics, liveNetLogicNodes, netLogicReport, readNetLogic, removeNetLogicFile, reviewNetLogic, templateCode, writeNetLogic } from "./netlogic.js";
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
	create_variable: {
		route: "model/variable",
		fields: {
			parent: text$1,
			name: text$1,
			datatype: text$1
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
				text: `Optix preview at ${value.url}: ${value.attachment.width}×${value.attachment.height}.`
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
				return {
					url: page.url(),
					attachment
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
const ids = ["arya-optix-ipc", "arya-optix-panel"];
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
		description: "Our two packaged starters, Arya Optix IPC and OptixPanel - chosen between, not surveyed. With no arguments it answers with both manifests and their `questions` and writes nothing, which is how a template or standard request opens; with `template` it reads that starter's NetLogic and project files, or with `destination` scaffolds it into a project folder of its own. With `destination`, the starter is copied into `<destination>/<name>` (or into the destination itself when that folder already carries the project name, because Studio warns when the project name and its folder disagree), renamed, sized to the canvas you pass, and given ProjectFiles/NetSolution with the bridge this bundle ships; nothing is overwritten and no Studio connection is required. `width` and `height` are required with `destination`: ask the operator for the real screen box before scaffolding, because every screen drafted afterwards inherits that canvas. The manifest carries `questions` to ask before a copy, because the runtime target, the screen box, the project name and the destination are not recoverable by an edit afterwards. Studio still compiles the class and an engineer still runs StartBridge - those two are the only steps this cannot do.",
		parameters: {
			template: {
				type: "string",
				enum: ids,
				description: "Which starter: `arya-optix-ipc` or `arya-optix-panel`. Omit to receive both manifests and their questions, writing nothing."
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
				 * A template or standard request opens here: both starters and the questions they need
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
					instructions: "These are our two starters - the shell a team starts from. Ask their questions before copying anything: which runtime, the screen box in pixels, the project name and the destination. Then choose one and pass `template`, `destination`, `name`, `width` and `height`. A house standard (levels, palette, naming, alarm strategy) is decided from `engineering_reference` and applied on top of the copy; nothing here creates an empty project."
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
function applyBridgeArm(ctx) {
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
		description: "Read, start, or stop the Optix runtime that serves a project's web preview. It finds FTOptixRuntime.exe under the Studio install, loads the project's .optix file, and reports the preview address the project's Web presentation engine sets. status probes that address; start launches the runtime; stop ends only a runtime this tool launched, never one the engineer opened in Studio. The port is a project setting, so a project serving another port needs its engine changed, not this tool.",
		parameters: {
			action: {
				type: "string",
				required: true,
				description: "status reads the leg, start launches the runtime, stop ends the one this tool started."
			},
			project: {
				type: "string",
				required: true,
				description: "Absolute path of the project directory holding the .optix file."
			},
			runtime: {
				type: "string",
				description: "Runtime executable path; empty discovers it under the Studio install."
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
			if (args.action !== "status" && !settings.allowInvoke) throw new Error("Starting or stopping a process needs allowInvoke in the Optix row's plugin configuration; status works without it.");
			if (args.action === "start") return await startEmulator({
				project: args.project,
				runtime: args.runtime ?? ""
			});
			if (args.action === "stop") return await stopEmulator({
				project: args.project,
				project_file: ""
			});
			const report = await emulatorStatus({
				project: args.project,
				previewUrl: settings.previewUrl
			}, exec.signal);
			if (!report.serving) report.next = report.project_file === "" ? "Point project at the folder holding the project's .optix file." : "Nothing serves the preview address: optix_emulator with action start launches the runtime, or run the project from Studio.";
			return report;
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
	applyTemplates(ctx, settings.maxResponseBytes);
	applyBridgeArm(ctx);
	applyEmulator(ctx, settings);
	applyOcrSetup(ctx, settings);
	if (settings.preview) ctx.inject(["attachments"], (scope) => {
		applyPreview(scope, settings);
	});
	const disposed = new AbortController();
	const bridge = new OptixBridgeGateway(settings, disposed.signal);
	ctx.effect(() => async () => {
		disposed.abort();
		await bridge.drain();
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
		description: "Report the state of the FactoryTalk Optix tool chain: loaded Studio projects through configured local bridges, and the preview, emulator and OCR chain with the first missing link named. Call it when a project is in play - to check which project is loaded, before a preview or screenshot, or when a bridge answers nothing - not to find out what to build: a new build starts from the brief, our two packaged starters and `engineering_reference`, and an inventory of the machine is not a brief (CRAFT-ORD-01). No MCP or Python service is required.",
		parameters: {},
		output: jsonOutput,
		presentCall: () => ({
			card: "generic",
			title: "Discover Optix projects",
			kind: "read"
		}),
		async execute(_args, exec) {
			const endpoints = [];
			for (const origin of settings.bridgeUrls) {
				exec.signal.throwIfAborted();
				try {
					endpoints.push({
						origin,
						available: true,
						health: await bridge.request(origin, "health", exec.signal)
					});
				} catch (error) {
					if (exec.signal.aborted || disposed.signal.aborted) throw error;
					endpoints.push({
						origin,
						available: false,
						error: "Bridge unavailable; open the project in Studio and run StartBridge"
					});
				}
			}
			return {
				endpoints,
				authoring: settings.allowWrites,
				destructive: settings.allowDestructive,
				invoke: settings.allowInvoke,
				preview_chain: await chainReport(settings, exec.signal)
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
			const ops = args.ops;
			if (!ops.length || ops.length > settings.maxBatchOps) throw new Error("Batch must contain 1..maxBatchOps operations");
			checkOperations(ops);
			const dryRun = args.dry_run !== false;
			if (!dryRun) allowWrite(isDestructive(ops));
			return exclusive(async () => {
				const { origin, health: selectedHealth } = await bridge.select(args.project, exec.signal);
				return runValidatedBatch({
					origin,
					project: args.project,
					ops,
					health: selectedHealth,
					signal: exec.signal,
					apply: !dryRun
				});
			});
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
				const missingTargets = [];
				for (const target of requestedTargets) {
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
				const brief = {
					screen: layout.path,
					width: layout.width,
					height: layout.height,
					op_count: layout.op_count,
					objects: layout.objects,
					slots: layout.slots,
					theme: layout.theme,
					...(libraryPlan.length === 0 ? {} : { library: libraryPlan }),
					host: {
						window: host.window,
						canvas: host.width === void 0 || host.height === void 0 ? void 0 : { width: host.width, height: host.height },
						panel_loader: spec.panel_loader,
						panel_loaders: host.panel_loaders,
						nav_targets_missing: missingTargets
					}
				};
				const normalized = layout.ops.map((op) => op.prop_name === void 0 ? op : {
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
					...(args.include_ops === true ? { ops: layout.ops } : {}),
					validation,
					expressions,
					pending_wiring: pendingWiring
				};
				if (!acceptedValidation(validation, layout.ops.length) || rejected.length > 0) return {
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
				for (const [index, op] of layout.ops.entries()) {
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
				if (layout.ops.some((op) => op.op === "wire_event" && op.object_raw !== void 0)) pointerClearing = await clearPointerValues(origin, layout.ops, exec.signal);
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
		description: "Run the HMI design rules against a screen in the live model: a control smaller than the touch minimum, a control with no text of its own, text whose colour does not stand out from the fill it sits on, a screen with no navigation area, a screen whose controls carry no event handler, a screen whose size is not the window canvas, the same hand-built composition repeated across screens, and behaviour living inside a composition. Rule ids are the corpus ids, so a finding is citable with engineering_reference. Read-only: nothing is written. Each finding is a statement about the model the bridge reports, not about how the screen renders.",
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
				const report = designFindings({
					nodes: described,
					screen,
					canvas,
					siblings,
					...(shell === void 0 ? {} : { shell })
				});
				const unchecked = [...report.unchecked, ...canvasNotes];
				if (notDescribed.length > 0) unchecked.push(`${notDescribed.length} object(s) were not described: ${notDescribed.slice(0, 5).join(", ")}${notDescribed.length > 5 ? ", …" : ""}`);
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
					ops: plan.ops,
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
				description: "For add with no code: blank, periodic (runtime class with a PeriodicTask, cached nodes, try/catch and dispose) or observer (runtime class subscribing to VariableChange and unsubscribing in Stop). Default blank."
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
}
//#endregion
export { Config, apply, inject, name };
