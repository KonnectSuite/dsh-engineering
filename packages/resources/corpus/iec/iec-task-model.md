---
id: iec-task-model
title: Tasks, scan time and determinism
domain: iec
level: specialist
basis: [IEC 61131-3]
tags: [task, scan, watchdog]
applies_to: [mwi, l5x]
rules: [IEC-TASK-01, IEC-TASK-02, IEC-TASK-03]
---
## Principle

The task schedule is part of the program. A control loop that moved to a slower task is a behaviour
change even when the code is untouched.

## Rules

- **IEC-TASK-01** Put motion and fast interlocks in a fixed-rate task; put HMI handshakes and diagnostics in
  a slower one. Document the rate next to the POU.
- **IEC-TASK-02** No unbounded work in a cyclic task: no file I/O, no waiting loops, no long string
  handling. Bound every loop.
- **IEC-TASK-03** Size the watchdog from the measured worst case, not the average. A watchdog that fires
  only under load is doing its job.

## Apply

Record for each task: period, priority, watchdog, worst measured scan, and what happens when it overruns.

## Anti-patterns

Copying a fast task into a slow one and accepting the jitter; hiding a blocking call behind a one-shot.
