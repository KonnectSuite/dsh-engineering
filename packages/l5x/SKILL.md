---
name: rockwell-l5x
description: Read and review Studio 5000 L5X exports: open a project, list and read components, find references, trace dependencies, resolve addresses, map bit usage, run checks, and compare exports.
whenToUse: Use when the user asks about a Studio 5000 L5X export, Logix tags, routines, UDTs, AOIs, I/O modules, references, dependency tracing, checks, or comparison between exports.
---

# Rockwell L5X engineering

## Boundary

This surface reads and drafts. A draft writes only a new L5X file: it never overwrites the source, imports into Studio, connects to a controller, changes mode, or writes runtime data.

## Backups

Every engineering product backs up into the same tree, so a backup means one place whichever surface
you are in:

```
<workspace>/backups/<product>/<subject>/<UTC stamp>/
    backup-manifest.json      every copied file: relative path + SHA-256
    <the copy>
```

Studio 5000 is the `l5x` product: the copy holds the `.ACD` being worked on, or the `.L5X` export when
that is the source of truth, one stamp per backup. Drafts and SDK builds already write new files, so
this is a backup on request ("back up this project"). Build it as a copy plus
`backup-manifest.json` listing every file's relative path and SHA-256. `<workspace>/_backups` and
`<workspace>/backups/<project>/…` are older layouts: never write there, and leave what is there alone.

## Start

1. Call `open_project` with the export path. Keep the returned `project_id`.
2. Later calls may omit `project_id` when exactly one project is open; pass it when several are.
3. A read refuses a changed export with `STALE_EXPORT`; call `open_project` again before continuing.

## Find the thing

- `list_components` enumerates one kind: program, task, tag, udt, routine, aoi, module, alarm. Filter by name, page with offset and limit.
- `get_component` reads one in full by exact name. Pass `scope` for a program-scoped tag or routine.
- `search_logic` finds literal text in rungs, ST lines and diagram labels.
- `find_references` answers where a symbol is read or written. Use `detail: "evidence"` for rung or line rows with access type and context.
- `trace_dependencies` follows upstream or downstream operands. It is static evidence, not runtime causality.
- `resolve_tag` resolves an alias chain, member, integer bit or array subscript.
- `usage_map` reports which array elements and bits a tag uses and which remain free.

## Scope rules

- Program-scoped tags and routines need `scope` set to the program name.
- AOI members are written `AOI_Name::Member`, for example `AOI_EncoderScale::Out_FPM`. `find_references` accepts that spelling; `trace_dependencies` splits it and resolves the member against the AOI.
- An unresolved symbol is refused with `UNRESOLVED_SYMBOL` and candidate scope names. Do not guess past it; fix the scope or the spelling.

## Checks and comparison

- `run_checks` returns findings with a rule and severity. Filter with `severity` or `rule`, page with offset and limit. Findings are candidates for engineering review, never proof of a defect or of safety.
- `compare_projects` diffs two open exports by component. Export timestamps and XML formatting are ignored by design.

## Live reads

`l5x-live` reads declared scalar tags over EtherNet/IP with no Studio, FactoryTalk Linx or SDK. If `poll_live_tags` is unavailable, say live reads are not enabled here.

- `poll_live_tags` takes an explicit IPv4 address, a CPU slot and 1 to 16 declared scalars, and returns timestamped sweeps, quality and controller identity.
- `start_plc_trend` samples the same way as a session-owned job the chart can follow; stop it through the job controls.
- These are read-only. Never write controller data, force tags, toggle bits or edit online.
- Report `live_logic_matches_export: "unverified"`: a read proves a value at a moment, not that the controller runs the export.

## Reporting

- Every result carries `summary`, `data`, `coverage` and `next`. Read `coverage` before claiming the answer is complete.
- State what the export cannot prove: FBD and SFC execution semantics, dynamic indices, runtime behavior, external HMI and driver consumers, and whether online logic matches the export.
- Quote the program, routine and rung or ST line for each finding.
- Do not call a tag unused, or an output permanently zero, from the absence of references alone. External consumers are invisible here.

## Revisions

- Reading accepts any export revision 19 or later. Revisions outside the observed matrix open and report `verification: "untested_revision"`.
- Reading never needs Studio 5000. The studio entry adds offline import and build, and its controller
  tools handle upload, mode change and download under per-call approval.

## Studio

The `l5x-studio` entry adds offline SDK work; it may be disabled. Call `studio_sdk_status` before using it.

- `export_acd_to_l5x` writes one new full L5X from an ACD. No controller contact.
- `verify_offline_l5x` imports a full L5X into a new offline ACD and builds it. Build needs project revision 37+; `probe: true` tries a lower one and reports the SDK error. An L5X from `export_acd_to_l5x` may be refused as "no changes".
- `build_acd_from_draft` imports one changed RLL or ST routine into a new ACD copy, builds and exports it. The baseline must be an L5X exported from that ACD in this chat; neither file may change.
- `studio_review_evidence` checks program, routine and rung or line names and verbatim quotes before you report findings.
- `controller_approval_status` says whether this session can ask a human. `capture_controller_snapshot`, `change_controller_mode` and `download_project` need per-call approval of the exact target and proceed only on `allowed-once`; `download_project` takes a `verification_id` from a passed build in this chat.
- `go_online`, `read_controller_mode` and `read_live_tag` are read-only and need no approval. Never write controller data, force tags, toggle bits or edit online.

## Editing

Editing uses the `draft_*` family. It may be disabled in this profile; if a draft tool is unavailable, say editing is not enabled here rather than trying another tool.

- One operation per call: `draft_rung`, `draft_rung_comment`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member`, `draft_udt_description`.
- `draft_validate` prepares the accumulated draft against the project and returns its hash, diff summary and check findings. Read the findings before applying.
- `draft_apply` writes the draft to ONE new `.L5X` path. It never overwrites an existing file.
- After applying, reopen the written file with `open_project` to review it.
- Drafts belong to this chat. Another chat starts with none, and an applied draft is cleared.

## Generate

Write ladder through the composer, not by inventing NeutralText.

### Show proposed rungs as ladder
`l5x_rung_preview` takes one rung per line and one comment per line: it validates each rung like `draft_rung`, writes a viewer document and draws a PNG when Chrome or Edge is installed. Present the PNG. Nothing is imported.

- `list_instructions` gives the mnemonic, category and operand slots with their kinds; read it before composing.
- `compose_rung` builds one rung from a tree (`spec_json`) or a pattern (`start_stop_latch`, `fault_latch`, `ton_delay`, `interlock`), resolves and type-checks every operand, refusing anything unknown or mistyped before staging. compose_batch does the same for 200 rungs in one call, refusing the batch if a rung fails.
- Pass `program`, `routine`, `mode` and `rung` to stage it (plus `comment`); without them it returns text only.
- `fault_latch` stages two rungs at `rung` and `rung + 1`; rung numbers are not renumbered, so pick free ones.

## Documentation

`document_project` writes a handover bundle into a NEW folder and never touches the export:

- `PROJECT.md` — controller, revision, tasks, programs, counts;
- `io.md` / `io.csv` — modules and module-data tags;
- `tags.csv` and `tags-studio.csv` — every declared tag, and the `Tag Name,Description` shape Studio imports;
- `rungs/<program>.md` — each rung's number, comment, NeutralText, instructions and resolved tags.

The bundle is structure and citations, not prose: write the narrative yourself and use `draft_rung_comment` / `draft_tag_description` when it belongs in the project. No C&E, FAT/SAT or runtime proof.
