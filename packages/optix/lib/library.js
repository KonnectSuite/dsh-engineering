/** Read the template libraries FactoryTalk Optix ships, from disk, with no Studio session. @module dsh-tool-ft-optix/library */
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { studioRoots } from "./emulator.js";
/** Where a Studio install keeps the libraries the engineer drags from. */
const LIBRARIES_SUBPATH = join("Files", "Libraries");
/** The file a library lists its importable items in. */
const ITEMS_SUBPATH = join("Nodes", "Items", "Items.yaml");
/** The file a library keeps its item names and descriptions in, one row per key. */
const TRANSLATIONS_SUBPATH = join("Nodes", "Translations", "Translations.yaml");
/** A shipped description is guidance for the engineer, not a value to quote in full. */
const DESCRIPTION_LIMIT = 400;
/** How many near-miss names one refusal may name. */
const SUGGESTION_LIMIT = 6;
/**
 * Locate the template libraries a Studio install ships.
 *
 * The catalog is plain YAML on disk, so this half of library work needs no bridge, no loaded
 * project, and no Studio session: it answers "what quality parts exist" before anything is
 * authored. Only the import needs Studio.
 * @returns Every `Files/Libraries` folder this machine holds, newest version last.
 */
export async function libraryRoots() {
	const found = [];
	for (const root of studioRoots()) {
		let studios;
		try {
			studios = await readdir(root);
		} catch {
			continue;
		}
		for (const studio of studios.filter((entry) => entry.startsWith("Studio")).sort()) {
			const libraries = join(root, studio, LIBRARIES_SUBPATH);
			try {
				if ((await readdir(libraries)).length > 0) found.push({
					studio: join(root, studio),
					version: studio,
					libraries
				});
			} catch {
				continue;
			}
		}
	}
	return found;
}
/**
 * The localized text a library carries for one key, English and Chinese only.
 * @param dictionary - Parsed localization dictionary.
 * @param key - The `TextId` a node's DisplayName or Description points at.
 * @returns The localized entry, or nothing when the dictionary lacks the key.
 */
function textFor(dictionary, key) {
	return key === "" ? void 0 : dictionary.get(key);
}
/**
 * Attach the shipped display name and description to a catalog item.
 * @param item - Parsed catalog entry.
 * @param dictionary - The library's localization dictionary.
 * @returns The entry with `display` and `description` where the library states them.
 */
function localize(item, dictionary) {
	const display = textFor(dictionary, item.display_key);
	const description = textFor(dictionary, item.description_key);
	return {
		...item,
		...display === void 0 ? {} : {
			display: display.en,
			...display.zh === void 0 ? {} : { display_zh: display.zh }
		},
		...description === void 0 ? {} : { description: description.en.slice(0, DESCRIPTION_LIMIT) }
	};
}
/**
 * Split a library's Items.yaml into importable items and the group folders holding the rest.
 *
 * An item is a top-level `- Name:` entry whose own `Type:` is `ObjectLibraryItem`; a group is a
 * bare `- File:` reference or a folder entry, which the catalog points at but does not name as
 * importable. Only the documented top-level form is reported as importable (see coverage).
 * @param text - The library's `Nodes/Items/Items.yaml`.
 * @returns Importable items, and the group names the catalog references.
 */
export function parseItems(text) {
	const lines = text.split(/\r?\n/u);
	const starts = [];
	for (let index = 0; index < lines.length; index += 1) if (/^- (?:Name|File): /u.test(lines[index])) starts.push(index);
	const items = [];
	const groups = [];
	for (let position = 0; position < starts.length; position += 1) {
		const block = lines.slice(starts[position], position + 1 < starts.length ? starts[position + 1] : lines.length).join("\n");
		const reference = /^- File: ([^\s/]+)\//u.exec(block);
		if (reference !== null) {
			groups.push(reference[1]);
			continue;
		}
		// `m`, not just `u`: `$` in a non-multiline pattern is end-of-STRING, and every block is
		// multi-line, so without it no item ever matched and `action list` answered 0 items.
		const name = /^- Name: (.+)$/mu.exec(block);
		const kind = /\n {2}Type: (\S+)/u.exec(block);
		if (name === null || kind === null) continue;
		if (kind[1] !== "ObjectLibraryItem") {
			groups.push(name[1]);
			continue;
		}
		const guid = /Name: LibraryItemGuid[\s\S]{0,160}?Value: "?([0-9a-fA-F-]{32})"?/u.exec(block);
		const version = /Name: LibraryItemVersion[\s\S]{0,160}?Value: (\d+)/u.exec(block);
		items.push({
			name: name[1],
			guid: guid === null ? "" : guid[1],
			version: version === null ? 0 : Number(version[1]),
			display_key: textId("DisplayName", block),
			description_key: textId("Description", block),
			owned_types: [...block.matchAll(/Type: HasOwnedType/gu)].length,
			components: [...block.matchAll(/\n\s*- File: ([^\s]+)\.yaml/gu)].map((match) => match[1].split("/").pop())
		});
	}
	return {
		items,
		groups
	};
}
/**
 * The `TextId` a DisplayName or Description literal points at.
 * @param field - `DisplayName` or `Description`.
 * @param block - One catalog entry.
 * @returns The key, or an empty string when the entry states none.
 */
function textId(field, block) {
	const match = new RegExp(`${field}: \\{[^}]*"TextId":"([^"]+)"`, "u").exec(block);
	return match === null ? "" : match[1];
}
/**
 * Read a library's localization dictionary, keeping the English and Chinese columns.
 *
 * The dictionary is a quoted matrix: a header row of locale codes, then one row per key. Column
 * order comes from that header rather than being assumed, so a library that ships a different
 * locale set still resolves correctly.
 * @param text - The library's `Nodes/Translations/Translations.yaml`.
 * @returns Key to localized text; an empty Map when the file holds no dictionary.
 */
