---
id: iec-types-and-scaling
title: Types, ranges and scaling without surprises
domain: iec
level: practitioner
basis: [IEC 61131-3]
tags: [types, scaling, real]
applies_to: [mwi, l5x, optix]
rules: [IEC-TYPE-01, IEC-TYPE-02, IEC-TYPE-03]
---
## Principle

Most field faults blamed on "the PLC" are a divide by zero, an overflow, or a REAL compared with `=`.

## Rules

- **IEC-TYPE-01** Declare the narrowest type that holds the range, and say the range in the comment
  (`INT 0..1000 mm`). Never rely on the default type.
- **IEC-TYPE-02** Guard every division and scale: check the divisor, clamp the result, and handle the
  out-of-range case explicitly.
- **IEC-TYPE-03** Compare REALs with a tolerance, never with equality. For counters and positions, use
  integers where the resolution allows.

## Apply

Keep one scale/offset pair per signal, in one place. If two blocks scale the same input, they will
disagree.

## Anti-patterns

`INT` for a millisecond timer that can exceed 32 s; scaling in the HMI and again in the PLC; a REAL used
as a state number.
