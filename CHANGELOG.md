## [Unreleased]

### Changed

- **The review sheet states what it is.** A sheet titled its drawings but carried no totals, so someone
  looking only at the PNG could not tell how many displays it covered, how many problems were marked, or
  whether it came from the export or a staged draft. `composeSheet` takes a footer line and
  `ftview_render` fills it with those three facts.
- **A render marks the objects it complains about.** `problems` named overflowing objects in the result,
  but the image itself showed nothing, so a reviewer had to cross-reference names by hand. Each problem
  object now carries a dashed red outline in both a single render and the review sheet, and the render
  coverage says the outline marks the declared box rather than proving runtime appearance.
- **The renderer contract no longer claims images are placeholders.** Artwork has been inlined since
  0.27.0 when `Images/<file>` is present, and tests cover it, but the module header, the reference text
  and the `ftview_render` description still said images were drawn as placeholders. A model reading the
  description could reasonably skip rendering a screen on the assumption its artwork would not appear.
### Added

- **`ftview_render` can put a set of screens on one review sheet.** `sheet: "yes"` stacks up to eight
  drawings on a single image with a title per display, so a reviewer (or the model) judges a set in one
  look instead of opening a dozen PNGs. The sheet is a plain SVG that embeds each drawing and is
  rasterised by the same headless browser, so it needs no extra tooling.
- **`ftview_verify_import` accepts an export you made by hand.** Verification used to depend on the
  vendor export engine, so when that export failed (closed Studio, safety project, COM trouble) the
  proof that an import landed was simply unavailable. `export_root` points the same object-level
  comparison and drift report at a folder exported from Studio by hand after the import; the vendor
  path stays the default and its failure message now says which argument avoids it.
- **`ftview_check` names artwork the export does not ship.** A display that names
  `Images/<file>` rendered an empty box with no warning anywhere in the workflow. The scan now records
  the file names under `Images/` (without reading their bytes) and reports `IMAGE_MISSING` per display
  and object, so a received export can be judged complete before anyone imports it.
- **`ftview_apply` copies artwork byte for byte.** The applied folder used to state that native
  binary files were not copied, so a display naming `Images/<name>.png` produced a folder whose
  artwork was missing (or text-mangled). The copy loop now writes binary export files through
  `writeBytes` at the same relative path, so a handed-over folder and a later import package both
  carry the images the displays name.
- **`ftview_compare` diffs tag rows, not just their names.** `tags.changed` lists each field that
  moved — device address, description, data source, native type, read-only — with both values, so a
  re-addressed tag between two application versions is visible instead of hiding behind a changed
  CSV hash.
- **`VIEW-NAV-02` catches a display an operator cannot leave.** `ftview_design_check` reports a
  display that something navigates to while it holds no `gotoButton` or `closeButton`; a popup like
  that strands the operator at the machine, and reachability alone never showed it.
- **`ftview_check` verifies the alarm display exists.** Given a decoded `Alarms.xml`, an alarm setup
  whose `display-name` is not a display in the export raises `ALARM_DISPLAY_MISSING`; the terminal
  otherwise opens nothing when an alarm is annunciated and the configuration looks correct from the
  screen side.
- **Alarm triggers that name a missing HMI tag are reported.** `ftview_cross_reference` scans decoded
  `Alarms.xml` expressions per trigger, adds `counts.alarmUnresolved`, and raises
  `ALARM_TAG_NOT_IN_HMI` with the trigger ids so a typo in Alarm Setup is found before a terminal
  annunciates nothing.
- **`ftview_export` opens what it exported.** The result carries `view_id`, so authoring starts
  immediately instead of a separate `ftview_open` round trip; when opening fails the result falls
  back to naming the folder and the export still succeeds.
- **A package can leave out the displays the application already matches.** `ftview_studio_import_prepare`
  takes `skip_unchanged: "yes"` with `current_export`, drops displays whose objects are already
  identical, names them in `skipped`, and refuses with `NO_CHANGES` when nothing is left to import.
  A full package over a mostly-unchanged application no longer asks a human to re-import screens
  that would not change.
- **Cross-reference counts alarm usage.** `ftview_cross_reference` reads the export alarm
  configuration and reports, per HMI tag, how many alarm triggers watch it (`rows[].alarms`), the
  trigger count, and `counts.alarmOnly` — the tags an alarm watches that no display shows. A tag
  used only by alarms used to look unused.
- **An import package reports the displays the application already matches.** `ftview_studio_import_prepare`
  compares each packaged display's objects with the `current_export` of the application and returns
  `comparison.unchanged`, `changed` and `added`. An import rewrites whatever it lists, so the
  identical screens are worth knowing before asking a human to run a batch that changes nothing.

## [0.69.0] - 2026-10-29

### Fixed

- **The import manifest types each display, not the whole batch.** `ftview_studio_import_prepare`
  takes `current_export` (an export of the application as it stands) and writes `create` for a
  display the application does not have yet and `update` for one it does, reporting the counts. The
  wizard fails the entire batch when one entry's type is wrong, which is how a package of new and
  changed screens failed in the field.
## [0.68.0] - 2026-10-29

### Added

- **`ftview_apply` takes `package: "delta" | "full"`.** A delta (default) lists only the displays
  the draft changed, which is what an application that already holds the screens needs. A full
  package lists every display in the export and copies the artwork those untouched displays name,
  so a fresh application can be built from one import instead of a delta that leaves screens and
  their pictures behind.
## [0.67.0] - 2026-10-29

### Fixed

- **`ftview_apply` copies the artwork a display names.** A display that sets `imageName` was
  broken after import because the wizard copies only the XML, so the folder it produced had no
  `Images/` files. Apply now finds each named image in the export (`png`, `jpg`, `jpeg`, `gif`,
  `bmp`), writes it beside the displays, and returns `images` and `missing_images` — a name the
  export does not carry is reported instead of failing silently. Filesystem providers gained an
  optional `writeBytes`, so binary files are copied byte-for-byte.
## [0.66.0] - 2026-10-29

### Added

- **`ftview_verify_import` compares staged objects, not just display files.** The round-trip check
  now also reports, per display, staged objects the import dropped and fields whose landed value
  differs from the value the draft set (geometry, face colours, caption). That is the difference
  between "the file was accepted" and "the change is on the screen".
## [0.65.0] - 2026-10-29

### Added

- **`ftview_draft_screen` accepts a palette.** `theme_json` overrides the scaffold slots used for
  that screen (backdrop, header, surface, footer, title and footer text), so a customer palette does
  not need a restyle pass afterwards; the result echoes the palette and reports the contrast of the
  two text-on-band pairs, flagging a title that would not be readable.

## [0.64.0] - 2026-10-29

### Added

- **`ftview_studio_preflight` carries an engineering gate.** Alongside parse state and name
  restrictions it now reports critical check findings and house-theme conformance for the edited
  export, and `gate: "fail"` refuses the change set instead of letting an off-theme or broken screen
  reach the manual import step. Findings and per-display theme rows ride along in the result.

### Fixed

- The bundle no longer lists the retired `@aryacode/dsh-engineering-ftview` package as a dependency.

## [0.63.0] - 2026-10-29

### Added

- **`ftview_theme_audit` measures house-theme conformance.** Every display is checked for the
  theme backdrop, a header band, a footer band and the share of its colours already in the palette,
  and each non-conforming display becomes one `VIEW-THEME-01` finding. Deciding which screens still
  need `ftview_draft_restyle` was a manual pass over dozens of displays.

## [0.62.0] - 2026-10-29

### Fixed

- **`ftview_validate` reports an edit aimed at an object that is not in the display.** `DRAFT_TARGET_MISSING`
  names the file, display and object, and the operation that cannot land, instead of failing the whole
  prepare step with `COMPONENT_NOT_FOUND`. The rest of the draft still validates, so one wrong name no
  longer hides the findings for the other operations. A set or delete on an object the same draft added
  is accepted, and an `object_add` can still be followed by edits to the object it placed.
## [0.61.0] - 2026-10-29

### Added

- **`ftview_draft_restyle` repaints an existing display in the house palette.** It walks a display the
  way a person would on a restyle job: backdrop and panel surfaces become the deep theme, text the
  bright colour, and field and button shells the accent, while geometry, objects and captions stay put.
  Reference objects are skipped because the global object owns their look, and indicators or drawings
  are skipped because their colours carry meaning. `theme_json` overrides any colour; the display
  backdrop is staged as a display setting, so `ftview_draft_display_set` remains the audit trail.
## [0.60.0] - 2026-10-29

### Added

- **`ftview_check` reports navigation into a display this export does not have.** A `gotoButton`
  (or any object with a `Display` connection) that names a missing display is `GOTO_TARGET_MISSING`,
  with the display, object and target. A typo there is invisible until an operator touches the button
  on the terminal.
## [0.59.0] - 2026-10-29

### Fixed

- **`TAG_NOT_BOUND` reads the expression the way Machine Edition writes it.** Braces are stripped and
  alias bindings (`{[PLC]Tag}`) are left alone, so a real export reports no false positives instead of
  one finding per `{` character.
## [0.58.0] - 2026-10-29

### Added

- **`ftview_check` reports a binding the tag CSV cannot satisfy.** Every connection on a named object
  is resolved to its root tag; when the CSV is present and does not declare that root, the finding is
  `TAG_NOT_BOUND` with the display, object, connection and expression. A misspelled tag used to look
  identical to a working one in a render and only fail on the PanelView.
## [0.57.0] - 2026-10-29

### Added

- **`ftview_draft_popup` builds a modal popup in one call.** Title, a message that survives a vendor
  import (line breaks are written as `&#xA;`), and one to three buttons that close the popup or open a
  display. A new popup is created as an `onTop` display with no title bar, the way Machine Edition
  confirmations behave, and an existing display of that name is reused.

### Fixed

- **Line breaks in captions are kept.** `escapeAttribute` writes `&#xA;` for a newline, so a multi-line
  message reaches Studio as two lines instead of being flattened onto one.
## [0.56.0] - 2026-10-29

### Fixed

- **`ftview_draft_display_set` edits display settings where Studio keeps them.** `width`, `height`,
  `backColor`, `displayType`, `positionX`, `positionY` and the other window attributes now go to
  the display's `<displaySettings>` element instead of the display root, which the schema rejects.
  A display that lost its settings element gets one inserted. Resizing a display or turning it into an
  `onTop` popup is now something a draft can do.

## [0.55.0] - 2026-10-29

### Added

- **`ftview_draft_screen` stages the screen's tags in the same draft.** The new `tags_json` argument
  takes the HMI tags the screen reads; they land beside the objects, so one apply writes the screen and
  its tag rows together instead of a separate `ftview_draft_tags` call.

### Changed

- **`l5x_diagram` gives wrapped rows their own height.** An operand that wrapped onto two lines used to
  keep the single-line row pitch, so the next row sat tight against it; the row now grows by the height
  of its tallest device.

## [0.54.0] - 2026-10-29

### Changed

- **Ladder diagrams wrap long operands instead of shortening them.** A label that does not fit on one
  line is broken at a separator near the middle and drawn on two lines, so
  `MOVE(BottomKnife_MP200Iec:O.Data[3],BottomKnife_MP200Iec:O.DegreePosition)` stays readable on the
  page. Applies to `l5x_diagram` and `l5x_rung_preview`.
- **`l5x_diagram` captions the page with the range it covers** — `5-16 of 799 rung(s)` — and names the
  `start_rung` that continues it, so a page image carries its own navigation instead of relying on the
  caller to remember the offset.

## [0.53.0] - 2026-10-29

### Added

- **`ftview_bulk_set` applies one change to every matching object.** Match on type, a name glob or
  existing attribute values, over every display or a named list; `dry_run` reports the selection
  without staging. The field sessions patched display XML by script for exactly this, so the change
  now goes through the validated draft path and one import.

### Fixed

- **`ftview_draft_object_set` no longer moves an object it was asked to relabel.** A caption-only
  change staged default geometry (`left/top 10`, `100x30`), silently repositioning the object; the
  defaults now apply only when the object is created.

## [0.52.0] - 2026-10-29

### Added

- **`l5x_diagram` pages a large project.** `routine` restricts the page to one routine and
  `start_rung` continues from where the last page stopped; the result carries `start_rung` and
  `next_start`, and the summary says which offset to page from next. A 799-rung commissioning project
  used to be truncated after `max_rungs` with no way to see the rest.

## [0.51.0] - 2026-10-29

### Added

- **`ftview_draft_ops` and `ftview_draft_drop`.** A staged change can now be listed with its index,
  kind and target, and dropped on its own. Before this, one wrong object move meant discarding every
  staged edit or hand-editing the display XML — the field session wrote 28 one-off PowerShell scripts
  that patched XML directly, partly because a draft could not be inspected or trimmed.

### Changed

- `ftview_draft_drop` refuses an index the draft does not hold and names the operation count, so a
  wrong index cannot silently remove the wrong step.

## [0.50.0] - 2026-10-29

### Added

