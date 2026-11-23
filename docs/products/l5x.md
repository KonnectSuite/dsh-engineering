# Studio 5000 L5X

`@aryacode/dsh-engineering` ships 56 tools that read a Studio 5000 `.L5X` export, follow a tag through
the logic, run evidence-backed review rules, draft rungs and tags into a new file, build an offline
`.ACD` with the Logix Designer SDK, and read or write declared scalars on a live controller over
EtherNet/IP — all without opening Studio for the read-only work.

The component is a beta product: the read and review path is measured on a Logix Designer 37.11 project,
and the Studio SDK and live-controller paths carry the narrower, honest limits recorded below.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `l5x` — *Studio 5000 L5X* |
| Capability class | `offline-file` (it reads an export; seven tools also read a live controller over EtherNet/IP) |
| Stability | beta, since `v0.4.4` |
| Tools | 56, all `l5x_`-prefixed (`l5x_open_project`, `l5x_draft_apply`, `l5x_export_rungs`) |
| Package / entry | `packages/l5x` → `entries/l5x.js` and its editing, Studio and live rows |
| Skill | `rockwell-l5x` (`packages/l5x/SKILL.md`, 12,800-character budget) |
| Evidence gate | `l5x_compare_projects` — an export claim is checked against a second export |
| Switches | `editing`, `studio`, `live`, `allowWrites`, `allowedAddresses`, `maxFileBytes`, `maxDraftOperations` |

Every tool carries the `l5x_` prefix; 0.104.0 renamed the row's original unprefixed names in one
release, with a migration table in `CHANGELOG.md` and no aliases. `l5x_open_project` opens one export for the chat and returns a
`project_id`; every other tool takes that handle, or omits it when exactly one project is open.

Revisions are a compatibility surface, not a detail:

| Operation | Revision support |
| --- | --- |
| Read an `.L5X` | revision 19 and later; 19, 33, 34, 36 and 37 are observed. Any other revision opens with `verification: "untested_revision"`, and below 19 is refused `UNSUPPORTED_REVISION` |
| Open an `.ACD` with the SDK | revision 31 and later; an `.ACD` is never parsed, it is exported to `.L5X` first |
| Build an `.ACD` offline | revision 37 and later; a revision-36 project opened by the 36.0 engine refuses Build with `Operation not supported on Logix Designer version 36.0` |

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| Studio 5000 Logix Designer | 37.11 verified | SDK builds, `.ACD` export, controller upload, mode change, download | yes |
| A Logix controller | any EtherNet/IP family | `l5x_poll_live_tags`, `l5x_read_live_tags`, the clock tools, discovery, trends, and the two approval-gated writes | yes |
| Node and the host | see the bundle requirements | everything above | no |

Nothing needs to be installed to read, review or draft: an `.L5X` exported from Studio is a text file and
the whole read, reference, check, preview and draft surface works from it. The SDK row is what turns an
export into a build, and it needs a licensed Logix Designer installation; the live row is what talks to a
controller, and it needs the controller's address.

The recorded verification is a Logix Designer 37.11 SDK build with zero errors on a real project, and a
composed rung pasted into Studio as Neutral Text that built clean. Other Studio revisions, other
controller families, and a wider instruction surface are not measured.

## First session

Open the export, orient, then decide what to review. The `project_id` in the answer is what the rest of
the session uses.

```json
{ "path": "C:/Projects/Line/Line.L5X" }
```

Call `l5x_open_project` with that shape. You get a `project_id` and a structure summary: controller, revision,
tasks, programs and component counts. Then:

| Step | Call | What you see |
| --- | --- | --- |
| 1. Orient | `l5x_project_overview` | controller with its saved route and serial, revision, task and program list, component counts, and an explicit limits list when routines are protected, types are vendor-owned or a safety task exists |
| 2. Find the logic | `l5x_list_components {kind: "routine"}` then `l5x_get_component {kind: "routine", name: ...}` | paginated names, then one routine's rungs or ST body in full |
| 3. Follow a symbol | `l5x_find_references {symbol: "Motor_1"}` | every read and write site with scope, access, confidence, and whether the site is safety code |
| 4. Review | `l5x_run_checks` | findings with rule, severity, site evidence and, when known, a fix — 43 rules covering unused tags, scheduling, undocumented logic, latches, multiple writers, instruction spelling, FBD wiring, SFC charts, rungs Studio refuses and safety placement |
| 5. Look at it | `l5x_diagram` or `l5x_routine_diagram` | a rendered ladder page (SVG, plus PNG when Chrome or Edge is installed), not NeutralText |

