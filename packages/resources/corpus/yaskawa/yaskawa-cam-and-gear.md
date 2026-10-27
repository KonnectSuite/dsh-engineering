---
id: yaskawa-cam-and-gear
title: Cams, gears and registration
domain: yaskawa
level: specialist
basis: [Yaskawa]
tags: [cam, gear, registration]
applies_to: [mwi]
rules: [YAS-CAM-01, YAS-CAM-02]
---
## Principle

A cam is a table and a phase. Changing the table changes the motion; changing the phase changes when it
happens. Keep them separate and identifiable.

## Rules

- **YAS-CAM-01** Name and version each cam profile, and record which profile the machine is running. A
  profile loaded from a recipe must be validated before it is engaged.
- **YAS-CAM-02** Registration corrections are offsets applied to the phase, bounded and filtered; they do
  not rewrite the cam table at runtime.

## Apply

Log profile id and offset at each engagement. When diagnosing a cut-quality complaint, read the active
profile before reading the code.

## Anti-patterns

Editing the table to trim a registration error; two profiles with the same name; offsets that accumulate
without a limit.
