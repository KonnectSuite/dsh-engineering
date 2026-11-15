import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	HELP_DIR,
	buildIndex,
	decodeEntities,
	extractPage,
	extractText,
	headingsOf,
	helpStatus,
	installedVersion,
	loadHelpIndex,
	readHelpPage,
	searchHelp,
	stripTags
} from "../packages/optix/lib/help.js";

const PAGE = `<!DOCTYPE html><html><head><title>PanelLoader</title>
<meta name="description" content="ignored"/></head>
<body id="x" class="wh_topic_page frmBody">
<a class="visually-hidden-focusable" href="#wh_topic_body">Jump to main content</a>
<div class="container"><nav><a href="../home">Home</a></nav></div>
<div id="wh_topic_body" class="wh_topic_body">
<h1 class="title topictitle1">PanelLoader</h1>
<p>The PanelLoader displays one screen at a time &amp; switches it with ChangePanel.</p>
<h2 id="panel">Panel</h2>
<ul><li>Set the Panel property to a screen.</li><li>Use a NodePath, not a default value.</li></ul>
<script>var ignored = "ChangePanel";</script>
</div>
<footer><p>Next</p></footer>
</body></html>`;

test("entities decode and markup becomes text", () => {
	assert.equal(decodeEntities("A &amp; B &#8212; C &#x2014; &unknown;"), "A & B \u2014 C \u2014 &unknown;");
	assert.equal(stripTags("<p>a <b>bold</b> claim</p>"), "a bold claim");
	assert.equal(stripTags("<p>  spaced   out </p>"), "spaced out");
});