- **`ftview_studio_import_prepare` says whether anyone looked at the screens.** Every display this
  chat drew is remembered, and the package reports the displays that were never rendered — with a
  `ftview_render` step for them — instead of letting a human import a layout nobody has seen. In the
  field session 10 packages were built, 0 renders were taken, and the agent's own log says it was
  "`revising layouts`" from text alone.

### Changed

- The FactoryTalk View skill now makes looking a step in the loop: draw every display, read the
  PNGs, then ask for the import. The L5X skill says to start a review with `l5x_diagram` rather
  than reading rungs one at a time.

## [0.49.0] - 2026-10-29

### Fixed

- **A safety controller is refused before an offline build, not after it aborts.** Detection looked
  only for `<SafetyTask>`/`<SafetyProgram>` elements; the real commissioning export marks safety
  with `Class="Safety"` on its task and program, a `SafetyNetwork` port number and a
  `SafetyLocked` controller, so the import ran and the SDK answered
  `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` — which reads like an empty draft, not a refusal. The field
  session retried it four times and then edited the ACD by script instead.

### Changed

- `verify_offline_l5x` now answers `SAFETY_PROJECT_OFFLINE_VERIFY` and names the evidence it found,
  and the generic abort advice carries that evidence when it exists.


## [0.48.0] - 2026-10-29

### Added

- `l5x_diagram` draws every ladder rung of the open project on one page (routine headings, rung numbers,
  comments and instruction chains), with `program` and `max_rungs` to bound the page. Reviewing an
  unfamiliar controller no longer takes one `l5x_routine_diagram` call per routine — the field session
  never used the single-routine diagram at all, and this is the call it would have made.
- Every routine heading names `program/routine`, so repeated rung numbers are explainable, and long
  operands are clipped inside their box instead of running off the page.

## [0.47.0] - 2026-10-29

### Added

- `ftview_render` takes `displays_json` and draws up to eight displays in one call, returning a `screens`
  entry per display (file, size, problems) and one merged `problems` list. Checking a twelve-screen set is
  now one or two calls instead of twelve, which is where review time went in the field.

## [0.46.0] - 2026-10-29

### Added

- `ftview_render` now reports layout problems alongside the drawing: every object whose box leaves the
  canvas or whose caption or text cannot fit its box is returned in `problems` with the object name, the
  kind (`outside` or `overflows`) and a measured detail, so a screen can be corrected before anyone
  imports it.

### Fixed

- The renderer read the object type from the element name only, so an export that wraps the type in an
  `<object type="...">` element drew every text, button, indicator and trend as an unlabelled rectangle.
  It now prefers the declared `type` attribute.

## [0.45.0] - 2026-10-29

### Added

- `l5x_routine_diagram` draws the rungs of a routine that already exists in the open project. Pass `program` and `routine`; it numbers the rungs, lists the instructions it found, and writes a PNG beside the SVG when Chrome or Edge is installed. A missing routine is refused with the program's routines as candidates, and a Structured Text routine is refused because there is no ladder to draw.

## [0.44.0] - 2026-10-29

### Fixed

- The import manifest `ftview_apply` writes was not usable by the Graphics Import Export Wizard: entries had
  no `importType` and no `display`, so every run failed with "The display ... does not exist" or silently
  ignored the files. Each entry now carries `importType="create"` for a display the draft introduced and
  `importType="update"` for one that already existed, plus its `display` name.
- `IMPORT.md` now lists the wizard's exact four steps and counts creates against updates, so a run cannot
  fail because the manifest disagreed with the application.

## [0.43.0] - 2026-10-29

### Added

- `ftview_compare` reports what changed **inside** each display, not only which files differ: per display,
  the objects added, removed, and changed with the fields that moved (`left`, `caption`, `connections`, ...).
  After a Studio import this is the proof that a specific object landed, where a file hash only says the
  file is different.

## [0.42.0] - 2026-10-29

### Fixed

- `ftview_studio_import_prepare` wrote `importType="create"` even when the caller asked for
  `mode: "update"`, so an update package asked Studio to create displays that already existed and the
  wizard ignored every file. The manifest now carries the requested mode and the steps say which one it is.

### Added

- The package refuses a display that does not parse as XML, instead of letting the wizard answer only
  "Unable to load the XML file".

## [0.41.0] - 2026-10-29

### Added

- `DisplayObject.connections` carries the expressions an object is wired to (`Value`, `Indicator`,
  `Display`), read from both the flat and the `<connections>`-wrapped ME shapes.
- Renders print that tag inside the frame, so a picture shows what a display reads instead of only its
  caption and object name.

### Notes

- Long expressions are shortened to the room the frame has; the full text stays in `data.connections`.

## [0.40.0] - 2026-10-29

### Added

- Frames read their caption from the face a screen shows at rest (`stateId="0"`), so a button drawn in a
  render says START or YES instead of its object name.
- Character references in captions (`&#xA;`, `&amp;`) are decoded, and a multi-line caption is drawn as one
  `tspan` per line instead of a flattened single line.

## [0.39.0] - 2026-10-29

### Added

- `ftview_draft_display_attrs` stages many attribute changes on a display or one of its objects in a
  single call, instead of one `ftview_draft_display_set` per attribute.

## [0.38.0] - 2026-10-29

### Added

- `ftview_render` draws vendor polylines, trend grids and bar-graph tracks, so separators and charts read
  as the screen does rather than as labelled boxes.

### Fixed

- A `line` object is drawn from its own `line` polyline with its line width and dash style; it used to be
  a diagonal across the object's bounding box.

## [0.37.0] - 2026-10-29

### Added

- `ftview_apply` ends with a `ftview_render` step for the first changed display, so the screen can be
  looked at before anyone imports it.

### Fixed

- `ftview_apply` writes the Studio batch-import manifest for displays a draft created, which arrive as
  `X.xml` rather than `Displays/X.xml`.

## [0.36.0] - 2026-10-29

### Changed

- **`verify_offline_l5x` explains a no-changes import abort.** `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` now carries the reason (safety controller, or an L5X whose safety signature must be recomputed) and the alternative (build in Studio 5000, or prove the change with `run_checks` and a targeted read). The field session retried this four times.
- Safety detection also reads `SafetySignature`, `Type="SAFETY"` and `SafetyNetworkNumber`, not only `SafetyTask`/`SafetyProgram`.
## [0.35.0] - 2026-10-29

### Added

- **`ftview_draft_tags` stages a batch of HMI tags in one call.** Each entry changes a row description, a type, or appends a new row; up to 500 per call. The field session made thirteen single-tag calls to describe one screen's tags.

### Changed

- The batch is atomic: an entry with neither description nor type refuses the whole set and stages nothing, naming the tag at fault.
## [0.34.0] - 2026-10-29

### Added

- **`compose_batch` writes many validated rungs in one call.** Up to 200 rung descriptions — composition trees or named patterns — are checked against the export and against the tags the same draft stages, then staged at consecutive rung numbers. The field session wrote 29 one-off scripts to add rungs one at a time; a batch that composes 20 rungs is now one call.

### Changed

- The batch is atomic: if any rung in it is invalid, nothing is staged and the refusal names the entry. A rung number that already exists is refused with the start rung to use instead, not a generic collision.
## [0.33.0] - 2026-10-29

### Added

- **`ftview_draft_screen` lays out a whole screen from one description.** Cards of label/value and label/lamp rows plus a navigation row are positioned on the scaffold slots, wired to tags, and staged in a single call. The field session hand-placed every object through PowerShell scripts and XML edits; a screen of nine rows and three buttons is now one description, and every rectangle comes back so the next placement is never guessed.

### Changed

- Row kinds are validated before anything is staged: `value` becomes a numeric display bound on `Value`, `lamp` a multistate indicator bound on `Indicator` with two states. More than four cards or four navigation buttons is refused with the reason, not silently truncated.
## [0.32.0] - 2026-10-29

### Added

- **`compose_rung` sees the tags the same draft stages.** A rung written against a tag that `draft_tag` just added used to fail with `TAG_NOT_FOUND`, so the workflow either declared tags in a separate draft or fell back to hand-written NeutralText. Composition now resolves staged declarations, and the type check still runs: a `REAL` tag used where a `BOOL` contact belongs is refused exactly as before.

### Changed

- Staged declarations are visible to composition only. `run_checks`, `draft_validate` and the export on disk still describe the project as it is, so nothing claims a tag exists before it is written.## [0.31.0] - 2026-10-29

### Added

- **`draft_list` and `draft_remove_op`.** A staged operation can now be inspected by index and dropped on its own. Before this, one wrong rung meant discarding every staged edit or hand-editing the L5X outside the plugin — the field session chose the hand edit, with 29 one-off PowerShell scripts as the price.

### Changed

- `draft_remove_op` takes a positional index that `draft_list` reports, not a rung number, so a removal cannot land on real logic by guesswork. An out-of-range index is refused with the current operation count and a pointer back to `draft_list`.
## [0.30.0] - 2026-10-29

### Added

- **A re-apply no longer needs a new folder name.** `ftview_apply` accepts `overwrite: "yes"` for a folder this chat already wrote, so fixing one attribute and re-writing the export stops littering `Final 2`, `Final 3` folders. An unknown folder is still refused with `OUTPUT_NOT_TRACKED` — applying there would merge into somebody else's files — and the `OUTPUT_EXISTS` message now names the option that works.

### Changed

- Overwrite replaces the file set with the current draft; it does not merge with what an earlier apply wrote. Re-run the draft you want as the final state.
## [0.29.0] - 2026-10-29

### Added

- **A stale view can be refreshed.** `ftview_reload` re-reads one opened export folder in place and keeps its `view_id`, so a re-export, a script or a Studio import is visible without opening a second view and re-deriving every path. It reports the display count and which displays appeared or disappeared.
- **A draft can be abandoned.** `ftview_draft_discard` throws away the staged operations, so edits that went the wrong way no longer force the model to finish them or to work around the plugin with scripts. The export on disk is untouched; `draft_discard` does the same for L5X drafts.

### Fixed

- **Offline verification refuses safety projects instead of failing inside the SDK.** A GuardLogix or Compact GuardLogix export always aborts with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` in the offline importer, even when the L5X is unchanged; `verify_offline_l5x` now detects `SafetyTask` / `SafetyProgram` and returns `SAFETY_PROJECT_OFFLINE_VERIFY` with the honest alternative (import and build in Studio 5000).
- Rasterising tests carry a 30 s timeout, so a loaded host no longer fails them on the default 5 s.
## [0.28.0] - 2026-10-29

### Added

- **Ladder answers now carry a diagram.** `l5x_rung_preview` draws the validated rungs as an SVG and, when Chrome or Edge is installed, rasterises it to a PNG beside the preview document, so a chat answer shows ladder logic instead of NeutralText. Instruction boxes carry their operands, branches stack inside a bracket, and every rung is numbered. `diagram: "no"` skips the image work; a host without a browser still gets the SVG, and the result says why no PNG appeared.
- The diagram is explicitly a schematic: it is drawn from the parsed rungs, not rendered by Studio, and the coverage list says so.
## [0.27.0] - 2026-10-29

### Added

- **A render inlines the display's real artwork.** `ftview_render` reads the rasters a display references from the export's `Images` folder and embeds them in the SVG, so a screen shows its actual images instead of a labelled placeholder. An image the export mentions but does not ship is still drawn as a placeholder, and the result now says so, because many ME exports ship an empty `Images` folder.

## [0.26.0] - 2026-10-29

### Added

- **`ftview_render` can draw the staged draft, not just the export.** Pass `source: "draft"` and the render reflects everything staged but not yet applied, so a screen can be looked at before `ftview_apply` and before anyone imports it. A draft that does not touch the display is refused with `NOT_FOUND` instead of silently drawing the committed file.

## [0.25.1] - 2026-10-29

### Fixed

- ftview_render resolves the SVG path before handing it to the browser, so a relative `output` folder now produces the PNG as well.


## [0.25.0] - 2026-10-29

### Added

- **ftview_render shows the screen before anyone imports it.** The tool draws one display of the open export as an SVG file and, when Chrome or Edge is installed, rasterises it to PNG with a headless screenshot, so the image can be attached to the answer. Panels, text, buttons, indicators and lines are drawn from the geometry the export declares; animations, images, global objects and vendor widgets appear as labelled placeholders. The result says which browser produced the PNG, or that only the SVG exists because none was found.
## [0.24.0] - 2026-10-29

### Added

- **`ftview_cross_reference` joins an HMI export to a Studio 5000 project.** Pass the FTView view and one L5X; the tool resolves every HMI tag through the tag CSV data source to a PLC tag, then reports which displays use it, which rungs read or write it, and the tags that exist on only one side. Rows carry `linked`, `memory` (HMI internal), `unlinked` or `unsupported` (indirect address such as `[Tag]` or a data-table address), and findings use `HMI_TAG_NOT_IN_PLC` / `PLC_TAG_NOT_IN_HMI`, so one call answers whether the HMI tags the PLC actually reads.
- **`ftview_draft_display_scaffold` starts a display from known slots.** One call stages a backdrop, header, title, optional subtitle, content surface, footer bar and footer text at the display's own size, and returns the free rectangle inside the body plus the header, footer, title and subtitle rectangles. The model places objects into a slot instead of inventing coordinates.
- **`l5x_rung_preview` renders proposed rungs as ladder.** It validates every rung with the parser `draft_rung` uses, writes a minimal viewer-shaped L5X into the workspace and points the answer at it, so a proposed rung is read as a diagram rather than NeutralText. Rungs can be passed inline or as `rungs_file`; blank lines and `//` or `#` comment lines are skipped.
- **Two PLC standards rules in `run_checks`.** `LATCH_WITHOUT_RESET` (warning) names a tag latched by `OTL` with no `OTU` anywhere in the export; `DUPLICATE_OUTPUT` (warning) names a tag driven from more than one rung in the same routine. Both carry `basis: CRAFT-FAULT-02` so the finding cites the corpus.
- **A standards reference** at [docs/reference/standards-checks.md](docs/reference/standards-checks.md) lists every PLC and HMI rule, its severity, the corpus rule behind it, and what a clean result does not prove.

