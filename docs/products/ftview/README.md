# FactoryTalk View ME

`@aryacode/dsh-engineering` ships 52 tools that read a FactoryTalk View ME text export, check its
structure, compare two exports, author displays and HMI tags into a new export folder, render the screens
before anyone imports them, package the result for Studio's Graphics Import Export Wizard, and search the
authored FactoryTalk View corpus.

The component is a beta product: one ME application export is measured end to end, and the Studio import
and PanelView Plus runtime remain the engineer's steps, not the bundle's.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `ftview` — *FactoryTalk View ME* |
| Capability class | `offline-file` (it reads an export folder; Studio is used only for discovery, export and import) |
| Stability | beta, since `v0.4.4` |
| Tools | 52 in the `ftview_` namespace — 23 read, 25 edit, 3 Studio, 1 documentation |
| Package / entry | `packages/ftview` → `entries/ftview.js` and its edit and Studio rows |
| Skill | `factorytalk-view` (`packages/ftview/SKILL.md`, 9,500-character budget) |
| Probe | `ftview_capabilities` |
| Evidence gate | `ftview_verify_import` — an import claim is accepted only once a fresh export compares object by object with the draft |
| Switches | `edit`, `studio`, `maxFiles`, `maxDraftOperations`, `searchRoots` |

A FactoryTalk View ME application is stored as a binary `.med`; Studio exports it to text. This row reads
that text: one directory of `Displays/*.xml` display files, the HMI tag CSV when one was exported, and the
alarm XML when one was exported. It never decodes MER or MED, never contacts a PanelView Plus terminal,
and never launches Studio.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| FactoryTalk View Studio ME on Windows | — | `ftview_apps` (list installed applications), `ftview_export` (export one through the vendor export server), and the Graphics Import Export Wizard that imports an authored display | yes |
| An exported application folder | — | every read, check, draft, render and handover tool | no, once an export exists |
| SQL Server Express with `sqlcmd` | local instance | `ftview_tag_snapshot`, which reads the application's own `TAG/<application>.MDF` and writes the wizard-identical tag CSV | yes — `ftview_studio_export_prepare` and `ftview_studio_export_accept` are the wizard fallback |
| Gfx-ME schemas | installed with Studio | `ftview_validate` validates changed displays against the schema the export declares | yes, for drafting |
| Chrome or Edge | headless | PNG output from `ftview_render`; SVG is written without a browser | yes |

The recorded verification is one ME application export: a display authored with the draft tools and drawn
by the bundle's own renderer. Other ME versions, a second application, a PanelView Plus terminal and a
Studio import of an authored display are not measured.

Two facts shape a session. First, draft tools write **ME17** attributes; an application on ME10–16
declares a different `Gfx-ME*.xsd`, so `ftview_validate` reports the declared schema before it reports
findings, and a screen authored against the wrong schema is caught there rather than in Studio. Second,
the export only carries what Studio wrote: a tag CSV exists only if someone exported it, so bindings
cannot be checked against a tag database until `ftview_tag_snapshot` (or the wizard) produced one.

## First session

Start from an installed application when there is one, otherwise from an export folder. Both paths end at
`ftview_open`.

| Step | Call | What you see |
| --- | --- | --- |
| 1. Find it | `ftview_apps` | the ME applications installed on this host, through the vendor export server; `ftview_capabilities` says first whether Studio and the tag wizard are present |
| 2. Export it | `ftview_export {application, output_root}` | a new folder of display and global-object XML; the application itself is not modified, and any user-exported `Alarms.xml` or tag CSV found in the project store is copied along with its age reported as fresh, stale or missing |
| 3. Open it | `ftview_open {root}` | displays, tag rows, alarm setup files, Studio import manifests, structural diagnostics, and which checks could not run |
| 4. Check it | `ftview_check` | tag CSV integrity, duplicate names, unparsed files, `TAG_NOT_BOUND` (a connection names a tag the CSV does not declare), `IMAGE_MISSING` (artwork a display names but the export does not ship), and the alarm setup; `coverage` names every check that did not run |
| 5. Learn the dialect | `ftview_object_types {all: "true"}` | every object type drafting accepts, with its real attributes and example values — read this before authoring, because attribute names differ from the ones a screenshot suggests |
| 6. Look at the screens | `ftview_render` | one display or up to 8 as SVG (and PNG when a headless browser is installed), with every object that leaves the canvas or overflows its box reported |

