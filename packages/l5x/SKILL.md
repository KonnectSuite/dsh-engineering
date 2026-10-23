---
name: rockwell-l5x
description: Read and review Studio 5000 L5X exports: open a project, list and read components, find references, trace dependencies, resolve addresses, map bit usage, run checks, and compare exports.
whenToUse: Use when the user asks about a Studio 5000 L5X export, Logix tags, routines, UDTs, AOIs, I/O modules, references, dependency tracing, checks, or comparison between exports.
---

# Rockwell L5X engineering

## Boundary

This surface is read-only. It never edits a file, connects to a controller, changes mode, or writes runtime data. If the user asks for an edit, say the draft tools are not part of this surface yet.

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
- Reading never needs Studio 5000. Build, import and controller transfer are not part of this surface.
