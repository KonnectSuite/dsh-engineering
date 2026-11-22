# dsh-engineering-l5x

Studio 5000 L5X tools for the `dsh-engineering` bundle. Four loader entries share one package:

| Entry | Tools | Needs |
|---|---|---|
| `dsh-engineering-l5x` | 11 offline read and reference tools | Node |
| `dsh-engineering-l5x/editing` | 9 `draft_*` tools | the read entry |
| `dsh-engineering-l5x/studio` | 6 Logix Designer SDK tools and 7 supervised controller tools | Studio 5000, Logix Designer SDK, FactoryTalk Linx |
| `dsh-engineering-l5x/live` | 7 EtherNet/IP tools: `l5x_poll_live_tags`, `l5x_read_live_tags`, `l5x_read_controller_clock`, `l5x_discover_controllers`, `l5x_start_plc_trend`, and the approval-gated `l5x_write_live_tag`, `l5x_write_controller_clock` | a reachable controller for reads; the row's `allowWrites` plus human approval for writes |

The `rockwell-l5x` guidance ships as the separate `dsh-engineering-l5x/skill` entry, and the PLC
trend card ships as the client face (`dsh.client`).

## Read surface

`l5x_open_project` opens one export and returns a `project_id`. `l5x_project_overview`, `l5x_list_components` and
`l5x_get_component` walk the structure; `l5x_search_logic`, `l5x_find_references`, `l5x_trace_dependencies`,
`l5x_resolve_tag` and `l5x_usage_map` answer where a symbol is used; `l5x_run_checks` and `l5x_compare_projects`
produce review evidence. Every result carries `summary`, `data`, `coverage` and `next`.

Reading accepts L5X revision 19 or later and never needs Studio. A changed export is refused with
`STALE_EXPORT`; reopen it before continuing.

## Editing

`l5x_draft_rung`, `l5x_draft_st`, `l5x_draft_routine`, `l5x_draft_tag`, `l5x_draft_tag_description`, `l5x_draft_udt_member` and
`l5x_draft_udt_description` append one operation per call; `l5x_draft_validate` prepares the draft and
`l5x_draft_apply` writes one new L5X beside the source. Nothing overwrites, imports, connects or changes
a controller. The whole editing path needs Node only — no Studio, no Logix Designer SDK, no Linx. The
engineer imports the new L5X into Studio 5000, which is the normal workflow, not a fallback; the SDK
row is an optional extra for people who bought it.

## Studio and controller

`l5x_studio_sdk_status`, `l5x_studio_capabilities`, `l5x_export_acd_to_l5x`, `l5x_verify_offline_l5x`,
`l5x_build_acd_from_draft` and `l5x_studio_review_evidence` cover offline SDK work. The controller tools
(`l5x_capture_controller_snapshot`, `l5x_go_online`, `l5x_read_controller_mode`, `l5x_read_live_tag`,
`l5x_change_controller_mode`, `l5x_download_project`, `l5x_controller_approval_status`) are read-only unless the
operation is an upload, mode change or download; those require per-call human approval and a
`verification_id` from a passed build.

## Live

Reads need no approval and no Studio, Linx, ACD or SDK:

| Tool | What it does |
|---|---|
| `l5x_poll_live_tags` | Timed sweeps of 1–16 declared scalar tags, with quality and controller identity |
| `l5x_read_live_tags` | Up to 64 declared scalars in **one** request (CIP tag group) |
| `l5x_read_controller_clock` | Identity plus the wall clock beside the workstation clock and their offset (L8x) |
| `l5x_discover_controllers` | Bounded UDP broadcast discovery of EtherNet/IP devices on the LAN |
| `l5x_start_plc_trend` | Session-owned trend job the chart follows without a model call per sample |

Two writes exist and are **supervised**, not merely available:

| Tool | What it changes |
|---|---|
| `l5x_write_live_tag` | One declared scalar, then read back over CIP |
| `l5x_write_controller_clock` | The controller wall clock (L8x), then read back |

A write needs the row's `allowWrites` switch **and** a human approving that exact operation: with
`allowWrites` on and a `never` policy the tool refuses with `APPROVAL_UNAVAILABLE` before opening a
socket, and a declined prompt is `APPROVAL_DENIED`. Each write is validated against the open export
(declared, non-alias, no array dimensions, `ExternalAccess` not `None`, value inside the declared
type and range) and a readback that differs fails with `WRITE_NOT_VERIFIED`.

Every read reports that live logic matching the export is unverified, and sequential reads can miss
transitions between sweeps.

## Configuration

| Entry | Option | Default |
|---|---|---|
| read | `maxFileBytes` | 64 MiB |
| editing | `maxFileBytes`, `maxDraftOperations` | 64 MiB, 200 |
| studio | `maxFileBytes` | 64 MiB |
| live | `enabled`, `minIntervalMs`, `defaultIntervalMs`, `maxTags`, `maxSamples`, `allowWrites`, `maxBatchTags`, `allowedAddresses` | true, 50 ms, 200 ms, 16, 1200, false, 64, empty |

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
