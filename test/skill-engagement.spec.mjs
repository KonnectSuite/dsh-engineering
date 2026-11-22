import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * Measured 2026-11-14 on a real session: asked for "a new Optix template", an agent spent 52 calls and
 * 23.1 minutes surveying the host (45 pwsh listings, 4 globs, 3 greps) and never called
 * `engineering_reference` at all — while `optix_template` sat one call away. The policy this file
 * guards is the fix: a new build starts from the brief, our packaged starters and the published
 * standards; the machine is read when the operator points at it, or when the work is inside an
 * existing project.
 */

const file = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

/** The gate sentence, whitespace-collapsed: the skills wrap it over three source lines. */
const GATE = "A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is installed, open or on disk; the host is read only when the operator points at it, or when the work is inside an existing project (`CRAFT-ORD-01`).";

const flat = (text) => text.replace(/\s+/gu, " ");

const components = JSON.parse(file("components.json")).components;
const skills = components.filter(component => typeof component.skill?.file === "string");

test("every product skill states the same gate to the same rule", () => {
  assert.ok(skills.length >= 7, `expected at least 7 skills, found ${skills.length}`);
  for (const component of skills) {
    if (component.id === "engineering-resources") continue;
    assert.ok(
      flat(file(component.skill.file)).includes(GATE),
      `${component.id}: ${component.skill.file} does not carry the engagement gate verbatim`,
    );
  }
});

test("the gate comes before the skill's first instruction to look at the host", () => {
  for (const component of skills) {
    if (component.id === "engineering-resources") continue;
    const raw = file(component.skill.file);
    const body = flat(raw);
    const gateAt = body.indexOf(GATE);
    const titleAt = raw.search(/^# /mu);
    assert.ok(gateAt > 0, `${component.id}: no gate sentence`);
    assert.ok(titleAt > 0, `${component.id}: no H1 to place the gate under`);
    assert.ok(gateAt - titleAt < 400, `${component.id}: the gate sits ${gateAt - titleAt} characters after the title, too far down to be read first`);
  }
});

test("the resources skill makes the first move a decision, not an inventory", () => {
  const body = flat(file("packages/resources/SKILL.md"));
  const firstMove = body.indexOf("## First move");
  const readFirst = body.indexOf("## Read first");
  assert.ok(firstMove > 0, "resources skill has no `## First move` section");
  assert.ok(firstMove < readFirst, "`## First move` must precede `## Read first`");
  assert.match(body, /Do not inventory the machine, the workspace or the operator's profile/u);
  assert.ok(body.slice(firstMove, readFirst).includes("`craft-engagement-order`"), "the first move does not name the order page");
});

test("the Optix skill triages the request before any project is read", () => {
  const body = flat(file("packages/optix/SKILL.md"));
  assert.ok(!body.includes("## Read before you write"), "the old read-first section is still there");
  const triage = body.indexOf("## What kind of request is this?");
  const author = body.indexOf("## Author and verify");
  assert.ok(triage > 0 && triage < author, "the triage table must come before authoring");
  for (const phrase of ["A new build, template or standard", "not read", "optix_template {}", "workflow E"]) {
    assert.ok(body.includes(phrase), `the Optix triage table does not say ${phrase}`);
  }
  for (const page of ["hmi-isa101-baseline", "hmi-screen-architecture", "hmi-standards-precedence", "optix-application-recipe"]) {
    assert.ok(body.includes(page), `the Optix skill does not name ${page} as a standard to read`);
  }
  assert.ok(body.includes("### E. Author a house template or standard") || body.includes("### E."), "workflow E is missing");
});

test("the order page is in the corpus and applies to every product row", () => {
  const index = JSON.parse(file("packages/resources/index.json"));
  const page = index.pages.find(entry => entry.id === "craft-engagement-order");
  assert.ok(page, "craft-engagement-order is not in the corpus");
  assert.equal(page.domain, "craft");
  assert.deepEqual(page.rules, ["CRAFT-ORD-01", "CRAFT-ORD-02", "CRAFT-ORD-03", "CRAFT-ORD-04"]);
  const rows = components.map(component => component.id).filter(id => ["l5x", "ftview", "optix", "plc5", "mwi", "migration"].includes(id));
  assert.deepEqual(rows.filter(row => !page.applies_to.includes(row)), [], `the page does not apply to ${rows.filter(row => !page.applies_to.includes(row)).join(", ")}`);
  const markdown = file("packages/resources/corpus/craft/craft-engagement-order.md");
  for (const rule of page.rules) assert.ok(markdown.includes(rule), `${rule} is not written in the page`);
});

test("the tools that survey the host say what they are for and what they are not", () => {
  const optix = file("packages/optix/lib/index.js");
  const status = optix.slice(optix.indexOf('name: "optix_status"'), optix.indexOf('name: "optix_status"') + 1400);
  assert.match(flat(status), /not to find out what to build/u);
  assert.match(flat(status), /CRAFT-ORD-01/u);
  const template = optix.slice(optix.indexOf('name: "optix_template"'), optix.indexOf('name: "optix_template"') + 2400);
  assert.match(flat(template), /chosen between, not surveyed/u);
  assert.match(flat(template), /writes nothing/u);
  assert.ok(!/template: \{\s*type: "string",\s*enum: ids,\s*required: true/u.test(template), "`template` is still required, so the no-argument question call is impossible");
  const library = optix.slice(optix.indexOf('name: "optix_library"'), optix.indexOf('name: "optix_library"') + 2400);
  assert.match(flat(library), /not to survey/u);
  assert.match(flat(file("packages/ftview/lib/vendor-tools.js")), /not from what happens to be installed/u);
  assert.match(flat(file("packages/mwi/lib/tools/session.js")), /not from what happens to be on disk/u);
});

test("optix_template answers with both starters and their questions when no starter is named", () => {
  const plugin = readFileSync(new URL("../packages/optix/lib/index.js", import.meta.url), "utf8");
  assert.match(plugin, /if \(args\.template === void 0\) \{/u);
  assert.match(plugin, /return \{\s*starters,\s*instructions:/u);
  assert.match(plugin, /Name the starter whose file you want: \$\{ids\.join\(", "\)\}/u);
  assert.match(plugin, /Choose the starter to copy: \$\{ids\.join\(", "\)\}/u);
  assert.match(plugin, /for \(const id of ids\) \{/u);
});
