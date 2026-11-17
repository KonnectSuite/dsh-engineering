/**
 * The topic playbooks the Optix plugin ships beside its entry page.
 *
 * `lib/skills.js` discovers pages by scanning `packages/optix/skills/`, which is what keeps a page self-
 * describing instead of needing an index that drifts. The drift this pins is the other direction: a page added
 * to the folder that `SKILL.md` never lists, or a row in `SKILL.md` naming a page that is not there, so a
 * session is told to read a trap it cannot reach. `optix_list_skills` reads the folder, `SKILL.md` is what a
 * human reads first, and both have to agree.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { listSkills, readSkill } from "../packages/optix/lib/skills.js";

const SKILLS_DIR = new URL("../packages/optix/skills/", import.meta.url);
const SKILL_PAGE = readFileSync(new URL("../packages/optix/SKILL.md", import.meta.url), "utf8");

/** The topic names the entry page's playbook table advertises. */
function tableTopics() {
	const rows = SKILL_PAGE.split(/\r?\n/u)
		.filter(line => /^\|\s*`[a-z0-9-]+`\s*\|/u.test(line))
		.map(line => /^\|\s*`([a-z0-9-]+)`\s*\|/u.exec(line)[1]);
	return [...new Set(rows)];
}

test("every page in the skills folder is listed, titled and summarised", async () => {
	const files = readdirSync(SKILLS_DIR)
		.filter(name => name.endsWith(".md"))
		.map(name => name.replace(/\.md$/u, ""))
		.sort();
	assert.ok(files.length >= 10, `expected the shipped playbooks, found ${files.length}`);
	const rows = await listSkills();
	assert.deepEqual(rows.map(row => row.name), files, "the folder scan must match the folder");
	for (const row of rows) {
		assert.notEqual(row.title, "", `${row.name} has no title`);
		assert.notEqual(row.summary, "", `${row.name} has no summary line for optix_list_skills`);
		assert.ok(row.bytes > 500, `${row.name} is ${row.bytes} bytes, which is not a playbook`);
	}
});

test("SKILL.md's playbook table and the folder agree in both directions", async () => {
	const rows = await listSkills();
	const advertised = tableTopics();
	for (const row of rows) {
		assert.ok(advertised.includes(row.name), `SKILL.md never lists the page "${row.name}"`);
	}
	for (const topic of advertised) {
		assert.ok(rows.some(row => row.name === topic), `SKILL.md advertises "${topic}", which is not a page`);
	}
	assert.equal(
		SKILL_PAGE.includes("the deep end lives in"),
		true,
		"the entry page must introduce the playbooks before the table"
	);
	const stated = /the deep end lives in (\w+) topic playbooks/u.exec(SKILL_PAGE);
	assert.ok(stated, "the entry page states how many playbooks it ships");
	const words = { nine: 9, ten: 10, eleven: 11, twelve: 12 };
	assert.equal(
		words[stated[1]] ?? stated[1],
		rows.length,
		`SKILL.md says "${stated[1]}" playbooks and the folder holds ${rows.length}`
	);
});

test("the refusals register is reachable and names the refusals it exists to save", async () => {
	const page = await readSkill("gaps-and-refusals");
	assert.equal(page.name, "gaps-and-refusals");
	for (const phrase of [
		"unsupported_array_write",
		"invalid unordered_map<K, T> key",
		"not_an_object",
		"type_not_found",
		"proxy_only_property",
		"Table.RecordLimit",
		"Unable to cast object of type 'System.String' to type 'UAManagedCore.NodeId'",
		"MSB3027",
		"optix_save"
	]) {
		assert.ok(page.markdown.includes(phrase), `the register never names ${phrase}`);
	}
});

test("an unknown topic is refused with the topics that do exist", async () => {
	await assert.rejects(() => readSkill("trends-and-things"), /No Optix topic named/u);
});
