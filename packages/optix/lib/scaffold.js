/**
 * Materialise a starter project from the packaged templates, with this bundle's bridge already
 * inside it. @module dsh-tool-ft-optix/scaffold
 *
 * The first question a new Optix project raises is not a design one: a project with no bridge
 * answers `Bridge unavailable` to every other tool in this plugin, and the starter that ships
 * carries an older bridge copy. Copying the directory by hand and then arming the copy is two
 * filesystem steps nobody should have to remember, so this does both in one call and reports the
 * one action that still belongs to Studio.
 */
import { copyFile, cp, mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { bridgeVersion } from "./arm.js";
/** The bridge source file every NetSolution project compiles. */
const BRIDGE_FILE = "StudioMCPBridge.cs";
/**
 * The two variables inside `MainWindow` that decide the canvas the designer and the runtime agree
 * on. Measured on Studio 1.8.1: `Nodes/UI/UI.yaml` declares them as `Size` children of
 * `- Name: MainWindow`, in the shape `- Name: Width` … `Value: 1920.0`, so a screen sized for one
 * panel box is wrong on every other one until these two numbers change.
 */
const WINDOW_SIZE = /(- Name: (Width|Height)\r?\n(?:[ ]{2,}[^\r\n]*\r?\n)*?[ ]+Value: )([0-9]+(?:\.[0-9]+)?)/gu;
/** Text files whose content carries the project name; the `.optix` file is YAML, not a database. */
const TEXT_EXTENSIONS = new Set([
	".optix",
	".design",
	".yaml",
	".csproj",
	".sln",
	".references",
	".code-workspace",
	".json",
	".xml",
	".txt",
	".md",
	".cs"
]);
/**
 * Every file under a directory, as paths relative to it.
 * @param root - Directory to walk.
 * @returns Relative paths, sorted.
 */
async function walk(root) {
	const found = [];
	const visit = async (directory) => {
		const entries = await readdir(directory, {
			withFileTypes: true
		});
		for (const entry of entries) {
			const full = join(directory, entry.name);
			if (entry.isDirectory()) await visit(full);
			else if (entry.isFile()) found.push(relative(root, full));
		}
	};
	await visit(root);
	return found.sort();
}
/**
 * Whether a path is a directory that holds nothing.
 * @param path - Candidate directory.
 * @returns True when it exists and is empty.
 */
async function isEmptyDirectory(path) {
	try {
		const info = await stat(path);
		if (!info.isDirectory()) return false;
		return (await readdir(path)).length === 0;
	} catch {
		return false;
	}
}
/**
 * Apply the operator's screen box to the copy's `MainWindow`.
 *
 * The starter ships 1920x1080 because that is the box the sample was drawn in; a panel target, a
 * kiosk or a widescreen monitor all differ, and every screen drafted afterwards inherits this
 * canvas (`optix_screen` reads the live window instead of guessing), so the size has to be right
 * before the first screen exists rather than after.
 * @param destination - Project directory.
 * @param width - Canvas width in pixels, or undefined to keep the starter's.
 * @param height - Canvas height in pixels, or undefined to keep the starter's.
 * @returns The size now declared, and whether this call changed it.
 */
async function applyScreenSize(destination, width, height) {
	const uiPath = join(destination, "Nodes", "UI", "UI.yaml");
	let text;
	try {
		text = await readFile(uiPath, "utf8");
	} catch {
		throw new Error(`${uiPath} is missing, so the copy declares no MainWindow to size.`);
	}
	const start = text.indexOf("- Name: MainWindow");
	if (start < 0) throw new Error(`${uiPath} declares no MainWindow, so there is no canvas to size.`);
	const after = text.slice(start + 1);
	const next = after.search(/\r?\n- /u);
	const end = next < 0 ? text.length : start + 1 + next;
	const block = text.slice(start, end);
	const wanted = { Width: width, Height: height };
	let changed = false;
	const resized = block.replace(WINDOW_SIZE, (match, head, field, value) => {
		const replacement = wanted[field];
		if (replacement === void 0) return match;
		const formatted = `${replacement}.0`;
		if (formatted === value) return match;
		changed = true;
		return `${head}${formatted}`;
	});
	if (changed) await writeFile(uiPath, text.slice(0, start) + resized + text.slice(end), "utf8");
	const current = {};
	for (const match of resized.matchAll(WINDOW_SIZE)) current[match[2]] = Number(match[3]);
	return {
		width: current.Width ?? 0,
		height: current.Height ?? 0,
		changed,
		ui_file: uiPath
	};
}
/**
 * Copy a starter into a new directory, name it, and put this bundle's bridge inside it.
 *
 * Studio warns when the project name and the folder holding it disagree ("The current project name
 * 'X' does not match the project folder name 'Y'"), and an operator's workspace root is exactly the
 * wrong place to unpack a project: it already holds other work. So the copy lands in a folder named
 * after the project — `<destination>/<name>` — unless the destination already IS a folder of that
 * name, in which case it is used as the project directory itself. Measured on Studio 1.8.1,
 * 2026-11-14.
 * @param options - Template root, destination, optional name, shipped bridge source.
 * @param options.templateRoot - Directory holding the starter's `project/` folder.
 * @param options.destination - Workspace root (or a project-named folder) the copy is written under.
 * @param options.sourceProjectName - Project name the starter ships under.
 * @param options.name - Project name for the copy; the folder takes the same name.
 * @param options.width - Canvas width in pixels: the operator's screen box.
 * @param options.height - Canvas height in pixels.
 * @param options.shipped - Current bridge source from this bundle.
 * @returns What was written, where it landed, the bridge that went in, and the Studio steps left.
 */
export async function scaffoldProject({ templateRoot, destination, sourceProjectName, name, width, height, shipped }) {
	const source = join(templateRoot, "project");
	const targetName = typeof name === "string" && name.trim() !== "" ? name.trim() : sourceProjectName;
	if (!/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(targetName)) throw new Error(`"${targetName}" is not a project name Studio accepts: use letters, digits and underscores, starting with a letter.`);
	// Studio wants the folder named after the project. A destination that is already such a folder is
	// the project directory; anything else (a workspace root, a fresh empty directory) gets a
	// project-named folder inside it, so the operator's workspace never becomes the project.
	const namedFolder = basename(destination).toLowerCase() === targetName.toLowerCase();
	const root = namedFolder ? destination : join(destination, targetName);
	let rootState = "absent";
	try {
		const info = await stat(root);
		if (!info.isDirectory()) throw new Error(`${root} exists and is not a directory, so the project cannot be written there.`);
		rootState = (await readdir(root)).length === 0 ? "empty" : "occupied";
	} catch (error) {
		if (error instanceof Error && error.message.endsWith("cannot be written there.")) throw error;
		rootState = "absent";
	}
	if (rootState === "occupied") throw new Error(`${root} already holds files. A starter is only copied into a new or empty project folder, so nothing there is overwritten.`);
	await mkdir(root, {
		recursive: true
	});
	const templateProject = source;
	// Copy the starter's top-level entries into the project folder, so that folder is the project
	// itself rather than a folder holding a `project` child.
	for (const entry of await readdir(templateProject, { withFileTypes: true })) {
		await cp(join(templateProject, entry.name), join(root, entry.name), {
			recursive: entry.isDirectory(),
			force: false,
			errorOnExist: true
		});
	}
	const renamed = [];
	if (targetName !== sourceProjectName) {
		for (const path of await walk(root)) {
			const extension = path.includes(".") ? `.${path.split(".").pop().toLowerCase()}` : "";
			if (!TEXT_EXTENSIONS.has(extension)) continue;
			const full = join(root, path);
			const text = await readFile(full, "utf8");
			if (!text.includes(sourceProjectName)) continue;
			await writeFile(full, text.split(sourceProjectName).join(targetName), "utf8");
		}
		// Rename the files that carry the name, deepest first so a directory rename cannot invalidate
		// a path already queued.
		for (const path of (await walk(root)).sort((left, right) => right.length - left.length)) {
			const namePart = basename(path);
			if (!namePart.includes(sourceProjectName)) continue;
			const renamedPath = join(dirname(path), namePart.split(sourceProjectName).join(targetName));
			await rename(join(root, path), join(root, renamedPath));
			renamed.push(renamedPath.split(sep).join("/"));
		}
	}
	const bridgeTarget = join(root, "ProjectFiles", "NetSolution", BRIDGE_FILE);
	let bundledVersion = "";
	try {
		bundledVersion = bridgeVersion(await readFile(bridgeTarget, "utf8"));
	} catch {
		bundledVersion = "";
	}
	await writeFile(bridgeTarget, shipped, "utf8");
	const screen = await applyScreenSize(root, width, height);
	const files = await walk(root);
	const optixFile = files.find((path) => path.endsWith(".optix"));
	if (optixFile === void 0) throw new Error(`${root} holds no .optix file after the copy, so Studio cannot open it.`);
	const projectName = /^\s*Name:\s*(.+)$/mu.exec(await readFile(join(root, optixFile), "utf8"))?.[1]?.trim() ?? "";
	return {
		project: root,
		destination,
		layout: namedFolder ? "destination" : "nested",
		project_name: projectName,
		optix_file: join(root, optixFile),
		file_count: files.length,
		renamed_files: renamed,
		bridge_version: bridgeVersion(shipped),
		replaced_bundled_bridge: bundledVersion,
		screen: {
			width: screen.width,
			height: screen.height,
			orientation: screen.height > screen.width ? "portrait" : "landscape",
			changed: screen.changed,
			ui_file: screen.ui_file
		},
		studio_steps: [
			`Ask the engineer to open ${join(root, optixFile)} in FactoryTalk Optix Studio. You do not open Studio yourself.`,
			"The engineer builds the solution so the bridge class compiles. Studio 1.8.1.27 documents no build keystroke: its main toolbar's Open .NET Solution opens the solution in the default external editor, and a Studio restart reloads the assembly.",
			"The engineer right-clicks the StudioMCPBridge NetLogic node and chooses StartBridge.",
			"Then call optix_status: the bridge answers on the port the profile configures."
		],
		next: `The project is at ${root} with bridge ${bridgeVersion(shipped)} in ProjectFiles/NetSolution and a ${screen.width}x${screen.height} canvas (${screen.height > screen.width ? "portrait" : "landscape"}). It is not running yet, and starting Studio is the engineer's step, not yours: tell them to open that .optix file, build, and right-click the StudioMCPBridge NetLogic > StartBridge, then wait for their word before calling optix_status. Until that is done every other Optix tool answers Bridge unavailable, which is the state this copy exists to shorten, not to hide.`
	};
}
