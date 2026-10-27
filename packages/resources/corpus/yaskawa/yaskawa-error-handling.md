---
id: yaskawa-error-handling
title: Errors, acknowledgements and retries
domain: yaskawa
level: practitioner
basis: [Yaskawa]
tags: [error, reset, retry]
applies_to: [mwi]
rules: [YAS-ERR-01, YAS-ERR-02, YAS-ERR-03]
---
## Principle

An error has a cause, a reaction and a recovery. Without all three it is just a red light.

## Rules

- **YAS-ERR-01** Record the first error with its source and timestamp; later errors are consequences.
- **YAS-ERR-02** Reset only what failed, and only when the cause is gone. A global reset that clears
  everything hides the second fault.
- **YAS-ERR-03** Retry only idempotent operations, with a bounded count and a delay. Motion commands are
  not idempotent.

## Apply

Keep one error table: code, text, severity, reaction, reset condition. The HMI and the code read the same
table.

## Anti-patterns

Resetting on a timer; retrying a move without checking `ErrorID`; error text that says "axis fault" with no
axis number.
