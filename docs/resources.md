# Engineering resources

A model-agnostic reference layer: a local corpus of engineering rules and a profile of the project in front
of you. Neither needs a network, an embedding model or a particular LLM — the corpus is Markdown indexed by
one generated JSON file, and the profile is counted from the export the product packages already parse.

## The corpus

41 pages under `packages/resources/corpus/`, in seven domains:

| Domain | Pages | What it covers |
|---|---|---|
| `iec` | 6 | Structured Text structure, state machines, tasks, types and scaling, language equivalence, sequences |
| `rockwell` | 6 | Program structure, AOIs and UDTs, tag naming, fault and alarm words, HMI handshake, safety boundaries |
| `migration` | 7 | SLC 500 and PLC-5 to Logix: arrival points, PCE markers and their codes, the wizard and its revision ceiling, placeholder tags, unknown operands, indirect addressing, the instruction map |
| `yaskawa` | 5 | POU organisation, motion FBs, cams and gears, errors, task rates |
| `view` | 7 | High-performance HMI, colour and contrast, alarms, navigation, popups, faceplates, hierarchy |
| `optix` | 4 | Screen structure, bindings, NetLogic use, alarms and trends |
| `craft` | 6 | Naming, comments, fault handling, filtering, units, handover review |

Each page carries front matter (`id`, `title`, `domain`, `level`, `basis`, `tags`, `applies_to`, `rules`) and
rule IDs such as `CRAFT-NAME-01` or `VIEW-HPM-02`. Rules are unique across the corpus; a review finding can
therefore name exactly one page.

Pages are authored summaries. They name their basis (IEC 61131-3, ISA-101, ISA-18.2, vendor documentation,
field practice) but do not reproduce any standard's text; see
[LICENSE-CONTENT.md](../packages/resources/LICENSE-CONTENT.md).

## The index

`scripts/gen-resources.mjs` validates every page (fields, domains, levels, id/file agreement, rule format,
uniqueness, 900-word and 12 KB budgets) and writes `packages/resources/index.json` and `SOURCE.json`.

```sh
pnpm resources:build   # regenerate
pnpm resources:check   # fail when the committed index is stale
```

`test/resources.spec.mjs` runs the check and asserts search quality, so a page edited without a rebuild fails
CI rather than shipping an index that disagrees with the corpus.

## Reading it

```
engineering_reference                      → contents
engineering_reference { query: "state machine" }
engineering_reference { id: "view-hpm-01" } → page body, rules, basis, corpus digest
```

Search is deterministic: exact id, rule and title matches first, then tags, then id/title substrings, then a
body scan for pages containing every query token. No model call is involved, so the same query returns the
same ranking on any model.

## The house-style profile

```
engineering_profile { project_id: "…" }   → L5X profile
engineering_profile { view_id: "…" }      → FactoryTalk View profile
```

Extraction lives where the parser lives — `packages/l5x/src/engine/style.ts` and
`packages/ftview/src/style.ts` — and both return the schema in `packages/resources/src/profile.ts`:

- **L5X**: tag prefixes and case, routine names, seal-in and latch forms, comment density, evidence counts,
  confidence (`low`/`medium`/`high`).
- **FactoryTalk View**: palette, fonts, button geometry, navigation and popup counts, display naming.

Every profile names its source path, the number of samples and a confidence level. A profile from a
five-rung project says `low`; it is a hint, not a rule. The result carries a `profile_id` that generation
tools accept:

```
ftview_draft_display_create { …, profile_id }
```

applies the profile's background colour; `ftview_draft_object_add` applies its button geometry and font.

## Order of work

1. `engineering_profile` when a project is open, or `engineering_reference` for new work.
2. Author with the profile's names and palette.
3. The product's own validation (`ftview_validate`, `draft_validate`, `mw_compile`).
4. Report findings with the rule ID and the page id.

## Known limits

- MWI and Optix profiles are not implemented in 0.9.0; the reference corpus still applies to them.
- `engineering_review` (rule-based draft review) is planned for 0.9.1. Until then the profile informs the
  author and the product's validation still judges the result.
- A low-confidence profile must not be treated as an instruction; the tool says so in every answer.
