---
id: rslogix500-instruction-set
title: SLC 500 instruction set orientation
section: Instructions
identifiers: [XIC, XIO, OTE, OTL, OTU, ONS, TON, TOF, RTO, CTU, CTD, RES, MOV, MVM, ADD, SUB, MUL, DIV, JSR, JMP, LBL, MCR, AFI, NOP]
revision: 12.00.00
---

# SLC 500 instruction set orientation

SLC 500 programs are rung-based ladder logic. Each rung is a condition area that ends in one output instruction. The neutral-text export prints each rung as text in the vendor's own spelling; read that text and quote it, rather than re-typing ladder graphics.

## Contacts and coils

- `XIC` examines a bit and is true when the bit is on.
- `XIO` examines a bit and is true when the bit is off.
- `OTE` drives a bit to the rung's condition. Non-retentive: it is off when the rung is false.
- `OTL` latches a bit on, and `OTU` unlatches it. A latched bit stays on until an unlatch of the same bit executes, so latch/unlatch pairs belong together.
- `ONS` passes one scan of true on a rising edge. Use it for one-shot actions, not for level logic.

## Timers and counters

- `TON` is an on-delay timer: it accumulates while the rung is true and sets its done bit at the preset.
- `TOF` is an off-delay timer: it starts timing when the rung goes false and resets its done bit after the preset.
- `RTO` is a retentive timer: it keeps its accumulated value when the rung goes false and is cleared by `RES`.
- `CTU` counts up on false-to-true transitions of its count input; `CTD` counts down. `RES` clears a counter or a retentive timer.
- Timer and counter elements are addressed by file and element, for example `T4:0.PRE` (preset) or `C5:0.ACC` (accumulated value).

## Data and program control

- `MOV` copies a value; `MVM` copies through a mask so only the masked bits move.
- `ADD`, `SUB`, `MUL`, `DIV` and related math instructions write a result. Where an instruction writes is part of the logic, not a comment.
- `JSR` calls a subroutine file, `JMP` and `LBL` jump within a program file, and `MCR` marks a master-control zone. A missing `LBL` or a routine that never returns is a real program defect.
- `AFI` and `NOP` are placeholders used while editing. They can make a rung false or inert, so report them rather than pretending the rung is normal logic.

## Reading instruction behaviour

`slc500_docs` holds the durable descriptions; the tool answers identify the instruction by mnemonic. When reading a project, prefer the operand values and addresses from the file over a memorised description, and when the two disagree, quote the file. For cross-family conversion, the instruction that replaces an SLC 500 instruction is a migration question: use `migration_docs`, not this page.

## Known limits

The text export does not carry the ladder graphics, so branches and nested branch structure come through as the export writes them. Do not reconstruct a drawing you did not read. Instruction availability varies by processor family, series and firmware; the project's own identity is the authority for what it can run.
