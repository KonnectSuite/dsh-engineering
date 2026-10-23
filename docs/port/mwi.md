# MotionWorks IEC migration

How MotionWorks IEC becomes a component of this bundle. This is a **redesign**, not a port: the
legacy 63-tool surface is measured, mapped and retired, and the new package exposes a smaller,
intent-based surface with the same result contract, row model and per-product switch as the L5X and
FactoryTalk View products.

The machine-readable baseline is [mwi-inventory.json](mwi-inventory.json); the legacy-to-target
mapping is [mwi-mapping.json](mwi-mapping.json).

## Goal

Ship MotionWorks IEC as a component of `dsh-engineering`: one package, stable row ids, a typed tool
surface, its own skill, and the same installer and upgrade path as the other products. When the
redesign is mounted and verified, `dsh-tool-motionworks-iec` is retired under
[the retirement checklist](retirement.md) â€” unmounted, uninstalled and gone.

The product drives a running MotionWorks IEC 3 Pro IDE through a 32-bit COM bridge and edits the live
staged project. The bridge is implementation, not the API: the redesign keeps the proven bridge where
it exists and rewrites the surface above it.

## Why the legacy surface is replaced

Measured from `dsh-tool-motionworks-iec` 0.7.0 on 2026-10-23:

| Item | Value |
|---|---|
| Tools | 63 (`mw_*`), 58,008 schema characters |
| Families | IDE 32, code/analysis 29, project 1, workflow 1 |
| Source | 17 plain ESM modules, `index.js` 4,071 lines |
| Rows | `motionworks-iec-tools`, `motionworks-iec-skill` |
| Client face | none |
| Config | none |

The surface grew by accumulation: several tools answer the same intent through different layers
(saved files, IDE object model, compiler artifacts), parameter descriptions are inconsistent, and the
result shapes vary. The redesign collapses it to **24 intent tools across four working rows plus the
skills row**:

| Legacy | Target |
|---|---|
| 63 tools | 24 tools |
| 2 rows | 5 rows (session, read, verify, edit, skill) |
| Kept names | 3 |
| Folded into an intent | 55 |
| Retired | 2 |
| Delegated to the desktop companion | 3 |

The 55 folded tools do not disappear as capabilities; their behavior moves behind one intent. The
[mapping](mwi-mapping.json) lists every legacy tool, its disposition and its target.

## Status

- Phase 0 complete: the package scaffold, shared core, typed bridge boundary, rewritten skill and contract tests.
- Phase 1 complete and live-verified against MotionWorks IEC 3 Pro 1.19 on 2026-10-23: stage, start, status, worksheet and close ran against a copy of a real project in a temporary workspace. The trial prompt was answered, the staged project was open with `in_stage: true`, `Global_Variables` opened with unchanged modified state, and close reported `closed: true`.
- Phase 2 complete and live-verified on the same staged project: overview counts (1 POU, 76 globals, 201 types, 5 task rows), POU read, search, references, review with 0 blockers, and a reviewed-references help search all answered from the real saved model.
- Phase 3 complete and live-verified on the same staged project: compile state, a Build refusal with the vendor's exact task message, the Errors pane, a saved-source baseline, a matched comparison, and a graceful close.
- Phase 4 complete and live-verified on the staged project: code replacement, a verified local declaration add, POU creation and deletion, an inserted `R_TRIG` declaration and call, a POU package export/delete/import round trip, validation with no blockers, and a save through the IDE. All seven edit intents answer with accepted native verification.
- Next: Phase 5, flipping the rows into the bundle and retiring the legacy plugin.

## Target surface

Every row is a stable id. Rows inject the services they need, so a profile that disables editing never
mounts edit-only code.

| Row | Default | Tools |
|---|---|---|
| `mwi-session` | on | 7 |
| `mwi-read` | on | 7 |
| `mwi-verify` | on | 3 |
| `mwi-edit` | **off** | 7 |
| `mwi-skill` | on | the `motionworks-iec` guidance |

### `mwi-session` â€” project and IDE lifecycle

