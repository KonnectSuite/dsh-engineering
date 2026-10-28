# Examples

Worked sessions for both products. Each call shows only the arguments that matter; every tool also
accepts the handle (`project_id` or `view_id`) when more than one is open. The full parameter list is
in the [tool reference](reference/tools.md).

Every result carries `summary`, `data` and `next`, and most carry `coverage`. Read `coverage` before
telling a user the answer is complete.

## 1. Review an L5X export

Start with the export, then walk the structure rather than guessing names.

```
open_project({ "path": "C:/Projects/Line/Line.L5X" })
```

```json
{
  "project_id": "p-1",
  "summary": "LineController: 4 programs, 812 tags, 96 routines.",
  "data": { "revision": 37, "counts": { "programs": 4, "tags": 812, "routines": 96 } },
  "coverage": { "complete": false, "unverified": ["FBD and SFC execution semantics", "..."] },
  "next": [{ "tool": "project_overview", "why": "Confirm tasks, programs and coverage before reading components." }]
}
```

```
project_overview({ "project_id": "p-1" })
list_components({ "kind": "tag", "filter": "Motor", "limit": 25 })
get_component({ "kind": "tag", "name": "Motor_1", "scope": "MainProgram" })
```

Program-scoped tags and routines need `scope`. Controller-scoped tags must not pass one.

Find where a symbol is used and what feeds it:

```
find_references({ "symbol": "Motor_1.Run", "detail": "evidence", "limit": 20 })
trace_dependencies({ "symbol": "Motor_1.Run", "direction": "upstream", "depth": 3 })
resolve_tag({ "address": "Alarm_Bits[2].3" })
usage_map({ "tag": "Alarm_Bits", "scope": "MainProgram" })
```

`find_references` reports external consumers as invisible; `trace_dependencies` is static evidence,
not runtime causality. Never call a tag unused from the absence of references.

Run checks and compare two exports:

```
run_checks({ "severity": "warning", "limit": 50 })
compare_projects({ "before_id": "p-1", "after_id": "p-2" })
```

Findings are review candidates, not proof of a defect. Comparison ignores export timestamps and XML
formatting by design.

## 2. Stage an edit and apply it to a new file

Editing is the `l5x-editing` row. If a draft tool is missing, say editing is not enabled here; do not
substitute a controller write.

```
draft_tag({
  "scope": "MainProgram",
  "name": "Motor_2_Run",
  "data_type": "BOOL",
  "description": "Run command for conveyor motor 2"
})
draft_rung({
  "program": "MainProgram",
  "routine": "MainRoutine",
  "mode": "replace",
  "rung": 12,
  "text": "XIC(Start_2)OTE(Motor_2_Run);"
})
```

Each call appends one operation to the chat draft and returns the draft id. Nothing is written yet.

```
draft_validate({ "draft_id": "d-1" })
```

The validation result reports the project hash, a diff summary and check findings. Read the findings
before applying.

```
draft_apply({ "draft_id": "d-1", "output_path": "C:/Projects/Line/Line.edited.L5X" })
open_project({ "path": "C:/Projects/Line/Line.edited.L5X" })
```

`draft_apply` writes exactly one new file and refuses to overwrite an existing one. It never imports
into Studio, connects to a controller, or changes mode. Reopen the written file to review it, then
compare it with the source (`compare_projects`).

## 3. Verify with the Studio SDK

The `l5x-studio` row needs Studio 5000, the Logix Designer SDK service and FactoryTalk Linx. Check
that first; the tools refuse with a fix when the SDK is absent.

```
studio_sdk_status()
studio_capabilities({ "project_id": "p-1" })
```

Export an ACD for review, or verify an existing L5X by importing it into a new offline ACD and
building it:

```
export_acd_to_l5x({ "acd_path": "C:/Projects/Line/Line.ACD", "output_path": "C:/Projects/Line/Line.from-acd.L5X" })
verify_offline_l5x({ "project_id": "p-1", "output_path": "C:/Projects/Line/Line.verify.ACD" })
```