### Changed

- **`run_checks` says what it now covers** in its description: the documentation rules, the two standards rules and the optional baseline I/O comparison.
# Changelog

## [0.23.0] - 2026-10-29

### Added

- **`ftview_validate` reports an object this draft places partly over a neighbour.** The new `DRAFT_OVERLAP` warning names both objects, the display and the overlap area. It stays quiet for whole-display backdrops and for panels that contain their controls, because those are layering rather than mistakes, so the finding is only about collisions the draft itself introduced. The author sees the collision before apply instead of after import.

### Fixed

- **An object added to a display with no trailing newline landed after the root element.** The insertion point fell back to the end of the file, so the new element sat outside `<gfx>` and the re-parse behaved as if the object did not exist. The insertion now falls back to the parent's closing tag.

## [0.22.2] - 2026-10-28

### Fixed

- **Alarm databases with a non-US localised stream now decode.** The decoder looked only for `ls00000409`; a `ls00004009` (and other locale) table is the same layout, so any `ls<8 hex digits>` stream is accepted, preferring the US one. Across the 66 applications installed here, alarm decoding went from 3 to 34 success; the remaining 26 fall back with a stated reason (stream versions 13/14, or a variant record layout this decoder does not read).

- **A failed decode now says why in the export result.** When the alarm or tag database cannot be read, `ftview_export` keeps the wizard snapshot and adds a warning naming the decoder error instead of silently treating the snapshot as fresh.

### Changed

- **Coverage is documented per component.** Tag decoding succeeds on 64 of the 66 installed applications (two were locked by a running Studio); alarm decoding on 34. Both paths keep the Studio wizard as the fallback, and every fallback is reported rather than hidden.
## [0.22.1] - 2026-10-28

### Changed

- **`ftview_export` refreshes stale or missing tags headlessly.** When the store has `TAG/<application>.MDF` and the snapshot is absent or older than the application database, the export decodes the tag CSV itself and reports `tags: "fresh"` with no warning, instead of copying the old snapshot and telling the reader to run Studio. Falls back to the snapshot copy (with the existing warning) when local SQL tools are unavailable. Verified on `AryaFTV_CarpenterPilot_20261007`: decoded 9,986 bytes, byte-identical to the wizard CSV.
## [0.22.0] - 2026-10-28

### Added

- **`ftview_alarm_snapshot`: alarm XML without Studio.** The tool reads `M_Alarms/MachineAlarms.mal` straight from the application store. The stream is an OLE2 compound file: header counts and next ids come from the trailer, then one 102-byte trigger record and one 30-byte message record each, with `FF <len>`-prefixed UTF-16 strings (`FF FE`/`FF 00` for absent or empty). `LS<length><locale>` outranks the base stream because it carries the localized `triggerLabel` and `messageText`. Output is byte-identical to the vendor wizard's `Alarms.xml` on `AryaFTV_CarpenterPilot_20261007` (33 triggers), `Carpenter_EPS_Laminator001` (23) and `CC019_Main` (64); ids above the encoded limit are reported as notes rather than invented.
- **`ftview_export` fills alarms from the application database.** When `M_Alarms/MachineAlarms.mal` is present the export decodes it into `Alarms/Alarms.xml` and reports `alarms: "fresh"` instead of copying an absent or stale snapshot.

### Changed

- **Alarms are no longer "requires Studio".** `ftview_capabilities` reports `alarms: "available"` when the machine alarm database exists, with the Studio wizard kept as the fallback for applications that carry no `M_Alarms` folder. Skill and `docs/reference/ftview-any-app.md` now describe the decoder and its limits.
## [0.21.0] - 2026-10-28

### Added

- **`ftview_tag_snapshot`: the tag CSV without Studio or the wizard.** The tool copies `TAG/<application>.MDF` to a temp folder, attaches the copy to the local SQL Server Express instance (`MSSQLSERVER`, `SQLEXPRESS`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦), reads `dbo.AllTagsView` and renders the rows with the vendor wizard's exact quoting, ordering, CRLF endings and UTF-8 BOM. The application database is only read; the attach is dropped and the copy removed. Verified byte-identical against the wizard snapshots for `AryaFTV_CarpenterPilot_20261007` (101 tags), `CC019_Main` (121 tags) and `Carpenter_EPS_Laminator001` (378 tags).
- **A SQL-aware capability status.** `ftview_capabilities` reports `tags: "available"` when local SQL tools exist even without `DatabaseConverter.exe`, and its notes say which path is in use.

### Changed

- **Tag snapshots no longer need a human at the wizard.** Skill, `docs/reference/ftview-any-app.md` and the capability notes now prefer `ftview_tag_snapshot`, with `ftview_studio_export_prepare` (DatabaseConverter) as the fallback when no local SQL Server is reachable. Alarm XML and display import still run inside Studio.

## [0.20.2] - 2026-10-28

### Added

- **Smart artifact detection in the file preview.** Opening an alarm export, tag CSV or batch import file no longer shows "not a FactoryTalk View display": `detectArtifact` recognises `<alarms>`, the tag CSV header, `<gfxImport>` and displays, and the preview renders a summary card with the counts (alarm definitions, tag rows, import entries) while displays still render. Unknown XML reports the root element.

### Changed

- **The export workflow no longer implies Studio.** Skill and `docs/examples.md` state that export, authoring, validation, apply and verification need no Studio; only the alarm snapshot and the display import do. The fresh-asset example now passes `export_root` and validates the snapshot in place.
## [0.20.1] - 2026-10-28

### Changed

- **`ftview_studio_export_prepare` can target the export folder directly.** Pass `export_root` and the step list names `<export>/Tags/<application>.csv` (tags) or `<export>/Alarms/Alarms.xml` (alarms) instead of the project store, so the vendor wizard writes the snapshot where the export needs it. Without `export_root` the old store destination is unchanged.
- **`ftview_studio_export_accept` validates in place.** When source and destination resolve to the same file it checks the file and reports it, without a needless self-copy.

### Verified

- On `AryaFTV_CarpenterPilot_20261007` with Studio open, the Alarm Import Export Wizard wrote `Alarms.xml` (29,089 B) straight into `Exports\AlarmDirectTest`; the project store's `Alarms.xml` kept its previous timestamp, proving nothing was written to the store first.
## [0.20.0] - 2026-10-28

### Added

- **`ftview_capabilities`** reports what the host can actually do: Studio and tag-wizard paths, installed `Gfx-ME*` schema versions, application count, and status for tags (`available`), alarms and import (`requires-studio`), backup and live (`unverified`), with one line per fact an agent must not guess.
- **Objects can be added to a display created in the same draft.** `ftview_draft_object_add`, `_set`, `_delete` and `_order` resolve a display that the draft's `display_create` or `display_add` just made, instead of failing with ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œNo display is named ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â. Display settings on a draft-added display are accepted too.

### Documented

- `docs/reference/ftview-any-app.md` now records what the installed product exposes and does not: standalone tag wizard; display-only export server; `GfxImport`/`GraphicsXmlWizard` COM that needs Studio's graphics server and project context; `METriggerEditor` alarm implementation with no CLI; `ApplicationManagerServer` backup that fails on this host.
## [0.19.2] - 2026-10-28

### Fixed

- **The alarm-export steps named the wrong menu.** `ftview_studio_export_prepare { kind: "alarms" }` said `Tools > Alarm Import Export Wizard`. The wizard opens from **right-click `Alarms > Alarm Setup` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ `Import and ExportÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦`**, and it runs inside `VStudio.exe`, so Studio must be open with the application loaded. The steps now say that, including the case where Studio is closed.

### Verified on CC019_Main

- Tag export through `DatabaseConverter.exe`: `CC019_Main-Tags.CSV`, 104 tags, 110 lines.
- Alarm export through `Alarm Setup ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Import and Export`: `Alarms.xml`, 71,865 bytes, root `<alarms version="1.0">`.
## [0.19.1] - 2026-10-28

### Fixed

- **`ftview_export` creates the destination's parent folder first.** Exporting an application into a new tree failed with `Value does not fall within the expected range` at `ExportAll` when the parent folder did not exist; the Laminator export only worked because `Laminator/HMI` was already there. `ApplicationManager`-style parents are now created before the vendor call.

### Verified

- Second application exported and drafted against: `CC019_Main` (70 displays, 1280ÃƒÆ’Ã¢â‚¬â€800, schema `Gfx-ME17.xsd`, **no** tag or alarm snapshot). A 12-object `ARYA_DIAG` display passed schema validation and applied cleanly, proving the catalog/draft/validate/apply path is not Laminator-specific.
## [0.19.0] - 2026-10-28

### Fixed

- **`ftview_draft_object_set` now writes captions in the shape each element accepts.** Buttons and indicators update their `<states><state><caption>` faces; `gotoButton` and the simple buttons update the `<caption>` child; other objects keep the `caption` attribute. Editing a button caption previously produced schema-invalid XML.
- **`ftview_validate` bounds its findings.** It returns the first `limit` findings (default 50) and still reports `findings_total`, `findings_truncated` and complete `by_rule` counts, so a legacy export with hundreds of duplicate-name warnings no longer floods the result.

### Added

- **`docs/reference/ftview-any-app.md`** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â what is generic across applications (catalog, reading, drafting, packaging, snapshots, live mapping), what varies (schema version, tag CSV, alarms, display names and size, image stems, global objects, connection names), and the export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ draft ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ import ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify loop.
## [0.18.4] - 2026-10-28

### Added

- **`ftview_studio_import_prepare` takes `mode: "create" | "update"`.** A display that already exists must be updated, not created: a create-mode entry ignores every existing object and reports "element already exists ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ will be ignored". Update mode is what completes a partially imported display. Default stays `create`.
## [0.18.3] - 2026-10-28

### Fixed

- **`multistateIndicator` binds through `Indicator`, not `Value`.** Studio's importer rejected `name="Value"` on the element with `The connection with the name 'Value' is not valid on a 'multistateIndicator' element.` The object writer now maps a caller's `Value` connection to `Indicator` for indicators, so the mode lamp imports. The same fix was applied to the pending `Arya Control.xml` package.
- Restored the non-stateful branch of `addObject` after the connection mapping edit, so visibility animations on panels keep being written (regression caught by the animation test).
## [0.18.2] - 2026-10-28

### Fixed

- **Import packages now force display creation.** The generated `gfxImport` entries were bare `importFile` references, so Studio imported in update mode and refused with `The display 'Arya Overview' does not exist.` Each entry now carries `importType="create"` and the explicit `display` name, which is what the batch file documents. The package under `Laminator/HMI/Arya Import` was rewritten for the retry.
## [0.18.1] - 2026-10-28

### Fixed

- **`ftview_studio_import_prepare` produced a package Studio could not import.** The display XML files went into `Displays/` while `BatchImport.xml` referenced them beside itself, so the Graphics Import Export Wizard failed with `Unable to load the XML file 'ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦\Arya Overview.xml'. Cause: The system cannot locate the object specified.` The XML files now sit beside the batch file, which is where Studio resolves `importFile`. The existing package under `Laminator/HMI/Arya Import` was corrected by hand for the retry.
## [0.18.0] - 2026-10-28

### Added

- **`ftview_draft_object_add` writes button and indicator faces.** A new `states_json` argument produces `<states><state stateId="0"><caption ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/></state>ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦</states>`, so `momentaryButton`, `maintainButton`, `latchedButton`, `multistateButton`, `rampButton` and `multistateIndicator` get real captions, colours and per-value states instead of a `caption` attribute the vendor schema rejects. Buttons accept states 0, 1 and Error; an indicator accepts numbered states with `value`.
- **`animations_json` writes visibility animation.** `{"visibility":{"expression":"{AutoRunning} = 0","expressionTrueState":"visible"}}` produces `<animations><animateVisibility ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦/></animations>`.
- **`gotoButton` captions are now a `<caption>` child**, which is the shape its schema expects; a `states` face would be invalid.

### Verified

- `Displays/Arya Control.xml` was generated through these writers and validated against Studio's own **`Gfx-ME17.xsd`: 0 errors** ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â two stateful push buttons, a value-triggered mode lamp, two navigation buttons and two visibility-animated objects.
- Rendered to `artifacts/ftview-arya/Arya Control.png`.
- Not yet imported into a live Studio application: Studio started in Demo Mode and the application did not finish loading during this run, so the schema is the acceptance evidence here.
## [0.17.2] - 2026-10-28

