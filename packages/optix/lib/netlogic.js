// NetLogic authoring for FactoryTalk Optix.
//
// A NetLogic is a C# class whose name must equal the name of a NetLogic node in
// the project; the node carries no code reference, and Studio's SDK-style
// NetSolution project (.csproj) globs every .cs beside it. So authoring one is
// two writes that must agree: the node (through the bridge) and the class file
// (on disk, under ProjectFiles/NetSolution). This module owns both, plus the
// build that proves the class compiles.
//
// Two kinds are authored, and they are the same node type:
//   runtime - Start()/Stop() run when the runtime loads the node's parent.
//   design  - Studio does not fire Start() at design time; the class exposes
//             [ExportMethod] methods that a right-click Execute (or the bridge's
//             node/invoke route) runs against Project.Current.
//
// Measured on Studio 1.8.1 with bridge 1.0.9, 2026-11-14.

import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";

export const NETLOGIC_FOLDER = "NetLogic";
export const MARKER = "// aria-netlogic:";

const CLASS_PATTERN = /public\s+(?:sealed\s+)?class\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/u;
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;
const FILE_NAME_PATTERN = /\.cs$/iu;

/** Roots searched when the caller does not name project_root. */
export function projectRootCandidates() {
	return [
		join(homedir(), "Documents", "Rockwell Automation", "FactoryTalk Optix", "Projects"),
		join(homedir(), "Desktop"),
		join(homedir(), "AryaCode", "KonnectSuite"),
	];
}

async function walkForOptix(dir, name, depth, found) {
	if (depth < 0 || found.length > 8) return;
	let entries;
	try {
		entries = await readdir(dir, { withFileTypes: true });
	} catch {
		return;
	}
	for (const entry of entries) {
		if (entry.name.startsWith(".") || entry.name === "node_modules") continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) await walkForOptix(full, name, depth - 1, found);
		else if (entry.name.toLowerCase() === `${name.toLowerCase()}.optix`) found.push(full);
	}
}

/**
 * Resolve the folder the open project lives in.
 *
 * The bridge cannot report it (Studio 1.8.1 exposes no project file path), so
 * an explicit folder wins, else a bounded search of the places Studio projects
 * live on this machine. Emulator deploy copies and Studio backups are excluded:
 * they are not the project an engineer edits.
 */
export async function findProjectRoot(project, projectRoot) {
	if (typeof projectRoot === "string" && projectRoot.trim() !== "") {
		const root = resolve(projectRoot.trim());
		const optixFile = join(root, `${project}.optix`);
		if (!existsSync(optixFile)) {
			throw new Error(`no ${project}.optix in ${root} - point project_root at the folder that holds it`);
		}
		return { root, optixFile };
	}
	const found = [];
	for (const candidate of projectRootCandidates()) await walkForOptix(candidate, project, 4, found);
	const usable = found.filter((path) => !/[\\/](AppData|node_modules)[\\/]/iu.test(path));
	const unique = [...new Set(usable.map((path) => dirname(path)))];
	if (unique.length === 1) return { root: unique[0], optixFile: join(unique[0], `${project}.optix`) };
	if (unique.length === 0) {
		throw new Error(
			`cannot find ${project}.optix - pass project_root with the folder that holds it (searched: ${projectRootCandidates().join(", ")})`,
		);
	}
	throw new Error(
		`${project}.optix exists in ${unique.length} folders - pass project_root: ${unique.join(" | ")}`,
	);
}

export function netSolutionDir(root) {
	return join(root, "ProjectFiles", "NetSolution");
}

export async function findCsproj(root) {
	const dir = netSolutionDir(root);
	let entries;
	try {
		entries = await readdir(dir);
	} catch {
		throw new Error(`no ProjectFiles\\NetSolution in ${root} - is it an Optix project folder?`);
	}
	const projects = entries.filter((name) => name.toLowerCase().endsWith(".csproj"));
	if (projects.length === 0) throw new Error(`no .csproj in ${dir}`);
	const named = projects.find((name) => name.toLowerCase() === `${basename(root).toLowerCase()}.csproj`);
	return join(dir, named ?? projects[0]);
}

export function fileFor(root, name) {
	return join(netSolutionDir(root), `${name}.cs`);
}

