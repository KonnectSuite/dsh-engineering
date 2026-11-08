---
id: migration-arrival-points
title: What a migration has to answer
domain: migration
level: practitioner
basis: [field practice, Converting PLC-5/SLC 500 Logic to Logix-Based Logic 1756-RM085I]
tags: [migration, workflow, evidence, acceptance]
applies_to: [migration]
rules: [MIGRATION-WORK-01, MIGRATION-WORK-02, MIGRATION-WORK-03]
---
## Principle

A conversion produces a project that imports. A migration produces a project an engineer will sign. The gap
between the two is the work: every instruction the wizard could not translate, every module it could not
model, and every address it had to guess.

## Rules

- **MIGRATION-WORK-01** Establish four things before touching the file: the target controller and revision, the
  I/O strategy (keep the existing chassis or map to new modules), whether the HMI is in scope, and who signs the
  acceptance. Without those, every later finding is unanswerable.
- **MIGRATION-WORK-02** Treat each finding as one of three kinds and never mix them: *expected* (the wizard adds a
  main routine, splits a rung), *mechanical* (answerable from the legacy text), *decision* (needs the engineer).
  A report that calls a decision "expected" is the reason migrations ship broken.
- **MIGRATION-WORK-03** Quote the evidence class with every verdict: imported, compiled, or observed running.
  Import is the only one a converted project earns for free.

## Apply

The row's order is fixed: `migration_assess` (what the file is and what it must change), convert with the
vendor wizard, `migration_compare` (did every rung arrive), `migration_resolve` (what the markers mean and what
answers them), then `migration_report` (the document that carries the decisions to the person who signs).

## Anti-patterns

Counting rungs as completeness. Calling an export migrated because it opened. Starting with the HMI because it
is the visible part.
