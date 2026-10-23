---
name: factorytalk-view
description: Design and support FactoryTalk View ME and PanelView Plus applications from documented text exports: displays, HMI tags, structural checks and export comparison.
whenToUse: Use when the user asks about FactoryTalk View ME, PanelView Plus, ME display exports, HMI tags, or comparing ME exports. Route FactoryTalk View SE and Optix to their own surfaces.
---

# FactoryTalk View ME engineering

## Boundary

This surface reads documented text exports: display XML and the HMI tag CSV. It does not decode MER or MED databases, contact a terminal, change files, or drive Studio. If the user asks for an edit or a Studio operation, say that half is not enabled here.

## Start

1. Call `ftview_open` with the export folder. Keep the returned `view_id`.
2. Later calls may omit `view_id` when exactly one export is open.
3. Ask only for the exports the task needs: display XML for display work, the tag CSV for tag work, L5X only when PLC binding matters.

## Inspect

- `ftview_list` enumerates displays or tags, with a name filter and paging.
- `ftview_get` reads one display (its named objects) or one tag row.
- `ftview_find` searches displays, object names, object attribute values and tags.

## Check and compare

- `ftview_check` reports structural findings: tag CSV integrity, duplicate display/object/tag names, and files that did not parse. It is not vendor schema validation and says nothing about PLC binding.
- `ftview_compare` compares two opened exports by display name, tag name and file hash.

## Reporting

- Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming completeness.
- State what the export cannot prove: XSD validity, PLC binding, runtime behavior, visual rendering, and anything absent from the supplied export.
- Quote the display file and object name for a finding.
- Do not call a tag unused from the absence of references in displays; other consumers are invisible here.

## Out of scope

Changes, Studio apply and verification against a fresh Studio export belong to an editing entry that is not part of this surface yet. FactoryTalk View SE and FactoryTalk Optix are different products and are not analyzed here.
