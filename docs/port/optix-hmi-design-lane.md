# Optix library access and a product-neutral HMI design lane

Approved plan, written 2026-11-13 and kept as design history. Status when it was written: A1-A3
implemented on branch `wip/optix-hmi-design`; phases B-E not started. That branch was deleted after the
work landed on `main` (shipped in `0.101.0`); this file keeps the reasoning and the full task breakdown,
and `HANDOFF.md` at the repository root keeps the record of the live runs.

---

# GUI design quality: Optix library access, Optix draft screens, and a product‑neutral HMI design layer

## What I verified first (the gap is real, and it is narrower than it looks)

| Claim | Evidence |
|---|---|
| FTView ME already has the draft‑screen machinery you are asking Optix for | `packages/ftview/src/edit/scaffold.ts` (`scaffoldLayout`, PAD 24 / HEADER 88 / FOOTER 56, slots header/title/subtitle/body/footer), `packages/ftview/src/edit/screen.ts` (`screenLayout`, MAX_CARDS 4, MAX_NAV 4, cards → `numericDisplay` / `multistateIndicator`, nav → `gotoButton`), tools `ftview_draft_display_scaffold` (`packages/ftview/src/edit/tools.ts:626`), `ftview_draft_screen` (`:695`), `ftview_draft_restyle`, `ftview_draft_popup`, `ftview_bulk_set`, `ftview_component_package` |
| FTView already enforces design rules | `packages/ftview/src/design.ts` — VIEW‑HPM‑02 (44 px touch minimum), VIEW‑HPM‑01 (captionless button), VIEW‑COLOR‑01 (4.5:1 contrast), VIEW‑NAV‑01/02 (unreachable display, no exit control), VIEW‑LAYOUT‑02 (canvas size), surfaced by `ftview_design_check` (`packages/ftview/src/tools.ts:483`) and `ftview_theme_audit` (`:503`) |
| Optix has none of it — its 12 tools are bridge plumbing | `packages/optix/lib/index.js`: `optix_status:1399`, `optix_read:1437`, `optix_edit:1593`, `optix_action:1691`, `optix_preview:833`, `optix_screenshot:739`, `optix_ocr:688`, `optix_template:993`, `optix_emulator:1098`, `optix_bridge_arm:1052`, `optix_ocr_setup:1299`, `optix_validate_expression:1669` |
| Optix authoring is a **closed 16‑op allowlist** | `packages/optix/lib/index.js:183-349` (`operations` → bridge routes), schema built at `:350`; `create_widget` → `ui/widget` |
| The shipped template library is unreachable | `TemplateLibrary.ImportLibraryItem(...)` is documented at `packages/optix/netlogic/pages/template-library.md` (example `ImportLibraryItem(Project.Current.Get("UI"), NodeClass.ObjectType, "Widgets", "LoginForm")`), but `ImportLibraryItem|TemplateLibrary` appears nowhere in `packages/optix/bridge/StudioMCPBridge.cs`, `packages/optix/lib/*.js` or `packages/optix/SKILL.md` (only two incidental comments, bridge `:32`, `:4784`). The bridge's generic escape hatch `node/invoke` (`InvokeMethodInline`, bridge `:4823-4872`) dispatches `IUAObject.ExecuteMethod` on a **node path** — it cannot reach a static class method, so it cannot reach `ImportLibraryItem` |
| The bridge can already enumerate **native** types, which is why the agent stops at native widgets | bridge `:1114` "Enumerate the builtin UI type catalog by reflecting `FTOptix.UI.ObjectTypes`", `:1168` `GET /bridge/schema/dump`, `:6275` "`FTOptix.<Module>.ObjectTypes` catalog (Alarm, DataLogger, Core, Recipe…)". That catalog is module types — **not** library items (Widgets / Screens / Components) |
| The starter projects carry a **stale, non‑session‑safe** bridge | template copy `packages/optix/templates/arya-optix-panel/project/ProjectFiles/NetSolution/StudioMCPBridge.cs` is 238,383 B vs the tracked `packages/optix/bridge/StudioMCPBridge.cs` 370,150 B, and contains **no** `ImpersonateRootTemporary`; `optix_action` invoke refuses unless `health.invoke_session === "root"` (`lib/index.js:1793`) |
| The bridge is vendored third‑party code | `packages/optix/bridge/source.json`: `asqi-carter/ftx-mcp`, commit `c36163ea…`, `"localChanges": []` — any verb we add is a local change that must be recorded |
| Budget gates | `components.json`: `contextBudget.defaultOnTools = 150` (exact — "one more default‑on tool fails the suite until the count is raised here with its measurement, or the component ships off"), `defaultOnSchemaCharacters 127423`; optix is `inReference:false, vendored:true`; `skillPolicy.defaultBudget 8000` and `packages/optix/SKILL.md` is already 7,992 B |
| Cross‑product design rules are already legal in the corpus | `packages/resources/corpus/view/view-faceplates.md` has `applies_to: [ftview, optix]`; `packages/resources/index.json` page schema is `{id,title,domain,level,basis,tags,applies_to,rules,words,bytes,sha256}`. There is **no** product‑neutral HMI domain (domains are craft/iec/migration/optix/rockwell/view/yaskawa) |

