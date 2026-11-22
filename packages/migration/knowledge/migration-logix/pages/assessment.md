# Assessing a legacy project without a controller

`migration_assess` is the first real look at the work. It reads a saved project or a
text export from disk and reports the hazards it can prove from the file, without
opening a controller and without running the vendor IDE.

## What it reads

- `.RSS` and `.ACH` saved SLC 500 project files,
- `.RSP` saved PLC-5 project files,
- the `.SLC` text export some RSLogix 500 versions save.

Pass an `.L5K` to the assessment and it returns `UNSUPPORTED_FORMAT`: the `.L5K` is the
wizard's output and belongs to `l5k_lint`, not to the legacy assessment. Pass a file
that is not a project at all and the failure names the extension it saw and the tool
that reads the file it most likely is.

## What it reports

The report has a summary, a data area, suggested next tools, and a coverage block. The
risk rules it can set are:

| Risk | Meaning | Handling |
| --- | --- | --- |
| `INDIRECT_ADDRESS` | A rung indexes a data file with another word. | Error severity; every site needs a rewrite and a proof. |
| `LEGACY_INSTRUCTION` | An instruction the wizard will not translate mechanically. | Each one goes on the exception list with a resolution. |
| `SYMBOL_TOO_LONG` | A symbol longer than the legacy editor can store (15 characters in RSLogix 500). | The name in the file is already truncated; restore the intended name. |
| `ADDRESS_ONLY_DATABASE` | The project has no meaningful symbol names. | Budget the renaming work; names will be invented by the wizard. |
| `DATA_FILES_CARRIED` | Numbered data files that must be mapped to tags or retired. | Decide each file's target; report retirements with a reason. |
| `RUNGS_SAMPLED` | The assessment read a sample of rungs, not the whole program. | An honest limit: do not treat the sample count as the program size. |

`RUNGS_SAMPLED` matters for planning. The assessment is designed to answer "how bad is
this?" quickly; the full ladder read is `slc_read` (when RSLogix 500 is installed) or
the PLC-5 readers. If the sample shows no indirect addresses, the program may still
have them outside the sample.

## What it cannot answer

- What a bit physically controls. That is drawings and people.
- Whether a card is in a slot. The project records configuration, not inventory.
- Whether the program is correct. The assessment finds migration hazards, not bugs.
- Whether the target revision is available on the equipment. That is a purchasing and
  firmware question.

## From assessment to plan

1. Run the assessment and read the risk list; do not skim the summary.
2. Answer the five plan decisions (target CPU, revision, I/O strategy, HMI scope,
   acceptance) while the risks are fresh.
3. Send the indirect sites and legacy instructions to `migration_resolve` for a census
   before conversion, so the exception list starts from evidence.
4. If RSLogix 500 is installed and the project opens, read the full structure with
   `slc_read` and compare its counts with the assessment's sample. A large gap means
   the sample was not representative.
5. Keep the assessment output with the plan; the report quotes it.

The assessment is read-only: it never writes to the legacy project and never opens a
window. A missing vendor installation is reported with the searched roots and a fix;
the saved-format readers do not need the vendor IDE.
