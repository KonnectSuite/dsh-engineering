---
id: craft-debounce-and-filtering
title: Debounce, hysteresis and filtering
domain: craft
level: practitioner
basis: [field practice]
tags: [filter, debounce, hysteresis]
applies_to: [l5x, mwi]
rules: [CRAFT-FILTER-01, CRAFT-FILTER-02]
---
## Principle

Real sensors are noisy and real processes overshoot. Filter in the PLC with a stated time, not in the
operator's head.

## Rules

- **CRAFT-FILTER-01** Debounce discrete inputs with a timer sized from the sensor's bounce, and document
  the time next to the timer.
- **CRAFT-FILTER-02** Use hysteresis for thresholds that would otherwise chatter, and keep the band in one
  place per signal.

## Apply

When a value "flickers" on the HMI, find the filter time before adding another one downstream.

## Anti-patterns

Filters stacked three deep with no owner; a debounce so long it hides a real trip.
