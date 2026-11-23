# Handoff

The bundle after the 0.104.0 knowledge-and-legacy batch, now hardened against the vendor software
actually installed on this host. This file is the current state: version, what the batch changes,
what was verified and how, what could not be run on this host, and the next step. History belongs
to [CHANGELOG.md](CHANGELOG.md), not here.

## Right now

| | |
| --- | --- |
| Branch | `main`, pushed to `origin`; `v0.104.0` is a lightweight tag on the release commit `7fbf495`. |
| Version | **0.104.0** — `package.json` and the `## 0.104.0 — 2026-11-23` heading in `CHANGELOG.md`. |
| Release state | **Shipped as 0.104.0 on 2026-11-23, on the owner's request**: published to npm (`dist-tags.latest` = 0.104.0), tagged `v0.104.0`, the tag push made the GitHub Release whose body is this version's changelog section, and the market catalogue's `releases[0]` points at 0.104.0 with the registry copy's sha256. |
| Tarball | `artifacts/aryacode-dsh-engineering-0.104.0.tgz` — 5,280,649 B packed, SHA256 `67D2E5866587B9B00B25E8B1340C339E31363D5EAFFCB38AF3440EF18791B6B0`, SHA1 `C64A2D2193934BA92C34BD2EA81B99568B504936`. Packed from the release tree, so it **includes** the ladder-import, structure-family and motion-family work and the skill-brief fix. The registry copy is **byte-identical** — downloaded from `https://registry.npmjs.org/@aryacode/dsh-engineering/-/dsh-engineering-0.104.0.tgz` and hashed to the same 5,280,649 B and SHA256, and `npm view` reports the same SHA1 as `dist.shasum`. `check:package` on this tree reports 21.7 MiB in 1,096 files unpacked. |
| Surface | 9 component rows: **7 ship on, 2 off** (`plc5`, `slc`). **199 registered tools**, **174 default-on**, 8 skills, 6 product documents. |
| Generated reference | `docs/reference/tools.md` and `tools.json`: **167 tools** in 23 groups (the 32 vendored Optix tools are not generated). |
| Context budget | **174 tools / 136,828 schema characters** — the ceiling is the 2026-11-22 measurement 131,565 + 4%; re-measured **131,784** on 2026-11-23 (L5X 55,453 + FTView 45,544 + MWI 18,488 + resources 1,474 + migration 10,825) after the structure- and motion-family operand wording landed. |
| Verified | `pnpm test` **79/79 spec files pass** on the release tree `7fbf495` (56,295 ms; 51,124 ms on the pre-fold tree); the l5x package vitest suite **585/585** (45 files); `pnpm -r build` and `pnpm assemble` ("assembled 8 components and 1 viewer payloads into vendor/") and `pnpm docs:check`, `pnpm check:package` ("the tarball is conforming", 21.7 MiB in 1,096 files), `node scripts/eval-knowledge.mjs --check` ("all products pass"), `node scripts/sync-knowledge-lib.mjs --check` and the L5X knowledge generator check all green. Fresh Dev profile `verify-0104f` from the **earlier** 0.104.0 tarball boots **173 tools**, engineering 170, nine rows (7 active, plc5/slc disabled); the unreleased tree registers 199 tools / 174 default-on. **Packaged release smoke on the published payload** (Dev profile `verify-0104h`, whose `@aryacode/dsh-engineering` dependency is the tarball downloaded from the registry, `67d2e586…`): `node --import tsx/esm apps/cli/release-0104-smoke.mjs` boots **174 default-on tools** (56 `l5x_`), `l5x_export_rungs` writes a 1,004,886 B rung-target file (`TargetType="Rung"`, three `Use="Target"` rungs) and returns `paste_text`, `l5x_compose_rung` refuses `MDF(Axis1,…)` with "Axis1 is AXIS_VIRTUAL; MDF Axis must be AXIS_SERVO" and composes `MDF(AxisS,MdfInstr);`, and the shipped `vendor/l5x/SKILL.md` names `l5x_export_rungs` and `l5x_docs`. Driver and log: `AryaCode\tmp\release-0104-smoke.mjs`, `release-0104-smoke2.log`. |
| Installed-software pass | Studio 5000, FactoryTalk View, RSLogix 500, RSLogix 5 and FactoryTalk Optix were each driven against the installed applications as the user (Computer Use), with real edits/builds/imports/renders. Evidence paths are in the table below. MotionWorks IEC is absent and is **not-runnable**, never "pass". |

