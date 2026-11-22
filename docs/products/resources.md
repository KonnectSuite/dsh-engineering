# Engineering resources

`@aryacode/dsh-engineering` ships a local engineering corpus and two tools that read it. It is a support
component, not a product: no vendor software, no controller, no files it edits. A session asks it what the
standards say, and the answer comes from this repository — no network, no embedding model, no second LLM.

The component is a beta product: 2 tools, 70 pages, 233 rule IDs, and the corpus grows between releases.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `engineering-resources` — *Engineering resources* |
| Capability class | `offline-file` (it reads pages in this package) |
| Stability | beta, since `v0.9.1` |
| Tools | 2: `engineering_reference`, `engineering_profile` |
| Package / entry | `packages/resources` → `entries/resources.js` |
| Skill | `engineering-standards` (`packages/resources/SKILL.md`, 4,700-character budget) |
| Switch | `reference` on the `engineering-resources` row |
| Sources | `packages/resources/corpus/` and `packages/resources/index.json` |

The two tools answer two different questions. `engineering_reference` answers "what do good programs do" —
it returns corpus pages, ranked, with their rule IDs and basis. `engineering_profile` answers "what does
*this* project do" — it reads the open export and counts the conventions it can see, with the evidence
behind each count.

## What you need

| Requirement | Needed for | Optional |
| --- | --- | --- |
| Nothing | `engineering_reference` — the corpus ships with the bundle and is indexed at build time | no |
| An open Studio 5000 `.L5X` project or a FactoryTalk View ME export | `engineering_profile`, which reads one of the two | yes — the reference tool works without a project |
| No network | both tools: nothing is fetched at run time | — |

There is no vendor software to install and no version to match. The corpus is Markdown in the package; the
index is generated when the package is built, so the pages a session reads are the pages that shipped.

The recorded verification is the bundled corpus read back through `engineering_reference`, and a profile
inferred from an open export. The corpus is this repository's own judgement, not a vendor specification,
and the profile's confidence has been seen on a few projects.

## First session

Ask what is in the corpus before asking a question of it, so the domain names are known.

```json
{ "query": "state machine" }
```

`engineering_reference` with no arguments returns the contents: domains, pages, titles and rule IDs. With a
`query` it returns the matching pages ranked; with an `id` it returns one page in full. Then:

| Step | Call | What you see |
| --- | --- | --- |
| 1. What is there | `engineering_reference {}` | eight domains, 70 pages, 233 rule IDs |
| 2. Find a rule | `engineering_reference {query}` | ranked pages; exact id, rule ID or title first, then tags, then substring matches, then a body scan for every query token |
| 3. Read one | `engineering_reference {id: "view-hpm-01"}` | the page body, its rules, its basis and the corpus digest |
| 4. Read this project | `engineering_profile {project_id}` or `{view_id}` | naming, idioms, HMI conventions, comment density, evidence counts, confidence, source and a `profile_id` |
| 5. Use it | the product's own tool | author with the profile's names and palette, then verify with `l5x_draft_validate`, `ftview_validate`, `mw_compile`, the Optix read-back or `l5x_run_checks` |

Ranking is deterministic and local: the same query returns the same order on every machine, because there
is no model call in the path.

## What it does

### The corpus

Every page is one Markdown file under `packages/resources/corpus/<domain>/`, with front matter and a body.
The 70 pages are grouped into eight domains:

| Domain | Pages | What it covers |
| --- | --- | --- |
| `iec` | 6 | IEC 61131-3 language and structure: LD/FBD equivalence, ST, SFC and sequences, state machines, the task model, types and scaling |
| `rockwell` | 6 | Studio 5000 idioms: tag naming, program structure, AOI and UDT use, fault and alarm words, the HMI handshake, safety boundaries |
| `migration` | 9 | SLC 500 / PLC-5 to Logix: the wizard and its revisions, the instruction map, indirect addressing, analog scaling, arrival points, conversion markers, placeholder tags, unknown operands |
| `yaskawa` | 5 | MotionWorks / MPiec: POU organisation, task rates, motion function blocks, cam and gear, error handling |
| `view` | 10 | FactoryTalk View ME: screen hierarchy, layout, colour and contrast, navigation, faceplates, popups, alarm presentation and the alarm XML, graphics import/export, HPM rules |
| `optix` | 21 | FactoryTalk Optix: the object and variable model, UI structure, screens and containers, bindings and expressions, widgets and data presentation, panels and dialogs, navigation, style sheets, alarms and trends, recipes and retentivity, translations, users and security, artwork and SVG, NetLogic, performance, design resources |
| `hmi` | 6 | Cross-product HMI line: the ISA-101 baseline, screen architecture, touch targets and labels, colour and contrast, the Rockwell process style guide, standards precedence |
| `craft` | 7 | Engagement order, naming, comments and intent, debounce and filtering, fault handling, units and ranges, the review checklist |

