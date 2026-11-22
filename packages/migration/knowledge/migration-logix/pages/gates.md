# Acceptance gates: what counts as migrated

The migration row exists to prevent a specific failure: a project is called migrated
because the text converted, and the machine then behaves differently. These gates are
the difference between text and proof.

## The gates in order

### 1. Decisions recorded

All five decisions are answered in the plan: target CPU, target revision, I/O strategy,
HMI scope, and acceptance. A project without decisions has no definition of done.

### 2. Assessment accepted

The assessment's risks have been read and accepted by a person who knows the machine,
including `RUNGS_SAMPLED` if the read was a sample. Acceptance is a decision, not a
summary.

### 3. Wizard output preserved

The wizard's `.L5K` is saved and untouched. The repaired file is a copy. This gate is
about the audit trail as much as about safety.

### 4. Lint clean at error severity

`l5k_lint` reports no errors. Warnings are on the exception list with owners. Info
findings are understood.

### 5. Studio import succeeds

The repaired `.L5K` imports and Studio exports the `.L5X`. Import failure means the
text is not a legal project; do not proceed.

### 6. Comparison accounted

Every `RUNG_LOST`, `ROUTINE_MISSING`, and `DATA_FILE_UNMAPPED` has an explanation.
`ROUTINE_ADDED` entries are deliberate. `INDIRECT_LEFT` is zero. "Clean" is not
required; "accounted for" is.

### 7. Exceptions resolved

Every marker, placeholder tag, and indirect site has a resolution and the resolution
has evidence. `SFC_ROUTINE_PRESENT` sites have their SFC authored and tested. No rung
that only contains a marker remains (it fails the Studio build audit with
`RxCMP_E_AUDIT_OUTPUTS`).

### 8. Build proved

The project builds for the target revision. A revision of 37 or newer can be proved by
an offline build; below 37 the export can only be verified as imported, and the plan
must say so. `REVISION_BELOW_TARGET` is the rule that reminds you.

### 9. Acceptance evidence

The acceptance decision determines the evidence: an offline build, a sequence test, or
a golden part. The report records the exact test and result. A green unit suite is not
a sequence test.

### 10. Baseline

The commissioned controller and the archive (source project, ACD, `.L5X`, report) are
baselined together. The baseline is what the next maintainer compares against.

## What each gate proves

| Gate | Proves | Does not prove |
| --- | --- | --- |
| Lint clean | The text is well-formed enough to try. | That the logic is right. |
| Import | Studio accepts the text. | That it builds for the target. |
| Comparison | The structure was accounted for. | That timing or semantics match. |
| Build | The program is legal for the target. | That the machine runs correctly. |
| Sequence test | The machine's sequence behaves. | That every recipe and fault path works. |
| Commission | The machine runs under production conditions. | That it will never break. |

## When a migration may be called migrated

Only when the gates through the acceptance decision have been passed and the report
records the evidence. Until then, the honest statement is the gate reached: "imported",
"built", "sequence-tested". `coverage.complete` stays false in the tools, with the
unverified items named, until the report's evidence supports the decision.

## Reopening a "done" migration

A migration is reopened when a sequence test fails, when the comparison is re-run after
a repair, or when a marker is found without a resolution. Reopening is normal; it is
cheaper than discovering the gap at commissioning. Update the plan and the report, and
keep the previous report as history.
