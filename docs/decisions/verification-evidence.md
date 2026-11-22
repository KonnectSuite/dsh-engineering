# Decision: evidence is three-state, not pass/fail

- Status: accepted (this change)
- Scope: the verification gate for this batch, and every future batch that has
  a surface it cannot run on the build host.

## Context

The plan's gate, drills and release criteria were written as a single
pass/fail checklist. Two surfaces cannot be executed on this host:

- **MotionWorks IEC (MWI)** — the IDE is not installed. Compile, profile and
  live-session checks cannot run. The owner has approved IDE-free fixes to the
  component, but not a claim that it was verified end to end.
- **ECAD** — the component is removed in this change. Only the DXF/DWG drawing
  preview remains, and its engine path is exercised offline; the AryaCAD bridge
  is not part of this batch.

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
| Everything else in the gate | pass expected | gate command output on the release commit |

## Consequences

- The gate runner emits a JSON evidence file with one record per item:
  `{ id, state, command, result, reason?, substitute_evidence? }`.
- `HANDOFF.md` renders the same table; no gate item is silently omitted.
- A future host that has MotionWorks IEC installed runs the deferred items and
  moves them to pass — the record, not the plan, is the source of truth.
- Release notes name the not-runnable set explicitly.
