/**
 * One spelling for "which project" across the plugin.
 *
 * The tools grew two names for the same thing: `optix_build` and `optix_project` take `project_root` (the folder
 * holding `<Name>.optix`) while `optix_emulator`, `optix_logs` and `optix_save` take `project` (also a folder) -
 * and the bridge tools take `project` (the Studio BrowseName). A session that called `optix_emulator` with
 * `project_root` was refused with `missing required property "project"` and lost a step to a naming detail; it
 * is the sort of step a weak model pays for repeatedly (session f7c609cb, 2026-11-16). This module decides once:
 * a folder is a folder, a name is a name, and either argument spells either one.
 */
import { basename } from "node:path";

/** A value naming a filesystem location rather than a Studio BrowseName. */
const PATHLIKE = /[\\/]|\.optix$/iu;

/**
 * Whether a value reads as a folder or file path rather than a project name.
 * @param value - Any argument value.
 * @returns True for `C:\x\Proj`, `./Proj`, `Proj/`, `Proj.optix`.
 */
export function looksLikePath(value) {
	return typeof value === "string" && PATHLIKE.test(value.trim());
}

/**
 * The project folder name, which is the Studio BrowseName for every project we scaffold.
 * @param root - Absolute or relative folder.
 * @returns The last path segment, or an empty string.
 */
export function projectNameFromRoot(root) {
	const trimmed = String(root ?? "").trim().replace(/[\\/]+$/u, "");
	if (trimmed === "") return "";
	const base = basename(trimmed);
	if (base === "" || base === "." || base === "..") return "";
	return base.endsWith(".optix") ? base.slice(0, -6) : base;
}

/**
 * Read `project`/`project_root` into the pair every tool can use, whichever spelling the caller chose.
 * @param args - The tool arguments.
 * @returns `{ project, root, provided }` - `project` a BrowseName (possibly empty), `root` a folder (possibly
 * empty), and `provided` whether either was given.
 */
export function projectRef(args = {}) {
	const rawProject = typeof args.project === "string" ? args.project.trim() : "";
	const rawRoot = typeof args.project_root === "string" ? args.project_root.trim() : "";
	let root = rawRoot;
	let project = rawProject;
	if (project !== "" && looksLikePath(project)) {
		if (root === "") root = project;
		project = "";
	}
	if (project === "") project = projectNameFromRoot(root);
	return {
		project,
		root,
		provided: project !== "" || root !== ""
	};
}