### Changed

- The FTView skill now says how applied displays reach Studio (`ftview_studio_import_prepare`, then the Graphics Import Export Wizard) and corrects the object-contract count to the 34 drawable types.
## [0.17.1] - 2026-10-28

### Fixed

- **`ftview_apply` now composes write paths from the resolved target's `displayPath`.** The host may return an `FsTarget` object from `fs.resolve`; interpolating it produced `[object Object]` in child paths instead of the folder the caller named. `targetPath()` normalizes both shapes, and the apply existence check still runs against the resolved target.
## [0.17.0] - 2026-10-28

### Added

- **`ftview_studio_import_prepare`** packages displays from an applied export for Studio's Graphics Import Export Wizard: it copies the selected `<gfx>` display XML files, writes the `gfxImport` batch file, and returns the wizard steps. Non-`<gfx>` files are refused.
- **Verified end to end on this host**: the wizard (right-click Displays > Import and Export) imported `Arya Proof.xml`; Studio created `GFX\Arya Proof.gfx` (104,960 bytes), listed **Arya Proof** in the Displays tree, and opened it in the editor. A pre-import backup of the application is kept under `backups/ftview/Carpenter_EPS_Laminator001/pre-proof-import-20261028T050943Z`.
## [0.16.1] - 2026-10-28

### Fixed

- **Copying a real Studio ME display produced schema-invalid XML.** `ftview_draft_display_add` renamed the copy by writing a `name` attribute onto the root, but a ME display is named by its file and its root is `<gfx>`, which `Gfx-ME17.xsd` rejects ("The 'name' attribute is not declared"). The rename now rewrites the name only on the legacy `<display name="ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦">` shape and leaves `<gfx>` untouched; the file name is the display name.
## [0.16.0] - 2026-10-28

### Changed

- **`ftview_export` now reports asset freshness instead of only warning.** Its result carries `assets: { tags, alarms }` as `fresh`, `stale` or `missing`, and when either is not fresh the `next` list names `ftview_studio_export_prepare` (with the right `kind`) so the model refreshes the snapshot through the wizard and accepts it, rather than binding against an old file.
## [0.15.0] - 2026-10-28

### Added

- **Alarm export is now a prepared path.** The Alarm Import Export Wizard is hosted by Studio (it runs inside `VStudio.exe`); `ftview_studio_export_prepare { kind: "alarms" }` returns the exact Studio steps, the store folder and the `Alarms.xml` it must produce. `ftview_studio_export_accept { kind: "alarms" }` validates the `<alarms>` XML and copies it.
- Verified on this host: export alarm configuration -> Next -> Finish wrote `Carpenter_EPS_Laminator001\Alarms.xml`, 34,559 bytes, root `<alarms version="1.0">`.
## [0.14.1] - 2026-10-28

### Fixed

- The 0.14.0 skill exceeded its 8000-byte budget (the new export section pushed it over; `pnpm test` caught it after
  publish). The skill is trimmed back under budget with the prepare/accept workflow kept.
## [0.14.0] - 2026-10-28

### Added

- **`ftview_studio_export_prepare`** resolves an application's `.med`, verifies Rockwell's Tag Import and Export Wizard is installed, and returns the exact steps and destination file. It does not click anything.
- **`ftview_studio_export_accept`** validates what the wizard produced ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â tag CSV header and row count, or an `<alarms>` XML ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â and copies it into an export folder. Empty or wrong-shaped files are refused, so a failed run cannot become a silent stale asset.
- The FTView skill documents the prepare ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ wizard (computer use) ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ accept workflow for fresh tags and alarms.

### Notes

- Rockwell's wizards are desktop dialogs. UIA, Win32 messages, browse-dialog automation and coordinate input were tried against them and are not reliable enough to ship; the harness's computer use is the actuator, and the two tools above make its result verifiable. Application Manager backup was also attempted and fails on this host ("Class not registered").
## [0.13.1] - 2026-10-28

### Fixed

- **`ftview_export` no longer claims to export alarms and tags.** An ME application folder does not contain
  `Alarms.xml` or a tag CSV; those exist only when someone exports them from Studio's Alarm Setup / Tag Database
  into the store. The tool now says it exports displays and global objects, copies an existing snapshot **only if
  present**, reports its age, and the warnings state that the files are not part of a normal application. Skill and
  tool descriptions corrected to match.
## [0.13.0] - 2026-10-28

### Added

- **The object contract is now teachable.** `TYPE_GUIDE` documents all 34 drawable types with required attributes,
  allowed children and a construction note; `ftview_object_types all="true"` returns it alongside what the export uses.
- `multistateIndicator` and `polyline` are part of both the drafting contract and the renderer. The missing
  `multistateIndicator` was why the yellow **MANUAL** bar never drew ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it was dropped before rendering, and no
  attribute change could fix it.
- The FTView skill now documents the contract workflow (read `all`, read the used type, draft, validate, apply), the
  image-name and reference-object rules, and the preview's fidelity limits.

### Fixed

- Reference objects take **all** local attributes over the base, so a reference multistate keeps its own
  `currentStateId` instead of the base's state.

### Verified

`Load Conveyor Screen` now draws the MANUAL bar and the header/footer exactly where Studio puts them; `Main Screen`
draws the logo, triangles and round lamps. 66 FTView tests, 12 renderer tests, 69 bundle tests.
## [0.12.1] - 2026-10-27

### Fixed

- **The generated tool reference was stale.** `ftview_object_types` gained the `all` parameter in 0.12.0, but
  `docs/reference/tools.md` was generated before that edit and `pnpm test` caught it only after the release was
  published. The reference is regenerated; no tool behaviour changed.
## [0.12.0] - 2026-10-27

### Added

- **Every drawable element type is a drafting target.** `ELEMENT_TYPES` is the 33-type contract behind
  `ftview_draft_object_add`; an unknown type is refused with the candidate list, and geometry defaults (`left`, `top`,
  `width`, `height`) are filled when omitted. `ftview_object_types all="true"` lists the contract, what the export uses
  and what it does not.
- **Global Objects and images in the app preview.** `/engineering/ftview/globals` resolves `isReferenceObject` bases;
  `/engineering/ftview/image` serves `Images/` with case-insensitive, extension-optional lookup (Studio names
  `Equilateral triangle` while the file is `Equilateral triangle.bmp`).
- **Shape fidelity**: `circle` and `ellipse` draw ellipses, rounded shapes get a radius; reference objects keep the
  base object's children and only take local bindings, so header/footer content is no longer dropped.

### Verified

Real screens rendered with Studio as the oracle: `Main Screen` now shows the CARPENTER logo, the green/red triangles and
circular loader lamps; `Load Conveyor Screen` matches the Studio layout apart from the alarm banner placeholder and the
`MANUAL` multistate bar (see Known gaps). 68 bundle tests, 65 FTView tests, 11 renderer tests.

### Known gaps

- The alarm banner/list draws a labelled placeholder instead of the runtime message.
- A reference multistate whose base state is value-triggered can render the design-time state instead of the runtime
  one (`MANUAL` bar on Load Conveyor).
## [0.11.1] - 2026-10-27

### Fixed

- **Image objects resolve by name, with or without an extension, case-insensitively.** A display refers to
  `imageName="Equilateral triangle"` while the store holds `Equilateral triangle.bmp`; the route required an extension,
  so every image 404'd and drew a placeholder. Names are trimmed and matched against `.bmp`, `.png`, `.jpg`, `.jpeg`
  and `.gif`.
- The preview harness can inline `Images/` as data URLs, which is how the logo and the triangle indicators were
  verified: with the real Images present, `Main Screen` now draws the CARPENTER logo and the green/red triangles.
## [0.11.0] - 2026-10-27

### Added

- **Global Objects load in the preview.** The face fetches `/engineering/ftview/globals` and resolves every
  `isReferenceObject` against its base, so the header, footer and navigation highlight appear in the app instead of
  empty placements. This was the largest visual regression against Studio.
- **Images render in the preview.** A new `/engineering/ftview/image` route serves `Images/<name>` with a file-name
  whitelist, and the face resolves every image through it.
- **Shape fidelity.** Buttons and indicators honour StudioÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s `shape` attribute: `ellipse` draws a circle (status lamps
  were rectangles), rounded shapes get a corner radius.
- **Drafting accepts every drawable element type.** `ftview_draft_object_add` validates the type against the 34-type
  contract (`panel`, `group`, shapes, all button kinds, numeric/string fields, bar graph, gauge, trend, list selector,
  alarm objects, recipe, ActiveX, symbol, reference/global object) and rejects an unknown type with the candidate list.

### Verified against Studio

The reference screenshot of `Load Conveyor Screen` in Studio is committed at
`artifacts/ftview/studio-load-conveyor.png`; comparing it with the preview identified the three gaps above
(header/logo via globals and images, and circular indicators).
## [0.10.9] - 2026-10-27

### Fixed

- **Fit did not fit.** The rendered SVG carries the display's pixel size (`width="1280" height="1024"`), which is right for
  the PNG export and wrong inside a narrow preview pane: the drawing kept its intrinsic size and the pane showed a crop of
  it, so Fit and 100% looked identical. Fit now renders through `responsiveSvg`, which overrides the size, keeps the
  `viewBox` and preserves the aspect ratio; 100% still shows the full-size drawing with scrolling. Found by driving the
  running app with computer use, not by a unit test.
## [0.10.8] - 2026-10-27

### Added

- **Compare view.** The previewÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s **Compare** action loads the same display from a second export folder through the
  display route and shows both renders side by side with their labels, so an edit can be judged before it is applied.
  The second folder is asked for by name, nothing is written, and the button toggles the pane off.

### Changed

- Phase 4 of the preview plan is complete: inspect, navigate, back, PNG export and compare.
## [0.10.7] - 2026-10-27

### Added

- **Interactive preview.** Every rendered object now carries its type and name, so a click opens an inspector with the
  objectÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢s attributes, its connections, its state count and, for a `gotoButton`, an **Open display** action.
- **Navigation.** Double-clicking a `gotoButton` (or using the inspector) loads its target display through the new
  `GET /engineering/ftview/display?root=&name=` route, with a **ÃƒÂ¢Ã¢â‚¬Â Ã‚Â Back** history. The route accepts display file names
  only and refuses traversal.
- **PNG export** of the current view from the toolbar.

### Known gaps

- Side-by-side compare of two versions of a display is not in this release; the rest of phase 4 is.
## [0.10.6] - 2026-10-27

### Added

- **`ftview_object_types`.** Catalogs the object types the open export actually uses: how many of each, every attribute
  seen with its usage count and up to three example values, and example names. Ask for one `type` to get its attribute
  table ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the answer an agent needs before authoring, instead of guessing attribute names until the XSD refuses.
- **`ftview_design_check`.** Rule-based findings from the `view` corpus: touch targets under 44 px (`VIEW-HPM-02`),
  controls with no base caption (`VIEW-HPM-01`), text contrast below 4.5:1 (`VIEW-COLOR-01`) and displays no
  `gotoButton` reaches (`VIEW-NAV-01`). Every finding names its rule and its evidence.

### Changed

- FactoryTalk View read surface: 7 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 9 tools; bundle total 100 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 102.
## [0.10.5] - 2026-10-27

### Added

- **Live values in the preview.** `GET /engineering/ftview/live?root=<export>&ip=<controller>&slot=<n>&tags=A,B` maps each
  requested HMI tag through the export's own `Address` column and reads the controller tags over EtherNet/IP with the
  driver the L5X live row uses. It is read-only, needs an explicit IPv4 address and slot, honours an optional allowlist,
  and reports a memory tag as `not_live` rather than inventing a value.
- The preview's toolbar has a **Live** toggle: it asks for the controller address once, stores it locally, polls the
  route every 500 ms, feeds the values into the renderer (so animations, bars and numeric fields move) and shows
  `N live, M failed, K not live`.

### Known gaps

- The route is served only when the host provides a web server; a CLI host keeps the tool surface without live values.
- Live reads have not been exercised against a controller in this round; the transport is the same driver the L5X live
  row already uses, and the route is unit-tested with an injected reader.
## [0.10.4] - 2026-10-27

### Added

- **Animations evaluate.** `animateVisibility` expressions (`{Current_Screen} = 6`) are evaluated against known tag values;
  an unknown tag leaves the object in its base state instead of hiding it. The expression reader covers tag references,
  numbers, strings, the six comparisons and `AND`/`OR`.
- **Reference objects resolve against Global Objects.** Objects with `isReferenceObject="true"` and
  `linkBaseObject="Header_Footer.Group3"` inherit the base object's states, caption and children while keeping their own
  placement. On the Laminator `Main Screen` this restores the navigation highlight: selecting `Current_Screen=1` lights
  the Main Screen button, which is exactly how the runtime behaves.
- `scripts/ftview-preview.mjs` loads `Global Objects/*.xml` beside the display automatically and accepts
  `--tags '{"Current_Screen":1}'`, so a screen can be checked in isolation.

