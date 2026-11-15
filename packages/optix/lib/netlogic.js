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

export const TEMPLATES = ["blank", "periodic", "observer"];

export function templateCode({ name, kind = "runtime", template = "blank", stamp = new Date().toISOString().slice(0, 10) }) {
	checkName(name);
	if (!TEMPLATES.includes(template)) {
		throw new Error(`template must be one of ${TEMPLATES.join(", ")} (got ${String(template)})`);
	}
	if (kind === "design" && template !== "blank") {
		throw new Error(`a design-time NetLogic is a set of [ExportMethod] helpers - template ${template} starts background work, which belongs to a runtime class`);
	}
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
			`    private PeriodicTask task;\n` +
			`    private IUAVariable value;\n\n` +
			`    public override void Start()\n` +
			`    {\n` +
			`        // Resolve every node once, here: a per-tick lookup walks the model on\n` +
			`        // the timer thread and is the hot path the threading guide warns about.\n` +
			`        value = Project.Current.GetVariable("Model/Value");\n` +
			`        if (value == null)\n` +
			`        {\n` +
			`            Log.Error("${name}", "Model/Value not found - nothing to write");\n` +
			`            return;\n` +
			`        }\n` +
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
			`        try\n` +
			`        {\n` +
			`            // One step of machine behaviour. An exception that escapes a tick\n` +
			`            // stops the timer for the rest of the session, so it is caught here.\n` +
			`            value.Value = Convert.ToInt32(value.Value) + 1;\n` +
			`        }\n` +
			`        catch (Exception error)\n` +
			`        {\n` +
			`            Log.Error("${name}", "tick failed: " + error.Message);\n` +
			`        }\n` +
			`    }\n` +
			`}\n`
		);
	}
	if (template === "observer") {
		return (
			header +
			"\n" +
			usingBlock +
			`public class ${name} : BaseNetLogic\n{\n` +
			`    private IUAVariable watched;\n\n` +
			`    public override void Start()\n` +
			`    {\n` +
			`        watched = Project.Current.GetVariable("Model/Value");\n` +
			`        if (watched == null)\n` +
			`        {\n` +
			`            Log.Error("${name}", "Model/Value not found - not observing anything");\n` +
			`            return;\n` +
			`        }\n` +
			`        watched.VariableChange += OnValueChange;\n` +
			`    }\n\n` +
			`    public override void Stop()\n` +
			`    {\n` +
			`        // Unsubscribe every observer here: a subscription that outlives Stop\n` +
			`        // keeps this class alive with its page.\n` +
			`        if (watched != null) watched.VariableChange -= OnValueChange;\n` +
			`        watched = null;\n` +
			`    }\n\n` +
			`    private void OnValueChange(object sender, VariableChangeEventArgs e)\n` +
			`    {\n` +
			`        try\n` +
			`        {\n` +
			`            Log.Info("${name}", "value is now " + e.NewValue);\n` +
			`        }\n` +
			`        catch (Exception error)\n` +
			`        {\n` +
			`            Log.Error("${name}", "handler failed: " + error.Message);\n` +
			`        }\n` +
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
		name: entry.name ?? entry.className ?? "",
		file: entry.file,
		kind: entry.kind ?? "unknown",
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

// ---------------------------------------------------------------------------
// Practice review
//
// The compiler proves a class compiles; it says nothing about whether the class
// is safe in an Optix runtime. These checks encode the parts of the vendor
// NetLogic guide that are decidable from the source: lifecycle (dispose what
// Start created), threading (no blocking on the timer thread, no model lookups
// per tick), error isolation (an escaping exception kills a PeriodicTask),
// observer hygiene (every += has a -=), design-time discipline (no background
// work in a class Studio never starts), naming (the class name is the binding)
// and observability (a silent runtime class cannot be diagnosed).
//
// Sources are the pinned cheat-sheet pages: netlogic-lifecycle, threading,
// register-observers, log-output and good-practices. Each rule names the page
// it comes from so a reader can check the reasoning rather than trust it.
// ---------------------------------------------------------------------------

export const NETLOGIC_RULES = {
	"OPTIX-NL-03": {
		severity: "critical",
		title: "A PeriodicTask is created but never disposed",
		fix: "Dispose the task in Stop() and clear the field - a task that outlives its page keeps running.",
		source: "netlogic-lifecycle"
	},
	"OPTIX-NL-04": {
		severity: "warning",
		title: "The periodic tick has no try/catch",
		fix: "Wrap the tick body in try/catch and log with Log.Error: the first escaping exception ends the timer.",
		source: "threading"
	},
	"OPTIX-NL-05": {
		severity: "warning",
		title: "The model is read from inside the tick",
		fix: "Resolve nodes once in Start() and keep the handles in fields; per-tick lookups walk the model on the timer thread.",
		source: "threading"
	},
	"OPTIX-NL-06": {
		severity: "critical",
		title: "Blocking call on a NetLogic thread",
		fix: "Never block: no Thread.Sleep, .Wait(), .Result, GetAwaiter().GetResult() or async void. Dispatch work instead.",
		source: "threading"
	},
	"OPTIX-NL-07": {
		severity: "warning",
		title: "Empty catch block",
		fix: "Log the exception with Log.Error(category, message); a swallowed failure is invisible in the runtime.",
		source: "log-output"
	},
	"OPTIX-NL-08": {
		severity: "warning",
		title: "Event subscription without a matching unsubscribe",
		fix: "Unsubscribe (-=) in Stop() for every += in Start(); otherwise the observer keeps the class alive.",
		source: "register-observers"
	},
	"OPTIX-NL-09": {
		severity: "warning",
		title: "Design-time NetLogic starts background work",
		fix: "Studio never runs Start() at design time: background work belongs to a runtime class. Keep a design class to [ExportMethod]s.",
		source: "netlogic-lifecycle"
	},
	"OPTIX-NL-10": {
		severity: "critical",
		title: "Class name does not match the NetLogic node name",
		fix: "Rename the class (or the node) so they match - Optix binds the node to the class by name.",
		source: "good-practices"
	},
	"OPTIX-NL-11": {
		severity: "info",
		title: "The class logs nothing",
		fix: "Add Log.Info/Warning/Error with the class name as category, so the runtime output and the emulator log say what happened.",
		source: "log-output"
	},
	"OPTIX-NL-12": {
		severity: "info",
		title: "Node path is hard-coded in the source",
		fix: "Keep the path in one constant, or read through LogicObject/Owner, so a move in the project does not silently break the class.",
		source: "good-practices"
	},
	"OPTIX-NL-13": {
		severity: "warning",
		title: "SetImageContent is called where it cannot work yet",
		fix: "The cheat sheet records that SetImageContent does nothing at design time, and that it needs the drawing loaded - so an export method cannot use it and Start() may run before the presentation engine has the image. Move it to a runtime observer, or drive the SVG element properties instead - see advanced-svg.md and element-access.md.",
		source: "advanced-svg"
	}
};

const RULE_ORDER = Object.keys(NETLOGIC_RULES);

function lineAt(text, index) {
	return text.slice(0, Math.max(0, index)).split("\n").length;
}

/** Method headers with their brace-matched bodies, enough to reason about a class. */
export function methodBodies(code) {
	const text = String(code ?? "");
	const header = /\b(?:public|private|protected|internal)\s+(?:static\s+)?(?:override\s+)?(?:async\s+)?[\w<>\[\],.?\s]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{/gu;
	const out = [];
	let match;
	while ((match = header.exec(text)) !== null) {
		const open = text.indexOf("{", match.index + match[0].length - 1);
		if (open < 0) continue;
		let depth = 0;
		let end = open;
		for (; end < text.length; end += 1) {
			if (text[end] === "{") depth += 1;
			else if (text[end] === "}") {
				depth -= 1;
				if (depth === 0) break;
			}
		}
		out.push({ name: match[1], start: match.index, bodyStart: open + 1, end, body: text.slice(open + 1, end) });
	}
	return out;
}

/**
 * Static review of one NetLogic class.
 *
 * Answers `clean` / `review` / `block`; every finding names the rule, the line,
 * what is wrong and what to change. It reasons over source text, so it is a
 * guardrail, not a proof: the build and the runtime still decide.
 */
export function reviewNetLogic(code, { name = "", kind = "runtime" } = {}) {
	const text = String(code ?? "");
	const info = parseClass(text);
	const methods = methodBodies(text);
	const stop = methods.find((method) => method.name === "Stop");
	const findings = [];
	const add = (rule, index, message) => {
		const spec = NETLOGIC_RULES[rule];
		findings.push({
			rule,
			severity: spec.severity,
			source: spec.source,
			line: lineAt(text, index),
			message,
			fix: spec.fix
		});
	};

	const taskCall = /new\s+PeriodicTask\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)/u.exec(text);
	if (taskCall !== null) {
		const stopBody = stop === void 0 ? "" : stop.body;
		if (!/\.Dispose\s*\(\s*\)/u.test(stopBody)) add("OPTIX-NL-03", taskCall.index, "new PeriodicTask is created but Stop() does not dispose it");
		const tickName = taskCall[1];
		const tick = methods.find((method) => method.name === tickName);
		if (tick !== void 0) {
			if (!/\btry\b/u.test(tick.body)) add("OPTIX-NL-04", tick.bodyStart, `${tickName}() has no try/catch, so one exception ends the timer`);
			const lookup = /Project\.Current/u.exec(tick.body);
			if (lookup !== null) add("OPTIX-NL-05", tick.bodyStart + lookup.index, `${tickName}() reads Project.Current on the timer thread - cache the node in Start()`);
		}
	}

	for (const pattern of [
		{ re: /Thread\.Sleep\s*\(/u, what: "Thread.Sleep" },
		{ re: /\.Wait\s*\(\s*\)/u, what: ".Wait()" },
		{ re: /\.Result\b/u, what: ".Result" },
		{ re: /GetAwaiter\s*\(\s*\)\s*\.\s*GetResult\s*\(\s*\)/u, what: "GetAwaiter().GetResult()" },
		{ re: /\basync\s+void\b/u, what: "async void" }
	]) {
		const hit = pattern.re.exec(text);
		if (hit !== null) add("OPTIX-NL-06", hit.index, `${pattern.what} blocks a NetLogic thread`);
	}

	const emptyCatch = /catch\s*(?:\([^)]*\))?\s*\{\s*\}/u.exec(text);
	if (emptyCatch !== null) add("OPTIX-NL-07", emptyCatch.index, "empty catch block swallows the failure");

	const subscribe = /\.(?:VariableChange|VariableChangeEvent|ValueChange)\s*\+=/u.exec(text);
	if (subscribe !== null && !/\.(?:VariableChange|VariableChangeEvent|ValueChange)\s*-=/u.test(text)) {
		add("OPTIX-NL-08", subscribe.index, "subscribes to a change event but never unsubscribes in Stop()");
	}

	if (kind === "design") {
		const designTask = /(?:new\s+PeriodicTask|new\s+System\.Threading\.Thread|new\s+Thread\s*\(|Task\.Run\s*\(|new\s+(?:System\.Threading\.Tasks\.)?Task\s*[<(]|new\s+System\.Timers\.Timer)/u.exec(text);
		if (designTask !== null) add("OPTIX-NL-09", designTask.index, "a design-time class starts background work Studio will never run");
	}

	if (info.className !== "" && name !== "" && info.className !== name) {
		add("OPTIX-NL-10", CLASS_PATTERN.exec(text)?.index ?? 0, `class ${info.className} does not match the node name ${name}`);
	}

	if (!/\bLog\.(?:Debug|Info|Warning|Error|Verbose1|Verbose2)\s*\(/u.test(text)) {
		add("OPTIX-NL-11", 0, "no Log call: the runtime and emulator output stay silent about this class");
	}

	const hardPath = /"(?:Model|UI)\//u.exec(text);
	if (hardPath !== null) add("OPTIX-NL-12", hardPath.index, "node path is a string literal");

	// The cheat sheet records SetImageContent as working only once the drawing is
	// loaded, and not at design time at all - so a design-time class and a Start()
	// body are both the wrong place for it.
	const setImageContent = /\.SetImageContent\s*\(/u.exec(text);
	if (setImageContent !== null) {
		const start = methods.find((method) => method.name === "Start");
		const inStart = start !== void 0 && setImageContent.index >= start.bodyStart && setImageContent.index <= start.end;
		if (kind === "design") {
			add("OPTIX-NL-13", setImageContent.index, "SetImageContent does nothing at design time (advanced-svg.md)");
		} else if (inStart) {
			add("OPTIX-NL-13", setImageContent.index, "SetImageContent in Start() may run before the drawing is loaded (advanced-svg.md)");
		}
	}

	findings.sort((a, b) => a.line - b.line || RULE_ORDER.indexOf(a.rule) - RULE_ORDER.indexOf(b.rule));
	const counts = { critical: 0, warning: 0, info: 0 };
	for (const finding of findings) counts[finding.severity] += 1;
	const verdict = counts.critical > 0 ? "block" : counts.warning > 0 ? "review" : "clean";
	return {
		verdict,
		counts,
		findings,
		checked: RULE_ORDER,
		note: "Static review of the C# only: it does not prove the class is loaded, and Studio still has to build the solution."
	};
}
