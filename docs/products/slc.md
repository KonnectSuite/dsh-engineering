# RSLogix 500 (SLC 500 and MicroLogix)

`@aryacode/dsh-engineering` ships 10 read-only tools that read an RSLogix 500 program export and return
what the program says: ladder rungs in neutral mnemonic text, the data-file table and the values the
export carries, the I/O footprint the logic references, the chassis, the processor identity, the
documentation export and an authored RSLogix 500 reference.

Every tool here reads. Nothing is written, no controller is contacted, and there is no writes switch to
turn on. The component is a beta product and it ships **off**; turn it on from the Plugins page.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `slc` — *RSLogix 500 (SLC 500 and MicroLogix) program reads* |
| Capability class | `offline-file` (the text and documentation readers are fully offline; one path reads a `.RSS` through the vendor server) |
| Stability | beta, since `v0.104.0` |
| Default | off |
| Tools | 10 in the `slc500_` namespace |
| Package / entry | `packages/slc` → `entries/slc.js` |
| Skill | `rslogix-500` (`packages/slc/SKILL.md`, 8,000-character budget) |
| Probe | `slc500_capabilities` |
| Switches | none for writes — the row has no write path |

The reader has three sources, and which one answered is part of every report.

| Source | How it works | What it can answer |
| --- | --- | --- |
| Text export | a dependency-free parser over the report RSLogix 500 writes (project identity, program and data files, rung text, symbols, I/O references) | the program as text: census, rungs, symbols, data-file table and the values the export carries, I/O census, chassis |
| `.SLC` export | the same parser over the container-style export | the same facts the `.SLC` carries; the export truncates symbols to 15 characters |
| Automation server | `RSLogix500.Application`, a 32-bit local COM server, replayed from a recorded local transcript | the full project for a `.RSS` file, including documentation the text export drops |

An `.RSS` project without a transcript answers `SOURCE_NOT_INSTALLED` (no automation class) or
`NOT_LICENSED` (class registered, no local transcript). `.ACH` and `.RS1` files are refused by name. The
transcript path is offline replay, never a live vendor call from inside a tool.

`slc500_database` reads an RSLogix 500 documentation export (`.EAS`, `.ERP`, `.EIC`, `.ESG`, `.CSV`) row
by row, which is the offline documentation path that works with no vendor install and keeps the full
symbol and description text instead of the `.SLC` truncation. A documentation export passed to
`slc500_open` is routed to `slc500_database` instead of being treated as a program.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| RSLogix 500 | 12.00.00 | the automation-server path for a `.RSS` project | yes — the text export, `.SLC` and documentation readers answer from the file alone |
| Windows with 32-bit PowerShell and the vendor automation components | installed with RSLogix 500 | opening a `.RSS` for a transcript | yes, with the same trade-off |
| Nothing | — | `slc500_capabilities`, the text export, `.SLC` and documentation reads | no |

The host probe on the build machine measured RSLogix 500 12.00.00 (`Rs500.exe` 12.00.00.00) and four
installed help trees (`RSLX500` 785 files, `SLCINST` 474, `MICROINSET` 430, `RSMicro` 785), with the
automation class registered. Reading a `.RSS` project headlessly through that server is **not proved**:
no redacted transcript has been recorded, so the tools answer with that gap in `coverage.unverified`
rather than claiming a vendor read.

## First session

Start with `slc500_capabilities` on the machine, then open the export. The answer is a census, not a
summary of the first program file.

| Step | Call | What you see |
| --- | --- | --- |
| 1. What is possible here | `slc500_capabilities` | whether the vendor application, help trees, automation class and 32-bit PowerShell are present, plus what the offline parser can read |
| 2. Census | `slc500_open {path}` | project name, processor type/family/series/firmware, program files with rung counts, data files, symbol count and I/O modules, and the source that answered |
| 3. Read logic | `slc500_ladder {path, file, start, limit}` | rungs in neutral mnemonic text, one line per rung, up to 200 per call; the terminal `END` is not counted as logic |
| 4. Find something | `slc500_find {path, query, scope}` | matching addresses, symbols, descriptions and rungs; scopes `symbols`, `data`, `ladder`, `all` |
| 5. I/O and chassis | `slc500_io_census`, `slc500_io_config` | every `I:`/`O:` reference reduced to slots, words and bits with reference counts; the chassis and modules as the source records them |
| 6. Data, processor, docs | `slc500_data_read`, `slc500_processor`, `slc500_database`, `slc500_docs` | one data file's table and values (only what the export carries), processor facts and status-file addresses, the documentation table, and the authored reference |

`slc500_docs` is one tool with five actions — `contents`, `search`, `read`, `status`, `lookup` — over an
authored RSLogix 500 corpus. It ships with seven pages (addresses and data files, instruction set,
I/O and chassis, processor and status file, project files and ladder, documentation exports, reading a
project safely). The vendor help bodies are never redistributed; when an installed help tree is the
source, its index is metadata only and the topic is parsed at call time.

## What it does

| Group | Tools | What it is for |
| --- | --- | --- |
| Capability | `slc500_capabilities` | what this host can do, and which reader will answer |
| Program read | `slc500_open`, `slc500_ladder`, `slc500_find` | census, neutral-text rungs paged by file, and a search over symbols, data, ladder and descriptions |
| I/O | `slc500_io_census`, `slc500_io_config` | slots, words and bits the logic references; the chassis and modules the source records |
| Data and identity | `slc500_data_read`, `slc500_processor` | one data file's table and values; the processor and its status-file addresses |
| Documentation | `slc500_database`, `slc500_docs` | a documentation export row by row; the authored RSLogix 500 reference |

## Limits

- Reading a `.RSS` through the automation server is unproven on the measured host: the class is
  registered but no transcript exists, so the answer says so. The text, `.SLC` and documentation paths
  are fully offline and do not need the vendor application.
- The text export does not carry I/O module types. `slc500_io_config` reports slots and what the source
  records, and states the limitation instead of inventing point-card part numbers.
- `slc500_data_read` returns only the values the export carries; it never invents a value that is not in
  the file. The `.SLC` export truncates symbols to 15 characters, which is why the documentation export
  path exists.
- The `.SLC` grammar was reverse-engineered for this reader; other RSLogix 500 versions may add records
  it does not know. A record it cannot place is reported, not silently dropped.
- Online state, fault bits and controller modes are not read. No tool goes online, starts a vendor
  application or touches a controller.
- The row is read-only by construction: there is no write tool, no writes switch and no controller
  session.
- The authored corpus is deliberately small: seven pages of reference validated by the retrieval eval,
  not a copy of the vendor help.

## Where to go next

- [SLC 500 and PLC-5 to Logix migration](migration.md) — the workflow this read feeds.
- [Tool reference](../reference/tools.md) — every `slc500_*` tool with its parameters.
- [Capabilities](../capabilities.md) — the measured calls behind the probe in this page.
- [Products](README.md) — the other product pages.