export function parseDictionary(text) {
	const lines = text.split(/\r?\n/u);
	const start = lines.findIndex((line) => /^\s*"Body": \[?/u.test(line));
	if (start < 0) return new Map();
	const rows = [];
	for (let index = start + 1; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line.startsWith('"')) break;
		rows.push(line.replace(/,$/u, "").replace(/^"/u, "").replace(/"$/u, "").split('","'));
		if (rows.length >= 4000) break;
	}
	const header = rows.shift();
	if (header === void 0) return new Map();
	const english = header.indexOf("en-US");
	if (english < 0) return new Map();
	const chinese = header.indexOf("zh-CN");
	const dictionary = new Map();
	for (const row of rows) {
		if (row.length <= english || row[0] === "") continue;
		dictionary.set(row[0], {
			en: row[english].replaceAll("\\n", "\n").trim(),
			...chinese > 0 && row.length > chinese ? { zh: row[chinese].replaceAll("\\n", "\n").trim() } : {}
		});
	}
	return dictionary;
}
/**
 * Read every shipped library's catalog, with the names and descriptions the library ships.
 * @param libraries - A `Files/Libraries` folder from `libraryRoots`.
 * @param signal - Caller cancellation.
 * @returns One descriptor per library folder, in folder-name order.
 */
export async function readCatalog(libraries, signal) {
	const catalog = [];
	for (const folder of (await readdir(libraries)).sort()) {
		signal?.throwIfAborted();
		let parsed;
		try {
			parsed = parseItems(await readFile(join(libraries, folder, ITEMS_SUBPATH), "utf8"));
		} catch {
			continue;
		}
		let dictionary = new Map();
		try {
			dictionary = parseDictionary(await readFile(join(libraries, folder, TRANSLATIONS_SUBPATH), "utf8"));
		} catch {
			dictionary = new Map();
		}
		catalog.push({
			library: folder,
			item_count: parsed.items.length,
			groups: parsed.groups,
			items: parsed.items.map((item) => localize(item, dictionary))
		});
	}
	return catalog;
}
/**
 * Bounded edit distance; a name past the cap costs the cap rather than a full matrix.
 * @param left - One name.
 * @param right - Another name.
 * @param cap - Distance beyond which the pair stops being interesting.
 * @returns The edit distance, capped.
 */
function editDistance(left, right, cap) {
	if (Math.abs(left.length - right.length) > cap) return cap;
	let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let i = 1; i <= left.length; i += 1) {
		const current = [i];
		let best = i;
		for (let j = 1; j <= right.length; j += 1) {
			const value = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1));
			current.push(value);
			if (value < best) best = value;
		}
		if (best > cap) return cap;
		previous = current;
	}
	return Math.min(previous[right.length], cap);
}
/**
 * Closest catalog names for a library or item the caller misspelled.
 * @param input - What was asked for.
 * @param names - Catalog names to match against.
 * @param limit - How many suggestions to return.
 * @returns Best matches first; empty when nothing is close.
 */
export function suggestNames(input, names, limit = SUGGESTION_LIMIT) {
	const needle = input.trim().toLowerCase();
	if (needle === "") return [];
	const scored = [];
	for (const name of names) {
		const hay = name.toLowerCase();
		const score = hay === needle ? 0 : hay.includes(needle) || needle.includes(hay) ? 1 : 2 + editDistance(hay, needle, 4);
		if (score <= 6) scored.push({
			name,
			score
		});
	}
	return scored.sort((a, b) => a.score - b.score || a.name.localeCompare(b.name)).slice(0, limit).map((entry) => entry.name);
}
/**
 * Find one catalog entry by library and item, case-insensitive, accepting browse or display name.
 * @param catalog - Catalog from `readCatalog`.
 * @param library - Library folder name.
 * @param item - Item browse name or display name.
 * @returns The library descriptor and the item, or null when either is absent.
 */
export function findEntry(catalog, library, item) {
	const entry = catalog.find((candidate) => candidate.library.toLowerCase() === library.trim().toLowerCase());
	if (entry === void 0) return null;
	const wanted = item.trim().toLowerCase();
	const found = entry.items.find((candidate) => candidate.name.toLowerCase() === wanted || (candidate.display ?? "").toLowerCase() === wanted);
	return found === void 0 ? null : {
		library: entry,
		item: found
	};
}
/**
 * The library names this install ships.
 * @param catalog - Catalog from `readCatalog`.
 * @returns Library folder names.
 */
export function libraryNames(catalog) {
	return catalog.map((entry) => entry.library);
}
/**
 * The importable names one library holds, browse and display forms together.
 * @param entry - One library descriptor.
 * @returns Names the caller may pass as `item`.
 */
export function itemNames(entry) {
	return entry.items.flatMap((item) => item.display === void 0 || item.display === item.name ? [item.name] : [item.name, item.display]);
}
/**
 * Whether a Studio install with a catalog was found, phrased for a tool error.
 * @returns A refusal naming the folders that were searched.
 */
export function noStudioInstall() {
	return {
		status: "failed",
		error: `No FactoryTalk Optix Studio install holding ${LIBRARIES_SUBPATH} was found under ${studioRoots().join(", ")}.`,
		next: "Install FactoryTalk Optix Studio, or read the catalog from the machine that holds it."
	};
}
//# sourceMappingURL=library.js.map