## Goal and success criteria

**Goal:** the agent composes a quality HMI screen on both HMI products — on Optix by choosing from what Optix actually ships (library items and types) instead of hand‑stacking native widgets, and on both products by running a layout engine plus a design‑rule gate before it calls a screen finished.

**Success criteria (each checkable):**
1. From a live Optix project the agent can list the shipped library items and import one into a screen with one tool call, and `optix_read` reads the imported node back (the component gate is `optix_read`: "an authoring call is only accepted once the live model reads back the change").
2. `optix_screen` produces a full screen (header/body/footer + cards + nav) as a validated `optix_edit` batch in one call, replacing a chain of `create_widget`/`set_property` calls.
3. `optix_design_check` returns findings for the same rule families `ftview_design_check` already reports, plus OPTIX‑UI‑01/02.
4. A product‑neutral `hmi` corpus domain + `docs/reference/hmi-design.md` exist and are cited by both product skills, so "design me a screen" works without naming a product.
5. `pnpm test`, `pnpm docs:check`, `pnpm -r build` green; a copied template project carries the session‑safe bridge.

---

## Phase A — Optix shipped‑library access (the named gap)

**A1. Verify the enumeration API before writing code.** Confirm against the installed SDK (`UAManagedCore.dll` / the FTOptix modules) which library‑listing methods exist (`TemplateLibrary` listing / library browse). If no listing API exists, fall back to the house pattern already used for NetLogic: a pinned snapshot under `packages/optix/library/` (like `netlogic/{index.json,pages/}`) read by a tool, and say so in `coverage`.

**A2. Two new bridge verbs** in `packages/optix/bridge/StudioMCPBridge.cs`, next to the existing POST branches (`model/*`, `ui/widget`, `node/invoke`):
- `GET /bridge/library/items?class=<NodeClass>&library=<name>` → the item catalog the agent can choose from.
- `POST /bridge/library/import?dest=<node>&class=<NodeClass>&library=<name>&item=<path>[&replace=true]` → wraps `TemplateLibrary.ImportLibraryItem`, **inside `Context.Sessions.ImpersonateRootTemporary()`** (the root‑caused lesson at bridge `:4806-4821`: executing managed code on the HTTP thread without a session kills `FTOptixStudio.exe` with `c0000374`). Returns the created node path, its type, and any conflict‑resolution choices applied.
- Guards in house style: `library_not_found` / `item_not_found` with a `did_you_mean` from the item list (mirror `unknown_property` + `SuggestPropertyName`, bridge `:4092-4094`); `read_only_collection` (`:3938`) when the destination is runtime‑managed; refuse `Item`/`Container`‑style abstract bases as with `not_renderable` (`:3896`).

**A3. One new plugin tool, not two:** `optix_library` with `action: "list" | "import"` registered in `packages/optix/lib/index.js` beside `optix_action` (`:1691`), same `exclusive()` + `BridgeError(..., mayHaveApplied)` + `retry: "Inspect the live model before retrying"` shape (`:1810-1816`). `import` requires `allowWrites`; keep it out of `optix_edit`'s batch validator and document why (a library import is not a batch‑reversible op). One tool keeps the default‑on count at 151, not 152.

**A4. Record the vendored‑bridge change:** add an entry to `packages/optix/bridge/source.json` `localChanges` and update the recorded `sha256` (`6310701237…` today). Keep the added code as one commented block so the upstream diff stays reviewable, matching the file's existing comment style.

