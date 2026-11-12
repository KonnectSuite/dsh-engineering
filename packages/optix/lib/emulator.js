import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
/**
* Locate and run the Optix runtime that serves a project's web presentation engine.
*
* Verified on Studio 1.7.4.32: `FTOptixRuntime.exe [options] <project_file>` starts the
* runtime for a project, and the project's Web presentation engine then answers its
* configured port. The Studio CLI has no run verb, so this is the only scripted route.
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
/** Runtime processes this plugin started, so `stop` ends its own and nothing else. */
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
/**
* Report the emulator leg: which runtime exists, which project file it would load, and
* whether the preview address already answers.
* @param input - Project folder, optional runtime override, and the preview URL to probe.
* @param signal - Caller abort signal; optional.
* @returns The emulator leg of the preview chain.
*/
export async function emulatorStatus(input, signal) {
	const candidates = await runtimeCandidates();
	const file = await projectFile(input.project);
	const url = input.previewUrl;
	let serving = false;
	let status = 0;
	try {
		const response = await fetch(url, {
			signal: signal ?? AbortSignal.timeout(3000),
			redirect: "error"
		});
		serving = true;
		status = response.status;
	} catch {
		serving = false;
	}
	const running = [...launched.values()].filter((pid) => alive(pid));
	return {
		runtime_path: candidates.at(-1) ?? "",
		discovered: candidates.length,
		project_file: file,
		running: running.length > 0,
		pids: running,
		url,
		serving,
		status
	};
}
/**
* Start the runtime for a project so its web presentation engine serves the preview.
* @param input - Project folder and optional runtime override.
* @returns What was started, with the pid and the next step.
*/
export async function startEmulator(input) {
	const file = await projectFile(input.project);
	if (file === "") throw new Error(`No .optix project file under ${input.project}: point project at the folder that holds the project's .optix file.`);
	const candidates = await runtimeCandidates();
	const executable = input.runtime && input.runtime !== "" ? input.runtime : candidates.at(-1) ?? "";
	if (executable === "") throw new Error(`No FTOptixRuntime.exe under ${studioRoots().join(" or ")}: pass runtime with the runtime executable, or run the project from Studio instead.`);
	const child = spawn(executable, ["-c", "-l", "INFO", file], {
		detached: true,
		stdio: "ignore"
	});
	child.unref();
	if (typeof child.pid === "number") launched.set(file, child.pid);
	return {
		runtime_path: executable,
		project_file: file,
		pid: child.pid ?? 0,
		started: typeof child.pid === "number",
		next: "The runtime serves the port the project's Web presentation engine sets; call optix_status to read the chain."
	};
}
/**
* Stop a runtime this plugin started. A runtime the engineer started from Studio is left
* alone: only pids recorded by `start` are signalled.
* @param input - Project folder whose runtime should stop.
* @returns Whether a tracked process was stopped.
*/
export async function stopEmulator(input) {
	const file = input.project_file !== "" ? input.project_file : await projectFile(input.project);
	const pid = launched.get(file === "" ? input.project : file);
	if (typeof pid !== "number" || !alive(pid)) return {
		stopped: false,
		reason: "This plugin did not start a runtime for that project; a runtime opened from Studio is stopped in Studio.",
		pid: pid ?? 0
	};
	process.kill(pid);
	launched.delete(file === "" ? input.project : file);
	return {
		stopped: true,
		pid
	};
}
