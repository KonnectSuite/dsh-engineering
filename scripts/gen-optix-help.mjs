/**
 * Regenerate `packages/optix/help/index.json` from an installed Studio.
 *
 *   node scripts/gen-optix-help.mjs                 # newest install, write the index
 *   node scripts/gen-optix-help.mjs --check         # exit 1 when the index is stale
 *   node scripts/gen-optix-help.mjs --studio "<dir>"  # a specific Studio x.y.z folder
 *
 * The index carries the page id, title, section, headings and a 320-character snippet for every
 * page under `Help/en` (2,591 pages on 1.8.1.27). The pages themselves are not copied: they are
 * 266 MB of generated HTML, and the runtime reads them from the install when a caller asks for one.
 * `pnpm optix:help` is the package script.
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildIndex, HELP_DIR, HELP_SCHEMA_VERSION, INDEX_PATH, installedVersion } from "../packages/optix/lib/help.js";
import { studioInstalls } from "../packages/optix/lib/build.js";

function argument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? "" : (process.argv[index + 1] ?? "");
}

const explicit = argument("--studio");

let install;
if (explicit !== "") {
	const raw = (await readFile(join(explicit, "IDEVersion.txt"), "utf8")).trim();
	install = { root: explicit, version: raw.replace(/-Stable$/u, "") };
} else {
	const installs = await studioInstalls();
	if (installs.length === 0) {
		console.error("gen-optix-help: no FactoryTalk Optix Studio install found (pass --studio <folder>)");
		process.exit(1);
	}
	install = installs[0];
}

const helpRoot = join(install.root, HELP_DIR);
const studioVersion = installedVersion(install);
const started = Date.now();
const index = await buildIndex(helpRoot, { studioVersion });
if (index.pageCount === 0) {
	console.error(`gen-optix-help: no pages under ${helpRoot}`);
	process.exit(1);
}

const existing = await readFile(INDEX_PATH, "utf8").catch(() => "");
const previous = existing === "" ? undefined : JSON.parse(existing);
const text = render(index);

if (process.argv.includes("--check")) {
	if (previous === undefined) {
		console.error(`gen-optix-help: ${INDEX_PATH} is missing; run node scripts/gen-optix-help.mjs`);
		process.exit(1);
	}
	const drift =
		previous.schemaVersion !== index.schemaVersion ||
		previous.studioVersion !== index.studioVersion ||
		previous.pageCount !== index.pageCount ||
		JSON.stringify(previous.pages) !== JSON.stringify(index.pages);
	if (drift) {
		console.error(
			`gen-optix-help: the index is stale (indexed ${previous.studioVersion || "no version"}, ` +
			`${previous.pageCount} pages; installed ${index.studioVersion}, ${index.pageCount} pages) - ` +
			"run node scripts/gen-optix-help.mjs",
		);
		process.exit(1);
	}
	console.log(`gen-optix-help: ${index.pageCount} pages, index up to date with Studio ${index.studioVersion}`);
	process.exit(0);
}

await writeFile(INDEX_PATH, text, "utf8");
const changed = previous === undefined ? "created" : previous.pageCount === index.pageCount ? "rewritten" : "rebuilt";
console.log(
	`gen-optix-help: ${changed} ${INDEX_PATH} - ${index.pageCount} pages, ${(Buffer.byteLength(text) / 1024).toFixed(0)} KiB, ` +
	`Studio ${index.studioVersion || "unknown"}, ${Date.now() - started} ms`,
);

/** One page per line, so a Studio upgrade diffs page by page instead of line by line. */
function render(value) {
	const head = {
		schemaVersion: HELP_SCHEMA_VERSION,
		studioVersion: value.studioVersion,
		pageCount: value.pageCount,
	};
	const lines = value.pages.map((page) => JSON.stringify(page));
	return `${JSON.stringify(head, null, "\t").replace(/\n\}$/u, "")},\n"pages": [\n${lines.join(",\n")}\n]\n}\n`;
}
