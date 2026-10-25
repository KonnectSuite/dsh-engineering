# AryaCode Engineering

**One bundle for automation-engineering work in AryaCode.** Studio 5000 L5X, FactoryTalk View ME,
MotionWorks IEC and FactoryTalk Optix sit behind a single install, one row per surface. A row is the
switch: disable it and that plugin unloads, so its tool schemas leave the request.

`@aryacode/dsh-engineering` · 79 tools · 16 rows · 4 products · MIT

---

## Why a bundle

A general assistant pays for every tool schema on every request. An automation engineer needs deep
surfaces — reading a 3 MB L5X, comparing two projects, staging ladder edits, talking to a controller —
but only one or two of them at a time.

This bundle splits those surfaces into independently switchable rows. The expensive ones are off by
default, so a read-only profile pays for the read tools and nothing else:

| Row | Default | What a disabled row removes |
|---|---|---|
| `l5x-editing` | off | the nine `draft_*` schemas |
| `l5x-studio` | off | the Logix Designer SDK and supervised controller schemas |
| `l5x-live` | off | the EtherNet/IP polling and trend schemas |
| `mwi-edit` | off | the seven MotionWorks edit schemas |

The previews are independent of the tools — switching L5X tools off does not remove the ladder viewer.
Both previews mount from **one** row (`viewers`), because a package registers exactly one browser
bundle.

## What it supports

| Product | Tools | Default | Needs |
|---|---|---|---|
| **Studio 5000 L5X** | 35 | read on; edit, Studio, live **off** | Node for offline reads; Studio 5000 + Logix Designer SDK for SDK work; a controller for live |
| **FactoryTalk View ME** | 14 | all on | Node for an export folder; FactoryTalk View Studio ME for discovery and the handoff |
| **MotionWorks IEC** | 24 | session, read, verify on; edit **off** | MotionWorks IEC 3 Pro installed; verified against 1.19 |
| **FactoryTalk Optix** | 6 | on | Optix Studio installed |

Tool groups, by product:

- **L5X** — 11 read (`open_project` … `compare_projects`), 9 staged drafts (`draft_*`), 6 Logix
  Designer SDK, 7 supervised controller, 2 live EtherNet/IP
- **FactoryTalk View** — 6 read, 5 staged edits, 3 Studio handoff
- **MotionWorks IEC** — 7 session, 7 saved-project reads, 3 verify, 7 staged edits
- **Optix** — 6 tools, unlinked to a skill until one exists

## Switches

A row is a plugin. Disabling it in the profile (or on the Plugins page) unmounts that plugin and its
tool schemas stop being sent; the guidance skill keeps its own row so reading guidance and reading
tools switch separately.

| Row | Surface | Default | Why the default |
|---|---|---|---|
| `l5x-read`, `l5x-read-skill` | offline reads, checks, comparison + guidance | on | cheap and safe |
| `l5x-editing` | nine staged `draft_*` tools | **off** | a read-only profile should not pay for them |
| `l5x-studio` | Logix Designer SDK and supervised controller | **off** | needs Studio 5000 installed |
| `l5x-live` | EtherNet/IP polling and trends | **off** | needs a controller address |
| `viewers` | ladder + ME display previews | on | adds no model context |
| `ftview-read`, `ftview-read-skill`, `ftview-edit`, `ftview-studio` | FactoryTalk View ME read, edits, Studio handoff | on | small enough to default on |
| `mwi-session`, `mwi-read`, `mwi-read-skill`, `mwi-verify` | MotionWorks IEC session, reads, verify + guidance | on | — |
| `mwi-edit` | seven staged MotionWorks edits | **off** | the largest schemas in the bundle |
| `optix` | FactoryTalk Optix Studio authoring | on | separate component package |

**No capability policy.** Earlier releases also carried a per-skill tool filter (`policyOnly` /
`toolPolicy`) that gated tools by skill state. That filter is an AryaAI harness feature and is **not
part of this product line** — `@deepseek-ai/dsh-tool-skill` here has no such config. Rows are the
switch. Do not re-add a patch entry that targets another bundle's row: composition fails when the row
is absent, and that is what made 0.4.0 and 0.4.1 uninstallable.

