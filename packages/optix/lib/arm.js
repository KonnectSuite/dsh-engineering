/** Arm an existing Optix project with the shipped Studio bridge, without a harness import. @module dsh-tool-ft-optix/arm */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
/** The NetLogic source file the bridge ships as; the class name must match the node name. */
const BRIDGE_FILE = "StudioMCPBridge.cs";
/** Where every file an arming run touched is kept, one folder per run. */
const BACKUP_DIRECTORY = join("ProjectFiles", ".dsh-backups");
/** The NetLogic category folder a project's logic lives in, relative to the project directory. */
const NETLOGIC_FILE = join("Nodes", "NetLogic", "NetLogic.yaml");
/** The starter projects declare this node themselves; an existing project usually does not. */
const NETLOGIC_NODE_NAME = "StudioMCPBridge";
/**
 * The node a project needs before `StartBridge` can be chosen, copied from the shipped starter.
 *
 * It is plain declarative YAML in the project's own `NetLogic.yaml`: the node name must equal the
 * C# class the NetSolution compiles, and the methods are what Studio binds the class's exported
 * methods to. Writing it here is what turns "add a NetLogic node by hand" into one tool call.
 */
const NETLOGIC_NODE = `- Name: ${NETLOGIC_NODE_NAME}
  Type: NetLogic
  Children:
  - Name: BehaviourStartPriority
    Type: BehaviourStartPriorityVariableType
    DataType: Byte
    Value: 180
  - Class: Method
    Name: CheckFormula
    Children:
    - Name: ns=0;InputArguments
      Type: BaseVariableType
      DataType: Argument
      ReferenceType: HasProperty
      ValueRank: OneDimension
      ArrayDimensions: [0]
      Value: [{"TypeId":{"Id":296},"Body":{"Name":"expression","DataType":{"Id":12},"ValueRank":-1,"ArrayDimensions":[],"Description":{"NamespaceIndex":-1,"LocaleId":"","Text":""}}},{"TypeId":{"Id":296},"Body":{"Name":"sources","DataType":{"Id":12},"ValueRank":-1,"ArrayDimensions":[],"Description":{"NamespaceIndex":-1,"LocaleId":"","Text":""}}}]
  - Class: Method
    Name: SetupProject
  - Class: Method
    Name: StartBridge
  - Class: Method
    Name: StopBridge
  - Class: Method
    Name: ImportQueuedLibraryItem
`;
/**
 * The bridge version a source file declares, or an empty string when it is not the bridge.
 * @param text - C# source.
 * @returns The declared `BridgeVersion`, or an empty string.
 */
export function bridgeVersion(text) {
	const match = /BridgeVersion\s*=\s*"([^"]+)"/u.exec(text);
	return match === null || match === void 0 ? "" : match[1];
}
/** sha256 of the source, so an unchanged bridge is never rewritten. */
function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}
/**
 * Whether SHA-256 matters here: a large NetLogic file is compared by hash, never by eye.
 * @param path - File to hash.
 * @returns Hex digest, or an empty string when the file is absent.
 */
async function fileSha256(path) {
	try {
		return sha256(await readFile(path, "utf8"));
	} catch {
		return "";
	}
}
/**
 * Find the one `.optix` file a project directory holds.
 *
 * Arming writes into somebody's project, so the first question is whether this is a project at all:
 * a directory with no `.optix`, or with several, is refused instead of guessed at.
 * @param project - Candidate project directory.
 * @returns The `.optix` file's absolute path.
 */
async function findProjectFile(project) {
	const entries = await readdir(project);
	const found = entries.filter((entry) => entry.toLowerCase().endsWith(".optix"));
	if (found.length === 0) throw new Error(`No .optix file directly under ${project}: point project at the folder that holds the project file.`);
	if (found.length > 1) throw new Error(`${project} holds ${found.length} .optix files (${found.join(", ")}); arming writes into the project you name, so point project at the folder holding exactly one.`);
	return join(project, found[0]);
}
/**
 * The project name a `.optix` file declares.
 * @param optixFile - Path to the `.optix` file.
 * @returns The `Name:` value, or an empty string.
 */
