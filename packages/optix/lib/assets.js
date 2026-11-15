/**
 * Authored artwork for a designed screen: the icons a shell needs, and the process drawings a SCADA view
 * cannot do without. Everything here is written for Optix, not fetched: SVG 1.2 Tiny, hexadecimal fills, an
 * `@id` on every part that could be driven, and a 24 px box so a rail or a header row lines up.
 *
 * These files are placed under `<Project>/ProjectFiles/imgs/`, which is the folder `%PROJECTDIR%` resolves
 * to and the one the Web Presentation Engine serves. A file copied beside the project (into `<Project>/imgs`)
 * is a 404 at runtime and renders as a blank image, which is why `writeAssets()` takes the project folder and
 * nothing else.
 */

import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** The drawing box every icon is built in. */
export const ICON_BOX = 24;

/** Where the runtime looks for artwork, relative to the project folder. */
export const ASSET_DIR = join("ProjectFiles", "imgs");

const svg = (body, width = ICON_BOX, height = ICON_BOX) =>
	`<svg xmlns="http://www.w3.org/2000/svg" version="1.2" baseProfile="tiny" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;

/** A filled path, with an id when it is meant to be animated. */
const path = (d, fill = "currentColor", id = "") => `<path${id === "" ? "" : ` id="${id}"`} d="${d}" fill="${fill}"/>`;

/**
 * The icon set. Every name is a file `<name>.svg` under `ProjectFiles/imgs`; the shell passes it to an
 * `Image` node's `Path` as `%PROJECTDIR%/imgs/<name>.svg` and to a `NavigationPanelItem`'s `ImagePath`.
 *
 * Fills are painted by the caller (`colour`), because a stylesheet owns colour and an icon that carries its
 * own hex cannot follow a theme. `currentColor` is not resolved by Optix, so `iconSvg()` substitutes the hex.
 */
export const ICONS = {
	home: svg(path("M12 3 L21 10 V21 H15 V15 H9 V21 H3 V10 Z")),
	overview: svg(path("M3 3 H10 V10 H3 Z") + path("M14 3 H21 V10 H14 Z") + path("M3 14 H10 V21 H3 Z") + path("M14 14 H21 V21 H14 Z")),
	alarms: svg(path("M12 2 L22 20 H2 Z") + path("M11 8 H13 V14 H11 Z", "#000") + path("M11 16 H13 V18 H11 Z", "#000")),
	trends: svg(path("M3 20 L8 12 L12 15 L17 6 L21 9") + `<path id="TrendLine" d="M3 20 L8 12 L12 15 L17 6 L21 9" fill="none" stroke="currentColor" stroke-width="2"/>`),
	diagnostics: svg(path("M4 12 H8 L10 5 L14 19 L16 12 H20") + `<path id="DiagLine" d="M4 12 H8 L10 5 L14 19 L16 12 H20" fill="none" stroke="currentColor" stroke-width="2"/>`),
	settings: svg(path("M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z") + path("M11 2 H13 L13.5 5 L16 6 L18.5 4 L20 5.5 L18 8 L19 11 H22 V13 H19 L18 16 L20 18.5 L18.5 20 L16 18 L13 19 L13.5 22 H11 L11 19 L8 18 L5.5 20 L4 18.5 L6 16 L5 13 H2 V11 H5 L6 8 L4 5.5 L5.5 4 L8 6 L11 5 Z")),
	users: svg(path("M8 4 A4 4 0 1 0 8 12 A4 4 0 1 0 8 4 Z") + path("M2 21 C2 16 5 14 8 14 C11 14 14 16 14 21 Z") + path("M16 5 A3 3 0 1 0 16 11 A3 3 0 1 0 16 5 Z") + path("M15 13 C19 13 22 15 22 20 H16 Z")),
	recipes: svg(path("M5 2 H15 L19 6 V22 H5 Z") + path("M8 10 H16 V11.5 H8 Z", "#000") + path("M8 13 H16 V14.5 H8 Z", "#000") + path("M8 16 H13 V17.5 H8 Z", "#000")),
	reports: svg(path("M4 20 V10 H7 V20 Z") + path("M9 20 V4 H12 V20 Z") + path("M14 20 V13 H17 V20 Z") + path("M19 20 V7 H22 V20 Z")),
	logout: svg(path("M4 3 H13 V21 H4 Z") + path("M15 11 H22 V13 H15 Z") + path("M18 8 L22 12 L18 16 Z")),
	ok: svg(path("M4 12 L9 18 L20 5 L18 3 L9 13 L6 10 Z")),
	warning: svg(path("M12 2 L22 20 H2 Z") + path("M11 8 H13 V14 H11 Z", "#000") + path("M11 16 H13 V18 H11 Z", "#000")),
	alarm: svg(path("M12 2 A6 6 0 0 0 6 8 V13 L4 16 H20 L18 13 V8 A6 6 0 0 0 12 2 Z") + path("M10 18 H14 V21 H10 Z", "#000")),
	offline: svg(path("M3 3 L21 21") + `<path id="OfflineSlash" d="M3 3 L21 21" fill="none" stroke="currentColor" stroke-width="2.5"/>` + path("M12 5 A6 6 0 0 0 6 11 V13 L4 16 H17 Z")),
	chevron: svg(path("M9 4 L17 12 L9 20 L7 18 L13 12 L7 6 Z")),
	bell: svg(path("M12 2 A6 6 0 0 0 6 8 V13 L4 16 H20 L18 13 V8 A6 6 0 0 0 12 2 Z") + path("M10 18 H14 V21 H10 Z", "#000")),
};

/**
 * Two process drawings for a SCADA view. The conveyor is deliberately built from ids so a value can drive a
 * part's fill through `optix_svg bind`: `framed` reads as stopped, `running` as in production, `alarm` as a
 * fault, and the three are the same drawing with one part's colour changed by the tag.
 */
export const MIMICS = {
	conveyor: svg(
		[
			`<rect id="Frame" x="2" y="14" width="120" height="8" fill="#C9CDD1"/>`,
			`<rect id="Belt" x="4" y="10" width="116" height="4" fill="#8B939A"/>`,
			`<circle id="Roller1" cx="14" cy="18" r="4" fill="#6E767D"/>`,
			`<circle id="Roller2" cx="52" cy="18" r="4" fill="#6E767D"/>`,
			`<circle id="Roller3" cx="90" cy="18" r="4" fill="#6E767D"/>`,
			`<circle id="Roller4" cx="118" cy="18" r="4" fill="#6E767D"/>`,
			`<rect id="Workpiece" x="40" y="4" width="24" height="6" fill="#0FAFFF"/>`,
			`<rect id="Guard" x="26" y="0" width="4" height="10" fill="#8B939A"/>`,
			`<rect id="Stack" x="96" y="2" width="16" height="8" fill="#E5484D"/>`,
		].join(""),
		124,
		26
	),
	tank: svg(
		[
			`<rect id="Tank" x="10" y="2" width="60" height="90" rx="6" fill="#E6E8EA" stroke="#8B939A" stroke-width="2"/>`,
			`<rect id="Level" x="12" y="50" width="56" height="40" rx="4" fill="#0FAFFF" opacity="0.55"/>`,
			`<rect id="PipeIn" x="24" y="0" width="6" height="6" fill="#8B939A"/>`,
			`<rect id="PipeOut" x="70" y="80" width="20" height="6" fill="#8B939A"/>`,
			`<rect id="Valve" x="66" y="70" width="10" height="10" fill="#30A46C"/>`,
		].join(""),
		92,
		98
	),
};

/** Every file name this module can write, icons first. */
export function assetNames() {
	return [...Object.keys(ICONS).map((name) => `${name}.svg`), ...Object.keys(MIMICS).map((name) => `${name}.svg`)];
}

/**
 * One icon as SVG text, with the placeholder fill replaced by a real colour.
 *
 * @param {string} name An icon name from `ICONS`.
 * @param {{colour?: string}} [options] `colour` is `#RRGGBB`; it defaults to the neutral text colour.
 * @returns {string} The SVG document.
 * @throws {Error} `asset_unknown` when the name is not in the set.
 */
