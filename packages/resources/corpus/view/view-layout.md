---
id: view-layout
title: Objects that do not fight and screens that fit their canvas
domain: view
level: practitioner
basis: [ISA-101]
tags: [hmi, layout, overlap, canvas]
applies_to: [ftview, optix]
rules: [VIEW-LAYOUT-01, VIEW-LAYOUT-02]
---
## Principle

Two layout failures survive every style guide. Objects placed on top of each other, and screens built
for a canvas the runtime does not give them. Neither is a taste problem: one hides information, the
other crops it.

## Rules

- **VIEW-LAYOUT-01** Two objects do not occupy the same space unless one is the other's container. A
  backdrop and the panel it holds are one placement; two labels that overlap are a mistake, even when
  both are readable on the design screen.
- **VIEW-LAYOUT-02** A screen is built for the canvas it will be shown on. Every display in one
  application shares that canvas unless the difference is deliberate and named.

## Apply

Find the canvas first, then lay out. In a FactoryTalk View ME export the canvas is the display's replace
mode `DisplaySettings` width and height — popup settings do not define the canvas, because a popup is
not where the operator lives. In an Optix project the canvas is the window the screens are loaded into,
and a screen whose own extents differ from it is reported against the window, not against its neighbours.

Overlap is checked against the container relationship, not against coordinates alone: a panel containing
its children is correct, and a whole-display backdrop is correct. What gets reported is two independent
objects sharing area, with both names and the area they share.

When screens in one application genuinely differ in size, name the reason. An unlabeled 1024 x 768
display inside a 1280 x 800 application is indistinguishable from a mistake.

## Anti-patterns

A display designed on a desktop monitor and run on a 12-inch panel; a value object dropped over its own
label; a popup sized as if it were the main screen; a screen moved to a smaller window with its objects
left where they were.