Front matter is what the index reads:

```yaml
---
id: craft-naming
title: Naming that survives the project
domain: craft
level: intro
basis: [field practice]
tags: [naming, readability]
applies_to: [l5x, ftview, mwi, optix]
rules: [CRAFT-NAME-01, CRAFT-NAME-02, CRAFT-NAME-03]
---
```

- `id` is unique and must match the file name.
- `level` is `intro`, `practitioner` or `specialist`; the corpus today is 5 / 50 / 15.
- `basis` names where the rule comes from (a standard, a vendor manual, field practice) and is shown with
  any answer, so a reader can weigh it.
- `rules` are the citable IDs, in the form `<AREA>-<TOPIC>-<NN>`. They are unique across the whole corpus,
  which is what makes `VIEW-HPM-02` or `CRAFT-NAME-01` a usable reference in a finding.

The pages are authored summaries that name their basis — IEC 61131-3, ISA-101, ISA-18.2, vendor
documentation, field practice. No standard text is reproduced; the licence for the content is
`packages/resources/LICENSE-CONTENT.md`.

The index is generated, not written by hand:

```sh
pnpm resources:build   # validate the corpus and write index.json + SOURCE.json
pnpm resources:check   # fail when the index is stale
```

`scripts/gen-resources.mjs` validates the front matter fields, the domain set, the levels, `id` against the
file name, the rule-ID format, rule uniqueness, and two size budgets per page — 900 words and 12 KB.
`test/resources.spec.mjs` asserts search quality on top of that, so a page that indexes but cannot be found
fails the suite.

### Reading it

| Call | Returns |
| --- | --- |
| `engineering_reference {}` | the contents: domains, pages, titles, rule IDs |
| `engineering_reference {query}` | the pages that match, ranked — exact id, rule ID or title first, then tags, then substring matches, then a body scan of every query token |
| `engineering_reference {id}` | one page in full |
| `engineering_reference {domain}` | the same ranking restricted to one domain |

There is no separate review tool: a review is `engineering_reference` for the rules, then the product's own
checks, which is what [Standards checks](../reference/standards-checks.md) describes.

### The house-style profile

```jsonc
{ "project_id": "…" }   // Studio 5000 L5X export
{ "view_id": "…" }      // FactoryTalk View ME export
```

The profile carries:

- `naming` — tag prefixes and case, routine naming, when the product can infer them;
- `idioms` — seal-in and latch forms;
- `hmi` — palette, fonts, button geometry, navigation and popup counts, display naming;
- `comments` — comment density;
- `evidence` — the files and counts behind each claim, never empty;
- `confidence` — `low`, `medium` or `high`;
- `source` — kind, path and SHA-256 of what it read, and a stable `profile_id`.

The extraction lives in `packages/l5x/src/engine/style.ts` and `packages/ftview/src/style.ts`; the schema
and its validator are `packages/resources/src/profile.ts`. A profile is evidence, not an instruction: a
low-confidence field is a hint to look, and the report should say so.

The profile is also an input: `ftview_draft_display_create` takes a `profile_id` for the display's
background colour, and `ftview_draft_object_add` takes it for button geometry and font, so a new display
starts in the plant's own style instead of the tool's defaults.

## Limits

- Profile extraction exists for Studio 5000 L5X and FactoryTalk View ME only. MotionWorks IEC and
  FactoryTalk Optix have no house-style profile in this release; for those, use the corpus and the
  product's design checks.
- The corpus is this repository's writing, not a copy of any standard. Where a rule depends on a standard's
  clause number, the page names the standard and the basis; it does not quote it.
- `engineering_reference` returns pages, not answers. Composing the answer from the pages is the session's
  job, and the persona requires the rule IDs in the result.
- The corpus is local and fixed: it does not learn from a project, and nothing in it is fetched at run
  time. A rule that is not in the corpus is not available to the session.
- A profile's confidence is a count, not a proof: `low` means the sample was small, and a `low` field must
  not be treated as an instruction.
- The corpus is measured against the pages it ships, not against a vendor's published rule set. Where the
  two disagree, the page says which basis it used.

## Where to go next

- [Standards and checks](../reference/standards-checks.md) — how a rule ID becomes a finding, and which
  product checks report it.
- [HMI design](../reference/hmi-design.md) — the shared screen grammar, and the rule-to-tool map for both
  HMI products.
- [Tool reference](../reference/tools.md) — `engineering_reference` and `engineering_profile` with their
  parameters.