## What 0.104.0 changes

- **Knowledge plane.** A shared retrieval core (BM25 `k1=1.2`, `b=0.75`; exact identifiers and
  aliases always included and ranked by score; deterministic order; a scope floor that answers
  no-match instead of five weak hits) and five documentation tools — `l5x_docs`, `ftview_docs`,
  `migration_docs`, `plc5_docs`, `slc500_docs`. Each has exactly five actions: `contents`,
  `search`, `read`, `status`, `lookup`. Authored pages ship in the tarball; installed vendor
  help is indexed structurally and parsed locally at read time, never shipped.
- **L5X knowledge and the prefix rename.** 7 L5X collections (2,774,491 B, 127 files), including
  structural indexes of the installed Studio 5000 v37.05.00 and v36.00.00 help (5,493 and 6,581
  pages), `instruction-versions.json` (328 mnemonics) and revision guards
  (`INSTRUCTION_NOT_IN_REVISION`, fail-open `REVISION_UNVERIFIED`, `SOURCE_NOT_INSTALLED`).
  All 56 L5X tools now carry the `l5x_` prefix — **50 renamed, 5 already prefixed**, plus
  `l5x_export_rungs` for the Studio Import Rungs route; no aliases,
  the migration table is in the 0.104.0 changelog section.
- **FTView knowledge.** Authored ME pages (9) plus structural indexes of the installed ME and SE
  help (1,544 and 2,603 pages) behind `ftview_docs`.
- **Migration and PLC-5 knowledge.** `migration_docs` (15 authored pages) and `plc5_docs`
  (9 pages); six new read-only PLC-5 text tools — `plc5_pc5`, `plc5_verify`,
  `plc5_instruction_inventory`, `plc5_rung_digest`, `plc5_indirect_census`, `plc5_diff` — so
  PLC-5 is 15 tools, off by default.
- **New RSLogix 500 row (`slc`).** Ten read-only `slc500_*` tools (`capabilities`, `open`,
  `ladder`, `find`, `io_census`, `io_config`, `data_read`, `processor`, `database`, `docs`),
  skill `rslogix-500`, ships **off**. Text exports and `.SLC` Library exports are read offline;
  `.RSS` through the automation server is honest about not being proved (`NOT_LICENSED`/`SOURCE_NOT_INSTALLED`).
- **MotionWorks IEC honest IDE-free behaviour.** Known version line **3.0.3–3.7.5**; a host probe
  that inspects 7 locations; `mw_ide_status` reports `installed:false`, 7 looked-for locations and
  `NOT_INSTALLED`; compile/live/profile paths answer `not-runnable` with a fix instead of a false
  result. The tool surface stays 24 `mw_*` tools.
- **ECAD product retired, drawing preview kept.** The `ecad` row, its 12 tools and the
  `ecad-review` skill are gone; the DXF/DWG drawing preview remains part of the `viewers` surface
  (root ECAD Remote service, engine and client face retained; `vendor/ecad` is now a viewer
  payload, not a component).
- **Handbook and scaffold.** `docs/handbook/` is built from 15 Markdown pages (docx/html/pdf),
  `packages/_scaffold/` is a compilable new-component skeleton, and the generators are checked.
- **Evaluation harness.** `scripts/eval-knowledge.mjs` runs every product's `goldens.json`
  (124 cases total), checks Recall@5/MRR@5/nDCG@10 against per-product thresholds, exact and
  no-match shares, the read/hit caps, latency p95 and determinism (sha256 over two runs), and
  writes `artifacts/eval-knowledge.json`.
