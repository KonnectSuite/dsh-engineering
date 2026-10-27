---
id: iec-st-structure
title: Structured Text that reads like a specification
domain: iec
level: practitioner
basis: [IEC 61131-3]
tags: [st, structure, declarations]
applies_to: [mwi, optix, l5x]
rules: [IEC-ST-01, IEC-ST-02, IEC-ST-03]
---
## Principle

A POU should be readable top to bottom without scrolling sideways: declarations grouped, one intent per
block, no hidden state. The reader is a maintenance technician at 2 a.m., not the author.

## Rules

- **IEC-ST-01** Group declarations by role (`VAR_INPUT`, `VAR_OUTPUT`, `VAR`), then by purpose, with a
  comment above each group. Do not interleave.
- **IEC-ST-02** One POU, one responsibility. A POU that sequences, scales, filters and writes HMI data has
  four reasons to change; split it.
- **IEC-ST-03** No side effects in conditions. A call inside an `IF` that changes state makes the scan
  order part of the logic; call it explicitly, one statement per line.

## Apply

Order the body: input conditioning, permissives, sequence or control, outputs, diagnostics. A reader can
then stop at the block they need.

## Anti-patterns

Deeply nested `IF` (three levels or more) hiding permissives; magic numbers instead of named constants;
declarations added wherever there was space.
