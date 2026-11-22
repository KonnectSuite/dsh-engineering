# The .PC5 text export grammar

This page defines the neutral text export the six text tools read. The format is
line-oriented, human-reviewable, and deliberately small: it carries the program
structure, the rung text, the data-file table, and nothing that requires a vendor
runtime.

The tools are strict about the header and the closing `END`, because a truncated
export is worse than a refused one: it would make a verify verdict claim structure the
file does not have.

## A complete example

```
PC5 EXPORT 1
PROCESSOR PLC-5/40E
PROJECT LINE-3_PALLETIZER
REVISION A
; program files
PROGRAM_FILE 2 LADDER "MAIN"
RUNG 0 XIC(I:010/00) OTE(O:010/00)
RUNG 1 XIC(I:010/01) TON(T4:0)
RUNG 2 XIC(T4:0.DN) BST(XIC(B3:0/0) NXB(XIC(B3:0/1)) BND() OTE(O:010/01)
RUNG 5 MOV(N7:0,N7:1)
END_PROGRAM_FILE
PROGRAM_FILE 3 SFC "SEQUENCE"
RUNG 0 XIC(S:2/0) OTE(B3:1/0)
END_PROGRAM_FILE
DATA_FILE N7 "COUNTS" 100
DATA_FILE T4 "TIMERS" 50
DATA_FILE B3 "FLAGS" 16
END
```

## Record grammar

- `PC5 EXPORT <n>` — required first non-comment line. `<n>` is an integer schema
  number. The reader accepts schema 1 and reports any other number as an unsupported
  export schema.
- `PROCESSOR <text>` — optional, once, before the program files.
- `PROJECT <text>` — optional, once, before the program files.
- `REVISION <text>` — optional, once, before the program files.
- `PROGRAM_FILE <number> <LADDER|SFC> "<name>"` — opens a program section. The name is
  double-quoted. The type is one of the two program types the exporter can write.
- `RUNG <number> <text>` — one rung inside the current program file. The text is the
  neutral instruction text described on the rung grammar page.
- `END_PROGRAM_FILE` — closes the current program file.
- `DATA_FILE <type><number> "<name>" <elements>` — one data file at top level. The
  type is one or two letters, the number is digits, the name is double-quoted, and the
  element count is a positive integer.
- `END` — required last record.
- `; comment` — a whole-line comment, allowed anywhere and ignored.
- Blank lines are ignored; leading and trailing whitespace is stripped.

## Determinism of the format

The format has no timestamps, no absolute paths, and no generated identifiers. An
exporter that writes the same program twice may produce byte-identical text. The text
tools rely on that: two exports of an unchanged program diff clean, and a clean diff
means the program text did not change.

If your export tool adds a generation timestamp or a machine name, remove it before
committing the file or expect a diff on every run. The bundle's readers ignore comment
lines, so a timestamp in a comment does not affect the census, but a timestamp in a
directive would fail the grammar.

## What the reader does with an unknown record

An unknown directive is a structure error with its line number, not a silent skip. The
reader reports:

- the line number and the first token it did not understand,
- whether the error is fatal (header, `END`, balanced parentheses) or a warning
  (a duplicate program-file number, a rung number going backwards),
- a fix: correct the line, or regenerate the export from the project.

`plc5_verify` aggregates these into one verdict; `plc5_pc5` shows the records it
parsed and the issues next to them.

## What the export is not

- It is not the vendor binary project. A `.RSP` container is a different format; a text
  reader handed one fails with `SOURCE_NOT_INSTALLED` and says to produce the text
  export.
- It is not a runtime description. The scan order of rungs is the export order, but
  program scheduling, interrupts, and I/O updates are processor behaviour the text
  does not model.
- It is not a write format. The tools never write a `.PC5`; the file is input only.

## Size and truncation

The readers cap how much they parse and report (rungs per file, instructions, diff
entries). A truncated answer states the cap and the totals it saw, so a large program
never looks complete when it was only sampled. If an export is too large for the cap,
split it by program file with the exporter, or raise the limit where the tool allows
it.
