---
id: view-navigation
title: Navigation that never traps the operator
domain: view
level: intro
basis: [ISA-101]
tags: [navigation, screens]
applies_to: [ftview, optix]
rules: [VIEW-NAV-01, VIEW-NAV-02, VIEW-NAV-03]
---
## Principle

The operator must always know where they are and how to get back to the overview, including under stress.

## Rules

- **VIEW-NAV-01** Keep a persistent navigation area on every screen (header or footer), with the same
  position and the same buttons.
- **VIEW-NAV-02** Always provide a way back to the overview that does not depend on a popup being closed
  first.
- **VIEW-NAV-03** Name screens after the area they show, and number them consistently; the screen list is
  part of the interface.

## Apply

Walk the navigation as the operator would during an alarm: from the overview to the faulted area and back
in two clicks.

## Anti-patterns

Hidden hotspots; a popup that disables the nav bar; the only way home being a hardware function key.
