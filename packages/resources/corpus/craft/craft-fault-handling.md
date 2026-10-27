---
id: craft-fault-handling
title: Faults: detect, latch, annunciate, reset
domain: craft
level: practitioner
basis: [field practice]
tags: [faults, reset, diagnostics]
applies_to: [l5x, mwi, optix]
rules: [CRAFT-FAULT-01, CRAFT-FAULT-02, CRAFT-FAULT-03]
---
## Principle

A fault is a fact about the machine, not a message. The logic must detect it, remember it, tell someone,
and define recovery.

## Rules

- **CRAFT-FAULT-01** Detect at the source and set one bit for one cause; do not infer a fault from a
  downstream symptom.
- **CRAFT-FAULT-02** Latch with a reset that only succeeds when the cause is gone; a reset that always
  clears is a way to run a broken machine.
- **CRAFT-FAULT-03** Record first-out and the time, and surface it where the operator acts.

## Apply

For each fault, write the four sentences: what detects it, what it stops, how it is shown, how it is
cleared.

## Anti-patterns

Faults that clear themselves on the next scan; one reset for unrelated faults; a fault with no operator
message.
