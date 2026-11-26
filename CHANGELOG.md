## [Unreleased]

### Added

- **A row costs nothing until its work starts.** Every engineering tool is now registered with a per-step
  condition (`ctx.tools.register(definition, { when })`), so the host declares a row's schemas only after
  this session loads a skill that names one of its tools. A default-on profile sent **174 tool definitions
  and 136,828 schema characters on every request** — about 34k tokens of tool surface on every turn; it now
  sends none of them, and the idle surface is the skill catalog at **1,586 characters**. `entries/activation.js`
  is the whole mechanism: `mount()` and `apply()` hand each part a proxied context that attaches the gate to
  every registration it makes, and the gate is open when this session marked the row's skill through the
  `skill` tool or a `/name` gesture, or when the last request header already declared one of the row's
  prefixes. The per-row table (prefixes → admitting skills) comes from the SKILL.md prose and
  `test/activation.spec.mjs` re-derives it from `docs/reference/tools.json`, so a prose edit that adds a tool
  name either updates the table or fails the suite. A skill that names another row's tool admits that row,
  which is how `engineering-standards` reaches the standards tools from an L5X session.
- **`entries/optix-skill.js`** registers `factorytalk-optix` with the row it belongs to, instead of from the
  `netlogic` switch.

### Changed

- **The harness floor is `^0.2.2-alpha.2`.** The `^0.2.1-rc.3` arm is gone because the older line's
  `tools.register` ignores its second argument: nothing breaks there, but every schema is sent, so that host
  cannot save the surface and is no longer claimed. `@deepseek-ai/dsh-tools` is `^0.2.2-alpha.2` as a peer
  and `0.2.2-alpha.3` for development — the release that first carries the feature is `dsh-v0.2.2-alpha.2`.
- **The `netlogic` switch drops one tool, not the product.** With the skill moved to the row, switching
  `netlogic` off removes `optix_netlogic` and keeps the FactoryTalk Optix guidance and the other 31 tools.
- **The documentation states the new contract.** README, `cordis.patch.yml`, `docs/architecture.md` (a new
  **Conditional admission** section), the component contract's context budget and the Optix pages all
  describe a mounted row that is not yet a declared one, the one step of latency, header recovery and the
  older-host degradation; `components.json` records the idle ceiling as
  `contextBudget.defaultOnCatalogCharacters`.

## 0.104.2 — 2026-11-24

### Added

- **The display preview describes each object it cannot draw instead of leaving it blank.** The panel drew
  34 hand-kept element names against a schema that declares 91, so 29 real objects were dropped with no
  trace and a blank area in the preview looked authored. `packages/ftview-viewer/src/vocabulary.generated.ts`
  is now generated from the same `Gfx-ME*.xsd` snapshot the drafting tools read — 91 elements, each mapped
  to a painter family with its attributes, children and required parts — and the renderer draws each family
  or a labelled placeholder that names the reason: an ActiveX control, an arc, a `polyPolygon` carrying one
  `innerPolygon`, a `trend` whose series the export does not carry. `renderDisplayWithReport` returns a
  `RenderReport` with the drawn count, every placeholder, every element outside the installed schema and
  every coordinate rule it applied; the face shows that as a coverage chip and a panel, and the inspector
  names the object's family and the rule its geometry was read with.

### Changed

- **The preview reads a staged draft's geometry as the editor will.** Coordinates inside an object are a
  percentage of its own box when written and display pixels when exported, and the preview applied the
  pixel rule to both, so a drafted `line="0 0 100 0"` was drawn in the top-left corner. `geometry.ts` now
  resolves `line`, `path`, `polygon` and `innerPolygon` by an explicit rule, detects draft versus exported
  XML from the file's own marks (`<displaySettings>` and the `visible`/`wallpaper`/`isReferenceObject`
  flags) and reports which rule it used; a `Draft`/`Export` badge states it in the panel, and
  `ftview_render` gained the same `mode`, drawing a staged draft with draft coordinates and returning the
  object names outside the installed schema.
- **The FTView face uses the shell's theme tokens and its own dictionaries.** Every colour, border, radius
  and the type scale come from `--dsw-*` tokens, so light and dark follow the shell, and the toolbar,
  inspector and artifact card strings — including the two prompts — moved into the `factorytalkView`
  locale dictionary in English and Chinese, with 24 px minimum targets and visible focus on every action.

### Fixed

- **An object's own settings are no longer drawn as objects.** The renderer decided what was an object with
  a hand-kept list of part names, and 10 of the 31 parts the schema declares have no global part type, so a
  `<caption>` or a bar graph's `<thresh1Value>` was drawn as an object of its own: the installed Probe
  display reported 19 objects and 41 drawn shapes, and the captions appeared as one letter per line. The
  generator now emits every part name, the renderer excludes all of them, and the object count matches the
  file.
- **An arc with equal angles is the filled ellipse the editor draws**, and a **bar graph with no value**
  paints its frame plus a dashed "no value" outline instead of nothing at all. Both were measured on an
  installed export: `startAngle="0" endAngle="0"` is the navy ellipse Studio paints, and a `barGraph` with
  `backStyle="transparent"` and `borderStyle="none"` leaves a blank spot where the design has a bar. A
  list's own element name is now an annotation in a contrast-checked colour, so it stays readable on the
  navy of an alarm banner.

## 0.104.1 — 2026-11-24

### Fixed

- **FactoryTalk View ME drafts now speak the schema the host actually has.** The drafting contract was a
  hand-kept list of 34 element names. Eight of them — `globalObject`, `listSelector`, `maintainButton`,
  `numericInput`, `recipe`, `referenceObject`, `stringInput`, `trend` — are declared by no ME schema
  (`numericInput`, `recipe` and `stringInput` are Studio SE vocabulary; the other five exist in no schema
  at all), and 65 element types the vendor really ships were refused, 18 of them used by Rockwell's own
  demo applications (`closeButton` 29 times in the shipped demos, `maintainedButton` 14, `macroButton` 13).
  The vocabulary is now resolved at run time from the host's installed `Gfx-ME*.xsd` — 91 display object
  types on this host — and falls back to a committed snapshot on a machine without Studio, so reads and
  drafts work either way. `packages/ftview/src/xsd.ts` is the resolver: it takes the display vocabulary
  from the root element's inline complexType, merges base chains, attribute groups and global attribute
  references (the `use="required"` written on a ref is the only way `activeX`'s `classId` becomes
  mandatory), descends nested containers, and reads enumerated values, numeric bounds **and pattern
  facets** — the vendor's `colorType` is a union of a `#rrggbb` pattern and 147 named colours, and a
  resolver that read only the enumeration refused every hex colour written in a Rockwell-authored display.
- **The draft path refused nothing until the whole display was built.** `ftview_draft_object_add` accepted
  an attribute the schema does not declare for that element and a value outside its enumeration, and the
  vendor gate at `ftview_validate`/`ftview_apply` then refused the document after the draft existed. Both
  `ftview_draft_object_add` and `ftview_draft_object_set` now check the object against the schema at the
  call that makes the mistake: an element the schema does not declare is refused, with the real ME
  counterpart named for the eight invented names (`maintainedButton`, `numericInputEnable`,
  `stringInputEnable`, `displayListSelector`, `recipePlusTable`, and for `referenceObject` the
  `isReferenceObject`/`linkBaseObject` attribute pair), and an attribute, enum value, pattern or child
  element that element does not declare is refused with the values the schema offers. A required
  attribute is reported to a caller that asks for the whole set rather than blocking a partial object the
  engineer means to finish, and a legacy `<display>` export keeps its own shape as the contract.
- **The caption shape and the state-face domains were guessed, not read.** 48 types carry a `<caption>`
  child and declare no caption attribute — the hand-kept list held 12 of them, so the other 36 would have
  been written with an attribute their own schema rejects; `text` and `numericDisplay` are the opposite
  family and were claimed to take a `<caption>` child; `gotoButton` and `rampButton` were claimed to take
  `<states>`. State faces were capped at three with ids `0|1|Error` for every type: `multistateButton`
  allows 254 faces, `symbol` and `multistateIndicator` 1999, and `interlockedButton` and the list and
  control selectors allow **no** `Error` face, which the writer used to emit. Both are now taken from the
  schema per family.
- **`ftview_object_types` counted parts as objects.** Its `used_types` reported `caption`, `state` and
  `animations` among the object types in an export, because it counted child elements. Parts are filtered
  out, and the count is now the objects that occur.
- **A drafted display was tagged for a Studio release the host may not have.** The display document was
  written with `Gfx-ME17.xsd` hardcoded; the Add Component Tool resolves that name against its own
  release, so a display tagged for a version the host never installed imports as an empty display. The
  tag now follows the schema the vocabulary resolved, and an opened export's own version wins.
- **The state faces were one control's shape forced on every control.** The writer built every `<state>`
  the way a push button writes one — the colours on the face, plus a caption child with a font set, an
  alignment of `middleCenter` and `wordWrap` — and the installed editor refused it. On a draft of all 91
  object types Studio reported 142 schema errors, and 141 of them sat on the six types whose faces are not
  push-button faces: `controlListSelector`, `displayListSelector`, `listIndicator` and
  `pilotedControlListSelector` at 33 each (three faces × eleven attributes) and `symbol` at 9. The schema
  says otherwise: `listIndicatorStateType` declares `value` and `stateId` alone, and its caption child
  takes the words and colours with an alignment of `left|center|right` and no font at all;
  `symbolIndicatorStateType` declares `value`, `borderColor` and `stateId` with an `<imageSettings>` child
  and no caption, which is why a caption there answered `The element 'state' has invalid child element
  'caption'. List of possible elements expected: 'imageSettings'.` Faces are now written field by field
  where that control declares the field, Rockwell's defaults applied only where declared, a field with no
  home left out for Studio to fill, and a caption asked of a control whose faces carry none refused at the
  call that stages it rather than on import. Children are also emitted in the order the schema declares
  them — the writer used to put `<connections>` before `<animations>`.
- **`polyPolygon` could not be drafted at all.** `basicPolyPolygonDrawingObjectType` requires an
  `<innerPolygon>` child (`Gfx-ME16.xsd:2824`, `minOccurs="1"`), and the tool had no way to write a child
  that was not a caption, a state or a connection, so every attempt came back `The element 'polyPolygon'
  has incomplete content. List of possible elements expected: 'innerPolygon'.` `ftview_draft_object_add`
  now takes `children_json` — declared parts keyed by child element name, an array where the schema allows
  repeats — the writer emits them in the declared order, and `ftview_object_types` with `type=` reports
  `required_children`, so the requirement is visible before the attempt rather than after the refusal.
- **`group` was refused as "part of a display, not an object type".** It is declared by the schema
  (`groupType`) and is the most-used object in Rockwell's own demos at 465 occurrences, and the tool's own
  `parent` parameter already lets a caller add objects inside one; the reserved-element list that predated
  the schema contract still blocked it, so a drafted panel frame was impossible to author.
- **A repeated part was written once, and only the last one.** `packages/ftview/src/edit/operations.ts`
  kept the rendered parts in a `Map` keyed by element name, so a `polyPolygon` with two `<innerPolygon>`
  children — the only shape ME accepts, `minOccurs` 2 in practice — rendered the second row and dropped the
  first. The draft passed its own `engine-constraint:innerPolygon` check and the schema validation, because
  both read the draft; only the vendor refused the file, `A polyPolygon must contain at least 2
  innerPolygons.` The map now holds a list per element, every part is appended in the caller's order, and a
  regression test authors the two-row polygon and asserts both rows and their order in the rendered XML.
  Measured end to end: the display that failed the import for three rounds imported on the first attempt
  once the second row was written.
- **The import could not be verified in the order the tools asked for it.** `ftview_apply` deleted the
  edit draft it had just written, while its own next step and the generated `IMPORT.md` both say to run
  `ftview_verify_import` afterwards — which needs that draft as the only comparison basis, so it answered
  `NO_DRAFT` on every honest attempt. The draft is now kept and stamped with the folder it was written to
  (`appliedTo`), a new draft starts on the next authoring call in the same view, `get()` prefers the live
  draft and falls back to the applied one, `ftview_apply` refuses to write an applied draft twice
  (`DRAFT_ALREADY_APPLIED`), and `ftview_verify_import` resolves the applied draft when the caller omits
  `draft_id`. Measured on a real ME install: import, then verify, reports `0 staged object(s) missing` for
  the authored display.
- **A packaged display now installs at the root of the Explorer, not in a nameless folder.**
  `ftview_component_package` wrote `folder="\"` on every `<component>`, and the measured effect on
  Studio 15.0 is a folder row with **no name** between `Displays` and the display — the imported
  displays were there and correctly named, but the tree read as if the import had produced a blank
  entry. Installing the same file four ways settled the contract: with no `folder` attribute a new
  display lands at the root; `folder="Imported"` creates that folder; `folder="\"` creates the
  nameless folder; `folder="/"` imports the file, then logs no `Moving component` line and ends
  `Program completed with ERRORS.` (the move is also what relocates a display that already sits in a
  folder — a re-import without the attribute leaves it where it is). `packages/ftview/src/studio-assets.ts` now writes the attribute
  only for a named folder and drops a leading separator, `target_folder` defaults to the root, and
  the package spec covers each spelling.

### Changed

- **`ftview_object_types` reports the contract, not the export.** `all="true"` returns the element names
  the schema declares together with the schema it read; `type=<name>` returns that element's attributes
  with their allowed values, defaults and required flags, its child elements, and the craft notes for it —
  even when this export contains none of that type. `packages/ftview/src/catalog.ts` is now the craft
  layer over the schema rather than the source of the vocabulary.
- **The vocabulary snapshot is shipped and generated.** It moved to `packages/ftview/schema/me-schema.json`
  so the packager ships it (it was previously generated into `src/`, unused by any code), and
  `pnpm schema:ftview` regenerates it from the newest installed schema, recording the source file, its
  bytes and its sha256.
- **A new gate spec, replayed against the vendor's own writing.** `test/ftview-vocabulary.spec.mjs` (in
  the bundle suite) checks the resolver against a fixture XSD that exercises the four shapes the old
  generator missed, checks the committed snapshot declares the names the demos use and none of the eight
  invented ones, checks a host with no Studio still drafts against the fallback, and replays the 2,555
  attribute pairs and child sets harvested from 125 Rockwell-authored display files — the Displays folder
  of every installed ME demo as `ftview_export` wrote it — expecting no finding, so the draft-time check
  cannot refuse content the vendor software itself writes.
- **The ME knowledge collection now answers what the editor rewrites on import.** Authoring a display and
  re-exporting it does not return the document that was written: object geometry is a percentage of the
  object's own box on the way in and absolute pixels inset by one on the way out, a `<line>` is a box whose
  pen width is normalised to the box's short side, `fontSize` is write-only (`charHeight`/`charWidth` come
  back recomputed), and a panel's `cornerRadius` is dropped although the schema declares it.
  `pages/editor-rewrites.md` records each measurement with the pair of values that produced it, so a
  comparison that reports an object as "changed" can be read for what it is. `pages/export-import.md` records
  the measured Add Component Tool behaviour: the process can return exit code 0 before it writes
  `$AddComponent.txt`, so the log is awaited rather than read the instant the process exits, and the
  `folder` attribute decides where the display appears — no attribute is the root, a name creates that
  folder, `\` a nameless one, and `/` fails the move after the import.

## 0.104.0 — 2026-11-23

### Added

- **A knowledge plane, and five documentation tools on the product rows.** `packages/knowledge` is a
  shared retrieval source library (BM25 with `k1=1.2`, `b=0.75`, an exact-identifier layer whose pages
  are always included and marked `exact: true`, deterministic ordering and 4-decimal scores) whose
  `src/core.ts` and `src/html.ts` are copied into `packages/{l5x,ftview,migration,plc5,slc}/src/knowledge/` by
  `scripts/sync-knowledge-lib.mjs --check`. Each product exposes one tool — `l5x_docs`, `ftview_docs`,
  `migration_docs`, `plc5_docs`, `slc500_docs` — with exactly five actions: `contents`, `search`
  (≤8 hits, 200-character snippets), `read` (one page, ≤8,000 characters), `status` and `lookup`.
  Authored pages ship in the bundle; installed vendor help is indexed as structure only (titles, paths,
  sections, identifiers — never page bodies) and a `read` parses the local install at call time, so a
  machine without the vendor help answers `SOURCE_NOT_INSTALLED` rather than shipping vendor text.
  Revision guards answer `REVISION_REQUIRED`, `REVISION_UNVERIFIED` and `INSTRUCTION_NOT_IN_REVISION`;
  the L5X corpus adds two structural help shards (`l5x-help-37-05`, 5,493 pages; `l5x-help-36-00`,
  6,581 pages), a 328-mnemonic `instruction-versions.json` and a fail-open guard so an offline edit is
  never blocked by a missing versions file. `docs/reference/knowledge.md` is the contract and
  `docs/decisions/knowledge-plane.md` records why the package is a source library rather than a fourth
  workspace dependency.
- **The SLC 500 / MicroLogix read row.** A tenth component, `slc`, ships **off** by default with ten
  read-only tools (`slc500_capabilities`, `_open`, `_ladder`, `_find`, `_io_census`, `_io_config`,
  `_data_read`, `_processor`, `_database`, `_docs`), a 7-page authored `rslogix-500` corpus, a skill of
  the same name and a `.RSS` automation path that answers `SOURCE_NOT_INSTALLED`/`NOT_LICENSED` instead
  of inventing a read. The text and `.SLC` export readers parse local files; `.ACH`/`.RS1` are refused;
  documentation exports route to `slc500_database`. Verified against synthetic exports and replayed
  goldens; the RSLogix 500 automation-server read is recorded as unproven.
- **Six read-only PLC-5 text-export tools and `plc5_docs`.** `plc5_pc5`, `plc5_verify`,
  `plc5_instruction_inventory`, `plc5_rung_digest`, `plc5_indirect_census` and `plc5_diff` read a
  `.PC5` text export deterministically and report `UNSUPPORTED_FORMAT`, `SOURCE_NOT_INSTALLED`,
  `EMPTY_EXPORT`, `PARSE_ERROR` or `TRUNCATED_EXPORT` honestly. PLC-5 goes from 8 to 15 tools; the row
  still ships off.
- **MotionWorks IEC without the IDE.** The MWI row keeps its 24 tools and now states what it cannot do:
  `core/host.ts` carries the known version line (3.0.3–3.7.5) and probes `Mwt.exe`, the
  `%ProgramData%\Yaskawa` install tree and the uninstall registry; `mw_ide_status` returns the detected
  and known versions; `mw_help` gains read-by-id over a synthetic help tree; compile, live and profile
  paths answer `NOT_INSTALLED` with the probes they ran ("no installation was detected, and no vendor
  result is claimed"). `mw_ide_status`, `mw_help`, `mw_verify_*` and the install requirement are the
  only surfaces changed — fixture-tested, no vendor result claimed.
- **The workflow handbook and a component scaffold.** `docs/handbook/src/` holds 15 Markdown pages
  (bundle and component model, the shared loop, one quick reference per product, the five docs actions,
  safety, troubleshooting, known gaps); `scripts/gen-handbook.py` now reads that Markdown and writes
  `docs/handbook/engineering-handbook.{docx,html,pdf}` with front-matter/order/artifact/source-hash
  checks and `--check`. `packages/_scaffold/` is a compilable component skeleton (README wiring
  checklist, package.json, tsconfig, `src/index.ts`, `SKILL.md`, smoke spec) that no row mounts.
- **An evaluation harness.** `scripts/eval-knowledge.mjs` (`pnpm eval:knowledge`) replays each corpus'
  `goldens.json` (32 L5X, 23 FTView, 25 migration, 22 PLC-5, 22 SLC cases), measures Recall@5, MRR@5,
  nDCG@10, exact and no-match shares, the read contract, hit cap and p95 search/read latency, and fails
  on a deterministic-envelope mismatch. Per-product thresholds and the global exact 1.00, no-match
  0.80, revision-sensitivity 1.00, 150 ms/120 ms p95 and 8/8,000 caps are recorded in the script.

- **`l5x_export_rungs` writes a rung-target export for Studio's Import Rungs.** The offline ladder
  workflow could only produce a routine-target export, which Studio's Ladder Editor refuses in Import
  Rungs with "The specified L5X file does not contain a Rung export" (error 5078-0). The new tool
  writes the same `TargetType="Rung"` shape Studio's own Export Rungs produces: a selected rung list,
  `Use="Target"` rungs, `Use="Context"` controller/program/routine/rung content and the source
  export's revision and tag context. `l5x_draft_apply` now names its Import Routine route and points
  at `l5x_export_rungs` when only some rungs change or when the import must respect pending edits.
  The rung shape was derived from a real Studio 5000 v37.05 Export Rungs file and both routes were
  attended-verified on a generated ladder project: Studio Import Routine with Overwrite, Studio
  Import Rungs reading the rung-target file as Imported Rungs: 1, and Studio Verify reporting
  0 errors/0 warnings after each; the routine route's re-export matched the applied draft.
- **Multi-operation ladder round-trip and paste-ready text.** A two-rung replacement/insert draft
  (rung 0 replace with a Fault interlock, rung 1 parallel start/run branch, both rung comments, six
  BOOL tags, and one rung inserted then deleted in the same draft so numbering stayed contiguous)
  was applied offline, exported with `l5x_export_rungs` as `Imported Rungs: 2`, imported through
  Studio's Import Rungs on Logix Designer 37.05, and verified with Studio Verify 0 errors. The
  operation appended the imported rungs after the selected rung rather than replacing it, so the
  superseded rung was deleted before the clean verify; that Studio behaviour is documented on the
  offline-editing page. `l5x_export_rungs` now also returns each rung's Studio copy text
  (`paste_text`) with a note that plain-text Ctrl+V does not create rungs in 37.05 and the file is
  the import path.
- **The whole instruction catalogue exercised through Studio, not just contacts and coils.** A
  43-rung routine and 32 typed tags (`TIMER`/`COUNTER`/DINT/REAL/STRING/DINT arrays and BOOL lamps)
  covering timers (`TON`/`TOF`/`RTO`/`RES`), counters (`CTU`/`CTD`), all eight compares
  (`EQ`/`NE`/`LT`/`GT`/`LE`/`GE`/`LIMIT`/`CMP`), arithmetic and moves
  (`ADD`/`SUB`/`MUL`/`DIV`/`MOD`/`SQRT`/`CPT`/`NEG`/`ABS`/`EXPT`/`MOVE`/`CLR`/`COP`/`FLL`/`MVM`),
  bitwise (`AND`/`OR`/`XOR`/`NOT`), latches and one-shots (`OTL`/`OTU`/`ONS`/`AFI`), strings
  (`CONCAT`/`DTOS`) and program control (`JMP`/`LBL`) was drafted offline, imported through Studio
  37.05 Import Routine (Import Configuration read Number of Rungs: 43, Overwrite) and verified with
  Studio Verify "Complete - 0 error(s), 1 warning(s)"; the only warning is `Rung 38: AFI detected`,
  which is what an intentionally always-false rung produces. The pass found and fixed two defects:
  a zero-operand instruction lost its parentheses when written (`AFI()OTE(...)` became
  `AFIOTE(...)`), and a component export with no `Controller MajorRev` fell back to pre-v36 mnemonics
  (`EQU`/`MOV`/`SQR`) that Studio v37 refuses, so the composer now reads the root `SoftwareRevision`.

### Removed

- **The ECAD product component, while the DXF/DWG drawing preview stays.** The `ecad` row,
  `entries/ecad.js`, its 12 `ecad_*` tools, the `ecad-review` skill (`packages/ecad/SKILL.md`), the row's
  Configure page, the AryaCAD Electrical bridge overlay (`overlays/aryacad-mcp.patch.yml`) and the
  product/bridge pages are gone. Removing it took the registered total from 190 to 178, the generated
  reference from 158 to 146 and the component count from 9 to 8; the knowledge tools and the SLC row in
  this release bring the bundle to 9 components, 198 registered and 166 generated. The DXF/DWG drawing
  preview is kept as a `viewers` face: the engine, the embedded DWG converter, the drawing pane and the
  package root's `ecad` Remote service stay, `packages/ecad` becomes a viewer library (no entry, no
  skill, no tools) and `scripts/assemble.mjs` vendors it as a viewer payload instead of a component.
  `docs/products/ecad/README.md` is now the drawing-preview page. A future ECAD plan starts from that
  viewer.

### Changed

- **The bundle is 9 component rows, 198 registered tools, 173 default-on, 166 generated and 8 skills.**
  `components.json` records `defaultOnTools: 173` and `defaultOnSchemaCharacters: 135251` (measured
  130,049 characters plus the 4% allowance) with the per-row arithmetic in its note. The generated
  reference gains RSLogix 500, `l5x_docs`, `ftview_docs`, `migration_docs`, `plc5_docs` and `slc500_docs`
  and loses the ECAD group. README, `docs/getting-started.md`, `docs/index.md`, `docs/products/README.md`,
  `docs/architecture.md`, `docs/capabilities.md`, `docs/reference/components.md` and `package.json` carry
  the new rows and counts.
- **Every L5X tool carries the `l5x_` prefix.** The bundle's first product had kept its original
  unprefixed names (`open_project`, `draft_apply`, ...) as the only namespace exemption. 0.104.0 renames
  all 50 remaining names in one release — the release's only breaking change — with no aliases. The
  mapping is: `build_acd_from_draft`→`l5x_build_acd_from_draft`, `capture_controller_snapshot`→`l5x_capture_controller_snapshot`,
  `change_controller_mode`→`l5x_change_controller_mode`, `compare_projects`→`l5x_compare_projects`,
  `compose_batch`→`l5x_compose_batch`, `compose_rung`→`l5x_compose_rung`,
  `controller_approval_status`→`l5x_controller_approval_status`, `discover_controllers`→`l5x_discover_controllers`,
  `document_project`→`l5x_document_project`, `download_project`→`l5x_download_project`,
  `draft_apply`→`l5x_draft_apply`, `draft_discard`→`l5x_draft_discard`, `draft_fbd`→`l5x_draft_fbd`,
  `draft_list`→`l5x_draft_list`, `draft_remove_op`→`l5x_draft_remove_op`, `draft_routine`→`l5x_draft_routine`,
  `draft_rung`→`l5x_draft_rung`, `draft_rung_comment`→`l5x_draft_rung_comment`, `draft_sfc`→`l5x_draft_sfc`,
  `draft_st`→`l5x_draft_st`, `draft_tag`→`l5x_draft_tag`, `draft_tag_description`→`l5x_draft_tag_description`,
  `draft_udt_description`→`l5x_draft_udt_description`, `draft_udt_member`→`l5x_draft_udt_member`,
  `draft_validate`→`l5x_draft_validate`, `export_acd_to_l5x`→`l5x_export_acd_to_l5x`,
  `find_references`→`l5x_find_references`, `get_component`→`l5x_get_component`, `go_online`→`l5x_go_online`,
  `list_components`→`l5x_list_components`, `list_instructions`→`l5x_list_instructions`,
  `open_project`→`l5x_open_project`, `poll_live_tags`→`l5x_poll_live_tags`,
  `project_overview`→`l5x_project_overview`, `read_controller_clock`→`l5x_read_controller_clock`,
  `read_controller_mode`→`l5x_read_controller_mode`, `read_live_tag`→`l5x_read_live_tag`,
  `read_live_tags`→`l5x_read_live_tags`, `resolve_tag`→`l5x_resolve_tag`, `run_checks`→`l5x_run_checks`,
  `search_logic`→`l5x_search_logic`, `start_plc_trend`→`l5x_start_plc_trend`,
  `studio_capabilities`→`l5x_studio_capabilities`, `studio_review_evidence`→`l5x_studio_review_evidence`,
  `studio_sdk_status`→`l5x_studio_sdk_status`, `trace_dependencies`→`l5x_trace_dependencies`,
  `usage_map`→`l5x_usage_map`, `verify_offline_l5x`→`l5x_verify_offline_l5x`,
  `write_controller_clock`→`l5x_write_controller_clock`, `write_live_tag`→`l5x_write_live_tag`.
  The five names that already carried the prefix (`l5x_compose_logic`, `l5x_diagram`, `l5x_docs`,
  `l5x_routine_diagram`, `l5x_rung_preview`) are unchanged. `components.json` drops the `legacy`
  exemption, the L5X skill, product docs and examples quote the prefixed names, and the generated
  reference is regenerated so the reference, `/dsh-market/installed` and the composed profile agree.
- **The assembly copies each product's knowledge payload.** `scripts/assemble.mjs` adds `knowledge` to
  the copied payload list (a docs tool resolves `../knowledge/` from its built `lib/docs.js`) and keeps
  `VIEWER_PAYLOADS = ["ecad"]` for the drawing viewer. `pnpm check:package` reports the tarball at
  **21.6 MiB in 1,094 files**, still inside the market's 64 MiB unpacked cap.
- **The default-on budget is raised with its measurement.** 170 → 173 tools and 127,423 → 135,251
  characters, recorded in `components.json` with the l5x/ftview/migration/optix/resources arithmetic.
- **The documentation tells the truth about what this host cannot run.** `docs/decisions/verification-evidence.md`
  defines the three-state gate evidence (`pass`/`fail`/`not-runnable`), the substitute-evidence table for
  MotionWorks IEC (no IDE installed) and the ECAD bridge/live paths, and the rule that `not-runnable`
  never counts as a pass. `HANDOFF.md`, the handbook's known-gaps page and the README limits repeat it.
- **The tests grow with the surfaces.** New root specs `knowledge-core`, `knowledge-packaging`,
  `l5x-knowledge`, `ftview-knowledge`, `legacy-knowledge`, `slc500-tools`, `mwi-idefree` and `handbook`
  run in the release gate; `test/components.spec.mjs`, `test/patch.spec.mjs`, `test/tool-reference.spec.mjs`
  and `test/docs.spec.mjs` move to the 9-row/198-tool contract; the lockfile is regenerated for the ECAD
  dependency removal.
- **Knowledge search refuses out-of-scope queries and ranks exact identifiers by score.** The shared
  core adds `MIN_MATCHED_TERM_FRACTION = 0.6`: a query that matches fewer than 3/5 of its own terms
  anywhere in the selected pages answers the empty no-match envelope instead of five weak BM25 hits,
  while an exact identifier or alias match always answers. Exact hits are no longer forced ahead of
  better textual matches; they are always included, flagged `exact`, and ranked by score with the exact
  flag as the tie-break (score desc, exact desc, page id codepoint asc). The FTView authored overview
  gains the `application folder` and `project settings` identifiers, and its `q15` golden names the two
  authored pages that answer it. `packages/knowledge/CONTRACT.md` and `docs/reference/knowledge.md`
  record the new ordering and the scope floor.

### Fixed

- **The MotionWorks IEC requirement no longer names a version that does not exist.** The component said
  "MotionWorks IEC 3 Pro 1.19"; the 3 line runs 3.0.3–3.7.5, so `components.json` and the README state
  the measured line and that the IDE is absent from this host.
- **The Studio 5000 SDK path works against the SDK the host actually has.** The probe matched only the
  hardcoded client package `RockwellAutomation.LogixDesigner.CSClient.2.1.974.nupkg`; Studio 5000 v37
  ships 2.2.1109 (a net10.0-only package), so every SDK tool answered "Compatible SDK client package not
  installed". The bridge now discovers the highest installed CSClient package, passes its version to
  `StudioBridge.csproj`, and targets the framework that package ships (net8.0 for v36, net10.0 for v37).
  Proved by exporting the real `OEEDemo.ACD`, drafting a structured-text edit, building a new ACD through
  the installed SDK, and re-exporting the drafted comment from it.
- **A new FTView display follows the schema version the export declares.** The new-display skeleton
  hardcoded `Gfx-ME17.xsd`; Studio 15.0 ships schemas only through `Gfx-ME16.xsd`, so the vendor Add
  Component Tool imported the display empty. `createDisplay` now takes the schema version read from the
  export itself. `ftview_verify_import` also stops reporting vendor-added default attributes
  (`displayNumber`, `backStyle`, ...) as mismatches, and compares colour names (`white` vs `#FFFFFF`)
  canonically. Proved by importing the authored display with `SEAddComponent` and verifying 1/1 display
  match against the vendor export (87 default attributes normalised).
- **SLC 500 reads the Library (`*.SLC`) text the vendor actually writes.** The parser expected an invented
  INI dialect; the installed RSLogix 500 writes an APS-style `START`/`RACK`/`SLOT`/`PROJECT`/`LADDER`/
  `DATA`/`FORCE` dialect. `parseSlcText` now auto-detects and parses it, and the documentation-export
  reader handles the measured headerless `.EAS` 13-cell layout, `.ERP` 3-cell layout with embedded
  newlines, rung-description rows and `C5:0/DN`/`I:0`/`S:0` addresses. Proved on the real
  `IC500DMO_Lib.SLC` export (5 program files, 68 rungs, 3 I/O modules, timer and integer values). The
  dead `scripts/record-slc500-transcript.mjs` references are replaced with the documented transcript
  JSON shape.
- **PLC-5 tool results are valid JSON.** `plc5_capabilities` reported `unpacked_bytes: undefined` for
  non-packed streams, which the host rejects as "value is not lossless JSON"; it now reports `null`.
  Proved by a headless COM read of a vendor-saved `E2E_PLC5.RSP` (3 program files, 1 ladder, 255 symbols,
  9 data files, read by RSLogix 5 10.00.00.00).
- **Optix 1.8 project files are recognised by the bridge arm.** The arm matched a column-zero `Nodes:`
  section and `- File:` entries; Optix 1.8 writes them indented under `Project:`. The arm now matches
  either indentation and writes the registration at the file's own indent.
- **Stale row counts in getting-started and the index.** "Ten rows, ecad and plc5 off" and "six products
  plus three support components and one surface" described a composition the patch no longer had;
  both now state the nine rows and two off rows.
- **File/array and sequencer pseudo-operands are modelled as immediates, the way Studio 37 compiles
  them.** A Studio Verify of a control-structure routine rejected twelve operands with "Invalid kind of
  operand or argument i.e. tag, literal, or expression": the FIFO/LIFO, sequencer (`SQO`/`SQL`/`SQI`),
  file-statistic (`AVE`/`SRT`/`STD`) and `BTD` entries accepted a tag in `Length`, `Position`,
  `Dimension` and the bit-number slots. The installed v37 help states those fields are DINT immediates
  and the control operand is a CONTROL tag, so `InstructionOperand` now carries an `immediate` flag that
  `checkSlot` enforces, and the catalogue uses `lit(...)`/`control()` helpers for those slots; the
  sequencer/file array slots accept the array tag or one element but not a scalar (`arrayOrElement`),
  matching the builds that accepted both spellings. The corrected routine then passed the Logix
  Designer SDK's own import-and-build ("Offline build passed; 0 blocker(s)", import warnings 0, import
  errors 0) on a full `LadderReliability` baseline exported through `l5x_export_acd_to_l5x`. A 22-rung
  subset of the same corrected routine (PID, the subroutine and the JSR call left out) was then imported
  through the Studio 37.05 GUI with Import Routine and verified as "Complete - 0 error(s),
  0 warning(s)".
  `l5x_list_instructions` reports the new `immediate` and `array_or_element` flags.
- **Motion pseudo-operands and axis data types are modelled the way Studio compiles them.** A Studio
  Verify of an 11-instruction motion routine (`MAH`, `MSO`, `MSF`, `MDF`, `MDW`, `MAJ`, `MAS`, `MAM`,
  `MRP`, `MGS`, `MGSP`) exposed two kinds of rule the SDK import-and-build had not caught: enumerated
  operand fields (move type, direction, profile, stop type, stop mode, execution mode and schedule, cam
  type, and every speed/accel/decel/jerk unit field) must be DINT immediates, and the servo-state
  instructions accept only servo axes — `MSO`/`MSF`/`MDW` take `AXIS_SERVO` or `AXIS_SERVO_DRIVE`,
  `MDF` takes `AXIS_SERVO` only, while `MAH`/`MAJ`/`MAM`/`MAS`/`MRP`/`MGS`/`MGSP` also accept
  `AXIS_VIRTUAL`. The catalogue now carries those slots and types (`axis()`, `motionControl()`,
  `motionGroup()`, `cam()`, `lit()`); the MDF rule comes from the installed v37 help page ("Motion axis
  of data type AXIS_SERVO only"). Neither an axis nor a group needs hardware: they are controller-scoped
  tags, so the routine passed Studio's controller Verify with **0 errors**; the nine remaining warnings
  are offline axis-configuration gaps (zero maximum speed/deceleration/jerk limits, no motion
  group/module/amplifier association) plus one left-over structure rung's message tag.
- **The serial-ASCII family is catalogued but unmodelled instead of claimed.** `ABL`/`ACB`/`ARD`/`ACL`/
  `AHL`/`ARL`/`AWA`/`AWT` have no page in the installed v37 help set and a 1756-L71 build answers
  "Unknown instruction"; the catalogue now marks them `notModelled`, so `l5x_compose_rung` refuses with
  `INSTRUCTION_NOT_MODELLED` and names the raw-text path instead of emitting operands it cannot check.
- **A zero-operand instruction keeps its parentheses when written.** `neutralText` rendered
  `AFI` as a bare name, so a rung `AFI()OTE(NeverOn);` was written as `AFIOTE(NeverOn);` — two
  instructions fused into one unparseable name. The composer and the draft writer now emit `AFI()`,
  and a regression test applies such a rung and inspects the written export.
- **A component export without a `Controller MajorRev` no longer falls back to legacy mnemonics.**
  Routine and rung exports state only the root `SoftwareRevision`; the composer read the missing
  controller revision as pre-v36 and emitted `EQU`/`MOV`/`SQR`, which Studio v37 refuses. The parsed
  document now records `softwareRevision`, and `emittedMnemonic` uses the controller revision when
  present and the root revision otherwise, so a v37 export composes `EQ`/`MOVE`/`SQRT`.
- **The L5X skill brief names both import routes and the knowledge plane.** The brief claimed
  `paste_text` "pastes straight into a routine in the ladder editor", which the v37.05 GUI disproved:
  Ctrl+V there edits the selected instruction or does nothing. It now states what the offline workflow
  page states — `l5x_draft_apply` writes a routine export for right-click → Import Routine,
  `l5x_export_rungs` writes a rung export for the Ladder Editor's Import Rungs, and they are not
  interchangeable (Import Rungs on a routine export answers 5078-0) — and points at `l5x_docs` for the
  workflow pages. The operand-flag list it quotes was refreshed to the flags `l5x_list_instructions`
  emits (`array_tag`, `array_element`, `array_or_element`, `no_array`, `immediate`, `minimum`/`maximum`,
  `types`). Four restatements of "the engineer imports it in Studio" were cut to pay for the addition, so
  the brief stays inside its recorded 12,800-character skill budget (measured 12,799).

## 0.103.0 — 2026-11-20

### Added

- **The packaging gate reads every bare import the node-side payload makes.** `scripts/check-package.mjs`
  gains PKG-08: for `entries/`, `lib/`, `presets/` and `vendor/` (minus the browser faces) it reports an
  import of a package the manifest does not declare. A copy that resolves only because the host hoisted it
  is not a dependency, and three were resolving that way: `@deepseek-ai/dsh-tools` and
  `@deepseek-ai/dsh-subprocess` imported by the vendored Optix build output, and `zod` imported by two
  preset projections. Each is now a peer dependency (the host provides it) with a dev dependency at the
  version this repository resolves. The two preset projections went with the preset below, so `zod` is
  declared no longer.

### Removed

- **The Arya Automation Engineer preset, and the preset layer it was built on.** `presets/arya-automation/`
  (persona, definition, projection, plugin) and the `presets/arya-standard/` kit it derived from — its
  engine, policy, compaction, settings and projection modules, its prompt files and their `CODEX-LICENSE` —
  are gone, along with the `engineering-preset` row in `cordis.patch.yml`, its `components.json` entry, the
  `./preset`, `./arya-standard` and `./arya-standard-policy` exports, the compaction and policy rows the
  preset mounted, the engineering ledger's session projection, `test/arya-automation.spec.mjs` and
  `docs/preset.md`. The row id is retired: nothing in this bundle mounts `engineering-preset` any more.
  `NOTICE.md` never carried the preset's notices, so it is unchanged.
- **`zod` leaves `peerDependencies` and `devDependencies`.** The two preset projections were its only
  importers. `presets/billion-context.js` stays: the adapter that stands this bundle's compaction down when
  bili compresses is still mounted by no row and still proved by `test/billion-context.spec.mjs`, and it
  keeps step with the same file in `dsh-aryacode-polish`.

### Fixed

- **CI can assemble and pack a clean checkout.** `ci.yml` now runs `pnpm assemble` after the workspace
  build, because `vendor/` is gitignored and every path the packaging gate proves was missing on a runner.
- **The Studio install scan test reads the tree it redirects.** `test/optix-build.spec.mjs` asserted the
  chosen install through `studioInstall()` outside the `withProgramFiles()` wrapper, so it passed on a
  machine with Optix installed and threw on a clean runner.

## 0.102.0 — 2026-11-19

### Added

- **Every component states its maturity, and each one is `beta` for now.** `components.json` gains
  `maturityPolicy` and, per component, `stability` (`stable` | `beta` | `experimental`), `since` (the
  first release whose patch carried that row), `requires` (the vendor software it needs, and whether it
  is optional), `verified` (what was actually proved, and the document that records it) and
  `stabilityNote` (what is not proved yet). All ten are `beta` because the bundle is pre-1.0: a tool set
  or a result may still change between releases, and each note says which part. `default` stays a
  context-budget decision — `ecad` and `plc5` ship off because not every profile needs them, not because
  they are less finished. Two tests keep the field set honest (vocabulary, a `since` that names a real
  changelog release, a stable component's recorded verification, a beta one's note), and the README
  support table carries the stability of every row.
- **A packaging gate.** `scripts/check-package.mjs` (`pnpm check:package`) and `test/package.spec.mjs`
  check the tarball without publishing: the identity fields, the `dsh` block, every path a mount needs at
  run time is matched by `files` and exists on disk, every row's export target is present, no dependency
  travels as a URL, git or workspace spec, no package is declared twice, and the unpacked size is
  reported against the market's 64 MiB cap. Today: **17.7 MiB in 915 files**, the largest entries
  `vendor/ecad/assets/acadrust.wasm` (6.11 MiB) and the Optix help index (1.32 MiB).
- **`NOTICE.md` travels with the code.** The embedded acadrust/ACadSharp (MPL-2.0 and MIT), the Optix
  bridge (MIT, modified, from `asqi-carter/ftx-mcp`), the pinned NetLogic cheat-sheet snapshot, the Optix
  help index, the standards corpus and every dependency licence, with the trademark disclaimer.
- **GitHub scaffolding.** Issue forms, a pull-request template, `CONTRIBUTING.md`, `SECURITY.md`, a CI
  workflow that runs the whole gate on Windows for every push and pull request, and a release workflow
  that turns a `v*` tag into a GitHub Release whose notes are that version's changelog section.
- **A current-state `HANDOFF.md`**: version, commit, tarball digest, what was verified and how, known
  gaps.

### Changed

- **The documentation is reorganised around the products it serves.** `docs/getting-started.md` is the
  first session (per-product requirements, install, the shared five-step loop, a paste-ready prompt per
  product); `docs/index.md` is the map; `docs/products/**` holds one page per product plus the Optix
  tree; `docs/reference/**` holds the component contract, the generated tool reference, HMI design and
  standards checks; `docs/capabilities.md` holds the evidence; `docs/port/**` is kept as design history.
  Every link in the README points at an absolute GitHub URL, because npm renders the README without the
  rest of the repository — 57 of 58 relative links were dead on npmjs before this batch.
- **The README is rewritten for a person who has not installed it**, and the bundle description
  (`package.json`, the Plugins-page text and the repository description) now names all six products and
  the three previews instead of four products and two.
- **Publication-ready identity**: `author`, `publishConfig.access: public`, extended keywords,
  `NOTICE.md` in `files`, `prepack` builds the workspace before packing, `@deepseek-ai/schemastery`
  declared once (it was in both `dependencies` and `peerDependencies`), `esbuild` declared (it was used
  but never listed).
- **Changelog headings are `## 0.101.0 — 2026-11-18`.** The bracketed form is what the market's release
  parser cannot read (it matches `## <version>`), so every market release body had degraded to
  "Published 0.101.0."; the section extractor in `release.yml` and the two specs that pin the form follow
  it.
- **Repository state is not public state**: generated previews and harness output (`artifacts/**`,
  `.l5x-preview/**`) are untracked and ignored, and the pre-registry packing record and the Optix lane
  handoff moved into `docs/port/`.

### Fixed

- **`scripts/assemble.mjs` reports a failed copy instead of swallowing it.** Every entry was copied with
  `.catch(() => {})`, which is how `vendor/optix/skills/` went missing on npm from 0.100.0 through
  0.101.0 while the local tree looked complete. A copy that fails now names the component and the path;
  an entry that genuinely does not exist is skipped by an explicit `stat` for `ENOENT` only.
- **The scaffolded Optix project no longer inherits SQLite journals.** `arya-optix-app` carried
  `Alarms-` and `SecurityRetentivityStorage.db-wal`/`.db-shm` (1,466,400 bytes of stale runtime state), so
  every project scaffolded from it started with someone else's uncommitted transactions; the template is
  regenerated and its `--check` passes.

## 0.101.0 — 2026-11-18

### Added

- **The screen kit draws four more kinds of screen, and its density is now measured rather than guessed.**
  `optix_ui action:"screen"` and `optix_screen` took two patterns (`overview`, `blank`); they now take six:
  **`station`** (the machine wall an operator scans for a red lamp), **`table`** (row-per-thing — alarms,
  units, recipes, the shift log), **`faceplate`** (one piece of equipment with its detail under it) and
  **`split`** (the numbers beside the picture of them). A pattern given no content of its own is refused
  (`blueprint_pattern_content`) instead of answered as an empty screen. The caps are the batch, not the eye:
  a screen is compiled in one call because the bridge only resolves a parent it created in the same batch, so
  it cannot be split across calls, and `maxScreenOps` went **400 → 700** after measuring that 400 refused a
  four-tile station wall at 414. Measured on 1.8.1.27 (`packages/optix/lib/kit.js`): one station tile is
  **87-88 operations**, six tiles 588, six tiles plus the KPI strip every line screen carries 639, a 6x5
  table with a KPI, a feed and a status strip 588, a faceplate with a chart 390, and a fully loaded
  `overview` on a 1920x1080 canvas 1011 — refused, with the component to drop named. So `MAX_STATIONS` is
  **6** (eight tiles would be 768), `MAX_TABLE_COLUMNS` 5 x `MAX_TABLE_ROWS` 6, `MAX_MESSAGES` 8.
  `test/optix-kit.spec.mjs` grew eight tests (19 total) that record the counts instead of asserting a shape.
- **A station wall is laid out for the tile's shape, not the row's width.** Filling the width first made six
  machines 5 across plus 1 stranded, and the short last row rendered its single tile far wider than the row
  above it. The kit now searches every row count and keeps the tile closest to **1.4:1** — the aspect a name
  row over two value rows reads well at — gated by 200 px across and 110 px down, and each tile carries the
  box its row was given. Six machines are **3+3 at one tile size** at every canvas measured: 397x294 at
  1280x800, 324x247 at the demo's 1060x706 host box, 610x434 at 1920x1080. A wall that cannot fit is refused
  with both constraints and what to drop named: `6 station(s) will not fit a 1012x418px body: a station tile
  needs 200px across and 110px down, and this body holds 5 tile(s) per row with no row left 110px tall.`
- **Card rows now fill their card.** `ContentVerticalAlignment` has no space-between member (0 Top / 1 Centre /
  2 Bottom), so a card's rows are distributed by `Height -1` with `VerticalAlignment 3` while each row keeps at
  least `MIN_ROW_BAND` 26 px; past three rows, or in a band too short to fill, they hold 26 px. This is the fix
  for the defect the render check found on the served LineStatus screen: three rows stacked at the top of a
  247 px card, 148-190 px of it empty.
- **`optix_status` now answers who owes which step.** With `project` or `project_root` it carries `setup`: the
  ordered steps that make that project authorable, each tagged `owner: "tool"` or `"human"`, each with the exact
  call or the exact Studio action. `setupChecklist` in `packages/optix/lib/chain.js` probes what it can (the
  bridge's two files, Studio's process list, the build artifact, the runtime, the browser, Tesseract) and marks
  what it cannot see `done: null` rather than guessing — the licence step is last and never blocks `ready`.
  `next` names the first step genuinely open, which is the sentence to hand the engineer, because **no tool can
  run StartBridge or Studio's Ctrl+Shift+B**. Measured on this machine with Studio closed: `ready false`,
  `human_open 2`, `unobservable ["licence"]`, `next "studio_open (human): Open FactoryTalk Optix Studio…"`.
  `packages/optix/skills/authoring-loop.md` carries the step table.
- **`optix_project action check` names an unbounded store table offline (`OPTIX-DATA-02`).** The runtime has
  said it for weeks and nobody read the log: `WARNING (urn:FTOptix:SQLiteStore) [code=1c] … No record limit is
  set on 'SmtTrend', which may cause an out-of-memory issue on your device`. `checkLogging` in
  `packages/optix/lib/project.js` reads the chapters with no Studio and reports every `*StoreTable` whose
  `RecordLimit` is absent **or 0** — Studio writes a property child even at its default, so a child with no
  `Value` is not a limit either — with the table's column count and whether it can order its own rows, because
  the limit only replaces old rows once a `Timestamp` or `LocalTimestamp` column exists. Proven against the demo:
  `AryaSMTLineDemo/DataStores/LineStore/Tables/SmtTrend` in `Nodes/DataStores/DataStores.yaml`, six columns,
  timeable fix. No tool writes `RecordLimit` was the old claim; the batch proved the op: `set_property … RecordLimit 5000` on
   `SmtTrend` came back `{datatype:"UInt32", via:"materialized"}` and the runtime's warning stopped — the check
   reads the chapters on disk, so its finding cleared only once `optix_save` landed (1 → 0).

### Fixed

- **`optix_render_check`: the checking tools now look at the screen an operator sees.** Every rule in this
  plugin reads the design model through the bridge, and on `AryaSMTLineDemo` all of them were quiet on a screen
  with four defects visible in a screenshot. `packages/optix/lib/render.js` (new) measures the served preview:
  it walks the runtime's own DOM (`[data-type]` elements, boxes, computed colour and font), and `optix_render_check`
  judges the capture's **pixels** with five rules — `VIEW-RENDER-01` rendered text that is a placeholder nothing
  drives (`--:--`, `{TotalUnits}`, `undefined`), `VIEW-RENDER-02` a painted surface whose text covers under 30 %
  of its box and leaves 60 px or more empty, `VIEW-RENDER-03` a painted surface or control drawn outside the box
  the runtime serves, `VIEW-RENDER-04` text whose colour does not separate from what was painted under it
  (under 4.5:1), and `VIEW-RENDER-05` text drawn in the very colour behind it, whose captured box holds no pixel
  more than 20 away from its background. `HMI-TARGET-01` and `VIEW-TYPE-02` are re-decided on the painted box.
  It runs on the **runtime leg**: the emulator serving the saved project is all it needs, no Studio and no bridge.
  Measured on the served LineStatus screen: 172 elements, 29 text elements, 0 unchecked, **7 findings** — the
  header clock drawing `--:--`; four cards at coverage 0.27, 0.05, 0.03 and 0.03 with 148-190 px of a 247 px card
  empty; `Ready` painted `#0fafff` on `#0fafff` (pixel distance 1, nothing there is readable); and the rail's
  selected caption `#ffffff` on `#0fafff` at 2.44:1. The header title, white on `#005d8a` at 7.16:1, produced no
  finding, which is the discriminating case `test/optix-render.spec.mjs` (new, 40 tests) pins.
- **The Web presentation engine does not paint where the model says it does, and the rules were rewritten to
  match.** A typed `[data-type="rectangle"]` computes `backgroundColor: rgba(0, 0, 0, 0)`: its fill is on an
  **untyped child div** carrying `width: 100%; height: 100%`, which is an *ancestor* of the element's real
  children, and its border is an **inset `box-shadow`**; a `NavigationPanel` paints its tab strip with
  `background-image: linear-gradient(…)`; only 14 elements in the whole served page carry a non-transparent
  `backgroundColor`; and the band fills are **sibling underlays**, not ancestors. Judging the DOM's reported
  colours therefore called every card unpainted. `surfacePaint()` reads through the overlay child, `paintUnder()`
  takes the latest earlier element whose box covers the text's centre, and `decodePng` / `sampleBackground` /
  `strongestPixel` read the capture itself (8-bit non-interlaced RGB or RGBA only, `node:zlib`, no new
  dependency; a palette, 16-bit or interlaced capture is refused and the colour rules fall back to the DOM, which
  `measured.paint_read` reports). The served page also has **no `canvas` element**: `div#root` measures **1264x0**
  because its child is positioned, and the window is `div[data-type="window"]` at 1280x800 — a walk that stops at
  a zero box measures an empty page (the first run measured 0 elements), so `measureDom`'s walk now returns an
  array of nodes so a collapsed container bubbles its measured descendants, and `capture()` prefers the runtime's
  window element. A finding names a **rendered type chain**, never a project path: DOM ids are the runtime's own
  (`ns=9;g=…`) and are not the bridge's guid. `packages/optix/skills/render-checks.md` (new 11th playbook page)
  carries the routes and the honest limits.
- **`optix_screenshot` and `optix_ocr` no longer report a viewport that is not the window.** The preview browser
  is 1920x1080 and the runtime paints the project's 1280x800 window inside it, so every capture carried white
  margins and every coordinate was stated against the wrong box. `capture()` now reads the served window's own
  rectangle and clips the screenshot to it when that removes something (`scale: "css"`): the same capture went
  from 1920x1080 / 41 639 B to **1280x800 / 36 860 B**. `optix_screenshot` answers `window_box` plus a `letterbox`
  sentence naming what sits outside it, and `optix_ocr` answers `coordinateSpace {width, height, origin, units}`
  so a click coordinate is traceable to the image it came from.

### Fixed

- **The kit refused its own table.** `optix_ui action:"screen" pattern:"table"` failed its numeric-plus-Stretch
  guard: `layout UI/Screens/Probe/TableArea: Height 608 with verticalAlignment 3 is discarded by the runtime
  (measured: 300 + alignment 3 rendered as a fill)`. `TableArea` is now a `ColumnLayout` at
  `VerticalAlignment 0` keeping its numeric band — Stretch *is* the size on that axis, so writing 608 with
  alignment 3 throws the 608 away. `test/optix-kit.spec.mjs` pins `TableArea`'s `VerticalAlignment === "0"`
  with the comment "TableArea must keep the band it was given".
- **A refusal that named a constant instead of the thing to drop.** A faceplate with two cards and a chart at
  the demo's 1060x706 host box answered `a row of 133px is under the 140px floor in a 440px area`, which sent
  the reader looking for a number. It now says `a faceplate leaves 440px of detail under its 148px equipment
  band, which splits 3 item(s) into 133px: a card or a chart needs 140px, so drop one of them or give the
  screen more height`.
- **`setupChecklist` read two keys that do not exist.** It compared `build.state === "current"` when
  `buildState` reports `"built"` / `"stale"` / missing-artifact (`packages/optix/lib/build.js:548-550`), and it
  probed the NetLogic chapter for the string `StartBridge` when that chapter names the **node**
  `StudioMCPBridge` (`Nodes/NetLogic/NetLogic.yaml:4`) and `StartBridge` only appears as a `Class: Method` child
  at `:24`. Both were found only by running the checklist against the real project, and both made a ready
  project look unready. The missing-half detail is now an array join; the earlier ternary concatenation had
  produced `" is missingNodes/NetLogic/NetLogic.yaml names no StartBridge node."`.
- **`optix_status` probed the preview chain twice.** `chainReport` was called inline in the return value and
  again inside the build branch, so every status call paid for two browser/emulator probes. It is computed
  once and reused.
- **`jsonSafe` erased a repeated reference that was not a cycle.** A shared sub-object appearing twice in one
  value was nulled at its second occurrence (one `WeakSet` marks anything already visited, and a DAG is not a
  cycle), so a tool answer silently lost data. `packages/optix/lib/json.js` now tracks the ancestor path
  (`jsonSafe(value, ancestors = [], depth = 0)` with `ancestors.includes(value)`), which still refuses a true
  cycle; `test/optix-json.spec.mjs` pins that a shared sub-object survives at every place it is used.
- **`VIEW-RENDER-03` reported the engine's own wrappers.** The Web engine sizes a `label` element to its
  container (measured: 1280x800 at (16,12) around text painting 22.6x16 at (860,18)), so the first run produced
  four overflow findings that clipped nothing. The rule now judges painted surfaces and interactive controls only.
- **Nine render assertions were passing for the wrong reason.** They called
  `rules(renderFindings(measureDom(…)))`, which hands an already-judged result to `renderFindings`; it saw no
  `.nodes`, found nothing to judge and returned `[]`, so every "reports no finding" assertion was vacuous. The
  spec now judges once. `test/optix-render.spec.mjs` also builds its own PNG (local CRC32 + `deflateSync`) rather
  than trusting a real capture, and its fixtures are written so a test that expects a finding **fails against the
  wrong underlay** — a fixture that passes either way discriminates nothing.

### Added

- **`optix_script` can prove a class without the runtime: `template:"fixture"`, and the rule that keeps it
  honest.** A sixth NetLogic template, allowed only with `kind:"design"` (it refuses `kind:"runtime"` because
  Studio runs a fixture through right-click Execute or `optix_script action:"run"`, never through `Start()`).
  The shipped class is a `[ExportMethod] public string RunFixture()` that reads its `Target` pointer, casts
  `(NodeId)target.Value`, refuses `NodeId.Empty`, resolves `InformationModel.GetVariable(targetId)`, then
  **reads the value, writes the value it just read, and reads it again**, returning
  `{"ok":true,"target":…,"before":…,"after":…,"restored":true}`; every failure branch returns a JSON reason
  plus a `Log.Error`. `OPTIX-NL-15` ("a fixture writes a variable and never puts the original back", warning)
  reviews it: the census looks only inside `[ExportMethod]` bodies and counts a write as restored when its
  right-hand side is the local the method read out. Proven on the demo: `LineProbeFixture` →
  `ProjectFiles/NetSolution/LineProbeFixture.cs` (45 lines, 1800 B), `review.verdict "clean"` across
  OPTIX-NL-03..15, pointer `Target` → `Model/Smt/TotalUnits` with `DataType: NodeId`, and
  `optix_build action check` compiling the whole solution outside Studio at **0 errors, 0 warnings**.
  **The gap it exposed:** `optix_script action:"run"` answered `status:"not-loaded"`, and it still did after a
  save that moved 29 sources — `bin/AryaSMTLineDemo.dll` stayed at 05:40:00Z against a newest source at
  05:54:46Z. A save does not make a new class exercisable; the build and Studio's own reload do, and no tool
  in this bundle restarts Studio. `packages/optix/skills/runtime-csharp.md` carries the section.

### Fixed

- **`optix_render_check` was reading the wrong pixels, in two opposite directions.** A kit chip label has a box
  coincident with its chip rectangle, and `sampleBackground` samples only *outside* the box: it read the header
  band's cyan and reported `!`, `EN`, `Line 1` and `SMT` at **1.81:1** where their own fill measures
  **13.40:1**. `sampleInterior` (new) reads the holder's own inset frame, 3 px past its border, where the Web
  engine draws a rectangle's border. The first fix then produced its own false positive, and the live screen is
  what showed it: `paintUnder` is not gated by `SURFACE_TYPES`, so the holder it found for a rail tab was a
  **rectangle the size of the whole window**, and the interior sampler read that plate's four sides
  (`sampled_px 12384` = 6·1280 + 6·800 − 36, nowhere near the label) — `"Station Wall"` came back white-on-white
  **1:1**, and the invisible cyan-on-cyan `Ready` moved out of VIEW-RENDER-05 into a 2.44:1 VIEW-RENDER-04.
  `bandInsideSurface(box, surfaceBox)` with `BAND_INSIDE_MINIMUM = 0.5` now decides which sampler answers: the
  band around the text when that band is already inside the holder, the holder's inset frame when the text box
  *is* the plate. `measured_from` names which one answered. Live on the demo, in the order the fixes landed:
  StationWall **11 → 7 → 3** findings, AlarmTable **10 → 6 → 3**, LineStatus 7 throughout — and what remains is
  real (`--:--`, the cyan-on-cyan `Ready`, the rail's selected tab at 2.44:1, LineStatus's four density findings).
  `test/optix-render.spec.mjs` grew six tests (46 total), including the band-vs-plate discriminator that fails
  against the wrong sampler.
- **The kit drew chrome no language could read, and it now moves the state to the border instead of the ink.**
  Measured on the served screens: the header title on its accent band was **2.30:1** (modern-dark) / **2.44:1**
  (modern), a light label on a light chip **1.27:1**, the danger glyph **3.91:1** on white and **4.35:1** on the
  dark surface — under the 4.5:1 floor in every language. `inkOn(fill, candidates)` in `packages/optix/lib/kit.js`
  picks a legible ink per surface (`headerInk`, `chipInk`, `tableHeaderInk`) and reports the residual instead of
  hiding it; the bell, user and language chips take a **surface fill with the state in their border**
  (`borderColour` on `surface()` / `cellSurface()`), which is the only route that clears the floor. The four chip
  findings on each new screen went to zero, and the contrast finding that survives is the rail's own selected tab
  — `NavigationPanel` paints its tab strip with a gradient that is not model data, so no kit colour fixes it.
  `test/optix-kit.spec.mjs` grew two tests (21 total) that assert the ratios across all seven languages.
- **The bundle told engineers to press a keystroke Studio does not document, and denied that it could save.**
  `Ctrl+Shift+B` appeared in 36 places in this bundle's own advice; **Studio 1.8.1.27 documents no build
  keystroke at all** (documented: Ctrl+S, F5, Ctrl+Shift+F/H, F1, F2) — its routes are the main toolbar's **Open
  .NET Solution**, double-clicking a NetLogic, or a Studio restart. Measured on this machine: a save that moved
  **29 sources** under `ProjectFiles/NetSolution` left `bin/<Project>.dll` at its older timestamp, and a
  navigation-only batch needed no build at all — the runtime drew the new bar on the save alone. At the same time
  `SAVE_HANDOFF` and `needs_save.next` said *"nothing in this plugin can save the project"* while `optix_save`
  existed and was proven (attempts 83, latency 110.67 s, 1 keystroke, 1 foreground confirmation — 82 attempts
  never took the foreground). Both sentences were false, in opposite directions. Corrected at every site:
  `SAVE_HANDOFF`/`BUILD_HANDOFF`, the **`optix_save` tool description itself**, `lib/save.js`, `lib/build.js`,
  `lib/chain.js`, `lib/project.js`, `lib/scaffold.js`, the `optix_status` / `optix_screenshot` / `optix_ui theme`
  strings, `SKILL.md` (six sites, including the "no desktop automation" exception — now exactly one Ctrl+S, no
  build keystroke), `skills/authoring-loop.md`, `skills/screens-and-layout.md`, `skills/runtime-csharp.md`,
  `docs/optix-{build,workflow,dialog,nav,project}.md`, `docs/reference/optix-save.md`, and the
  `test/optix-live-*.mjs` hints. `CHANGELOG.md` keeps its `Ctrl+Shift+B` history where history belongs.
- **`RecordLimit` is writable, so the three pages that said it was not have been corrected.**
  `set_property DataStores/LineStore/Tables/SmtTrend RecordLimit 5000` came back `{datatype:"UInt32", via:"materialized"}`,
  and the runtime's `No record limit is set on 'SmtTrend'` warning stopped. The clock is the part to know:
  `optix_project action check` reads the **chapters on disk**, so OPTIX-DATA-02 stayed at 1 until `optix_save`
  landed and then reported 0 (warnings 12, critical 2). `skills/gaps-and-refusals.md`, `skills/data-logger-trend-sql.md`
  and `SKILL.md` now name the op instead of the Studio menu.
- **Two ceilings disagreed about how big a screen batch may be, and the bigger one won.** `StationWall` applied
  **738 operations** and `AlarmTable` **599** — the 340-op ceiling section 35 recorded is gone, and LineStatus's
  `HorizontalAlignment 3` landed so its four VIEW-RENDER-02 all became 496x247 (the 96.2/895.8 starvation is
  gone). But 738 is above `maxScreenOps` 700 because `optix_ui action:"screen"` enforces no ceiling; only
  `optix_screen` does. Recorded as a gap rather than quietly raising a cap: the two routes should agree, and
  neither is wrong for accepting the batch.

## 0.100.0 — 2026-11-17

### Added

- **A project type named after a built-in type is refused, and the shadowing is reported from Studio's own
  generated file.** Studio generates one **global-namespace** C# class per project Screen, Panel, Window, Dialog
  or Popup into `ProjectFiles/NetSolution/Private/UITypeDefinitions.cs`, so a project type whose BrowseName
  equals a built-in type name shadows that type for every NetLogic in the project. Measured on
  `AryaSMTLineDemo` (Studio 1.8.1.27): a screen drafted as `UI/Screens/Trend` generated
  `public class Trend : FTOptix.UI.Screen`, and the shipped `Widgets/AdvancedTrend` had brought
  `TrendPensLogic.cs`, which declares `private Trend myTrend;` unqualified under `using FTOptix.UI;` — the
  solution failed with `error CS0029: Cannot implicitly convert type 'FTOptix.UI.Trend' to 'Trend'` plus four
  `error CS1061: 'Trend' does not contain a definition for 'Pens'`, `bin/AryaSMTLineDemo.dll` was removed and
  never rewritten, and the project's own NetLogic stopped compiling alongside the library's. Renaming the screen
  to `TrendView` cleared all five errors and Studio's own build produced a 248 832-byte assembly. Neither
  `optix_library import` nor the screen emitters had checked the name. `packages/optix/lib/names.js` (new)
  carries `TYPE_BEARING_WIDGETS` (the kinds Studio generates a class for), `typeBearingCreateRefusal(op)`,
  `parseGeneratedTypes(text)` and `typeCollisions(generated)`; the batch runner in `packages/optix/lib/index.js`
  refuses such an op before a byte is sent (live: `status "refused", applied 0`, *"…it would shadow
  FTOptix.UI.Trend in every NetLogic in the project…"*, nothing reached the bridge, while the same op as
  `TrendProbe` validated `ok`); `optix_build status` carries `type_collisions` (`null` when clean) and
  `optix_build check` names the collision in its `next` when the build fails — on the live project it read
  `generated: 32, collisions: [], duplicates: []`. An **instance** named `Trend` is not refused: it generates no
  class and shadows nothing. A screen cannot be renamed by a `move` (`not_an_object: … is ObjectType - move
  handles Object instances`), so the route is create the new screen, repoint what mounts it, then delete the old
  one. `test/optix-names.spec.mjs` (new, 8 tests) pins all of it.

- **`VIEW-LAYOUT-04`: a size the runtime throws away is now reported.** Four states of one node measured on
  `UI/Screens/AlarmSummary/Canvas/Layout/Content/Row3`, one variable at a time, each saved and re-measured in a
  fresh runtime: `Height 300` + `VerticalAlignment 3` rendered **158** (the leftover fill); the same 300 with
  alignment 0 rendered **300**; `Width 500` + `HorizontalAlignment 3` rendered **1012** (the whole track); the
  same 500 with alignment 0 rendered **500**. `Stretch` on an axis *is* the size on that axis, on either axis,
  whatever the parent's orientation — and the model keeps the number it discarded, so `optix_read node` still
  reported `Height 300 (Float)` while the row drew at 158. `VIEW-LAYOUT-04` names the pair (`evidence: axis,
  size, alignment: 3, parent`) wherever a `RowLayout` or `ColumnLayout` child carries it; `VIEW-LAYOUT-03` now
  counts such a child as a **fill sibling** rather than spending its number against the track, because read as a
  fixed 300 it invents a starvation the runtime never causes; and `layout()` in `packages/optix/lib/containers.js`
  refuses to emit the pair at all. The rule also explains the other half of the spelling: a `-1` under alignment
  0/1/2 renders at **content size**, which is why the demo's `Header`/`Footer` drew 204 px and 280 px wide.
  `gridLayout` writes a row with a numeric `rowHeights` entry at `VerticalAlignment 0` for that reason — the old
  spelling paired every row with Stretch, and the live check fired on all three demo screens (`Row1`/`Row2` naming
  `Height 247` in a 514 px track). The render had measured 247 only because an equal fill split reproduces it;
  rewriting those six rows to `Height -1` changed nothing on screen and silenced the rule.

### Fixed

- **`optix_list_skills` and `optix_get_skill` shipped with no payload, and the packer now has a guard against
  repeating it.** `scripts/assemble.mjs` copies a fixed entry list into `vendor/<component>/`, and `skills` was never
  in it: the published **0.99.0** tarball carries `vendor/optix/lib/skills.js` and **zero** `vendor/optix/skills/`
  files (905 files in that tarball; `SKILL.md` 1, `schema/` 2, `netlogic/` 55, `templates/` 169), and the installed
  copy under `~/.aryacode/profiles/desktop/node_modules/@aryacode/dsh-engineering/vendor/optix/` has the module and
  `SKILL.md` with no folder beside it. `packages/optix/lib/skills.js:13` resolves
  `join(dirname(fileURLToPath(import.meta.url)), "..", "skills")`, so in the shipped tree that is an absent
  directory: `optix_list_skills` answers with an empty list and `optix_get_skill` refuses every topic with
  `No Optix topic named "…". Topics: `. `skills` is in the copy list now, `packages/optix/package.json` declares
  `skills/**/*` in its own `files`, and `pnpm assemble` produced `vendor/optix/skills/` with all ten pages — read
  back through the **vendored** module, which lists 10 topics with `gaps-and-refusals` at 11 187 bytes. The guard is
  in `test/components.spec.mjs`: it resolves every self-relative lookup in a vendored component's built tree (the
  `new URL("../x/…", import.meta.url)` form and the `join(dirname(…import.meta.url), "..", "x")` form), takes the
  package-relative first segment, and fails when the copy list does not carry it. Proven both ways: with `skills`
  removed from the list it fails naming `packages/optix/lib: lib\skills.js resolves "../skills" at runtime, but
  scripts/assemble.mjs never copies skills into vendor/optix/`; with it present the spec is 15/15. One lookup is
  carried as a named exception rather than a blind spot: `packages/l5x/lib/engine/brand.js:77` reads
  `../../package.json`, and the vendored tree has no per-component manifest (verified: no `package.json` anywhere
  under `vendor/` in the 0.99.0 tarball), so `brandPackageVersion()` degrades to printing no version in an
  Arya-branded footer. Copying each component's manifest into `vendor/<name>/` would put a package boundary and a
  `type` field inside the bundle, which is a wider change than the release that found it.

- **Five specs under `test/` were never run, and the gate reported green anyway.** `scripts/test.mjs` runs a
  hand-maintained `BUNDLE`, and nothing compared it to the folder: `test/optix-production.spec.mjs`,
  `test/optix-batch-validation.spec.mjs`, `test/optix-names.spec.mjs`, `test/optix-tool-registration.spec.mjs` and
  `test/optix-skills.spec.mjs` each landed in a commit while the run kept printing the same `71 file(s) passed`.
  The runner now fails on the drift by name (`test: never run by this script: …`) after normalising separators,
  because `specsIn` builds `test\file.spec.mjs` on Windows while `BUNDLE` spells `test/file.spec.mjs` — the first
  version of the guard named all 50 specs and would have broken every run. Proven both ways: a clean tree exits 0,
  and a temporary unlisted `test/zz-guard-probe.spec.mjs` exited 1 naming only itself. The run is 76 files.

- **`optix_invoke` never reached the bridge.** `applyInvoke` was called without the gateway `apply()` builds, so
  every call threw `ReferenceError: bridge is not defined` at `packages/optix/lib/index.js:1977`. With the gateway
  passed, the alarm probe got the bridge's own answer instead: `CoreException: No behaviour or observer found that
  handles the method 'Acknowledge' on node Root/Objects/AryaSMTLineDemo/Alarms/Alm_FeederJam` — the documented
  refusal for a tool-created node, now measured rather than assumed.

- **`set_link` could not be authored through `optix_edit`.** Bridge 1.0.9 answers it with `unknown_op` — "op
  'set_link' is not validated by this bridge; it will be applied unchecked" — in both `errors` and `warnings` with
  `ok: false`, and `acceptedValidation` required both lists to be empty, so the batch was refused with `applied: 0`
  for an op the bridge only declined to *preflight*. An `unknown_op` is now separated out (`validationUnchecked`,
  exported), a concrete defect beside it still refuses the batch, and a completed batch reports the ops it applied
  unchecked. Measured live: `Alarms/Alm_FeederJam/InputValue` → `Model/Smt/ActiveFaults` applied, and Studio saved
  it as `DynamicLink` / `DataType: NodePath` / `Value: "../../../Model/Smt/ActiveFaults"`.

- **`optix_emulator`'s `save_verdict` reported that a Save had not reached disk even when it had.** The verdict
  compared `disk.newest_write` (an `mtimeMs` number) with `unsaved.first` (an ISO **string**): `number >= string`
  coerces the string to NaN, so the comparison was false for every project, always. Measured 2026-11-17 on the
  demo — a save that landed at `17:43:54` was answered with "No file in the project is newer than the first
  pending bridge change (17:38:46.861Z); the newest write under Nodes/ is 2026-11-17T17:43:54.218Z", naming the
  newer file and denying it in the same sentence. The decision is now `saveReachedDisk(disk, unsaved)` in
  `packages/optix/lib/emulator.js`: both sides are epoch milliseconds, and the comparison is against the **last**
  pending change, because a disk write newer than only the first of several changes proves a save happened
  mid-series, not that the remaining changes were saved. The refusal sentence now names the ordering a session
  has to follow — Studio stamps the YAML seconds after the `Ctrl+S` keystroke, so poll the file's write time and
  restart the runtime only after it moves.

- **`VIEW-LAYOUT-03` measured the wrong track: a container's own margins were not subtracted before its
  children spent it.** The rule was written against a probe whose layouts carried no margins, so it compared the
  children with the `ScaleLayout` design box. On the demo's `UI/Screens/LineStatus` the truth is smaller:
  `…/Canvas/Layout/Content` is `Width -1` with `LeftMargin 24` and `RightMargin 24`, and it rendered **1012 px at
  x=244** — 48 px less than the 1060 px the rule reported. Pushing `Row1/Card1` to `Width 1050` rendered Card1 at
  1050 px and its `Width -1` sibling `Card2` at **w=0 at x=1314**, 58 px past the row's right edge, while the rule
  said `past_the_box: 10`. `boxOf` in `packages/optix/lib/design.js` now subtracts `marginsOf(node, key)` in every
  branch (the screen-box seed, a `ScaleLayout` design box, an axis passed straight through, and a splitting
  layout's leftover), and the live evidence reads `track 1012, used 1070, past_the_box 58` — matching the DOM. Only
  a container's own margins count: a layout-placed child reports none in the model (the runtime emits
  `margin: 0px`) and a hand-placed node's `LeftMargin` is a position, not a share of a shared track. A screen whose
  shortfall hides inside its margins would otherwise have passed.

- **A size of `-1` was read as a rectangle, so two rules invented geometry about it.** `rectOf` in
  `packages/optix/lib/design.js` took the four values a node reports and multiplied them: a control placed by a
  layout — `Width -1` meaning Fill — came out as a box with negative area, `HMI-TARGET-01` reported it as
  `-1×-1; the target minimum is 44px`, and `OPTIX-LAYOUT-01` called every child of a fill-sized container
  outside its parent. A non-positive `Width`/`Height` is now refused the way a missing one is, and the control is
  reported as `no geometry reported` instead of measured wrong. Found while writing `VIEW-LAYOUT-03`, which had
  to tell a fill size from a real one.

- **`optix_design_check` and `optix_production_check` reported four blind spots as facts about a screen that
  was fine.** Measured live 2026-11-17 on the rebuilt SMT demo (`AryaSMTLineDemo`, three container screens):
  (1) at the default `depth 3` the check described 10 of a 294-node screen, and at `depth 8, max_nodes 400` it
  listed 20 labels as `no geometry reported` — text placed by a layout carries no `LeftMargin`/`Width`, so
  `HMI-CONTRAST-01` never ran on a single one of them; it now falls back to the fill on the text's container
  and, when no ancestor carries a colour, to the screen's largest surface, naming which in `measured_from`.
  (2) The live check had **no text-size rule at all** while the offline rubric held `VIEW-TYPE-02` at 11 px;
  `MIN_FONT_SIZE` is now exported from `packages/optix/lib/design.js` and the rule runs live (the demo's labels
  all clear it, so the finding count stayed at zero and the blind spot is closed rather than fed).
  (3) `VIEW-LAYOUT-02` compared a screen with the **window** canvas and called a deliberately 1060×706 screen a
  finding; the check now resolves the mounter that points at the screen — a `PanelLoader`'s `Panel` or a
  `NavigationPanel`'s items — through the guid the bridge reports only for `ids=1`, subtracts the tab strip
  (`NavigationPanelTabPositionEnum` 2/3 is a side strip, so `TabWidth` comes off the width; 0/1 is an end strip,
  so `TabHeight` comes off the height), and reports it as `mounted_in`. It reports the box the mounter
  **declares** and does not clamp it to the window: the first version clamped to 1060×736, and the probe in the
  Added entry below measured that the runtime hands a screen the declared box and clips the overflow itself — a
  rail left at `Height 800` under a 1280×800 window with a 64 px header rendered its screen 1060×**800**, 64 px
  past the bottom. The demo's rail had drifted from the starter's `Height 706` (`…/templates/arya-optix-app/
  project/Nodes/UI/UI.yaml`: `TopMargin 64` + `Height 706` = 770, where `ShellFooter` starts) and was repaired,
  so the screens now measure exactly.
  (4) `VIEW-NAV-01` fired on a screen mounted by a rail because the shell was only counted when its controls
  had handlers, and `optix_production_check` answered `no PanelLoader under UI/MainWindow, so reachability was
  not checked` although the rail mounted all three screens; a `NavigationPanel` now counts as shell navigation,
  its items' `Panel` NodePointers are resolved to screens, and those screens are fed to `reachableScreens` as
  shared targets (`mountedPanels` in `packages/optix/lib/production.js`). Both handlers also had to learn that
  a `NavigationPanel` holds its items under a **collection** named `Panels` — the collection is reported with
  `coll: "NavigationPanelItem"` and no `type`, an item with `type` and no `coll`, and matching on
  `type ?? coll` silently drops every item. After the fixes the demo reports one honest info finding per screen
  and a `review` verdict whose only findings are the two real `OPTIX-PROD-04` anonymous-starting-user warnings.

- **Four user-visible strings in `packages/optix/lib/index.js` were mojibake.** The `optix_screenshot` preview
  line, the `optix_template` description (two places), a comment quoting the bridge's "No behaviour or observer
  found that handles the method", and the `optix_design_check` truncation marker held UTF-8 that had been read
  as CP1252 and re-saved two to four times (`Ã¢â‚¬â€` where an em dash belongs). `git show HEAD` proves it was
  committed, not introduced by this session, and a scan over `git ls-files` shows this file was the only one in
  `packages`/`docs` carrying it. Repaired by applying the same forward corruption to the intended character and
  replacing the computed run verbatim — a character-class regex was tried first and split one run into pieces,
  leaving fragments in the middle of a tool's output string. The file now holds six non-ASCII characters, all
  intended, where HEAD held 74, all corruption.

- **A fill size without its Stretch alignment rendered at the content size, so a container screen drew as a
  stack of small cards.** `surface()` in `packages/optix/lib/screens.js` and `cellSurface()` in
  `packages/optix/lib/kit.js` wrote `Width`/`Height` `-1.0` and never wrote `HorizontalAlignment`/
  `VerticalAlignment`, and `layout()` in `packages/optix/lib/containers.js` wrote an alignment only when the
  caller passed one — so card rectangles and their `Body` columns kept the default. The first live render of the
  SMT demo showed four cards hugging their text at ~95 px inside a 1060 px row, each short inside its row
  (`optix-proof/smt/shots/demo-linestatus.png`, 2026-11-17), while the probe that proved the row split had
  always written the pair (`Width -1` **and** `HorizontalAlignment 3` → 530 + 20 gap + 514). `layout()` now
  derives the alignment from the size — `FILL` implies `ALIGN.STRETCH`, a pinned pixel size gets none — and both
  leaf emitters emit `stretch`/`stretchVertical`. The live screens were repaired in place with 48
  `set_property` operations and re-rendered as two equal rows splitting the row 50/50 with every card filling it
  (`optix-proof/smt/shots/demo-stretch-linestatus.png`, `…-alarms-full.png`).

- **`optix_logs` returned invalid output and killed the whole call.** `tailFile` put a `Date` object in
  `mtime`, which the structured tool-result contract rejects as "value is not lossless JSON", so the tool
  failed with no log at all — in the middle of a session whose blank label needed exactly that log
  (measured 2026-11-16, session f7c609cb). Every registered tool now returns through one `jsonSafe`
  sanitiser (`packages/optix/lib/json.js`): dates become ISO strings, `NaN`/`Infinity` become null,
  bigints and `Map`/`Set`/`Error` are converted, and a cycle becomes null rather than an exception.

- **A project folder passed as `project` was rejected as a project name.** `optix_emulator`,
  `optix_save` and `optix_logs` required `project` and then looked for `<project>.optix`, so
  `project: "C:\\…\\MyProject"` failed with `missing required property "project"` or a folder that held
  nothing (session f7c609cb, 2026-11-16). One resolver (`packages/optix/lib/refs.js`) now accepts a
  name, a `project_root`, or the folder itself as `project`, and derives the name from it.

- **A batch naming an array-valued property validated, applied half, and stopped `indeterminate`.** The
  bridge's `validate_ops` cannot see that a property is array-typed when the node it names is created later in
  the same batch — its catalogue declares `GridLayout.Columns` as `String` while array-ness lives in
  `ArrayDimensions` and the CLR proxy type — so a 35-op batch answered `ok`, the eleventh op (`Columns`) came
  back `unsupported_array_write`, and eleven operations were already in the model (measured live 2026-11-16 on
  `AryaSMTLineDemo`). `runValidatedBatch` now refuses the whole batch before a byte is sent
  (`arrayWriteRefusal` in `packages/optix/lib/containers.js`, keyed on `ARRAY_VALUED_PROPERTIES`:
  `Columns`/`Rows` as `String[]`, `AliasNodeArray` as `NodeId[]`), naming the fix rather than only the refusal.
  This matters beyond tidiness: the bridge's own guard comment records that a scalar write reaching the assign
  path of an array variable has terminated Studio outright.

- **A script pointer created as `NodePointer` made the runtime kill the node at boot.** `optix_script`
  `pointers` created the variable with `datatype: "NodePointer"`, which resolves to a VariableType, so the
  bridge takes its `MakeVariable(name, BaseDataType, dtId)` route (`StudioMCPBridge.cs:2240-2261`) and the
  variable lands as `Type: NodePointer` with `DataType: BaseDataType`. The Value coercion dispatches on that
  DataType name, misses its `NodeId` arm (`:4090-4110`), and stores the authored path as a plain String;
  Studio saves it as `{"Type":12,"Body":"Model/..."}`; the runtime hands that String to
  `(NodeId)pointer.Value` and the node dies with `[code=df0003] … InvalidCastException …
  UAValue.op_Implicit` — `Start()` is not retried and the class never runs. `retype` cannot repair it: it
  refuses every datatype outside its ten scalar names (`:2320-2330`). Pointers are now created with
  **`datatype: "NodeId"`**, which lands as `BaseDataVariableType` + `DataType: NodeId` + a path Value — the
  shape Rockwell's own `SystemNode` pointers carry. Measured end to end on `AryaSMTLineDemo` 2026-11-17: a
  bridge-created `NodeId` pointer on a bridge-created NetLogic node resolved in the runtime and a
  `PeriodicTask` wrote through it (`Target resolved to ProbeCount 9/232dc5fd-…`, then
  `wrote through the pointer: ProbeCount = 10 / 20 / 30`, one second apart, no `df0003`).

- **The templates' pointer read could not compile, and its cast could not work.** The `periodic` template
  wrote `value.Value = Convert.ToInt32(value.Value) + 1;`, and `IUAVariable.Value` is `dynamic`, so the call
  is ambiguous between `Convert.ToInt32(bool)` and `Convert.ToInt32(DateTime)` and does not compile against
  Studio 1.8.1.27 (`error CS0121`, measured on the first live `ProbeTickLogic` build). It now reads through
  an `int`. The read of the pointer itself is now `targetId = (NodeId)target.Value;` inside a `try/catch`:
  `IUAVariable.Value` hands back a `UAManagedCore.UAValue` wrapper, so a `raw is NodeId` type test is always
  false and the conversion is the only thing that can succeed — and it is exactly what throws when the
  variable is not a NodeId. All five emitted templates were then compiled against Studio 1.8.1.27 (0 errors,
  0 warnings) and rated clean by the package's own review.

### Added

- **`VIEW-LAYOUT-03`: a layout that leaves nothing for the child meant to fill is now reported.** Measured on a
  probe screen authored through `optix_edit` and deleted after it was read (`UI/Screens/ProbeContainers`,
  2026-11-17): a child declared 900 px wide inside an 800 px design track rendered **1192.5 px** and its
  `Width -1` sibling rendered at **w=0**, drawn past the window edge — a layout neither shrinks nor clips a
  child to make room for its neighbours. The rule reads a `RowLayout`'s or `ColumnLayout`'s children on its
  filling axis, resolves the track from the layout's own size, else from the design box of the `ScaleLayout` it
  fills (`track_from`), else from the nearest ancestor naming a size, and reports the px the fixed children take
  plus the gaps, `scaled_by` and `past_the_box` for the rendered overflow. Gaps are added **unscaled**, because
  the same probe measured a 20 px row gap and a 10 px column gap staying exact through a 1.325 × 1.6 stretch. A
  child at `-1` needs the track strictly bigger than what the named sizes took; children that fill the track
  exactly are not a finding. Children that report no size on the axis are named once per layout as an `unchecked`
  line rather than counted as zero.
- **The container behaviours the emitters were guessing at are measured.** Same probe, four questions the
  `screens-and-layout` playbook used to list as owed: two `Height -1` rows in one `ColumnLayout` **split it
  equally** (299 px each out of 608 px with a 10 px gap, so `rowHeights` is for a band the design must pin, not
  for making rows equal); `ContentAlignment` is `ContentHorizontalAlignment` `0 Left / 1 Center / 2 Right` with
  **no Stretch member** and positions natural-sized children only (labels at x 220 / 430 / 657), so a child at
  `Width -1` + `HorizontalAlignment 3` ignores it; a STRETCH `ScaleLayout` scales **non-uniformly** (800×500
  design in a 1060×800 host → 1.325 × 1.6) while a nested `ScaleLayout` on Fit computes its uniform factor from
  **its own rendered box** (265×160 ÷ 100×50 → 2.65) and centres that box when the aspects differ; and the
  runtime hands a screen the box its mounter **declares**, not the window's. The measurement route is recorded
  too: the runtime's DOM ids are not the bridge's node guids (`getElementById` fails for every guid a map
  returns), so a rendered layout is read structurally through `[data-type="…Layout|rectangle"]`,
  `getBoundingClientRect()` and the computed `placeSelf` / `gridTemplate*`.

- **Screens and shells are built from layout containers, not from absolute coordinates.** Every scaffolded
  screen now has one direct child — a full-canvas `ScaleLayout` (`FillMode` Fit, `OriginalWidth`/
  `OriginalHeight` at the design box) — and inside it a `ColumnLayout` chrome whose header band, content
  `ColumnLayout` and footer `RowLayout` place their children; the content column holds one `RowLayout` per
  row of cards, the cards are items of that row, and each card's rows sit in a `ColumnLayout` of its own. The
  shell gained header and footer `RowLayout`s over the same measured bands. New module
  `packages/optix/lib/containers.js` holds the one spelling of each container and its enum values (`Width`
  `-1.0` + `HorizontalAlignment` `3` is fill/stretch, as the shipped starter YAML writes it). A screen
  authored at 1280×800 therefore reflows into a larger window instead of sitting in it letterboxed at its
  drawn coordinates, which is what the previous generators produced: measured in the runtime preview, a 400×200
  rectangle designed at (100,100) rendered 330×165 in a 1060×736 content area (fit factor 0.828, exactly
  `min(1060/1280, 736/800)`) with its 28 px label unscaled, and two cards at `Width -1` + `HorizontalAlignment
  3` split a 1060 px row as 530 + 20 gap + 514 (`optix-proof/smt/shots/probe-scale4.png`,
  `optix-proof/smt/shots/probe-rc.png`). Studio's own `GridLayout` is never emitted: its `Columns`/`Rows` are
  `String[]` and the bridge refuses a scalar write to them (`unsupported_array_write`) — after `validate_ops`
  passed the batch, because the catalogue declares `Columns` as `String` and array-ness lives in
  `ArrayDimensions` — and its per-cell `GridLayoutProperties` child was the last thing written before Studio
  died with a native `invalid unordered_map<K, T> key` in `HMISolution` (2026-11-16), which cost every unsaved
  edit of that session; `layout()` refuses both node types before a batch is built, and an unequal track pair
  is two explicit pixel widths because no `fr` template is writable. `maxScreenOps` default rose 240 → 400
  because a container tree costs more operations than the flat one it replaced (130/176/228/274 for 1–4 cards,
  153/199/252/298 with a navigation row), and `optix_screen` `library_items` now instantiate inside the design
  canvas so a stamped composite scales with the screen. The `NavigationPanel` rail and the `PanelLoader` were
  deliberately left where they are: a navigation button moved inside a panel resolves the design-time loader
  under the runtime tree and the runtime answers that nothing handles `ChangePanel` (measured 2026-11-14). What
  a live session still owes is listed in `packages/optix/skills/screens-and-layout.md`.

- **`optix_script pointers` — a NetLogic reads its target through a `NodePointer` variable instead of a
  node path in the source.** `pointers: [{name: "Target", target: "Model/Smt/LineSpeed"}]` creates the
  `NodePointer` variable under the logic node and points it; the `periodic` and `observer` templates now
  read `LogicObject.GetVariable("Target")`, check `NodeId.Empty`, and resolve once in `Start()` with
  `InformationModel.GetVariable`. A path string compiles and then breaks silently when the object moves
  — no build sees it — while the pointer is updated by the move itself. The review gained
  `OPTIX-NL-14` (a pointer cast with no empty check, warning) and `OPTIX-NL-12` now rates a hard-coded
  `"Model/…"` literal a warning with the pointer fix named, comments excluded so a generator cannot flag
  its own output.

- **The Optix skill tells the agent what to do when the bridge is down.** `SKILL.md` gained "The bridge
  is down": ask once for Studio + StartBridge, treat an empty `ask_user_question` answer as *nobody is at
  the console* rather than as permission, name what the file channel may still do with Studio closed,
  forbid hand-written bindings called bound, and stop after two failed attempts at the same fact. Written
  from session f7c609cb (2026-11-16), where a run read `studio_running: false`, hand-wrote UI YAML for an
  hour and produced a screen whose every `DynamicLink` was dead.

- **`optix_project check` resolves bindings instead of only parsing chapters.** A hand-written UI chapter
  could report `ok: true, critical: 0` while every `DynamicLink` in it pointed at nothing — exactly what
  session f7c609cb believed for thirty steps and six emulator rebuilds. The check now reports
  `unresolved_dynamic_link` and `unresolved_pointer` (critical) for a value naming a node the project does
  not declare, `pointer_to_ui_object` (warning) for a NetLogic pointing at a per-session UI object,
  `binding_unverified` (info) for a spelling files cannot prove, and `VIEW-LAYOUT-01` / `VIEW-SCALE-01`
  (warning) for a screen that is pinned rectangles with no `ScaleLayout`. Measured on the shipped starter:
  128 judgeable links, 121 resolve, 7 info — and on the customer template in `KphungFROMM`, 2 criticals
  that are genuine dead links. Staging keeps the gate (an edit on top of a dead reference would hide it)
  but now says whether the dead link is the plan's own or inherited, so the reader looks in the right file.

### Documentation

- **Two playbooks said a thing that was not true, and both were corrected by doing the thing.** Written from
  the 2026-11-17 SMT demo session (`AryaSMTLineDemo`, Studio 1.8.1.27). `packages/optix/skills/alarms.md` told
  the reader that a rendered `AlarmGrid` gives a preview test no row hook, so an acknowledge could only be
  screenshotted — it was wrong: each state column is a `<div data-column-index="4|5|6">` wrapping an `<img>`
  whose `src` names the state (`RadiobuttonDarkEmpty.svg`/`RadiobuttonDark.svg` for Active,
  `ApplyDark.png` ✓ / `CloseDark.png` ✗ for Acked and Confirmed), `[data-type="dataGrid"] [data-index="0"]`
  selects a row, and one click on the widget's own `Acknowledge` flipped Acked ✗→✓ in 1.2 s. The playbook now
  names the two conditions that had made it look impossible: the shipped `AlarmGridLogic` must be in
  `bin/<project>.dll` (an import copies the `.cs` but does not rebuild, and until it did the runtime logged
  `ERROR (FTOptix.NetLogic) [code=df0009]: User-defined logic type 'AlarmGridLogic' is missing in the .NET
  assembly` — only in sessions that opened the alarm screen, because a NetLogic loads when its panel is
  instantiated), and an acknowledge does not persist against the next re-raise of an `InputValue`-linked
  controller (the row's timestamp advanced every ~12 s, faster than the 30 s logic write).
  `packages/optix/skills/data-logger-trend-sql.md` told the reader the `VariablesToLog` children could not be
  authored through the bridge and that AdvancedTrend's pens arrive disabled — both wrong. `VariableToLog` is a
  variable kind, so `create_variable datatype:"VariableToLog"` + `set_link` works and the runtime built the
  table from those children (`CREATE TABLE "SmtTrend" ("Timestamp" DATETIME,"LocalTimestamp" DATETIME,"OEE"
  REAL,"UPH" INTEGER,"CycleTime" REAL,"TotalUnits" INTEGER, "Id" INTEGER)`, 360 rows in 162 s); the pens in the
  measured instance all arrived **enabled**. That playbook now also carries what a store actually is on disk
  (`ApplicationFiles/<store guid without dashes>.sqlite`, and WAL mode leaving the main file at 4 096 B while
  its `-wal` reached 4 144 752 B), the three refused logger properties (`LogVariableTimestamp` and
  `LogVariableOperationCode` are `unknown_property` although the bridge's own `valid_properties` names them;
  `LogMethod` is `proxy_only_property` — *"creating it crashes Studio"*), the record-limit warning every session
  logs and the fact that no tool sets `Table.RecordLimit`, and the `Widgets/AdvancedTrend` import's real shape
  (a **Folder** of 12 types, not one PanelType) with `Logger` as a **`NodeId`**.

- **A playbook page for the refusals, so a session reads them before it pays for them.**
  `packages/optix/skills/gaps-and-refusals.md` (new) is the consolidated register of Batches A–D: what the bridge
  refuses by design (array-valued properties and the partial `indeterminate` write they cause, `move` on an
  ObjectType, `create_object ScreenType`, `DigitalAlarm`, the three logger properties, `bind` on a
  `VariableToLog`, `Table.RecordLimit`, a same-batch `NodeId`, `retype` onto a pointer, `set-structured` with no
  op), what our own gate refuses because the bridge let it through, what our playbooks used to get wrong, and the
  failures that **report success while nothing moved** (a bridge write is not durable until `optix_save`; a
  NetLogic loads when its panel is instantiated, so a clean startup log proves nothing; a `NodeId`'s namespace
  index is session-local — `102/…` from the bridge, `9/…` from the runtime for the same node; WAL mode makes a
  store-file size poll lie; `needs_save.pending` survives a Studio crash). `lib/skills.js` discovers pages by
  scanning the folder, so the page needed no index; `optix_list_skills`'s description and the `SKILL.md` playbook
  table now name it.
- **One cosmetic residue diagnosed instead of rewritten.** `CHANGELOG.md` carries 445 corrupted punctuation runs
  across 76 historical lines. It arrived in one commit (`ab5fe6011`, 2026-10-28, 99 marker sequences where its
  parent had none) and compounded to 7 032 as later edits re-encoded already-corrupted text.
  `scripts/repair-encoding.mjs` refuses it — every undo layer shrinks the damage (7 032 → 3 251 → 1 516 → 679 →
  199) but yields U+FFFD, which its acceptance loop rejects — and a deterministic forward model (50 candidate
  punctuation characters through 6 corruption layers, replace only on an exact match) repaired **0 of 445**,
  because the stored runs begin with `¡` (U+00A1), which a pure UTF-8→cp1252 chain of punctuation never produces.
  A scan of 2 260 textual files repo-wide found **no file carrying U+FFFD**, so nothing was ever lost and the
  prose is left as it is; the recorded rule is the cause: never let text round-trip through a cp1252 console, and
  never put mojibake literals on a pwsh command line, where they are re-parsed as commands.

## 0.99.0 — 2026-11-16

### Fixed

- **`attach_formatter` wrote a StringFormatter whose sources could never resolve, so the bound label
  stayed empty.** The converter named its source children after the caller's labels (`Sourceoee`,
  `Sourceuph`) while Optix resolves a placeholder `{0}` from a child named exactly `Source0` and `{1}`
  from `Source1`; the runtime reported `Missing source variable 'Source0'` once per session and drew
  nothing (found live on `UI/Screens/Diagnostics/OeeFmtLabel` in the demo project, 2026-11-16). The
  bridge now names them by placeholder index, which is the contract the vendor cheat sheet documents
  (`netlogic/pages/dynamic-links.md:393`). Verified by compiling the mirrored bridge into the demo
  project's NetSolution (0 warnings, 0 errors); the render check needs a Studio build, which the bridge
  cannot do.

### Added

- **`optix_save`** — save the project from the agent and prove the write landed: it raises Studio, sends
  Ctrl+S only once the foreground is confirmed, retries until a file under `Nodes/` or
  `ProjectFiles/NetSolution/bin` is newer, and reports attempts, keystrokes, latency and `saved_at`.
  Needs `allowWrites`.

- **`optix_list_skills` and `optix_get_skill`** — the plugin's own Optix topic playbooks: nine pages under
  `packages/optix/skills/` written from live measurements (authoring loop, bindings and expressions, runtime
  C#, alarms, data logger/trend/SQL, dialogs and login, screens and layout, verifying and releasing, PLC tag
  import). `SKILL.md` gained a table that points at them.

- **`optix_logs`** — read the tail of the Optix runtime log (chosen per project by name) or of the
  bridge/Studio log, with a `filter`, so a blank label becomes the one line that explains it. Read-only.

- **`optix_invoke`** — call a method on a live node (acknowledge an alarm, close a dialog, a logger's `Log`).
  It reports the bridge's answer verbatim, including the honest `No behaviour or observer found` refusal that
  separates a real behaviour node from a plain object the bridge created. Needs `allowInvoke`.

- **The Optix plugin can import PLC tags into a station, which it previously could not.** The new bridge
  route `POST /bridge/station/import-tags?station=&mode=offline|online&file=&tags=&replace=&timeout_s=&dry_run=`
  and the matching `optix_edit` op `import_tags` drive the station's design-time `TagImporter`
  (`UAManagedCore.TagImporterAPI`): it lives in Studio and not in a runtime, so the bridge is the only place
  the import can happen and no screen can do it. An offline import takes an absolute L5X or TPY path and
  refuses anything else with `invalid_import_file` (the root element decides the kind); `tags` filters with
  the documented dot-boundary rule (the symbol, its children, its parents); `replace=false` never removes a
  station tag and refuses up front with `would_remove_tags` plus `removed_would_be`, so a merge cannot
  silently drop a tag; `dry_run` answers `would_add`/`would_remove` without touching the importer; the result
  reports `added`, `removed`, `already_present`, `not_found`, `skipped` and `elapsed_ms`. Exercised on the
  demo project: the route, the filter, every refusal code, `FilePath`/`Mode` on the real importer, and the
  prerequisite that a station must carry a `TagImporter` child. The end-to-end import is **not** yet proven
  there — the offline `Import()` against a bridge-created station did not finish inside the timeout — and
  the docs say so. Documented in `docs/reference/optix-model.md`.

- **The Optix bridge can put a dynamic link on a variable, not only on a property.**
  `POST /bridge/node/set-link?path=&source=&mode=Read|Write|ReadWrite` links the variable at `path` to the
  variable at `source` with the same `SetDynamicLink(source, mode)` call `bind` uses, so the relative form
  is produced automatically inside an `ObjectType`. This is the case `bind` cannot reach: a module-typed
  variable (`VariableToLog`, `StoreColumn`, `TrendPen`, `EventFieldPath`) has no property for its own value,
  so a `DataLogger`'s logged variables could be created — after the module-datatype change below — but never
  pointed at a tag, and the logger silently wrote null columns. A non-variable target, a source that is not
  a variable and a source that does not resolve are each refused with their own code, and `mode` is
  validated rather than defaulted. Verified live on the demo project: four `VariableToLog` elements linked
  to `Model/Smt/{OEE,UPH,CycleTime,BoardsOut}`, the links present in `Nodes/Loggers/Loggers.yaml` after a
  Studio save, and the DataLogger's table then created with those columns. Documented in
  `docs/reference/optix-model.md`; the tool layer still has no op for it,
  which is recorded there alongside `set-structured`.

- **The Optix bridge can author module-typed children, and the route for a structured property.**
  `POST /bridge/model/variable` now accepts an FTOptix module type BrowseName as `datatype` alongside the 18
  builtins — `VariableToLog`, `StoreColumn`, `EventFieldPath`, `EventFieldToLog`, `TrendPen` — and makes it
  the variable's *variable type* through `MakeVariable(name, BaseDataType, moduleTypeId, null)`, reported as
  `variable_type`; a bare name takes the first module catalog that carries it and `FTOptix.Module.Type` pins
  one, because each module keeps its own types in `ObjectTypes` and its children's types in `VariableTypes`
  (the resolver scanned only `ObjectTypes`, so `DataLogger.VariablesToLog`, a store table's `Columns` and
  `EventLogger.EventFieldPaths` were unreachable and with them data logging, trending and SQL history). The
  builtin path is unchanged and a name that resolves to neither still fails with the builtin list plus how to
  qualify a module type. The same route takes an optional `display_name`, so one call can create and label.
  `POST /bridge/node/set-structured?path=&name=&effect=append|replace` is new: a JSON array body writes the
  element objects of one placeholder child collection (a pen, a store column, a logged variable, an event
  field path), resolving the property from the node's type and requiring `IsPlaceholderColl`, so it never
  fabricates an undeclared variable — the crash the `set_property` array guard exists to prevent. Every item
  is validated before the model changes (unknown field with the valid list, non-collection with the
  collections the node has, read-only by name, blank/non-array body, more than 200 items, duplicate name),
  each field is coerced by the same code `set_property` uses, a failed batch rolls back what it created and
  `effect=replace` says it cannot restore what it removed. Compile-verified offline against the demo
  `NetSolution` (0 warnings, 0 errors) and shipped byte-identically in the bridge and all three template
  copies; documented in `docs/reference/optix-model.md`, including the gap
  that no plugin tool maps the structured route yet.

- **`optix_edit` can write a dynamic link onto a variable: the `set_link` op.** The `set-link` route existed
  and was proven live — it is what points a DataLogger's `VariableToLog` elements at their tags — but nothing
  in the batch vocabulary reached it, so a logger authored through the plugin still logged null columns. The
  op is `{"op":"set_link","path","source","mode"}`, `mode` defaults to `Read`, and a link to the target
  itself is refused. The structured-collection route is still bridge-only: it needs a JSON body, which the
  batch sender does not send yet, and `docs/reference/optix-model.md` says so rather than implying parity.

### Fixed

- **Every bridge refusal now carries the failure that actually happened.** `ExcMsg` reported only the
  outermost exception, so a property getter or a task that threw through reflection read as
  `TargetInvocationException: Exception has been thrown by the target of an invocation.` — the same string no
  matter what broke. It now unwraps `TargetInvocationException`/`AggregateException` up to five levels and
  keeps the chain, which is how `import_tags` came to name its real cause: `ArgumentException: Station node
  ... does not contain a TagImporter object.`

- **`import_tags` counts only tags when it decides what a merge would remove.** The station census walked the
  whole station subtree, so `replace=false` refused every import with `would_remove_tags` listing `Route`,
  `StationStatusVariables.*`, `Types.*` and `TagImporter.*` — 31 structural children that are not tags. The
  census now starts at the station's `Tags` folder (falling back to the station when it has none), so a merge
  reports the tags it would really drop.

- **The PLC file path is built with the `ResourceUri` this build actually exposes.** `import_tags` reached the
  importer and then answered `invalid_import_file` because `UAManagedCore.ResourceUri` does not exist in
  1.8.1.27 (`CS0234`), and the AppDomain reflection fallback did not find it either. The route now calls
  `FTOptix.Core.ResourceUri.FromAbsoluteFilePath` directly, with the reflection kept as a fallback.

- The shell rail's own spec asserted a 6-item cap while `SHELL_MAX_RAIL` had been raised to 12; the spec now
  imports the constant, so a cap change is a one-line change again.

## 0.98.0 — 2026-11-15

### Added

- **A branded application starter, `arya-optix-app`**, alongside the two blank ones. It ships what the build loop used to create: a 1280x800 window with the header band (brand, title, status chip, clock, user), a native `NavigationPanel` rail hosting three designed screens (`Overview`, `Alarms`, `Diagnostics`), a `ConfirmResetLine` dialog wired through `OpenDialog` and closed by the dialog's own `Close`, the vendor `FriendlyLight` stylesheet bound on both presentation engines, and the bridge compiled in. `optix_template` now offers three starters with their questions; the manifest carries 74 files, 2,281,125 bytes and a content hash, and a scaffolded copy was validated through the file channel (`ok:true, critical:0`) with the project name rewritten in all 7 name-carrying files and no stale `AryaOptixApp` reference.

### Fixed

- The shell is a native `NavigationPanel` that hosts the screens: the rail now switches the content,
  and the `PanelLoader`/`AttachedPanelLoader` phases are gone (measured against the running runtime).
- `optix_ui theme` keeps a stylesheet binding the bridge did not write, so applying a language no longer
  repoints a project away from a working Studio-authored sheet.
- A dialog opens with three typed `OpenDialog` arguments (project-relative `Dialog`, so it lands as a
  `NodeId`), closes through its own `Close` method instead of the non-existent `CloseDialog` command,
  carries a surface behind its text, and completes a partially built type instead of refusing.
- `optix_ui dialog` places its trigger on the dialog's own screen canvas and repairs missing children.

- **The Optix UI kit grades what it drew.** `optix_ui { action: "review" }` reads a screen through the bridge and scores it against the design rubric: a header band with a title, chip, clock and user; a native `NavigationPanel`; every control at least 44x44; no text below 11 px; one style sheet on both presentation engines; a vendor component or process drawing in the content; and the same shell across screens. A critical finding costs 40, a warning 10, `professional` needs 85 with no critical left, and `must_fix` names the node and the repair. The rules that need a runtime - does the confirm dialog open, does the active tab follow the screen, does the grid show values - are reported as `unverified` and never counted as a pass. Measured live on `AryaOptixTemplate` at 1280x800: the same screen went from `30 (entry-level)` with `VIEW-NAV-01` and `HMI-CONTRAST-01` critical to `90 (professional)` after `optix_ui action theme` bound one sheet on both engines and `action shell` drew the header, rail and status strip. The shell header also gained a status chip and a 25 px title, and `theme` is idempotent: a second apply restates the tokens and named styles instead of re-creating them (the bridge refuses `already_exists`).


- **`optix_ui`: a screen is designed by a language, not by colours picked per widget.** Seven design
  languages ship in `packages/optix/lib/languages.js` — `modern` (default), `modern-dark`, `isa101`,
  `isa101-hc`, `material-dark`, `minimal-light`, `kiosk` — each with its `StyleSheet` tokens, its named
  button/label/screen/navigation/chart styles and its design-check profile. `action theme` plans the
  whole sheet before writing (`plan`), then applies it behind `allowWrites`: it validates strictly,
  dispatches one operation at a time and **reads both presentation engines back**, because the engine's
  own `StyleSheet` property accepts a write while the engine keeps the sheet it had (measured on bridge
  1.0.9). Every pointer write goes on the pointer node's `Value` child, in the **project-relative**
  spelling (`UI/<Sheet>`): the `/Objects/<Project>/…` form is refused by `validate_ops` with
  `bad_value: NodeId value must be a resolvable node path`, whether or not the sheet exists. `action
  audit` scores what the model actually carries (`THEME-01`…`THEME-04`: an engine still on
  another sheet is critical; missing tokens or named styles are warnings) and `action languages` lists the
  catalogue. Re-applying is safe and repairs a sheet someone edited by hand. Proved live on
  `AryaOptixTemplate` (bridge 1.0.9): 78 operations in three phases, `engine_refs_verified: true`,
  `audit` `ok: true, score: 100`, with `test/optix-live-theme.mjs` restoring the project afterwards.
- **`optix_ui` also drafts screens from a blueprint.** `action components` lists the kit the active
  language draws with (header band, KPI tile, card, bar chart, message feed, status strip, lamp, divider,
  hero image) and `action screen` compiles a `pattern` plus its regions into validated operations:
  `packages/optix/lib/layout.js` is the 12-column arithmetic (`PAD 24`, `GUTTER 20`, 44 px target floor,
  width classes `compact`/`standard`/`wide`, an 88 px header, a 56 px footer, a 96 px KPI strip) and
  `packages/optix/lib/kit.js` is one builder per component; a body that cannot fit is refused with
  `layout_overflow`/`layout_too_narrow` instead of drawn overlapping. The batch is validated
  `strict: true` before anything is written and applied one operation at a time with a health re-check.
  Colours are emitted as `#RRGGBB` because `validate_ops` refuses the `0xRRGGBBAA` spelling
  (`Color must be #RRGGBB / #AARRGGBB hex or a UInt32 decimal`), and the card component is named
  `DataCard<n>` so it cannot collide with a legacy scaffold's `Card1` (`already_exists`). Proved live on
  `AryaOptixTemplate` against a fresh `UI/Screens/UiProbe`: `planned`, 287 operations, 19 components,
  `validation: ok`, then `applied: 287`; the visual proof belongs to the starter release that follows.
- **The window shell is a tool now (`optix_ui action shell`).** `packages/optix/lib/shell.js` composes the
  four bands every professional Optix application keeps around the content — a 64 px header (brand bar,
  title, clock, user), a native `NavigationPanel` rail (220 px, clamped 160-280), a content host and a
  30 px status strip — with the active language's tokens. The rail is a real `NavigationPanel`:
  `NavigationPanelItem`s live under `<rail>/Panels`, each with a `Title` and a `Panel` pointer, and the
  panel's `AttachedPanelLoader` points at the loader, so a tab click calls the panel's own
  `ChangePanel` rather than a hand-wired handler. The plan is **phased** — `chrome`, `rail`, `attach`,
  `pointers` — because Studio creates a panel's `Panels` collection with the panel and a `NodeId`
  property has no pointer child until it is written (measured: writing `AttachedPanelLoader` materialises
  the pointer with an empty `ref`; the value goes on the child afterwards). A second apply is a repair:
  an existing band or rail item is restated, never created twice. Proved live on `AryaOptixTemplate`
  (bridge 1.0.9): `planned` 59-69 operations across four phases, then `applied` with every phase written,
  and all four pointer values read back (`RailItem1.Panel = UI/Screens/Settings`,
  `ShellContent.Panel = UI/Screens/Settings`, `ShellRail.AttachedPanelLoader = UI/MainWindow/ShellContent`).
- **Vendor components and artwork (`optix_ui action components|assets`).** `packages/optix/lib/adapters.js` places
  the widgets the template library ships instead of drawing a lookalike: `alarmBanner`, `alarmGrid`,
  `alarmHistoryGrid`, `trend` (`AdvancedTrend`), `recipeEditor`, `loginForm`, `userEditor`, `gauge`,
  `stationStatus`, and the builtin `dataGrid`, `histogram` and `trendNative`. A blueprint names them in
  `adapters[]` with `kind`, `name`, `type_path` and `bindings`; a library-backed adapter with no `type_path`
  refuses `adapter_not_imported` and names the `optix_library` import, and anything it could not bind is reported
  in `unbound` rather than guessed. `packages/optix/lib/assets.js` authors 16 icons (24×24, SVG 1.2 Tiny, hex
  fills) and 2 process drawings (`conveyor`, `tank`, every movable part carrying an `@id` for `optix_svg bind`)
  and writes them into `<Project>/ProjectFiles/imgs`, the only folder `%PROJECTDIR%` serves — `<Project>/imgs` is a
  404 at runtime. `action "assets"` plans and writes them (`mode: "apply"`, optional `only[]`). Measured live on
  `AryaOptixTemplate` (bridge 1.0.9): `action components` answered 9 drawn components plus 12 adapters, the asset
  plan wrote nothing, and `mode: "apply"` with `only: ["home","alarms","conveyor"]` wrote 3 files into
  `ProjectFiles/imgs`.
- **Dialogs for the commands that cannot be undone (`optix_ui action dialog`).** `packages/optix/lib/dialogs.js`
  plans a `Dialog` object type under `UI/Dialogs` — title, message, a `Confirm`/`Cancel` pair boxed bottom-right,
  `Modal 1` — and wires both buttons through Studio's own `UICommands.CloseDialog`; an optional trigger button on
  a screen wires `UICommands.OpenDialog` with the dialog named as `/Objects/<Project>/UI/Dialogs/<Name>`
  (`plan` writes nothing, `apply` is behind `allowWrites`). It is written in five phases (`folder`, `type`,
  `content`, `wire`, `trigger`) because a `Dialog` type's children only exist once the type does, and each phase
  is validated against the model the previous one left. A second `apply` **restates** the wording and the boxes
  instead of creating a second button or a second handler, because `create_widget` on an existing name is refused
  as `already_exists`. Measured live on `AryaOptixTemplate` (bridge 1.0.9): first apply `applied 35` with phases
  `1 / 4 / 25 / 2 / 3`, second apply `applied 24` with `folder 0 skipped, type 3 applied, content 21 applied,
  wire 0 skipped` and no trigger phase; the type reads back with `Width, Height, Modal, DlgTitle, DlgMessage,
  DlgCancel, DlgConfirm` and the trigger opens it. Optional `destructive: true` marks the dialog for
  `optix_design_check`'s `VIEW-DLG-01`.

## 0.97.0 — 2026-11-15

- **A second authoring channel: the project files, behind gates.** `optix_project` reads and edits the
  project the way Studio stores it — the `.optix` document, its `- File:` registrations and the YAML
  chapters under `Nodes/` — because the bridge cannot rename a project, add a whole subtree, or repair a
  project whose Studio session cannot be reused. It refuses while Studio has that project open
  (`project_open_in_studio`), while the bridge holds unflushed changes (`bridge_state_unflushed`) or while
  another write runs (`write_in_progress`); `stage` replays the operations in memory and reports per-file
  hashes, `apply` writes every file or none, keeps the previous bytes under
  `ProjectFiles/.dsh-backups/<id>/`, and `diff`/`restore` undo exactly that apply. `force` clears a plan
  whose file changed on disk and nothing else. The writable set is `Nodes/**/*.yaml`,
  `ProjectFiles/NetSolution/*.{cs,csproj,sln,references}`, the `.optix` pair and `ProjectFiles/{imgs,res}`,
  bounded at 400 files per plan.
- **`optix_build` answers the build question without Studio.** `status` reports whether the DLL the
  runtime loads carries the newest sources (`built`/`stale`/`never_built`, measured against `bin/` and the
  newest `.cs`); `init` scaffolds a `net8.0` solution and its `.references` file in Studio's own shape;
  `references` regenerates the 43 assembly references from the installed modules (41 module + 2 binding
  assemblies, forward slashes, `<Private>False</Private>`) and reports `unchanged` or
  `rewritten_after_upgrade`; `check` copies `ProjectFiles/NetSolution` to `%TEMP%` and runs `dotnet build`,
  so a C# edit is proven before anyone presses a key in Studio. `optix_status` now also reports
  `build_state` when given `project` or `project_root`.
- **The rules that came out of the file format.** A `- File:` registration resolves relative to the
  directory of the chapter that names it, and the chapter's own root node is the node that registration
  becomes — a registration nested under a node is silently never loaded. `set_project_name` rewrites the
  absolute `Authentication.DefaultUserFolder` pointer too, which is why a hand rename breaks login.
  Validating a real 54-chapter project reports criticals only for a missing chapter, invalid YAML, a
  reference without a target or a pointer naming another project root; Studio's own duplicate child names
  and library types outside the help catalog are warnings and notes.
- **Typed navigation, and a proof that the buttons work.** `optix_nav` plans the window-level bar from the
  window canvas, creates only the buttons that are missing, wires each one through the loader's
  `ChangePanel` with a relative `../<loader>` pointer (the design-time NodeId that `OPTIX-PROD-01` clears is
  never written), and then clicks every button in the served preview: `verify` returns `verified` only when
  each click put that button's screen on the display, judged by the loader's `Panel` read back through the
  bridge or by the served page naming the target on a line that was not on screen before the click (bridge
  1.0.9 renders a `NodeId` property as `(Null)`, so the page text is the evidence when the panel cannot be
  read). `plan`, `apply` and `reconcile` are idempotent; a repaint is reported and never counted as a pass.
  It exists because the installed help does not document `ChangePanel` at all — the sample projects are the
  source. Proven on a running project: three buttons, three clicks, `verified`.
- **Two NetLogic templates measured from Rockwell's own code.** `optix_script` gained `nav` (a runtime
  class inside the `PanelLoader`, `Owner as PanelLoader`, one parameterless-per-target `Open(string
  screenPath)` that resolves `Project.Current.Get<ScreenType>` and calls `ChangePanel`) and `login`
  (`PerformLogin(string, string, out bool)`: the `Users` alias, `PasswordVariable.RemoteRead()`, then
  `Session.ChangeUser`), matching `Optix_Sample_PanelLoaderChangePanelNetLogic` and the official
  `LoginButtonLogic.cs`. Neither writes an absolute `/Objects/` path.
- **Both starters ship the operator shell's screens.** `arya-optix-ipc` and `arya-optix-panel` now
  carry `Home`, `Alarms`, `Diagnostics` and `Settings` as real `Screen` supertypes, so the first screen
  an agent drafts lands in a project that already has the pages an operator navigates. The window itself
  stays empty on purpose: the `PanelLoader` and the bar are created in phase 4 by `optix_screen` and
  `optix_nav`, the two calls that also prove the buttons work, instead of a hand-written handler that
  compiles and does nothing. The starter manifests are now generated (`node scripts/gen-optix-template.mjs`,
  `--check` for drift) from the files on disk, and a spec fails when a manifest and its tree disagree.
- **"Done" is a checklist, not a feeling.** The skill gained a release gate that names the call proving each
  claim: `optix_nav verify` returning `verified` when there is a bar, a clean `optix_production_check`, a
  zero exit from `optix_build action check`, a save proven on disk rather than assumed, and API/menu claims
  sourced from `optix_docs` or `optix_schema`. When one cannot be shown, it is reported as the gap and the
  application is not called ready.
- **The installed help is searchable without a model or a service.** New `optix_docs` (`search`, `read`,
  `status`) answers from a shipped index of Rockwell's own documentation — 2,591 pages in 1,354 KiB for
  Studio 1.8.1.27, regenerated with `node scripts/gen-optix-help.mjs` (`--check` fails when stale). Ranking
  puts the page named after the subject first; `read` returns one page as text, from the install. It is
  evidence for documented behaviour, not for the live project, and it says so — `status` reports the Studio
  version the index was built from and when an upgrade has made it stale.

## 0.96.0 — 2026-11-15

- **A NetLogic request routes by the words the request uses.** `optix_netlogic { query: "alarm banner" }`
  found nothing: the cheat sheets are written in their own vocabulary and none of them says "banner". The
  router page now carries the phrases requests actually use (alarm banner, poll a tag, who is logged in,
  colour changes, heartbeat ...) as links to the page that answers each, and a query falls back to whole-word
  term matching with s/ing/ed forms, so a task-shaped request lands in one call. A symbol still outranks
  prose: `PeriodicTask` answers `netlogic-lifecycle`.
- **A NetLogic request routes in one call, and an API call can be checked before it compiles.** Added the
  ten-behaviour routing table to the skill (alarm, trend, tag, session, recipe, dialog, grid, animation,
  query, timer), a curated `schema/netlogic-types.json` of 59 types so `optix_schema { action: "type" }`
  answers `clrType` and `netlogic_page` - the C# type a class must name and the cheat-sheet page to read -
  and review rule `OPTIX-NL-13`: `SetImageContent` in a design-time class does nothing and in `Start()` may
  run before the drawing is loaded, both cited to `advanced-svg.md`.
- **A boolean chooses the colour, and it is an expression.** `optix_svg` tested "is there a source"
  before "is there a bool_colours", and bool_colours needs a source, so the first branch always won and a
  Bool was linked straight to a Color while the two colours were dropped. The colour form is now
  `if({0}, 0xFF<on>, 0xFF<off>)` - ARGB integers, what the evaluator yields for a colour - and the live E2E
  asserts that shape. Proven on a rendered screen: boolean false drew the lamp red, setting it true and
  saving again drew it green.
- **The SVG image renders, and a second bind updates instead of refusing.** Two defects the visual probe
  found on a live Studio 1.8.1.27 project: `optix_svg add` wrote the drawing to `<project>/imgs`, but the Web
  presentation engine fetches `/projectfiles/imgs/<name>.svg` - the `ProjectFiles` folder - answered 404 and
  rendered a blank box even though the node, its Path and the element property were all correct; and
  `optix_svg bind` decided a part already existed by looking for the node name in a `nodes` reply that never
  carries one, so binding the same part twice was refused as `already_exists`. Proven end to end: red lamp,
  bind `#30A46C`, save and build, runtime restart, green lamp in `optix_screenshot`; the live E2E asserts the
  file lands under `ProjectFiles/imgs` and that a re-bind completes.
- **Optix design hardening: the schema, the artwork, the variables, and four more checks.**
  `optix_schema` answers from a catalog generated out of the installed Studio help
  (`scripts/gen-optix-schema.mjs`; 565 object types, 102 variable types and 110 enums for 1.8.1.27)
  and is shipped with the plugin, so a property name is checked before it is written;
  `action: refresh` diffs that catalog against the live bridge dump and reports `added`,
  `changed` and `datatype_drift` separately (measured: 2 / 94 / 748), because the help names the UA
  datatype where the runtime reports the CLR one.
  `optix_svg` inspects a drawing for the three conditions Optix actually needs before it can drive an
  element (SVG 1.2 Tiny, an `id`, a hexadecimal paint), repairs what is repairable, refuses what is
  not, places the file under `<project>/imgs/` with a `%PROJECTDIR%` resource URI, and binds
  `AdvancedSVGImageElementProperty` nodes under the image's `SVGElementProperties` collection.
  `optix_design_check` gained `OPTIX-IMG-01`, `OPTIX-STYLE-01`, `OPTIX-LAYOUT-01` and `OPTIX-DATA-01`.
  `create_variable` now writes the variables a component owns: `kind: analog` with `units` and
  `range`, `array`/`dims` for a shape, and `display_name` for the operator's words, so `optix_model`
  no longer emulates a unit and a range as String children. Two limits are reported, not hidden: the
  bridge cannot create a variable of `AnalogItemType`, and a `Range` value cannot be assigned, so the
  limits live in `EURangeLow`/`EURangeHigh` beside an empty `EURange`.
  Eleven corpus pages (style sheets, layout, panels, data presentation, images and SVG, alarms, users
  and security, translations, recipes and retentivity, performance, variables) and two NetLogic pages
  (a task index and the API namespaces) close the mechanics gap the skill had.
  Three defects the live run found are fixed with it: `diffDump` assumed an array of types where the
  bridge sends an object keyed by browse name, `optix_svg list` composed paths without the screen's
  parent and read `name` where a node read answers `browse_name`, and `create_variable` declared
  `array` as text so an array length was refused before it reached the bridge.
## 0.95.1 — 2026-11-14

- **0.95.1 is 0.95.0, and both are live; take 0.95.1.** This package's registry writes become readable
  minutes after `npm publish` reports success - about four here, the packument first and the tarball
  a little later - so `0.95.0` looked unpublished while it was publishing: `npm view` answered 404 and
  a republish answered `409 Cannot publish over previously staged version`, which reads as a release
  waiting for approval but was the lag. The second publish of the same tree is `0.95.1`; nothing in
  the package changed between them. `AGENTS.md` records the wait in place of the bump.

- **The shell navigation bar is wired and painted by the draft that draws it.** Measured live on
  the LineHMI project: `optix_screen` probed the path of the screen it was about to create, reported
  it as a missing navigation target, and the second screen's own button came out dead (and the
  loader was kept out of the batch). A target equal to the batch's own screen path is now skipped,
  so a self-navigating screen is wired in the same call. Every bar button also writes its
  `BackgroundColor` and `TextColor` from the screen theme: with no fill a `Button` takes the style
  sheet's grey and its white label measures 1.4:1, which is what the bar rendered until it did.

- **Optix: a screen is mounted when it is drawn, and a save is proved from the files.** `optix_screen`
  now ends its batch by creating a `PanelLoader` across the start window and binding its `Panel` pointer
  to the new screen through a literal `raw_path` - the templates ship `UI/MainWindow` with no children,
  so a screen nothing mounts could never appear in a render. `mount: false` opts out, `mount_name` names
  the loader. `optix_emulator { action: "status" }` gained `disk` and `saved_after_edit`: the newest write
  under the project's `Nodes/` folder compared with the first pending bridge change, because a bridge
  edit only ever changes Studio's memory (`UAManagedCore.dll` carries no `Save`, `IsDirty` or `Persist`
  symbol, so no design-time NetLogic can save either) and a keystroke cannot be confirmed from here.
  Measured while proving the loop end to end: a bridge-authored screen, Ctrl+S, Ctrl+Shift+B and two
  "saved" replies left every file in the project at its pre-edit timestamp, and Studio's own log recorded
  no save and no build, so the skill and `docs/optix-workflow.md` now require the disk verdict before any
  screenshot is called proof. `test/optix-emulator.spec.mjs` covers `diskState` (newest write, an empty
  folder, and a bogus one), and `test/optix-runtime-e2e.mjs` mounts the row's tools and asserts every
  result round-trips as lossless JSON. Proven on the `LineHMI` project (1920x1080, Studio 1.8.1.27, bridge 1.0.9): scaffold, the engineer opens it and runs StartBridge, a 21-op OPC UA model, an 18-object screen, save and build, `optix_emulator` start, a rendered screen carrying the bound values, and a navigation button that switches the panel. An offline probe against a saved project also measured that the bridge's `DynamicLink` form holding an absolute path renders identically to a resolved static value, so the link form was never the fault - the relative path was.

- **The Optix loop is now enforced, not just described: one way to run the emulator, and a signal for the one step no tool can do.**
  Measured on a stopped session: 1,644 `pwsh` calls, 41 desktop key presses and an `FTOptixRuntime.exe` launched by hand and killed with `Stop-Process`, against **zero** `optix_emulator` calls: the tool was registered, the row had `allowInvoke` on, and the agent still drove the IDE and the runtime from outside. The causes were visible in the code: `startEmulator` spawned the runtime with `stdio: "ignore"` and returned a bare pid, so nothing could tell whether it came up; `stopEmulator` could only kill a pid it had recorded in the same process; `optix_template` wrote a bridge whose NetLogic node declared a method (`ImportQueuedLibraryItem`) the 1.0.9 class does not implement; and the loop's save-and-build step had no tool, so it was closed with a desktop chord.
  - `packages/optix/lib/emulator.js` rewritten: the runtime's stdout and stderr go to a per-project log under `%LOCALAPPDATA%\AryaCode\OptixRuntime`, `start` returns only once the preview URL answers and otherwise returns that log's tail with a named diagnosis (`port_in_use`, `file_locked`, `licensing`, `exception`, `missing_file`) and a hint, `restart` is stop-then-start for a new saved build, `logs` reads the log back, `stop` ends every `FTOptixRuntime.exe` holding that project (including one started outside the plugin) and reports the preview cleared, and `status` names runtimes that belong to other projects.
  - `optix_status` counts the authoring calls made since the last save and reports `needs_save` (routes, first and last call), because **no tool can save an Optix project**: the bridge has no save route and no Studio API for one is documented. `saved: true` clears it after the engineer saves and builds. `optix_screenshot` repeats the count in its own line, so a picture cannot be mistaken for the build that was just authored.
  - `optix_status` answering `Bridge unavailable` is now a ranked diagnosis: whether Studio is running, whether anything listens on the bridge port, and which of the two the engineer must fix, with the exact handoff wording. Before, it was one sentence that left the agent to improvise.
  - The `factorytalk-optix` skill gained **The loop** (seven phases, brief to release, with what each phase may claim), **You have no other hands** (no desktop automation, no `Start-Process`/`Stop-Process`, no `curl` at the bridge, no importing `lib/` to call a tool, no editing node files to fake the live model) and **Which state you are looking at** (live model, saved project, rendered screen, and that this plugin can only change the first). `docs/optix-workflow.md` is the human-readable form of the same loop.
  - Both packaged starters ship the tracked bridge byte for byte and declare exactly the methods it implements; `test/optix-bridge-copies.spec.mjs` fails when a starter's bridge drifts, when a declared node method is not an `[ExportMethod]`, when `arm.js` writes a different method set than the class it installs, or when the health answer loses the `template_library` field the library tool gates on.
  - `test/optix-emulator.spec.mjs` rewritten to the new contract: discovery, a start that is reported only once the preview answers, a dead runtime with its log and diagnosis, no double start, stop with the preview cleared, restart with a new pid, and the log classification table.
  - A runtime that starts cleanly can still carry a fact worth naming: this machine has no Optix entitlement, so every start logs `Standard entitlement not found`, then `Demo mode started. FactoryTalk Optix Runtime will be closed in 120 minutes`, and still serves 8081. `classifyLog` treated that as `licensing` and called a healthy runtime broken; notices now travel in their own field (`notice.kind: "demo_mode"`, with the 120 minutes and the advice not to chase a licence), and the failure signature was narrowed to a real refusal.
  - `optix_emulator { action: "stop", force: true }` also ends a runtime it did not start that is holding the preview port (`origins: ["another project"]`). Without it, a leftover runtime from an earlier session made `start` return `reused: true` and every later screenshot showed the wrong project.
  - `test/optix-runtime-e2e.mjs` proves the loop through the row's own tool definitions rather than the modules: it mounts `entries/optix.js`, scaffolds the IPC starter, starts the installed runtime, screenshots the served page in a headless browser, reads the log, stops it, and then repeats the render against a project that has screens. "It rendered" is measured by decoding the PNG (inflate, unfilter, count distinct colours), not by its file size: the starter renders one flat colour, the project with screens renders 1,789.
  - Recorded in the skill and in `docs/optix-workflow.md`: both packaged starters ship a window with no screen inside it, so a flat 1920x1080 render is the correct picture of a fresh scaffold and is not evidence that a screen exists.
  - Two defects the first live authoring run found, both of which made a working tool look broken. `optix_screen` returned a report whose `host.panel_loader` was an explicit `undefined`, and the host refuses a result it cannot carry as lossless JSON: the batch applied and the call still failed with `value is not lossless JSON`, so the screen existed while the tool reported an error. The report now omits keys that have nothing to say. `optix_bridge_arm` threw `bridge is not defined` because its face read the gateway before `apply()` had built it; the gateway is built first now, so arming answers with its real refusal (Studio already has the project open) instead of a ReferenceError.
  - `test/optix-runtime-e2e.mjs` asserts that every tool result survives a JSON round trip, that `optix_status` names the project when a bridge is there and ranks the causes when it is not (with a second mount pointed at a port nothing listens on, so the diagnosis is proven whatever this machine has open), and that a failing assertion stops the runtime it started instead of leaving it holding the preview port.
- **The Optix skill now carries the loop that takes a NetLogic from a file to a class the runtime is running.**
  Written from the demo that took a wrong turn: a runtime NetLogic created under `UI/NetLogic` was invisible to an
  engineer looking in the root `NetLogic` folder (that folder holds the bridge), the class compiled but Studio had
  not loaded it, and the start screen never changed because the loader's `Panel` pointer carried a `DynamicLink`
  that the runtime resolves before the pointer's value. The skill gained *Where runtime code goes, and the loop that
  proves it runs* (node under `UI/NetLogic`, class at `ProjectFiles\NetSolution\<Name>.cs`, Studio build with the
  runtime stopped because Ctrl+S does not persist bridge-side writes and the emulator locks the assembly, then
  `optix_emulator` + `optix_screenshot`, and a changing bound value as the only proof) and the two runtime facts
  (`DynamicLink` beats `Panel`; `ChangePanel` must name loader and screen, never an absolute path).
  `docs/reference/optix-netlogic.md` gained the same loop as a four-state table: exists, compiles, loaded, running —
  with what each state proves and what it does not.

## 0.94.4 — 2026-11-14

- **The standards tools now register in the real app, and a refused tool is reported instead of swallowed.**
  0.94.3 shipped with `engineering_reference` and `engineering_profile` refused by the harness tool contract
  (`tool "engineering_reference" must declare output { schema, render, presentationMeta? }`): both definitions
  declared `output.schema` but no `render` callback. The resources row caught the throw in one outer `try`, so the
  row mounted with **zero tools** and no message anywhere - and every agent that followed the new "read the
  standards first" step found no such tool. Measured on the operator's session: after the skill told the agent to
  read `engineering_reference`, it searched, then read `app.asar` bytes looking for a tool that was never
  registered. Fixed at the three levels that let it through:
  - both resource tools declare `output: { schema, render }`, where `render` returns the JSON result as text
    (`packages/resources/src/tools.ts`);
  - the resources row registers each tool on its own, keeps the tools that work, and reports every refusal at
    error level with the tool name and the harness message (`packages/resources/src/index.ts`);
  - new `test/entry-tool-contract.spec.mjs` mounts all eight entries against a stub that applies the harness's own
    precondition, so a definition without `output.render` fails in CI rather than in a shipped bundle - the
    module-level proof that let 0.94.3 through accepted whatever the real registry rejects.
  Also restored the two product-tool description clauses (`ftview_apps`, `mw_project_find`) in their TypeScript
  sources: 0.94.3 edited the built `lib` copies, and the release build regenerated them from source, so the
  published descriptions lacked the `CRAFT-ORD-01` sentence the tests looked for.
## 0.94.3 — 2026-11-14

- **A new build starts from the brief, our packaged templates and the published standards — the machine is read
  only when the operator points at it.** Measured on a real session (attached by the operator, 14 Nov 2026): asked
  for "a new Optix template", an agent made **52 host-survey calls (45 `pwsh` listings, 4 `glob`s, 3 `grep`s) across
  **23.1 minutes**, and **never called `engineering_reference` once** — although `optix_template` was called at
  **0.1 minutes** and could have answered with both starters and their questions. The tools were found and not
  trusted as the starting point, because nothing told the agent that an inventory is not a brief. Fixed at the
  level where the decision is made:
  - new corpus page `craft-engagement-order` (domain `craft`, applies to every product row) with `CRAFT-ORD-01`..`04`
    — a new artefact starts from the standard and the brief, the brief precedes the artefact, an authorised
    inspection is bounded and its reason stated, and what exists is evidence rather than the requirement;
  - `packages/resources/SKILL.md` gained `## First move`, which sorts a request into new build / existing project /
    real capability question and forbids inventory to work out what to build;
  - the same gate sentence now opens every product skill (`l5x`, `ftview`, `optix`, `plc5`, `mwi`, `ecad`,
    `migration`), so the rule travels with the row an agent loads;
  - the Optix skill replaced `## Read before you write` with `## What kind of request is this?` — a request /
    first-move / host table, the eight standard pages named, and workflow **E. Author a house template or standard**
    for the case that started this (write the standard, choose a starter, ask the brief; nothing creates an empty
    `.optix`);
  - `optix_template` now answers with **both** starters, their manifests and their `questions` when no starter is
    named, and writes nothing — its `template` parameter is optional, which is what makes that question-first call
    possible; `optix_status`, `optix_library`, `ftview_apps` and `mw_project_find` say in their own descriptions that
    they are for a project in play, not for working out what to build.
  - Skill budgets raised for the added gate: `l5x` 12,121 → 12,800, `ftview` 9,040 → 9,500, `resources` 4,000 →
    4,700, `migration` 9,252 → 9,800 (`components.json`; bodies measured before and after).
  Covered by the new `test/skill-engagement.spec.mjs` (gate present and near the title in every skill, first move
  before read-first, triage before authoring, the order page in the corpus and applying to every row, the four
  discovery descriptions, and the no-starter answer) plus additions to `test/resources.spec.mjs` and
  `test/optix-template.spec.mjs`.

## 0.94.2 — 2026-11-14

- **A Rockwell plant now starts from Rockwell's own published style guide, not only the generic baseline.** New corpus
  page `hmi-rockwell-process-style-guide` (`HMI-RW-01`..`08`) summarises the *Process HMI Style Guide*, publication
  `PROCES-WP023`, 56 pages, aligned with ANSI/ISA-101.01-2015: the four display levels and what each is for, the
  template every display shares (header with navigation map, system status, home, login/logout, alarm banner, alarm
  access and silence, plus context button bars), the fixed palette with its hex values (`#E0E0E0` background,
  `#3F3F3F` labels, `#A0A0A4` process lines, alarm red `#E22028` / orange `#EC8629` / yellow `#F5E11B` / magenta
  `#916AAD`, running `#F0F0F0`, stopped `#808080`, transitions `#93C2E4`), state never shown by colour alone and a
  disabled control greyed rather than hidden, Rockwell's touch geometry (40 x 40 command, 35 x 35 navigation, 10 px
  between command targets, 4 px everywhere else), commands versus navigation (separate Start and Stop, the command
  names the action, confirmation for consequential actions), data alignment and units, and alarm depiction with the
  blink rules plus no P&ID or equipment photograph as the display basis. `hmi-standards-precedence` now names the
  vendor layer explicitly — below the plant's own consistent practice, above this bundle's baseline — and
  `hmi-standards-precedence`, the engineering-standards skill, the Optix and FactoryTalk View skills and
  `docs/reference/hmi-design.md` all point at it; the doc also records the one conflict to decide rather than inherit
  (Rockwell allows a 40 px command button where the shared check wants 44 px). Covered by `test/resources.spec.mjs`.

- **HMI/SCADA screens now start from a product-neutral baseline, and the plant's own convention still wins.**
  Three corpus pages in the `hmi` domain carry the judgements no design check can compute: `hmi-isa101-baseline`
  (`HMI-101-01`..`06` — neutral canvas, colour reserved for state, data over decoration, deviation not raw numbers,
  units and precision, consistency), `hmi-screen-architecture` (`HMI-ARCH-01`..`06` — levels, reachability, persistent
  context, start screen and alarm access, commands versus indications, popups) and `hmi-standards-precedence`
  (`HMI-PREC-01`..`03` — explicit instruction or documented project standard or consistent observed convention first,
  the baseline last; a waiver is recorded, never silent; ask when the layers conflict in a way that changes operator
  action). The release checklist a handover has to answer lives on the precedence page. The engineering-standards
  skill, the Optix and FactoryTalk View skills and `docs/reference/hmi-design.md` now route screen work through the
  three pages, so an agent that has to work inside an existing house style has an explicit way to follow it and say
  so. Covered by `test/resources.spec.mjs`.

- **A NetLogic is now reviewed against the practices the runtime rewards, not only compiled.** `optix_script` gained
  `action: review` and the rules `OPTIX-NL-03`..`12`: a `PeriodicTask` that is never disposed, a tick without
  `try/catch`, a `Project.Current` lookup on the timer thread, a blocking call (`Thread.Sleep`, `.Wait()`, `.Result`,
  `GetAwaiter().GetResult()`, `async void`), an empty `catch`, a change subscription with no `-=`, background work in a
  design-time class, a class name that differs from its node, a class that logs nothing, and a hard-coded node path.
  Each finding carries the line, the severity, the fix and the cheat-sheet page it comes from; the answer is `clean`,
  `review` or `block`. `add` and `edit` run the same review and refuse code rated `block` unless `force: true`, so the
  guardrail is on the path that writes, not only on a request someone remembers to make. The `periodic` template is now
  the safe shape (nodes cached in `Start`, `try/catch` in the tick, `Log.Error`, `Dispose()` in `Stop`) and a new
  `observer` template subscribes in `Start` and unsubscribes in `Stop`; `blank` remains for a class you write yourself.
  Rules, reasoning and sources are the corpus page `optix-netlogic-practices`; `docs/reference/optix-netlogic.md` and
  the skill section name `review` and both templates. Covered by the extended `test/optix-netlogic.spec.mjs`.
- **NetLogic C# is now authored, compiled and deleted through the tools.** `optix_script` owns both halves of a
  NetLogic - the bridge node whose BrowseName equals the class name and the `.cs` file the project's csproj globs -
  with `action: list | read | add | edit | delete | build | run`. `add` writes a compiling class from a `blank` or
  `periodic` template and runs `dotnet build`; `edit` replaces the whole class behind the sha256 you read; `delete`
  removes the node (which also removes the class file) and refuses a class it did not write; `build` returns the
  diagnostics, with `locked: true` when the emulator holds `bin\<project>.dll` open and one `-t:Rebuild` retry when a
  killed build left `obj\` inconsistent; `run` executes a design-time `[ExportMethod]` through `/bridge/node/invoke`
  and answers `not-loaded` - not an exception - when the class compiles but Studio has not rebuilt yet. Live evidence
  on `OptixTemplateDemo`: `list` pairs 51 classes with their nodes (`StudioMCPBridge` at `NetLogic/StudioMCPBridge`,
  `MachineSimulator` at `UI/MainWindow/MachineSimulator`); `run StudioMCPBridge.CheckFormula` through the tool
  returned the bridge's own OK; a design class added, read, edited (`Ping` + `Describe`), built and deleted left the
  project at exactly 51 classes and no orphan nodes. Docs: `docs/reference/optix-netlogic.md`, the skill section
  "Write, change and delete NetLogic C# with `optix_script`", and `test/optix-netlogic.spec.mjs` (12 tests).
- **The model now has a shape an OPC UA client can walk, and a tool that builds and judges it.** `optix_model`
  (`action: plan | apply | check`) lays out `Model/<Plant>/<Area>/<Line>/<Equipment>/<Signal>` with equipment
  `ObjectType`s under `Model/Types`, typed instances and PascalCase signal names, then reads the live tree and
  reports `OPTIX-MDL-01`..`06` with a `structured` / `needs-work` verdict. Planned and applied live on
  `OptixTemplateDemo` (34 ops: 1 folder, 1 type, 1 instance, 5 variables, 10 metadata children; check
  `structured`; a flat `Model/flat_tag` then produced the critical "sits 2 level(s) deep" plus units,
  description and naming warnings, and deleting it restored `structured`). Two limits are measured and
  reported rather than hidden: Studio 1.8.1 writes only `DisplayName` as an attribute, so units and range are
  child String variables, and type members are copied onto instances because a `ModellingRule` None member is
  not instantiated. Covered by `test/optix-model.spec.mjs` (9 tests), the skill's new "Lay out the model the
  way an OPC UA client expects" section, `docs/reference/optix-model.md` and the corpus page
  `optix-opcua-model-structure`; tool surface 18, README 176, `defaultOnTools` 156.
## 0.94.1 — 2026-11-14

- **A new project now asks for the screen box, and never uses the workspace root as its own folder.** Two
  defects an operator hit on the first real run: `optix_template` scaffolded a 1920x1080 project without
  asking the display size, and it unpacked the starter straight into the workspace folder, so Studio opened
  `...\Optix Demo\AryaNewHMIProject_IPC.optix` and warned `423 - The current project name
  'AryaNewHMIProject_IPC' does not match the project folder name 'Optix Demo'`. `width` and `height` are now
  required with `destination` and refused when missing ("Scaffolding needs the operator's screen box: pass
  width and height in pixels"), and the copy lands in `<destination>/<name>` unless the destination already
  carries the project name, so the folder and the project agree while a workspace root keeps its other work.
  Covered by `test/optix-scaffold.spec.mjs` (6 tests); the skill's new-project steps and
  `docs/reference/hmi-design.md` now say to ask before scaffolding.

## 0.94.0 — 2026-11-14

- **A scaffolded project, opened by the engineer, is one tool session away from a running application.**
  Verified end to end on `C:\Users\KNPhu\Documents\Rockwell Automation\FactoryTalk Optix\Projects\LineDemo`,
  scaffolded by `optix_template` (34 files, bridge 1.0.9) and opened by hand: Studio reported the .NET solution
  built and `StartBridge` answered `{"bridge_version":"1.0.9","project":"LineDemo","model_loaded":true}` on port
  8768. From there the tools created four tags and a `PanelLoader`, drafted `UI/Screens/LineOverview` and
  `UI/Screens/LineControls` (126 and 106 ops), wired the navigation across the shell bar, and both screens passed
  `optix_design_check` with 0 findings; `optix_production_check` returned `review` with only the two honest
  `OPTIX-PROD-04` built-in-user warnings the starter ships. The emulator started through `optix_emulator`, the
  runtime rendered the scaffolded screens, and clicking `Controls` switched panels
  (`docs/port/optix-live-proof/15-linedemo-overview-runtime.png`, `16-linedemo-controls-runtime.png`). One step is
  the engineer's and now documented: the first `StartBridge` raises Studio's "NetLogic security warning" (the
  bridge references System.Net.Sockets, System.IO and friends), and it binds only after `Proceed` — ticking "Do not
  show this warning again" stops it recurring.

- **A project can start from nothing without anybody hunting for a template.** `optix_template` with
  `destination` now scaffolds a starter in one call: copy into a new or empty directory, rename every
  file that carries the shipped name, replace the starter's older bridge with the one this bundle
  ships, and write the operator's `width`/`height` into `MainWindow` in `Nodes/UI/UI.yaml` - the canvas
  every screen drafted afterwards inherits. Measured on the ipc starter: 34 files, `BottlingLine`
  renamed, bridge 1.0.9 replacing 1.0.7, and a 800x480 copy whose `UI.yaml` reads `Width: 800.0` /
  `Height: 480.0`.
- **An existing project with no bridge is one call, not a Studio recipe.** `optix_bridge_arm` with
  `confirm: true` now also adds the `StudioMCPBridge` NetLogic node to `Nodes/NetLogic/NetLogic.yaml`
  when the project has none (a hand-built project usually does not, and `StartBridge` is unreachable
  without it). An existing node is left byte for byte alone; the file it edits is copied under
  `ProjectFiles/.dsh-backups` first, and `confirm: false` reports the missing node without writing. The
  node file is also registered in the project's `.optix` list when the project never listed it (Studio loads
  only listed node files), a run keeps a `manifest.json` beside flattened copies of every file it
  touched, `restore: true` puts all of them back, and an arm refuses outright when a running bridge
  already answers for the same project name so it cannot race Studio's own save.
- The skill and `docs/reference/hmi-design.md` now state the two entry points and the line the agent
  does not cross: the engineer opens the project, builds it and right-clicks `StartBridge`; the agent
  writes the files, hands over in one message, and takes over reading, drafting, editing and
  `optix_emulator` once the bridge answers. The runtime loads the saved project, so a bridge edit
  reaches the emulator only after the engineer saves - said in the handover rather than discovered.
- **`optix_screenshot` captures the painted screen, at the project's own size.** The preview capture
  screenshotted immediately after the page's `load` event, which on Studio 1.8.1 is a blank white frame —
  measured in a packaged app as "captured 1280×720, the image appears blank". It now waits for the
  presentation engine's canvas to report a size and lets one frame settle (`PREVIEW_SETTLE_MS`), and the
  preview browser opens at `previewWidth`×`previewHeight` (1920×1080 by default) instead of the browser's
  1280×720 default, so the capture matches the designed screen. Verified twice: a direct Playwright capture
  of the running emulator renders the whole HMI at 1920×1080
  (`docs/port/optix-live-proof/14-preview-render-1920x1080.png`), and in the packaged app `optix_screenshot`
  now answers `1920×1080` instead of a blank sheet
  (`docs/port/optix-live-proof/13-dev-app-preview-capture.png`).
- **A packaged AryaCode app drafts Optix screens against the live bridge.** With the packed bundle in the
  `optix-live` dev profile and a local `AryaInfer` model in the composer (no API key needed; the
  `deepseek-official` route inside a standalone `dsh web` answers `MISSING_CREDENTIAL`), the agent called
  `optix_status` ("Bridge version 1.0.9, project AryaNewHMIProject_IPC"), `optix_design_check` (36
  objects, 0 findings), and then authored a screen: `optix_screen … dry_run: false` → "completed · applied
  104 · findings 0", `UI/Screens/LineHistory` appeared in the live model and rendered in the Web
  presentation engine after a save and emulator restart
  (`docs/port/optix-live-proof/11-dev-app-calls-optix-status.png`, `12-app-authored-screen-runtime.png`).
  `scripts/launch-dev-optix.ps1` boots that profile.
- **The packaged bundle mounts: the entry's own schema had the same `z.enum`.** The row that turns Optix
  on carried `z.enum([...])` in `entries/optix.js`, a schemastery API that does not exist, so a packed
  install failed the whole row with `TypeError: z.enum is not a function` at import — while every test
  passed, because the suites read `packages/**` and never the entry the host imports. Both switches are
  now `z.union([z.const(…)]).default(…)`, and `test/entries-schema.spec.mjs` reads every `entries/*.js`
  for the call, so the next one is caught by `pnpm test`. Verified by installing the packed tarball into
  a fresh `optix-dev` profile on the dev home and booting it: the web app started with no import
  warning, the engineering bundle's ten rows all report `Running`, and the Optix row's settings page
  renders its preview and OCR switches (`docs/port/optix-live-proof/09-dev-optix-row-settings.png`,
  `10-dev-rows-running.png`).
- **The release review is a tool: `optix_production_check`.** A screen can pass every geometry rule and
  still ship dead, so the project is reviewed as a whole in one call: a handler whose `ObjectPointer`
  still holds the absolute design-time NodeId (`OPTIX-PROD-01`, the measured cause of a button that fires
  and never switches), a handler with neither reference nor link or navigation to a screen that is not
  there (`PROD-02`), a screen unreachable from the panel the loader starts on (`PROD-03`, with the shell
  bar counted for every panel), a presentation engine left on the built-in starting user or the stock
  style sheet (`PROD-04`), and a screen outside the screen folder (`PROD-05`). It answers `ready`,
  `review` or `not_ready`, and each finding names the node and the fix. `repair: true` clears the
  absolute pointer value of every `PROD-01` finding. Live run on the simulator project: `review` with two
  `PROD-04` warnings about the built-in user `2/46`, zero critical, three screens reachable, nineteen
  handlers. Reading it needed three measured bridge facts: `map` reports node ids only for `ids=1` (a
  boolean is ignored), the presentation-engine types are `NativeUIPresentationEngine` and
  `WebUIPresentationEngine`, and a handler nested inside a shipped composite arrives without the
  `DynamicLink` at the depth the one tree read reaches, so a handler that looks dead is re-read before it
  is judged.
- **The tool surface is seventeen, and the context ceiling moved with the measurement.** The manifest
  counts 17 (`16` registered by the vendored engine plus `optix_netlogic`), `README.md` says 175 tools,
  and `contextBudget.defaultOnTools` is 155 with the note recording where the extra one came from.
- **A NetLogic machine simulator drove the whole loop in the runtime.** A new
  `ProjectFiles/NetSolution/LineSimulator.cs` (a `BaseNetLogic` with a 200 ms `PeriodicTask`) fills a
  twelve-tag `Model/Line` tree, and six command buttons on the controls screen set `Start`, `Reset` and
  `Setpoint` through `VariableCommands` rather than a method path. Proven in the Web presentation engine:
  clicking `START LINE` ramps the level to 64.35 %, pressure to 4.2 bar, speed to 62 bpm and turns the
  running lamp green; `STOP LINE` collapses pressure to 0.03 bar and speed to 0; the alarms panel shows
  44 bottles and 1 reject
  (`docs/port/optix-live-proof/06-line-overview-running.png`, `07-line-controls-running.png`,
  `08-line-alarms-bottles.png`). The save is verified by the project file's timestamp, the build by
  `dotnet build` on `AryaNewHMIProject_IPC.csproj`, and the run by restarting the emulator.
- **The build order is a corpus page: `optix-application-recipe`.** Six rules (`OPTIX-RCP-01..06`) in
  the order that survives the runtime — model before screens, a NetLogic class bound by node name,
  screens with the shared shell bar, command buttons for operator writes, save then build then run, and
  operator-click verification before the release review — each with the measured failure it avoids.
  `engineering_reference` returns it for `recipe`, `netlogic`, `navigation` and the rule ids; the Optix
  and resources skills both point at it.
- **The batch met a live Studio 1.8.1 and lost six arguments with it.** Nothing in the lane had ever run
  against a real project; on the first run three defects stopped the plugin loading at all — `z.enum`,
  which schemastery does not have, in two `Config` fields; a `required: false` parameter; and four
  `optix_screen` objects with no `additionalProperties` — and three more only a running bridge could show:
  `POST /bridge/expr/validate` called with the gateway's default `GET` (a 404 that killed the draft), a
  lamp formula using `IIF` and CSS hex colours where the Optix evaluator has only `if(cond, a, b)` and
  `0xAARRGGBB`, and a design-check walk that counted every property `UAVariable` as an object. A seventh,
  found in the rendered screen: the query string was built with `URLSearchParams`, which writes a space as
  `+`, while the bridge decodes with `Uri.UnescapeDataString` — so every title, caption and tag path with a
  space reached the project mangled. The encoder now percent-encodes each pair.
- **`optix_screen` reads its canvas and its loader from the live window.** It used to default to 1280×800
  and to whatever panel loader the caller named, so every screen drafted on a 1920×1080 window failed its
  own layout rule and every navigation button stayed unwired. It now reads the start window's size and the
  single `PanelLoader` from the live model, probes each navigation target before the batch, and withholds a
  wiring whose target does not exist yet instead of having the whole batch refused — the pending op is
  reported with the real loader path. Generated screens now pass `optix_design_check` with no findings.
- **`optix_screen` stamps the composites Studio ships.** A new `library_items` parameter imports each named
  library item once, instantiates it under the screen and places it — the three bridge calls
  (`library/import`, `model/object`, `node/property`) that make a composite real, which no single tool
  exposed before. Imports land under `UI/Components/<Library>` (created when missing) so imported types
  stay separable from the project's own objects. Proven live with `Widgets/AlarmBanner` and
  `Widgets/AlarmGrid` on a warning-free screen.
- **Navigation switches panels at runtime again — and it took a shell bar to do it.** A generated button
  carried a `MouseClickEvent` handler that reached `ChangePanel`, the runtime received the click, and the
  panel never changed: the bridge wrote the `ObjectPointer`'s absolute design-time NodeId *beside* the
  relative `DynamicLink`, and the runtime resolves the absolute id first, so it called the design-time
  loader and logged `No behaviour or observer found that handles the method 'ChangePanel' on node
  Root/Objects/<project>/UI/MainWindow/MainLoader`. Two changes close it. `optix_screen` now draws the
  navigation bar in the *window*, beside the `PanelLoader` — a button inside a panel sits one level deeper
  in a session than in the design tree, so any loader path written there resolves to the design-time
  object; the shared bar names each button for the panel it opens (`Nav_<target>`), so a second screen's
  draft adds its buttons instead of replacing the first screen's, and it sits in the band the panel layout
  already reserved above the footer. The wiring is `object_raw`-relative, and the absolute pointer value is
  cleared after the batch (a second screen's deferred wiring clears it too). `wire_event` already accepted
  `object_raw`; the scaffold never sent it. The bridge source carries the matching fix — it writes
  `NodeId.Empty` instead of the design-time id whenever a relative path is given — compiled but not yet
  loaded into a running Studio. The design check now counts wired shell navigation as the screen's exit,
  so the VIEW-NAV findings stay quiet for a screen whose way out lives in the window. Proven live:
  clicking `Pumps` renders the second panel and `Home` renders the first
  (`docs/port/optix-live-proof/04-shell-home-runtime.png`, `05-shell-pumps-runtime.png`).
- **The design corpus carries Rockwell's own sample projects.** Three Optix pages — `optix-navigation-patterns`,
  `optix-widget-patterns` and `optix-design-resources` — distil the shell-and-loader scheme, the
  composite-before-primitives rule and the catalogue that maps a design task to a repository in the MIT-licensed
  [FactoryTalk-Optix](https://github.com/FactoryTalk-Optix) organisation. They link the samples rather than
  vendoring them, and `engineering_reference` answers `navigation`, `gauge`, `panel loader`, `samples` and the
  rule ids from them. `docs/reference/hmi-design.md` gains a "Where the patterns come from" section and loses
  four gaps the live run closed.

- **Optix reached the template libraries Studio ships.** The row now registers **fourteen** tools, not
  twelve. `optix_library` is one tool with two actions: `list` reads the shipped catalog straight off disk
  (`<Studio>\Files\Libraries\<Library>\Nodes\Items\Items.yaml` plus its `Translations.yaml`) and answers
  with the browse name, the display name in English and Chinese, the owned-type count, the component files,
  and the usage text each item ships — 94 importable items across Widgets (42), Scripts (33), Misc (6),
  FeaturePreview (6), StyleSheets (4), GraphicElements (2 items + 8 group folders) and Keyboards (1), with
  no bridge and no Studio session. `import` pulls one item and its dependency types into the loaded project.
- **Why the verb had to go into the vendored bridge.** `TemplateLibrary.ImportLibraryItem` is a static
  method on `UAManagedCore.TemplateLibrary`, and the bridge's generic `node/invoke` route dispatches
  `IUAObject.ExecuteMethod` on a node path, so no argument set could reach it. `POST /bridge/library/import`
  (`ImportLibraryItemInline`) is now part of the tracked bridge at **1.0.9**, wrapped in
  `Context.Sessions.ImpersonateRootTemporary()` for the same reason every other write verb is: a design-time
  call with no session aborts `FTOptixStudio.exe` with native heap corruption. `packages/optix/bridge/source.json`
  records the diff in `localChanges` and re-pins the sha256; the upstream pull request to
  `asqi-carter/ftx-mcp` is **not filed yet**.
- **The conflict types are nested.** `TypeConflictResolutionChoice` and `ConflictResolution` must be written
  `TemplateLibrary.TypeConflictResolutionChoice` and `TemplateLibrary.ConflictResolution` — bare names fail
  with CS0246/CS0103 against `UAManagedCore.dll` 5.0.0.39 (the vendor help example works only because it
  opens `using static UAManagedCore.TemplateLibrary;`). Only `ConflictResolution.Replace` is offered, because
  it is the only member the vendor documents.
- **A copied starter no longer pretends its bridge is current.** `optix_template` reported a hardcoded
  `bridgeVersion: "1.0.7"` while each starter ships its own older, non-session-safe copy (238,383 bytes
  against the tracked 378,391, no `ImpersonateRootTemporary`). It now reports the version of the bridge this
  package actually tracks plus the `bundledBridgeVersion` the starter carries, and its instructions name
  `optix_bridge_arm` as the step that replaces it. Until that step runs, a copied project answers
  `library_import_unsupported_bridge` and `optix_action` invoke stays refused.
- **The Optix tool count is now the surface the row mounts.** Twelve was the vendored engine's count and
  left `optix_netlogic` — registered by this repository's own `entries/netlogic.js` — out of both the
  manifest and the context budget. The manifest counts 14 (13 vendored + the NetLogic reader), and
  `contextBudget.defaultOnTools` moved 150 → 152 with the measurement written into the manifest note.
- **`optix_screen` drafts a whole screen as one batch.** `packages/optix/lib/screens.js` ports the View
  scaffold and screen layout onto Optix: the same pad (24), header band (88), footer band (56), content gap
  (20), card row pitch (36) and navigation strip (56), the same refusals (a display under 200×150, a body
  with less than 60 px left under the header and footer, more than four cards, more than four navigation
  buttons, a card under 180×120, more rows in a card than fit), and the same house palette. Cards are a
  bordered rectangle plus a bold title and label rows; a value row is a `Label` bound to the tag (Optix has
  no `numericDisplay`), a lamp row is a 26×26 rectangle whose `FillColor` carries
  `IIF({0} > 0, "#30A46C", "#E5484D")`. Navigation is wired only when the caller passes `panel_loader`,
  because that path comes from the live model; without it the tool reports the exact `wire_event` it left
  pending instead of guessing one. The draft is validated in one `validate_ops` call, so a new
  `maxScreenOps` config (default 240) bounds it: the canonical 1280×800 screen with two cards, three rows
  and three buttons is 204 operations against `maxBatchOps` 40, and the batch cannot be split because the
  bridge only resolves a parent it created in the same call.
- **`optix_design_check` reads the live model and reports the same rule families View reports.**
  `packages/optix/lib/design.js` ports `packages/ftview/src/design.ts` onto Optix nodes: a pressable widget
  under 44 px (`HMI-TARGET-01`), a control the model reports with no text of its own (`HMI-TARGET-02`), text
  below 4.5:1 measured against the smallest filled object that contains it
  rather than the backdrop (`HMI-CONTRAST-01`), a screen holding nothing pressable (`VIEW-NAV-01`), a screen
  whose controls carry no event handler (`VIEW-NAV-02`), a screen whose extents differ from the window
  canvas (`VIEW-LAYOUT-02`), sibling screens holding the same hand-built child set (`OPTIX-UI-01`) and
  behaviour living inside the composition (`OPTIX-UI-02`). A colour the bridge did not report, or a screen
  node it did not describe, lands in `unchecked` with the reason, so a clean report and a blind report are
  not the same answer.
- **The scaffold palette failed its own contrast rule, and the header band moved.** Measured with the
  ported `contrastRatio`: a white title on the View header `#0088C8` is **3.92:1** and `#CFE0EA` on it is
  **2.89:1**, both under the 4.5:1 minimum the same check reports. Optix's header band is now `#005D8A`
  (7.16 and 5.29) — darkening keeps the identity and costs nothing else, and every other pair in the
  scaffold already passed (9.89 to 17.62). The View scaffold keeps `#0088C8`: its own check compares a
  colour only when the same object carries both the text colour and the fill, so it cannot see the
  violation, and changing an application the engineer already owns is not this change to make. The
  navigation buttons were 40 px tall and are now 44, which is the minimum the check reports.
- **Studio 1.8.1.27 replaced 1.7.4.32 on this machine.** The bridge compiles clean against the new
  assemblies (`Build succeeded. 0 Warning(s) 0 Error(s)` against `UAManagedCore.dll` 5.0.1.46 and
  `FTOptix.HMIProject.Net` 6.0.0.36 among others), and the names the import verb calls are still there:
  `TemplateLibrary`, `ImportLibraryItem`, `TypeConflictResolutionChoice`, `ConflictResolution`,
  `ImpersonateRootTemporary`. The shipped catalog is 94 items on both versions but not the same split —
  FeaturePreview went 5 → 6 and Scripts 34 → 33. The stale 1.7.4.32 claims were fixed where they live
  (`optix_template`'s instructions now name the Studio the machine has and point at the manifest's
  `optixStudioVersion` instead, `emulator.js` and `docs/port/optix.md` record that the same path shape is
  what 1.8.1.27 shows, `library.d.ts`'s example is version-neutral). The starter projects keep their
  `1.7.4.32-Stable` manifest fields and `IDEVersion.txt`: those record what the starter was built with.
- **The corpus gained a product-neutral `hmi` domain, and `VIEW-LAYOUT` finally has a page.**
  `packages/resources/corpus/hmi/hmi-targets-and-labels.md` (`HMI-TARGET-01` 44 px, `HMI-TARGET-02` a control
  carries its own label) and `hmi-colour-and-contrast.md` (`HMI-CONTRAST-01` 4.5:1 against what the text
  actually sits on, `HMI-CONTRAST-02` a palette comes from the style sheet the product ships) carry the
  numbers both products' checks enforce and apply to View and Optix alike. The plan asked for four new
  pages; four of the topics already exist in the `view` domain and already name both products, so writing
  them again would have given one fact two homes. `packages/resources/corpus/view/view-layout.md`
  (`VIEW-LAYOUT-01`, `VIEW-LAYOUT-02`) was added because both ids were cited by tools and by
  `docs/reference/standards-checks.md` with no corpus page behind them. The corpus is now **48 pages in
  eight domains**; adding a domain means editing two lists that were already out of step
  (`scripts/gen-resources.mjs` and `packages/resources/src/corpus.ts`). The repository's "41-page corpus"
  claims were stale before this batch — the committed index already held 45 pages — and the four places
  that said 41 now say 48.
- **`docs/reference/hmi-design.md` is the design answer for both products.** It owns the four-step loop
  (draft, validate, check, look), the shared slot table, the refusal list, the palette with its one
  divergence and the measured ratios, a rule-to-corpus-page-to-tool table, what to build from what each
  product ships, and what a clean report does not prove. `docs/reference/standards-checks.md` now names
  three review surfaces instead of two, carries the Optix rows and the missing `VIEW-LAYOUT-02` row, and
  says plainly that `VIEW-HPM-02` and `VIEW-COLOR-01` have always named a touch target and a contrast
  finding while the corpus rules of those ids say something else — the ids stay because findings and tests
  cite them, and the Basis column now names the rule each finding actually encodes.
- **The Optix tool count moved again, and so did two skill ceilings.** The row now registers **sixteen**
  tools (14 vendored + the NetLogic reader), `contextBudget.defaultOnTools` moved 152 → 154 with the
  measurement in the manifest note, and the `factorytalk-view` skill budget moved 8000 → 8970 because the
  View lane now names `ftview_design_check`, `ftview_theme_audit` and `ftview_draft_screen` and links the
  design document (measured body 8,625 characters). `packages/resources/SKILL.md` names the `hmi` domain in
  its search examples, and the `arya-automation` preset folds `optix_screen`, `optix_design_check`,
  `optix_preview`, `optix_screenshot`, `optix_library` and `optix_ocr` into the engineering loop its
  Engineering tab renders — `optix_library` is classified from its `action` argument, the way a live call is
  classified by `LIVE_WRITE`, so a `list` is not counted as a write and an import is not hidden as a read.
- **A live Studio session caught a defect in the 1.0.9 health payload.** The first read of a running bridge
  answered `{"bridge_version":"1.0.9",…,"invoke_session":"root,"template_library":true}`: the quote that
  closes `root` was dropped when the new field was appended, so the body was not valid JSON. The plugin
  parses every bridge response as JSON and refuses a body that is not, so that one character broke every
  Optix verb against a 1.0.9 bridge, not only the import. The bridge now closes the quote and
  `test/optix-library.spec.mjs` reassembles the health literals and parses them — the regex guard that
  looked for the new field passed against the broken build, so the guard has to be a parse.
- **Not shipped as proven.** A live Studio 1.8.1.27 session was opened on a proof copy of
  `AryaNewHMIProject_IPC` and its bridge answered with `bridge_version 1.0.9`, `model_loaded true` and
  `template_library true` — that first read is where the defect above was found. The import verb, the
  scaffold batch and the design rules remain compile- and unit-verified: no library item has been imported
  into a real project yet, no screen has been built in one, and no navigation click has been observed in a
  runtime. The upstream pull request to `asqi-carter/ftx-mcp` is **not filed yet**. `HANDOFF.md` carries the
  state and the remaining steps, including the sandbox trap that stops `pnpm test` inside a confined shell.


## 0.93.0

- **Breaking: the ECAD row stopped being a CAD editor.** Four tools are gone — `ecad_draft_ops`,
  `ecad_draft_apply`, `ecad_draft_discard` and `ecad_verify` — and the surface behind them with them:
  `packages/ecad/src/engine/ops.ts` (73,716 bytes of staged operation), `engine/ops-geom.ts`,
  `src/tools/drafts.ts`, and the `EcadOp` union with its `EcadDraft`/`EcadDraftContext` types. The row
  registers **twelve** tools, not sixteen. Anything that named one of the four in a saved prompt or a
  session note now gets an unknown-tool envelope; the gate that used to be `ecad_verify` is
  **`ecad_compare`**, and the row's `writes` switch means deliverables only — a document bundle or a
  backup copy, each to a new path.
- **Why: maintaining a second CAD editor was not worth the upkeep.** Drawing authoring needs grips,
  setters, trim/extend, offset, layer tables and a plot engine — an application, not a review pane, and
  one whose correctness this bundle could only ever approximate. The owner already maintains
  **AryaCAD Electrical**, a fork of OpenCAD Studio with an electrical component and a documented
  automation and MCP surface, so the ownership line moved there: reading, reviewing, viewing and
  exporting stay offline here; authoring, plotting, publishing and netlist/BOM go through the vendor
  application.
- **The drawing pane is a read-only viewer.** It keeps what a review needs and gained what it lacked:
  drag to pan, wheel zoom at the cursor, `+`/`−`/`0` and the arrow keys, layout tabs, a layer panel with
  per-layer entity counts and show-all/hide-all, **text search with on-sheet highlight** (with a stated
  cap before it stops highlighting), a status line with sheet size, zoom and match count, print through
  the host print dialog, and SVG/PNG export. Gone: mode switch, tool palette, command bar, marquee,
  grips, osnaps, grid/ortho, properties, context menu, layer create/rename/colour, undo/redo, apply and
  the written-drawing banner. The committed face is **160,003 bytes where the editor was 412,825**; the
  locale dictionary is **139 keys per language where it was 409**; the stylesheet is **741 lines where it
  was 1,705**, with no class the viewer reads missing and no defined class it never reads.
- **Breaking: the ECAD Remote contract is version 2.** `apply` is dropped from `ECAD_METHODS`, which is
  now `open`, `sheets` and `capabilities`, and `ECAD_CONTRACT_VERSION` goes 1 → 2. The client face and
  the Remote service ship in the same bundle and must ship together; a composition mixing a version-1
  face with a version-2 service shows a preview-unavailable state rather than a half-mounted editor.
- **The row reports what it can see of the CAD bridge.** New `packages/ecad/src/bridge.ts` probes the
  composition for `mcp__<serverName>__*` tools, and `ecad_capabilities` gained a `cad` section:
  `serverName`, `entryTool` (`mcp__ocs__ocs_sessions` by default), `mounted`, the tools seen, and a hint
  that says a configured bridge whose discovery is still in flight also reads as not mounted. New row
  config `bridgeServerName` (default `ocs`) names the server to report on. **This row never starts,
  installs or ships the CAD application** — AryaCAD Electrical is GPL-3.0 and its portable build is a
  158 MB executable, and nothing in this bundle links to it or spawns it.
- **The bridge is the owner's row, and the bundle ships the overlay instead.**
  `overlays/aryacad-mcp.patch.yml` carries the ready-to-apply `@deepseek-ai/dsh-mcp-client` row
  (`serverName: ocs`, stdio, `--mcp`, a 180 s tool-call deadline). It is not in this bundle's
  `cordis.patch.yml` on purpose: `test/patch.spec.mjs` and `test/docs.spec.mjs` constrain what this
  bundle may insert, and a row naming a host package breaks composition on any profile that does not
  carry it.
- **The skill is `ecad-review`, not `ecad-drafting`.** Rewritten around two lanes: read a print honestly
  (coverage, candidates, stated limits) and view/export it locally; then hand authoring to AryaCAD
  Electrical and prove the result — `ecad_backup` to keep the before-state, the bridge's own
  `save_verified` to write it, `ecad_open` with `reload: true` and `ecad_compare` against the kept copy
  to accept the change. It refuses to imitate a CAD edit by hand-editing DXF text.
- **New document:** `docs/aryacad-bridge.md` owns the seam — the two halves and
  the GPL boundary, how to mount the overlay and which two names must agree, the four facades and
  seventeen intent tools AryaCAD exposes, the backup → edit → save_verified → reload → compare sequence,
  and why the pane's Print is the local route to a PDF while a headless plot goes through the bridge.
  `docs/architecture.md` and `docs/port/ecad.md` record the retirement where the editor used to be
  described.
- **Tests moved with the surface.** Deleted `test/ops.spec.mjs`, `test/ops-cad.spec.mjs`,
  `test/client/cad.spec.mjs`, `test/client/cadTools.spec.mjs` and `test/client/edits.spec.mjs`; pruned
  the draft cases out of `test/tools.spec.mjs`, `test/corpus.spec.mjs`, `test/dxf.spec.mjs` and
  `test/client/toolCards.spec.mjs`; `test/client-face.spec.mjs` now asserts the viewer's own
  `data-ecad-*` markers, the absence of the apply bridge and the editor controls, and the trimmed
  stylesheet pair. `test/tools.spec.mjs` asserts the twelve-tool inventory, contract version 2 and the
  `cad` section of a row built with no bridge. `test/bridge.spec.mjs` and `test/compare-gate.spec.mjs`
  are new: the first pins what `ecad_capabilities` says when the bridge is absent, present, added after
  mount, or named wrong; the second drives the acceptance gate — a kept copy against a copy edited
  elsewhere, where only the change list may differ. The headless interaction harness was rebuilt for the
  viewer and now takes **11 shots with zero page errors**, measuring drag pan
  (`translate(0 0) scale(1)` → `translate(90 50) scale(1)`), wheel zoom 100% → 115%, keyboard zoom and
  extents, a layer hide taking the drawn count 40 → 29, and a text search reporting its matches with the
  highlight markers present; it caught two real defects — a badge reading "1 text matches", and a
  highlight carrying no marker to count. `test/aryacad-fixture.spec.mjs` reads a drawing produced by
  AryaCAD Electrical and **skips rather than fakes** when the file is absent: the application is GPL-3.0
  and this bundle is MIT, so its drawings are not committed here.

## 0.92.0 — 2026-11-12

- **The Optix preview chain reports itself, and the plugin starts its own browser.** Reading the
  emulator needs four links the row never described: the `preview` switch, a browser answering CDP,
  the project's **Web presentation engine** serving `previewUrl`, and — for canvas text — a host
  Tesseract. `optix_status` now returns all of it in `preview_chain` with `next` naming the first
  unmet link, in words that say what to do: `Nothing serves http://127.0.0.1:8081/: run the loaded
  project in Studio so its Web presentation engine answers that address; if the project has no such
  engine, optix_action with action ensure_web_engine adds one`. Attach mode was the only mode, so the
  engineer had to start Chrome with `--remote-debugging-port` by hand before any preview tool worked;
  `browser: launch` is now the default and the plugin starts Chrome or Edge itself through the
  `playwright-core` it already depends on, keeping one browser alive across calls so the emulator page
  keeps its state. `browserChannel`, `browserPath` and `browserHeadless` cover the machine where that
  guess is wrong, and `browser: attach` keeps the old path for a browser someone else owns.
- **OCR stops being an invisible prerequisite.** `optix_ocr` registers only when the row names an
  `ocrExecutable`, and nothing said so: the tool was simply absent. `optix_ocr_setup` reports whether
  that executable and its `.traineddata` are on the machine, discovers a Tesseract already installed
  under `Program Files\Tesseract-OCR` and names the one config value that would use it, and with
  `install: true` runs `winget install --id UB-Mannheim.TesseractOCR` — the package upstream's
  `setup.ps1` uses, without its venv, its Pillow dependency or its Python service. It asks before
  downloading anything.
- **A project with no bridge can be armed, and the human step is stated.** `Bridge unavailable` used to
  be the end of the road: the bridge is an `[ExportMethod]` right-clicked inside Studio, so nothing
  outside can start it. `optix_bridge_arm` writes the shipped `StudioMCPBridge.cs` into the project's
  `ProjectFiles/NetSolution` — an SDK-style project, so a `.cs` beside it compiles — after copying
  whatever the project held to `ProjectFiles/.dsh-backups`, and reports both versions. `confirm: false`
  plans without writing. It then stops and says what only Studio can do: compile, add the
  `StudioMCPBridge` NetLogic node if the project has none, right-click StartBridge.
- **The emulator can be run without a human at Studio.** The Optix CLI has an `export` verb and no run
  verb, so the chain's third link used to be a sentence telling the engineer to go run the project.
  The runtime executable under the Studio install takes the project file
  (`FTOptixRuntime [options] [<project_file>]`, found at
  `Studio <version>\FTOptixRuntime\<version>\Win32_x64\FTOptixRuntime.exe`), and `optix_emulator`
  drives it: `status` reports whether anything serves `previewUrl` and which runtime the machine
  holds, `start` launches it against the project's `.optix` file, and `stop` ends only a runtime the
  tool started — never one opened from Studio. Starting a process needs `allowInvoke`. On the machine
  tested, the runtime serving the shipped IPC starter project made `http://127.0.0.1:8081/` answer
  `200` with the real Optix web HMI, and the plugin-launched Chrome screenshotted it and read the
  authored label back through Tesseract.
- **Starting from a template asks first.** `optix_template` returns the manifest, and both manifests now
  carry `questions`: which runtime (OptixPanel device or a PC in a browser — it picks the template and
  the deploy path), the screen's real size (`MainWindow` `Width`/`Height` in `Nodes/UI/UI.yaml` is the
  box every screen is laid out against, and the starter ships 1920×1080), the project name, and where
  to copy it. Those answers are baked into files that are tedious to re-edit afterwards, so the skill
  asks them before any copy happens.
- **New document:** `docs/port/optix.md` records why Optix is the one component
  with no source here, what the pinned upstream bridge is and is not (the bundle runs none of
  upstream's MCP or Python), the four-link chain, and the runtime route to the emulator;
  `docs/getting-started.md` gained the chain and the bridge-arm caveat.

## 0.91.0 — 2026-11-12

- **A rung copied out of a Studio routine is now an input the plugin reads.** `parseLadder` accepted
  only this plugin's bracket NeutralText, so the text an engineer actually holds — `XIC Start XIO Stop
  OTE Run`, a branch written `BST … NXB … BND`, no parentheses and no terminator — came back
  `INVALID_LADDER: Rung contains malformed structure`. `parseRung` reads both formats now: an operand
  run ends at a whitespace gap unless an operator token continues the expression, so
  `Local:1:I.Pt12.Data` stays one operand and `MOV Tag1 + Tag2 Tag3` keeps its arithmetic, and the next
  instruction begins only at a mnemonic the instruction catalog knows — an AOI call written without
  parentheses is still refused. What is staged and written is unchanged NeutralText: `neutralText`
  normalises every accepted rung, so an export never stores pasted copy text, and `studioForm` answers
  the other direction. `checkRungText` refuses the `?` Studio writes for an operand the engineer left
  unconnected and refuses a two-rung paste in one field with a fix that names `compose_batch`.
  `draft_rung`, `compose_rung`, `compose_batch`, `add_routine` and `l5x_rung_preview` all take either
  format, and `rung_list` carries `text` in copy format beside `neutral_text` in bracket form.
- **An alias to an I/O point resolves instead of blocking the edit.** A module contributes its tags
  through `TagDefinition` under `Module`, and the image type that names the member — `1756-IB16/Data` —
  is never declared as a `DataType` anywhere in the export, so `DI_Gate_Fault` → `Local:1:I.Pt12.Data`
  failed with `Member Pt12 is absent from 1756-IB16/Data` and every `draft_rung` touching the alias was
  refused on a file that imports and builds in Studio unchanged. `tag-resolution.ts` indexes
  `Modules/Module/TagDefinition` in controller scope and answers `resolved: true` with
  `type_unverified: true` and the reason, and an alias whose target the export does not carry resolves
  to the alias with `Alias target … is absent from the export`. A member absent from a type the export
  *does* declare — a UDT, an AOI, a built-in structure — is still refused. `resolve_tag` puts the reason
  in its summary and in `coverage.unverified` instead of blaming a dynamic subscript, and
  `project-analysis` reports the real gap.
- **The Logix Designer SDK is an optional extra, not a precondition for editing.** The `l5x` component
  drops its `studio_sdk_status` probe and its gate moves from `verify_offline_l5x` to
  `compare_projects`: the written L5X differing from the source by exactly the draft's operations, with
  `run_checks` passing on it, proves the edit offline. `engineering_capabilities` answers
  `studio_validation: 'optional'` with a note that `draft_validate` and `draft_apply` need only Node,
  and the `offline_build` next step tells the reader to hand the new L5X to Studio 5000 for Import +
  Verify, which is the normal path when no SDK is installed — a licence very few people purchase.
  `rockwell-l5x` SKILL body grew to 12,121 characters (budget raised to match), and the default-on
  schema ceiling moved to 127,423 with the measured 122,522.

## 0.90.0 — 2026-11-09

- **RSLogix 5 (PLC-5) is a product row of its own.** The new `plc5` component (row ships off) adds
  eight read-only tools and the `rslogix-5` skill: `plc5_capabilities`, `plc5_open`, `plc5_ladder`,
  `plc5_find`, `plc5_io_census`, `plc5_io_config`, `plc5_data_read` and `plc5_processor`. The ladder
  reads open an `.RSP` hidden through the `RSLogix5.Application` automation server from the 32-bit
  PowerShell host and close with the do-not-save flag. The container reader (a dependency-free CFBF
  parser) walks the directory tree, unpacks the vendor's zlib payloads and answers from the file alone
  when RSLogix 5 is not installed or will not start: project name, processor type string, author,
  RSWho route with its IP, and the ladder program-file names. The footprint census reduces every
  `I:`/`O:` reference in rung text to rack/slot cells and splits configured racks from program-only
  racks; the chassis reader lists adapters and rack/group ranges and states that the point cards are
  not in the project; the data-file table reports the catalog, never values. Verified against
  `F00607.RSP`: the container path names project `F00607`, processor `MML10PF3PX3R9`, route
  `045_VIM\10.164.108.113\Backplane\1\CH A\1` and 38 ladder program files across 53 streams; the
  server path returns 52 program files, 2,168 rungs, 226 data files, 4,189 symbols, 10 configured
  chassis, 443 I/O cells and processor type code 17 from the same file, with the source hash
  unchanged. The vendor server is single-instance: a hidden `RSLGX5.exe` left by an aborted attempt
  holds it and makes every new activation fail with `CO_E_SERVER_EXEC_FAILURE`, which the tools' fix
  text now names; a chassis the server enumerates twice when `ChassisCount` overstates the
  collection is dropped before the answer is built. The migration row keeps its seven tools; the
  PLC-5 reads do not reach SLC 500.

## 0.89.0 — 2026-11-08

- **Alarm setup is now draftable.** `ftview_draft_alarm_add`, `ftview_draft_alarm_set` and
  `ftview_draft_alarm_delete` stage edits to the export's `Alarms/Alarms.xml` — a trigger with its first
  message, one attribute at a time, or a trigger and its messages — and `ftview_apply` writes them beside
  the display changes with wizard import steps that say plainly that the import replaces the entire alarm
  configuration, so export the backup first. The alarm findings from `ftview_alarm_report` ride the
  `ftview_validate` findings, and `ftview_verify_import` states that alarm changes are proven by the
  wizard's import log, not by a display comparison.
- **Component install for the Add Component Tool.** `ftview_component_package` copies display XML out of
  an applied export, writes the component list file (`<hmi><category><component/></category></hmi>`) and
  returns the `SEAddComponent <app> ME / "<list file>" [overwrite]` command; `$AddComponent.txt` beside the
  list file is the install log. Component names carrying `% . " : ? * < > # { } - [ ] ' \ / ; = & +` are
  refused with the offenders listed.
- **VIEWME-UM004T grounds the view corpus.** The Oct 2025 Machine Edition User's Guide is kept under
  `packages/resources/evidence/view/`, and two corpus pages carry its appendices:
  `view-graphics-import-export` (Appendix D display XML element tree, batch manifest create/update entries,
  the import error log that opens when the import ends, PanelView Plus display-count limits) and
  `view-alarm-xml` (Appendix C export → edit → import, whole-setup replacement, backup-first). The wizard
  steps gained the import-error-log step, and the draft tools refuse object types named after the
  structural elements the guide documents (`animateVisibility`, `animateColor`, `confirm`, `group`,
  `vbaProject`, `vbaItem`, `vbaCode`).

## 0.88.0 — 2026-11-08

- **The L5X studio tools spend the cheap checks before the build.** `verify_offline_l5x` now refuses a
  baseline that was not exported from an `.ACD` in this chat, and a project file that is no longer on disk,
  before importing and building — the same pre-build refusal `build_acd_from_draft` already made, so a
  doomed verification no longer burns a build cycle and a baseline hunt. `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`
  advice names all four observed causes (safety controller, signature, missing in-chat baseline, and a module
  `Name` carrying illegal characters — a colon was observed) instead of pointing at safety alone.
- **Module Names are checked before the importer sees them.** `run_checks` gained `MODULE_NAME_ILLEGAL`
  (a `Name` outside `[A-Za-z_][A-Za-z0-9_]*` — the label belongs in the Description), and the studio tools
  name the offending names at `open_project`, `draft_apply`, `verify_offline_l5x` and `build_acd_from_draft`.
  On a migrated project `run_checks` marks the wizard-expected `RUNG_NO_OUTPUT` and `DUPLICATE_OUTPUT` sites
  `migration_expected` and collapses them to one summary line per rule, so the finding list shows engineering
  work instead of 110 expected sites.
- **Migration failures name candidates, the report accepts the `.SLC` fallback, and its JSON parses.**
  A missing migration input now lists same-folder files whose stem closely matches (case-insensitive,
  extension-flexible) — the empty `candidates: []` field is finally filled. `migration_report` accepts a
  `.SLC` legacy side, matching the documented fallback. The JSON-named report is bounded: capped findings,
  comparison totals plus the first rows of each difference class, and non-finite numbers written as text.
- **The wizard-defaults audit runs headlessly on the import.** `migration_assess` on an imported `.L5X`
  reports analog channels left at the wizard defaults (Range 4, 0–20 EU, High Engineering 100), legacy
  chassis modules still declared, unnamed modules, module Names the importer refuses, `+ S24` byte-swap
  tokens, and residual `?` and PCE counts. `wizard_artifact` is a named plan exception kind for the
  conversion artifacts (`+ S24` inside an operand address), so they are recorded as decisions.
- **Two migration corpus pages**: `migration-analog-scaling` (count domains, the 0–20 EU default, scaling
  for the consumer) and `migration-wizard-defaults-to-audit` (the day-one checklist). Both migration and
  L5X skills carry the matching rules; the skill budgets moved to the measured bodies.
- **The migration corpus is grounded on named publications.** Every migration page's basis now names its
  source: 1756-RM085I Sep 2025 (logic conversion — its p.28 status table, `S:24 → S24`, is the published
  origin of the `+ S24` wizard artifact), 5069-AP001A Aug 2020 (the SLC Migration Wizard) and 1746-RM003F
  Jan 2022 (module/chassis replacement). The three PDFs are kept under `packages/resources/evidence/migration/`.
- **The Logix-side corpus names its manuals too.** The rockwell pages' `[Rockwell]` basis becomes
  1756-RM018A Sep 2025 (General Instructions — the current revision of the 1756-RM003 the instruction
  knowledge base cites, per-instruction fault tables), 1756-PM014O Sep 2024 (Major, Minor, and I/O Faults —
  array out-of-range type 4, watchdog, `major_fault_record` via GSV) and 1756-PM008J Jul 2022 (Ladder
  Diagram — the output-placement and nesting rules `run_checks` enforces). Four PDFs plus the PM001 hub's
  acquisition list live under `packages/resources/evidence/rockwell/`; the l5x skill names them beside its
  rung rules.

## 0.87.2 — 2026-11-06

- **Both engineering presets mount the full DSH standard tool row set.** Arya Standard and Arya Automation Engineer were
  missing the `tool-schedule` row, the whole `delegation` group and the conditional Host `tool-plugin-manager` /
  `tool-plugin-market` rows, so a session on either preset had a smaller toolbelt than a shipped DSH standard session:
  no scheduling tools, no `subagent` / `subagent_fork` / `workflow`, no plugin manager. All three are back in their
  shipped positions. The manager row follows whether the composition provides the `profileContext` service (disabled
  without it, enabled with it) the way the shipped preset does; the market row stays disabled. Compaction is untouched:
  the presets keep the Codex checkpoint engine and the engineering-tuned policy, which is the deliberate difference. The
  row ids are otherwise the shipped ones plus `arya-review-skills`. `Arya Automation Engineer` moves to picker order 6 —
  it tied Arya Claude at 5 — so each preset the picker lists has its own order, and the preset's reference page records
  the new position. Its spec now asserts the exact ordered row-id list for both presets, the delegation group's children
  and providers, the manager in both `profileContext` states, the disabled market row, and the shell switch.

- **The engineering presets stand their compaction engine down when billion-context owns the context lane.**
  `billion-context` ("bili") compresses the outgoing model request and stands DSH's own compaction rows down *by package
  name*; the Arya engine modules match none of those names, so a session on a preset with bili installed ran two
  compressors over one history — and bili had already removed `/compact`, leaving the engine firing alone. Both
  definitions now accept an internal `standDownCompaction` option that writes `disabled: true` on the compaction engine
  row and on `command-compact` only; the policy row and the tool-result pruner are not compressors and stay mounted, and
  the row list is otherwise identical. `Arya Automation Engineer` carries the flag across its engine-row id rewrite to
  `arya-automation-compaction`. The new `presets/billion-context.js` resolves the flag: the `biliBasicCompactionPolicy`
  service **and** `globalThis.__BILI_DSH_COMPACTION_VERDICT__ === 'active'` must both be present, an already-active gate
  wins outright (so a direct or custom bili row stands the engine down even when the profile names no bili bundle), and
  only when bili is expected does it wait — 25 ms polls for up to 2 s for the service, then up to 500 ms for the
  verdict. A timeout, a missing service or an inactive verdict all keep the engine and log one warning, because a double
  compressor is recoverable and a silently missing one is not. The bili kill switches (`BILLION_CONTEXT_PLUGIN=0`,
  `BILI_NATIVE_DSH=0`, a defined `BILI_PROVIDER_REWRITES`) and a profile that does not expect bili return immediately
  with no delay. This is a definition-time stand-down on purpose: a preset registered through `agentPresets.register()`
  is not an entry, so bili's own `internal/config` overlay cannot reach it. Its spec pins the constants, the switch and
  expectation rules, the immediate/fail-open decisions, the poll budgets, and one warning per fail-open decision; the
  preset spec pins both row states and the mount path.

## 0.87.1 — 2026-11-05

- **Removed the ECAD status bar above the message input.** The composer dock repeated the drawing,
  DWG, profile, writes and truncation facts on every chat that held a drawing, directly above the
  input. The drawing pane already reports its sheet, layers and selection, so the dock registration
  is gone; a new chat no longer gets the extra line, and the panel is unchanged. The face tests now
  assert the slot is not registered.

## 0.87.0 — 2026-11-04

- **Ladder logic can be composed in the chat with no project and no file.** A request such as
  "compose a start/stop circuit for Studio 5000" no longer needs an L5X/ACD export: the new
  `l5x_compose_logic` tool takes a named pattern (start/stop seal-in, fault latch, TON delay,
  interlock, analog scale, totalizer, run-hour meter) or raw NeutralText and returns `paste_text`
  ready to paste into a Studio 5000 ladder routine, plus the tag declarations the rung expects. It
  writes nothing, opens nothing, and validates the ladder syntax and catalogued instruction names;
  its `coverage` states that tag existence/types and Studio compilation are not checked without a
  project. Raw rungs use one instruction series per line and **parallel branches written
  `[path1,path2]`**. The `rockwell-l5x` skill now instructs the assistant to compose in chat and put
  `paste_text` in a fenced code block instead of asking for workspace files, and the no-project
  failure points at this tool. `l5x_rung_preview` now refuses an unknown mnemonic (for example a
  greedy `ORXIC`) instead of accepting it. The tool reference is regenerated (150 tools; the L5X row
  is 54).
- **The drawing pane can expand to a full-window CAD surface.** The right sidebar is a narrow place
  to edit a drawing, so the toolbar now has an *Expand drawing* control: it lifts the same pane (tool
  palette, canvas, layers, properties, sheet facts) to a fixed whole-window surface with the
  inspector panels opened, and a *Return drawing to the sidebar* control or Escape brings it back.
  The headless harness measures the focus surface at the full viewport (`1440×900` in the harness)
  and captures it as `01b-focus-mode.png`; the sidebar remains the default mount so opening a file is
  unchanged.
- **The ECAD writes switch now reaches the drawing panel regardless of row mount order.** Enabling
  *Allow ECAD writes* saved `writes: true` in the profile, but the panel still opened `Read-only` and
  the dock said `writes off`: the `ecad` row configured the package-root Remote service only if that
  service already existed at the moment the row applied, so the panel service kept its read-only
  default when the two sibling rows mounted in the other order. The Remote service now reads the
  effective `ecad` row config from the booting Loader on every `open`, `capabilities` and `apply`
  call, then falls back to the row's live `ecadPolicy` service and the one-time `configure`. The row
  also publishes that policy and retries the direct service push briefly, so either row order agrees
  on writes; the regression spec covers the Loader read, a live row-config change, the service-first
  mount order and the no-loader fallback.
- **DWG conversions are isolated and retried cleanly, and the suite runs one file per process.** The
  embedded `acadrust` wasm instance was reused across conversions; its Rust allocator retained memory,
  and after a long session a DXF→DWG conversion could abort with `memory access out of bounds`
  (observed intermittently in the full suite). Every conversion now gets a fresh instance from the
  cached module, and a conversion that still hits that exact transient trap is retried once with a
  fresh instance; malformed inputs fail deterministically and are never retried. A regression test
  performs 40 conversions in one process, and a manual 3-round run converted all 33 DWGs 297 times with
  zero failures. The test command now runs each spec file in its own child process
  (`scripts/test.mjs`) and retries a file once when it exits non-zero without reporting a failing
  test — the observed Node/wasm interaction occasionally kills the file instead of failing a test;
  a deterministic failure fails twice and stops the run. Three consecutive full `npm test` runs are
  green at **394 tests**.
- **The drawing pane is now a CAD workspace.** The view-only preview/three-operation editor became a
  full drawing surface: selection sets with Shift-add/Ctrl-toggle; AutoCAD-style marquee (left→right
  window, fully enclosed, blue; right→left crossing, anything touched, green); middle-drag,
  right-drag and Space+left-drag pan (a right-drag pans and suppresses the menu; a right click opens
  it); wheel zoom-at-cursor, zoom extents/window; right-click context menu (select all, zoom, pan,
  move, copy, erase, properties, ask, print, SVG); grips on line endpoints, polyline vertices, circle
  radii, arc sweeps, ellipse axes and insertions, staging `setLine`/`setPolyline`/`setCircle`/
  `setArc`/`setEllipse` or moves, with a live preview of the geometry the setter will produce;
  object snaps for endpoint/midpoint/centre/nearest/**intersection**/grid with F3 osnap, F7 grid,
  F8 ortho and a snap marker; undo/redo over the staged operation list; Delete/Ctrl+A/Escape and a
  world-coordinate/selection status line. The tool palette stages real engine operations with live
  previews and numeric entry: select, pan, zoom window; line, polyline, rectangle, circle, arc,
  revision cloud, leader, text, block insert; move, copy, rotate, scale, mirror, offset, trim,
  extend, erase. Properties edit text, block attribute values, layer, entity ACI colour and geometry
  (bulk layer and bulk colour for a multi-selection); the layer panel adds current layer, lock,
  create/rename/color staged through the layer operations. Sheet workflow keeps apply-to-new-file
  verification (DXF or DWG), adds written-view toggle, print to a clean drawing page, SVG/PNG export,
  layout tabs and zoom extents, and hides every write control when the row writes switch is off.
  38 new client tests plus a 23-shot headless interaction harness (right-drag pan, marquee/
  multi-select, context menu, grips and setter previews, intersection snap, layer/colour staging,
  apply with verification 4/4, print, read-only, 10k-primitive sheet, no page errors); the bundle
  suite is 394/394 with typecheck clean. Remaining limits are named in the panel and README: generic
  geometry and dimension grips wait on engine setters; trim/extend are line↔line, offset
  line/circle/arc, intersection snap is straight segments; entity colour is ACI 1–255; layer-table
  changes show after apply/reopen; print uses the current view. Unreleased by design.
- **The drawing engine now has the CAD modify operations the panel needs.** `EcadOp` gained
  `addCircle`, `addArc`, `copy`, `scale`, `mirror` (keeps a mirrored copy by default, `eraseSource`
  removes the source), `offset`, `trim`, `extend`, `setLine`/`setPolyline` for grip edits, and
  drawing-level `addLayer`/`setLayerColor`/`renameLayer`. Validation/application live in
  `packages/ecad/src/engine/ops.ts` with pure 2-D geometry in `ops-geom.ts`; support is explicit and
  refusals name the kind and a fix: scale/mirror cover the common primitives but refuse
  hatch/spline/dimension/viewport (mirror also refuses inserts — mirror the block geometry instead),
  offset covers line/circle/arc, trim/extend are line against line, only top-level entities can be
  edited, and mirror keeps text readable (MIRRTEXT=0). The written-file verification learns the new
  kinds (added primitives for circle/arc/copy/mirror/offset, changed-geometry rows for
  scale/trim/extend/setLine/setPolyline, layer add/rename/color comparisons). 15 new tests cover
  geometry, refusals and a synthetic DXF write→re-read round trip; the ECAD package suite is
  234/234 and typecheck is clean. The `ecad_draft_ops` description and skill now name the operations.
  The panel commands that dispatch them are the next commit; nothing is released.
- **Grip setters and entity colour in the engine.** The second operation round adds
  `setCircle {layout, id, center, radius}`, `setArc {layout, id, center, radius, startAngleDeg,
  endAngleDeg}`, `setEllipse {layout, id, center, rx, ry, rotDeg}` and `setColor {layout, ids,
  color}` (ACI 1–255; ByLayer/ByBlock refused with a fix). Setters edit top-level CIRCLE/ARC/ELLIPSE
  entities in place, treat a same-geometry set as a no-op, normalise arc angles modulo 360°, allow a
  350°→10° seam sweep, and apply ellipse rotation as a rigid transform (the pinned data model has no
  major-axis setter); `setColor` counts only entities whose resolved ACI actually changes. Written-file
  verification observes geometry reasons for the three setters and `colour changed` for `setColor`,
  with the same lower-bound rules as the existing operations. Five new tests (20 in `ops-cad.spec.mjs`
  in total) cover geometry, no-ops, wrap-around, every new refusal and a write→re-read round trip;
  the ECAD package suite is **266/266**. A real-sheet smoke on a copy of `FC1000495-002` applied all
  four setters, wrote 261,812 bytes and re-read four changed primitives (`colour/position/size/angle`)
  with the source byte-identical. The panel wiring is the next commit.
- **The ECAD row now has a working Configure page in Plugins.** The bundle's settings face registered
  `plugins.row.config` for `l5x`, `ftview`, `mwi` and `optix` but not `ecad`, so the row had no
  Configure control; and the row's own `Config` fields were declared without `.volatile()`, so even
  after adding the page the Host settings document exposed no `ecad` namespace and the page reported
  *â€Å“This row has no configuration to change.”* Both are fixed: the five row pages are registered, and
  `writes`/`maxFiles`/`maxFileBytes`/`maxEntities` are volatile (the numeric limits read their live
  getter like the write switch). A clean dev profile now lists an `ecad` settings namespace with
  `{ writes: false, maxFiles: 2000, maxFileBytes: 67108864, maxEntities: 200000 }`, so the page shows
  **Allow ECAD writes (new drawing only)** and saves through the normal revision-checked path; the
  client-face test asserts the fifth registration. Unreleased: this ships with the next batch.
- **Flattened block linework now lands where the insert puts it.** The block flattener applied the insert
  transform to every primitive except `LINE`, so block line segments were written at block-local
  coordinates. On the real print set that piled stray geometry into the bottom-left corner of nearly
  every sheet — the panel showed short electrical fragments at the origin while circles, arcs and text
  were in place. `LINE` now goes through the same `applyPoint(xf, …)` path as the other primitives, a
  synthetic fixture block carries a line and asserts its world coordinates, and sheet
  `FC1000495-025` re-renders with its contacts, coils and terminal bars complete and no corner cluster.
  This is unreleased: 0.86.0 is unchanged on the registry and the fix needs a 0.86.1 batch.
- **The synthetic ECAD index fixture no longer carries a customer drawing number.** Its title-block
  filename cell read `FC1000495-001`; it now reads `SYNTH-001`. The committed DXFs are generated
  synthetic drawings and were always described as such, but a generated fixture should not quote a real
  print's number. The 0.86.0 tarball ships no test fixtures, so no published bytes change; this is
  repository hygiene under the "customer prints stay out of the repo" rule. The real-corpus filenames
  quoted in `docs/port/ecad.md` remain as the measured-evidence record.

## 0.86.0 — 2026-11-04

- **ECAD (DXF) groundwork — feasibility measured on the owner's real print set.** The 34-sheet DXF
  corpus parses with `@mlightcad/data-model@1.15.21` (MIT) and round-trips with **no** model
  difference on any sheet (entities, types, text/layer values, block names, layers and block-attribute
  values), at 693 ms to parse and 554 ms to write the whole set; rename, move, new text on a new layer,
  `WD_M` attribute edit, block insert and erase all survive a write/re-read with the intended changes
  only. `docs/port/ecad.md` records the measurements and what the corpus is (AutoCAD Electrical IEC
  drawings, exploded symbols, `TITLE_BLOCK` text, an index sheet). The component itself, its tools and
  the panel are not in this change yet.
- **The ECAD engine and its Host service are real and measured on the owner's print set.** The engine
  (`packages/ecad/src/engine`, over MIT `@mlightcad/data-model`) parses the 34-sheet corpus into 83,936
  primitives with **0 unsupported** and 0 truncated layouts, reads sheet numbers and titles on all 34
  sheets, the 80-row index sheet, a 0.95-confidence profile from the ACADE `WD_M` attributes, 74
  cross-reference candidates and 97 review findings. All 34 sheets write → re-read → rebuild with
  **zero** model differences and `verifyWritten.ok`, and drafts validate → apply → write → verify on
  three sheets. The panel's Remote service is wired to it: `open`, `apply`, `sheets` and `capabilities`
  were exercised against a fake Host context over two real sheets (render-model artifact, new-file
  apply with verification, stale-document and writes-disabled refusals). Known writer limits (ATTRIB
  vertical justification, filled hatch islands, planar geometry assumption) are reported per write.
  (port evidence: `docs/port/ecad.md`)
- **ECAD drawing tools land behind a row that ships off.** Sixteen `ecad_*` tools — probe, profile, scan,
  open, overview, find, cross-reference, checks, render, compare, staged drafts with `ecad_verify`, and
  the document/backup deliverables — plus the `ecad-drafting` skill, mounted by a new `ecad` row inserted
  `disabled` with its writes switch off. The tool layer adds a bounded per-chat session, one drawing-format
  module for reads, extension rules and publication (the DWG seam), sandbox-stamped writes that only ever
  create a new file beside the source, and 31 tool specs through a fake Cordis composition. Because the row
  ships off the default-on tool budget is unchanged; the generated reference, component manifest and README
  record the new surface. DWG and the right-panel viewer landed in this batch.
  (port evidence: `docs/port/ecad.md`)
- **DWG drawings work in the same ECAD tools through an embedded converter, measured on the owner's 33
  DWGs.** `acadrust 0.6.8` (MPL-2.0, DWG code ported from MIT ACadSharp) is built to a single 6.4 MB
  WASM module (rustc 1.99.1, 107.5 s first build, one host clock import, no wasm-bindgen) and shipped
  with the bundle; `packages/ecad/src/dwg` exposes `converterInfo`, `isDwg`, `dwgToDxf` and `dxfToDwg`,
  and the format module converts a `.dwg` to DXF for the same MIT engine and converts the engine's DXF
  back on a DWG apply. Measured: **33/33** DWGs converted in **1.17 s** total with zero reader warnings,
  each drawing's version preserved (16 AC1027 / 17 AC1032); DXF→DWG→DXF and DWG→DXF→DWG→DXF round trips
  were 0/0/0 on the measured sheets (one showed only an anonymous-block rename). Every one of the **33
  DWGs** then passed the full write gate — open, stage a redline, apply to a NEW DWG, re-open the written
  DWG and diff the model — with the source bytes unchanged; four sheets report linetype-metadata
  normalisation only (quoted with its count) and none has a hard geometry or text difference. That gate
  also found and fixed two false-change defects in the model diff (a tolerance half-step rounding
  boundary and a full turn compared as `2π−ε`), with a regression test using the measured values. A real
  DWG opened in the panel service (format `dwg`, converter provenance, title block `004`) and a staged
  redline wrote a **new** AC1027 DWG with `verification.ok` and `dwgRoundTrip 0/0/0`, leaving the source
  untouched. The DWG and DXF sets are different title-block issues, so equivalence is reported as measured
  (~90 % shared geometry), never as equality; a DWG write renumbers anonymous blocks, and proxy/ACIS/xref
  coverage is unmeasured. The wrapper's ATTRIB reattachment (an acadrust 0.6.8 gap), the `web-time` shim,
  the MPL and ACadSharp notices and the source-availability note ship with the package.
  (port evidence: `docs/port/ecad.md#m4--the-dwg-converter-measured`)
- **The ECAD drawing panel lands as the bundle's third client face.** Opening a `.dxf` (or `.dwg`) in
  the right panel draws the sheet: fit, pan, zoom, layer visibility, layout tabs, click selection with an
  inspector, coverage badges, the converter provenance for DWG, the loading/empty/truncated/read-only/
  failure states and an â€Å“Ask Arya” review action. It mounts the bundle's Typert contribution, reads the
  render-model artifact the `ecad` Remote service caches (chunked workspace read), and passes any
  `ECAD_DWG_*` failure through one failure panel unchanged. The face uses the host's `--dsw-*` tokens
  only — light and dark, focus rings, 24 px targets, reduced motion — with ACI linework mixed toward the
  theme ink (measured 3.19:1 light / 3.25:1 dark). The committed artifact was rendered in headless
  Chrome against a real sheet (15 screenshots, zero console errors) and the registration is locked by
  the client-face spec; the in-app mount and a real DWG in the panel were verified in the Dev pass.
- **The drawing panel edits prints when the row's writes switch is on.** A View/Edit switch opens an
  edit bar that stages a text annotation (click placement, default height = the sheet's median text
  height, default layer `0`), a single-entity move (drag with a ghost offset or ΔX/ΔY fields) and a
  single-entity erase, with a staged list, per-op remove and clear-all. Apply calls `ecad/apply`
  through the panel service and writes a NEW drawing beside the source (DXF, or DWG through the
  converter), then reports output path, format, per-kind counters, verification and host notes — the
  source view stays put and opening the written drawing is explicit. Failures quote code/message/fix
  and keep the draft; with writes off no edit control is rendered, only the read-only badge. The
  headless harness uses the live `{ ok, value }` carrier and covers read-only, staged, applied, written,
  move/erase, stale-keeps-draft, DWG round trip and a narrow pane (14 screenshots), and the new edit
  helpers have 12 tests. In the Dev app a text annotation was staged on a real DWG and applied to
  `prints/20136-004-ecad-…dwg` (56,387 bytes) with â€Å“1 change · verified” and â€Å“The DWG round trip
  matched the written drawing”. That pass found a real host gap: the shipped filesystem service writes
  text only, so both the tools adapter and the Remote service now publish drawing bytes through a
  policy-checked local writer (read-only sessions refuse, destinations must stay in the writable
  workspace, `createIfAbsent` is kept) with tests; `assemble` was also fixed to compare the newest
  built file so a face-only rebuild is not refused.
  (port evidence: `docs/port/ecad.md#m4--in-panel-editing`)
- **ECAD work is legible in the conversation.** The drawing face now registers a tool card for all
  sixteen `ecad_*` tools through the shell's keyed `tool.call.toolview` slot — specialised cards for
  open (DXF/DWG badge, conversion warnings, entity coverage, title block), scan, checks (severity counts
  and findings), cross-reference (candidate counts and confidence), render (layout and SVG path) and
  draft_apply (verified badge, output path, per-kind counters, verification problems, DWG round-trip
  hard/metadata split, â€Å“Open written drawing”) — with error envelopes shown verbatim, malformed
  payloads never inventing counts, and opening a file through the row's `openFile` route. A quiet
  sheet-set dock above the composer reads `ecad.sheets`/`ecad.capabilities` for the real session and
  shows drawing/DWG counts, profile state and writes state, hiding itself when there is no session, no
  drawing or no readable bridge. 22 card/dock tests, the client-face registration and inventory checks,
  and a seven-shot harness (cards light/dark, dock light/dark/absent/read-only, narrow column) pass;
  the render card names its SVG path instead of faking a thumbnail, and cards replace the generic row's
  Inspect control because the shell tool primitives are not bundled.
  (port evidence: `docs/port/ecad.md#m5--conversation-intelligence`)
- **The bundle exposes its own Typert Remote service.** `package.json` exports `"./typert"`
  (`lib/typert.host.js`), so the Host's typert loader registers the bundle's `ecad/open`, `ecad/apply`,
  `ecad/sheets` and `ecad/capabilities` invocations while the `viewers` row is mounted, and
  `lib/index.js` provides the `ecad` Cordis service they dispatch to. `src/remote/ecad-contract.js` is
  the one source of the wire facts — rendered into the artifact and imported by the panel contribution —
  so endpoints and codecs cannot drift. The service imports the ECAD engine lazily, reads through the
  Host filesystem service, and writes under the session's sandbox policy; the model-facing ECAD tools
  and the panel that uses this service land in the same batch.
  ([architecture](docs/architecture.md#typert-remote-face))
- **The default-on surface has a budget, and a new component ships off until it is raised.** `components.json`
  records the tools and the characters of model-visible schema a fresh install may mount
  (`contextBudget`), measured from the generated reference: 142 tools and 115,116 characters of the 133
  generated definitions today. `test/components.spec.mjs` fails when either ceiling is crossed, and a
  component's `default` must agree with its patch row's `disabled`, so a row can ship switched off and be
  enabled from the Plugins page. Nothing here turns a row off: every row still ships on, and the budget is
  the ratchet for the next component. The tool reference now prints the measured total, and the README
  says the default-on surface is budgeted.
- **Tool names are namespaced.** Every component that registers tools declares the `namespace` prefixes
  it owns (`ftview_`, `mw_`, `optix_`, `engineering_`, `migration_`/`l5k_`/`slc_`); the suite fails on a
  name outside its namespace, a shared or ambiguous prefix, or a second component claiming L5X's legacy
  exemption. L5X is the one grandfathered component — its unprefixed names (`open_project`,
  `draft_apply`, …) need a planned prefixed rename before another product can use those words.
- **Growth policy is written down.** [`docs/reference/components.md`](docs/reference/components.md) now owns
  when a component splits out of the bundle (licence/IP, a different host line, a heavy optional payload,
  an independent cadence) and the add-on-bundle path for CAD-class payloads. The release rule that keeps
  that model cheaper than separate plugins — one version per batch, never one per change — is now in
  [`AGENTS.md`](AGENTS.md).
- **The tarball carries runtime files only.** `docs/**` and `CHANGELOG.md` no longer ship in the npm
  package; the README is still the market detail document. This removes about 2.6 MB from every install.
- **The add-a-component path was rehearsed with a throwaway ninth component.** A scratch worktree carried a
  real package, entry, row, skill and document through the full suite before anything shipped. It exposed
  two checks that would have blocked or missed the next component: `test/patch.spec.mjs` carried a closed
  allowlist of row ids, so any new row failed there first, and `test/docs.spec.mjs` hand-listed the four
  vendored components whose dependencies the bundle must declare. Both now derive from `components.json`,
  and the checklist names the generator group and the pinned numbers a new component updates. Nothing from
  the rehearsal ships.
- **Documentation corrected.** The README and the L5X editing config no longer claim stale draft-tool
  counts, the generated reference states the measured 133 definitions (plus 9 vendored Optix tools), and
  `docs/print.css` now matches the report stylesheet it is generated from.

## 0.85.3 — 2026-11-02

- **A block draws what it writes on the right and what it reads on the left.** Instruction blocks listed every operand
  down the middle, so `ADD(Count,1,Count)` read as three values in a column with no indication which one the instruction
  writes — the destination looked like a third input. The catalog already marks the written slot (`ADD`'s
  `Destination` is `numW`, `RES`'s `Structure` is `writable`), so the drawing now places those pins on the right in
  bold and the rest on the left: `ADD` shows `Count`, `1` then **`Count`**, while `GE` (a compare, which writes
  nothing) keeps both operands on the left and `TON` keeps `Timer`/`Preset`/`Accum` there, because none of them is a
  written slot. Contacts and coils were already in flow order; a coil is the right-hand element of its rung.

## 0.85.2 — 2026-11-02

- **Ladder labels sit above their symbol and reserve their own width.** A contact's tag was absolutely positioned
  *below* the glyph and the element was 15px wide, so `Timer.DN` printed over the next block, `Stop` and `Run` ran into
  each other on the wire, and a branch's lower path put its tag inside the row beneath. Each element now reserves
  `max(symbol, label)` pixels and prints its tag above the symbol, and the flow and branch rows are tall enough to hold
  it — the drawing no longer needs the reader to work out which tag belongs to which glyph.
- **A wrapped line in the Changes section belongs to its block.** The renderer treated every source line as a paragraph,
  so a bullet written across two lines came out as a bullet plus a stray paragraph. Blocks now continue until a blank
  line, a heading, a fence or a new marker.

## 0.85.1 — 2026-11-02

- **The tool reference is regenerated for `report_notes`.** 0.85.0 shipped the parameter and left `docs/reference/tools.md`
  stale; `pnpm docs:check` caught it (the reference is generated from the schemas, so a new parameter must appear there).
  No behaviour change from 0.85.0.

## 0.85.0 — 2026-11-02

- **A report you asked for can carry your own narrative, with the ladder still drawn.** `document_project` takes
  `report_notes`: a path to a Markdown file. Its content becomes the report's first section, **Changes**, ahead of
  *At a glance* — so a change report is prose you wrote plus the ladder the generator draws from the export, in one
  branded document, rather than a hand-built HTML page that can only show NeutralText.
- **Markdown, rendered not echoed:** headings, paragraphs, ordered and unordered lists, fenced code, `code` and
  **bold**. The section is listed in the contents and numbered, so the rest of the report renumbers around it; with no
  notes the report is exactly what it was.
- **Two tests** pin the section's presence, its numbering, the contents entry, that Markdown became structure, and that
  a report without notes is unchanged.

## 0.84.0 — 2026-11-02

- **A multidimensional array element with a member now composes.** `Alarm_Timer[0,8].DN` was refused with
  `INVALID_OPERAND: "Alarm_Timer[0,8].DN" is not a tag or a number.`, which read as though the tag did not exist. It did:
  the address resolver splits comma-separated indices and resolves the member correctly — the gate in front of it is a
  character class for what an address may contain, and it omitted the comma. So every two-dimensional timer, `Tmr[1,0].DN`,
  was unreachable from `compose_rung` and `draft_rung` while the one-subscript form worked, which is what made the
  refusal look like a missing declaration.
- **The gate admits the comma; the resolver still decides.** `TAG_TEXT` keeps rejecting spaces, quotes and anything else
  an address cannot contain, and a wrong rank or an unparsable address still fails — with the rank or the shape named,
  not with "not a tag or a number". Three tests pin the three cases: two subscripts plus a member, one subscript plus a
  member, and a wrong rank that must not read as a missing tag.

## 0.83.0 — 2026-11-02

- **FTView and the migration surface now write with the session's sandbox policy too.** 0.82.0 fixed this in the L5X
  store; the same omission existed in the other two components — six writes in `ftview`'s edit tools and two in
  `migration`'s, all calling the provider with four arguments. A confining provider fills the missing fifth with
  `ctx.sandboxPolicy.resolve()` (no session), which is the deployment default `workspace-write`, so `ftview_apply` and
  `migration_report` were refused in a session switched to `danger-full-access`. Both now resolve the policy for the
  calling session and pass it, and both accept the `sandboxPolicy` service as optional so a composition without a
  confining provider is unchanged.
- **A dropped abort signal, restored.** `migration` passed its `AbortSignal` in the *options* position of
  `fs.writeText`, so cancellation never reached the provider and the options object was a signal. The call is now
  `(target, text, options, signal, policy)`.
- **Two suite failures are pre-existing and unrelated**, verified by re-running them on the untouched tree:
  `ftview` `workflow.spec.ts > stops a draft whose XML the vendor schema rejects` (`apply_blocked` is false) and
  `migration` `knowledge.spec.ts > has a page for every PCE code the row documents`. They are not caused by this change
  and are not fixed here.

## 0.82.0 — 2026-11-02

- **A draft writes with the session's sandbox policy, not the deployment default.** `draft_apply`, `document_project` and
  every other writer in this package called `fs.writeText(target, text, options, signal)` and stopped there. A confining
  provider fills the missing fifth argument with `ctx.sandboxPolicy.resolve()` — no session — which is the *deployment
  default*, `workspace-write`. So a session switched to `danger-full-access` could stage a draft, validate it, and then be
  refused the write with `file access denied under workspace-write mode`, naming a mode the user had already left. The
  host's own `write`/`edit` tools resolve `sandboxPolicy.resolve({ session })` per call and pass it; this package now does
  the same, from the `sandboxPolicy` service when the composition has one.
- **The regression is pinned by a behavioural test**, not a text check: a recording provider asserts that the fifth
  argument is exactly what the policy service resolved for the calling session, and that a composition without the
  service passes nothing.
- **Known, not yet fixed: the same omission in the sibling components.** `ftview` writes at six call sites and
  `migration` at two; `migration` also passes its abort signal in the *options* position, so cancellation never reaches
  the provider either. Both fail the same way in a wider-than-default session. They are separate packages with their own
  `FsService` types and need the same threading.

## 0.81.0 — 2026-11-02

- **The report is branded.** A generated document now carries the production brand kit: the monochrome mark and the
  `Arya`/`Code` wordmark with the tagline, the violet→blue→cyan rule above the cover and again above the footer, numbers
  per section (`01`…`04`) in the table of contents and beside each heading, and a footer line naming the product and the
  package version it came from. Sora sets the text and JetBrains Mono the code, rung labels and rung numbers.
- **The typefaces travel inside the document.** `packages/l5x/assets/brand/` carries the mark, both variable fonts and
  their OFL licences; the generator embeds them as `@font-face` data URIs, so a report prints the same on a machine that
  has never installed the brand kit. When an install has pruned those assets the generator falls back to the system stack
  and omits the mark rather than failing.
- **`assets/**` ships** like the rest of the package, so an installed copy can generate a branded report.

## 0.80.0 — 2026-11-02

- **The report draws ladder in the pane's language, not as coloured boxes.** A generated document used `renderLadderSvg`, the blocky box-and-label drawing the preview tools use, so a report showed a symbol-free picture of logic the app itself draws as contacts and coils. The report now emits the pane's own markup: `.ldr-contact` is two green bars with a negation slash for `XIO`, `.ldr-coil` is an oval, instruction blocks are `.ldr-block` cards with the mnemonic as a header and one row per operand, rails are two thick rules at the ends of the rung, a branch is a bordered column of parallel paths, and every symbol carries its tag underneath. The styles live in `report-styles.ts` beside the rest of the print CSS, so a document and a printed page agree on them.
- **The document carries no ladder SVG at all.** A test asserts it: no `<svg>`, no pane-dark fill, and the `ldr-*` classes present. The preview tools keep `renderLadderSvg` — they run in Node with no browser and no stylesheet, which is the reason the report used it in the first place.

## 0.79.0 — 2026-11-02

- **One print path: the handbook and a report are now the same kind of document.** The report's stylesheet moved to `packages/l5x/src/engine/report-styles.ts`; `pnpm docs:print-css` writes `docs/print.css` from that one definition and `docs:check` fails when the file drifts. `scripts/gen-handbook.py` emits the same cover, table of contents, section and table markup a report uses, links that stylesheet, and prints its PDF through `scripts/print-pdf.mts` — the same Chrome invocation as `report_format: "pdf"` — so reportlab and its parallel typography are gone. The regenerated handbook is 8 pages, produced by Skia/PDF, where it used to be built by a second engine. The DOCX path is untouched: it is the editable copy and has no printing to share.
- **`docs/print.css` ships with the package** like the rest of the documentation, so an installed copy and this repository print identically.

## 0.78.1 — 2026-11-02

- **The docs map now covers the report.** `docs/index.md` gains a "Reports and documents" section that separates the
  handover bundle from the printable report, names the generator and the palette behind its ladder, and repeats the
  footer's limit: a document is evidence of what the export contains, not of what the machine does.

## 0.78.0 — 2026-11-02

- **The report is a tool, not scaffolding.** `document_project` takes a new `report` part: one self-contained HTML document with a cover, a table of contents, at-a-glance counts, the ladder drawn inside each routine, rung tables, tag and I/O tables, and a footer that states what a generated document cannot prove. `report_format` is `html` (default), `pdf`, or `both`; a PDF is the same page printed by the local Chrome or Edge, and when neither is installed the answer says so instead of writing nothing. The module the previous release shipped unused (`engine/report.ts`) is now called by the bundle and by the tool, so the document and the handover bundle cannot disagree about what the export contains.
- **The documentation ships with the package.** `docs/**` is in `files`: the ten guide pages, the reference, the decision records, the worked examples and the 32 generated figures now travel in the npm tarball. Before this, `README.md` linked `docs/getting-started.md` and eight other pages that did not exist in an installed copy — 692 files in the tarball, 62 of them docs.
- **The ladder draws on paper, in the same renderer.** `renderLadderSvg` takes a palette; the pane keeps its dark one and the document gets `PAPER_PALETTE`. The first generated report put near-black panels inside a white sheet because the document reused the pane's colours; the geometry, the parser and the drawing code are unchanged, so a report's ladder is the pane's drawing on paper rather than a second picture of the same logic.
- **Structured Text is highlighted, though not by Prism.** `highlightSt` colours comments, string literals, keywords and numbers in the report's ST bodies. It is a scanner in this repository with no dependency, and a test asserts that stripping the markup returns the body byte for byte — highlighting cannot rewrite the logic it colours.
- **A report cannot silently lose a section.** `REPORT_SECTIONS` declares `glance`, `logic`, `tags` and `io`; the generator validates every one before assembling the page and returns the list it wrote, and the table of contents links to the same anchors. A future edit that drops a section fails a test instead of shipping a document that is quietly missing its tag list.

## 0.77.0 — 2026-11-01

- **Report generator scaffolding, not yet exposed.** `packages/l5x/src/engine/report.ts` builds a self-contained HTML document from an export: cover, numbered sections, a ladder figure per routine, rung tables, tag and I/O tables, print CSS. `scripts/example-report.mts` drives it and prints a PDF through headless Chrome. The ladder in this version is drawn by the plugin's SVG renderer; the capture path that renders it through the shipped viewer exists only in the example script, so **no tool exposes the report yet** and nothing in the product uses this module.

## 0.76.0 — 2026-11-01

- **The docs now say what evidence exists per surface, including where none does.** `docs/capabilities.md` carries a table of all four products: Studio 5000 and FactoryTalk View ME have captures, MotionWorks IEC and FactoryTalk Optix say **none** and why (no reachable IDE bridge on this host) instead of borrowing a figure from another surface. The two empty rows are the honest state of the repository, not a judgement about the tools.
- **The composer chain has its worked example.** `docs/examples/composer-to-studio.md` follows one rung from `compose_rung` to a 0/0 build: the call and the answer it returns (the emitted `TON(Timer,2000,0)`, the `preview_path`, the `present` step), the viewer drawing it, the copy affordance, the **In Neutral Text** step that makes the paste work, and the captured build. It says which parts are captures and which are the shape the tests assert, and closes with what the chain does not prove - that the rung is sensible, that the preset suits the process, or anything about runtime.`n- **The paste path is proved, and the step that was missing is documented.** A composed rung reaches Studio as text, but the rung editor has a format selector and it opens in **In ASCII Text**: text typed there is rejected as `Invalid or unrecognized instruction` and replaced with an `Unknown Instruction` placeholder even when it is correct. Switching the editor to **In Neutral Text** and pasting `XIC(Run)TON(Timer,2000,0);` into rung 4 of `E2E_Standard` built **0 errors, 0 warnings, 0 messages** on a 5069-L320ER at 37.11, captured as `docs/figures/studio-neutral-text-paste.png` and written up in `docs/capabilities.md` with the four steps. The accumulator operand from the previous release is confirmed by that build.
- **The composer now writes the timer operand Studio actually requires.** Pasting a composed rung into Logix Designer's ASCII Text editor answered `Warning: XIC(Run)TON(Timer,2000);, Invalid or unrecognized instruction` - Studio's NeutralText carries the accumulator, so the rung is `TON(Timer,2000,0)`. The catalogue already modelled three operands, but the composer demanded that the caller know it. `compose_rung` now writes the trailing `0` when the accumulator was left off, still honours an explicit value, and does not double it. Proved by hand in Studio 5000 37.11: the corrected text is accepted and builds 0 errors.
- **A documentation map, and the mojibake removed from the pages it maps.** `docs/index.md` is the page that was missing: every guide, reference and decision record, by task and by surface, with the ladder figure inline and the rule that a figure is regenerated rather than drawn. Repairing the pages it points at exposed real damage - `docs/handoff-one-package.md`, `docs/port/mwi.md`, `docs/reference/ftview-any-app.md` and four FTView tool descriptions carried text that had been UTF-8 read as Windows-1252, so an em dash reached the reader as `â€` and one table row as `ÃÆ’Ã†â€™Ãƒâ€ 'ÃÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢...`. `scripts/repair-encoding.mjs` undoes that layer by layer using the cp1252 byte map (a plain `latin1` roundtrip cannot: the punctuation sits above the byte range and is truncated), refuses a pass that changes nothing or produces U+FFFD, and the generated tool reference was rebuilt from the repaired descriptions.`n- **The Arya Automation Engineer preset now ships with this bundle.** It lived in `@aryacode/dsh-aryacode-polish` beside the Arya Standard and Arya Qwen presets. Everything it tells an agent to do is a statement about this bundle's tools - read before writing, act in a copy, verify with the vendor engine, hand off what is human - so it moves here and the polish bundle drops it. `presets/arya-automation` and the base kit it derives from (`presets/arya-standard`) travel in `files`; `entries/preset.js` is the `engineering-preset` row, exported as `@aryacode/dsh-engineering/preset`; its engine rows mount this package's own `./arya-standard` and `./arya-standard-policy` subpaths. The preset's own test moved with it, and the host packages its rows reference are dev dependencies so that test runs here.`n- **The documentation's viewer figures are generated from the shipped pane.** `pnpm docs:figures` renders four screenshots of `packages/viewer/lib/client.js` in headless Chrome through the document-preview contract - ladder, Structured Text, a function block sheet and a chart - and writes them to `docs/figures`, where `docs/capabilities.md` uses them with the same what-it-proves/what-it-does-not captions as the rest. A hand-drawn figure drifts silently; a regenerated one shows up as a diff.
- **Applying a draft now shows the export it wrote.** `draft_apply` is the moment a staged draft stops being text: the
  file it writes is a real export, so the viewer draws the ladder, the Structured Text, the function block sheet or the
  chart from it, in every language. It now offers `present` beside `open_project`.
- **Every composed language now writes the document the chat draws.** `draft_st`, `draft_fbd` and `draft_sfc` used to
  leave the pane blank until `draft_apply` — only the rung composer produced a preview. Each now writes
  `.l5x-preview/<program>-<routine>.L5X` in the language it staged (`STContent`, `FBDContent` or `SFCContent`), built
  by the same `fbdSheetXml`/`sfcChartXml` functions the apply path uses, so the preview is the sheet or chart that will
  be written rather than an approximation of it. Each returns `preview_path` and points the answer at `present`.
  Staging stays more permissive than applying: a body the builders refuse — a wire naming no node, a pin the block does
  not show, a sheet that both writes and reads one tag — leaves the append successful without a preview, and the refusal
  still belongs to `draft_validate` and `draft_apply`, which is exactly what the existing refusal tests pin.
  The three tool descriptions say so, and the generated reference was regenerated.
- **A diagram routine can now be copied, as the XML it actually is.** Rungs copy as NeutralText and Structured Text
  copies as source, but an FBD sheet and a chart have no text form to paste — Studio's *Paste ASCII / Neutral Text*
  does not apply to them. The pane therefore offers **Copy routine L5X** for a diagram routine and puts that routine's
  `<Routine>` element on the clipboard: the element the composer wrote, pasteable into an export and comparable
  against one. The extraction is a pure function (`extractRoutineXml`) with its own tests, including that the empty
  ladder routine in the fixture does not swallow its neighbours, and the browser suite asserts the button is offered
  on both diagram routines.
- **The diagram drawing is judged end to end in a browser, not only from synthetic geometry.** `pnpm e2e:diagrams` mounts
  the shipped `packages/viewer/lib/client.js` in headless Chrome, reads the committed fixture
  (`packages/viewer/test/fixtures/diagrams.L5X`) through the document-preview contract, clicks the FBD routine and the
  SFC chart in the organizer, and asserts on the SVG that arrives in the pane: four boxes and three lines for the sheet
  with `add1`/`SourceA`/`SourceB`/`Dest`/`r3` legible, three boxes and two lines for the chart with `Step_1`/`Tran_1`/
  `Step_2`/`Timer.DN` legible. The harness gained a `diagram` mode for routines that draw no ladder instructions — it
  waits for the project view instead of an instruction node and skips the ladder invariants, which belong to ladder.
- **Function block diagrams and sequential function charts now draw in the viewer.** Both were rendered as
  "unsupported (FBD)" — the pane could draw ladder and show Structured Text, and stopped there, so half of what the
  composer writes could not be seen in chat at all. The client parser now reads `FBDContent` and `SFCContent` with the
  position the export records for every block, reference, step and transition, and the viewer draws them as one SVG:
  boxes where Studio puts them, a line per wire or link between the elements it joins, block pins listed on the block,
  the initial step marked and a transition's condition written under it. Stroking is schematic — structure, not
  execution — and a routine whose wires name nothing draws nothing rather than an empty frame. Four tests judge the
  drawing from synthetic geometry: element counts, the pin a wire lands on, the initial-step marker, the condition text,
  and the empty cases.
- **Composing a rung now produces the ladder the chat draws, and a routine's whole NeutralText block copies in one
  action.** `compose_rung` and `compose_batch` used to end at "validate", so a composed rung reached the reader as text
  unless they asked for a picture separately. Both now write the rungs they composed to
  `.l5x-preview/<program>-<routine>.L5X` — the document the project viewer draws — return its `preview_path`, and point
  the answer at `present` so the ladder is in the conversation rather than an image file beside it. The preview writer is
  shared with `l5x_rung_preview`, so both tools produce the identical document. It is scratch output: the project file
  still waits for `draft_apply`, and a read-only workspace drops the render instead of failing the composition. The
  project viewer gained **Copy all rungs as NeutralText** beside the existing per-rung, per-instruction and per-operand
  copies, so a whole routine leaves the pane in the shape Studio's *Paste ASCII / Neutral Text* accepts. The
  `rockwell-l5x` guidance says to present the preview and its budget moves 8000 → 8300 for that sentence; English and
  Chinese strings move together; a test pins the written document, the rung text and the `present` step.

## 0.75.0 — 2026-11-01

- **A composed SFC chart now draws its steps on separate rows, because the IDE showed them stacked.** `draft_sfc`
  defaulted every step to `X=300, Y=100` and every transition to `Y=200`, so a two-step chart was written with both steps
  at the same point; Studio draws one box on top of the other and does not object, because coordinates are presentation
  rather than structure. The SDK build therefore reported 0 warnings / 0 errors, and no gate could see it. The defaults
  now lay the chart out the way Studio does — steps down the sheet at a 200 pitch, each transition between the two steps
  its links join — and an explicit `x`/`y` still wins. Found by opening a composed ACD in Logix Designer and looking at
  it, which is the one check the compiler cannot make. Verified both ways: the fixed chart imports and builds 0/0, and
  Logix Designer draws `Step_1`, `Tran_1` and `Step_2` in three places. A test now asserts that a two-step chart with no
  positions emits two distinct Y values with the transition between them.
- **The `run_checks` description now derives the rule count it states.** It said `41 rules` while the tool carried
  **42**, and it said it twice — `docs/reference/tools.md` copies the description verbatim, so the wrong number shipped
  in the generated reference with every gate green. Both places now interpolate `FINDING_RULES.length`, so a rule added
  or removed updates the sentence, and a test pins the description to the exported list and refuses a hard-coded `41`.
  Found by counting the list against the text while writing the parity matrix, not by a failing gate: a number written
  as prose had nothing checking it.
- **A diagram finding now names the wire or link it is about.** A `<Wire>` and a `<DirectedLink>` carry no `ID` of
  their own, so every FBD and SFC finding located them as `id ?` — true of every wire on a sheet and useless on a real
  one. `FBD_DANGLING_WIRE`, `FBD_WIRE_PIN_NOT_VISIBLE` and `SFC_LINK_TARGET_MISSING` now name the ends
  (`COMBUSTION::Air_Valve_Ramping sheet 1 Wire 1 -> 20: ToID pin "AccelRate" is not a visible pin of block 20
  (In, AccelRate, DecelRate, Out)`) and carry `from_id`/`to_id` in the evidence, so the wire can be found in Studio.
  Verified on the real 10 MB `Seco_Homogenizer` export, which carries the only diagram languages in the corpus (one FBD
  sheet of five `SCRV` blocks and 20 wired pins, two SFC charts): the untouched export reports nothing for all four
  diagram rules, while copies broken on purpose fire exactly where they should — one `ToParam` typo gives 1
  `FBD_WIRE_PIN_NOT_VISIBLE`, one cleared `InitialStep` gives 1 `SFC_NO_INITIAL_STEP`, and one link retargeted to `999`
  gives 2 `SFC_LINK_TARGET_MISSING` because both charts carry that link. The other four production exports are ladder
  only, so they exercise no diagram rule at all — recorded as a true negative on one export, not as coverage on five.
  Three tests assert the ends and that no diagram finding still says `id ?`.
- **Eight instructions the composer used to refuse now compose, and Studio proved they build.** `FFL`, `FFU`, `LFL`,
  `LFU`, `DTR`, `ATAN2`, `SQI` and `EVENT` were among the ~100 instructions the catalogue did not carry; their operand
  lists come from the installed Logix 5000 instruction help (`Help\ENU\rs5000`), which states each slot by name,
  including the pseudo-operands `Length` and `Position` that are real operands in the rung text. The catalogue goes from
  128 to **136**. Verification is not a unit test alone: the composer built
  `XIC(a1)FFL(arr1[0],arr2,ctl1,10,0)`, `XIC(a1)DTR(arr1[0],d2,arr2[0])OTE(a2)`,
  `XIC(a1)SQI(arr2,d2,arr1[0],ctl1,10,0)OTE(a2)` and the other five, our writer wrote the export, and the real Logix
  Designer SDK imported and built it — **0 import warnings, 0 errors, ACD written, 36 s**. Eight regression tests keep
  the exact accepted text, so a later operand edit cannot silently change what Studio approved.
- **Function block diagrams can now be composed, and Studio proved the sheet builds.** `draft_fbd` stages an FBD sheet —
  blocks, references and wires — and `draft_apply` writes it. The rule that took the longest to find: **a block is an
  instance**, so its `Operand` must name a tag whose data type is the block's structure (`FBD_MATH` for `ADD`), and wires
  name the pin on the block side (`ToParam` into an input, `FromParam` out of an output). The tool validates that the
  backing tag exists in scope and carries that structure, that every reference resolves, and that each wire names a node
  and a pin the block shows. Verification: `draft_fbd` → `draft_apply` → `verify_offline_l5x` imported and built the sheet
  with **0 warnings, 0 errors and an ACD written**. Six tests cover the accepted XML plus the refusals (wrong routine
  language, undeclared backing tag, wrong structure type, unknown node id, unknown pin). This closes the capability gap
  that mattered most: the competition composes four languages; two are no longer enough.
- **An FBD routine can now be created, and blocks chain directly.** `draft_routine` accepts `language: "FBD"` and writes
  an empty `FBDContent` (a body is refused, because a diagram is not code); `draft_fbd` then sees a routine staged earlier
  in the same draft, so the two calls work in either order. Two corrections came out of Studio builds: a **block-to-block
  wire is legal** (`FromParam` on the driving block, `ToParam` on the reading block) and is how blocks are chained — my
  first version refused it — while a sheet that **both writes and reads one tag** makes Studio abort the import, so the
  engine now refuses it with the fix spelled out (*"wire the blocks to each other directly, or move the read to another
  sheet"*). Verification by build: created routine only, one-block sheet, and a two-block chain through a direct wire all
  passed with **0 warnings and 0 errors**; the same-tag sheet fails as Studio does. Four new tests, 344 total.
- **An SFC chart creates the tags it needs and Studio builds it — with actions and numeric conditions.** `draft_sfc`
  declares every step as an `SFC_STEP` structure tag, every transition as a BOOL tag and every action as an `SFC_ACTION`
  structure tag when the project does not already have it, using the member set Studio writes (initial step `Status`
  `16#a020_0201`, others `16#0020_0201`; action `Status` `16#0020_0000`, `PauseTimer` 1, `PRE` 100). A missing `<Tags>`
  region is created before `Routines`, where the schema requires it. Verified on a project with no SFC tags at all:
  `draft_routine` + `draft_sfc` + `draft_apply` produced a chart with a step carrying a `NonStored` action and a
  transition conditioned on `c1 > 5`, and Logix Designer imported and built it with **0 warnings, 0 errors and an ACD
  written**. Two compiler rules were needed to get there: a transition condition must reference a tag or member — the
  literal `TRUE` is read as an undefined tag (`RxSTX_E_TAG_NOT_FOUND`) — and an empty `Structure` is rejected with
  `XMLSrv_E_SYNTAX_ERROR_EXPECT_DATAMEM`. Ten tests cover creation, generated tags, actions, conditions, the XML and the
  refusals.

- **Two float comparisons the composer refused now compose, and a repeated import aborts for a reason worth knowing.** `ISINF`
  and `ISNAN` take one `Source` slot; the catalogue is now **138** instructions. Verification went through our own tools
  rather than a hand-written rung: `compose_rung` built the spec tree, `draft_apply` wrote the export, and Logix Designer
  reported **0 warnings, 0 errors and an ACD written**. A second finding came out of the failures on the way: an import of
  an L5X whose **controller name is already registered** with the Studio SDK fails with
  `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES`, and the *same bytes* import cleanly under a new controller name — renaming the
  controller proved it, after the file had been blamed. The bridge now releases the L5X-derived project before it opens
  the ACD that carries the same name, which is the correct lifetime regardless; the stale registration that survives a
  crashed or killed run still needs a fresh name or a service restart, and that is stated here rather than left to be
  rediscovered. `REF` was tried in the same batch and refused with `RxCMP_E_AUDIT_INVALIDOPTYPE` for both DINT and REAL
  operands, so it stays uncatalogued until a real export shows its operand type.

- **Six serial ASCII instructions compose, and the table that had their operand counts wrong is corrected.** `ABL`,
  `ACB`, `ARD`, `ARL`, `AWA` and `AWT` are now described with the operand types the installed help publishes — `Channel`
  DINT, `Serial Port Control` a `SERIAL_PORT_CONTROL` structure, `Serial Port Control Length` and the character counts
  DINT, `Destination`/`Source` STRING — so the catalogue counts **139** instructions. Five of them already existed in the
  compact `instruction-set.ts` table with the wrong arity (`ABL=AL` is two slots; Studio takes three), which is how the
  duplicate-mnemonic test found them; that table is now reduced to the four entries still generic. Verification is a
  Studio build through our own composer: `compose_rung` produced `XIC(a1)ABL(chan,ctl,cnt)OTE(a2)`,
  `ARD(chan,text,ctl,len,cnt)OTE(a2)` and `AWT(chan,text,ctl,len,cnt)OTE(a2)`, `draft_apply` wrote the export, and Logix
  Designer built it with **0 warnings, 0 errors and an ACD written**. The family is **controller-gated**: on a 5069 and on
  a 1756-L83E every operand combination returns `RxCMP_E_AUDIT_INVALIDOPTYPE`, while the same rungs build on a 1756-L73,
  and the help states these instructions are unavailable on controllers without serial ports.

- **A serial-port instruction on a processor that has none is now reported instead of left for the build.** `run_checks`
  gains `SERIAL_PORT_INSTRUCTION_UNSUPPORTED`: when a ladder routine uses `ABL`, `ACB`, `ACL`, `AHL`, `ARD`, `ARL`, `AWA`
  or `AWT` and the export's `ProcessorType` is a CompactLogix 5380 (`5069-…`) or a ControlLogix 5580 (`1756-L8…`), the
  finding says which rung, which mnemonic and why — Studio's compiler answers
  `RxCMP_E_AUDIT_INVALIDOPTYPE` for every operand combination, because the family has no serial port — and names a
  controller where the same rung does build (`1756-L73`). That rule exists because the previous round spent five failed
  builds changing operand types for an instruction the platform never supported. Severity is `critical`, one finding per
  rung however many such instructions it holds, and a 1756-L73 reports nothing. Six tests cover the rule directly and
  through `run_checks`.

- **The serial ASCII family is complete in the catalogue: `ACL` and `AHL` join it, both built.** Their slots come from
  the installed help pages, not from guessing: `ACL` is `Channel`, `Clear Serial Port Read` and `Clear Serial Port Write`
  (both BOOL), and `AHL` is `Channel`, `ANDMask`, `ORMask`, `Serial Port Control` and `Channel Status`. The catalogue is
  now **140** instructions. `AHL` had also been sitting in the compact `instruction-set.ts` table as `AHL=AL` — two
  slots where Studio takes five — so it is removed from that table, the second time this round-trip has caught a wrong
  arity there. Verification is a Studio build on a 1756-L73 through our own composer: `compose_rung` produced
  `XIC(a1)ACL(chan,clrR,clrW)OTE(a2)` and `XIC(a1)AHL(chan,andMask,orMask,ctl,chStatus)OTE(a2)`, `draft_apply` wrote the
  export, and Logix Designer built it with **0 warnings, 0 errors and an ACD written**. The test that pins the ASCII text
  now covers all eight instructions, so a later operand edit cannot silently change what Studio approved.

- **The compact table is audited against the help, and three more arities were wrong.** Comparing every entry in
  `instruction-set.ts` with the operand lists extracted from the installed help found 22 disagreements; the ladder-shaped
  ones were judged by build. `SRT` takes **five** slots (`Array`, `Dimension to Vary`, `Control`, `Length`, `Position`),
  not three; `SWPB` takes **three** (`Source`, `Order Mode`, `Dest`), not two; `STOR` takes **two** (`Source`,
  `Destination`), not three. All three are now declared explicitly in `instructions.ts` and gone from the compact table,
  which keeps 41 → 38 rows. A rule worth writing down came out of the same build: `SWPB`'s order mode is a **number**
  (0 or 1) — the help says to enter `HIGHLOW`, but Studio reads that as a tag and fails with
  `RxCMP_E_OPERAND_TAGNOTFOUND`, while `SWPB(d1,0,d2)` builds. Verification is a Studio build of the composed rungs
  `XIC(a1)SRT(arr,0,ctl,10,0)OTE(a2)`, `XIC(a1)SWPB(d1,0,d2)OTE(a2)` and `XIC(a1)STOR(text,r1)OTE(a2)`: **0 warnings,
  0 errors and an ACD written**. Two tests pin the audited slot counts and the accepted text so the compact table cannot
  quietly drift back.

- **The compact table's second audit batch: three arities fixed, five entries that should never have been there removed.**
  `STD` takes **six** slots (`Array`, `Dimension to Vary`, `Destination`, `Control`, `Length`, `Position`), `SIZE` takes
  **three** (`Source`, `Dimension to Vary`, `Size`), and `JXR` takes **two** (`External routine name`,
  `External routine control`, with optional parameters and a return tag after them) — the first two confirmed by a build,
  the third by a build that parsed both operands and failed only on the undeclared routine
  (`RxCMP_E_AUDIT_ROUTINENOTFOUND`). Five entries are gone: `ACN`, `ASR` and `AEX` have **no page in the installed help
  and no meaning in Studio** — a deliberately bogus `ZZZZ(d1)` fails a build with exactly the same
  `RxCMP_E_AUDIT_INVALIDOPTYPE` those mnemonics produced — and `SCL` and `PIDE` are **Function Block and Structured Text
  only**, so a ladder catalogue must not offer them. The catalogue is **135** instructions, and it is smaller because it
  is now more nearly true. Verification of the fixed ones is a Studio build of
  `XIC(a1)STD(realArr,0,dest,ctl,10,0)OTE(a2)` and `XIC(a1)SIZE(arr,0,size)OTE(a2)` through our own composer: **0
  warnings, 0 errors and an ACD written**. Two tests pin the counts and assert the five removed mnemonics stay absent.

- **Both alarm instructions take five operands, not one, and the count was settled by build.** `ALMD` is
  `ALMD(tag, ProgAck, ProgReset, ProgDisable, ProgEnable)` and `ALMA` is
  `ALMA(tag, In, ProgAckAll, ProgDisable, ProgEnable)` — the compact table had each at a single slot. Getting there
  took a bisection worth recording: the help's ladder table lists **six** operands for `ALMD`, and six fails with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS`; counts 1 through 4 and 6 all fail the same way, and **5** builds. The sixth
  (`MinDurationPRE`) is a structure member the page presents in the operand table, not a rung operand. `ALM` itself is
  Function Block and Structured Text only, so it stays out of a ladder catalogue, which is why `ALMD` and `ALMA` are the
  alarm instructions here. Verification is a Studio build through our own composer:
  `XIC(a1)ALMD(almD,progAck,progReset,progDisable,progEnable)OTE(a2)` and
  `XIC(a1)ALMA(almA,inVal,ackAll,progDisable,progEnable)OTE(a2)`, **0 warnings, 0 errors and an ACD written**. Two
  tests pin the counts and the accepted text.

- **An alarm can now be created from nothing: `draft_tag` declares the structures Studio defaults itself.** `CONTROL`,
  `SERIAL_PORT_CONTROL`, `ALARM_ANALOG` and `ALARM_DIGITAL` are accepted as data types, and the tag is written exactly
  as Studio writes it for those types — no `Data` block, because Studio fills the members in. That closes the last
  generation gap in the ladder surface: until now a composed `ALMD` or `ALMA` needed a project that already had an alarm
  structure, and a composed `SRT` or ASCII rung had the same problem with `CONTROL`. Verification is end to end through
  our own tools: `draft_tag` created `almD` as `ALARM_DIGITAL` and `almA` as `ALARM_ANALOG` in a project that had
  neither, `compose_rung` built the two alarm rungs, `draft_apply` wrote the export, and Logix Designer built it with
  **0 warnings, 0 errors and an ACD written**. Two tests cover the accepted types and keep an unknown type refused, with
  the type check asserted where it actually fires — when the draft is applied, not when it is staged.

- **Fixing code is now a proven flow, not a claim: refuse, name, replace, re-check, build.** An export whose rung reads
  `XIC(Missing)OTE(Run)` **fails a real build** with `RxCMP_E_OPERAND_TAGNOTFOUND`; `run_checks` names it exactly —
  *"Symbol Main::Missing could not be resolved in this export"*; `compose_rung` with `mode: "replace"` stages
  `XIC(Start)OTE(Run)`; `draft_apply` writes it; the re-check on the written file reports **0** unresolved references; and
  that file **builds with 0 warnings and 0 errors**. Both sides of the before/after are Studio verdicts, which is what
  makes the claim worth anything. The flow is pinned in `packages/l5x/test/repair.spec.ts` so it cannot quietly stop
  working: it asserts the finding before, the composed text, that the written export no longer contains the bad symbol,
  and that the re-opened export has no unresolved reference left. That is the capability the brief asks for — compose,
  and fix — shown as one run rather than as separate tools that happen to exist.

- **`PID` takes seven operands, not one, and two rounds of wrong guesses about it were mine to own.** The ladder form is
  `PID(pid, PV, Tieback, CV, master loop, inhold bit, inhold value)`; `PID(tag)` and even `PID(tag, PV, Tieback, CV)` fail
  with `RxCMP_E_AUDIT_INVALIDNOOFOPS`, and the seven-operand form **builds with 0 warnings and 0 errors**. The same round
  cleared a misunderstanding behind three earlier failures: `EXPT`, `ASIN`, `ACOS` and `ATAN` are the **v36+ spellings**
  of the legacy `XPY`, `ASN`, `ACS`, `ATN` this catalogue has always carried — my raw-XML probes wrote the legacy names
  into a 37 project and Studio answered `INVALIDOPTYPE`, which reads like a bad operand but was a bad *spelling*. With the
  modern names, `EXPT(r1,r2,r3)`, `ASIN(r1,r2)`, `ACOS(r1,r2)` and `ATAN(r1,r2)` all build, so those catalogue entries
  were right all along and are unchanged. `SQC` stays open: `SQC(arr,…)` needs array **elements** (`MUSTBEDISCRETE`), and
  the element form still fails on type, so nothing is changed there until a shape builds. Two tests pin PID's seven slots
  and the accepted rung.

- **`SQC` is gone: it is an SLC instruction, and Logix does not have it.** The catalogue listed `SQC=KLP` with three
  slots; no operand count could make it build, and the help settled why. There is **no `SQC` page** among the sequencer
  instructions (only `SQI`, `SQO` and `SQL`), and the SLC-to-Logix translation reference says it outright: *"145 SQC
  instruction not supported. Each time a SQC instruction is found."* That page lists **23** instructions Logix does not
  support, and sweeping the whole catalogue against it found **exactly one** clash - `SQC` - so removing it closes the
  class of phantom entries the audit began with `ACN`, `ASR` and `AEX`. The catalogue is now **134** instructions, and
  the test that keeps those mnemonics absent covers `SQC` too, so it cannot return by accident.

- **The skill now teaches what this cycle proved, and it got 2.4 KB smaller doing it.** `packages/l5x/SKILL.md` was at
  **7975 of its 8000-character budget** - 25 characters of room - so it could not gain a line without losing one. A
  rewrite keeps every rule and adds the ones a model could not have known: that FBD and SFC take no body and are created
  then filled; that a block **is an instance** whose first operand names a tag of the block's structure, that
  block-to-block wires are legal, and that a sheet which both writes and reads one tag aborts the import; that a chart
  has one initial step and that a transition condition **must reference a tag or member**, since `TRUE` fails as an
  undefined tag while `Step_1.DN` builds, and that `draft_sfc` creates its own `SFC_STEP`, `SFC_ACTION` and BOOL tags;
  that `draft_tag` accepts `CONTROL`, `SERIAL_PORT_CONTROL`, `ALARM_ANALOG` and `ALARM_DIGITAL`; that the serial ASCII
  family needs a **serial port** and is refused on a 5069 or 1756-L8x whatever the operands, with `run_checks` reporting
  it first; that `XPY`, `ASN`, `ACS` and `ATN` are `EXPT`, `ASIN`, `ACOS`, `ATAN` in a v36+ project and only the composer
  knows the spelling; the repair loop itself; and the gotcha that cost a cycle - an aborted import on an export that
  imported before usually means the **controller name is still registered**. The body is now **5545 characters**, so the
  next proven rule fits without a fight.

- **`CPT` had its operands in the wrong order, and a build proved it.** The catalogue listed `CPT(expression, destination)`;
  Studio answers `RxCMP_E_AUDIT_INVALIDOPKIND` for that text and builds `CPT(destination, expression)` - the help's ladder
  table puts `Dest` first too. The catalogue is corrected, and so are the four places that pinned the old order: three
  spec trees and one operand-kind assertion. This is the first defect the audit found in an instruction that had been
  catalogued since early in the cycle, and it is a reminder that "catalogued" was never the same as "verified": the
  expression slot made the rung look plausible either way, so no build had exercised it. The corrected rung
  `XIC(StartPB)CPT(FaultCount,LineSpeed + 5.0)` is what the test now pins.

- **The composer gained a fifth pattern, and it is a build-verified one: `analog_scale`.** It expands to
  `CPT(scaled,(raw - 0.0) / (100.0 - 0.0) * (50.0 - 0.0) + 0.0)` from named endpoints, and Logix Designer builds that
  text with **0 warnings and 0 errors**. Two details make it correct rather than merely plausible: the destination comes
  first because the previous round proved `CPT`'s order by build, and every endpoint is emitted as a **float literal** -
  `0.0`, not `0` - because integer literals would make the expression divide as integers at run time, which is the kind
  of bug that passes a compiler and fails a machine. `compose_rung` and `compose_batch` both accept it by name, and the
  tool reference regenerated because the pattern enumeration is part of the schema. The rung is pinned in
  `ladder.spec.ts` so a later edit cannot quietly drop the decimal point.

- **Operand order, swept where a build can actually catch a swap: `SQO` and `SQL` are confirmed, and the method has a
  stated limit.** The last round's `CPT` defect raised the question of how many other entries have their slots in the
  wrong order, so this round took the class where a mistake is *detectable*: instructions whose slots differ in kind. Two
  builds settle the sequencer family's order - `XIC(a1)SQO(arr[0],mask,dest[0],ctl,10,0)OTE(a2)` and
  `XIC(a1)SQL(arr[0],src[0],ctl,10,0)OTE(a2)` both **passed with 0 warnings and 0 errors** - and both rungs are now
  pinned in `operand-kinds.spec.ts`. `GSV` reached the compiler's attribute check (`RxCMP_E_AUDIT_BADATTR` on a
  controller/attribute pair I chose badly), which shows the class/instance/attribute/destination order is parsed but is
  **not** a build verification, and it is recorded as such. The limit matters more than the results: where two adjacent
  slots share a kind - `MOV(Source, Destination)`, `COP(Source, Destination, Length)`, `FLL` - a swapped order compiles
  either way, so **no build can ever prove it** and the help is the only authority. Order verification is therefore
  complete only for the mixed-kind set, not for the catalogue.

- **The composer's sixth pattern, `totalizer`, builds: `XIC(run)ADD(total,rate,total)`.** It accumulates a rate into a
  total while an enable is true, and the interesting part is that the source and destination **share a tag** - Studio
  allows an in-place accumulate for a math instruction, which is what makes a one-rung totalizer possible at all. Verified
  through our own composer on a 5069: `compose_rung` expanded the pattern, `draft_apply` wrote the export, and Logix
  Designer built it with **0 warnings, 0 errors and an ACD written**. The rung is pinned in `ladder.spec.ts`, the pattern
  enumeration is part of the schema so the tool reference regenerated, and `compose_batch` takes it by name too. A note
  from the previous round applies: `ADD`'s slot order cannot be proved by a build (the sources share a kind, and addition
  is commutative), so this verifies the **rung shape** and the in-place accumulate, not the operand order.

- **The timer and counter instructions were missing an operand, and `run_hour_meter` is the seventh pattern.** `TON(meter,3600000)`
  fails with `RxCMP_E_AUDIT_INVALIDNOOFOPS`; **`TON(meter,3600000,0)` builds** — the third slot is the accumulator, written
  as an immediate. `CTU(counter,10,0)` builds for the same reason. The catalogue had `TON`, `TOF`, `RTO`, `CTU` and `CTD`
  with two slots, so every timer or counter rung the composer produced was one operand short, and the `ton_delay` pattern
  had never been build-verified. All five are corrected, and `ton_delay` now emits the accumulator too. The new
  **`run_hour_meter`** pattern is the proof: it emits `XIO(meter.DN)XIC(run)TON(meter,3600000,0)` and
  `XIC(meter.DN)ADD(hours,1,hours)`, the timer's own `.DN` bit breaks its rung so it resets in the same scan it counts,
  and Logix Designer **built both rungs with 0 warnings and 0 errors**. This is the second time the audit has found a
  defect in an instruction used by the fixtures since early in the cycle — the first was `CPT`'s operand order — and both
  were invisible until a build of *that* instruction, not of a neighbour.

- **The composer was writing legacy instruction names into modern projects, and one build caught it.** A family sweep
  through `compose_rung` against a fresh v37 project emitted `MOV`, `EQU`, `SQR` and `LIM` - and Studio **refused the
  export** (`AUDIT_OUTPUTS`, then `INVALIDOPTYPE`) because those revisions renamed all four (`MOVE`, `EQ`, `SQRT`,
  `LIMIT`). The fallback in `spellingForProject` only followed the spellings a project already *used*, so a project with
  no rung using either spelling got the catalogue's legacy name. It now follows `MajorRev` when neither spelling appears:
  v36+ gets the modern name, older revisions the legacy one. With that fixed, the same sweep **built with 0 warnings and
  0 errors** in one project - eighteen instructions across five families: `MOVE`, `CLR`, `COP`, `CPS`, `FLL`, `MVM`,
  `EQ`, `LIMIT`, `ADD`, `SUB`, `MUL`, `DIV`, `SQRT`, `TON`, `TOF`, `RTO`, `CTU` and `CTD`. That is the "build per family"
  the last round asked for, and it found a defect on the way that no fixture rung had exercised.

- **The string family is verified, and `STOD`/`DTOS` were typed as numeric on both sides.** Seven string instructions
  build through our composer: `MID(s1,5,1,s2)`, `INSERT(s1,s2,1,s3)`, `DELETE(s1,5,1,s2)`, `FIND(s1,s2,1,d1)`,
  `STOD(s1,d1)`, `DTOS(d1,s2)` and `RTOS(r1,s3)`. Two findings came out of the sweep. **String `Start` is 1-based**: with
  `0` the compiler answers `RxCMP_E_AUDIT_OUTOFRANGE`, and all four positioning instructions failed until the probe used
  `1` - a trap worth knowing, because `0` is the natural first guess. And `STOD`/`DTOS` were declared in the compact table
  with both slots numeric (`SD`), so the composer refused `STOD(s1,d1)` outright; they are now declared explicitly as
  `STOD(Source: STRING, Dest: NUMBER)` and `DTOS(Source: NUMBER, Dest: STRING)`. Separately, `BTD` was **already** five
  slots (`Source`, `Source bit`, `Dest`, `Dest bit`, `Length`) and a build of `BTD(d1,0,d2,0,8)` passes - my earlier
  four-operand probe was what was wrong, not the catalogue.

- **The bit family builds, and the skill now carries the two rules that cost probes to learn.** `AND`, `OR`, `XOR`, `NOT`,
  `BTD` and `MEQ` all build through our composer once the rung **ends in an output** -
  `XIC(a1)AND(d1,d2,d3)OTE(a2)` and its siblings passed in one project with **0 warnings and 0 errors**. They are
  input-type instructions, and ending a rung on one answers `AUDIT_OUTPUTS`. That, and the previous round's 1-based string
  `Start` (`MID(s,5,1,d)` builds, `0` fails with `OUTOFRANGE`), are now in `SKILL.md`, whose body grew from 5545 to 5863
  characters and still has 2137 of headroom. One finding stays **open** rather than becoming a rule: a subroutine whose
  first rung is a bare `SBR();` made a build fail with `AUDIT_OUTPUTS`, and removing that rung made the identical project
  pass - yet our own composer emits `SBR();` and a test pins it. One data point is not a rule, so it is recorded as a
  question to settle with a dedicated probe rather than encoded on a guess.

- **A rung whose only instruction is `SBR()` is now refused, because a build proves Studio will not take it.** The previous
  round left that observation open with one data point; this round settled it with five subroutine shapes. `SBR();` alone
  does not merely fail to compile - the SDK itself reports `LgxSrv_E_FATAL_ERROR` - and `SBR();` followed by `RET();`
  answers `AUDIT_OUTPUTS`, because **SBR does not drive the right power rail**. `RET();` alone builds, so the header is
  the problem, not the return. The composer emitted `SBR();` and a test pinned it, so a caller following our own catalogue
  would have produced a routine Studio cannot import; `compose_rung` now refuses it with the failure modes named and two
  ways forward (write the body without a header rung, or declare parameters). `SKILL.md` carries the rule too, and the
  test that pinned the old behavior now asserts the refusal. This is the tenth defect found by building rather than
  reasoning, and the first in program control.

- **`JSR` takes a return-parameter slot, and the ground truth came from a production export.** Our catalogue allowed
  `JSR(Routine)` alone, and Studio refuses it with `RxCMP_E_AUDIT_INVALIDNOOFOPS` even against a clean subroutine that
  contains only `RET();`. A production project answers the question in one line - it writes `JSR(A01_Inputs,0)` - so the
  instruction is `JSR(Routine Name, Return Par)`, the second operand being `0` when the routine returns nothing.
  Corrected in the catalogue, and **verified by build**: `XIC(a1)JSR(Sub,0)` composed through our tools and built with
  **0 warnings and 0 errors**. Input parameters are not modelled (they sit before the return parameter and would need the
  subroutine's own `SBR` declaration, which a build shows Studio will not accept as a bare rung), so the composer refuses
  a third operand rather than guessing. `SKILL.md` carries the rule; the variadic test that assumed free-form parameters
  is replaced by the two behaviours a build proves.

- **`MSG`, `COP` and `FLL` are build-verified, and the retry rule is now written down.** One project, three rungs, taken
  from the shapes a production export actually uses: `XIC(a1)ONS(ons)MSG(msg)` where `msg` is a `MESSAGE` tag - the real
  project gates its messages exactly that way - plus `COP(arr[0],arr2[0],5)` and `FLL(0,arr2[0],5)`. All three passed with
  **0 warnings and 0 errors**. A second finding came out of the first attempt: it died with `Server execution failed`
  before import, and the identical script **passed on retry**, which means that message is transient and a single retry is
  the right response rather than a diagnosis. Both facts are in `SKILL.md` now (body 6574 of 8000). `FAL` and `FSC` stay
  **unverified**: their six-slot shape parses but the compiler answers `RxCMP_E_AUDIT_OUTOFRANGE` at mode 0, and dropping
  the destination slot answers `INVALIDOPKIND`, so the next probe needs mode 1-3 and a `ctl.POS` position rather than my
  guesses.

- **`FAL` and `FSC` now carry the operand order the vendor help publishes, but they are help-verified, not build-verified,
  and the round says so.** The help's ladder tables list `Control, Length, Position, Mode, Expression, Destination` for
  `FAL` and the same without `Destination` for `FSC`; our catalogue had `Destination` **before** `Expression`, which is a
  swap no passing build had ever caught. `Mode` is also a **number from 1** - `0` produces
  `RxCMP_E_AUDIT_OUTOFRANGE`, and the `ALL`/`INC` in the help are dialog choices, not rung text, which a probe confirmed
  when the composer emitted `ALL` and Studio rejected the kind. Four build attempts at the corrected shapes still end in
  `RxCMP_E_AUDIT_INVALIDOPKIND`, so something else in my rung is wrong: the next probes are a **bare tag** destination
  instead of an element, an expression that references `ctl.POS`, and `Length`/`Position` written as `ctl.LEN`/`ctl.POS`
  given the help calls them pseudo-operands. Shipping an order change that agrees with the vendor documentation while the
  build is still red is a deliberate, stated risk - the alternative is keeping an order the documentation contradicts.

- **`FAL` and `FSC` are now refused instead of guessed.** Eight shapes were tried against a real build - destination as an
  element and as a bare tag, `ctl.POS` in the expression, `ctl.LEN`/`ctl.POS` for length and position, and mode `0`, `1`
  and `ALL` - and every one answered `RxCMP_E_AUDIT_INVALIDOPKIND` or crashed the compiler outright
  (`LgxSrv_E_UNHANDLED_EXCEPTION`). A catalogue entry that emits rungs Studio rejects is worse than one that admits it
  does not know, so both are marked **not modelled**: `list_instructions` still names them, and `compose_rung` answers
  `INSTRUCTION_NOT_MODELLED` with the history in the message instead of a plausible-looking rung. That also reverts the
  order change from the previous round, which was help-verified but never build-verified - right to try, wrong to keep
  once eight probes failed. The test that composed a `FAL` rung now asserts the refusal, and `SKILL.md` says to write
  these two by hand until a real export shows the accepted form.

- **`run_checks` now catches the `JSR` a build proved wrong.** Round 40 established that `JSR(Sub)` is refused with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS` and `JSR(Sub,0)` builds, and the composer enforces it - but an export that **already
  contains** the broken call had no finding. The new rule `JSR_WITHOUT_RETURN` reports it as **critical**, names the rung,
  and puts the fix in the message (`Write JSR(Sub,0) when the subroutine returns nothing`), so a reader does not have to
  know the rule name to act. Two tests pin it: `JSR(Sub)` is reported, `JSR(Sub,0)` is silent. The `run_checks`
  description names the rule, so the tool reference regenerated. This is the difference between a composer that refuses to
  write a defect and a checker that finds one already in the file - the second is what an engineer needs when they open
  somebody else's project.

- **A `JSR` that names a routine the program does not declare is now a critical finding.** The composer already refuses to
  compose one, but a project that lost a routine - renamed, deleted, copied between programs - still carried the call, and
  nothing reported it. The new rule `JSR_ROUTINE_MISSING` walks each program's routines, resolves every `JSR(name, ...)`
  against the routines that program declares, and names the rung: ``P::R rung 1 calls JSR(Nope) and P declares no routine
  of that name``. It is **case-insensitive**, because Studio's routine lookups are, and it stays quiet for a call to a
  sibling routine - the test proves both in one project by calling a declared routine and an undeclared one from adjacent
  rungs. `run_checks` names the rule in its description, so the tool reference regenerated.

- **A real 10 MB production project is the best false-positive test we have, and it caught a usability defect.** Running
  `run_checks` against a live plant export - 23 programs, 2651 tags, 257 routines - produced **zero findings** from
  `JSR_ROUTINE_MISSING`, `JSR_WITHOUT_RETURN`, `RUNG_NO_OUTPUT` and `SBR_NOT_FIRST`, which is the validation those rules
  needed. It also produced **701 findings**, and the unfiltered page returned **100 `UNUSED_TAG` rows before anything
  critical**: page order was generation order, so the findings that stop a build sat behind hundreds that do not.
  Findings are now ordered **critical, warning, info** before pagination, with generation order kept inside each rank so a
  re-run is stable. A test pins it on a project carrying both an undeclared `JSR` and an unused tag: the first row is the
  critical one. Summary counts were already by severity, so nothing else moved.

- **The production export's 701 findings break down as 0 critical, 14 warning, 687 info - and the summary now says so.** With
  the real distribution measured (23 programs, 2651 tags, 257 routines) the numbers are honest but the headline was not:
  `run_checks` said "701 findings" and left a caller to discover the split by paging. The message now reads
  `701 findings in Seco_Homogenizer (0 critical, 14 warning, 687 info), ordered by severity.` That is the difference between
  a number and a verdict - a project with zero criticals can ship, and a caller can see that without opening anything.
  Two catalogue observations came out of the same run: the only uncatalogued mnemonics on this real project are `DCM`
  (62 rungs), `CROUT` (7), `DCS` (4), `CABLE` (2) and `AOI56MCM` (1), and **none of them is an AOI defined in the export**,
  so `DCM`/`DCS`/`CROUT` are a genuine motion-catalogue gap to close next; the 8 `UNRESOLVED_REFERENCE` rows sit in a
  program that really is named `RECIPE`, so they are likely legitimate rather than resolver noise.

- **The biggest catalogue gap on real code is closed: `DCM`, `DCS` and `CROUT` are now catalogued.** Round 49's production run
  named them as the only uncatalogued mnemonics with real usage - `DCM` on **62 rungs**, `CROUT` on 7, `DCS` on 4 - and they
  were not AOIs, so they were a true gap rather than a false alarm. The vendor help supplies names (Dual Channel Input
  Monitor, Dual Channel Input Stop, Configurable Redundant Output) and the production rungs supply the **operand counts**:
  eight, ten and nine. They are marked **not modelled**, because their safety-function and input-type operands are
  drop-down names rather than tags and the composer would otherwise emit something Studio rejects - the same judgement as
  `FAL`/`FSC`. Re-running the checks on that export now reports **two** uncatalogued instructions, `CABLE` (2 rungs) and
  `AOI56MCM` (1), with neither defined in the export, so they stay honestly unlabelled. Two tests had used `CROUT` as their
  "instruction the catalogue does not carry" example; they now use a fictional `FROB`, so the behaviour they pin is real
  rather than accidental.

- **The eight unresolved references on the production export were string literals, not tags - a parser bug, now fixed.** The
  evidence made it plain: `MOVE('C',Edit_Practice_String)` inside a recipe selector, once per letter. The token scanner ran
  over the raw operand text, so every character inside a single-quoted literal became a candidate symbol, and the resolver
  dutifully reported `RECIPE::C`, `RECIPE::E` and six more as undeclared. `tokens()` now **masks string literals** before
  matching (replacing each with spaces so indices stay aligned), handles the doubled-quote escape a literal can contain
  (`'O''Brien'`), and the same production export now reports **zero** unresolved references instead of eight. A regression
  test pins it with a rung that moves three literals, one of them escaped. This is the same class as the radix-literal bug
  the file already documents - a literal wearing a tag's shape - and it is the reason the rule's confidence was `low` on
  real code: the scanner was guessing at letters.

- **Two false `MULTIPLE_OUTPUT_WRITES` findings were the AOI pattern, not a defect.** On the production export the rule named
  output parameters written from `Logic`, `EnableInFalse` and `Prescan` - which is exactly how an Add-On Instruction forces
  its outputs when the instruction is disabled or scanned. Writing an AOI output in those preset routines is documented
  practice, so the rule now **exempts them** and counts only the ordinary routines: `MULTIPLE_OUTPUT_WRITES` fell from 6 to
  4 on that project and total warnings from 14 to 12. The remaining four are real multiple writers, all inside `Logic`.
  Two tests pin both directions - a routine set of `Logic`/`EnableInFalse`/`Prescan` produces nothing, while `Logic`/`Other`
  produces the finding with the tag named - so the exemption cannot swallow a genuine defect.

- **Protected AOIs were being reported as uncatalogued instructions, and fixing it took two production projects to zero.** A vendor
  Add-On Instruction ships as `<EncodedData EncodedType="AddOnInstructionDefinition" Name="...">`, not as a plain
  `<AddOnInstructionDefinition>` element, and the loader only collected the plain form. The consequence was a false positive
  on exactly the libraries real plants buy: on the Carpenter project **all seven** uncatalogued mnemonics (`MAM_YASKAWA`,
  `MCFG_YASKAWA`, `MAFR_YASKAWA` and siblings) were protected AOIs, and on the Seco project `AOI56MCM` - a ProSoft AOI with a
  full encoded definition - was one too. `aoiElements` now collects both forms, and the two projects report **zero** and
  **one** (`CABLE`, still undefined) respectively. This also corrects round 50's claim that `AOI56MCM` was not defined in
  the export: it was, as encoded data, and my grep pattern was the thing that was wrong.

- **The last known false-positive class is gone: writes inside an AOI body are not call-site writers.** An Add-On Instruction's
  own `Logic` writes its output parameters as often as its algorithm needs, and the rule counted those as multiple drivers.
  It now keys the exclusion on `document.aois[].routines` rather than on a routine name, so an AOI called `Level` is exempt
  while a program routine called `Level` is not. The effect on the two production projects is decisive: `Seco` went from
  701 to **687** findings with warnings **12 → 8**, and `Carpenter` from 271 to **262** with warnings **9 → 1**;
  `MULTIPLE_OUTPUT_WRITES` is **zero on both**. What remains is seven `DUPLICATE_OUTPUT` rows on Seco and one on Carpenter -
  an output driven from two rungs in one routine, which is legal but worth a reader's attention - plus one
  `LATCH_WITHOUT_RESET`. A test pins the AOI case with three branches writing one output parameter.

- **A one-shot's storage bit is read/write, and the reference tools now say so.** On the production export,
  `find_references System_ONS` returned ten references with **every one classified `unknown`**, because `ONS`, `OSF` and
  `OSR` were missing from `READ_WRITE_OPS` even though the instruction writes the storage bit it reads. After the fix the
  same query returns **0 read, 10 write, 0 unknown** across four routines. Two smaller things came out of the probe: the
  matcher now also resolves a base tag against its **subscript and member** forms (`Flags` finds `Flags[2].3`), which the
  dot-only pattern missed, and two of my own readings were wrong rather than the tools - `find_references` reports `total`,
  not `matches`, and `usage_map` had already been naming the other scope since round 19. Both corrections are in the record
  because a defect claim that turns out to be a field-name mistake is the same class of error as a wrong operand order.

- **The built artifact is now tested, not just the source.** Every test in this package imports TypeScript through `tsx`, which proves
  the code we write - not the code the app ships. A new `dist-smoke.spec.mjs` imports the compiled `lib/` directly and checks
  three things a user would notice if the build dropped them: `DCM`/`DCS`/`CROUT` are catalogued with **8/10/9** operands,
  `spellingForProject('MOV', new Set(), '37')` returns **`MOVE`** while a v19 project still gets `MOV`, and `rungFindings`
  still raises **`JSR_WITHOUT_RETURN`** for `JSR(Sub)`. It skips cleanly when `lib/` is absent, so a fresh clone stays green,
  and all three pass against the build produced this cycle. This closes the gap between "the source is right" and "the artifact
  is right" - the live app still bundles an older copy (round 57), but what we can build is now proven to carry every fix.

- **Correcting my own commit: the dist smoke test must not be named `.spec.mjs`.** The previous commit landed with `vitest` red,
  because `**/*.spec.mjs` is inside the vitest include pattern and the file uses `node:test` - the suite failed to load while
  the 388 real tests still passed, which is exactly the shape of failure that a careless `git commit` hides. It is renamed to
  `dist-smoke.mjs`, which vitest ignores and the explicit bundle command still runs. `vitest` is green again and the three dist
  checks pass. Recording it in the changelog rather than amending, because the rule that produced it - never commit with a red
  gate - is worth more than a tidy history.

- **One project, three languages, all composed by our tools and built by Studio: RLL, FBD and SFC.** The attempt found two defects
  before it succeeded. `draft_tag` could not create an **`FBD_MATH`** instance at all - the built-in structure list carried
  only `CONTROL`, `SERIAL_PORT_CONTROL` and the two alarm structures - so nobody could compose a function block in a project
  that did not already have one. And once that was fixed, `draft_fbd` still refused the block, because `withStagedTags`
  publishes staged declarations on `project.stagedTags` while the block lookup read `document.tags` only; `ladder.ts` had
  been consulting both for rounds, and this path had not. Both fixed, and the project now composes `draft_tag FBD_MATH` ->
  `draft_routine` FBD -> `draft_fbd` (ADD wired to three tags) -> `draft_routine` SFC -> `draft_sfc` (two steps, two
  transitions) alongside an RLL rung, then builds with **0 warnings, 0 errors and an ACD written**.

- **My bundle gate has been running the wrong directory, and the repo already had the right command.** The 70-test suite lives at
  the **repo root** `test/`, not under `packages/l5x/test`; when rounds 58 and 59 ran the hand-written file list with the working
  directory set to the package, `node --test` found only the three-test dist file and exited 0. So two commits were gated by a
  suite that never ran, and I would not have noticed without a "file not found" from an unrelated probe. The fix is not a better
  memory: `pnpm test` at the root already named the suite, and it also covers `packages/ftview-viewer` which my hand-written list
  omitted entirely. `packages/l5x/test/dist-smoke.mjs` is now wired into that script, and a root run reports **90 tests, 90 pass,
  0 fail**. The lesson is the same one as the fixtures: a gate you invoke by hand from the wrong place is not a gate.

- **`compare_projects` now names the fields that differ, and the safety/non-safety diff shows why it matters.** On the two real
  Carpenter exports the change record used to say only `module Local changed`, which sends a reader into the XML by hand. It now
  carries `changed_fields`, and the same diff reads: **`catalogNumber 5069-L320ERMS2 to 5069-L320ER`**, `minor 13 to 11`,
  `ports ...`, `parentPortId 3 to 2` on three modules. That is the whole difference between a safety and a standard build in one
  line per component, and it comes from the same `changedFields` helper that `run_checks` has used since the I/O-change rule was
  written - the compare path simply never called it. A test pins it on two exports whose only difference is a tag description.
  The pair also gave a clean third production project: **0 critical, 1 warning, 262 info**, no uncatalogued instructions.

- **Three more production exports exposed a false claim and two overconfident rules.** The corpus is now six real projects, and
  the new three each failed a different way. `Seco_Cooler` lists **11 programs and zero routine bodies** - a partial export -
  and we reported `MAIN_ROUTINE_MISSING` for every one of them, blaming the project for what the export never carried; the
  rule now stays silent when the export has no routines at all. `GrosfillexLine1` produced **64 `LATCH_WITHOUT_RESET`
  warnings** on a 118-tag project including `always_on`, and `GrosfillexLine3` produced **65 `MULTIPLE_OUTPUT_WRITES`** on
  module output words driven from two rungs - both legal patterns whose reset or intent can live in an HMI write or another
  controller that no export shows. Both rules are now **`info`**, with the limit stated in the message ("an HMI write, a
  produced tag or another controller can still clear it"; "two rungs may drive one word by design, so read the rungs before
  changing either"). After the change those three projects report **0 critical and 0 warnings**, and the whole corpus reports
  no build-fatal finding at all - which is what a set of compiling projects should look like.

- **`Seco_Cooler` was not a partial export at all - it is source-protected, and we were calling that "0 routines".** The file carries
  **144 `<EncodedData EncodedType="Routine">`** elements: the logic exists and is encrypted, so the project is complete and the
  bodies are simply unreadable. `open_project` now says so exactly:
  `Seco_Cooler: 11 programs, 1266 tags, 0 routines (144 source-protected, bodies not readable)`, and the payload carries
  `protected_routines` so a caller can branch on it instead of parsing prose. That distinction matters: round 61's "partial
  export" reading was wrong about the cause, and an engineer told "0 routines" would think their export had failed rather than
  that a vendor protected the code. A test pins it with two encrypted routines.

- **`trace_dependencies` now adopts a unique declaring scope instead of making the caller retry.** On the production export,
  `trace_dependencies System_ONS` refused with `UNRESOLVED_SYMBOL` - "it is declared in SYSTEM" - while `find_references`
  happily searched every scope and returned 10 uses. The message was right and the behaviour was inconsistent: a tag that
  exactly one program declares is unambiguous, so the trace now resolves it and says
  `1 symbol and 0 edges upstream of System_ONS (declared in SYSTEM; scope adopted)`. An explicitly wrong scope still
  refuses and still names where the declaration lives, so the escape hatch did not get looser - it just stopped taxing the
  common case. The test that pinned the old refusal now asserts adoption plus a second case that an explicit bad scope is
  still an error.

- **`usage_map` now adopts a unique declaring scope, the same way `trace_dependencies` does.** Called as `usage_map {tag: "Std_Alarms"}`
  it used to answer `COMPONENT_NOT_FOUND` because the tag belongs to program `SYSTEM` - correct, and useless to a caller who never
  named a scope. It now resolves the declaration when exactly one program declares the name and says so:
  `Std_Alarms: 6 indexed elements used (declared in SYSTEM; scope adopted)`. An **explicit** scope that does not declare the tag
  still refuses with the scope named, so the escape hatch is unchanged; only the omitted-scope case got smarter. Two tests pin
  both sides. `resolve_tag` is the remaining tool with the same shape - it still answers "not in scope controller; declared in
  SYSTEM" when called without a scope - and it is next.

- **`resolve_tag` adopts a unique declaring scope, finishing the consistency pass across four read tools.** Called without a scope,
  `resolve_tag Std_Alarms` used to answer `resolved: false` with "declared in SYSTEM"; it now returns
  `Std_Alarms resolves to SYSTEM::Std_Alarms (INT) (declared in SYSTEM; scope adopted)`, and the same for a bit address
  (`SYSTEM::Std_Alarms[2].8 (BOOL)`). The payload carries `adopted_from`, so a caller that cares which scope answered can see it
  rather than infer it from prose. A name declared by **two** programs stays unresolved - ambiguity is still an error - and an
  explicit scope is still taken at its word. That completes the rule across `find_references` (which always searched every
  scope), `trace_dependencies`, `usage_map` and `resolve_tag`: the `scope` argument is an override, not a prerequisite.

- **Two FBD sheets in one routine build, closing a gap left open since the first FBD round.** `draft_fbd` was verified with one sheet
  only, and "multiple sheets per FBD routine" sat on the open list for forty rounds. Two sheets, one `ADD` block each, composed in
  one draft and built: **0 warnings, 0 errors, an ACD written**, and the applied export carries exactly two `<Sheet>` elements
  with both block tags. The block tag on the second sheet is a second `FBD_MATH` instance, so the path also proves that
  `draft_tag` can create more than one function-block instance in the same draft. A test pins the composed export, so the
  multi-sheet shape cannot regress silently the way the single-sheet shape once could.

- **`draft_sfc` now refuses a `Reset` action that nothing stores, and the round found a larger SFC regression it did not finish.**
  Studio answers `RxSFC_E_RESET_WITHOUT_STORED` for a Reset with no Stored action on the same operand; the composer now refuses
  it first and names the fix ("Add a Stored action on the same tag, or use NonStored instead"). Two things surfaced while
  bisecting qualifiers. First, `NonStored` and `Stored` charts that build in earlier rounds now fail with
  **`RxSFC_E_SPECIFIER_INVALID_TYPE`**, so something regressed after that evidence was captured. Second, the prime suspect is
  visible in the code: `sfcTagXml` emits **`SFC_ACTION` for transition tags** (`kind === 'step' ? 'SFC_STEP' : 'SFC_ACTION'`),
  while a transition is a boolean tag - the same file's own operation help says "a BOOL transition tag". My patch to change that
  did not land (anchor mismatch, then the build budget ran out), so it is **recorded, not claimed**: next round patches
  `sfcTagXml`, rebuilds the qualifier bisect, and either confirms the cause or reports the real one.

- **The SFC failure was a silent wrong-type reuse in my own fixtures, and the composer now refuses it.** `draft_sfc` guarded a chart
  element with `has(name)`, a case-insensitive name test, so an action called `A1` matched the fixture's existing **`a1` BOOL tag**,
  created nothing, and produced a chart whose operand had the wrong type - `RxSFC_E_SPECIFIER_INVALID_TYPE` from Studio, and three
  rounds of my blaming the SFC writer. The guard now checks the **type**: a step needs `SFC_STEP`, a transition `BOOL`, an action
  `SFC_ACTION`, and a mismatch raises `TYPE_MISMATCH` naming the tag, its declared type and the needed one. With a fresh name the
  same chart **builds: 0 warnings, 0 errors, an ACD written**, and the `SFC_ACTION` tag is created. Two tests pin both sides:
  the wrong-type name is refused with SFC_ACTION named, and a valid chart still composes. This is the sixth self-correction of
  the cycle, and the most expensive: the defect was in the probe, not the product.

- **Documentation now says when routine bodies are encrypted, in the bundle and in the summary.** `document_project` on the
  source-protected export reported "16 file(s) for 11 program(s), **0 routine(s), 0 rung(s)**" - a handover bundle that tells a
  maintenance engineer their project has no logic. It now reads `0 routine(s) plus 144 source-protected`, and `overview.md`
  carries a line of its own: "Source-protected routines: 144. Their bodies are encrypted in this export and were not
  documented." That is the third surface to get the same honesty after `open_project` and `run_checks` (rounds 61-62) - and
  the one where it matters most, because a documentation bundle is what a new engineer reads first.

- **`CABLE` was never an instruction: it was the word inside a safety-function name, and the mnemonic scan now skips operand lists.**
  The rung is `DCS(N_PULL_ROPE_DCS,CABLE (ROPE) PULL SWITCH,EQUIVALENT - ACTIVE HIGH,500,...)` - the DCS **Safety Function** operand
  legitimately contains parentheses and spaces, and the scanner matched `CABLE (` as a call. Three rounds carried it as "a gap we
  cannot close"; it was noise. `mnemonicsIn` now walks the text and **skips each instruction's argument list**, leaving the closing
  parenthesis in place so adjacent instructions like `XIC(A)OTE(B)` are still both found. The Seco export now reports **zero
  uncatalogued instructions**, and two tests pin both halves: adjacent instructions are found, and a safety-function name with
  parentheses yields only `DCS`. That also means the earlier `DCM`/`DCS`/`CROUT` count from round 50 included this false name, so
  the real production total was even smaller than reported.

- **A real edit in a 10 MB project produced exactly one change, and the diff named the rung and both texts.** Taking the production
  Seco export, replacing rung 2 of `TRAVEL/C07_Laser_Cooling` through `compose_rung`, applying it, and comparing the two files gave
  **1 change**: `rung: TRAVEL::C07_Laser_Cooling::2 changed`, with `changed_fields` holding the old branch rung and the new
  three-instruction rung side by side. That is the fidelity an engineer needs from a diff - not "the routine changed". Also
  verified on that project this round: `resolve_tag` on a deep member chain (`TC_FURN_GLOBAL.Scanner.NW.PV`), a bit address and
  an array element all resolve; `get_component kind "aoi"` returns an AOI with its routine and parameters; `trace_dependencies`
  and `find_references` both accept an `AOI::Member` symbol; and `document_project` filters to one program correctly (23 routines,
  1210 rungs). A test pins the one-rung diff so the fidelity cannot regress.

- **The safety inconsistency from round 73 is resolved: the guard is real, and it fires at validation.** On the actual Seco export,
  `draft_rung` against `MOTION_SAFETY/A04_Pull_Rope` **staged**, and `draft_validate` refused with
  `PROTECTED_TARGET: Safety programs cannot be changed`. That is the correct contract - staging is a draft, validation is the
  gate - and the earlier unit-test result was a mismatch between the two steps, not a missing guard. A test now pins the
  contract without caring which step refuses: `refusal = staged.error ?? validate.error` must be `PROTECTED_TARGET` naming
  safety, so the edit can never reach `draft_apply`. What remains is a UX nicety, not a safety gap: the refusal could come at
  staging time so a draft never holds an operation that cannot apply, which needs the guard's logic factored out of
  `change-set.ts` rather than duplicated.

- **A safety edit is now refused when it is staged, not when it is validated.** Round 74 established that the guard is real but fires
  late: `draft_rung` accepted a change to a safety program and `draft_validate` refused it, so a draft could hold an operation that
  could never apply. The model now records **`safety`** on programs (`Class="Safety"`) and on tasks, a helper resolves the set
  from all three signals the vendor uses (program class, a program literally named `safety`, a safety task that schedules it), and
  `draft_rung` and the composer path refuse at staging with
  `PROTECTED_TARGET: Program MOTION_SAFETY runs in a safety task, and safety logic cannot be changed.` Verified against the real
  Seco export, where the same call previously staged; the test now asserts the staging refusal and that no draft id is returned.

- **Every staging tool now refuses safety logic, and refuses before it complains about anything else.** Round 75 guarded `draft_rung`;
  this round funnels all nine program and scope selectors in the draft surface through one `safetyGuard`, so `draft_st`,
  `draft_tag`, `draft_routine`, `draft_sfc`, `draft_fbd` and the tag tools all answer
  `PROTECTED_TARGET: Program Safe runs in a safety task, and safety logic cannot be changed.` at staging. One ordering bug came
  out of the test: `draft_routine` validated its body first, so a safety program with no body answered `INVALID_ARGUMENT` and hid
  the reason; the guard now runs before body validation, because a caller editing safety logic should hear that rather than an
  argument complaint about a routine that cannot exist. The test covers three different tools in one safety project, so a future
  tool that bypasses the helper will show up as a failure rather than as a silent gap.

- **The composer was the one staging tool that still accepted safety logic, and an audit found it.** Round 76 said "every staging tool"
  guards safety; a deliberate audit of the tools that write through the draft store showed `compose_rung` **staged** a change to a
  safety program while `compose_batch`, `draft_rung_comment` and the others refused. The guard now runs in `compose_rung` after its
  argument checks, all three audit cases answer
  `PROTECTED_TARGET: Program Safe runs in a safety task, and safety logic cannot be changed.`, and the safety test covers
  `draft_rung`, `draft_st`, `draft_tag`, `draft_routine`, `compose_rung` and `compose_batch` in one project. The lesson is the
  round-76 claim itself: "every tool" is a claim about evidence, so it has to be tested by walking the tool list rather than
  inferred from the shared helper.

- **Vendor-owned data types are now refused at staging, the same way safety logic is.** The ACD-edit guard already treated any type whose
  `Family` is not `NoFamily` as vendor-owned, but that knowledge lived only in the raw XML, so `draft_udt_member` staged an edit to
  `STRING_1` and the caller learned at validation. The document now carries **`vendorTypes`** - the names only, so `udts` still lists
  the 166 user types and no count moves - and both `draft_udt_member` and `draft_udt_description` refuse at staging:
  `PROTECTED_TARGET: Data type STRING_1 is vendor-owned, and vendor types cannot be changed.` Verified against the real Seco
  export, where the same call previously staged; two tests pin the refusal and one confirms a user type still stages. This is
  round 77's audit lesson applied to the second protected class, and the reason it was cheap: the guard already existed, only
  its evidence was missing from the model.

- **A source-protected routine can no longer be edited, and the tool says why.** On `Seco_Cooler` - whose 144 routine bodies are
  encrypted - `draft_rung` **staged** a replacement for `BLOWERS/MainRoutine`, a routine the export carries only as an encrypted
  body; the change could never apply, and the old failure path would have described it as a missing routine. The document now
  carries **`protectedRoutines`** (program and name for every `EncodedData EncodedType="Routine"`), and staging refuses with
  `PROTECTED_TARGET: Routine MainRoutine in BLOWERS is source-protected in this export; its body cannot be read or changed.`
  Verified on that real export. One test pins the refusal. Still to fix, recorded rather than claimed: `get_component` on the same
  routine says "No routine named MainRoutine in this export", which is the misleading sentence this round removed from staging but
  not yet from the reader.

- **The reader now agrees with the editor about source-protected routines.** `get_component kind:"routine"` on the encrypted
  `BLOWERS/MainRoutine` in `Seco_Cooler` used to answer `COMPONENT_NOT_FOUND: No routine named "MainRoutine" in this export` -
  the same misleading sentence round 79 removed from staging. It now answers
  `PROTECTED_TARGET: Routine MainRoutine in BLOWERS is source-protected in this export; its body cannot be read.`, with the
  program named in the candidates so a caller can offer the choice. Verified on that real export, and the test that pins the
  staging refusal now asserts the reader's answer too, so the two surfaces cannot drift apart again.

- **`list_components` no longer reports a protected program as empty.** On `Seco_Cooler`, `list_components kind:"routine" scope:"BLOWERS"`
  answered **"0 routines"** for a program whose main routine exists as an encrypted body - the third surface to lie about the same
  object. It now lists the row with `type: "PROTECTED"` and a description saying the body is encrypted, and the summary counts them:
  **"22 routines, 22 source-protected"** for that program, and **"144 routines, 144 source-protected"** across the project, which
  matches the 144 `EncodedData` bodies exactly. A test pins the row and the count alongside the editor's refusal and the reader's
  message, so all three surfaces are checked in one place.

- **Vendor-owned types now get a consistent story from all three surfaces.** Round 78 stopped the editor from changing them; the reader
  still answered `COMPONENT_NOT_FOUND` for `STRING_1`, and the listing simply omitted the family. `get_component kind:"udt"` now
  answers `PROTECTED_TARGET: Data type STRING_1 is vendor-owned; this tool models user-defined types, not the built-in families.`,
  and `list_components kind:"udt"` reports **"166 udts, plus 7 vendor-owned not listed"** - the seven matching the seven
  `StringFamily` entries in the export. One test checks declaration, refusal, reader and listing together, so the four answers
  cannot drift. Vendor types are the second protected class to be made consistent; safety programs are legitimately readable, so
  their read surfaces needed no change.

- **The search tools now say what they could not search.** On the encrypted `Seco_Cooler` export, `search_logic` answered
  "**0 matches** for OTE in routine logic" and `find_references` answered "**0 references**" - clean-looking zeros over 144
  routine bodies that were never read. Both now append
  `144 source-protected routine(s) were not searched`, and the test that already covered the protected routine's editor,
  reader and listing asserts the two search answers as well. That is the last of the "silent absence" surfaces for a protected
  export: a zero now distinguishes *nothing matched* from *nothing could be read*.

- **The handover bundle now names the protected routines, not just counts them.** Round 70 made `document_project` say "plus 144
  source-protected"; an engineer still could not tell *which* code was vendor-owned. `PROJECT.md` now carries a
  **`## Source-protected routines`** table listing program and routine for every encrypted body (bounded at 200 rows with a
  remainder line), verified on `Seco_Cooler`, whose overview lists `BLOWERS/MainRoutine` and its 143 siblings. The test that
  pinned the count now asserts the table and a program/routine row, so the bundle's claim and its detail cannot drift. This is
  the difference between a warning and a work order: "144 bodies are encrypted" tells an engineer something is missing;
  a table tells them what to ask the vendor for.

- **`project_overview` - the first call anyone makes - now states the export's limits.** On `Seco_Cooler` it used to report controller,
  revision and counts, leaving a caller to discover later that 144 routine bodies are encrypted and the project has a safety task:
  `... Limits: 144 source-protected routine(s): bodies are encrypted and cannot be read; safety task(s) SafetyTask: safety logic
  cannot be edited.` The payload carries a `limits` array the same way. A caller who does not know an export is partly unreadable
  reads every later empty result as bad news about their own project; the fix is to say it once, first. The test asserts the
  summary and the payload field on an encrypted-routine project, alongside the editor, reader, listing and search answers.

- **The skill now lists every composer pattern with its exact argument names.** It named four of seven - `analog_scale`, `totalizer`
  and `run_hour_meter` were missing - and no arguments at all. Round 86 proved the cost: a `ton_delay` call was wrong three ways
  (`tag`/`seconds` instead of `timer`/`preset_ms`, and `enable` omitted) and came back `INVALID_ARGUMENT` after a round trip. The
  skill now carries `start_stop_latch` start/stop/run, `fault_latch` fault/reset/latched (two rungs), `ton_delay`
  enable/timer/preset_ms, `interlock` conditions+output, `analog_scale` source/destination/in_min/in_max/out_min/out_max,
  `totalizer` enable/rate/total and `run_hour_meter` run/timer/hours plus the optional preset_ms. Body 7126 of its 8000-character
  budget, 406 tests pass. Documentation a model reads before composing is a **product surface**; a missing argument name is a
  failed edit, not a cosmetic omission.

- **Fix-forward for `78ed8b5`, which I committed with a red bundle gate.** The package suite was green (406) and I read the bundle summary
  as green too; it was **89 of 90**. The failure was this repository's own documentation check: the skill may only cite names that are
  tools or that `components.json` allows, and `analog_scale` and `run_hour_meter` - now correctly named in the pattern list - were
  not in that allowlist. The allowlist now carries both, `pnpm test` is **90/90**, and `components.json` still parses. The rule I
  broke is mine and was written for exactly this: never commit with the bundle red. Reading a summary line is not reading the
  verdict; the gate must be checked exit-code first.

- **A pattern call that misses arguments now learns all of them in one refusal.** `requirePatternArgs` checks the full set before any value is
  read, for string arguments and numeric ones alike, so `ton_delay` with nothing answers
  `ton_delay needs enable, timer, preset_ms; missing: enable, timer, preset_ms.` and `analog_scale` missing only `out_max` names all six of
  its arguments and says which one is absent. That is the round-86 lesson made structural: a `ton_delay` call was wrong three ways and
  each attempt cost a round trip. Two tests pin the complete list for a string pair and a numeric set. 407 package tests.

- **A spec with three undefined tags now names all three in one refusal.** `compose_rung` stopped at the first unresolved operand, so a caller
  fixing typos learned them one round trip at a time: `No tag named "NoSuchOne"`. The scan that walks the spec uses the catalogue's own slot
  kinds, so only tag slots are checked and numbers, keywords, labels and expressions are left alone; the message is now
  `No tags named "NoSuchOne", "NoSuchTwo", "MissingOut" resolve in this export.` My first attempt ran that scan **before** composition and
  changed error precedence - four existing tests caught it, which is the tests doing their job - so the shipped version only **enriches a
  genuine `TAG_NOT_FOUND`** and every other refusal keeps its own code and message. 408 package tests.

- **SFC charts were invisible: they decoded to zero nodes, and the diff reported "0 changes" for a rewritten transition.** A real SFC export
  writes its steps, transitions and links **directly under `SFCContent`**, with no `<Sheet>` wrapper, but `decodeDiagram` only walked
  `<Sheet>` children - so every SFC routine read back empty and a chart edit could not be seen. It now treats unwrapped content as
  one sheet: the same fixture decodes 4 nodes (`Step`, `Transition`, `Line`, `DirectedLink`) and a changed condition produces
  `diagram P::R changed`. Two tests pin the decode and the diff. Found by asking the question round 93 left open - "SFC diff is
  fixture-tested only" was wrong: it was **not tested at all**, and the fixture lacked the wrapper real exports omit. Follow-up
  recorded: `changed_fields` prints diagram nodes as `[object Object]`, so the diff finds the change but not yet describes it.

- **An SFC or FBD change is now described by the element that changed, not `[object Object]`.** Round 94 made the diff see charts; the detail
  line still printed `nodes [object Object],[object Object]… to [object Object]…`. A diagram's node list is now compared as a set and only
  the difference is shown: the round-94 fixture reports `nodes +["Line A2"] -["Line A1"]` - the transition condition that appeared and the one
  that vanished, each rendered as `kind#id operand text`. Ordinary fields render compactly too, so a nested value no longer degenerates to
  `[object Object]`. The test that pinned the SFC diff now asserts both conditions by name. 410 package tests.

- **Produced and consumed tags now say so, and a consumed tag names the controller it comes from.** The tag model carried name, type, scope,
  radix, constant and external access - nothing about the network. The production exports are full of it: `Seco_Homogenizer` has 5
  produced and 83 consumed tags, `GrosfillexLine3` 1 and 1. `get_component` and `list_components` now report `tagType` (Base, Alias,
  Produced, Consumed), and for a consumed tag `consumerOf` and `remoteTag` from `ConsumeInfo`: the real `CCI_Nutro_dints` answers
  `"tagType":"Consumed","consumerOf":"CCI_Ethernet_Port_Controller"`. That is the fact an engineer needs before changing a tag that
  another controller is reading - previously the tool would have said nothing at all. Test covers a produced tag, a consumed tag and
  the listing row. 411 package tests.

- **An alias tag now names its target, and a produced tag its consumer count.** Round 96 added the network role; the record was still partial in two
  ways an engineer checks first. `L5xTag.aliasFor` carries `AliasFor` (so an alias row no longer looks like a tag of its own), and
  `produceCount` / `produceUnicast` carry `ProduceInfo`. Verified on the real `Seco_Homogenizer` produced tag: `tagType: "Produced",
  produceCount: 1, produceUnicast: true`, exposed by both `get_component` and the tag listing. The test covers an alias pointing at a
  base tag, a produced tag with two consumers and unicast permitted, and the listing row. 412 package tests. Follow-up: AOI
  `<Parameter TagType="Alias" AliasFor=...>` uses the same attribute, and the AOI model does not read it yet.

- **An AOI input parameter now names the tag array element it aliases.** The tag model learned `aliasFor` in round 97; the AOI parameter model
  did not, so the Carpenter safety permissive AOI looked self-contained. `L5xAoiParameter` now carries `tagType` and `aliasFor`, and the real
  export answers: **`AOI_PermCheck` has 32 aliased parameters**, `INP_Perm0` -> `Alias` -> `WRK_PermArray.0`, description "Permissive input 0
  (TRUE = OK)". That is the wiring an engineer must see before changing a permissive: the value comes from a tag array element, not from the
  instruction's own interface. Test covers the parameter record. 413 package tests.

- **A module recorded as faulted now says so; and the safety-signature question was answered by not inventing it.** `L5xModule.majorFault`
  carries `MajorFault="true"` - a static attribute in the export, exposed by `get_component` and the module listing. Verified on
  `Seco_Homogenizer`, where 1 of 20 modules records `majorFault: true`. The other candidate from round 98, **safety signature
  presence, turned out not to exist in the export**: the only `SafetySignature` text is inside rung logic
  (`GSV(Safety,,SafetySignatureExists,...)`), which is runtime state, so nothing was modelled and no false field ships. The test
  covers a faulted, inhibited module in both the reader and the listing. 414 package tests.

- **Unused-tag analysis is skipped when the logic is encrypted, and says why.** On `Seco_Cooler` - 1266 tags, 144 encrypted routine bodies, zero
  readable routines - `run_checks` reported 1277 findings, and the ones I sampled were all `UNUSED_TAG`: a tag used only inside an encrypted
  body has no readable reference, so "unused" was a guess dressed as a finding. The pass now runs only when at least one body is readable;
  otherwise the result carries **`skipped_readings`** with the rule and the reason, and the summary appends "1 reading(s) skipped". Verified on
  that export: the findings page now contains no `UNUSED_TAG` at all, only `UNDOCUMENTED_PROGRAM`. Two tests pin both sides - skipped on an
  encrypted routine, still reported on readable logic - so the guard cannot quietly suppress a real finding. 416 package tests.

- **A routine diagram's second page no longer overwrites the first, and the default path now actually writes an image.** `l5x_routine_diagram`
  on the real `TRAVEL/B01_Alarms` said *"No PNG diagram: the workspace path `.l5x-preview/TRAVEL-B01_Alarms.svg` is not absolute, so no image
  was written"* - and even when a rasteriser ran, page 2 reused page 1's filename, so stepping through a 60-rung routine kept one file.
  The resolved path is now absolutised and a paginated page carries its rung range: the same call produces
  `TRAVEL-B01_Alarms-r0-4.png` and `TRAVEL-B01_Alarms-r5-9.png`, with `start_rung` continuing correctly. A single-page draw keeps its old
  name. A test draws two pages of a six-rung routine and asserts the distinct absolute paths. 417 package tests. Found by testing the two
  paths round 93 listed as untested: `rungs_per_file` was fine; the diagram was not.

- **A paged project diagram no longer overwrites the previous page.** Round 103 made `l5x_diagram` write an absolute file, but every page still used
  `l5x-diagram.png`, so paging a 60-rung routine kept one image. A page beyond the first now carries its range: verified against the source,
  page 1 writes `l5x-diagram-r1-4.png` and page 2 `l5x-diagram-r5-8.png`, with `next_start` continuing. A whole-diagram draw keeps the plain
  name, and a test draws two pages and asserts distinct paths. One thing this round proved again: the **live MCP session runs an older build**,
  so my first two real calls returned the old single filename - the fix is verified through the plugin source, not through the running app.
  418 package tests.

- **The task listing says which task is a safety task.** The model learned `safety` from `Class="Safety"` in round 75 and `project_overview`
  warns about safety tasks, but `list_components kind:"task"` showed only type, rate and programs - so a reader scanning the tasks could not
  see that `SafetyTask` is safety without inferring it from the name. Rows now carry `safety: true|false`; verified on `Seco_Homogenizer`,
  where `SafetyTask` reports true and the three standard tasks false, and a test pins reader and listing together. 419 package tests.

- **The program listing says which program is a safety program.** Round 106 fixed the task row; the program row had the same omission - `get_component` returned
  the declared `safety` flag, but `list_components kind:"program"` showed only name, main routine and description, so the two guard programs looked ordinary
  in the list an engineer scans first. Rows now carry `safety: true|false`; verified on `Seco_Homogenizer`, where the list names
  **`COMBUSTION_SAFETY` and `MOTION_SAFETY`** - exactly the programs `SafetyTask` schedules - and the other 21 report false. A test pins the reader and the
  listing for one declared safety program and one standard program. 420 package tests.

- **Safety I/O modules and safety AOIs are now visible.** The export declares `SafetyEnabled="true"` with a `SafetyNetwork` on the one and `Class="Safety"`
  on the other; neither was modelled, so a GuardLogix guard module looked like ordinary I/O and a certified safety instruction looked like any
  AOI. `L5xModule` now carries `safetyEnabled` and `safetyNetwork`, `L5xAoiInfo` carries `safety`, and both listings show them. Verified on
  `Seco_Homogenizer`: **10 safety modules** (starting `SA_DIG_IN_1`) and **2 safety AOIs** (`FC_SFTY_BURNER_DIRECT`, `FC_SFTY_SSOV`), with
  standard modules and AOIs reporting false. A test covers the safety and standard case for each. 421 package tests.

- **The controller record now carries the saved route and project serial number.** `CommPath` and `ProjectSN` were in every production export and read by nothing, so
  `project_overview` could describe a controller without saying how the project reaches it - the first thing a live operation needs and the last thing an
  engineer wants to discover from a failure. `L5xControllerSummary` now exposes `commPath` and `projectSerialNumber`; verified on `Seco_Homogenizer`, which
  reports `CIM_Prep\10.211.100.100\Backplane\0` and `16#0163_1759`, and a test pins both through `project_overview`. 422 package tests.

- **The handover document states the project serial and the saved route.** Round 109 put `projectSerialNumber` and `commPath` on the controller record;
  `PROJECT.md` still listed only processor, revision and export kind. It now carries
  `- Project serial: ...; saved path: ...`, with `not declared` when the export omits them, so a new engineer holding the bundle knows which
  project it is and how the machine is reached without opening the L5X. My attempt to pin this with a new fixture produced a transform error twice
  and I restored `documentation.spec.ts` from HEAD rather than leave a broken spec; the line is exercised by the existing bundle tests but **not
  asserted for these two fields**, which is recorded as the gap.

- **The missing assertion from round 110 now exists.** Last round shipped the `PROJECT.md` line reading `Project serial: ...; saved path: ...` without a test that
  asserts it - I had broken the spec twice with scripted insertions and restored it from HEAD. This round added the assertion with the `edit` tool on a
  controller declaring `CommPath` and `ProjectSN`, and it passes: the bundle contains `Project serial: 16#0163_1759` and
  `saved path: CIM_Prep/10.211.100.100/Backplane/0`. 423 package tests. The lesson is mechanical: **edit test files with an editor, not with a template
  literal in a patch script** - three attempts across two rounds, and only the editor worked first time.

- **`find_references` now answers "who writes this?" for a networked tag.** The reference summary said `14 read, 0 write` for a consumed tag - true of the
  export and misleading about the machine: the writer is the producer controller, which the model has known since round 96. The summary now appends
  `Consumed tag: written by CCI_Ethernet_Port_Controller as CCI_Nutro_dints`, or `Produced tag: N consumer(s) declared`. Verified on
  `GrosfillexLine3`, where the consumed tag reads 14 references with zero local writes. A test covers both directions on a fixture with one consumed
  and one produced tag. 424 package tests - and the test was added with the `edit` tool, per round 111's rule.

- **`trace_dependencies` says when a value comes from the network.** Tracing a consumed tag upstream answered `1 symbol and 0 edges` - which reads as "nothing
  feeds this" when the feed is a producer controller that the export names. The summary now appends
  `Value arrives from CCI_Ethernet_Port_Controller as CCI_Nutro_dints; no upstream logic in this export.`, and a produced tag traced downstream says
  `Value leaves to 2 consumer(s); no downstream logic in this export.` Verified on `GrosfillexLine3`; the test that covered `find_references` for these tags
  now asserts both trace directions too. 424 package tests.

- **`compare_projects` now reports a controller-level change.** Two exports with **different processor types and different saved routes** compared as
  **"0 changes"**: the diff walked programs, tasks, tags, UDTs, AOIs, modules, alarms, routines, rungs, ST and diagrams, but never the controller
  record itself, so a firmware change or a new CommPath was invisible. It now emits a `controller` change, and `changed_fields` names the fields:
  `processorType 1756-L81ES to 1756-L82ES`, `commPath CIM_Prep/10.211.100.100/Backplane/0 to .../101/...`. That is the first thing a release
  review should see, and it was the one thing the comparison could not. A test pins it. 424 package tests.

- **The diff's deep coverage is now pinned: module revision, AOI parameter type and tag radix.** Probing showed `compare_projects` reports a module `minor 11 to 12`,
  an AOI parameter `parameters [...] BOOL ... to DINT`, and a tag `radix Float to Decimal` plus `constant undefined to true` - coverage that existed and was held by
  nothing. One test now changes all three in one fixture and asserts each line. My first version of the test asserted a string the test itself never built
  (`aoi AOI_X changed`), so it failed for my reason, not the product's - found by printing the map rather than guessing. 425 package tests.

- **The handover bundle now has a Safety section.** A new engineer receiving `PROJECT.md` could not tell which task, programs, I/O or instructions were safety - the
  bundle named the protected routines and the processor, and stopped there. It now carries a table built from the declared facts:
  `Safety task | SafetyTask`, `Safety program | COMBUSTION_SAFETY, MOTION_SAFETY`, `Safety I/O module | 10: SA_DIG_IN_1, …`,
  `Safety AOI | FC_SFTY_BURNER_DIRECT, FC_SFTY_SSOV` - verified on `Seco_Homogenizer`, and a test pins every row. 426 package tests.

- **New rule: a safety instruction called from standard logic.** `run_checks` now reports `SAFETY_INSTRUCTION_OUTSIDE_SAFETY_PROGRAM` when an AOI declared
  `Class="Safety"` is called from a program that is not safety-scheduled - the certified instruction sits where no safety task scans it. It is a
  warning, with evidence naming program, routine, rung and instruction. The rule was written only after scanning the corpus: **Seco_Homogenizer has 2
  safety AOIs and 0 calls outside its safety programs**, so it produces no noise on real projects, and the test covers both a violating standard program
  and a compliant safety program (1 finding, never 2). 428 package tests.

- **Two more safety rules, both corpus-silent.** `SAFETY_PROGRAM_NOT_IN_SAFETY_TASK` reports a program declared `Class="Safety"` that no task schedules, or
  that a standard task schedules - at run time it is not a safety program. `SAFETY_MODULE_WITHOUT_SAFETY_NETWORK` reports a module with
  `SafetyEnabled="true"` and no `SafetyNetwork`, whose connection cannot be verified. Scanning first showed the corpus needs neither:
  `Seco_Homogenizer` has 2 safety programs both scheduled by `SafetyTask` and 10 safety modules all with a network, `Seco_Cooler` 1 and 6 - and both rules
  return **0 findings** there after implementation. The test covers one violating and one compliant case for each. 429 package tests.

- **Safety findings now say what to do, not only what is wrong.** Each of the three rules ends with the action: *call it from a routine scheduled by a safety
  task, or remove it* / *move it to a safety task or clear its safety class* / *set its SafetyNetwork in Studio before download*. The test that covered the
  violations now asserts the action text too, so a finding cannot silently lose its remedy. The first patch script missed an anchor and applied nothing -
  caught because the script writes only at the end - so the corrected anchors were taken from the file rather than reconstructed. 429 package tests.

- **An AOI's own routines are now listable and readable by name.** Every AOI carries routines - `FC_SFTY_SSOV` has **`EnableInFalse`, `Logic` and `Prescan`** - but
  `list_components kind:"routine"` returned zero for an AOI scope and `get_component` answered `COMPONENT_NOT_FOUND`, so the only way to reach them was to read
  the whole AOI and pick from its array. Both tools now resolve a scope that names an AOI: the real call returns `3 routines` and reads `Logic`. A test covers
  an AOI with a Logic and a Prescan routine. 430 package tests.

- **The handover bundle lists the add-on instructions.** `PROJECT.md` described programs and routines and said nothing about the 25 AOIs in `Seco_Homogenizer` -
  the definitions where much of the project's behaviour lives. It now carries an Add-On Instructions table: name, revision, safety flag, parameter count,
  routine count, description - verified on the real export (`FC_Adj_Ratio_SP` 11 parameters 1 routine, and so on), with a test asserting the section and a row.
  The AOI routine count is the fact round 120 made reachable; this round puts it in the handover. 430 package tests.

- **A user-type member change is reported with its member description.** Probing `compare_projects` on two exports differing only in one UDT member's description showed it is
  already detected: `udt changed ["members [... "first description"] to [... "second description"]]`. That last row of the diff-coverage ledger is now pinned by a test, so
  the whole table - controller, module revision, AOI parameter, tag radix/constant, UDT member, rung, ST, FBD and SFC diagrams - is held by tests. Alarms were also
  probed: every production export parses zero alarm declarations, so alarm comparison cannot be exercised from the corpus and remains fixture-covered. 431 package tests.

- **An AOI's logic now appears in the handover bundle.** The bundle documented program rungs and, since round 121, listed AOIs with their routine counts - but never
  rendered the routines themselves, so `FC_SFTY_SSOV`'s `EnableInFalse` (whose rungs comment "SAFETY SHUT OFF VALVE / CONTROL / On Enable False Scan")
  was invisible. A rung request now also writes one file per AOI with RLL routines: `rungs/AOI-FC_SFTY_SSOV.md` documents the routines, comments, NeutralText,
  instructions and tags, verified on the real export. The test pins the section, rung and comment. 431 package tests.

- **The bundle's counts now include the AOI routines it writes.** Round 125 documented AOI logic, but the summary still said "257 routine(s)" for a project that also
  carries 29 AOI routines - `document_project` wrote files the count did not mention. `counts.aoiRoutines` now reports them and the summary reads
  **"257 routine(s) and 29 AOI routine(s)"** on the real export, with the PROJECT.md counts line naming them too. A test asserts the count and the summary
  sentence for an AOI with one routine. 432 package tests.

- **The skill now names the behaviours the last rounds added.** It told a reader to open the project and read, but not that `project_overview` states the
  export's limits first; it listed the check families but not the three safety rules; it described `compare_projects` without saying a controller-level
  change is reported; and it described the bundle without the Safety and Add-On Instruction tables or the `rungs/AOI-<name>.md` files. All four are now
  in the skill, body 7648 of 8000 characters. A skill that omits a capability is a capability the assistant will not use. 432 package tests.

- **Three tool descriptions now name behaviour they had grown.** `compare_projects` said it compared programs, tasks, tags and so on - the controller it now compares was
  absent from the sentence a model reads; `project_overview` did not mention the limits list; `document_project` did not mention the Safety and Add-On Instruction
  tables, the per-AOI routine files, or that counts separate program and AOI routines. All three updated and `docs/reference/tools.md` regenerated, so the public
  reference matches the product. My first patch dropped the trailing comma and broke the file; `tsc` caught it before any test ran. 432 package tests.

- **AOI internal logic is confirmed to be in the reference scan.** Asking whether `run_checks` ever looks inside an add-on instruction, a fixture whose AOI `Logic` routine reads an
  undeclared tag answered yes: one `UNRESOLVED_REFERENCE` naming `NoSuchTag` with evidence `scope: AOI_Bad, routine: Logic, rung: 0`, and `find_references` returns the same
  occurrence. That coverage existed and was held by no test; it is now pinned, including the scope and rung evidence. 433 package tests.

- **An AOI parameter resolves as a symbol, both ways.** Following round 129, the next question was whether an add-on instruction's own parameters and local tags are reachable
  in the reference graph. On the real `FC_SFTY_SSOV` (19 parameters, 8 locals), `EnableIn` answers **2 references** plainly with the AOI as scope and the same count
  qualified as `FC_SFTY_SSOV::EnableIn`, and `trace_dependencies` resolves it. The resolution worked and was held by no test; one now pins plain, qualified and trace
  on a fixture whose AOI Logic reads and writes its own parameter. 434 package tests.

- **`usage_map` now explains an AOI member instead of calling it missing.** Probing the tools that reach inside an add-on instruction: `search_logic` finds AOI logic
  (matching `AOI::AOI_P Logic 0`), `find_references` and `trace_dependencies` resolve an AOI parameter - but `usage_map` answered `COMPONENT_NOT_FOUND` for a
  parameter that plainly exists. It now refuses with `INVALID_ARGUMENT: P is a member of add-on instruction AOI_P; usage_map maps declared tags, not AOI internals.`
  and points at `find_references` with `AOI_P::P`. The tool that cannot do the job now says so and names the tool that can. 434 package tests.

- **A fixture builder, because the same typo cost three rounds.** Hand-written fixture XML closed `AddOnInstructionDefinitions` with `</AddOnInstructions>` in rounds 125, 129 and
  131 - each time surfacing as a parse error or `NO_PROJECT` far from the mistake. `test/l5x-build.ts` now owns the envelope and element names (`l5x`, `tag`, `rllRoutine`,
  `program`, `task`, `aoi`, `parameter`, `module`), so a test supplies content only. A new spec builds an export with a safety AOI whose parameter aliases a tag, a safety
  module with a network and a normal module, opens it and asserts every part arrives - AOI safety, the alias target, the AOI's own Logic routine by the AOI name, and the
  safety module - which proves the builder emits what the readers expect. 435 package tests.

- **The I/O list marks safety modules and their safety network.** `io.md` and `io.csv` named module, catalog, slot, parent and inhibit - and said nothing about which
  channels belong to the safety function, which is the first thing an electrician needs to know before landing a wire. Both now carry **Safety** and **Safety
  network** columns; verified through the fixture builder with a guard-rated `1756-IB16S/A` on network `16#0000_4bc3` beside a standard module, and the test asserts
  the markdown row and the CSV fields. 436 package tests. The test is also the builder's second real use - content only, element names owned by the helper.

- **The tag CSV now says which tags belong to a safety program.** `tags.csv` carried scope, name, type, description, alias, dimensions and external access - but a tag
  declared in a safety program is part of the safety function, and nothing distinguished it from ordinary `Main` logic. A `safety` column now reports true for a tag whose
  declaring program is `Class="Safety"`, verified with a built fixture holding `Guard/SafeTag` and `Main/PlainTag`; the Studio import shape stays exactly
  `Tag Name,Description`. The builder gained program-tag support to write that fixture. 437 package tests.

- **A safety-program tag now says so in the listing and the reader, not only the CSV.** Round 134 put `safety` in `tags.csv`; `list_components kind:"tag"` and
  `get_component` still showed the tag as ordinary. Both now derive the flag from the declaring program: in the built fixture `Guard/SafeTag` reports
  `safety: true` in the row and the record, `Main/PlainTag` reports `false` in the row and omits the field in the record. The test that checked the CSV now
  asserts all three surfaces together, so they cannot disagree. 437 package tests.

- **An AOI's own routines now carry the instruction's safety class.** Reading `FC_SFTY_SSOV/Logic` returned the routine alone; nothing said it is safety code. AOI routine
  rows in `list_components` now carry `safety`, and `get_component` on an AOI-owned routine returns `safety: true` when the parent instruction is `Class="Safety"`. The
  builder spec asserts both for `AOI_Step/Logic`. 437 package tests.

- **The program and task tables mark safety directly.** `PROJECT.md` listed tasks and programs without a safety column, so a reader had to cross-reference the Safety
  section to learn that `SafetyTask` or `COMBUSTION_SAFETY` is safety - while the file header already says the fact. Both tables now carry a **Safety** column:
  verified on `Seco_Homogenizer`, where `SafetyTask` reads true and `MainTask` false, and the programs table marks the two guard programs. 437 package tests.

- **`PROJECT.md` now carries the review findings, not just the structure.** A handover bundle could read clean while `run_checks` already knew about 684 info items and 7
  warnings - the two tools disagreed about the same project. The summary now ends with a **Review findings** section: counts by severity and the top rules, with the
  heuristic caveat and a pointer to `run_checks`. Verified on `Seco_Homogenizer` (684 info, 7 warning; top rules UNDOCUMENTED_ROUTINE 257, UNDOCUMENTED_RUNG 237,
  UNUSED_TAG 149) and pinned with a built fixture whose unused tag produces a finding. 438 package tests.

- **The capability report advertised eleven tools that do not exist.** `studio_capabilities` listed `propose_change`, `validate_proposal`, `prepare_change_set`,
  `apply_change_set`, `propose_udt_change`, `trace_symbol`, `analyze_project`, `find_parsed_references`, `trace_signal`, `analyze_impact`,
  `project_execution_graph`, plus a references family and `sample_live_tags` - none of which are tools here - and the UDT refusal told callers to use
  `propose_udt_change`. Every list now names the real surface (analysis, draft and live), references reports itself unavailable, and the UDT message says to
  change the type in Studio or remove instances first. A new spec walks every `tools` array the report returns and requires each entry to be a registered tool,
  so a phantom name cannot ship again. 439 package tests.

- **A guard for the other place a tool name can go stale: the `next` suggestions.** Round 141 stopped the capability report from advertising
  tools that do not exist; every tool also returns `next` steps by name, and a stale name there is the same trap. A new spec collects the
  suggestions from nine tools - `open_project`, `project_overview`, `run_checks`, `list_components`, `find_references`, `get_component`,
  `document_project`, `trace_dependencies`, `usage_map` - and requires each to be a registered plugin tool, with `present` allowed as the host
  tool it is. No phantom was found; the guard is the deliverable. 440 package tests.

- **The first SDK proof of `draft_udt_member` found a silent data loss.** With a vendor-shaped fixture (the builder now writes members with
  `Dimension Radix Hidden ExternalAccess`, as a real export does), adding member `B` built cleanly - but Studio logged
  `XMLSrv_W_INVALID_ATTRIBUTE: Unexpected attribute 'Description' will be ignored`. The tool wrote the description as an attribute; a real
  export writes a child `<Description><![CDATA[...]]></Description>` (Seco's `Fault_Code` shows the shape). It now writes the child element:
  the same build reports **0 warnings, 0 errors**. The builder also gained `member`/`userType` and a test pins the generated XML.
  **My round-143 fixture was the problem, not the edit** - a minimal DataType is not importable at all, which is why the first attempt aborted.
  441 package tests.

- **`add_tag` now creates the Tags element when the project has none.** `add_sfc_tag` always knew how to do this; `add_tag` assumed the
  region existed and refused with `COMPONENT_NOT_FOUND: No Tags in this scope` on a controller without `<Tags>` - which the fixture builder
  writes whenever no tags are supplied. The region is now created before `Routines` in a program and before `Programs` in the controller
  (Studio's element order), the cached regions are re-read, and the tag is inserted. SDK-proven: the same fixture that failed now builds
  with **0 warnings, 0 errors**, one tag added. 442 package tests.

- **New descriptions are inserted first, where a real export keeps them.** `setDescription` appended a `<Description>` child to the end of the element, so a
  DataType got it after `Members` and a tag after `Data` - reversed from every export Studio writes (Seco's `FR_E_R_A` puts it before `Members`, `AIR_TC_READY`
  before `Data`). It now inserts at the element's content start. SDK-proven together with the UDT-member path: setting a UDT description and a tag description
  builds with **0 warnings, 0 errors**, two changes. The test asserts the order for both. 443 package tests.

- **Findings now carry a structured remedy.** `run_checks` reported rule, severity, message and evidence - what is wrong and where - but never what to do. A
  `fix` field now comes from a per-rule remedy map (unused tag, unresolved reference, undocumented rung/routine/program, unscheduled program, latch without
  reset, multiple writers, mnemonic mismatch, rung with no output), so a caller can act without composing the advice itself. Verified on
  `Seco_Homogenizer`: **100 of the first 100 findings** carry one, e.g. `DUPLICATE_OUTPUT -> Confirm intent and keep a single writer per tag, or split the
  tag.` A test pins the unused-tag remedy. 444 package tests.

- **The remedy field is now discoverable.** Round 149 added `fix` to findings, but the `run_checks` description and the skill still said "rule, severity and
  site" - a caller reading either would not know the field exists. Both now name it, and `docs/reference/tools.md` is regenerated. Skill body 7648 of 8000
  characters. 444 package tests, 90 bundle, docs current.

- **Every one of the 22 check rules now carries a remedy.** Round 149 covered the eleven rules that fire on production exports; a sweep of all five exports paged every
  finding (1280 in total) and confirmed **none without a fix**, then the rule list was compared against the map and the remaining twelve - duplicate routine name,
  JSR target missing, label missing, main routine missing, multiple schedules, the three safety rules, scheduled program missing, uncatalogued instruction,
  unresolved routine, I/O module changed - gained one. A test asserts the safety finding carries its structured remedy as well as the message text. 444 package tests.

- **Remedy coverage is now enforced by a test, not by a sweep.** Round 152 compared the 22 rules against the remedy map by hand; a new spec reads
  `src/engine/review.ts`, extracts every `report('RULE' …)` and every remedy key, and fails when a rule has no remedy - so a future rule cannot ship
  without one. This is the third consistency guard of the same kind: capability names (141), next-step names (142), and now rules (153). 445 package tests.

- **The handover bundle now gives the remedy for the most common finding.** `PROJECT.md` reported counts and top rules, so a reviewer holding only the document
  could see 257 undocumented routines and still not know what to change. It now ends the section with the top rule and its remedy: on `Seco_Homogenizer`,
  *"Most common rule, UNDOCUMENTED_ROUTINE: Add a routine description saying what it does and when it runs."* `remedyFor` is exported from the check engine, so
  the document and the tool answer from one source. The bundle test asserts the line. 445 package tests.

- **`search_logic` results now say which matches are safety code.** A match line named the program, routine and rung but not whether the containing scope is safety; a
  hit inside a guard program or a safety AOI looked like any other. Each match now carries `safety: true` when its program is `Class="Safety"` or its AOI is, and
  omits the field otherwise. Verified on `Seco_Homogenizer`: searching `Open_Valve` returns one standard hit (`COMBUSTION/D02_Sfty_HMI`) and four safety hits
  (`AOI::FC_SFTY_SSOV` EnableInFalse and Logic), flagged accordingly; a built fixture pins both sides. 446 package tests.

- **`find_references` rows now say when the site is safety code - and the AOI spelling broke the first try.** Each evidence row carries `safety: true` when its scope is a
  safety program or safety AOI, and the description names it. The first real check on `Seco_Homogenizer` returned `false` for all four `FC_SFTY_SSOV` rows: the
  reference scan reports an AOI by its **plain name**, while `search_logic` reports `AOI::Name`, so the prefix test missed. Both helpers now accept either
  spelling and resolve the AOI first; the same check then returns `true` for every safety AOI row. Tests cover a safety program tag and an AOI parameter.
  447 package tests.

- **The handover bundle lists the data types.** `PROJECT.md` carried tasks, programs and AOIs, but a reader could not see the user-defined types the tags are made
  of - on the real export that is nearly 50 types, including `AMM` and `BLOWER_ELEM`. A **Data Types** table now gives name, member count and description, and the
  counts line ends with `data types: N`. The section is emitted for any project that declares a type, not only ones with AOIs - my first placement put it inside
  the AOI block, and the builder fixture caught it. Verified on `Seco_Homogenizer`; test asserts the table, the row and `counts.udts`. 448 package tests.

- **Seven user-defined string types were invisible because the reader classified by family.** Chasing a 166-vs-173 mismatch between `counts.udts` and the
  export, every declared type proved to be `Class="User"` - but `STRING_1`, `STRING_2`, `STRING_3`, `STRING_5`, `STRING_6`, `STRING_9` and `STRING_50` live
  in `StringFamily` and were treated as vendor-owned, so they were missing from `list_components`, `get_component`, `counts.udts`, the documentation table and
  even the limits list (which wrongly called them vendor-owned). The reader now classifies by `Class` (falling back to family for older exports), and the
  edit guard uses the same rule, so a string type is editable while a vendor type is not. Verified on `Seco_Homogenizer`: **173 types**, `STRING_50` reads
  `LEN:DINT, DATA:SINT` with `Dimension 50`, and the limits list drops the false vendor entry. The same round found my fixture builder writing
  `Dimensions="50" Dimension="0"` where a real export writes `Dimension="50"`. 449 package tests.

- **An encrypted vendor instruction is now marked as unreadable, not as having no logic.** Round 163's count audit showed `AOI56MCM` (ProSoft) and eleven
  Yaskawa motion instructions counted as AOIs with **0 routines** and no warning - their bodies are `<EncodedData>`. The model now carries
  `protected: true`, `project_overview` reports *"N add-on instruction definition(s) are encrypted (vendor): their bodies are not readable"*, and the
  handover table prints **encrypted** in the Routines column instead of `0`. Verified on both real exports (Seco 1, Carpenter 11) and pinned with a
  builder `encodedAoi` fixture that asserts the flag, the limits entry and the table cell. 450 package tests.

- **The bundle's rung count now matches the rungs it writes.** Round 125 started writing AOI logic, but `counts.rungs` still counted only program rungs: on
  `Seco_Homogenizer` the summary said 9,596 while the export holds **9,766** `<Rung>` elements. The missing 170 are the AOI routines' rungs. `counts.aoiRungs`
  now reports them and the summary reads *"29 AOI routine(s) (170 rung(s)), 9596 rung(s)"* - **9,596 + 170 = 9,766, exactly the raw count**. Same treatment for
  the counts line; the AOI-docs test asserts the new count. 450 package tests.

- **A child module with no Name no longer appears blank.** Twenty drive peripheral modules on `Seco_Homogenizer` are written without a `Name` attribute, so
  `list_components` returned rows with `name: ""` and `get_component` could not address them at all. The model now gives such a module the identity Studio shows
  on screen - **parent:slot** - and marks it `unnamed: true`; the rows carry the flag and the record is readable by that name. Verified on the real export:
  **0 blank names, 91 rows**, e.g. `RC_1_FAN_1102VFD:1` (`RHINOBP-DRIVE-PERIPHERAL-MODULE`) reads back with its catalog number. The builder can now write an
  unnamed module, and a test pins the identity and the lookup. 451 package tests.

- **The bundle now counts the AOI definitions it lists.** `counts` had programs, tasks, routines, AOI routines, AOI rungs, rungs, comments, tags,
  modules and data types - but no count of the add-on instructions whose table the same document writes, so an audit keyed on `counts.aois` found
  nothing. `counts.aois` is now present and the counts line ends `add-on instructions: 26` on `Seco_Homogenizer`, matching the 26 AOI rows and
  `open_project`'s own count. The AOI-docs test asserts it. 451 package tests.

- **Controller-scoped safety tags were invisible as safety.** A safety audit against the raw export counted **157** tags with `Class="Safety"`; the model marked
  **none** of them, because safety was derived only from the declaring program, and these are controller-scoped (`AREA_E_UNDER_BLKD`, `AREA_N_PLTFRM_BLKD`...).
  The reader now parses the tag's `Class="Safety"` and every consumer ORs it with program membership: listing rows, `get_component`, and the `safety` column of
  `tags.csv`. Verified on `Seco_Homogenizer`: **259 safety tags** = 157 controller-class + 102 program-scoped, exactly as the raw file and the program set
  predict. A built fixture pins both a controller tag and a standard-program tag. 451 package tests.

- **A routine inside a safety program is now marked safety.** Round 169 fixed the tag; the level below still said nothing: all ten routines of
  `COMBUSTION_SAFETY` listed as ordinary ladder with no safety flag, and `get_component` returned them the same way. Routine rows and the routine reader now
  carry `safety: true` when the declaring program is `Class="Safety"` (and keep the AOI-owner rule from round 137). Verified on `Seco_Homogenizer`:
  **10 of 10** routines in the guard program flagged; a built fixture pins a safety program against a standard one. 452 package tests.

- **The rung documentation says when the logic is safety.** `rungs/<program>.md` and `rungs/AOI-<name>.md` documented the logic without saying it belongs to a
  guard program or a safety instruction - a reviewer reading the file had to cross-reference `PROJECT.md`. The headers now read `(SAFETY program)` and
  `(SAFETY instruction)`; verified on `Seco_Homogenizer` (`COMBUSTION_SAFETY`, `FC_SFTY_SSOV`) and pinned with a built fixture. This is the last documentation
  surface that lacked the safety marker. 454 package tests.

- **Fourteen mojibake sequences were corrupting source comments and generated documents.** The rung header read `# COMBUSTION_SAFETY ÃÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â rung documentation` because
  an earlier edit had written UTF-8 bytes through a decoder that turned them into `ÃÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬"` (and one double-encoded `ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡`); the same corruption sat in
  five source files, including the PROJECT.md "Generated from ... sha256 ...ÃÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦" line. All now read ASCII (` - ` and `...`), the repository's stated default:
  **0 occurrences remain**, and the generated header is `# COMBUSTION_SAFETY - rung documentation (SAFETY program)`. 454 package tests.

- **Double spaces from the mojibake cleanup collapsed.** Replacing the corrupt dash with " - " left padding behind in four files, so the generated header read
  `# COMBUSTION_SAFETY  -  rung documentation`. It now reads `# COMBUSTION_SAFETY - rung documentation (SAFETY program)`, verified on the real export.
  A scan of the source for other non-ASCII found only legitimate text - the Chinese strings in `locales.ts` and meaningful symbols in comments and messages -
  so nothing else was touched. 454 package tests.

- **`usage_map` and `find_references` agree on real tags.** The two tools answer the same question from different views, so a disagreement would mean one of them
  was lying. Compared on **30 controller tags** of `Seco_Homogenizer`: reads and writes match exactly in all 30 (e.g. `ALWAYS_OFF` 94/1). A built fixture now
  pins the invariant on a rung that reads a tag twice, so a future change to either scan must keep them consistent. 455 package tests.

- **Every row the listing shows can be read.** Audited `list_components` against `get_component` across two production exports: **517 + 283 rows** of programs,
  tasks, data types, AOIs, modules and controller tags, plus **230 program-scoped routines and tags** - **0 unreadable**. The invariant is now a test: a built
  fixture lists each kind and reads every row by the name the listing gave. A listing that names something the reader cannot open is a dead end. 456 package tests.

- **Listing an encrypted AOI's routines now says why the list is empty.** `list_components kind:"routine" scope:"AOI56MCM"` answered `0 routines.` - the same shape as
  a real instruction with no logic. The summary now appends `definition encrypted: its routines are not readable`, matching the AOI flag from round 164. Verified on
  `Seco_Homogenizer` and pinned with the builder's `encodedAoi` fixture. 456 package tests.

- **Built-in data types are now readable, not just counted.** A project with no user-defined types (Showcase2) reported
  `0 udts, plus 266 vendor-owned not listed` - honest, but the 266 product types were readable nowhere, and `get_component` answered
  `PROTECTED_TARGET`. The model now keeps `vendorUdts`, `list_components kind:"udt"` takes `include_vendor: true`, and `get_component` returns a
  product type with `vendorOwned: true`: `ALARM_ANALOG` reads back with **123 members**. Editing them is still refused. The summary no longer
  contradicts the listing (`including 266 vendor-owned (not editable)`). Verified on Showcase2's SDK export; tests cover read, listing and the
  staging refusal. 456 package tests, docs regenerated for the new parameter.

- **The handover bundle now states how many built-in types it is not documenting.** `PROJECT.md` counted user data types only; on Showcase2 that read
  `data types: 0` while the export declares 266 product/IO types. The counts line now continues `vendor/product-defined data types: 266 (not listed)`, and
  `counts.vendorTypes` carries the number. The skill also names the new read path (`get_component kind="udt"` returns them with `vendorOwned`;
  `list_components` lists them only with `include_vendor: true`). Test pins user count 1 vs vendor count 1 and that the vendor type stays out of the user
  table. 457 package tests.

- **The release pipeline runs end to end, and it caught two stale artifacts.** `pnpm prepack` first refused to assemble: `l5x: lib/ is older than
  src/engine/documentation.ts; rebuild before packing`. After rebuilding the component it assembled **6 components** (l5x 145 files, ftview 90, mwi 108,
  optix 161, migration 25, resources 57 - about 4.8 MB) into the gitignored `vendor/` tree. Regenerating also brought the two **tracked** client faces
  (`lib/client.js`, `packages/viewer/lib/client.js`) in line with the current instruction set, which they had lagged. This is the step that turns the
  plugin into a publishable package; installing it remains the user's decision. 457 package tests, 90 bundle, docs current.

- **New check: a safety tag written from standard logic.** Studio 5000's installed help states `A standard parameter cannot write to a safety tag or a safety
  parameter` (page 130692); nothing in `run_checks` enforced it. `SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC` now reports each such write with tag, writer program,
  routine and rung, and a remedy to move the write into a safety program. Confirmed silent on the two safety-bearing production exports (0 findings on
  Seco_Homogenizer and Carpenter) and firing exactly once on a built fixture. Writing the test exposed a **real reporting bug**: `run_checks` filtered the rows
  but reported the unfiltered count in `total`, so a rule filter could say "691 findings" beside zero rows. `total` is now the filtered count, with
  `total_unfiltered` retained. 458 package tests.

- **The new safety rule is discoverable.** `run_checks`'s description now names `SAFETY_TAG_WRITTEN_FROM_STANDARD_LOGIC`, and the skill lists a
  standard write to a safety tag among the safety rules - so an assistant reading either surface knows the check exists and can filter for it.
  `docs/reference/tools.md` regenerated; skill body 7,871 of 8,000 characters. 458 package tests, 90 bundle, docs current.

- **A literal destination is refused while composing, not at build time.** The live E2E program exposed that `compose_rung` accepted `ADD(Count,Count,1)`: the
  catalogue correctly reads Source A, Source B, Destination, but every numeric slot shares one kind, so a literal passed the Destination slot and Studio rejected
  the download build with `RxCMP_E_AUDIT_INVALIDOPKIND` and no operand position. The composer now refuses a literal any `Destination` slot with a message naming
  the written order, and a two-sided test holds both the refusal and the correct destination-last emission. Composer output built **0 warnings / 0 errors**.
  Also cleaned four corrupted mojibake comments in the instruction catalogue. 460 package tests.

- **The destination guard covers MOV and CLR, and the skill tells the truth about live traffic.** A second test holds `MOV`/`CLR` refusing a literal
  destination while `MOV(5,LineSpeed)` composes. The Live reads section now says reads are safe and `write_live_tag`/`write_controller_clock` exist behind
  allowWrites plus human approval, instead of claiming the surface never writes; it also records the SDK route form `WORKSTATION!DRIVER\IP` from
  RSLinxNG.xml, the exact string the live E2E needed. Skill body 7,982 of 8,000. 461 package tests.

- **Live reads accept one scalar member, not just whole scalars.** `read_live_tags`, `poll_live_tags` and `start_plc_trend` now take `Timer.PRE` or `Timer.ACC`:
  the declaration resolves on the base tag, `resolveTag` supplies the member's own type, and the CIP worker allows a dotted symbol on the read path. Writes still
  accept only whole scalar tags, so one write changes one known operand and its readback proves it. Four tests hold member resolution, the whole-TIMER refusal
  and the member-write refusal; verified live on 192.168.1.3 with `Timer.PRE = 2000`, `Timer.ACC = 0`, `Count = 2097029`, all good quality. 465 package tests.

- **ACD provenance survives across turns.** The live bench forced a second export of the same baseline because the first record had vanished: `StudioState`
  keyed exports and verified builds by the `chat` object identity, and a later turn presents a fresh wrapper. Provenance now keys on the stable `sessionId`
  first (identity fallback when absent), so a baseline exported in one turn still authorises a build in the next. Four tests: cross-turn reuse, verified build,
  session isolation, identity fallback. 469 package tests.

- **The skill names the batch reader and member reads.** Live reads now read `poll_live_tags`, `read_live_tags` (IPv4, 1-16 scalars or members) and
  `start_plc_trend` in one line, so an assistant sees the batch tool and the member form without a separate lookup. Skill body 7,976 of 8,000.

- **The live controller workflow is documented.** `docs/live-controller.md` records what this bench taught: the two transports, reading the route out of
  `RSLinxNG.xml`, the `WORKSTATION!DRIVER\IP` form, capture-first restore points, the Program-mode gate before download, member reads, and why a safety
  project has no download path. The baseline blocker now says how to repair it (export the ACD, open that L5X). Also proven offline in one project: RLL + ST +
  FBD + SFC all build together with **0 warnings / 0 errors**.

- **The skill now has guards, not conventions.** Two tests hold its published surface: the body must fit the component budget from `components.json`, and every
  backticked snake_case name must be a registered tool, a compose pattern, a host-side Studio tool or a parameter - so a phantom name fails the build instead
  of sending the assistant hunting. A self-check holds `open_project` in the scan so an empty result cannot pass. 471 package tests.

- **A failed batch stages nothing.** A third destination-guard test sends a two-rung `compose_batch` whose second rung has a literal destination: the batch is
  refused with `INVALID_OPERAND` and no draft exists to clean up, so a later `draft_apply` cannot write half a change set. 472 package tests.

- **`compare_projects` compares engineering content, not export shape.** A compose -> Studio build -> export round trip of the all-language project
  reported **271 changes** that were all normalisation: 261 injected built-in types, Studio's FBD node renumbering, ST padding blank lines, SFC
  Condition/STContent wrappers, default tag radix/ExternalAccess, default task priority, the embedded Local module and the release patch revision.
  The comparator now compares effective values (sorted-key JSON so field order cannot matter), canonical diagram labels, trimmed ST, user-declared types
  only, and ignores the embedded Local module and patch revision. The same round trip now reports **0 changes**, while real operand/rung/ST changes are
  still reported. 476 package tests.

- **The comparator's normalisation is stated where the caller reads it.** `compare_projects` now says that Studio-added defaults are compared by
  effect - built-in types, the embedded Local module, the release patch revision, diagram node ids and ST padding do not count as changes - and a test holds
  the Local-module case alongside the patch-revision, task-priority and tag-radix cases. 477 package tests.

- **Function-block wires are documented by pin, not just by node id.** The diagram model now keeps `FromParam`/`ToParam`, so a generated document says
  `Wire 0 -> 2 SourceA` instead of `Wire 0 -> 2`. Verified on the composed all-language project (SourceA, SourceB, Dest) and held by a test.
  478 package tests.

- **A changed wire pin is named in the change summary.** `renderChangeValue` now includes `from`/`to` pins, so a comparison that flips a wire from
  `SourceA` to `SourceB` says exactly that instead of printing `Wire #0->2` on both sides. Held by a changed-fields test. 479 package tests.

- **A FOR index must be a tag, and the composer now says so.** Studio refused `FOR(Loop,5,0,10,1)` at build with `RxCMP_E_AUDIT_INVALIDOPKIND`;
  `FOR(Loop,Count,0,10,1)` built 0/0. The composer refuses a literal FOR index while composing, with a fix naming the DINT tag the index needs, and leaves
  the initial, terminal and step values free to be literals. Two tests hold both sides. 480 package tests.

- **Writable operands are now a property of the catalogue, not a name guess.** `SIZE(Arr,0,5)` failed a Studio build with `RxCMP_E_AUDIT_INVALIDOPKIND`
  while `SIZE(Arr,0,Arr[0])` built 0/0, so the `Size` slot joined `Destination` and `FOR`'s `Index` as explicitly `writable`. The composer refuses a literal in
  any such slot and names it. Both SIZE cases are held by tests. 481 package tests.

- **Which operand slots must be tags is visible before composing.** `list_instructions` rows now carry `writable: true` on Destination, `FOR` Index and
  `SIZE` Size, and the description names it, so an agent can see the constraint instead of learning it from a refused build. Tested on ADD and FOR
  (Destination/Index marked, source and bound slots not). 482 package tests.

- **Generated client faces refreshed.** The rebuild after the writable-slot changes regenerated both tracked client faces; they are committed so the
  repository carries the same bytes the release assembly embeds.

- **The built artifact must carry the writable-slot contract.** The dist smoke now asserts `ADD` Destination, `FOR` Index and `SIZE` Size are
  `writable` in `lib/`, and that a source slot is not, so an artifact built before the guard fails the smoke. 4/4 smoke checks pass.

- **STD's Control block must be a tag, and the catalogue says so.** Studio refused `STD(Arr,0,Dest,5,10,0)` with `RxCMP_E_AUDIT_INVALIDOPKIND`; with a
  CONTROL tag it built 0/0 (once the destination was REAL, per the installed instruction help). The `Control` slot is marked writable, the composer refuses a
  literal there, a test holds both sides, and the dist smoke asserts the built catalog carries it. A blanket "ANY slots never take literals" rule was tried
  and rejected because `JSR(Sub,0)` and a built PID rung legitimately use literals. 483 package tests, 4/4 smoke, bundle 91.

- **A vendor type restriction is enforced and advertised.** The installed STD help says its Destination must be REAL; a DINT destination failed Studio with
  `RxCMP_E_AUDIT_INVALIDOPTYPE` while REAL built. `InstructionOperand` now carries optional accepted `types`, STD's Destination is `['REAL']`, and the
  composer refuses a tag of another numeric type with both types named. `list_instructions` exposes `types`, tests hold the composition and the listing, and
  the dist smoke asserts the built slot. 484 package tests, 4/4 smoke.

- **SQRT over a DINT is legal, and a test now says so.** The opposite probe to STD: `SQRT(Count,Count)` with a DINT source and destination built with
  0 warnings / 0 errors, so no REAL-only restriction belongs on SQR. The test keeps a future edit from adding one. 485 package tests.

- **AOI calls now start with their instance tag, because Studio requires it.** Real ladder text is `AOI_Alarm(ALM_MCR_AOI, ...)`, and `ALM_MCR_AOI` is a
  tag of type `AOI_Alarm`. The composer used to emit parameters only; a real-project build of such a call failed with `RxCMP_E_AUDIT_INVALIDOPTYPE`.
  Composing `AOI_Alarm(ALM_MCR_AOI,EmergencyStops_OkStatus,Clear_Faults_Pulse)` into the Carpenter project now builds with **0 warnings / 0 errors** and
  `download_ready: true`. The composer requires the instance tag, checks its data type is the AOI, and refuses a literal or a non-instance first operand.
  486 package tests.

- **AOI calls take the instance and only the Required parameters, and an AOI instance can now be declared.** Probing the real Carpenter project
  settled both: instance + all visible parameters failed `INVALIDNOOFOPS`, instance + the two `Required="true"` inputs built 0/0 with
  `download_ready: true`. The composer now enforces exact required arity, checks each parameter against its declared type, refuses literals for
  Output/InOut pins, and `draft_tag` accepts an AOI name as a data type so an instance tag can be created at all (it previously answered
  `UNKNOWN_DATA_TYPE`). 486 package tests.

- **The skill now teaches the AOI call shape.** A new line says an AOI call is the instance tag first, then only the parameters whose `Required` is true,
  and `draft_tag` is documented as accepting an AOI name. The prose it replaced was redundant, so the body is 7,929 of 8,000 characters - smaller than before
  the addition. 486 package tests.

- **AOI structure parameters are type-checked.** A BOOL tag where `MAFR_Yaskawa`'s InOut Axis needs a `Yaskawa_EIP_Servo` failed Studio with
  `RxCMP_E_AUDIT_INVALIDOPTYPE`, while the declared structure built 0/0 with `download_ready: true` (verification `111434c2`). The composer now
  compares the resolved tag type with the parameter's declared type for non-scalar parameters and refuses a literal or a wrong structure, naming both
  types. A test holds the right, wrong and literal shapes. 487 package tests.

- **An AOI interface change is now held by a comparison test.** Probing showed `compare_projects` already reports an AOI as changed when a parameter's usage
  goes from Input to InOut (component `aoi`, with before and after parameter lists), but no test covered it. The test now pins that, so a future
  normalisation change cannot quietly call an incompatible AOI edit "no changes". 488 package tests.

- **Every destination slot is now marked writable, not only those named Destination.** The first pass covered 15 `Destination` slots; the audit found the
  `Dest` slots of `SWPB`, `STOD`, `MVM`, `SQO`, `OSR/OSF`, `BTD` (Dest and Dest bit), the string `Dest` slots, PID's Control variable and the serial
  Destination unmarked. Studio refused `SWPB(5,0,5)` with `RxCMP_E_AUDIT_INVALIDOPKIND`, so the composer now refuses a literal in all of them. Tests hold
  SWPB and MVM; the dist smoke asserts the built catalogue carries both. 489 package tests.

- **Generated client faces refreshed** after the catalogue change, so the committed bytes match the rebuilt artifact.

- **Array and structure operands are tag-only, and CPS is modelled properly.** A new `tagOnly` flag marks slots that must be a declared tag but are not
  written (COP Source, SSV Source, array operands of SQO/BSL/BSR/SRT/STD, JXR control). The compact instruction table now marks its generated `Dest`
  writable, covering `NEG`, `ABS`, `LN`, `SIN` and the other math instructions the earlier pass missed, and `MSG`'s Control. CPS moved out of the generic
  table into an explicit definition after a build showed it takes array **elements**: `CPS(Arr,Arr2,10)` failed `RxCMP_E_AUDIT_MUSTBEDISCRETE`, while
  `CPS(Arr[0],Arr2[0],10)` built 0/0. Studio also refused `COP(Arr,5,10)` and `NEG(5,5)` with `RxCMP_E_AUDIT_INVALIDOPKIND`. Tests cover CPS, COP,
  NEG and the literal refusals; the dist smoke asserts CPS and generated Dest flags in the built catalogue. 490 package tests.

- **Generated client faces refreshed** after the tag-only and CPS catalogue change, so repository bytes match the rebuilt artifact.

- **EXP removed: it is not a Logix 5000 instruction.** The vendor index lists Advanced Math as LN, LOG and EXPT only; production samples never write
  `EXP(`; a build of EXP alone failed `AUDIT_OUTPUTS` and EXP followed by OTE failed `INVALIDOPTYPE`. The SLC-era mnemonic was in the compact table;
  `compose_rung` now answers UNKNOWN_INSTRUCTION and a test holds the refusal. Running every other generated math instruction built 0/0 except EXP
  (NEG/ABS/EXPT/LN, DEG, RAD, TO_BCD/BCD_TO/TRUNC and the six trig instructions). 491 package tests.

- **Generated client faces refreshed** after removing EXP from the catalogue, so repository bytes match the rebuilt artifact.

- **ISINF and ISNAN are input instructions, and their source must be REAL.** Both names are newer than the v36 help index, so Studio decided: `ISINF(R)OTE(B)`
  and `ISNAN(R)OTE(B)` built 0/0, while `ISINF(D)` with a DINT failed `INVALIDOPTYPE`. Both are now in the rail-reader set (a rung ending in one is
  refused before a build) and their Source slot is restricted to REAL. The remaining two unlisted names, `SRT(Arr,0,Ctrl,10,0)` and
  `ATAN2(R,R,R)`, built 0/0 and are real. Tests hold the type, the rail refusal and the legal driven form; the dist smoke checks the built engine.
  492 package tests.

- **Generated client faces refreshed** after the ISINF/ISNAN catalogue change, so repository bytes match the rebuilt artifact.

- **COP also copies between array elements, not array tags.** `COP(Arr,Arr2,10)` failed Studio with `MUSTBEDISCRETE`; `COP(Arr[0],Arr2[0],10)`
  built 0/0. Both operands are now element-addressed (Source tag-only, Destination writable) like CPS, the composer refuses the whole-array form,
  and tests plus the dist smoke hold both copy instructions. 492 package tests.

- **Generated client faces refreshed** after the COP element change, so repository bytes match the rebuilt artifact.

- **FLL fills from an array element, not the array tag.** `FLL(5,Arr,10)` failed Studio with `MUSTBEDISCRETE`; `FLL(5,Arr[0],10)` built
  0/0. FLL's Dest is now element-addressed, the composer refuses the whole-array form, the older FLL composition test was moved to an array
  fixture, and tests plus the dist smoke hold FLL beside CPS and COP. 492 package tests.

- **Generated client faces refreshed** after the FLL element change, so repository bytes match the rebuilt artifact.

- **BSL and BSR load their source bit from a BOOL tag, not a number.** The vendor operand table says Source Bit is a BOOL tag; the catalogue had
  `NUMBER`, so `BSL(Arr,Ctrl,0,10)` failed `INVALIDOPKIND` while `BSL(Arr,Ctrl,Bit,10)` with a BOOL tag built 0/0. Both slots are BOOL now,
  tests hold the literal refusal and both composed rungs, and the dist smoke checks the built catalogue. `SQO(SeqArr,255,Dest,Ctrl,10,0)` also
  built 0/0, confirming its existing shape. 493 package tests.

- **Generated client faces refreshed** after the BSL/BSR change, so repository bytes match the rebuilt artifact.

- **DTR, AND, OR, XOR, NOT and BTD cannot end a rung.** `DTR(Src,Mask,Ref)` alone failed Studio with `AUDIT_OUTPUTS` while
  `DTR(...)OTE(Bit)` built 0/0; `AND(A,B,D)OTE(Bit)` also built 0/0. All six are now in the rail-reader set, so the composer refuses the
  unbuildable form and names the instruction. BSL/BSR are deliberately excluded because they built at the rail. Tests hold AND and DTR both ways;
  the dist smoke checks every reader and the BSL exclusion. 494 package tests.

- **One-based positions are enforced, not just documented.** `FIND(Str1,Str2,0,Pos)` failed Studio with `RxCMP_E_AUDIT_OUTOFRANGE`; `FIND(...,1,...)`
  built 0/0. New `minimum` metadata is set to 1 on the Start slot of FIND, MID, INSERT and DELETE, and the composer refuses a lower literal naming
  the 1-based rule. `UID()` also built 0/0 (no change needed). Tests hold FIND and MID both ways; the dist smoke checks the built catalogue.
  495 package tests.

- **Generated client faces refreshed** after the minimum-position metadata change, so repository bytes match the rebuilt artifact.

- **MSG takes a MESSAGE tag, and the composer checks it.** `MSG(N)` with a DINT failed Studio with `INVALIDOPTYPE`; `MSG(Msg)` with a MESSAGE
  tag built 0/0. The compact table's Control slot now carries `types: ['MESSAGE']`, a test holds the wrong-tag refusal and the valid rung, and the
  dist smoke checks the built catalogue. 496 package tests.

- **Generated client faces refreshed** after the MSG type restriction, so repository bytes match the rebuilt artifact.

- **FIND returns its position in a DINT.** `FIND(Str1,Str2,1,Str2)` with a STRING Result failed Studio with `INVALIDOPTYPE` while the same rung with a
  DINT Result built 0/0. The Result slot now carries `types: ['DINT']`; the test holds the wrong-type refusal and the dist smoke checks the built
  catalogue. `SIZE(Arr,0,R)` with a REAL size built 0/0, so SIZE keeps its numeric slot. 496 package tests.

- **Generated client faces refreshed** after the FIND Result restriction, so repository bytes match the rebuilt artifact.

- **Array dimensions are bounded and SIZE reads an array tag.** `SIZE(5,0,Pos)` failed Studio with `MUSTBEARRAY` and `SIZE(Arr,3,Pos)` failed
  `OUTOFRANGE`; `SIZE(Arr,2,Pos)` builds. New `maximum` metadata is 2 on the Dimension to Vary slot of SIZE, SRT and STD, SIZE's Source is
  tag-only, and the composer refuses both a literal source and an out-of-range dimension. `MID(Str1,0,1,Str2)` with Qty 0 built 0/0, so string
  quantity keeps no minimum. Tests and the dist smoke hold the new bounds. 497 package tests.

- **Generated client faces refreshed** after the array-dimension metadata change, so repository bytes match the rebuilt artifact.

- **A MESSAGE tag can now be declared through the tools.** MSG requires a MESSAGE tag, but `draft_tag` answered UNKNOWN_DATA_TYPE for one because
  the built-in structure set lacked it. `message` joins CONTROL, SERIAL_PORT_CONTROL, ALARM_ANALOG, ALARM_DIGITAL and FBD_MATH; the test declares
  Msg2 and applies it, and the skill lists MESSAGE. Studio already built `MSG(Msg)` with such a tag 0/0. 497 package tests.

- **TIMER, COUNTER, PID and STRING tags can be declared through draft_tag.** All four are built-in Logix structures the catalogue and its patterns
  use (TON, CTU, PID, string instructions), yet `draft_tag` answered UNKNOWN_DATA_TYPE for each; MESSAGE was fixed last round and STRING was
  missing too. The test declares all five through the tool and applies them, and the skill lists them. 498 package tests.

- **FBD block structures are declarable, with one name excluded by build.** Studio accepted tags of FBD_MATH, FBD_TIMER, FBD_COUNTER, FBD_COMPARE and
  FBD_LOGICAL (0/0) but aborted the import for FBD_MOVE, so only the five proven names were added to the built-in set. draft_tag's description lists them,
  and the built-in-type test now declares ten types through the tool. 498 package tests.

- **A draft-created TIMER drives a real TON in the same draft.** The built-in-type test now declares a TIMER through `draft_tag`, composes
  `TON(T1,1000,0)` against it, and applies both in one export, proving the reachability fix end to end rather than only tag presence.
  498 package tests.

- **Each alarm instruction takes its own alarm structure.** ALMA(AlarmD,...) with a digital alarm and ALMD(AlarmA,...) with an analog alarm each failed
  Studio with INVALIDOPTYPE, while ALMA(AlarmA,...) and ALMD(AlarmD,...) built 0/0. ALMA's Alarm slot now accepts ALARM_ANALOG only and ALMD's
  ALARM_DIGITAL only; tests hold both refusals and both valid rungs, and the dist smoke checks the built catalogue. 499 package tests.

- **Generated client faces refreshed** after the alarm type restrictions, so repository bytes match the rebuilt artifact.

- **PID takes a PID structure.** PID(tieback,...) with a REAL tag in the structure slot failed Studio with INVALIDOPTYPE; the build-proven
  PID(pid1,...) form uses a PID tag. The PID slot now carries `types: ['PID']`, the existing build-proven test also asserts the refusal, and the dist
  smoke checks the built catalogue. 499 package tests.

- **Generated client faces refreshed** after the PID type restriction, so repository bytes match the rebuilt artifact.

- **Array slots are checked against the declaration, not guessed.** Resolution now returns a tag's array dimensions, and SIZE's Source carries
  `arrayTag`; the composer refuses a scalar tag (`SIZE(D,0,Pos)` failed Studio with `MUSTBEARRAY`) and refuses one element (`Arr[0]`) where the
  whole array is required. The array-dimension test holds both refusals plus the valid `SIZE(Arr,2,Pos)`; the dist smoke checks the built catalogue.
  499 package tests.

- **Generated client faces refreshed** after the array-tag check, so repository bytes match the rebuilt artifact.

- **SQO's destination is not the whole array, and its control is a CONTROL.** SQO(...,Dest,Ctrl,10,0) with the whole destination array failed
  Studio with `MUSTBEDISCRETE`; `SQO(Arr,Mask,Dest[0],Ctrl,10,0)` built 0/0. A COUNTER in the control slot failed `INVALIDOPTYPE`. New
  `noArray` metadata refuses a whole array in SQO Dest, SQO Control accepts only CONTROL, and staged tags now carry their dimensions so a
  draft-declared array can drive SIZE. An existing SQO test that paired a COUNTER control with a whole-array destination was not build-valid and now
  declares a truthful fixture. 500 package tests.

- **Generated client faces refreshed** after the SQO/staged-dimension changes, so repository bytes match the rebuilt artifact.

- **The bit shifts take a CONTROL structure.** BSL(Arr,Ctl2,Bit,8) with a COUNTER control failed Studio with `INVALIDOPTYPE`;
  `BSL(Arr,Ctrl,Bit,8)` built 0/0. BSL and BSR Control slots now accept CONTROL only; the existing bit-shift test holds both refusals alongside the
  valid rungs, and the dist smoke checks the built catalogue. 500 package tests.

- **Generated client faces refreshed** after the BSL/BSR control restriction, so repository bytes match the rebuilt artifact.

- **SRT and STD take a CONTROL structure.** SRT(Arr,0,Ctl2,10,0) and STD(Arr,0,Dest,Ctl2,10,0) with a COUNTER control each failed Studio with
  `INVALIDOPTYPE`; the same rungs with a CONTROL tag built 0/0. Both Control slots now accept CONTROL only, completing the rule across the five
  array instructions that carry one. Tests hold both refusals and both valid rungs; the dist smoke checks the built catalogue. 501 package tests.

- **Generated client faces refreshed** after the SRT/STD control restriction, so repository bytes match the rebuilt artifact.

- **The array slots of SRT and BSL accept one element, so no whole-array rule was added.** `SRT(Arr[0],0,Ctrl,10,0)` and
  `BSL(Arr[0],Ctrl,Bit,8)` both built 0/0, matching the earlier SQO element build. Regression tests now hold the element forms for SRT, BSL and BSR
  beside the CONTROL rule, so a future attempt to require the whole array fails a test instead of the vendor. 501 package tests.

- **PID's optional master loop is a PID structure or the literal 0.** PID(...,tieback,...) with a REAL tag in the master-loop slot failed Studio with
  `INVALIDOPTYPE`; the build-proven PID(...,0,...) form passes the literal. The slot now carries `types: ['PID']` while still accepting 0, the PID
  test holds the refusal, and the dist smoke checks the built catalogue. 501 package tests.

- **Generated client faces refreshed** after the PID master-loop restriction, so repository bytes match the rebuilt artifact.

- **The skill names the enforced slot metadata.** Its Compose section now says `list_instructions` flags are enforced
  (array_tag, no_array, minimum/maximum, types for MESSAGE, alarms, PID and CONTROL), so an agent reads the data instead of discovering the rule at
  build time. Three verbose sentences were compressed to make room; body 7,966 / 8,000. 501 package tests.

- **Catalogue invariants fail the build, not the vendor.** A new suite asserts unique uppercase mnemonics, well-formed slots, no contradictory array flags
  (arrayElement/arrayTag/noArray), ordered minimum/maximum, non-empty type lists, and a repeating tail only on the last slot. It passes over every
  explicit and generated instruction. Live check: `read_controller_mode` on 192.168.1.3 returned **Run** over the saved route (read-only). 505 package tests.

- **Array-dimension refusals are pinned by tests.** The dimension validator accepts one to three positive sizes and refuses zero, a zero later, text,
  four sizes, an oversized single dimension, a total above the cap, and an array with a scalar initial value. The test also shows the timing: `draft_tag`
  stages the operation and `draft_apply` reports `INVALID_CHANGE_SET`, so a caller must read the apply result for validation errors. 506 package tests.

- **Invalid tag names now carry the exact rule and its repair.** `identifier()` in the change set duplicated the identifier rules as one generic
  message, so `checkIdentifier`'s specific codes (NAME_INVALID_CHARACTERS, NAME_STARTS_WITH_DIGIT, NAME_TOO_LONG) and suggested names never reached a
  caller. It now delegates to `checkIdentifier`, and a single failed operation keeps its own fix instead of the generic help text. Tests hold all
  three codes, the `_1Pump` repair, an unknown scope (COMPONENT_NOT_FOUND) and a duplicate (NAME_COLLISION). 507 package tests.

- **Scalar initial-value bounds are pinned.** BOOL accepts 0/1 and refuses 2; INT accepts 32767 and refuses 32768 and a fraction; USINT refuses a negative;
  UDINT accepts its maximum; DINT refuses 2147483648; REAL accepts 1.5 and refuses 1e39. Each case stages a tag and checks the apply result, so the
  boundary is proven from the caller's side. 508 package tests.

- **A program that has no Tags region gets one in the right place, and the new tags compose in the same draft.** The test fixture is raw XML
  (the builder always writes an empty Tags region) with a Program containing only Routines. Two program-scoped tags are declared, a rung reads and writes
  them, one apply writes the export, and a reopen lists both tags — proving the insertion order (Tags before Routines) and staged program-tag resolution.
  509 package tests.

- **One program using every new rule builds 0/0, and the repository reproduces it.** Composed only through the tools (24 tags, 9 rungs: latch, TON,
  ADD, SQO with Dest[0], gated MSG, FIND once-based, ALMA, BSL, PID with master loop 0), the export
  `composed-proof.L5X` (sha 5432156...) imported and built with 0 warnings and 0 errors (ACD sha c6852cbc...). A committed test composes the same
  program in memory, applies it, reopens it and asserts all nine rungs read back unchanged. 510 package tests.

- **The whole catalogue now composes to text the parser accepts.** A sweep walks all 136 `list_instructions` rows with slot-shaped arguments
  (writable destinations, array tags, elements, no-array slots, bound types); 124 compose and pass `l5x_rung_preview`, 3 are skipped for needing real
  vendor keywords (GSV/SSV/AHL), and the 9 refusals are exactly the documented ones: eight unmodelled instructions (FAL/FSC/DCM/DCS/CROUT/EOT/SFR/SFP)
  and the SBR-only rung Studio aborts. Any other error fails the test. 511 package tests.

- **A rung resolves tags in its own program only.** A rung staged in Beta that read Alpha's local tag composed cleanly, then Studio failed it with
  `RxCMP_E_OPERAND_TAGNOTFOUND`. The composer now carries the composing program on the project view; program tags resolve only in their own program,
  staged controller tags stay visible everywhere, and the refusal names the program that does declare the tag. `XIC(Shared)OTE(LocalB)` in Beta built
  0/0 (ACD sha 5686d63f...). Two existing tests were themselves composing across programs (MotorProgram's tag into MainProgram, and a program named
  Main that does not exist); both now use valid scopes. 512 package tests.

- **A pasted raw rung is tag-checked too.** `draft_rung` validated syntax and the right rail, but accepted any symbol, so a rung copied from another
  program referenced a local tag that does not exist there and failed only at build (Studio: `RxCMP_E_OPERAND_TAGNOTFOUND`). The draft now resolves
  every tag a catalogued instruction names against the composing program, the controller and this draft's staged tags; another program's local tag is
  refused with the owning program named. Two draft tests had used undefined Start/Run tags and now use real program tags. 512 package tests.

- **A raw rung must supply the right operand count.** `draft_rung` accepted `TON(T,500)`, which Studio refuses with
  `RxCMP_E_AUDIT_INVALIDNOOFOPS`. The validator now checks arity for every modelled instruction (required-to-maximum range, repeating tails
  allowed) and names the slot list and the supplied count; unmodelled instructions keep the raw escape hatch. Tests hold the short and long cases, a
  valid TON, and an unmodelled FAL rung. 513 package tests.

- **A pasted rung is checked for operand types too.** `XIC(D)` with a DINT tag passed `draft_rung` and failed Studio with `INVALIDOPTYPE`. Raw
  validation now reuses the composer's per-operand checks, so literal slot kinds, declared types, array shape, writable destinations and bounds all
  apply to pasted text; keyword slots and `?` placeholders are left to Studio. Staged structures resolve member paths (`T.DN` is BOOL), and a fixture
  that read a DINT in a contact was corrected. 513 package tests.

- **The raw path and the composer now share one slot-rule implementation.** The writable/array/bounds/type rules lived inline in the composer, so
  pasted text escaped them (`ADD(D,1,5)` passed the draft; Studio fails a literal destination with `INVALIDOPKIND`). The rules moved into `checkSlot`
  and both paths call it after the operand type check; a raw-text test asserts the literal-destination refusal. No rule is stated twice, so the two
  entry points cannot drift. 513 package tests.

- **Two outputs in series are legal, and the tests now say so.** `XIC(B)OTE(B)OTE(C);` composed and imported, and Studio built it 0/0
  (ACD sha 5147a2ed...), so a rule forbidding a second output would be stricter than the vendor. Both the raw rung and the composer must accept it;
  a regression test holds both. 514 package tests.

- **The Structured Text draft pipeline is pinned and vendor-built.** `replace_st` refuses a missing routine, refuses a ladder routine
  (`UNSUPPORTED_TARGET`), refuses an unterminated block comment (`INVALID_ST`) and writes the replacement as numbered ST lines. The same drafted
  body composed through `draft_st` imported and built 0/0 (ACD sha f5c8fe0a...), proving the STContent shape Studio accepts. 515 package tests.

- **Routine creation writes valid ST and RLL bodies.** `draft_routine` had no success test for either language. Tests now create an ST routine
  (numbered STContent lines) and an RLL routine, and refuse an unterminated ST body (`INVALID_ST`), a rung that never reaches the rail
  (`INVALID_LADDER`) and a duplicate routine name (`NAME_COLLISION`). Both created routines composed through the tools imported and built 0/0
  (ACD sha a8b2b374...), with the change summary naming both routines and the ST body. 516 package tests.

- **One changed routine builds through the ACD workflow, and a denied write is no longer called a plugin defect.** `export_acd_to_l5x` captured
  `e2e-ship2.ACD`; replacing the placeholder `TON(Timer,?,?)` with `TON(Timer,1000,0)` and running `build_acd_from_draft` produced a partial
  import of only `Main.MainRoutine`, built 0/0, exported `e2e-built.L5X` and returned `download_ready: true` with a verification id (ACD sha
  f06f2121...). Separately, a provider write denial escaped as `INTERNAL` with "plugin defect" advice; it is now `WRITE_DENIED` naming the
  destination, the provider reason and a usable fix, with a regression test. 517 package tests.

- **Both write paths report a denied write the same way.** `document_project` also writes through the provider; a denial there was
  untested. The test now asserts `WRITE_DENIED` naming the reason and that no file was written. Live check: `read_controller_clock` on
  the 5069-L320ER/A at 192.168.1.3 reports `clock_supported: false` with the vendor reason instead of guessing, beside controller identity and host
  time. 518 package tests.

- **Alarm definitions compare like any other component.** `compare_projects` claimed alarms but had no alarm fixture at all. A test now embeds
  one `<Alarm Name="HiTemp">` in each of two exports, confirms the reader counts it, changes only its description and asserts exactly one
  `alarm`/`HiTemp`/`changed` result. 519 package tests.

- **Alarm definitions are listed, read and compared.** A third alarm test lists the alarm row (name, element kind, description), reads it with
  `get_component`, refuses an unknown alarm name with `COMPONENT_NOT_FOUND`, and compares an export with no alarm against one with an alarm to get a
  single `added` change. The alarm reader is now covered from list through compare. 520 package tests.

- **The documentation bundle now carries alarm definitions.** PROJECT.md gained an `## Alarms` table (name, element kind, description), the bundle
  counts expose `alarms` and the summary line states the count. A test documents an export with one `HiTemp` alarm and asserts the section, the row,
  the count field and the summary. 521 package tests.

- **Parallel branches are drawn with their join.** The diagram stacked branch paths but never drew their re-convergence, and reported the branch as
  flattened. Each path now gets a stub to one vertical join bar, so the merge is visible; the layout note is empty for branches. Preview tests assert both
  paths, the join colour and no flatten note. 521 package tests.

- **A mixed-language program is drawn and refused correctly.** The tests covered ST and RLL diagram behavior; FBD and SFC were untested. A test now builds a
  program with one RLL routine plus one FBD and one SFC routine, asserts `l5x_routine_diagram` refuses each non-ladder routine with its language named,
  and asserts `l5x_diagram` draws only the single ladder rung. 523 package tests.

- **A diagram refusal says which of three conditions is true.** `l5x_diagram` answered a missing program, a missing routine and a program that exists
  with no ladder all with `NOT_FOUND`. It now distinguishes them: `NOT_FOUND` names the absent program or routine, and `NO_LADDER_ROUTINES` says a
  program exists but holds no RLL content. The skill also names the Alarms table the documentation bundle now writes. 524 package tests.

- **A routine-diagram refusal names the right missing thing.** `l5x_routine_diagram` reported a missing program as "no routine named X in
  Nope" and an existing empty ladder routine as `NOT_FOUND`. It now returns `NOT_FOUND` naming the absent program (with program candidates), keeps the
  routine-specific `NOT_FOUND`, and answers `NO_RUNGS` when the routine exists but is empty. Tests cover all three. 526 package tests.

- **A mistyped routine filter no longer produces a silent, incomplete bundle.** `document_project` validated an unknown program but not an unknown
  routine, so `routines: ["NoSuchRoutine"]` matched nothing and reported success. The filter now resolves against the selected programs and refuses an
  unknown name with `COMPONENT_NOT_FOUND` and routine candidates; nothing is written. Tests cover the refusal and a valid filter that documents one
  routine. 527 package tests.

- **`run_checks` refuses a misspelled rule instead of reporting a clean project.** The rule list is now explicit and complete - 37 rules,
  including the four chosen by an expression inside `report(...)` and the ones the remedy map never lists (`SERIAL_PORT_INSTRUCTION_UNSUPPORTED`,
  `IREF_TAG_NOT_PROVIDED`, `OREF_TAG_NOT_PROVIDED`). An unknown rule answers `INVALID_ARGUMENT` with the rule candidates, and the name is
  matched without case. A drift test scans the source for every emitted rule and fails if the list falls behind. 529 package tests.

- **The `run_checks` description now matches the tool.** It named only some of the 37 rules and said nothing about filter validation. It now states the
  37-rule scope in one sentence (tags, scheduling, rungs, FBD wiring, serial support, I/O change, safety), that each finding names its rule, severity,
  evidence and fix, and that an unknown rule filter is rejected. Regenerated `docs/reference/tools.md`. 529 package tests.

- **A block's visible pins are part of the model, the bundle and the comparison.** FBD decoding dropped `VisiblePins`, so a pin edit was invisible
  to `compare_projects` and missing from the diagram table. The model now carries `pins`; the `rungs/<program>.md` table gained a Pins column; and a
  VisiblePins change is reported as a diagram change. Tests cover the documented column and the comparison. 531 package tests.

- **`run_checks` reports a wire to a pin the block does not show.** FBD decoding now carries a block's `VisiblePins`, so the checker compares
  every wire pin with the block's declared pins. A wire to an undeclared pin is `FBD_WIRE_PIN_NOT_VISIBLE` (warning) naming the block, the pin and
  the pins it does show; a wire to a declared pin is clean. The rule list is 38. 533 package tests.

- **SFC charts are checked too.** `run_checks` returned nothing for SFC. The chart decoder now keeps each step's `InitialStep` marker and three rules
  were added: `SFC_LINK_TARGET_MISSING` (critical, a link to a step or transition the sheet does not hold), `SFC_NO_INITIAL_STEP` and
  `SFC_MULTIPLE_INITIAL_STEPS` (warning), each with the step ids. Tests cover all three and a clean chart; the rule list is 41. 536 package tests.

- **An SFC link may cross sheets.** The link check resolved targets per sheet, so a valid link to a step drawn on another sheet would have been a critical
  finding. Targets now resolve anywhere in the chart. A test links sheet 1 to a step on sheet 2 and expects no `SFC_LINK_TARGET_MISSING`. 537 package tests.

- **The composers and the checkers agree.** A sheet written by `draft_fbd` and a chart written by `draft_sfc` are reopened and passed through
  `run_checks`: both report no FBD/ICON/OCON/IREF/OREF finding and no SFC finding. This pins the composer output against the rules added in rounds 72-74,
  so a change to either side that breaks the agreement fails a test. 539 package tests.

- **The diagram document names the initial SFC step.** The FBD/SFC table gained an Initial column: a step Studio marks `InitialStep` shows
  `yes`, every other row is blank. A test documents a two-step chart and asserts the initial row and the unmarked one. Live check: `read_controller_mode`
  against 192.168.1.3 through `DESKTOP-N9UEQO4!AB_ETHIP-1\192.168.1.3` returned `Run` (read-only, snapshot sha 38a68c3c...). 540 package tests.

- **The rule list cannot go stale either.** The drift test proved every emitted rule is listed; a name left in the list with no emitter would still pass
  and accept a filter that can never match. The test now asserts set equality in both directions: no emitted rule missing, no listed rule unemitted.
  540 package tests.

## 0.74.0 — 2026-11-01

### Added

- **A composed rung matches the instruction spelling its project already reads.** Logix Designer 36 renamed
  sixteen ladder instructions — `EQU` became `EQ`, `SQR` became `SQRT`, `MOV` became `MOVE`, `TRN` became
  `TRUNC`, and twelve more — so one project can legitimately carry either spelling. The new
  `packages/l5x/src/engine/mnemonics.ts` holds that table once, resolves either spelling on lookup, and lets
  `compose_rung` write the spelling the export's own rungs use (`spellingForProject`), falling back to the
  catalog name when the project uses neither. `run_checks` gains `MNEMONIC_VERSION_MISMATCH`, a warning that
  names the spelling the project's `MajorRev` publishes instead of leaving the mismatch to the Studio build.
- **A name Studio will refuse is refused at draft time.** `packages/l5x/src/engine/names.ts` states the identifier
  rules an export never records — first character a letter or underscore, the rest letters, digits and underscore,
  at most 40 characters — and `add_tag`, `add_routine` and `add_udt_member` now run them before staging. Each
  failure carries the repair and a legal suggestion (`1Pump` → `_1Pump`, `Start PB` → `Start_PB`), so the author
  fixes it in one turn instead of at build time.
- **A function block diagram is checked as a graph, not just drawn.** An FBD routine is a wire graph the export
  never describes, so a sheet Studio refuses is indistinguishable from one it accepts. The new
  `packages/l5x/src/engine/fbd.ts` reads the nodes the reference walker already decoded and reports
  `FBD_DANGLING_WIRE` (a wire naming an element that is not on the sheet), `IREF_TAG_NOT_PROVIDED` /
  `OREF_TAG_NOT_PROVIDED`, `OREF_DUPLICATE_DESTINATION` (one tag written from two output references, matched
  case-insensitively), the connector rules `ICON_NAME_NOT_PROVIDED`, `OCON_NAME_NOT_PROVIDED`,
  `ICON_NO_MATCHING_OCON`, `OCON_DUPLICATE_NAME`, `ICON_NO_OUTBOUND_WIRE`, `OCON_NO_INBOUND_WIRE`, and
  `FBD_FEEDBACK_CYCLE` for a wire loop that cannot be scheduled. `run_checks` runs it over every FBD routine; an
  SFC routine is never judged by these rules, because its `DirectedLink` elements are a different language.
  Covered by `packages/l5x/test/fbd.spec.ts`, which drives the mutation through `run_checks` on the committed
  synthetic export and the loop and connector rules through the checker directly.
- **A rung that drives nothing is reported, not left for the build.** `packages/l5x/src/engine/rung-rules.ts`
  judges the rungs an export already contains, reusing the same parser `compose_rung` trusts: `RUNG_NO_OUTPUT`
  when a rung's last instruction reads the condition and never drives the right power rail (`XIC`, `EQU`, `ONS`
  and the rest of that set, including a trailing branch whose every path reads), and `SBR_NOT_FIRST` when a
  routine declares `SBR` but its first rung does not open with it. A rung the parser could not read is left to the
  parse finding rather than reported twice, and any instruction whose rail behaviour needs a pin model is left
  alone rather than guessed at. Covered by `packages/l5x/test/rung-rules.spec.ts`, which also asserts both rules
  stay silent on the committed fixture.
- **The instruction catalogue names both published spellings.** Every `list_instructions` row for one of the
  sixteen instructions Logix Designer 36 renamed now carries `also_published_as` (`SQR` → `SQRT`, `EQU` → `EQ`,
  `MOV` → `MOVE`), so a caller composing a rung sees that both forms are catalogued and does not have to know
  which one the project happens to read. `compose_rung` accepts either and writes the spelling the export already
  uses. `packages/l5x/test/instructions.spec.ts` asserts the field appears for a renamed instruction and is absent
  for one that was never renamed.

- **Ten more instructions a rung can actually use.** The string family (`CONCAT`, `MID`, `FIND`, `INSERT`, `DELETE`,
  `LOWER`, `UPPER`, `RTOS`), file fill (`FLL`) and the subroutine label (`SBR`) are now catalogued, taking the catalogue
  from 118 to 128 instructions. Operand order is not guessed: each one was read out of the vendor instruction metadata
  the composer's own generate templates use, so `MID(Source,Qty,Start,Dest)` and `FLL(Source,Dest,Length)` are the order
  Studio writes. `SBR` carries no operands — its parameters are the arguments the calling `JSR` passes — which also
  makes `SBR_NOT_FIRST` judge a mnemonic the catalogue previously did not know.

- **A string slot is typed, so a BOOL tag cannot sit where a string belongs.** The string family added in this release
  declared its source and destination slots as `ANY`, which validated nothing: `CONCAT(Start,TextB,TextOut)` composed
  happily with `Start` a BOOL, and Studio rejected it later. Those slots are now `STRING` — `CONCAT`, `MID`, `FIND`,
  `INSERT`, `DELETE`, `LOWER`, `UPPER`, `RTOS` — while the count and start slots stay numeric, so `MID(TextA,Count,Count,TextOut)`
  still composes. A wrong tag and a numeric literal each fail with the type the slot needs. `packages/l5x/test/instructions.spec.ts`
  composes into an export that carries STRING tags, so the check is exercised against a parsed project rather than a stub.

- **A rung can carry an expression, a routine name and a label.** Every operand was forced through tag
  resolution, so five common instructions could not be composed at all: `CPT(LineSpeed + 5.0,Total)` and
  `CMP(LineSpeed > 5.0)` failed with "is not a tag or a number", and `JSR(MainRoutine)`, `JMP(Label)` and
  `LBL(Label)` failed with `TAG_NOT_FOUND` because a routine name and a label are not tags. Three slot kinds now
  say what an operand really is: `EXPRESSION` is text with operators, checked only for the shapes that would
  corrupt the rung (an unbalanced bracket, an unterminated string, an embedded terminator); `ROUTINE` resolves
  against the export's routines and its refusals are `ROUTINE_NOT_FOUND` with the routine names as candidates;
  `LABEL` must be an identifier. The composer also emits the **resolved** operand text now, so a JSR keeps the
  case the export uses rather than the caller's (`mainroutine` → `MainRoutine`).

- **Nine instructions had the wrong operand count, and Studio would have rejected every rung using them.** The
  compact table declared `MVM` with 2 operands (it takes Source, Mask, Destination), `GSV` and `SSV` with 3 (they take
  Class, Instance, Attribute, then a destination or source), `SQO` with 3 (it takes six), `SQL` with 3 (five), `FAL`
  with 3 (six), `FSC` with 3 (five), and `BSL`/`BSR` with 3 (four, because the source bit sits before the length).
  The counts now come from the vendor operand fields in written order, including the Length and Position fields a
  control structure carries — exactly the fields a pins-only reading of the metadata misses. `SQO`, `SQL`, `FAL`, `FSC`,
  `MVM`, `GSV` and `SSV` moved out of the compact table into explicit entries, so each has one home.
- **A system class, instance and attribute is a keyword, not a tag.** `GSV(Program,MainProgram,LastScanTime,Dest)` and
  `SSV(...)` name controller classes, not tag references, so the new `KEYWORD` slot kind validates them as identifiers
  instead of resolving them against the tag table — which refused every GSV and SSV even once the operand count was
  right.

- **An audit of every shared instruction caught five more wrong operand counts.** Comparing all 100 instructions
  both catalogues know against the vendor operand fields found 38 differences; most were their block-pin lists
  (a timer's `.PRE`/`.ACC` are structure fields, not operands, so our two-operand `TON` is right). Five were real:
  `BTD` takes five operands, not three (source bit and destination bit sit inside it), `MEQ` takes three, not two
  (a mask), `AVE` takes six, not two, and `OSR`/`OSF` take a storage bit **and** an output bit, not one operand.
  The audit is repeatable: it reports 33 remaining differences, which is the motion family and the block-pin
  instructions, both of which need their own pass rather than a mechanical fix.

- **The motion family is catalogued from its instruction-box fields, 92 operands across 13 instructions.** Our whole
  motion row was a placeholder — `MAJ`, `MAM`, `MAPC`, `MAS`, `MATC`, `MAH`, `MDF`, `MDW`, `MGS`, `MGSP`, `MRP`, `MSF`
  and `MSO` each carried one or two operands, so every real motion call was refused by the arity check that was
  supposed to protect it. Each now carries the fields its instruction box shows, in written order — `MAJ` has 17,
  `MAM` 20, `MAPC` 14, `MSO` 2 — which took the arity audit from 33 differences to 20. Operand kinds stay `ANY` on
  purpose: this catalogue cannot verify `AXIS`, `MOTION_GROUP` or the unit enumerations, so it validates presence and
  order and never claims a type it cannot check.

- **The write path was probed end to end and found sound, so its contract is now tested.** Driving
  `draft_rung` → `draft_validate` → `draft_apply` → reopen showed renumbering closes correctly (0…7 after an
  insert at the top), the rung comment survives, an array tag carries `Dimensions="4 2"`, and a two-line
  Structured Text body becomes exactly two `<Line>` elements with **no newline inside any CDATA** — the shape
  Studio refuses. None of that was covered by a test (`drafts.spec.ts` covers renumbering, not declaration
  dimensions or ST line splitting), so `packages/l5x/test/write-contract.spec.ts` now holds all four: the
  array attribute, its absence on a scalar, the one-line-per-`<Line>` rule, and that the written file reopens
  with the new routine listed.

- **`FOR` now runs a routine, and a `JSR` may pass as many parameters as it needs.** The compact table gave `FOR`
  a routine name, a source and an expression — neither the right count nor the right meaning. It takes the routine
  it loops over plus Index, Initial value, Terminal value and Step size, confirmed against two independent sources
  (the vendor operand metadata and the published description "each time the FOR instruction executes the routine,
  it adds the Step size to the Index"). Separately, `JSR` could carry only a routine and **one** parameter, so a
  subroutine taking three arguments was refused; a slot can now be marked as repeating, and `list_instructions`
  reports `rest: true` so a reader can see the parameter list is open-ended.

- **A tag that exists in another scope is no longer reported as absent.** `resolve_tag { address: "MainTimer" }`
  at controller scope answered *"Declaration is absent from the export"* — while the tag is declared in
  `MainProgram`. That is the kind of refusal that sends a reader hunting a typo that is not there. The resolution
  now says which scope does declare it and returns the scopes in a `scopes` field, so a caller can retry with
  `scope: "MainProgram"` instead of concluding the tag does not exist. A name no scope declares still answers
  *"absent from the export"*.

- **Alarms, every component kind and both diagram languages are now tested.** The word "alarm" appeared nowhere in
  the suite, so a project's `TagBasedAlarm` list was advertised and unverified — a kind that silently returns nothing
  looks exactly like a project with no alarms. `packages/l5x/test/surface-contract.spec.ts` holds the positive case:
  the alarm is listed by name, kind and description, it opens, and the overview counts it. The same file walks all
  eight component kinds (list, then open the first row), asserts an absent name is a repairable `COMPONENT_NOT_FOUND`
  rather than a crash, and checks that `search_logic` reaches a Sequential Function Chart step operand and an FBD
  reference operand while finding nothing for a topology element that carries no label.

- **A malformed composition spec no longer reports itself as a plugin defect.** `compose_rung` with `{}` answered
  `INTERNAL: Cannot read properties of undefined (reading 'toUpperCase')`, and a numeric mnemonic answered
  `INTERNAL: name.toUpperCase is not a function`. By this codebase's own contract `INTERNAL` means the tool is broken,
  so both told the reader the wrong thing about whose mistake it was. The spec arrives as caller-supplied JSON and is
  now shape-checked: a node must be an object, an instruction node must carry a non-empty mnemonic, and every operand
  must be a string — each refused as `INVALID_LADDER_SPEC` with the shape to use instead.
- **A target that is not there is no longer called ambiguous.** `XML_REGIONS`/`acd-edit` threw
  `AMBIGUOUS_TARGET: Expected one Routine named NoSuchRoutine; found 0` — a code that sends a reader looking for
  duplicates that were never there. Zero matches now answers `COMPONENT_NOT_FOUND` with the declared names as the next
  call; only more than one match stays `AMBIGUOUS_TARGET`.
- **The failure surface is now tested.** `packages/l5x/test/failures.spec.ts` throws an empty export, a non-L5X XML
  document, a truncated export, an unclosed export, a missing path and five malformed specs at the tools and asserts
  every answer is a repairable code and **never** `INTERNAL`.

- **Documentation covers the whole program, not just its ladder.** `document_project` skipped every routine whose body was
  not `RLL`, so a bundle reporting "3 routines" documented one of them — and the committed fixture alone has a Structured
  Text `FaultHandler` that appeared nowhere. A function block diagram is now written as a per-sheet element table (element,
  reference, from-id, to-id), a sequential function chart the same, Structured Text as its quoted source, and a language
  the reader does not decompose is named with its note. The tool description says what it produces, and
  `packages/l5x/test/documentation.spec.ts` asserts all three: the ST routine's source, an FBD sheet with its `IRef` and
  `Wire` rows, and an SFC sheet.

- **`compare_projects` is tested on the languages that are not ladder.** It is the tool a reviewer uses to judge an
  edit, and a comparison that answers "no changes" while a Structured Text body or a diagram changed would be worse
  than one that fails. Probing confirmed it does see them — component `structured_text` for an ST body, `diagram` for a
  function block operand and for a chart step — and nothing held it, so
  `packages/l5x/test/compare-languages.spec.ts` now covers an ST body change, an FBD operand change, an SFC step
  change, a rung change and a whitespace-only edit that must report nothing.

- **`l5x_diagram` no longer refuses a call over a folder it defaulted itself.** On a host that cannot make the
  workspace path absolute, the tool threw `INVALID_ARGUMENT: The workspace path .l5x-diagram/l5x-diagram.svg is not
  absolute` — blaming an `output` argument the caller never passed, and discarding a page that had already rendered.
  Its sibling `l5x_routine_diagram` already coped: it returns the rung list and says why no image was written. The
  whole-project diagram now does the same — the answer carries the rung count, the page window and an `image_error`,
  and only the image is missing.

- **An I/O change against a baseline says which field changed.** `run_checks { baseline_id }` reported *"I/O module
  Local changed"* and left the reader to diff the export by hand — while the change record it already holds carries
  both sides. The finding now names the fields: *"I/O module Local changed: catalogNumber 1769-L33ER to
  1769-L33ER-X"*, listing up to four fields and counting the rest. `packages/l5x/test/checks.spec.ts` covers it, and
  the matching case that two identical exports report no I/O change at all.

- **Four more findings name the places they found instead of only the count.** `MULTIPLE_SCHEDULES` said a program was
  "scheduled more than once" without naming the tasks; it now says `scheduled in 2 tasks: Fast, Slow`.
  `MULTIPLE_OUTPUT_WRITES` said "Multiple indexed writes to output-like symbol X"; it now names the sites
  (`Main::R rung 0, Main::R rung 1`). `DUPLICATE_OUTPUT` and `LATCH_WITHOUT_RESET` now list the rung numbers they
  already held, and the latch finding keeps the tag's own casing (`latches Latch`, not `latches latch`). Each one is
  data the record already carried; only the sentence was withholding it.

- **An instruction the catalogue cannot model no longer claims to take no operands.** `EOT`, `SFR` and `SFP` came from
  the compact table's empty slot lists, so `compose_rung` answered `SFP takes 0 operand(s); 2 were supplied` and then
  told the reader to call `list_instructions` — which would repeat the same wrong answer. That is worse than absence: a
  confident false arity with no way forward. Those three now carry `notModelled`, `compose_rung` refuses them with
  `INSTRUCTION_NOT_MODELLED`, and `list_instructions` reports `operands_modelled: false` with a note rather than an
  empty slot list.
- **Every "unknown instruction" refusal now names the path that does not need the catalogue.** About a hundred of the
  vendor's instructions are not modelled here, so a valid name was previously a dead end. The refusal now says to write
  the rung text with `draft_rung` and run `draft_validate` — verified to accept an uncatalogued mnemonic, since the text
  path validates syntax and tags while Studio remains the arity gate.

- **`run_checks` now says which logic it could not check.** A rung naming an instruction the catalogue does not carry went
  unexamined and unreported, so "no findings" read as "everything was verified". The new
  `UNCATALOGUED_INSTRUCTION` finding is `info` and aggregated: *"1 instruction(s) in this export are not in the catalogue,
  so their operands were not checked: CROUT (1 rung)"*, with the catalogue size and the note that an uncatalogued name
  may still be valid and Studio remains the arity gate. An AOI the export declares is excluded — the committed fixture
  calls `Motor_Control` and stays silent.

- **The skill no longer tells a reader to avoid the text path.** `packages/l5x/SKILL.md` said *"Write ladder through the
  composer, not by inventing NeutralText"* — advice that the unmodelled-operand change made wrong, because for an
  instruction the catalogue does not model the text path is the only way. It now reads *"Compose through `compose_rung`;
  for an instruction it does not model, use `draft_rung` text."* The body still fits its 8000-character budget (7975
  after the edit, rebalanced by shortening the `list_instructions` bullet).
- **The coverage finding reaches the draft path.** A staged rung naming an uncatalogued instruction reports
  `UNCATALOGUED_INSTRUCTION` in `draft_validate`'s `new_findings`, so the reader learns which part of their own edit
  went unexamined before it is written.

- **Two control-transfer failures are reported: a `JSR` to a routine its own program does not declare, and a `JMP`
  with no `LBL` of that name in its routine.** Neither could build, and neither was reported — a project that jumps
  nowhere read clean. The targets are written in the rung, so no vendor table is needed: `UNRESOLVED_ROUTINE` names the
  routine and where a same-named routine does live (*"P1::R jumps to Ghost … a routine of that name exists in P2, and a
  JSR can only call a routine in its own program"*), and `LABEL_NOT_FOUND` names the label and rung. A `JSR` to a routine
  in its own program and a `JMP` with a matching `LBL` stay silent, which the tests assert.

- **Three named bindings that point at nothing are now reported.** A program that names a main routine it does not
  declare (`MAIN_ROUTINE_MISSING`), a task that schedules a program the export does not declare
  (`SCHEDULED_PROGRAM_MISSING`) and two routines in one program whose names differ only in case
  (`DUPLICATE_ROUTINE_NAME`, reported under the spelling declared first) all previously passed `run_checks` clean,
  though none of them builds. Each name is written in the export, so these need no vendor table.

- **The SDK verify path checks the file before the SDK, and a missing export is no longer a plugin defect.**
  `verify_offline_l5x` probed the Studio installation first and then read the export from disk, so a file that was moved,
  deleted or (in a harness) never written surfaced as `INTERNAL: ENOENT: no such file or directory`. The local
  preconditions now run first — the export must still be on disk and still match the hash taken at `open_project` — and
  a missing file answers `FILE_NOT_FOUND` with the reopen it needs. That also makes the refusal deterministic: it no
  longer depends on a Studio installation being present.
- **`verify_offline_l5x` documents the gate that fires first.** Its description said only "Build needs project revision
  37+", while the SDK actually refuses when the export's revision has no matching installed Logix Designer — observed
  here as `STUDIO_VERSION_UNAVAILABLE: Studio 5000 v33 is not installed; … Installed versions: 36, 37`. The description
  now states that gate, then the 37+ build requirement, then `probe=true`.

- **A failed offline build that reports nothing no longer gives advice that cannot be followed.** The real Studio engine was
  driven end to end for the first time here (183 seconds, bridge built, project opened) and it stopped at `open_source`
  with `sdk_error: null`, `diagnostics: []` and a single log line — while `next_step` still said *"Read diagnostics,
  correct the L5X"*. The next step is now the pure `verifyNextStep`, and a silent failure says so, names the two gates
  (a Logix Designer release installed for the export revision, and project revision 37 or later for a build) and points
  at `log` as the evidence instead of an empty list.

- **A run stopped at its time budget is reported as a timeout, not as a project that failed to open.** Driving the real
  Studio engine end to end showed the shape of the bug: the bridge was killed by its own 180-second timeout (observed
  elapsed 183,546 ms), a killed child closes with `code: null` and no message, and the stage fell through to
  `open_source` with `sdk_error: null` and no diagnostics — so a hang looked like an export Studio refused to open. The
  child is now remembered as having been killed, the stage is `timeout`, the result carries `timeout_ms`, and the advice
  says the run was stopped, that nothing was learned about the export, and to retry once the engine is warm or build it
  in Studio 5000. The verify budget is 300 seconds because a cold first open starts the engine and took 183 seconds
  here; re-running against the real engine at 300 seconds confirmed the diagnosis (elapsed 301,936 ms, staged
  `timeout`), which also shows that a structurally minimal L5X does not open — the import waits indefinitely.

- **A timed-out verification says how far it got.** The result now carries `reached` (the last line the bridge printed),
  `export_revision` and `probe_build`, and the timeout advice quotes it: *"The run was stopped at its time budget… It
  stopped after: Open project started."* That came from driving the real engine twice: a v36 export, opened under
  `probe`, printed one progress line and then blocked past both a 180-second and a 300-second budget, so a reader can
  now see that the engine never left the open step rather than guessing which part of their logic is wrong.

- **A real 60-routine v37 GuardLogix project cut `run_checks` from 537 findings to 271, and two of those classes were our
  bugs.** Module-defined tags are now resolved from the module that declares them, so `BottomKnife_MP2600iec:I.Data[0].3`
  no longer reads as an unknown symbol (236 findings to 0). Radix literals no longer yield symbols, so `MOVE(16#F000,
  Wrk_Mask)` stops inventing a tag named `F000` (the last 15). `DUPLICATE_OUTPUT` keys on the whole address rather than
  the text before the first dot, so two bits of one I/O word are no longer one output driven twice (31 findings to 1,
  and the survivor is a genuine double write). Safety-locked is now read by value: a standard GuardLogix export carries
  `<SafetyInfo SafetyLocked="false">`, which presence-testing would have refused as a locked controller.
- **The safety refusal is confirmed against real hardware.** The supplied project declares `SafetyProgram1` with
  `Class="Safety"`, a safety Task and safety network ports, so `verify_offline_l5x` refuses it by design — the offline
  import aborts on safety controllers. Its 7 uncatalogued "instructions" (`MAM_YASKAWA`, `MCFG_YASKAWA`, …) are Yaskawa
  add-on-profile instructions rather than AOIs, so reporting them as unmodelled is correct.

- **The analysis tools now name the scope that declares a symbol.** On the supplied project, `trace_dependencies` resolved a
  tag that `usage_map` then called "not declared in scope"; and a program-scoped symbol read in controller scope was
  reported as *"Declaration is absent from the export"* — a statement about the export that was false. Both refusals now
  say where the declaration lives and which `scope` to pass (*"Tag "Prg_CutSpeedUp_Cmd" is not declared in scope
  "MainTask_10ms"; it is declared in controller."*), backed by a new `declaringScopes` helper that answers controller,
  program and AOI scopes.

### Fixed

- **Every renamed instruction resolves in both spellings.** The alias table covered 8 of the 16 pairs, so a
  composed rung naming `SQRT`, `EXPT`, `MOVE`, `LIMIT`, `ACOS`, `ASIN`, `ATAN`, `TO_BCD`, `BCD_TO` or `TRN` was
  refused as an unknown instruction even though the catalog declares its pair.
- **The right-rail guard sees the modern comparison spellings.** A rung ending in `EQ(`, `NE(`, `GT(`, `GE(`,
  `LT(` or `LE(` leaves the right power rail undriven exactly as `EQU(` does, and is now refused the same way.
- **The catalogue no longer declares three instructions twice.** `SQR`, `BSL` and `BSR` appeared in both
  `instructions.ts` and `instruction-set.ts`, so the catalogue was 121 entries for 118 names. One home per
  mnemonic: 118 entries, 118 names.

326 package tests and 70 bundle tests pass.

## 0.73.0 — 2026-10-31

### Added

- **A tag row drills into what is under it.** The tag organizer now expands an array into its elements, a
  user-defined type into its members, and an add-on instruction instance into its own parameters — typed,
  indented, searchable, and each child carrying the value the export recorded for it. The add-on instruction
  node in the controller organizer opens onto its parameter list the same way, so a block's pins can be traced
  back to the definition they come from. Covered by `e2e:actions`, which expands a `DINT[5]` and an
  `AOI_Alarm` instance in the real browser and reads the rows that appear.
- **The whole instruction set renders, not just the ones an export happens to use.** The catalogue the composer
  validates against (`packages/l5x/src/engine/instructions.ts`) grew from 42 instructions to **121 entries / 118
  distinct names** — math, file and array, sequencer, ASCII, string, process, alarm, motion, program control and the
  migrated PLC-5/SLC set — and the ladder now derives its pin labels from that one catalogue, so an instruction that
  exists cannot be drawn without a label. `npm run e2e:instructions` builds an export with **one rung per catalogued
  instruction** and renders it in the real browser: `121/121 instructions rendered, 132 blocks, clipped 0, generic
  labels 0`. `test/instruction-coverage.spec.mjs` holds the same invariant in the fast suite, where the failure mode
  (a block silently reading `Operand 1`) is one missing map entry away.
- **Contacts look like contacts, and every block names its pins.** XIC is drawn as two short bars on the wire and XIO
  adds the slash; a coil is two facing arcs with the latch letter between them — the shapes Studio 5000 draws, not
  boxes. Blocks label their operands from a catalogue of the instructions a Logix export carries
  (`packages/viewer/src/client/instructions.ts`), and an **add-on instruction call labels its pins from its own
  definition** in the export, so `AOI_EncoderLinear` reads `RawCounts`, `PPR`, `RollerDiameterIn`, `GearRatio` rather
  than `Operand 1`..`Operand 7`. Measured over the 57 exports in `_e2e/out`: **68 distinct mnemonics, 68 labelled**
  (was 42), and 200 AOI calls now label themselves; `e2e:ladder` grew a `Frequency_Calc` case that fails if every
  block falls back to `Operand N`.
- **The ladder face has an end-to-end suite.** `npm run e2e:ladder` mounts the built
  `packages/viewer/lib/client.js` in a real headless Chrome, opens a routine the way a reader clicks it in the
  organizer, and asserts on the rendered DOM: no clipped text anywhere in the pane, one tag label per instruction, no
  label escaping its cell, no two labels overlapping, and every value the export records actually on screen. Ten cases
  cover three exports and two controller families (`_e2e/out/CT9-Source.L5X`, `CT10-Source.L5X`, `Century-fixed.L5X`)
  at 1680x1200 and 1280x900, including a 95-instruction rung list. `test/render/e2e.mjs` renders one routine,
  `diag.mjs` dumps the measurement and `probe.mjs` one instruction's computed style.
- **Every routine of an export is judged, not just the sampled ones.** `npm run e2e:routines` opens every routine the
  organizer lists — 256 routines across the CT9, CT10, CT8, Slitter and PLC-5-migrated fixtures plus the Century SLC
  migration — in one browser and applies the same assertions to each, so a ladder shape that only occurs in an
  unscheduled program or a migrated routine cannot slip through.
- **A rung answers for itself.** Right-clicking a rung opens its own menu - ask Arya about that rung, watch every
  tag it touches in one action, show or hide its NeutralText, copy its source, or ask Arya for a new rung comment -
  instead of the operand menu with the rung text pasted into it. The prompt names the program, routine and rung, so
  the answer is about the rung a reader pointed at.
- **A routine row answers for itself too.** Right-clicking a routine in the organizer names the routine in the menu
  and in its prompt, and can open it, instead of asking Arya about the two words "Program/Routine". A program row and
  a module row do the same for their program and their I/O module, so every row of the organizer has its own menu.
- **The pane is driven, not only read.** `npm run e2e:actions` clicks and types with a real browser: a click focuses an
  instruction, arrow keys walk the rung, a rung number selects its rung, the source view shows the exported
  NeutralText, the organizer filter narrows the tree, the tag table opens and sends a tag to the offline watch pane, the
  bottom panes switch, and the console stays silent throughout.
- **An instruction comment cannot overprint its neighbour.** The comment column and the instruction cell now agree on
  one width (`COMMENT_WIDTH`), and the rendered comments are measured for overlap as part of the gate.

### Changed

- **The ladder pane draws like Studio 5000.** Each rung reserves the band its longest instruction comment needs, so
  every glyph in a rung sits on one wire; contact and coil glyphs are green boxes with the tag name beneath; function
  blocks carry a header band and Studio's `label | operand | value` rows with a `◀` value marker; the parallel output
  branch sits on the right rail; values are right-aligned; the wire, rung comment and rung number follow Studio's
  layout. Nothing is ellipsized: long tags wrap instead of truncating, which is what made the old pane show
  `BottomKnife_MP…` and a number that read as part of the tag name.
- **Timer pins are named and filled from the export.** `TON`/`TOF`/`RTO` render `Timer`, `Preset` and `Accum` (with
  `EN`/`TT`/`DN` badges) and read the recorded `PRE`/`ACC`, so the `TON(…,?,?)` an export stores no longer reaches the
  screen as two rows labelled `2` and `3`. Migrated instructions gained the same treatment: `FLL`/`FIL`, `OSR`/`OSF`,
  `CTU`/`CTD`, `CLR` and `MSG` name their pins in English and Chinese.
- **Both client faces build from this repository.** `scripts/build-viewer-face.mjs` and
  `scripts/build-ftview-face.mjs` run before `scripts/build-client.mjs`, so the committed
  `packages/*/lib/client.js` artifacts are output of `npm run build:client` (and `prepack`) rather than
  files nothing here could reproduce. The CSS-module and workspace-path transforms the AryaCode workspace
  used to supply are now in the face build, with the workspace address helpers vendored at
  `packages/viewer/src/client/vendor/workspace-path.ts`.

### Fixed

- **The organizer no longer keys sibling modules by name alone,** which emitted a duplicate-key warning twelve times
  on an export that lists the same module under `A1`/`A2` Ethernet; the key now includes the module's seat in the tree.
- **Three dead rules left the ladder stylesheet,** and a new spec (`test/viewer-face-css.spec.mjs`) keeps the
  stylesheet and the renderer in step: a class the renderer never reads fails the build's tests, and so does a
  `css.<name>` the stylesheet does not define — both used to be invisible, one as dead intent and the other as an
  unstyled element with no error anywhere.

## 0.72.1 — 2026-10-31

### Changed

- **A build error gets three probes, not a session.** The `legacy-to-logix-migration` skill and the row's reference
  now say it plainly: one hypothesis per offline build, and when the third does not move the error, the finding is
  written down — what the error survived, the routine and rung the bisect narrowed it to, the operands still suspect —
  and handed on. A narrowed finding beats a fourth guess, and Studio 5000's own Errors tab names the rung the SDK
  message withholds. The rule came out of CENTURY CABINETS, where the arity error survived an OSR repair, ASCII
  stubbing, a dropped `JSR` operand and two operand swaps before the bisect left one rung.

## 0.72.0 — 2026-10-31

### Added

- **The migration row carries its own answers.** `packages/migration/src/knowledge/instructions.ts` maps 58 legacy
  mnemonics to their Logix candidate, operand shape, work class and a citation (1747-RM001, 1785-6.1, 1756-RM003, or
  `observed` plus the export that showed it). `migration_assess` names the replacement beside each
  `LEGACY_INSTRUCTION` it reports and `migration_resolve` appends the row to every review site's advice, so a marker
  arrives with its answer rather than a research task. Seven new corpus pages in a `migration` domain
  (`packages/resources/corpus/migration/`) cover the arrival points, the PCE codes, the wizard and its revision
  ceiling, placeholder tags, unknown operands, indirect addressing and the instruction map; the corpus is 41 pages.
  `docs/reference/migration.md` documents the layer under "What it knows without research".
- **One manifest describes every component.** `components.json` is now the single statement of what a component is:
  its kind (`product`, `support`, `surface`), its capability class (`offline-file`, `live-ide`, `gateway-api`), its patch
  row, bundle entry, package, tool product, skill and body budget, capability probe, evidence gate and owning documents.
  `test/components.spec.mjs` fails when the manifest and `cordis.patch.yml` disagree, when a tool count or README number
  is stale, when a skill cites a tool that no longer exists, or when a component loses one of its files.
- **`docs/reference/components.md` states the contract** — what a component is, what each capability class means for
  verification, the manifest fields, the ten-step checklist for adding one, and what the checks enforce.
- **The README tool counts are corrected** to the registered surfaces (133 tools: 51 L5X, 47 FactoryTalk View, 24
  MotionWorks IEC, 9 Optix, 2 engineering resources), with a known-gap line for the 9 vendored Optix tools that the
  generated reference cannot build from source here.

- **A migration support row.** `migration_assess` reads an RSLogix 500 `.SLC` export or the `.L5K` the migration
  wizard writes and states the controller, tags, routines, rungs and what a migration still has to change;
  `l5k_lint` reports every import blocker with its line number (`TRAILING_COMMA`, `DUPLICATE_TAG`,
  `ROUTINE_UNBALANCED`, `INDIRECT_ADDRESS`, `PLACEHOLDER_TAG`, and a revision gate note). The row also carries
  the `legacy-to-logix-migration` skill: interview the engineer for target, I/O strategy, HMI scope and validation
  window, never edit the source `.RSS`, and never call a file migrated while a finding is open. Read-only in every
  path: no controller, and the one vendor start (`slc_read`) opens hidden and never saves.
- **`slc_read` reads an RSLogix 500 project headlessly.** It starts the 32-bit Windows PowerShell, opens the
  `.RSS`/`.ACH` hidden through `RSLogix500.Application`, walks `ProgramFiles` and asks each ladder file for its
  rung text, then quits without saving: no window appears and no click is needed. On the Slitter 8 project it
  returns 76 program files (69 ladder), 1,495 rungs and rung text in about four seconds. It needs RSLogix 500 on
  the host and refuses a path that is not a file; without the vendor product, Save As `.SLC` and read that export.
- **`slc_read` reads a PLC-5 `.RSP` too.** RSLogix 5 exposes the same automation surface, so the reader picks
  `RSLogix5.Application` for an `.RSP` and leaves the rest of the walk unchanged: on the staged EN-032 program it
  returns 53 program files (38 ladder), 358 rungs, 2,206 symbol records and 141 data files, hidden and unsaved.
- **`migration_compare` scores the converted project against the legacy one.** It matches ladder file names to
  routines, counts rungs with the terminal `END` left out, maps symbol records and data files to tags, and
  classifies each difference as expected, real or cosmetic. On Slitter 8 it reports 64 matched files, 1,398 of
  1,426 legacy rungs, two real differences and 259 indirect expressions still to engineer, which is the
  exception list the plan records.
- **`migration_plan` keeps the migration resumable.** `create`, `read`, `answer`, `stage` and `exception` act on
  `.migration/plan.json` (schema 1): five interview decisions, eight stages with evidence, and exceptions marked
  `open`, `accepted` or `fixed`. A plan blocks until every decision is answered and `next_action` names what to do.
- **`migration_resolve` answers the conversion's own markers.** The wizard writes `PCE(code,label)` where it could
  not translate an instruction and `?` where it could not type an operand; this tool pairs each site with the
  legacy rung it came from and returns a worklist entry instead of a count. A marker on a rung that already carries
  the legacy instructions in order is a delete; a timer or counter `?` whose preset and accumulator the legacy
  operand list still names is filled from that list, and a rung whose every unknown is answerable carries the whole
  replacement text. `MSG` parameters, a status-word loop index, a status word alone on a rung and expressions the
  wizard flattened stay review, each with the reason. On EN049 it classified 214 sites, 201 of them answerable from
  the rung texts alone; applying those took 177 markers to 22 and 54 rungs with `?` to 9, and the file imported
  into Studio 5000 with no warnings and no errors.
- **`migration_report` writes the document a customer signs.** It pairs the legacy project, the wizard's `.L5X` and
  the corrected `.L5X`, then writes one file: the two programs side by side, the marker census by code with the
  legacy instruction behind each site, the corrections rung by rung with only the text around each change, the
  comparison in full, and the open items that are decisions rather than defects (a placeholder tag standing in for a
  module with no Logix equivalent, a legacy I/O image left as a plain tag array, an array indexed by a tag, sites
  still unanswered, a revision below 37). Name the output `.docx` for a formatted Word document and the row writes
  the OOXML package itself — A4, navy headings, banded tables with a repeating header row, page numbers in the
  footer, no dependency and no vendor application — or `.md` for the same content as plain text. On the Slitter 10
  program it reads 15 markers before and 0 after, 55 rungs corrected and 3 open items, and it writes only the
  report.

### Changed

- **Skill budgets live in the manifest.** The 8000-character assertion moved from the three package skill tests to
  `test/components.spec.mjs`, which reads each budget from `components.json`; the package tests keep registration,
  identity and frontmatter checks only. One fact, one home — changing a budget is now a manifest edit, not three.
- **The migration reference states what the wizard actually asks.** `docs/reference/migration.md` now names the two
  wizard questions (target controller and firmware; keep-existing-I/O versus update-all-I/O, with the placeholder
  tags the second path avoids), the revision 30Ã¢â‚¬â€Å“32 ceiling that leaves wizard output import-verified until someone
  retargets it in Studio 5000 revision 37 or later, and the typeless-data-file rule that keeps an unlabelled PLC-5
  data file out of the unmapped list. The compare evidence for the EN049 PLC-5 program is recorded there: 34 matched
  files, 306 of 320 legacy rungs, 90 data files accounted for, 1 real difference (131 indirect expressions) and
  2 expected ones.
- **`migration_compare` says RSLogix 5 where it always meant it.** The tool read `.RSP` already, but its description
  and its unsupported-format refusal named `.RSS`/`.ACH` only; both now name RSLogix 5 and `.RSP`, and the generated
  tool reference is regenerated.
- **A placeholder tag is the right answer, not a failure.** The migration reference now says so: a module with no Logix
  equivalent (a 1747-SDN DeviceNet scanner is the worked example) becomes a placeholder tag by design, the lint rule
  reports it as `PLACEHOLDER_TAG`, and choosing the replacement belongs to the engineer. The same pass states the
  revision ceiling as what it is — the installed wizard cannot emit 37 or newer, so retargeting the imported project
  in Studio 5000 is the first step before any build verdict is quoted, not an alternative workflow.
- **The migration reference records the SLC 500 side.** The resolution section gained the RSLogix 500 evidence, because
  a SLC 500 conversion numbers its markers differently (105, 109, 110, 114, 134, 135, 160 on
  `SLITTER10_PLC1S0_08JUL2026_0953.RSS`) and yet every one of its 65 sites was answerable from the legacy rungs:
  11 rung rewrites and 44 operand repairs, no markers and no unknown operands left, and a file that imports with
  0 warnings and 0 errors.

## 0.71.0 — 2026-10-30

### Added

- **`ftview_document`** writes a handover bundle for an opened export — `overview.md`, `displays.csv`,
  `tags.csv` and `bindings.csv` — stating object counts per display, which tags each display reads, and
  which bindings name a tag the export does not declare, so a panel builder can review without Studio.
- **`ftview_document` lists screen jumps and admits an absent tag table.** `overview.md` gains a
  navigation table (screen, object, target) built from the export, and an export without a tag CSV now says
  so instead of reporting "0 HMI tag(s)" as if the application had none.
- **`ftview_document` explains every binding status.** `overview.md` documents what
  `hmi tag`, `missing`, `unverified` and `literal` mean in `bindings.csv`, so a reviewer can tell "the export
  had no tag table" from "the export names a tag that does not exist".

### Changed

- **`ftview_check` reports one duplicate-name finding per display and object name, with the count.** A display
  with sixteen objects called `Value` produced sixteen nearly identical warnings, so the number of duplicated
  names could not be read from the result. Each collision is now one `DUPLICATE_OBJECT_NAME` warning naming the
  count and carrying `count` in its evidence. On the CarpenterPilot export the 77 duplicate rows become 9
  findings.
- **`l5x_rung_preview` leads with the paste-ready text, not the picture.** The tool exists to hand back logic
  that goes into a ladder routine, but it drew a diagram by default and reported the image first, so the answer
  looked like a screenshot instead of something to paste. It now returns `paste_text` — the validated rungs, one
  per line — and draws a diagram only when `diagram: "yes"` is passed. The preview L5X document is still written
  for the sidebar viewer.
- **An inserted rung takes the number it names.** `draft_rung` with `mode: "insert"` refused any rung number the
  routine already used, so a rung could only be appended, never put above an existing one. An insert now places
  the new rung at the position it is given — 0 through the current rung count — and renumbers the rungs below it;
  a delete closes the gap the same way, so the routine stays numbered 0..n-1. `before_rung` is accepted only when
  it equals `rung`. Proven on the CarpenterThickness ACD: a rung inserted at position 0 built through the Studio
  SDK with the existing rung renumbered to 1.

### Fixed

- **An export creates the folder it writes into.** `export_acd_to_l5x`, `verify_offline_l5x`, `build_acd_from_draft` and the snapshot tools refused an output path whose folder did not exist (`Output directory does not exist`, with the unhelpful advice to call `project_overview`). The caller has already named the file it wants, so the folder is now created instead of refused; the error remains only when it cannot be created.
- **A module-defined tag is not called unused.** `run_checks` reported module I/O tags such as `Local:1:C` and `TopCutter_MP2600iec:I` as `UNUSED_TAG`, but the module wires them and indexed logic never names them: on the CarpenterThickness export that was 40 of 104 unused-tag rows. Tags whose name ends in a module member suffix (`:I`, `:O`, `:C`, `:S`, `:R`) are now left out, and the finding count there falls from 271 to 230.
- **A vendor COM failure is reported as a sentence, not as CLIXML.** When the ME export server refused
  `LoadMEApp` the tool returned the raw PowerShell serialisation (`#< CLIXML ... 0x80040301 ...`), which buries
  the one line a caller needs. `ftview_apps`, `ftview_export` and `ftview_backup` now decode the error strings
  and pass them on as one capped line, release their COM object before the process ends, and retry one export
  once when the engine reports `0x80040301` — the failure a previous export call leaves behind.
- **Controller system flags are not called unresolved.** `S:` and `R:` addresses are defined by the controller and
  absent from an export, so the review's unresolved-reference pass still reported them: a valid rung using
  `S:FS` produced `UNRESOLVED_REFERENCE` and `draft_validate` warned `Symbol MainProgram::S:FS could not be
  resolved in this export`. The pass now leaves the system flags alone and still reports a genuinely undeclared
  tag.
- **A rung whose right power rail is not driven is refused before it is staged.** Studio rejects a rung that
  ends in a read-only instruction with `RxCMP_E_AUDIT_OUTPUTS`, and that only surfaced at build time: a rung
  such as `XIC(hmi_AutoManual_Cmd)AFI();` passed `draft_rung`, `draft_validate` and `draft_apply`, then failed
  the Studio build. `draft_rung`, the change-set path and `compose_rung` now check the parsed rung's last node —
  and every path of a closing branch — and refuse `XIC`, `XIO`, `ONS`, `AFI` and the compare instructions at the
  rail with the fix that names an output instruction.
- **The ME alarm setup file is no longer reported as an unparsed display.** `Alarms/Alarms.xml` has an
  `<alarms>` root, so `ftview_open` listed `Root element alarms is not an ME display.` as a structural diagnostic
  even though `ftview_check` reads the same file for its alarm findings. The scan records it as an alarm setup file
  instead: `ftview_open` returns it in `alarm_files` and says how many there are, and `UNPARSED_FILE` names only
  files that really failed to parse. The alarm findings are unchanged — the CarpenterPilot export still reports
  its 145 alarm findings, and `ftview_check` there now returns 154 findings instead of 223.
- **A Studio import manifest is no longer reported as an unparsed display.** `ftview_apply` writes
  `Displays/BatchImport_<application>.xml` so Studio's Graphics Import Export Wizard can import the displays it
  changed; reopening that folder reported `Root element gfxImport is not an ME display.` The scan now records the
  file as an import manifest: `ftview_open` and `ftview_reload` return it in `manifest_files`, the display count
  is unaffected, and `UNPARSED_FILE` names only files that really failed to parse.
- **`ftview_check` says which checks could not run.** `coverage` carried only `schema` and `plc_binding`, so an
  export with no HMI tag CSV returned no `TAG_NOT_BOUND` and no alarm tag findings, with nothing to distinguish
  that from bindings that all resolve. It now carries `tag_binding` (`not run: this export has no HMI tag CSV`,
  or the number of tag rows checked) and `alarms` (the setup file it reviewed, or that the export has none), and
  the summary states that display bindings and alarm tags were not checked. The description also claimed the
  alarm setup is read only when `alarms` is supplied, while it has long been read from the export automatically.
- **A tool answer never carries an empty member, so the host can carry it.** Every answer crosses the host as
  lossless JSON, which refuses a document holding `undefined`; one empty optional field failed the whole call.
  `compose_rung` with an explicit `spec_json` tree returned `pattern: undefined` and was rejected as
  `value is not lossless JSON`, so the structure path failed while pattern composition worked. `ftview_list`
  failed the same way whenever the caller omitted `view_id`, because its suggested `ftview_get` call carried an
  empty handle. The success envelope now drops empty members (and turns array holes into `null`) once, for both
  packages; `ftview_list`, `ftview_cross_reference` and `ftview_live_map` also name the view they actually used
  in the calls they suggest.
- **A rung comment is no longer covered by a stacked branch.** The diagram centred the row on the
  comment's band, so a branch's first stacked path was drawn over the comment text. The row now
  descends by the branch's height before drawing, which keeps the comment in its own band and grows
  the canvas to match. Rungs without a branch are unchanged.

## 0.70.0 — 2026-10-29

- **A data file with no type letter is not called unmapped.** The comparator only claims files whose prefix could exist; PLC-5 I/O-structure files carry no letter and used to appear as ?0.
### Changed

- **`ftview_validate` now says when apply will refuse the draft.** A vendor-schema error used to appear only as
  a count in the summary, and the suggested next step was still `ftview_apply`, which then failed with
  `SCHEMA_INVALID`. The result now carries `schema_errors` and `apply_blocked`, the summary reads
  "schema FAILED with N error(s), so ftview_apply will refuse this draft", and the next step points back at
  validation instead of at apply. A clean draft still says "schema ran with no error".
- **Integration coverage for the scaffold and popup paths.** `test/workflow.spec.ts` now also scaffolds an
  existing display and stages (then applies) a popup, so the three authoring entry points that write vendor XML
  — screen, scaffold, popup — are each proven against the installed `Gfx-ME17.xsd`, not only against layout unit
  tests. Both pass unchanged; the only failure was the test fixture, which used a `<caption>` child on `<text>`
  where the vendor schema requires the attribute.
- **Fixed: authored screens and popups were rejected by schema validation.** `ftview_draft_screen` wrote
  `borderStyle="solid"` on panels and navigation buttons (not in `borderStyleEnums`),
  `horizontalAlignment`/`verticalAlignment` on numeric displays (not declared), and `foreColor` on a
  `gotoButton` (caption colour lives on its `<caption>` child). `ftview_apply` correctly refused all of it, so
  every screen from that tool failed at apply. Panels and navigation now use `line`, the numeric display keeps
  the attributes the vendor declares, and navigation buttons carry a light face so the default text stays
  readable.
- **New: `test/workflow.spec.ts` runs the steps a model actually takes** — create a display, author a screen,
  validate, apply, reopen what was written, run `ftview_check` — in one test. It found the three schema defects
  above, which the layout unit tests could not see because they never validate against the vendor XSD.
- **Test harness: files a tool writes are readable again** (`textOf`, separator normalisation, directory
  listing over both maps), so a test can reopen its own output the way the real filesystem allows.
- **A full-screen display whose canvas differs from the rest is named.** `ftview_design_check` adds
  `VIEW-LAYOUT-02` (info) for a `replace` display whose pixel size is not the common one, with the common
  size and how many displays share it; popups (`onTop`) are excluded because they are sized on purpose.
  Measured on the Carpenter pilot export: 14 displays, 0 findings — all full screens are 640x480 — where the
  first cut of the rule had reported the three popups as mismatches.
- **A draft says when a connection names an unknown tag.** Every authoring tool (object add and set, screen,
  popup, restyle) now compares the connection roots it stages against the export tag database and reports
  `unresolved_tags` in the result, with a sentence naming them. A member such as `Motor.Speed` resolves
  against its root, so only genuinely undeclared tags are named. The draft still stages — the point is to
  learn it now rather than after `ftview_apply` and `ftview_check`.
- **`ftview_check` reads the alarm setup without being asked.** An `Alarms.xml` shipped inside the export
  (`Alarms/Alarms.xml`, the layout the wizard writes) is now read automatically, so one call covers the
  display checks and the alarm review: silent triggers, placeholder labels, duplicate expressions, orphaned
  messages, blank text, and alarm tags the export tag CSV does not declare. Passing `alarms` still overrides
  the search; an explicit path is used exactly as given.
- **`ftview_alarm_report` resolves trigger tags against the HMI database.** Pass `tags` (the application
  tag CSV) and every trigger is checked: a trigger watching a tag the database does not define is reported as
  `ALARM_TAG_NOT_IN_HMI` with the tag name. On the commissioning export it found two such tags
  (`Alarm_Word`, `Alarm_Word2`) that the file alone could not reveal.
- **`l5x_routine_diagram` pages like `l5x_diagram` does.** It accepted no offset, so a long routine
  truncated at `max_rungs` with no way to see the rest. It now takes `start_rung` and `max_rungs`, returns
  `start_rung` and `next_start`, and its summary names the rung range drawn and the offset for the next page.
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
- **Verification never guesses.** When the vendor export cannot run, `ftview_verify_import`
  fails with `NO_IMPORT_PROOF` and asks for a folder exported after the import, instead of
  reporting a comparison it did not make; a successful run names what it compared against.


- **`ftview_alarm_report` reviews an alarm configuration.** `ftview_alarm_snapshot` produced the wizard
  XML but nothing read it, so a configuration with 17 triggers that raise no message looked exactly like a
  finished one. The report joins every message to its trigger and returns findings: a trigger with no
  message, a wizard placeholder label ("Label7"), two triggers on one expression, an orphaned message,
  blank message text. On the commissioning export it reads 64 triggers, 47 messages and 17 silent triggers.
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

## 0.69.0 — 2026-10-29

### Fixed

- **The import manifest types each display, not the whole batch.** `ftview_studio_import_prepare`
  takes `current_export` (an export of the application as it stands) and writes `create` for a
  display the application does not have yet and `update` for one it does, reporting the counts. The
  wizard fails the entire batch when one entry's type is wrong, which is how a package of new and
  changed screens failed in the field.
## 0.68.0 — 2026-10-29

### Added

- **`ftview_apply` takes `package: "delta" | "full"`.** A delta (default) lists only the displays
  the draft changed, which is what an application that already holds the screens needs. A full
  package lists every display in the export and copies the artwork those untouched displays name,
  so a fresh application can be built from one import instead of a delta that leaves screens and
  their pictures behind.
## 0.67.0 — 2026-10-29

### Fixed

- **`ftview_apply` copies the artwork a display names.** A display that sets `imageName` was
  broken after import because the wizard copies only the XML, so the folder it produced had no
  `Images/` files. Apply now finds each named image in the export (`png`, `jpg`, `jpeg`, `gif`,
  `bmp`), writes it beside the displays, and returns `images` and `missing_images` — a name the
  export does not carry is reported instead of failing silently. Filesystem providers gained an
  optional `writeBytes`, so binary files are copied byte-for-byte.
## 0.66.0 — 2026-10-29

### Added

- **`ftview_verify_import` compares staged objects, not just display files.** The round-trip check
  now also reports, per display, staged objects the import dropped and fields whose landed value
  differs from the value the draft set (geometry, face colours, caption). That is the difference
  between "the file was accepted" and "the change is on the screen".
## 0.65.0 — 2026-10-29

### Added

- **`ftview_draft_screen` accepts a palette.** `theme_json` overrides the scaffold slots used for
  that screen (backdrop, header, surface, footer, title and footer text), so a customer palette does
  not need a restyle pass afterwards; the result echoes the palette and reports the contrast of the
  two text-on-band pairs, flagging a title that would not be readable.

## 0.64.0 — 2026-10-29

### Added

- **`ftview_studio_preflight` carries an engineering gate.** Alongside parse state and name
  restrictions it now reports critical check findings and house-theme conformance for the edited
  export, and `gate: "fail"` refuses the change set instead of letting an off-theme or broken screen
  reach the manual import step. Findings and per-display theme rows ride along in the result.

### Fixed

- The bundle no longer lists the retired `@aryacode/dsh-engineering-ftview` package as a dependency.

## 0.63.0 — 2026-10-29

### Added

- **`ftview_theme_audit` measures house-theme conformance.** Every display is checked for the
  theme backdrop, a header band, a footer band and the share of its colours already in the palette,
  and each non-conforming display becomes one `VIEW-THEME-01` finding. Deciding which screens still
  need `ftview_draft_restyle` was a manual pass over dozens of displays.

## 0.62.0 — 2026-10-29

### Fixed

- **`ftview_validate` reports an edit aimed at an object that is not in the display.** `DRAFT_TARGET_MISSING`
  names the file, display and object, and the operation that cannot land, instead of failing the whole
  prepare step with `COMPONENT_NOT_FOUND`. The rest of the draft still validates, so one wrong name no
  longer hides the findings for the other operations. A set or delete on an object the same draft added
  is accepted, and an `object_add` can still be followed by edits to the object it placed.
## 0.61.0 — 2026-10-29

### Added

- **`ftview_draft_restyle` repaints an existing display in the house palette.** It walks a display the
  way a person would on a restyle job: backdrop and panel surfaces become the deep theme, text the
  bright colour, and field and button shells the accent, while geometry, objects and captions stay put.
  Reference objects are skipped because the global object owns their look, and indicators or drawings
  are skipped because their colours carry meaning. `theme_json` overrides any colour; the display
  backdrop is staged as a display setting, so `ftview_draft_display_set` remains the audit trail.
## 0.60.0 — 2026-10-29

### Added

- **`ftview_check` reports navigation into a display this export does not have.** A `gotoButton`
  (or any object with a `Display` connection) that names a missing display is `GOTO_TARGET_MISSING`,
  with the display, object and target. A typo there is invisible until an operator touches the button
  on the terminal.
## 0.59.0 — 2026-10-29

### Fixed

- **`TAG_NOT_BOUND` reads the expression the way Machine Edition writes it.** Braces are stripped and
  alias bindings (`{[PLC]Tag}`) are left alone, so a real export reports no false positives instead of
  one finding per `{` character.
## 0.58.0 — 2026-10-29

### Added

- **`ftview_check` reports a binding the tag CSV cannot satisfy.** Every connection on a named object
  is resolved to its root tag; when the CSV is present and does not declare that root, the finding is
  `TAG_NOT_BOUND` with the display, object, connection and expression. A misspelled tag used to look
  identical to a working one in a render and only fail on the PanelView.
## 0.57.0 — 2026-10-29

### Added

- **`ftview_draft_popup` builds a modal popup in one call.** Title, a message that survives a vendor
  import (line breaks are written as `&#xA;`), and one to three buttons that close the popup or open a
  display. A new popup is created as an `onTop` display with no title bar, the way Machine Edition
  confirmations behave, and an existing display of that name is reused.

### Fixed

- **Line breaks in captions are kept.** `escapeAttribute` writes `&#xA;` for a newline, so a multi-line
  message reaches Studio as two lines instead of being flattened onto one.
## 0.56.0 — 2026-10-29

### Fixed

- **`ftview_draft_display_set` edits display settings where Studio keeps them.** `width`, `height`,
  `backColor`, `displayType`, `positionX`, `positionY` and the other window attributes now go to
  the display's `<displaySettings>` element instead of the display root, which the schema rejects.
  A display that lost its settings element gets one inserted. Resizing a display or turning it into an
  `onTop` popup is now something a draft can do.

## 0.55.0 — 2026-10-29

### Added

- **`ftview_draft_screen` stages the screen's tags in the same draft.** The new `tags_json` argument
  takes the HMI tags the screen reads; they land beside the objects, so one apply writes the screen and
  its tag rows together instead of a separate `ftview_draft_tags` call.

### Changed

- **`l5x_diagram` gives wrapped rows their own height.** An operand that wrapped onto two lines used to
  keep the single-line row pitch, so the next row sat tight against it; the row now grows by the height
  of its tallest device.

## 0.54.0 — 2026-10-29

### Changed

- **Ladder diagrams wrap long operands instead of shortening them.** A label that does not fit on one
  line is broken at a separator near the middle and drawn on two lines, so
  `MOVE(BottomKnife_MP200Iec:O.Data[3],BottomKnife_MP200Iec:O.DegreePosition)` stays readable on the
  page. Applies to `l5x_diagram` and `l5x_rung_preview`.
- **`l5x_diagram` captions the page with the range it covers** — `5-16 of 799 rung(s)` — and names the
  `start_rung` that continues it, so a page image carries its own navigation instead of relying on the
  caller to remember the offset.

## 0.53.0 — 2026-10-29

### Added

- **`ftview_bulk_set` applies one change to every matching object.** Match on type, a name glob or
  existing attribute values, over every display or a named list; `dry_run` reports the selection
  without staging. The field sessions patched display XML by script for exactly this, so the change
  now goes through the validated draft path and one import.

### Fixed

- **`ftview_draft_object_set` no longer moves an object it was asked to relabel.** A caption-only
  change staged default geometry (`left/top 10`, `100x30`), silently repositioning the object; the
  defaults now apply only when the object is created.

## 0.52.0 — 2026-10-29

### Added

- **`l5x_diagram` pages a large project.** `routine` restricts the page to one routine and
  `start_rung` continues from where the last page stopped; the result carries `start_rung` and
  `next_start`, and the summary says which offset to page from next. A 799-rung commissioning project
  used to be truncated after `max_rungs` with no way to see the rest.

## 0.51.0 — 2026-10-29

### Added

- **`ftview_draft_ops` and `ftview_draft_drop`.** A staged change can now be listed with its index,
  kind and target, and dropped on its own. Before this, one wrong object move meant discarding every
  staged edit or hand-editing the display XML — the field session wrote 28 one-off PowerShell scripts
  that patched XML directly, partly because a draft could not be inspected or trimmed.

### Changed

- `ftview_draft_drop` refuses an index the draft does not hold and names the operation count, so a
  wrong index cannot silently remove the wrong step.

## 0.50.0 — 2026-10-29

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

## 0.49.0 — 2026-10-29

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


## 0.48.0 — 2026-10-29

### Added

- `l5x_diagram` draws every ladder rung of the open project on one page (routine headings, rung numbers,
  comments and instruction chains), with `program` and `max_rungs` to bound the page. Reviewing an
  unfamiliar controller no longer takes one `l5x_routine_diagram` call per routine — the field session
  never used the single-routine diagram at all, and this is the call it would have made.
- Every routine heading names `program/routine`, so repeated rung numbers are explainable, and long
  operands are clipped inside their box instead of running off the page.

## 0.47.0 — 2026-10-29

### Added

- `ftview_render` takes `displays_json` and draws up to eight displays in one call, returning a `screens`
  entry per display (file, size, problems) and one merged `problems` list. Checking a twelve-screen set is
  now one or two calls instead of twelve, which is where review time went in the field.

## 0.46.0 — 2026-10-29

### Added

- `ftview_render` now reports layout problems alongside the drawing: every object whose box leaves the
  canvas or whose caption or text cannot fit its box is returned in `problems` with the object name, the
  kind (`outside` or `overflows`) and a measured detail, so a screen can be corrected before anyone
  imports it.

### Fixed

- The renderer read the object type from the element name only, so an export that wraps the type in an
  `<object type="...">` element drew every text, button, indicator and trend as an unlabelled rectangle.
  It now prefers the declared `type` attribute.

## 0.45.0 — 2026-10-29

### Added

- `l5x_routine_diagram` draws the rungs of a routine that already exists in the open project. Pass `program` and `routine`; it numbers the rungs, lists the instructions it found, and writes a PNG beside the SVG when Chrome or Edge is installed. A missing routine is refused with the program's routines as candidates, and a Structured Text routine is refused because there is no ladder to draw.

## 0.44.0 — 2026-10-29

### Fixed

- The import manifest `ftview_apply` writes was not usable by the Graphics Import Export Wizard: entries had
  no `importType` and no `display`, so every run failed with "The display ... does not exist" or silently
  ignored the files. Each entry now carries `importType="create"` for a display the draft introduced and
  `importType="update"` for one that already existed, plus its `display` name.
- `IMPORT.md` now lists the wizard's exact four steps and counts creates against updates, so a run cannot
  fail because the manifest disagreed with the application.

## 0.43.0 — 2026-10-29

### Added

- `ftview_compare` reports what changed **inside** each display, not only which files differ: per display,
  the objects added, removed, and changed with the fields that moved (`left`, `caption`, `connections`, ...).
  After a Studio import this is the proof that a specific object landed, where a file hash only says the
  file is different.

## 0.42.0 — 2026-10-29

### Fixed

- `ftview_studio_import_prepare` wrote `importType="create"` even when the caller asked for
  `mode: "update"`, so an update package asked Studio to create displays that already existed and the
  wizard ignored every file. The manifest now carries the requested mode and the steps say which one it is.

### Added

- The package refuses a display that does not parse as XML, instead of letting the wizard answer only
  "Unable to load the XML file".

## 0.41.0 — 2026-10-29

### Added

- `DisplayObject.connections` carries the expressions an object is wired to (`Value`, `Indicator`,
  `Display`), read from both the flat and the `<connections>`-wrapped ME shapes.
- Renders print that tag inside the frame, so a picture shows what a display reads instead of only its
  caption and object name.

### Notes

- Long expressions are shortened to the room the frame has; the full text stays in `data.connections`.

## 0.40.0 — 2026-10-29

### Added

- Frames read their caption from the face a screen shows at rest (`stateId="0"`), so a button drawn in a
  render says START or YES instead of its object name.
- Character references in captions (`&#xA;`, `&amp;`) are decoded, and a multi-line caption is drawn as one
  `tspan` per line instead of a flattened single line.

## 0.39.0 — 2026-10-29

### Added

- `ftview_draft_display_attrs` stages many attribute changes on a display or one of its objects in a
  single call, instead of one `ftview_draft_display_set` per attribute.

## 0.38.0 — 2026-10-29

### Added

- `ftview_render` draws vendor polylines, trend grids and bar-graph tracks, so separators and charts read
  as the screen does rather than as labelled boxes.

### Fixed

- A `line` object is drawn from its own `line` polyline with its line width and dash style; it used to be
  a diagonal across the object's bounding box.

## 0.37.0 — 2026-10-29

### Added

- `ftview_apply` ends with a `ftview_render` step for the first changed display, so the screen can be
  looked at before anyone imports it.

### Fixed

- `ftview_apply` writes the Studio batch-import manifest for displays a draft created, which arrive as
  `X.xml` rather than `Displays/X.xml`.

## 0.36.0 — 2026-10-29

### Changed

- **`verify_offline_l5x` explains a no-changes import abort.** `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` now carries the reason (safety controller, or an L5X whose safety signature must be recomputed) and the alternative (build in Studio 5000, or prove the change with `run_checks` and a targeted read). The field session retried this four times.
- Safety detection also reads `SafetySignature`, `Type="SAFETY"` and `SafetyNetworkNumber`, not only `SafetyTask`/`SafetyProgram`.
## 0.35.0 — 2026-10-29

### Added

- **`ftview_draft_tags` stages a batch of HMI tags in one call.** Each entry changes a row description, a type, or appends a new row; up to 500 per call. The field session made thirteen single-tag calls to describe one screen's tags.

### Changed

- The batch is atomic: an entry with neither description nor type refuses the whole set and stages nothing, naming the tag at fault.
## 0.34.0 — 2026-10-29

### Added

- **`compose_batch` writes many validated rungs in one call.** Up to 200 rung descriptions — composition trees or named patterns — are checked against the export and against the tags the same draft stages, then staged at consecutive rung numbers. The field session wrote 29 one-off scripts to add rungs one at a time; a batch that composes 20 rungs is now one call.

### Changed

- The batch is atomic: if any rung in it is invalid, nothing is staged and the refusal names the entry. A rung number that already exists is refused with the start rung to use instead, not a generic collision.
## 0.33.0 — 2026-10-29

### Added

- **`ftview_draft_screen` lays out a whole screen from one description.** Cards of label/value and label/lamp rows plus a navigation row are positioned on the scaffold slots, wired to tags, and staged in a single call. The field session hand-placed every object through PowerShell scripts and XML edits; a screen of nine rows and three buttons is now one description, and every rectangle comes back so the next placement is never guessed.

### Changed

- Row kinds are validated before anything is staged: `value` becomes a numeric display bound on `Value`, `lamp` a multistate indicator bound on `Indicator` with two states. More than four cards or four navigation buttons is refused with the reason, not silently truncated.
## 0.32.0 — 2026-10-29

### Added

- **`compose_rung` sees the tags the same draft stages.** A rung written against a tag that `draft_tag` just added used to fail with `TAG_NOT_FOUND`, so the workflow either declared tags in a separate draft or fell back to hand-written NeutralText. Composition now resolves staged declarations, and the type check still runs: a `REAL` tag used where a `BOOL` contact belongs is refused exactly as before.

### Changed

- Staged declarations are visible to composition only. `run_checks`, `draft_validate` and the export on disk still describe the project as it is, so nothing claims a tag exists before it is written.## [0.31.0] - 2026-10-29

### Added

- **`draft_list` and `draft_remove_op`.** A staged operation can now be inspected by index and dropped on its own. Before this, one wrong rung meant discarding every staged edit or hand-editing the L5X outside the plugin — the field session chose the hand edit, with 29 one-off PowerShell scripts as the price.

### Changed

- `draft_remove_op` takes a positional index that `draft_list` reports, not a rung number, so a removal cannot land on real logic by guesswork. An out-of-range index is refused with the current operation count and a pointer back to `draft_list`.
## 0.30.0 — 2026-10-29

### Added

- **A re-apply no longer needs a new folder name.** `ftview_apply` accepts `overwrite: "yes"` for a folder this chat already wrote, so fixing one attribute and re-writing the export stops littering `Final 2`, `Final 3` folders. An unknown folder is still refused with `OUTPUT_NOT_TRACKED` — applying there would merge into somebody else's files — and the `OUTPUT_EXISTS` message now names the option that works.

### Changed

- Overwrite replaces the file set with the current draft; it does not merge with what an earlier apply wrote. Re-run the draft you want as the final state.
## 0.29.0 — 2026-10-29

### Added

- **A stale view can be refreshed.** `ftview_reload` re-reads one opened export folder in place and keeps its `view_id`, so a re-export, a script or a Studio import is visible without opening a second view and re-deriving every path. It reports the display count and which displays appeared or disappeared.
- **A draft can be abandoned.** `ftview_draft_discard` throws away the staged operations, so edits that went the wrong way no longer force the model to finish them or to work around the plugin with scripts. The export on disk is untouched; `draft_discard` does the same for L5X drafts.

### Fixed

- **Offline verification refuses safety projects instead of failing inside the SDK.** A GuardLogix or Compact GuardLogix export always aborts with `XMLSrv_E_IMPORT_ABORTED_NO_CHANGES` in the offline importer, even when the L5X is unchanged; `verify_offline_l5x` now detects `SafetyTask` / `SafetyProgram` and returns `SAFETY_PROJECT_OFFLINE_VERIFY` with the honest alternative (import and build in Studio 5000).
- Rasterising tests carry a 30 s timeout, so a loaded host no longer fails them on the default 5 s.
## 0.28.0 — 2026-10-29

### Added

- **Ladder answers now carry a diagram.** `l5x_rung_preview` draws the validated rungs as an SVG and, when Chrome or Edge is installed, rasterises it to a PNG beside the preview document, so a chat answer shows ladder logic instead of NeutralText. Instruction boxes carry their operands, branches stack inside a bracket, and every rung is numbered. `diagram: "no"` skips the image work; a host without a browser still gets the SVG, and the result says why no PNG appeared.
- The diagram is explicitly a schematic: it is drawn from the parsed rungs, not rendered by Studio, and the coverage list says so.
## 0.27.0 — 2026-10-29

### Added

- **A render inlines the display's real artwork.** `ftview_render` reads the rasters a display references from the export's `Images` folder and embeds them in the SVG, so a screen shows its actual images instead of a labelled placeholder. An image the export mentions but does not ship is still drawn as a placeholder, and the result now says so, because many ME exports ship an empty `Images` folder.

## 0.26.0 — 2026-10-29

### Added

- **`ftview_render` can draw the staged draft, not just the export.** Pass `source: "draft"` and the render reflects everything staged but not yet applied, so a screen can be looked at before `ftview_apply` and before anyone imports it. A draft that does not touch the display is refused with `NOT_FOUND` instead of silently drawing the committed file.

## 0.25.1 — 2026-10-29

### Fixed

- ftview_render resolves the SVG path before handing it to the browser, so a relative `output` folder now produces the PNG as well.


## 0.25.0 — 2026-10-29

### Added

- **ftview_render shows the screen before anyone imports it.** The tool draws one display of the open export as an SVG file and, when Chrome or Edge is installed, rasterises it to PNG with a headless screenshot, so the image can be attached to the answer. Panels, text, buttons, indicators and lines are drawn from the geometry the export declares; animations, images, global objects and vendor widgets appear as labelled placeholders. The result says which browser produced the PNG, or that only the SVG exists because none was found.
## 0.24.0 — 2026-10-29

### Added

- **`ftview_cross_reference` joins an HMI export to a Studio 5000 project.** Pass the FTView view and one L5X; the tool resolves every HMI tag through the tag CSV data source to a PLC tag, then reports which displays use it, which rungs read or write it, and the tags that exist on only one side. Rows carry `linked`, `memory` (HMI internal), `unlinked` or `unsupported` (indirect address such as `[Tag]` or a data-table address), and findings use `HMI_TAG_NOT_IN_PLC` / `PLC_TAG_NOT_IN_HMI`, so one call answers whether the HMI tags the PLC actually reads.
- **`ftview_draft_display_scaffold` starts a display from known slots.** One call stages a backdrop, header, title, optional subtitle, content surface, footer bar and footer text at the display's own size, and returns the free rectangle inside the body plus the header, footer, title and subtitle rectangles. The model places objects into a slot instead of inventing coordinates.
- **`l5x_rung_preview` renders proposed rungs as ladder.** It validates every rung with the parser `draft_rung` uses, writes a minimal viewer-shaped L5X into the workspace and points the answer at it, so a proposed rung is read as a diagram rather than NeutralText. Rungs can be passed inline or as `rungs_file`; blank lines and `//` or `#` comment lines are skipped.
- **Two PLC standards rules in `run_checks`.** `LATCH_WITHOUT_RESET` (warning) names a tag latched by `OTL` with no `OTU` anywhere in the export; `DUPLICATE_OUTPUT` (warning) names a tag driven from more than one rung in the same routine. Both carry `basis: CRAFT-FAULT-02` so the finding cites the corpus.
- **A standards reference** at [docs/reference/standards-checks.md](docs/reference/standards-checks.md) lists every PLC and HMI rule, its severity, the corpus rule behind it, and what a clean result does not prove.

### Changed

- **`run_checks` says what it now covers** in its description: the documentation rules, the two standards rules and the optional baseline I/O comparison.
# Changelog

## 0.23.0 — 2026-10-29

### Added

- **`ftview_validate` reports an object this draft places partly over a neighbour.** The new `DRAFT_OVERLAP` warning names both objects, the display and the overlap area. It stays quiet for whole-display backdrops and for panels that contain their controls, because those are layering rather than mistakes, so the finding is only about collisions the draft itself introduced. The author sees the collision before apply instead of after import.

### Fixed

- **An object added to a display with no trailing newline landed after the root element.** The insertion point fell back to the end of the file, so the new element sat outside `<gfx>` and the re-parse behaved as if the object did not exist. The insertion now falls back to the parent's closing tag.

## 0.22.2 — 2026-10-28

### Fixed

- **Alarm databases with a non-US localised stream now decode.** The decoder looked only for `ls00000409`; a `ls00004009` (and other locale) table is the same layout, so any `ls<8 hex digits>` stream is accepted, preferring the US one. Across the 66 applications installed here, alarm decoding went from 3 to 34 success; the remaining 26 fall back with a stated reason (stream versions 13/14, or a variant record layout this decoder does not read).

- **A failed decode now says why in the export result.** When the alarm or tag database cannot be read, `ftview_export` keeps the wizard snapshot and adds a warning naming the decoder error instead of silently treating the snapshot as fresh.

### Changed

- **Coverage is documented per component.** Tag decoding succeeds on 64 of the 66 installed applications (two were locked by a running Studio); alarm decoding on 34. Both paths keep the Studio wizard as the fallback, and every fallback is reported rather than hidden.
## 0.22.1 — 2026-10-28

### Changed

- **`ftview_export` refreshes stale or missing tags headlessly.** When the store has `TAG/<application>.MDF` and the snapshot is absent or older than the application database, the export decodes the tag CSV itself and reports `tags: "fresh"` with no warning, instead of copying the old snapshot and telling the reader to run Studio. Falls back to the snapshot copy (with the existing warning) when local SQL tools are unavailable. Verified on `AryaFTV_CarpenterPilot_20261007`: decoded 9,986 bytes, byte-identical to the wizard CSV.
## 0.22.0 — 2026-10-28

### Added

- **`ftview_alarm_snapshot`: alarm XML without Studio.** The tool reads `M_Alarms/MachineAlarms.mal` straight from the application store. The stream is an OLE2 compound file: header counts and next ids come from the trailer, then one 102-byte trigger record and one 30-byte message record each, with `FF <len>`-prefixed UTF-16 strings (`FF FE`/`FF 00` for absent or empty). `LS<length><locale>` outranks the base stream because it carries the localized `triggerLabel` and `messageText`. Output is byte-identical to the vendor wizard's `Alarms.xml` on `AryaFTV_CarpenterPilot_20261007` (33 triggers), `Carpenter_EPS_Laminator001` (23) and `CC019_Main` (64); ids above the encoded limit are reported as notes rather than invented.
- **`ftview_export` fills alarms from the application database.** When `M_Alarms/MachineAlarms.mal` is present the export decodes it into `Alarms/Alarms.xml` and reports `alarms: "fresh"` instead of copying an absent or stale snapshot.

### Changed

- **Alarms are no longer "requires Studio".** `ftview_capabilities` reports `alarms: "available"` when the machine alarm database exists, with the Studio wizard kept as the fallback for applications that carry no `M_Alarms` folder. Skill and `docs/reference/ftview-any-app.md` now describe the decoder and its limits.
## 0.21.0 — 2026-10-28

### Added

- **`ftview_tag_snapshot`: the tag CSV without Studio or the wizard.** The tool copies `TAG/<application>.MDF` to a temp folder, attaches the copy to the local SQL Server Express instance (`MSSQLSERVER`, `SQLEXPRESS`, ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦), reads `dbo.AllTagsView` and renders the rows with the vendor wizard's exact quoting, ordering, CRLF endings and UTF-8 BOM. The application database is only read; the attach is dropped and the copy removed. Verified byte-identical against the wizard snapshots for `AryaFTV_CarpenterPilot_20261007` (101 tags), `CC019_Main` (121 tags) and `Carpenter_EPS_Laminator001` (378 tags).
- **A SQL-aware capability status.** `ftview_capabilities` reports `tags: "available"` when local SQL tools exist even without `DatabaseConverter.exe`, and its notes say which path is in use.

### Changed

- **Tag snapshots no longer need a human at the wizard.** Skill, `docs/reference/ftview-any-app.md` and the capability notes now prefer `ftview_tag_snapshot`, with `ftview_studio_export_prepare` (DatabaseConverter) as the fallback when no local SQL Server is reachable. Alarm XML and display import still run inside Studio.

## 0.20.2 — 2026-10-28

### Added

- **Smart artifact detection in the file preview.** Opening an alarm export, tag CSV or batch import file no longer shows "not a FactoryTalk View display": `detectArtifact` recognises `<alarms>`, the tag CSV header, `<gfxImport>` and displays, and the preview renders a summary card with the counts (alarm definitions, tag rows, import entries) while displays still render. Unknown XML reports the root element.

### Changed

- **The export workflow no longer implies Studio.** Skill and `docs/examples.md` state that export, authoring, validation, apply and verification need no Studio; only the alarm snapshot and the display import do. The fresh-asset example now passes `export_root` and validates the snapshot in place.
## 0.20.1 — 2026-10-28

### Changed

- **`ftview_studio_export_prepare` can target the export folder directly.** Pass `export_root` and the step list names `<export>/Tags/<application>.csv` (tags) or `<export>/Alarms/Alarms.xml` (alarms) instead of the project store, so the vendor wizard writes the snapshot where the export needs it. Without `export_root` the old store destination is unchanged.
- **`ftview_studio_export_accept` validates in place.** When source and destination resolve to the same file it checks the file and reports it, without a needless self-copy.

### Verified

- On `AryaFTV_CarpenterPilot_20261007` with Studio open, the Alarm Import Export Wizard wrote `Alarms.xml` (29,089 B) straight into `Exports\AlarmDirectTest`; the project store's `Alarms.xml` kept its previous timestamp, proving nothing was written to the store first.
## 0.20.0 — 2026-10-28

### Added

- **`ftview_capabilities`** reports what the host can actually do: Studio and tag-wizard paths, installed `Gfx-ME*` schema versions, application count, and status for tags (`available`), alarms and import (`requires-studio`), backup and live (`unverified`), with one line per fact an agent must not guess.
- **Objects can be added to a display created in the same draft.** `ftview_draft_object_add`, `_set`, `_delete` and `_order` resolve a display that the draft's `display_create` or `display_add` just made, instead of failing with ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“No display is named ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â. Display settings on a draft-added display are accepted too.

### Documented

- `docs/reference/ftview-any-app.md` now records what the installed product exposes and does not: standalone tag wizard; display-only export server; `GfxImport`/`GraphicsXmlWizard` COM that needs Studio's graphics server and project context; `METriggerEditor` alarm implementation with no CLI; `ApplicationManagerServer` backup that fails on this host.
## 0.19.2 — 2026-10-28

### Fixed

- **The alarm-export steps named the wrong menu.** `ftview_studio_export_prepare { kind: "alarms" }` said `Tools > Alarm Import Export Wizard`. The wizard opens from **right-click `Alarms > Alarm Setup` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ `Import and ExportÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦`**, and it runs inside `VStudio.exe`, so Studio must be open with the application loaded. The steps now say that, including the case where Studio is closed.

### Verified on CC019_Main

- Tag export through `DatabaseConverter.exe`: `CC019_Main-Tags.CSV`, 104 tags, 110 lines.
- Alarm export through `Alarm Setup ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ Import and Export`: `Alarms.xml`, 71,865 bytes, root `<alarms version="1.0">`.
## 0.19.1 — 2026-10-28

### Fixed

- **`ftview_export` creates the destination's parent folder first.** Exporting an application into a new tree failed with `Value does not fall within the expected range` at `ExportAll` when the parent folder did not exist; the Laminator export only worked because `Laminator/HMI` was already there. `ApplicationManager`-style parents are now created before the vendor call.

### Verified

- Second application exported and drafted against: `CC019_Main` (70 displays, 1280ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â800, schema `Gfx-ME17.xsd`, **no** tag or alarm snapshot). A 12-object `ARYA_DIAG` display passed schema validation and applied cleanly, proving the catalog/draft/validate/apply path is not Laminator-specific.
## 0.19.0 — 2026-10-28

### Fixed

- **`ftview_draft_object_set` now writes captions in the shape each element accepts.** Buttons and indicators update their `<states><state><caption>` faces; `gotoButton` and the simple buttons update the `<caption>` child; other objects keep the `caption` attribute. Editing a button caption previously produced schema-invalid XML.
- **`ftview_validate` bounds its findings.** It returns the first `limit` findings (default 50) and still reports `findings_total`, `findings_truncated` and complete `by_rule` counts, so a legacy export with hundreds of duplicate-name warnings no longer floods the result.

### Added

- **`docs/reference/ftview-any-app.md`** ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â what is generic across applications (catalog, reading, drafting, packaging, snapshots, live mapping), what varies (schema version, tag CSV, alarms, display names and size, image stems, global objects, connection names), and the export ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ draft ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ validate ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ apply ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ import ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ verify loop.
## 0.18.4 — 2026-10-28

### Added

- **`ftview_studio_import_prepare` takes `mode: "create" | "update"`.** A display that already exists must be updated, not created: a create-mode entry ignores every existing object and reports "element already exists ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ will be ignored". Update mode is what completes a partially imported display. Default stays `create`.
## 0.18.3 — 2026-10-28

### Fixed

- **`multistateIndicator` binds through `Indicator`, not `Value`.** Studio's importer rejected `name="Value"` on the element with `The connection with the name 'Value' is not valid on a 'multistateIndicator' element.` The object writer now maps a caller's `Value` connection to `Indicator` for indicators, so the mode lamp imports. The same fix was applied to the pending `Arya Control.xml` package.
- Restored the non-stateful branch of `addObject` after the connection mapping edit, so visibility animations on panels keep being written (regression caught by the animation test).
## 0.18.2 — 2026-10-28

### Fixed

- **Import packages now force display creation.** The generated `gfxImport` entries were bare `importFile` references, so Studio imported in update mode and refused with `The display 'Arya Overview' does not exist.` Each entry now carries `importType="create"` and the explicit `display` name, which is what the batch file documents. The package under `Laminator/HMI/Arya Import` was rewritten for the retry.
## 0.18.1 — 2026-10-28

### Fixed

- **`ftview_studio_import_prepare` produced a package Studio could not import.** The display XML files went into `Displays/` while `BatchImport.xml` referenced them beside itself, so the Graphics Import Export Wizard failed with `Unable to load the XML file 'ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦\Arya Overview.xml'. Cause: The system cannot locate the object specified.` The XML files now sit beside the batch file, which is where Studio resolves `importFile`. The existing package under `Laminator/HMI/Arya Import` was corrected by hand for the retry.
## 0.18.0 — 2026-10-28

### Added

- **`ftview_draft_object_add` writes button and indicator faces.** A new `states_json` argument produces `<states><state stateId="0"><caption ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦/></state>ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦</states>`, so `momentaryButton`, `maintainButton`, `latchedButton`, `multistateButton`, `rampButton` and `multistateIndicator` get real captions, colours and per-value states instead of a `caption` attribute the vendor schema rejects. Buttons accept states 0, 1 and Error; an indicator accepts numbered states with `value`.
- **`animations_json` writes visibility animation.** `{"visibility":{"expression":"{AutoRunning} = 0","expressionTrueState":"visible"}}` produces `<animations><animateVisibility ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦/></animations>`.
- **`gotoButton` captions are now a `<caption>` child**, which is the shape its schema expects; a `states` face would be invalid.

### Verified

- `Displays/Arya Control.xml` was generated through these writers and validated against Studio's own **`Gfx-ME17.xsd`: 0 errors** ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â two stateful push buttons, a value-triggered mode lamp, two navigation buttons and two visibility-animated objects.
- Rendered to `artifacts/ftview-arya/Arya Control.png`.
- Not yet imported into a live Studio application: Studio started in Demo Mode and the application did not finish loading during this run, so the schema is the acceptance evidence here.
## 0.17.2 — 2026-10-28

### Changed

- The FTView skill now says how applied displays reach Studio (`ftview_studio_import_prepare`, then the Graphics Import Export Wizard) and corrects the object-contract count to the 34 drawable types.
## 0.17.1 — 2026-10-28

### Fixed

- **`ftview_apply` now composes write paths from the resolved target's `displayPath`.** The host may return an `FsTarget` object from `fs.resolve`; interpolating it produced `[object Object]` in child paths instead of the folder the caller named. `targetPath()` normalizes both shapes, and the apply existence check still runs against the resolved target.
## 0.17.0 — 2026-10-28

### Added

- **`ftview_studio_import_prepare`** packages displays from an applied export for Studio's Graphics Import Export Wizard: it copies the selected `<gfx>` display XML files, writes the `gfxImport` batch file, and returns the wizard steps. Non-`<gfx>` files are refused.
- **Verified end to end on this host**: the wizard (right-click Displays > Import and Export) imported `Arya Proof.xml`; Studio created `GFX\Arya Proof.gfx` (104,960 bytes), listed **Arya Proof** in the Displays tree, and opened it in the editor. A pre-import backup of the application is kept under `backups/ftview/Carpenter_EPS_Laminator001/pre-proof-import-20261028T050943Z`.
## 0.16.1 — 2026-10-28

### Fixed

- **Copying a real Studio ME display produced schema-invalid XML.** `ftview_draft_display_add` renamed the copy by writing a `name` attribute onto the root, but a ME display is named by its file and its root is `<gfx>`, which `Gfx-ME17.xsd` rejects ("The 'name' attribute is not declared"). The rename now rewrites the name only on the legacy `<display name="ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦">` shape and leaves `<gfx>` untouched; the file name is the display name.
## 0.16.0 — 2026-10-28

### Changed

- **`ftview_export` now reports asset freshness instead of only warning.** Its result carries `assets: { tags, alarms }` as `fresh`, `stale` or `missing`, and when either is not fresh the `next` list names `ftview_studio_export_prepare` (with the right `kind`) so the model refreshes the snapshot through the wizard and accepts it, rather than binding against an old file.
## 0.15.0 — 2026-10-28

### Added

- **Alarm export is now a prepared path.** The Alarm Import Export Wizard is hosted by Studio (it runs inside `VStudio.exe`); `ftview_studio_export_prepare { kind: "alarms" }` returns the exact Studio steps, the store folder and the `Alarms.xml` it must produce. `ftview_studio_export_accept { kind: "alarms" }` validates the `<alarms>` XML and copies it.
- Verified on this host: export alarm configuration -> Next -> Finish wrote `Carpenter_EPS_Laminator001\Alarms.xml`, 34,559 bytes, root `<alarms version="1.0">`.
## 0.14.1 — 2026-10-28

### Fixed

- The 0.14.0 skill exceeded its 8000-byte budget (the new export section pushed it over; `pnpm test` caught it after
  publish). The skill is trimmed back under budget with the prepare/accept workflow kept.
## 0.14.0 — 2026-10-28

### Added

- **`ftview_studio_export_prepare`** resolves an application's `.med`, verifies Rockwell's Tag Import and Export Wizard is installed, and returns the exact steps and destination file. It does not click anything.
- **`ftview_studio_export_accept`** validates what the wizard produced ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â tag CSV header and row count, or an `<alarms>` XML ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â and copies it into an export folder. Empty or wrong-shaped files are refused, so a failed run cannot become a silent stale asset.
- The FTView skill documents the prepare ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ wizard (computer use) ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ accept workflow for fresh tags and alarms.

### Notes

- Rockwell's wizards are desktop dialogs. UIA, Win32 messages, browse-dialog automation and coordinate input were tried against them and are not reliable enough to ship; the harness's computer use is the actuator, and the two tools above make its result verifiable. Application Manager backup was also attempted and fails on this host ("Class not registered").
## 0.13.1 — 2026-10-28

### Fixed

- **`ftview_export` no longer claims to export alarms and tags.** An ME application folder does not contain
  `Alarms.xml` or a tag CSV; those exist only when someone exports them from Studio's Alarm Setup / Tag Database
  into the store. The tool now says it exports displays and global objects, copies an existing snapshot **only if
  present**, reports its age, and the warnings state that the files are not part of a normal application. Skill and
  tool descriptions corrected to match.
## 0.13.0 — 2026-10-28

### Added

- **The object contract is now teachable.** `TYPE_GUIDE` documents all 34 drawable types with required attributes,
  allowed children and a construction note; `ftview_object_types all="true"` returns it alongside what the export uses.
- `multistateIndicator` and `polyline` are part of both the drafting contract and the renderer. The missing
  `multistateIndicator` was why the yellow **MANUAL** bar never drew ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â it was dropped before rendering, and no
  attribute change could fix it.
- The FTView skill now documents the contract workflow (read `all`, read the used type, draft, validate, apply), the
  image-name and reference-object rules, and the preview's fidelity limits.

### Fixed

- Reference objects take **all** local attributes over the base, so a reference multistate keeps its own
  `currentStateId` instead of the base's state.

### Verified

`Load Conveyor Screen` now draws the MANUAL bar and the header/footer exactly where Studio puts them; `Main Screen`
draws the logo, triangles and round lamps. 66 FTView tests, 12 renderer tests, 69 bundle tests.
## 0.12.1 — 2026-10-27

### Fixed

- **The generated tool reference was stale.** `ftview_object_types` gained the `all` parameter in 0.12.0, but
  `docs/reference/tools.md` was generated before that edit and `pnpm test` caught it only after the release was
  published. The reference is regenerated; no tool behaviour changed.
## 0.12.0 — 2026-10-27

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
## 0.11.1 — 2026-10-27

### Fixed

- **Image objects resolve by name, with or without an extension, case-insensitively.** A display refers to
  `imageName="Equilateral triangle"` while the store holds `Equilateral triangle.bmp`; the route required an extension,
  so every image 404'd and drew a placeholder. Names are trimmed and matched against `.bmp`, `.png`, `.jpg`, `.jpeg`
  and `.gif`.
- The preview harness can inline `Images/` as data URLs, which is how the logo and the triangle indicators were
  verified: with the real Images present, `Main Screen` now draws the CARPENTER logo and the green/red triangles.
## 0.11.0 — 2026-10-27

### Added

- **Global Objects load in the preview.** The face fetches `/engineering/ftview/globals` and resolves every
  `isReferenceObject` against its base, so the header, footer and navigation highlight appear in the app instead of
  empty placements. This was the largest visual regression against Studio.
- **Images render in the preview.** A new `/engineering/ftview/image` route serves `Images/<name>` with a file-name
  whitelist, and the face resolves every image through it.
- **Shape fidelity.** Buttons and indicators honour StudioÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s `shape` attribute: `ellipse` draws a circle (status lamps
  were rectangles), rounded shapes get a corner radius.
- **Drafting accepts every drawable element type.** `ftview_draft_object_add` validates the type against the 34-type
  contract (`panel`, `group`, shapes, all button kinds, numeric/string fields, bar graph, gauge, trend, list selector,
  alarm objects, recipe, ActiveX, symbol, reference/global object) and rejects an unknown type with the candidate list.

### Verified against Studio

The reference screenshot of `Load Conveyor Screen` in Studio is committed at
`artifacts/ftview/studio-load-conveyor.png`; comparing it with the preview identified the three gaps above
(header/logo via globals and images, and circular indicators).
## 0.10.9 — 2026-10-27

### Fixed

- **Fit did not fit.** The rendered SVG carries the display's pixel size (`width="1280" height="1024"`), which is right for
  the PNG export and wrong inside a narrow preview pane: the drawing kept its intrinsic size and the pane showed a crop of
  it, so Fit and 100% looked identical. Fit now renders through `responsiveSvg`, which overrides the size, keeps the
  `viewBox` and preserves the aspect ratio; 100% still shows the full-size drawing with scrolling. Found by driving the
  running app with computer use, not by a unit test.
## 0.10.8 — 2026-10-27

### Added

- **Compare view.** The previewÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s **Compare** action loads the same display from a second export folder through the
  display route and shows both renders side by side with their labels, so an edit can be judged before it is applied.
  The second folder is asked for by name, nothing is written, and the button toggles the pane off.

### Changed

- Phase 4 of the preview plan is complete: inspect, navigate, back, PNG export and compare.
## 0.10.7 — 2026-10-27

### Added

- **Interactive preview.** Every rendered object now carries its type and name, so a click opens an inspector with the
  objectÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¾ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢s attributes, its connections, its state count and, for a `gotoButton`, an **Open display** action.
- **Navigation.** Double-clicking a `gotoButton` (or using the inspector) loads its target display through the new
  `GET /engineering/ftview/display?root=&name=` route, with a **ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Back** history. The route accepts display file names
  only and refuses traversal.
- **PNG export** of the current view from the toolbar.

### Known gaps

- Side-by-side compare of two versions of a display is not in this release; the rest of phase 4 is.
## 0.10.6 — 2026-10-27

### Added

- **`ftview_object_types`.** Catalogs the object types the open export actually uses: how many of each, every attribute
  seen with its usage count and up to three example values, and example names. Ask for one `type` to get its attribute
  table ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the answer an agent needs before authoring, instead of guessing attribute names until the XSD refuses.
- **`ftview_design_check`.** Rule-based findings from the `view` corpus: touch targets under 44 px (`VIEW-HPM-02`),
  controls with no base caption (`VIEW-HPM-01`), text contrast below 4.5:1 (`VIEW-COLOR-01`) and displays no
  `gotoButton` reaches (`VIEW-NAV-01`). Every finding names its rule and its evidence.

### Changed

- FactoryTalk View read surface: 7 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 9 tools; bundle total 100 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 102.
## 0.10.5 — 2026-10-27

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
## 0.10.4 — 2026-10-27

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
## 0.10.3 — 2026-10-27

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
## 0.10.2 — 2026-10-27

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
## 0.10.1 — 2026-10-27

### Added

- **A sourced renderer for the display preview.** The FTView face had no source, only a committed closure bundle. `packages/ftview-viewer/src` now owns an XML reader and an SVG renderer with tests, and `scripts/ftview-preview.mjs` renders any display export to SVG/HTML (plus a headless PNG) outside the app. On the real Laminator `Main Screen` it draws the object set the artifact dropped ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â **button captions from `<states><state><caption>`**, per-state colours, groups, and numeric fields ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â which is why the old preview showed blank navigation buttons.
- The renderer is not wired into the client face yet; the artifact still serves the panel. Known gap, stated rather than implied.
## 0.10.0 — 2026-10-27

### Added

- **`ftview_live_map`.** Maps every HMI tag in the export to the controller tag named in the CSV `Address`
  column (`::[topic]tag`), and reports coverage. It answers the question a live viewer depends on without
  contacting a controller and without inventing a value: on the Carpenter Laminator application **293 of 295
  tags are controller-backed** (topic `Laminator`), the other two are HMI memory.
- **Image assets are exported.** The vendor export engine does not copy bitmaps, so image objects could never
  render. `ftview_export` now copies the store's `Images/` tree into the export, and warns only when a display
  actually references an image and the store has none.

### Changed

- FactoryTalk View read surface: 6 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 7 tools; bundle total 99 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 100.

### Known gaps

- The live *values* route and the new viewer are not in this release. The mapping and assets they depend on are.
## 0.9.3 — 2026-10-27

### Fixed

- **`ftview_export` reported `0 display(s)` for a successful export.** The display count used a pattern that
  required a leading slash, but export paths are relative (`Displays/Main Screen.xml`), so every export said
  zero displays even when it wrote thirteen. The count now matches the paths the tool actually returns.
- **The tags and alarms warning now says what it means.** The copied `Alarms/Alarms.xml` and
  `Tags/<application>.csv` are snapshots Studio last wrote when those components were exported from their
  editors ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â not fresh data. The warning states that, and that the application export in Studio is what
  refreshes them. There is no supported headless export for either component; this is the honest boundary.
## 0.9.2 — 2026-10-27

### Fixed

- **The `engineering-standards` skill was missing from the catalog.** 0.9.1 mounted it by calling the skills
  service from inside the resources row's `apply()`, which only works if that service already exists at that
  row's turn ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â it mounts before the Optix row, so the skill was silently skipped (the tools still loaded).
  The skill is now its own plugin with `inject: ['skills']`, the same pattern the product skills use, so the
  host activates it when the service is up regardless of row order. A test asserts the injection list and
  registration.
## 0.9.1 — 2026-10-27

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
## 0.9.0 — 2026-10-27

### Added

- **Model-agnostic engineering resources: a local standards corpus.** 34 authored pages across six domains
  (IEC 61131-3, Rockwell, Yaskawa, FactoryTalk View/HMI, Optix, craft) with front-matter provenance and 100+
  rule IDs (`CRAFT-NAME-01`, `VIEW-HPM-02`, ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦). `engineering_reference` lists the contents, ranks pages for a
  query and returns one page with its rules; search is deterministic and needs no network, embedding model or
  tokenizer. `scripts/gen-resources.mjs` validates every page (fields, domains, id/file agreement, rule
  uniqueness, size and word budgets) and generates `index.json`/`SOURCE.json`; `pnpm resources:check` fails on
  a stale index.
- **House-style profiles.** `engineering_profile` reads the conventions of the open project ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â L5X tag prefixes
  and case, seal-in and latch forms, comment density; FactoryTalk View palette, fonts, button geometry,
  navigation and popups ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â with counts, evidence and a `low`/`medium`/`high` confidence. A profile is evidence,
  not authority, and the tool says which project and SHA-256 it came from.
- **Generation follows the profile.** `ftview_draft_display_create` applies the profile's background colour and
  `ftview_draft_object_add` its button geometry and font when the caller omits them, reporting
  `profile_applied`.
- **New `resources` row and the `engineering-standards` skill.** The row mounts the two tools and the skill
  that tells a model to read the relevant page and the project profile before authoring. Tools 97 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 99, rows
  5 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 6.
- `docs/resources.md` documents the corpus, its provenance, the index commands and the profile schema.

### Known limits

- `engineering_review` (rule-based draft review) and MWI/Optix profile extraction are planned for 0.9.1; the
  corpus already applies to those products and the product validation still judges the result.
## 0.8.4 — 2026-10-27

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
## 0.8.3 — 2026-10-27

### Documentation

- **A workflow handbook, generated from one source.** `docs/handbook/Engineering-Handbook.pdf` (7 pages),
  an editable `.docx` and a printable `.html` cover the four products: what each row needs, the shared
  read ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ act ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ verify ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ hand-off loop, what the agent does, what stays human, and a "what proves what"
  table.
- **Six workflow diagrams** in `docs/diagrams/` (SVG masters and PNG): the shared loop and one per
  product, with agent steps, human steps and proof steps visually distinguished. They are embedded in
  `docs/getting-started.md` and in the handbook.
- The diagrams and handbook are **generated**, not hand-drawn: `scripts/gen-diagrams.py` owns the layout
  and `scripts/gen-handbook.py` the prose, so a changed workflow is one edit and one regeneration.
- README: the handbook in the documentation table and the generators in the Development commands.
## 0.8.2 — 2026-10-27

### Documentation

- **A getting-started guide for a new install.** `docs/getting-started.md` answers the first questions a
  fresh AryaCode user has: what each of the four rows needs installed, how to install from the market,
  the loop every product follows (read ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ act in a copy ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ verify ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ hand off), a paste-ready first prompt
  per product, and the boundaries the bundle will not pretend away (Studio import/runtime, the missing
  tag CSV in a vendor export, MWI's IDE, Optix's bridge).
- README: a "New here?" pointer, a market-first Install section, corrected Status and Requirements
  (FTView authoring/export/schema, eleven L5X drafts) and the Getting started entry in the documentation
  table.
- Examples: section 7 now walks the real 0.8.x FactoryTalk View flow (vendor export ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ author ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢
  schema-validate ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ apply with the `BatchImport` manifest ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ verify the import), and a new section 9
  covers reading and authoring a FactoryTalk Optix project.
## 0.8.1 — 2026-10-27

### Added

- **FactoryTalk View ME authoring.** The surface no longer only edits an export someone handed over:
  - `ftview_apps` lists the ME applications installed on the host through the vendor export server
    (74 applications were listed on the commissioning host).
  - `ftview_export` exports one application to a NEW folder through `MEExportSvr` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â no Studio window,
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

- `packages/ftview/SKILL.md`: an Authoring section (apps ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ export ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ author ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ validate) and an Import
  and verify section that states plainly which steps remain Studio and ME Transfer Utility.
- README: 97 tools, FactoryTalk View ME 22, and the 0.8.0 milestone.
## 0.7.0 — 2026-10-27

### Added

- **Ladder generation that cannot emit invalid NeutralText.** Three pieces:
  - `list_instructions` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the instruction catalog the composer validates: mnemonic, category, summary
    and operand slots with their kinds (BOOL, NUMBER, TIMER, ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦), filterable. 41 instructions, covering
    every mnemonic the Laminator project uses (45 distinct across 860 rungs).
  - `compose_rung` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â builds one rung from a structure tree (`spec_json`) or a named pattern
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

- `packages/l5x/SKILL.md`: a Generate section (catalog ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ compose ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ validate ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ apply) and a
  Documentation section (bundle contents, the comment round trip, what the bundle cannot prove).
- README: 89 tools, L5X 44, and the 0.7.0 milestone.

## 0.6.0 — 2026-10-27

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

## 0.5.0 — 2026-10-27

Commissioned against the Laminator fixtures: a real Studio 5000 ACD exported to a 5.4 MB L5X, a
real FactoryTalk View ME export, and two MotionWorks projects.

### Fixed ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â FactoryTalk View could not read a real Studio export

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

### Fixed ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Studio 5000 checks drowned real findings in false positives

`run_checks` on the Laminator export produced 562 findings, 315 of them "unresolved reference", on a
project that compiles. Every one was an alias to module I/O (`In_FF_ModulePresent` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢
`FanFold_StraightCut_AENTR:2:I.7`): aliases carry no `DataType`, their targets are not declared
`<Tag>`s, and the fast resolver stopped instead of falling back to the canonical one.

- `resolveSymbol` now falls back to `resolveTag`, and an empty type with a trailing numeric part
  resolves as a bit.
- A member of a module-defined or opaque type (`Drive_MCFG.CommFLT`, `Axis_MAH.PC`) and `S:`/`R:`
  system flags are reported as coverage limits, not unresolved references.

**562 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 264 findings; unresolved 315 ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¾Ãƒâ€šÃ‚Â¢ 16**, with the unused-tag and multiple-write findings intact.

### Fixed ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â Studio 5000 edits

- **`add_tag` required a value for a scalar tag.** Studio defaults scalars to zero, so declaring a
  plain REAL was impossible without inventing a value; `value` is now optional and still validated
  when supplied.
- **Live reads refused aliases.** `read_live_tags` and `poll_live_tags` ran the write rule, so
  ordinary module-point BOOLs were rejected as "not a writable declared scalar". Reads and polls now
  take an alias's type from the canonical resolver; writes still refuse an alias and name the tag to
  write instead.
- **`export_acd_to_l5x` failed when Studio had the ACD open.** The SDK opens the file itself, so the
  normal case ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the project the user is working on ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â failed with "being used by another process". The
  export now copies the ACD and opens the copy, with the source hash re-checked before and after.

Verified end to end on the Laminator export: `draft_tag` (REAL, no value) plus a rung replacement
validated and applied to a 5,391,840-byte L5X.

### Fixed ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â MotionWorks IEC

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

- `docs/optix-netlogic.md`: how the FactoryTalk Optix NetLogic cheat sheet should be carried ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â a
  pinned snapshot, a generated index, and one `optix_netlogic` retrieval tool, with the risk flags and
  disclaimers the repository itself requires.

## 0.4.22 — 2026-10-27

### Fixed

- **No Python bytecode in the tarball, again.** 0.4.21 shipped three `__pycache__/*.pyc` files
  because a `py_compile` guard check ran in the checkout before packing, and `assemble.mjs` copied
  `code/` wholesale. They were inert ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the interpreter ignores a `.pyc` whose source no longer matches
  ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â but a stale `staging.cpython-312.pyc` beside a changed guard is exactly the ambiguity this
  release line must not carry. `assemble.mjs` now excludes `__pycache__` and `*.pyc` at copy time, so
  the outcome no longer depends on someone remembering to delete them.

## 0.4.21 — 2026-10-27

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

## 0.4.20 — 2026-10-27

### Fixed

- **The bundle no longer ships Python bytecode.** `__pycache__` and `*.pyc` from the MotionWorks
  engine are ignored and excluded, so the tarball contains only the sources the plugin runs.

## 0.4.19 — 2026-10-27

### Fixed

- **Reads without a project name find the attached project.** `mw_get`, `mw_help` and `mw_search`
  resolve the single project with a verified pre-edit backup when no `project` is passed, so the
  direct workflow no longer fails with `NO_PROJECT`. A leftover `.motionworks/stage` copy no longer
  shadows that project, and two attached projects are reported as `AMBIGUOUS_PROJECT` with both names.

## 0.4.18 — 2026-10-27

### Fixed

- **MotionWorks edits no longer demand a body hash the caller had to guess.** `mw_edit_code` with
  `changes` hashes the body it is about to patch when `expected_body_sha256` is omitted; the backup
  and exact find/replace still guard the write, and a supplied hash is still honored.
- **A stale stage no longer makes the direct workflow ambiguous.** When a project has a verified
  pre-edit backup, `singleStage()` now prefers that project over old `.motionworks/stage` copies.

## 0.4.17 — 2026-10-27

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
  `mw_project_open` now attaches that project ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â writes the verified backup and reports
  `already_open` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â instead of calling `OpenProject`, because a reload over unsaved editor changes is
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

## 0.4.16 — 2026-10-27

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

## 0.4.15 — 2026-10-27

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

## 0.4.14 — 2026-10-27

### Added

- **FactoryTalk Optix has a Configure page.** The `optix` row now mounts through
  `entries/optix.js`, which owns a volatile config schema and hands the prebuilt
  `@aryacode/dsh-tool-ft-optix` plugin plain options. Configure can set the Studio
  bridge origins and token, live authoring, destructive operations, exported-method
  invocation, the emulator preview and preview input. Live authoring is on by default from 0.4.15; the Configure page can
  switch it off. Reads work as soon as a project with the Studio bridge is open.
## 0.4.13 — 2026-10-27

### Changed

- **MotionWorks edits the real project again.** `mw_project_open` and `mw_ide_start` now take a
  workspace `.mwt` and work on its files directly. Before the first write they copy the wrapper and
  the expanded project into `<workspace>/backups/<project>/<timestamp>/`, hash every copied file in
  `backup-manifest.json`, verify the copy, and reuse that backup on later attaches. `mw_apply` saves
  in place; there is no sync-back step.
- **Staging is optional.** `mw_project_stage` remains for a sandbox copy, but the skill and tool
  descriptions lead with the direct path.

## 0.4.12 — 2026-10-27

### Fixed

- **The MotionWorks workspace setting was ignored.** `workspace` is volatile, so it arrives as a
  live reference; passing the reference to `configureWorkspace` did nothing. The row now unwraps it
  with `text()`, so the value saved in Configure is the folder the tools search.

## 0.4.11 — 2026-10-27

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

## 0.4.10 — 2026-10-26

### Fixed

- **The row settings page sat on "Loading configurationÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦".** The Plugins page snapshots a row's
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

## 0.4.9 — 2026-10-26

### Fixed

- Republished the row settings pages with the client half's declared service list taken from every
  bundled face rather than the two viewer faces. Same pages and same defaults as 0.4.8; this build is
  the installable one.

## 0.4.8 — 2026-10-26

### Fixed

- **The product rows had no settings page.** The bundle's client half never registered a
  `plugins.row.config` entry, so the Plugins page showed no Configure control for `l5x`, `ftview` or
  `mwi`, and the switches the README documents were unreachable without editing the profile patch by
  hand. `scripts/faces/settings.js` now registers one page per row: L5X editing, the Studio 5000 SDK,
  live EtherNet/IP and the two live writes; FactoryTalk View ME edits and the Studio handoff;
  MotionWorks IEC edits. Values are staged and saved through the row's own configuration form, and the
  defaults are unchanged.

## 0.4.7 — 2026-10-25

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
- `docs/architecture.md`: a new EtherNet/IP section ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â the two workers, the transaction engine's deadline
  and decoding, and the four gates that stand between a write request and a controller.
- `docs/port/l5x.md`: the live surface is recorded as seven tools with the driver call each one uses, and
  the unused capability (CIP subscriptions, UDT `Structure` reads) is named.
- `packages/l5x/README.md`: read and write tool tables, and the full live configuration row.

## 0.4.6 — 2026-10-25

### Added

The EtherNet/IP surface now uses the driver rather than one corner of it. Five new tools, all under the
L5X product row's `live` switch:

- `read_live_tags` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â up to 64 declared scalars in **one** request (CIP tag group) instead of one
  connection-and-read per tag.
- `read_controller_clock` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â controller identity plus the wall clock beside the workstation clock and the
  offset between them; reports "unsupported" on non-L8x models instead of guessing.
- `discover_controllers` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â bounded UDP broadcast discovery: address, product, revision, serial, status.
  Needs no address and no export.
- `write_live_tag` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â one declared scalar, **approval-gated**, then read back over CIP so the result is
  the controller's own value.
- `write_controller_clock` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â set the wall clock (L8x), approval-gated, read back.

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
  and a UDT tag refused as non-scalar ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â 70 tests in the package.

## 0.4.5 — 2026-10-25

### Changed

- **FactoryTalk Optix is vendored, so `dependencies` carries no plugin at all.** The Optix tree
  (`lib/`, `bridge/StudioMCPBridge.cs`, `templates/`, `locale/`, `icon.svg`) now lives in
  `packages/optix` and ships under `vendor/optix`; the `optix` row names
  `@aryacode/dsh-engineering/optix`. `@aryacode/dsh-tool-ft-optix` is gone from the manifest, which
  leaves one plugin to install and no component package to publish, keep in sync, or retire.
- The last dependency that remains is Optix's own runtime library, `playwright-core@1.61.1`, declared
  as a plain registry dependency.

One plugin now covers all four products: 5 rows, 79 tools, both previews, no component packages.

## 0.4.4 — 2026-10-25

### Changed

- **One row per product instead of one per surface.** The Plugins page now lists five rows ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â `l5x`,
  `ftview`, `mwi`, `viewers`, `optix` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â instead of sixteen. Each product row mounts its whole surface,
  so one switch turns a product off instead of four.
- **The optional surfaces are the row's config.** `entries/l5x.js` mounts read + guidance and takes
  `editing`, `studio` and `live` (all off by default); `entries/ftview.js` takes `edit` and `studio`
  (both on); `entries/mwi.js` takes `edit` (off). The defaults are unchanged ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â a read-only profile
  still pays only for the read surfaces ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â but the toggle now lives with the product it belongs to.
- Row ids change from `l5x-read` / `ftview-edit` / `mwi-verify` to `l5x` / `ftview` / `mwi`, so a
  profile's per-row enable state resets once on upgrade. The product-level defaults are identical.
- Legacy subpath exports are kept (`./l5x/read`, `./ftview/edit`, `./mwi/verify`, ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦) so a profile
  patch that still names one of them keeps working.

### Note

The grouping is plugin-side by choice: `cordis:group` exists in the patch format, but the Plugins
page skips group rows (`plugin-manager/src/index.ts`: "Group rows are containers ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¦ their children
carry the switches"), so a group switch is a shell feature rather than a bundle one. Collapsing the
row list is what a bundle can do on its own, without a harness change to maintain across DSH
upgrades.

## 0.4.3 — 2026-10-25

### Fixed

- **The vendored rows could not import their own libraries.** The trees under `vendor/` are the
  components' own code, and that code imports `fast-xml-parser`, `fast-xml-validator` and
  `st-ethernet-ip` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â but vendoring drops the component manifests, and the bundle declared none of them.
  At mount the loader reported `ERR_MODULE_NOT_FOUND` and every L5X and FactoryTalk View row failed to
  import, taking its tools with them. The bundle now declares all three at the versions the components
  pin, and `test/docs.spec.mjs` fails when a component dependency is not declared here.

## 0.4.2 — 2026-10-25

### Fixed

- **The bundle now installs and mounts in AryaCode.** 0.4.1 fixed the pnpm error, but the install still
  failed one step later, when the profile tried to apply the bundle: the patch's first entry targeted
  the `tool-capability-policy` row, and no such row exists in an AryaCode profile, so composition threw
  `dsh: [@aryacode/dsh-engineering] patch: entry "tool-capability-policy" not found` and the plugin
  manager rolled the install back ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â which is what the market card reported as *Cannot install*.

### Removed

- **The per-skill tool filter.** `policyOnly` / `toolPolicy` / `capabilities` are an AryaAI harness
  feature: AryaAI's fork of `@deepseek-ai/dsh-tool-skill` implements them, and the AryaCode line's copy
  of the same package does not. In this product the layer never filtered anything ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â an older harness
  skipped the missing row with a warning, the current one treats it as fatal. Rows are the switch:
  disabling `l5x-editing`, `l5x-studio`, `l5x-live` or `mwi-edit` unmounts that plugin and removes its
  tool schemas from the request, which is the same context saving by a mechanism this harness has.
- The patch is now **inserts only**, and `test/patch.spec.mjs` fails if any entry targets a row another
  bundle owns.

## 0.4.1 — 2026-10-25

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

## 0.4.0 — 2026-10-25

### Changed

- **One package, one client bundle.** The L5X ladder viewer and the FactoryTalk View ME display preview now ship inside `@aryacode/dsh-engineering` itself: `lib/client.js` registers once, under the bundle's own package name, and runs both faces inside that one factory. `@aryacode/dsh-engineering-l5x-viewer` and `@aryacode/dsh-engineering-ftview-viewer` are no longer dependencies, so the bundle declares no `@aryacode/*` dependency at all.
- The `l5x-viewer` and `ftview-viewer` rows collapse into one `viewers` row that mounts the bundle package itself. A client bundle is only discovered through a mounted row, and a package registers exactly one bundle, so both previews mount together; the tool rows stay independent of it.
- The bundle package gains a host half (`lib/index.js`): an entry that registers nothing of its own, present because the Shell scans the client face of packages that a row mounts.

### Added

- `scripts/build-client.mjs` builds `lib/client.js` from the two committed face bundles. The face bodies are copied verbatim, each in its own closure, and the merged plugin exports the union of both faces' services. `pnpm build:client` regenerates the artifact; `pnpm pack` runs it first.
- `test/client-face.spec.mjs` holds the three properties that would otherwise fail silently in the app: the registration id equals the package name, the factory materializes with both faces and merges their services, and `apply` mounts both previews. It also fails when `lib/client.js` is stale against its faces.

## 0.3.0 — 2026-10-23

### Added

- **FactoryTalk Optix as a bundle component:** the `optix` row mounts `@aryacode/dsh-tool-ft-optix` (Studio discovery, live authoring, validation, templates, preview and OCR) from a released component tarball. The standalone tool plugin is no longer a product entry or an installer dependency.
- The bundle now registers 79 tools: the 73 generated reference tools plus six Optix tools. Optix stays unlinked to a skill until one exists.

## 0.2.0 — 2026-10-23

### Added

- **MotionWorks IEC rows:** `mwi-session` (find, stage, open, start, status, worksheet, close), `mwi-read` (overview, list, get, search, references, review, help), `mwi-verify` (compile, diagnostics, saved-source baselines) and `mwi-edit` (code, declarations, structure, block insertion, POU packages, validation, apply), plus the `mwi-read-skill` guidance.
- The redesigned surface is 24 tools over the proven 32-bit COM bridge and the Python saved-model engine. It is verified live against MotionWorks IEC 3 Pro 1.19: stage, start, worksheet, close, saved-project reads, compile diagnostics, code replacement, declaration add, POU create/delete, block insertion and a POU package export/delete/import round trip.
- The edit row is off by default. Edits write only the staged copy and verify unrelated saved and native state.

### Changed

- The bundle is now 73 tools. MotionWorks IEC mounts here instead of as a separate plugin.

Notable changes to `dsh-engineering`. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.2 — 2026-10-23

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

## 0.1.1 — 2026-10-23



- Add the FTView Studio entry `ftview-studio`: `ftview_studio_status`, `ftview_studio_preflight`, `ftview_studio_handoff` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â discovery of installs, schemas, help and the Add Component utility, changed-file preflight with Studio name restrictions, and the ordered manual import plan. No vendor utility is executed.
- Add 6 Studio tests: registration, discovery with a simulated install, absent install, changed-file preflight, unsafe-name blocker and the handoff plan. FTView suite is 26 tests.

- Add the FTView editing entry `ftview-edit`: `ftview_draft_display_set`, `ftview_draft_display_add`, `ftview_draft_tag_upsert`, `ftview_validate`, `ftview_apply` ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â one operation per call, text-preserving transforms, re-parsed validation, and apply to a new folder that never touches the source. Row disabled until the old plugin retires.
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
- Record that the old plugin's `face.ts` and `Studio5000.tsx` were dead code ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â never imported by its client entry ÃÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã‚Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â so the two-rung ladder rail is not a ported feature. A ladder viewer for L5X documents would be new work.
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

## 0.1.0

- Add the engineering bundle: a phase-1, additive loader layer that targets the existing `tool-capability-policy` row and links `l5x_*`, `ftview_*` and `mw_*` to the skills that govern them.
- Keep `onDemand: false` so the bundle does not change the product-wide eager tool exposure Arya measured and kept.
- Insert no plugin rows, so existing profiles and product plugin ids are untouched.
