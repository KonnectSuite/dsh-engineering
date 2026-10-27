---
id: craft-naming
title: Naming that survives the project
domain: craft
level: intro
basis: [field practice]
tags: [naming, readability]
applies_to: [l5x, ftview, mwi, optix]
rules: [CRAFT-NAME-01, CRAFT-NAME-02, CRAFT-NAME-03]
---
## Principle

Names are the interface between the code and everyone who will read it after you.

## Rules

- **CRAFT-NAME-01** One case convention per project (PascalCase for tags is common; follow the project).
  Consistency matters more than the choice.
- **CRAFT-NAME-02** Booleans read as assertions (`MotorRunning`, `DoorClosed`), not as questions or
  negatives (`NotStopped`).
- **CRAFT-NAME-03** Put units and ranges in the description, not hidden in the name (`Temp_C`, `Speed_mps`).

## Apply

When a name does not fit the project's scheme, prefer the project's scheme; when adding a new concept, add
it to the scheme and document the prefix.

## Anti-patterns

`tmp`, `data`, `flag`; names that encode the wiring (`DI_3`); renaming a published tag without a migration.