test("the body is cut at wh_topic_body, so navigation chrome never becomes content", () => {
	const text = extractText(PAGE);
	assert.match(text, /The PanelLoader displays one screen at a time & switches it with ChangePanel\./u);
	assert.match(text, /## Panel/u);
	assert.match(text, /- Set the Panel property to a screen\./u);
	assert.doesNotMatch(text, /Jump to main content/u);
	assert.doesNotMatch(text, /var ignored/u, "script bodies are not content");
});

test("headings of a page are plain text and unique, in document order", () => {
	assert.deepEqual(headingsOf(PAGE), ["PanelLoader", "Panel"]);
});

test("a page keeps its title, its section and a bounded snippet", () => {
	const page = extractPage(PAGE, { id: "Reference/FTOptix-UI/ObjectTypes/PanelLoader", path: "Reference/FTOptix-UI/ObjectTypes/PanelLoader.html", section: "Reference" });
	assert.equal(page.title, "PanelLoader");
	assert.equal(page.section, "Reference");
	assert.ok(page.snippet.length <= 320);
	assert.match(page.snippet, /displays one screen/u);
});

test("building an index walks Help/en, skips the help engine and keys pages by path", async () => {
	const root = await mkdtemp(join(tmpdir(), "dsh-optix-help-"));
	try {
		await mkdir(join(root, "Help", "en", "Reference", "FTOptix-UI"), { recursive: true });
		await mkdir(join(root, "Help", "en", "oxygen-webhelp"), { recursive: true });
		await mkdir(join(root, "Help", "en", "creating-projects"), { recursive: true });
		await writeFile(join(root, "Help", "en", "Reference", "FTOptix-UI", "PanelLoader.html"), PAGE);
		await writeFile(join(root, "Help", "en", "creating-projects", "auth.html"), `<!DOCTYPE html><html><head><title>Sign in</title></head><body><div id="wh_topic_body"><p>Use Session.ChangeUser.</p></div></body></html>`);
		await writeFile(join(root, "Help", "en", "oxygen-webhelp", "junk.html"), PAGE);
		const index = await buildIndex(join(root, "Help", "en"), { studioVersion: "1.8.1.27" });
		assert.equal(index.schemaVersion, 1);
		assert.equal(index.studioVersion, "1.8.1.27");
		assert.equal(index.pageCount, 2);
		assert.deepEqual(index.pages.map((page) => page.id), ["Reference/FTOptix-UI/PanelLoader", "creating-projects/auth"]);
		assert.deepEqual(index.pages.map((page) => page.section), ["Reference", "creating-projects"]);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("search ranks the page named after the question first", async () => {
	const index = await loadHelpIndex();
	const result = searchHelp(index, "Session.ChangeUser", { limit: 3 });
	assert.ok(result.total > 0);
	assert.equal(result.hits[0].id, "extending-projects/api/session/Session-ChangeUser");
	assert.ok(result.hits[0].score > 100);
	const titleFirst = searchHelp(index, "alarm summary", { limit: 3 });
	assert.equal(titleFirst.hits[0].id, "creating-projects/alarms/alarm-summary");
});

test("search needs real words, honours a section filter and refuses an empty query", async () => {
	const index = await loadHelpIndex();
	assert.throws(() => searchHelp(index, "   "), /query needs at least one word/u);
	const creating = searchHelp(index, "alarm", { section: "creating-projects", limit: 5 });
	assert.ok(creating.hits.length > 0);
	assert.ok(creating.hits.every((hit) => hit.section === "creating-projects"));
	assert.equal(searchHelp(index, "zzzzqqqqxxxx").total, 0);
});

test("the shipped index covers every page it lists, and its ids are unique", async () => {
	const index = await loadHelpIndex();
	assert.equal(index.pageCount, index.pages.length);
	assert.ok(index.pageCount > 2000, "the shipped index is the installed Studio help, not a sample");
	const ids = new Set();
	for (const page of index.pages) {
		assert.equal(typeof page.id, "string");
		assert.ok(page.id.length > 0);
		assert.equal(typeof page.title, "string");
		assert.ok(Array.isArray(page.headings));
		assert.ok(page.snippet.length <= 320);
		assert.equal(ids.has(page.id), false, `duplicate id ${page.id}`);
		ids.add(page.id);
	}
});

test("the installed help does not document ChangePanel, which is why optix_nav exists", async () => {
	const index = await loadHelpIndex();
	assert.equal(searchHelp(index, "ChangePanel").total, 0);
});

test("reading a page needs the install, and a wrong id names the closest ones", async () => {
	const index = await loadHelpIndex();
	await assert.rejects(() => readHelpPage(index, "Reference/FTOptix-UI/ObjectTypes/PanelLoader", {}), /needs the installed Studio help/u);
	await assert.rejects(() => readHelpPage(index, "Reference/FTOptix-UI/ObjectTypes/PanelLoader"), /needs the installed Studio help/u);
	await assert.rejects(() => readHelpPage(index, "Reference/Wrong/PanelLoader", { install: { root: tmpdir(), version: "1.8.1.27" } }), /no help page with id .*closest ids/u);
});

test("a page is read from Help/en under the given install", async () => {
	const root = await mkdtemp(join(tmpdir(), "dsh-optix-read-"));
	try {
		await mkdir(join(root, HELP_DIR, "Reference", "FTOptix-UI"), { recursive: true });
		await writeFile(join(root, HELP_DIR, "Reference", "FTOptix-UI", "PanelLoader.html"), PAGE);
		const index = {
			schemaVersion: 1,
			studioVersion: "1.8.1.27",
			pageCount: 1,
			pages: [{ id: "Reference/FTOptix-UI/PanelLoader", title: "PanelLoader", section: "Reference", path: "Reference/FTOptix-UI/PanelLoader.html", headings: ["PanelLoader", "Panel"], snippet: "..." }]
		};
		const page = await readHelpPage(index, "Reference/FTOptix-UI/PanelLoader", { install: { root, version: "1.8.1.27" } });
		assert.equal(page.title, "PanelLoader");
		assert.match(page.text, /ChangePanel/u);
		assert.equal(page.studio_version, "1.8.1.27");
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("status compares the index with the installed Studio and says where pages are read from", async () => {
	const root = await mkdtemp(join(tmpdir(), "dsh-optix-status-"));
	try {
		await mkdir(join(root, HELP_DIR), { recursive: true });
		const index = { schemaVersion: 1, studioVersion: "1.8.1.27", pageCount: 2591, pages: [] };
		const fresh = await helpStatus(index, { installs: [{ root, version: "1.8.1.27-Stable" }] });
		assert.equal(fresh.stale, false);
		assert.equal(fresh.help_folder_present, true);
		assert.equal(fresh.install.version, "1.8.1.27");
		const stale = await helpStatus(index, { installs: [{ root, version: "1.9.0.1-Stable" }] });
		assert.equal(stale.stale, true);
		const missing = await helpStatus(index, { installs: [{ root: join(root, "nope"), version: "1.8.1.27-Stable" }] });
		assert.equal(missing.help_folder_present, false);
		const none = await helpStatus(index, {});
		assert.equal(none.install, null);
		assert.equal(none.help_folder_present, false);
	} finally {
		await rm(root, { recursive: true, force: true });
	}
});

test("an install version drops the -Stable channel suffix", () => {
	assert.equal(installedVersion({ version: "1.8.1.27-Stable" }), "1.8.1.27");
	assert.equal(installedVersion({ version: "1.8.1.27" }), "1.8.1.27");
	assert.equal(installedVersion(undefined), "");
});
