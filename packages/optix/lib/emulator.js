import { access, mkdir, open, readdir, readFile, stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
* Locate and run the Optix runtime that serves a project's web presentation engine.
*
* Verified on Studio 1.7.4.32: `FTOptixRuntime.exe [options] <project_file>` starts the
* runtime for a project, and the project's Web presentation engine then answers its
* configured port. The Studio CLI has no run verb, so this is the only scripted route.
* `runtimeCandidates` finds the same layout under a Studio 1.8.1.27 install; only the
* 1.7.4.32 machine was observed serving a project.
*
* A start is only reported as started once the preview address answers: the runtime takes
* a few seconds to bind and it fails silently when a port or a DLL is held, so a pid alone
* is not evidence. Its stdout and stderr go to a log this module can read back, because
* the only way an agent used to diagnose a dead runtime was to launch it by hand.
* @module
*/
/**
* Where a FactoryTalk Optix Studio install lives.
* @returns Candidate install roots on this machine.
*/
export function studioRoots() {
	const roots = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"]].filter((entry) => typeof entry === "string" && entry !== "");
	return [...new Set(roots.map((root) => join(root, "Rockwell Automation", "FactoryTalk Optix")))];
}
/**
* Find the runtime executable under a Studio install, version folder included.
* @returns Every `FTOptixRuntime.exe` this machine holds, newest folder name last.
*/
export async function runtimeCandidates() {
	const found = [];
	for (const root of studioRoots()) {
		let studios;
		try {
			studios = await readdir(root);
		} catch {
			continue;
		}
		for (const studio of studios.filter((entry) => entry.startsWith("Studio"))) {
			const runtime = join(root, studio, "FTOptixRuntime");
			let versions;
			try {
				versions = await readdir(runtime);
			} catch {
				continue;
			}
			for (const version of versions.sort()) {
				const executable = join(runtime, version, "Win32_x64", "FTOptixRuntime.exe");
				try {
					await access(executable);
					found.push(executable);
				} catch {
					continue;
				}
			}
		}
	}
	return found;
}
/**
* The project file inside a project folder, which is what the runtime loads.
* @param project - Folder holding the project's `.optix` file.
* @returns The `.optix` path, or an empty string when the folder holds none.
*/
export async function projectFile(project) {
	let entries;
	try {
		entries = await readdir(project);
	} catch {
		return "";
	}
	const matches = entries.filter((entry) => entry.endsWith(".optix")).sort();
	return matches.length === 0 ? "" : join(project, matches[0]);
}
/**
 * What the project on disk looks like, which is the state the runtime will load.
 *
 * A bridge write changes Studio's in-memory model and nothing else: `UAManagedCore` has no
 * save member at all, so the files are the only evidence that an engineer's Save reached
 * disk. Comparing the newest write under `Nodes/` with the time of the first pending bridge
 * change answers "is what the runtime will load my work?" without trusting a keystroke.
 * @param project - Folder holding the project's `.optix` file.
 * @returns Newest write under `Nodes/`, the project file's own write, and the file count.
 */
export async function diskState(project) {
	const state = {
		root: project,
		files: 0,
		newest_write: 0,
		newest_path: "",
		project_write: 0,
		project_bytes: 0
	};
	const file = await projectFile(project);
	if (file !== "") {
		try {
			const info = await stat(file);
			state.project_write = info.mtimeMs;
			state.project_bytes = info.size;
		} catch {}
	}
	const pending = [join(project, "Nodes")];
	while (pending.length > 0) {
		const directory = pending.pop();
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries) {
			const path = join(directory, entry.name);
			if (entry.isDirectory()) {
				pending.push(path);
				continue;
			}
			let info;
			try {
				info = await stat(path);
			} catch {
				continue;
			}
			state.files += 1;
			if (info.mtimeMs > state.newest_write) {
				state.newest_write = info.mtimeMs;
				state.newest_path = path;
			}
		}
	}
	state.newest_write_iso = state.newest_write === 0 ? "" : new Date(state.newest_write).toISOString();
	return state;
}
/** Folder holding the runtime logs this plugin writes; one file per project. */
export function logDirectory() {
	const base = typeof process.env.LOCALAPPDATA === "string" && process.env.LOCALAPPDATA !== "" ? process.env.LOCALAPPDATA : tmpdir();
	return join(base, "AryaCode", "OptixRuntime");
}
/**
* The runtime log for one project, named from the project file path.
* @param file - Absolute `.optix` path.
* @returns The log path for that project.
*/
export function logPath(file) {
	const digest = createHash("sha1").update(file.toLowerCase()).digest("hex").slice(0, 12);
	const stem = file.replace(/\\/g, "/").split("/").at(-1)?.replace(/\.optix$/i, "") ?? "project";
	return join(logDirectory(), `${stem}-${digest}.log`);
}
/** Runtime processes this plugin started, so `stop` ends its own first and knows its log. */
const launched = new Map();
/**
* Whether a process id is still alive.
* @param pid - Process id to test.
* @returns True when the process exists.
*/
function alive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}
/** Failure signatures the runtime writes instead of an error dialog. */
const LOG_SIGNATURES = [
	{
		pattern: /address already in use|only one usage of each socket address|EADDRINUSE/i,
		kind: "port_in_use",
		hint: "Another runtime already holds the port. Stop it (optix_emulator action stop) or change the project's Web presentation engine port."
	},
	{
		pattern: /MSB3061|could not copy|being used by another process|Access is denied/i,
		kind: "file_locked",
		hint: "A running runtime holds the project assembly. Stop the runtime, then let Studio build again."
	},
	{
		pattern: /licen[cs]e[^\n]*(?:expired|invalid|denied|refused|failed|not activated)|unable to (?:acquire|obtain)[^\n]*licen[cs]e|could not (?:acquire|obtain)[^\n]*licen[cs]e/i,
		kind: "licensing",
		hint: "The runtime reported a licence or activation problem; that needs the machine's Optix licence, not a retry."
	},
	{
		pattern: /(Unhandled exception|System\.[A-Za-z]+Exception):?\s*(.*)/i,
		kind: "exception",
		hint: "The runtime threw before it served the preview; the exception line is below."
	},
	{
		pattern: /No such file or directory|does not exist|cannot find the file/i,
		kind: "missing_file",
		hint: "The runtime could not find a file it needs; check the project path and that the project built."
	}
];
/**
* The runtime notices a log carries that are facts rather than failures. Measured on Studio 1.8.1: a
* machine without an Optix licence still serves the preview and says so, then closes itself after 120
* minutes, which is worth telling the agent before it reports a runtime that "disappeared".
*/
const LOG_NOTICES = [
	{
		pattern: /Demo mode started[^\n]*(?:will be closed in (\d+) minutes)?|Available tokens: 0 Standard/i,
		kind: "demo_mode",
		hint: "No FactoryTalk Optix licence on this machine: the runtime runs in demo mode and closes itself after 120 minutes. That is a licence matter, not a project defect - run it again when you need it."
	}
];
/**
* Name a runtime failure from the log it wrote, so a start that did not serve is diagnosable.
* @param text - Log text.
* @returns The first matching signature, or null when nothing is recognised.
*/
export function classifyLog(text) {
	for (const signature of LOG_SIGNATURES) {
		const match = signature.pattern.exec(text);
		if (match) return {
			kind: signature.kind,
			hint: signature.hint,
			line: (match[0] ?? "").trim().slice(0, 400)
		};
	}
	return null;
}
/**
* Name a runtime notice that is not a failure.
* @param text - Log text.
* @returns The first matching notice, or null when the log says nothing noteworthy.
*/
export function classifyNotice(text) {
	for (const signature of LOG_NOTICES) {
		const match = signature.pattern.exec(text);
		if (match) return {
			kind: signature.kind,
			hint: signature.hint,
			line: (match[0] ?? "").trim().slice(0, 400)
		};
	}
	return null;
}
/**
* The last lines of a text, capped by count and by bytes.
* @param text - Full text.
* @param lines - Lines to keep.
* @returns The tail, as an array.
*/
function tail(text, lines) {
	const all = text.split(/\r?\n/);
	return all.slice(Math.max(0, all.length - lines)).filter((line) => line !== "");
}
/**
* Read the log this plugin wrote for a project.
* @param file - Absolute `.optix` path.
* @param lines - Lines to return.
* @returns The path, whether it exists and its tail.
*/
export async function readLog(file, lines = 60) {
	const path = logPath(file);
	let text;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return {
			log_path: path,
			exists: false,
			lines: []
		};
	}
	return {
		log_path: path,
		exists: true,
		bytes: Buffer.byteLength(text),
		lines: tail(text, lines),
		...(classifyNotice(text) === null ? {} : { notice: classifyNotice(text) })
	};
}
/**
* Parse `Get-CimInstance Win32_Process` output into runtime processes.
* @param stdout - JSON produced by the PowerShell probe.
* @returns Process rows with a pid and command line.
*/
export function parseRuntimeProcesses(stdout) {
	const trimmed = stdout.trim();
	if (trimmed === "") return [];
	let parsed;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		return [];
	}
	const rows = Array.isArray(parsed) ? parsed : [parsed];
	return rows.map((row) => ({
		pid: Number(row?.ProcessId ?? 0),
		command_line: typeof row?.CommandLine === "string" ? row.CommandLine : ""
	})).filter((row) => row.pid > 0 && row.command_line !== "");
}
/**
* Ask Windows for the running processes with one image name.
*
* The plugin needs this to describe the machine honestly: which runtime holds a project, and
* whether Studio is even running, so a silent bridge can be named instead of guessed at. It
* is a process query, not window automation: nothing is clicked, raised or typed into.
* @param imageName - Executable name, for example `FTOptixRuntime.exe`.
* @param timeoutMs - Budget for the query.
* @returns Process rows, or an empty list when the query is unavailable.
*/
export async function windowsProcesses(imageName, timeoutMs = 6000) {
	if (process.platform !== "win32" || !/^[A-Za-z0-9._-]+$/.test(imageName)) return [];
	const script = `Get-CimInstance Win32_Process -Filter "Name='${imageName}'" | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress`;
	return await new Promise((resolve) => {
		let settled = false;
		const done = (value) => {
			if (settled) return;
			settled = true;
			resolve(value);
		};
		const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true
		});
		const timer = setTimeout(() => {
			try {
				child.kill();
			} catch {}
			done([]);
		}, timeoutMs);
		const chunks = [];
		child.stdout?.on("data", (chunk) => chunks.push(chunk));
		child.on("error", () => {
			clearTimeout(timer);
			done([]);
		});
		child.on("close", () => {
			clearTimeout(timer);
			done(parseRuntimeProcesses(Buffer.concat(chunks).toString("utf8")));
		});
	});
}
/**
* Every running Optix runtime and the project each one loaded.
* @param timeoutMs - Budget for the query.
* @returns Process rows, or an empty list when the query is unavailable.
*/
export async function runtimeProcesses(timeoutMs = 6000) {
	return await windowsProcesses("FTOptixRuntime.exe", timeoutMs);
}
/**
* Every running Studio process, which is what a silent bridge needs to name.
* @param timeoutMs - Budget for the query.
* @returns Process rows, or an empty list when the query is unavailable.
*/
export async function studioProcesses(timeoutMs = 6000) {
	return await windowsProcesses("FTOptixStudio.exe", timeoutMs);
}
/**
* Normalize a path for comparison, because the runtime reports the same project in another case.
* @param value - Path or command line fragment.
* @returns Lowercase path with one separator.
*/
function normalize(value) {
	return value.replace(/\//g, "\\").replace(/\\+/g, "\\").toLowerCase();
}
/**
* One bounded probe of the preview address.
* @param url - Preview URL.
* @param signal - Caller cancellation; optional.
* @returns Whether it answered, and its status.
*/
async function probe(url, signal) {
	try {
		const response = await fetch(url, {
			signal: signal ?? AbortSignal.timeout(3000),
			redirect: "error"
		});
		return {
			serving: true,
			status: response.status
		};
	} catch {
		return {
			serving: false,
			status: 0
		};
	}
}
/**
* Wait for the preview address to answer, giving up when the process dies or the budget ends.
* @param input - Preview URL, budget, caller signal and process liveness.
* @returns Whether it served, how long it took, and whether the process was still alive.
*/
async function waitForServing(input) {
	const started = Date.now();
	const budget = Math.max(1000, input.waitMs ?? 30000);
	let served = false;
	let status = 0;
	let attempts = 0;
	while (Date.now() - started < budget) {
		attempts += 1;
		const result = await probe(input.url, input.signal);
		if (result.serving) {
			served = true;
			status = result.status;
			break;
		}
		if (!input.liveness()) break;
		await new Promise((resolve) => setTimeout(resolve, input.intervalMs ?? 350));
	}
	return {
		serving: served,
		status,
		waited_ms: Date.now() - started,
		attempts,
		alive: input.liveness()
	};
}
/**
* Report the emulator leg: which runtime exists, which project file it would load, whether
* the preview address already answers, and what the last log said.
* @param input - Project folder, optional runtime override, and the preview URL to probe.
* @param signal - Caller abort signal; optional.
* @returns The emulator leg of the preview chain.
*/
export async function emulatorStatus(input, signal) {
	const candidates = await runtimeCandidates();
	const file = await projectFile(input.project);
	const url = input.previewUrl;
	const answered = await probe(url, signal);
	const running = [...launched.entries()].filter(([, entry]) => alive(entry.pid)).map(([project, entry]) => ({
		project_file: project,
		pid: entry.pid,
		log_path: entry.log
	}));
	const foreign = process.platform === "win32" ? (await runtimeProcesses()).filter((row) => !running.some((entry) => entry.pid === row.pid)) : [];
	const log = file === "" ? void 0 : await readLog(file, 20);
	return {
		runtime_path: candidates.at(-1) ?? "",
		discovered: candidates.length,
		project_file: file,
		running: running.length > 0,
		pids: running.map((entry) => entry.pid),
		foreign_pids: foreign.map((row) => row.pid),
		log_path: log?.log_path ?? "",
		...(log?.exists ? { log_tail: log.lines } : {}),
		url,
		serving: answered.serving,
		status: answered.status
	};
}
/**
* Start the runtime for a project, then wait until the preview actually answers.
*
* Returns `serving: false` with the runtime's own log tail when it did not, never a bare pid:
* a started process that serves nothing is the failure this tool exists to make visible.
* @param input - Project folder, optional runtime override, preview URL, wait budget and signal.
* @returns What was started, whether it serves, the log and the next step.
*/
export async function startEmulator(input) {
	const file = await projectFile(input.project);
	if (file === "") throw new Error(`No .optix project file under ${input.project}: point project at the folder that holds the project's .optix file.`);
	const candidates = await runtimeCandidates();
	const executable = input.runtime && input.runtime !== "" ? input.runtime : candidates.at(-1) ?? "";
	if (executable === "") throw new Error(`No FTOptixRuntime.exe under ${studioRoots().join(" or ")}: pass runtime with the runtime executable, or run the project from Studio instead.`);
	const url = input.previewUrl ?? "http://127.0.0.1:8081/";
	const existing = await probe(url, input.signal);
	if (existing.serving && input.force !== true) return {
		runtime_path: executable,
		project_file: file,
		pid: 0,
		started: false,
		reused: true,
		serving: true,
		status: existing.status,
		url,
		waited_ms: 0,
		log_path: logPath(file),
		next: `${url} already answers, so nothing was started. If that is another project's runtime, call optix_emulator action stop with force, then start again.`
	};
	const path = logPath(file);
	await mkdir(logDirectory(), { recursive: true });
	let append = true;
	try {
		append = (await stat(path)).size < 2e6;
	} catch {}
	const handle = await open(path, append ? "a" : "w");
	let exited = null;
	let child;
	// The runtime's own arguments, unless a caller replaces the executable with something that
	// takes different ones (the tests use Node itself as a fake runtime).
	const argv = Array.isArray(input.args) && input.args.length > 0 ? input.args : ["-c", "-l", "INFO", file];
	try {
		child = spawn(executable, argv, {
			detached: true,
			stdio: ["ignore", handle.fd, handle.fd],
			windowsHide: true
		});
	} finally {
		await handle.close();
	}
	child.unref();
	child.on("exit", (code, signal) => {
		exited = {
			code,
			signal
		};
	});
	const pid = typeof child.pid === "number" ? child.pid : 0;
	if (pid === 0) throw new Error(`FTOptixRuntime.exe did not start from ${executable}; read ${path} for why.`);
	launched.set(file, {
		pid,
		log: path,
		started_at: (/* @__PURE__ */ new Date()).toISOString()
	});
	const liveness = () => exited === null && alive(pid);
	const waited = await waitForServing({
		url,
		waitMs: input.waitMs,
		signal: input.signal,
		liveness
	});
	if (waited.serving) {
		const served = await readLog(file, 20);
		return {
			runtime_path: executable,
			project_file: file,
			pid,
			started: true,
			reused: false,
			serving: true,
			status: waited.status,
			url,
			waited_ms: waited.waited_ms,
			log_path: path,
			...(served.notice === undefined ? {} : { notice: served.notice }),
			next: "The runtime is serving the preview. optix_screenshot sees the saved project: changes made through the bridge since the last Studio Save are NOT in what it renders."
		};
	}
	const log = await readLog(file, 40);
	const diagnosis = classifyLog(log.lines.join("\n"));
	const exit_note = exited === null ? "The process is still running but never answered." : `The process exited with code ${exited.code}${exited.signal === null ? "" : ` (signal ${exited.signal})`}.`;
	return {
		runtime_path: executable,
		project_file: file,
		pid,
		started: true,
		reused: false,
		serving: false,
		status: 0,
		url,
		waited_ms: waited.waited_ms,
		log_path: path,
		log_tail: log.lines,
		...(diagnosis === null ? {} : { diagnosis }),
		next: `${exit_note} ${diagnosis === null ? `Read the log tail: the runtime wrote its reason to ${path}.` : diagnosis.hint}`
	};
}
/**
* Stop the runtime for a project, including one this plugin did not start.
*
* A runtime opened from Studio's toolbar, or left behind by an earlier session, holds the
* project DLL and makes every build fail; refusing to touch it is what pushed an agent into
* `Stop-Process` by hand. `force` is only needed for a process that ignores the first signal.
* @param input - Project folder, known project file, force flag and caller signal.
* @returns Which processes were signalled and whether the preview stopped answering.
*/
export async function stopEmulator(input) {
	const file = input.project_file !== "" ? input.project_file : await projectFile(input.project);
	const tracked = file === "" ? void 0 : launched.get(file);
	const targets = [];
	if (tracked !== void 0 && alive(tracked.pid)) targets.push({
		pid: tracked.pid,
		origin: "this plugin"
	});
	const rows = await runtimeProcesses();
	if (file !== "") {
		const wanted = normalize(file);
		for (const row of rows) {
			if (targets.some((entry) => entry.pid === row.pid)) continue;
			if (normalize(row.command_line).includes(wanted)) targets.push({
				pid: row.pid,
				origin: "started outside this plugin"
			});
		}
	}
	/**
	* A runtime left over from another project holds the preview port, so a start for this project reuses
	* it and a stop scoped to this project cannot find it. force means "this port is mine": every runtime
	* on the machine is a target, and the result says where each came from.
	*/
	if (input.force === true) for (const row of rows) {
		if (targets.some((entry) => entry.pid === row.pid)) continue;
		targets.push({
			pid: row.pid,
			origin: "another project"
		});
	}
	if (targets.length === 0) return {
		stopped: false,
		found: 0,
		stopped_pids: [],
		reason: "No runtime for that project is running, so there is nothing to stop."
	};
	const stopped = [];
	for (const target of targets) {
		try {
			process.kill(target.pid);
			stopped.push(target.pid);
		} catch {}
	}
	const deadline = Date.now() + 4000;
	while (Date.now() < deadline && stopped.some((pid) => alive(pid))) await new Promise((resolve) => setTimeout(resolve, 200));
	const survivors = stopped.filter((pid) => alive(pid));
	if (survivors.length > 0 && input.force === true) for (const pid of survivors) try {
		process.kill(pid, "SIGKILL");
	} catch {}
	const stubborn = survivors.filter((pid) => alive(pid));
	if (file !== "") launched.delete(file);
	let preview = {
		serving: false,
		status: 0
	};
	if (input.previewUrl) preview = await probe(input.previewUrl, input.signal);
	return {
		stopped: stubborn.length === 0,
		found: targets.length,
		stopped_pids: stopped.filter((pid) => !stubborn.includes(pid)),
		unstopped_pids: stubborn,
		origins: [...new Set(targets.map((target) => target.origin))],
		preview,
		...(stubborn.length === 0 ? {} : { next: "A process survived the stop signal; pass force: true, or end it from the machine yourself and tell the engineer." }),
		...(input.previewUrl && preview.serving ? { next: "The runtime was signalled but the preview address still answers: another process serves that port." } : {})
	};
}
/**
* Stop the project's runtime and start it again, which is what a rebuild needs.
* @param input - Project folder, preview URL, wait budget, force flag and signal.
* @returns The stop report and the start report.
*/
export async function restartEmulator(input) {
	const stopped = await stopEmulator({
		project: input.project,
		project_file: "",
		force: input.force,
		previewUrl: input.previewUrl,
		signal: input.signal
	});
	const started = await startEmulator({
		project: input.project,
		runtime: input.runtime,
		args: input.args,
		previewUrl: input.previewUrl,
		waitMs: input.waitMs,
		signal: input.signal,
		force: true
	});
	return {
		stopped,
		started
	};
}
/**
* Read back the log the runtime wrote for a project.
* @param input - Project folder and how many lines to return.
* @returns The log path, whether it exists and its tail.
*/
export async function emulatorLogs(input) {
	const file = input.project_file !== "" ? input.project_file : await projectFile(input.project);
	if (file === "") throw new Error(`No .optix project file under ${input.project}: point project at the folder that holds the project's .optix file.`);
	const log = await readLog(file, input.lines ?? 60);
	const diagnosis = log.exists ? classifyLog(log.lines.join("\n")) : null;
	return {
		...log,
		...(diagnosis === null ? {} : { diagnosis })
	};
}
