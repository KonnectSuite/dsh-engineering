/** Arm an existing Optix project with the shipped Studio bridge, without a harness import. @module dsh-tool-ft-optix/arm */
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
/** The NetLogic source file the bridge ships as; the class name must match the node name. */
const BRIDGE_FILE = "StudioMCPBridge.cs";
/** Where the file a project already held is kept before it is replaced. */
const BACKUP_DIRECTORY = join("ProjectFiles", ".dsh-backups");
/**
 * The bridge version a source file declares, or an empty string when it is not the bridge.
 * @param text - C# source.
 * @returns The declared `BridgeVersion`, or an empty string.
 */
export function bridgeVersion(text) {
	const match = /BridgeVersion\s*=\s*"([^"]+)"/u.exec(text);
	return match === null ? "" : match[1];
}
/** sha256 of the source, so an unchanged bridge is never rewritten. */
function sha256(text) {
	return createHash("sha256").update(text).digest("hex");
}
/**
 * Report, and on confirmation write, the bridge an existing project needs.
 *
 * The NetSolution project is SDK-style, so a `.cs` file dropped beside it compiles; what no
 * tool can do is compile it or press StartBridge inside Studio, so both stay in `next`.
 * @param project - Directory holding the `.optix` file and `ProjectFiles`.
 * @param shipped - The bridge source this bundle ships.
 * @param confirm - `false` reports the plan; `true` writes it.
 * @returns What is there now, what was written, and the one human step that remains.
 */
export async function armBridge(project, shipped, confirm) {
	const solution = join(project, "ProjectFiles", "NetSolution");
	let entries;
	try {
		entries = await readdir(solution);
	} catch {
		throw new Error(`No ProjectFiles/NetSolution under ${project}: point project at the folder that holds the project's .optix file.`);
	}
	const projects = entries.filter((entry) => entry.toLowerCase().endsWith(".csproj"));
	if (projects.length === 0) throw new Error(`${solution} holds no .csproj, so Studio has no NetSolution project to compile the bridge into.`);
	const target = join(solution, BRIDGE_FILE);
	let existing = null;
	try {
		existing = await readFile(target, "utf8");
	} catch {
		existing = null;
	}
	const shippedHash = sha256(shipped);
	const report = {
		project,
		target,
		net_solution: projects[0],
		bridge_version: bridgeVersion(shipped),
		bridge_sha256: shippedHash,
		installed: existing !== null,
		installed_version: existing === null ? "" : bridgeVersion(existing),
		installed_sha256: existing === null ? "" : sha256(existing),
		up_to_date: existing !== null && sha256(existing) === shippedHash,
		armed: false,
		backup: "",
	};
	// Studio compiles the class; a project that never had the bridge also lacks the node, and
	// StartBridge is a right-click inside Studio. Neither is automatable from outside.
	const humanStep = "Open the project in Studio, compile NetSolution, add a NetLogic node named StudioMCPBridge if the project has none, right-click it and choose StartBridge, then call optix_status.";
	if (report.up_to_date) return {
		...report,
		next: `The project already holds the bridge this bundle ships (${report.bridge_version}). ${humanStep}`
	};
	if (confirm !== true) return {
		...report,
		next: existing === null ? `Call again with confirm true to write ${target}; nothing is there to back up. Then: ${humanStep}` : `Call again with confirm true to replace ${target}; what it holds now is copied under ${join(project, BACKUP_DIRECTORY)} first. Then: ${humanStep}`
	};
	if (existing !== null) {
		const backupDirectory = join(project, BACKUP_DIRECTORY);
		await mkdir(backupDirectory, {
			recursive: true
		});
		report.backup = join(backupDirectory, `${BRIDGE_FILE}-${new Date().toISOString().replace(/[:.]/gu, "")}.cs`);
		await copyFile(target, report.backup);
	}
	await writeFile(target, shipped);
	return {
		...report,
		armed: true,
		next: humanStep
	};
}
