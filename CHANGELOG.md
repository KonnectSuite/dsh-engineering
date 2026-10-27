# Changelog

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

- **A sourced renderer for the display preview.** The FTView face had no source, only a committed closure bundle. `packages/ftview-viewer/src` now owns an XML reader and an SVG renderer with tests, and `scripts/ftview-preview.mjs` renders any display export to SVG/HTML (plus a headless PNG) outside the app. On the real Laminator `Main Screen` it draws the object set the artifact dropped — **button captions from `<states><state><caption>`**, per-state colours, groups, and numeric fields — which is why the old preview showed blank navigation buttons.
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

- FactoryTalk View read surface: 6 → 7 tools; bundle total 99 → 100.

### Known gaps

- The live *values* route and the new viewer are not in this release. The mapping and assets they depend on are.
## [0.9.3] - 2026-10-27

### Fixed

- **`ftview_export` reported `0 display(s)` for a successful export.** The display count used a pattern that
  required a leading slash, but export paths are relative (`Displays/Main Screen.xml`), so every export said
  zero displays even when it wrote thirteen. The count now matches the paths the tool actually returns.
- **The tags and alarms warning now says what it means.** The copied `Alarms/Alarms.xml` and
  `Tags/<application>.csv` are snapshots Studio last wrote when those components were exported from their
  editors — not fresh data. The warning states that, and that the application export in Studio is what
  refreshes them. There is no supported headless export for either component; this is the honest boundary.
## [0.9.2] - 2026-10-27

### Fixed

- **The `engineering-standards` skill was missing from the catalog.** 0.9.1 mounted it by calling the skills
  service from inside the resources row's `apply()`, which only works if that service already exists at that
  row's turn — it mounts before the Optix row, so the skill was silently skipped (the tools still loaded).
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
  rule IDs (`CRAFT-NAME-01`, `VIEW-HPM-02`, …). `engineering_reference` lists the contents, ranks pages for a
  query and returns one page with its rules; search is deterministic and needs no network, embedding model or
  tokenizer. `scripts/gen-resources.mjs` validates every page (fields, domains, id/file agreement, rule
  uniqueness, size and word budgets) and generates `index.json`/`SOURCE.json`; `pnpm resources:check` fails on
  a stale index.
- **House-style profiles.** `engineering_profile` reads the conventions of the open project — L5X tag prefixes
  and case, seal-in and latch forms, comment density; FactoryTalk View palette, fonts, button geometry,
  navigation and popups — with counts, evidence and a `low`/`medium`/`high` confidence. A profile is evidence,
  not authority, and the tool says which project and SHA-256 it came from.
- **Generation follows the profile.** `ftview_draft_display_create` applies the profile's background colour and
  `ftview_draft_object_add` its button geometry and font when the caller omits them, reporting
  `profile_applied`.
- **New `resources` row and the `engineering-standards` skill.** The row mounts the two tools and the skill
  that tells a model to read the relevant page and the project profile before authoring. Tools 97 → 99, rows
  5 → 6.
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
  read → act → verify → hand-off loop, what the agent does, what stays human, and a "what proves what"
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
  the loop every product follows (read → act in a copy → verify → hand off), a paste-ready first prompt
  per product, and the boundaries the bundle will not pretend away (Studio import/runtime, the missing
  tag CSV in a vendor export, MWI's IDE, Optix's bridge).
- README: a "New here?" pointer, a market-first Install section, corrected Status and Requirements
  (FTView authoring/export/schema, eleven L5X drafts) and the Getting started entry in the documentation
  table.
- Examples: section 7 now walks the real 0.8.x FactoryTalk View flow (vendor export → author →
  schema-validate → apply with the `BatchImport` manifest → verify the import), and a new section 9
  covers reading and authoring a FactoryTalk Optix project.
## [0.8.1] - 2026-10-27

### Added

- **FactoryTalk View ME authoring.** The surface no longer only edits an export someone handed over:
  - `ftview_apps` lists the ME applications installed on the host through the vendor export server
    (74 applications were listed on the commissioning host).
  - `ftview_export` exports one application to a NEW folder through `MEExportSvr` — no Studio window,
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

- `packages/ftview/SKILL.md`: an Authoring section (apps → export → author → validate) and an Import
  and verify section that states plainly which steps remain Studio and ME Transfer Utility.
