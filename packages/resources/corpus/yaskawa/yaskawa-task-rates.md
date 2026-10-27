---
id: yaskawa-task-rates
title: Task rates and motion determinism
domain: yaskawa
level: specialist
basis: [Yaskawa]
tags: [task, rate, jitter]
applies_to: [mwi]
rules: [YAS-TASK-01, YAS-TASK-02]
---
## Principle

Motion quality is a function of task jitter. A logic task that occasionally overruns is a motion problem
even when the motion code is correct.

## Rules

- **YAS-TASK-01** Keep HMI, file and diagnostic work out of the motion task; communicate through a
  double-buffered structure.
- **YAS-TASK-02** Measure the worst-case scan of each task under load, and set the watchdog from that
  measurement.

## Apply

When a cam shows a periodic defect, compare the defect period with the task period before touching the
profile.

## Anti-patterns

A 1 ms motion task running string formatting; changing the task rate to "fix" jitter without measuring.
