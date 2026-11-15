/**
 * The fake scope the live harnesses mount the shipped optix row on.
 *
 * Not part of `node scripts/test.mjs`: extracted from `test/optix-live-dialog.mjs` so every live proof
 * reaches the tools the same way instead of copying the mount again.
 */

import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/**
 * Mount `entries/optix.js` with the options a live proof needs.
 *
 * @param {object} [options] - Tool config overrides merged over the live defaults.
 * @returns The mounted harness `{tools, run, dispose}`.
 */
export async function mount() {
	const module = await import(pathToFileURL(join(root, "entries", "optix.js")).href);
	const tools = new Map();
	const disposers = [];
	const attachments = {
		async saveImage({ name, mediaType }) {
			return { attachmentId: `live-${name}`, name, media_type: mediaType, width: 0, height: 0 };
		}
	};
	const scope = {
		tools: {
			register(definition) {
				tools.set(definition.name, definition);
				return () => tools.delete(definition.name);
			}
		},
		get: (key) => (key === "attachments" ? attachments : void 0),
		inject: (names, callback) => callback(scope),
		effect: (factory) => {
			const dispose = factory();
			disposers.push(dispose);
			return dispose;
		},
		on: () => () => {},
		emit: () => {},
		plugin: (module, options) => {
			if (typeof module?.apply === "function") module.apply(scope, options);
			return {
				dispose: async () => {
					for (const dispose of disposers.splice(0)) if (typeof dispose === "function") await dispose();
				}
			};
		},
		provide: () => {},
		logger: { warn: () => {}, error: () => {}, info: () => {}, debug: () => {} }
	};
	module.apply(scope, module.Config({
		allowWrites: true,
		allowDestructive: true,
		allowInvoke: true,
		preview: true,
		allowPreviewInput: true,
		requestTimeoutMs: 120000
	}));
	const run = async (name, args) => {
		const definition = tools.get(name);
		if (!definition) throw new Error(`unknown tool ${name}; the row registered ${[...tools.keys()].join(", ")}`);
		return definition.execute(args, { signal: AbortSignal.timeout(300000) });
	};
	return { tools, run };
}