`l5x_run_checks` is the review this product exists for. Each finding names its rule (`UNUSED_TAG`,
`RUNG_NO_OUTPUT`, …), and `rule`, `severity` and `limit` narrow the list without hiding the counts.
Read the first page before changing anything: a check finding is evidence about the export, not a verdict
about the machine.

When the session is over, the draft path is the only one that writes:

```text
l5x_draft_rung            # one rung: replace, insert or delete; text validated against the export
l5x_draft_tag             # one new tag
l5x_draft_validate        # resolve the whole draft against the project, write nothing
l5x_draft_apply { "output_path": "C:/Projects/Line/Line-edited.L5X" }
```

`l5x_draft_apply` writes one new `.L5X` beside the source and refuses to overwrite anything. Import it
in Studio: the routine export goes through Import Routine (Operation Overwrite), and `l5x_export_rungs`
writes the rung-target shape for Import Rungs when only some rungs change or the import must respect
pending edits. The tools never import; see [offline editing](../../packages/l5x/knowledge/l5x-offline-workflows/pages/offline-edit-without-studio.md)
for the two routes and the online rules.

## What it does

The surface groups by the job, not by the alphabet.

| Group | Tools | What it is for |
| --- | --- | --- |
| Read and navigate | `l5x_open_project`, `l5x_project_overview`, `l5x_list_components`, `l5x_get_component` | open one export; read structure, coverage and any one component in full |
| Follow references | `l5x_search_logic`, `l5x_find_references`, `l5x_trace_dependencies`, `l5x_resolve_tag`, `l5x_usage_map` | literal search; read/write sites; what feeds a symbol; alias, member, bit and array resolution; which bits and elements of a tag are used and which are free |
| Review | `l5x_run_checks`, `l5x_compare_projects` | 43 evidence-backed rules, with an optional baseline export for I/O change checks; a component-by-component export comparison that ignores timestamps, XML formatting and Studio-added defaults |
| Document | `l5x_list_instructions`, `l5x_document_project` | the instruction catalog the composer validates, with operand kinds and ranges; a handover bundle in a new folder — project summary, I/O list, tag CSVs, per-program rung documentation, FBD/SFC decoding, AOI routines, and one printable report whose ladder is drawn inside the page |
| Preview and diagram | `l5x_rung_preview`, `l5x_compose_logic`, `l5x_routine_diagram`, `l5x_diagram` | paste-ready Studio ladder text for proposed rungs; chat-only composition when no project is open; drawn routines and whole-project schematic pages |
| Draft edits | 18 `draft_*`/export tools (`l5x_compose_rung`, `l5x_compose_batch` and `l5x_export_rungs` included) | stage rungs, ST bodies, FBD sheets, SFC charts, routines, tags, UDT members and comments; validate; then write one new file |
| Studio SDK | `l5x_studio_sdk_status`, `l5x_studio_capabilities`, `l5x_export_acd_to_l5x`, `l5x_verify_offline_l5x`, `l5x_build_acd_from_draft`, `l5x_studio_review_evidence` | prove the SDK service is there; export an `.ACD`; import an `.L5X` into a new offline `.ACD` and build it; edit one existing routine and build; quote the evidence behind a claim |
| Controller | `l5x_controller_approval_status`, `l5x_capture_controller_snapshot`, `l5x_go_online`, `l5x_read_controller_mode`, `l5x_read_live_tag`, `l5x_change_controller_mode`, `l5x_download_project` | approval policy; an upload; a read-only online session; mode and live reads; a mode change and a download, both approval-gated |
| Live EtherNet/IP | `l5x_poll_live_tags`, `l5x_read_live_tags`, `l5x_read_controller_clock`, `l5x_discover_controllers`, `l5x_start_plc_trend`, `l5x_write_live_tag`, `l5x_write_controller_clock` | sweeps of up to 64 declared scalars in one request, up to 16 tags per sweep with a 50 ms floor, a bounded trend job, broadcast discovery, the wall clock on L8x, and two writes that also need `allowWrites` |

The draft family is the largest group because each entry point validates against the specific thing it
edits: a rung is checked for a driven right rail, operand count, operand types and resolvable tags; an
instruction is checked against the catalogued operand slots; a UDT member is refused once the type has
instances.

## Limits

- Every read, reference, check and diagram is static. None of them runs the logic, and none proves that
  the export matches what the controller is executing. `l5x_go_online` and the live tools read the controller;
  they do not prove the online logic equals the file either.
- The 43 review rules are this bundle's rules, not a vendor sign-off. A clean result is a shorter review,
  not a passed one.
