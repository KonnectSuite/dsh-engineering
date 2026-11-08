---
id: migration-wizard-defaults-to-audit
title: What the migration wizard leaves in place, and what to audit after the import
domain: migration
level: practitioner
basis: [SLC to CompactLogix Programming Migration 5069-AP001A, 1756-RM085I status conversion, 1746-RM003F replacement tables, observed wizard runs, observed imports]
tags: [migration, wizard, audit, io, modules]
applies_to: [migration]
rules: [MIGRATION-AUDIT-01, MIGRATION-AUDIT-02, MIGRATION-AUDIT-03, MIGRATION-AUDIT-04, MIGRATION-AUDIT-05, MIGRATION-AUDIT-06]
---
## Principle

The wizard converts a legacy project to its own defaults, not to the legacy project's settings. None of what
it leaves behind fails an import, and none of it shows in a build verdict — the defects change what the
machine measures and how addresses behave, so they surface months later as "the HMI reads wrong" and "this
address does not exist". Audit the imported export for exactly this list, the day it is imported.

## Rules

- **MIGRATION-AUDIT-01** Analog channels at the wizard default (Range 4, Low Engineering 0, High Engineering
  100) are unaudited channels. See the analog scaling page for what to set them to.
- **MIGRATION-AUDIT-02** Legacy chassis modules (1746 and 1747 catalog numbers) stay declared beside their
  replacements. Delete them once the replacement wiring is proven; a declared phantom module reserves I/O
  and invites tags that bind to nothing.
- **MIGRATION-AUDIT-03** Modules come through unnamed. Name them before tag references are written, or the
  project fills with `Local:3:I.Pt1` references no person can place on a rack.
- **MIGRATION-AUDIT-04** A module Name carrying punctuation — a colon is the observed case — aborts the
  Studio import with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`. The label belongs in the module Description; the
  Name carries letters, digits and underscores only.
- **MIGRATION-AUDIT-05** A `+ S24` token inside an operand address is the wizard's byte-swap artifact, not a
  tag. Record each site as a plan exception of kind `wizard_artifact` and rewrite the address from the
  legacy rung.
- **MIGRATION-AUDIT-06** Residual `PCE(...)` markers and `?` operands are unanswered conversion sites.
  Resolve them, re-export, and only then ask for a build verdict.

## Apply

`migration_assess` on the imported `.L5X` runs this checklist headlessly and returns one finding per rule
that fired. Each finding becomes a plan exception with the decision that closes it, so the sign-off record
shows the audit was done and what it concluded.

## Anti-patterns

Treating a clean import as a clean migration. Auditing after the first field complaint. Deleting the legacy
chassis modules before the replacement wiring is proven, so the proof has nothing to compare against.
Rewriting a `+ S24` address by eye without the legacy rung in front of you.

## Sources

- 1756-RM085I Sep 2025 p.28 — the status conversion table includes `S:24 → S24`: the `+ S24` token is
  documented conversion output, not a wizard quirk.
- 5069-AP001A Aug 2020 pp.19–27 — SLC Migration Wizard walkthrough (defaults land where the wizard puts
  them, not where the sensor needs them).
- 1746-RM003F Jan 2022 pp.22–25 — legacy module/chassis replacement tables the delete-after-proof rule
  compares against.
