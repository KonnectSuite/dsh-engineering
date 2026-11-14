import z from "@deepseek-ai/schemastery";
import { defineTool } from "@deepseek-ai/dsh-tools";
import { assertNever, isJsonValue } from "@deepseek-ai/dsh-util-values";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { scrubbedParentEnv } from "@deepseek-ai/dsh-subprocess";
import { fileURLToPath } from "node:url";
import { chainReport, ocrProbe, samePreviewTarget, tesseractInstallCommand } from "./chain.js";
import { armBridge, bridgeVersion } from "./arm.js";
import { emulatorStatus, startEmulator, stopEmulator } from "./emulator.js";
import { findEntry, itemNames, libraryNames, libraryRoots, noStudioInstall, readCatalog, suggestNames } from "./library.js";
import { MAX_CARDS, MAX_NAV, SCREEN_THEME, screenOps } from "./screens.js";
import { designFindings } from "./design.js";
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
		url.search = new URLSearchParams(query).toString();
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
				page: await (await browser.newContext()).newPage()
			};
		}
		if (launched.page.isClosed()) launched.page = await (await launched.browser.newContext()).newPage();
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
		description: "Discover packaged Arya Optix IPC and OptixPanel starter projects, or read their NetLogic and project files. The manifest carries `questions`: ask them before copying, because the runtime target, the screen box, the project name and the destination are not recoverable by an edit afterwards. Copy the selected project directory into a new workspace directory with filesystem tools; preserve the original project name. Never overwrite an existing project. A starter ships an older bridge copy inside itself; run optix_bridge_arm on the copy to carry the session-safe bridge this package tracks. No Studio connection is required.",
		parameters: {
			template: {
				type: "string",
				enum: ids,
				required: true
			},
			path: {
				type: "string",
				description: "Exact manifest-listed project-relative file to read; omit to return the manifest and source directory. NetLogic: ProjectFiles/NetSolution/StudioMCPBridge.cs."
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
			const root = new URL(`../templates/${args.template}/`, import.meta.url);
			const manifest = parseTemplateManifest(await readFile(new URL("manifest.json", root), "utf8"));
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
		description: "Report, and on confirmation write, the Studio bridge an existing Optix project needs so it can be read and authored at all. Works on the project directory, not through a bridge: it checks ProjectFiles/NetSolution, keeps whatever the project already holds under ProjectFiles/.dsh-backups, and writes the bridge this bundle ships. With confirm false nothing is written. Studio still compiles the class and the engineer still runs StartBridge; no tool can do either from outside Studio.",
		parameters: {
			project: {
				type: "string",
				required: true,
				description: "Absolute path of the project directory holding the .optix file and ProjectFiles."
			},
			confirm: {
				type: "boolean",
				required: true,
				description: "false returns the plan and writes nothing; true writes the bridge after backing up any file already there."
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
			const report = await armBridge(args.project, shipped, args.confirm);
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
				required: false,
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
	browser: z.enum([
		"attach",
		"launch"
	]).default("launch"),
	browserChannel: z.enum([
		"auto",
		"chrome",
		"msedge"
	]).default("auto"),
	browserPath: z.string().default(""),
	browserHeadless: z.boolean().default(false),
	cdpUrl: z.string().default("http://127.0.0.1:9223"),
	previewUrl: z.string().default("http://127.0.0.1:8081/"),
	allowPreviewInput: z.boolean().default(false),
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
		description: "Discover loaded FactoryTalk Optix Studio projects directly through configured local bridges, and report the state of the preview, emulator and OCR chain with the first missing link named. Use before selecting a project, and before any preview or screenshot call. No MCP or Python service is required.",
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
				const normalized = ops.map((op) => op.prop_name === void 0 ? op : {
					...op,
					name: op.prop_name
				});
				const validation = await bridge.request(origin, "validate_ops", exec.signal, {}, "POST", {
					ops: normalized,
					strict: true
				});
				if (!acceptedValidation(validation, ops.length)) return {
					status: "refused",
					applied: 0,
					validation
				};
				if (dryRun) return {
					status: "validated",
					applied: 0,
					validation
				};
				const results = [];
				for (const [index, op] of ops.entries()) {
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
							results,
							validation,
							error: String(error),
							retry: "Inspect the live model; do not replay the entire batch automatically"
						};
					}
				}
				return {
					status: "completed",
					applied: results.length,
					results,
					validation
				};
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
		description: "Reach the template library FactoryTalk Optix ships instead of building only from builtin widget types. action list reads the installed Studio catalog from disk (Widgets, GraphicElements, StyleSheets, Keyboards, Misc, Scripts) with no bridge and no Studio session, naming each item with the display name and usage text the library ships. action import pulls one item and the types it depends on into the loaded project through the bridge: it needs allowWrites, the project open in Studio with the bridge started, and a 1.0.9 bridge that advertises template_library in optix_status. An import is not batch-reversible, so read the model back with optix_read before any retry.",
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
				description: "Project node to import under (default UI)."
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
				const query = {
					dest: args.dest?.trim() === "" || args.dest === void 0 ? "UI" : args.dest,
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
							guid: found.item.guid
						},
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
	ctx.effect(() => ctx.tools.register(defineTool({
		name: "optix_screen",
		description: `Draft or apply a whole Optix screen as one ordered operation batch: backdrop, header band, title, content surface, up to ${MAX_CARDS} data cards with value and lamp rows, and a row of up to ${MAX_NAV} navigation buttons. The slot math, the refusals and the palette are the ones the FactoryTalk View scaffold uses, so one design brief lays out both products. dry_run defaults to true: the batch is validated against the live model and nothing is written. Applying requires allowWrites. The screen is created as a ScreenType because a bare Screen instance does not load at runtime. Navigation is wired only when panel_loader names the PanelLoader read back from the live model, because a UI object is instantiated per session and an absolute design-time path does not resolve at runtime; without it the buttons are created and the wiring each one needs is reported instead. The batch is validated in one call and applied operation by operation, so a failure names the operation that stopped and the batch is never replayed automatically.`,
		parameters: {
			project: projectParameter,
			name: text,
			width: {
				type: "integer",
				description: "Design width, default 1280: the width the starter Window declares."
			},
			height: {
				type: "integer",
				description: "Design height, default 800: the height the starter Window declares."
			},
			title: { type: "string" },
			subtitle: { type: "string" },
			footer: { type: "string" },
			cards: {
				type: "array",
				items: {
					type: "object",
					properties: {
						title: {
							type: "string",
							required: true
						},
						rows: {
							type: "array",
							items: {
								type: "object",
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
			panel_loader: {
				type: "string",
				description: "Live PanelLoader path, read back with optix_read. Without it navigation is reported rather than wired."
			},
			theme: {
				type: "object",
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
			const spec = {
				name: args.name,
				width: args.width ?? 1280,
				height: args.height ?? 800,
				...(args.title === void 0 ? {} : { title: args.title }),
				...(args.subtitle === void 0 ? {} : { subtitle: args.subtitle }),
				...(args.footer === void 0 ? {} : { footer: args.footer }),
				...(args.cards === void 0 ? {} : { cards: args.cards }),
				...(args.nav === void 0 ? {} : { nav: args.nav }),
				...(args.screens_folder === void 0 || args.screens_folder === "" ? {} : { screens_folder: args.screens_folder }),
				...(args.panel_loader === void 0 || args.panel_loader === "" ? {} : { panel_loader: args.panel_loader }),
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
			allowWrite(isDestructive(layout.ops));
			const brief = {
				screen: layout.path,
				width: layout.width,
				height: layout.height,
				op_count: layout.op_count,
				objects: layout.objects,
				slots: layout.slots,
				theme: layout.theme
			};
			return exclusive(async () => {
				const { origin, health: selectedHealth } = await bridge.select(args.project, exec.signal);
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
					});
					expressions.push({
						path: item.path,
						prop_name: item.prop_name,
						expression: item.expression,
						sources: item.sources,
						result: checked
					});
				}
				const rejected = expressions.filter((item) => item.result?.ok !== true);
				const report = {
					...brief,
					...(args.include_ops === true ? { ops: layout.ops } : {}),
					validation,
					expressions,
					pending_wiring: layout.pendingWiring
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
					next: layout.pendingWiring.length === 0 ? "Apply with dry_run:false, then read the screen back with optix_read and run optix_design_check on it." : "Read UI/MainWindow with optix_read to find its PanelLoader, then draft again with panel_loader so the buttons are wired."
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
				return {
					status: "completed",
					applied: results.length,
					...report,
					results,
					coverage: "Every operation the bridge acknowledged. Rendering, runtime behaviour and whether a navigation button actually changes the panel are not established by this call.",
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
					for (const child of entry.children ?? []) walk(child, `${path}/${child.name}`);
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
				const report = designFindings({
					nodes: described,
					screen,
					canvas,
					siblings
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
}
//#endregion
export { Config, apply, inject, name };
