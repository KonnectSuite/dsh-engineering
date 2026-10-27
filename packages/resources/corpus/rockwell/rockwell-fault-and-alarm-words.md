---
id: rockwell-fault-and-alarm-words
title: Fault and alarm words
domain: rockwell
level: practitioner
basis: [Rockwell]
tags: [alarms, faults, words]
applies_to: [l5x, ftview]
rules: [ROCK-ALM-01, ROCK-ALM-02, ROCK-ALM-03]
---
## Principle

An alarm is an operator decision, not a log entry. Grouping alarms into words is fine; hiding their cause
is not.

## Rules

- **ROCK-ALM-01** One bit per cause, bit numbers fixed and documented; never renumber a published word.
- **ROCK-ALM-02** Latch the first-out cause and keep it after the condition clears until the operator
  acknowledges. A cleared bit teaches nothing.
- **ROCK-ALM-03** Separate trip causes from warnings: trips stop equipment, warnings do not. Do not make
  every bit a trip.

## Apply

Map each alarm bit to one HMI message and one severity. Check the mapping when an AOI is added.

## Anti-patterns

A word where bit 0 means "any fault"; alarms that reset themselves before the scan writes them; alarm text
that names the block instead of the cause.