### Known gaps

- Values are still supplied by the caller; the controller route is the remaining phase-3 work.
## [0.10.3] - 2026-10-27

### Added

- **Graphs and selectors draw their data.** `barGraph` fills in proportion to its `Value` connection between `minValue`
  and `maxValue`, honours `fillDirection` (all four directions) and draws each threshold as a red mark. The Laminator
  `Main Screen` conveyor strips now show real proportions instead of empty boxes.
- `gauge` draws its scale arc and a needle; `trend` draws its grid; `listSelector` shows its caption. These types do
  not occur in the Laminator export, so they are covered by unit tests rather than a real screen.
- Numeric fields read the `Value` connection when they have no `expression` attribute, which is how most of the
  project's numeric displays are wired.

### Known gaps

- Values are supplied by the caller (tests and the preview harness); live controller values arrive with the route.
- Reference objects (`isReferenceObject="true"` with `linkBaseObject`) still render their local state only; resolving
  the base object in Global Objects is not implemented.
## [0.10.2] - 2026-10-27

### Changed

- **The display preview now runs the new renderer.** The client face is bundled from `packages/ftview-viewer/face/face.ts`
  against `src/render.ts`; the old closure bundle is kept as `lib/client-legacy.js`. The panel draws the SVG the
  renderer produces, shows the display size and object count, offers Fit/100%, and reports an invalid file instead
  of an empty tab.
- Preview id aligned with the bundle's contract (`dsh-engineering-ftview-viewer/display`), locale namespace
  `factorytalkView`.
- Tests: face registration, body rendering through the renderer, invalid-file handling, and bundle shape
  (70 bundle tests in total with the renderer suite).

### Known gaps

- `barGraph`, `gauge`, `trend` and `listSelector` still draw as plain faces; live values and navigation are not wired yet.
## [0.10.1] - 2026-10-27

### Added

- **A sourced renderer for the display preview.** The FTView face had no source, only a committed closure bundle. `packages/ftview-viewer/src` now owns an XML reader and an SVG renderer with tests, and `scripts/ftview-preview.mjs` renders any display export to SVG/HTML (plus a headless PNG) outside the app. On the real Laminator `Main Screen` it draws the object set the artifact dropped ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â **button captions from `<states><state><caption>`**, per-state colours, groups, and numeric fields ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â which is why the old preview showed blank navigation buttons.
- The renderer is not wired into the client face yet; the artifact still serves the panel. Known gap, stated rather than implied.
## [0.10.0] - 2026-10-27

### Added

- **`ftview_live_map`.** Maps every HMI tag in the export to the controller tag named in the CSV `Address`
  column (`::[topic]tag`), and reports coverage. It answers the question a live viewer depends on without
  contacting a controller and without inventing a value: on the Carpenter Laminator application **293 of 295
  tags are controller-backed** (topic `Laminator`), the other two are HMI memory.
- **Image assets are exported.** The vendor export engine does not copy bitmaps, so image objects could never
  render. `ftview_export` now copies the store's `Images/` tree into the export, and warns only when a display
  actually references an image and the store has none.

### Changed

- FactoryTalk View read surface: 6 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 7 tools; bundle total 99 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 100.

### Known gaps

- The live *values* route and the new viewer are not in this release. The mapping and assets they depend on are.
## [0.9.3] - 2026-10-27

### Fixed

- **`ftview_export` reported `0 display(s)` for a successful export.** The display count used a pattern that
  required a leading slash, but export paths are relative (`Displays/Main Screen.xml`), so every export said
  zero displays even when it wrote thirteen. The count now matches the paths the tool actually returns.
- **The tags and alarms warning now says what it means.** The copied `Alarms/Alarms.xml` and
  `Tags/<application>.csv` are snapshots Studio last wrote when those components were exported from their
  editors ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â not fresh data. The warning states that, and that the application export in Studio is what
  refreshes them. There is no supported headless export for either component; this is the honest boundary.
## [0.9.2] - 2026-10-27

### Fixed

- **The `engineering-standards` skill was missing from the catalog.** 0.9.1 mounted it by calling the skills
  service from inside the resources row's `apply()`, which only works if that service already exists at that
  row's turn ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â it mounts before the Optix row, so the skill was silently skipped (the tools still loaded).
  The skill is now its own plugin with `inject: ['skills']`, the same pattern the product skills use, so the
  host activates it when the service is up regardless of row order. A test asserts the injection list and
  registration.
## [0.9.1] - 2026-10-27

### Fixed

- **0.9.0 could stop AryaCode from booting.** The new row was inserted with `id: resources`, and `resources`
  is the name of a harness service other entries wait for; inserting a row under that id displaced the
  provider, so the boot reported `44 entries did not activate` and the application had to start with plugins
  disabled. The row is now `engineering-resources` (namespaced like every other non-product row), and a test
  rejects any future row id that matches a harness service name.
- **The resources row can no longer break a boot even if it fails.** Its `apply()` wraps registration and
  skill mounting in a guard that reports and continues; a reference surface must never be load-bearing.
- **The corpus is now actually shipped.** The assembler copied only `lib/` and `SKILL.md`, so the vendored
  package had no `corpus/`, `index.json` or `SOURCE.json` and `engineering_reference` would have failed at
  the first call. `scripts/assemble.mjs` now copies those files, and the packed artifact is checked for them.
## [0.9.0] - 2026-10-27

### Added

- **Model-agnostic engineering resources: a local standards corpus.** 34 authored pages across six domains
  (IEC 61131-3, Rockwell, Yaskawa, FactoryTalk View/HMI, Optix, craft) with front-matter provenance and 100+
  rule IDs (`CRAFT-NAME-01`, `VIEW-HPM-02`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦). `engineering_reference` lists the contents, ranks pages for a
  query and returns one page with its rules; search is deterministic and needs no network, embedding model or
  tokenizer. `scripts/gen-resources.mjs` validates every page (fields, domains, id/file agreement, rule
  uniqueness, size and word budgets) and generates `index.json`/`SOURCE.json`; `pnpm resources:check` fails on
  a stale index.
- **House-style profiles.** `engineering_profile` reads the conventions of the open project ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â L5X tag prefixes
  and case, seal-in and latch forms, comment density; FactoryTalk View palette, fonts, button geometry,
  navigation and popups ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â with counts, evidence and a `low`/`medium`/`high` confidence. A profile is evidence,
  not authority, and the tool says which project and SHA-256 it came from.
- **Generation follows the profile.** `ftview_draft_display_create` applies the profile's background colour and
  `ftview_draft_object_add` its button geometry and font when the caller omits them, reporting
  `profile_applied`.
- **New `resources` row and the `engineering-standards` skill.** The row mounts the two tools and the skill
  that tells a model to read the relevant page and the project profile before authoring. Tools 97 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 99, rows
  5 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 6.
- `docs/resources.md` documents the corpus, its provenance, the index commands and the profile schema.

### Known limits

- `engineering_review` (rule-based draft review) and MWI/Optix profile extraction are planned for 0.9.1; the
  corpus already applies to those products and the product validation still judges the result.
## [0.8.4] - 2026-10-27

### Added

- **`ftview_export` now brings the alarm setup and the tag database.** The vendor export server covers
  displays, global objects and project settings; alarms and tags live beside the application in the
  Studio project store and were missing from a "full" export, so tag bindings had nothing to check
  against. The export now copies `Alarms/Alarms.xml` and `Tags/<application>.csv` into the export in the
  same layout Studio uses, and reports a warning for each when the stored snapshot is older than the
  application database (on the commissioning application both were dated 2026-09-29 against a database
  modified 2026-10-27).

### Documentation

- FTView skill, getting-started and the handbook now describe the alarms/tags copy and its staleness
  warning instead of "the vendor export carries no tag CSV".
## [0.8.3] - 2026-10-27

### Documentation

- **A workflow handbook, generated from one source.** `docs/handbook/Engineering-Handbook.pdf` (7 pages),
  an editable `.docx` and a printable `.html` cover the four products: what each row needs, the shared
  read ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ act ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ hand-off loop, what the agent does, what stays human, and a "what proves what"
  table.
- **Six workflow diagrams** in `docs/diagrams/` (SVG masters and PNG): the shared loop and one per
  product, with agent steps, human steps and proof steps visually distinguished. They are embedded in
  `docs/getting-started.md` and in the handbook.
- The diagrams and handbook are **generated**, not hand-drawn: `scripts/gen-diagrams.py` owns the layout
  and `scripts/gen-handbook.py` the prose, so a changed workflow is one edit and one regeneration.
- README: the handbook in the documentation table and the generators in the Development commands.
## [0.8.2] - 2026-10-27

### Documentation

- **A getting-started guide for a new install.** `docs/getting-started.md` answers the first questions a
  fresh AryaCode user has: what each of the four rows needs installed, how to install from the market,
  the loop every product follows (read ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ act in a copy ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ hand off), a paste-ready first prompt
  per product, and the boundaries the bundle will not pretend away (Studio import/runtime, the missing
  tag CSV in a vendor export, MWI's IDE, Optix's bridge).
- README: a "New here?" pointer, a market-first Install section, corrected Status and Requirements
  (FTView authoring/export/schema, eleven L5X drafts) and the Getting started entry in the documentation
  table.
- Examples: section 7 now walks the real 0.8.x FactoryTalk View flow (vendor export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ author ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
  schema-validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply with the `BatchImport` manifest ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ verify the import), and a new section 9
  covers reading and authoring a FactoryTalk Optix project.
## [0.8.1] - 2026-10-27

### Added

- **FactoryTalk View ME authoring.** The surface no longer only edits an export someone handed over:
  - `ftview_apps` lists the ME applications installed on the host through the vendor export server
    (74 applications were listed on the commissioning host).
  - `ftview_export` exports one application to a NEW folder through `MEExportSvr` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no Studio window,
    no project change. Proven end to end: 19 files and 13 displays for `Carpenter_EPS_Laminator001`.
  - `ftview_draft_display_create`, `ftview_draft_object_add`, `ftview_draft_object_set`,
    `ftview_draft_object_delete` and `ftview_draft_object_order` author displays and objects against a
    source-positioned tree that keeps nesting (groups), connections and states.
  - **Vendor-schema validation.** Every changed display is validated against the installed
    `Gfx-ME*.xsd` through .NET before it can be applied; `ftview_apply` refuses a document the schema
    rejects (`SCHEMA_INVALID`). All 13 real displays in the Laminator export validate with zero errors.
  - `ftview_apply` now writes `Displays/BatchImport_<app>.xml` and `IMPORT.md`, the vendor's own
    one-step import list for Studio's Batch Import.
  - `ftview_verify_import` re-exports the application through the vendor engine and compares it object
    by object with the draft, listing differing attributes and missing/extra objects.

### Documentation

- `packages/ftview/SKILL.md`: an Authoring section (apps ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ export ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ author ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate) and an Import
  and verify section that states plainly which steps remain Studio and ME Transfer Utility.
- README: 97 tools, FactoryTalk View ME 22, and the 0.8.0 milestone.
## [0.7.0] - 2026-10-27

### Added

- **Ladder generation that cannot emit invalid NeutralText.** Three pieces:
  - `list_instructions` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the instruction catalog the composer validates: mnemonic, category, summary
    and operand slots with their kinds (BOOL, NUMBER, TIMER, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦), filterable. 41 instructions, covering
    every mnemonic the Laminator project uses (45 distinct across 860 rungs).
  - `compose_rung` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â builds one rung from a structure tree (`spec_json`) or a named pattern
    (`start_stop_latch`, `fault_latch`, `ton_delay`, `interlock`), resolves every operand against the
    export (including unqualified program tags and aliases), type-checks each slot, emits the export's
    own bracket style, and re-parses its output with the same parser `draft_rung` uses. Unknown
    instructions name the nearest catalog entries; a wrong operand count, a non-BOOL contact, a
    non-numeric value slot, an undeclared tag or an undeclared AOI is refused before anything is staged.
    Passing `program`, `routine`, `mode` and `rung` stages the rung in the draft; `fault_latch` stages
    its two rungs consecutively.
- **Rung comments are read and written.** The model read the `Comment` **attribute** only, so a real
  Studio export's 572 child `<Comment>` elements were invisible. `decodeRung` now supports both shapes,
  `draft_rung` accepts a `comment`, and `draft_rung_comment` sets or clears one on an existing rung.
  CDATA terminators in a comment round-trip through the existing escaping.
- **Documentation dimension.** `document_project` writes a handover bundle into a NEW folder and never
  touches the export: `PROJECT.md` (controller, revision, tasks, programs, counts), `io.md`/`io.csv`,
  `tags.csv` and `tags-studio.csv` (the `Tag Name,Description` shape Studio's Tags and Comments import
  expects), and `rungs/<program>.md` with each rung's number, comment, NeutralText, instructions and
  resolved tags. Filters: `include`, `programs`, `routines`, `rungs_per_file`.

### Documentation

- `packages/l5x/SKILL.md`: a Generate section (catalog ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ compose ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ validate ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ apply) and a
  Documentation section (bundle contents, the comment round trip, what the bundle cannot prove).
