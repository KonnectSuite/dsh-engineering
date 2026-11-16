/**
 * Read the plugin's own topic playbooks.
 *
 * The single `SKILL.md` is the entry point; these pages are the deep end - one per capability, each written
 * from a live measurement rather than from help text. Exposing them as two tools keeps a session's context
 * small (list first, read one page) instead of loading every trap up front.
 */
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** The folder that holds the topic pages, beside this module's parent. */
const SKILLS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");

/**
 * Every topic page with its own title and a one-line summary.
 *
 * The summary is the first prose line after the `# ` heading, which keeps a page self-describing instead of
 * needing an index file that drifts.
 * @returns Rows sorted by name, each `{ name, title, summary, bytes }`.
 */
export async function listSkills() {
	let entries;
	try {
		entries = await readdir(SKILLS_DIR);
	} catch {
		return [];
	}
	const rows = [];
	for (const entry of entries) {
		if (!entry.endsWith(".md")) continue;
		const body = await readFile(join(SKILLS_DIR, entry), "utf8");
		const lines = body.split(/\r?\n/u);
		const titleLine = lines.find(line => line.startsWith("# "));
		const summaryLine = lines
			.slice(lines.indexOf(titleLine ?? "") + 1)
			.find(line => line.trim() !== "" && !line.startsWith("#"));
		rows.push({
			name: basename(entry, ".md"),
			title: titleLine ? titleLine.slice(2).trim() : basename(entry, ".md"),
			summary: summaryLine ? summaryLine.trim() : "",
			bytes: Buffer.byteLength(body, "utf8")
		});
	}
	return rows.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * One topic page in full.
 * @param name - Topic name as `optix_list_skills` reports it.
 * @returns `{ name, title, bytes, markdown }`.
 * @throws When the name is not a topic, naming the closest alternatives.
 */
export async function readSkill(name) {
	const wanted = typeof name === "string" ? name.trim().replace(/\.md$/iu, "") : "";
	if (wanted === "") throw new Error("Which topic? Call optix_list_skills first, then optix_get_skill name=<topic>.");
	const rows = await listSkills();
	const row = rows.find(candidate => candidate.name.toLowerCase() === wanted.toLowerCase());
	if (!row) {
		const near = rows
			.filter(candidate => candidate.name.includes(wanted.toLowerCase()) || wanted.toLowerCase().includes(candidate.name.split("-")[0]))
			.map(candidate => candidate.name);
		throw new Error(`No Optix topic named "${wanted}". Topics: ${rows.map(candidate => candidate.name).join(", ")}${near.length > 0 ? ` (closest: ${near.join(", ")})` : ""}`);
	}
	const body = await readFile(join(SKILLS_DIR, `${row.name}.md`), "utf8");
	return { name: row.name, title: row.title, bytes: Buffer.byteLength(body, "utf8"), markdown: body };
}