- **The installed-software fixes.** The Studio 5000 SDK bridge discovers the installed CSClient
  package and targets the framework that package ships (net8.0 for v36, net10.0 for v37); a new
  FTView display follows the export's declared `Gfx-ME<n>.xsd` version and `ftview_verify_import`
  treats vendor defaults and colour spellings as normalisation; the SLC reader parses the real
  RSLogix 500 Library (`*.SLC`) APS dialect and the measured headerless `.EAS`/`.ERP` documentation
  exports; PLC-5 results are lossless JSON; the Optix bridge arm recognises Optix 1.8's indented
  `Nodes:` section. Each has a regression test.

## Verified, and how

All commands below were run on this tree; the tree then carried the evidence into this commit.

| Area | Command / evidence | Result |
| --- | --- | --- |
| Suite | `pnpm test` (with `HANDBOOK_PYTHON` set to the bundled Python) | **79 file(s) passed in 54,264 ms**; includes knowledge core/packaging, per-product knowledge, legacy, MWI IDE-free, SLC and handbook specs. |
| Generated docs | `pnpm docs:check` | `gen-tool-reference: reference is up to date.` / `gen-print-css: docs/print.css is up to date.` |
| Packaging | `pnpm check:package` | `the tarball is conforming`; the 0.104.0 tarball is 1,094 files, the current unreleased tree 1,096; largest entries the ECAD wasm (6.11 MiB) and the L5X/optix indexes. |
| Knowledge eval | `node scripts/eval-knowledge.mjs --check` | **all products pass**, determinism true, no problems. |
| Retrieval figures | `artifacts/eval-knowledge.json` | L5X 32 cases R@5 .957 / MRR .891 / nDCG .900; FTView 23 .933/.967/.942; migration 25 1/.972/.979; PLC-5 22 1/1/.991; SLC 22 1/.817/.864. Exact share 1, no-match 1, hit cap true, determinism true. |
| Knowledge sync | `node scripts/sync-knowledge-lib.mjs --check` | Current; 5 consumers byte-equal to `packages/knowledge/src`. |
| Generators | l5x/ftview/migration/plc5/slc knowledge generators `--check` | All current; two clean L5X runs byte-identical (5,493 v37.05 pages + 6,581 v36.00 pages, 328 mnemonics). |
| Handbook | bundled Python + `scripts/gen-handbook.py`, then `--check` | 15 pages; docx/html/pdf regenerated; source hash `105186b902a2f2ae`; check ok. |
| Clean install | fresh Dev profile `verify-0104f` from the 0.104.0 tarball | Boots: **173 tools** (the tarball predates `l5x_export_rungs`); engineering 170 = `engineering_` 2 + `ftview_` 52 + `l5x_` 55 + `migration_` 6 + `mw_` 24 + `optix_` 31; nine rows — l5x, ftview, mwi, viewers, engineering-resources, migration, optix `active`, plc5 and slc `disabled`; `l5xProjects` provided and the five sample `l5x_*` names executable. A release build adds `l5x_export_rungs` for 174 default-on tools. |
| Changed-tool packaged smoke | from the installed profile, on `packages/l5x/test/fixtures/sample.l5x` | `l5x_open_project` parsed the project (rev 33.1/export 33.00; 1769-L33ER; 2 programs, 19 tags, 3 routines, 3 modules); `l5x_run_checks` 3 INFO findings; `l5x_docs search` 91 hits with `instruction-ton` first; `l5x_document_project` wrote 3 files (5 rung comments, 11 rungs). |
| L5X ladder import (non-SDK) | Studio 5000 v37.05 UI on a generated `LadderReliability` project | Exported MainRoutine (routine target, empty rung `;`); offline `l5x_draft_tag` ×3 + `l5x_draft_rung` + `l5x_draft_validate` (draft hash `ccd1631c…`) + `l5x_draft_apply` (1,370 B); Studio **Import Routine** Operation Overwrite; Studio **Verify** "Complete - 0 error(s), 0 warning(s)"; Ctrl+S; re-export `LadderReliability_imported_RLL.L5X` (1,923 B) carries the three BOOL tags and `<Comment>` + `<Text>XIC(Start)XIO(Stop)OTE(Run);</Text>`. Then `l5x_export_rungs` wrote `LadderReliability-draft-rungs.L5X`, Studio **Import Rungs** read it as Imported Rungs: 1 (Operation overwrite), applied it, and Studio **Verify** reported "Complete - 0 error(s), 0 warning(s)". A second multi-operation draft (rung replace with Fault interlock, parallel-branch insert, both comments, six BOOL tags, one inserted-then-deleted rung) produced `LadderReliability-multi-rungs.L5X`; Studio **Import Rungs** read **Imported Rungs: 2** and applied both rungs with their comments and the branch; the operation appended after the selected rung, so the superseded rung was deleted and Studio **Verify** then reported 0 errors; `l5x_export_rungs` also returns `paste_text` per rung (review-only). The whole instruction catalogue was then exercised: a 43-rung routine with 32 typed tags (TIMER/COUNTER/DINT/REAL/STRING/arrays) covering timers, counters, all compares, arithmetic/moves, bitwise, latches/one-shots, strings and JMP/LBL was imported through **Import Routine** (Import Configuration read `Number of Rungs: 43`, Overwrite), rendered correctly, and Studio **Verify** reported "Complete - 0 error(s), 1 warning(s)" — the warning is `Rung 38: AFI detected`, expected for the intentionally always-false rung. |
| Upgrade / rollback (N-1) | 0.103.0 tarball (`npm pack @aryacode/dsh-engineering@0.103.0`, 4,763,737 B) → 0.104.0 local tarball, then back | 0.103 composition: 170 tools, legacy L5X names, `ecad` row present/disabled, no `slc` row. Update: 990 ms `pnpm install`, 173 tools in the 0.104.0 tarball (all 55 names then registered prefixed; `l5x_export_rungs` lands in the next release), `entries/ecad.js` absent, `vendor/ecad` viewer payload + L5X knowledge present, nine rows. Rollback: 170 tools and the 0.103 composition. Profile finally left on 0.104.0. |
| No-vendor source | installed profile with `L5X_HELP_ROOT_V37_05`/`V36_00` = `Z:/no-such-help-root` | `l5x_docs read` of `help/clinset/timer-counter/timer-on-delay--ton-` returns `SOURCE_NOT_INSTALLED` naming the searched root; with the real install the same read returns the real TON page body. Structural `search`/`status` still answer from the shipped index — by design. |
| Offline / no-network | static grep over the knowledge core, five `docs.ts` adapters and the eval script | No `fetch`, `node:http(s)`, `axios`, `child_process`, `net.connect` or `WebSocket`; the eval is local only. |
| Licensing | NOTICE/README/`docs/reference/knowledge.md` | MIT posture: authored pages ship; the installed-help bodies are parsed from the user's own installation at read time and are never in the tarball. |

