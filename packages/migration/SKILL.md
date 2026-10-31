---
name: slc-to-logix-migration
description: Move an RSLogix 500 / SLC 500 program into Studio 5000 — interview the engineer, assess the legacy export, lint the .L5K the wizard writes, and prove the result.
---

# SLC 500 to Logix migration

A migration is an evidence exercise, not a conversion button. The wizard maps
most of the program and silently changes the rest; your job is to find out which
is which before anyone commissions the machine.

## 1. Interview before touching anything

Ask these four questions and record the answers in the plan. Do **not** assume a
default: a wrong target controller or I/O strategy invalidates every later proof.

1. **Target** — which controller and firmware revision? A revision 37 or newer
   target can be proved by an offline build; older targets can only be proved as
   imported.
2. **I/O** — keep the 1746 chassis behind a 1747-AENTR bridge, or replace the
   modules? This decides the module replacement table and whether the field
   wiring is touched.
3. **HMI** — in scope now or later? PanelView Standard applications need their
   own conversion; say so in the plan rather than discovering it at commissioning.
4. **Validation window** — when may the machine be stopped, and what proves the
   migrated program is right (I/O forcing, sequence test, golden part)?

## 2. Assess the source

Call `migration_assess` on the file the customer gave you.

- `.RSS` / `.ACH` are containers: RSLogix 500 must Save As `.SLC`, or run the
  migration wizard. Nothing here can read the binary.
- `.SLC` is the text export: count ladder files, rungs, racks and data files, and
  treat it as the read-only truth for the old logic.
- `.L5K` is what the wizard writes: assess it, then `l5k_lint` it.

## 3. Repair the `.L5K` before the import

`l5k_lint` reports the blockers with line numbers. The common ones:

- **TRAILING_COMMA** — an attribute list ends with a comma before `)`. Studio
  aborts the whole import as `Invalid attribute syntax`. Remove the comma.
- **DUPLICATE_TAG**, **TAG_NAME_TOO_LONG** — the imported program will not compile
  or will silently bind the wrong symbol.
- **ROUTINE_PAREN**, **ROUTINE_UNBALANCED** — the text was truncated or half
  converted.
- **INDIRECT_ADDRESS** — `N[N7_130]` style indexing has no Logix equivalent.
  These become the exception list, not a warning to ignore.
- **PLACEHOLDER_TAG** — an unmapped module (typically a 1746-HSCE). Choose its
  replacement before commissioning.

A failed `Failed to export to ACD` is a lint result: read the Studio error line,
fix the text, import again. Keep the repaired `.L5K` next to the original; never
edit the customer's `.RSS` or the wizard's first output.

## 4. Prove the import

- Open the imported `.L5X`, not only the `.ACD`.
- Compare before and after: program layout, task rates, tag count, module count,
  data files carried verbatim.
- Run the structural checks and triage them by migration cause. A migrated SLC
  program legitimately has duplicate outputs across former subroutines; an
  unresolved reference is never expected.
- A revision 37+ target can be built offline for a real proof; a lower revision
  only supports an "import succeeded" statement.

## 5. Report honestly

State the proof class (`build-verified` or `import-verified`), the exception list
(indirect addressing, unmapped modules, HMI deferred), and the checks that could
not run. Do not say "migrated" while a finding is open or a reference is
unresolved. The machine is commissioned by an engineer, not by a green report.

## Safety rules

- Never modify the source `.RSS`, `.SLC` or the first wizard `.L5K`.
- Write new files; keep the original hash for the record.
- No live controller writes during a migration review.
- If the evidence is missing, stop and ask — a silent default is a commissioning
  risk, not a convenience.
