---
id: craft-units-and-ranges
title: Units, ranges and engineering values
domain: craft
level: intro
basis: [field practice]
tags: [units, range, scaling]
applies_to: [l5x, mwi, optix]
rules: [CRAFT-UNIT-01, CRAFT-UNIT-02, CRAFT-UNIT-03]
---
## Principle

Every number the operator sees should have a unit, a range and a resolution. A number without those is a
guess.

## Rules

- **CRAFT-UNIT-01** Carry raw counts and engineering units as separate values with one documented
  conversion.
- **CRAFT-UNIT-02** State the valid range and what happens outside it (clamp, fault, ignore) at the
  conversion point.
- **CRAFT-UNIT-03** Display the unit next to the value and keep the decimal places consistent with the
  resolution.

## Apply

When a value moves to a new screen, move its unit and range with it.

## Anti-patterns

Two conversions for one signal; a percentage displayed as a fraction; more decimal places than the sensor
has.
