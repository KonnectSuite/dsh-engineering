# SLC 500 and PLC-5 to Logix migration

`@aryacode/dsh-engineering` ships 7 tools and one interview workflow that carry an RSLogix 500 (SLC 500) or
RSLogix 5 (PLC-5) program into Studio 5000: read the legacy project, lint the `.L5K` the migration wizard
writes, compare the imported project against the legacy logic, resolve every conversion marker, and write
the report a person signs before commissioning.

The conversion itself is Rockwell's migration wizard. This row does not translate instructions. It is the
work around the wizard — the assessment before it, the repair after it, and the evidence that the result is
what the report says it is.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `migration` — *SLC 500 and PLC-5 to Logix migration* |
| Capability class | `offline-file` (one vendor call reads a legacy project; everything else is a file read) |
| Stability | beta, since `v0.72.0` |
| Tools | 7, under the `migration_`, `l5k_` and `slc_` prefixes |
| Package / entry | `packages/migration` → `entries/migration.js` |
| Skill | `legacy-to-logix-migration` (`packages/migration/SKILL.md`, 9,800-character budget) |
| Probe | `migration_assess` |
| Switches | `assess`, `lint`, `compare`, `resolve`, `report`, `plan` |

The row never drives Studio 5000 and never contacts a controller. Exactly one tool starts another
program: `slc_read` opens RSLogix 500 or RSLogix 5 hidden, reads, and closes without saving. Everything
else works on files.

The workflow is a gate sequence, and the tools are shaped by it:

```text
migration_plan      → five decisions, eight stages, one resumable plan
migration_assess    → what the file is and what the conversion will have to change
slc_read            → the legacy program's own census, rungs and symbols
l5k_lint            → will Studio import it, and what will bite afterwards
migration_compare   → what reached Logix, and which differences are real
migration_resolve   → every marker the wizard left, with a proposed answer
migration_report    → the document a person signs
```

A stage is not "done" because a tool returned. The plan records evidence per stage, and it refuses to
advance until the five decisions are answered:

| Decision | Why it must be answered first |
| --- | --- |
| `target_cpu` | the controller family decides the I/O strategy that follows |
| `target_revision` | revision 37 and later is the only target an offline build can prove |
| `io_strategy` | keep the 1746 chassis behind a 1747-AENTR, or replace the modules |
| `hmi_scope` | whether the HMI is in this migration now or recorded for later |
| `acceptance` | what proves the migration is done — the report quotes it |

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| RSLogix 500 or RSLogix 5 | — | `slc_read` on `.RSS`, `.ACH` or `.RSP`; the migration wizard itself (it lives in the legacy product) | yes — a `.SLC` text export and an `.L5K` need neither |
| A 32-bit-capable Windows host | — | the vendor automation server behind `slc_read` and the wizard's Save As | yes, with the same `.SLC` fallback |
| Studio 5000 Logix Designer | revision 37+ for an offline build proof | importing the wizard's `.ACD` and exporting it to `.L5X`; retargeting the project and building it offline | yes for the first stages, no for the last |
| Nothing | — | `l5k_lint` on a `.L5K` | no |

