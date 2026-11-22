---
title: Legacy migration
order: 70
purpose: Assess a legacy project against a target, lint it, compare it, and report - with the wizard's boundary stated.
audience: Migration engineers
---

## The product row

Migration is a support row (7 tools at 0.103.0, plus `migration_docs` in this change) that turns a legacy control project into a reviewed migration story. It reads `.L5K`, `.SLC`, `.RSS`, `.ACH`, `.RSP` and `.L5X` inputs, assesses them against a five-decision plan, lints ladder, compares expected with real logic, and writes a report. It never drives Studio and never contacts a controller.

One tool starts another program: `slc_read` opens RSLogix 500 or 5 hidden, reads, and closes without saving. Everything else parses files. `.SLC` text exports and `.L5K` files need neither vendor application.

## The workflow

1. `migration_plan` records five decisions - target CPU, target revision, I/O strategy, HMI scope and acceptance - across eight stages in `.migration/plan.json`. It refuses to advance while a decision is unanswered.
2. `migration_assess` reads the project and reports scope, instruction use and risks. An imported `.L5X` gets the wizard-defaults audit; a native `.L5X` is refused with `ALREADY_LOGIX`.
3. `slc_read` reads a project through the vendor server when the input is `.SLC`/`.RSS`/`.ACH` and the tools are installed.
4. `l5k_lint` flags structural problems (`TRAILING_COMMA`, `DUPLICATE_TAG`, `TAG_NAME_TOO_LONG`, `ROUTINE_PAREN`, `ROUTINE_UNBALANCED`, `PLACEHOLDER_TAG`, `INDIRECT_ADDRESS`, `REVISION_BELOW_TARGET`, `BOM`).
5. `migration_compare` compares expected and real logic and separates expected differences from real ones; a terminal `END` rung is not logic.
6. `migration_resolve` proposes resolutions with citations; it never writes.
7. `migration_report` writes Markdown or `.docx` to a new path.

The instruction map cites the vendor manuals it draws on; it is a reading aid, not a licence to claim a conversion is safe.

## The wizard boundary

RSLogix 500's Project Migrator, and RSLogix 5's equivalent, cannot emit a project newer than the wizard ships - version 30-31 for RSLogix 500 and 30-32 for RSLogix 5 in the recorded material. So an imported project must be retargeted in Studio 5000 to revision 37 or later before an offline build proof is meaningful. The wizard's I/O choice is Keep Existing or Update All; modules that cannot convert take a `PLACEHOLDER_TAG`, and leftover `?`/PCE addresses are recorded as review items rather than silently fixed.

## Recorded coverage

Four projects were measured: Slitter 8 (3,409 symbols and 209 data files, 1,398 of 1,426 rungs matched, 259 indirect addresses), an EN049 PLC-5 project (34 files, 306 of 320 rungs, 90 data files, 131 indirect addresses), the EN049 marker census (214 sites, 201 answerable, 35 for review), and SLITTER10 `.RSS` (15 markers across 55 rungs).

## What this row will not claim

- That every legacy instruction converts: the map covers 58 mnemonics with citations, and uncovered instructions are review items.
- That a comparison result equals acceptance: `migration_resolve` proposes; a person approves.
- That the wizard's output is build-ready: retarget first, then prove the build.