**A5. Fix the template staleness** (otherwise a project copied from `optix_template` has neither new verb and cannot `invoke`): `optix_template` copies `packages/optix/bridge/StudioMCPBridge.cs` (370,150 B, session‑safe) over the template's 238,383 B copy, or the manifest `questions`/`next` names the replacement step explicitly. `test/optix-template.spec.mjs` asserts the copied bridge is byte‑identical to `bridge/StudioMCPBridge.cs`.

## Phase B — Optix draft screens and a design gate

**B1. Port the layout engine, do not reinvent it.** New `packages/optix/lib/screens.js` mirroring `packages/ftview/src/edit/scaffold.ts` + `screen.ts`: same slot math (PAD 24, HEADER 88, FOOTER 56, GAP 20, ROW 36, NAV 56), same refusals (`too small for a scaffold`, `no room for content`, `>4 cards`, `>4 nav`, card overflow), same theme values (`#0E1A24 / #0088C8 / #13232F / #143243`, title `#FFFFFF`, footer text `#CFE0EA`) so both products' authored screens look like one product. Output = an `optix_edit` op batch (`create_object` / `create_widget` / `set_property` / `bind`), not a direct write.

**B2. `optix_screen` tool.** Draft semantics are honest here: Optix has no offline draft store — the bridge writes the live project. So "draft" = the returned batch + a `dry_run` validation pass through `optix_edit`'s existing `validate_ops` strict path (`lib/index.js:1622-1635`), and apply = the same batch with `dry_run: false` under `allowWrites`. Reuse the existing partial/indeterminate reporting and the "do not replay the entire batch automatically" retry line (`:1648-1656`).

**B3. `optix_design_check`.** Port `packages/ftview/src/design.ts` (including the exported `contrastRatio`) to the Optix node model read via `optix_read`: touch target ≥ 44 px, text contrast ≥ 4.5:1, screen nothing navigates to, screen with no exit control, size mismatch against the project's window size (templates ship 1280×800 in `Nodes/UI/UI.yaml`). Add OPTIX‑UI‑01 (a type per device instance instead of one type + instances) and OPTIX‑UI‑02 (a screen that computes) as findings sourced from `packages/resources/corpus/optix/optix-ui-structure.md`.

**B4. Deferred, listed not built:** `optix_restyle` / bulk palette application, and keyboard/dialog composition (`_UiCommands` OpenDialog/OpenKeyboard at bridge `:4904`). These are follow‑ups, recorded under Known gaps.

## Phase C — GUI design in general (product‑neutral)

**C1. New corpus domain `hmi`** in `packages/resources/corpus/hmi/` (4 pages, ~1 KB each, matching house page shape): `hmi-screen-hierarchy` (header/body/footer zones, one decision per screen), `hmi-targets-and-density` (minimum hit size, spacing), `hmi-colour-and-contrast` (generalized from `view-colour-and-contrast`, `applies_to: [ftview, optix]`), `hmi-navigation-and-exits`. Re‑tag rather than duplicate where a page already carries both products (`view-faceplates.md` already has `applies_to: [ftview, optix]`). Update `packages/resources/index.json` with `words`/`bytes`/`sha256` per page and the counts `test/resources.spec.mjs` asserts.

**C2. `docs/reference/hmi-design.md`** — the shared screen grammar and which tool enforces which rule per product; `docs/reference/standards-checks.md` gains the Optix rows (its "HMI design standards" table is at `docs/reference/standards-checks.md:34-44` today and lists only `ftview_*` enforcers).

**C3. Skill wiring inside the budgets.** `packages/optix/SKILL.md` is at 7,992 B against `skillPolicy.defaultBudget 8000`, so the new lane is 5 lines that **link** to `docs/reference/hmi-design.md` and the new pages: `optix_status` → `optix_library list` → `optix_screen` (dry run) → `optix_design_check` → `optix_preview`/`optix_screenshot`. Same lane added to the `factorytalk-view` skill referencing `ftview_draft_display_scaffold` / `ftview_draft_screen` / `ftview_design_check`. `engineering-standards` points at the `hmi` domain.

**C4. Preset wiring:** `presets/arya-automation` carries the design lane as an instruction so "design me a screen" routes correctly without naming a product; `test/arya-automation.spec.mjs` covers it.

## Phase D — the visual proof loop (and one open decision)

