---
id: view-popup-patterns
title: Popups and dialogs
domain: view
level: practitioner
basis: [ISA-101]
tags: [popup, dialog, modal]
applies_to: [ftview, optix]
rules: [VIEW-POP-01, VIEW-POP-02, VIEW-POP-03]
---
## Principle

A popup interrupts. Use it for a decision or a focused entry, not for information that could live on the
screen.

## Rules

- **VIEW-POP-01** Decide modal or modeless deliberately: modal when the answer changes what happens next,
  modeless when the operator may keep watching the process.
- **VIEW-POP-02** Keep the action buttons in the same place and order as every other popup, and make cancel
  the safe default.
- **VIEW-POP-03** A popup has a title that names the decision, and a size that does not cover the values it
  is asking about.

## Apply

Reuse the project's popup faceplate rather than building a one-off; the profile records the convention.

## Anti-patterns

Confirmation dialogs for reversible actions; popups that stack three deep; a popup with no visible close.
