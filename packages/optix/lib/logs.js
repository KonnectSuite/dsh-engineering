/**
 * The last two things a session cannot see from the model: what the runtime logged, and what the bridge logged.
 *
 * Both are plain text files on the host, and both are the only place a silent failure shows up - a component
 * that refused its dynamic link, a store that never opened, a method that was not found. Reading the tail is
 * cheaper than guessing why the screen is blank.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/** Where the Optix runtime writes its own log, beside the per-project log it names. */
const RUNTIME_LOG_DIR = join(homedir(), "AppData", "Local", "AryaCode", "OptixRuntime");

/** Where the bridge plugin keeps its own log, when the host has one. The bridge's `Log.Info("StudioBridge", …)`
 * lines land in Studio's own log, so that folder is the real answer - the others are kept for older hosts. */
const BRIDGE_LOG_CANDIDATES = [
	join(homedir(), "AppData", "Local", "Rockwell Automation", "FactoryTalk Optix", "FTOptixStudio", "Log"),
	join(homedir(), "AppData", "Local", "AryaCode", "logs"),
	join(homedir(), ".aryacode", "logs")
];

/**
 * Newest file in a folder, ignoring anything that is not a file.
 * @param folder - Absolute folder to inspect.
 * @returns The path and mtime, or null when the folder is missing or empty.
 */
async function newestFile(folder) {
	let entries;
	try {
		entries = await readdir(folder, { withFileTypes: true });
	} catch {
		return null;
	}
	let best = null;
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		const full = join(folder, entry.name);
		let info;
		try {
			info = await stat(full);
		} catch {
			continue;
		}
		if (best === null || info.mtimeMs > best.mtimeMs) best = { path: full, name: entry.name, mtimeMs: info.mtimeMs, bytes: info.size };
	}
	return best;
}

/**
 * The last `lines` lines of a file, plus the file's size and mtime.
 *
 * `mtime` is an ISO string and `mtimeMs` a number: a `Date` is not lossless JSON, and a result carrying one
 * makes the whole host call fail (measured on a live session, 2026-11-16).
 * @param path - Absolute path to a text log.
 * @param lines - How many trailing lines to return (1..2000).
 * @returns `{ path, name, bytes, mtime, mtimeMs, lines, text, matched }`.
 */
export async function tailFile(path, lines) {
	const body = await readFile(path, "utf8");
	const all = body.split(/\r?\n/u);
	const keep = all.slice(Math.max(0, all.length - lines));
	const info = await stat(path);
	return {
		path,
		name: path.split(/[\\/]/u).pop(),
		bytes: Buffer.byteLength(body, "utf8"),
		mtime: info.mtime.toISOString(),
		mtimeMs: info.mtimeMs,
		lines: keep.length,
		text: keep.join("\n"),
		matched: all.length
	};
}

/**
 * The runtime log that belongs to a project.
 *
 * The runtime writes one log per project, named after the project with a hash suffix, so the newest file in
 * the folder is only the right answer when one project has been run - the hash in the name is matched too.
 * @param projectRoot - Absolute project folder; used to match the log name.
 * @param lines - Trailing line count.
 * @param filter - Optional case-insensitive substring filter applied to the returned text.
 * @returns `{ path, bytes, mtime, lines, text, source }`.
 */
export async function runtimeLog(projectRoot, lines, filter) {
	const newest = await newestFile(RUNTIME_LOG_DIR);
	if (!newest) {
		throw new Error(`No Optix runtime log found in ${RUNTIME_LOG_DIR}. Start the preview with optix_emulator action="start" first.`);
	}
	const wanted = typeof projectRoot === "string" && projectRoot.trim() !== "" ? projectRoot.trim().split(/[\\/]/u).pop().toLowerCase() : "";
	const candidates = (await readdir(RUNTIME_LOG_DIR)).filter(name => name.endsWith(".log"));
	const matching = wanted === "" ? [] : candidates.filter(name => name.toLowerCase().startsWith(wanted));
	const chosen = matching.length > 0 ? join(RUNTIME_LOG_DIR, matching.sort().pop()) : newest.path;
	const tail = await tailFile(chosen, lines);
	const text = typeof filter === "string" && filter.trim() !== "" ? tail.text.split(/\r?\n/u).filter(line => line.toLowerCase().includes(filter.trim().toLowerCase())).join("\n") : tail.text;
	return { ...tail, text, source: chosen === newest.path ? "newest runtime log" : `runtime log for ${wanted}` };
}

/**
 * The bridge's own log, when this host keeps one.
 * @param lines - Trailing line count.
 * @param filter - Optional case-insensitive substring filter.
 * @returns `{ path, bytes, mtime, lines, text, source }`.
 */
export async function bridgeLog(lines, filter) {
	for (const folder of BRIDGE_LOG_CANDIDATES) {
		const newest = await newestFile(folder);
		if (newest) {
			const tail = await tailFile(newest.path, lines);
			const text = typeof filter === "string" && filter.trim() !== "" ? tail.text.split(/\r?\n/u).filter(line => line.toLowerCase().includes(filter.trim().toLowerCase())).join("\n") : tail.text;
			return { ...tail, text, source: `newest log in ${folder}` };
		}
	}
	throw new Error(`No bridge log found. Looked in: ${BRIDGE_LOG_CANDIDATES.join(" and ")}. The bridge reports its own state through optix_status instead.`);
}