async function projectName(optixFile) {
	const text = await readFile(optixFile, "utf8");
	return /^\s*Name:\s*(.+)$/mu.exec(text)?.[1]?.trim() ?? "";
}
/**
 * Whether the `.optix` file lists a node file under its `Nodes:` entries.
 * @param text - `.optix` file contents.
 * @param relative - Node file path, as `Nodes/NetLogic/NetLogic.yaml`.
 * @returns True when the entry is there.
 */
function listsNodeFile(text, relative) {
	const escaped = relative.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
	return new RegExp(`^- File:\\s*${escaped}\\s*$`, "mu").test(text);
}
/**
 * Put the bridge node into a project that has none, registering the node file when the project has
 * not listed it yet.
 *
 * A project whose `NetLogic.yaml` already names the node is left byte for byte alone: the node may
 * carry hand-written priorities or extra methods that a rewrite would silently drop.
 * @param project - Project directory.
 * @param optixFile - Path to the project's `.optix` file.
 * @param record - Callback that records one file before it is changed.
 * @returns What the files hold now, and whether this call wrote them.
 */
async function ensureNetLogicNode(project, optixFile, record) {
	const target = join(project, NETLOGIC_FILE);
	const optixText = await readFile(optixFile, "utf8");
	let text = null;
	try {
		text = await readFile(target, "utf8");
	} catch {
		text = null;
	}
	const listed = listsNodeFile(optixText, "Nodes/NetLogic/NetLogic.yaml");
	if (text !== null && new RegExp(`^- Name: ${NETLOGIC_NODE_NAME}\\r?$`, "mu").test(text) && listed) {
		return {
			netlogic_node: "present",
			netlogic_file: target,
			netlogic_registered: true
		};
	}
	const newline = text !== null && text.includes("\r\n") ? "\r\n" : "\n";
	const node = newline === "\n" ? NETLOGIC_NODE : NETLOGIC_NODE.replace(/\n/gu, "\r\n");
	let content;
	let state;
	if (text === null) {
		content = `Name: NetLogic${newline}Type: NetLogicCategoryFolder${newline}Children:${newline}${node}`;
		state = "created_file";
	} else if (new RegExp(`^- Name: ${NETLOGIC_NODE_NAME}\\r?$`, "mu").test(text)) {
		content = text;
		state = "present";
	} else {
		const separator = text.endsWith("\n") || text.endsWith("\r") ? "" : newline;
		content = `${text}${separator}${node}`;
		state = "added";
	}
	if (content !== text) {
		await record(target, text);
		await mkdir(join(project, "Nodes", "NetLogic"), {
			recursive: true
		});
		await writeFile(target, content);
	}
	/**
	 * Studio loads only the node files the `.optix` project lists. A project built without a NetLogic
	 * folder has no such entry, so the node would sit on disk and never appear in the tree; the entry
	 * is added in the same transaction as the file.
	 */
	if (!listed) {
		await record(optixFile, optixText);
		const entry = `- File: Nodes/NetLogic/NetLogic.yaml`;
		const nodesAt = optixText.search(/^Nodes:\s*$/mu);
		if (nodesAt < 0) throw new Error(`${optixFile} has no Nodes: section, so the NetLogic node file cannot be registered; open the project in Studio once and save it, then arm again.`);
		const afterNodes = optixText.slice(nodesAt);
		const lineEnd = afterNodes.indexOf("\n");
		const insertAt = lineEnd < 0 ? optixText.length : nodesAt + lineEnd + 1;
		const ending = optixText.includes("\r\n") ? "\r\n" : "\n";
		const updated = `${optixText.slice(0, insertAt)}- File: ${"Nodes/NetLogic/NetLogic.yaml"}${ending}${optixText.slice(insertAt)}`;
		await writeFile(optixFile, updated);
	}
	return {
		netlogic_node: state,
		netlogic_file: target,
		netlogic_registered: true,
		optix_file_edited: !listed
	};
}
/**
 * Report, and on confirmation write, the bridge an existing project needs.
 *
 * The write is a transaction: every file it touches is copied into one backup folder first, and the
 * same call with `restore` puts those files back, so an engineer can arm a project without having to
 * trust it. Studio still compiles the class and the engineer still runs StartBridge.
 * @param project - Directory holding the `.optix` file and `ProjectFiles`.
 * @param shipped - The bridge source this bundle ships.
 * @param options - `confirm` writes, `restore` reverts the newest run, neither reports.
 * @param options.confirm - True to write.
 * @param options.restore - True to undo the newest backup folder.
 * @param options.bridgeOpen - Name of the project a running bridge reports, when one answers.
 * @param options.studioRunning - Whether a Studio process is running on this machine.
 * @returns What is there now, what was written, and the human steps that remain.
 */
