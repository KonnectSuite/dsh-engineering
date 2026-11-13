# The AryaCAD Electrical bridge

The ECAD row owns reading. **AryaCAD Electrical owns writing.** This document is the seam between
them: what runs where, how the bridge is mounted, what `ecad_capabilities` reports, and the sequence
that turns a CAD edit into a proven change.

## Two halves, one ownership line

| Capability | Owner | How it runs |
|---|---|---|
| Open and view DXF/DWG, sheets, title block, profile, cross-reference, checks, compare, review and backup bundles | this row, offline | `@mlightcad/data-model` (MIT) plus the bundled `acadrust` WASM converter (MPL-2.0); no external process |
| Drawing authoring, geometry edits, plotting to PDF, DXF/DWG publishing, electrical netlist / wire list / BOM | **AryaCAD Electrical** | the host MCP client → `mcp__ocs__*` tools served by `OpenCADStudio.exe --mcp` |

The line is deliberate. This row keeps a renderer it can prove (measured on the print set: 34 sheets
into 83,936 primitives, 33/33 DWGs converted) and gives up the editor it would have to maintain.
AryaCAD is a full CAD application with its own automation protocol, its own verification
(`save_verified`) and its own release cadence — it is not a library this bundle can absorb.

**The GPL boundary is hard.** AryaCAD Electrical is GPL-3.0 and its portable build is a 158 MB
executable. This bundle never ships it, never installs it, and never starts it. Nothing in
`packages/ecad` links to it or spawns it. The only thing this row knows about it is the server name
its tools appear under.

## Mounting the bridge

The bridge is a **profile-level** row, not a row this bundle inserts. Two reasons, both enforced by
this repository's own tests:

- `test/patch.spec.mjs` and `test/docs.spec.mjs` constrain what this bundle's `cordis.patch.yml` may
  insert: every inserted package must be a declared dependency, and a row naming a host package
  breaks composition on any profile that does not carry it (`patch: entry ... not found`).
- The vendor application is the owner's to install. A bundle that mounts a stdio command pointing at
  an executable it does not ship would fail on every machine but one.

So the bundle ships a **ready-to-apply overlay** instead:
[`overlays/aryacad-mcp.patch.yml`](../overlays/aryacad-mcp.patch.yml). Copy its `insert` block into
your profile patch, or apply it with the host's patch command, and set `command` to the real path of
your AryaCAD executable — for the portable build that is
`<extract-dir>\dist\AryaCADElectrical-portable\OpenCADStudio.exe`, started with `--mcp`.

Two names have to agree:

- `serverName` in the MCP row must match `[A-Za-z0-9_-]{1,32}`, be unique among `mcp-client`
  instances in the composition, and gives every tool its public name: `mcp__<serverName>__<tool>`.
- `bridgeServerName` on the `ecad` row (default `ocs`) tells this row which server to report on.
  Change one, change the other.

AryaCAD's own automation docs are the authority on the server side:
`docs/automation/MCP-FOR-AGENTS.md` (the facades, envelopes, failure table) and
`docs/automation/native.md` (the editor-first model — the MCP server is a *client* of the desktop
editor, and `ocs_sessions` enumerates live editors, launching one when `launch_if_none` is true).

## What `ecad_capabilities` reports

The `cad` section of `ecad_capabilities` is this row's honest statement about the bridge:

```json
{
  "serverName": "ocs",
  "entryTool": "mcp__ocs__ocs_sessions",
  "mounted": false,
  "tools": [],
  "hint": "no mcp__ocs__* tools are registered in this composition; mount the AryaCAD MCP row (docs/aryacad-bridge.md) — a configured bridge whose discovery is still in flight also reads as not mounted"
}
```

`mounted` is `true` only when at least one `mcp__<serverName>__*` tool is registered in this
composition. MCP discovery is asynchronous, so a bridge that is configured correctly and still
connecting **also reads as not mounted**; the hint says so, and the entry tool is the way to check
directly. This row never starts the CAD application to find out.

## The AryaCAD tool surface

AryaCAD exposes four facades and seventeen intent tools. The facades are the general path; the intent
tools take their arguments directly, generated from the same operation records, so they cannot drift.

| Facade | For |
|---|---|
| `ocs_sessions` | enumerate live editors; `launch_if_none` (default true) starts one when none exists |
| `ocs_read` | everything that does not change the drawing (`op` enum of 30: `state`, `capabilities`, `query`, `entities`, `records`, `layers`, `measure`, `audit`, `text_search`, `electrical`, …) |
| `ocs_execute` | everything that changes something — one envelope request or a sequential batch |
| `ocs_capture` | a bounded PNG of the viewport or window |

Intent tools: `ocs_inspect`, `ocs_query`, `ocs_find_text`, `ocs_audit`, `ocs_commands`, `ocs_measure`,
`ocs_electrical`, `ocs_render`, `ocs_run`, `ocs_new`, `ocs_open`, `ocs_save`, `ocs_save_verified`,
`ocs_select`, `ocs_cancel`, `ocs_undo`, `ocs_redo`. Several are flagged **destructive** (`ocs_run`,
`ocs_save`, `ocs_save_verified`, `ocs_cancel`, `ocs_undo`, `ocs_redo`) — ask before using them on a
customer drawing, the same rule this row already applies to its own writes.

## The sequence that proves a change

1. **Keep the before-state.** `ecad_backup` copies the source drawing into the backup tree. Do this
   before any CAD edit, so the comparison in step 5 has a real baseline.
2. **Find the session.** `mcp__ocs__ocs_sessions` first. One editor per drawing: the automation lock
   means a second headless session cannot write the same file.
3. **Edit in AryaCAD.** `ocs_open` the drawing, then the narrowest tool that does the job — an intent
   tool, or `ocs_execute` with one envelope. Every `ocs_execute` request carries a caller-generated
   `request_id`; reuse it only to retry the identical request after a timeout.
4. **Write it out verified.** `ocs_save_verified` with an absolute path: it saves, reopens, hashes and
   compares the semantic manifest. That is AryaCAD's own proof, and it is stronger than anything this
   row could do to a DXF.
5. **Read it back here.** `ecad_open` with `reload: true`, then `ecad_compare` against the backup
   copy. This row's gate is `ecad_compare`: a drawing changed through the bridge is only accepted
   once a comparison names what changed. Report what the comparison measured, including anything it
   could not compare.

**PDF.** Plotting goes through the bridge: `ocs_execute` with `op: "plot"` takes `path`, `layout`,
`paper`, `fit` and `center` (see AryaCAD's `docs/automation/README.md`). The interactive `EXPORTPDF`
command is GUI-only, so a headless run must use the plot operation, not the command. The drawing
pane's own **Print** is the local route: it hands the currently viewed sheet to the host print dialog,
which is how a PDF is produced from what this row renders — no vendor application involved.

## What stays local

The drawing pane never depends on the bridge. A `.dxf` or `.dwg` opens in the read-only viewer, pans,
zooms, filters layers, searches text, prints, and exports SVG/PNG — all offline. `ecad_render`,
`ecad_document` and `ecad_backup` are offline too. If the bridge is absent, everything above still
works; only authoring is unavailable, and the row says so instead of pretending.