Build needs project revision 37 or later. `probe: true` attempts a lower revision and reports the SDK
error instead of pretending it worked. A Studio-exported L5X builds; an L5X produced by
`export_acd_to_l5x` may be refused by the SDK as "no changes".

For one changed routine, build a new ACD copy from the draft:

```
build_acd_from_draft({
  "acd_path": "C:/Projects/Line/Line.ACD",
  "baseline_id": "p-1",
  "project_id": "p-1",
  "program": "MainProgram",
  "routine": "MainRoutine",
  "output_path": "C:/Projects/Line/Line.build.ACD",
  "result_export_path": "C:/Projects/Line/Line.build.L5X"
})
```

Before reporting findings, check the exact names and quotes:

```
studio_review_evidence({ "project_id": "p-1", "citations": [ ... ] })
```

## 4. Supervised controller access

Read the session's approval policy before asking for a transfer:

```
controller_approval_status()
```

Upload and mode change require per-call human approval of the exact controller and target. The tools
refuse before contacting a controller when the session cannot ask.

```
capture_controller_snapshot({
  "ip_address": "192.168.1.10",
  "route_project_path": "C:/Projects/Line/Line.ACD",
  "output_path": "C:/Projects/Line/Line.snapshot.ACD"
})
go_online({ "snapshot_path": "C:/Projects/Line/Line.snapshot.ACD", "ip_address": "192.168.1.10" })
read_controller_mode({ "ip_address": "192.168.1.10", "snapshot_path": "C:/Projects/Line/Line.snapshot.ACD" })
read_live_tag({ "snapshot_path": "...", "ip_address": "192.168.1.10", "tag": "Line_Run", "data_type": "BOOL" })
```

`go_online`, `read_controller_mode` and `read_live_tag` are read-only and need no approval. A mode
change needs approval for the exact target:

```
change_controller_mode({ "snapshot_path": "...", "ip_address": "192.168.1.10", "target_mode": "Program" })
```

A download accepts only a `verification_id` produced by a passed build in this chat:

```
download_project({ "verification_id": "v-1", "ip_address": "192.168.1.10" })
```

This SDK entry never writes controller data, forces tags, toggles bits or edits online. The only write
path in the bundle is the live surface below, and it is supervised.

## 5. Live EtherNet/IP: reads, discovery, clock and supervised writes

The L5X row's `live` option mounts the EtherNet/IP surface, which talks to the controller directly with
no Studio, Linx or ACD. Reads need no approval.

```
poll_live_tags({
  "project_id": "p-1",
  "ip_address": "192.168.1.10",
  "slot": 0,
  "tags": ["Line_Run", "Part_Count", "Speed_SP"],
  "sample_count": 5,
  "interval_ms": 200
})
```

The result carries timestamped sweeps, quality and the controller identity.

For a one-shot snapshot, read many tags in **one** request instead of one connection per tag:

```
read_live_tags({
  "ip_address": "192.168.1.10",
  "slot": 0,
  "tags": ["Line_Run", "Part_Count", "Speed_SP", "Reject_Total"]
})
```

When the address is unknown, discover the controllers on the subnet (bounded broadcast; a routed or
filtered network returns nothing):

```
discover_controllers({ "duration_seconds": 3 })
```

Before a download, compare the controller clock with the workstation clock (L8x only; other models
report `clock_supported: false` rather than a guess):

```
read_controller_clock({ "ip_address": "192.168.1.10", "slot": 0 })
```

For a chart, start a bounded session-owned job:

```
start_plc_trend({
  "project_id": "p-1",
  "ip_address": "192.168.1.10",
  "slot": 0,
  "tags": ["Part_Count"],
  "sample_count": 120,
  "interval_ms": 500
})
```

The trend job is stopped through the job controls. Report
`live_logic_matches_export: "unverified"`: a read proves a value at a moment, not that the controller
runs the exported logic, and sequential reads can miss transitions.

### Supervised writes

A write is the only place this bundle changes a running machine, and it takes two independent keys: the
row's `allowWrites` switch, and a human approving that exact write.