function inside(parent, child) {
	const rel = relative(parent, child);
	return rel !== "" && !rel.startsWith("..") && !rel.includes(`..${sep}`);
}

export function checkName(name) {
	if (typeof name !== "string" || !NAME_PATTERN.test(name)) {
		throw new Error(`"${name}" is not a class name: a letter or underscore, then letters, digits or underscores, at most 64 characters`);
	}
	return name;
}

/** Read the parts of a class file this tool reasons about. */
export function parseClass(code) {
	const text = String(code ?? "");
	const match = CLASS_PATTERN.exec(text);
	const marker = new RegExp(`^${MARKER}\\s*kind=(runtime|design)`, "mu").exec(text);
	const exports = [...text.matchAll(/\[ExportMethod\]\s*(?:public\s+)?(?:async\s+)?(?:[\w<>\[\],.\s]+\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gu)].map(
		(entry) => entry[1],
	);
	return {
		className: match === null ? "" : match[1],
		baseClass: match === null ? "" : match[2],
		kind: marker === null ? "unknown" : marker[1],
		hasStart: /\b(?:public|protected|protected internal)\s+override\s+void\s+Start\s*\(/u.test(text),
		hasStop: /\b(?:public|protected|protected internal)\s+override\s+void\s+Stop\s*\(/u.test(text),
		exportMethods: exports,
		lines: text === "" ? 0 : text.split("\n").length,
	};
}

export function digest(code) {
	return createHash("sha256").update(String(code ?? ""), "utf8").digest("hex");
}

const HEADER = (name, kind, stamp) =>
	`${MARKER} kind=${kind} name=${name} created=${stamp}\n` +
	`// ${name} - a ${kind === "design" ? "design-time" : "runtime"} NetLogic written by AryaCode.\n` +
	`// The class name must equal the NetLogic node name; Studio compiles every .cs in this folder.\n` +
	(kind === "design"
		? `// Studio does not fire Start() at design time: run these methods with right-click Execute,\n// or with optix_netlogic action "run" while the bridge is up.\n`
		: `// Start()/Stop() run in the runtime when the node this class is bound to is loaded.\n`);

export function templateCode({ name, kind = "runtime", template = "blank", stamp = new Date().toISOString().slice(0, 10) }) {
	checkName(name);
	const header = HEADER(name, kind, stamp);
	const usingBlock = [
		"using System;",
		"using FTOptix.HMIProject;",
		"using UAManagedCore;",
		"using FTOptix.NetLogic;",
		"",
	].join("\n");
	if (kind === "design") {
		return (
			header +
			"\n" +
			usingBlock +
			`public class ${name} : BaseNetLogic\n{\n` +
			`    [ExportMethod]\n` +
			`    public void Ping()\n` +
			`    {\n` +
			`        Log.Info("${name}", "Ping from " + Project.Current.BrowseName);\n` +
			`    }\n` +
			`}\n`
		);
	}
	if (template === "periodic") {
		return (
			header +
			"\n" +
			usingBlock +
			`public class ${name} : BaseNetLogic\n{\n` +
			`    private PeriodicTask task;\n\n` +
			`    public override void Start()\n` +
			`    {\n` +
			`        task = new PeriodicTask(Tick, 1000, LogicObject);\n` +
			`        task.Start();\n` +
			`    }\n\n` +
			`    public override void Stop()\n` +
			`    {\n` +
			`        if (task != null)\n` +
			`        {\n` +
			`            task.Dispose();\n` +
			`            task = null;\n` +
			`        }\n` +
			`    }\n\n` +
			`    private void Tick()\n` +
			`    {\n` +
			`        // Write machine behaviour here, for example\n` +
			`        // LogicObject.GetVariable("../Speed").Value = 12.5;\n` +
			`    }\n` +
			`}\n`
		);
	}
	return (
		header +
		"\n" +
		usingBlock +
		`public class ${name} : BaseNetLogic\n{\n` +
		`    public override void Start()\n` +
		`    {\n` +
		`    }\n\n` +
		`    public override void Stop()\n` +
		`    {\n` +
		`    }\n` +
		`}\n`
	);
}

export async function readNetLogic(root, name) {
	checkName(name);
	const file = fileFor(root, name);
	let code;
	try {
		code = await readFile(file, "utf8");
	} catch {
		throw new Error(`no ${name}.cs in ${netSolutionDir(root)}`);
	}
	const info = parseClass(code);
	return { file, code, bytes: Buffer.byteLength(code), sha256: digest(code), ...info };
}

export async function listNetLogics(root) {
	const dir = netSolutionDir(root);
	let entries;
	try {
		entries = await readdir(dir);
	} catch {
		return [];
	}
	const out = [];
	for (const entry of entries.filter((file) => FILE_NAME_PATTERN.test(file)).sort()) {
		const file = join(dir, entry);
		const code = await readFile(file, "utf8");
		const info = parseClass(code);
		const stats = await stat(file);
		out.push({
			name: entry.replace(/\.cs$/iu, ""),
			file,
			bytes: stats.size,
			modified: stats.mtime.toISOString(),
			sha256: digest(code),
			...info,
		});
	}
	return out;
}

export async function writeNetLogic(root, name, code, { expectSha256, allowDifferentClass = false } = {}) {
	checkName(name);
	const text = String(code ?? "");
	if (text.trim() === "") throw new Error("code is empty");
	const file = fileFor(root, name);
	if (!inside(netSolutionDir(root), file)) throw new Error("refusing to write outside ProjectFiles\\NetSolution");
	const info = parseClass(text);
	if (info.className === "") {
		throw new Error("code declares no class deriving from BaseNetLogic - the class name must equal the node name");
	}
	if (info.className !== name && !allowDifferentClass) {
		throw new Error(`code declares class ${info.className} but the node is ${name} - Optix binds a NetLogic by name, so they must match`);
	}
	if (existsSync(file)) {
		const current = await readFile(file, "utf8");
		const currentHash = digest(current);
		if (expectSha256 !== undefined && expectSha256 !== "" && expectSha256 !== currentHash) {
			throw new Error(`refusing to overwrite ${name}.cs: its sha256 is ${currentHash}, not ${expectSha256} - read it again`);
		}
	}
	await mkdir(dirname(file), { recursive: true });
	await writeFile(file, text.endsWith("\n") ? text : `${text}\n`, "utf8");
	const stored = await readFile(file, "utf8");
	return { file, bytes: Buffer.byteLength(stored), sha256: digest(stored), ...parseClass(stored) };
}

export async function removeNetLogicFile(root, name) {
	checkName(name);
	const file = fileFor(root, name);
	if (!existsSync(file)) return { file, removed: false };
	try {
		await rm(file);
		return { file, removed: true };
	} catch (error) {
		// Deleting the NetLogic node also removes its class file, so the node may
		// beat us to it: that is a successful delete, not a failure.
		if (error?.code === "ENOENT") return { file, removed: true };
		throw error;
	}
}

/**
 * Compile the project's NetLogic solution and return the diagnostics Studio
 * would show. This is the only check that proves a class is real: the node and
 * the file can both exist while the code does not compile.
 */
const BUILD_TARGETS = { plain: [], rebuild: ["-t:Rebuild"] };

/** One `dotnet build`, with the diagnostics a Studio engineer would read. */
function runDotnetBuild(project, timeoutMs, target) {
	return new Promise((resolveBuild) => {
		execFile(
			"dotnet",
			["build", project, "-v", "q", "--nologo", ...target],
			{ timeout: timeoutMs, windowsHide: true, cwd: dirname(project) },
			(error, stdout, stderr) => {
				const text = `${stdout ?? ""}${stderr ?? ""}`;
				const errors = [...text.matchAll(/^.*?\berror\s+([A-Z]+\d+):\s*(.+)$/gmu)].map((entry) => entry[0].trim());
				const warnings = [...text.matchAll(/^.*?\bwarning\s+([A-Z]+\d+):\s*(.+)$/gmu)].map((entry) => entry[0].trim());
				// The Optix runtime keeps bin\<project>.dll open while it runs, so a
				// build during an emulator session fails on the copy even though the
				// C# compiles. That is the measured MSB3026 message, not a code error.
				const locked = /MSB302[67]|being used by another process|FactoryTalk Optix Runtime/iu.test(text);
				// A build killed mid-flight leaves obj\ inconsistent; MSBuild then reports
				// its own generated files as missing sources. Rebuilding clears that state.
				const staleObject = /CS2001|MSB3491|MSB3030|GeneratedMSBuildEditorConfig/iu.test(text);
				resolveBuild({
					project,
					ok: error === null,
					exit_code: error === null ? 0 : (error.code ?? 1),
					errors,
					warnings,
					locked,
					staleObject,
					tail: text.trim().split("\n").slice(-8).join("\n"),
				});
			},
		);
	});
}

export async function buildNetSolution(root, { timeoutMs = 180_000 } = {}) {
	const project = await findCsproj(root);
	// One plain build, because most runs are a fresh compile. Rebuild only when the
	// output says the object tree itself is the problem, and only once, so a real
	// code error still reports as a code error.
	let result = await runDotnetBuild(project, timeoutMs, BUILD_TARGETS.plain);
	if (!result.ok && result.staleObject && !result.locked) {
		const again = await runDotnetBuild(project, timeoutMs, BUILD_TARGETS.rebuild);
		result = { ...again, recovered: again.ok, first_errors: result.errors };
	}
	return result;
}
/**
 * NetLogic nodes in the live project: `[{ path, name }]`.
 *
 * One `map` of the whole project, because `/bridge/nodes` refuses an empty path
 * and one request per node would be hundreds. `map` in detail mode classifies a
 * NetLogic node as `type: "NetLogicObject"` (measured on Studio 1.8.1).
 */
export async function liveNetLogicNodes(request, signal, { depth = 8 } = {}) {
	const tree = await request("map", signal, { path: "", depth, mode: "detail", ids: 1, max: 4000 });
	const out = [];
	const walk = (node, path) => {
		if (node === void 0 || node === null || out.length > 400) return;
		const name = typeof node.name === "string" && node.name !== "" ? node.name : path.split("/").at(-1);
		const here = path === "" ? name : `${path}/${name}`;
		if (node.type === "NetLogicObject") {
			out.push({ path: here, name });
			return;
		}
		for (const child of node.children ?? []) {
			if (typeof child === "string") continue;
			walk(child, here);
		}
	};
	// `map` answers with the project folder as its root node, so the walk starts
	// at its children: a node's path must not carry the project name.
	for (const child of tree.map?.children ?? []) {
		if (typeof child === "string") continue;
		walk(child, "");
	}
	// The map has a node budget, so a big project truncates deep branches. The
	// author's own NetLogic folder is one cheap read and holds what this tool
	// creates, so merge it in before answering.
	try {
		const folder = await request("nodes", signal, { path: "NetLogic" });
		for (const child of folder?.children ?? []) {
			const name = child.browse_name ?? child.name;
			if (typeof name !== "string" || name === "") continue;
			if (out.some((node) => node.path === `NetLogic/${name}`)) continue;
			if ((child.dotnet_type ?? "") !== "BaseObject" && (child.node_class ?? "") !== "Object") continue;
			out.push({ path: `NetLogic/${name}`, name });
		}
	} catch {
		// no NetLogic folder: the map result is what we have
	}
	return out;
}

/**
 * Resolve one NetLogic node by name.
 *
 * The project map is the only route that lists nodes by kind, and a very large
 * project can truncate it, so a miss falls back to the folder author-added
 * NetLogic live in - `NetLogic/<name>` - before answering "not found".
 */
export async function findNetLogicNode(request, signal, name) {
	const nodes = await liveNetLogicNodes(request, signal).catch(() => []);
	const found = nodes.find((node) => node.name === name);
	if (found !== undefined) return found;
	try {
		const node = await request("nodes", signal, { path: `NetLogic/${name}` });
		if (node?.path !== void 0) return { path: `NetLogic/${name}`, name };
	} catch {
		return void 0;
	}
	return void 0;
}

export function netLogicReport(rootInfo, entry, extra = {}) {
	return {
		project_root: rootInfo.root,
		optix_file: rootInfo.optixFile,
		net_solution: netSolutionDir(rootInfo.root),
		name: entry.name,
		file: entry.file,
		kind: entry.kind,
		class_name: entry.className,
		export_methods: entry.exportMethods,
		has_start: entry.hasStart,
		has_stop: entry.hasStop,
		lines: entry.lines,
		bytes: entry.bytes,
		sha256: entry.sha256,
		...extra,
	};
}

export function describeRelative(file) {
	return relative(process.cwd(), file);
}
