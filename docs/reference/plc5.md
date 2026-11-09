# RSLogix 5 (PLC-5) reads

The `plc5` row reads an RSLogix 5 `.RSP` project. It ships off: enable the row, and its
eight tools and the `rslogix-5` skill mount together. Every tool is a read — the row
writes nothing, contacts no controller, and has no writes switch.

## The two read paths

1. **The automation server** (`RSLogix5.Application`, registered by RSLogix 5 as a
   32-bit local server). Driven from Windows PowerShell in SysWOW64 with an encoded
   command, the project opens with `Visible = False`, `PromptForRevNote = False` and
   the six-argument `FileOpen`, and closes with `Quit(0, $false)` — the do-not-save
   flag, on every exit path, because a headless save was observed to block on a
   revision-note dialog. Rung text comes from `GetRungAsNeutralText`: mnemonic
   instructions, not opcodes. Symbols come from `AddrSymRecords` (the RSLogix 500
   `Symbols`/`Manufacturer`/`ProcessorType` names are empty on RSLogix 5 and are not
   used). Chassis come from `LocalChassis` plus `Channels.GetChannelViaIndex` and
   `GetChassis` as methods.
2. **The container reader** (no vendor product needed). An `.RSP` is an OLE2
   compound-file container: RSLogix 5 keeps one storage per subsystem and puts that
   subsystem's payload in a single `ObjectData` stream inside it. A dependency-free
   CFBF parser walks the directory tree (storages and their sibling trees, so
   `PROCESSOR/ObjectData`, `PROGRAM FILES/ObjectData` and `DATA FILES/ObjectData` are
   addressed apart), unpacks the streams the vendor packed — a 16-byte header
   (version 2, header length, packed length, unpacked length) followed by a plain
   zlib deflate payload — and reads the plain ones as they are. From `PROCESSOR` it
   gets the project name, the processor type string, the author string and the RSWho
   route with its IP; from `PROGRAM FILES` it gets the ladder program-file names in
   file order. `plc5_open` falls back to this path when the server will not start,
   labelling the answer and listing what it cannot give (rung text, symbol records,
   the I/O footprint).

## The tools

| Tool | Answers |
|---|---|
| `plc5_capabilities` | 32-bit host present, COM server registered, container census (streams, sizes, packed flags) |
| `plc5_open` | The program census: files with type and rung counts, total rungs, symbol and data-file counts, revision |
| `plc5_ladder` | Rung text in neutral mnemonic form for one file, paged 1–200 rungs |
| `plc5_find` | A case-insensitive search (literal or regex) over every rung and the symbol table |
| `plc5_io_census` | Every `I:`/`O:` reference in rung text reduced to rack/slot cells, configured racks split from program-only racks |
| `plc5_io_config` | The configured chassis: adapter part numbers, slot counts, rack/group ranges |
| `plc5_data_read` | The data-file table: number, type, name, element count — never values |
| `plc5_processor` | The controller: type string, author, memory words, type code, series, driver, route, online/faulted flags, each labelled with its source |

## The three inventories

A PLC-5 project records the chassis and adapters (1771-A4B, 1794 adapters, rack and
group ranges). It does **not** record the point cards in the slots, and it does **not**
record the processor catalog number. The program's rung text also references racks the
configuration never covers — block transfer and Dataway addressing live outside the
chassis table. An answer names which inventory a number comes from; a BOM built
without that sentence is a defect, not a report.

## Known gaps

- The container stores rungs as compiled opcodes, not neutral text, so rung text,
  rung counts, the symbol table and the `I:`/`O:` footprint come from the automation
  server; the container path names the ladder program files but cannot open them.
  Data-file **values** are not readable by either path.
- Point-card part numbers are not in the project. An online read, the panel drawings
  or the nameplates carry them; no tool here invents them.
- Online state is reported as the project last recorded it. No tool goes online.
- The container fallback answers `plc5_open` without rung text, symbol records or the
  footprint; the answer says so in `coverage.unverified`.
- Verified against one project (`F00607.RSP`, RSLogix 5 v10). Both paths are
  verified: the container names project `F00607`, processor `MML10PF3PX3R9`, route
  `045_VIM\10.164.108.113\Backplane\1\CH A\1`, 38 ladder program files across 53
  streams, and the server census returns 52 program files, 2,168 rungs, 226 data
  files, 4,189 symbols, 10 configured chassis, 443 I/O cells and processor type
  code 17 with the source hash unchanged. The server is single-instance: a hidden
  `RSLGX5.exe` left by an aborted attempt holds it and makes every new activation
  fail with `CO_E_SERVER_EXEC_FAILURE`, which the tools' fix text now names. Other
  RSLogix 5 versions are untested.
