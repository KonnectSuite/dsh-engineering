---
id: iec-ld-fbd-equivalence
title: Ladder, FBD and ST: same logic, different reading
domain: iec
level: intro
basis: [IEC 61131-3]
tags: [ladder, fbd, st, translation]
applies_to: [l5x, mwi]
rules: [IEC-LANG-01, IEC-LANG-02]
---
## Principle

The languages are notations, not designs. Choose the one that makes the intent obvious and keep one
implementation of each behaviour.

## Rules

- **IEC-LANG-01** Ladder for permissives, interlocks and outputs an electrician will trace; ST for
  arithmetic, loops and state machines; FBD for signal flow. Do not translate a whole routine because you
  prefer another language.
- **IEC-LANG-02** One behaviour, one implementation. A seal-in duplicated in LD and ST will diverge; if a
  block is reused, make it an FB/AOI and call it.

## Apply

When reviewing inherited code, read it in its own language before proposing a rewrite. A "modernisation"
that changes scan-order semantics is a behaviour change.

## Anti-patterns

ST one-liners that hide three outputs; ladder with arithmetic chains no one can trace.
