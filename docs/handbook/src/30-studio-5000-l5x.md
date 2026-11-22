---
title: Studio 5000 L5X
order: 30
purpose: Cover the offline-first L5X workflow, revision guards, SDK builds, and the controller boundary.
audience: Controls engineers reviewing or drafting L5X
---

## What the row does

The L5X row is the largest product surface; the generated tool reference counts its tools and is the count of record. It reads, reviews, drafts and (with the SDK) builds Studio 5000 projects. It is offline-file by default: open an `.L5X` export, inspect it, review it, draft a change, and compile a new ACD where Studio and the SDK are installed.

No install is needed to read, review or draft. The SDK build needs a licensed Studio 5000 installation with the Logix Designer SDK, and a live-controller session needs an address and an approval.

## Open, inspect, review

The first call is `l5x_open_project`, which returns a `project_id` for the rest of the session. From there: `l5x_project_overview`, `l5x_list_components`, `l5x_get_component`, `l5x_find_references`, and `l5x_run_checks` with the bundle's own rule set (43 rules at 0.103.0: unused tags, scheduling, undocumented logic, latches, multiple writers, instruction problems, FBD wiring, SFC charts, refused rungs, safety placement). The rules are ours, not a vendor sign-off; a clean run means this rule set found nothing.

Ladder previews and routine diagrams read the project's neutral text. They are views of the file, not an emulator.

## Revisions and the two guards

The row is revision-aware. It reads `.L5X` from revision 19 upward. Revisions the build has seen are marked known; any other revision opens with the verification note `untested_revision`; below 19 the file is refused with `UNSUPPORTED_REVISION`. An ACD goes through the SDK, which supports revision 31 and up.

Two documentation-tool guards keep revision lookups honest:

- **REVISION_REQUIRED** — a revision-sensitive question named no revision, so the tool asks for one instead of silently serving the newest shard.
- **INSTRUCTION_NOT_IN_REVISION** — you asked at a revision where that instruction or page is not recorded; the tool refuses rather than serve another revision's text.

A page with no revision evidence comes back with `revision: null`; the tool does not imply it matches. If a lookup is revision-sensitive, name the revision.

## Drafts and the build boundary

Draft tools (`l5x_draft_rung`, `l5x_draft_tag`, `l5x_draft_validate`) work on one new `.L5X` beside the source; `l5x_draft_apply` writes that file and refuses to overwrite. Paste it into Studio yourself. `l5x_build_acd_from_draft` compiles one new ACD from a draft with the offline engine: revision 37 and up, one existing RLL or ST routine, refuses new routines, tag changes, safety and protected routines, and takes roughly 18-26 seconds on the recorded host. On Studio 5000 v36 the engine refuses Build with "Operation not supported on Logix Designer version 36.0".

`l5x_verify_offline_l5x` expects a Studio-exported L5X. `l5x_export_acd_to_l5x` can produce a file Studio refuses to re-import (`XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`, observed 2026-10-23); treat it as an export for reading, not a round-trip.

## The controller boundary

Controller tools upload, read mode and tags, change mode, and download. Each is approval-gated per call. Live writes validate the tag and read it back; a mismatch returns `WRITE_NOT_VERIFIED`. A download needs a `verification_id` for a build from the same chat and both hashes unchanged. Live work is the operator's decision, not the agent's default.

## What this row will not claim

All reads are static. The 43 rules are not a vendor sign-off. Instruction, revision and controller coverage beyond the recorded 37.11 verification is unmeasured. FBD and SFC execution semantics are not exercised. And no offline artifact proves a machine's online logic is safe or matches the export.
