# Capabilities, shown

Every image on this page was produced on this machine by the bundle itself, or by the vendor IDE opening what the
bundle wrote. Each caption names the call that produced it, so a picture can be traced back to a tool and a file rather
than to a marketing claim.

Two rules the rest of this page follows:

- **A picture shows one thing.** The caption says what it proves and what it does not. A screenshot of a chart that
  compiles is not a statement about how that chart runs.
- **Nothing customer-specific is shown.** The L5X figures come from the export committed with this repository
  (`packages/l5x/test/fixtures/sample.l5x`); the Studio figures come from a synthetic benchmark project
  (`E2E_Standard`); the display figure is a display authored for this bundle's own test bed.

## Studio 5000 L5X

### Reviewing logic you did not write

`l5x_routine_diagram` draws a routine from the parsed rungs, so an unfamiliar program can be read as a picture before
anyone opens Studio.

![Seven rungs of MainProgram/MainRoutine, drawn by l5x_routine_diagram](figures/l5x-routine-diagram.png)

The figure is `l5x_routine_diagram` on `MainProgram/MainRoutine` of the committed test export: seven rungs, each with
its comment, its instruction mnemonics and its resolved operands — `XIC(StartPB)` sealing in through
`OTE(SystemRunning)`, an AOI call, `CTU(CycleCounter,1,100)`, `TON(MainTimer,1000,0)`, `OTU(MainTimer.TT)` and
`MOV(60.0,LineSpeed)`.

What it proves: the export parses, the rung text is understood, and the operands resolve. What it does not prove: this
is a schematic drawn from the parsed text, not a Studio rendering, and it says nothing about how the logic executes.

### Composing a function block sheet, drawn by the vendor IDE

![A composed ADD sheet open in Logix Designer 37](figures/studio-fbd.png)

`draft_fbd` staged one sheet — an `ADD` block `add1` whose instance tag carries the `FBD_MATH` structure, two input
references `r1` and `r2`, one output reference `r3`, and wires naming the pins `SourceA`, `SourceB` and `Dest`.
`draft_apply` wrote it and `verify_offline_l5x` imported and built it with **0 warnings / 0 errors**. The picture is
Logix Designer 37 opening that ACD and drawing the sheet: the block with its three pins, both inputs wired in, `Dest`
wired out.

What it proves: the XML the composer emits is the sheet the IDE draws. What it does not prove: function-block execution
semantics — `coverage` says so on every result.

### Composing an SFC chart — and the defect looking at it found

![The first composed chart: two steps drawn on top of each other](figures/studio-sfc-before.png)

The first chart this bundle composed contained two steps and drew **one box**. `draft_sfc` had defaulted every step to
`X=300, Y=100`, so `Step_1` and `Step_2` were written at the same point. Studio does not object — coordinates are
presentation, not structure — so the SDK build reported 0 warnings and 0 errors, and no test could see it.

![The same chart after the layout fix: three elements in three places](figures/studio-sfc.png)

The fix lays steps out down the sheet at a 200 pitch and puts each transition between the steps its links join. The
same composition now draws `Step_1` (initial), `Tran_1` with its `Timer.DN` condition, and `Step_2` in three places.
This pair is kept deliberately: it is the argument for looking at output, not only for building it.

What it proves: the chart compiles and is drawn as three separate elements. What it does not prove: chart execution —
which Studio itself only demonstrates at run time.

## FactoryTalk View ME

### Authoring a display, rendered by the bundle's own renderer

![A display authored with the ftview draft tools and rendered by the bundle](figures/ftview-authored-display.png)

The display was staged with the `ftview_draft_*` family — real push buttons with per-state colours, a value lamp, a
visibility banner and navigation buttons — and drawn by the bundle's display renderer, which reads the same `<gfx` tree
the vendor export carries.

What it proves: object geometry, state colours, captions and visibility survive as authored, and a reviewer can judge a
screen without a PanelView terminal. What it does not prove: terminal behaviour, vendor-widget fidelity, or that an ME
runtime will accept the application — import and runtime creation are Studio steps, and the bundle says so.

## How each figure was produced

| Figure | Command or call | Input |
|---|---|---|
| `l5x-routine-diagram.png` | `open_project` then `l5x_routine_diagram {program: "MainProgram", routine: "MainRoutine"}` | `packages/l5x/test/fixtures/sample.l5x` |
| `studio-fbd.png` | `draft_fbd` → `draft_apply` → `verify_offline_l5x` → open the ACD in Logix Designer 37 | synthetic `E2E_Standard` project |
| `studio-sfc-before.png`, `studio-sfc.png` | `draft_routine` + `draft_sfc` → `draft_apply` → `verify_offline_l5x` → open in Logix Designer 37 | the same project, before and after commit `8495915` |
| `ftview-authored-display.png` | `ftview_draft_display_create` + `ftview_draft_object_add` … → `ftview_render` | a display authored for this bundle's test bed |

The Studio figures were taken on a Windows host with Logix Designer 37.11 and the Logix Designer SDK service running;
the build verdict in each case is Studio's own, reported verbatim by `verify_offline_l5x`.

## What an image cannot prove

An image is evidence of a rendering, not of a behaviour. None of these figures establishes that online logic matches the
export, that a chart executes in the order it is drawn, that a display behaves on a terminal, or that a controller will
accept a download. Every tool result carries a `coverage` block naming what it could not establish, and that block — not
a screenshot — is the honest answer to "does this work".