The recorded verification is a converted RSLogix 500 project and the `.L5K` the wizard wrote, plus the
PLC-5 and SLC 500 programs named under [What it measures](#what-it-measures). Few real projects have been
through it; wizard leftovers vary by revision, and the workflow grows release to release.

## First session

Start with the plan, not the file. The five decisions determine what "done" means, and the plan is what
keeps the session resumable across the days a migration takes.

| Step | Call | What you see |
| --- | --- | --- |
| 1. Interview | `migration_plan {action: "create", source, family, ...}` | `.migration/plan.json` schema 1: the source with its hash, the five decisions, eight stages and an exception list; `next_action` names the one thing to do next |
| 2. Assess | `migration_assess {path}` | for `.L5K` the lint verdict as well; for `.RSS`/`.ACH`/`.RSP` what the container is and what the conversion still needs; for an imported `.L5X` a wizard-defaults audit |
| 3. Read the legacy program | `slc_read {path}` | program files, rung counts, rung text, symbols and data files — or the `.SLC` export counted when the vendor product is not installed |
| 4. Convert | the wizard, File > Save As | the `.ACD`, and the optional `.l5k` the wizard deletes once the `.ACD` is written — keep a copy if you want to lint it |
| 5. Export | Studio 5000 | the `.L5X` from the imported `.ACD` |
| 6. Lint and repair | `l5k_lint {path}` | findings ordered by line: rule, severity, line, and the failure each one would cause |
| 7. Compare | `migration_compare {source, logix}` | matched ladder files and routines, rung totals, symbol and data-file coverage, indirect addressing that survived, and every difference classified expected, real or cosmetic |
| 8. Resolve | `migration_resolve {source, logix}` | every PCE marker and every `?` operand, the legacy rung it came from, and a proposed rewrite classified mechanical or review |
| 9. Report | `migration_report {source, logix, corrected, output}` | the Word or Markdown report: two programs side by side, marker census, corrections rung by rung, open items |

Steps 4 and 5 are the wizard's. Everything before them says what to expect; everything after says whether
you got it.

## What it does

| Tool | Input | What it answers |
| --- | --- | --- |
| `migration_plan` | a source and a family | the five decisions, eight stage gates, exceptions with status `open`/`accepted`/`fixed`, and one `next_action` |
| `migration_assess` | `.L5K`, `.SLC`, `.RSS`, `.ACH`, `.RSP` or `.L5X` | what the file is, which controller it targets, and what a migration must still change; on an imported `.L5X`, the wizard-defaults audit |
| `l5k_lint` | `.L5K` | every import blocker with its line, plus the counts a text reader can make (tags, routines, rungs, modules, indirect addresses, controller revision) |
| `slc_read` | `.RSS`, `.ACH`, `.RSP` | the legacy program headlessly through the 32-bit vendor automation server: files, rungs, text, symbols, data files |
| `migration_compare` | legacy + `.L5X` | which ladder files reached which routines, how many rungs survived, what symbols and data files carried over, and which differences are real |
| `migration_resolve` | legacy + `.L5X` | every marker and unknown operand, with a proposed rewrite and the basis for it |
| `migration_report` | legacy (or `.SLC`) + `.L5X` (+ corrected `.L5X`) | the signed report, as `.docx` or `.md` |

The formats it reads are the legacy formats, not a Logix one:

| Format | What it is | What the row does with it |
| --- | --- | --- |
| `.L5K` | the text the migration wizard writes and Studio imports; UTF-16LE from Studio, UTF-8 after a hand repair | decodes either, reads the declarations, lints the text |
| `.SLC` | the RSLogix 500 text export: `LADDER n`, `% Rung: n %`, ASCII mnemonics, `DATA B3:0` tables | counts ladder files, rungs, racks and data files; the read-only truth for the old logic when RSLogix 500 is absent |
| `.RSS`, `.ACH`, `.RSP` | OLE2 containers holding the vendor project | `slc_read` opens hidden and returns the program; `migration_assess` states what the container is and what conversion needs |
| `.L5X` | a Logix export | refused with `ALREADY_LOGIX`; open it with the L5X tools instead |

### What the lint finds

| Rule | Severity | What it means |
| --- | --- | --- |
| `TRAILING_COMMA` | error | an attribute list ends with a comma before `)`; Studio aborts the whole import as invalid attribute syntax |
| `DUPLICATE_TAG` | error | the same tag declared twice |
| `TAG_NAME_TOO_LONG` | error | a tag name over 40 characters |
| `ROUTINE_PAREN` | warning | a routine header ends with a stray `)` |
| `ROUTINE_UNBALANCED` | error | `ROUTINE` and `END_ROUTINE` counts differ |
| `PLACEHOLDER_TAG` | warning | a tag stands in for a module with no Logix equivalent (a 1747-SDN, for example); correct output, and the replacement is an engineering decision |
| `INDIRECT_ADDRESS` | warning | a rung indexes an array with another tag (`N[N7_130]`); Logix cannot express it |
| `REVISION_BELOW_TARGET` | info | the controller revision is below 37, so only an import can be proved |
| `BOM` | warning | a byte-order mark where the importer does not expect one |

### What the comparison classifies

`migration_compare` treats a ladder file's terminal `END` rung as an end marker, not logic, and does not
report the terminal rung of the last file as logic the migration dropped. Data files of type `I`, `O` and
`S` are expected to become tags only if the conversion carried them.

A difference is **expected** when the wizard's own transformation explains it — several legacy files
landing in one routine, a split rung, routines the migration added. It is **real** when a routine is
missing, a rung was lost, an indirect expression survives, or a symbol did not carry. It is
**cosmetic** when only formatting differs. A data file whose header names no type is left out of the
data-file check rather than reported as unmapped: the wizard's tag spelling is unpredictable there, so
calling it missing would be a guess.

## What it measures

The numbers below come from the projects the workflow was verified against. They describe those projects,
not a guarantee about yours.

| Project | Result |
| --- | --- |
| Slitter 8, RSLogix 500 (3,409 symbol records, 209 data files) | 64 matched files, 1,398 of 1,426 legacy rungs carried, 2 real differences, 2 expected, 259 indirect expressions left for engineering |
| EN049, PLC-5 program | 34 matched files, 306 of 320 legacy rungs, 90 data files accounted for, 1 real difference (131 indirect expressions), 2 expected (6 added routines, 1 split rung) |
| EN049 markers, after resolution | 214 sites classified, 201 answerable from rung texts, 35 review; 65 rung rewrites, 37 operand repairs and 1 status-word rung removed took 177 markers to 22 and 54 rungs with `?` to 9; the rewritten file imports into Studio 5000 with 0 warnings and 0 errors |
| `SLITTER10_PLC1S0_08JUL2026_0953.RSS` | 15 markers across 55 rungs, 50 rungs with an unknown operand (codes 105, 109, 110, 114, 134, 135, 160); all 65 sites answerable, 11 rung rewrites and 44 operand repairs; imports with 0 warnings and 0 errors |
| Report on that project | 15 markers before, 0 after, 55 rungs corrected, 3 open items: `SLOT12_1747_SDN_Placeholder` with its 33 logic references, the `F[N7_120]` mechanical alias substitution, and the revision-31 ceiling |

Both builds stop later, at the vendor's own audit: `RxCMP_E_AUDIT_OUTPUTS` for EN049 (an instruction
touching the right power rail that is not an output) and `RxCMP_E_AUDIT_INVALIDOPTYPE` for the RSLogix 500
project. The first also stops on the wizard's export before any rewrite, so it is not the resolver's to
answer. The second names no instruction — a vendor message the SDK withholds.

