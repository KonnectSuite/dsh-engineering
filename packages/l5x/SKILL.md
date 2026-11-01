---
name: rockwell-l5x
description: Read and review Studio 5000 L5X exports: open a project, list and read components, find references, trace dependencies, resolve addresses, map bit usage, run checks, and compare exports.
whenToUse: Use when the user asks about a Studio 5000 L5X export, Logix tags, routines, UDTs, AOIs, I/O modules, references, dependency tracing, checks, or comparison between exports.
---

# Rockwell L5X engineering

## Boundary

This surface reads and drafts. A draft writes only a new L5X file: it never overwrites the source, imports into
Studio, or touches a controller. Live reads are read-only; controller writes need per-call human approval.

## Backups

`<workspace>/backups/<product>/<subject>/<UTC stamp>/` holds `backup-manifest.json` (relative path + SHA-256 per
file) and the copy. Studio is the `l5x` product: the copy is the `.ACD`, or the `.L5X` when that is the source of
truth. Never write to `<workspace>/_backups`.

## Start

1. `open_project` with the export path; keep `project_id`. Later calls may omit it when one project is open.
2. A read refuses a changed export with `STALE_EXPORT`; reopen before continuing.
3. `project_overview` states the export's limits first: protected routines, vendor types, safety tasks.

## Find the thing

- `list_components` (program, task, tag, udt, routine, aoi, module, alarm), `get_component`, `search_logic`.
- `find_references` (read/write, scope), `trace_dependencies` (static, not runtime), `resolve_tag` (alias chain,
  member, bit, subscript), `usage_map` (bits and elements used, and free).

## Scope rules

- Program-scoped tags and routines need `scope`.
- AOI members are written `AOI_Name::Member`; `find_references` accepts that spelling.
- Vendor and product data types are readable: `get_component kind="udt"` returns them with `vendorOwned`;
  `list_components` lists them only with `include_vendor: true`.
- An unresolved symbol is refused with `UNRESOLVED_SYMBOL` plus candidate scopes. Fix the scope, do not guess.

## Checks and comparison

- `run_checks`: findings with rule, severity, site and a fix when known; filter by either. Covers unused tags, unresolved references,
  unscheduled programs, undocumented logic, latch and duplicate output, mnemonic mismatch, FBD graph, rung shape,
  and instructions the controller family cannot build. Safety rules also cover a safety instruction called from
  standard logic, a safety program in a standard task, a safety module with no network number, and a standard write to a safety tag.
- `compare_projects`: semantic diff by component; export timestamps and formatting are ignored. A controller-level
  change (processor, saved route, project serial) is reported too.

## Live reads

- `poll_live_tags`, `read_live_tags` (IPv4, 1-16 scalars or members) and `start_plc_trend` read over
  EtherNet/IP with no Studio, Linx or SDK.
- Reads are safe. Writes (`write_live_tag`, `write_controller_clock`) need allowWrites and human approval; never
  force tags or edit online. A read proves a moment, not that the controller runs this export.
- SDK route: `WORKSTATION!DRIVER\IP` (RSLinxNG.xml).

## Reporting

- Every result carries `summary`, `data`, `coverage`, `next`. Read `coverage` before claiming completeness.
- State what an export cannot prove: FBD and SFC execution, dynamic indices, runtime behavior, external HMI.
- Never call a tag unused, or an output permanently zero, from missing references alone.
- Quote the program, routine and rung or line for each finding.

## Revisions

- Reading accepts revision 19+; outside the observed matrix reports `verification: unverified`.
- Reading never needs Studio; `l5x-studio` adds offline build and approval-gated controller tools.

## Studio

- `export_acd_to_l5x` writes a new full L5X from an ACD; no controller contact.
- `verify_offline_l5x` imports and builds; it needs revision 37+ and the matching Studio release.
- `build_acd_from_draft` imports one changed routine into a new ACD, builds it and exports.
- `studio_review_evidence` checks names and verbatim quotes before you report.
- `controller_approval_status` says whether this session can ask. `go_online`, `read_controller_mode` and
  `read_live_tag` are read-only.

## Editing

- `draft_*`, one operation per call: rung, rung comment, ST, routine, tag, tag description, UDT member, UDT
  description, FBD, SFC.
- `draft_validate` prepares the draft against the project; `draft_apply` writes ONE new L5X and never overwrites.
- Reopen the written file to review it. Drafts belong to this chat.