- README: 97 tools, FactoryTalk View ME 22, and the 0.8.0 milestone.
## [0.7.0] - 2026-10-27

### Added

- **Ladder generation that cannot emit invalid NeutralText.** Three pieces:
  - `list_instructions` — the instruction catalog the composer validates: mnemonic, category, summary
    and operand slots with their kinds (BOOL, NUMBER, TIMER, …), filterable. 41 instructions, covering
    every mnemonic the Laminator project uses (45 distinct across 860 rungs).
  - `compose_rung` — builds one rung from a structure tree (`spec_json`) or a named pattern
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

- `packages/l5x/SKILL.md`: a Generate section (catalog → compose → validate → apply) and a
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

### Fixed — FactoryTalk View could not read a real Studio export

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

### Fixed — Studio 5000 checks drowned real findings in false positives

`run_checks` on the Laminator export produced 562 findings, 315 of them "unresolved reference", on a
project that compiles. Every one was an alias to module I/O (`In_FF_ModulePresent` →
`FanFold_StraightCut_AENTR:2:I.7`): aliases carry no `DataType`, their targets are not declared
`<Tag>`s, and the fast resolver stopped instead of falling back to the canonical one.

- `resolveSymbol` now falls back to `resolveTag`, and an empty type with a trailing numeric part
  resolves as a bit.
- A member of a module-defined or opaque type (`Drive_MCFG.CommFLT`, `Axis_MAH.PC`) and `S:`/`R:`
  system flags are reported as coverage limits, not unresolved references.

**562 → 264 findings; unresolved 315 → 16**, with the unused-tag and multiple-write findings intact.

### Fixed — Studio 5000 edits

- **`add_tag` required a value for a scalar tag.** Studio defaults scalars to zero, so declaring a
  plain REAL was impossible without inventing a value; `value` is now optional and still validated
  when supplied.
- **Live reads refused aliases.** `read_live_tags` and `poll_live_tags` ran the write rule, so
  ordinary module-point BOOLs were rejected as "not a writable declared scalar". Reads and polls now
  take an alias's type from the canonical resolver; writes still refuse an alias and name the tag to
  write instead.
- **`export_acd_to_l5x` failed when Studio had the ACD open.** The SDK opens the file itself, so the
  normal case — the project the user is working on — failed with "being used by another process". The
  export now copies the ACD and opens the copy, with the source hash re-checked before and after.

Verified end to end on the Laminator export: `draft_tag` (REAL, no value) plus a rung replacement
validated and applied to a 5,391,840-byte L5X.

### Fixed — MotionWorks IEC

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

- `docs/optix-netlogic.md`: how the FactoryTalk Optix NetLogic cheat sheet should be carried — a
  pinned snapshot, a generated index, and one `optix_netlogic` retrieval tool, with the risk flags and
  disclaimers the repository itself requires.

## [0.4.22] - 2026-10-27

### Fixed

- **No Python bytecode in the tarball, again.** 0.4.21 shipped three `__pycache__/*.pyc` files
  because a `py_compile` guard check ran in the checkout before packing, and `assemble.mjs` copied
  `code/` wholesale. They were inert — the interpreter ignores a `.pyc` whose source no longer matches
  — but a stale `staging.cpython-312.pyc` beside a changed guard is exactly the ambiguity this
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
  `mw_project_open` now attaches that project — writes the verified backup and reports
  `already_open` — instead of calling `OpenProject`, because a reload over unsaved editor changes is
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

- **The row settings page sat on "Loading configuration…".** The Plugins page snapshots a row's
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
- `docs/architecture.md`: a new EtherNet/IP section — the two workers, the transaction engine's deadline
  and decoding, and the four gates that stand between a write request and a controller.
- `docs/port/l5x.md`: the live surface is recorded as seven tools with the driver call each one uses, and
  the unused capability (CIP subscriptions, UDT `Structure` reads) is named.
- `packages/l5x/README.md`: read and write tool tables, and the full live configuration row.

## [0.4.6] - 2026-10-25

### Added

The EtherNet/IP surface now uses the driver rather than one corner of it. Five new tools, all under the
L5X product row's `live` switch:

- `read_live_tags` — up to 64 declared scalars in **one** request (CIP tag group) instead of one
  connection-and-read per tag.
