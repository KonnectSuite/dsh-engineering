---
name: ecad-drafting
description: Read, review, cross-reference and redline electrical drawings in DXF and DWG, with every written file verified against the staged edit and the source never overwritten.
whenToUse: When the user works with electrical prints (DXF and DWG drawings, panel layouts, schematics, title blocks, device tags, wire numbers) and wants them read, checked, annotated, edited or turned into a review bundle.
---

# ECAD drawings (DXF and DWG)

An electrical print is evidence: the drawing says what it says, and a change is only accepted once
the written file reads back as the change that was staged. Work in four steps — probe, profile, read,
prove — and never describe a written file as a faithful round-trip you did not measure.

## Order of operations

1. Run `ecad_capabilities` first. It says whether the engine is available, what the limits are, and
   whether writes are on. If writes are off, review is still possible; do not promise an edit.
2. Run `ecad_profile` with `action: "infer"` on the drawing set (or read the saved profile). The
   profile is the set's own convention: title-block layer and labels, wire/tag/xref layers, device-tag
   and wire-label formats. Inference reports evidence and a confidence; **confirm the important
   conventions with the user before checks or cross-reference rely on them**, and save the confirmed
   profile so later sessions do not guess again.
3. Run `ecad_scan` to index the workspace queue of prints: sheet numbers, title blocks, entity and
   unsupported counts, and the index sheet if the set has one. Then `ecad_open` the sheet you are
   asked about, and `ecad_overview` before answering structural questions.
4. Answer read-only questions with `ecad_find`, `ecad_cross_reference`, `ecad_checks`,
   `ecad_compare` and `ecad_render`. Only then consider a draft.

## Reading a print honestly

- `ecad_overview` names the entity types it could not draw and the geometry it approximated. Repeat
  that coverage when the answer depends on those shapes; a plate with proxy entities is not fully
  described by this engine.
- Cross-reference rows are **candidates**, not electrical truth: exploded symbols mean a device tag
  is text matched by format, so a duplicate row is a question to ask, not a fault to report.
  `ecad_checks` findings carry rule ids and evidence; a clean result proves only that the rules ran.
- `ecad_render` writes an image a person can look at. Use it for review, not as proof of runtime
  behaviour or of the vendor application's own view.

## Drafting a change

1. Stage the edit with `ecad_draft_ops` against the open sheet: annotations first (text, leader,
   revision cloud, rectangle), then attribute/title-block values, layer changes, move, rotate,
   erase, and a library block insert only when the block exists in the drawing.
2. Read the validation result. A rejected operation is not applied; fix it, do not force it.
3. Apply with `ecad_draft_apply` to a **new** file. The source is never overwritten. The result
   carries the written path and a verification: expected versus applied changes, geometry the writer
   dropped (proxy/custom objects), and any problem that keeps the write unproven. Quote the dropped
   entities instead of hiding them, and never call the output "the same drawing".
4. Run `ecad_verify` when a change must be proven separately, and `ecad_compare` when the user asks
   what changed between two versions. `ecad_draft_discard` abandons a staged draft without writing.
5. Only after a verified write, offer `ecad_document` for the handover bundle (sheet index, title
   blocks, cross-reference, findings, per-sheet renders) and `ecad_backup` when the user wants the
   source copied into the shared backup tree.

## Safety boundaries

- **Never overwrite.** Reject the urge to edit the source path; every apply names a new file.
- **Redline first for customer prints.** When the user wants a marked-up print rather than a modified
  drawing, stage annotations only and leave the geometry untouched — a rewrite through the MIT DXF
  writer is a new drawing, not the customer's file.
- **Confirm the profile.** Guessed conventions that drive checks or cross-reference are the fastest
  way to a confident wrong answer.
- **DWG goes through the embedded converter.** A `.dwg` is converted (acadrust, WASM) before the same
  engine reads it and converted back on apply; quote the conversion provenance and any warnings. A DWG
  write renumbers anonymous blocks, so verification compares geometry and text, not byte identity; proxy
  objects, ACIS bodies and xrefs in a DWG are unmeasured and must be reported as such.
- **Coverage is stated.** Every render, cross-reference row and check result names what it cannot
  establish. Review findings are evidence for a person, not a release certificate.
