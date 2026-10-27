---
id: iec-sequences-and-sfc
title: Sequences, steps and timeouts
domain: iec
level: practitioner
basis: [IEC 61131-3]
tags: [sequence, sfc, step]
applies_to: [mwi, l5x]
rules: [IEC-SEQ-01, IEC-SEQ-02, IEC-SEQ-03]
---
## Principle

A sequence is a state machine whose states are process steps. The difference is that each step has a
completion condition and a timeout.

## Rules

- **IEC-SEQ-01** Give every step a timeout and a defined action on expiry. A sequence that can wait forever
  is a fault waiting for an operator.
- **IEC-SEQ-02** Separate the step advance from the step action: advance on `done OR timeout`, act on the
  current step.
- **IEC-SEQ-03** Make hold, abort and reset explicit transitions to named states, not flags that freeze
  the sequence wherever it was.

## Apply

Draw the sequence (states and transitions) before coding it, and keep the drawing with the project. SFC is
appropriate when the drawing is the specification; a `CASE` machine is simpler when steps share actions.

## Anti-patterns

Advancing on a timer alone; a reset that clears outputs without leaving the step.