- `read_controller_clock` — controller identity plus the wall clock beside the workstation clock and the
  offset between them; reports "unsupported" on non-L8x models instead of guessing.
- `discover_controllers` — bounded UDP broadcast discovery: address, product, revision, serial, status.
  Needs no address and no export.
- `write_live_tag` — one declared scalar, **approval-gated**, then read back over CIP so the result is
  the controller's own value.
- `write_controller_clock` — set the wall clock (L8x), approval-gated, read back.

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
  and a UDT tag refused as non-scalar — 70 tests in the package.

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

- **One row per product instead of one per surface.** The Plugins page now lists five rows — `l5x`,
  `ftview`, `mwi`, `viewers`, `optix` — instead of sixteen. Each product row mounts its whole surface,
  so one switch turns a product off instead of four.
- **The optional surfaces are the row's config.** `entries/l5x.js` mounts read + guidance and takes
  `editing`, `studio` and `live` (all off by default); `entries/ftview.js` takes `edit` and `studio`
  (both on); `entries/mwi.js` takes `edit` (off). The defaults are unchanged — a read-only profile
  still pays only for the read surfaces — but the toggle now lives with the product it belongs to.
- Row ids change from `l5x-read` / `ftview-edit` / `mwi-verify` to `l5x` / `ftview` / `mwi`, so a
  profile's per-row enable state resets once on upgrade. The product-level defaults are identical.
- Legacy subpath exports are kept (`./l5x/read`, `./ftview/edit`, `./mwi/verify`, …) so a profile
  patch that still names one of them keeps working.

### Note

The grouping is plugin-side by choice: `cordis:group` exists in the patch format, but the Plugins
page skips group rows (`plugin-manager/src/index.ts`: "Group rows are containers … their children
carry the switches"), so a group switch is a shell feature rather than a bundle one. Collapsing the
row list is what a bundle can do on its own, without a harness change to maintain across DSH
upgrades.

## [0.4.3] - 2026-10-25

### Fixed

- **The vendored rows could not import their own libraries.** The trees under `vendor/` are the
  components' own code, and that code imports `fast-xml-parser`, `fast-xml-validator` and
  `st-ethernet-ip` — but vendoring drops the component manifests, and the bundle declared none of them.
  At mount the loader reported `ERR_MODULE_NOT_FOUND` and every L5X and FactoryTalk View row failed to
  import, taking its tools with them. The bundle now declares all three at the versions the components
  pin, and `test/docs.spec.mjs` fails when a component dependency is not declared here.

## [0.4.2] - 2026-10-25

### Fixed

- **The bundle now installs and mounts in AryaCode.** 0.4.1 fixed the pnpm error, but the install still
  failed one step later, when the profile tried to apply the bundle: the patch's first entry targeted
  the `tool-capability-policy` row, and no such row exists in an AryaCode profile, so composition threw
  `dsh: [@aryacode/dsh-engineering] patch: entry "tool-capability-policy" not found` and the plugin
  manager rolled the install back — which is what the market card reported as *Cannot install*.

### Removed

- **The per-skill tool filter.** `policyOnly` / `toolPolicy` / `capabilities` are an AryaAI harness
  feature: AryaAI's fork of `@deepseek-ai/dsh-tool-skill` implements them, and the AryaCode line's copy
  of the same package does not. In this product the layer never filtered anything — an older harness
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



- Add the FTView Studio entry `ftview-studio`: `ftview_studio_status`, `ftview_studio_preflight`, `ftview_studio_handoff` — discovery of installs, schemas, help and the Add Component utility, changed-file preflight with Studio name restrictions, and the ordered manual import plan. No vendor utility is executed.
- Add 6 Studio tests: registration, discovery with a simulated install, absent install, changed-file preflight, unsafe-name blocker and the handoff plan. FTView suite is 26 tests.

- Add the FTView editing entry `ftview-edit`: `ftview_draft_display_set`, `ftview_draft_display_add`, `ftview_draft_tag_upsert`, `ftview_validate`, `ftview_apply` — one operation per call, text-preserving transforms, re-parsed validation, and apply to a new folder that never touches the source. Row disabled until the old plugin retires.
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
- Record that the old plugin's `face.ts` and `Studio5000.tsx` were dead code — never imported by its client entry — so the two-rung ladder rail is not a ported feature. A ladder viewer for L5X documents would be new work.
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
