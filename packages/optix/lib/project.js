import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import yaml from "js-yaml";
import { studioProcesses } from "./emulator.js";
import { findProjectRoot } from "./netlogic.js";
/**
 * The file-level authoring channel: read, validate, stage and apply changes to an Optix
 * project on disk, with the gates that make an external writer safe.
 *
 * An Optix project is plain YAML under `Nodes/` plus a C# NetLogic solution under
 * `ProjectFiles/NetSolution`, so much of what the Studio bridge refuses (security users and
 * roles, node descriptions, analog ranges, absolute pointers, whole-project scaffolds) can be
 * written directly. What makes that dangerous is that Studio persists its own in-memory model
 * on a save: a file written while Studio has the project open is overwritten or duplicated.
 * This channel therefore refuses while Studio has the project open, stages and validates every
 * plan first, and backs up every file it writes.
 *
 * Node addressing: a `- File:` entry in a chapter's `Children` loads another file's node in
 * that position, so the project tree is the tree of files, not the tree of one file. Project
 * paths (`UI/Screens/Home`) resolve through that tree; operation paths (`node_path`) are
 * relative to the file named in the operation, where `""` means that file's root node.
 *
 * Nothing here contacts a controller or drives a window: Studio is detected by asking Windows
 * for its process command line, which is a process query, not window automation.
 * @module
 */

/** Where staged plans and per-apply backups live inside the project. */
export const WORK_DIR = "ProjectFiles/.dsh-backups";
/** A lock older than this is stale even when its owner cannot be checked. */
const LOCK_STALE_MS = 10 * 60_000;
/** A single file this channel will read, stage or write. */
const MAX_FILE_BYTES = 4 * 1024 * 1024;
/** A plan larger than this is refused rather than half applied. */
const MAX_STAGE_FILES = 400;

/**
 * Node types Studio accepts that its Help reference does not document.
 *
 * `BaseDataVariableType`, `PropertyType`, `NodePointer` and the rest are OPC-UA base types
 * every project uses and the Studio Help does not page; template-library types (`NavButton`,
 * `AlarmManagerButtonIcon`, …) ship inside Studio's library folders and are equally absent.
 * A type check that called them unknown would bury a real finding under ten thousand rows.
 */
export const BUILTIN_TYPES = new Set([
	"Folder", "Object", "Reference", "Variable",
	"BaseObjectType", "ObjectType", "FolderType", "BaseVariableType", "BaseDataVariableType",
	"PropertyType", "DataItemType", "AnalogItemType", "DiscreteItemType", "TwoStateDiscreteType",
	"MultiStateDiscreteType", "MultiStateValueDiscreteType", "AnalogUnitType", "AnalogUnitRangeType",
	"BaseEventType", "BaseEvent", "EventType", "ConditionType", "AcknowledgeableConditionType",
	"AlarmConditionType", "ReferenceType", "DataTypeDictionaryType", "DataTypeDescriptionType",
	"DynamicLink", "Alias", "NodePointer", "BehaviourStartPriorityVariableType"
]);

