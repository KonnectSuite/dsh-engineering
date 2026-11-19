# The AryaCAD Electrical bridge

Reading electrical prints and changing them are two different jobs, held by two different applications.
The `ecad` row reads DXF/DWG offline and never edits a drawing; AryaCAD Electrical authors the drawing,
plots it and publishes it. The bridge is the MCP row that lets a session drive AryaCAD from the same
conversation — and this page covers what the bundle ships for it, what you must mount yourself, and the
sequence that proves an edit landed.

The bundle does not ship, install or start AryaCAD Electrical. It ships an overlay you copy into your
profile when you have the application.

## What it is

| Fact | Value |
| --- | --- |
| Reading side | this bundle's `ecad` row: `@mlightcad/data-model` (MIT) for DXF, plus a bundled `acadrust` WASM converter (MPL-2.0) for DWG; no external process |
| Writing side | AryaCAD Electrical (GPL-3.0), a 158 MB portable build, driven through its own MCP server |
| What the bundle ships | `overlays/aryacad-mcp.patch.yml` — an insert block for the profile patch, not a row the bundle mounts |
| What the row knows | only the server name. Nothing in `packages/ecad` links, spawns or bundles the CAD application |
| Where the two meet | the tool surface `mcp__<serverName>__*` that AryaCAD's MCP server registers, and the `cad` section of `ecad_capabilities` |

The split is deliberate. AryaCAD is GPL-3.0 and this bundle is MIT, so the two may not be vendored into
one artifact; and a CAD application is a desktop editor, not a library. Reading belongs here because it
needs nothing installed. Writing belongs there because it needs the application, its licence and its own
automation surface.

## What you need

| Requirement | Needed for | Optional |
| --- | --- | --- |
| AryaCAD Electrical, portable build, extracted anywhere | authoring, geometry edits, PDF plots, DXF/DWG publishing, netlist, wire list and BOM | yes — everything read-side works without it |
| A profile-level `mcp-client` row pointing at `OpenCADStudio.exe --mcp` | the `mcp__ocs__*` tools | yes |
| The ECAD row switched on | all `ecad_*` tools, including the `cad` report | no, once |
| A matching server name on both sides | `ecad_capabilities` reporting the bridge correctly | no, when the bridge is mounted |

Mounting is a profile edit, not a bundle change. Copy the insert block from
`overlays/aryacad-mcp.patch.yml` into your profile's patch and set `command` to the executable you
extracted, for example:

```text
C:\Tools\AryaCADElectrical-portable\dist\AryaCADElectrical-portable\OpenCADStudio.exe --mcp
```

Two names must agree:

- `serverName` on the bridge row must match `[A-Za-z0-9_-]{1,32}` and be unique among the profile's
  `mcp-client` instances. It produces the tool names `mcp__<serverName>__<tool>`, so a name change renames
  every tool.
- `bridgeServerName` on the `ecad` row (default `ocs`) tells the row which server to report on. Change one,
  change the other.

The bridge cannot be a row this bundle inserts, and the tests enforce that: every inserted package must be
a declared dependency, and a row that names a host application rather than a package breaks composition
with `patch: entry ... not found`. The vendor application is yours to install; the bundle's job is to say
what it needs and to report what is there.

## First session

Ask the row what it can see before assuming the bridge is up. MCP discovery is asynchronous, so a
configured bridge that is still connecting reads as **not mounted** — that is a report, not a failure.

```json
{ "serverName": "ocs", "entryTool": "mcp__ocs__ocs_sessions", "mounted": false, "tools": [] }
```

Call `ecad_capabilities` and read its `cad` section. `mounted` is true only when at least one
`mcp__<serverName>__*` tool is registered in the composition; the answer also carries the entry tool and a
hint naming this page when nothing is registered. Then:

| Step | What you do | What you see |
| --- | --- | --- |
| 1 | Confirm the reading side works | `ecad_capabilities`, then `ecad_open` on one sheet — no bridge needed |
| 2 | Mount the bridge | the insert block in your profile patch, with the executable path |
| 3 | Restart the session | the `mcp__ocs__*` tools register; `mcp__ocs__ocs_sessions` is the entry point |
| 4 | Ask AryaCAD what is open | `mcp__ocs__ocs_sessions` enumerates the live editors; `launch_if_none` starts one, which is AryaCAD's decision to offer, not a side effect of a read |

AryaCAD's own documentation is the authority for its tool surface:
`docs/automation/MCP-FOR-AGENTS.md` and `docs/automation/native.md` in that product's tree. The MCP server
is a client of the desktop editor, not a headless engine — `ocs_sessions` enumerates editors, and a
drawing is open in exactly one of them.

## What it does

AryaCAD exposes four facades and 17 intent tools. A session uses the intent tools first and reaches for
the facades when it needs one precise operation.

