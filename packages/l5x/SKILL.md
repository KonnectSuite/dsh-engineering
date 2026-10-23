---
name: rockwell-l5x
description: Read and review Studio 5000 L5X exports: open a project, list and read components, find references, trace dependencies, resolve addresses, map bit usage, run checks, and compare exports.
whenToUse: Use when the user asks about a Studio 5000 L5X export, Logix tags, routines, UDTs, AOIs, I/O modules, references, dependency tracing, checks, or comparison between exports.
---

# Rockwell L5X engineering

## Boundary

This surface reads and drafts. A draft writes only a new L5X file: it never overwrites the source, imports into Studio, connects to a controller, changes mode, or writes runtime data.

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

## Reporting

- Every result carries `summary`, `data`, `coverage` and `next`. Read `coverage` before claiming the answer is complete.
- State what the export cannot prove: FBD and SFC execution semantics, dynamic indices, runtime behavior, external HMI and driver consumers, and whether online logic matches the export.
- Quote the program, routine and rung or ST line for each finding.
- Do not call a tag unused, or an output permanently zero, from the absence of references alone. External consumers are invisible here.

## Revisions

- Reading accepts any export revision 19 or later. Revisions outside the observed matrix open and report `verification: "untested_revision"`.
- Reading never needs Studio 5000. The studio entry runs offline import and build; controller transfer is not part of this surface yet.

## Studio

The `l5x-studio` entry adds offline SDK work; it may be disabled. Call `studio_sdk_status` before using it.

- `export_acd_to_l5x` writes one new full L5X from an ACD. No controller contact.
- `verify_offline_l5x` imports a full L5X into a new offline ACD and builds it. Build needs project revision 37 or later; `probe: true` attempts a lower revision and reports the SDK error. A Studio-exported L5X builds; an L5X produced by `export_acd_to_l5x` may be refused by the SDK as "no changes".
- `build_acd_from_draft` imports one changed RLL or ST routine into a new ACD copy, builds it and exports it. The baseline must be an L5X exported from that ACD in this chat, and neither file may change afterwards.
- `studio_review_evidence` checks program, routine and rung or line names and verbatim quotes before you report findings.
- `controller_approval_status` reports whether this session can ask a human. `capture_controller_snapshot`, `change_controller_mode` and `download_project` each require per-call human approval of the exact controller, route and target, and proceed only on `allowed-once`; `download_project` accepts only a `verification_id` from a passed build in this chat.
- `go_online`, `read_controller_mode` and `read_live_tag` are read-only and need no approval. Never write controller data, force tags, toggle bits or edit online.

## Editing

Editing uses the `draft_*` family. It may be disabled in this profile; if a draft tool is unavailable, say editing is not enabled here rather than trying another tool.

- One operation per call: `draft_rung`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member`, `draft_udt_description`. Each returns the draft id and the operation count.
- `draft_validate` prepares the accumulated draft against the project and returns its hash, diff summary and check findings. Read the findings before applying.
- `draft_apply` writes the draft to ONE new `.L5X` path. It never overwrites an existing file.
- After applying, reopen the written file with `open_project` to review it.
- Drafts belong to this chat. Another chat starts with none, and an applied draft is cleared.