| Tool | Intent |
|---|---|
| `mw_project_find` | List workspace projects and the staged copy state |
| `mw_ide_status` | IDE presence, project identity, active view, modals and compile state |
| `mw_ide_start` | Start or attach the IDE, resolving trial and wrapper preconditions |
| `mw_project_stage` | Copy a workspace project into staging and verify the copy |
| `mw_project_open` | Open the staged project; refuse a stale wrapper and repair it with consent |
| `mw_worksheet_open` | Open one code or variable worksheet by saved identity and verify the active view |
| `mw_project_close` | Close the IDE project with explicit consent |

### `mwi-read` â€” live project model

| Tool | Intent |
|---|---|
| `mw_project_overview` | Summary: languages, counts, tasks, warnings and coverage |
| `mw_list` | POUs, variables, globals, types, tasks, libraries or blocks, filtered and paged |
| `mw_get` | One POU body with declarations, one type, task, block interface or I/O map |
| `mw_search` | Literal text across staged POU code |
| `mw_references` | Where one symbol is read or written across POUs |
| `mw_review` | Scope, type and bounds review, unsupported constructs, graphical listing |
| `mw_help` | Installed help and reviewed references, plus reference-index sync |

### `mwi-verify` â€” compiler verdict

| Tool | Intent |
|---|---|
| `mw_compile` | Make, Build, or report compile state |
| `mw_diagnostics` | IDE error list, mapped to documented causes |
| `mw_verify` | Baseline capture and saved/native state comparison for a staged change |

### `mwi-edit` â€” staged changes

| Tool | Intent |
|---|---|
| `mw_edit_code` | Replace one ST or IL body using an expected body hash |
| `mw_edit_variables` | Add, edit, delete or group one declaration through the native API |
| `mw_edit_structure` | Create, copy, rename, delete, convert or task-assign a POU |
| `mw_insert_block` | Insert one FB instance and its bound ST call |
| `mw_transfer_pou` | Export one POU package and import it into the staged project |
| `mw_validate` | Validate staged edits against the saved project before applying |
| `mw_apply` | Write through the IDE, save, and sync back with consent |

Editing defaults off, matching the L5X row split: a profile that only reviews a project must not pay
for edit schemas or risk a write.

### Retired and delegated

- `mw_ide_attach` retires; staging plus opening replaces direct attach, so a real project tree is
  never opened for editing.
- `mw_ide_edit_guide` retires; the guidance moves into the skill body.
- `mw_ide_dialog`, `mw_ide_trial` and `mw_ide_screenshot` delegate to the computer-use companion. The
  bundle does not bundle a desktop driver.

## Package structure

```
packages/mwi/
  package.json            exports: ".", "./skill"; dsh.component: true
  SKILL.md                rewritten for the new surface, model-invocable
  bridge/                 the proven PowerShell COM bridge and interop sources
  src/
    index.ts              session entry: the project service and session tools
    read.ts               read entry
    verify.ts             verify entry
    edit.ts               edit entry
    skill.ts              skill registration
    core/                 tool builder, params, result envelope, errors, bridge client
    model/                saved-file and native-model readers shared by tools
    tools/                session/, read/, verify/, edit/ implementations
  test/                   unit, contract, and live IDE fixtures
```

Each entry follows the bundle's plugin contract: `name`, `inject`, `Config` only where a limit is
deployment-varying, `apply`, and effects through `ctx.effect`. The session entry provides
`mwiProject`; the other rows inject it.

### Result and failure contract

Every tool returns `summary`, `data`, optional `coverage` and real `next` calls. Expected failures
return `code`, `message`, `fix` and optional `candidates`, matching the other products. The tools are
typed at their parameters; the open legacy result objects are tightened family by family, not changed
wholesale.

### What is reused and what is rewritten

- **Reused as implementation:** the PowerShell COM bridge and its generated interop sources, the
  workspace/staging path rules, the saved-hash guards, and the raw model readers where they are
  correct. They move under `src/` behind typed modules.
- **Rewritten:** the tool layer (24 intents instead of 63), parameter and result contracts, the bridge
  client, the skill, and the tests.
- **Not carried:** the legacy tool names, the direct-attach path, the edit-guide tool and the three
  desktop fallbacks.

## Requirements

- Windows; the entries do not register elsewhere.
- MotionWorks IEC 3 Pro installed and licensed (or the vendor trial), running for operations that need
  the IDE.
