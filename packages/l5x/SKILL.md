---
name: rockwell-l5x
description: Read and review Studio 5000 L5X exports: open a project, list and read components, find references, trace dependencies, resolve addresses, map bit usage, run checks, and compare exports.
whenToUse: Use when the user asks about a Studio 5000 L5X export, Logix tags, routines, UDTs, AOIs, I/O modules, references, dependency tracing, checks, or comparison between exports.
---

# Rockwell L5X engineering

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is
installed, open or on disk; the host is read only when the operator points at it, or when the work is
inside an existing project (`CRAFT-ORD-01`).

## Boundary

This surface reads and drafts. A draft writes only a new L5X file: it never overwrites the source, imports
into Studio, or touches a controller — the engineer imports it there, the normal workflow, not a fallback.
Reads, drafts and `l5x_draft_apply` need Node only: no Studio, no Logix Designer SDK, no Linx. Live reads
are read-only; controller writes need per-call human approval.

## Compose in chat without a project

- When the person asks for ladder logic — a start/stop circuit, a seal-in, a timer, an interlock,
  a scale, a totalizer, an hour meter — **compose it in the answer**: no L5X/ACD request, no
  `l5x_open_project`, no file as the deliverable.
- Use `l5x_compose_logic`: a named pattern with `arguments_json`, or NeutralText `rungs` directly. No
  project, writes nothing; it returns `paste_text` and the tag declarations the rung expects.
- **Put `paste_text` in a fenced code block** in the answer: it is Studio's own copy format — mnemonics
  and operands space separated, parallel branches `BST` … `NXB` … `BND`, no parentheses, no semicolon.
  It is a review form: a plain Ctrl+V on the v37.05 ladder canvas edits the selected instruction or does
  nothing, so apply the change through the import routes below. List the tags to declare.
- NeutralText grammar: one rung per line ending in `;`; instructions are `MNEMONIC(operands)`;
  **parallel branches are `[path1,path2]`**, for example
  `[XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);`. `l5x_compose_logic` validates syntax and catalogued
  instruction names; it cannot check tag existence/types without a project.
- **Both formats parse.** Text copied out of a Studio routine is accepted by `l5x_compose_logic`,
  `l5x_draft_rung` and `l5x_compose_rung`, so a rung the engineer pasted can be staged as-is. `paste_text`
  always returns the Studio format; `neutral_text` beside it is the bracket form.
- A pasted rung is a complete answer on its own; open the project and use the
  `draft_*`/`l5x_compose_rung` path only when the change must land in an export.

## Backups

`<workspace>/backups/<product>/<subject>/<UTC stamp>/` holds the copy and `backup-manifest.json`
(relative path + SHA-256 per file). Studio is the `l5x` product: the copy is the `.ACD`, or the `.L5X`
when that is the source of truth. Never write to `<workspace>/_backups`.

## Start

1. `l5x_open_project` with the export path; keep `project_id`. Later calls may omit it when one project is open.
2. A read refuses a changed export with `STALE_EXPORT`; reopen before continuing.
3. `l5x_project_overview` states the export's limits first: protected routines, vendor types, safety tasks.

## Find the thing

- `l5x_list_components` (program, task, tag, udt, routine, aoi, module, alarm), `l5x_get_component`, `l5x_search_logic`.
- `l5x_find_references` (read/write, scope), `l5x_trace_dependencies` (static, not runtime), `l5x_resolve_tag` (alias chain,
  member, bit, subscript), `l5x_usage_map` (bits and elements used, and free).

## Scope rules

- Program-scoped tags and routines need `scope`.
- AOI members are written `AOI_Name::Member`; `l5x_find_references` accepts that spelling.
- Vendor and product data types are readable: `l5x_get_component kind="udt"` returns them with `vendorOwned`;
  `l5x_list_components` lists them only with `include_vendor: true`.
- An unresolved symbol is refused with `UNRESOLVED_SYMBOL` plus candidate scopes. Fix the scope, do not guess.
- A controller-scope tag resolves from every program rung, including an I/O alias such as
  `DI_Gate_Fault` → `Local:1:I.Pt12.Data`; the alias target lives in the module. A `TAG_NOT_FOUND` on
  such a name means the spelling is wrong, not a missing scope.

## Checks and comparison

- `l5x_run_checks`: findings with rule, severity, site and a fix when known; filter by either. Covers unused tags, unresolved references,
  unscheduled programs, undocumented logic, latch and duplicate output, mnemonic mismatch, FBD graph, rung shape,
  and instructions the controller family cannot build. Safety rules also cover a safety instruction called from
  standard logic, a safety program in a standard task, a safety module with no network number, and a standard write to a safety tag.