/** Optix writes YAML with string keys; anything else is not a project document. */
function isPlainObject(value) {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A sha256 of text, which is how a staged plan notices a file changed underneath it. */
export function digestText(text) {
	return createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
}

/** A path relative to the project root, with forward slashes. */
export function projectPath(root, file) {
	return relative(root, file).split(sep).join("/");
}

/** Read a text file, refusing one too large to stage safely. */
async function readText(file) {
	const info = await stat(file);
	if (info.size > MAX_FILE_BYTES) {
		throw new Error(`${file} is ${Math.round(info.size / 1024)} KB; this channel stages files under ${MAX_FILE_BYTES / 1024} KB`);
	}
	return await readFile(file, "utf8");
}

/** Read a file when it exists, or `undefined` when it does not. */
async function maybeRead(file) {
	try {
		return await readText(file);
	} catch (error) {
		if (error?.code === "ENOENT") return undefined;
		throw error;
	}
}

/** Parse one chapter file's text into the shape the tree walk needs. */
function parseChapter(key, text, root) {
	const entry = { file: join(root, "Nodes", key.split("/").join(sep)), path: `Nodes/${key}`, text, sha256: digestText(text) };
	try {
		entry.doc = yaml.load(text);
		if (!isPlainObject(entry.doc) || typeof entry.doc.Name !== "string") entry.error = "not a node document (no Name)";
	} catch (error) {
		entry.error = `does not parse as YAML: ${error.message}`;
	}
	return entry;
}

/**
 * Locate a project folder and read its identity.
 *
 * `project_root` is authoritative: a folder holding several `.optix` files is resolved by
 * `Project.Name` and refused when that is ambiguous, because writing into the wrong project
 * is the one mistake this channel cannot detect afterwards.
 * @param project - Project BrowseName.
 * @param projectRoot - Optional folder that holds `<project>.optix`.
 */
export async function projectInfo(project, projectRoot) {
	const located = typeof projectRoot === "string" && projectRoot.trim() !== ""
		? await locateInFolder(projectRoot.trim(), project)
		: await findProjectRoot(project, projectRoot);
	const text = await readText(located.optixFile);
	let doc;
	try {
		doc = yaml.load(text);
	} catch (error) {
		throw new Error(`${located.optixFile} is not valid YAML: ${error.message}`);
	}
	if (!isPlainObject(doc) || !isPlainObject(doc.Project) || typeof doc.Project.Name !== "string") {
		throw new Error(`${located.optixFile} carries no Project.Name - is it an Optix project file?`);
	}
	const name = doc.Project.Name;
	return {
		root: located.root,
		optixFile: located.optixFile,
		designFile: join(located.root, `${name}.optix.design`),
		name,
		doc,
		optixText: text
	};
}

/** Resolve `project_root`, preferring the `.optix` whose Project.Name matches the request. */
async function locateInFolder(folder, project) {
	let entries;
	try {
		entries = await readdir(folder);
	} catch {
		throw new Error(`no folder ${folder}`);
	}
	const files = entries.filter((entry) => entry.toLowerCase().endsWith(".optix") && !entry.toLowerCase().endsWith(".optix.design"));
	if (files.length === 0) throw new Error(`no .optix file in ${folder} - point project_root at the folder that holds it`);
	if (files.length > 1) {
		const matches = [];
		for (const file of files) {
			try {
				const doc = yaml.load(await readFile(join(folder, file), "utf8"));
				if (isPlainObject(doc) && isPlainObject(doc.Project) && doc.Project.Name === project) matches.push(file);
			} catch {
				// a broken sibling file is not this project
			}
		}
		if (matches.length === 1) return { root: folder, optixFile: join(folder, matches[0]) };
		throw new Error(`${folder} holds ${files.length} .optix files (${files.join(", ")}) - pass project_root for ${project}`);
	}
	return { root: folder, optixFile: join(folder, files[0]) };
}

/** Every YAML file under `Nodes/`, absolute paths. */
async function nodeYamlFiles(root) {
	const found = [];
	async function walk(folder) {
		let entries;
		try {
			entries = await readdir(folder, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			const file = join(folder, entry.name);
			if (entry.isDirectory()) {
				await walk(file);
				continue;
			}
			if (/\.ya?ml$/iu.test(entry.name)) found.push(file);
		}
	}
	await walk(join(root, "Nodes"));
	return found.sort();
}

/**
 * Read every chapter file, parsed, keyed by its path relative to `Nodes/`.
 * @param rootInfo - Result of {@link projectInfo}.
 */
export async function readChapters(rootInfo) {
	const files = new Map();
	for (const file of await nodeYamlFiles(rootInfo.root)) {
		const key = projectPath(join(rootInfo.root, "Nodes"), file);
		files.set(key, parseChapter(key, await readText(file), rootInfo.root));
	}
	return files;
}

/** Child entries of a node document that are nodes, not file registrations. */
function childNodes(doc) {
	return Array.isArray(doc?.Children) ? doc.Children.filter((child) => isPlainObject(child) && typeof child.File !== "string") : [];
}

/** File registrations in a node document. */
function childFiles(doc) {
	return Array.isArray(doc?.Children) ? doc.Children.filter((child) => isPlainObject(child) && typeof child.File === "string").map((child) => String(child.File).replace(/\\/gu, "/")) : [];
}

/**
 * Resolve a `- File:` registration against the directory of the chapter that contains it.
 *
 * Studio writes these relative to the registering file, not to `Nodes/`: `Nodes/UI/UI.yaml`
 * registers `Screens/Screens.yaml`, which is `Nodes/UI/Screens/Screens.yaml`. The project file
 * itself registers `Nodes/<Project>.yaml`, which is the one form rooted at `Nodes/`.
 * @param baseKey - The registering chapter's key (`""` for the project file).
 * @param relPath - The `File:` value as written.
 */
function chapterKey(baseKey, relPath) {
	let raw = String(relPath ?? "").replace(/\\/gu, "/").trim();
	if (raw === "") return "";
	if (raw.startsWith("Nodes/")) raw = raw.slice("Nodes/".length);
	const parts = baseKey === "" ? [] : baseKey.split("/").slice(0, -1);
	for (const segment of raw.split("/")) {
		if (segment === "" || segment === ".") continue;
		if (segment === "..") parts.pop();
		else parts.push(segment);
	}
	return parts.join("/");
}

/**
 * Resolve the project tree from already-parsed chapters.
 *
 * A chapter file's node is only a node in the project where a parent registers it, so the
 * tree is built from the root file in `Project.Nodes` and each registration replaces the entry
 * with that file's root node. A cycle (a file that registers itself, directly or through
 * another) is reported as a critical finding instead of hanging the walk.
 * @param rootDoc - The parsed `.optix` document.
 * @param chapters - Map of chapter key to parsed chapter, from {@link readChapters}.
 */
export function resolveTree(rootDoc, chapters) {
	const problems = [];
	const visited = new Set();
	const reached = new Set();
	const tree = [];
	const buildChildren = (doc, path, file, chapterKey) => {
		const out = [];
		for (const child of childNodes(doc)) {
			out.push({ name: child.Name, type: child.Type, class: child.Class, file, chapter: chapterKey, doc: child, path: `${path}/${child.Name}`, children: buildChildren(child, `${path}/${child.Name}`, file, chapterKey) });
		}
		return out;
	};
	const resolveFile = (relPath, baseKey, parentPath, depth) => {
		const key = chapterKey(baseKey, relPath);
		const chapter = chapters.get(key);
		if (chapter === undefined) {
			problems.push({ severity: "critical", code: "file_missing", message: `${parentPath || "the project"} registers ${key}, which does not exist`, file: key });
			return [];
		}
		if (chapter.error !== undefined) {
			problems.push({ severity: "critical", code: "yaml_invalid", message: `${chapter.path}: ${chapter.error}`, file: chapter.path });
			return [];
		}
		if (visited.has(key)) {
			problems.push({ severity: "critical", code: "file_cycle", message: `${key} is registered more than once and would load twice`, file: key });
			return [];
		}
		if (depth > 12) {
			problems.push({ severity: "critical", code: "file_depth", message: `registrations nest deeper than 12 files at ${parentPath || "the project"}`, file: key });
			return [];
		}
		visited.add(key);
		reached.add(key);
		const node = { name: chapter.doc.Name, type: chapter.doc.Type, file: chapter.path, chapter: key, doc: chapter.doc, children: [] };
		const here = parentPath === "" ? node.name : `${parentPath}/${node.name}`;
		for (const child of childNodes(chapter.doc)) {
			node.children.push({ name: child.Name, type: child.Type, class: child.Class, file: chapter.path, chapter: key, doc: child, path: `${here}/${child.Name}`, children: buildChildren(child, `${here}/${child.Name}`, chapter.path, key) });
		}
		for (const registration of childFiles(chapter.doc)) {
			for (const loaded of resolveFile(registration, key, here, depth + 1)) node.children.push(loaded);
		}
		visited.delete(key);
		return [node];
	};
	const rootRegistration = (rootDoc.Project?.Nodes ?? []).find((entry) => isPlainObject(entry) && typeof entry.File === "string");
	if (rootRegistration === undefined) {
		problems.push({ severity: "critical", code: "project_root_missing", message: "the project file lists no chapter in Project.Nodes" });
	} else {
		for (const loaded of resolveFile(String(rootRegistration.File).replace(/\\/gu, "/"), "", "", 0)) tree.push(loaded);
	}
	for (const [key, chapter] of chapters) {
		if (chapter.error === undefined && !reached.has(key)) {
			problems.push({ severity: "warning", code: "file_unregistered", message: `${chapter.path} is under Nodes/ but no chapter registers it, so Studio does not load it`, file: chapter.path });
		}
	}
	return { tree, problems };
}

/**
 * The project tree, following `- File:` registrations from the chapter on disk.
 * @param rootInfo - Result of {@link projectInfo}.
 */
export async function projectTree(rootInfo) {
	const chapters = await readChapters(rootInfo);
	const { tree, problems } = resolveTree(rootInfo.doc, chapters);
	return { tree, chapters, problems };
}

/** Walk a resolved tree depth first, calling back with the node and its project path. */
function walkTree(nodes, visit, parents = []) {
	for (const node of nodes) {
		const here = [...parents, node.name].join("/");
		visit(node, here);
		walkTree(node.children, visit, [...parents, node.name]);
	}
}

/**
 * Validate the project's YAML against the invariants an edit can break.
 *
 * These are the failures measured on this machine: a `- File:` entry whose target is gone,
 * two children sharing one name, an absolute `/Objects/<name>/` pointer that still names an
 * old project (login silently changes the wrong user folder), a Reference without a Target,
 * and a node whose type this Studio catalog does not list.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param options - `planned` maps a project-relative path to the text it should have;
 *   `typeCheck` validates a node type against the Studio catalog.
 */
export async function validateProject(rootInfo, { planned = new Map(), typeCheck } = {}) {
	const findings = [];
	const critical = (code, message, where = {}) => findings.push({ severity: "critical", code, message, ...where });
	const warning = (code, message, where = {}) => findings.push({ severity: "warning", code, message, ...where });
	const note = (code, message, where = {}) => findings.push({ severity: "info", code, message, ...where });
	let rootDoc = rootInfo.doc;
	if (planned.has(".optix")) {
		try {
			rootDoc = yaml.load(planned.get(".optix"));
		} catch (error) {
			return {
				project: rootInfo.name,
				project_root: rootInfo.root,
				ok: false,
				critical: 1,
				warnings: 0,
				findings: [{ severity: "critical", code: "yaml_invalid", message: `${basename(rootInfo.optixFile)} does not parse: ${error.message}`, file: basename(rootInfo.optixFile) }],
				next: "The planned project file is not valid YAML."
			};
		}
	}
	const projectName = isPlainObject(rootDoc?.Project) && typeof rootDoc.Project.Name === "string" ? rootDoc.Project.Name : rootInfo.name;
	const chapters = await readChapters(rootInfo);
	for (const [path, text] of planned) {
		if (!/^Nodes\/.+\.ya?ml$/u.test(path)) continue;
		const key = path.replace(/^Nodes\//u, "");
		chapters.set(key, parseChapter(key, text, rootInfo.root));
	}
	const { tree, problems } = resolveTree(rootDoc, chapters);
	findings.push(...problems);
	for (const chapter of chapters.values()) {
		if (chapter.error !== undefined && !findings.some((finding) => finding.code === "yaml_invalid" && finding.file === chapter.path)) {
			critical("yaml_invalid", `${chapter.path}: ${chapter.error}`, { file: chapter.path });
		}
	}
	const seenPointers = new Set();
	walkTree(tree, (node, path) => {
		const seen = new Set();
		for (const child of node.children) {
			// A `- File:` entry is a chapter registration, not a node: it has no Name and no Type.
			if (isPlainObject(child.doc) && typeof child.doc.File === "string") continue;
			// `Class: Reference` entries ({Target, Direction}) are inbound links, not named nodes.
			if (child.doc?.Class === "Reference") {
				if (typeof child.doc.Target !== "string") critical("reference_without_target", `${child.file}: a Reference under ${path} has no Target`, { file: child.file, path });
				scanPointers(child.doc, child.file, path, projectName, warning, seenPointers);
				continue;
			}
			if (typeof child.name !== "string" || child.name === "") {
				critical("node_name_missing", `${child.file}: a ${child.type ?? "(unknown)"} under ${path} has no Name`, { file: child.file, path });
				continue;
			}
			// Studio itself saves files with a repeated property node, so this is reported but
			// does not block an edit: it is a warning for the reviewer, not a broken project.
			if (seen.has(child.name)) warning("duplicate_name", `${path}/${child.name} appears twice under ${path} in ${child.file}; Studio tolerates it but an edit should not add a third`, { file: child.file, path: `${path}/${child.name}` });
			seen.add(child.name);
			const known = BUILTIN_TYPES.has(child.type) || (typeof typeCheck === "function" && typeCheck(child.type));
			if (typeof typeCheck === "function" && typeof child.type === "string" && !known) {
				note("unknown_type", `${child.file}: ${path}/${child.name} has type ${child.type}, which the Studio Help catalog does not document (a library type is normal here)`, { file: child.file, path: `${path}/${child.name}` });
			}
			scanPointers(child.doc, child.file, path, projectName, warning, seenPointers);
		}
	});
	return {
		project: projectName,
		project_root: rootInfo.root,
		ok: findings.every((finding) => finding.severity !== "critical"),
		critical: findings.filter((finding) => finding.severity === "critical").length,
		warnings: findings.filter((finding) => finding.severity === "warning").length,
		findings,
		next: findings.length === 0
			? "Every chapter resolves, sibling names are unique and absolute pointers name this project."
			: "Fix the critical findings first: Studio would open this project with a missing chapter, a duplicate name or a pointer at another project."
	};
}

/**
 * Scan one node's own values for an absolute `/Objects/<root>/…` pointer.
 *
 * A pointer at a root other than the project name is normal — library objects mount under
 * their own root (`/Objects/Users/Anonymous`, `/Objects/Commands/UICommands`) — so this is a
 * warning, not a critical: after a rename it is the signature of a pointer the rename missed.
 */
function scanPointers(doc, file, path, projectName, warn, seen) {
	const visit = (value, where) => {
		if (typeof value === "string") {
			const pointer = /^\/Objects\/([^/]+)\//u.exec(value);
			if (pointer !== null && pointer[1] !== projectName) {
				const key = `${file}|${value}`;
				if (!seen.has(key)) {
					seen.add(key);
					warn("absolute_pointer_foreign_root", `${file}: ${where} points at /Objects/${pointer[1]}/…, which is not this project (${projectName}); normal for a library root, a bug after a rename`, { file, value });
				}
			}
			return;
		}
		if (Array.isArray(value)) {
			value.forEach((item, index) => visit(item, `${where}[${index}]`));
			return;
		}
		if (!isPlainObject(value)) return;
		for (const [key, child] of Object.entries(value)) visit(child, `${where === "" ? path : where}/${key}`);
	};
	for (const [key, value] of Object.entries(doc)) {
		if (key === "Children") continue;
		visit(value, `${path}/${key}`);
	}
}

/** Normalize a path for command-line comparison, because Windows reports either case. */
function normalize(value) {
	return String(value).replace(/\//gu, "\\").replace(/\\+/gu, "\\").toLowerCase();
}

/**
 * Whether Studio currently has this project open, and whether any Studio is running.
 *
 * A lock probe cannot answer this: measured on Studio 1.8.1.27, an exclusive open of the
 * `.optix` file succeeds while the project is open, because Studio holds the model in memory
 * and writes the file only on save. The process command line does carry the project path, so
 * that is the evidence used.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param options - `processes` overrides the Windows query, which is how tests prove the gate.
 */
export async function studioState(rootInfo, { processes } = {}) {
	const rows = processes ?? await studioProcesses();
	const optix = normalize(rootInfo.optixFile);
	const folder = normalize(rootInfo.root);
	const open = rows.filter((row) => {
		const line = normalize(row.command_line ?? "");
		return line.includes(optix) || line.includes(`${folder}\\`);
	});
	return {
		studio_open: open.length > 0,
		studio_processes: rows.length,
		pids: open.map((row) => row.pid),
		command_lines: open.map((row) => row.command_line),
		other_studio_processes: rows.length - open.length
	};
}

/**
 * The write lock: one external writer per project at a time.
 * @param root - Project folder.
 * @param label - What is being written, for the refusal message.
 */
export async function acquireWriteLock(root, label = "an apply") {
	const file = join(root, ".dsh-write.lock");
	let existing;
	try {
		existing = JSON.parse(await readFile(file, "utf8"));
	} catch {
		existing = undefined;
	}
	if (isPlainObject(existing) && Number.isFinite(existing.at) && Date.now() - existing.at < LOCK_STALE_MS) {
		throw new Error(`another write is in progress on this project (${existing.label ?? "unknown"}, pid ${existing.pid ?? "?"}, started ${new Date(existing.at).toISOString()}). If that process is gone, delete ${file}`);
	}
	await writeFile(file, `${JSON.stringify({ pid: process.pid, at: Date.now(), label })}\n`, "utf8");
	return {
		file,
		release: async () => {
			await rm(file, { force: true });
		}
	};
}

/**
 * The gate report a file write has to pass, and the reason it cannot when it does not.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param options - `bridgePending` counts bridge changes Studio has not saved; `label` names
 *   the pending write; `processes` overrides the Windows process query (tests).
 */
export async function projectGates(rootInfo, { bridgePending = 0, label = "an apply", processes } = {}) {
	const studio = await studioState(rootInfo, { processes });
	const lockFile = join(rootInfo.root, ".dsh-write.lock");
	let lock;
	try {
		const held = JSON.parse(await readFile(lockFile, "utf8"));
		lock = isPlainObject(held) && Number.isFinite(held.at) && Date.now() - held.at < LOCK_STALE_MS
			? { held: true, pid: held.pid, label: held.label, started: new Date(held.at).toISOString() }
			: { held: false, stale: isPlainObject(held) };
	} catch {
		lock = { held: false };
	}
	const blockers = [];
	if (studio.studio_open) {
		blockers.push({
			code: "project_open_in_studio",
			message: `Studio has this project open (pid ${studio.pids.join(", ")}). Studio holds the model in memory and writes the whole project on save, so a file written now is overwritten or duplicated.`,
			next: "Close the project in Studio (or use the bridge while it is open), then apply."
		});
	}
	if (bridgePending > 0) {
		blockers.push({
			code: "bridge_state_unflushed",
			message: `${bridgePending} bridge change${bridgePending === 1 ? "" : "s"} exist in Studio's live model and are not saved to disk. Writing files now would discard them or be discarded by them.`,
			next: "Save in Studio (Ctrl+S, then Ctrl+Shift+B), confirm with optix_status {saved:true}, then apply."
		});
	}
	if (lock.held) {
		blockers.push({
			code: "write_in_progress",
			message: `Another write is in progress (${lock.label ?? "unknown"}, pid ${lock.pid ?? "?"}, started ${lock.started}).`,
			next: `Wait for it to finish, or delete ${lockFile} if that process is gone.`
		});
	}
	return {
		project: rootInfo.name,
		project_root: rootInfo.root,
		studio: { open: studio.studio_open, pids: studio.pids, other_instances: studio.other_studio_processes },
		bridge_pending: bridgePending,
		label,
		lock,
		can_write: blockers.length === 0,
		blockers,
		next: blockers.length === 0
			? (studio.studio_processes > 0 ? "Studio is running on another project; writing this one is safe." : "Studio is not running; the file channel can write.")
			: blockers[0].next
	};
}

/** The operations this channel accepts. */
const OP_KINDS = new Set(["write_file", "replace_text", "insert_node", "remove_node", "set_node_value", "set_project_name"]);

/** Whether a path is one this channel may write. */
function writablePath(rootInfo, path) {
	const normalized = String(path ?? "").replace(/\\/gu, "/");
	if (normalized === "" || normalized.includes("..") || normalized.startsWith("/")) return false;
	if (normalized === `${rootInfo.name}.optix` || normalized === `${rootInfo.name}.optix.design`) return true;
	if (/^Nodes\/.+\.ya?ml$/u.test(normalized)) return true;
	if (/^ProjectFiles\/NetSolution\/.+\.(cs|csproj|sln|references)$/u.test(normalized)) return true;
	if (/^ProjectFiles\/(imgs|res)\/.+\.(svg|png|jpe?g)$/u.test(normalized)) return true;
	return false;
}

/** A node path split into segments; empty is allowed and means the file's root node. */
function nodePath(value) {
	const text = String(value ?? "").trim().replace(/\\/gu, "/");
	if (text === "") return [];
	return text.split("/").filter((part) => part !== "" && part !== ".");
}

/** Escape a string for a literal use inside a regular expression. */
function escapeRegExp(value) {
	return String(value).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/** The YAML scalar form Studio writes. */
function scalar(value) {
	if (typeof value === "number" || typeof value === "boolean") return String(value);
	const text = String(value ?? "");
	if (text === "") return "''";
	if (/^[A-Za-z0-9_]+$/u.test(text)) return text;
	if (text.includes("'")) return JSON.stringify(text);
	if (/^[A-Za-z][A-Za-z0-9_. -]*$/u.test(text)) return text;
	return `'${text}'`;
}

/** Render one node as Studio-styled YAML lines; children indented under it. */
function nodeLines(node, dashIndent) {
	const lines = [];
	const pad = " ".repeat(dashIndent);
	const keys = ["Name", "Type", "Class", "Target", "DataType", "ValueRank", "ArrayDimensions", "Value", "WriteMask", "AccessLevel", "Description", "DisplayName"];
	let first = true;
	for (const key of keys) {
		if (node[key] === undefined) continue;
		lines.push(`${first ? `${pad}- ` : `${pad}  `}${key}: ${scalar(node[key])}`);
		first = false;
	}
	if (first) throw new Error("a node needs at least a Name and a Type");
	const children = Array.isArray(node.Children) ? node.Children.filter(isPlainObject) : [];
	if (children.length > 0) {
		lines.push(`${pad}  Children:`);
		for (const child of children) lines.push(...nodeLines(child, dashIndent + 2));
	}
	return lines;
}

/** The line range of a list-item node inside one chapter file, by path relative to its root. */
function locateNode(text, path) {
	const parts = nodePath(path);
	if (parts.length === 0) throw new Error("locateNode needs a non-empty path");
	const lines = text.split("\n");
	const stack = [];
	for (let index = 0; index < lines.length; index += 1) {
		const match = /^(\s*)-\s+Name:\s*(.+?)\s*$/u.exec(lines[index]);
		if (match === null) continue;
		const indent = match[1].length;
		const name = match[2].replace(/^['"]|['"]$/gu, "");
		while (stack.length > 0 && stack.at(-1).indent >= indent) stack.pop();
		stack.push({ indent, name });
		const names = stack.map((entry) => entry.name);
		if (names.length === parts.length && names.every((value, position) => value === parts[position])) {
			return { start: index, indent, end: blockEnd(lines, index, indent) };
		}
	}
	return undefined;
}

/** The last line belonging to the block that starts at `start`. */
function blockEnd(lines, start, indent) {
	let end = start;
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index];
		if (line.trim() === "") {
			end = index;
			continue;
		}
		const own = /^(\s*)/u.exec(line)[1].length;
		if (own < indent) break;
		if (own === indent && /^-\s/u.test(line)) break;
		end = index;
	}
	return end;
}

/** Find a line matching a pattern inside an inclusive range. */
function findLine(lines, start, end, pattern) {
	for (let index = start; index <= end && index < lines.length; index += 1) {
		const match = pattern.exec(lines[index]);
		if (match !== null) return { index, indent: match[1].length };
	}
	return undefined;
}

/**
 * Apply one declarative operation to a working map of file texts.
 *
 * The map is seeded lazily from disk, so an operation may target a file another operation in
 * the same plan creates. No file is written here: this is the dry run every apply re-validates.
 * @param working - `Map` of project-relative path to text.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param op - One operation.
 */
async function planOp(working, rootInfo, op) {
	if (!isPlainObject(op) || typeof op.op !== "string") throw new Error("every operation needs an op name");
	if (!OP_KINDS.has(op.op)) throw new Error(`unknown operation ${op.op}; use ${[...OP_KINDS].join(", ")}`);
	if (op.op === "set_project_name") return await planRename(working, rootInfo, op);
	const path = String(op.path ?? "").replace(/\\/gu, "/");
	if (!writablePath(rootInfo, path)) {
		throw new Error(`${path || "(no path)"} is not a path this channel writes: Nodes/*.yaml, ProjectFiles/NetSolution/*.{cs,csproj,sln,references}, the project's two project files, ProjectFiles/{imgs,res} assets`);
	}
	const diskPath = join(rootInfo.root, path.split("/").join(sep));
	const current = async () => {
		if (working.has(path)) return working.get(path);
		const text = await maybeRead(diskPath);
		if (text === undefined) throw new Error(`${path}: no such file`);
		working.set(path, text);
		return text;
	};
	if (op.op === "write_file") {
		if (typeof op.content !== "string") throw new Error(`write_file ${path} needs content`);
		if (Buffer.byteLength(op.content) > MAX_FILE_BYTES) throw new Error(`${path} content exceeds ${MAX_FILE_BYTES / 1024} KB`);
		const before = working.has(path) ? working.get(path) : await maybeRead(diskPath);
		if (before !== undefined && op.expect_sha256 !== undefined && digestText(before) !== op.expect_sha256) {
			throw new Error(`write_file ${path}: its sha256 is ${digestText(before)}, not ${op.expect_sha256} - read it again`);
		}
		working.set(path, op.content);
		return { op: op.op, path, bytes: Buffer.byteLength(op.content), created: before === undefined };
	}
	if (op.op === "replace_text") {
		if (typeof op.find !== "string" || op.find === "") throw new Error(`replace_text ${path} needs find`);
		if (typeof op.replace !== "string") throw new Error(`replace_text ${path} needs replace`);
		const count = Number.isFinite(op.count) ? op.count : 1;
		const before = await current();
		const occurrences = before.split(op.find).length - 1;
		if (occurrences !== count) throw new Error(`replace_text ${path}: found ${occurrences} occurrences of ${JSON.stringify(op.find)}, expected ${count}`);
		working.set(path, before.split(op.find).join(op.replace));
		return { op: op.op, path, occurrences };
	}
	const before = await current();
	const text = working.get(path);
	const parts = nodePath(op.node_path);
	const lines = text.split("\n");
	if (op.op === "insert_node") {
		if (!isPlainObject(op.node) || typeof op.node.Name !== "string" || typeof op.node.Type !== "string") throw new Error("insert_node needs node: { Name, Type, ... }");
		let index;
		let indent;
		if (parts.length === 0) {
			// The file's own node is a mapping; its Children list is the last key in Studio's files.
			const children = findLine(lines, 0, lines.length - 1, /^(\s*)Children:\s*$/u);
			if (children === undefined) throw new Error(`insert_node: ${path}'s root node has no Children list`);
			indent = children.indent;
			index = children.index + 1;
		} else {
			const parent = locateNode(text, parts.join("/"));
			if (parent === undefined) throw new Error(`insert_node: no node ${parts.join("/")} in ${path}`);
			const children = findLine(lines, parent.start, parent.end, /^(\s*)Children:\s*$/u);
			if (children === undefined) {
				// A node without children yet: add the key at the item's key indent, then the item.
				indent = parent.indent + 2;
				index = parent.end + 1;
				lines.splice(index, 0, `${" ".repeat(indent)}Children:`, ...nodeLines(op.node, indent));
				working.set(path, lines.join("\n"));
				return { op: op.op, path, node: [...parts, op.node.Name].join("/"), lines: nodeLines(op.node, indent).length + 1 };
			}
			indent = children.indent;
			index = children.index + 1;
		}
		const block = nodeLines(op.node, indent);
		lines.splice(index, 0, ...block);
		working.set(path, lines.join("\n"));
		return { op: op.op, path, node: [...parts, op.node.Name].join("/"), lines: block.length };
	}
	const node = locateNode(text, parts.join("/"));
	if (node === undefined) throw new Error(`${op.op} ${path}: no node ${parts.join("/")}`);
	if (op.op === "remove_node") {
		lines.splice(node.start, node.end - node.start + 1);
		working.set(path, lines.join("\n"));
		return { op: op.op, path, node: parts.join("/"), removed_lines: node.end - node.start + 1 };
	}
	if (op.op === "set_node_value") {
		if (typeof op.key !== "string" || op.key === "") throw new Error("set_node_value needs key");
		const found = findLine(lines, node.start, node.end, new RegExp(`^(\\s*)${escapeRegExp(op.key)}:`, "u"));
		if (found === undefined) throw new Error(`set_node_value: ${parts.join("/")} has no ${op.key} in ${path}`);
		lines[found.index] = `${" ".repeat(found.indent)}${op.key}: ${scalar(op.value)}`;
		working.set(path, lines.join("\n"));
		return { op: op.op, path, node: parts.join("/"), key: op.key, value: op.value };
	}
	throw new Error(`unhandled operation ${op.op}`);
}

/**
 * Rename the project on disk: the project file, its design companion, the root chapter file
 * name and every absolute `/Objects/<old>/` pointer.
 *
 * The pointer rewrite is the part that matters: a renamed project whose `DefaultUserFolder`
 * still says `/Objects/<old>/Security/Users` opens with a login that silently counts nobody.
 */
async function planRename(working, rootInfo, op) {
	const old = rootInfo.name;
	const next = String(op.name ?? "").trim();
	if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(next)) throw new Error(`"${next}" is not a project name: a letter or underscore, then letters, digits or underscores`);
	const optix = working.get(".optix") ?? rootInfo.optixText;
	let renamed = optix.replace(/^(\s{1,2})Name:\s*.*$/mu, `$1Name: ${next}`);
	if (renamed === optix) throw new Error(`set_project_name: ${basename(rootInfo.optixFile)} has no Project.Name line to rewrite`);
	renamed = renamed.replaceAll(`Nodes/${old}.yaml`, `Nodes/${next}.yaml`);
	working.set(".optix", renamed);
	const design = await maybeRead(join(rootInfo.root, `${old}.optix.design`));
	if (design !== undefined) {
		working.set(`${next}.optix.design`, design.replace(/^(\s*)Name:\s*.*_Design\s*$/mu, `$1Name: ${next}_Design`).replaceAll(`RelativePath: ${old}.optix`, `RelativePath: ${next}.optix`));
	}
	for (const [key, chapter] of await readChapters(rootInfo)) {
		const currentText = working.get(chapter.path) ?? chapter.text;
		if (key === `${old}.yaml`) {
			const renamedRoot = currentText.replace(/^Name:\s*.*$/mu, `Name: ${next}`);
			working.set(`Nodes/${next}.yaml`, renamedRoot);
			working.delete(chapter.path);
			continue;
		}
		const rewritten = currentText.replaceAll(`/Objects/${old}/`, `/Objects/${next}/`);
		if (rewritten !== currentText) working.set(chapter.path, rewritten);
	}
	return { op: op.op, from: old, to: next, pointers_rewritten: [...working.keys()].filter((path) => path !== ".optix" && !path.endsWith(".optix.design")).length };
}

/** The stage manifest path for one id. */
function stageFile(root, id) {
	return join(root, WORK_DIR, "stages", `${id}.json`);
}

/**
 * Stage a plan: compute every file's next text, validate the result, write nothing.
 *
 * Staging is the dry run, always. It records each target file's current sha256 so the apply
 * can refuse a file that changed in between (Studio reopened, a person edited it, another
 * agent wrote it), and it keeps the exact text it validated, so applying can never re-derive
 * a different plan.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param ops - Declarative operations; see {@link planOp}.
 * @param options - `typeCheck` validates node types against the Studio catalog.
 */
export async function stageOps(rootInfo, ops, { typeCheck } = {}) {
	if (!Array.isArray(ops) || ops.length === 0) throw new Error("stage needs at least one operation");
	if (ops.length > 200) throw new Error("stage accepts at most 200 operations in one plan");
	const working = new Map();
	const steps = [];
	for (const op of ops) steps.push(await planOp(working, rootInfo, op));
	if (working.size === 0) throw new Error("the plan writes no file");
	if (working.size > MAX_STAGE_FILES) throw new Error(`the plan touches ${working.size} files, over the ${MAX_STAGE_FILES}-file bound`);
	const files = [];
	for (const path of [...working.keys()].sort()) {
		const diskPath = path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, path.split("/").join(sep));
		const before = await maybeRead(diskPath);
		const after = working.get(path);
		files.push({
			path,
			exists: before !== undefined,
			before_sha256: before === undefined ? null : digestText(before),
			after_sha256: digestText(after),
			bytes: Buffer.byteLength(after)
		});
	}
	const validation = await validateProject(rootInfo, { planned: working, typeCheck });
	const id = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const manifest = {
		id,
		project: rootInfo.name,
		root: rootInfo.root,
		created: new Date().toISOString(),
		ops,
		steps,
		texts: Object.fromEntries(working),
		files
	};
	await mkdir(dirname(stageFile(rootInfo.root, id)), { recursive: true });
	await writeFile(stageFile(rootInfo.root, id), `${JSON.stringify(manifest, null, "\t")}\n`, "utf8");
	await writeFile(join(rootInfo.root, WORK_DIR, "stages", "latest.json"), `${JSON.stringify({ id, created: manifest.created, files: manifest.files.map((file) => file.path) }, null, "\t")}\n`, "utf8");
	return {
		stage_id: id,
		project: rootInfo.name,
		project_root: rootInfo.root,
		steps,
		files,
		validation,
		writable: validation.ok,
		next: validation.ok
			? `Nothing was written. Close Studio on this project if it is open, then optix_project { action: "apply", stage_id: "${id}" }.`
			: "The plan breaks a project invariant; nothing was written. Fix the findings and stage again."
	};
}

/** Read a stage manifest by id, or the latest one. */
export async function readStage(root, id) {
	let chosen = typeof id === "string" ? id : "";
	if (chosen === "") {
		try {
			chosen = JSON.parse(await readFile(join(root, WORK_DIR, "stages", "latest.json"), "utf8")).id ?? "";
		} catch (error) {
			if (error?.code === "ENOENT") throw new Error(`no staged plan in ${root} - run optix_project action "stage" first`);
			throw error;
		}
	}
	let manifest;
	try {
		manifest = JSON.parse(await readFile(stageFile(root, chosen), "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") throw new Error(`no staged plan ${chosen || "(latest)"} in ${root} - run optix_project action "stage" first`);
		throw error;
	}
	if (!isPlainObject(manifest) || !Array.isArray(manifest.files) || !isPlainObject(manifest.texts)) {
		throw new Error(`staged plan ${chosen} is malformed; stage it again`);
	}
	return manifest;
}

/**
 * Apply a staged plan, once every gate is green.
 *
 * Order: gates, then the staged hashes (a file that changed since staging refuses the whole
 * plan), then a backup of every target, then an atomic rename per file, then a manifest of
 * what was written. A failure after the first write restores every file from the backup, so
 * an apply is all or nothing.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param id - Stage id; empty means the latest.
 * @param options - `bridgePending`, `processes` (tests), `force` (ignore staged hashes only:
 *   the Studio and bridge gates are never bypassed), `typeCheck`.
 */
export async function applyStage(rootInfo, id, { bridgePending = 0, processes, force = false, typeCheck } = {}) {
	const manifest = await readStage(rootInfo.root, id);
	const gates = await projectGates(rootInfo, { bridgePending, label: `apply ${manifest.id}`, processes });
	if (!gates.can_write) {
		const error = new Error(`${gates.blockers[0].message} ${gates.blockers[0].next}`);
		error.code = gates.blockers[0].code;
		error.gates = gates;
		throw error;
	}
	const drifted = [];
	for (const file of manifest.files) {
		const diskPath = file.path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, file.path.split("/").join(sep));
		const current = await maybeRead(diskPath);
		const hash = current === undefined ? null : digestText(current);
		if (hash !== file.before_sha256 && !force) drifted.push({ path: file.path, expected: file.before_sha256, actual: hash });
	}
	if (drifted.length > 0) {
		const error = new Error(`${drifted.length} file${drifted.length === 1 ? "" : "s"} changed since the plan was staged (${drifted.map((entry) => entry.path).join(", ")}); stage again so the plan is based on what is on disk now`);
		error.code = "file_changed_on_disk";
		error.drifted = drifted;
		throw error;
	}
	const texts = new Map(Object.entries(manifest.texts));
	const validation = await validateProject(rootInfo, { planned: texts, typeCheck });
	if (!validation.ok) {
		const error = new Error(`the plan no longer validates: ${validation.findings.filter((finding) => finding.severity === "critical").map((finding) => finding.message).join("; ")}`);
		error.code = "invalid_project_yaml";
		error.findings = validation.findings;
		throw error;
	}
	const backupId = `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	const backupRoot = join(rootInfo.root, WORK_DIR, backupId);
	await mkdir(backupRoot, { recursive: true });
	const written = [];
	const lock = await acquireWriteLock(rootInfo.root, `apply ${manifest.id}`);
	try {
		for (const file of manifest.files) {
			const diskPath = file.path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, file.path.split("/").join(sep));
			const mirror = join(backupRoot, file.path.split("/").join(sep));
			await mkdir(dirname(mirror), { recursive: true });
			let existed = false;
			try {
				await writeFile(mirror, await readFile(diskPath));
				existed = true;
			} catch (error) {
				if (error?.code !== "ENOENT") throw error;
			}
			const text = texts.get(file.path);
			await mkdir(dirname(diskPath), { recursive: true });
			const temp = join(dirname(diskPath), `.dsh-${backupId}-${basename(diskPath)}.tmp`);
			await writeFile(temp, text, "utf8");
			await rename(temp, diskPath);
			written.push({ path: file.path, existed, before_sha256: file.before_sha256, after_sha256: file.after_sha256, bytes: Buffer.byteLength(text) });
		}
		const record = { id: backupId, stage: manifest.id, project: rootInfo.name, root: rootInfo.root, applied: new Date().toISOString(), files: written };
		await writeFile(join(backupRoot, "manifest.json"), `${JSON.stringify(record, null, "\t")}\n`, "utf8");
		await rm(stageFile(rootInfo.root, manifest.id), { force: true });
		return {
			applied: written.length,
			backup_id: backupId,
			stage_id: manifest.id,
			project: rootInfo.name,
			files: written.map(({ path, after_sha256, bytes, existed }) => ({ path, after_sha256, bytes, created: !existed })),
			backup: backupRoot,
			next: "Files are on disk. Open the project in Studio, let it load, then save and build (Ctrl+S, Ctrl+Shift+B); optix_project action \"diff\" reports what Studio changed."
		};
	} catch (error) {
		for (const file of [...written].reverse()) {
			const diskPath = file.path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, file.path.split("/").join(sep));
			const mirror = join(backupRoot, file.path.split("/").join(sep));
			try {
				if (file.existed) await writeFile(diskPath, await readFile(mirror));
				else await rm(diskPath, { force: true });
			} catch {
				// the backup folder stays for a manual restore
			}
		}
		throw error;
	} finally {
		await lock.release().catch(() => {});
	}
}

/** Every backup this channel made for a project, newest first. */
export async function listBackups(root) {
	let entries;
	try {
		entries = await readdir(join(root, WORK_DIR), { withFileTypes: true });
	} catch {
		return [];
	}
	const found = [];
	for (const entry of entries.filter((item) => item.isDirectory() && item.name.startsWith("b-"))) {
		try {
			const record = JSON.parse(await readFile(join(root, WORK_DIR, entry.name, "manifest.json"), "utf8"));
			found.push({ backup_id: entry.name, applied: record.applied, stage: record.stage, files: record.files?.length ?? 0 });
		} catch {
			found.push({ backup_id: entry.name, files: 0 });
		}
	}
	return found.sort((left, right) => String(right.applied ?? "").localeCompare(String(left.applied ?? "")));
}

/** Read one backup manifest. */
export async function readBackup(root, id) {
	const file = join(root, WORK_DIR, String(id ?? ""), "manifest.json");
	let record;
	try {
		record = JSON.parse(await readFile(file, "utf8"));
	} catch (error) {
		if (error?.code === "ENOENT") throw new Error(`no backup ${id || "(latest)"} under ${root} - optix_project action "sources" lists them`);
		throw error;
	}
	if (!isPlainObject(record) || !Array.isArray(record.files)) throw new Error(`backup ${id} is malformed`);
	return record;
}

/**
 * Compare a backup with the project on disk: what Studio changed, normalized or dropped.
 *
 * After Studio opens a file-written project it rewrites the YAML it touched and may drop an
 * element it does not model. This is the reconciliation gate: a dropped change is a failure,
 * a normalized one is expected.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param id - Backup id; empty means the newest.
 */
export async function diffBackup(rootInfo, id) {
	const backups = await listBackups(rootInfo.root);
	const chosen = String(id ?? "") !== "" ? String(id) : backups[0]?.backup_id;
	if (chosen === undefined) throw new Error("this project has no backup to compare; apply a plan first");
	const record = await readBackup(rootInfo.root, chosen);
	const files = [];
	for (const file of record.files) {
		const diskPath = file.path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, file.path.split("/").join(sep));
		const current = await maybeRead(diskPath);
		const hash = current === undefined ? null : digestText(current);
		files.push({
			path: file.path,
			state: current === undefined ? "missing" : hash === file.after_sha256 ? "unchanged" : "changed_outside_tool",
			after_sha256: file.after_sha256,
			current_sha256: hash
		});
	}
	const changed = files.filter((file) => file.state !== "unchanged");
	return {
		backup_id: chosen,
		applied: record.applied,
		files,
		changed: changed.length,
		dropped: files.filter((file) => file.state === "missing").map((file) => file.path),
		ok: changed.length === 0,
		next: changed.length === 0
			? "Studio kept every applied change byte for byte."
			: "The files Studio rewrote are listed: compare them before trusting the project; a dropped file is a failure, a normalized one is expected after Studio saves."
	};
}

/**
 * Restore the project files a backup recorded.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param id - Backup id; empty means the newest.
 * @param options - `force` restores even when a file changed after the apply; `processes` (tests).
 */
export async function restoreBackup(rootInfo, id, { force = false, processes } = {}) {
	const backups = await listBackups(rootInfo.root);
	const chosen = String(id ?? "") !== "" ? String(id) : backups[0]?.backup_id;
	if (chosen === undefined) throw new Error("this project has no backup to restore; apply a plan first");
	const record = await readBackup(rootInfo.root, chosen);
	const gates = await projectGates(rootInfo, { label: `restore ${chosen}`, processes });
	if (!gates.can_write) {
		const error = new Error(`${gates.blockers[0].message} ${gates.blockers[0].next}`);
		error.code = gates.blockers[0].code;
		error.gates = gates;
		throw error;
	}
	const lock = await acquireWriteLock(rootInfo.root, `restore ${chosen}`);
	const restored = [];
	try {
		for (const file of record.files) {
			const diskPath = file.path === ".optix" ? rootInfo.optixFile : join(rootInfo.root, file.path.split("/").join(sep));
			const mirror = join(rootInfo.root, WORK_DIR, chosen, file.path.split("/").join(sep));
			const current = await maybeRead(diskPath);
			if (!force && current !== undefined && digestText(current) !== file.after_sha256) {
				const error = new Error(`${file.path} changed after the apply (sha256 ${digestText(current)}, expected ${file.after_sha256}); pass force true to overwrite it with the backup`);
				error.code = "file_changed_on_disk";
				throw error;
			}
			if (file.existed) {
				await writeFile(diskPath, await readFile(mirror));
				restored.push({ path: file.path, restored: true });
			} else {
				await rm(diskPath, { force: true });
				restored.push({ path: file.path, restored: true, removed: true });
			}
		}
		return { backup_id: chosen, restored: restored.length, files: restored, next: "The project files are back to the state before that apply. Studio must be reopened to load them." };
	} finally {
		await lock.release().catch(() => {});
	}
}

/** Find one node in the resolved project tree by its project path. */
async function findTreeNode(rootInfo, path) {
	const { tree } = await projectTree(rootInfo);
	const want = nodePath(path).join("/");
	let found;
	walkTree(tree, (node, here) => {
		if (found !== undefined) return;
		// `walkTree` starts at the project root node, whose name is the project name; bridge
		// paths start below it (`UI/Screens/Home`), so both spellings resolve here.
		const cut = here.indexOf("/");
		const below = cut === -1 ? here : here.slice(cut + 1);
		if (here === want || below === want) found = node;
	});
	return found;
}

/**
 * Read one node by project path, for a caller that cannot use the bridge.
 * @param rootInfo - Result of {@link projectInfo}.
 * @param path - Project path, for example `UI/Screens/Home`.
 */
export async function readNode(rootInfo, path) {
	const node = await findTreeNode(rootInfo, path);
	if (node === undefined) throw new Error(`no node ${nodePath(path).join("/")} in ${rootInfo.name}'s YAML - the project may not be saved since that node was created`);
	return {
		project: rootInfo.name,
		path: nodePath(path).join("/"),
		file: node.file,
		node: node.doc,
		children: Array.isArray(node.doc?.Children) ? node.doc.Children.filter(isPlainObject).map((child) => (typeof child.File === "string" ? { file: child.File } : { name: child.Name, type: child.Type, class: child.Class })) : []
	};
}

/**
 * The project's chapter files, node counts and the backups this channel made.
 * @param rootInfo - Result of {@link projectInfo}.
 */
export async function sources(rootInfo) {
	const { tree, chapters, problems } = await projectTree(rootInfo);
	const reached = new Set();
	walkTree(tree, (node) => reached.add(node.chapter));
	const files = [...chapters.entries()].map(([key, chapter]) => ({
		path: chapter.path,
		bytes: Buffer.byteLength(chapter.text),
		registered: reached.has(key),
		error: chapter.error
	}));
	return {
		project: rootInfo.name,
		project_root: rootInfo.root,
		optix_file: rootInfo.optixFile,
		design_file: existsSync(rootInfo.designFile) ? rootInfo.designFile : null,
		files,
		problems,
		backups: await listBackups(rootInfo.root),
		net_solution: join(rootInfo.root, "ProjectFiles", "NetSolution"),
		next: "Everything under Nodes/ is editor-safe YAML; ProjectFiles/NetSolution holds the C# Studio compiles."
	};
}

/**
 * A census of the project on disk: files, nodes, kinds and the parts that matter.
 * @param rootInfo - Result of {@link projectInfo}.
 */
export async function census(rootInfo) {
	const { tree, chapters } = await projectTree(rootInfo);
	const types = new Map();
	let nodes = 0;
	let bytes = 0;
	for (const chapter of chapters.values()) bytes += Buffer.byteLength(chapter.text);
	const countNode = (node) => {
		const type = node.type ?? "(none)";
		types.set(type, (types.get(type) ?? 0) + 1);
		// A screen instance carries `Supertype: Screen` and no `Type`, so the type census alone
		// would report a project with screens as having none.
		if (node.doc?.Supertype !== undefined) types.set(`supertype:${node.doc.Supertype}`, (types.get(`supertype:${node.doc.Supertype}`) ?? 0) + 1);
		nodes += 1;
		for (const child of node.children) countNode(child);
	};
	for (const root of tree) countNode(root);
	return {
		project: rootInfo.name,
		project_root: rootInfo.root,
		optix_file: rootInfo.optixFile,
		files: chapters.size,
		bytes,
		nodes,
		top_types: [...types.entries()].sort((left, right) => right[1] - left[1]).slice(0, 12).map(([type, count]) => ({ type, count })),
		netlogic_nodes: types.get("NetLogic") ?? 0,
		screens: (types.get("Screen") ?? 0) + (types.get("supertype:Screen") ?? 0) + (types.get("ScreenType") ?? 0),
		backups: await listBackups(rootInfo.root),
		next: "A census reads the project as Studio last saved it; the live model may be newer while Studio is open."
	};
}
