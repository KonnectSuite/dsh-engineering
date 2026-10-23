---
name: factorytalk-view
description: Design and support FactoryTalk View ME and PanelView Plus applications from documented text exports: displays, HMI tags, structural checks and export comparison.
whenToUse: Use when the user asks about FactoryTalk View ME, PanelView Plus, ME display exports, HMI tags, or comparing ME exports. Route FactoryTalk View SE and Optix to their own surfaces.
---

# FactoryTalk View ME engineering

## Boundary

This surface reads and stages changes to documented text exports: display XML and the HMI tag CSV.
A staged edit is written to a NEW export folder; the source is never modified. The Studio entry plans
a manual import for a human; it does not drive Studio, contact a terminal, or decode MER or MED
databases.

## Start

1. Call `ftview_open` with the export folder. Keep the returned `view_id`.
2. Later calls may omit `view_id` when exactly one export is open.
3. Ask only for the exports the task needs: display XML for display work, the tag CSV for tag work,
   L5X only when PLC binding matters.

## Inspect

- `ftview_list` enumerates displays or tags, with a name filter and paging.
- `ftview_get` reads one display (its named objects) or one tag row.
- `ftview_find` searches displays, object names, object attribute values and tags.

## Check and compare

- `ftview_check` reports structural findings: tag CSV integrity, duplicate display/object/tag names,
  and files that did not parse. It is not vendor schema validation and says nothing about PLC
  binding.
- `ftview_compare` compares two opened exports by display name, tag name and file hash.

## Editing

The `ftview-edit` entry stages changes; it may be disabled in this profile. If a draft tool is
unavailable, say editing is not enabled here rather than trying another tool.

- `ftview_draft_display_set` stages one attribute change on a display or one of its named objects.
- `ftview_draft_display_add` stages a new display by copying an existing display file.
- `ftview_draft_tag_upsert` stages one HMI tag description/type change or a new tag row.
- One operation per call. Each returns the draft id and the operation count; nothing is written yet.
- `ftview_validate` applies the staged edits to a re-parsed copy and reports the changed files.
- `ftview_apply` writes a NEW export folder. It never modifies the source.

After applying, reopen the written folder with `ftview_open` and compare it with the source using
`ftview_compare`.

## Studio

The `ftview-studio` entry plans a manual import; it may be disabled.

- `ftview_studio_status` discovers installed ME tooling, schemas and help files.
- `ftview_studio_preflight` checks the files that differ between two exports for Studio import
  problems, including name restrictions.
- `ftview_studio_handoff` returns the ordered manual import plan for a human in FactoryTalk View
  Studio. No vendor utility runs and no file is written.

## Reporting

- Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
  completeness.
- State what the export cannot prove: XSD validity, PLC binding, runtime behavior, visual rendering,
  and anything absent from the supplied export.
- Quote the display file and object name for a finding.
- Do not call a tag unused from the absence of references in displays; other consumers are invisible
  here.

## Out of scope

FactoryTalk View SE and FactoryTalk Optix are different products and are not analyzed here. MER/MED
databases are not decoded, and no tool contacts a PanelView terminal or changes runtime data.
