# Handoff — Optix template-library access + a product-neutral HMI design lane

Written 2026-11-13 on the Windows workstation, from
`C:\Users\KNPhu\AryaCode\KonnectSuite\dsh-engineering`.
Branch: **`wip/optix-hmi-design`**, based on `main` @ `5d15103 docs: record the 0.93.0 release`.
The batch is unfinished work in progress, not a release: `package.json` is still `0.93.0`, there is no
`## [Unreleased]` section yet, nothing is bumped, tagged or published.

The approved plan (phases A–E, with the evidence table that justified them) is committed at
[`docs/port/optix-hmi-design-lane.md`](docs/port/optix-hmi-design-lane.md). Read this file first, then
that plan.

## Picking this up on another PC

```sh
git fetch origin
git switch --track origin/wip/optix-hmi-design
pnpm install
```

Then start at **A4** and **A5** below — they are small, they unblock every live-Studio call, and until
A4 the vendored-bridge diff is unrecorded (the repo's own rule for `packages/optix/bridge/`).

## Why this batch exists

The Optix plugin could only build screens out of the builtin `FTOptix.<Module>.ObjectTypes` catalog, so an
agent assembling a screen emitted bare `Rectangle`/`Label`/`Panel` widgets while FactoryTalk Optix ships
engineered library items (AlarmWidgets, TagGrid, PanelWithBackground, the StyleSheets, the Keyboards)
that it could not reach. The bridge exposes no static-class call path — `node/invoke` dispatches
`IUAObject.ExecuteMethod` on a *node path*, and `TemplateLibrary.ImportLibraryItem` is a static method on
`UAManagedCore.TemplateLibrary` — so the verb had to be added to the bridge itself. FactoryTalk View
already had the draft-screen and design-check machinery (`packages/ftview/src/edit/scaffold.ts`,
`screen.ts`, `packages/ftview/src/design.ts`); Optix had none. This batch closes both gaps and then
generalizes the design rules into a product-neutral `hmi` corpus domain.

## What is already done in this branch

**A1 — the SDK was read, not guessed.** `TemplateLibrary.ImportLibraryItem` exists in
`UAManagedCore.dll` 5.0.0.39 as shipped with FactoryTalk Optix Studio `1.7.4.32`, documented in
`...\Studio 1.7.4.32\Help\en\extending-projects\api\templates\importlibraryitem.html`. **The conflict
types are nested**: they must be written `TemplateLibrary.TypeConflictResolutionChoice` and
`TemplateLibrary.ConflictResolution`. Bare names fail with CS0246/CS0103 (the help page's example works
only because it opens `using static UAManagedCore.TemplateLibrary;`). No listing API was needed — the
shipped catalog is on disk and is read by the plugin, not by the bridge.

**A2 — bridge verb `POST /bridge/library/import`** in `packages/optix/bridge/StudioMCPBridge.cs`:
dispatcher branch at `:877`, route allow-list entry at `:935`, handler `ImportLibraryItemInline` at
`:4926` (doc comment from `:4893`), `BridgeVersion` `"1.0.9"` at `:49`. Wraps the call in
`destObj.Context.Sessions.ImpersonateRootTemporary()` — an Optix call on the HTTP thread with no session
aborts `FTOptixStudio.exe` with native heap corruption (the root-caused lesson behind every other write
verb). Query params `dest, class, library, item[, replace][preserve]`; guards `bad_query`,
`unknown_class`, `node_not_found`, `dest_not_container`, `import_failed`,
`library_item_not_found`; returns `{ok, created_path, library, item, node_class, clr_type,
conflicts_resolved, preserve_paths, session:"root", mode:"inline", thread:"http-bg"}`.
Compile-verified against the real assemblies: `Build succeeded. 0 Warning(s) 0 Error(s)` (22.9 s).

**A3 — tool `optix_library`** (one tool, two actions) registered in `packages/optix/lib/index.js:1826`,
right after `optix_action`; the reader is the new `packages/optix/lib/library.js` (286 lines). `action list`
reads the installed Studio catalog from disk with no bridge and no Studio session (display name, shipped
description, Chinese display name, owned-type count, component files); `action import` pre-validates the
library and item against that catalog (`library_not_found` / `item_not_found` with `did_you_mean`), then
POSTs `library/import`, requiring `allowWrites`, a loaded project BrowseName, `exclusive()`, and
`health.template_library === true` (an older bridge gets `library_import_unsupported_bridge` naming
`optix_bridge_arm`). An import is **not batch-reversible**, so the result tells the caller to read the
model back with `optix_read` before any retry.

**Bug found and fixed while writing this handoff.** `optix_library list` answered 0 items for every
library. Cause: `library.js:96` matched the item name with `/^- Name: (.+)$/u` — in a non-multiline
pattern `$` is end-of-*string*, and every block is multi-line, so every entry fell through `continue`.
Fixed to `/^- Name: (.+)$/mu` with a comment. Verified against the installed Studio; the catalog now
answers:

| Library | Items | Groups | Notes |
|---|---:|---:|---|
| Widgets | 42 | 0 | AlarmWidgets, TagGrid, StationConnectionStatus, UsernameLabel, … |
| Scripts | 34 | 0 | ChildrenCounter, AlarmNotificationLogic, ClockLogic, … |
| Misc | 6 | 0 | ScalarToBitArrayConverter, AuditEventLogger, … |
| FeaturePreview | 5 | 0 | FileSignVerify, MQTTLogic, … |
| StyleSheets | 4 | 0 | FriendlyLight, FriendlyDark, MaterialDark, ISAStyleSheet |
| GraphicElements | 2 | 8 | Toolbar, PanelWithBackground; the rest are group folders |
| Keyboards | 1 | 0 | Basic Keyboards (its display text did not resolve; cosmetic) |

## Verified environment facts (do not re-derive)

- Studio: `C:\Program Files\Rockwell Automation\FactoryTalk Optix\Studio 1.7.4.32`.
  Libraries: `<Studio>\Files\Libraries\{Widgets,GraphicElements,Keyboards,StyleSheets,Misc,Scripts,FeaturePreview}`.
- Catalog shape: `Nodes/Items/Items.yaml`, top-level entries `- Name: X` with `  Type: ObjectLibraryItem`,
  `  DisplayName: {"NamespaceIndex":26,"TextId":"XDisplayName"}`, `  Description: {...}`, `  Children:`
  holding `- Class: Reference`, `Name: LibraryItemGuid … Value: "<32 hex>"`,
  `Name: LibraryItemVersion … Value: <n>`. GraphicElements instead references groups with
  `- File: SignsAndSymbols/...` (8 groups: SignsAndSymbols, GeneralEquipment, Flags,
  ButtonsAndSwitches, System, Alarms, AutomaticDiagnostics, Graph…). Items held *inside* a group folder
  are reported as groups, not as importable names — nested import paths are unverified, prefer top-level.
- Text: `Nodes/Translations/Translations.yaml`, a quoted matrix `{"Type":12,"Dimensions":[rows,cols],
  "Body":[…]}` whose header row is `"","en-US","it-IT","de-DE","es-ES","fr-FR","zh-CN","pt-BR","ja-JP","ko-KR"`
  (English column 1, Chinese column 6). Descriptions are capped at 400 chars in the tool output.
- Bridge `ResolveNode` is `Project.Current.Get(path)` (bridge `:7016-7020`), so `dest` paths are
  project-relative: `UI`, `UI/Screens` — not `Root/Objects/UI`.
- `optix_status` health now advertises `"invoke_session":"root"` and `"template_library":true`; the
  first is what `optix_action` invoke requires, the second is what `optix_library import` requires.
- `packages/optix/bridge/source.json` pins upstream `asqi-carter/ftx-mcp` @
  `c36163ea88e79efc56d4df10eb337b44969fa922`, sha256 `6310701237…`, `localChanges: []` — still stale
  (A4).
- Budget gates: `components.json` `contextBudget.defaultOnTools = 150` (exact; one more default-on tool
  fails the suite until the number is raised *with its measurement*, or the component ships off) and
  `defaultOnSchemaCharacters = 127423`; `packages/optix/SKILL.md` is 7,992 B against
  `skillPolicy.defaultBudget 8000`.

## What remains, in order

**A4 — record the vendored change (do this first).** Add one `localChanges` entry to
`packages/optix/bridge/source.json` describing the `POST /bridge/library/import` verb (rationale: no
static-call path exists; upstream PR to open later), and update the recorded `sha256` to the new
`packages/optix/bridge/StudioMCPBridge.cs` (378,391 B now). Keep the added code as one commented block
so an upstream diff stays reviewable — the file's own comment style already does this.

**A5 — the copied template carries a stale, non-session-safe bridge.** The starter project copy
`packages/optix/templates/arya-optix-panel/project/ProjectFiles/NetSolution/StudioMCPBridge.cs` is
238,383 B against the tracked 378,391 B and contains no `ImpersonateRootTemporary`, so a project created
by `optix_template` has neither new verb and `optix_action` invoke refuses (`health.invoke_session` is
absent). Either have `optix_template` copy the tracked bridge over the template copy, or make the
manifest name the replacement step explicitly (worse: a silent quality cliff). Extend
`test/optix-template.spec.mjs` to assert the copied bridge is byte-identical to
`packages/optix/bridge/StudioMCPBridge.cs`. This is the last blocker on a truthful end-to-end demo.

**A3 polish.** Decide whether `library.js` needs a `lib/types/*.d.ts` entry like the other modules; make
sure the tool's description and `docs/reference/tools.md` are regenerated (see E1 for how vendored tools
appear).

