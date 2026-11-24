# Export and import handoff: display XML, BatchImport and what actually proves the import

<!-- section: Handoff; identifiers: BatchImport, importType, importFile, importFolder, display XML, UTF-8, ME Import Wizard, XML export folder -->

The editable handoff between this bundle and FactoryTalk View Studio is the
**display XML export**: one XML file per graphic display, plus a batch file that
lists them for the ME Import Wizard. Everything else about the application — the
tag database, alarms, recipes, security, project settings — is not in that export
and must not be inferred from it.

## What a display export contains

A complete export of an application writes a folder tree like this:

    Displays/
      <Display Name>.xml            one file per graphic display
      BatchImport_<Application>.xml lists the display files for a batch import

The measured export on the authoring host, for one ME application:

- **303 files** in the export folder
- **23,140,746 bytes** total
- **65 displays**, one XML file each
- **8 global object displays** exported as well

Those figures are a shape check, not a constant: an export folder for another
application has different numbers. They are useful because they say what "one
application" looks like at this scale — dozens of display files, not five, and a
batch file among them.

The batch file itself is ordinary XML:

```xml
<gfxImport importFolder="">
  <import importFile="Line Overview.xml" importType="" display="" />
  <import importFile="Alarm Summary.xml" importType="update" display="[ALARM]" />
</gfxImport>
```

- `importFile` is required and must be a file name without a path: the file is
  looked up in the batch file's own folder (or in `importFolder` when that is set).
- `importFolder` is optional. Set it only when the display files live somewhere
  other than beside the batch file; it can be an absolute path such as
  `C:\Imports`.
- `importType` is optional. `create` or `update` overrides the import mode chosen
  in the wizard dialog, per file.
- `display` is optional. A display name targets that display; `*` means all
  displays in the file; omitted means "use the display object's own name".

## Two import modes, never both at once

The ME Import Wizard and the Batch Import dialog offer:

- **Create new objects** — the imported objects are added as new objects.
- **Update existing objects** — objects already in the target display are updated
  in place.

One import does one of the two. A batch file that mixes intent can only express
the difference through the per-file `importType`. Import cannot run while the
target display is open in the editor, and cancelling an import keeps the objects
that were already imported — cancel is not a rollback.

A single display can also be imported from its XML file directly: choose the file,
then the target display, then the mode. The same restraints apply. Non-English
characters must be saved as UTF-8 before import; a file saved in a legacy code
page will show mangled text or fail to import.

## Device limits that silently drop displays

Batch import onto a PanelView Plus 7 Standard target is limited to **100 displays**;
a PanelView Plus 6 Compact target is limited to **25 displays**. Displays beyond the
limit are not imported and the dialog does not fail the whole batch. When a
terminal shows fewer displays than the export contains, check the target limits
before re-importing: the missing files were skipped, not lost.

## The loop that proves an import landed

Export, edit, import is only a proposal until it is verified:

1. **Stage** the change in a new export folder. Never edit the only copy of an
   export; the application's `Gfx` files and the export are separate things.
2. **Import** the batch file or the single display XML in Studio.
3. **Re-export** the affected displays to a second folder and compare the XML with
   what was imported. A changed object graph that survived the round trip is the
   first real evidence.
4. **Create the runtime file** (see `runtime-and-transfer`) and read the validation
   report. Unsupported features and unresolved references appear there.
5. **Download and exercise** the display on the target terminal, or on a test
   terminal with the same ME Station version. A display XML cannot prove runtime
   behavior.

Do not report an import as successful because Studio did not show an error dialog.
The error list lives in FactoryTalk Diagnostics and in the validation report, and
both are easy to miss when running from a batch.

## The Add Component Tool writes its log late

`SEAddComponent.exe <application> ME / "<component list>" overwrite` is the
scriptable path: it reads the component list XML, imports each file and writes
`$AddComponent.txt` beside that list — the file that names a refused component and
the engine's reason on the following line.

Measured on this build: the process returned exit code 0 before the log file
appeared, so a reader that opens `$AddComponent.txt` the moment the process exits
finds nothing even when the import succeeded. Wait for the file to appear, then read
it. When it never appears, export the affected display and compare that instead of
treating a missing log as either success or failure.

## What the export/import path cannot prove

The XML export is a projection of one display, not a complete application. It
cannot prove:

- that the tag database contains every tag the displays reference — the tag CSV or
  tag snapshot is the second source;
- that alarms, recipes, security or project settings are correct, because none of
  those are in the display XML;
- that the file is valid against the installed `Gfx-ME*.xsd` schema unless a
  validation step actually ran against that schema;
- that a controller will accept the writes, or that the display behaves as intended
  at runtime.

`what-xml-cannot-prove` is the page to cite when a report needs that boundary
stated.
