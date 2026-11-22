# What the PLC-5 program tools read

The RSLogix 5 (PLC-5) row reads a PLC-5 program offline — hidden, read-only, and
without a controller connection. This collection is the authored knowledge that
explains what the readers return and how to read a neutral text export of a PLC-5
program without guessing.

## Two kinds of source

1. **A binary project.** A `.RSP` saved project contains the program in the vendor's
   container format. The row reads it through the RSLogix 5 automation server when the
   vendor software is installed, and falls back to a container reader that answers from
   the file alone for identity and structural facts. Every read is hidden and ends
   without saving.
2. **A text export.** Some workflows save the program as a neutral text file (`.PC5`
   in this documentation). The six text tools read that file without the vendor
   software: instruction census, rung digest, indirect census, structure report,
   consistency verdict, and a two-file diff. They never execute the program and never
   write to it.

The text export is a transcription, not a runtime. Its value is that it is reviewable,
diffable, and safe to keep in version control; its limit is that it carries what the
exporter chose to write.

## The tools

| Tool | Reads | Answers |
| --- | --- | --- |
| `plc5_open` | `.RSP` | Project identity and structure through the vendor server. |
| `plc5_ladder` | `.RSP` | The ladder as neutral text, with the rungs it could read. |
| `plc5_find` | `.RSP` | Search the ladder for a term or address. |
| `plc5_io_census` | `.RSP` | Which rack/slot/bit addresses the program references. |
| `plc5_io_config` | `.RSP` | What chassis and adapters the project declares. |
| `plc5_data_read` | `.RSP` | The data-file table. |
| `plc5_processor` | `.RSP` | Processor identity and catalog facts the project records. |
| `plc5_capabilities` | machine | Whether the vendor automation server is registered here. |
| `plc5_pc5` | text export | The export's header, program files, data files, and structure issues. |
| `plc5_instruction_inventory` | text export | Mnemonic counts, per-file distribution, and unknown mnemonics. |
| `plc5_rung_digest` | text export | Rung counts, instruction density, branch tokens, and rung-number gaps per program file. |
| `plc5_indirect_census` | text export | Every indirect, file-operand, and unknown-operand site. |
| `plc5_verify` | text export | A consistency verdict with errors and warnings. |
| `plc5_diff` | two text exports | Header, program-file, and rung-level differences between two exports. |
| `plc5_docs` | authored corpus | This knowledge collection. |

## What the text tools promise

- **Read-only.** They resolve and read a file; they never write, rename, or modify it.
- **Deterministic.** The same file produces the same JSON, byte for byte: no clock, no
  random order, no absolute paths, no hostname. Lists are sorted by a stable key.
- **Honest about limits.** A binary container passed to a text reader is not parsed as
  text; it fails with `SOURCE_NOT_INSTALLED` and a fix that says to export the text.
  A format the reader does not know fails with `UNSUPPORTED_FORMAT`. A malformed line
  fails with a line-numbered finding, not a partial guess.
- **Bounded.** Output is capped (rungs, instruction rows, diff entries); the cap is
  reported so a large program does not look complete when it was truncated.

## What no tool does

- contact a controller or a network,
- change a project, a text export, or a data file,
- claim that a text export equals the running program,
- read the installed point cards, register contents inside packed data streams, or the
  controller state.

The three I/O inventories (configured, referenced, physical) are inventory facts from
the project. The project records chassis, adapters, and the addresses the ladder uses;
it does not record the point cards in the slots, and it does not record what is wired.
