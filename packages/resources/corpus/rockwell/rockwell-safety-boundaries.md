---
id: rockwell-safety-boundaries
title: Where safety does not belong
domain: rockwell
level: specialist
basis: [Rockwell]
tags: [safety, boundaries]
applies_to: [l5x]
rules: [ROCK-SAFE-01, ROCK-SAFE-02]
---
## Principle

A standard task cannot be trusted to remove power from a hazard. Safety functions belong in a certified
safety controller or hardwired circuit, not in the logic this bundle edits.

## Rules

- **ROCK-SAFE-01** Never move an E-stop, guard interlock or light curtain function into standard logic, and
  never bypass one to make a sequence run.
- **ROCK-SAFE-02** Treat safety tags as read-only evidence: they may be read for indication, never forced
  or overwritten.

## Apply

When a request asks for a change that would weaken a safety function, stop, explain the boundary and ask
for a safety review. The bundle's tools refuse protected targets; do not work around them.

## Anti-patterns

Using a standard output as a safety output; disabling a guard to test a cam; "temporarily" forcing an
interlock.
