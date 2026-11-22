---
name: rslogix-500
description: Read an RSLogix 500 (SLC 500 and MicroLogix) project — text exports, ladder logic, I/O census, documentation exports, processor status words — read-only and offline.
---

# RSLogix 500 project reads

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is installed, open or on disk; the host is read only when the operator points at it, or when the work is inside an existing project (`CRAFT-ORD-01`).

## Rules

1. This row reads. It never edits a project, never goes online to a processor, never writes an `.RSS`, `.SLC` or documentation export, and never claims a change it did not make.
2. Open one path per call. Paths come from the operator or from the current task; do not guess project names or scan a folder looking for work.
3. Prefer the vendor text exports: an `.SLC` text export is the neutral-text path and works with no RSLogix 500 install. A documentation export (`.EAS`, `.ERP`, `.EIC`, `.ESG`, `.CSV`) is the highest-fidelity machine-readable description of symbols, addresses and comments.
4. An `.RSS` project is a binary container. Reading it needs the RSLogix 500 automation server, and only the Professional or Developer edition exposes the read methods. When the server is absent the answer is `SOURCE_NOT_INSTALLED`; when it is registered but the edition or a transcript is missing the answer is `NOT_LICENSED`. Do not tell the operator to convert without naming the export step.
5. An `.ACH` file is APS-era material. Detect it, name it and refuse: re-save it from the era's tool or export a text version. Never attempt a best-effort decode.
6. An `.SLC` export truncates symbols to 15 printable ASCII characters. When a symbol looks cut off, say so and suggest the documentation export, which keeps the full symbol and description.
7. The text export does not carry point-card identities, wiring, or analog scaling. I/O configuration read from text answers only what the file proves; the rest is `coverage.unverified`, never invention.
8. Read a status word from the file or automation snapshot and explain it with `slc500_docs`; do not recite a bit table from memory. When the values are not in the file, say the read path could not carry them.
9. When two sources disagree — a binary read and a text export, or two exports — return both values and name both paths. A conflict is evidence to show the operator, not an error to hide.
10. For legacy conversion work, hand off to `migration_assess` or `migration_docs`; this row describes SLC 500 semantics, it does not convert.

## The tools

- `slc500_capabilities` — what this host has: install and version, help trees, automation class registration, 32-bit PowerShell, read paths.
- `slc500_open` — open a project path, name the read path, return identity and inventory. Optional `export` compares a second source and surfaces conflicts.
- `slc500_ladder` — read one program file's rungs in neutral text, by file, start and limit.
- `slc500_find` — search symbols, data-file values, and rung text; say which scope matched.
- `slc500_io_census` — count the I/O addresses the logic references by rack/slot cell, word and bit.
- `slc500_io_config` — the processor chassis and I/O modules, or the honest limitation when the read path cannot carry them.
- `slc500_data_read` — a value window from one data file, with counts and types.
- `slc500_processor` — processor identity and status words, with the status addresses it read.
- `slc500_database` — parse an RSLogix 500 documentation export (`.EAS`, `.ERP`, `.EIC`, `.ESG`, `.CSV`) into address, symbol, description rows.
- `slc500_docs` — authored knowledge: instructions, addressing, I/O slots, status words, export grammar, legacy formats. Actions: contents, search, read, status, lookup.

## Shape of a good answer

State the read path first — text export, documentation export, or RSLogix 500 automation — then the counts you actually read, then the specific findings with file and rung or address locators. Quote the export or transcript name. When the answer depends on a status word, name the word and the page that explains it. List what the read path could not carry under `coverage.unverified` rather than guessing. Keep the write path clean: nothing in this row writes, and you must not offer to.

## Failure codes

`FILE_MISSING`, `FILE_UNSUPPORTED`, `UNSUPPORTED_FILE`, `USE_DATABASE_TOOL`, `PARSE_FAILED`, `DATABASE_FORMAT_UNSUPPORTED`, `PROGRAM_FILE_NOT_FOUND`, `NO_LADDER`, `DATA_FILE_NOT_FOUND`, `SOURCE_NOT_INSTALLED`, `NOT_LICENSED`, `TRANSCRIPT_INVALID`, `ACCESS_DENIED`, `TOOL_UNAVAILABLE`. Every failure names the path or flag it needs and the fix. Do not retry a typed failure with the same arguments; change the source or stop.