## What it knows without research

Three things are written down rather than guessed at each session:

- **The instruction map.** `packages/migration/src/knowledge/instructions.ts` carries one row per legacy
  mnemonic — 58 of them — with the Logix candidate, the operand shape, the work class and the citation.
  `migration_assess` names the replacement beside each instruction it counts (`IIM x1 -> no Logix
  counterpart`, `PID x1 -> PID`), and `migration_resolve` appends the row to the advice beside every
  review site (`BTW -> MSG (review): … Basis: PLC-5 Instruction Set Reference 1785-6.1 …`).
- **The corpus.** Nine pages under `packages/resources/corpus/migration/` are readable with
  `engineering_reference`: `migration-pce-markers`, `migration-wizard-and-revisions`,
  `migration-placeholder-tags`, `migration-unknown-operands`, `migration-indirect-addressing`,
  `migration-instruction-map`, `migration-arrival-points`, `migration-analog-scaling` and
  `migration-wizard-defaults-to-audit`.
- **The citations.** A citation names a manual and a section (1747-RM001, 1785-6.1, 1756-RM003 / current
  1756-RM018A Sep 2025, 1756-RM085I, 5069-AP001A, 1746-RM003F) or says `observed` and names the export.
  No manual text is reproduced, and a rule id such as `MIGRATION-PCE-02` is this bundle's own, not a
  clause number.