- README: 89 tools, L5X 44, and the 0.7.0 milestone.

## [0.6.0] - 2026-10-27

### Added

- **FactoryTalk Optix NetLogic reference.** The bundle vendors a pinned snapshot of Rockwell's
  [NetLogic cheat sheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet) (51 pages, commit
  `5e652541`) and exposes it as one tool instead of dumping C# into the prompt:
  `optix_netlogic` with no arguments returns the contents, a `query` ranks pages by title, topic and
  symbol before body text, and a `slug` returns that page verbatim. Every page result carries its
  `risk` (`normal`, `advanced` or `unsupported`, with the repository's own Advanced section marked
  unsupported), the upstream commit, a source URL and the upstream disclaimer that the snippets may use
  non-public APIs and must not be used in production as-is.
- **A FactoryTalk Optix skill.** The row previously had tools and no guidance; `factorytalk-optix` now
  names the surface, the NetLogic reader and its risk rule, and the report-before-claiming boundary.
- The `optix` row gains a `netlogic` switch (on by default). Off removes one tool and the guidance
  without touching the prebuilt engine.
- `scripts/sync-netlogic.mjs` is the only writer of the snapshot: it pins a commit, copies
  `pages/*.md`, and generates `index.json` plus `SOURCE.json` (commit, page count, risk counts).
  `pnpm netlogic:sync` refreshes it; `test/netlogic.spec.mjs` fails when the index and the pages drift.

## [0.5.0] - 2026-10-27

Commissioned against the Laminator fixtures: a real Studio 5000 ACD exported to a 5.4 MB L5X, a
real FactoryTalk View ME export, and two MotionWorks projects.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â FactoryTalk View could not read a real Studio export

`ftview_open` reported **0 displays and 0 tags** for a genuine ME export. Five independent causes:

- **The tag CSV delimiter was hard-coded to `;`** while Studio exports are comma-separated and use a
  leading `;` only as a comment prefix, so every data row parsed as one cell. The separator is now
  detected per line with quote awareness.
- **The header was assumed to follow the `###002` line.** A real export writes the header first, then
  `###002`, then `;Folders Section` / `;Tag Section` comments, and the parser took the first comment
  for the header. It now finds a `Tag Name` header on either side of the version line.
- **Short rows were rejected.** Studio omits trailing empty columns, so 29-column headers come with
  23-column rows. Only over-long rows are errors now.
- **`<gfx>` displays were refused.** ME display XML is `<gfx>` (Gfx-ME17.xsd), not `<display>`.
- **UTF-16 files were decoded as UTF-8**, producing a root element of `\0g\0f\0x`; BOM sniffing now
  selects UTF-16LE.

Also normalised the host contract: `scanApplication` accepts the `FsTarget` that `fs.resolve`
returns instead of calling string methods on it.

Verified on `Laminator/HMI/Main`: **18 displays, 361 tags, 0 parse errors** (was 0 and 0). Reading a
`<gfx>` export is supported; the staged edit tools were built for the `<display>` shape and are not
verified to rewrite `<gfx>` objects.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Studio 5000 checks drowned real findings in false positives

`run_checks` on the Laminator export produced 562 findings, 315 of them "unresolved reference", on a
project that compiles. Every one was an alias to module I/O (`In_FF_ModulePresent` ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢
`FanFold_StraightCut_AENTR:2:I.7`): aliases carry no `DataType`, their targets are not declared
`<Tag>`s, and the fast resolver stopped instead of falling back to the canonical one.

- `resolveSymbol` now falls back to `resolveTag`, and an empty type with a trailing numeric part
  resolves as a bit.
- A member of a module-defined or opaque type (`Drive_MCFG.CommFLT`, `Axis_MAH.PC`) and `S:`/`R:`
  system flags are reported as coverage limits, not unresolved references.

**562 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 264 findings; unresolved 315 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ 16**, with the unused-tag and multiple-write findings intact.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Studio 5000 edits

- **`add_tag` required a value for a scalar tag.** Studio defaults scalars to zero, so declaring a
  plain REAL was impossible without inventing a value; `value` is now optional and still validated
  when supplied.
- **Live reads refused aliases.** `read_live_tags` and `poll_live_tags` ran the write rule, so
  ordinary module-point BOOLs were rejected as "not a writable declared scalar". Reads and polls now
  take an alias's type from the canonical resolver; writes still refuse an alias and name the tag to
  write instead.
- **`export_acd_to_l5x` failed when Studio had the ACD open.** The SDK opens the file itself, so the
  normal case ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the project the user is working on ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â failed with "being used by another process". The
  export now copies the ACD and opens the copy, with the source hash re-checked before and after.

Verified end to end on the Laminator export: `draft_tag` (REAL, no value) plus a rung replacement
validated and applied to a 5,391,840-byte L5X.

### Fixed ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â MotionWorks IEC

- **`mw_get kind="block"` crashed with `KeyError: 'native_libraries'`.** The block interface is decoded
  against the installed libraries as well as the saved project; the read service now supplies the live
  inventory and falls back to the project's own registry when no IDE answers.
- **`mw_edit_variables` refused with "Live declarations disagree with saved baseline"** and nothing
  else. The refusal now names the missing, unexpected and changed declarations with their live and
  saved values.

Verified on both Laminator projects through the shipped engine: attach into
`backups/motionworks/<project>/<stamp>/`, then `workflow_check`, `pous`, `read_text`, `validate`,
`tasks`, `types`, `globals` and `library` all succeed (8 POUs, 5 tasks, ~170 globals, 297 types,
23 blocks each).

### Documentation

- `docs/optix-netlogic.md`: how the FactoryTalk Optix NetLogic cheat sheet should be carried ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a
  pinned snapshot, a generated index, and one `optix_netlogic` retrieval tool, with the risk flags and
  disclaimers the repository itself requires.

## [0.4.22] - 2026-10-27

### Fixed

- **No Python bytecode in the tarball, again.** 0.4.21 shipped three `__pycache__/*.pyc` files
  because a `py_compile` guard check ran in the checkout before packing, and `assemble.mjs` copied
  `code/` wholesale. They were inert ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the interpreter ignores a `.pyc` whose source no longer matches
  ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but a stale `staging.cpython-312.pyc` beside a changed guard is exactly the ambiguity this
  release line must not carry. `assemble.mjs` now excludes `__pycache__` and `*.pyc` at copy time, so
  the outcome no longer depends on someone remembering to delete them.

## [0.4.21] - 2026-10-27

### Changed

- **One backup tree for every engineering product.** Backups land in
  `<workspace>/backups/<product>/<subject>/<UTC stamp>/` with a `backup-manifest.json` naming every
  copied file and its SHA-256: `motionworks` for the `.mwt` and its expanded folder, `l5x` for the ACD
  or L5X, `ftview` for an export folder, `optix` for a Studio project export. Studio 5000 and
  FactoryTalk View take one on request (their writes already produce a new file or folder); Optix has
  the location but no automated action here, because its tree is the prebuilt component. Every skill
  states the same tree and a test fails when one drifts. `<workspace>/_backups` and the pre-0.4.21
  `<workspace>/backups/<project>/<stamp>/` layout are read-only history and are never written.
- **MotionWorks moves its copies into that tree.** `mw_project_open` writes
  `backups/motionworks/<project>/<stamp>/`, and both the bridge (`Get-DirectIdentity`) and the engine
  (`assert_direct_attached`) accept a record that points at the old `.motionworks/attached/backups`
  root, so an existing workspace keeps its verified backup with no migration and no second copy.

### Fixed

- **`pnpm pack` can no longer ship a stale component.** `scripts/assemble.mjs` refuses a component
  whose `lib/` is older than its `src/`, and the release procedure builds the components before
  packing. That is how the 0.4.20 market tarball came to carry the 0.4.16 MotionWorks build under a
  0.4.20 version.

## [0.4.20] - 2026-10-27

### Fixed

- **The bundle no longer ships Python bytecode.** `__pycache__` and `*.pyc` from the MotionWorks
  engine are ignored and excluded, so the tarball contains only the sources the plugin runs.

## [0.4.19] - 2026-10-27

### Fixed

- **Reads without a project name find the attached project.** `mw_get`, `mw_help` and `mw_search`
  resolve the single project with a verified pre-edit backup when no `project` is passed, so the
  direct workflow no longer fails with `NO_PROJECT`. A leftover `.motionworks/stage` copy no longer
  shadows that project, and two attached projects are reported as `AMBIGUOUS_PROJECT` with both names.

## [0.4.18] - 2026-10-27

### Fixed

- **MotionWorks edits no longer demand a body hash the caller had to guess.** `mw_edit_code` with
  `changes` hashes the body it is about to patch when `expected_body_sha256` is omitted; the backup
  and exact find/replace still guard the write, and a supplied hash is still honored.
- **A stale stage no longer makes the direct workflow ambiguous.** When a project has a verified
  pre-edit backup, `singleStage()` now prefers that project over old `.motionworks/stage` copies.

## [0.4.17] - 2026-10-27

### Fixed

- **A direct MotionWorks open was refused as "outside the staging root".** 0.4.13 promised a
  backup-first direct open, but the copy was written to `<workspace>/backups/<project>/<timestamp>`
  while the shipped bridge (`Get-DirectIdentity`) and the read-only engine (`assert_direct_attached`)
  only accept an identity record at `<workspace>/.motionworks/attached/records/<id>.json` naming a
  backup under `.motionworks/attached/backups`. The two never met: `mw_project_open` refused every
  project the retired solo plugin had not already attached, which is why MotionWorks work still looked
  like it required staging. The backup module now writes exactly that layout, verifies the copy before
  writing the identity, and refuses to replace an identity that no longer verifies.
- **A project already open in the IDE could not be edited.** Edits, compile and verify required a
  proven backup and failed with `NOT_ATTACHED` for a workspace project the IDE already had open.
  `mw_project_open` now attaches that project ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â writes the verified backup and reports
  `already_open` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â instead of calling `OpenProject`, because a reload over unsaved editor changes is
  data loss the backup cannot undo. An edit, compile or verify that finds an unattached workspace
  project takes the backup before it refuses.
- **`mw_edit_code` could not be given the hash it demands.** Its precondition is the SHA-256 of the
  saved body, and the tool tells the caller to read `text_body_sha256` from `mw_get`; `mw_get`
  returned the body but no hash, so the hash had to be found elsewhere or guessed and the edit failed
  with "Saved code differs from expected_body/hash". `mw_get` now returns the `text_body_sha256` of
  exactly the body it returns.
- **A read before the open still pointed at staging.** The engine guard's refusal text belongs to the
  retired staging flow and told the caller to stage a copy, which is what sent an agent back into
  staging after it had been removed from the workflow. The engine boundary now translates that
  refusal into `NOT_ATTACHED` with the fix "call `mw_project_open` first"; every other refusal keeps
  its own text.

### Documentation

- `packages/mwi/SKILL.md`: the backup lives under `<workspace>/.motionworks/attached/`, an
  already-open project is attached and not reloaded, and the edit section names the hash `mw_get`
  returns.
- `packages/mwi/README.md`: rows, backup layout, the attach-without-reload path and the guarded read,
  including what the identity check does and does not recompute.
- README: the MotionWorks row, the composition diagram, the tool groups and the safety section
  describe a direct edit. The row-default table and diagram now match the shipped defaults (every
  surface on), which the 0.4.15 release changed but the diagram still showed as off.

## [0.4.16] - 2026-10-27

### Added

- **FactoryTalk Optix OCR is configurable from Plugins.** The `optix` row now
  carries `ocrExecutable`, `ocrLanguage` and `ocrTessdataDirectory`. A configured
  executable registers `optix_ocr`; an empty path keeps OCR off. An empty tessdata
  folder derives `tessdata` beside the executable. OCR still requires the preview
  browser and one matching tab, because it reads the rendered canvas.

### Fixed

- **An empty preview URL no longer breaks `optix_preview` and `optix_screenshot`.**
  A saved blank `previewUrl` or `cdpUrl` now falls back to the loopback defaults
  instead of failing with `Invalid URL`.

## [0.4.15] - 2026-10-27

### Changed

- **Every tool surface ships on.** A fresh install no longer hides the expensive
  halves: L5X gets `editing`, `studio`, `live` and `allowWrites`; MotionWorks IEC
  gets `edit`; FactoryTalk Optix gets live authoring, destructive operations,
  exported-method invocation, the emulator preview and preview input. The defaults
  live in each row's `Config` schema, so the Configure page shows them on and a
  read-only profile can still switch them off.
- Docs, row descriptions and the generated tool reference now describe the
  on-by-default behaviour. `docs/architecture.md`, `README.md`, `cordis.patch.yml`
  and the settings page copy were updated with the schemas.

## [0.4.14] - 2026-10-27

### Added

- **FactoryTalk Optix has a Configure page.** The `optix` row now mounts through
  `entries/optix.js`, which owns a volatile config schema and hands the prebuilt
  `@aryacode/dsh-tool-ft-optix` plugin plain options. Configure can set the Studio
  bridge origins and token, live authoring, destructive operations, exported-method
  invocation, the emulator preview and preview input. Live authoring is on by default from 0.4.15; the Configure page can
  switch it off. Reads work as soon as a project with the Studio bridge is open.
