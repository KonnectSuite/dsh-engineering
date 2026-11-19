# ECAD prints

`@aryacode/dsh-engineering` ships 12 tools that read electrical drawings — DXF natively, DWG through an
embedded converter — and return what a review needs: the sheet set, title blocks, the drawing convention
profile, cross-reference candidates, findings, a read-only drawing pane, and documentation or backup
bundles.

This row reads and renders only. Drawing authoring belongs to AryaCAD Electrical, which runs in its own
application and reaches the session through its own MCP row; the bundle never ships, installs or starts
it. The component is a beta product and it ships **off**; turn it on from the Plugins page before the
first call.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `ecad` — *ECAD electrical prints* |
| Capability class | `offline-file` (it reads drawing files from the workspace) |
| Stability | beta, since `v0.86.0` |
| Default | off — `writes` is off until it is switched on |
| Tools | 12 in the `ecad_` namespace — 10 read, 2 deliverables |
| Package / entry | `packages/ecad` → `entries/ecad.js` |
| Skill | `ecad-review` (`packages/ecad/SKILL.md`, 8,000-character budget) |
| Probe | `ecad_capabilities` |
| Evidence gate | `ecad_compare` — a claim about a drawing is checked against a second version of it |
| Switches | `writes`, `bridgeServerName`, `maxFiles`, `maxFileBytes`, `maxEntities` |

The row is deliberately narrow. It parses the drawing, builds a render model, and answers questions about
structure: which sheets exist, what the title block says, which device tags appear where, which
cross-references do not resolve, what changed between two versions. It does not edit geometry. Anything
that would change the drawing is a handoff to [AryaCAD Electrical](aryacad-bridge.md).

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| Nothing, for reading | — | every read, check, render and bundle tool: DXF is parsed directly, DWG through the bundled converter | no |
| AryaCAD Electrical | portable build (GPL-3.0) | authoring, geometry edits, plotting PDF, DXF/DWG publishing, netlist, wire list and BOM — none of it through this row | yes |
| The ECAD row switched on | — | any `ecad_*` tool; it ships off | no, once |

Two measured facts about the file types shape what to expect. First, the drawings this row is measured
against are AutoCAD Electrical IEC sheets (`AC1032`/`AC1027`, `ANSI_1252`, no proxy or custom objects, no
xrefs), with symbols largely exploded, so a device tag is text rather than a block attribute. Second, the
`WD_M` block that carries the ACADE layer conventions is present on every sheet of that set, which is why
`ecad_profile {action: "infer"}` can reach a confidence of 0.95 without asking.

The recorded verification is AryaCAD Electrical's own sample and template drawings read out of tree, and
the read face driven in headless Chrome with zero page errors. A real DWG is verified only in a Dev pass,
and the 34-sheet write-and-re-read round trip is not run in this pass.

## First session

Ask what the surface can do before scanning anything, because the answer reports whether DWG conversion
and the AryaCAD bridge are available on this host, and whether writes are on.

```json
{ "action": "read" }
```

Call `ecad_capabilities` with that shape (no parameters) first. Then:

| Step | Call | What you see |
| --- | --- | --- |
| 1. Scan | `ecad_scan` | a walk of the workspace, bounded by depth and count, writing `.ecad/index.json` with a summary per sheet — title block, layers, entity and unsupported counts, the set it belongs to, and anything skipped, including formats that could not be converted |
| 2. Orient | `ecad_overview` | with no path, the indexed set: counts, sets, per-sheet rows and anomalies such as a missing title block or a duplicate sheet number, without re-parsing anything |
| 3. Learn the convention | `ecad_profile {action: "infer"}` | title-block layer and labels, wire/tag/xref/loc layers, device-tag, wire-label and sheet-reference patterns, each measured with evidence and confidence; `save` writes `.ecad/profile.json` only when `confirm: true` |
| 4. Open one sheet | `ecad_open {path}` | layouts, entity and unsupported counts, approximation count, title-block fields with their sources and confidence, and the preview path the drawing pane reads |
| 5. Review | `ecad_checks` | findings with a stable rule id, severity and evidence, ending with the `ECAD-SCOPE` note that says what the checks do not prove |
| 6. Cross-reference | `ecad_cross_reference` | candidate rows (device tags on several sheets, wire labels within a sheet, sheet references) with a status — ok, duplicate, one-sided, unresolved — a confidence and a note; candidates, not electrical truth |
| 7. Look | `ecad_render` | one layout as a static SVG under `.ecad/renders/`; the drawing pane renders the same model in the reader, with pan, zoom, layer filtering and text search |

`ecad_open` is also what the client face uses: the model it caches under `.ecad/previews` is what the
drawing pane draws, so opening a sheet in a session makes it viewable in the pane without a second parse.

## What it does

