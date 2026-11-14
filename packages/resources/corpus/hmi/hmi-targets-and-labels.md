---
id: hmi-targets-and-labels
title: Touch targets and controls that name themselves
domain: hmi
level: practitioner
basis: [WCAG 2.1, ISA-101]
tags: [hmi, touch, ergonomics, labels]
applies_to: [ftview, optix]
rules: [HMI-TARGET-01, HMI-TARGET-02]
---
## Principle

A screen is operated with a finger, often one that is gloved, sometimes in motion, always under time.
Two properties decide whether the operator can actually use it: the control is big enough to hit, and
the control says what it does. Neither depends on which product built the screen.

## Rules

- **HMI-TARGET-01** A control a person presses is at least 44 px on both sides. Spacing matters as much
  as size: two 44 px buttons that touch each other are one target the operator cannot choose.
- **HMI-TARGET-02** A control carries its own visible label, or sits inside a labelled group. An icon
  with no caption is a guess the operator has to make correctly, every time, under load.

## Apply

Measure in the unit the runtime actually uses. On a FactoryTalk View ME export that is the display's
own coordinate space; on an Optix screen it is the widget's `Width` and `Height` under the window the
project runs in. A 1280 x 800 target on a 12-inch panel and the same target on a 6-inch panel are not
the same physical button, so record the display size alongside the pixel size and check the smallest
screen the application will run on, not the one it was designed on.

Labels are cheaper to fix than sizes: a caption is one property. A size change moves the layout, so
size the row first and write the caption second.

## Anti-patterns

A 20 px close box in the corner of a popup; a row of identical unlabeled icons distinguished only by
colour; a navigation strip placed where the machine's own bezel covers it; a control sized for the
mouse because the design screen is a desktop.