## [0.4.13] - 2026-10-27

### Changed

- **MotionWorks edits the real project again.** `mw_project_open` and `mw_ide_start` now take a
  workspace `.mwt` and work on its files directly. Before the first write they copy the wrapper and
  the expanded project into `<workspace>/backups/<project>/<timestamp>/`, hash every copied file in
  `backup-manifest.json`, verify the copy, and reuse that backup on later attaches. `mw_apply` saves
  in place; there is no sync-back step.
- **Staging is optional.** `mw_project_stage` remains for a sandbox copy, but the skill and tool
  descriptions lead with the direct path.

## [0.4.12] - 2026-10-27

### Fixed

- **The MotionWorks workspace setting was ignored.** `workspace` is volatile, so it arrives as a
  live reference; passing the reference to `configureWorkspace` did nothing. The row now unwraps it
  with `text()`, so the value saved in Configure is the folder the tools search.

## [0.4.11] - 2026-10-27

### Fixed

- **MotionWorks editing tools never mounted even when the switch was on.** A `.volatile()` config
  field reaches `apply()` as a live accessor, so `config.edit === true` was always false and the
  seven edit tools were never registered. Every row now resolves switches through
  `entries/config.js` (`flag`/`list`).
- **Flipping a switch did not take effect until the row was disabled and re-enabled.** The loader
  commits volatile-only changes without re-running `apply()`, then emits `loader/volatile-update`.
  The L5X and MotionWorks rows now mount and unmount their optional surfaces from that event.
- **MotionWorks looked for projects in the profile directory.** The host does not always pass the
  session cwd, so `workspaceOf()` fell back to `process.cwd()`. The row now carries a `workspace`
  setting (shown in Configure) and falls back to the `mwi.workspace` marker in the profile, then the
  process directory. Project discovery follows directory junctions without looping.

## [0.4.10] - 2026-10-26

### Fixed

- **The row settings page sat on "Loading configurationÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦".** The Plugins page snapshots a row's
  configuration form once when it opens and does not subscribe to it, so a form that was still
  loading at that moment never produced the switches. The page now reads the live form from the
  client `configForms` service, whose `get` starts the one describe fetch, and subscribes to it;
  the switches appear when the settings settle, and a row with no configuration says so instead of
  loading forever.
- **The row switches were not served to Settings at all.** The config fields were plain
  `z.boolean()` values, and the settings domain only publishes fields marked `.volatile()`; the
  rows therefore had no settings namespace for the page to bind to. `editing`, `studio`, `live`,
  `allowWrites`, `allowedAddresses`, `ftview.edit`/`studio` and `mwi.edit` are now volatile, so the
  Configure page edits the running row instead of remounting it.

## [0.4.9] - 2026-10-26

### Fixed

- Republished the row settings pages with the client half's declared service list taken from every
  bundled face rather than the two viewer faces. Same pages and same defaults as 0.4.8; this build is
  the installable one.

## [0.4.8] - 2026-10-26

### Fixed

- **The product rows had no settings page.** The bundle's client half never registered a
  `plugins.row.config` entry, so the Plugins page showed no Configure control for `l5x`, `ftview` or
  `mwi`, and the switches the README documents were unreachable without editing the profile patch by
  hand. `scripts/faces/settings.js` now registers one page per row: L5X editing, the Studio 5000 SDK,
  live EtherNet/IP and the two live writes; FactoryTalk View ME edits and the Studio handoff;
  MotionWorks IEC edits. Values are staged and saved through the row's own configuration form, and the
  defaults are unchanged.

## [0.4.7] - 2026-10-25

### Fixed

- **`allowWrites` could not be reached from the L5X row.** The composite entry mounted the live entry
  with no config, so the write switch had no path from the Plugins page. `entries/l5x.js` now declares
  `allowWrites` and `allowedAddresses` and forwards both into the live entry; the write tools still
  refuse without per-call approval.

### Documentation

- README: the safety section states the two keys a live write takes, the tool groups list all seven
  EtherNet/IP tools, and the L5X count is 40 (84 with Optix).
- `docs/examples.md`: a live section covering batch reads, discovery, the controller clock, the trend,
  and a supervised write with the exact fields the reader must see and the refusals they may hit.
- `docs/architecture.md`: a new EtherNet/IP section ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the two workers, the transaction engine's deadline
  and decoding, and the four gates that stand between a write request and a controller.
- `docs/port/l5x.md`: the live surface is recorded as seven tools with the driver call each one uses, and
  the unused capability (CIP subscriptions, UDT `Structure` reads) is named.
- `packages/l5x/README.md`: read and write tool tables, and the full live configuration row.

## [0.4.6] - 2026-10-25

### Added

The EtherNet/IP surface now uses the driver rather than one corner of it. Five new tools, all under the
L5X product row's `live` switch:

- `read_live_tags` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â up to 64 declared scalars in **one** request (CIP tag group) instead of one
  connection-and-read per tag.
- `read_controller_clock` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â controller identity plus the wall clock beside the workstation clock and the
  offset between them; reports "unsupported" on non-L8x models instead of guessing.
- `discover_controllers` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â bounded UDP broadcast discovery: address, product, revision, serial, status.
  Needs no address and no export.
- `write_live_tag` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â one declared scalar, **approval-gated**, then read back over CIP so the result is
  the controller's own value.
- `write_controller_clock` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â set the wall clock (L8x), approval-gated, read back.

### Safety

- Writes need **two** independent switches: the row's new `allowWrites` config (off by default) **and** a
  human approving that exact operation. With `allowWrites` on and a `never` approval policy the tool
  refuses with `APPROVAL_UNAVAILABLE`; a declined prompt is `APPROVAL_DENIED`. Nothing reaches a
  controller before both pass.
- Every write validates against the open export first: declared, not an alias, no array dimensions,
  `ExternalAccess` not `None`, value inside the declared type and range (BOOL boolean; INT/DINT integer
  within range; REAL finite).
- A write whose readback differs from the requested value fails with `WRITE_NOT_VERIFIED` rather than
  reporting success.
- `test/live.spec.ts` covers the gating: switch off, policy `never`, declined prompt, wrong value type,
  and a UDT tag refused as non-scalar ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 70 tests in the package.

## [0.4.5] - 2026-10-25

### Changed

- **FactoryTalk Optix is vendored, so `dependencies` carries no plugin at all.** The Optix tree
  (`lib/`, `bridge/StudioMCPBridge.cs`, `templates/`, `locale/`, `icon.svg`) now lives in
  `packages/optix` and ships under `vendor/optix`; the `optix` row names
  `@aryacode/dsh-engineering/optix`. `@aryacode/dsh-tool-ft-optix` is gone from the manifest, which
  leaves one plugin to install and no component package to publish, keep in sync, or retire.
- The last dependency that remains is Optix's own runtime library, `playwright-core@1.61.1`, declared
  as a plain registry dependency.

One plugin now covers all four products: 5 rows, 79 tools, both previews, no component packages.

## [0.4.4] - 2026-10-25

### Changed

- **One row per product instead of one per surface.** The Plugins page now lists five rows ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â `l5x`,
  `ftview`, `mwi`, `viewers`, `optix` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â instead of sixteen. Each product row mounts its whole surface,
  so one switch turns a product off instead of four.
- **The optional surfaces are the row's config.** `entries/l5x.js` mounts read + guidance and takes
  `editing`, `studio` and `live` (all off by default); `entries/ftview.js` takes `edit` and `studio`
  (both on); `entries/mwi.js` takes `edit` (off). The defaults are unchanged ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â a read-only profile
  still pays only for the read surfaces ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but the toggle now lives with the product it belongs to.
- Row ids change from `l5x-read` / `ftview-edit` / `mwi-verify` to `l5x` / `ftview` / `mwi`, so a
  profile's per-row enable state resets once on upgrade. The product-level defaults are identical.
- Legacy subpath exports are kept (`./l5x/read`, `./ftview/edit`, `./mwi/verify`, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦) so a profile
  patch that still names one of them keeps working.

### Note

