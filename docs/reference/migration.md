# SLC 500 to Logix migration

The `migration` row is a support row for one job: bringing an RSLogix 500 /
SLC 500 (or PLC-5) program into Studio 5000 with evidence instead of hope. It
adds two offline tools and the `slc-to-logix-migration` skill. It never drives
RSLogix 500, Studio or a controller.

## Tools

| Tool | Reads | Answers |
|---|---|---|
| `migration_assess` | `.L5K`, `.SLC`, `.RSS`, `.ACH` | what the file is, which controller it describes, and what a migration still has to change |
| `l5k_lint` | `.L5K` | will Studio import this file, and what will bite after it does |

`migration_assess` on an `.L5K` returns the lint verdict too. `l5k_lint` exists
separately because the finding list is the repair worklist: rule, severity and
1-based line, ordered by line.

## Formats

| Extension | What it is | What the row does |
|---|---|---|
| `.L5K` | the text the migration wizard writes and Studio imports (UTF-16LE from Studio, UTF-8 after a hand repair) | decodes either encoding, reads declarations, lints the text |
| `.SLC` | RSLogix 500 text export: `LADDER n`, `% Rung: n %`, SLC ASCII mnemonics, `DATA B3:0` tables | counts ladder files, rungs, racks and data files; read-only truth for the old logic |
| `.RSS`, `.ACH` | OLE2 containers RSLogix 500 owns | states the size and that RSLogix 500 must Save As `.SLC` or run the wizard |

An `.L5X` is refused with `ALREADY_LOGIX`: it is the Logix side, read with
`open_project`.

## Lint rules

| Rule | Severity | What it means |
|---|---|---|
| `TRAILING_COMMA` | error | an attribute list ends with a comma before `)`; Studio aborts the whole import as invalid attribute syntax |
| `DUPLICATE_TAG` | error | a tag name is declared twice in the TAG block |
| `TAG_NAME_TOO_LONG` | error | a name is over 40 characters |
| `ROUTINE_PAREN` | warning | a routine header ends with a stray `)` |
| `ROUTINE_UNBALANCED` | error | ROUTINE and END_ROUTINE counts differ: truncated or malformed |
| `PLACEHOLDER_TAG` | warning | a tag stands in for a module the wizard could not map |
| `INDIRECT_ADDRESS` | warning | a rung indexes an array with another tag (`N[N7_130]`), which Logix cannot express |
| `REVISION_BELOW_TARGET` | info | the controller revision is below 37, so only an import can be proven |
| `BOM` | warning | the file starts with a byte-order mark |

## Workflow

1. **Interview.** Target controller and firmware, I/O strategy (keep the 1746
   chassis behind a 1747-AENTR or replace it), HMI scope, validation window. The
   skill asks; nothing assumes a default.
2. **Assess the source** with `migration_assess`. `.RSS` needs RSLogix 500 to
   write `.SLC` first.
3. **Convert.** RSLogix 500's migration wizard (Save As Logix Designer / `.ACD`)
   writes an `.L5K`. `Failed to export to ACD` is a lint result, not a dead end.
4. **Lint and repair** the `.L5K` with `l5k_lint`. Repair a copy; never the
   customer's `.RSS` or the wizard's first output.
5. **Import and prove.** Open the imported `.L5X`, compare structure and counts,
   triage the structural checks by migration cause, resolve indirect addressing
   and unmapped modules, then commission.

## Limits

- A text reader cannot prove runtime behaviour, I/O wiring or HMI bindings.
- A revision 37 or newer target supports an offline build proof; older targets
  support an "import succeeded" statement only.
- Nothing in this row contacts a controller or writes a live tag.

## Related

- [Tool reference](tools.md) — the generated entry for both tools.
- [Standards checks](standards-checks.md) — the `run_checks` rules used to
  triage the imported project.
- `docs/port/l5x.md` — the L5X package's own port notes.