export function iconSvg(name, { colour = "#3B3B3B" } = {}) {
	const text = ICONS[name];
	if (text === void 0) throw new Error(`asset_unknown: no icon "${name}" - choose ${Object.keys(ICONS).join(", ")}`);
	if (!/^#[0-9A-F]{6}$/iu.test(String(colour))) throw new Error(`asset_bad_colour: "${colour}" is not #RRGGBB`);
	return text.replaceAll("currentColor", String(colour));
}

/**
 * One process drawing as SVG text.
 *
 * @param {string} name A mimic name from `MIMICS`.
 * @returns {string} The SVG document.
 * @throws {Error} `asset_unknown` when the name is not in the set.
 */
export function mimicSvg(name) {
	const text = MIMICS[name];
	if (text === void 0) throw new Error(`asset_unknown: no mimic "${name}" - choose ${Object.keys(MIMICS).join(", ")}`);
	return text;
}

/**
 * Write the icon and mimic set into a project's runtime artwork folder.
 *
 * @param {string} projectRoot The folder that holds `<Project>.optix`.
 * @param {{names?: string[], colour?: string, only?: string[], dryRun?: boolean}} [options]
 *   `names` restricts the set by file name; `only` restricts it by icon/mimic name; `dryRun` writes nothing.
 * @returns `{dir, dir_relative, written, files, count, dry_run}`.
 */
export async function writeAssets(projectRoot, { names, colour, only, dryRun = false } = {}) {
	const target = join(projectRoot, ASSET_DIR);
	const wanted = names === void 0 ? assetNames() : names.map((name) => (name.endsWith(".svg") ? name : `${name}.svg`));
	const restricted = only === void 0 ? wanted : wanted.filter((file) => only.includes(file.replace(/\.svg$/u, "")));
	const files = restricted.map((file) => ({ path: join(ASSET_DIR, file), text: file.startsWith("conveyor") || file.startsWith("tank") ? mimicSvg(file.replace(/\.svg$/u, "")) : iconSvg(file.replace(/\.svg$/u, ""), { colour }) }));
	if (!dryRun && files.length > 0) {
		await mkdir(target, { recursive: true });
		await Promise.all(files.map((file) => writeFile(join(projectRoot, file.path), file.text, "utf8")));
	}
	return {
		dir: target,
		dir_relative: ASSET_DIR,
		written: dryRun ? 0 : files.length,
		files: files.map((file) => file.path),
		count: files.length,
		dry_run: dryRun
	};
}

/** Remove one file this module wrote, so a rename does not leave orphaned artwork behind. */
export async function removeAsset(projectRoot, file) {
	await rm(join(projectRoot, ASSET_DIR, file), { force: true });
	return { removed: join(ASSET_DIR, file) };
}

/** The artwork a shell asks for by default: five rail icons, four state lights and the bell. */
export function shellIcons() {
	return ["home", "alarms", "trends", "diagnostics", "settings", "ok", "warning", "alarm", "offline", "bell"];
}

/** Where an image node should point for one of these files. */
export function assetPath(file) {
	const base = file.endsWith(".svg") ? file : `${file}.svg`;
	return `%PROJECTDIR%/imgs/${base}`;
}
