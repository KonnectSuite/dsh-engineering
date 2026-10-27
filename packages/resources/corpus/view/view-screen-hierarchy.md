---
id: view-screen-hierarchy
title: Screen hierarchy and count
domain: view
level: practitioner
basis: [ISA-101]
tags: [hierarchy, screens, structure]
applies_to: [ftview, optix]
rules: [VIEW-HIER-01, VIEW-HIER-02, VIEW-HIER-03]
---
## Principle

Screens form a tree: overview, area, detail. The depth is a design decision, and every level must earn its
place.

## Rules

- **VIEW-HIER-01** Three levels are usually enough: overview, area, equipment. A fourth level is a sign
  the area screen is doing too much.
- **VIEW-HIER-02** Number displays by level and area so the list reflects the tree, and never renumber a
  published display.
- **VIEW-HIER-03** Every screen reachable from the overview, and every screen has a way back; no orphan
  screens.

## Apply

Draw the tree before adding screens; if a proposed screen has no parent, the hierarchy is wrong.

## Anti-patterns

A single screen with tabs; screens reachable only by a specific alarm; duplicate screens for shifts.
