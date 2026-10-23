# MotionWorks IEC migration

How the MotionWorks IEC product moves from `dsh-tool-motionworks-iec` into this bundle, what is
reused, and the order the work lands in. The [tool reference](../reference/tools.md) will carry the
ported tools once they exist; this page owns the migration design.

## Goal

Ship MotionWorks IEC as a component of `dsh-engineering`: one package, stable row ids, its own
skills switch, and the same installer and upgrade path as the L5X and FactoryTalk View products. When
the port is complete the standalone `dsh-tool-motionworks-iec` plugin is retired under
[the retirement checklist](retirement.md), not left installed beside the bundle.

The product is not a text-export reader. It drives a running MotionWorks IEC 3 Pro IDE through a
32-bit COM bridge, edits the live project in place, and reads compiler verdicts. That makes the
migration a bridge-preserving port, not a parser rewrite.

## Current plugin

Measured from `dsh-tool-motionworks-iec` 0.7.0 on 2026-10-23; the machine-readable snapshot is
[mwi-inventory.json](mwi-inventory.json).

| Item | Value |
|---|---|
| Tools | 63 (`mw_*`), 58,008 schema characters |
| Loader rows | `motionworks-iec-tools`, `motionworks-iec-skill` |
| Tool families | IDE 32, code/analysis 29, project 1, workflow 1 |
| Node modules | 17 plain ESM files (`index.js` is 4,071 lines) |
| Bridge | 32-bit PowerShell COM bridge (`bridge/mw_bridge.ps1`), generated interop sources |
| Client face | none |
| Config | none; staging root derives from the calling workspace |
| Host requirements | Windows, MotionWorks IEC 3 Pro, Python 3, 32-bit PowerShell, a computer-use companion for flows without a native API |

The tools already declare the `{ schema, render }` output contract and have a registration contract
test that registers through a guard equivalent to `ctx.tools.register`. Those are the two failure
modes that bit the earlier ports; keep both.

## Target design

One package, `dsh-engineering-mwi`, mounted by two rows for parity with the current plugin:

| Row id | Entry | Default | Contributes |
|---|---|---|---|
| `mwi-tools` | `dsh-engineering-mwi` | on | All `mw_*` tools and the bridge lifetime |
| `mwi-skill` | `dsh-engineering-mwi/skill` | on | The `motionworks-iec` guidance |

Parity first: keep all 63 tools on one row, the same names, and the same two rows the old plugin
uses. Splitting the read and edit surfaces into separate rows is a follow-up decision; if it happens,
the new rows are added with new ids and `mwi-tools` keeps working so enable state survives.

The package declares `dsh.component: true`, ships its bridge under `bridge/`, and gates both entries on
`process.platform === 'win32'` exactly as the current plugin does. No client face is added.

### What is reused

- **The PowerShell bridge and its COM automation.** Rewriting a working 32-bit COM bridge in
  TypeScript is a regression risk with no context benefit. It moves into the package as a shipped
  asset with its generated interop sources. The Node side gets a typed client module instead of the
  current inline `spawn` calls.
- **The tool names and their safety invariants.** `mw_*` names are what the policy links and what
  users and prompts already reference; renaming them would break both. The invariants move verbatim:
  staging only inside the workspace, never opening a real project tree, no controller download and no
  motion command, IDE-first, explicit close consent, refusal before contacting COM when a dialog or
  minimized frame blocks the IDE.
- **The helper modules.** `verification`, `edit-session`, `native-*`, `pou-*`, `graphical-listing`,
  `compiler-interface`, `project-checkpoint`, `direct-attach`, `stage-copy` move under `src/` with
  types added at their boundaries as each phase touches them.
- **The skill body.** `SKILL.md` moves with its description and when-to-use text; the registration
  moves from `.js` to a typed entry.

### What is rewritten

- Tool definitions move to the engineering tool DSL with typed parameters and the shared result
  envelope (`summary`, `data`, `coverage`, `next` when a next call is real). The current 63 tools keep
  their open result objects; the port tightens one family at a time rather than changing all shapes at
  once.
- The bridge client, workspace/staging path handling and failure mapping become typed modules.
- The registration and schema tests are ported to the package's `pnpm test` and to the generated
  reference; the bundle's policy coverage test then enforces the `mw_*` link.

## Requirements

- Windows; the entries do not register on other platforms.
- MotionWorks IEC 3 Pro installed and licensed (or the vendor trial), with the IDE running for
  operations that need it.
