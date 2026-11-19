# RSLogix 5 (PLC-5)

`@aryacode/dsh-engineering` ships 8 read-only tools that open an RSLogix 5 `.RSP` project and return what
the program says: ladder rungs in neutral mnemonic text, the program-file census, the I/O footprint the
logic references, the configured chassis, the data-file table and the processor identity.

Every tool here reads. Nothing is written, no controller is contacted, and there is no writes switch to
turn on. The component is a beta product and it ships **off**; turn it on from the Plugins page.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `plc5` — *RSLogix 5 (PLC-5) program reads* |
| Capability class | `offline-file` (one tool chain reads the vendor project, one reads the container file) |
| Stability | beta, since `v0.90.0` |
| Default | off |
| Tools | 8 in the `plc5_` namespace |
| Package / entry | `packages/plc5` → `entries/plc5.js` |
| Skill | `rslogix-5` (`packages/plc5/SKILL.md`, 8,000-character budget) |
| Probe | `plc5_capabilities` |
| Switches | none for writes — the row has no write path |

Two read paths exist, and which one answered is part of every report.

| Path | How it works | What it can answer |
| --- | --- | --- |
| Automation server | `RSLogix5.Application`, a 32-bit local COM server, driven from Windows PowerShell in SysWOW64. Opens `Visible = False`, `PromptForRevNote = False`, and closes with `Quit(0, $false)` — do not save — on every exit path | the full program: census, rung text, symbol records, chassis, data-file table, processor facts |
| Container reader | a dependency-free CFBF parser over the `.RSP` OLE2 compound file: one storage per subsystem, payload in an `ObjectData` stream, vendor-packed streams unpacked with zlib | project name, processor type string, author, RSWho route, ladder program-file names, and the stream census |

The container path exists because RSLogix 5 may not be installed. It answers what the file records and
lists what it cannot give — rung text, symbol records, the I/O footprint — in `coverage.unverified`,
instead of returning an empty answer that looks complete.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| RSLogix 5 | v10 | the automation-server path: rung text, symbols, chassis, I/O census, data files | yes — the container reader answers from the file alone |
| Windows with 32-bit PowerShell and the vendor automation components | installed with RSLogix 5 | the COM path | yes, with the same trade-off |
| Nothing | — | `plc5_capabilities` on a `.RSP`, and the container facts in `plc5_open` | no |

The recorded verification is one project, `F00607.RSP`, on RSLogix 5 v10, through both paths. Other
RSLogix 5 versions, SFC and sequential files, and point-card part numbers are untested.

The vendor server is single-instance. An aborted attempt can leave a hidden `RSLGX5.exe` holding it, and
the next activation then fails with `CO_E_SERVER_EXEC_FAILURE`; the tools' fix text names that process,
because "close the dialog" is the wrong advice when there is no window.

## First session

Start with `plc5_capabilities` on the path, then open the project. The answer is a census, not a summary
of the first program file.

```json
{ "path": "C:/Projects/Legacy/F00607.RSP" }
```

Call `plc5_open` with that shape. It opens hidden, reads, and closes without saving. Then:

| Step | Call | What you see |
| --- | --- | --- |
| 1. What is possible here | `plc5_capabilities {path}` | whether the 32-bit host and the RSLogix 5 COM server are present, plus the container census: streams, sizes, which payloads are packed |
| 2. Census | `plc5_open` | program files with their type and rung count, total rungs, symbol and data-file counts, the project revision, and the path that answered |
| 3. Read logic | `plc5_ladder {file, offset, limit}` | rungs in neutral mnemonic text (`XIC`, `XIO`, `OTE`, `TON`, `JSR`, …), one line per rung, with rung numbers, up to 200 per call |
| 4. Find something | `plc5_find {pattern}` | every matching rung with its program file and rung number, plus matching entries from the address/symbol table; literal text or a regular expression |
| 5. I/O | `plc5_io_census` then `plc5_io_config` | every `I:`/`O:` reference reduced to rack/slot cells with reference counts and the highest bit seen, split into configured racks and program-only racks; then the configured chassis with adapter part numbers, slot counts, rack/group ranges and adapter address |
| 6. Data files and processor | `plc5_data_read`, `plc5_processor` | the data-file table (number, type, name, element count — never values), and the processor type string, author, memory, type code, series, driver, route and online/faulted flags, each labelled with its source |

On the measured project, `plc5_open` reported 52 program files, 2,168 rungs, 226 data files, 4,189
symbol records, 10 configured chassis and 443 I/O cells; the container reader named the same project,
processor `MML10PF3PX3R9`, and route `045_VIM\10.164.108.113\Backplane\1\CH A\1` across 53 streams and 38
ladder program files.

## What it does

| Group | Tools | What it is for |
| --- | --- | --- |
| Capability | `plc5_capabilities` | what this host can do, and the container census of one `.RSP` |
| Program read | `plc5_open`, `plc5_ladder`, `plc5_find` | census, neutral-text rungs paged by file, literal or regex search across every rung and the symbol table |
| I/O | `plc5_io_census`, `plc5_io_config` | rack/slot cells referenced by the logic; configured chassis and adapters |
| Data and identity | `plc5_data_read`, `plc5_processor` | the data-file table; the processor and its RSWho route |

## Three inventories, and the sentence that must come with a number

The single most important limit on this page is what a PLC-5 project does and does not record. There are
three separate inventories, and a number is only meaningful with the inventory it came from:

1. **Configured chassis and adapters.** The project records 1771 chassis, 1794 and other adapters, and
   their rack/group ranges. This is `plc5_io_config`.
2. **Point cards in slots.** The project does **not** record them. A slot's card part number is on the
   online controller, the panel drawing or the nameplate; no tool here invents one.
3. **Addresses the logic references.** Rung text names racks the configuration never covers — block
   transfers and Dataway addressing outside the chassis table. This is `plc5_io_census`, and its rows are
   references, not modules.

A BOM built without that sentence is a defect, not a report. The tools answer in that vocabulary on
purpose: configured chassis, referenced cells, and unknown point cards.

## Limits

- Rung text, symbol records, the rung census and the I/O footprint come from the automation server. The
  container reader names ladder files but cannot open them, because the container stores rungs as compiled
  opcodes.
- Data-file values are readable by neither path. `plc5_data_read` returns the table, not the contents.
- Online state is reported as the project last recorded it. No tool goes online; a controller's current
  mode and faults are not read.
- Point-card part numbers are not in the project (see the three inventories above).
- The container fallback answers `plc5_open` without rung text, symbol records or the footprint, and says
  so in `coverage.unverified`. Do not treat that census as a program review.
- One project on RSLogix 5 v10 is measured. Other RSLogix 5 versions, SFC and sequential files, and the
  parallel/series variants of some instructions are untested.
- The 32-bit COM path needs a 32-bit-capable Windows host with the vendor components registered. A host
  where RSLogix 5 is not installed still gets the container facts, not the full program.
- The row is read-only by construction: there is no write tool, no writes switch and no controller
  session. Opening the vendor server is the only side effect, and it closes with do-not-save on every exit
  path.

## Where to go next

- [SLC 500 and PLC-5 to Logix migration](migration.md) — the workflow this read feeds, and the lint,
  compare and resolve tools that follow it.
- [Tool reference](../reference/tools.md) — every `plc5_*` tool with its parameters.
- [Capabilities](../capabilities.md) — the measured calls behind the census in this page.
- [Products](README.md) — the other product pages.
