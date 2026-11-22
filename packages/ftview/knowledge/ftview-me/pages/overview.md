# FactoryTalk View ME at a glance

<!-- section: Foundations; identifiers: application folder, FactoryTalk View ME, ME Station, HMI project, project settings, .med, .mer, PanelView Plus -->

FactoryTalk View Machine Edition (ME) is Rockwell Automation's panel HMI product. An
**application** is the unit you author, test and download: displays, an HMI tag
database, alarms, recipes, global objects, security accounts and project settings
all live inside one application folder. The same application is opened in
FactoryTalk View Studio (the authoring environment), compiled into a runtime file
with the `.mer` extension, and downloaded to a PanelView Plus or MobileView
terminal where **ME Station** runs it.

The bundle that ships this knowledge does not drive the Studio UI. It reads the
documented interchange formats that Studio and the ME tools produce:

- **Display XML** â€” one XML file per graphic display, written by the Graphics
  Import Export Wizard, with a `BatchImport_<application>.xml` file that lists the
  display files for a batch import.
- **HMI tag CSV** â€” the tag export from the Tags editor.
- **Project folders on disk** â€” the `.med` application folder, including the tag
  database files under `TAG` and the machine alarm file under `M_Alarms`.
- **Installed Help** â€” a structural index of the locally installed ME and SE Help
  (titles, TOC sections and relative help paths), so a question can be pointed at
  the page a Studio operator would open.

Two consequences follow, and they decide what this tool may claim:

1. **The export is the boundary.** A display XML file is a projection of the
   display that Studio stores in its own binary `.gfx` file. Whether Studio accepts
   a hand-edited file is only proven by importing it and re-exporting it; the file
   alone does not prove it is valid against the installed schema, that the tags it
   names exist in the controller, or that the display behaves as intended at
   runtime.
2. **Installed Help is a reading aid, not the project.** The Help index says which
   topic exists and where it lives (for example `me/help/meproj/import-an-application`
   for importing an application). Reading a topic requires the matching Help to be
   installed on this machine; without the install the index still answers "does this
   topic exist and what is it called", and the read action says the source is not
   installed instead of inventing text.

## Where the work happens

| Stage | Tool | What it produces |
|---|---|---|
| Author | FactoryTalk View Studio | `.med` application folder; `.gfx` displays, `.ggfx` global object displays |
| Exchange | Studio Import/Export wizards | display XML, `BatchImport_<application>.xml`, HMI tag CSV |
| Compile | Studio (Application > Create Runtime Application) | `.mer` runtime file plus `<application name>ValidationResults.txt` |
| Deliver | ME Transfer Utility | `.mer` copied to the terminal, optionally set to run at startup |
| Run | ME Station on the terminal | live displays, alarms, diagnostics |

A change made in an export folder is not a change in the application. The handoff
is: stage the file, import it in Studio, create the runtime file, download it with
the Transfer Utility, and then re-export or verify the display to prove the import
landed.

## What this collection contains

The authored pages cover the operator-facing parts of that loop:

- `project-workflow` â€” an application folder, the `.med` file, and the folders
  Studio creates beside it.
- `display-workflow` â€” graphic displays, display settings and how displays are
  stored versus exported.
- `global-objects` â€” global object displays (`*.ggfx`), base objects, reference
  objects and global object parameters.
- `tags` â€” the HMI tag database, tag types, folders, arrays and tag placeholders.
- `export-import` â€” the display XML and batch import handoff, `importType`,
  UTF-8 and the two import modes.
- `runtime-and-transfer` â€” creating `.mer` files, validation results and the ME
  Transfer Utility.
- `errors-and-fixes` â€” error codes and messages, plus the fixes that resolve them.
- `what-xml-cannot-prove` â€” the honest limits of reading an export folder.

The other two collections (`ftview-me-help`, `ftview-se-help`) index the installed
ME and SE Help by topic title, TOC section and relative path. Use `search` to find
a topic and `read` to open it when the install is present.
