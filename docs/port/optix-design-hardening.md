# Optix design hardening — the plan

**Status 2026-11-15: implemented and verified.** W1-W6 are in the tree (`optix_schema` with the
generated catalog, `optix_svg`, eleven corpus pages, two NetLogic routing pages, four new design
rules, and the variable anatomy), the suite is green at 58 files, and `test/optix-live-e2e.mjs` ran
against Studio 1.8.1.27 with bridge 1.0.9 on project `OptixStandard`: catalog answered, drawing
inspected, placed and bound, analog anatomy written, design check fired and cleared, probe nodes
deleted. The four open questions are answered below by measurement rather than assumption:
shipping the snapshot with a `refresh` diff is what shipped; no Studio-side converter is needed
because a literal hex colour binds directly; the layout rule compares absolute canvas geometry
against the parent rectangle; and the bridge cannot create a variable of `AnalogItemType`, so the
analog shape is a Float plus `EngineeringUnits`/`EURange`/`EURangeLow`/`EURangeHigh`.

Written 2026-11-15. This is the working plan for the next Optix batch: making the
component able to *design* a project as well as author one. It follows
`docs/port/optix-hmi-design-lane.md` (the screen/scaffold lane, now shipped in
0.95.1) and answers three questions asked directly:

1. What Optix design best practices would harden an agent designing a project?
2. AdvancedSVG — what is it, and should the tool set grow around it?
3. If a user asks for NetLogic, does the agent have the resources to write
   accurate C#?