```
write_live_tag({
  "project_id": "p-1",
  "ip_address": "192.168.1.10",
  "slot": 0,
  "name": "LineSpeed",
  "value": 42.5
})
```

What the reader must see in the result:

- `approved: "allowed-once"` — this exact operation, once;
- `previous_value` and `readback` — what the controller held and what it now returns;
- `verified: true` — the readback matched the request. A mismatch fails the call with
  `WRITE_NOT_VERIFIED` instead of reporting success.

Refusals are explicit and happen before the socket opens: `WRITES_DISABLED` (row switch off),
`APPROVAL_UNAVAILABLE` (session policy is not `ask`), `APPROVAL_DENIED` (human declined),
`UNSUPPORTED_WRITE_TAG` (not a declared non-alias scalar, or `ExternalAccess: None`) and
`INVALID_WRITE` (value outside the declared type or range).

```
write_controller_clock({ "ip_address": "192.168.1.10", "slot": 0, "time": "2026-10-25T09:30:00Z" })
```

Say plainly that a verified write proves the tag value, not the process outcome: the logic may act on it
on the next scan, and what it does is not established by the transaction.

## 6. Read a FactoryTalk View ME export

The read surface parses display XML and the HMI tag CSV. It does not decode MER/MED, contact a
terminal, or drive Studio.

```
ftview_open({ "root": "C:/Projects/Line/ME" })
ftview_list({ "kind": "display", "filter": "Main" })
ftview_get({ "kind": "display", "name": "Main" })
ftview_get({ "kind": "tag", "name": "Line_Run" })
ftview_find({ "query": "Start" })
ftview_check()
```

`ftview_check` reports tag CSV integrity, duplicate names and files that did not parse. It is not
vendor XSD validation and says nothing about PLC binding.

Compare a revised export:

```
ftview_open({ "root": "C:/Projects/Line/ME-rev2" })
ftview_compare({ "before_id": "v-1", "after_id": "v-2" })
```

Comparison is by display name, tag name and file content hash.

## 7. Export, author and verify a FactoryTalk View application

Start from the installed application rather than a folder someone emailed. The vendor export server runs
without a Studio window and does not change the project. Export, authoring, validation, apply and
verification need no Studio; only the alarm snapshot and the display import do.

```
ftview_apps({ "filter": "Laminator" })
ftview_export({ "application": "Carpenter_EPS_Laminator001", "output_root": "C:/Exports/Laminator" })
ftview_open({ "root": "C:/Exports/Laminator" })
ftview_studio_export_prepare({ "application": "Carpenter_EPS_Laminator001", "kind": "tags",
  "export_root": "C:/Exports/Laminator" })
ftview_studio_export_accept({ "kind": "tags",
  "source": "C:/Exports/Laminator/Tags/Carpenter_EPS_Laminator001.csv",
  "destination": "C:/Exports/Laminator/Tags/Carpenter_EPS_Laminator001.csv" })
```

Author against the schema the export declares. One operation per call, then validate before applying:

```
ftview_draft_display_create({ "name": "Arya Overview", "width": 800, "height": 600 })
ftview_draft_object_add({
  "display": "Arya Overview", "type": "text", "name": "Heading",
  "attributes_json": "{\"height\":\"30\",\"width\":\"300\",\"left\":\"20\",\"top\":\"20\"}",
  "caption": "Line overview"
})
ftview_draft_object_add({
  "display": "Arya Overview", "type": "momentaryButton", "name": "StartBtn",
  "attributes_json": "{\"height\":\"60\",\"width\":\"120\",\"left\":\"20\",\"top\":\"80\"}",
  "connections_json": "{\"Value\":\"SystemRunning\"}"
})
ftview_validate({ "draft_id": "d-1" })
ftview_apply({ "draft_id": "d-1", "output_root": "C:/Exports/Laminator-edited" })
```

`ftview_validate` reports `schema.ran` and the vendor-schema errors; `ftview_apply` refuses a document
the schema rejects. Apply writes a new folder containing the changed displays, `IMPORT.md` and the
vendor's own `Displays/BatchImport_<app>.xml`.

