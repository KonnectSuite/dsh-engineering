---
id: rslogix500-common-faults
title: SLC 500 common fault classes
section: Faults
identifiers: [fault, watchdog, overflow, "I/O fault", "power-up fault", "runtime fault", "scan fault"]
revision: 12.00.00
---

# SLC 500 common fault classes

A faulted SLC 500 processor records a class code in `S:2` and context in `S:3`. This page describes the classes an engineer meets most often and where the evidence lives. It deliberately does not quote a numeric table: the code meanings vary with family and firmware, and the project identity is the authority.

## Power-up and memory faults

The processor checks memory and configuration at power-up. A memory or configuration fault usually means the program or its data integrity did not pass the check, and the processor may fault before entering Run. Evidence: `S:1` mode and fault flags, `S:2`/`S:3`, and whether the project the operator holds is the one the processor has. Recovery normally requires reloading a known-good project; that is a write action and belongs to the operator with RSLogix 500, not to this read-only row.

## Runtime instruction faults

A math overflow caught by the overflow trap shows in `S:13` and surfaces in the fault words. Division by zero and out-of-range results are common causes. The most useful evidence is the rung that produced the result, the operand values before the instruction, and whether the overflow trap is masked. Report the fault word and the candidate rung; do not assert a single cause without reading the operands.

## I/O and communication faults

`S:5` summarises I/O status. A module that stops responding, a rack or slot that fails its check, or a communication path drop can fault or set status without faulting the processor. Distinguish a fault from a degraded scan: a running processor with a nonzero I/O status word is not the same as a faulted one.

## Watchdog and scan faults

The watchdog fault means one scan exceeded the watchdog interval. A heavy loop, a long instruction or a jump structure that never exits is the usual cause. Evidence: the fault words and the rung nearest the scan exit; timing evidence, not opinion.

## What to report

Report the processor mode, the fault code word and value, the fault data word and value, the I/O status word, and the rung or address your read path can prove. State which read path produced them and what it could not see. Then name the next step: reload, correct the rung, or inspect the module. Never offer to make the edit — this row reads, and the operator's RSLogix 500 session owns the change.