**B1 — `packages/optix/lib/screens.js`.** Port, do not reinvent: mirror
`packages/ftview/src/edit/scaffold.ts` (PAD 24, HEADER 88, FOOTER 56; slots header/title/subtitle/body/
footer; theme `SCAFFOLD_THEME` at `:32`) and `packages/ftview/src/edit/screen.ts` (MAX_CARDS 4,
MAX_NAV 4, GAP 20, ROW 36, NAV 56, card overflow and "no room for content" refusals). Same theme values
so both products author one look: `#0E1A24` backdrop, `#0088C8` header, `#13232F` surface, `#143243`
footer, `#FFFFFF` title, `#CFE0EA` footer text. Output is an `optix_edit` op batch
(`create_object` / `create_widget` / `set_property` / `bind`), never a direct bridge write.

**B2 — `optix_screen`.** Optix has no offline draft store (the bridge writes the live project), so
"draft" means: return the batch, validate it through `optix_edit`'s existing `validate_ops` strict path
(`lib/index.js:1622-1635`), and only apply the same batch with `dry_run: false` under `allowWrites`.
Reuse the existing partial/indeterminate reporting and the "do not replay the entire batch
automatically" retry line (`:1648-1656`).

**B3 — `optix_design_check`.** Port `packages/ftview/src/design.ts` including the exported
`contrastRatio` (`:54`) to the Optix node model read via `optix_read`: touch target ≥ 44 px
(`VIEW-HPM-02`), captionless control (`VIEW-HPM-01`), text contrast ≥ 4.5:1 (`VIEW-COLOR-01`),
unreachable screen (`VIEW-NAV-01`), no exit control (`VIEW-NAV-02`), canvas size against the project's
window size (templates ship 1280×800, `VIEW-LAYOUT-02`). Add `OPTIX-UI-01` (a type per device instance
instead of one type + instances) and `OPTIX-UI-02` (a screen that computes), sourced from
`packages/resources/corpus/optix/optix-ui-structure.md`.

