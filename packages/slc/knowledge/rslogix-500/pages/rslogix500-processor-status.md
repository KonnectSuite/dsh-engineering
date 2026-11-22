---
id: rslogix500-processor-status
title: SLC 500 processor status words
section: Processor
identifiers: [S:1, S:2, S:3, S:5, S:13, S:24, "S:2", "S:3", status file]
revision: 12.00.00
---

# SLC 500 processor status words

The status file is a data file like any other, addressed `S:`. Its words carry the processor's mode, fault state and housekeeping. Read the value from the file or the automation snapshot before explaining it; a memorised bit table is not evidence about this processor.

## The words this row names

- `S:1` — processor status flags, including the mode the processor is in and fault-related flags. The exact bit meanings belong to the processor family and series in the project identity.
- `S:2` — the fault code word. A nonzero value means the processor recorded a fault; the number is a fault class code, not an instruction address.
- `S:3` — fault data. It usually carries the address or context that goes with the `S:2` code, which is why the two words are read together.
- `S:5` — I/O status word: the processor's summary of the I/O subsystem for the scan.
- `S:13` — arithmetic overflow trap. When it is set, a math instruction overflowed; the fault may be masked or latched depending on configuration.
- `S:24` — the index register used by indexed addressing. A rung that uses an indexed address depends on this word's value at execution time.

## Reading order

Start with the processor identity, then `S:1` to know the mode and fault state, then `S:2` and `S:3` together for a fault, then `S:5` for I/O and `S:13` for math faults. `slc500_processor` reports the values the read path actually carried; when the text export or transcript has no value for a word, the answer says so and marks the read incomplete.

## Faults and what to say

A fault code is not a diagnosis by itself. Pair it with its fault data, with the most recent rung the read path can identify, and with the processor family from the project identity. When the fault class is not documented in this authored corpus, say that the cause is not established here and point the operator at the processor's own documentation. Never translate a numeric code into a cause without a cited page.

## Do not hard-code

Bit positions and code tables change between processor families and firmware. This page intentionally names the words and their roles, not a frozen bit map. Use `slc500_docs lookup` with the word address and read the page, and quote the values you read.
