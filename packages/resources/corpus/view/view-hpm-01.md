---
id: view-hpm-01
title: High-performance HMI: what changes on a plant floor
domain: view
level: practitioner
basis: [ISA-101]
tags: [hmi, hierarchy, overview]
applies_to: [ftview, optix]
rules: [VIEW-HPM-01, VIEW-HPM-02, VIEW-HPM-03]
---
## Principle

The operator's job is to detect an abnormal situation and act. A screen that shows every value equally
makes that job harder, not easier.

## Rules

- **VIEW-HPM-01** Lead with an overview: the process in its normal state, then detail on demand. A screen
  that needs a tour to understand is a wall of data.
- **VIEW-HPM-02** Grey is the normal state. Use colour for deviation, never for decoration; a screen of
  green boxes hides the one that turned red.
- **VIEW-HPM-03** One screen, one purpose. If a screen serves two tasks, split it or make the second a
  popup.

## Apply

For each screen ask: what decision does the operator make here, and what do they need to see to make it?
Remove everything that does not serve that decision.

## Anti-patterns

3D bevels and gradients on process values; every tag on one screen; colour used to distinguish units
instead of state.
