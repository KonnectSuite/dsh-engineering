# Handoff — Optix template-library access + a product-neutral HMI design lane

Written 2026-11-13 on the Windows workstation, from
`C:\Users\KNPhu\AryaCode\KonnectSuite\dsh-engineering`.
Branch: **`wip/optix-hmi-design`**, based on `main` @ `5d15103 docs: record the 0.93.0 release`.
The batch is unfinished work in progress, not a release: `package.json` is still `0.93.0` and nothing is
bumped, tagged or published. `## [Unreleased]` now exists in `CHANGELOG.md` and carries both the planned
work and what the live run below changed.

Read **Status 2026-11-14** first: the batch has since run against a live Studio, and the section after this
one describes the plan as it stood before that run.

## Status 2026-11-14

The approved plan (phases A–E, with the evidence table that justified them) stays committed at
[`docs/port/optix-hmi-design-lane.md`](docs/port/optix-hmi-design-lane.md); read that for why the lane
exists, and this section for where it ended up.

Everything below through E4 is done, and the batch has now been exercised against FactoryTalk Optix Studio
1.8.1 with bridge 1.0.9 on a live project (`hmi-e2e\AryaNewHMIProject_IPC`, 1920×1080) — it had never run
before. What that produced:

- Three load-stopping defects (no `z.enum` in schemastery, a `required: false` parameter, four objects
  without `additionalProperties`) were fixed before the plugin would mount at all.
- The draft path was wrong in three ways a mock cannot see: `POST /bridge/expr/validate` (the gateway
  defaulted to `GET`), the lamp expression (`if({0}, 0xFF30A46C, 0xFFE5484D)`, not `IIF` with CSS hex), and
  the query encoder (`URLSearchParams` writes a space as `+`, which the bridge does not decode) — the last
  one had every caption on the screen reading `Plant+overview`.
- `optix_screen` reads the canvas and the single `PanelLoader` from the live start window, probes navigation
  targets before the batch, and withholds wiring whose target does not exist yet.
- `optix_screen` takes `library_items` and stamps shipped composites (import once under
  `UI/Components/<Library>`, instantiate, place); `optix_library` defaults its import there too.
- Three new corpus pages carry Rockwell's own sample projects as a design reference
  (`optix-navigation-patterns`, `optix-widget-patterns`, `optix-design-resources`), linked rather than
  vendored.
