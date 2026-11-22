---
name: rslogix-5
description: Read RSLogix 5 (PLC-5) .RSP projects headlessly and read-only — ladder in neutral text, I/O footprint, chassis configuration, data-file table, processor identity — separating what the project records from what only an online read or the physical racks can answer.
---

# RSLogix 5 (PLC-5) reads

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is
installed, open or on disk; the host is read only when the operator points at it, or when the work is
inside an existing project (`CRAFT-ORD-01`).

A PLC-5 project is a legacy artifact: the machine it describes is usually running, the panel drawings are paper, and the file is the only program copy. Every read here is headless, hidden and read-only — the project opens through the RSLogix 5 automation server with `Visible = False` and closes with the do-not-save flag. No tool writes a project, and no tool contacts a controller.

## The rules

1. **Read-only, always.** A headless save was observed to block on a dialog; PLC-5 is legacy and the engineering answer is evidence, not blind edits. Never ask for a write, never claim one.
2. **Never go online uninvited.** `GoOnline` / `Upload` exist on the automation server; these tools do not use them. An online read of the real I/O configuration is a human decision on a live machine — say so and stop.
3. **Separate the three inventories.** The project records chassis and adapters (1771-A4B, 1794 adapters, rack/group ranges). It does NOT record the point cards in the slots, and it does NOT record the processor catalog number. The program's rung text references racks the configuration never covers (block transfer / Dataway). State which of the three a number comes from.
4. **Label the source of every fact.** The automation server is authoritative for configuration and rung text; the container reader (no vendor product needed) is authoritative for what the file physically stores — project name, processor type string, author, route with its IP, and the ladder program-file names. Say which answered.
5. **Count references in rung text, not in a strings dump.** Each operand appears in both the rung record and the operand table, so raw string counts double. The census counts occurrences in neutral-text rungs.
6. **The file stores opcodes, not rungs.** A project keeps its subsystems as compound-file storages and packs many payloads behind a 16-byte header and a zlib payload; the reader unpacks those, and still finds no rung text — `XIC`/`OTE` are compiled. Ladder text, rung counts, the symbol table and the `I:`/`O:` footprint therefore need the automation server, and the container path must say so rather than imply the program was read.
7. **The 32-bit host is the way.** Drive the object model from Windows PowerShell in SysWOW64. `FileOpen` takes six arguments; `Quit` takes the save flag — 0 means do-not-save, `$true` means SAVE. `PromptForRevNote = False` before opening.
8. **Report coverage, not certainty.** Every answer carries `coverage.unverified`. A footprint census is not a BOM; a rung count is not a behavior claim.

## The tools

- `plc5_capabilities` — what this machine can read: 32-bit host present, COM server registered, container census (streams, sizes, packed flags). Run it first on a new machine.
- `plc5_open` — the program census: files with type and rung counts, total rungs, symbol and data-file counts, revision, app version. Falls back to the container reader when RSLogix 5 is absent or will not start, naming the project, the processor and the ladder program files, and says what it could not read.
- `plc5_ladder` — rung text in neutral mnemonic form (XIC/XIO/OTE/TON/CTU/JSR) for one file, paged 1–200 rungs.
- `plc5_find` — search every rung and the symbol table for an address, mnemonic or name.
- `plc5_io_census` — reduce every `I:`/`O:` reference to rack/slot cells with reference counts and highest bit, split configured racks from program-only racks.
- `plc5_io_config` — the configured chassis: adapter part numbers, slot counts, rack/group ranges, adapter addresses.
- `plc5_data_read` — the data-file table: number, type, name, element count. Data-file values are not stored readably and are never claimed.
- `plc5_processor` — the controller: type string, author, memory words, type code, series, driver, RSWho route with IP, online/faulted flags — each labelled with its source.

## The .PC5 text readers

A project can be exported as neutral text; `.PC5` here is that line-oriented text export, never the binary `.RSP` container. Seven readers work on it offline:

- `plc5_pc5` — the structure report: header, program files, data files, every issue with its line and fix.
- `plc5_verify` — one verdict (`ok`, `warnings`, `errors`) over header/schema, the closing `END`, duplicate declarations, rung numbering, data-file references, unknown mnemonics, `?` operands and empty files.
- `plc5_instruction_inventory` — mnemonic census with a per-file distribution; an unknown mnemonic is listed, not guessed.
- `plc5_rung_digest` — per-file rung and instruction counts, branches, first/last rung, numbered gaps, duplicates.
- `plc5_indirect_census` — every operand that is not a plain address: `N7:[N10:0]`, `#N7:0`, `?`.
- `plc5_diff` — two exports compared: header, program and data files, rungs added, removed and changed.
- `plc5_docs` — the authored corpus: instruction set, rung/address grammar, I/O configuration, the `.PC5` export grammar and its pitfalls, error codes.

A binary project renamed `.pc5` fails with `SOURCE_NOT_INSTALLED` because no text export exists. A `.RSP`, `.L5X`, `.RSS` or `.ACH` path fails with `UNSUPPORTED_FORMAT`. Truncated or malformed text is refused or reported by line, never half-read.

## The shape of a good answer

An inventory answer names: the processor as the project records it (type string, not a catalog), the program census (files/rungs/data files), the chassis table with adapter parts, the footprint split (configured vs program-only racks), and the explicit gap — "the point cards are not in the project; an online read, the panel drawings, or the nameplates carry them." A BOM built without that sentence is a defect, not a report.

## Failure codes to expect

`PLC5_COM_UNAVAILABLE` (RSLogix 5 not installed/activated), `PLC5_POWERSHELL_MISSING` (no SysWOW64 host), `PLC5_OPEN_FAILED` (locked/corrupt file or a dialog waiting), `PLC5_NO_PROJECT` (not an .RSP this installation can open), `PLC5_TIMEOUT` (a hidden dialog is usually waiting — close stray RSLogix windows and retry), `NOT_AN_RSP` (an .RSS/.ACH belongs to RSLogix 500, not this row). The text readers add `UNSUPPORTED_FORMAT`, `SOURCE_NOT_INSTALLED`, `PARSE_ERROR`, `TRUNCATED_EXPORT`, `EMPTY_EXPORT`, `FILE_MISSING`, `NOT_A_FILE`, `ACCESS_DENIED` and `INVALID_ARGUMENT`; each answer carries the fix, not only the code.
