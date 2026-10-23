# dsh-engineering-l5x

Studio 5000 L5X tools for the `dsh-engineering` bundle. Four loader entries share one package:

| Entry | Tools | Needs |
|---|---|---|
| `dsh-engineering-l5x` | 11 offline read and reference tools | Node |
| `dsh-engineering-l5x/editing` | 9 `draft_*` tools | the read entry |
| `dsh-engineering-l5x/studio` | 6 Logix Designer SDK tools and 7 supervised controller tools | Studio 5000, Logix Designer SDK, FactoryTalk Linx |
| `dsh-engineering-l5x/live` | `poll_live_tags`, `start_plc_trend` | a reachable controller |

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

`poll_live_tags` and `start_plc_trend` read declared scalar tags over EtherNet/IP without Studio,
Linx, an ACD or the SDK. They are read-only and report that live logic matching the export is
unverified.

## Configuration

| Entry | Option | Default |
|---|---|---|
| read | `maxFileBytes` | 64 MiB |
| editing | `maxFileBytes`, `maxDraftOperations` | 64 MiB, 200 |
| studio | `maxFileBytes` | 64 MiB |
| live | `enabled`, `minIntervalMs`, `defaultIntervalMs`, `maxTags`, `maxSamples` | true, 50 ms, 200 ms, 16, 1200 |

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