## The wizard's own limits

The migration wizard cannot emit a project newer than it ships — 30 to 31 in the RSLogix 500 wizard, 30 to
32 in the RSLogix 5 one. That is a tool limit, not a choice: retarget the imported project to revision 37
or later in Studio 5000 before anyone quotes an offline build verdict.

While converting, the wizard asks for the target controller and then for an I/O strategy:

- **Keep Existing I/O** places the new controller in a rack beside a single EN2T or embedded Ethernet port
  and leaves the legacy chassis in a separate rack.
- **Update All I/O** maps each legacy module to a replacement from a drop-down.

A module with no Logix equivalent becomes a placeholder tag — a 1747-SDN DeviceNet scanner, for instance —
reported as `PLACEHOLDER_TAG`. The tag keeps the addresses compiling until an engineer chooses the
replacement. `Failed to export to ACD` is a lint result, not a dead end: fix the `.L5K` and import again.

Once the `.L5X` is imported, run `migration_assess` on it. The wizard-defaults audit is a day-one
checklist, to be run before a tag is written against a channel: analog channels still at wizard defaults
(Range 4, 0–20 EU, High Engineering 100), legacy chassis modules still declared, unnamed modules, module
Names with characters the importer refuses, `+ S24` byte-swap tokens, and residual `?` and PCE counts. Each
hit is a finding with the decision it needs.

## Limits

- The row reads text. It cannot prove runtime behaviour, I/O wiring or HMI bindings, and it never contacts
  a controller or writes a live tag.
- A revision 37+ target supports an offline build proof. An older target supports "import succeeded" only,
  and because the wizard cannot emit 37+, its output is import-verified until it is retargeted.
- The conversion is the wizard's. The SaveAs call through the automation API writes a native copy; the
  translator DLLs are undocumented, and this row does not reimplement them.
- `migration_resolve` proposes, never writes. Applying a mechanical proposal is a `draft_rung` /
  `compose_rung` call in this bundle's L5X tools, followed by a re-import to confirm the count fell.
- A made-up tag or operand fails the import. It cannot prove a conversion; that is the point.
- `migration_report` writes the report and nothing else. The Word output carries no runtime claim the
  Markdown does not.
- A build error gets three probes, not a session: one hypothesis per build, then write down what error
  survived and what the routine/rung bisect narrowed. The vendor's Errors tab names the rung; the SDK
  message often does not.
- Few real projects are measured. Wizard leftovers vary by revision, and a run that has not been through
  `migration_compare` is not a migrated project.

## Safety

| Path | What it writes | What it needs |
| --- | --- | --- |
| `migration_plan` | `.migration/plan.json` — decisions, stage evidence, exceptions | nothing else; it refuses to advance until the decisions are answered |
| `migration_report` | one `.docx` or `.md` file | an output path that does not exist, unless `overwrite: true` |
| `slc_read` | nothing to the project: it opens the vendor project hidden and closes it with do-not-save | RSLogix 500 or 5 installed |
| All other tools | nothing; they read and report | — |

The legacy project is never written. The wizard writes a new `.ACD`, Studio exports a new `.L5X`, and the
corrected file is a new file. Nothing in this row downloads to a controller or changes a running machine.

## Where to go next

- [RSLogix 5 (PLC-5)](plc5.md) — the deeper read of a PLC-5 project before migration.
- [Studio 5000 L5X](l5x.md) — opening the imported export, running the review rules, and drafting the
  corrected rungs.
- [Standards and checks](../reference/standards-checks.md) — the rules a migrated project is then judged
  against.
- [Tool reference](../reference/tools.md) — every `migration_*`, `l5k_*` and `slc_*` tool with its
  parameters.
