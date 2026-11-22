# Handoff

The bundle after the 0.104.0 knowledge-and-legacy batch. This file is the current state:
version, what the batch changes, what was verified and how, what could not be run on this
host, and the next step. History belongs to [CHANGELOG.md](CHANGELOG.md), not here.

## Right now

| | |
| --- | --- |
| Branch | `main`; this batch is one local commit (the commit that contains this file). No tag, no publish, no market step. |
| Version | **0.104.0** — `package.json` and the `## 0.104.0 — 2026-11-22` heading in `CHANGELOG.md`. |
| Release state | **Verified locally and committed; not published and not tagged.** Publishing happens only when the owner asks to ship. |
| Tarball | `artifacts/aryacode-dsh-engineering-0.104.0.tgz` — 5,267,841 B packed, SHA256 `732086063C7C1BADCD5232EE4CBA7AC5F2191F63DE7B276AFDFF77084A8B4766`, SHA1 `966B25B89673AF156A5153CA1B84B44E937C84D4`; `check:package` reports 21.6 MiB in 1,094 files unpacked. |
| Surface | 9 component rows: **7 ship on, 2 off** (`plc5`, `slc`). **198 registered tools**, **173 default-on**, 8 skills, 6 product documents. |
| Generated reference | `docs/reference/tools.md` and `tools.json`: **166 tools** in 23 groups (the 32 vendored Optix tools are not generated). |
| Context budget | **173 tools / 135,251 schema characters** — measured 130,049 + 4% (L5X 53,718 + FTView 45,544 + MWI 18,488 + resources 1,474 + migration 10,825). |
| Verified | `pnpm test` **79/79 spec files pass** (48,343 ms on this tree); `pnpm docs:check`, `pnpm check:package`, `node scripts/eval-knowledge.mjs --check`, `node scripts/sync-knowledge-lib.mjs --check` all green; clean Dev profile boots the installed tarball with 173 tools and the designed nine rows. |
| ECM-software reality | MotionWorks IEC is not installed on this host, and the ECAD product was retired. Those paths are **not-runnable**, never pass — see the table below. |

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
  All 55 L5X tools now carry the `l5x_` prefix — **50 renamed, 5 already prefixed**, no aliases;
  the migration table is in the 0.104.0 changelog section.
- **FTView knowledge.** Authored ME pages (9) plus structural indexes of the installed ME and SE
  help (1,544 and 2,603 pages) behind `ftview_docs`.
- **Migration and PLC-5 knowledge.** `migration_docs` (15 authored pages) and `plc5_docs`
  (9 pages); six new read-only PLC-5 text tools — `plc5_pc5`, `plc5_verify`,
  `plc5_instruction_inventory`, `plc5_rung_digest`, `plc5_indirect_census`, `plc5_diff` — so
  PLC-5 is 15 tools, off by default.
- **New RSLogix 500 row (`slc`).** Ten read-only `slc500_*` tools (`capabilities`, `open`,
  `ladder`, `find`, `io_census`, `io_config`, `data_read`, `processor`, `database`, `docs`),
  skill `rslogix-500`, ships **off**. Text exports and `.SLC` exports are read offline; `.RSS`
  through the automation server is honest about not being proved (`NOT_LICENSED`/`SOURCE_NOT_INSTALLED`).
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

## Verified, and how

All commands below were run on this tree; the tree then carried the evidence into this commit.

| Area | Command / evidence | Result |
| --- | --- | --- |
| Suite | `pnpm test` (with `HANDBOOK_PYTHON` set to the bundled Python) | **79 file(s) passed in 48,343 ms**; includes knowledge core/packaging, per-product knowledge, legacy, MWI IDE-free, SLC and handbook specs. |
| Generated docs | `pnpm docs:check` | `gen-tool-reference: reference is up to date.` / `gen-print-css: docs/print.css is up to date.` |
| Packaging | `pnpm check:package` | `the tarball is conforming`; PKG-06 21.6 MiB in 1,094 files; largest entries the ECAD wasm (6.11 MiB) and the L5X/optix indexes. |
| Knowledge eval | `node scripts/eval-knowledge.mjs --check` | **all products pass**, determinism true, no problems. |
| Retrieval figures | `artifacts/eval-knowledge.json` | L5X 32 cases R@5 .957 / MRR .891 / nDCG .900 (p95 43.7 ms); FTView 23 .933/.967/.942 (18.5 ms); migration 25 1/.972/.979 (3.3 ms); PLC-5 22 1/1/.991 (2.0 ms); SLC 22 1/.817/.864 (1.3 ms). Exact share 1, no-match 1, hit cap true, determinism true. |
| Knowledge sync | `node scripts/sync-knowledge-lib.mjs --check` | Current; 5 consumers byte-equal to `packages/knowledge/src`. |
| Generators | l5x/ftview/migration/plc5/slc knowledge generators `--check` | All current; two clean L5X runs byte-identical (5,493 v37.05 pages + 6,581 v36.00 pages, 328 mnemonics). |
| Handbook | bundled Python + `scripts/gen-handbook.py`, then `--check` | 15 pages; docx/html/pdf regenerated; source hash `105186b902a2f2ae`; check ok. |
| Clean install | fresh Dev profile `verify-0104b` from the 0.104.0 tarball | Boots: **173 tools**; engineering 170 = `engineering_` 2 + `ftview_` 52 + `l5x_` 55 + `migration_` 6 + `mw_` 24 + `optix_` 31; nine rows — l5x, ftview, mwi, viewers, engineering-resources, migration, optix `active`, plc5 and slc `disabled`; `l5xProjects` provided and the five sample `l5x_*` names executable. |
| Changed-tool packaged smoke | from the installed profile, on `packages/l5x/test/fixtures/sample.l5x` | `l5x_open_project` parsed the project (rev 33.1/export 33.00; 1769-L33ER; 2 programs, 19 tags, 3 routines, 3 modules); `l5x_run_checks` 3 INFO findings; `l5x_docs search` 91 hits with `instruction-ton` first; `l5x_document_project` wrote 3 files (5 rung comments, 11 rungs). |
| Cross-product | installed profile | `ftview_capabilities` (6 applications, schemas 1–16) and `ftview_docs` (38 hits, authored export-import first) work; `migration_assess` on the L5X sample succeeds (3 modules, 0 findings) and `migration_docs` searches; `slc500_open`/`ladder`/`docs` work on a text export; `plc5_docs` searches; `optix_status` reports the local bridge/Studio unavailable honestly; `mw_ide_status` reports `NOT_INSTALLED` honestly. |
| Upgrade / rollback (N-1) | 0.103.0 tarball (`npm pack @aryacode/dsh-engineering@0.103.0`, 4,763,737 B) → 0.104.0 local tarball, then back | 0.103 composition: 170 tools, legacy L5X names, `ecad` row present/disabled, no `slc` row. Update: 990 ms `pnpm install`, 173 tools, all 55 names prefixed, `entries/ecad.js` absent, `vendor/ecad` viewer payload + L5X knowledge present, nine rows. Rollback: 170 tools and the 0.103 composition. Profile finally left on 0.104.0. |
| No-vendor source | installed profile with `L5X_HELP_ROOT_V37_05`/`V36_00` = `Z:/no-such-help-root` | `l5x_docs read` of `help/clinset/timer-counter/timer-on-delay--ton-` returns `SOURCE_NOT_INSTALLED` naming the searched root; with the real install the same read returns the real TON page body. Structural `search`/`status` still answer from the shipped index — by design. |
| Offline / no-network | static grep over the knowledge core, five `docs.ts` adapters and the eval script | No `fetch`, `node:http(s)`, `axios`, `child_process`, `net.connect` or `WebSocket`; the eval is local only. |
| Licensing | NOTICE/README/`docs/reference/knowledge.md` | MIT posture: authored pages ship; the installed-help bodies are parsed from the user's own installation at read time and are never in the tarball. |