**D1. Document the loop, don't invent it.** Today Optix proof is browser‑side: `optix_preview` → `optix_screenshot` → inspect the image → `optix_design_check`. Write that sequence into the skill and the docs, and keep the honest `coverage` line (rendering and runtime behaviour cannot be established from the model).

**D2. Optional, and a separate decision:** an Optix screen face in the app (the way `packages/ftview-viewer` renders a View display to SVG from `packages/ftview/src/render-svg.ts`). `components.json` currently lists only `packages/viewer` + `packages/ftview-viewer` under the `viewers` surface — there is no Optix face. If built, it inherits the AGENTS.md client‑UI contract: host `--dsw-*` tokens, both themes, host document chrome, no component library, `locale/en.json` + `locale/zh.json` together, and `test/viewer-face-css.spec.mjs` / `test/client-face.spec.mjs` coverage. **Recommendation: defer D2 until A–C land**, because it is a new face plus a package, not a tool.

## Phase E — manifest, docs, tests, budget (the part the suite will fail you on)

- `components.json`: optix `tools.count` 12 → 14 (`optix_library`, `optix_screen`) + `optix_design_check` decision; add both names to the `factorytalk-optix` skill allow‑list; raise `contextBudget.defaultOnTools` 150 → 152 **with the measurement recorded in the manifest comment**, or ship `optix_design_check` off‑by‑default like ECAD.
- `README.md`: tool counts per product, the Optix known‑limits lines ("the 12 vendored Optix tools are not generated from source here") updated to the new count, docs map row for `docs/reference/hmi-design.md`.
- `CHANGELOG.md`: new `## [Unreleased]` section (top of file is `## [0.93.0]`; version in `package.json` is `0.93.0`) — one batch, no bump/tag/publish until you say ship.
- Locales move together for any new face/tool‑card copy.
- New tests: `test/optix-library.spec.mjs` (route mapping, guard codes, session wrapper present), `test/optix-screen.spec.mjs` (slot math + every refusal), `test/optix-design.spec.mjs` (each rule fires on a fixture model), extend `test/optix-template.spec.mjs` (bridge copy), extend `test/resources.spec.mjs` (hmi domain) and `test/components.spec.mjs` (counts, budget, namespaces).
- Run `pnpm test`, `pnpm docs:tools` then `pnpm docs:check`, `pnpm -r build`. Optix is `inReference:false`, so confirm how the vendored tools appear in `docs/reference/tools.json` before assuming the generator covers them.
- Release evidence (AGENTS.md): the packaged smoke must exercise **one changed tool end to end** — `optix_library import` against a live Studio project on **Dev AryaCode** (`%LOCALAPPDATA%\AryaCode-dev\home`), never the installed instance; the release body records the command and result.

## Sequencing

1. **A1–A5** (library verbs + tool + template bridge fix) — this is the gap you named, and it unblocks everything else because quality composition starts from what Optix ships.
2. **B1–B3** (screen engine + design check) — parity with FTView's draft screens.
3. **C1–C4** (hmi corpus domain + design doc + skill/preset wiring) — makes it GUI design in general rather than an Optix patch.
4. **D2** only after 1–3, as its own decision.
One batch, one version, staged under `## [Unreleased]`.

## Decisions I need from you (with my recommendation)

1. **Vendored bridge fork vs upstream.** Recommendation: fork locally now (record `localChanges`), and open the upstream PR to `asqi-carter/ftx-mcp` in the same batch so a later release can drop the local diff. The alternative — waiting on upstream — blocks A entirely.
2. **Tool budget.** Recommendation: raise `defaultOnTools` 150 → 152 with the measurement, and ship `optix_design_check` on; if you want the budget untouched, `optix_design_check` ships off by default and the count stays 151.
3. **Scope of this batch.** Recommendation: A + B + C now, D2 (Optix SVG face) deferred.

## Assumptions and known gaps

- The library‑listing API's exact shape is unverified until A1 runs against the installed SDK; the pinned‑snapshot fallback is the documented Plan B.
- Nothing here was run against a live Studio project: every Optix claim above is from the tracked bridge/plugin source, not from a bridge session. `coverage` language stays in every new tool result.
- `pnpm test` was not run in this planning pass; the gates listed in Phase E are read from `AGENTS.md` and `test/*.spec.mjs` names, not from a test run.
- Harness‑side changes are out of scope by AGENTS.md: if a screen face needs shell support, it belongs in `KonnectSuite/AryaCode` as a harness patch, not here.