**B4 — deferred on purpose.** `optix_restyle`/bulk palette and keyboard/dialog composition
(`_UiCommands` OpenDialog/OpenKeyboard, bridge `:4904`). Record under Known gaps, do not build.

**C1 — new corpus domain `hmi`** in `packages/resources/corpus/hmi/` (4 pages ≈1 KB each:
`hmi-screen-hierarchy`, `hmi-targets-and-density`, `hmi-colour-and-contrast`, `hmi-navigation-and-exits`),
re-tagging rather than duplicating what already carries `applies_to: [ftview, optix]`
(`packages/resources/corpus/view/view-faceplates.md`). Regenerate `packages/resources/index.json`
(`gen-resources.mjs`); domains today are craft/iec/migration/optix/rockwell/view/yaskawa.

**C2 — `docs/reference/hmi-design.md`**: the shared screen grammar and which tool enforces which rule per
product; add Optix rows to the HMI design-standards table at `docs/reference/standards-checks.md:34-44`
(it lists only `ftview_*` enforcers today).

**C3 — skill wiring inside the budgets.** `packages/optix/SKILL.md` is 7,992 B against 8,000, so the new
lane is ~5 lines that *link* out: `optix_status` → `optix_library list` → `optix_screen` (dry run) →
`optix_design_check` → `optix_preview`/`optix_screenshot`. Mirror in `factorytalk-view` with
`ftview_draft_display_scaffold` / `ftview_draft_screen` / `ftview_design_check`;
`engineering-standards` points at the `hmi` domain.

