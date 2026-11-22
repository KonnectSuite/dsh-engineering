# SLC 500 and PLC-5 to Logix migration

This page is the map for the migration row. It explains what the tools read, what
they prove, and in which order a project moves from a legacy file to a Logix export
that someone has actually built.

## What the row does

The row ships seven tools and one skill. Every tool is offline: it reads local files
and never contacts a controller, never writes to the legacy project, and never claims
that a project is migrated.

| Tool | Job |
| --- | --- |
| `migration_assess` | Read a saved SLC 500 export (`.RSS`, `.ACH`, `.SLC` text) or a PLC-5 `.RSP` and report the work the migration will need, without opening a window. |
| `slc_read` | Open an RSLogix 500 project through the 32-bit automation server, hidden and read-only, and return its structure. |
| `l5k_lint` | Lint the `.L5K` text the migration wizard writes, before Studio imports it. |
| `migration_compare` | Compare the legacy routine/rung structure with the Logix export and name what moved, split, or disappeared. |
| `migration_resolve` | Take the conversion errors the wizard left (markers, indirect addresses, folded operands) and decide each one. |
| `migration_plan` | Keep the eight-stage plan, the five decisions, and the exception list in `.migration/plan.json`. |
| `migration_report` | Write the migration report (`.md` or `.docx`) that carries the evidence. |

`slc_read` needs RSLogix 500 installed on the machine, because it drives the vendor
automation server. `migration_assess` needs no vendor installation for the saved
export formats it understands. A missing vendor install is reported as a typed
failure with the search path and a fix, never as an empty result.

## Five decisions before conversion

Conversion is mechanical once these are answered. Guessing them is how a migration
turns into a rewrite discovered at commissioning.

1. `target_cpu` — which Logix controller replaces the SLC or PLC-5 processor. The
   choice fixes the I/O bus, the memory ceiling, and the motion options.
2. `target_revision` — the firmware revision. Record it as 1 through 40. An offline
   Studio build can prove a revision of 37 or newer; below that the export can only
   be shown to import.
3. `io_strategy` — keep the legacy chassis behind a bridge, or replace the modules.
   Keeping a 1746 chassis behind a 1747-AENTR is cheaper per point and keeps the
   wiring; replacing it means new module configuration and rewritten addresses.
4. `hmi_scope` — which screens stay on the legacy HMI, which move, and which are
   retired. A panel that reads the SLC data table directly will not read Logix tags
   by accident.
5. `acceptance` — offline build, sequence test, or golden part. Write down which one
   counts as done before the first rung is converted.

## The eight stages

| Stage id | Stage | Exit criterion |
| --- | --- | --- |
| `intake` | Interview the engineer and record the decisions | The five decisions are answered in the plan. |
| `assess` | Read the legacy project headlessly | The risk list is accepted, not just produced. |
| `convert` | Run the migration wizard and keep the `.L5K` | The wizard output is saved beside the legacy file. |
| `lint` | Lint the `.L5K` and repair a copy | No error-severity lint rules remain; warnings have an owner. |
| `import` | Import into Studio and export the `.L5X` | Studio imports without error and the `.L5X` is kept. |
| `compare` | Compare the legacy structure with the Logix export | Every routine, symbol, and data file has a verdict. |
| `engineer` | Resolve exceptions and prove each rewrite | One exception list, each rewrite proved by build or test. |
| `commission` | Commission, then baseline source, ACD and `.L5X` | The running machine matches the recorded baseline. |

The plan file is user data, not this corpus: it lives at `.migration/plan.json` by
default, carries schema 1, and may include timestamps because it records when a
person answered. This corpus has no timestamps.

## Evidence, not text

A migrated rung is not evidence, and an import is not a migration. The bundle treats
these as the gates that turn text into proof:

- the lint repair was made on a copy, so the wizard output stays intact;
- the `.L5X` Studio exported after import is the file every later comparison reads;
- every marker and indirect address has a resolution, not a deletion;
- each rewrite is proved by an offline build, a sequence test, or a golden part, as
  the `acceptance` decision said;
- the commissioned machine is baselined before the legacy project is archived.

Until those gates are met, every tool reports coverage `complete: false` with the
specific unverified items. That is deliberate: a report that says "migrated" without
evidence is the failure mode this product exists to prevent.

## How to search this collection

Call `migration_docs` with `action: "search"` for prose, or `action: "lookup"` for an
exact identifier such as an instruction mnemonic (`TON`, `BTW`), a lint rule
(`TRAILING_COMMA`), or a tool name (`migration_plan`). Use `contents` for the section
table, `read` for one page, and `status` to see which collection is readable in this
build.