4. Asked mid-plan: does the agent understand how to add and use **variables on
   components** — the Studio's `New > Variable / Analog variable / Node pointer
   / Alias` items on any object?

The short answers: (1) the missing thing is the *mechanics* vocabulary, not more
philosophy, and the installed Studio already ships it as a machine-readable
reference; (2) yes, one new tool, because SVG is the only production-grade
artwork path whose parts can be animated at runtime, and the hard part is
conformance rather than authoring; (3) the NetLogic backing is genuinely
substantial — 51 pages, ~700 KB — but it has no router from "the user's request"
to "the page that answers it", and no API index to check a type or member
against before writing code that fails to compile.

---

## Evidence base

### The installed Studio reference (the unused asset)

`C:\Program Files\Rockwell Automation\FactoryTalk Optix\Studio 1.8.1.27\Help\en`
holds 23,337 pages. Inside it, `Reference\` is a **complete, version-locked API
reference**: one page per object type, data type and variable type, with
BrowseName, SuperType, every property and its DataType, methods with their
arguments, and events.

| Namespace | pages | ObjectTypes | DataTypes | VariableTypes |
| --- | --- | --- | --- | --- |
| `FTOptix-UI` | 165 | 118 | 44 | 2 |
| `FTOptix-Core` | 65 | 25 | 28 | 11 |
| `FTOptix-HMIProject` | 40 | 33 | 4 | 2 |
| `FTOptix-Report` | 24 | 19 | 4 | — |
| `FTOptix-OPCUAClient` | 20 | 4 | 15 | — |
| `FTOptix-Alarm` | 19 | 15 | 3 | — |
| `FTOptix-AuditSigning` | 15 | 11 | 3 | — |
| `FTOptix-Recipe`, `-Retentivity`, `-DataLogger`, `-EventLogger`, `-Store*`, `-System`, `-MQTTClient`, `-SerialPort`, `-TagImporter`, PLC drivers … | 6–39 each | 2–13 | 2–19 | 2–8 |
| `OPC-UA` | 756 | 253 | 440 | 62 |

Layout: `Reference\<Namespace>\ObjectTypes\<Type>.html`,
`...\DataTypes\<Enum>.html`, `...\VariableTypes\<Type>.html`. Tutorials with
worked recipes live beside it under
`tutorials\graphic-objects\{advanced-svg,animated-svg,hide-svg,…}`.

The bridge was already built for this: `StudioMCPBridge.cs:1187-1208`
(`GET /bridge/schema/dump`) dumps "the WHOLE builtin type catalog × per-type
property reflection, in one call, so the service can cache it offline (keyed by
Studio version) and diff it across Studio upgrades". The plugin exposes only
`optix_read { action: "type_schema" | "ui_types" }`, so nothing caches it, nothing
diffs it, and nothing validates against it before a write.

What this asset unlocks (this is the W1 case, spelled out):

- **The right property name, first time.** Today `optix_edit` finds out by
  refusal. The reference knows every settable property per type, so a wrong name
  becomes a local error with the closest correct names attached.
- **Enum values with their numbers.** `ImageFillModeEnum` (Fit/Stretch/Tile),
  `AdvancedSVGImagePropertyClass` (0/1/2/3), alignment, severity, message-box
  kinds. Guessing an enum is the most common cause of a screen that renders
  wrongly but reports no error.
- **The allowed-children graph.** Which types may be created inside which
  (placeholder collections). That turns `create_widget` from trial-and-error into
  a lookup, and lets `optix_screen` choose legal children per slot.
- **Method signatures and events.** For `optix_action invoke`, for
  `wire_event` argument names (`NewPanel=…;AliasNode=…`), and for NetLogic calls
  such as `SetImageContent(string)`.
- **Version drift made visible.** Regenerate per Studio version and diff: a
  renamed property or a dropped type is reported at upgrade time instead of
  surfacing as a stale write months later. This is the same failure class as the
  bridge drift (1.0.7 vs 1.0.9 templates) this repo has already paid for twice.
- **Offline.** It needs no Studio, no network and no license, which matters
  because the design phase happens *before* Studio is open.
- **Rule citations.** Each `design.js` finding can name the reference page that
  justifies it.

Licensing stance: extract **identifiers and datatypes only** (type names,
property names, DataType names, method signatures, enum numeric values) — the
factual API surface — never Rockwell's descriptive prose, and record the source
path plus Studio version in the artefact.

### What the bridge already does (so the plan does not re-invent it)

- `WriteWidgetInline` (`:3062`) resolves *any* widget type via
  `ResolveUiTypeId`, and `ResolveWidgetClrType` (`:2013`) scans loaded
  `FTOptix*` assemblies — so `AdvancedSVGImage` and
  `AdvancedSVGImageElementProperty` are authorable today with no bridge change.
- `MatchingPlaceholderColls` (`:3043`) auto-routes a created child into the
  parent's placeholder collection (`SVGElementProperties`), with explicit
  `read_only_collection` / `ambiguous_container` / `not_renderable` refusals.
- `ResolveDataType` (`:2376`) knows `Color` and `ResourceUri`;
  `CoerceCheck` validates `Color` but has **no `ResourceUri` arm**, so writing
  `Path` from a string is unverified.
- `GET /bridge/schema/dump` (`:694`, `SchemaDumpJson` `:1208`) exists, uncalled.
- `GET /bridge/types/ui`, `/bridge/types/schema?type=`, `/bridge/node/typeinfo`,
  `/bridge/node/varmembers` give live per-type answers while Studio is open.

### What the corpus and the NetLogic snapshot already do

- `packages/resources/corpus/hmi/` (6 pages): ISA-101 baseline, screen
  architecture, standards precedence, the Rockwell process style guide, colour
  and contrast, targets and labels. The *philosophy* layer is in place.
- `packages/resources/corpus/optix/` (10 pages, 21 rule ids): application recipe
  (`OPTIX-RCP-01..06`), widget patterns (`OPTIX-WID-01..03`), navigation
  (`OPTIX-NAV-01..03`), bindings (`OPTIX-BIND-01..03`), UI structure
  (`OPTIX-UI-01..02`), model structure (`OPTIX-MDL-01..06`), NetLogic
  (`OPTIX-NL-01..12`), design resources (`OPTIX-RES-01..02`), alarms and trends
  (`OPTIX-ALM-01..02`).
- `packages/optix/netlogic/pages/` — 51 pages, ~700 KB, from
  Rockwell's own NetLogic cheat-sheet snapshot, including `threading.md` (14.9 KB),
  `element-access.md` (39.8 KB), `queries.md` (38.7 KB), `recipex.md` (83.5 KB),
  `dynamic-links.md` (37.5 KB), `creating-objects.md` (13.5 KB),
  `resource-uri.md` (11.1 KB) and `advanced-svg.md` (4.7 KB), indexed by
  `index.json` (35.2 KB).
- `packages/optix/lib/design.js` enforces `HMI-CONTRAST-01`, `HMI-TARGET-01/02`,
  `VIEW-LAYOUT-02`, `VIEW-NAV-01/02`, `OPTIX-UI-01/02`.

### The measured gaps

1. No vocabulary: nothing in the bundle knows the property set, enum values or
   allowed children of any Optix type.
2. No mechanics corpus: style sheets, layout containers, panels/popups, data
   presentation, images/SVG, security, translations, alarm object model, recipes,
   performance, web-vs-native — none of these have a page.
3. No SVG path at all, and no conformance lint for the one artwork format whose
   dynamic parts can fail silently.
4. NetLogic: no request→page router, no namespace/type map, no way to check an
   API call without compiling.
5. Check surface (8 rules) is thin next to the write surface.

---

## W1 — The schema catalog and `optix_schema`

**Goal.** The agent can look up any Optix type, its properties and their
datatypes, its methods and events, its allowed children, and any enum's values,
offline, before writing anything.

**Files.**

- `scripts/gen-optix-schema.mjs` — parses `Help\en\Reference\**\*.html` into
  `packages/optix/schema/optix-schema.json`:
  ```json
  {
    "schemaVersion": 1,
    "studioVersion": "1.8.1.27",
    "generatedFrom": "…/Studio 1.8.1.27/Help/en/Reference",
    "types": {
      "AdvancedSVGImage": {
        "namespace": "FTOptix-UI",
        "browseName": "AdvancedSVGImage",
        "superType": "Container",
        "properties": [{ "name": "Path", "dataType": "ResourceUri", "settable": true }],
        "methods": [{ "name": "SetImageContent", "args": [{ "name": "ImageContent", "dataType": "String" }] }],
        "events": ["MouseDown", "MouseUp"],
        "children": ["AdvancedSVGImageElementProperty"]
      }
    },
    "enums": { "AdvancedSVGImagePropertyClass": [{ "value": 0, "name": "Color" }] }
  }
  ```
  The `children` edge is derived from each parent page's element-type
  properties (e.g. `SVGElementProperties` → element type `SVG Element
  Property`), resolved across namespaces.
- `packages/optix/lib/schema.js` — loader, index and query helpers
  (`loadSchema()`, `findTypes(query)`, `typeInfo(name)`, `enumInfo(name)`,
  `closestProperty(type, wrong)` for "did you mean").
- `packages/optix/lib/index.js` — new tool `optix_schema`:
  - `{ action: "type", name }` → supertype chain, settable properties with
    datatypes, methods with args, events, allowed children, and the rule ids or
    corpus pages that mention it.
  - `{ action: "enum", name }` → values with numeric and display names.
  - `{ action: "find", query }` → types/enums/properties matching, plus "type X
    has property P" answers.
  - `{ action: "children", name }` → what may be created inside.
  - `{ action: "refresh" }` → requires the bridge; pulls
    `/bridge/schema/dump`, diffs it against the shipped snapshot and reports
    added/removed types and properties (the Studio-upgrade drift check). Never
    writes the snapshot; the generator does that.
- `packages/optix/lib/index.js` — `optix_edit` refusals gain a hint from the
  snapshot: unknown property → closest names; unknown type → closest types;
  wrong enum value → the legal list.
- `test/optix-schema.spec.mjs` — generator against a small fixture help tree
  (two types, one enum, one placeholder collection), snapshot integrity (every
  entry ASCII identifier, no prose paragraph, has `studioVersion`), and each
  tool action including `refresh` with a stubbed dump.

**Acceptance.** `optix_schema { action: "type", name: "AdvancedSVGImage" }`
returns the property set measured from
`Reference\FTOptix-UI\ObjectTypes\AdvancedSVGImage.html`; `enum` of
`AdvancedSVGImagePropertyClass` returns 0–3 with names; a wrong property name in
`optix_edit` produces the correct suggestion without a bridge round trip; a
`refresh` against a live Studio reports zero differences on a matching version.

**Risks.** HTML parsing across Studio versions — mitigated by a fixture test, a
version stamp, and `refresh` as the drift detector; if a page shape changes, the
generator fails loudly with the page path rather than emitting a partial catalog.

## W2 — The mechanics corpus

**Goal.** `engineering_reference` answers "how do I do this in Optix" for every
part of the product the authoring tools can touch, in pages small enough to read
in a turn.

**Files** (all in `packages/resources/corpus/optix/`, same front-matter shape as
the existing pages: `id`, `title`, `domain: optix`, `level`, `basis`, `tags`,
`applies_to`, `rules`):

| Page | Rules | Contents |
| --- | --- | --- |
| `optix-style-sheets-and-appearance.md` | `OPTIX-STYLE-01..03` | DefaultStyleSheet and per-type styles, when a style beats a literal property, how the house palette is expressed once, theme switching |
| `optix-layout-and-containers.md` | `OPTIX-LAYOUT-01..04` | absolute canvas vs `Grid`/`Column`/`Row`/`Scale`, margins vs size, alignment, Z-order, hit test, 1920×1080 desktop vs 1280×800 panel |
| `optix-panels-and-dialogs.md` | `OPTIX-PANEL-01..03` | `Panel`/`PanelLoader`/`ChangePanel`, popups and dialogs, session-scoped instances, alias node, who owns the shell bar |
| `optix-data-presentation.md` | `OPTIX-DATA-01..03` | Label vs TextBox vs DataGrid vs ListView vs LED/gauge/chart, formatting, units, decimals, update cost |
| `optix-images-and-svg.md` | `OPTIX-IMG-01..04` | Image vs MultiStateImage vs AdvancedSVGImage, SVG 1.2 Tiny rules, element properties, project-relative `%PROJECTDIR%` paths, `SetImageContent` trade-offs |
| `optix-alarm-object-model.md` | `OPTIX-ALARM-01..03` | alarm types/instances/triggers, severity and groups, acknowledgement, history vs the guidance already in `optix-alarms-and-trends.md` |
| `optix-users-and-security.md` | `OPTIX-SEC-01..03` | users/roles/groups, login pane, auto-logout, sessions, audit |
| `optix-translations.md` | `OPTIX-I18N-01..02` | translation keys, locale switching, text that must not be hard-coded |
| `optix-recipes-and-retentivity.md` | `OPTIX-RCP-07..08` | recipe schema, storage, retentivity scope |
| `optix-performance-and-engine.md` | `OPTIX-PERF-01..03` | web vs native presentation engine, update rates, trend and grid cost, what to measure before optimising |

Plus: `optix-design-resources.md` gains a row per new page, and each page cites
the vendor reference page(s) it is based on (`basis:`), so a claim can be checked.

**Acceptance.** `engineering_reference { query: "style sheet" }` returns the new
page; `engineering_reference { query: "<each new rule id>" }` returns its page;
every page parses (the corpus spec already validates front-matter).

**Non-goal.** No product-neutral content moves out of `corpus/hmi/`; these pages
are the Optix mechanics that sit under those rules.

## W3 — `optix_svg`

**Goal.** An agent can take an SVG, know whether Optix will be able to animate
its parts *before* placing it, place it correctly, and bind a part to a tag.

**Files.**

- `packages/optix/lib/svg.js` — pure functions, no Studio needed:
  - `inspectSvg(text)` → `{ ids: [{id, fill, stroke, opacity, style}], findings, controlable }`
    with findings classified `blocks_control` (no `id`, colour not hex, colour
    not on the part, SVG 1.2 Tiny markers absent) vs `may_not_display`
    (unsupported constructs). `controlable` lists each id with the
    `AdvancedSVGImagePropertyClass` values that make sense for it.
  - `repairPlan(findings)` → the minimal edits (e.g. `fill="rgb(255,0,0)"` →
    `fill="#FF0000"`), as text suggestions, never a silent rewrite.
- `packages/optix/lib/index.js` — new tool `optix_svg`:
  - `{ action: "inspect", source | inline }` → the report above, plus `next`.
  - `{ action: "add", screen, name, source | inline, box }` → copy the file to
    `<project>/imgs/<name>.svg`, `create_widget` `AdvancedSVGImage`, set `Path`
    to `%PROJECTDIR%/imgs/<name>.svg`, set geometry, then read the node back and
    report the saved `Path`.
  - `{ action: "bind", node, id, property, value | source_path | bool_colours }` →
    create `AdvancedSVGImageElementProperty` under `SVGElementProperties` with
    `ID`, `Property`, `Value`; for a boolean driving a colour, emit the measured
    pattern (conditional converter producing two hex values) where the bridge can
    express it, otherwise refuse with the exact instruction for the engineer.
  - `{ action: "list", screen }` → the image objects and their element-property
    children, so a design review can see what is animated.
- `packages/resources/corpus/optix/optix-images-and-svg.md` (from W2) documents
  the decision table and the conformance rules.
- `packages/optix/SKILL.md` — a short "Artwork" block: `optix_svg inspect` first,
  then `add`, then `bind`; pointer to the corpus page.
- `test/optix-svg.spec.mjs` — `inspectSvg` against a conformant fixture, a
  non-conformant one (rgb() colour, no ids, 1.1 header), and a part with
  `stroke-dasharray`; op emission for `add`/`bind` with a stub bridge; `bind`
  refusing when `bool_colours` cannot be expressed.

**Probe first (live, scratch project, before building `add`).** Two unknowns:
whether `set_property Path` accepts a string `ResourceUri` (the coercion has no
`ResourceUri` arm), and whether a created `AdvancedSVGImageElementProperty` lands
in `SVGElementProperties` via `MatchingPlaceholderColls`. Either failure is a
small, local bridge change recorded in `bridge/source.json`.

**Acceptance, end to end.** A deliberately non-conformant SVG is reported as
non-controllable with the reason and the repair; after repair, `add` places it,
`bind` colour-binds a part to a Boolean tag, the engineer's save+build, and
`optix_emulator` + `optix_screenshot` shows the part in its "true" colour, then a
NetLogic flip changes it.

## W4 — NetLogic routing and API index

**Goal.** A NetLogic request lands on the right cheat-sheet page immediately, and
the agent can check an API call before compiling.

**Files.**

- `packages/optix/SKILL.md` — a routing table, ten lines: alarm → `alarming.md`;
  trend/history → `trends.md`; PLC tag → `plc-tags.md`; login/session →
  `users-groups.md` + `sessions.md`; recipe → `recipes.md`; popup/dialog →
  `dialog-boxes.md`; grid → `datagrids.md`; colour/opacity animation →
  `ui-animations.md` + `advanced-svg.md`; folder walk/query → `queries.md`;
  timer → `async-tasks.md` / `threading.md`.
- `packages/optix/netlogic/pages/index-by-task.md` — generated grouping of the 51
  pages by task, from `index.json`, so `optix_netlogic { query }` can hit tasks
  and not only slugs.
- `packages/optix/netlogic/pages/api-namespaces.md` — which namespace and type
  for what: `FTOptix.Core`, `FTOptix.UI`, `FTOptix.Alarm`, `FTOptix.Recipe`,
  `UAManagedCore`; `LogicObject`, `Project.Current`, `InformationModel`,
  `Owner.Get<T>()`, `NodeId.Empty`, `NodePath`.
- `packages/optix/schema/netlogic-types.json` — curated map from the ~40 UI
  object types that matter to their CLR types (`AdvancedSVGImage` →
  `FTOptix.UI.AdvancedSVGImage`), served by `optix_schema { action: "type" }` as
  `clrType`, so NetLogic code names types correctly; `dotnet build` stays the
  authority.
- One new review rule in `optix_script review`: UI-touching NetLogic must use the
  access patterns from `element-access.md` and must not call `SetImageContent` at
  design time (the cheat-sheet records it does not work there).

**Acceptance.** Asking `optix_netlogic { query: "alarm banner" }` ranks
`alarming.md`; `optix_schema type Container` reports `clrType`; a NetLogic that
calls `SetImageContent` in `Start()` is flagged by review with the page cited.

## W5 — Design rules (the check surface)

**Goal.** The checks catch the four mistakes the new corpus warns about, from the
live model, cheaply.

**Files.** `packages/optix/lib/design.js` plus specs:

- `OPTIX-IMG-01` — an `AdvancedSVGImage` on a screen with no bound element
  properties (artwork that will never change).
- `OPTIX-STYLE-01` — a control setting a literal colour while the project's
  `DefaultStyleSheet` defines that type's style (the theme is being bypassed).
- `OPTIX-LAYOUT-01` — a child drawn outside its parent's bounds, or two siblings
  overlapping in a way the design did not intend.
- `OPTIX-DATA-01` — a numeric tag shown in a bare Label with no formatter/units
  while the model records `EngineeringUnits`.

Each finding carries `evidence` (path + measured values) and the rule id of the
corpus page that explains it, matching the existing finding shape.

**Acceptance.** On the LineHMI/`OptixTeamStandard` fixtures each rule fires on a
planted defect and stays silent on a correct screen; `optix_design_check` counts
them in the same summary as the existing rules.

## W6 — Component variables (data on any object)

**The thing being named.** In Studio, any object — a widget, a screen, a panel, a
NetLogic object, a type — can contain **variables**: they appear in
`Properties` and in the Project view `Add new` menu as `Variable`,
`Analog variable`, `Node pointer`, `Alias`. Rockwell's own definition is
`creating-projects\project-nodes\Variables.html`: "A variable is an attribute of
an object." This is the mechanism behind reusable components, parameterised
faceplates and NetLogic state that the UI can bind to.

What the help states, precisely:

| Kind | What it is | What it carries |
| --- | --- | --- |
| `Variable` | a data variable on the object (`BaseDataVariableType`) | DataType, value or dynamic link, array dimensions, DisplayName, Description, optional unit, optional range |
| `Analog variable` | an analog item (`AnalogItemType`) | the same, plus **unit of measurement** (EUInformation) and **EURange**: low limit, high limit, `Constrain` |
| `Node pointer` | a variable whose value is a dynamic link to another node (`NodePointer`) | `Kind`, `Node class` (Instance / Type / Any) — the parameterisation primitive |
| `Alias` | an object/variable that points at a source node with a NodeId property | resolved per instance, so one faceplate type shows many motors |
| variable *from a type* | an instance of a custom **VariableType** authored in Type view | its own type definition, reusable |

Constraints the help records: the root **UI folder cannot contain variables**;
a range is added by right-clicking a numeric variable → `New > Range` (so it is a
child of the variable, not an attribute); units are chosen on the value.

**The gap.** `optix_edit` has `create_variable { parent, name, datatype }` and
`create_alias { parent_path, name, target_path, kind }` — nothing else. There is
no analog variable, no unit, no range, no node pointer, no access level, no
description, no variable type, and `optix_model` **emulates** units and range as
sibling `EngineeringUnits` / `EURange` **String** variables (recorded in
`model.js:75-76` as a measured Studio limitation). A real OPC UA client reading
that model sees a bare float plus two strings instead of an analog item. The
bridge has no `AnalogItem`, `EngineeringUnits`, `EURange` or `ExtendedProperty`
symbol at all (0 hits), while `NodePointer`, `Alias`, `ModellingRule`,
`VariableType` are already referenced.

**Deliverables.**

- Bridge: create variables of a chosen variable type (`AnalogItemType`,
  `NodePointer`, `Alias`) and write `EURange` (low/high/constrain) and
  `EngineeringUnits` as real typed values, not strings; set `AccessLevel`,
  `Description`, `DisplayName` and array dimensions at creation. Recorded in
  `bridge/source.json` `localChanges`, upstream PR later.
- `optix_edit { op: "create_variable" }` grows: `kind: "variable" | "analog" |
  "node_pointer" | "alias"`, `units`, `range: { low, high, constrain }`,
  `access: "read" | "write" | "readwrite"`, `description`, `display_name`,
  `array`, `expose` (whether the node is browsable to OPC UA clients). Add
  `create_variable_type` for Type-view variable types, and let `set_property`
  reach struct members (`EURange.Low`, `EURange.High`).
- `optix_model` stops emulating: an analog tag becomes a real `AnalogItemType`
  with EUInformation and EURange; the String-child route stays only as an
  explicit fallback, reported as `emulated: true` so the answer never overstates
  the model.
- `optix_schema` gains a `variableTypes` section from
  `Reference\**\VariableTypes\*.html` (`BaseVariableType`, `BaseDataVariableType`,
  `AnalogItemType`, `AnalogUnitType`, `AnalogUnitRangeType`,
  `TwoStateDiscreteType`, `MultiStateValueDiscreteType`, `PropertyType`,
  `NodePointer`, `Alias`, `DynamicLink`, driver `Tag` / `MetaTag` /
  `EngineeringUnitMetaTag`) with their properties, so "analog variable" and
  "node pointer" are answered by the catalog instead of by guesswork.
- `packages/resources/corpus/optix/optix-variables-and-properties.md`
  (`OPTIX-VAR-01..07`): which of the four kinds to use and why; model tag vs
  component variable; type-level variable → instance variable (and the measured
  `ModellingRule None` copy limitation); access levels; parameterising a
  faceplate with variables + aliases + node pointers; how a dynamic link, an
  expression, a converter and NetLogic each reach the same variable; naming; the
  "UI folder cannot hold variables" rule; `ExtendedProperties` for tag metadata.
- `optix_screen`: a card row or lamp may bind to a variable the draft creates on
  the screen itself (local state), not only to `Model/*` tags.
- Design rules: `OPTIX-VAR-01` an analog value without a real analog item,
  `OPTIX-VAR-02` a faceplate whose variants differ only by hard-coded values
  where a type variable + alias would parameterise it, `OPTIX-VAR-03` a variable
  the HMI writes declared read-only.
- `packages/optix/netlogic/pages/api-namespaces.md` (W4) records the C# side:
  `LogicObject.GetVariable`, `LogicObject.Get<T>`, alias access through
  `LogicObject.GetAlias` / `SetAlias`, and `IUAVariable.SetDynamicLink` /
  `ResetDynamicLink` — all four already have reference pages under
  `extending-projects\api\`.

**Acceptance.** On a scratch project: create an `Analog variable` on a widget
with unit `m/min` and range 0–120; `optix_read` returns a real analog item whose
`EURange` and `EngineeringUnits` are typed values (no sibling String variables);
a Label binds to it and renders "42 m/min"; two instances of one faceplate type
carrying an alias each resolve to different motors; and a NetLogic object with a
variable of its own exposes it to the screen.

## W7 — Docs, tests, release

- `docs/optix-design.md` — the human-readable design catalogue (what each rule
  family means, how to satisfy it), linked from `README.md`.
- `docs/optix-svg.md` — AdvancedSVG: what it is, the conformance rules, the
  workflow, the limits.
- `docs/port/optix-design-hardening.md` — this plan, status kept current.
- `components.json`: `tools.count` 19 → 21; `skill.allow` gains `optix_schema`,
  `optix_svg`; `docs` list gains the two new documents.
- `cordis.patch.yml` / `entries/optix.js`: `schema` needs no switch (read-only,
  local); `svg` writes are gated by the existing `allowWrites`.
- `npm run docs:tools` (the generator does not import optix, so the diff should
  stay empty — verified before), `node scripts/test.mjs`, `node scripts/assemble.mjs`.
- CHANGELOG by byte-safe insert (ASCII-only, non-ASCII count asserted).
- Release only on an explicit request, with the measured publish-lag procedure
  already recorded in `AGENTS.md`.

---

## Sequencing and size

| Step | Work | Why this order |
| --- | --- | --- |
| 1 | W1 generator + `optix_schema` | Everything else cites the vocabulary; it also kills the most common refusal loop |
| 2 | W2 corpus pages (parallel with W1 — different files) | They can be written from the reference while the generator is built |
| 3 | W3 SVG probe, then `optix_svg` | Needs W1's schema for the property-class vocabulary, and the probe decides the bridge question |
| 4 | W4 NetLogic router + API index | Small, independent |
| 5 | W5 new design rules | Cheapest once the pages define what "wrong" means |
| 6 | W6 component variables (bridge + ops + corpus) | Needs W1's `variableTypes`; makes components reusable, which the faceplate rules in W2/W5 assume |
| 7 | W7 docs/tests/release | Gate |

Rough size: W1 ~1 session, W2 ~1 session, W3 ~half (plus the probe), W4/W5 ~half
together, W6 ~half (the bridge change is the only real unknown), W7 ~half.

## Definition of done

1. `optix_schema type AdvancedSVGImage` returns the measured property set,
   methods and children; `enum` returns 0–3 with names.
2. `engineering_reference` serves all ten new pages and every new rule id.
3. `optix_svg inspect` explains, for a real non-conformant SVG, exactly which
   parts cannot be controlled and why; `add` + `bind` place and animate it, and a
   screenshot proves the colour change.
4. A NetLogic request routes to the right page in one `optix_netlogic` call, and
   an API typo is caught before the compile.
5. `optix_design_check` reports the four new rules on planted defects and stays
   silent on the correct fixture.
6. Component variables: an analog variable carries a real `EURange` and
   `EngineeringUnits` (not String siblings), an alias parameterises two
   instances of one type differently, and `optix_schema` answers "what is an
   analog variable / node pointer".
7. `node scripts/test.mjs` green; `docs:tools` clean; docs updated in the same
   commit.

## What this plan does not do

- No desktop automation beyond the existing, narrow save/build keystroke
  exception.
- No copying of Rockwell prose: the catalog holds identifiers and datatypes only.
- No per-object wrapper tools — `optix_edit` stays the single write path;
  `optix_svg` exists for lint, placement and binding, and refuses what it cannot
  express instead of guessing.
- No attempt to script Studio's UI for what the bridge cannot do; a gap becomes a
  recorded limitation.

## Open questions for the engineer

1. Should the schema snapshot ship inside the plugin package (works offline, ~1–3
   MB, regenerated per Studio release) or be generated on first use from the
   installed Studio (always current, needs a Studio install)? Default in this
   plan: ship it, with `refresh` for drift.
2. For a boolean-driven SVG colour, is a Studio-side converter acceptable as the
   documented step, or should we push the bridge until it can write the converter
   itself?
3. Is 1280×800 the panel target to optimise the layout rules for, or should the
   rules stay canvas-relative?
4. W6 is the only workstream with a genuine unknown: can the bridge create a
   variable *of* `AnalogItemType` and write a typed `EURange` /
   `EUInformation`, or does it have to create a plain variable and retype it
   (`/bridge/node/retype` already exists)? This gets a probe before any of W6 is
   built, exactly like the SVG probe in W3.
