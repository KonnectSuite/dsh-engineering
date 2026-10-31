---
id: migration-indirect-addressing
title: Indirect addressing after the conversion
domain: migration
level: specialist
basis: [Logix 5000 instruction set, observed exports]
tags: [migration, indirect, arrays, aliases]
applies_to: [migration]
rules: [MIGRATION-INDEX-01, MIGRATION-INDEX-02, MIGRATION-INDEX-03]
---
## Principle

Logix has no "indirect file" concept, but it does accept a **tag as an array subscript**: `N10[N48_2]` is a
legal Logix expression when `N48_2` is an integer tag. So a converted rung that shows `File[index]` is not, by
itself, a defect. The question is whether the index means what the legacy code meant.

## Rules

- **MIGRATION-INDEX-01** Do not call an indexed reference "engineering work" because it is indexed. Check the
  subscript first: an alias to an array element (`N48_2` = `N48[2]`) is a constant offset, and the expression is
  legal as written.
- **MIGRATION-INDEX-02** Check the types on both sides of the index. A 16-bit `INT` index into a `DINT` array is
  legal but reads a different element count than the legacy file did; a `REAL` or `CONTROL` subscript is a
  modelling error, not a style issue.
- **MIGRATION-INDEX-03** Prefer naming the index over substituting it. Writing `N10[N48[2]]` freezes a value the
  legacy program may have written at run time; keeping the alias keeps the behaviour.

## Apply

`migration_compare` reports the count and `migration_resolve` reports each site with its index and index target.
Sort them into three piles: alias to a constant element (no work), tag whose runtime value is intended (check
bounds), and type-mismatched subscript (fix or document). Only the third is a defect.

## Anti-patterns

A blanket find-and-replace of `[alias]` to `[constant]`. Declaring the array wider "to be safe" without checking
the legacy file length. Assuming the wizard got the direction right because the rung compiled.
