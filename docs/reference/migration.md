# SLC 500 to Logix migration

The `migration` row is a support row for one job: bringing an RSLogix 500 /
SLC 500 (or PLC-5) program into Studio 5000 with evidence instead of hope. It
adds five tools and the `slc-to-logix-migration` skill. It never drives Studio or
a controller; the one vendor call it makes opens RSLogix 500 hidden, reads the
project and closes it without saving.

## Tools

| Tool | Reads | Answers |
|---|---|---|
| `migration_plan` | `.migration/plan.json` | the interview decisions, the stage evidence and the exceptions, in one resumable file |
| `migration_assess` | `.L5K`, `.SLC`, `.RSS`, `.ACH` | what the file is, which controller it describes, and what a migration still has to change |
| `l5k_lint` | `.L5K` | will Studio import this file, and what will bite after it does |
| `slc_read` | `.RSS`, `.ACH` | program files, rung counts, rung text, symbols and data files read headlessly through the 32-bit RSLogix 500 automation server |
| `migration_compare` | `.RSS`, `.ACH` + `.L5X` | which legacy ladder files reached which routines, how many rungs survived, which symbols and data files were carried, and which differences are real |

`migration_assess` on an `.L5K` returns the lint verdict too. `l5k_lint` exists
separately because the finding list is the repair worklist: rule, severity and
1-based line, ordered by line.

`slc_read` is the only tool here that starts another program, and even it opens
the project hidden, reads it and closes it without saving: no window, no click,
no change to the customer's file. It needs RSLogix 500 on a 32-bit-capable
host; without it, Save As `.SLC` and read the export instead.

`migration_compare` reads the legacy side the same headless way. It treats a
file's terminal `END` rung as the end marker, not as logic, and it only expects
data files of type `I`, `O` and `S` to become tags if the conversion carried
them; on Slitter 8 that moved 3,409 symbol records and 209 data files to 64
matched files, 1,398 of 1,426 legacy rungs, 2 real differences and 2 expected
ones, with 259 indirect expressions left for engineering.

`migration_plan` writes `.migration/plan.json` (schema 1): the project and source
hash, five decisions (`target_cpu`, `target_revision`, `io_strategy`,
`hmi_scope`, `acceptance`), eight stages (`intake`, `assess`, `convert`, `lint`,
`import`, `compare`, `engineer`, `commission`), and exceptions with a status of
`open`, `accepted` or `fixed`. A plan refuses to advance until every decision is
answered, and `next_action` names the one thing to do next.

## Formats

| Extension | What it is | What the row does |
|---|---|---|
| `.L5K` | the text the migration wizard writes and Studio imports (UTF-16LE from Studio, UTF-8 after a hand repair) | decodes either encoding, reads declarations, lints the text |
| `.SLC` | RSLogix 500 text export: `LADDER n`, `% Rung: n %`, SLC ASCII mnemonics, `DATA B3:0` tables | counts ladder files, rungs, racks and data files; read-only truth for the old logic |
| `.RSS`, `.ACH` | OLE2 containers RSLogix 500 owns | `slc_read` opens them hidden and returns program files, rung text, symbols and data files; `migration_assess` states what the container is and what a conversion still needs |

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

1. **Plan and interview.** `migration_plan create` starts the plan; answer the
   five decisions. Target controller and firmware, I/O strategy (keep the 1746
   chassis behind a 1747-AENTR or replace it), HMI scope and the acceptance
   bar. The skill asks; nothing assumes a default.
2. **Assess the source** with `migration_assess`. For an `.RSS`, `slc_read`
   lists the program files, rung counts, symbols and data files headlessly
   first, so the estimate and the later comparison use the real structure.
3. **Convert.** RSLogix 500's migration wizard (Save As Logix Designer / `.ACD`)
   writes an `.L5K`. `Failed to export to ACD` is a lint result, not a dead end.
4. **Lint and repair** the `.L5K` with `l5k_lint`. Repair a copy; never the
   customer's `.RSS` or the wizard's first output.
5. **Import and compare.** Open the imported `.L5X`, run `migration_compare`,
   then `run_checks`. Triage by migration cause: duplicated rung outputs are
   expected when several legacy files land in one routine; a missing routine, a
   lost rung or an indirect expression is real work.
6. **Engineer the exceptions**, recording each in the plan as `accepted` or
   `fixed`, with the rung or project that proves it. Resolve indirect addressing
   and unmapped modules; a revision 37 or newer target allows an offline build
   proof.
7. **Commission against the plan's acceptance bar**: build-verified or
   import-verified, every difference explained, and the golden trio (`.RSS`,
   `.L5K`, `.L5X`) archived together.

## Limits

- A text reader cannot prove runtime behaviour, I/O wiring or HMI bindings.
- A revision 37 or newer target supports an offline build proof; older targets
  support an "import succeeded" statement only.
- Conversion itself is the wizard, not this row: `SaveAs` through the automation
  API writes a native copy, and the translator DLLs are undocumented.
- Nothing in this row contacts a controller or writes a live tag.

## Related

- [Tool reference](tools.md) — the generated entry for these tools.
- [Standards checks](standards-checks.md) — the `run_checks` rules used to
  triage the imported project.
- `docs/port/l5x.md` — the L5X package's own port notes.