export async function armBridge(project, shipped, third = {}) {
	/** Older callers passed a bare confirm flag; keep that working. */
	const options = typeof third === "boolean" ? { confirm: third } : third;
	return armBridgeWith(project, shipped, options);
}

/** The transactional body of {@link armBridge}. */
async function armBridgeWith(project, shipped, { confirm = false, restore = false, bridgeOpen = "", studioRunning = false } = {}) {
	const optixFile = await findProjectFile(project);
	const solution = join(project, "ProjectFiles", "NetSolution");
	let entries;
	try {
		entries = await readdir(solution);
	} catch {
		throw new Error(`No ProjectFiles/NetSolution under ${project}: point project at the folder that holds the project's .optix file.`);
	}
	const projects = entries.filter((entry) => entry.toLowerCase().endsWith(".csproj"));
	if (projects.length === 0) throw new Error(`${solution} holds no .csproj, so Studio has no NetSolution project to compile the bridge into.`);
	const name = await projectName(optixFile);
	const backupsRoot = join(project, BACKUP_DIRECTORY);
	const target = join(solution, BRIDGE_FILE);
	const existing = await fileSha256(target).then(async (hash) => hash === "" ? null : await readFile(target, "utf8"));
	const shippedHash = sha256(shipped);
	const netlogicPath = join(project, NETLOGIC_FILE);
	const netlogicHash = await fileSha256(netlogicPath);
	const optixHash = await fileSha256(optixFile);
	/**
	 * Restoring is only ever the undo of an arming run, never a merge: it copies the newest run's
	 * files back and deletes the files that run created, then reports what it put where.
	 */
	if (restore) {
		let folders;
		try {
			folders = (await readdir(backupsRoot)).filter((entry) => entry.startsWith("arm-")).sort();
		} catch {
			throw new Error(`No arming backup under ${backupsRoot}, so there is nothing to restore.`);
		}
		if (folders.length === 0) throw new Error(`No arming backup under ${backupsRoot}, so there is nothing to restore.`);
		const folder = join(backupsRoot, folders[folders.length - 1]);
		const manifest = JSON.parse(await readFile(join(folder, "manifest.json"), "utf8"));
		const restored = [];
		for (const file of manifest.files) {
			const targetPath = join(project, file.relative);
			if (file.existed) {
				await copyFile(join(folder, file.relative.replace(/[\\/]/gu, "__")), targetPath);
				restored.push(file.relative);
			} else {
				const { rm } = await import("node:fs/promises");
				await rm(targetPath, { force: true });
				restored.push(`${file.relative} (removed)`);
			}
		}
		return {
			project,
			project_name: name,
			optix_file: optixFile,
			restored_from: folder,
			restored,
			next: "The files this run added or replaced are back as they were. Open the project in Studio again and build, so Studio's own copy matches the disk."
		};
	}
	let nodeState = "missing";
	if (netlogicHash !== "") {
		const netlogicText = await readFile(netlogicPath, "utf8");
		const declared = new RegExp(`^- Name: ${NETLOGIC_NODE_NAME}\\r?$`, "mu").test(netlogicText);
		const registered = listsNodeFile(await readFile(optixFile, "utf8"), "Nodes/NetLogic/NetLogic.yaml");
		nodeState = declared && registered ? "present" : declared ? "unregistered" : "missing";
	}
	const report = {
		project,
		project_name: name,
		optix_file: optixFile,
		net_solution: projects[0],
		bridge_version: bridgeVersion(shipped),
		bridge_sha256: shippedHash,
		installed: existing !== null,
		installed_version: existing === null ? "" : bridgeVersion(existing),
		up_to_date: existing !== null && sha256(existing) === shippedHash,
		netlogic_node: nodeState,
		bridge_written: false,
		node_written: false,
		bridge_backup: "",
		studio_running: studioRunning,
		bridge_open: bridgeOpen,
		armed: false,
		backup: ""
	};
	if (studioRunning && bridgeOpen !== "" && bridgeOpen.toLowerCase() === name.toLowerCase()) {
		throw new Error(`Studio already has ${name} open with its bridge running, so writing NetSolution now would race Studio's own save. Close the project in Studio first, then arm it - the tool cannot make that save safe.`);
	}
	const humanStep = "Open the project in Studio, build NetSolution, right-click the StudioMCPBridge NetLogic node and choose StartBridge, then call optix_status.";
	if (confirm !== true) {
		const nodeNote = netlogicHash === "" ? ` It has no ${NETLOGIC_NODE_NAME} NetLogic node yet, which confirm writes into ${NETLOGIC_FILE} and registers in ${basename(optixFile)}.` : "";
		const studioNote = studioRunning ? " Studio is running: close this project in it before confirming, or its own save will overwrite what this writes." : "";
		return {
			...report,
			next: `${report.up_to_date ? `The project already holds the bridge this bundle ships (${report.bridge_version}).` : `Call again with confirm true to write ${target}.`}${nodeNote}${studioNote} Then: ${humanStep}`
		};
	}
	const stamp = new Date().toISOString().replace(/[:.]/gu, "");
	const backupDirectory = join(backupsRoot, `arm-${stamp}`);
	await mkdir(backupDirectory, {
		recursive: true
	});
	const touched = [];
	const record = async (path, text) => {
		const relative = path.slice(project.length + 1);
		if (touched.some((entry) => entry.relative === relative)) return;
		const existed = text !== null;
		if (existed) await copyFile(path, join(backupDirectory, relative.replace(/[\\/]/gu, "__")));
		touched.push({
			relative,
			existed
		});
	};
	if (!report.up_to_date) {
		await record(target, existing);
		await writeFile(target, shipped);
	}
	const node = await ensureNetLogicNode(project, optixFile, record);
	await writeFile(join(backupDirectory, "manifest.json"), JSON.stringify({
		project,
		project_name: name,
		at: new Date().toISOString(),
		files: touched
	}, null, 2));
	const bridgeWritten = !report.up_to_date;
	const nodeWritten = node.netlogic_node !== "present";
	return {
		...report,
		armed: true,
		bridge_written: bridgeWritten,
		node_written: nodeWritten,
		backup: backupDirectory,
		bridge_backup: existing === null ? "" : join(backupDirectory, "ProjectFiles__NetSolution__StudioMCPBridge.cs"),
		changed_files: touched.map((entry) => entry.relative),
		studio_running: studioRunning,
		...node,
		undo: `call optix_bridge_arm again with restore true to put these files back from ${backupDirectory}`,
		next: `${bridgeWritten ? "" : "The project already holds the bridge this bundle ships. "}${humanStep} The node is ${node.netlogic_node === "present" ? "already there" : "now there"} (${node.netlogic_file})${node.optix_file_edited ? `, and ${basename(optixFile)} now lists it` : ""}.`
	};
}
