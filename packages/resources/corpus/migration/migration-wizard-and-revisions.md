---
id: migration-wizard-and-revisions
title: The conversion wizard, its two questions and its revision ceiling
domain: migration
level: specialist
basis: [Rockwell conversion guide, observed wizard runs]
tags: [migration, wizard, revision, io]
applies_to: [migration]
rules: [MIGRATION-WIZARD-01, MIGRATION-WIZARD-02, MIGRATION-WIZARD-03, MIGRATION-WIZARD-04]
---
## Principle

The conversion is a GUI wizard in the legacy product, and it asks two questions that decide everything after
them: which controller to target, and what to do with the existing I/O. Neither answer is recorded in the
output, so write both down before you start.

## Rules

- **MIGRATION-WIZARD-01** Record the target: family, catalogue number and revision. The revision is not a
  preference — the wizard can only emit the revisions it ships with (30 to 31 in the RSLogix 500 wizard, 30 to
  32 in the RSLogix 5 one). Anything newer is a retarget in Studio 5000 afterwards.
- **MIGRATION-WIZARD-02** Choose the I/O strategy deliberately. *Keep existing I/O* puts the new controller
  beside a single bridge module and leaves the legacy chassis in a separate rack, so the legacy I/O image
  survives as tags and nothing is bound to hardware. *Update all I/O* maps each legacy module to a replacement
  from the wizard's list.
- **MIGRATION-WIZARD-03** Expect the wizard to write a `.l5k` next to the `.ACD` while it works and to remove it
  when the `.ACD` is complete. Do not treat the `.l5k` as the deliverable, and do not be surprised when it
  disappears.
- **MIGRATION-WIZARD-04** Do not quote a build verdict for wizard output without retargeting first. The offline
  build gate needs revision 37 or newer; a 31 or 32 project is *import-verified*, which is a real and honest
  class, and it is not the same thing as compiled.

## Apply

Take the wizard's log as evidence: it names every module it migrated, every module it could not, and the final
"Application migrated to Logix Designer version N" line. Save that log with the artifacts; it is the only
record of what the wizard decided.

## Anti-patterns

Retargeting before the conversion, so the wizard's own ceiling hides a broken rung. Choosing *update all I/O*
to avoid a placeholder tag, then hand-binding modules that were never modelled. Reporting the revision the
project was retargeted to as though the wizard produced it.
