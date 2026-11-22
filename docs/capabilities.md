# Capabilities, shown

This page is the evidence page: every claim about what the bundle can do is paired with the figure
or measurement that produced it. The captures were made on a Windows workstation by the bundle
itself or by the vendor engine it drives, and every one names the call or the state it records.
The pages that explain *how* are [Products](products/README.md), [Architecture](architecture.md)
and the per-product references.

Two rules this page follows:

1. **A picture shows one thing.** It is a claim about the call, the file, or the screen — not about
   the model that wrote the source, and not about the machine the logic runs on.
2. **Nothing here is customer-specific.** The L5X captures come from the bundle's own fixtures
   (`packages/l5x/test/fixtures/sample.l5x`), the Studio captures from a synthetic
   `E2E_Standard` programme, and the FactoryTalk View capture from the bundle's own test bed.

## Studio 5000 L5X

Four viewer figures, each rendered from an export the bundle produced and read back:

![A 7-rung ladder routine in the bundle's ladder viewer](figures/viewer-ladder.png)

The ladder face draws a routine from its `NeutralText`, not from a picture held in the L5X: rung
numbers, the comment above the rung, the branch, and every instruction's operand. This routine is
`XIC(StartPB)` seal-in to `OTE(SystemRunning)`, an AOI call, `CTU(CycleCounter,1,100)`,
`TON(MainTimer,1000,0)`, `OTU(MainTimer.TT)` and `MOV(60.0,LineSpeed)`.

![A Structured Text routine with line numbers and structure colouring](figures/viewer-st.png)

ST is shown with its structure highlighted rather than parsed into a tree, because a reader
reviewing ST cares about the statements.

![A function block diagram sheet drawn from its FBD routine](figures/viewer-fbd.svg)

FBD sheets keep their blocks, pins and wire names, including the reference symbols (`IREF`,
`OREF`) an engineer looks for when a block reads or writes a tag.

![A sequential function chart drawn from its SFC routine](figures/viewer-sfc.svg)

SFC charts are drawn as steps, transitions and directed links, with each transition's condition
shown as the ST it is.

The same text can leave the bundle and enter Studio unchanged. This is the step that matters: a
rung copied from a composition response is pasted into a Studio 5000 ladder editor, and Studio
accepts it — rung 4 is `XIC(Run)TON(Timer,2000,0);`, in a 5069-L320ER project at revision 37.11,
with the Errors tab at 0/0/0. The dropdown that says *In ASCII Text* has to be switched to *In
Neutral Text*, which is the one piece of knowledge this picture exists to carry.

![A pasted rung in a Studio 5000 ladder editor, Errors tab at zero](figures/studio-neutral-text-paste.png)

A routine diagram is the review surface: one page of rungs drawn by `l5x_routine_diagram`, so a
reviewer can look at a routine instead of reading NeutralText.

![Seven rungs of a routine drawn on one page](figures/l5x-routine-diagram.png)

FBD and SFC are authored through the draft surface and verified by the vendor engine, not by the
bundle's own reader. Both captures below come from a project that built: `l5x_verify_offline_l5x`
returned 0 errors / 0 warnings from Logix Designer 37, and the figure is the export read back
afterwards.

![An ADD block and three reference symbols on a built FBD sheet](figures/studio-fbd.png)

The SFC pair is kept deliberately. `l5x_draft_sfc` wrote a valid chart, and every step defaulted to
`X=300, Y=100`, so the chart parsed, verified, and drew as one box on top of another. The first
image is that project. The second is the same chart after the steps were laid out on a 200-pixel
pitch in commit `8495915`.

![A 3-step SFC with every step stacked at the same default coordinate](figures/studio-sfc-before.png)

![The same SFC after the steps were moved onto a pitch](figures/studio-sfc.png)

## FactoryTalk Optix

The Optix row is a live-IDE product: the bundle drives a running Studio through the bridge, authors
the project, and reads back what the vendor's own preview and runtime serve. The 21 captures in
[`port/optix-live-proof/`](port/optix-live-proof/) are the record of that work, and they are grouped
here by what they prove. The page that explains the calls is
[Optix](products/optix/README.md), with [screens](products/optix/screens.md),
[project](products/optix/project.md), [artwork](products/optix/artwork.md),
[NetLogic](products/optix/netlogic.md) and [production](products/optix/production.md) beside it.

**A project authored through the bridge renders at runtime.** The Studio tree shows what landed;
the runtime captures show what an operator would see from the same button.

![The Studio project tree after the components were created](port/optix-live-proof/03-studio-tree-components.png)

![A screen authored through the bridge, served by the runtime](port/optix-live-proof/12-app-authored-screen-runtime.png)

![The preview capture path in an application session](port/optix-live-proof/13-dev-app-preview-capture.png)

![The preview render at 1920 by 1080](port/optix-live-proof/14-preview-render-1920x1080.png)

**Screens built from the library's composites.** The shell, the alarm centre and the sample line
are templates applied to a project, not hand-placed rectangles; the captures are the running
result rather than the design tree.

![The Overview screen as the runtime serves it](port/optix-live-proof/01-overview-runtime.png)

![The alarm centre built from library composites](port/optix-live-proof/02-alarmcentre-composites-runtime.png)

![The shell's Home screen](port/optix-live-proof/04-shell-home-runtime.png)

![The shell's Pumps screen](port/optix-live-proof/05-shell-pumps-runtime.png)

**A sample line running.** The line demo is the end-to-end case: overview, controls and alarms over
the same project, with alarm messages carrying the values that raised them.

![The line demo overview](port/optix-live-proof/06-line-overview-running.png)

![The line demo controls](port/optix-live-proof/07-line-controls-running.png)

![The line demo alarm list showing bottle alarms](port/optix-live-proof/08-line-alarms-bottles.png)

![The line demo overview, second run](port/optix-live-proof/15-linedemo-overview-runtime.png)

![The line demo controls, second run](port/optix-live-proof/16-linedemo-controls-runtime.png)

**The bundle's own row, working in an installed application.** These are the captures that show the
`optix` row is a row: a settings page the Plugins page renders, the rows running, and an ordinary
application session asking the row what the machine can do.

![The optix row's settings page in the Plugins page](port/optix-live-proof/09-dev-optix-row-settings.png)

![The engineering rows running in the application](port/optix-live-proof/10-dev-rows-running.png)

![An application session calling optix_status](port/optix-live-proof/11-dev-app-calls-optix-status.png)

**Engagement replays.** These record a task as it was given and the trajectory the bundle took, in
the order it took it — the brief first, then the tools, then the hand-off. The last one starts from
the standards instead of the brief, which is what the `engineering-standards` skill asks for.

![An engagement replay that starts from the brief](port/optix-live-proof/17-engagement-replay-a-brief-first.png)

![The trajectory of that replay](port/optix-live-proof/18-engagement-replay-a-trajectory.png)

![An engagement replay that starts from the standards](port/optix-live-proof/21-engagement-replay-a2-standards-first.png)

**The corpus changes an answer.** The pair below is the same prompt on the same machine: the first
session had no `engineering_reference` tool mounted, the second had it, and the answer cites rule
IDs.

![A session with no engineering reference tool](port/optix-live-proof/19-no-engineering-reference-tool.png)

![The same session with the corpus answering](port/optix-live-proof/20-engineering-reference-live.png)

## FactoryTalk View

An ME display authored with the draft surface and drawn by the bundle's own renderer, before
anything was imported into Studio. Palette, button faces and captions come from the
[house-style profile](products/resources.md), which is the point: the display is authored in the
plant's own conventions rather than in whatever the tool defaults to.

![A FactoryTalk View ME display drawn by the bundle's renderer](figures/ftview-authored-display.png)

The export, structural checks, staged edits and comparison are described in
[FactoryTalk View](products/ftview/README.md), and the display-to-PLC join in
[cross-reference](products/ftview/cross-reference.md).

## DXF/DWG drawing preview

The drawing preview's own evidence is 11 headless captures: a DXF opened, panned, zoomed, laid out by
tab, filtered by layer, searched by text, and exported to SVG and PNG. They are not reproduced here
because the pane is a workspace surface, not a document claim. The pane's coverage badge reports the
conversion percentage it measured per sheet instead of implying full fidelity, and
[DXF/DWG](products/ecad/README.md) states which entities convert and which are reported as
unsupported.

## MotionWorks IEC

No captured evidence. This host has no MotionWorks IEC install with a reachable IDE bridge, so
every MotionWorks claim on [MotionWorks IEC](products/mwi.md) is a claim about code that has been
compiled and tested against the bridge's contract, not about a project edited on a running IDE.
The 24 tools, the backup contract and the compile path are implemented and covered by tests; the
gap is the machine, and the page says so.

## Evidence per surface

| Surface | Evidence | Where |
|---|---|---|
| L5X read, view, author, verify | viewer figures, the Studio paste, the FBD and SFC round trips above; `pnpm e2e:ladder`, `e2e:diagrams`, `e2e:routines`, `e2e:actions` | [L5X](products/l5x.md) |
| FactoryTalk View | authored display rendered by the bundle's own renderer; `ftview_check`, `ftview_compare` and the export tests | [FactoryTalk View](products/ftview/README.md) |
| FactoryTalk Optix | 21 captures above, from a bridge-driven Studio and the runtime serving the project | [Optix](products/optix/README.md) |
| MotionWorks IEC | none on this host | [MotionWorks IEC](products/mwi.md) |
| DXF/DWG drawing preview | 11 headless pane captures of the read-only drawing pane | [Drawing preview](products/ecad/README.md) |
| Migration | the fixtures the comparison and resolver run against; no customer project | [Migration](products/migration.md) |
| PLC-5 | read-only headless opens of the fixtures through the RSLogix 5 automation server | [RSLogix 5](products/plc5.md) |
| Standards corpus | 70 pages, indexed and searched; the rule IDs cited across these pages | [Standards](products/resources.md) |

## How each figure was produced

| Figure | Produced by | What it is |
|---|---|---|
| `figures/viewer-*.png/.svg` | `pnpm docs:figures` — the shipped `packages/viewer/lib/client.js` in headless Chrome | the built face rendering an export |
| `figures/studio-neutral-text-paste.png` | Studio 5000 (Logix Designer 37.11) on this machine, after a paste | the vendor editor accepting the copied rung |
| `figures/l5x-routine-diagram.png` | `l5x_routine_diagram` | one page of rungs drawn from the export |
| `figures/studio-fbd.png` | `l5x_draft_fbd`, then `l5x_verify_offline_l5x`, then `l5x_export_acd_to_l5x` | a built FBD sheet, read back |
| `figures/studio-sfc-before.png`, `figures/studio-sfc.png` | `l5x_draft_sfc` (defaults), then `l5x_draft_sfc` (laid out), `l5x_verify_offline_l5x` | the same chart before and after layout |
| `figures/ftview-authored-display.png` | `ftview_draft_*`, then the bundle's renderer | an authored ME display, not yet imported |
| `port/optix-live-proof/01..08, 12, 15, 16` | the Web presentation engine serving the project | the project as an operator sees it |
| `port/optix-live-proof/03` | Studio's own project tree | what the bridge created |
| `port/optix-live-proof/09..11` | the installed application, Plugins page and a session | the row as it ships |
| `port/optix-live-proof/13, 14` | the preview capture at the window size and at 1920×1080 | the preview path |
| `port/optix-live-proof/17..21` | engagement replays of the same task | the trajectory, and the corpus changing it |

Studio figures come from a Windows host with Logix Designer 37.11 and the SDK service installed;
`l5x_studio_sdk_status` is the call that says whether this host can build at all.

## What an image cannot prove

A rendered screen is evidence of the screen, not of the logic behind it. None of these figures
proves:

- that the rung is safe, or that the sequence it encodes is the one the machine needs;
- that a project opened here matches the controller that runs the line — only an upload and a
  `l5x_compare_projects` can say that (see [Live controllers](live-controller.md));
- that a converted drawing is geometrically exact — the coverage block is the honest answer to
  that, and it is a number, not a picture;
- that a vendor compile succeeded on a machine it did not run on: `l5x_verify_offline_l5x` reports the
  build, and its result is attached to the file it produced.

Every claim in these docs that depends on a number carries that number and the command that
produced it. Where no measurement was taken, the page says so rather than showing a picture.
