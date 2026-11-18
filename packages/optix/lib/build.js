import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { studioRoots } from "./emulator.js";
import { findCsproj, netSolutionDir } from "./netlogic.js";
import { parseGeneratedTypes, typeCollisions } from "./names.js";
/**
 * Compile a FactoryTalk Optix project's NetLogic solution from outside Studio.
 *
 * Measured on this machine (Studio 1.8.1.27, SDK 8.0.424): `ProjectFiles/NetSolution`
 * builds with the system `dotnet` once a `<Project>.references` file names the Optix
 * assemblies by absolute path, and `dotnet build` on a copy of the folder succeeds with
 * 0 warnings and 0 errors. The Studio-bundled `dotnet.exe` has no SDK, so the system one
 * is the compiler of record.
 *
 * The check build copies the solution to a scratch folder and deletes it afterwards: a
 * project folder is the engineer's tree, and a compile check must not leave `bin/`,
 * `obj/` or a generated `*.references` behind while they may be about to open it.
 * @module
 */

const BUILD_TIMEOUT_MS = 240_000;
/** Names a scratch copy never carries: they are build output, not sources. */
const SKIP_DIRECTORIES = new Set(["bin", "obj", ".vs", "node_modules"]);

/** Compare two dotted version strings numerically. */
function compareVersions(left, right) {
	const a = String(left).split(".").map((part) => Number.parseInt(part, 10));
	const b = String(right).split(".").map((part) => Number.parseInt(part, 10));
	const length = Math.max(a.length, b.length);
	for (let index = 0; index < length; index += 1) {
		const one = Number.isFinite(a[index]) ? a[index] : -1;
		const two = Number.isFinite(b[index]) ? b[index] : -1;
		if (one !== two) return one - two;
	}
	return 0;
}

/**
 * Every FactoryTalk Optix Studio install on this machine.
 *
 * A version folder is only an install when it carries `IDEVersion.txt` or `Modules`,
 * because `Program Files` also holds shortcuts and uninstallers.
 * @returns Install rows, newest version last.
 */
export async function studioInstalls() {
	const found = [];
	for (const root of studioRoots()) {
		let entries;
		try {
			entries = await readdir(root, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const entry of entries.filter((item) => item.isDirectory() && item.name.startsWith("Studio"))) {
			const folder = join(root, entry.name);
			const modules = join(folder, "Modules");
			if (!existsSync(modules)) continue;
			let version = entry.name.replace(/^Studio\s*/u, "");
			try {
				version = (await readFile(join(folder, "IDEVersion.txt"), "utf8")).trim() || version;
			} catch {
				// no IDEVersion.txt: the folder name carries the version
			}
			found.push({
				root: folder,
				version,
				modules,
				bindings: join(folder, "Bindings", "Net"),
				studio_exe: join(folder, "FTOptixStudio.exe")
			});
		}
	}
	return found.sort((left, right) => compareVersions(left.version, right.version));
}

/** The newest installed Studio, or `undefined` when Optix is not installed here. */
export async function studioInstall() {
	const installs = await studioInstalls();
	return installs.at(-1);
}

/**
 * The .NET SDK a compile check runs with.
 *
 * `dotnet --list-sdks` is the honest probe: the runtime alone cannot build. The answer is
 * cached for the life of the process because an install does not change mid-session.
 */
let sdkCache;
export function dotnetSdk({ refresh = false } = {}) {
	if (sdkCache !== undefined && !refresh) return Promise.resolve(sdkCache);
	return new Promise((resolve) => {
		execFile("dotnet", ["--list-sdks"], { timeout: 20_000, windowsHide: true }, (error, stdout) => {
			const sdks = String(stdout ?? "")
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => /^\d+\.\d+\.\d+/u.test(line))
				.map((line) => line.split(/\s+/u)[0]);
			sdkCache = {
				available: error === null && sdks.length > 0,
				sdks,
				error: error === null ? "" : String(error.message ?? error)
			};
			resolve(sdkCache);
		});
	});
}