| Facade | What it is for |
| --- | --- |
| `ocs_sessions` | enumerate live editors; option to launch one when none is open |
| `ocs_read` | one `op` from a 30-value enum — `state`, `capabilities`, `query`, `entities`, `records`, `layers`, `measure`, `audit`, `text_search`, `electrical`, and the rest |
| `ocs_execute` | one request envelope, or a sequential batch |
| `ocs_capture` | a bounded PNG of the viewport or the window |

| Intent tools | What they are for |
| --- | --- |
| `ocs_inspect`, `ocs_query`, `ocs_find_text`, `ocs_measure` | read the drawing: state, entities, text, distances |
| `ocs_audit`, `ocs_commands`, `ocs_electrical`, `ocs_render` | audit, list commands, electrical data (netlist, wire list, BOM), render |
| `ocs_new`, `ocs_open`, `ocs_save`, `ocs_save_verified` | file lifecycle |
| `ocs_run`, `ocs_select`, `ocs_cancel`, `ocs_undo`, `ocs_redo` | the editing operations |

The destructive-flagged tools are `ocs_run`, `ocs_save`, `ocs_save_verified`, `ocs_cancel`, `ocs_undo` and
`ocs_redo`. A session treats them as writes, and saves the copy first.

### The sequence that proves a change

1. `ecad_backup` copies the drawings into the backup tree before anything is edited — this is the baseline
   the last step compares against.
2. `mcp__ocs__ocs_sessions` runs first. One editor holds a drawing at a time, and the automation lock
   prevents a second writer.
3. The edit runs in AryaCAD: `ocs_open`, then the narrowest intent tool that does the job, or
   `ocs_execute` with a single envelope. The caller generates the `request_id`, and reuses it only to retry
   an identical request after a timeout.
4. `ocs_save_verified` takes an absolute path: it saves, reopens, hashes and compares a semantic manifest.
   That is AryaCAD's own proof that the file is what it says.
5. `ecad_open` with `reload: true`, then `ecad_compare` against the backup copy. That is this bundle's
   gate, and the report names what was measured and what could not be compared.

Step 5 is the one that matters. AryaCAD's save verification proves the application wrote what it intended;
`ecad_compare` proves the drawing this row reads has the change it should and nothing else — a different
claim, measured from the file rather than from the writer.

### Plotting a PDF

Plotting goes through the bridge: `ocs_execute` with `op: "plot"` takes the output path, layout, paper
size, fit and centring. The interactive `EXPORTPDF` command is GUI-only, so a headless session uses the
plot operation. The drawing pane's own **Print** is the local route and hands the sheet to the host print
dialog — no vendor application involved.

## Limits

- The live acceptance path — a dev host with the overlay mounted, a real print, `ecad_backup` → bridge plot
  → `ecad_compare` and a PDF in the document preview — is **not run**. The bridge's own reports are
  unverified against a licensed AryaCAD on this host.
- `mounted: false` is ambiguous by design: no bridge configured, a bridge still discovering, and a bridge
  that failed to start all read the same. The hint says so rather than guessing.
- The row never starts the CAD application. If no editor is open, `ocs_sessions` with `launch_if_none`
  decides whether to start one; the `ecad` row will not.
- AryaCAD is GPL-3.0. No fixture, sample or template from it is vendored here, so its drawings are read
  from an installation the session has access to, not from this repository.
- The two tool surfaces do not share a model. This row reads a file; AryaCAD holds a live editor. A change
  made in the editor is invisible to the reading tools until it is saved and re-read with
  `ecad_open {reload: true}`.
- A DWG published by AryaCAD is subject to the same converter limits as any other DWG — see the
  [ECAD page](README.md#limits).

## Safety

| Path | What it writes | What it needs |
| --- | --- | --- |
| `ecad_backup` | a byte-for-byte copy under `backups/ecad/<set>/<UTC stamp>/` with a SHA-256 manifest, verified by re-reading every file | the `writes` switch |
| Bridge edit tools (`ocs_run`, `ocs_save`, `ocs_save_verified`, `ocs_undo`, `ocs_cancel`, `ocs_redo`) | the drawing the editor holds, and then the file on disk | the bridge mounted; AryaCAD's own policy for a destructive command; a backup taken first |
| `ecad_compare` | nothing | — |

The safe order is backup, edit, save verified, compare. A session that skips the backup has no baseline,
and a session that skips the compare has only the writer's word for it.

## Where to go next

- [ECAD prints](README.md) — the read side: sheets, profile, checks, cross-reference, render and bundles.
- [Tool reference](../../reference/tools.md) — `ecad_capabilities` and the other `ecad_*` tools.
- [Architecture](../../architecture.md) — how a profile-level row differs from a row the bundle mounts.
- [Products](../README.md) — the other product pages.
