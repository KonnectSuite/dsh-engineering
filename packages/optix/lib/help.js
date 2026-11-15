/**
 * The Studio help pages, shipped as an index and read from the installed help.
 *
 * The Help folder is 2,591 pages and 266 MB of DITA-generated HTML. Shipping the pages
 * themselves would dwarf the bundle, so the bundle ships what a search needs — title, section,
 * headings and a snippet — and reads the full page from the installed Studio when a caller asks
 * for one. That is the local-first shape: searching works with no Studio installed, reading needs
 * the Studio this project runs in.
 *
 * Nothing here calls a model or a service. The index is a file, the extractor is a few regexes,
 * and the ranking is deliberate: an exact title phrase beats every other match, because the page
 * a caller wants is almost always the one named after the thing they asked about.
 *
 * @module dsh-tool-ft-optix/help
 */
import { readFile, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const HELP_SCHEMA_VERSION = 1;
export const HELP_DIR = join("Help", "en");
export const INDEX_PATH = fileURLToPath(new URL("../help/index.json", import.meta.url));

const ENTITIES = {
	amp: "&",
	lt: "<",
	gt: ">",
	quot: '"',
	apos: "'",
	nbsp: " ",
	mdash: "\u2014",
	ndash: "\u2013",
	hellip: "\u2026",
	copy: "\u00a9",
	reg: "\u00ae",
	trade: "\u2122",
	laquo: "\u00ab",
	raquo: "\u00bb",
	lsquo: "\u2018",
	rsquo: "\u2019",
	ldquo: "\u201c",
	rdquo: "\u201d",
	bull: "\u2022",
	middot: "\u00b7",
};

/** Decode the entities a DITA page actually uses, numeric ones included. */
export function decodeEntities(text) {
	return String(text)
		.replace(/&#x([0-9a-f]+);/giu, (_, hex) => safeCodePoint(Number.parseInt(hex, 16)))
		.replace(/&#(\d+);/gu, (_, dec) => safeCodePoint(Number.parseInt(dec, 10)))
		.replace(/&([a-z]+);/giu, (match, name) => ENTITIES[name.toLowerCase()] ?? match);
}

function safeCodePoint(code) {
	try {
		return String.fromCodePoint(code);
	} catch {
		return "";
	}
}

/** Markup out, text in: tags become whitespace, entities are decoded, runs collapse. */
export function stripTags(html) {
	return decodeEntities(String(html).replace(/<[^>]*>/gu, " "))
		.replace(/\s+/gu, " ")
		.trim();
}

function cutBody(html) {
	const start = /<div[^>]+id=["']wh_topic_body["'][^>]*>/iu.exec(html);
	if (start !== null) return html.slice(start.index + start[0].length);
	const body = /<body[^>]*>/iu.exec(html);
	return body === null ? html : html.slice(body.index + body[0].length);
}

function dropScripts(html) {
	return html
		.replace(/<script\b[\s\S]*?<\/script>/giu, " ")
		.replace(/<style\b[\s\S]*?<\/style>/giu, " ")
		.replace(/<nav\b[\s\S]*?<\/nav>/giu, " ")
		.replace(/<footer\b[\s\S]*?<\/footer>/giu, " ");
}

const HEADING = /<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/giu;
const PARAGRAPH_BREAK = /<\/(?:p|div|li|tr|h[1-6]|section|article|dt|dd)>/giu;

/** The headings of a page, in document order, as plain text. */
export function headingsOf(html) {
	const headings = [];
	for (const match of html.matchAll(HEADING)) {
		const text = stripTags(match[2]);
		if (text !== "" && !headings.includes(text)) headings.push(text);
	}
	return headings;
}

/**
 * One page as text: paragraph breaks kept, list items as bullets, headings as `## `.
 * Studio's own navigation chrome lives outside #wh_topic_body, so cutting at that div is enough.
 */
export function extractText(html) {
	const body = dropScripts(cutBody(html))
		.replace(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/giu, (_, level, inner) => `\n\n${"#".repeat(Number(level) + 1)} ${stripTags(inner)}\n\n`)
		.replace(/<li[^>]*>/giu, "\n- ")
		.replace(PARAGRAPH_BREAK, "\n\n");
	const text = decodeEntities(body.replace(/<[^>]*>/gu, " "))
		.split("\n")
		.map((line) => line.replace(/[ \t]+/gu, " ").trim())
		.join("\n")
		.replace(/\n{3,}/gu, "\n\n")
		.trim();
	return text;
}

/** Title, headings, a snippet and a stable id for one page. */
export function extractPage(html, { id, path, section }) {
	const titleMatch = /<title>([\s\S]*?)<\/title>/iu.exec(html);
	const title = titleMatch === null ? "" : stripTags(titleMatch[1]);
	const text = extractText(html);
	const headings = headingsOf(cutBody(html));
	const snippet = oneLine(text).slice(0, SNIPPET_CHARS);
	return {
		id,
		title: title === "" ? id.split("/").at(-1) : title,
		section: section === undefined ? id.split("/")[0] : section,
		path,
		headings,
		snippet,
	};
}

export const SNIPPET_CHARS = 320;

function oneLine(text) {
	return String(text).replace(/\s+/gu, " ").trim();
}

/** Relative id and on-disk path for one HTML file under Help/en. */
export function pageOf(helpRoot, file) {
	const rel = relative(helpRoot, file).split(sep).join("/");
	return {
		id: rel.replace(/\.html$/iu, ""),
		path: rel,
		section: rel.split("/")[0],
	};
}

/**
 * Index every page under a Help/en folder.
 * `onProgress(done, total)` is for the generator's console line, not for callers.
 */
export async function buildIndex(helpRoot, { studioVersion = "", readdir: listDir, readFile: readOne } = {}) {
	const { readdir: readdirDefault, readFile: readFileDefault } = await import("node:fs/promises");
	const list = listDir ?? readdirDefault;
	const files = [];
	async function walk(dir) {
		const entries = await list(dir, { withFileTypes: true });
		for (const entry of entries) {
			const full = join(dir, entry.name);
			if (entry.isDirectory()) {
				if (entry.name === "oxygen-webhelp") continue;
				await walk(full);
			} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".html")) {
				files.push(full);
			}
		}
	}
	await walk(helpRoot);
	files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
	const read = readOne ?? readFileDefault;
	const pages = [];
	for (const file of files) {
		const { id, path, section } = pageOf(helpRoot, file);
		if (id.startsWith("oxygen-webhelp/")) continue;
		const html = await read(file, "utf8");
		const page = extractPage(html, { id, path, section });
		pages.push(page);
	}
	return { schemaVersion: HELP_SCHEMA_VERSION, studioVersion, pageCount: pages.length, pages };
}

let cached;

/** The shipped index, parsed once per process. */
export async function loadHelpIndex() {
	if (cached !== undefined) return cached;
	const text = await readFile(INDEX_PATH, "utf8");
	const index = JSON.parse(text);
	cached = index;
	return index;
}

const TOKEN = /[a-z0-9]+/gu;

function tokens(text) {
	return String(text).toLowerCase().match(TOKEN) ?? [];
}

/**
 * Ranked search over the index. Every token must appear somewhere in the page's title,
 * headings, snippet or id; the phrase in the title is worth more than any single hit.
 */
export function searchHelp(index, query, { limit = 8, section = "" } = {}) {
	const words = tokens(query);
	if (words.length === 0) throw new Error("query needs at least one word (letters or digits)");
	const phrase = words.join(" ");
	const wanted = section === "" ? "" : String(section).toLowerCase();
	const hits = [];
	for (const page of index.pages) {
		if (wanted !== "" && !String(page.section).toLowerCase().includes(wanted)) continue;
		const title = String(page.title).toLowerCase();
		const headings = (page.headings ?? []).join(" ").toLowerCase();
		const snippet = String(page.snippet).toLowerCase();
		const id = String(page.id).toLowerCase();
		let score = 0;
		let matched = 0;
		for (const word of words) {
			let seen = false;
			if (title.includes(word)) {
				score += 25;
				seen = true;
			}
			if (headings.includes(word)) {
				score += 8;
				seen = true;
			}
			if (id.includes(word)) {
				score += 6;
				seen = true;
			}
			if (snippet.includes(word)) {
				score += 2;
				seen = true;
			}
			if (seen) matched += 1;
		}
		if (matched === 0) continue;
		if (matched === words.length) score += 20;
		if (title.includes(phrase)) score += 100;
		if (id.endsWith(`/${words.join("-")}`) || id.includes(`/${phrase.replace(/ /gu, "-")}`)) score += 30;
		hits.push({ ...page, headings: (page.headings ?? []).slice(0, 6), score, matched });
	}
	hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
	return { query, tokens: words, total: hits.length, hits: hits.slice(0, Math.max(1, limit)) };
}

/** One page's full text from the installed Help. */
export async function readHelpPage(index, id, { install } = {}) {
	const page = index.pages.find((candidate) => candidate.id === id);
	if (page === undefined) {
		const near = searchHelp(index, id.split("/").at(-1) ?? id, { limit: 5 }).hits.map((hit) => hit.id);
		throw new Error(`no help page with id "${id}"${near.length === 0 ? "" : ` - closest ids: ${near.join(", ")}`}`);
	}
	if (install === undefined || install === null) {
		throw new Error(`reading "${id}" needs the installed Studio help: pass the Studio install (optix_docs action status reports it)`);
	}	const file = join(install.root, HELP_DIR, page.path.split("/").join(sep));
	const html = await readFile(file, "utf8").catch((error) => {
		throw new Error(`the installed help at ${file} cannot be read (${error.message}); the index may be newer than this Studio`);
	});
	return {
		id: page.id,
		title: page.title,
		section: page.section,
		studio_version: index.studioVersion,
		source_path: file,
		headings: page.headings,
		text: extractText(html),
	};
}

/** The version a Studio install row reports, without its `-Stable` channel suffix. */
export function installedVersion(install) {
	return String(install?.version ?? "").replace(/-Stable$/u, "");
}

/** Whether the index matches the installed Studio, and where to read pages from. */
export async function helpStatus(index, { installs = [] } = {}) {
	const install = installs[0];
	const helpRoot = install === undefined ? "" : join(install.root, HELP_DIR);
	const exists = helpRoot === "" ? false : await stat(helpRoot).then((info) => info.isDirectory()).catch(() => false);
	const stale = install !== undefined && installedVersion(install) !== index.studioVersion;
	return {
		indexed_pages: index.pageCount,
		index_studio_version: index.studioVersion,
		install: install === undefined ? null : { version: installedVersion(install), path: install.root },
		help_folder: helpRoot,
		help_folder_present: exists,
		stale,
		search: "works without Studio; the index is shipped",
		read: exists ? "reads the installed pages" : "needs an installed Studio whose Help/en matches the index",
	};
}

/** The install the bundle should read pages from. */
export function pickInstall(installs) {
	return installs === undefined || installs.length === 0 ? undefined : installs[0];
}
