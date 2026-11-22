---
id: rslogix500-legacy-file-formats
title: SLC 500 legacy file formats and what this row can read
section: Legacy formats
identifiers: [.RSS, .SLC, .ACH, .RS1, .APA, .PC5]
revision: 12.00.00
---

# SLC 500 legacy file formats and what this row can read

An SLC 500 project reaches an engineer as one of several formats, and the format decides what this row can prove. Name the format as part of every answer.

## `.SLC` — RSLogix 500 Library export

The vendor's Library export (Save Program As → Save as type `Library Files(*.SLC)` → `Export SLC Format`, Complete Program Save). Measured on RSLogix 500 12.00.00, it carries the processor line, rack and slot configuration, the project name and program files with their titles, neutral-text rungs wrapped in `SOR … EOR`, rung titles and descriptions, data-file element values, and force tables. It does **not** carry the symbol/description database — those arrive in the `.EAS`/`.ERP` documentation exports (and the `.SY5`/`.SY6` sidecar files), so read names and descriptions with `slc500_database` and read logic with `slc500_open`/`slc500_ladder`. This row parses the Library dialect offline with no RSLogix 500 install, and also accepts the documented INI-style text export. Symbols are not truncated inside the `.SLC` because they are not present there; the 15-character limit applies only to the INI-style symbol field.

## `.RSS` — binary project container

The RSLogix 500 project file. It is a binary container, not text. Reading it needs the RSLogix 500 automation server; only the Professional or Developer edition exposes the read methods. When the server is not installed the answer is `SOURCE_NOT_INSTALLED` and the fix names the text-export step. When the server is registered but the edition or a replay transcript is unavailable the answer is `NOT_LICENSED`. Never attempt a best-effort binary decode and never present a container read as equivalent to a verified project read.

## `.ACH` and `.APA` — APS-era material

Older APS project and sidecar formats. The content is not documented for reimplementation, and a partial decode would be a guess. Detect them, name them, and refuse with the re-save or export instruction.

## `.RS1` — archive wrapper

An archive packaging format. Identity may be recoverable, but the project inside is not parsed here. Detect, name, and defer.

## Documentation exports

`.EAS`, `.ERP`, `.EIC`, `.ESG` and `.CSV` are documentation-only exports. `slc500_database` parses them offline; they are the best offline record of symbols and descriptions but they are not the program logic and do not prove runtime values.

## `.PC5` and cross-family work

`.PC5` is a PLC-5 file, not an SLC 500 file. Reading and mapping it belongs to the PLC-5 and migration rows; when an operator brings one here, say which row owns it. For conversion planning, `migration_docs` holds the instruction and address mapping knowledge; this page only says what SLC 500 formats are and how far this row's evidence goes.