**C4 — preset wiring:** `presets/arya-automation` carries the design lane so "design me a screen" routes
without naming a product; cover it in `test/arya-automation.spec.mjs`.

**D1 — document the proof loop**, don't invent one: `optix_preview` → `optix_screenshot` → inspect the
image → `optix_design_check`, keeping the honest `coverage` line (model state does not prove rendering or
runtime behaviour). **D2 — deferred, own decision:** an Optix screen face (SVG renderer like
`packages/ftview-viewer`) is a new package plus a face, inheriting the AGENTS.md client-UI contract; do
it only after A–C land.

**E1 — manifest and budget (the suite will fail you here).** `components.json`: optix `tools.count`
12 → 13 for `optix_library` (+ `optix_screen` and `optix_design_check` as they land, so 14 or 15), add
the names to the `factorytalk-optix` skill allow-list, and raise
`contextBudget.defaultOnTools` 150 → 152 *with the measurement recorded in the manifest comment* — or
ship `optix_design_check` off by default like ECAD and keep the budget. Also check how vendored,
`inReference:false` Optix tools appear in the generated `docs/reference/tools.json` before assuming the
generator covers them.
**E2 —** `README.md` tool counts and the "12 vendored Optix tools are not generated from source here"
lines, a docs-map row for `docs/reference/hmi-design.md`; `CHANGELOG.md` gets one `## [Unreleased]`
section (top is `## [0.93.0]`; do not bump/tag/publish until the owner says ship); locales together for
any new card copy.
**E3 — tests:** new `test/optix-library.spec.mjs` (route mapping, guard codes, session wrapper present),
`test/optix-screen.spec.mjs` (slot math, every refusal), `test/optix-design.spec.mjs` (each rule on a
fixture model); extend `test/optix-template.spec.mjs` (bridge copy), `test/resources.spec.mjs` (hmi
domain), `test/components.spec.mjs` (counts, budget, namespaces).
**E4 —** `pnpm test`, `pnpm docs:tools` then `pnpm docs:check`, `pnpm -r build`. Release evidence per
AGENTS.md: the packaged smoke must exercise one changed tool end to end — `optix_library import` against
a live Studio project on **Dev AryaCode** (`%LOCALAPPDATA%\AryaCode-dev\home`), never the installed
instance.

## Decisions already made (keep them unless the owner says otherwise)

1. **One `optix_library` tool with `action: list | import`**, so the default-on surface grows by one, not
   two. An import is deliberately outside `optix_edit`'s batch validator: it is not batch-reversible.
