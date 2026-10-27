---
id: view-faceplates
title: Faceplates and reusable screen objects
domain: view
level: specialist
basis: [ISA-101, Rockwell]
tags: [faceplate, reuse, objects]
applies_to: [ftview, optix]
rules: [VIEW-FACE-01, VIEW-FACE-02, VIEW-FACE-03]
---
## Principle

A faceplate is a contract between the screen and the equipment: same layout, same readings, same
controls, whatever the device.

## Rules

- **VIEW-FACE-01** One faceplate per equipment class (motor, valve, drive, loop), parameterised by tag.
  Do not copy a faceplate and edit it for one device.
- **VIEW-FACE-02** Show the same state indications in the same place on every faceplate: running, faulted,
  interlocked, mode.
- **VIEW-FACE-03** Keep operator controls on the faceplate only when the decision belongs there; manual
  jogging often does not.

## Apply

Inventory the faceplates before adding a screen; extending the class is cheaper than a new one-off.

## Anti-patterns

Faceplates that differ only in colour; device-specific logic inside a generic faceplate; two faceplates
for the same class.
