---
id: yaskawa-pou-organisation
title: Organising a MotionWorks IEC project
domain: yaskawa
level: practitioner
basis: [Yaskawa]
tags: [pou, organisation, program]
applies_to: [mwi]
rules: [YAS-POU-01, YAS-POU-02]
---
## Principle

MotionWorks projects mix programs, function blocks and functions. The project tree should say what runs,
what is reused, and what is a library.

## Rules

- **YAS-POU-01** One program per machine function, one function block per reusable device, and functions
  for pure calculations. Do not put device logic in a function (no state).
- **YAS-POU-02** Keep the library blocks (motion, cam, communication) separate from application blocks, and
  never edit a library block in place; wrap it.

## Apply

Read the task assignment before the code: which program runs in which task explains most timing bugs.

## Anti-patterns

All logic in one program; application code inside a vendor library block; a function with `VAR` state.
