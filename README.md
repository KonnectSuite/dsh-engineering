# AryaCode Engineering

**Automation-engineering tools, skills and file viewers for DeepSeek Harness.** One install gives an
agent the surfaces an automation engineer works in: Studio 5000 (L5X and ACD), FactoryTalk View ME,
FactoryTalk Optix, MotionWorks IEC 3, RSLogix 5 (PLC-5) reads, RSLogix 500 (SLC 500 and MicroLogix)
reads, SLC 500 / PLC-5 → Logix migration, and a read-only DXF/DWG drawing preview. DeepSeek Harness
ships as **AryaCode**; the two names are the same host and this page applies to both.

[![npm](https://img.shields.io/npm/v/@aryacode/dsh-engineering)](https://www.npmjs.com/package/@aryacode/dsh-engineering)
[![downloads](https://img.shields.io/npm/dm/@aryacode/dsh-engineering)](https://www.npmjs.com/package/@aryacode/dsh-engineering)
[![licence](https://img.shields.io/npm/l/@aryacode/dsh-engineering)](LICENSE)
[![Arya plugin market](https://img.shields.io/badge/market-Arya_Plugin_Market-2f6f4e)](https://github.com/KonnectSuite/dsh-arya-market)

**One bundle: 9 component rows · 198 tools · 6 products · every component is beta**

The bundle is one npm package with one install surface. Inside it, each product is a **row** on the
Plugins page: a row is a plugin, so switching one off unloads that product and its tool schemas stop
being sent with every request. The components are deliberately fine-grained — one per toolchain —
because that is how an engineer adopts them: Studio 5000 this week, Optix next month, the drawing
preview when a print arrives.

New here? Read [Getting started](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/getting-started.md),
then open the page for the product you have in front of you.

## What you get

| Product | Tools | Default | Stability | What it adds | Needs |
|---|---|---|---|---|---|
| **Studio 5000 L5X** | 55 | on | beta | Read, check, compare and document an L5X/ACD; stage ladder edits as a new file; optional Logix Designer SDK work; live EtherNet/IP reads and two approval-gated writes; `l5x_docs` over the authored corpus and the installed Studio help index, with revision guards | Node; a Logix Designer SDK only for SDK builds; a controller only for live |
| **FactoryTalk View ME** | 52 | on | beta | Read an ME export, run structural checks, edit displays, tags and objects, validate against the vendor schema, stage a Studio import handoff, and search `ftview_docs` | Node; FactoryTalk View Studio ME for discovery and the handoff |
| **FactoryTalk Optix** | 32 | on | beta | Read and author a loaded Optix Studio project through a bridge, draw operator screens, write and compile NetLogic C#, drive the emulator preview | Optix Studio; .NET 8 SDK for compile checks; Tesseract for OCR |
| **MotionWorks IEC** | 24 | on | beta | Operate a running MotionWorks IEC 3 Pro IDE on the real project files: read, edit, compile, diagnose, verify — and report honestly when the IDE is absent | MotionWorks IEC 3 Pro (3.0.3–3.7.5); nothing when it is absent |
| **SLC 500 and PLC-5 to Logix migration** | 8 | on | beta | Assess a legacy program, lint the `.L5K` the migration wizard writes, resolve its conversion markers, write the report a person signs off from, and search `migration_docs` | Nothing; reads `.RSS`/`.ACH`/`.RSP` or the `.SLC` export |
| **RSLogix 5 (PLC-5) program reads** | 15 | off | beta | Open a `.RSP` hidden and read program files, ladder, symbols, I/O footprint, chassis configuration and processor identity; six read-only text-export readers (`plc5_pc5`, `plc5_verify`, `plc5_instruction_inventory`, `plc5_rung_digest`, `plc5_indirect_census`, `plc5_diff`) and `plc5_docs` | RSLogix 5 for the automation-server path; the text reader needs nothing |
| **RSLogix 500 (SLC 500 and MicroLogix) program reads** | 10 | off | beta | Read a text export or `.SLC` export — ladder, data files, I/O footprint, chassis configuration, processor identity and documentation; `slc500_docs`; the `.RSS` automation path answers honestly when it cannot read | RSLogix 500 12.00.00 for the automation-server read; the text reader needs nothing |
| **Engineering resources** | 2 | on | beta | A local standards corpus (IEC 61131-3, Rockwell, Yaskawa, HMI, Optix, craft rules) and a house-style profile of the open project | An open L5X or ME project for the profile |
| **Ladder, display and drawing previews** | 0 | on | beta | Three file viewers: `.l5x`/`.acd` ladder, ME display `.xml`, and DXF/DWG drawings | Nothing |

Every component is beta until the bundle is declared 1.0: the tool sets and result contracts may still
change between releases, and each component states in `components.json` what has actually been verified
and what has not. [Why each is beta](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md#maturity).

## Install

**From the market:** open **Plugins → Arya Plugin Market → Engineering → Install**. The bundle
installs its own rows, components and viewers; installing a component package on its own gives
you tools without the rows that switch them.

**Into a profile you manage yourself:**

```sh
pnpm add @aryacode/dsh-engineering
```

```jsonc
// the profile's package.json
"dsh": { "profile": { "bundles": ["@aryacode/dsh-engineering"] } }
```

Per-row enable state lives in the profile, so a row you switch off stays off across updates.

## Where it appears

- **Plugins page** — nine rows, one per component or surface. Each row has its own Configure page:
  `l5x`, `ftview`, `mwi`, `optix`, `resources`, `migration`, `plc5` (off), `slc` (off) and `viewers`
  (which mounts the package root and therefore shows the package name and description rather
  than a product title).
- **File viewers** — three entries in **Settings → File viewers**: *Logix project* (`.l5x`, `.acd`),
  *FactoryTalk View display* (`.xml`), *DXF/DWG drawing* (`.dxf`, `.dwg`). All three come from one browser
  bundle mounted by the `viewers` row; switching a product row off does not remove its viewer.

## Knowledge and documentation tools

Five product rows carry one documentation tool each: `l5x_docs`, `ftview_docs`, `migration_docs`,
`plc5_docs` and `slc500_docs`. Each answers the same five actions — `contents`, `search`, `read`,
`status` and `lookup` — over two kinds of material:

- **Authored pages** shipped in the bundle: the workflow, the error codes, the revision deltas, the
  limits. These are written for this bundle, never copied from vendor help.
- **Installed-help indexes**: a structural index (titles, paths, identifiers, sections — never page
  bodies) built from the help tree the vendor software installed on this host. A `read` parses the
  vendor page at call time; without the install the tool answers `SOURCE_NOT_INSTALLED`, and a page
  from another revision answers `INSTRUCTION_NOT_IN_REVISION`.

The contract, constants and licensing posture are on the [knowledge reference](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/knowledge.md); the decision record is
[here](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/decisions/knowledge-plane.md).

## First session

Open the workspace folder that holds your export or project and ask in plain language; the agent picks
the product's skill and tools. One prompt per product:

| Product | Say this |
|---|---|
| L5X | "Open Line.L5X, run the checks, and tell me what would fail a review." |
| FactoryTalk View | "List the FactoryTalk View ME applications and check this export." |
| Optix | "What is open in Optix Studio? Show me the project map." |
| MotionWorks IEC | "Find the MotionWorks projects in this folder and open the line project." |
| Migration | "Assess this .RSS and tell me what the conversion will not carry." |
| PLC-5 | "Open this .RSP and give me the program census." |
| SLC 500 | "Read this SLC export and tell me what the data files hold." |

Each product page carries the ordered walkthrough and the boundaries:
[L5X](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/l5x.md),
[FactoryTalk View](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ftview/README.md),
[Optix](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/README.md),
[MotionWorks](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/mwi.md),
[migration](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/migration.md),
[PLC-5](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/plc5.md),
[SLC 500](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/slc.md).
The read-only DXF/DWG drawing preview has its own
[drawing preview page](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ecad/README.md).

## Switches

A row is a plugin. Disabling it in the profile (or on the Plugins page) unmounts that product, so its
tool schemas leave the request. Each product's expensive surfaces are config on the same row, so the
cheap decision takes one switch and the fine decision lives one level down.

| Row | Product | Default | Options |
|---|---|---|---|
| `l5x` | Studio 5000 L5X | on | `editing`, `studio`, `live`, `allowWrites` (all on) |
| `ftview` | FactoryTalk View ME | on | `edit`, `studio` (on) |
| `optix` | FactoryTalk Optix | on | `bridgeUrls`, `allowWrites`, `allowDestructive`, `allowInvoke`, `preview`, `allowPreviewInput`, `netlogic` |
| `mwi` | MotionWorks IEC | on | `workspace` (empty), `edit` (on) |
| `migration` | Legacy → Logix migration | on | `assess`, `lint`, `compare`, `resolve`, `report`, `plan` (on) |
| `plc5` | RSLogix 5 reads | off | the read tools, one option each |
| `slc` | RSLogix 500 reads | off | the ten read tools, one option each |
| `engineering-resources` | Standards corpus and house style | on | `reference` (on) |
| `viewers` | Ladder, display and drawing previews | on | none |

Two rows ship off: the RSLogix 5 reads and the RSLogix 500 reads. Each automation-server path wants
that product installed, and the SLC 500 automation read has no recorded transcript on this host, so it
ships off rather than claiming a result. Both stay listed, so one switch enables a row without a
reinstall.

The default-on surface is budgeted, not accidental: `components.json` records the tools and the
characters of model-visible schema a fresh install may mount (173 tools, 135,251 characters today), and
a component that would exceed either ceiling ships off until the ceiling is raised with its
measurement. The budget and the field set are documented in the
[component contract](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md#context-budget).

## What it needs

- **Host:** DeepSeek Harness or AryaCode, `^0.2.1-rc.3 || ^0.2.2-alpha.2` (declared as
  `dsh.engines.dsh`, so the market states the requirement on the card). Verified on AryaCode
  `0.2.2-alpha.2`, installed from npm into a clean packaged profile: no import or activation error,
  the market reported the bundle live with `diagnostics.findings` empty.
- **Node:** the bundle's own runtime is Node 22.19+ or 24+.
- **Vendor software** is needed only for the surfaces that talk to it: Logix Designer SDK (optional),
  FactoryTalk View Studio ME (discovery and the manual import), FactoryTalk Optix Studio, MotionWorks
  IEC 3 Pro, RSLogix 5 for the automation-server reads and RSLogix 500 for the SLC automation read.
  Reads and the DXF/DWG drawing preview that work from files alone need none of them, and each product
  page states which is which. MotionWorks IEC 3 Pro is not installed on this host, so the MWI compile,
  live and profile paths are fixture-tested only and answer `NOT_INSTALLED` rather than inventing a
  result.

## Safety

- **Read-only by default.** Reading, checks, comparison and the viewers never change a controller.
- **Edits write new files.** `l5x_draft_apply` writes one new L5X beside the source and refuses to
  overwrite; `ftview_apply` writes a new export folder; MotionWorks edits write the real workspace
  project after one verified backup.
- **One backup tree.** Every product backs up to
  `<workspace>/backups/<product>/<subject>/<UTC stamp>/` with a `backup-manifest.json` naming each
  copied file and its SHA-256, so "back up this project" means the same place in every skill.
- **Controller changes need a human.** Upload, mode change and download require per-call approval; a
  download accepts only the verification id produced by a passed build. Live tag and clock writes need
  the row's `allowWrites` switch *and* approval for that exact write, and report the value the
  controller reads back.
- **Coverage is stated.** Every result names what it cannot establish — including whether online logic
  matches an export.

## Skills

The bundle ships eight skills, each attached to the row that can act on it. The agent loads one when the
work matches, so the tool schemas and the method arrive together: `rockwell-l5x`, `factorytalk-view`,
`factorytalk-optix`, `motionworks-iec`, `legacy-to-logix-migration`, `rslogix-5`, `rslogix-500`,
`engineering-standards`. Each product page says when its skill engages, and the resource skill is
cross-toolchain: it is what the other seven reach for when a question is about house style or a standard
rather than a tool.

## Known limits

- Live reads, SDK builds and live writes cannot prove that online logic matches the export; every
  result says so in `coverage`.
- FactoryTalk View **import and runtime creation are Studio steps**: the bundle exports through the
  vendor engine, authors and schema-validates the displays, writes the `BatchImport` manifest and
  verifies the import object by object afterwards, but does not import or build a `.mer`.
- The vendor export does not include the HMI tag CSV, so tag bindings cannot be checked from a fresh
  export unless that database is exported separately.
- The generated tool reference covers the 166 tools built from this repository; the 32 vendored Optix tools
  are not generated from source here, so their descriptions live in their own definitions and in
  [the Optix pages](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/README.md).
- The DXF/DWG drawing preview renders through the embedded converter; proxy objects, ACIS bodies and
  xrefs remain unmeasured and are reported through the converter's diagnostics. The preview is
  read-only and extracts no drawing facts beyond what the pane draws. The ECAD authoring product that
  used to sit beside this preview has been removed; a future ECAD plan starts from this viewer.
- MotionWorks IEC 3 Pro is not installed on this host: the compile, live and profile paths, and reads of
  an installed IDE help tree, are fixture-tested only. Every MWI result says `NOT_INSTALLED` rather than
  claiming a vendor result.
- The SLC 500 row ships off: the text and `.SLC` export readers are tested against synthetic exports, and
  reading a `.RSS` project through the RSLogix 500 automation server is unproven on this host (the COM
  class is registered, no transcript was recorded).
- The installed-help indexes record titles, paths and sections, not vendor page bodies. A `read` needs the
  vendor help installed locally; without it the tool answers `SOURCE_NOT_INSTALLED`.
- FBD and SFC semantics are not exercised.
- All nine components are beta, and each one records in `components.json` what is not proved yet.

## Documentation

Start here: [Getting started](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/getting-started.md) ·
[Documentation map](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/index.md) ·
[Architecture](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/architecture.md)

| Product | Pages |
|---|---|
| Studio 5000 L5X | [L5X](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/l5x.md) · [Live controller work](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/live-controller.md) |
| FactoryTalk View ME | [FactoryTalk View](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ftview/README.md) · [Cross-referencing HMI to PLC](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ftview/cross-reference.md) |
| FactoryTalk Optix | [Optix](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/README.md) · [NetLogic](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/netlogic.md) · [Screens](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/screens.md) · [Project model](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/project.md) · [Artwork](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/artwork.md) · [Production readiness](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/production.md) |
| MotionWorks IEC | [MotionWorks IEC](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/mwi.md) |
| DXF/DWG drawing preview | [Drawing preview](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ecad/README.md) |
| Migration | [SLC 500 / PLC-5 to Logix](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/migration.md) |
| RSLogix 5 reads | [PLC-5](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/plc5.md) |
| RSLogix 500 reads | [SLC 500](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/slc.md) |
| Support and surface | [Resources](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/resources.md) · [Components](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md) |

| Area | Pages |
|---|---|
| Reference | [Every tool](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/tools.md) (generated) · [Knowledge plane](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/knowledge.md) · [Components](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md) · [HMI design](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/hmi-design.md) · [Standards checks](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/standards-checks.md) |
| Evidence | [Capabilities, shown](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/capabilities.md) · [Workflow handbook (PDF)](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/handbook/engineering-handbook.pdf) · [Examples](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/examples.md) |
| Decisions | [Knowledge plane](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/decisions/knowledge-plane.md) · [Verification evidence](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/decisions/verification-evidence.md) |
| Development | [Contributing](CONTRIBUTING.md) · [Packaging](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/development/packaging.md) · [Retirement](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/development/retirement.md) · [Changelog](CHANGELOG.md) |

Links point at GitHub because npm renders the README without the repository's other files.

## Development

```sh
pnpm install
pnpm -r build        # workspace packages (their lib/ is gitignored)
pnpm test            # the release gate: one child process per spec file
pnpm docs:tools      # regenerate docs/reference/tools.md and tools.json
pnpm docs:check      # fail when the generated reference is stale
pnpm check:package   # what the tarball ships, and how big it is
pnpm build:client    # rebuild the one browser bundle from its faces
pnpm knowledge:sync  # copy the shared retrieval core into each product that carries a docs tool
pnpm eval:knowledge  # replay the goldens and check retrieval thresholds and determinism
```

The suite includes the prose-to-code contracts: a row id that the README does not mention, a component
document that no page links, a tool a skill cites that no longer exists, a `files` entry that a mount
would need but the tarball omits — each fails `pnpm test`. See [Contributing](CONTRIBUTING.md) and
`AGENTS.md` for the rules that keep it that way.

## Removing the bundle

Remove the row from the profile's bundle list (or disable it on the Plugins page), then
`pnpm remove @aryacode/dsh-engineering` in the profile. Rows and viewers unload with it.
Nothing the bundle wrote into a workspace is touched: drafts, exports, backups and `.migration/` plans
stay where they are.

## Licence

MIT — see [LICENSE](LICENSE). The tarball embeds third-party code (acadrust, the Optix bridge, upstream
snapshots); every notice travels with it in [NOTICE.md](NOTICE.md). Rockwell Automation, FactoryTalk,
Studio 5000, RSLogix, Allen-Bradley, MotionWorks and Yaskawa are trademarks of their owners; this
project is not affiliated with or endorsed by them.
