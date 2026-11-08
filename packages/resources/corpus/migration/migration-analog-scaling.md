---
id: migration-analog-scaling
title: Analog scaling survives a migration as numbers, not as engineering units
domain: migration
level: specialist
basis: [1756-RM085I scaling sections, 1746-RM003F replacement tables, observed wizard runs, 1746-NI8 count-domain evidence]
tags: [migration, analog, scaling, io, pid]
applies_to: [migration]
rules: [MIGRATION-SCALE-01, MIGRATION-SCALE-02, MIGRATION-SCALE-03, MIGRATION-SCALE-04]
---
## Principle

A legacy analog module scales by a count domain: the 1746-NI8 family reports 0..32767 counts for a unipolar
input and ±32767 for a bipolar one. The migration wizard carries the channel across as numbers and lands it on
its own default scaling — Range 4 (0-20 mA), Low Engineering 0, High Engineering 100 — which is 0-20
engineering units, not the legacy count domain. The migration is lossless as numbers and lossy as meaning:
every HMI display, alarm limit and PID gain that read the legacy counts now reads a different quantity.

## Rules

- **MIGRATION-SCALE-01** Know which scaling the legacy channel carried: raw counts (0..32767 / ±32767),
  proportional engineering units, or scaled-for-PID (a normalized 0-100 style value the loop works in). The
  wizard's migration data names the module mapping, not the consumer, so read the legacy program to tell them
  apart.
- **MIGRATION-SCALE-02** Treat a channel sitting at the wizard default (Range 4, Low Engineering 0, High
  Engineering 100) as unaudited. It is the default, not a decision; a sensor that filled the legacy count
  domain now fills 20 of the 100 units, and every downstream value is off by the ratio.
- **MIGRATION-SCALE-03** Set Range, Low Engineering and High Engineering from the sensor and the consumer
  together: the full-scale sensor span defines the electrical end, the HMI display and the PID input define
  the engineering end. A channel feeding a PID loop scales for the loop, not for the display; when both read
  one channel, scale for the loop and convert for the display.
- **MIGRATION-SCALE-04** Prove the chain with a known input: a measured sensor value, the count the legacy
  module would have produced, and the engineering value the new channel reports. Three numbers that do not
  agree name the scaling that is wrong.

## Apply

Run the wizard-defaults audit (`migration_assess` on the imported `.L5X`) right after the import, before any
tag is written against a channel. Record per channel: sensor, span, consumer, chosen Range and Low/High
Engineering. The audit lists the channels still at the default; each one is an open item until the numbers
are set and proven.

## Anti-patterns

Calling the wizard default "the 0-20 range the module ships with" and leaving it. Reusing legacy alarm
limits as engineering limits without recomputing them. Scaling a channel for the HMI and discovering the PID
loop reads the same channel. Auditing only the channels that visibly misread — a scale factor of 5 reads
plausible and wrong.

## Sources

- 1756-RM085I Sep 2025 p.20 (conversion scales presets and accumulators) and p.70 (SCL → SCP with scaled
  minimum/maximum).
- 1746-RM003F Jan 2022 pp.22–25 (1746-NI8 → 1769-IF8 / 5069-IF8 replacement) and p.52 (wiring migration).
- 1746-NI8 count-domain evidence: `IoModuleDefinitions.xml` as shipped with the migration tooling.
