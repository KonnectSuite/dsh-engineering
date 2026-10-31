---
id: migration-pce-markers
title: PCE markers and what their codes mean
domain: migration
level: specialist
basis: [Rockwell conversion guide, observed exports]
tags: [migration, pce, conversion, markers]
applies_to: [migration]
rules: [MIGRATION-PCE-01, MIGRATION-PCE-02, MIGRATION-PCE-03, MIGRATION-PCE-04, MIGRATION-PCE-05]
---
## Principle

`PCE` is a **Program Conversion Error**: the instruction the vendor wizard inserts where it could not translate
what it found. It is not a placeholder that runs; it is a note in the ladder saying "this rung is not what the
legacy rung said". A project with markers left in it imports, and is wrong.

Markers appear as `PCE(code,label)`, for example `PCE(201,PCE034)`. The label is just a unique name for the site.

## Rules

- **MIGRATION-PCE-01** Never delete a marker on sight. Read the legacy rung first and prove the rung's meaning
  survived; deleting the note without checking the logic is the fastest way to lose a permissive or a seal-in.
- **MIGRATION-PCE-02** Answer from the legacy text when the text carries the answer. A marker beside a `MOV`, a
  comparison or a bit instruction is usually answered by the legacy operand list alone; that is what
  `migration_resolve` calls *mechanical*.
- **MIGRATION-PCE-03** Escalate when the legacy construct has no Logix counterpart: immediate I/O (`IIM`/`IOM`),
  `SVC`, block transfers (`BTW`/`BTR` to `MSG`), a loop index held in a status word, or a mask/compare file
  operation (`DTR`). These are design decisions, not text edits.
- **MIGRATION-PCE-04** Treat the code as a family, not a dictionary. Codes cluster by construct, and the two
  legacy families do not use the same numbers for the same thing.
- **MIGRATION-PCE-05** Report the census before and after the work. "177 markers became 22, then 0 after the 13
  review sites were answered" is a migration report; "markers were resolved" is a claim.

## Codes seen in this bundle's own conversions

| Code | Family | Construct behind it | Answer class |
|---|---|---|---|
| 201 | PLC-5 | a rung-level conversion failure, at the rail or in front of a contact | mechanical when the legacy sequence matched, otherwise review |
| 110 | both | an operand inside a branch (a `MOV` in a `[ … ]` alternative) | mechanical |
| 109 | both | `DIV` with flattened operands | mechanical |
| 105 | SLC | `COP`/`EQU` operand list | mechanical |
| 114 | SLC | `PID` parameter list | review |
| 116 | PLC-5 | `FOR`/`NXT` whose index was a status word | review |
| 134, 135 | SLC | `INT`/`IIM` interrupt-related rungs | review |
| 150 | PLC-5 | `BTR`/`BTW` replaced by `MSG` | review |
| 152 | PLC-5 | `CLR` of a status word — the rung's only instruction became the marker | review |
| 160 | SLC | `XIC`/`OTU`/`OTL` combination the wizard flattened | mechanical |

The codes are the vendor's; the classification is this bundle's opinion, based on what each site actually
needed. Cite the vendor's conversion guide for the code table itself.

## Apply

Run `migration_resolve`, take the mechanical sites first in one pass, then answer the review sites with the
legacy rung open beside the converted one. Re-run the tool after each batch: the count is the progress bar.

## Anti-patterns

A marker that survived to commissioning. A "resolved" report with no pre/post census. Deleting markers in a
bulk find-and-replace and calling the result clean.