- Python 3 for the read engine; Arya's bundled interpreter is discovered, `MW_PYTHON` overrides it.
- Windows 32-bit PowerShell and the installed vendor automation components for the COM bridge.
- A computer-use companion for operations without a supported native API. The bundle does not own
  that companion and cannot substitute for it.

## Phases

Each phase ends with its contract tests passing and a packaged-runtime smoke of the tools it adds.

### Phase 0 — scaffold and contract harness

Create `packages/mwi` with the package manifest, `SKILL.md`, the skill entry, the bridge assets, and
the ported registration contract: 63 unique names, every tool with `{ schema, render }`, parameters
inside the supported subset. Do not add a patch row yet; the standalone plugin still registers the
same skill.

Acceptance: `pnpm test` in the package passes on Windows and skips cleanly elsewhere; the inventory
matches [mwi-inventory.json](mwi-inventory.json).

### Phase 1 — bridge client and project discovery

Port the bridge client, workspace/staging paths, `mw_project_find`, `mw_ide_status`, `mw_ide_state`,
the attach/start/close rows, and the IDE-first and dialog refusals. This is the smallest set that
proves the bridge works from the new package.

Acceptance: on a disposable workspace in a running IDE, discovery, status, state and a refused
duplicate start behave as the current plugin; the close-consent path is exercised.

### Phase 2 — read and analysis

Port the 29 code/analysis tools: POU and variable reads, installed help, block interfaces, patterns,
reference and manual lookup, validation and diagnosis. These are the tools that work without editing.

Acceptance: the same inputs produce the same findings on the fixture project; `mw_ide_pous` and
`mw_ide_variables` agree with the current plugin's output.

### Phase 3 — IDE operations

Port make/build/compile state/errors/save/trial/screenshot and the worksheet-opening reads.

Acceptance: compile verdicts and error text match the current plugin on the same source; screenshots
and window-state evidence are captured.

### Phase 4 — editing and verification

Port the variable and code change tools, variable groups and structure, POU package/convert, FB
insertion, task tools, sync/rebind, and the verification and checkpoint flows.

Acceptance: a staged edit round trip (stage, open, edit, compile, save, verify) passes on the
disposable fixture, including the saved-hash guards and the preservation checks.

### Phase 5 — flip and retire

Add `mwi-tools` and `mwi-skill` to `cordis.patch.yml`, remove the standalone plugin from the bundle
template, `apps/cli`, the authored inventory and the installer payload, and retire
`motionworks-iec-tools`/`motionworks-iec-skill` rows from profiles under
[the retirement checklist](retirement.md).

Acceptance: a fresh profile and an upgraded profile expose the same 63 tools and the
`motionworks-iec` skill from the bundle; the old package is absent from the installer payload and the
market catalog; the packaged smoke calls one read tool and one compile tool.

## Verification

| Check | Phase |
|---|---|
| Registration: 63 unique `mw_*` names, every tool declares `{ schema, render }` | 0 |
| Parameters stay inside the supported JSON Schema subset | 0 |
| Bridge client round trip against the running IDE | 1 |
| Read results match the current plugin on the fixture | 2 |
| Compile verdict and errors match on the same source | 3 |
| Edit round trip preserves the saved project and passes the hash guards | 4 |
| Packaged asar contains the package and its bridge; smoke calls two tools | 5 |
| Policy coverage links every `mw_*` tool to `motionworks-iec` | 5 |

## Open decisions

1. **Skill invocation.** `SKILL.md` in the working tree drops `disable-model-invocation: true`. The
   port carries the model-invocable form only if the owner confirms it; the shipped 0.7.0 skill is not
   model-invocable.
2. **Row split.** Keep one tools row for parity, or split read from edit/IDE after the port. Split
   only with new ids and stable old ids.
3. **Companion dependency.** The current README says a computer-use companion is required for some
   IDE flows. The bundle's documentation must say which tools fail without it, and the tools must say
   so in their refusal.
4. **Python.** The host discovers Arya's interpreter or `MW_PYTHON`. Confirm the installer always
   provides one, or make the failure a documented refusal.
5. **Version.** The package starts at 0.1.0; the bundle release that first carries it becomes 0.2.0.

## Risks

- **COM bridge regressions** are the dominant risk; the bridge is preserved rather than rewritten, and
  Phase 1 proves it before any editing tool moves.
- **Windows-only gating** must be tested on non-Windows hosts so the bundle composes elsewhere
  without the tools or the skill.
- **Installer size** grows by the bridge and interop sources; measure the payload delta at Phase 5.
- **Profile shadowing** applies exactly as it did for 0.1.x: the upgrade test from the previous
  release must include a profile carrying the standalone plugin.
