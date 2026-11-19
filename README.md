# AryaCode Engineering

**Automation-engineering tools, skills and file viewers for DeepSeek Harness.** One install gives an
agent the surfaces an automation engineer works in: Studio 5000 (L5X and ACD), FactoryTalk View ME,
FactoryTalk Optix, MotionWorks IEC 3, ECAD electrical prints (DXF and DWG), RSLogix 5 (PLC-5) reads,
and SLC 500 / PLC-5 → Logix migration. DeepSeek Harness ships as **AryaCode**; the two names are the
same host and this page applies to both.

[![npm](https://img.shields.io/npm/v/@aryacode/dsh-engineering)](https://www.npmjs.com/package/@aryacode/dsh-engineering)
[![downloads](https://img.shields.io/npm/dm/@aryacode/dsh-engineering)](https://www.npmjs.com/package/@aryacode/dsh-engineering)
[![licence](https://img.shields.io/npm/l/@aryacode/dsh-engineering)](LICENSE)
[![Arya plugin market](https://img.shields.io/badge/market-Arya_Plugin_Market-2f6f4e)](https://github.com/KonnectSuite/dsh-arya-market)

**One bundle: 10 component rows · 190 tools · 6 products · every component is beta**

The bundle is one npm package with one install surface. Inside it, each product is a **row** on the
Plugins page: a row is a plugin, so switching one off unloads that product and its tool schemas stop
being sent with every request. The components are deliberately fine-grained — one per toolchain —
because that is how an engineer adopts them: Studio 5000 this week, Optix next month, ECAD when the
prints arrive.

New here? Read [Getting started](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/getting-started.md),
then open the page for the product you have in front of you.

## What you get

| Product | Tools | Default | Stability | What it adds | Needs |
|---|---|---|---|---|---|
| **Studio 5000 L5X** | 54 | on | beta | Read, check, compare and document an L5X/ACD; stage ladder edits as a new file; optional Logix Designer SDK work; live EtherNet/IP reads and two approval-gated writes | Node; a Logix Designer SDK only for SDK builds; a controller only for live |
| **FactoryTalk View ME** | 51 | on | beta | Read an ME export, run structural checks, edit displays, tags and objects, validate against the vendor schema, and stage a Studio import handoff | Node; FactoryTalk View Studio ME for discovery and the handoff |
| **FactoryTalk Optix** | 32 | on | beta | Read and author a loaded Optix Studio project through a bridge, draw operator screens, write and compile NetLogic C#, drive the emulator preview | Optix Studio; .NET 8 SDK for compile checks; Tesseract for OCR |
| **MotionWorks IEC** | 24 | on | beta | Operate a running MotionWorks IEC 3 Pro IDE on the real project files: read, edit, compile, diagnose, verify | MotionWorks IEC 3 Pro 1.19 |
| **ECAD electrical prints** | 12 | off | beta | Read DXF prints and DWG through the embedded converter: title blocks, index sheet, cross-reference candidates, checks, layout render, compare, review bundle | Nothing to read; authoring stays in AryaCAD Electrical |
| **SLC 500 and PLC-5 to Logix migration** | 7 | on | beta | Assess a legacy program, lint the `.L5K` the migration wizard writes, resolve its conversion markers, and write the report a person signs off from | Nothing; reads `.RSS`/`.ACH`/`.RSP` or the `.SLC` export |
| **RSLogix 5 (PLC-5) program reads** | 8 | off | beta | Open a `.RSP` hidden and read program files, ladder, symbols, I/O footprint, chassis configuration and processor identity | RSLogix 5 for the automation-server path; the container reader needs nothing |
| **Engineering resources** | 2 | on | beta | A local standards corpus (IEC 61131-3, Rockwell, Yaskawa, HMI, Optix, craft rules) and a house-style profile of the open project | An open L5X or ME project for the profile |
| **Arya Automation Engineer preset** | 0 | on | beta | The agent preset: engineering-tuned compaction, a work ledger and the five-step contract | Nothing |
| **Ladder and display previews** | 0 | on | beta | Three file viewers: `.l5x`/`.acd` ladder, ME display `.xml`, and DXF/DWG drawings | Nothing |

Every component is beta until the bundle is declared 1.0: the tool sets and result contracts may still
change between releases, and each component states in `components.json` what has actually been verified
and what has not. [Why each is beta](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md#maturity).

## Install

**From the market:** open **Plugins → Arya Plugin Market → Engineering → Install**. The bundle
installs its own rows, components, viewers and preset; installing a component package on its own gives
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

- **Plugins page** — ten rows, one per component or surface. Each row has its own Configure page:
  `l5x`, `ftview`, `mwi`, `ecad` (off), `optix`, `resources`, `migration`, `plc5` (off), `preset`, and
  `viewers` (which mounts the package root and therefore shows the package name and description rather
  than a product title).
- **File viewers** — three entries in **Settings → File viewers**: *Logix project* (`.l5x`, `.acd`),
  *FactoryTalk View display* (`.xml`), *ECAD drawing* (`.dxf`, `.dwg`). All three come from one browser
  bundle mounted by the `viewers` row; switching a product row off does not remove its viewer.
- **Preset picker** — *Arya Automation Engineer*.

## First session

Open the workspace folder that holds your export or project and ask in plain language; the agent picks
the product's skill and tools. One prompt per product:

| Product | Say this |
|---|---|
| L5X | "Open Line.L5X, run the checks, and tell me what would fail a review." |
| FactoryTalk View | "List the FactoryTalk View ME applications and check this export." |
| Optix | "What is open in Optix Studio? Show me the project map." |
| MotionWorks IEC | "Find the MotionWorks projects in this folder and open the line project." |
| ECAD | "Review these drawing prints and give me the findings." |
| Migration | "Assess this .RSS and tell me what the conversion will not carry." |
| PLC-5 | "Open this .RSP and give me the program census." |

Each product page carries the ordered walkthrough and the boundaries:
[L5X](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/l5x.md),
[FactoryTalk View](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ftview/README.md),
[Optix](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/README.md),
[MotionWorks](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/mwi.md),
[ECAD](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ecad/README.md),
[migration](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/migration.md),
[PLC-5](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/plc5.md).

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
| `ecad` | ECAD electrical prints | off | `writes` (off), `bridgeServerName`, `maxFiles`, `maxFileBytes`, `maxEntities` |
| `migration` | Legacy → Logix migration | on | `assess`, `lint`, `compare`, `resolve`, `report`, `plan` (on) |
| `plc5` | RSLogix 5 reads | off | the eight read tools, one option each |
| `engineering-resources` | Standards corpus and house style | on | `reference` (on) |
| `engineering-preset` | Arya Automation Engineer | on | none — the preset's own settings |
| `viewers` | Ladder, display and drawing previews | on | none |

Two rows ship off: ECAD, a large surface many profiles do not need, and the RSLogix 5 reads, whose
automation-server path wants that product installed. Both stay listed, so one switch enables them
without a reinstall.

The default-on surface is budgeted, not accidental: `components.json` records the tools and the
characters of model-visible schema a fresh install may mount (170 tools, 127,423 characters today), and
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
  IEC 3 Pro, RSLogix 5 for the automation-server reads, AryaCAD Electrical for ECAD authoring. Reads
  that work from files alone need none of them, and each product page states which is which.

## Safety

- **Read-only by default.** Reading, checks, comparison and the viewers never change a controller.
- **Edits write new files.** `draft_apply` writes one new L5X beside the source and refuses to
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
`factorytalk-optix`, `motionworks-iec`, `legacy-to-logix-migration`, `rslogix-5`, `ecad-review`,
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
- The generated tool reference covers the 158 tools built from this repository; the 32 vendored Optix tools
  are not generated from source here, so their descriptions live in their own definitions and in
  [the Optix pages](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/optix/README.md).
- ECAD support is measured, not assumed: cross-reference rows are candidates with a confidence,
  unsupported entities are reported per sheet, and geometry beyond the planar drawing assumption is
  reported as approximate. Proxy objects, ACIS bodies and xrefs remain unmeasured and are reported
  through the converter's diagnostics.
- FBD and SFC semantics are not exercised.
- All ten components are beta, and each one records in `components.json` what is not proved yet.

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
| ECAD electrical prints | [ECAD](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ecad/README.md) · [AryaCAD bridge](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/ecad/aryacad-bridge.md) |
| Migration | [SLC 500 / PLC-5 to Logix](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/migration.md) |
| RSLogix 5 reads | [PLC-5](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/plc5.md) |
| Support and surface | [Resources](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/products/resources.md) · [Preset](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/preset.md) · [Components](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md) |

| Area | Pages |
|---|---|
| Reference | [Every tool](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/tools.md) (generated) · [Components](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/components.md) · [HMI design](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/hmi-design.md) · [Standards checks](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/reference/standards-checks.md) |
| Evidence | [Capabilities, shown](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/capabilities.md) · [Workflow handbook (PDF)](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/handbook/Engineering-Handbook.pdf) · [Examples](https://github.com/KonnectSuite/dsh-engineering/blob/main/docs/examples.md) |
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
```

The suite includes the prose-to-code contracts: a row id that the README does not mention, a component
document that no page links, a tool a skill cites that no longer exists, a `files` entry that a mount
would need but the tarball omits — each fails `pnpm test`. See [Contributing](CONTRIBUTING.md) and
`AGENTS.md` for the rules that keep it that way.

## Removing the bundle

Remove the row from the profile's bundle list (or disable it on the Plugins page), then
`pnpm remove @aryacode/dsh-engineering` in the profile. Rows, viewers and the preset unload with it.
Nothing the bundle wrote into a workspace is touched: drafts, exports, backups and `.migration/` plans
stay where they are.

## Licence

MIT — see [LICENSE](LICENSE). The tarball embeds third-party code (acadrust, the Optix bridge, upstream
snapshots); every notice travels with it in [NOTICE.md](NOTICE.md). Rockwell Automation, FactoryTalk,
Studio 5000, RSLogix, Allen-Bradley, MotionWorks and Yaskawa are trademarks of their owners; this
project is not affiliated with or endorsed by them.
