# SFC_ROUTINE_PRESENT: what the marker means

`SFC_ROUTINE_PRESENT` is the migration census's name for a specific hole: the legacy
project contains a sequential function chart routine (an SFC), and the wizard cannot
express that routine as ladder rungs. Instead of silently dropping the sequence, the
wizard writes a marker that records the routine was there. The marker is a statement
about the source, not about the target: it says "there is a sequence here to author".

## Why the wizard cannot translate it

Ladder is a scan of rungs with no notion of steps or transitions. An SFC is a state
machine: steps, transitions, and actions with qualifiers. Converting an SFC to ladder
mechanically produces either a tangle of latches or a program that looks similar and
executes differently, because the SFC's step timing and transition evaluation are not
the same as rung order.

Logix does support SFC routines, so the honest migration is to author the SFC in the
Logix project rather than to flatten it into ladder text. The marker marks the routine
as "needs an SFC author", and the plan carries that as engineering work.

## What the marker records

A `SFC_ROUTINE_PRESENT` site carries, in the census:

- the routine and program it belonged to,
- the legacy file identity from the source project,
- the marker text the wizard wrote,
- the census total for the program, so a report can state "two SFC routines, both
  marked".

The marker is a site, not a count of steps. The census cannot tell you the sequence's
behaviour; it can only tell you that a sequence exists and where it lived.

## How to resolve it

1. Read the legacy SFC: steps, transitions, actions, and qualifiers. The assessor's
   routine list tells you the routine name and program.
2. Rebuild it as a Logix SFC routine in the same program, or as a structured-text state
   machine if the team maintains ST better than SFC. The choice is engineering, and the
   plan should name the reason.
3. Preserve the step timing and transition conditions exactly, including the qualifier
   semantics for actions (`N`, `S`, `R`, `P`, `L`, `D`, `SD`, `DS`). A qualifier that
   is misread changes when an action executes, not whether it is listed.
4. Prove each path: step through the sequence, force each transition, and record the
   test in the exception's evidence.
5. Only then mark the marker resolved.

## Common mistakes

- **Treating the marker as an instruction.** It is not a Logix instruction and it will
  not run. Do not "fix" it by deleting the rung; the routine's behaviour disappears
  with it.
- **Flattening to ladder because the build is easier.** A flattened SFC often passes a
  build and fails a sequence test. The level of abstraction is the point of the SFC.
- **Restoring the sequence from the marker alone.** The marker names the source; the
  legacy project (or the assessment output) is what carries the steps.
- **Forgetting the handshakes.** SFC routines usually talk to the rest of the program
  through bits; those bits need names and owners in the Logix program too.

## Where it fits in the gates

The marker belongs to the engineer stage: it survives lint (it is not a lint rule),
survives import (the routine is absent, not malformed), and is caught by the census.
The migration is not done while any `SFC_ROUTINE_PRESENT` site is unresolved, and the
report must show each site with the routine it became. A project with a marked SFC
routine but an empty Logix routine named the same is not migrated; it is a stub.

## Related signals

- `SFC_ROUTINE_PRESENT` — the source had an SFC routine; author it on the target.
- `ROUTINE_UNBALANCED` — the `.L5K` text itself is truncated or malformed.
- `ROUTINE_MISSING` — the comparison found a legacy routine with no Logix counterpart.
  An SFC marker often produces this pair: the census records the intent to author, and
  the comparison records the routine that is still absent.