The reference in [docs/reference/tools.md](docs/reference/tools.md) is generated from the registered
definitions, and `pnpm test` fails when the committed reference drifts.

## Status

Where each surface actually stands, based on what has been exercised.

**Working and verified**

- L5X offline reads, references, usage, checks and comparison against revision 19+ projects
- Staged L5X editing — nine `draft_*` tools, validation, and one new file on apply
- Logix Designer SDK: a real ACD exported to a 3.0 MB L5X against SDK v37
- Supervised controller access — upload, mode change and download behind per-call approval, with
  downloads accepting only a verification id produced by a passed build
- Live EtherNet/IP reads and a bounded PLC trend
- FactoryTalk View ME: export reads, structural checks, comparison, staged display and HMI tag edits
- MotionWorks IEC: verified live against 3 Pro 1.19 — stage, start, worksheet, close, saved-project
  reads, compile diagnostics, code replacement, declaration add, POU create/delete, block insertion
  and a POU package export/delete/import round trip
- Ladder viewer and FactoryTalk View display preview

**Deliberately off by default** — enabled per profile: `l5x-editing`, `l5x-studio`, `l5x-live`,
`mwi-edit`. A read-only profile should not pay for nine draft schemas or a controller surface.

**Known limits** — stated in the bundle, not hidden:

- Live reads and SDK builds cannot establish that online logic matches the export; every result says
  so in `coverage`
- FBD/SFC semantics are not exercised
- FactoryTalk View Studio work is a **manual handoff**: the bundle plans the import and preflights
  changed files, it does not import
- Optix has no skill, so its 6 tools cannot be switched off

**Not in this repository** — CAD mounts as an independent plugin.

## Milestones

| Version | What landed |
|---|---|
| **0.4.0** | Both previews fold into the bundle's own client face — one package, one browser bundle, 16 rows |
| **0.3.0** | FactoryTalk Optix becomes a bundle component; 79 tools total |
| **0.2.0** | MotionWorks IEC ports into the bundle — 24 tools over the COM bridge and saved-model engine, verified live; edit off by default |
| **0.1.2** | Harness filesystem contract fixed across L5X and FactoryTalk View; every L5X tool linked to its capability by name; generated tool reference, examples and architecture docs |

## Install

The bundle carries its components (`vendor/`), its own browser face (both previews) and the rows.
Installing a component on its own gives you tools **without** the rows that switch them.

```sh
# in the AryaCode profile
pnpm add @aryacode/dsh-engineering
```

```jsonc
// profile package.json
"dsh": { "profile": { "bundles": ["@aryacode/dsh-engineering"] } }
```

Then, in the application, the **Engineering** card lists each row as a component. Per-row enable state
lives in the profile, so disabling a row survives the next update.

For development, clone this repository, `pnpm install`, and link it into a profile bundle list; the
development home mounts the same rows.

## How it composes

The bundle adds one loader layer after the Web app: it **inserts** its own rows and never touches a row
another bundle owns.

```mermaid
flowchart TB
  Profile["Profile bundle list"] --> Bundle["@aryacode/dsh-engineering"]
  Bundle -->|insert| L5XRead["l5x-read (on)"]
  L5XRead --> L5XSkill["l5x-read-skill (on)"]
  Bundle -->|insert| L5XEdit["l5x-editing (off)"]
  Bundle -->|insert| L5XStudio["l5x-studio (off)"]
  Bundle -->|insert| L5XLive["l5x-live (off)"]
  Bundle -->|insert| Viewers["viewers (on) — ladder + ME display previews"]
  Bundle -->|insert| FTV["ftview-read / edit / studio (on)"]
  Bundle -->|insert| MWI["mwi-session / read / verify (on), edit (off)"]
  Bundle -->|insert| Optix["optix (on)"]
```

Row ids are stable. Profiles and patches address these ids, so per-row enable state survives upgrades
even when the implementation behind a row is replaced.

