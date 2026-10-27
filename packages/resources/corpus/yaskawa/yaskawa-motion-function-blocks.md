---
id: yaskawa-motion-function-blocks
title: Motion function blocks: execute, done, error
domain: yaskawa
level: specialist
basis: [Yaskawa]
tags: [motion, fb, execute]
applies_to: [mwi]
rules: [YAS-MOT-01, YAS-MOT-02, YAS-MOT-03]
---
## Principle

Motion FBs are asynchronous. `Execute` starts a job; `Done`, `Busy`, `Error` and `ErrorID` report it. The
scan that sets `Execute` is not the scan that finishes.

## Rules

- **YAS-MOT-01** Drive one FB per axis command and keep `Execute` true until `Done` or `Error`; a one-scan
  pulse is a race.
- **YAS-MOT-02** Handle `Error` before issuing the next command, and map `ErrorID` to the operator message
  in one place.
- **YAS-MOT-03** Re-arm with a fresh edge after a fault reset. Do not leave `Execute` latched across a
  reset.

## Apply

Model each axis as `Idle → Commanded → Busy → Done/Faulted` and let the FB signals drive the transitions.

## Anti-patterns

Ignoring `Busy` and sending a second move; clearing `Error` by writing `Execute` false; one FB shared by two
axes.