2. **Fork the vendored bridge locally and record `localChanges`**; open the upstream PR to
   `asqi-carter/ftx-mcp` as part of the batch so a later release can drop the local diff.
3. **Defer D2 (Optix SVG face)** until A–C land.
4. **Open decision:** raise `defaultOnTools` 150 → 152 with a recorded measurement *or* ship
   `optix_design_check` off by default (count stays 151). Recommendation on file: raise it and ship on.
5. One batch, one version, staged under `## [Unreleased]`.

## Commands that worked on the old machine

```powershell
# syntax
node --check packages/optix/lib/index.js
node --check packages/optix/lib/library.js

# catalog probe (no Studio, no bridge) — run from packages/optix
node --input-type=module -e "import {libraryRoots, readCatalog} from './lib/library.js'; const r=(await libraryRoots()).at(-1); for (const e of await readCatalog(r.libraries)) console.log(e.library, e.item_count, e.groups.length)"

# compile-check the C# bridge against the installed Optix assemblies
#   C:\Users\KNPhu\AryaCode\KonnectSuite\.tmp-bridge-compile\ holds StudioMCPBridge.cs +
#   BridgeCompile.csproj (references <Studio>\Modules\*.Net\...\*.dll); copy the edited file in, then:
Set-Location C:\Users\KNPhu\AryaCode\KonnectSuite\.tmp-bridge-compile
dotnet build BridgeCompile.csproj -nologo -v q
```

## Traps, and what is still unverified

- **The DSH Windows sandbox blocks subprocess pipes**: `pnpm test` and `pnpm docs:check` die with
  `spawn EPERM` (`tsx`/node test runner spawn children with piped stdio). That is the sandbox, not a
  defect. In-sandbox workarounds that were verified: `node test/docs.spec.mjs` and
  `node test/components.spec.mjs` run in-process and **both pass** today (they do not spawn). Run the
  full suite and `docs:check` from a terminal outside the DSH sandbox (or with wider permissions).
  `node test/tool-reference.spec.mjs` needs the repo's `tsx` loader, so in-process it stops on
  `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` in `packages/l5x/src/core/errors.ts`.
- `optix_library list` needs no Studio; `import` needs Studio open, the bridge started on the project,
  `allowWrites`, and a 1.0.9 bridge. A project copied by the current `optix_template` has the old bridge
  (A5) — expect `library_import_unsupported_bridge`.
- Nothing in this batch has ever run against a live Studio project end to end. Every Optix claim above
  comes from the shipped SDK, the on-disk catalog, or a compile — not from a bridge session. Keep the
  `coverage` language honest in each tool result.
- `library.js` reads the catalog per call on purpose (a Studio update between calls must not answer from
  a stale catalog); do not add a cache without that reasoning.
- The `Keyboards` item's display text did not resolve through the translations matrix (shows as `?` in
  the probe). Cosmetic, but check its `DisplayName` TextId if the list reads oddly.
- Scratch files from the previous session (`artifacts/escape-probe.txt`, a probe `.mjs`) are deleted; do
  not resurrect them. Session transcripts and the raw plan live only on the old PC under
  `C:\Users\KNPhu\AryaCode\KonnectSuite\.handoff\` (`plan.md`, `session.v4.jsonl`) — `plan.md` is
  committed here as `docs/port/optix-hmi-design-lane.md`.

## Files this branch changes

| Path | Change |
|---|---|
| `packages/optix/bridge/StudioMCPBridge.cs` | +153/−7: the `POST /bridge/library/import` verb, its dispatcher branch, route allow-list entry, `template_library` health field, 1.0.9 version |
| `packages/optix/lib/library.js` | new (286 lines): Studio discovery, `Items.yaml`/`Translations.yaml` readers, name suggestions, `readCatalog` |
| `packages/optix/lib/index.js` | +155: `optix_library` registration (list/import, pre-validation, `exclusive()`, bridge call) |
| `HANDOFF.md` | this file |
| `docs/port/optix-hmi-design-lane.md` | the approved plan, kept as design history |