### Installed vendor software, driven end to end

Every row below was executed on this host on 2026-11-22, with the installed applications driven as
the user through Computer Use and the tools called through the installed 0.104.0 profile. Evidence
files live under `C:\Users\KNPhu\AryaCode\KonnectSuite\AryaCode\tmp\` and are not shipped.

| Product | What was done | Evidence |
| --- | --- | --- |
| Studio 5000 Logix Designer 37.11 + Logix Designer SDK | `l5x_studio_sdk_status` available; `l5x_export_acd_to_l5x` exported the real `OEEDemo.ACD` (1,842,823 B); `l5x_open_project` reported ConnectOEE_Sim, 8 programs/141 tags/8 routines, controller 1769-L36ERM rev 37.11; drafted a comment into `MainProgram/MainRoutine` with `l5x_draft_st` → validate → apply; `l5x_verify_offline_l5x` built `OEEDemo-0104d-built.ACD` (4,173,455 B, "Offline build passed; 0 blocker(s)"); opened the built ACD in Logix Designer and the editor shows the drafted line; re-exporting the built ACD found the drafted comment again (2,284,833 B) | `tmp/studio-e2e/` (step JSONs, `OEEDemo-0104d-built.ACD`), `tmp/studio-e2e/evidence/logix-built-acd-mainroutine.png`, `tmp/studio-e2e/evidence/studio-e2e-proof.json` |
| Studio 5000 structure family (SDK build) | 2026-11-22: a Studio Verify of a control-structure routine had named twelve invalid operands in `Length`/`Position`/`Dimension`/bit-number slots. The catalogue was corrected against the installed v37 help (immediate pseudo-operands, CONTROL tags, array-or-element sequencer arrays) and the result imported and built by the Logix Designer SDK: `l5x_verify_offline_l5x` on a full `LadderReliability` baseline exported with `l5x_export_acd_to_l5x` returned **"Offline build passed; 0 blocker(s)"**, import warnings 0, import errors 0, `full-draft-build.ACD` 1,917,173 B. After the owner stopped the screen share, the corrected routine was also imported through the Studio GUI with **Import Routine** (Import Configuration read `Number of Rungs: 22`, Operation Overwrite) and Studio **Verify** reported **"Complete - 0 error(s), 0 warning(s)"**; PID, the JSR call and the `SBR`/`RET` subroutine are not in that 22-rung GUI file because Studio's dialog Verify demands explicit optional-argument placeholders for PID and the SubRoutine was removed, while all three are inside the full routine the SDK imported and built with 0 blockers | `tmp/ladder-struct-sdk.log`, `tmp/ladder-e2e/full-draft-build.ACD`, `tmp/ladder-e2e/full-baseline.l5x`, `tmp/ladder-e2e/LadderReliability-struct5.L5X`, `tmp/ladder-e2e/evidence/struct-gui-verify-{top,0-errors}.png` |
| Motion family (Studio GUI Verify) | 2026-11-22: proved ladder motion code compiles without hardware. A `MOTION_GROUP` tag (`MG1`), an `AXIS_VIRTUAL` tag (`Axis1`) and an `AXIS_SERVO` tag (`AxisS`) are controller-scoped tags created offline; no module, drive or controller was involved. An 11-instruction routine (`MAH`, `MSO`, `MSF`, `MDF`, `MDW`, `MAJ`, `MAS`, `MAM`, `MRP`, `MGS`, `MGSP`) was drafted from the installed help operand tables, imported and built by the Logix Designer SDK ("Offline build passed; 0 blocker(s)", import errors 0, `MotionDraft4-build.ACD`), then verified in the Studio 37.05 GUI through Logic → Verify → Controller: **Complete - 0 error(s), 9 warning(s)**. The nine warnings are offline axis configuration, not encoding: AxisS is not associated with a motion group / module, both axes have zero maximum speed, deceleration and acceleration-jerk limits, and one left-over structure rung references an unconfigured message tag. Axis-type rules recorded in the catalogue: `MSO`/`MSF`/`MDW` accept `AXIS_SERVO` or `AXIS_SERVO_DRIVE`, `MDF` accepts `AXIS_SERVO` only (installed v37 help), the other seven also accept `AXIS_VIRTUAL` | `tmp/ladder-e2e/evidence/motion-gui-verify-0-errors.png`, `tmp/ladder-e2e/evidence/MotionDraft4.L5X`, `tmp/ladder-e2e/evidence/MotionBase4.L5X` |
| FactoryTalk View Studio 15.0 (ME) | Vendor export of `BlockMachine Demo` through the installed export server (303 files, 73 display objects, 419 tags); authored a new display + scaffold (7 objects, 8 operations) into `edited-BlockMachine-Demo` (78 files incl. `Displays/Arya OEE Overview.xml` + `BatchImport_…xml` + tags CSV); preflight ready (3 files differ, 0 blockers); vendor `SEAddComponent` import succeeded ("Import completed successfully", `.gfx` 8,192 B); `ftview_verify_import` **1/1 display match, staged objects all landed, 87 vendor defaults normalised** | `tmp/ftview-e2e/` (exports, edited export, component package, `$AddComponent.txt`), `tmp/ftview-verify-import4.log` |
| RSLogix 500 12.00 (installed) | Opened `IC500DMO.RSS`; Save As copy with Export database + external files produced `.RSS` 49,152 B, `.EAS` 23,623 B, `.ERP` 1,422 B (`.EIC`/`.ESG` empty); Save As Library + Export SLC Format produced `IC500DMO_Lib.SLC` 18,800 B (real APS dialect, 569 lines); the installed bundle's `slc500_open` parses it — 5 program files, 68 rungs, 3 I/O modules, timer `PRE 80 ACC 7`, N7 11/22/33, I/O census — and `slc500_database` parses the real `.EAS` (325 rows, symbols/descriptions) and `.ERP` (rung rows skipped, warning) | `tmp/slc-e2e/` (`IC500DMO_Copy.*`, `IC500DMO_Lib.SLC`, `installed-e2e-results.json`), `tmp/slc-e2e/evidence/aps-parse.json` |
| RSLogix 5 10.00 (installed) | Created and saved a real project `E2E_PLC5.RSP` (81,920 B, PLC5/40, Save As through the installed application); with RSLogix 5 closed, the installed bundle's PLC-5 tools read it headlessly — `plc5_open` "3 program files (1 ladder), 1 rungs, 255 symbols, 9 data files, read headlessly by RSLogix 5 10.00.00.00"; `plc5_processor` "Processor code 6 series 0, 49152 words"; `plc5_ladder` `END{ } ;` | `tmp/rslogix5/E2E_PLC5.RSP`, `tmp/rslogix5/installed-e2e-results.json`, `tmp/plc5-lossless-check.mjs` |
| FactoryTalk Optix Studio 1.8.1.27 | Application project copy of `AryaSMTLineDemo`; `StudioMCPBridge` NetLogic → Execute StartBridge (security warning → Proceed), bridge 1.0.9 listening on 127.0.0.1:8768; `optix_status` available with authoring/destructive/invoke true; `optix_build status` (29 sources, DLL 252,928 B, built); `optix_project census` 37 files/6,533 nodes; `optix_read` map/node; `optix_screen` dry-run 197 operations, then applied 203 objects for `UI/Screens/DSH E2E Overview`; `optix_save` saved through Studio (Ctrl+S, `needs_save` 0); `optix_emulator start` served the project; the rendered page shows the authored screen — OEE 0.9, Run state lamp green, Total units 539, Units per hour 50,400 | `tmp/optix-e2e/` project copy, `tmp/optix-e2e/evidence/optix-authored-screen-live.png` + `.json`, `tmp/optix-author-e2e2.log`, `tmp/optix-runtime-e2e.log` |
| Dev AryaCode UI | Booted the installed profile's web host (`dsh --profile verify-0104e --no-open --port 0`); Plugins shows the bundle enabled; Components "9 total · 7 running · 2 off"; toggled slc then plc5 on ("9 total · 9 running") and back off; Skills lists the eight shipped skills | `tmp/dev-ui-0104e-*.png` |
| RSLogix 500 `.RSS` automation read | The COM class is registered, but no transcript proves the session and the edition is unrecorded | `slc500_open` answers `NOT_LICENSED` with the export-text/record-transcript fix — **not-runnable**, see below |

### Not runnable on this host — three-state evidence, never "pass"

`docs/decisions/verification-evidence.md` defines the rule: a check is `pass`, `fail`, or
`not-runnable`; **not-runnable is never recorded as a pass** and needs substitute evidence.

| Item | State | Substitute evidence recorded |
| --- | --- | --- |
| MotionWorks IEC compile / profile / live | **not-runnable** — the IDE is not installed | `mw_ide_status` answers `NOT_INSTALLED` (7 probed locations, known line 3.0.3–3.7.5); `test/mwi-idefree.spec.mjs` 10/10 and the package `vitest` suite prove the IDE-free logic with a stub host/help tree. |
| ECAD product / live AryaCAD bridge | **not-runnable** — component retired; no AryaCAD surface on this host | The row, 12 tools and skill are removed; the DXF/DWG drawing preview face still builds and mounts; the bridge's live path is not claimed anywhere. |
| SLC 500 `.RSS` automation read | **not-runnable** — automation class registered, but no recorded transcript and the edition is unrecorded | `slc500_open` reads a text/Library export end to end; `.RSS` returns `NOT_LICENSED` with the export-text/record-transcript fix. |
| PLC-5 `PC5 EXPORT` text path | **not-runnable** — RSLogix 5's UI/export tools do not write that document on this host (IMPEXP5.EXE is 16-bit; no `.PC5` fixture) | The headless COM read of a real `.RSP` is proved; the text tools stay parser/unit-tested only. |
| FTView imported display in the Studio tree | **not-run** — the imported display appears as an unnamed tree row (UIA name blank) and an OCR/find search cannot select it | The import itself is proved object-for-object by `ftview_verify_import` (1/1, 87 defaults normalised). Candidate fix recorded: write display-name metadata so Studio labels the new display. |
| Ten scripted tasks per product on a weaker model | **not run** — no weaker-model harness in this environment | Tool-level drills for every product were recorded here instead; the owner/agent walkthrough remains the intended check. |
| Desktop Electron window and refreshed Plugins screenshots | **not run** — composition booted through the CLI/web probe path | The installed tarball's composition is proved; `docs/images/dev-components*.png` are still 0.102.0 screenshots. |
| Publish / tag / market catalogue | **run on 2026-11-23, on the owner's request** | `pnpm publish --no-git-checks` → "✅ Published package @aryacode/dsh-engineering@0.104.0"; `v0.104.0` tagged at the release commit `7fbf495` and pushed with `main`; the tag push made the GitHub Release (body = this version's changelog section, 22,660 chars); `node ../dsh-arya-market/scripts/release-plugin.mjs --skip-build --skip-tests` → "released @aryacode/dsh-engineering@0.104.0 · npm ok · catalogue ok · sha256 67d2e5866587". The registry lagged as documented (packument 404 for ~6 min, the tarball URL ~14 min); the script's github step warned `HTTP 422 Release.tag_name already exists`, which is the release the tag push had already created. No version was bumped. |

## Known gaps

- Every component is `beta`; each `components.json` `stabilityNote` records what is not proved.
- The 32 vendored Optix tools are not in the generated reference; the Optix pages own them.
- `CHANGELOG.md` still carries pre-overhaul mojibake in historical entries;
  `scripts/repair-encoding.mjs` declines the file, so it is left as written.
- The GitHub Releases before this overhaul have no changelog body; only releases cut from a
  `v*` tag after the release workflow exists will.
- `docs/images/dev-components.png` and `docs/images/dev-components-rows.png` are from the 0.102.0
  install and need a re-shoot on a Dev host running the current payload.
- The FTView imported display renders as an unnamed tree row in Studio 15.0; the import is proved by
  comparison, but the display-name metadata that Studio uses for the tree label is not written yet.
- PLC-5 has no positive `.PC5` text-export fixture; the text tools are parser-tested only. The
  headless COM read is proved with a real `.RSP`.
- Studio's **Import Rungs** route is attended-verified on the generated `LadderReliability` project
  for both a single-rung and a two-rung export (`l5x_export_rungs`): Import Configuration read the
  counts as Imported Rungs: 1 and 2, applied them, and Studio **Verify** reported 0 errors. On
  2026-11-22 the multi-rung operation appended the imported rungs after the selected rung rather than
  replacing it, so the superseded rung had to be deleted before the clean verify; the behaviour is
  documented on the offline-editing page and in evidence `tmp/ladder-e2e/evidence/README.md`. The
  routine-target **Import Routine** route was attended-verified on the same project: Operation
  Overwrite, Studio Verify 0 errors/0 warnings, and a re-export matching the applied draft.
  `l5x_export_rungs` also returns each rung's `paste_text`; plain-text Ctrl+V does not create rungs in
  Studio 37.05, so the file remains the import path. The whole instruction catalogue (43 rungs, 32
  typed tags: timers, counters, compares, arithmetic/moves, bitwise, latches/one-shots, strings,
  JMP/LBL) was imported through Import Routine and verified with 0 errors; the one warning is the
  intentional AFI rung. That pass found and fixed two writing defects: a zero-operand instruction lost
  its parentheses (`AFI()OTE(...)` became `AFIOTE(...)`), and a component export with no
  `Controller MajorRev` fell back to pre-v36 mnemonics that Studio v37 refuses. Online
  Pending/Accepted/Finalized import against a live controller was not run (no controller on this
  host), and older Studio versions cannot be executed here.
- The corrected structure-family content passed the Studio GUI on 2026-11-22 once the desktop was
  free: **Import Routine** on a generated `LadderReliability` project with Operation Overwrite,
  Import Configuration read `Number of Rungs: 22`, and Studio **Verify** reported
  `Complete - 0 error(s), 0 warning(s)` (evidence
  `tmp/ladder-e2e/evidence/struct-gui-verify-top.png` and `struct-gui-verify-0-errors.png`). The full
  24-rung routine (including PID, `SBR`/`RET` and the JSR call) was imported and built by the Logix
  Designer SDK with `Offline build passed; 0 blocker(s)`, 0 import warnings and 0 import errors. Two
  residuals are honest: Studio's GUI Verify wants explicit optional-argument placeholders in the PID
  instruction (the catalogue treats the master-loop/inhold operands as optional), so the GUI file
  leaves PID to the SDK build; and a `SubRoutine` whose first rung holds only `SBR` reports
  "Missing output instruction" in this import path, so the GUI file omits the subroutine and the
  JSR that calls it. `StructProof-main-rungs.L5X` and `StructProof-sub-rungs.L5X` remain under
  `tmp/ladder-e2e/` if the PID/SBR shapes are revisited.
- SLC 500's `.RSS` automation path needs a recorded transcript (and a Professional/Developer
  edition) before it can be called proved; the text-export/Library and documentation-export paths
  are proved against the installed RSLogix 500.
- MWI's compile/profile/live paths need a machine with MotionWorks IEC 3 Pro installed.
- Dense retrieval v2 was deliberately not added; v1 is lexical BM25 + exact identifiers only.

## Picking it up

1. `git switch main`, `pnpm install`, `pnpm -r build`.
2. `pnpm test` — needs a full-access shell because the runner spawns one process per spec; set
   `HANDBOOK_PYTHON` to the bundled Python if the handbook determinism check should run.
3. Regenerate/verify what the tests check when behaviour changes: `pnpm docs:tools`,
   `pnpm docs:check`, `pnpm resources:build`, `pnpm knowledge:sync` and
   `node scripts/eval-knowledge.mjs --check`.
4. Install into the Dev home when testing the release: pack with
   `pnpm pack --pack-destination artifacts`, create a profile under
   `%LOCALAPPDATA%\AryaCode-dev\home\profiles\`, point its `@aryacode/dsh-engineering`
   dependency at the tarball, `pnpm install --prefer-offline --ignore-scripts`, then boot the
   profile. Never modify the installed AryaCode (`%LOCALAPPDATA%\Programs\AryaCode` or
   `~/.aryacode`); read only.
5. **Shipped on 2026-11-23.** The owner said ship: the unreleased entries were folded under
   `## 0.104.0 — 2026-11-23`, `pnpm test` / `-r build` / `assemble` / `check:package` were run, the
   package was published, `v0.104.0` was tagged at the release commit `7fbf495` and pushed, and the
   market catalogue step recorded the registry copy's sha256. Versions are immutable — never
   republish or bump to work around registry lag.
6. The installed-software drivers live under `AryaCode\tmp\` in the harness checkout and are not
   part of the bundle: `studio-e2e-full.mjs`, `ftview-e2e.mjs`/`ftview-author-e2e.mjs`/
   `ftview-verify-import.mjs`, `slc-installed-e2e.mjs`/`slc-real-check.mjs`, `plc5-installed-e2e.mjs`,
   `optix-e2e-run.mjs`/`optix-author-e2e.mjs`/`optix-runtime-e2e.mjs`, `release-0104-smoke.mjs` (the
   packaged release smoke on the published payload), `dev-ui` screenshots and a
   `verify-0104*` Dev profile.