/** Every assembly file in one module directory, newest version of each module. */
async function moduleAssemblies(modules) {
	let entries;
	try {
		entries = await readdir(modules, { withFileTypes: true });
	} catch {
		return [];
	}
	const found = [];
	for (const module of entries.filter((entry) => entry.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
		const moduleDir = join(modules, module.name);
		let versions;
		try {
			versions = await readdir(moduleDir, { withFileTypes: true });
		} catch {
			continue;
		}
		const dirs = versions.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
		if (dirs.length === 0) continue;
		const newest = dirs.sort(compareVersions).at(-1);
		const any = join(moduleDir, newest, "Any");
		let files;
		try {
			files = await readdir(any, { withFileTypes: true });
		} catch {
			continue;
		}
		for (const file of files.filter((entry) => entry.isFile() && /\.dll$/iu.test(entry.name)).sort((left, right) => left.name.localeCompare(right.name))) {
			found.push({
				include: file.name.replace(/\.dll$/iu, ""),
				path: join(any, file.name)
			});
		}
	}
	return found;
}

/** The two UAManagedCore assemblies Studio references from the Windows binding. */
async function bindingAssemblies(bindings) {
	let versions;
	try {
		versions = await readdir(bindings, { withFileTypes: true });
	} catch {
		return [];
	}
	const dirs = versions.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(compareVersions);
	if (dirs.length === 0) return [];
	const win = join(bindings, dirs.at(-1), "Win32_x64");
	return ["UAManagedCore.dll", "UAManagedCoreCommon.dll"]
		.map((name) => ({ include: name.replace(/\.dll$/iu, ""), path: join(win, name) }))
		.filter((entry) => existsSync(entry.path));
}

/** The `<Reference>` file the project's `.csproj` imports, resolved from its own Import line. */
export async function referencesFile(root) {
	const csproj = await findCsproj(root);
	const text = await readFile(csproj, "utf8");
	const imported = /<Import\s+Project="([^"]+\.references)"\s*\/>/iu.exec(text);
	const name = imported === null ? `${basename(csproj, ".csproj")}.references` : imported[1];
	return { csproj, file: join(dirname(csproj), name) };
}

/** Hint paths in an existing references file, with the install/module version each one names. */
export async function readReferences(root) {
	const { csproj, file } = await referencesFile(root);
	let text = "";
	try {
		text = await readFile(file, "utf8");
	} catch {
		return { csproj, file, exists: false, count: 0, missing: [], installs: [] };
	}
	const paths = [...text.matchAll(/<HintPath>([^<]+)<\/HintPath>/giu)].map((match) => match[1].replace(/\\/gu, "/"));
	const installs = new Set();
	const modules = new Set();
	const missing = [];
	for (const hint of paths) {
		const module = /^(.*?)\/Modules\/([^/]+)\/([^/]+)\//u.exec(hint);
		if (module !== null) {
			installs.add(module[1]);
			modules.add(module[2]);
		} else {
			const bindings = /^(.*?)\/Bindings\/Net\//u.exec(hint);
			if (bindings !== null) installs.add(bindings[1]);
		}
		if (!existsSync(hint)) missing.push(hint);
	}
	return {
		csproj,
		file,
		exists: true,
		count: paths.length,
		missing,
		installs: [...installs],
		modules: modules.size
	};
}

/**
 * Write the `<Project>.references` file from an installed Studio.
 *
 * Studio generates this file itself when it builds with a project open; a project
 * scaffolded outside Studio has none, so a fresh NetLogic class cannot compile until it
 * exists. The selection rule is the measured one: the newest version of every module,
 * its `Any/*.dll`, plus `UAManagedCore` and `UAManagedCoreCommon` from the newest
 * Windows binding. 41 module assemblies + 2 binding assemblies = the 43 references a
 * Studio-generated file carries on Studio 1.8.1.27.
 * @param root - Project folder.
 * @param options - `install` overrides detection; `force` rewrites an existing file whose
 *   paths are all still valid; `dryRun` reports the plan without writing.
 */