| Row id | Package entry | Default |
|---|---|---|
| `l5x-read` | `dsh-engineering-l5x` | on |
| `l5x-read-skill` | `dsh-engineering-l5x/skill` | on |
| `l5x-editing` | `dsh-engineering-l5x/editing` | off |
| `l5x-studio` | `dsh-engineering-l5x/studio` | off |
| `l5x-live` | `dsh-engineering-l5x/live` | off |
| `viewers` | `@aryacode/dsh-engineering` (its own client face: ladder + ME display previews) | on |
| `ftview-read` | `dsh-engineering-ftview` | on |
| `ftview-read-skill` | `dsh-engineering-ftview/skill` | on |
| `ftview-edit` | `dsh-engineering-ftview/edit` | on |
| `ftview-studio` | `dsh-engineering-ftview/studio` | on |
| `mwi-session` | `dsh-engineering-mwi` | on |
| `mwi-read` | `dsh-engineering-mwi/read` | on |
| `mwi-read-skill` | `dsh-engineering-mwi/skill` | on |
| `mwi-verify` | `dsh-engineering-mwi/verify` | on |
| `mwi-edit` | `dsh-engineering-mwi/edit` | off |
| `optix` | `@aryacode/dsh-tool-ft-optix` | on |

## Safety

- **Read-only by default.** Reading, checks, comparison and the viewers never change a controller.
- **Edits write new files.** `draft_apply` writes one new L5X beside the source and refuses to
  overwrite; `ftview_apply` writes a new export folder and leaves the source untouched. MotionWorks
  edits write only the staged copy and verify unrelated saved and native state.
- **Controller changes need a human.** Upload, mode change and download require per-call approval and
  a session policy that permits asking. The tools refuse before contacting a controller when approval
  is unavailable, and a download accepts only a verification id produced by a passed build.
- **No hidden vendor execution.** The FactoryTalk View Studio handoff returns a manual import plan; it
  does not run a vendor utility.
- **Coverage is stated.** Every result names what it cannot establish, including whether online logic
  matches the export.

## Requirements

| Surface | Needs |
|---|---|
| L5X read, references, checks, drafts | Node only; reads `.L5X` revision 19 or later |
| L5X Studio SDK | Studio 5000 with the Logix Designer SDK service, FactoryTalk Linx, .NET |
| L5X controller | Reachable controller, FactoryTalk Linx, a matching uploaded ACD |
| L5X live | A reachable controller over EtherNet/IP; no Studio, Linx or ACD |
| FactoryTalk View read, edit | Node only; a FactoryTalk View ME export folder |
| FactoryTalk View Studio | FactoryTalk View Studio ME for discovery and the manual import |
| MotionWorks IEC | MotionWorks IEC 3 Pro; the 32-bit COM bridge and the Python saved-model engine |
| Optix | FactoryTalk Optix Studio |

## Documentation

| Document | Owns |
|---|---|
| [Tool reference](docs/reference/tools.md) | Every tool, parameter and description (generated) |
| [Examples](docs/examples.md) | End-to-end sessions per product |
| [Architecture](docs/architecture.md) | Composition, row model, configuration, client faces, packaging |
| [L5X port](docs/port/l5x.md) | L5X port decisions and measurements |
| [FTView port](docs/port/ftview.md) | FactoryTalk View port decisions |
| [MotionWorks IEC port](docs/port/mwi.md) | MWI migration design, phases and inventory |
| [Packaging](docs/port/packaging.md) | How the bundle is packed and pinned |
| [Retirement](docs/port/retirement.md) | What "gone" means for a retired plugin |
| [Changelog](CHANGELOG.md) | Released and unreleased changes |

## Development

```sh
pnpm install
pnpm build:client  # regenerate lib/client.js from the committed face bundles
pnpm test          # patch, docs, tool-reference, manifest and client-face checks
pnpm docs:tools    # regenerate the tool reference from the registered definitions
pnpm docs:check    # fail if the committed reference has drifted
```

Tests run through `tsx` so they can read the TypeScript tool factories. A registered tool that no
skill governs fails the suite — the policy is a test, not a convention.

## Licence

MIT. See [LICENSE](LICENSE).
