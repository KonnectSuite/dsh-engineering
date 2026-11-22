# The migration report and its evidence

`migration_report` writes the one document a reviewer, a customer, or a future
maintainer reads. It is not a log. It carries the decisions, the risks, the conversion
decisions, the comparison results, and the evidence that each gate was actually
passed.

## What the report reads

The report builds from files, not from chat history:

- the legacy side: a saved SLC 500 export (`.RSS`, `.ACH`, `.SLC` text) or a PLC-5
  `.RSP`,
- the Logix side: the `.L5X` Studio exported after import,
- optionally, a corrected `.L5X` so the report can show what changed after the
  engineer stage.

The output is Markdown or Word (`.docx`). The report tool writes only the report; it
does not modify either project and does not rewrite the `.L5X`.

## What it contains

1. **Project identity.** Source files, processor types, target CPU and revision, the
   five decisions, and the stage the migration reached.
2. **Risk and finding tables.** The assessment risks, the lint findings, and the
   comparison differences, each with the rule name so the reader can look it up.
3. **Corrections.** The differences between the imported `.L5X` and the corrected one:
   what was rewritten, in which routine, and for which exception.
4. **Exception ledger.** Every plan exception with its kind, description, rationale,
   and status.
5. **Evidence.** The acceptance criterion that was used, the build or test that proved
   each rewrite, and the remaining unverified items.
6. **Sign-off block.** Who accepted the migration and when, as a fact supplied by the
   engineer, not a generated timestamp.

## Evidence that counts

The report distinguishes these grades:

- **Imported** — Studio opened the `.L5K` and exported a `.L5X`. Proves syntax.
- **Matched** — the comparison found no unexplained lost structure. Proves the text
  accounting.
- **Built** — the Logix project built for the target revision, with the target CPU's
  instruction set. Proves it is a legal program.
- **Tested** — the sequence test or golden part behaved. Proves the machine's behaviour.
- **Commissioned** — the running controller matches the baseline.

The report must not present a lower grade as a higher one. "Migrated" is a claim for
the top grade only; below it, the verdict says which grade was reached and what is
still missing.

## Writing it safely

- Choose a path that does not exist yet. If the report already exists, the tool fails
  with `REPORT_EXISTS` rather than overwriting someone's signed document; choose a new
  name (for example with the date and revision in it).
- If the directory is not writable, the failure is `REPORT_UNWRITABLE`; fix the path,
  do not retry blindly.
- The report is evidence, so keep every version you generate. A regenerated report
  that silently replaces the accepted one destroys the record.

## The report is not the acceptance

A written report does not finish a migration. The gates page lists what does. The
report's job is to make the evidence readable and to make the gaps impossible to miss;
if it does that and names the remaining work, it is a good report even when the
migration is not finished.