### Not runnable on this host — three-state evidence, never "pass"

`docs/decisions/verification-evidence.md` defines the rule: a check is `pass`, `fail`, or
`not-runnable`; **not-runnable is never recorded as a pass** and needs substitute evidence.

| Item | State | Substitute evidence recorded |
| --- | --- | --- |
| MotionWorks IEC compile / profile / live | **not-runnable** — the IDE is not installed | `mw_ide_status` answers `NOT_INSTALLED` (7 probed locations, known line 3.0.3–3.7.5); `test/mwi-idefree.spec.mjs` 10/10 and the package `vitest` suite 81/81 prove the IDE-free logic with a stub host/help tree. |
| ECAD product / live AryaCAD bridge | **not-runnable** — component retired; no AryaCAD surface on this host | The row, 12 tools and skill are removed; the DXF/DWG drawing preview face still builds and mounts; the bridge's live path is not claimed anywhere. |
| PLC-5 live COM read | **not-runnable** — RSLogix 5's automation server is not registered (`powershell32` present, COM server absent) | Read-only text tools are covered by the package tests and negative drills. There is no real `.PC5` export fixture in the repo, so the positive `.pc5` text path is proved at parser/unit level, not live. |
| SLC 500 `.RSS` automation read | **not-runnable** — automation class registered, but no recorded transcript and the edition is unrecorded | `slc500_open` on a text export works end to end; `.RSS` returns `NOT_LICENSED` with the export-text/record-transcript fix. |
| FTView attended import round-trip | **not run** — needs an attended Studio import step | `ftview_capabilities` reports `import requires studio`; the authored FTView corpus records the measured export and the attended rules. |
| Ten scripted tasks per product on a weaker model | **not run** — no weaker-model harness in this environment | Tool-level drills for every product were recorded here instead; the owner/agent walkthrough remains the intended check. |
| Desktop Electron window and refreshed Plugins screenshots | **not run** — composition booted through the CLI/web probe path | The installed tarball's composition is proved; `docs/images/dev-components*.png` are still 0.102.0 screenshots. |
| Publish / tag / market catalogue | **not run** — owner-only | This batch is local and uncommitted to the registry; release is a separate, explicit request. |

## Known gaps

- Every component is `beta`; each `components.json` `stabilityNote` records what is not proved.
- The 32 vendored Optix tools are not in the generated reference; the Optix pages own them.
- `CHANGELOG.md` still carries pre-overhaul mojibake in historical entries;
  `scripts/repair-encoding.mjs` declines the file, so it is left as written.
- The GitHub Releases before this overhaul have no changelog body; only releases cut from a
  `v*` tag after the release workflow exists will.
- `docs/images/dev-components.png` and `docs/images/dev-components-rows.png` are from the 0.102.0
  install and need a re-shoot on a Dev host running the current payload.
- PLC-5 has no positive `.PC5` text-export fixture; the text tools are parser-tested only.
- SLC 500's `.RSS` automation path needs a recorded transcript (and a Professional/Developer
  edition) before it can be called proved; the text-export path is proved.
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
5. The batch commit is the release candidate. When the owner says ship, follow the release
   section of [AGENTS.md](AGENTS.md): `pnpm test`, `pnpm -r build`, `pnpm assemble`, `pnpm publish`,
   tag `v0.104.0`, wait for the registry, then run the market catalogue step. Do not bump the
   version for a registry-lag 404/409.
