# dsh-engineering-l5x

Studio 5000 L5X tools for the `dsh-engineering` bundle. Four loader entries share one package:

| Entry | Tools | Needs |
|---|---|---|
| `dsh-engineering-l5x` | 11 offline read and reference tools | Node |
| `dsh-engineering-l5x/editing` | 9 `draft_*` tools | the read entry |
| `dsh-engineering-l5x/studio` | 6 Logix Designer SDK tools and 7 supervised controller tools | Studio 5000, Logix Designer SDK, FactoryTalk Linx |
| `dsh-engineering-l5x/live` | 7 EtherNet/IP tools: `poll_live_tags`, `read_live_tags`, `read_controller_clock`, `discover_controllers`, `start_plc_trend`, and the approval-gated `write_live_tag`, `write_controller_clock` | a reachable controller for reads; the row's `allowWrites` plus human approval for writes |

The `rockwell-l5x` guidance ships as the separate `dsh-engineering-l5x/skill` entry, and the PLC
trend card ships as the client face (`dsh.client`).

## Read surface

`open_project` opens one export and returns a `project_id`. `project_overview`, `list_components` and
`get_component` walk the structure; `search_logic`, `find_references`, `trace_dependencies`,
`resolve_tag` and `usage_map` answer where a symbol is used; `run_checks` and `compare_projects`
produce review evidence. Every result carries `summary`, `data`, `coverage` and `next`.

Reading accepts L5X revision 19 or later and never needs Studio. A changed export is refused with
`STALE_EXPORT`; reopen it before continuing.

## Editing

`draft_rung`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member` and
`draft_udt_description` append one operation per call; `draft_validate` prepares the draft and
`draft_apply` writes one new L5X beside the source. Nothing overwrites, imports, connects or changes
a controller.

## Studio and controller

`studio_sdk_status`, `studio_capabilities`, `export_acd_to_l5x`, `verify_offline_l5x`,
`build_acd_from_draft` and `studio_review_evidence` cover offline SDK work. The controller tools
(`capture_controller_snapshot`, `go_online`, `read_controller_mode`, `read_live_tag`,
`change_controller_mode`, `download_project`, `controller_approval_status`) are read-only unless the
operation is an upload, mode change or download; those require per-call human approval and a
`verification_id` from a passed build.

## Live

Reads need no approval and no Studio, Linx, ACD or SDK:

| Tool | What it does |
|---|---|
| `poll_live_tags` | Timed sweeps of 1–16 declared scalar tags, with quality and controller identity |
| `read_live_tags` | Up to 64 declared scalars in **one** request (CIP tag group) |
| `read_controller_clock` | Identity plus the wall clock beside the workstation clock and their offset (L8x) |
| `discover_controllers` | Bounded UDP broadcast discovery of EtherNet/IP devices on the LAN |
| `start_plc_trend` | Session-owned trend job the chart follows without a model call per sample |

Two writes exist and are **supervised**, not merely available:

| Tool | What it changes |
|---|---|
| `write_live_tag` | One declared scalar, then read back over CIP |
| `write_controller_clock` | The controller wall clock (L8x), then read back |

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
