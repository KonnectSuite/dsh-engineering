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

Both export shapes are read: the Studio ME export (`<gfx>` displays, `Gfx-ME17.xsd`, a comma-delimited
`Tags/*.csv` with its header before the `###002` line and `;` comment rows) and the older
`<display>`-root files. Both export shapes are staged and validated: changes are applied to a re-parsed copy and the
changed displays are checked against the installed `Gfx-ME*.xsd` before anything is written.

## Backups

Every engineering product backs up into the same tree, so a backup means one place whichever surface
you are in:

```
<workspace>/backups/<product>/<subject>/<UTC stamp>/
    backup-manifest.json      every copied file: relative path + SHA-256
    <the copy>
```

FactoryTalk View is the `ftview` product: the copy is the whole export folder (display XML plus the tag
CSV), one stamp per backup. `ftview_apply` already writes a new folder, so this is a backup on request
("back up this export"). Build it as a copy plus `backup-manifest.json` listing every file's relative
path and SHA-256. `<workspace>/_backups` and `<workspace>/backups/<project>/…` are older layouts: never
write there, and leave what is there alone.

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
- `ftview_validate` applies the staged edits to a re-parsed copy, checks the changed displays against
  the installed `Gfx-ME*.xsd` and reports the changed files. `ftview_apply` refuses to write when the
  vendor schema rejects a document.
- `ftview_apply` writes a NEW export folder, plus `Displays/BatchImport_<app>.xml` and `IMPORT.md` so
  Studio's Batch Import has the exact list of changed displays. It never modifies the source.

## Authoring

Start from the application, not from a folder someone emailed:

1. `ftview_apps` lists the ME applications installed on this host.
2. `ftview_export` writes one to a NEW folder through the vendor export server. No Studio window is
   needed and the application is not modified. It also copies the alarm setup (`Alarms/Alarms.xml`) and
   the tag CSV (`Tags/<application>.csv`) from the Studio project store, and reports a `warning` for
   either when the stored file is older than the application database — say so rather than treating
   those tags or alarms as current.
3. `ftview_open` that folder, then author against it:
   - `ftview_draft_display_create` for a new display;
   - `ftview_draft_object_add` for one object (`text`, `panel`, `momentaryButton`, `numericDisplay`,
     `gotoButton`, …) with geometry, caption and tag connections;
   - `ftview_draft_object_set`, `ftview_draft_object_delete`, `ftview_draft_object_order` for existing
     objects.
4. `ftview_validate` must show `schema.ran: true` with no schema errors before you apply. `schema.ran:
   false` means the host has no Studio schema and validation did not run; say so instead of claiming
   validity.

## The object contract

Read the contract instead of guessing attribute names:

1. `ftview_object_types all="true"` returns the 33 drawable types, a per-type `guide` (required
   attributes, allowed children, a one-line note), what this export uses and what it does not.
2. `ftview_object_types type="momentaryButton"` returns the attributes this project actually writes on
   that type, with usage counts and example values. Copy those names and values.
3. `ftview_draft_object_add` refuses a type outside the contract and fills `left`, `top`, `width`,
   `height` when omitted. One object per call.

Rules the guide encodes:

- A button's face is `<states><state><caption>`; colours and captions live there, not in a bare
  `caption` attribute.
- Values come from `<connections><connection name="Value" expression="Tag"/>`; a numeric display also
  accepts `expression`.
- `shape="circle"` or `"ellipse"` draws a round lamp; `gotoButton` needs `display` for navigation.
- `image` takes `imageName` as the file stem with **no extension** (`Equilateral triangle`, not
  `Equilateral triangle.bmp`).

## Preview and fidelity

`ftview_live_map` reports which HMI tags are controller-backed (topic and PLC tag) and which are
memory; the preview's **Live** button reads those tags over EtherNet/IP, read-only. The preview loads
`Global Objects` and `Images` from the export, so reference objects and bitmaps render.

The preview is static: alarm banners/lists are placeholders, visibility animations evaluate but
colour/fill do not, and gradients/patterns/blink are approximated. State that when citing a capture.

## Import and verify

`ftview_apply` writes the folder, the manifest and `IMPORT.md`. Then:

1. A human opens the application in FactoryTalk View Studio and imports the displays listed in the
   manifest.
2. `ftview_verify_import` exports the application again and compares it object by object with the
   draft. `matched: true` for every display is the only proof the import landed; anything else lists
   the differing attributes and objects.
3. Creating the runtime application (`.mer`) and downloading it to the terminal remain Studio and
   ME Transfer Utility steps. No tool here creates a `.mer` or contacts a PanelView.

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