| Group | Tools | What it is for |
| --- | --- | --- |
| Ask and orient | `ecad_capabilities`, `ecad_profile`, `ecad_scan`, `ecad_overview` | what this host can do; the drawing convention; the workspace index; a summary of one drawing or the whole indexed set |
| Read one drawing | `ecad_open`, `ecad_find` | parse one DXF (or DWG), build the render model, detect the title block; search text and flattened attribute text, literally or by regex, optionally on one layer |
| Review | `ecad_cross_reference`, `ecad_checks`, `ecad_compare` | cross-reference candidates across a set; static rules over a set; a semantic comparison of two versions of a drawing |
| Draw | `ecad_render` | one layout as SVG, with what was drawn and what was approximated reported |
| Deliverables | `ecad_document`, `ecad_backup` | a documentation bundle (`README.md`, `sheets.csv`, `title-blocks.csv`, `cross-reference.csv`, `findings.csv`, `coverage.md`, `index.json`) in a new folder; a byte-for-byte backup with a SHA-256 manifest, verified by re-reading every copy |

Every result says what it could not establish. `ecad_checks` always ends with the `ECAD-SCOPE` note;
`ecad_render` reports the unsupported entities it skipped and the entities it approximated; `ecad_compare`
says when its row list is truncated.

## The measured set

The port measurements come from the owner's real print set — 34 DXF sheets, 25.2 MB, plus 33 DWG sheets
and one `.ACD`. They are the only figures this page can quote, and they describe that set, not a promise
about yours.

| Measurement | Result |
| --- | --- |
| Parse and round-trip (parser gate) | 34 of 34 sheets parsed, 0 round-trip model differences; 693 ms total parse, slowest 100 ms on the 6.4 MB sheet |
| Engine coverage on the set (26.4 MB) | 83,936 primitives, 1,756 approximated, 0 unsupported, 0 truncated |
| Title blocks | 34 of 34 number and title found, confidence 0.93–0.95; the index sheet listed 80 entries |
| Profile | confidence 0.95 from `TITLE_BLOCK`, the `WD_M` layer set and `TAGFMT`; 33 standard layers |
| Cross-reference candidates | 74 rows (33 device tags, 4 sheet refs, 37 wire labels); 1,132 pattern-only noise rows withheld |
| Checks | 97 findings, with 0 `TB-MISSING`, `SHEET-MISMATCH`, `LAYER-UNKNOWN` or `SHEET-REF-UNRESOLVED` |
| Render | 19.2 MB SVG in 143 ms |
| Round trip | 34 of 34 written and re-read with 0 added, removed or changed entities; `verifyWritten.ok` on every sheet (3.2 s) |

The entity mix on that set, useful for judging what a text-based check can reach: LINE 37,126 · LWPOLYLINE
8,961 · TEXT 6,690 · ARC 3,792 · ATTDEF 2,875 · CIRCLE 2,130 · INSERT 1,034 · SPLINE 971 · ELLIPSE 705 ·
HATCH 295 · POINT 275 · SOLID 171 · MTEXT 54 · VIEWPORT 34 · DIMENSION 23 · LEADER 1.

## Limits

- The row reads. It does not edit geometry, plot PDF or publish DXF/DWG — those are AryaCAD Electrical
  operations, and the [bridge page](aryacad-bridge.md) is how the two meet.
- Entities that cannot be represented are reported per sheet, not silently dropped. The 0 unsupported on
  the measured set is a property of that set, not of the parser.
- The pinned writer emits group 74 as a lock flag, so ATTRIB vertical justification is not carried;
  horizontal justification is.
- Hatch islands are filled rather than reconstructed as islands.
- The renderer assumes a planar drawing: OCS/extrusion normal, thickness and non-uniform insert scaling
  are not applied, and arcs inside non-uniformly scaled or mirrored blocks are marked approximated.
- An ASCII DXF without its `0/EOF` terminator is refused.
- DWG conversion is verified only in a Dev pass; the converter aborted intermittently on the full print set
  in another pass, so a DWG that fails to convert is a known risk, not a surprise.
- The 34-sheet write-and-re-read round trip is not run in this pass even though it passed earlier; do not
  quote it as a current guarantee.
- The cross-reference rows are text-pattern candidates. A duplicate device tag is a question to ask, not a
  proven defect.
- The drawing pane draws what the model reports; linetypes, hatch patterns and exact font metrics are not
  reproduced.

## Safety

| Path | What it writes | What it needs |
| --- | --- | --- |
| Read tools | nothing under the workspace except `.ecad/` state: `index.json`, `previews/`, `renders/`, and `profile.json` on a confirmed save | the row switched on |
| `ecad_document` | a new folder (default `.ecad/documentation/<UTC stamp>-ecad-docs`) | a new output path; a folder outside `.ecad/` requires the `writes` switch |
| `ecad_backup` | a byte-for-byte copy under `backups/ecad/<set>/<UTC stamp>/` with a SHA-256 manifest, verified by re-reading every file | the `writes` switch |

The source drawings are opened read-only in every path. A backup or documentation bundle never overwrites
an existing folder; the output path must not exist.

## Where to go next

- [The AryaCAD Electrical bridge](aryacad-bridge.md) — how authoring in that application reaches this row,
  and the sequence that proves a change.
- [Tool reference](../../reference/tools.md) — every `ecad_*` tool with its parameters.
- [Capabilities](../../capabilities.md) — the calls behind the measurements above.
- [Products](README.md) — the other product pages.
