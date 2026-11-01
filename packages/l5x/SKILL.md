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

## Find the thing

- `list_components` (program, task, tag, udt, routine, aoi, module, alarm), `get_component`, `search_logic`.
- `find_references` (read/write, scope), `trace_dependencies` (static, not runtime), `resolve_tag` (alias chain,
  member, bit, subscript), `usage_map` (bits and elements used, and free).

## Scope rules

- Program-scoped tags and routines need `scope`.
- AOI members are written `AOI_Name::Member`; `find_references` accepts that spelling.
- An unresolved symbol is refused with `UNRESOLVED_SYMBOL` plus candidate scopes. Fix the scope, do not guess.

## Checks and comparison

- `run_checks`: findings with rule, severity and site; filter by either. Covers unused tags, unresolved references,
  unscheduled programs, undocumented logic, latch and duplicate output, mnemonic mismatch, FBD graph, rung shape,
  and instructions the controller family cannot build.
- `compare_projects`: semantic diff by component; export timestamps and formatting are ignored.

## Live reads

- `poll_live_tags` (IPv4, slot, 1-16 declared scalars, timestamped sweeps) and `start_plc_trend` read over
  EtherNet/IP with no Studio, Linx or SDK.
- Read-only: never write controller data, force tags, toggle bits or edit online. A read proves a moment, not that
  the controller runs this export.

## Reporting

- Every result carries `summary`, `data`, `coverage`, `next`. Read `coverage` before claiming completeness.
- State what an export cannot prove: FBD and SFC execution, dynamic indices, runtime behavior, external HMI.
- Never call a tag unused, or an output permanently zero, from missing references alone.
- Quote the program, routine and rung or line for each finding.

## Revisions

- Reading accepts revision 19+; outside the observed matrix reports `verification: unverified`.
- Reading never needs Studio. The `l5x-studio` entry adds offline import and build, and controller tools that run
  under per-call approval.

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

- `list_instructions` lists slots and kinds; read it before composing.
- `compose_rung` builds one rung from `spec_json` or a pattern (start_stop_latch, fault_latch, ton_delay,
  interlock). Pass `program`, `routine`, `mode` and `rung` to stage it.
- `l5x_rung_preview` validates rungs and draws them; `l5x_routine_diagram` draws existing logic.
- Legacy names (`XPY`, `ASN`, `ACS`, `ATN`) are `EXPT`, `ASIN`, `ACOS`, `ATAN` in a v36+ project. Compose through
  `compose_rung`: it writes the spelling the project publishes.
- `draft_routine` takes RLL, ST, FBD or SFC. **FBD and SFC take no body**: create the routine, then `draft_fbd` or
  `draft_sfc`.
- FBD: a block **is an instance** - its first operand names a tag of the block's structure (`FBD_MATH` for `ADD`).
  Wires use `ToParam` in and `FromParam` out, and **blocks may wire to each other**. A sheet that both writes and
  reads one tag makes Studio abort the import.
- SFC: exactly one initial step, and a condition **must reference a tag or member** - `TRUE` fails as an undefined
  tag while `Step_1.DN` builds. `draft_sfc` creates the `SFC_STEP`, `SFC_ACTION` and BOOL tags itself.
- `draft_tag` also accepts `CONTROL`, `SERIAL_PORT_CONTROL`, `ALARM_ANALOG` and `ALARM_DIGITAL`.
- Serial ASCII (`ABL`, `ARD`, ...) needs a controller **with a serial port**: it builds on a 1756-L73 and is refused
  on a 5069 or 1756-L8x whatever the operands. `run_checks` reports it before any build.
- Repair: `run_checks` names it, `compose_rung` with `mode: "replace"` rewrites the rung, `draft_apply` writes a new
  export, `verify_offline_l5x` builds it.
- An aborted import on an export that imported before means the controller **name is still registered** with the
  SDK; the same bytes import under a different name.

## Documentation

`document_project` writes a NEW folder: `PROJECT.md`, `io.md`/`io.csv`, `tags.csv` and `tags-studio.csv` (the
`Tag Name,Description` shape Studio imports), and `rungs/<program>.md`. Structure and citations, not prose.
