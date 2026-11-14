# Standards checks

Three review surfaces turn the engineering corpus into findings: `run_checks` over the
open L5X project, `ftview_design_check` plus `ftview_validate` over the open HMI
export and its draft, and `optix_design_check` over a screen in a live Optix project.
Each finding carries a rule id, a severity and evidence, and some carry a `basis`
naming the corpus rule it encodes. Finding nothing is not proof
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
| `UNUSED_TAG` | info | A declared tag with no indexed logic reference (low confidence: indexed operands only; a module-defined tag such as `Local:1:C` is excluded because the module wires it, not the logic). | — |
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
| `VIEW-HPM-02` | `ftview_design_check` | A touch target smaller than the minimum hit size. | HMI-TARGET-01 |
| `VIEW-HPM-01` | `ftview_design_check` | A control with no caption. | HMI-TARGET-02 |
| `VIEW-COLOR-01` | `ftview_design_check` | Text whose contrast against its fill is below the readable threshold. | HMI-CONTRAST-01 |
| `VIEW-NAV-01` | `ftview_design_check` | A display no other display navigates to. | VIEW-NAV-01 |
| `VIEW-NAV-02` | `ftview_design_check` | A display something navigates to that holds no `gotoButton` or `closeButton`, so an operator who lands there cannot leave. | VIEW-NAV-02 |
| `VIEW-LAYOUT-02` | `ftview_design_check` | A display whose canvas differs from the canvas most displays in the export share, with both sizes and how many displays share the common one. Popup display settings are excluded because a popup is not where the operator lives. | VIEW-LAYOUT-02 |
| `DRAFT_OVERLAP` | `ftview_validate` | Two objects this draft places partly over each other, with both names and the overlap area. Whole-display backdrops and panels containing their children are excluded. | VIEW-LAYOUT-01 |
| `HMI-TARGET-01` | `optix_design_check` | A pressable widget smaller than 44 px on either side, with both extents. | HMI-TARGET-01 |
| `HMI-TARGET-02` | `optix_design_check` | A pressable widget whose own text the model reports as empty. | HMI-TARGET-02 |
| `HMI-CONTRAST-01` | `optix_design_check` | Text below 4.5:1 against the smallest filled object that contains it — a label on a header band is judged against the band, not the backdrop. | HMI-CONTRAST-01 |
| `VIEW-NAV-01` | `optix_design_check` | A screen holding no pressable control at all, so it has no navigation area of its own. | VIEW-NAV-01 |
| `VIEW-NAV-02` | `optix_design_check` | A screen whose controls carry no event handler, so an operator who lands here has no way out through this screen. | VIEW-NAV-02 |
| `VIEW-LAYOUT-02` | `optix_design_check` | A screen whose extents differ from the window canvas the project declares. When the screen node reports no geometry, the evidence says it was measured from the largest fill inside the screen. | VIEW-LAYOUT-02 |
| `OPTIX-UI-01` | `optix_design_check` | Two sibling screens holding the same hand-built child set — a device copy-pasted instead of modelled as a type with instances. | OPTIX-UI-01 |
| `OPTIX-UI-02` | `optix_design_check` | A NetLogic, DelayedTask or LongRunningTask node living inside the screen composition. | OPTIX-UI-02 |
| `TAG_CSV`, `UNPARSED_FILE`, `DUPLICATE_*` | `ftview_check` | Structural problems in the export itself, before any design question. | — |

Two of the View rule ids predate the corpus pages that describe them. `ftview_design_check` has always
reported a small touch target as `VIEW-HPM-02` and a captionless control as `VIEW-HPM-01`, while the
corpus rules of those names say something else (colour used for deviation, and leading with an
overview). The ids stay because findings and tests already cite them; the Basis column names the corpus
rule the finding actually encodes, which is `HMI-TARGET-01` and `HMI-TARGET-02` in
`packages/resources/corpus/hmi/hmi-targets-and-labels.md`. The same correction applies to the contrast
finding, whose number lives in `hmi-colour-and-contrast` as `HMI-CONTRAST-01` while `VIEW-COLOR-01` in
`view-colour-and-contrast` says what the colours mean.

`optix_design_check` reads the live model rather than an export: one detail map of the screen, then a
describe of each object, then the window's own geometry. A control whose colour the bridge did not
report, or a screen whose own extents it did not report, is listed in `unchecked` with the reason, so a
clean summary and a blind summary are not the same result.

Each `DUPLICATE_OBJECT_NAME` finding states how many objects share the name and carries that
`count` in its evidence, so a display with eight `Value` objects is one finding rather than eight
near-identical rows. The ME alarm setup file (`<alarms>` root) is an alarm configuration, not a
display: `ftview_open` returns it in `alarm_files`, and it is never reported as an `UNPARSED_FILE`.

`ftview_check` reports what it could not check. `coverage.tag_binding` says
`not run: this export has no HMI tag CSV` when the export carries no tag table, because
`TAG_NOT_BOUND` and the alarm tag rule read that table and would otherwise be silent; the
summary says the same in words rather than leaving zero findings that look like a clean bill
of health. `coverage.alarms` names the alarm setup file it reviewed, or says there was none,
so an export with no `Alarms.xml` is distinguishable from one whose alarms are all sound.

## Workflow

Call `ftview_check` first for structural health, then `ftview_design_check` for the
design rules, then `ftview_validate` on a draft. On the Optix side the order is
`optix_screen` with the dry run left on, `optix_design_check` on the screen it drafted, then the apply,
then `optix_preview` and `optix_screenshot` to look at the result. For the PLC side call `run_checks`,
filter with `rule` and `severity` when the unfiltered list is long, and read `basis`
to cite the corpus page behind a finding. Every finding names the program, routine,
rung, display or object it concerns so the fix is a local edit rather than a review
of the whole project.
