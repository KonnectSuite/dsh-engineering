# Rung and address grammar in a text export

The text export is line-oriented. Each line is one record: a directive, a rung, a data
file, a comment, or a blank line. This page describes the grammar the text tools read.

## Record types

| Line | Meaning |
| --- | --- |
| `PC5 EXPORT <n>` | The header. The first non-comment line; `<n>` is the export schema number. |
| `PROCESSOR <name>` | Processor model as the exporter recorded it. |
| `PROJECT <name>` | Project name. |
| `REVISION <name>` | Program revision or export revision label. |
| `PROGRAM_FILE <n> <LADDER\|SFC> "<name>"` | Opens a program file. Rungs follow until `END_PROGRAM_FILE`. |
| `RUNG <n> <text>` | One rung: a rung number and the neutral text. |
| `DATA_FILE <type><n> "<name>" <elements>` | One data file: type letter, file number, name, element count. |
| `END_PROGRAM_FILE` | Closes the current program file. |
| `END` | Closes the export. |
| `; text` | A comment line, ignored. |

Leading and trailing whitespace is ignored. Blank lines are ignored. Directives are
case-sensitive in the grammar as written; the reader accepts the documented uppercase
form and reports anything else as an unknown directive.

## The rung text

A rung is a sequence of instruction tokens and structural tokens:

```
RUNG 12 XIC(I:010/00) BST(XIO(B3:0/0) NXB(XIC(B3:0/1)) BND() OTE(O:010/00)
```

- An instruction token is `MNEMONIC(operand,operand,...)`. Operands are separated by
  commas. A zero-operand instruction is written with an empty list.
- An operand is one of: an address (`I:010/00`, `N7:0`, `T4:0.PRE`), a numeric literal,
  a quoted string, an indirect bracket (`N7:[N10:0]`), a file operand with a leading
  `#`, or an unknown placeholder written as `?`.
- Branch tokens are `BST(...)`, `NXB(...)`, and `BND(...)`. `BST` opens a branch,
  `NXB` begins the next leg, and `BND` closes it. The tokens nest: a branch inside a
  branch is written inside the parentheses of the outer leg.
- The parentheses inside a token are balanced. A rung with unbalanced parentheses is a
  structure error reported with its line number.

The reader tokenizes the text and does not evaluate it. Two rungs with the same
instructions in the same order are the same rung for the digest and the diff, whatever
their spacing.

## Rung numbers

Rung numbers are the exporter's numbering inside one program file. They are usually
increasing but need not be contiguous: rungs can be deleted, and comments occupy
numbers. The digest reports gaps; `plc5_verify` reports a non-increasing sequence or a
duplicate number as a warning, because a reader that keys rungs by number cannot tell
deleted from renumbered.

Rung numbers restart in each program file. A rung number alone does not identify a rung
across a project; the pair (program file, rung number) does.

## Addresses

PLC-5 addresses are file-letter based: `I`, `O`, `S`, `B`, `T`, `C`, `R`, `N`, `F`,
`D`, `A`, `ST`, `PD`, `MG`, `BT` and others, followed by a file number and an element,
and optionally a bit:

- `N7:0` — integer file 7, element 0.
- `B3:0/0` — bit file 3, element 0, bit 0.
- `T4:0.PRE` — timer file 4, element 0, member PRE.
- `I:010/00`, `O:013/01` — I/O image addresses, written with the rack/group and bit
  digits the exporter prints.

The text tools do not reinterpret the digits of an I/O address. They treat the address
as one operand, report it verbatim, and leave the physical meaning to the reader's
project documentation. That is deliberate: the same digits can mean different things
across PLC-5 I/O configurations, and guessing is how a point gets mis-mapped.

## What a malformed export looks like

- a first line that is not `PC5 EXPORT <n>`,
- a `RUNG` line outside a `PROGRAM_FILE` section,
- a missing `END_PROGRAM_FILE` or a missing `END`,
- unbalanced parentheses in a rung,
- a data-file line with no type letter or no number.

Each is reported with the line number and the directive involved. The reader never
skips a malformed record silently; a silent skip would make a verify verdict claim
more consistency than the file has.
