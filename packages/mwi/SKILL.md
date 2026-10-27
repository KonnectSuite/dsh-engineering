---
name: motionworks-iec
description: Operate a running Yaskawa MotionWorks IEC 3 Pro IDE on the real project files — find and open a workspace project (one verified backup first), read the live object model and POU code, edit declarations and code, compile, read diagnostics, and verify the change.
whenToUse: The user has MotionWorks IEC 3 Pro open or asks for work in it — a build or compile verdict, the live project model, reading or changing POU code, variable declarations, tasks, or the IDE error list. Also use when a MotionWorks project is mentioned: find which project is in the workspace before answering. For a question about a project outside the workspace, say it cannot be opened.
---

# MotionWorks IEC workspace editing

## Boundary

This surface edits the **real workspace project**. `mw_project_open` takes one complete, hash-verified
backup under `<workspace>/backups/<project>/<timestamp>` before the IDE opens the project, and reuses
that backup for later attaches. `mw_project_stage` remains available as an optional sandbox when you
want the IDE to open a copy instead. Nothing here downloads to a controller or commands motion.

The native IDE API is the editing path. Desktop input belongs to the computer-use companion and is a
fallback for operations without a native call, never a substitute for a refused native one.

The rows are switches. If `mw_edit_*` is missing, editing is not enabled here. If no `mw_*` tool is
present, the MotionWorks rows are not enabled on this host, or the host is not Windows.

## Start

1. `mw_project_find` lists workspace projects, any staged copy and any existing pre-edit backup.
   Nothing else identifies the project you may touch.
2. `mw_project_open` opens the workspace `.mwt` directly. It first writes and verifies the backup, so
   the edit can always be rolled back.
3. `mw_ide_status` reports the project identity, active view, modal dialogs and compile state. Read it
   before and after operations that change the IDE.

Use `mw_project_stage` only when the user asks for a sandbox; normal work edits the workspace project.
A wrapper that points at the wrong directory is refused; repair it with consent, never by hand.

## Read

- `mw_project_overview` — languages, counts, tasks, warnings and coverage.
- `mw_list` — POUs, variables, globals, types, tasks, libraries or blocks, filtered and paged.
- `mw_get` — one POU body with its declarations, one type, task, block interface or I/O map.
- `mw_search` — literal text across the open project's POU code.
- `mw_references` — where one symbol is read or written across POUs.
- `mw_review` — scope and type checks, integer bounds, unsupported constructs, graphical listing.
- `mw_help` — installed help and reviewed references; the index sync is explicit.

Saved code and the live IDE model are different sources. When they disagree, say which one you read.

## Verify

- `mw_compile` runs Make or Build, or reports compile state without building.
- `mw_diagnostics` reads the IDE error list; the API returns a verdict but not the messages, so this
  is the only source for exact text.
- `mw_verify` captures a baseline and compares saved and native state after a change.

A compile verdict is the vendor engine's. It does not prove runtime behavior or graphical placement.

## Edit

Only with the edit row enabled. One operation per call:

- `mw_edit_code` replaces one ST or IL body, guarded by an expected body hash.
- `mw_edit_variables` adds, edits, deletes or groups one declaration through the native API.
- `mw_edit_structure` creates, copies, renames, deletes, converts or task-assigns a POU.
- `mw_insert_block` inserts one FB instance and its bound ST call.
- `mw_transfer_pou` exports and imports one POU package.
- `mw_validate` prepares the edits and reports findings. Read them before applying.
- `mw_apply` saves the open project through the IDE, in place. The pre-edit backup is the rollback point.

Never apply a change whose expected hash no longer matches. If the source changed, re-read it and
read it again and retry the edit.

## Reporting

Every result carries `summary`, `data`, `next` and usually `coverage`. Read `coverage` before claiming
completeness.

- Quote the POU, worksheet and line or rung for a finding.
- State what the saved model cannot prove: runtime behavior, graphical wiring and placement, external
  consumers, and whether the loaded code matches the saved project.
- Do not call a variable unused from the absence of references alone; other POUs and external
  consumers may be invisible to the current read.

## Refusals

Read the fix instead of retrying blindly:

- wrong open project or stale wrapper — open the right project again;
- modal dialog or minimized IDE — inspect `mw_ide_status`, resolve it deliberately, then retry;
- a missing row — say the surface is not enabled here;
- a changed hash — re-read the body and retry.
