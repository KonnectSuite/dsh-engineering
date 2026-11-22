# Comparing the legacy program with the Logix export

`migration_compare` is the stage that catches silent loss. It pairs the legacy side
(the project or export read by the assessment or `slc_read`) with the Logix `.L5X`
Studio exported after import, matches routines and rungs, and reports the differences
by rule. A comparison that produces no differences is a claim to check, not a result to
celebrate.

## What it matches

- routines by name, then by rung count and instruction mix when names changed,
- rungs inside a matched routine by normalized text,
- symbols and tags by name,
- data files by the tags they became.

Normalization ignores whitespace, case, and the operand order changes that are known
to be equivalent. It does not ignore a lost instruction, a changed operand, or a
rung that became two rungs.

## The difference rules

| Rule | Meaning | What to do |
| --- | --- | --- |
| `ROUTINE_MISSING` | A legacy routine has no Logix counterpart. | Find out whether it was folded into another routine, intentionally retired, or lost. Record the answer. |
| `SYMBOL_MISSING` | A legacy symbol has no Logix tag or alias. | Confirm the address is truly unused, or restore it. |
| `DATA_FILE_UNMAPPED` | A legacy data file has no Logix target. | Map it or retire it with a reason. |
| `ROUTINE_ADDED` | The Logix side has a routine the legacy side did not. | Expected for SFC authors and hand-written replacements; verify each is deliberate. |
| `RUNG_SPLIT` | One legacy rung became several Logix rungs. | Usually branch expansion or operand folding; check the logic is equivalent. |
| `RUNG_LOST` | A legacy rung has no Logix match. | The serious rule. Find it in the marker census or explain the retirement. |
| `INDIRECT_LEFT` | A legacy indirect address is still indirect on the Logix side. | Finish the rewrite; a bracket in Logix is an array index that needs a declared tag. |
| `NO_ROUTINE_MATCHED` | Nothing matched at all. | Usually the wrong pair of files, or an export made before import. |

## Reading the result honestly

- `RUNG_LOST` and `ROUTINE_MISSING` are not automatically failures. They are questions.
  A rung can legitimately disappear when an instruction is replaced by module
  configuration, but the report must say so.
- `ROUTINE_ADDED` is normal for every SFC routine (the sequence is authored on the
  target) and for handwritten replacements.
- A clean comparison means the text is accounted for. It does not mean the machine is
  correct; the acceptance gate is still the build and the sequence test.

## Order of operations

1. Export the `.L5X` from Studio after the imported project builds.
2. Run the comparison against the same legacy source the assessment read.
3. Save the difference list with the plan; it is evidence for the engineer stage.
4. Resolve every `RUNG_LOST`, `ROUTINE_MISSING`, and `DATA_FILE_UNMAPPED` before
   claiming the compare stage is done.
5. Re-run the comparison after any repair to the `.L5K` and re-import, and keep the
   latest list as the accepted one.

`slc_read` and `migration_compare` open the legacy project through RSLogix 500's
32-bit automation server, hidden and read-only, and quit without saving. If the vendor
software is not installed, the comparison cannot read the live project; use the saved
export path instead, and record which path the evidence used.