A display in this export is a `<gfx>` document (older exports use `<display>`), and its connections carry
product-specific names: `Value` on a numeric display or button, `Indicator` on a multistate indicator, and
`display` on a goto button. `ftview_object_types` is the source for those names; the importer rejects the
wrong one.

## What it does

| Group | Tools | What it is for |
| --- | --- | --- |
| Read and navigate | `ftview_open`, `ftview_reload`, `ftview_list`, `ftview_get`, `ftview_find`, `ftview_compare`, `ftview_object_types`, `ftview_live_map` | open an export and keep the handle; list/read displays and tags; search names and text; compare two exports by display, tag field and object; map HMI tags to controller addresses |
| Review | `ftview_check`, `ftview_design_check`, `ftview_theme_audit`, `ftview_alarm_report`, `ftview_cross_reference` | structural checks; the shared HMI design rules (`VIEW-HPM-01/02`, `VIEW-COLOR-01`, `VIEW-NAV-01`); house-palette use per display; an alarm review with actionable findings; the HMI-to-PLC join, on its [own page](cross-reference.md) |
| Documentation | `ftview_docs` | `contents`, `search`, `read`, `status` and `lookup` over the authored corpus (workflow, tags, runtime, errors, what XML cannot prove) plus the installed ME and SE help indexes; installed-help pages are parsed from the local help at call time, never shipped |
| Snapshots and handover | `ftview_tag_snapshot`, `ftview_alarm_snapshot`, `ftview_studio_export_prepare`, `ftview_studio_export_accept`, `ftview_document`, `ftview_capabilities`, `ftview_apps`, `ftview_export` | write the wizard-identical tag CSV or alarm XML without the wizard; the wizard fallback when the database cannot be read; a handover bundle (`overview.md`, `displays.csv`, `tags.csv`, `bindings.csv`) for a reviewer who never opens Studio |
| Author | `ftview_draft_display_create`, `ftview_draft_display_add`, `ftview_draft_display_scaffold`, `ftview_draft_screen`, `ftview_draft_popup` | a new display, a copy of an existing one, the shared chrome, a whole screen from a card-and-navigation description, or a modal popup |
| Edit objects | `ftview_draft_object_add`, `ftview_draft_object_set`, `ftview_draft_object_delete`, `ftview_draft_object_order`, `ftview_draft_display_set`, `ftview_draft_display_attrs`, `ftview_bulk_set`, `ftview_draft_restyle` | add, change, remove or reorder objects; change display settings; the same change across every match in one call; repaint a display in the house theme |
| Edit tags and alarms | `ftview_draft_tag_upsert`, `ftview_draft_tags`, `ftview_draft_alarm_add`, `ftview_draft_alarm_set`, `ftview_draft_alarm_delete` | upsert one or many HMI tags; add, change or remove an alarm trigger with its message rows |
| Stage and prove | `ftview_draft_ops`, `ftview_draft_drop`, `ftview_draft_discard`, `ftview_validate`, `ftview_apply`, `ftview_render`, `ftview_verify_import` | inspect or drop a staged operation; schema-validate the draft without writing; write to a new folder; draw the result; prove the import landed |
| Studio handoff | `ftview_studio_status`, `ftview_studio_preflight`, `ftview_studio_handoff`, `ftview_studio_import_prepare`, `ftview_component_package` | discover installed ME tooling; check the changed files for a manual import; return the ordered import plan; write the `BatchImport.xml` package; package displays for the Add Component Tool |