- Python 3 for the read engine; Arya's bundled interpreter is discovered, `MW_PYTHON` overrides it.
- Windows 32-bit PowerShell and the installed vendor automation components for the COM bridge.
- A computer-use companion for desktop-only operations; the bundle does not own it.

## Phases

Each phase ends with its contract tests passing and a real-IDE smoke on a disposable workspace.

### Phase 0 â€” core and skill

Create `packages/mwi` with the manifest, the shared tool core (params, result, errors), the typed
bridge client interface, the rewritten `SKILL.md` and the skill entry. No patch row yet; the legacy
plugin still registers the same skill.

Acceptance: package builds; skill registers with its budget test and non-Windows skip; the tool core
has unit tests; the legacy inventory and mapping are referenced by the package README.

### Phase 1 â€” session row

Implement `mwi-session`, the project service, staging, open/close consent, wrapper preflight and the
IDE state/status tools. This is the smallest set that proves the bridge from the new package.

Acceptance: on a disposable workspace, find â†’ stage â†’ open â†’ status â†’ worksheet â†’ close behaves as
specified; wrong-project, stale-wrapper, modal and duplicate-start refusals are exercised.

### Phase 2 â€” read row

Implement `mwi-read` over the shared model and bridge: overview, list, get, search, references,
review and help.

Acceptance: results match the legacy plugin on the fixture project for the same inputs, with the new
envelope; `coverage` states what the saved model cannot prove.

### Phase 3 â€” verify row

Implement `mw_compile`, `mw_diagnostics` and `mw_verify`; map exact compiler text to documented causes
and keep the baseline/verification hashes.

Acceptance: compile verdict and error text match the legacy plugin on the same source; a changed
source invalidates a baseline.

### Phase 4 â€” edit row

Implement the seven edit intents, the expected-hash guards, validate and apply, and sync-back consent.

Acceptance: a staged edit round trip (edit, validate, compile, save, sync back) passes on the
disposable fixture; a wrong hash or a changed source refuses before writing.

### Phase 5 â€” flip and retire

Add the five rows to `cordis.patch.yml`, remove the standalone plugin from the bundle template,
`apps/cli`, the authored inventory and the installer payload, and retire the legacy rows from profiles
under [the retirement checklist](retirement.md).

Acceptance: fresh and upgraded profiles expose the 24 tools and the skill from the bundle; the legacy
package is absent from the payload, the market catalog and the Plugins page; the packaged smoke calls
one read tool, one compile tool and one edit refusal.

## Verification

| Check | Phase |
|---|---|
| Skill budget, invocation and non-Windows skip | 0 |
| Tool core: params, envelope, error mapping | 0 |
| Session round trip and every refusal path | 1 |
| Read parity on the fixture project | 2 |
| Compile verdict and diagnostics parity | 3 |
| Edit round trip and hash guards | 4 |
| Packaged asar contains the package and bridge; smoke calls two tools | 5 |
| Policy coverage links every `mw_*` tool to `motionworks-iec` | 5 |
| Upgrade from the previous release with the legacy plugin installed | 5 |

## Decisions

1. **Model-invocable skill.** The new skill is model-invocable; `description` and `whenToUse` carry the
   workspace rule and the start order, as in the other products.
2. **Rows by surface.** Session, read, verify and edit are separate rows; edit is off by default.
3. **No legacy names.** The old tool names are not preserved. The legacy plugin remains installable
   until the flip, and the release notes name the new surface.
4. **Direct attach retired.** Staging plus opening is the only path; the temporary state cannot edit a
   real project tree.
5. **Desktop fallbacks delegated.** Dialog handling, trial selection and screenshots belong to the
   computer-use companion, not to this bundle.

## Risks

- **COM bridge regressions** are the dominant risk; the bridge is reused and proven in Phase 1 before
  editing exists.
- **Breaking the legacy surface** is intentional; it is announced in the release and covered by the
  upgrade test.
- **Windows-only gating** must compose cleanly on other hosts.
- **Installer size** grows by the bridge and interop sources; measure the payload delta at Phase 5.
- **Profile shadowing** applies as it did for 0.1.x: the upgrade test includes a profile carrying the
  standalone plugin.