- `l5x_compare_projects`: semantic diff by component; export timestamps and formatting are ignored. A controller-level
  change (processor, saved route, project serial) is reported too.

## Live reads

- `l5x_poll_live_tags`, `l5x_read_live_tags` (IPv4, 1-16 scalars or members) and `l5x_start_plc_trend` read over
  EtherNet/IP: no Studio, Linx or SDK.
- Reads are safe. Writes (`l5x_write_live_tag`, `l5x_write_controller_clock`) need allowWrites and human approval; never
  force tags or edit online. A read proves a moment, not that the controller runs this export.
- SDK route: `WORKSTATION!DRIVER\IP` (RSLinxNG.xml).

## Reporting

- Every result carries `summary`, `data`, `coverage`, `next`. Read `coverage` before claiming completeness.
- State what an export cannot prove: FBD and SFC execution, dynamic indices, runtime behavior, external HMI.
- Never call a tag unused, or an output permanently zero, from missing references alone.
- Quote the program, routine and rung or line for each finding.

## Revisions

- Reading accepts revision 19+; outside the observed matrix reports `verification: unverified`.
- Reading never needs Studio. `l5x-studio` is an **optional** extra that some sites license: do not
  probe it, install .NET, or treat a missing SDK as a blocker before editing — reads and drafts work
  without it.

## Studio (optional — most sites have no SDK license)

- When `l5x_studio_sdk_status` reports the SDK unavailable, say so once and continue offline; never
  install a runtime to satisfy it.
- `l5x_export_acd_to_l5x` writes a new full L5X from an ACD; no controller contact.
- `l5x_verify_offline_l5x` imports and builds; it needs revision 37+ and the matching Studio release.
  Its baseline must be exported in this chat: export the `.ACD`, `l5x_open_project` that L5X, verify
  against it. A file from a previous session is refused before any build is spent.
- A module Name with punctuation (a colon: the observed case) aborts the import as
  `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`; names carry letters, digits and underscores, and the label
  belongs in the Description. `l5x_run_checks` reports `MODULE_NAME_ILLEGAL` before the build.
- `l5x_build_acd_from_draft` imports one changed routine into a new ACD, builds it and exports.
- `l5x_studio_review_evidence` checks names and verbatim quotes before you report.
- `l5x_controller_approval_status` says whether this session can ask. `l5x_go_online`, `l5x_read_controller_mode` and
  `l5x_read_live_tag` are read-only.

## Editing

- `draft_*`, one operation per call: rung, rung comment, ST, routine, tag, tag description, UDT member, UDT
  description, FBD, SFC.
- `l5x_draft_validate` prepares the draft against the project; `l5x_draft_apply` writes ONE new L5X and never overwrites.
- **Two shapes, two menus.** `l5x_draft_apply` writes a *routine export* — in Studio, right-click the
  program, Import Routine. `l5x_export_rungs` writes a *rung export* — in the Ladder Editor, Import
  Rungs. Not interchangeable: Import Rungs on a routine export answers 5078-0. `l5x_docs` carries
  the offline and online workflow pages. Drafts belong to this chat.
- **Prove the edit offline, then hand it over.** Reopen the written file, `l5x_run_checks` it, and
  `l5x_compare_projects` the source against it: the diff must be exactly the draft's operations. That is
  the evidence, and it needs no Studio.
- **When the composer cannot express the change** (`FAL`/`FSC`, or a shape it refuses), edit the
  export at text level: copy the source into the backup folder, edit the **copy** with the harness
  file tools, then `l5x_open_project` + `l5x_run_checks` + `l5x_compare_projects` on it. Never edit the engineer's
  source in place; name the file to import.

## Compose

- `l5x_list_instructions` lists slots and kinds; read it first. Its flags are enforced: array_tag,
  array_element, array_or_element, no_array, immediate, minimum/maximum, types (MESSAGE, alarms, PID,
  CONTROL).
- For a chat-only answer, `l5x_compose_logic` is the no-project/no-file path.
- `l5x_compose_rung` builds a rung from `spec_json` or one of these patterns, whose arguments are exact:
  `start_stop_latch` start/stop/run; `fault_latch` fault/reset/latched (two rungs);
  `ton_delay` enable/timer/preset_ms; `interlock` conditions (array) and output;
  `analog_scale` source/destination/in_min/in_max/out_min/out_max;
  `totalizer` enable/rate/total; `run_hour_meter` run/timer/hours (plus preset_ms, default one hour; two rungs).
  Stage with `program`, `routine`, `mode` and `rung`.
