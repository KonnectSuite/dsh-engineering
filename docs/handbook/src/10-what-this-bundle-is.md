---
title: What this bundle is
order: 10
purpose: Explain what the engineering bundle adds to AryaCode, how rows and components fit together, and which surfaces this handbook covers.
audience: Readers new to the bundle
---

## One install, many surfaces

`@aryacode/dsh-engineering` is one AryaCode plugin bundle. It adds engineering tools to the agent's toolbox and the matching preview surfaces to the workbench: a ladder viewer, FactoryTalk View displays, Optix screens and a read-only drawing pane. A compatible AryaCode profile mounts the bundle; the bundle then composes the products it ships.

The source repository is `KonnectSuite/dsh-engineering`. Nothing in the bundle edits the installed AryaCode app or the installer payload. Rows load at boot, and every write lands in a workspace the user chooses.

## Rows and components

A row is one entry in the bundle patch, `cordis.patch.yml`. Loading a row loads a component, and there are two shapes:

- **Product rows** mount a whole product: tools, a skill, and previews when the product has a preview.
- **Support components** mount one smaller thing: the engineering resources corpus, the document previews, and the migration machinery.

Every component is described in `components.json`: default posture, maturity, tool count, skill budget, the evidence gate, and the documents that own it. The manifest and the patch are checked against each other in `test/components.spec.mjs`, so a row that exists in only one of them fails the suite.

## What ships switched on

The patch ships most rows on. At 0.103.0 two rows, ECAD (12 tools) and PLC-5 (8), shipped switched off: their tools were compiled and tested but did not add to a fresh install's default context or profile. A switched-off row is unloaded, not hidden, until a profile switches it on. This change retires the ECAD product row - its read-only drawing preview moves to the previews surface - and adds a read-only SLC 500 row (10 tools, `slc500_` namespace), which also ships switched off.

Every row adds a slice of tool schemas to the model context. `components.json` records a default-on budget (`defaultOnTools`, `defaultOnSchemaCharacters`) so a release cannot quietly grow the context a fresh install pays.

## Maturity

Every component is **beta**. In this bundle that means tested, with a `stabilityNote` that states exactly what is not proved. The component reference, `docs/reference/components.md`, owns the field definitions and the checks. This handbook describes what a session feels like; it does not replace that reference.

## How to read this handbook

- Chapters 2-11 cover the shared loop and each product.
- Chapters 12-13 cover previews, safety and approvals.
- Chapters 14-15 cover troubleshooting and what is not proved.

Where a chapter names a measurement, the figure comes from the repository's recorded evidence (`docs/capabilities.md`, the product pages and `HANDOFF.md`). Anything not recorded there is marked unverified, and a claim that has not been measured on the current host stays a claim.
