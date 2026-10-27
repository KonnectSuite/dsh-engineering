---
id: iec-state-machines
title: State machines that fail predictably
domain: iec
level: practitioner
basis: [IEC 61131-3]
tags: [state-machine, case, sequence]
applies_to: [mwi, l5x]
rules: [IEC-SM-01, IEC-SM-02, IEC-SM-03]
---
## Principle

A state machine is a contract: exactly one state is active, every transition has a cause, and an
unexpected state is handled rather than ignored.

## Rules

- **IEC-SM-01** Use one integer or enumeration `step` for the active state and a `CASE` (ST) or
  integer-compare chain (LD) to act on it. Do not scatter `IF step =` tests through the program.
- **IEC-SM-02** Every `CASE` has an `ELSE` (or a default branch) that forces a known safe state and raises
  a diagnostic. An out-of-range step must never leave outputs energised.
- **IEC-SM-03** Entry actions run once on the transition; continuous actions live in the state body. Mixing
  them makes a re-entry repeat motion.

## Apply

Name states after the machine condition (`Idle`, `Homing`, `Ready`, `Cutting`, `Faulted`), not after
numbers in the HMI. Keep a parallel `stepTime` for timeouts.

## Anti-patterns

Two variables claiming to be the state; timers inside the transition condition; a `GOTO` around the
`CASE`.