## Compose

- `list_instructions` lists slots and kinds; read it first. Its flags are enforced: array_tag, no_array,
  minimum/maximum, types (MESSAGE, alarms, PID, CONTROL).
- `compose_rung` builds a rung from `spec_json` or one of these patterns, whose arguments are exact:
  `start_stop_latch` start/stop/run; `fault_latch` fault/reset/latched (two rungs);
  `ton_delay` enable/timer/preset_ms; `interlock` conditions (array) and output;
  `analog_scale` source/destination/in_min/in_max/out_min/out_max;
  `totalizer` enable/rate/total; `run_hour_meter` run/timer/hours (plus preset_ms, default one hour; two rungs).
  Stage with `program`, `routine`, `mode` and `rung`.
- `l5x_rung_preview` validates/draws rungs; `l5x_routine_diagram` draws existing logic.
- Legacy names (`XPY`, `ASN`, `ACS`, `ATN`) are `EXPT`, `ASIN`, `ACOS`, `ATAN` in v36+. `compose_rung` writes the project's spelling.
- `draft_routine` takes RLL, ST, FBD or SFC. **FBD and SFC take no body**: create the routine, then `draft_fbd`/`draft_sfc`.
- FBD: a block **is an instance** - its first operand names a tag of the block's structure (`FBD_MATH` for `ADD`).
  Wires use `ToParam` in and `FromParam` out, and **blocks may wire to each other**. A sheet that both writes and
  reads one tag makes Studio abort the import.
- SFC: exactly one initial step, and a condition **must reference a tag or member** - `TRUE` fails as an undefined
  tag while `Step_1.DN` builds. `draft_sfc` creates the `SFC_STEP`, `SFC_ACTION` and BOOL tags itself.
- `draft_tag` also accepts `TIMER`, `COUNTER`, `PID`, `STRING`, `CONTROL`, `SERIAL_PORT_CONTROL`, `ALARM_ANALOG`, `ALARM_DIGITAL`, `MESSAGE` and any **AOI name**.
- AOI call: instance tag first, then only the parameters whose `Required` is true.
- Serial ASCII (`ABL`, `ARD`, ...) needs a controller **with a serial port**: it builds on a 1756-L73 and is refused
  on a 5069 or 1756-L8x whatever the operands. `run_checks` reports it before any build.
- String positioning operands are **1-based**: `MID(s,5,1,d)` builds, and `0` fails with
  `RxCMP_E_AUDIT_OUTOFRANGE`. `STOD` and `DTOS` convert between STRING and a number.
- Bit instructions (`AND`, `OR`, `XOR`, `NOT`, `BTD`, `MEQ`) are **input-type**: end the rung with an output, or
  Studio answers `AUDIT_OUTPUTS`.
- `MSG(tag)` takes one `MESSAGE` tag and ends the rung; real code gates it with `ONS`. `COP` and `FLL` take
  `(source element, destination element, length)` and `(value, destination element, length)`.
- A build failing with `Server execution failed` is transient: retry once.
- `FAL` and `FSC` are **not modelled**: eight shapes were refused by the compiler, so writing them is a hand job
  until a real export shows the accepted form. The composer answers `INSTRUCTION_NOT_MODELLED` rather than guessing.
- `JSR` takes the routine **and** a return parameter: `JSR(Sub,0)` builds, and `JSR(Sub)` fails with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS`.
- A rung whose only instruction is `SBR()` is refused (`LgxSrv_E_FATAL_ERROR`; `AUDIT_OUTPUTS` beside `RET`). Write
  the body without a header rung, or declare parameters.
- Repair: `run_checks` names it, `compose_rung` with `mode: "replace"` rewrites the rung, `draft_apply` writes a new
  export, `verify_offline_l5x` builds it.
- If a previously imported export now aborts, the controller **name is registered** with the SDK; import the same bytes under a new name.

## Documentation

`document_project` writes a NEW folder: `PROJECT.md`, `io.md`/`io.csv`, `tags.csv` and `tags-studio.csv` (the
`Tag Name,Description` shape Studio imports), and `rungs/<program>.md`. Structure and citations, not prose.
`PROJECT.md` also carries Safety, Add-On Instructions and Alarms tables; `rungs/AOI-<name>.md` documents an AOI's own
routines; the summary counts program and AOI routines separately.