export async function writeReferences(root, { install, force = false, dryRun = false } = {}) {
	const target = await referencesFile(root);
	const existing = await readReferences(root);
	if (existing.exists && existing.missing.length === 0 && !force) {
		return {
			action: "unchanged",
			file: target.file,
			count: existing.count,
			next: "Every existing reference resolves; pass force to rewrite it from this Studio install."
		};
	}
	const chosen = install ?? await studioInstall();
	if (chosen === undefined) {
		throw new Error("no FactoryTalk Optix Studio install found under Program Files - pass install_root, or let Studio generate the .references file by building once with the project open");
	}
	const assemblies = [...await moduleAssemblies(chosen.modules), ...await bindingAssemblies(chosen.bindings)];
	if (assemblies.length === 0) {
		throw new Error(`no managed assemblies under ${chosen.modules} - is ${chosen.root} a complete Studio install?`);
	}
	const body = assemblies.map((entry) => [
		`    <Reference Include="${entry.include}">`,
		`      <HintPath>${entry.path.replace(/\\/gu, "/")}</HintPath>`,
		"      <Private>False</Private>",
		"    </Reference>"
	].join("\n")).join("\n");
	const text = `<Project>\n  <ItemGroup>\n${body}\n  </ItemGroup>\n</Project>\n`;
	const plan = {
		action: existing.exists && existing.missing.length > 0 ? "rewritten_after_upgrade" : "generated",
		file: target.file,
		studio: chosen.version,
		count: assemblies.length,
		modules: assemblies.length - 2,
		missing_before: existing.missing.length,
		written: false
	};
	if (dryRun) return plan;
	await mkdir(dirname(target.file), { recursive: true });
	await writeFile(target.file, text, "utf8");
	return { ...plan, written: true };
}

/**
 * A stable GUID for a project name, so two runs write the same solution file.
 * @param name - Project name.
 */
