# Products

`@aryacode/dsh-engineering` is one npm install of automation-engineering tools for DeepSeek Harness
(AryaCode). This section gives each product its own page: what it adds, which vendor software it needs,
the first session that produces a useful answer, the tool surface by task, and where it stops.

Every page has the same shape, so a page can be read on its own: what it is, what you need, a first
session, what it does, its limits, its safety rules when it writes anything, and where to go next.

## The products

Six rows are products: they read or author a vendor artifact, and each one is a page in this section.
Tool counts are for this release; the generated reference covers 158 of them, and the 32 Optix tools are
vendored and not in that generated list.

| Product | Tools | Default | Stability | Needs | Page |
|---|---|---|---|---|---|
| Studio 5000 L5X | 54 | on | beta, since v0.4.4 | nothing to read, review and draft; Logix Designer optional for SDK builds and controller upload; a Logix controller optional for live EtherNet/IP reads | [Studio 5000 L5X](l5x.md) |
| FactoryTalk View ME | 51 | on | beta, since v0.4.4 | nothing to read, check, draft and render an export folder; FactoryTalk View Studio ME on Windows for discovery, export and the import handoff; SQL Server Express for the tag snapshot | [FactoryTalk View ME](ftview/README.md) |
| FactoryTalk Optix | 32 | on | beta, since v0.3.0 | FactoryTalk Optix Studio 1.8.1 (required); .NET 8 SDK optional for `optix_build`; Tesseract optional for `optix_ocr` | [FactoryTalk Optix](optix/README.md) |
| MotionWorks IEC | 24 | on | beta, since v0.4.4 | MotionWorks IEC 3 Pro 1.19 (required, licensed, and running for IDE operations) | [MotionWorks IEC](mwi.md) |
| ECAD prints | 12 | off | beta, since v0.86.0 | nothing to read, check and render DXF/DWG; AryaCAD Electrical optional for authoring, which runs there | [ECAD prints](ecad/README.md) |
| RSLogix 5 (PLC-5) | 8 | off | beta, since v0.90.0 | nothing to read the container; RSLogix 5 v10 optional for rung text, symbols and the I/O footprint | [RSLogix 5 (PLC-5)](plc5.md) |

Two rows ship off — ECAD prints and RSLogix 5 reads — and every other product row is on by default.
Turn a row on from the Plugins page, or in the profile patch as described in
[Architecture](../architecture.md#switches).

## What each one is for

- **[Studio 5000 L5X](l5x.md)** — read a `.L5X` export, follow a tag, run 43 evidence-backed review
  rules, draft rungs and tags into a new file, build an offline `.ACD`, or read and write declared
  scalars over EtherNet/IP without Studio.
- **[FactoryTalk View ME](ftview/README.md)** — read an ME export folder, run the structural and design
  checks, compare two exports, author displays and tags into a new export folder, and hand the changed
  displays to Studio through the Graphics Import Export Wizard.
- **[FactoryTalk Optix](optix/README.md)** — drive a loaded Optix Studio project through a bridge: read
  the model, author screens and NetLogic, save and build, and run the release gate.
- **[MotionWorks IEC](mwi.md)** — operate a running MotionWorks IEC 3 Pro IDE on real project files:
  find and open, read the object model and POU code, edit, compile, read diagnostics, verify.
- **[ECAD prints](ecad/README.md)** — read electrical DXF/DWG prints: sheets, title blocks, profile,
  cross-reference candidates, checks, a read-only drawing pane and review bundles.
- **[RSLogix 5 (PLC-5)](plc5.md)** — read an RSLogix 5 `.RSP` project headlessly: ladder text, program
  census, I/O footprint, configured chassis, data files and processor identity.

## Support components

The other four components are not products. They add no vendor surface of their own, and they are on by
default.

| Component | Tools | What it adds | Page |
|---|---|---|---|
| SLC 500 and PLC-5 to Logix migration | 7 | Assess a legacy export, lint the `.L5K` the wizard wrote, resolve its conversion markers, and report what a sign-off needs | [Migration](migration.md) |
| Engineering resources | 2 | A local corpus of 70 rule pages and a measured house-style profile of the open project | [Engineering resources](resources.md) |
| Arya Automation Engineer preset | — | The five-step working contract, the engineering ledger and the compaction tuned for read-heavy sessions | [Preset](../preset.md) |
| Ladder and display previews | — | Viewer faces for L5X ladder, FactoryTalk View displays and ECAD drawings | [Architecture](../architecture.md#client-faces) |

## Reading order

1. [Getting started](../getting-started.md) — install, the shared five-step loop, a paste-ready prompt.
2. The page for the product in front of you: what it needs installed, then its first session.
3. [Tool reference](../reference/tools.md) — every registered tool with its parameters.
4. [Capabilities](../capabilities.md) — which call produced each measured figure, and what an image
   cannot prove.

## Where to go next

- [Documentation map](../index.md) — every page, by task and by product.
- [Getting started](../getting-started.md) — the first session for every product.
- [Tool reference](../reference/tools.md) — the generated inventory behind the counts above.
- [Architecture](../architecture.md) — how the rows, switches and client faces compose.
