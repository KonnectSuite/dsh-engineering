---
id: rslogix500-addressing-data-files
title: SLC 500 addressing and data files
section: Addressing
identifiers: [N7:0, B3:0, I:1/0, O:0/0, T4:0.PRE, C5:0.ACC, F8:0, R6:0, "N7:0/5"]
revision: 12.00.00
---

# SLC 500 addressing and data files

An SLC 500 address names a file by type letter and number, then an element inside that file, and sometimes a bit or a word-level field inside the element. The same notation appears in rungs, in data-file tables, and in documentation exports, so read it the same way in all three.

## File types

The type letter fixes what an element means: `O` outputs, `I` inputs, `S` the status file, `B` binary bits, `T` timers, `C` counters, `R` control, `N` integers, and `F` floating point. Legacy programs also carry older file types by letter; a file type the reader does not recognise is a warning, not a silent skip. File numbers are assigned per type, so `N7` and `B7` are different files.

## Address forms

- A word address is `N7:0` — integer file 7, element 0.
- A bit address is `B3:0/5` — binary file 3, element 0, bit 5.
- An input is `I:1/0` — input file, slot 1, bit 0. An output is `O:0/0` — output file, slot 0, bit 0. The number after the colon is the slot, not a data-file number.
- A timer field is `T4:0.PRE` (preset), `T4:0.ACC` (accumulated) or `T4:0.EN`/`.TT`/`.DN` (enable, timing, done).
- A counter field is `C5:0.PRE`, `C5:0.ACC`, or a status bit such as `.DN`.
- The status file is addressed like any file, for example `S:2` for the fault code word.

## Indexed and indirect forms

An indexed address uses the processor's index register to offset the element at run time; the index register is the status word `S:24`. Do not flatten an indexed reference into a fixed address unless you can prove the index value at the moment the rung executes. Indirect file references (a file number taken from another word) are a different construct again, and a text export may not preserve enough context to resolve them safely. Say which form you read and what remains unresolved.

## Data files and the export

Data files hold the element values. A data-file table in the export carries the declared element count and, where present, the value rows. A missing row is not a zero: the read path may simply not carry that element. `slc500_data_read` reads one file's window and says what it carried; `slc500_find` can match a value back to its address.

## Symbol truncation

The `.SLC` text export keeps symbols to 15 printable ASCII characters. Two different symbols can therefore collapse to the same text, and a description that looks truncated probably is. The documentation export (`.EAS`, `.ERP`, `.EIC`, `.ESG`) keeps the fuller record; when names matter, read that export.