The grouping is plugin-side by choice: `cordis:group` exists in the patch format, but the Plugins
page skips group rows (`plugin-manager/src/index.ts`: "Group rows are containers ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ their children
carry the switches"), so a group switch is a shell feature rather than a bundle one. Collapsing the
row list is what a bundle can do on its own, without a harness change to maintain across DSH
upgrades.

## [0.4.3] - 2026-10-25

### Fixed

- **The vendored rows could not import their own libraries.** The trees under `vendor/` are the
  components' own code, and that code imports `fast-xml-parser`, `fast-xml-validator` and
  `st-ethernet-ip` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â but vendoring drops the component manifests, and the bundle declared none of them.
  At mount the loader reported `ERR_MODULE_NOT_FOUND` and every L5X and FactoryTalk View row failed to
  import, taking its tools with them. The bundle now declares all three at the versions the components
  pin, and `test/docs.spec.mjs` fails when a component dependency is not declared here.

## [0.4.2] - 2026-10-25

### Fixed

- **The bundle now installs and mounts in AryaCode.** 0.4.1 fixed the pnpm error, but the install still
  failed one step later, when the profile tried to apply the bundle: the patch's first entry targeted
  the `tool-capability-policy` row, and no such row exists in an AryaCode profile, so composition threw
  `dsh: [@aryacode/dsh-engineering] patch: entry "tool-capability-policy" not found` and the plugin
  manager rolled the install back ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â which is what the market card reported as *Cannot install*.

### Removed

- **The per-skill tool filter.** `policyOnly` / `toolPolicy` / `capabilities` are an AryaAI harness
  feature: AryaAI's fork of `@deepseek-ai/dsh-tool-skill` implements them, and the AryaCode line's copy
  of the same package does not. In this product the layer never filtered anything ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â an older harness
  skipped the missing row with a warning, the current one treats it as fatal. Rows are the switch:
  disabling `l5x-editing`, `l5x-studio`, `l5x-live` or `mwi-edit` unmounts that plugin and removes its
  tool schemas from the request, which is the same context saving by a mechanism this harness has.
- The patch is now **inserts only**, and `test/patch.spec.mjs` fails if any entry targets a row another
  bundle owns.

## [0.4.1] - 2026-10-25

### Fixed

- **The bundle could not be installed.** `dependencies` pointed at the Optix component through a GitHub
  release tarball, and pnpm refuses a URL inside any subdependency:
  `ERR_PNPM_EXOTIC_SUBDEP ... when blockExoticSubdeps is enabled`, which is the default. Every install
  from the market or the registry failed this way. The dependency is now the registry range
  `@aryacode/dsh-tool-ft-optix@0.2.1-rc.3`, which is the same build (its `lib/index.js` is
  byte-identical to the tarball's), so nothing in the bundle changes except that it installs.
- The `optix` row names that package too. The row previously kept the old `@deepseek-ai/` name while
  the dependency was renamed, which would have left the row unable to mount even once the install
  succeeded.
- `test/docs.spec.mjs` now fails when any dependency, optional dependency or peer is a URL, git, file,
  link or workspace spec, so the tarball spec cannot come back quietly.

## [0.4.0] - 2026-10-25

### Changed

- **One package, one client bundle.** The L5X ladder viewer and the FactoryTalk View ME display preview now ship inside `@aryacode/dsh-engineering` itself: `lib/client.js` registers once, under the bundle's own package name, and runs both faces inside that one factory. `@aryacode/dsh-engineering-l5x-viewer` and `@aryacode/dsh-engineering-ftview-viewer` are no longer dependencies, so the bundle declares no `@aryacode/*` dependency at all.
- The `l5x-viewer` and `ftview-viewer` rows collapse into one `viewers` row that mounts the bundle package itself. A client bundle is only discovered through a mounted row, and a package registers exactly one bundle, so both previews mount together; the tool rows stay independent of it.
- The bundle package gains a host half (`lib/index.js`): an entry that registers nothing of its own, present because the Shell scans the client face of packages that a row mounts.

### Added

- `scripts/build-client.mjs` builds `lib/client.js` from the two committed face bundles. The face bodies are copied verbatim, each in its own closure, and the merged plugin exports the union of both faces' services. `pnpm build:client` regenerates the artifact; `pnpm pack` runs it first.
- `test/client-face.spec.mjs` holds the three properties that would otherwise fail silently in the app: the registration id equals the package name, the factory materializes with both faces and merges their services, and `apply` mounts both previews. It also fails when `lib/client.js` is stale against its faces.

## [0.3.0] - 2026-10-23

### Added

- **FactoryTalk Optix as a bundle component:** the `optix` row mounts `@aryacode/dsh-tool-ft-optix` (Studio discovery, live authoring, validation, templates, preview and OCR) from a released component tarball. The standalone tool plugin is no longer a product entry or an installer dependency.
- The bundle now registers 79 tools: the 73 generated reference tools plus six Optix tools. Optix stays unlinked to a skill until one exists.

## [0.2.0] - 2026-10-23

### Added

- **MotionWorks IEC rows:** `mwi-session` (find, stage, open, start, status, worksheet, close), `mwi-read` (overview, list, get, search, references, review, help), `mwi-verify` (compile, diagnostics, saved-source baselines) and `mwi-edit` (code, declarations, structure, block insertion, POU packages, validation, apply), plus the `mwi-read-skill` guidance.
- The redesigned surface is 24 tools over the proven 32-bit COM bridge and the Python saved-model engine. It is verified live against MotionWorks IEC 3 Pro 1.19: stage, start, worksheet, close, saved-project reads, compile diagnostics, code replacement, declaration add, POU create/delete, block insertion and a POU package export/delete/import round trip.
- The edit row is off by default. Edits write only the staged copy and verify unrelated saved and native state.

### Changed

- The bundle is now 73 tools. MotionWorks IEC mounts here instead of as a separate plugin.

Notable changes to `dsh-engineering`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-10-23

### Fixed

- **L5X filesystem contract:** the harness filesystem resolves paths to opaque targets. The session now keeps a target for re-reads and a display path for outputs, so `export_acd_to_l5x`, drafts and SDK tools receive strings again instead of a provider object. Verified against SDK v37: a real ACD exported to a 3.0 MB L5X.
- **FactoryTalk View filesystem contract:** the read, editing and Studio entries adapt composed string paths to the harness target contract, so opening an export, applying edits and Studio discovery no longer pass raw paths to target-based operations.
- Link every L5X tool to the `rockwell-l5x` capability by exact name. The rebuilt tools use descriptive names (`open_project`, `draft_apply`, ...), so the `l5x_` prefix alone did not govern them and their schemas stayed visible when the skill was off.
- Correct the `factorytalk-view` guidance: the editing and Studio entries now exist and are enabled, so the skill no longer calls those operations out of scope.

### Added

- `docs/reference/tools.md` and `tools.json`: a generated reference for all 49 tools, with a test that fails when the committed reference or the policy coverage drifts from the registered definitions.
- `docs/examples.md`: end-to-end sessions for reading, staged edits, SDK verification, supervised controller access, live reads and FactoryTalk View.
- `docs/architecture.md`: the row model, service injection, configuration, client faces, distribution and compatibility.
- Package READMEs for `packages/l5x`, `packages/ftview`, `packages/viewer` and `packages/ftview-viewer`.

### Changed

- Rewrite the README for the current bundle: what it is, the eleven components and their defaults, install, composition, the policy table, tools, requirements, safety and known gaps.
- Add `docs:tools` and `docs:check` scripts; tests now run through tsx so they can read the TypeScript tool factories.

## [0.1.1] - 2026-10-23



- Add the FTView Studio entry `ftview-studio`: `ftview_studio_status`, `ftview_studio_preflight`, `ftview_studio_handoff` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â discovery of installs, schemas, help and the Add Component utility, changed-file preflight with Studio name restrictions, and the ordered manual import plan. No vendor utility is executed.
- Add 6 Studio tests: registration, discovery with a simulated install, absent install, changed-file preflight, unsafe-name blocker and the handoff plan. FTView suite is 26 tests.

- Add the FTView editing entry `ftview-edit`: `ftview_draft_display_set`, `ftview_draft_display_add`, `ftview_draft_tag_upsert`, `ftview_validate`, `ftview_apply` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â one operation per call, text-preserving transforms, re-parsed validation, and apply to a new folder that never touches the source. Row disabled until the old plugin retires.
- Add 8 editing tests: display attribute edit end to end, tag row update, display copy, draft clearing, unknown display, duplicate name, and existing-output refusal. FTView suite is 20 tests.

- Fold the FactoryTalk View display preview into the bundle as `dsh-engineering-ftview-viewer`, mounted by the `ftview-viewer` row (disabled until the old plugin retires, because both claim `.xml` previews).

- Add the FactoryTalk View ME read surface as `dsh-engineering-ftview`: six intents (`ftview_open`, `ftview_list`, `ftview_get`, `ftview_find`, `ftview_check`, `ftview_compare`), 3,557 schema characters, and a 2.5 KB `factorytalk-view` skill. No Python engine; display XML and the tag CSV are parsed in TypeScript.
- Insert `ftview-read` and `ftview-read-skill` disabled until the old FTView plugin retires, because both register the same skill name.
- Add 12 FTView tests: registration, every parameter described, open, list, get, not-found candidates, find, structural checks, compare and skill registration. Design recorded in `docs/port/ftview.md`.

- Fold the L5X ladder viewer into the bundle as `dsh-engineering-l5x-viewer`, mounted by the `l5x-viewer` row. The package carries the copied client source and the built closure-factory artifact re-registered under the bundle name, so the viewer keeps rendering while the standalone `ui-logix-project-viewer` product entry is retired.
- Verified in the dev app: after removing the standalone viewer from `PRODUCT_PLUGINS` and rebuilding, the same L5X document still renders its ladder view from the folded package, and the Plugins page no longer lists the standalone viewer card.

- Retire the old L5X plugin from the dev profile: `dsh-tool-l5x` is removed from its dependencies and its `l5x-tools` and `l5x-skill` patch rows are gone. The composed profile carries only this bundle's rows.
- Verified live after the retirement: the session listed the eleven read tools and the new `rockwell-l5x` description, with no `l5x_*` tool and no old skill text.

- Port the client face: the PLC trend card (`lib/client.js`, 17.2 KB closure-factory bundle) registered for `start_plc_trend`, with its locales, styles and trend model. The card mounts independently of every tool row.
- Record that the old plugin's `face.ts` and `Studio5000.tsx` were dead code ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â never imported by its client entry ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â so the two-rung ladder rail is not a ported feature. A ladder viewer for L5X documents would be new work.
- Add `dsh.client` metadata, a `tsdown.client.config.ts` bundle with the package name as its registration id, and the host build now emits both halves.

- Add the `l5x-live` entry: `poll_live_tags` and `start_plc_trend`, 2,971 schema characters, inserted disabled. Reads use the package's polling worker and its own EtherNet/IP connection, so no Studio, FactoryLinx or SDK is required.
- Tags are a real array of flat objects, not the old JSON string: a string is refused with a fix. The trend starts a session-owned job and states that live logic matching the export is unverified.
- Bring the polling worker and the `st-ethernet-ip` dependency into the package, and dispose owned workers when the plugin unloads.
- Add 4 live tests: registration, an undeclared tag, a JSON-string refusal and the trend job refusal. Suite is 60 tests.

- Add the supervised controller tools to `l5x-studio`: `controller_approval_status`, `capture_controller_snapshot`, `go_online`, `read_controller_mode`, `read_live_tag`, `change_controller_mode` and `download_project`. The entry is now 13 tools and 7,901 schema characters, still inserted disabled.
- Port the approval seam as a composition service: the three machine-changing actions refuse with `APPROVAL_UNAVAILABLE` before contacting a controller when the session policy is not `ask`, and proceed only on `allowed-once`. Downloads accept only a `verification_id` this chat produced from a passed build, checked against the built ACD and both L5X hashes.
- `verify_offline_l5x` and `build_acd_from_draft` now return a `verification_id` when the build passed and the review has no blockers.
- Add 4 approval-gate tests: status without the service, status with `ask`, a mode change refused before contact, and a download without a verification id. Suite is 56 tests.

- Add the `l5x-studio` entry with its offline half: `studio_sdk_status`, `studio_capabilities`, `export_acd_to_l5x`, `verify_offline_l5x`, `build_acd_from_draft` and `studio_review_evidence`. 3,914 schema characters, inserted disabled because it needs Studio 5000.
- The entry consumes the read entry's `l5xProjects` service and records ACD exports per chat, so a baseline is accepted only when both the ACD and the L5X hashes still match the export that produced them.
- Verified locally against the installed SDK: an ACD exported to L5X in 29 s, the export reopened by this parser, and a Studio-exported L5X built offline with `offline_build: passed`. The SDK refused to re-import its own export with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`; recorded in the port specification.
- Add 4 studio tests: registration, SDK preflight, capabilities and the unchanged-routine refusal. Suite is 52 tests.

- Add the draft family as its own `l5x-editing` entry: `draft_rung`, `draft_st`, `draft_routine`, `draft_tag`, `draft_tag_description`, `draft_udt_member`, `draft_udt_description`, `draft_validate`, `draft_apply`. One operation per call, accumulated per chat and project, validated against the project, then written to one new file.
- The editing entry consumes the read entry's `l5xProjects` service, so a project is opened once for both entries. It is inserted disabled: the read entry stays at 8,107 schema characters and editing costs 7,233 only when enabled.
- Add 7 draft tests: accumulation, argument refusal, validation hash, application to a new file, source preservation, overwrite refusal and draft handles. Suite is 48 tests.
- Update the `rockwell-l5x` guidance for drafting: boundary, one-operation-per-call, validate before apply, and the note that editing may be disabled in a profile.

- Port the `rockwell-l5x` guidance into the package: a 2.9 KB decision tree covering the read workflow, AOI and program scope rules, checks, comparison, reporting limits and revision floors. It is registered by `dsh-engineering-l5x/skill` and mounted as the stable `l5x-read-skill` row; the old 27 KB skill row can stay disabled.
- Add 3 skill tests: registration identity, body budget and frontmatter stripping, and a loud failure when the skills service is missing. Suite is 41 tests.
- Mount the L5X pilot as a bundle component: `cordis.patch.yml` inserts the stable `l5x-read` row, `dsh-engineering-l5x` is a workspace dependency, and the Plugins card lists the component under Engineering. The dev profile no longer inserts the row itself.
- Start the L5X port in `packages/l5x`: four offline read tools (`open_project`, `project_overview`, `list_components`, `get_component`), 2,431 schema characters, every parameter described, results carrying `summary`/`data`/`coverage`/`next`, and failures carrying `code`/`message`/`fix`/`candidates`.
- Add `list_components` because the current 43-tool surface exposes no way to enumerate tags, UDTs, routines or modules; discovery exists only in the legacy twelve-tool API.
- Add the reference cluster: `search_logic`, `find_references`, `trace_dependencies`, `resolve_tag`, `usage_map`. The five tools that answered "where is this used" in the old surface collapse into two named intents plus address resolution and element mapping; the surface is now 9 tools and 6,154 schema characters with 31 of 31 parameters described.
- Complete the offline read surface with `run_checks` and `compare_projects`: findings filtered by rule or severity with review caveats, and a component-level diff that ignores timestamps and XML formatting. The surface is now 11 tools and 7,994 schema characters with 41 of 41 parameters described.
- Document and enforce export revisions: reading accepts any L5X revision 19 or later, flags revisions outside the observed matrix as `untested_revision`, and refuses anything older than 19. The revision-37 floor applies only to a Studio SDK build.
- Add 7 checks and comparison tests, including a real tag-description change and a zero-change comparison, plus 3 revision tests. Suite is 34 tests.
- Scope project handles to the chat that opened them. The first two-chat transcript made the second chat see a handle from the first and fail its listing with `AMBIGUOUS_PROJECT`; handles now live per chat.
- Resolve `AOI_Name::Member` in `trace_dependencies` against the AOI's declaration scope, and refuse an unresolved symbol with `UNRESOLVED_SYMBOL` and the scope fix instead of returning an empty graph. `find_references` coverage now states that external consumers are not visible.
- Add chat isolation, AOI-qualified tracing and unresolved-symbol tests. Suite is 38 tests.
- Document the composed layer, the skill-to-namespace policy, the measured tool exposure, the built-in target composition, the retirement list, and the replacement-map requirement for the flip.
- Record the classification: AryaCode's product catalog lists this bundle as AryaCode-authored with market distribution, so the Plugins page groups it under AryaCode and not Community.
- Record the switch model: a skill is the single per-product switch for guidance and tools, while the client faces (ladder viewer, ME display renderer, DXF viewer) are separate entries that stay mounted. The port shares one isomorphic parser between the host tools and each viewer.
- Specify the L5X port from measured failures: 43 tools, 132 undescribed parameters, nine JSON-in-string parameters, 97 error codes, and the overlapping reference, inspection and drafting clusters. The spec splits the product into `l5x-tools` (default), `l5x-studio` and `l5x-live` (both off), the skill and the independent client.
- Settle the four port decisions: two reference tools rather than one with a mode; `observe_logic` retires; no batch tool; the SDK entry owns the supervised lifecycle and `edit_offline_acd` survives as `build_acd_from_draft`.
- Add `AGENTS.md`: documentation is updated in the same change as the code it describes, diagrams are part of the contract, and known gaps stay explicit.
- Add `test/docs.spec.mjs`, which fails when the README policy table, the documented unlinked namespace, the changelog version heading, or the locale key sets disagree with the patch. Verified to fail on a dropped policy row and on a renamed prefix.

## [0.1.0]

- Add the engineering bundle: a phase-1, additive loader layer that targets the existing `tool-capability-policy` row and links `l5x_*`, `ftview_*` and `mw_*` to the skills that govern them.
- Keep `onDemand: false` so the bundle does not change the product-wide eager tool exposure Arya measured and kept.
- Insert no plugin rows, so existing profiles and product plugin ids are untouched.
