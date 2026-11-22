# Decision: evidence is three-state, not pass/fail

- Status: accepted (this change)
- Scope: the verification gate for this batch, and every future batch that has
  a surface it cannot run on the build host.

## Context

The plan's gate, drills and release criteria were written as a single
pass/fail checklist. The installed-software pass executed the vendor-facing
paths for Studio 5000, FactoryTalk View, RSLogix 500, RSLogix 5 and FactoryTalk
Optix on this host, but four surfaces still cannot be executed here:

- **MotionWorks IEC (MWI)** — the IDE is not installed. Compile, profile and
  live-session checks cannot run. The owner has approved IDE-free fixes to the
  component, but not a claim that it was verified end to end.
- **ECAD** — the component is removed in this change. Only the DXF/DWG drawing
  preview remains, and its engine path is exercised offline; the AryaCAD bridge
  is not part of this batch.
- **SLC 500 `.RSS` automation read** — the COM class is registered, but no
  transcript proves the session and the edition is unrecorded; the text and
  Library-export paths are proved against the installed RSLogix 500.
- **PLC-5 `PC5 EXPORT` text document** — the installed RSLogix 5 does not write
  that document on this host (IMPEXP5.EXE is 16-bit and no `.PC5` fixture
  ships); the headless COM read of a real `.RSP` is proved instead.

Recording "not run" in a pass/fail column is how unsupported claims reach a
release note. Recording "failed" would be equally wrong: nothing failed.

## Decision

Every gate item, drill and release criterion is recorded in one of three states:

- **pass** — executed on this host against this exact commit, with the command
  and output recorded in `HANDOFF.md` and the release evidence.
- **fail** — executed and did not meet its acceptance condition; blocks the
  batch.
- **not-runnable** — cannot be executed on this host for a stated reason
  (hardware, software, licence, external surface). It never counts as a pass and
  never blocks on its own, but it must be listed in the release note, in
  `HANDOFF.md` under Known gaps, and — where a tool depends on it — in the
  component's `stabilityNote`.

A not-runnable item is only acceptable when a **substitute evidence** entry
records what was done instead: fixture replays, synthetic corpora, contract
tests, a transcript, or a documented owner decision. The substitute is evidence
about the contract; it is not evidence about the absent surface, and the
wording must not imply otherwise.

An owner decision is required to accept a not-runnable item at release. This
batch's decisions:

| Surface | State | Substitute evidence |
|---|---|---|
| MWI compile / profile / live | not-runnable | fixtures + stub-engine adapter tests; version table and probe-failure tests; release note states MWI was not verified on this host |
| MWI vendor help read path | not-runnable | synthetic CHM tree test for the parser; live install absent |
| ECAD bridge / live AryaCAD | not-runnable | component removed; drawing preview tested against committed DXF/DWG fixtures |
| SLC 500 `.RSS` automation read | not-runnable | text and Library exports proved against the installed RSLogix 500; `.RSS` returns `NOT_LICENSED` with the export-text/record-transcript fix |
| PLC-5 `PC5 EXPORT` text document | not-runnable | headless COM read of a real vendor-saved `.RSP` proved; text tools parser-tested only (no `.PC5` fixture; IMPEXP5.EXE is 16-bit) |
| FTView imported display tree label | not-run | the attended vendor import is proved object-for-object by `ftview_verify_import` (1/1, 87 vendor defaults normalised); Studio 1.8/15 renders the imported display as an unnamed tree row |
| Ten weaker-model scripted tasks per product | not-run | tool-level drills for every product recorded in `HANDOFF.md` |
| Desktop Electron window / refreshed documentation screenshots | not-run | installed composition booted through the CLI/web path; screenshots still from 0.102.0 |
| Everything else in the gate | pass | commands and outputs recorded in `HANDOFF.md`; reinstalled into the fresh Dev profile `verify-0104f` |

The installed-software pass on 2026-11-22 adds executed evidence for Studio 5000 (ACD export →
L5X → draft → SDK build → open in Logix Designer → re-export), FTView (vendor export → authored
display → Add Component import → verify 1/1), RSLogix 500 (real project open → Save As
documentation exports + Library `*.SLC` export → parsed by the SLC tools), RSLogix 5 (real project
created and saved → headless COM read by the PLC-5 tools) and FactoryTalk Optix (bridge 1.0.9 →
screen authored and applied → saved through Studio → rendered by the runtime). That evidence lives
under `AryaCode\tmp\` in the harness checkout and is summarised in `HANDOFF.md`; it is not shipped.

## Consequences

- The gate runner emits a JSON evidence file with one record per item:
  `{ id, state, command, result, reason?, substitute_evidence? }`.
- `HANDOFF.md` renders the same table; no gate item is silently omitted.
- A future host that has MotionWorks IEC installed runs the deferred items and
  moves them to pass — the record, not the plan, is the source of truth.
- Release notes name the not-runnable set explicitly.
