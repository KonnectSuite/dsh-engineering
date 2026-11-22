---
name: legacy-to-logix-migration
description: Move an RSLogix 500 (SLC 500) or RSLogix 5 (PLC-5) program into Studio 5000 — interview the engineer, assess the legacy export, lint the .L5K the wizard writes, and prove the result.
---

# SLC 500 and PLC-5 to Logix migration

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is
installed, open or on disk; the host is read only when the operator points at it, or when the work is
inside an existing project (`CRAFT-ORD-01`).

A migration is an evidence exercise, not a conversion button. The wizard maps
most of the program and silently changes the rest; your job is to find out which
is which before anyone commissions the machine.

This row knows the subject without a network round trip: `migration_assess` names
the Logix candidate for each legacy instruction it flags, `migration_resolve`
appends the instruction's row (replacement, operand shape, citation) to the advice
for every review site, and `migration_docs` answers from the authored migration
corpus — instruction maps, addressing and data files, the wizard and `.L5K` audit,
the marker and indirect-addressing census, `SFC_ROUTINE_PRESENT`, assessment, plan,
compare, report and error codes. Search it before reasoning about a marker, read
one page for the details, and look an exact identifier up rather than recalling a
paragraph. The corpus rests on 1756-RM085I (logic conversion, including the
`S:24 → S24` table), 5069-AP001A (the SLC wizard) and 1746-RM003F (hardware
replacement).

## 1. Interview and start the plan

Create the plan first, then answer its five decisions with `migration_plan`:
target controller and revision, I/O strategy, HMI scope, acceptance bar. Do **not**
assume a default: a wrong target controller or I/O strategy invalidates every
later proof. The plan refuses to advance while a decision is missing, and its
next_action field names what to do next.

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

- `.RSS` / `.ACH` (RSLogix 500) and `.RSP` (RSLogix 5) are containers only their
  own product reads. Call `slc_read` first:
  it opens the project hidden through the 32-bit automation server and returns
  program files, rung counts, rung text, symbol records and data files without a
  window. Ask for the symbol and data-file detail when you need the addressing
  truth; thousands of symbol records are normal. Use `.SLC` only as the fallback
  when RSLogix 500 is not installed.
- `.SLC` is the text export: count ladder files, rungs, racks and data files, and
  treat it as the read-only truth for the old logic.
- `.L5K` is what the wizard writes: assess it, then `l5k_lint` it.
- Text that reads with `Â`/`â`/`Ã` sequences is cp1252 re-encoded as UTF-8. Repair
  it with the round trip (decode as utf-8-sig, encode cp1252, decode utf-8), keep
  the original, and write the repaired copy without a BOM.

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
- **Module Name punctuation** — a Name carrying a colon (`Local:1` used as a
  label) aborts the Studio import as `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`. Names
  carry letters, digits and underscores; the label belongs in the Description.

A failed `Failed to export to ACD` is a lint result: read the Studio error line,
fix the text, import again. Keep the repaired `.L5K` next to the original; never
edit the customer's `.RSS` or the wizard's first output.

## 4. Prove the import

- Open the imported `.L5X`, not only the `.ACD`.
- Audit the wizard defaults the day it imports: `migration_assess` on the
  imported `.L5X` reports analog channels left at Range 4 / 0-20 EU / High 100,
  legacy chassis modules still declared, unnamed modules, `+ S24` byte-swap
  tokens, and residual `?` and PCE sites. Each one is a plan exception with a
  decision, not a note.
- A verification baseline must be exported in this chat: `l5x_export_acd_to_l5x` the
  `.ACD`, `l5x_open_project` that `.L5X`, then verify against it. A file handed over
  from a previous session is not a baseline.
- Run `migration_compare` with the legacy `.RSS` and the imported `.L5X`. It
  matches ladder file names to routines, counts rungs (a terminal `END` is not
  logic), maps symbols and data files, and classifies each difference as
  expected, real or cosmetic. On Slitter 8 the honest result was 64 files
  matched, 1,398 of 1,426 rungs, 259 indirect expressions still to engineer and
  two real differences; quote the numbers you actually get, not these.
- Compare before and after: program layout, task rates, tag count, module count,
  data files carried verbatim.
- Run the structural checks and triage them by migration cause. A migrated SLC
  program legitimately has duplicate outputs across former subroutines; an
  unresolved reference is never expected.
- A revision 37+ target can be built offline for a real proof; a lower revision
  only supports an "import succeeded" statement.

## 5. Resolve the conversion's markers

The wizard writes `PCE(code,label)` where it could not translate an instruction
and `?` where it could not type an operand. `migration_resolve` pairs each site
with the legacy rung it came from and says what that legacy rung still records:

- **mechanical** — a marker on a rung that already carries the legacy
  instructions in order (delete it), a timer or counter `?` whose preset and
  accumulator the legacy operand list still names, and any rung the tool offers
  as whole text. Apply these with `l5x_draft_rung`; this is the easy half, and the
  proposal comes from the legacy rung, not from imagination.
- **review** — `PCE(150,…)` or `PCE(210,…)` before `MSG` (set the block
  transfer's rack, group, slot, control, table and length on the MSG),
  `PCE(116,…)` before `FOR` (the loop index was a status word: declare the DINT
  tag and point the FOR at it), `PCE(152,…)` alone on a rung (a status word with
  no Logix equivalent), and expressions the wizard flattened.

Re-import after applying, and quote the count you got. On EN049 the mechanical
half took 177 markers to 22 and 54 rungs with `?` to 9, and the file imported
with no warnings; what was left was MSG parameters, one loop index and three
flattened expressions.

## 6. Write the report

`migration_report` writes the document the customer reads: the two programs side
by side, the pre-correction census by code, the corrections rung by rung (only
the text around each change), and the open items that are a decision rather than
a defect — a placeholder tag standing in for a module with no Logix equivalent, a
legacy I/O image left as a plain tag array, an array indexed by a tag, sites
still unanswered, a revision below 37. Name the output `.docx` for the formatted
Word document or `.md` for plain text; the two carry the same content.

Quote the numbers it prints, and read its open items before you say the
conversion is ready — the report is evidence for a signature, not the signature.

## 7. Report honestly

State the proof class (`build-verified` or `import-verified`), the exception list
(indirect addressing, unmapped modules, HMI deferred), and the checks that could
not run. Do not say "migrated" while a finding is open or a reference is
unresolved. The machine is commissioned by an engineer, not by a green report.

**A build error gets three probes, not a session.** One hypothesis per build.
When the third does not move the error, stop and write the finding down: what the
error survived, the routine and rung the bisect narrowed it to, and the operands
still suspect. A narrowed finding handed on beats a fourth guess — and the
vendor's own Errors tab names the rung the SDK message withholds.

## Safety rules

- Never modify the source `.RSS`, `.SLC` or the first wizard `.L5K`.
- Write new files; keep the original hash for the record.
- No live controller writes during a migration review.
- Three probes per defect, then report the finding and move on.
- A read that succeeds while writes and deletes are denied, with FullControl ACL
  and an empty Restart Manager list, is the harness sandbox, not a file lock: ask
  for the wider sandbox once, do not hunt for processes.
- If the evidence is missing, stop and ask — a silent default is a commissioning
  risk, not a convenience.
