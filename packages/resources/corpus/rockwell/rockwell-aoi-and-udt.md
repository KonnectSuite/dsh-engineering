---
id: rockwell-aoi-and-udt
title: AOIs and UDTs: reuse without hidden coupling
domain: rockwell
level: specialist
basis: [Rockwell, 1756-RM018A Sep 2025 instruction semantics; AOI detail is 1756-PM010, not held]
tags: [aoi, udt, reuse]
applies_to: [l5x]
rules: [ROCK-AOI-01, ROCK-AOI-02, ROCK-AOI-03]
---
## Principle

An AOI is a contract with every instance of it. Changing one changes the plant; that is the price of reuse
and it must be deliberate.

## Rules

- **ROCK-AOI-01** Use an AOI when the logic repeats three or more times and the interface is stable. Two
  copies are cheaper than a premature abstraction.
- **ROCK-AOI-02** Put instance state in a UDT member, never in controller-scope globals. Two motors sharing
  a global fault bit is a latent fault.
- **ROCK-AOI-03** Version behaviour by adding parameters with defaults, not by editing existing pin
  semantics; state the change in the AOI description.

## Apply

Document the AOI's states and timing in its description, and keep an instance list. When reviewing, check
for AOIs with unused pins and for UDTs used as generic bags of tags.

## Anti-patterns

AOI with 40 pins; UDT reused for unrelated equipment; logic that depends on the AOI's internal scan order.