- Navigation switches panels at runtime. The bridge writes the `ObjectPointer`'s absolute design-time
  NodeId beside the relative `DynamicLink`, and the runtime resolves the absolute id first — the error was
  `No behaviour or observer found that handles the method 'ChangePanel' on node
  Root/Objects/<project>/UI/MainWindow/MainLoader`. A button created inside a panel can never reach the
  loader for the same family of reason: its instance is one level deeper in a session
  (`UIRoot/<loader>/<panel>/<button>`) than in the design tree. So `optix_screen` draws the bar in the
  window beside the loader, names each button for the panel it opens (`Nav_<target>`, so a second screen's
  draft adds its buttons rather than replacing the first screen's), wires `object_raw`-relative, and clears
  the absolute pointer value after the batch; `optix_design_check` counts wired shell navigation as the
  screen's exit. Verified live by clicking both directions
  (`docs/port/optix-live-proof/04-shell-home-runtime.png`, `05-shell-pumps-runtime.png`).
- The release review exists as a tool: `optix_production_check` walks the whole `UI` tree in one call and
  returns a verdict plus findings for the failures a per-screen check cannot see — an absolute design-time
  pointer (`OPTIX-PROD-01`), a dead handler or a missing navigation screen (`PROD-02`), an unreachable
  screen (`PROD-03`, shell bar counted), an engine still on the built-in user or stock style sheet
  (`PROD-04`), a screen outside the folder (`PROD-05`) — and `repair: true` clears the absolute pointer.
  Measured on the simulator project: `review`, two `PROD-04` warnings, three screens reachable, nineteen
  handlers. Three bridge facts had to be measured to read it: `map` returns node ids only with `ids=1`,
  the engine types are `NativeUIPresentationEngine`/`WebUIPresentationEngine`, and a handler inside a
  shipped composite needs a second, deeper read before it can be judged.
- A NetLogic machine simulator exercises the whole loop: `hmi-e2e\AryaNewHMIProject_IPC\ProjectFiles\NetSolution\LineSimulator.cs`
  (a `BaseNetLogic` with a 200 ms `PeriodicTask`) drives a twelve-tag `Model/Line`, six command buttons
  write `Start`/`Reset`/`Setpoint` through `VariableCommands`, and the runtime shows the level ramping to
  64 %, pressure 4.2 bar, speed 62 bpm, then collapsing on STOP
  (`docs/port/optix-live-proof/06-line-overview-running.png` … `08-line-alarms-bottles.png`).
- The build order is in the corpus as `optix-application-recipe` (`OPTIX-RCP-01..06`), and the Optix and
  resources skills, `docs/reference/hmi-design.md` and `CHANGELOG.md` all point at it and at the review.
- The packaged bundle mounts. The row's own `entries/optix.js` had the same `z.enum` defect the library
  had — every test passed because the suites read `packages/**`, and a packed install failed the whole
  Optix row with `z.enum is not a function`. It is a `z.union([z.const(…)])` pair now, and
  `test/entries-schema.spec.mjs` (wired into `scripts/test.mjs`) reads every entry for the call. Verified
  by installing the packed tarball into the `optix-dev` profile on the dev home and booting it: no import
  warning, all ten engineering rows `Running`, the Optix row's settings page rendering
  (`docs/port/optix-live-proof/09-dev-optix-row-settings.png`, `10-dev-rows-running.png`).
- Gates: `pnpm test` (49 files), `pnpm docs:tools` and the resources index (52 pages) are green as of this
  date.

Still open, and not to be claimed as working:

- `packages/optix/bridge/StudioMCPBridge.cs` carries the matching pointer fix (write `NodeId.Empty` when a
  relative path is given, in both the create and update paths) — compiled, but **not yet loaded into a
  running Studio** (`bin\AryaNewHMIProject_IPC.dll` is still the old build, and the Studio-side build /
  reload step has no route through the tools). Until it lands, every caller of `wire_event` with
  `object_raw` depends on the tool clearing the pointer afterwards, which `optix_screen` now does.
- A composite placed from the library carries no geometry for its own children, so `optix_design_check`
  reports those children as unchecked — honest, their layout is computed inside the type.
- `optix_preview` / `optix_screenshot` have not been exercised through the host: they need the attachment
  and browser services, and the verification ran in the runtime's Web presentation engine through a
  headless browser instead.
- The commit is `e6c7077` ("feat(optix): run the design lane live, make navigation switch panels, and add a
  release review"); the entry fix, its test and the dev-home proof came after it.

## Use it in AryaCode today (dev home, never the installed profile)

The installed product at `~/.aryacode` is read-only by policy; the working bundle is proven on the dev home
instead. The `optix-dev` profile there installs the packed tarball:

```powershell
$env:DSH_HOME = "$env:LOCALAPPDATA\AryaCode-dev\home"
$dsh = "C:\Users\KNPhu\AryaCode\KonnectSuite\AryaCode\apps\desktop\.desktop-build\targets\win-x64\dsh\lib\bin.js"
node $dsh --profile optix-dev --host 127.0.0.1 --port 0 --no-open
```

That prints `dsh web: http://127.0.0.1:<port>/?token=<token>` — open it, and the Plugins page shows
`@aryacode/dsh-engineering 0.93.0` with ten rows, `optix` among them `Running`. Repack after a code change:

```powershell
pnpm -r build; pnpm assemble; npm pack --ignore-scripts
Copy-Item aryacode-dsh-engineering-0.93.0.tgz artifacts\aryacode-dsh-engineering-0.93.0-bridgefix-2026-11-14.tgz -Force
# then, in %LOCALAPPDATA%\AryaCode-dev\home\profiles\optix-dev: pnpm install --force --config.auto-install-peers=false
```

Keep the tarball name distinct per build: pnpm reports "Already up to date" when version and path are
unchanged, and the installed copy silently stays old.

## Picking this up on another PC

```sh
git fetch origin
git switch --track origin/wip/optix-hmi-design
pnpm install
```

Then read **Status 2026-11-14** above: the phases below describe how the lane was planned, and the parts
they mark as remaining (B1–B3, C1–C4, E3–E4) are now in the tree.

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
  `c36163ea88e79efc56d4df10eb337b44969fa922`, sha256 `8b208fd26b17c153ec10b70a3915fdc28f4cc03cd384408b483ab8964b52c9ad`
  (measured on the 378,391-byte tracked bridge), and its `localChanges` records the four local edits. The
  upstream pull request is **still not filed** — that is an open task, not a completed one.
- Budget gates: `components.json` `contextBudget.defaultOnTools = 152` (exact; one more default-on tool
  fails the suite until the number is raised *with its measurement*, or the component ships off) and
  `defaultOnSchemaCharacters = 127423`. The Optix component now claims **14** tools: 13 vendored engine
  tools plus `optix_netlogic`, which `entries/netlogic.js` registers. `packages/optix/SKILL.md` is
  un-budgeted (`skill.budget: null`), so its body may grow past 8,000 bytes without failing the suite —
  keep it lean anyway, because a skill body is injected into the request.

## What remains, in order

**A4 — done.** `packages/optix/bridge/source.json` carries four `localChanges` entries (the 1.0.9 version
bump and health field, the `POST /bridge/library/import` verb and its `_MutationRoutes` entry, the
`TemplateLibrary.`-qualified conflict types, and the unfiled upstream PR) and the re-measured sha256.
**Filing that upstream pull request is still open.**

**A5 — done as far as a tool can.** `optix_template` no longer claims a hardcoded `1.0.7`: it reads the
version out of the tracked bridge, reports the starter's own `bundledBridgeVersion` beside it, and its
instructions name `optix_bridge_arm` as the step that replaces the stale copy. `test/optix-template.spec.mjs`
asserts the tracked bridge carries a version and `ImpersonateRootTemporary`, and that any starter whose
bundled version differs names that step. The starter folders still ship their old 238,383-byte copy on
purpose — overwriting a vendored starter project is the owner's call, not a silent edit.

**A3 polish — done.** `packages/optix/lib/types/library.d.ts` matches the sibling declarations, and
`test/optix-library.spec.mjs` (9 tests, all offline) holds the catalog parser, the localization header row,
the name suggestions, the bridge verb's session wrapper and conflict-type nesting, the fact that an import
stays out of the reversible `optix_edit` allowlist, and the manifest count. It is registered in
`scripts/test.mjs`'s BUNDLE list.

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

**E1 — done, with a decision to keep or overturn.** `components.json` counts the Optix row at **14** tools
(13 vendored engine tools + `optix_netlogic`, which `entries/netlogic.js` registers and the old count of 12
left out of both the manifest and the budget), `optix_library` is in the `factorytalk-optix` allow-list, and
`contextBudget.defaultOnTools` is **152** with the measurement written into the manifest note. Verified
against the suite: `node test/components.spec.mjs` 14/14 pass. When `optix_screen` and `optix_design_check`
land, the count and the ceiling each move again — raise them with the measurement, or ship the new tool off
by default like ECAD.

**E2 — done except the hmi doc.** `README.md` line 7 total (172), the Optix table row (14), the tool-group
bullet (14, naming `optix_library`), and the known-limits line (13 vendored + why `optix_netlogic` is not
inside the 158) are updated; `CHANGELOG.md` has a `## [Unreleased]` batch above `## [0.93.0]` and says plainly
that nothing here has run against a live Studio project. Version stays `0.93.0`: nothing is bumped, tagged or
published. `packages/optix/locale/en.json` holds no `optix_*` keys — tool descriptions are not localized, so
no locale work was needed for `optix_library` (locales serve faces). Still owed: the docs-map row for
`docs/reference/hmi-design.md` when C2 lands.

**E3 — partly done.** `test/optix-library.spec.mjs` (9 tests) and the bridge-version test in
`test/optix-template.spec.mjs` are in and registered in `scripts/test.mjs`. Still owed:
`test/optix-screen.spec.mjs` (slot math, every refusal), `test/optix-design.spec.mjs` (each rule on a
fixture model), `test/resources.spec.mjs` (hmi domain), and the `test/components.spec.mjs` count/budget
updates as tools land.
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
| `packages/optix/bridge/source.json` | re-pinned sha256 + four `localChanges` entries (the unfiled upstream PR is one of them) |
| `packages/optix/lib/library.js` | new (286 lines): Studio discovery, `Items.yaml`/`Translations.yaml` readers, name suggestions, `readCatalog` |
| `packages/optix/lib/types/library.d.ts` | new: the matching declarations, in the style of the sibling `.d.ts` files |
| `packages/optix/lib/index.js` | +202: `optix_library` registration (list/import, pre-validation, `exclusive()`, bridge call) and the honest `optix_template` bridge reporting |
| `packages/optix/SKILL.md` | +12: the "Build a screen from what Studio ships" lane |
| `test/optix-library.spec.mjs` | new (9 tests, all offline): catalog parser, localization header row, suggestions, the bridge verb's session wrapper and conflict-type nesting, the import staying out of the reversible allowlist, the manifest count |
| `test/optix-template.spec.mjs` | +24: the tracked-vs-bundled bridge version test naming `optix_bridge_arm` |
| `components.json` | Optix 12 → 14 tools, `optix_library` in the skill allow-list, `defaultOnTools` 150 → 152 with the measurement |
| `README.md` | total 172, Optix row 14, the tool-group bullet, the vendored-tools known limit |
| `CHANGELOG.md` | the `## [Unreleased]` batch |
| `scripts/test.mjs` | `test/optix-library.spec.mjs` added to the BUNDLE list |
| `HANDOFF.md` | this file |
| `docs/port/optix-hmi-design-lane.md` | the approved plan, kept as design history |