function solutionGuid(name) {
	const hex = createHash("sha1").update(`dsh-optix:${name}`, "utf8").digest("hex").toUpperCase();
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

/** The `.csproj` Studio itself writes for a NetLogic solution of this project. */
function csprojText(name) {
	return `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <AppendTargetFrameworkToOutputPath>false</AppendTargetFrameworkToOutputPath>
    <CopyLocalLockFileAssemblies>true</CopyLocalLockFileAssemblies>
  </PropertyGroup>
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Debug|AnyCPU'">
    <OutputPath>bin\\</OutputPath>
    <NoWarn>1701;1702</NoWarn>
  </PropertyGroup>
  <PropertyGroup Condition="'$(Configuration)|$(Platform)'=='Release|AnyCPU'">
    <OutputPath>bin\\</OutputPath>
    <NoWarn>1701;1702</NoWarn>
  </PropertyGroup>
  <PropertyGroup>
    <ResolveAssemblyWarnOrErrorOnTargetArchitectureMismatch>None</ResolveAssemblyWarnOrErrorOnTargetArchitectureMismatch>
  </PropertyGroup>
  <Import Project="${name}.references"/>
</Project>
`;
}

/** The `.sln` that names the csproj, in the shape Studio writes. */
function solutionText(name) {
	const guid = solutionGuid(name);
	const projectType = "{9A19103F-16F7-4668-BE54-9A1E7A4F7556}";
	return `Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio 15
VisualStudioVersion = 15.0.28307.106
MinimumVisualStudioVersion = 10.0.40219.1
Project("${projectType}") = "${name}", "${name}.csproj", "${guid}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		${guid}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		${guid}.Debug|Any CPU.Build.0 = Debug|Any CPU
		${guid}.Release|Any CPU.ActiveCfg = Release|Any CPU
		${guid}.Release|Any CPU.Build.0 = Release|Any CPU
	EndGlobalSection
	GlobalSection(SolutionProperties) = preSolution
		HideSolutionNode = FALSE
	EndGlobalSection
EndGlobal
`;
}

/**
 * Create the NetLogic solution a project scaffolded outside Studio does not have yet.
 *
 * Studio writes `.csproj`, `.sln` and `<Project>.references` the first time it builds. A
 * project copied or generated by this plugin has none, and `dotnet build` cannot run until
 * the references file names the Optix assemblies, so this writes all three. It never touches
 * an existing `.cs` file: adding a solution to a project with NetLogic classes is the normal
 * case, and a `force` rewrite only replaces the three build files.
 * @param root - Project folder.
 * @param options - `dryRun` reports the plan; `force` rewrites existing build files;
 *   `install` overrides Studio detection (tests, or a Studio the probe cannot see).
 */
export async function initNetSolution(root, { dryRun = false, force = false, install } = {}) {
	const dir = netSolutionDir(root);
	const name = basename(root);
	const csproj = join(dir, `${name}.csproj`);
	const sln = join(dir, `${name}.sln`);
	const existing = existsSync(csproj);
	const plan = {
		action: existing ? "replace" : "create",
		net_solution: dir,
		csproj,
		sln,
		files: [csproj, sln],
		written: false,
		references: undefined,
		next: existing && !force
			? `${name}.csproj already exists; pass force to rewrite the csproj, sln and references from this Studio install.`
			: "The solution is written. Run optix_build action check to compile it, then optix_build action build to write bin/ for the runtime."
	};
	if (existing && !force) return plan;
	if (dryRun) {
		plan.references = await writeReferences(root, { install, dryRun: true }).catch((error) => ({ written: false, error: error.message }));
		return plan;
	}
	await mkdir(dir, { recursive: true });
	await writeFile(csproj, csprojText(name), "utf8");
	await writeFile(sln, solutionText(name), "utf8");
	const references = await writeReferences(root, { install, force: true });
	return { ...plan, action: existing ? "replaced" : "created", written: true, references, next: "The solution is written. Run optix_build action check to compile it, then optix_build action build to write bin/ for the runtime." };
}

/**
 * One `dotnet build` of a copied solution.
 * @param target - `.sln` or `.csproj` inside the scratch copy.
 * @param scratch - Folder the copy lives in, for reporting a relative path.
 */
function runDotnet(target, scratch) {
	return new Promise((resolveBuild) => {
		const started = Date.now();
		execFile(
			"dotnet",
			["build", target, "-v", "m", "--nologo"],
			{ timeout: BUILD_TIMEOUT_MS, windowsHide: true, cwd: dirname(target), maxBuffer: 16 * 1024 * 1024 },
			(error, stdout, stderr) => {
				const text = `${stdout ?? ""}${stderr ?? ""}`;
				const errors = [...text.matchAll(/^.*?\berror\s+([A-Z]+\d+):\s*(.+)$/gmu)].map((entry) => entry[0].trim());
				const warnings = [...text.matchAll(/^.*?\bwarning\s+([A-Z]+\d+):\s*(.+)$/gmu)].map((entry) => entry[0].trim());
				// The Optix runtime keeps bin\<project>.dll open while it serves, and a copy
				// inherits nothing, so a lock here is about the scratch folder not the project.
				const locked = /MSB302[67]|being used by another process/iu.test(text);
				const staleObject = /CS2001|MSB3491|MSB3030|GeneratedMSBuildEditorConfig/iu.test(text);
				resolveBuild({
					target: relative(scratch, target),
					ok: error === null,
					exit_code: error === null ? 0 : Number(error.code ?? 1),
					errors,
					warnings,
					locked,
					stale_object: staleObject,
					duration_ms: Date.now() - started,
					tail: text.trim().split("\n").slice(-12).join("\n")
				});
			}
		);
	});
}

/** Copy a solution folder into a scratch directory, leaving build output behind. */
async function copySolution(source, destination) {
	let entries;
	try {
		entries = await readdir(source, { withFileTypes: true });
	} catch {
		throw new Error(`no ProjectFiles\\NetSolution in ${dirname(source)} - is it an Optix project folder?`);
	}
	await mkdir(destination, { recursive: true });
	for (const entry of entries) {
		if (SKIP_DIRECTORIES.has(entry.name)) continue;
		const from = join(source, entry.name);
		const to = join(destination, entry.name);
		if (entry.isDirectory()) {
			await copySolution(from, to);
			continue;
		}
		await writeFile(to, await readFile(from));
	}
}

/** The build target Studio itself uses: the solution when the folder has one. */
async function buildTarget(root) {
	const csproj = await findCsproj(root);
	const dir = dirname(csproj);
	const entries = await readdir(dir);
	const sln = entries.filter((entry) => entry.toLowerCase().endsWith(".sln")).sort()[0];
	return { csproj, target: sln === undefined ? csproj : join(dir, sln) };
}

/**
 * Compile the project out of tree: the gate that proves the C# before Studio opens it.
 *
 * The copy exists so a check never writes `bin/`, `obj/` or a generated file into the
 * engineer's project; the absolute `HintPath`s in `<Project>.references` make the copy
 * build exactly as the real folder would.
 * @param root - Project folder.
 * @param options - `keep` leaves the scratch copy for inspection; `dotnet` overrides the SDK probe.
 */
/**
 * Which project types Studio has generated, and which of them shadow a built-in type.
 *
 * `Private/UITypeDefinitions.cs` is the file Studio regenerates on every save, and it is the only place
 * the whole collision surface is written down: one global-namespace class per project Screen, Panel,
 * Window, Dialog or Popup, including the ones a template-library import brought in. Reading it explains a
 * compile failure that names no project file (measured 2026-11-17: `error CS0029: Cannot implicitly
 * convert type 'FTOptix.UI.Trend' to 'Trend'` in the shipped `TrendPensLogic.cs`, caused by a screen
 * named `Trend`).
 * @param root - Project folder.
 */
export async function generatedTypeCollisions(root) {
	const file = join(netSolutionDir(root), "Private", "UITypeDefinitions.cs");
	let text;
	try {
		text = await readFile(file, "utf8");
	} catch {
		return { file, present: false, generated: 0, collisions: [], duplicates: [] };
	}
	return { file, present: true, ...typeCollisions(parseGeneratedTypes(text)) };
}

export async function checkBuild(root, { keep = false, refreshSdk = false } = {}) {
	const sdk = await dotnetSdk({ refresh: refreshSdk });
	if (!sdk.available) {
		const error = new Error(`dotnet SDK not found (${sdk.error || "no SDK in dotnet --list-sdks"}). An Optix NetLogic compiles with a .NET 8 SDK; the dotnet.exe bundled with Studio is a runtime and cannot build.`);
		error.code = "dotnet_sdk_missing";
		throw error;
	}
	const { csproj, target } = await buildTarget(root);
	const source = netSolutionDir(root);
	const scratch = await mkdtemp(join(tmpdir(), "dsh-optix-build-"));
	const copied = join(scratch, basename(netSolutionDir(root)));
	try {
		await copySolution(source, copied);
		const relativeTarget = join(copied, relative(dirname(csproj), target));
		const result = await runDotnet(relativeTarget, scratch);
		const collisions = await generatedTypeCollisions(root);
		const shadowing = collisions.collisions.length > 0 || collisions.duplicates.length > 0;
		return {
			mode: "check",
			isolated: true,
			project: csproj,
			scratch: keep ? scratch : "",
			sdk: sdk.sdks.at(-1),
			...result,
			ok: result.ok && result.errors.length === 0,
			type_collisions: collisions,
			next: result.ok && result.errors.length === 0
				? shadowing
					? `The solution compiles, but ${collisions.collisions.map((entry) => `${entry.name} (shadows ${entry.shadows})`).join(", ")} ${collisions.collisions.length === 1 ? "is" : "are"} a project type named after a built-in type, and Studio generates a global-namespace class for it: rename ${collisions.collisions.map((entry) => entry.name).join(", ")} before a library NetLogic that uses that name unqualified turns it into a compile error.`
					: "The solution compiles. Studio still has to build it to produce the runtime DLL."
				: shadowing
					? `Fix the errors, then run the check again. ${collisions.collisions.map((entry) => `${entry.name} shadows ${entry.shadows}`).join(", ")} ${collisions.collisions.length === 1 ? "is" : "are"} generated as global-namespace classes in ${collisions.file}, which is how a project type named after a built-in type breaks NetLogic that names the built-in unqualified (CS0029 / CS1061). Rename the project type: a screen cannot be renamed by a move, so create the new one, repoint what mounts it, then delete the old one.`
					: "Fix the errors, then run the check again. Nothing was written to the project."
		};
	} finally {
		if (!keep) await rm(scratch, { recursive: true, force: true });
	}
}

/**
 * What the project's build artefacts look like, which is the only proof Studio compiled.
 *
 * Studio writes `ProjectFiles/NetSolution/bin/<Project>.dll` when it builds; the copy the
 * runtime loads is that file. Its timestamp against the newest `.cs` answers "did my
 * change reach the runtime", which no bridge route can answer.
 * @param root - Project folder.
 */
export async function buildState(root) {
	const [csproj] = await Promise.all([findCsproj(root)]);
	const dir = netSolutionDir(root);
	const name = basename(csproj, ".csproj");
	const dll = join(dir, "bin", `${name}.dll`);
	const references = await readReferences(root);
	const sources = [];
	async function walk(folder) {
		let entries;
		try {
			entries = await readdir(folder, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (entry.isDirectory()) {
				if (SKIP_DIRECTORIES.has(entry.name)) continue;
				await walk(join(folder, entry.name));
				continue;
			}
			if (!/\.cs$/iu.test(entry.name)) continue;
			try {
				const info = await stat(join(folder, entry.name));
				sources.push({ file: join(folder, entry.name), modified: info.mtimeMs });
			} catch {
				// a file removed mid-walk is not a build fact
			}
		}
	}
	await walk(dir);
	const newestSource = sources.sort((left, right) => right.modified - left.modified)[0];
	let artifact;
	try {
		const info = await stat(dll);
		artifact = { file: dll, bytes: info.size, modified: new Date(info.mtimeMs).toISOString(), mtime: info.mtimeMs };
	} catch {
		artifact = undefined;
	}
	const state = artifact === undefined
		? "never_built"
		: newestSource !== undefined && artifact.mtime < newestSource.modified ? "stale" : "built";
	const collisions = await generatedTypeCollisions(root);
	return {
		project: root,
		net_solution: dir,
		csproj,
		sources: sources.length,
		newest_source: newestSource === undefined ? null : { file: newestSource.file, modified: new Date(newestSource.modified).toISOString() },
		artifact: artifact ?? null,
		references: {
			exists: references.exists,
			file: references.file,
			count: references.count,
			missing: references.missing,
			modules: references.modules ?? 0
		},
		state,
		proven: state === "built",
		type_collisions: collisions.collisions.length === 0 && collisions.duplicates.length === 0
			? null
			: collisions,
		next: state === "built"
			? "Studio's build is on disk. Start the runtime with optix_emulator to serve it."
			: state === "stale"
				? "The newest source is newer than the runtime DLL: save with optix_save, then build - Studio 1.8.1.27 documents no build keystroke, so the routes are optix_build action build with the emulator stopped, Studio's main toolbar's Open .NET Solution, or a Studio restart."
				: "The project has never been built, or the build wrote no bin/<Project>.dll: optix_build action build with the emulator stopped, or build the solution Studio opens through its main toolbar's Open .NET Solution."
	};
}
