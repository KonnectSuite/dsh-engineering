---
id: rockwell-program-structure
title: Logix program structure that scales
domain: rockwell
level: practitioner
basis: [Rockwell]
tags: [program, routine, aoi]
applies_to: [l5x]
rules: [ROCK-STRUCT-01, ROCK-STRUCT-02, ROCK-STRUCT-03]
---
## Principle

The controller organiser is a map of the machine. A reader should find the logic for a device by following
names, not by opening every routine.

## Rules

- **ROCK-STRUCT-01** One program per machine area, one main routine that reads as a table of contents, and
  one routine per device or function. The main routine calls; it does not implement.
- **ROCK-STRUCT-02** Keep the main routine thin enough to read in one screen: JSRs or AOI calls with a
  comment per call.
- **ROCK-STRUCT-03** Put reusable device logic in an AOI with a UDT for its state; one-off logic stays in
  the routine that owns it.

## Apply

For inherited projects, map program → routines → devices before editing. Name new routines after the
function they perform (`Conveyor_Control`), not after the week they were added.

## Anti-patterns

A 900-rung main routine; JSR chains nobody can follow; the same motor logic pasted four times.