- `l5x_compose_rung` and `l5x_compose_batch` write their rungs to `.l5x-preview/<program>-<routine>.L5X`; `present`
  that file so the reader sees the ladder and copies the whole block. `l5x_rung_preview` draws other
  rungs; `l5x_routine_diagram` draws existing logic.
- Legacy names (`XPY`, `ASN`, `ACS`, `ATN`) are `EXPT`, `ASIN`, `ACOS`, `ATAN` in v36+. `l5x_compose_rung` writes the project's spelling.
- `l5x_draft_routine` takes RLL, ST, FBD or SFC. **FBD and SFC take no body**: create the routine, then `l5x_draft_fbd`/`l5x_draft_sfc`.
- FBD: a block **is an instance** - its first operand names a tag of the block's structure (`FBD_MATH` for `ADD`).
  Wires use `ToParam` in and `FromParam` out, and **blocks may wire to each other**. A sheet that both writes and
  reads one tag makes Studio abort the import.
- SFC: exactly one initial step, and a condition **must reference a tag or member** - `TRUE` fails as an undefined
  tag while `Step_1.DN` builds. `l5x_draft_sfc` creates the `SFC_STEP`, `SFC_ACTION` and BOOL tags itself.
- `l5x_draft_tag` also accepts `TIMER`, `COUNTER`, `PID`, `STRING`, `CONTROL`, `SERIAL_PORT_CONTROL`, `ALARM_ANALOG`, `ALARM_DIGITAL`, `MESSAGE` and any **AOI name**.
- AOI call: instance tag first, then only the parameters whose `Required` is true.
- Serial ASCII (`ABL`, `ARD`, ...) is **catalogued but unmodelled**: the installed v37 help set has no
  page for it and a 1756-L71 build answers "Unknown instruction", so `l5x_compose_rung` refuses with
  `INSTRUCTION_NOT_MODELLED`. Raw rung text through `l5x_draft_rung` only where the controller and
  Studio revision are known to support it; no build proved one here.
- String positioning operands are **1-based**: `MID(s,5,1,d)` builds, and `0` fails with
  `RxCMP_E_AUDIT_OUTOFRANGE`. `STOD` and `DTOS` convert between STRING and a number.
- Bit instructions (`AND`, `OR`, `XOR`, `NOT`, `BTD`, `MEQ`) are **input-type**: end the rung with an output, or
  Studio answers `AUDIT_OUTPUTS`.
- These rung rules rest on 1756-PM008J (output placement, nesting, rung-condition semantics); instruction
  semantics and fault tables on 1756-RM018A and 1756-PM014O.
- `MSG(tag)` takes one `MESSAGE` tag and ends the rung; real code gates it with `ONS`. `COP` and `FLL` take
  `(source element, destination element, length)` and `(value, destination element, length)`.
- A build failing with `Server execution failed` is transient: retry once.
- `FAL` and `FSC` are **not modelled**: eight shapes were refused by the compiler, so writing them is a hand job
  until a real export shows the accepted form. The composer answers `INSTRUCTION_NOT_MODELLED` rather than guessing.
- `JSR` takes the routine **and** a return parameter: `JSR(Sub,0)` builds, and `JSR(Sub)` fails with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS`.
- A rung whose only instruction is `SBR()` is refused (`LgxSrv_E_FATAL_ERROR`; `AUDIT_OUTPUTS` beside `RET`). Write
  the body without a header rung, or declare parameters.
- Repair: `l5x_run_checks` names it, `l5x_compose_rung` with `mode: "replace"` rewrites the rung, `l5x_draft_apply` writes a new
  export. Verify in Studio; `l5x_verify_offline_l5x` builds it only where the SDK is licensed.
- If a previously imported export now aborts, the controller **name is registered** with the SDK; import the same bytes under a new name.

## Documentation

`l5x_document_project` writes a NEW folder: `PROJECT.md`, `io.md`/`io.csv`, `tags.csv` and `tags-studio.csv` (the
`Tag Name,Description` shape Studio imports), and `rungs/<program>.md`. Structure and citations, not prose.
`PROJECT.md` also carries Safety, Add-On Instructions and Alarms tables; `rungs/AOI-<name>.md` documents an AOI's own
routines; the summary counts program and AOI routines apart.
