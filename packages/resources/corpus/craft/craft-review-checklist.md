---
id: craft-review-checklist
title: Pre-handover review checklist
domain: craft
level: practitioner
basis: [field practice]
tags: [review, handover, checklist]
applies_to: [l5x, ftview, mwi, optix]
rules: [CRAFT-REVIEW-01, CRAFT-REVIEW-02]
---
## Principle

Handover is a review, not a save. Walk the same list every time, and record what was not checked.

## Rules

- **CRAFT-REVIEW-01** Before handover: every fault has a message and a reset, every screen has a way back,
  every changed tag is documented, and the backup is taken and named.
- **CRAFT-REVIEW-02** Distinguish "checked" from "not checked" in the handover note; an unchecked item is
  not a pass.

## Apply

Run the product's own checks first — `l5x_run_checks` for an L5X, `ftview_check` for a display export — then the human walkthrough with the
operator.

## Anti-patterns

A handover that lists only what changed; signing off a screen nobody navigated.