The loop is draft → validate → check → render, and each step has one tool: `ftview_validate` proves the
operations resolve and the display passes the schema, `ftview_design_check` judges the geometry and
colour, `ftview_render` draws it. A draft that passes the first two can still read badly; the render is
where that shows.

## The imported side

`ftview_apply` writes a new export folder containing the edited displays and a verbatim copy of the other
text files. Studio's Graphics Import Export Wizard then imports it: right-click **Displays** in Studio,
choose **Import and Export**, point at the `BatchImport.xml` that `ftview_studio_import_prepare` wrote,
and pick create or update mode. `ftview_studio_handoff` returns that plan in order for the changed
displays.

Two consequences follow. Apply writes text only: binary assets under `Images/` are not rewritten, so when
a display gained artwork you copy it into the target application yourself. And the wizard's own report is
the import result; `ftview_verify_import` is what proves it, by re-exporting the application and
comparing the draft object by object.

For a PanelView Plus terminal the remaining steps are Studio's: build the runtime file and download it.
Nothing in this row does either, and the page for a Studio handoff says so rather than implying a
deployment.

## Limits

- `ftview_apply` writes text, not a `.mer`, and does not scale a display to the target terminal's
  `displaySettings`; a display authored at the wrong size imports at the wrong size.
- The import and the runtime build are Studio steps. The tools prepare and verify them; they do not
  perform them.
- The native `.med` and `.mer` are hashed, never decoded.
- `ftview_open` reads what the export ships. Without a tag CSV, `ftview_live_map` has nothing to map and
  `ftview_check` cannot report `TAG_NOT_BOUND`; without an `Alarms.xml`, the alarm checks do not run — a
  missing export is not a broken application.
- One ME export is measured. Other ME versions, a second application, a PanelView Plus terminal and a
  Studio import of an authored display are unmeasured.
- The alarm decoder reads 34 of the 66 applications on the host this was measured on, and falls back to
  the wizard snapshot for the rest (stream versions 13 and 14, and a variant record layout), with the
  reason written into the export warnings. Tag decoding succeeds on 64 of the 66.
- `ApplicationManagerServer` answers `ListLocalApps`, but `BackupLocal` fails with `Class not
  registered` for application type ME, so no tool claims a backup.
- `ftview_live_map` derives addresses from the CSV. It contacts no controller, so it cannot say whether
  the PLC tag exists; `ftview_cross_reference` answers that question against an `.L5X` instead.
- Live tag values are not read or verified against hardware in this workspace.
- `ftview_check` is structural: it does not validate against the vendor XSD (that is `ftview_validate`,
  on a draft) and does not bind to a controller.

## Safety

| Path | What it writes | What it needs |
| --- | --- | --- |
| Draft tools | staged operations in the chat; no file changes | `edit` switch |
| `ftview_apply` | a new export folder; the source folder is never modified, and an existing output folder is refused unless this chat wrote it and `overwrite: "yes"` is passed | `edit` switch; output folder must not exist |
| `ftview_tag_snapshot`, `ftview_alarm_snapshot` | a CSV or XML file (default: into the application's project store) | the application store; the tag database is attached read-only |
| `ftview_document`, `ftview_studio_import_prepare`, `ftview_component_package` | a new documentation, import or component-package folder | a new output path |
| `ftview_export` | a new export folder | FactoryTalk View ME on the host; the application is not modified |
| Studio tools | nothing; they report, plan and preflight | — |

No tool in this row imports into Studio, builds a runtime file, downloads to a terminal, or changes a
running machine. Those are named as handoffs and left to the engineer.

## Where to go next

- [Cross-referencing the HMI against the PLC](cross-reference.md) — the join this row does between an ME
  export and an `.L5X`.
- [HMI design](../../reference/hmi-design.md) — the screen grammar and rule-to-tool map both HMI products
  share.
- [Tool reference](../../reference/tools.md) — every `ftview_*` tool with its parameters.
- [Capabilities](../../capabilities.md) — which call produced each measured figure in this page.