A human imports that list in FactoryTalk View Studio, then the import is proven, not assumed:

```
ftview_verify_import({ "application": "Carpenter_EPS_Laminator001" })
```

Each display comes back `matched: true` or with the differing attributes and missing/extra objects. The
export does not include the HMI tag CSV, and the bundle does not import or build a `.mer` — those remain
Studio steps.

An attribute-only edit still works without authoring:

```
ftview_draft_display_set({ "display": "Main", "object": "StartButton", "attribute": "Text", "value": "START LINE" })
ftview_draft_tag_upsert({ "name": "Line_Run", "description": "Line running", "type": "BOOL" })
```

## 8. Edit a MotionWorks IEC project in place

The `mwi` row edits the **real workspace project**. The first open writes one complete backup under
`.motionworks/attached/`, and a project the IDE already has open is attached rather than reloaded.

```
mw_ide_status()
mw_project_find({ "filter": "BottomCutter" })
mw_project_open({ "path": "C:/Projects/Line/BottomCutterS5.mwt" })
```

If that project is already open in the IDE, the result carries `already_open: true` and the backup
path; no `OpenProject` call is made. When another project is open, closing it needs the exact path:

```
mw_project_open({
  "path": "C:/Projects/Line/BottomCutterS5.mwt",
  "user_approved": true,
  "expected_project": "C:/Projects/Line/TopCutterS5.mwt"
})
```

Read the body and keep the hash it returns — that is the precondition the edit takes:

```
mw_get({ "kind": "pou", "name": "BtmCutterFFCamSetup" })
# → document.body, document.text_body_sha256
mw_edit_code({
  "pou": "BtmCutterFFCamSetup",
  "expected_body_sha256": "<document.text_body_sha256>",
  "changes": [{ "find": "iState := INT#5;", "replace": "iState := INT#6;", "count": 1 }]
})
mw_compile({ "mode": "build" })
mw_diagnostics({ "pane": "Errors" })
```

An edit refused because the open project has no proven backup takes the backup first; an edit refused
because the hash no longer matches means the saved body changed — re-read it and pass the new hash.
MotionWorks edits verify unrelated saved and native state, and `mw_apply` saves in place. A compile
verdict is the vendor engine's and does not prove runtime behavior.

## 9. Read and author a FactoryTalk Optix project

Optix is read through the Studio bridge, so the loaded project — not the disk — is the truth. Start by
finding the project and mapping it:

```
optix_status()
optix_read({ "project": "Line", "request": { "action": "map", "mode": "overview" } })
optix_read({ "project": "Line", "request": { "action": "type_schema", "type": "Label" } })
```

Author as a typed batch. `dry_run` validates the whole batch without writing; live writes need the row's
`allowWrites` switch, and destructive operations need `allowDestructive`:

```
optix_edit({
  "project": "Line",
  "dry_run": true,
  "ops": [
    { "op": "create_variable", "parent": "Objects/Line", "name": "LineSpeed", "datatype": "Float" },
    { "op": "bind", "path": "Screens/MainScreen/Label1", "name": "Text", "source_path": "Objects/Line/LineSpeed", "mode": "Read" }
  ]
})
```

Expressions and NetLogic guidance are checked before they are attached:

```
optix_validate_expression({ "project": "Line", "expression": "String.Format('{0:F1} m/min', {0})", "sources": "Objects/Line/LineSpeed" })
optix_netlogic({ "query": "PeriodicTask" })
```

A successful model change is not a save: `optix_apply` is not a Studio save, and rendering still needs
the emulator preview (`optix_screenshot`) when one is configured.

## Reporting reminders

- Quote the program, routine and rung or ST line for an L5X finding; quote the display file and
  object name for a FactoryTalk View finding.
- State what the export cannot prove: PLC binding, runtime behavior, visual rendering,
  FBD/SFC execution, dynamic indices, and whether online logic matches the export.
- A missing entry is a configuration fact, not a reason to use another tool: if `draft_*`,
  `studio_*` or `poll_live_tags` are unavailable, say the row is not enabled here.
