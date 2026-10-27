---
id: rockwell-tag-naming
title: Tag names that carry meaning
domain: rockwell
level: practitioner
basis: [Rockwell]
tags: [naming, tags]
applies_to: [l5x, ftview]
rules: [ROCK-NAME-01, ROCK-NAME-02, ROCK-NAME-03]
---
## Principle

A tag name is the only documentation that survives every export. Make it say direction, owner and
meaning.

## Rules

- **ROCK-NAME-01** Prefix by direction and role: `In_` field input, `Out_` field output, `Cmd_` command to
  equipment, `Sts_` status back, `Hmi_` operator interface, `Cfg_` configuration.
- **ROCK-NAME-02** One spelling per concept across PLC and HMI. If the HMI says `AutoMode`, the PLC does not
  say `Auto_Mode_Cmd`.
- **ROCK-NAME-03** No abbreviations that are not in the plant's vocabulary; spell `Conveyor`, not `Cnvyr`.
  Units belong in the name or the description, not both inconsistently.

## Apply

When a project has an established prefix scheme, follow it even if a better one exists: consistency beats
elegance in maintenance.

## Anti-patterns

`Tag1`, `Spare`, `Test`; names that change with the project version; HMI tags shadowing PLC tags with
different meaning.
