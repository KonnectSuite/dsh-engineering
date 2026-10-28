---
name: factorytalk-view
description: Design and support FactoryTalk View ME and PanelView Plus applications from documented text exports: displays, HMI tags, structural checks and export comparison.
whenToUse: Use when the user asks about FactoryTalk View ME, PanelView Plus, ME display exports, HMI tags, or comparing ME exports. Route FactoryTalk View SE and Optix to their own surfaces.
---

# FactoryTalk View ME engineering

## Boundary

This surface reads and stages changes to documented text exports: display XML and the HMI tag CSV.
A staged edit is written to a NEW export folder; the source is never modified. The Studio entry plans
a manual import; it does not drive Studio, contact a terminal, or decode MER/MED databases.

Both export shapes are read: the Studio ME export (`<gfx>` displays and `Tags/*.csv`) and the older
`<display>`-root files. Staged changes are re-parsed and checked against the installed `Gfx-ME*.xsd`.

## Backups

Backups go into one shared tree:

```
<workspace>/backups/<product>/<subject>/<UTC stamp>/
    backup-manifest.json      every copied file: relative path + SHA-256
    <the copy>
```

FactoryTalk View is the `ftview` product: copy the whole export folder plus `backup-manifest.json`
(relative path and SHA-256 per file), one stamp per backup. `ftview_apply` already writes a new folder,
so this is a backup on request. Never write to `<workspace>/_backups` or `backups/<project>/…`; those
are older layouts.

## Start

1. Call `ftview_open` with the export folder. Keep the returned `view_id`.
2. Later calls may omit `view_id` when exactly one export is open.
3. Ask only for the exports the task needs: display XML, the tag CSV, or L5X for PLC binding.

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
- `ftview_studio_import_prepare` packages chosen displays for Studio's Graphics Import Export Wizard
  (right-click Displays > Import and Export), then you import and open them in Studio.

## Authoring

Start from the installed application:

1. `ftview_apps` lists the ME applications installed on this host.
2. `ftview_export` writes one to a NEW folder through the vendor export server. Studio need not be
   open; the application is not modified. Add tags with `ftview_tag_snapshot`, and pass `export_root`
   to `ftview_studio_export_prepare` for an alarm snapshot.
3. `ftview_open` that folder, then author against it:
   - `ftview_draft_display_create` for a new display;
   - `ftview_draft_object_add` for one object (`text`, `panel`, `momentaryButton`, `numericDisplay`,
     `gotoButton`, …) with `states_json` faces, `animations_json` and connections;
   - `ftview_draft_object_set`, `ftview_draft_object_delete`, `ftview_draft_object_order` for existing
     objects.
4. `ftview_validate` must show `schema.ran: true` with no schema errors before you apply. `schema.ran:
   false` means the host has no Studio schema and validation did not run; say so instead of claiming
   validity.

## The object contract

Read the contract instead of guessing:

1. `ftview_object_types all="true"` returns the 34 drawable types, a per-type `guide` (required
   attributes, children, one note) and what this export uses.
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

`ftview_live_map` reports which HMI tags are controller-backed and which are
memory; the preview's **Live** button reads those tags over EtherNet/IP, read-only. The preview loads
`Global Objects` and `Images`, so references and bitmaps render.

The preview is static: alarm banners are placeholders, visibility evaluates, colour/fill do not, and
gradients/blink are approximate. Say so when citing a capture.## Tags and alarms

The export has displays and global objects only. For tags, call
`ftview_tag_snapshot { application, output? }`: it attaches a copy of `TAG/<application>.MDF` to the
local SQL Server Express, reads `dbo.AllTagsView` and writes the same rows, quoting and order as the
vendor wizard — no Studio, no wizard, and the application database is never written. Then
`ftview_studio_export_accept` validates or copies it into the export. Without local SQL tools, fall
back to `ftview_studio_export_prepare` (standalone DatabaseConverter).

Alarms still run inside Studio: `ftview_studio_export_prepare { application, kind: "alarms", export_root }`
has the wizard write `Alarms/Alarms.xml` into the export folder, so Studio must be open. Export,
authoring, validation, apply and verification need no Studio.
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
- `ftview_studio_preflight` checks the files that differ between two exports for import problems,
  including name restrictions.
- `ftview_studio_handoff` returns the ordered manual import plan. Nothing is written.

## Reporting

- Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
  completeness.
- State what the export cannot prove: XSD validity, PLC binding, runtime behavior, visual rendering,
  and anything absent from the supplied export.
- Quote the display file and object name.
- Do not call a tag unused because displays never reference it; other consumers are invisible here.

## Out of scope

FactoryTalk View SE and FactoryTalk Optix are different products and are not analyzed here. MER/MED
databases are not decoded and no tool contacts a PanelView or changes runtime data.
