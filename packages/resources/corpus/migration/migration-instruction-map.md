---
id: migration-instruction-map
title: The instruction map: legacy mnemonic to Logix answer
domain: migration
level: practitioner
basis: [SLC 500 Instruction Set Reference 1747-RM001, PLC-5 Instruction Set Reference 1785-6.1, Logix 5000 General Instructions 1756-RM003]
tags: [migration, instructions, mnemonic, mapping]
applies_to: [migration]
rules: [MIGRATION-MAP-01, MIGRATION-MAP-02, MIGRATION-MAP-03]
---
## Principle

Most mnemonics survive the conversion with a similar name and a different operand shape, and a few have no
Logix counterpart at all. The map is small enough to know: roughly fifty mnemonics cover almost every legacy
program this bundle has seen. The table lives in the package as data
(`packages/migration/src/knowledge/instructions.ts`), so a tool can cite it rather than reason about it, and
`migration_resolve` prints the row for a mnemonic when it labels a site.

## Rules

- **MIGRATION-MAP-01** Know the two shapes that change silently. One-shots: `OSR`/`OSF` in Logix take only the
  storage bit, so a converted `OSR(B3[25].13,OSR_17)` has an operand that does not belong. `TON`/`TOF`/`RTO`
  and `CTU`/`CTD` in Logix take only the structure tag, with preset and accumulator as members.
- **MIGRATION-MAP-02** Send the no-counterpart instructions to the engineer: `IIM`/`IOM` (immediate I/O), `SVC`,
  `DTR` (data transition), `HSC` (high-speed counter), `AFI` outside a fault routine. There is no mechanical
  rewrite for an instruction whose job no longer exists in the new platform.
- **MIGRATION-MAP-03** Cite the manual section in the work note, never the manual's text. The row's `basis:`
  field names the manual and the section; that is the attribution, and it is what the person reviewing the
  migration can check.

## What must be decided by a person

| Legacy | Logix | Why it needs a decision |
|---|---|---|
| `BTW` / `BTR` | `MSG` | the message type, path, and rack/group/slot mapping are site-specific |
| `FOR` / `NXT` | `FOR` / `NXT` | the legacy index was often a status word; the Logix loop needs a declared index |
| `SQO` / `SQC` / `SQI` | same family | masked-sequencer semantics depend on the file layout, not the mnemonic |
| `PID` | `PID` | the parameter list is positional in legacy and tagged in Logix |
| `FAL` | `FAL` / `CPT` | the expression text is lost when the operands are flattened |
| `IIM` / `IOM` | none | immediate-I/O behaviour has no equivalent |
| `TOD` / `DTR` | `GSV` / none | wall-clock and transition detection map differently |

## Apply

When `migration_resolve` marks a site `review` and names a mnemonic, read the row here, then the legacy rung.
Mechanical rows are answered by the operand repair the tool already proposes; review rows are the report's
decision list.

## Anti-patterns

Renaming a mnemonic to whatever Logix offers first. Assuming a same-named instruction takes the same operands.
Answering `IIM` with a normal input contact and hoping the scan timing does not matter.
