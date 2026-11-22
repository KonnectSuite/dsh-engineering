# Reading a text export with the six read-only tools

The six text tools are the review surface for a `.PC5` export. They share a shape: a
summary, a data object, suggested next tools, and a coverage block. They never write
and never need RSLogix 5 installed.

## `plc5_pc5` - the structure report

Reads the export and reports what it contains: the header (schema, processor, project,
revision), one row per program file (number, type, name, rung count), the data-file
table, and the structure issues the parser found. This is the first tool to call on an
unknown export: it answers "is this file what I think it is?".

## `plc5_instruction_inventory` - the mnemonic census

Counts every instruction by mnemonic, with a per-program-file distribution and the list
of unknown mnemonics. Use it to estimate conversion effort by family:

- contacts, coils, and moves are mechanical work,
- block transfers, messages, and PID are review work,
- unknown mnemonics are work you have not scoped yet.

The inventory is sorted: mnemonics by name, files by number. It caps the number of
mnemonic rows it prints and says how many were folded into the rest.

## `plc5_rung_digest` - the shape of each program file

Per program file: rung count, instruction count, average instructions per rung, branch
token counts, the first and last rung number, and the number of numbered gaps. The
digest is how you notice that a "small" program file has 900 rungs or that a file is
mostly branches.

## `plc5_indirect_census` - the operands you cannot resolve statically

Reports every site where an operand is not a plain address:

- bracket indirect addressing (`N7:[N10:0]`),
- leading-`#` file operands,
- `?` placeholders.

Each site carries its program file, rung number, instruction, and the operand text. The
census is the review list: an indirect site is either converted or accepted with a
recorded reason, never silently ignored.

## `plc5_verify` - the consistency verdict

Runs the structural checks and returns a verdict (`ok`, `warnings`, or `errors`) with a
list of checks:

- header present and schema supported,
- `END` present and program files closed,
- no duplicate program-file numbers or data-file declarations,
- rung numbers unique and increasing per file,
- operands that reference declared data files resolve,
- unknown mnemonics and `?` operands are reported,
- no empty program files.

The verdict is about consistency, not correctness. A clean verify means the export is
well-formed; it says nothing about whether the logic is right.

## `plc5_diff` - two exports, one difference list

Compares two exports and reports:

- header field changes (processor, project, revision),
- program files added, removed, or renamed,
- rungs added, removed, or changed, keyed by program file and rung number.

The diff is bounded: the number of reported changes is capped and the totals are
reported, so a huge diff does not flood the answer. Use it to review a hand edit, to
compare two exports of allegedly the same program, or to confirm a comment-only change
is really comment-only.

## Determinism and limits

All six tools are deterministic: same input, same JSON. No clock, no random ordering,
no absolute paths. Lists are sorted by a stable key (program file number, then rung
number, then mnemonic). Where output is capped, the answer reports both the shown count
and the total.

They read local files only. A path outside the workspace is resolved through the
host's filesystem service; if the chat cannot read it, the failure is `ACCESS_DENIED`,
not a partial read.

## A review order that works

1. `plc5_pc5` - confirm the file is the export you meant.
2. `plc5_verify` - confirm it is well-formed before trusting any count.
3. `plc5_instruction_inventory` - scope the conversion work by family.
4. `plc5_rung_digest` - find the heavy files and the gaps.
5. `plc5_indirect_census` - list the operands that need a decision.
6. `plc5_diff` - compare against the previous export after every edit.