- The instruction surface, controller families and Studio revisions beyond Logix Designer 37.11 are
  unmeasured; a wider instruction set can reach constructs the checks do not model.
- FBD and SFC are decoded and wired-checked, but their execution semantics are not exercised.
- `l5x_build_acd_from_draft` edits one existing RLL or ST routine. It refuses new routines, tag changes,
  safety routines and protected targets, and each edit took about 18–26 s when verified on 2026-10-01
  against a generated 5069-L320ER project.
- `l5x_verify_offline_l5x` wants a Studio-exported `.L5X`. An `.L5X` written by `l5x_export_acd_to_l5x` is
  refused on re-import with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` (observed 2026-10-23), so use it for
  reading and provenance, not as build input.
- Both hand-driven Studio imports of a draft were exercised on Logix Designer 37.05: Import Routine
  (Operation Overwrite) and Import Rungs (`l5x_export_rungs`, read as Imported Rungs: 1), each followed
  by Studio Verify 0 errors/0 warnings, and the routine route's re-export matched the applied draft.
  A second rung-target round-trip on 2026-11-22 imported a two-rung export (rung replace with Fault,
  parallel-branch insert, comments, six BOOL tags; a third rung inserted and deleted in the same draft)
  through Import Rungs: Import Configuration read `Imported Rungs: 2`, both rungs and the branch appeared,
  and Studio Verify reported 0 errors. The operation appended the imported rungs after the selected rung
  rather than replacing it, so the superseded rung had to be deleted first; that behaviour, not the file,
  produced the only transient duplicate-destructive-bit warning. `l5x_export_rungs` also returns each
  rung's Studio copy text (`paste_text`) for review; it is not an import path.
- The whole instruction catalogue was exercised through the same non-SDK route on 2026-11-22: a
  43-rung routine with 32 typed tags (`TIMER`, `COUNTER`, DINT/REAL/STRING and DINT arrays) covered
  TON/TOF/RTO/RES, CTU/CTD, all eight compares, the arithmetic and move family
  (ADD/SUB/MUL/DIV/MOD/SQRT/CPT/NEG/ABS/EXPT/MOVE/CLR/COP/FLL/MVM), bitwise AND/OR/XOR/NOT,
  OTL/OTU/ONS/AFI, CONCAT/DTOS and JMP/LBL. Import Routine read `Number of Rungs: 43`; after import
  Studio rendered the timer/counter structures and the compare/math operands, and Studio Verify
  reported "Complete - 0 error(s), 1 warning(s)" - the warning being `Rung 38: AFI detected`, the
  expected notice for an intentionally always-false rung. That pass also caught the two writing
  defects listed under Fixed in the changelog.
  Online Pending/Accepted/Finalized import against a live controller, a second application's export and
  a PanelView-side workflow are unmeasured.
- `l5x_read_controller_clock` is L8x-only and answers `supported: false` elsewhere. `l5x_write_controller_clock`
  has the same restriction.

## Safety

Three write paths exist, and each says where it writes.

| Path | What it writes | What it needs |
| --- | --- | --- |
| Draft tools | nothing until `l5x_draft_apply`, which writes one new `.L5X` beside the source and never overwrites | `editing` switch; the output path must not exist |
| Documentation and previews | a new folder (`l5x_document_project`) or an image file (diagram and preview tools) | nothing beyond the row; the export is never modified |
| SDK builds | a new `.ACD` and a new result `.L5X`; the source `.ACD` hash is unchanged | `studio` switch and an installed, licensed Logix Designer |
| Controller traffic | an upload to a new `.ACD`; a mode change; a program download; one live tag or clock write | `allowWrites` for the two writes, plus per-call human approval; a download needs the `verification_id` of a build this chat produced and both hashes unchanged |

Approval is a per-call decision, not a setting: `l5x_change_controller_mode`, `l5x_capture_controller_snapshot`
and `l5x_download_project` refuse with `APPROVAL_UNAVAILABLE` unless the session policy is `ask`, and proceed
only on an `allowed-once` answer. A live write is validated against the export before a socket opens —
declared, not an alias, no dimensions, external access not `None`, value inside type and range — and then
read back; a mismatch is reported `WRITE_NOT_VERIFIED`, not success.

## Where to go next

- [Tool reference](../reference/tools.md) — every tool above with its parameters.
- [Capabilities](../capabilities.md) — the call behind each measured figure.
- [Live controller](../live-controller.md) — the approval and read/write policy in one page.
- [SLC 500 and PLC-5 to Logix migration](migration.md) — the other path that produces a `.L5X`, and how
  it is verified.
