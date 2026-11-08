---
id: migration-unknown-operands
title: The question mark operands
domain: migration
level: specialist
basis: [Converting PLC-5/SLC 500 Logic to Logix-Based Logic 1756-RM085I, observed exports]
tags: [migration, operands, timers, counters]
applies_to: [migration]
rules: [MIGRATION-OPERAND-01, MIGRATION-OPERAND-02, MIGRATION-OPERAND-03]
---
## Principle

Where the wizard could not reconstruct an operand it writes `?`: `TON(T4[3],?,?)`, `CTU(C5[4],?,?)`,
`FAL(R6[0],?,?,ALL,C44[R6_000_POS].PRE,N30[33])`. The `?` is not missing information — in the timer and counter
cases it is information the wizard had and did not carry, because the legacy operand list still records it.

## Rules

- **MIGRATION-OPERAND-01** Read the legacy rung before touching a `?`. If the legacy operand list holds the
  preset and the accumulator, the answer is in hand: `TON{T4:3, 0.01, 50, 50}` means a 0.5 s preset, and the
  Logix form is `TON(T4[3])` with `T4[3].PRE := 0.5`.
- **MIGRATION-OPERAND-02** Answer timers and counters from the text; escalate everything else. Once the numeric
  operands are stripped from a `FAL`, a `CPT` or a `PID`, the legacy text no longer states the expression, so the
  rewrite is a decision.
- **MIGRATION-OPERAND-03** Repair the whole rung at once. A rung with two unknowns is one edit, not two, and a
  half-repaired rung is harder to review than an unrepaired one.

## Apply

`migration_resolve` returns two shapes: a per-site entry for each `?`, and a `rungText` when every unknown on
that rung is answerable. Take `rungText` when it is offered — it is the complete rung, not a fragment.

## Anti-patterns

Guessing a preset. Leaving `?` in a rung that imports (it will import, and it will not time). Repaired rungs with
no note about where the number came from.
