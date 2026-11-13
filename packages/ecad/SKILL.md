---
name: ecad-review
description: Read, review and cross-reference electrical drawings in DXF and DWG with stated coverage, view them in the drawing pane, and write review or backup bundles; authoring belongs to AryaCAD Electrical, which ecad_capabilities reports as mounted or not.
whenToUse: When the user works with electrical prints (DXF and DWG drawings, panel layouts, schematics, title blocks, device tags, wire numbers) and wants them read, checked, viewed, exported, compared or turned into a review bundle.
---

# ECAD drawings (DXF and DWG)

An electrical print is evidence: the drawing says what it says, and every answer names what this
engine could not see. This row reads, reviews, views and exports. **Authoring lives in AryaCAD
Electrical**, the owner's CAD application, reached through its own MCP bridge — so a change is
something you hand over, then read back here, not something you draw in this pane.

## Order of operations

1. Run `ecad_capabilities` first. It says whether the engine is available, what the limits are,
   whether deliverable writes are on, and — in its `cad` section — whether the AryaCAD Electrical
   bridge is mounted in this composition and under which entry tool. Treat that section as the
   authority on whether authoring and plotting can be promised at all.
2. Run `ecad_profile` with `action: "infer"` on the drawing set (or read the saved profile). The
   profile is the set's own convention: title-block layer and labels, wire/tag/xref layers, device-tag
   and wire-label formats. Inference reports evidence and a confidence; **confirm the important
   conventions with the user before checks or cross-reference rely on them**, and save the confirmed
   profile so later sessions do not guess again.
3. Run `ecad_scan` to index the workspace queue of prints: sheet numbers, title blocks, entity and
   unsupported counts, and the index sheet if the set has one. Then `ecad_open` the sheet you are
   asked about, and `ecad_overview` before answering structural questions.
4. Answer with `ecad_find`, `ecad_cross_reference`, `ecad_checks`, `ecad_compare` and `ecad_render`.

## Reading a print honestly

- `ecad_overview` names the entity types it could not draw and the geometry it approximated. Repeat
  that coverage when the answer depends on those shapes; a plate with proxy entities is not fully
  described by this engine.
- Cross-reference rows are **candidates**, not electrical truth: exploded symbols mean a device tag
  is text matched by format, so a duplicate row is a question to ask, not a fault to report.
  `ecad_checks` findings carry rule ids and evidence; a clean result proves only that the rules ran.
- `ecad_render` writes an image a person can look at. Use it for review, not as proof of runtime
  behaviour or of the vendor application's own view.

## Viewing and exporting

- A `.dxf` or `.dwg` opened from the file manager renders in the drawing pane: drag to pan, wheel to
  zoom, `+`/`−`/`0` and the arrow keys, a layer panel to hide and show, and a text search that
  highlights matches on the sheet. The pane is read-only by design; it says so.
- The pane exports what it is showing: **Print** hands the sheet to the host's print dialog, which is
  how a PDF is produced, and **SVG** / **PNG** write the current sheet to a file. Quote the name of
  the file that was written.
- `ecad_render` is the tool version of the same thing when the answer should be a file rather than a
  pane, and it states its own coverage.

## Editing belongs to AryaCAD Electrical

- When the user wants the drawing changed, say where the change happens: AryaCAD Electrical, through
  its MCP tools. `ecad_capabilities` names the entry tool; start there and read its capabilities
  before promising a plot, a netlist or an edit. A bridge that is configured but still discovering
  tools also reads as not mounted, so confirm with the entry tool rather than concluding.
- This row never starts the CAD application and never ships it: it is a program the owner installs and
  configures in their own profile.
- After the edit lands in the workspace, reload the sheet here (`ecad_open` with `reload: true`) and
  prove the change with `ecad_compare` against the previous file. Report what the comparison measured,
  including anything it could not compare.
- Do not hand-edit DXF text to imitate a CAD edit. If no bridge is mounted, say that authoring is
  unavailable in this composition and offer the review bundle instead.

## Deliverables

- `ecad_document` writes the handover bundle: sheet index, title blocks, cross-reference, findings and
  per-sheet renders. It names its own new output folder and never touches the source drawings.
- `ecad_backup` copies source drawings into the shared backup tree. Offer it before any change the
  user makes in the CAD application, so the before-state is kept.

## Safety boundaries

- **Never overwrite.** This row writes bundles and backups into new paths; the source drawings stay as
  the user left them.
- **Confirm the profile.** Guessed conventions that drive checks or cross-reference are the fastest way
  to a confident wrong answer.
- **DWG goes through the embedded converter.** A `.dwg` is converted (acadrust, WASM) before the same
  engine reads it. Quote the conversion provenance and any warnings: substituted fonts, dropped proxy
  objects, ACIS bodies and xrefs are unmeasured and must be reported as such.
- **Coverage is stated.** Every render, cross-reference row and check result names what it cannot
  establish. Review findings are evidence for a person, not a release certificate.
