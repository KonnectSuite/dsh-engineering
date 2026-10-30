# Standards checks

Two review surfaces turn the engineering corpus into findings: `run_checks` over the
open L5X project, and `ftview_design_check` plus `ftview_validate` over the open HMI
export and its draft. Each finding carries a rule id, a severity and evidence, and
some carry a `basis` naming the corpus rule it encodes. Finding nothing is not proof
of correctness: these are static heuristics over the exported text, not a compile,
not a simulation and not a terminal test.

## PLC standards (`run_checks`)

| Rule | Severity | What it reports | Basis |
|---|---|---|---|
| `LATCH_WITHOUT_RESET` | warning | A tag latched by `OTL` where no `OTU` for that tag exists anywhere in the export. | CRAFT-FAULT-02 |
| `DUPLICATE_OUTPUT` | warning | One tag driven by `OTE`/`OTL` from more than one rung in the same routine. | CRAFT-FAULT-02 |
| `MULTIPLE_OUTPUT_WRITES` | warning | More than one indexed write to an output-like symbol across the project. | — |
| `UNDOCUMENTED_RUNG` | info | One finding per RLL routine counting rungs with no comment, capped with `truncated` and up to 20 rung numbers. | CRAFT-COMMENT-02 |
| `UNDOCUMENTED_ROUTINE` | info | A routine with no description. | CRAFT-COMMENT-02 |
| `UNDOCUMENTED_PROGRAM` | info | A program with no description. | CRAFT-COMMENT-02 |
| `UNSCHEDULED_PROGRAM` | warning | A program no task calls; its logic never runs. | — |
| `MULTIPLE_SCHEDULES` | warning | A program scheduled by more than one task. | — |
| `UNUSED_TAG` | info | A declared tag with no indexed logic reference (low confidence: indexed operands only). | — |
| `UNRESOLVED_REFERENCE` | info | A symbol whose base is declared nowhere in the export (low confidence; module-defined members and `S:`/`R:` flags are excluded). | — |
| `IO_MODULE_CHANGED` | warning | With `baseline_id`: an I/O module added, removed or changed since the baseline. | — |

The latch rule reads the whole export, so a reset in another program or routine
satisfies it; that is deliberate, because cross-routine resets are common in real
projects. The duplicate rule is per routine, because two routines driving the same
output can be legitimate sequence layering while two rungs in one routine rarely are.
Neither rule parses whether the reset is *reachable* or *interlocked* — a low-level
`OTU` on an unconditional rung satisfies it and still latches forever. Treat a clean
latch result as "somewhere there is a reset", not as "this latch is safe".

## HMI design standards

| Rule | Where | What it reports | Basis |
|---|---|---|---|
| `VIEW-HPM-02` | `ftview_design_check` | A touch target smaller than the minimum hit size. | VIEW-HPM-02 |
| `VIEW-HPM-01` | `ftview_design_check` | A control with no caption. | VIEW-HPM-01 |
| `VIEW-COLOR-01` | `ftview_design_check` | Text whose contrast against its fill is below the readable threshold. | VIEW-COLOR-01 |
| `VIEW-NAV-01` | `ftview_design_check` | A display no other display navigates to. | VIEW-NAV-01 |
| `VIEW-NAV-02` | `ftview_design_check` | A display something navigates to that holds no `gotoButton` or `closeButton`, so an operator who lands there cannot leave. | VIEW-NAV-02 |
| `DRAFT_OVERLAP` | `ftview_validate` | Two objects this draft places partly over each other, with both names and the overlap area. Whole-display backdrops and panels containing their children are excluded. | VIEW-LAYOUT-01 |
| `TAG_CSV`, `UNPARSED_FILE`, `DUPLICATE_*` | `ftview_check` | Structural problems in the export itself, before any design question. | — |

Each `DUPLICATE_OBJECT_NAME` finding states how many objects share the name and carries that
`count` in its evidence, so a display with eight `Value` objects is one finding rather than eight
near-identical rows. The ME alarm setup file (`<alarms>` root) is an alarm configuration, not a
display: `ftview_open` returns it in `alarm_files`, and it is never reported as an `UNPARSED_FILE`.

## Workflow

Call `ftview_check` first for structural health, then `ftview_design_check` for the
design rules, then `ftview_validate` on a draft. For the PLC side call `run_checks`,
filter with `rule` and `severity` when the unfiltered list is long, and read `basis`
to cite the corpus page behind a finding. Every finding names the program, routine,
rung, display or object it concerns so the fix is a local edit rather than a review
of the whole project.
