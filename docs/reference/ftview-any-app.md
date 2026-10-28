# Using the FTView toolset on any application

The tools are not tied to one project. Everything they read comes from the export
you open, and everything they write is checked against the vendor schema installed
on the host. This page lists what is generic, what varies per application, and what
to check before you promise a result.

## What is generic

- **The catalog.** `ftview_object_types` reads the open export: which of the 34
  drawable ME types occur, what attributes they actually carry, and example values.
  Nothing is stored per project.
- **Reading.** `ftview_open/list/get/find/check/compare` work on any Studio ME text
  export, whether its root is `<gfx>` (Studio export) or the older `<display>`.
- **Drafting.** Display creation, copy, object add/set/delete/order, tag upsert and
  the schema gate are driven by attributes and by `Gfx-ME*.xsd`, not by a project.
- **Import packaging.** `ftview_studio_import_prepare` takes display names and an
  export folder, writes `importType="create"` or `"update"`, and keeps the XML beside
  the batch file â€” the rule Studio enforces for every application.
- **Tag snapshots.** `ftview_tag_snapshot` reads the application's own SQL tag database
  (`TAG/<application>.MDF`) through local SQL Server Express and writes the same CSV the
  vendor wizard produces â€” no Studio, no wizard, and the database is only read.
  `ftview_studio_export_prepare`/`_accept` remain for hosts without local SQL tools.
- **Alarm snapshots.** `ftview_studio_export_prepare`/`_accept` name paths
  from the application's own store; nothing is hard-coded to an application name.
- **Live mapping.** `ftview_live_map` derives topic and PLC tag from the tag CSV
  columns; it does not assume a controller or topic name.

## What varies per application, and what to check

| Item | Check before you rely on it |
|---|---|
| Schema version | The draft writes ME17 attributes. An ME10â€“16 application declares a different `Gfx-ME17.xsd` (or `Gfx-ME14.xsd`, â€¦). `ftview_validate` reports the declared schema and every schema error; never apply on errors. |
| Tag CSV | The export only carries tags if you added a snapshot. `ftview_tag_snapshot` regenerates it from the application's tag database at any time; without it, tag upsert still writes rows but `ftview_live_map` has nothing to map. |
| Alarms | `Alarms.xml` is a Studio export, not application content. Missing means no alarm review, not a broken export. |
| Display names | A display is named by its file. Names that are invalid file names (slashes, reserved characters) cannot be created by the toolset; rename in Studio. |
| Display size and type | `ftview_draft_display_create` takes width, height and backColor - read an existing display or `displaySettings` first instead of assuming 1280x1024. |
| Image stems | `imageName` is the file stem without extension (`Equilateral triangle`, not `.bmp`). If the picture is absent from the application's `Images`, the object imports but renders blank. |
| Global objects | A placement of a `Header_Footer` object references the global file; the global itself must exist in the application. `linkBaseObject` syntax is `<GlobalFile>.<ObjectName>`. |
| Connection names | They differ by control: `Value` on numeric displays and buttons, `Indicator` on a `multistateIndicator`, `display` (attribute) on a `gotoButton`. The importer rejects the wrong name â€” the catalog shows what the export uses. |
| Locale | Displays, captions and schema are locale-neutral; Studio's UI language does not change the XML. |
| Host | Display export and display import need FactoryTalk View on Windows. Tag snapshots additionally need local SQL Server Express (`sqlcmd`); alarm snapshots run inside Studio. Reading, drafting and tag rendering work anywhere. |

## Workflow

1. `ftview_apps` -> `ftview_export` to a new folder (no Studio needed). Read `assets`; it
   says whether tags and alarms are `fresh`, `stale` or `missing`.
2. `ftview_open`, then `ftview_check` and `ftview_object_types all="true"` before
   designing, so names and attributes come from the application, not from memory.
3. Draft one operation per call, then `ftview_validate` - expect `schema.ran: true`
   and no error findings. The bounded `findings` list is deliberate: `by_rule` and
   `findings_total` still count everything.
4. `ftview_apply` to a new folder. Copy binary assets (`Images/`) yourself; apply
   writes text only.
5. Import needs Studio. `ftview_studio_import_prepare { export_root, displays, mode }`:
   `create` for a new display, `update` to complete or correct one that already
   exists. Run the Graphics Import Export Wizard (right-click Displays -> Import and
   Export) with that `BatchImport.xml`.
6. `ftview_verify_import` after the wizard: it re-exports the application and
   compares object by object with the draft. That is the only step that proves the
   import, and it works for any application.

## Known limits, stated once

- Apply writes text exports only; images and other binaries are not copied.
- Preserving layout means knowing the target display's `displaySettings`; the tools
  do not scale a design for you.
- The wizard steps themselves are manual (or computer-use), not a plugin call.
- Live values are read over EtherNet/IP and have not been verified against hardware
  in this workspace.

## What the installed product offers, and what it does not

- **Tag CSV is no longer wizard-only.** `ftview_tag_snapshot` attaches a copy of `TAG/<application>.MDF` to local SQL Server Express and renders `dbo.AllTagsView` with the wizard's exact rows, quoting and order (verified byte-identical on three applications). `DatabaseConverter.exe` stays as the fallback when no local SQL tools exist.
- **`MEExport.exe`** is the display/global export server used by `ftview_export`; its interfaces are `ExportApp`, `ExportSvr`, `ExportGraphics`, `GfxXmlExport` - no alarm export.
- **`GfxXmlImport.GfxImport`** and **`GfxXmlWizard.GraphicsXmlWizard`** are registered COM classes with `Initialize` / `ImportXML` / `LaunchWizard`. They require a live graphics server and project context (`pGfxServer`, `pFramework`, `pProjContext`) supplied by Studio; there is no registered class to create those outside Studio, so display import remains a Studio wizard step.
- **`METriggerEditor.exe`** is the Alarm Editor. It contains the alarm import/export implementation and writes an `<Alarms>` document, but it has no command line and exits when launched alone; it is hosted by Studio. The alarm wizard's strings live in `VSLevel2.dll`, an MFC extension module loaded into `VStudio.exe`, so the wizard only exists in-process - there is no standalone alarm exporter.
- **`M_Alarms/MachineAlarms.mal` is an OLE2 compound file, not a document.** It holds two streams: `Alarms` (record names, numeric ids, counts) and `ls00000409` (the same record skeleton carrying localized labels and message text). Records are a serialized object graph - `FF <len>` prefixed UTF-16 strings, `FF FE`/`FF 00` for absent or empty strings, trailing counts - with no published schema. Names and message text can be recovered, but the attribute fields (type, ack, severity, colours, flags) are indistinguishable from defaults in a single sample, so a decoder cannot be validated against the wizard's XML without a corpus of paired samples. Treat the `.mal` route as research, not a deliverable.
- **`ApplicationManagerServer.AppMgrServer`** is a 32-bit COM server with List/Backup/Restore/Copy/Rename. `ListLocalApps` answers, but `BackupLocal` fails on this host (`Class not registered` for app type `ME`, range error otherwise), so backup is reported as unverified rather than promised.
- **`ApplicationManager.exe`**, **`FactoryTalk View ME Application Documenter.exe`**, **`Icedbe.exe`**, **`LegacyTagDBConvertTool.exe`** are GUI tools with no documented command line; the Documenter can produce a human-readable report but not an importable XML export.
- **Display import and alarm export therefore need a running Studio.** `ftview_capabilities` reports that per host instead of leaving it to assumption.

