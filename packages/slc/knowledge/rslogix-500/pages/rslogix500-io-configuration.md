---
id: rslogix500-io-configuration
title: SLC 500 I/O configuration and slot addressing
section: I/O
identifiers: [slot, chassis, 1746, MicroLogix, "slot addressing", "I/O configuration"]
revision: 12.00.00
---

# SLC 500 I/O configuration and slot addressing

SLC 500 I/O addressing is slot-based. Slot 0 belongs to the processor (or the processor's first position in a fixed controller). I/O modules occupy the following slots in the local chassis, and expansion chassis continue the same slot counting. The input file uses `I:` and the output file uses `O:`; the number after the colon is the slot.

## Reading the addressing

- `I:1/0` is input slot 1, bit 0. `O:0/0` is output slot 0, bit 0.
- A word form such as `I:1.0` names the whole input word for slot 1, and `I:1.0/3` addresses one bit through that word.
- The text export often shows only the addresses the logic references. That is a footprint, not a module list: an unmentioned slot may still hold a module.
- `slc500_io_census` counts the referenced cells by slot, distinguishing word references from bit references and reporting the highest bit seen in each cell. `slc500_io_config` states the modules only when the read path carries them.

## What each read path can carry

The `.SLC` text export carries program logic, data files and symbols; it does not reliably carry point-card identity, wiring terminals, analog ranges or scaling. A documentation export carries the documentation record, not the physical configuration. The RSLogix 500 automation server can expose the configured module list when the edition supports the read; without it, module identities stay unverified.

When module identity matters, report what is proven — slot count and referenced addresses — and mark the rest `coverage.unverified`. Do not infer a part number from a slot number or from a nearby address. A program that references `I:1/0` proves only that input slot 1 bit 0 is used.

## Fixed and modular families

The SLC 500 family includes fixed controllers with built-in I/O and modular controllers whose chassis hold the modules. MicroLogix controllers use the same addressing model with their own slot counts. The processor identity read from the project says which family you are looking at; do not assume a chassis shape from the address range alone.

## Migration note

Physical configuration does not survive a conversion by itself. When the work is a migration, carry the slot-by-slot census as evidence for the target layout review, and let the migration workflow own the target module decisions.
