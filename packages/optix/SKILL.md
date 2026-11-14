---
name: factorytalk-optix
description: FactoryTalk Optix Studio engineering — inspect and author the loaded project through the Studio bridge, validate expressions, take preview screenshots, read NetLogic C# snippets from the pinned cheat-sheet snapshot, and start from a template.
whenToUse: The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, or the emulator preview. Route FactoryTalk View ME elsewhere.
---

# FactoryTalk Optix engineering

## Boundary

The project lives in FactoryTalk Optix Studio. `optix_status` finds the Studio bridge; the bridge runs
inside Studio and must be started there (StartBridge). Nothing here deploys to a panel or changes
runtime values unless a tool says it does, and every authoring call is validated against the live
model first.

The rows are switches. `allowWrites`, `allowDestructive` and `allowInvoke` gate what
`optix_edit` and `optix_action` may do. The preview tools need the project's **Web presentation
engine** serving its URL and a browser to read it. Nothing serves it until the project runs: the
Studio CLI has no run verb, so `optix_emulator` with `action: start` launches the installed
`FTOptixRuntime.exe` against the project folder (needs `allowInvoke`), and `action: stop` ends only
a runtime this tool started. The browser side needs no hand-holding: by default the plugin starts
Chrome or Edge itself (`browser: launch`); `browser: attach` connects to one you started. If a tool
is missing, that switch is off in this profile. `optix_status` answers the preview question rather
than leaving you to guess: its `preview_chain` reports the switch, the browser mode and whether a
browser is available, whether the emulator serves its URL,
how many tabs match it, and whether the OCR executable and language data are installed — and its
`next` names the one link to fix first. Read `next` and tell the engineer what is missing; do not
retry a preview tool against a dead link.

## Read before you write

1. `optix_status` — is Studio reachable, which project is loaded, which capabilities are on, and what
   the preview chain is missing. When `next` names the emulator link, `optix_emulator` with
   `action: status` shows whether a runtime exists on the machine before anything is started.
   When it answers `Bridge unavailable` for a project that has never been bridged, that project holds
   no bridge source at all. `optix_bridge_arm` with `confirm: false` shows what would be written into
   the project's `ProjectFiles/NetSolution`; with `confirm: true` it writes the bridge this bundle ships
   after copying any file the project already held. Ask before writing into an engineer's project
   directory, and say plainly that Studio still compiles the class and the engineer still right-clicks
   StartBridge — neither is automatable from outside Studio.
2. `optix_read` — screens, widgets, types, variable members, schemas, CLR diagnostics. Start with
   `map` at `overview` depth, then `detail` for the one subtree that matters.
3. `optix_validate_expression` — check an expression against real node paths before attaching it.

Saved state and the live model are different sources. Say which one you read, and which you changed.

## NetLogic C#

The bundle ships a pinned snapshot of Rockwell's
[NetLogic cheat sheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet). Read it instead of
writing C# from memory:

- `optix_netlogic` with no arguments returns the contents.
- `optix_netlogic { query: "sessions" }` ranks pages by title, topic and symbol, then by body text.
- `optix_netlogic { slug: "netlogic-lifecycle" }` returns that page verbatim, with its risk flag, the
  upstream commit and the upstream disclaimer.

Every page carries a `risk`:

- `normal` — the repository presents it as guidance;
- `advanced` — the page itself warns about low-level or non-public behaviour;
- `unsupported` — it is listed in the repository's Advanced section, which says those features are not
  officially supported and may change.

The repository states the snippets may use non-public APIs, may break a project and must not be used in
production as-is. Quote the risk with the snippet, adapt it to the loaded project, and treat
compilation and runtime behaviour as unverified until Studio compiles it.

## Write, change and delete NetLogic C# with `optix_script`

A NetLogic is two writes that must agree: a node whose BrowseName equals the class name, and a `.cs` file in `ProjectFiles\NetSolution` that Studio's SDK-style csproj globs on the next build. `optix_script` owns both sides, so never hand-write the node or guess the folder:

1. `action: "list"` pairs every `.cs` class with the live node it is bound to (and reports nodes with no class as `nodes_without_file`). Run it first; it also tells you which `project_root` was resolved.
2. `action: "add"` with `name`, `kind` (`runtime` or `design`) and `template` (`blank` or `periodic`) creates the node through the bridge, writes a compiling class and runs `dotnet build`. A class whose name differs from the node is refused, because Optix binds by name.
3. `action: "edit"` replaces the whole class. Pass the `sha256` you read so a concurrent change is refused instead of overwritten.
4. `action: "delete"` removes the node and the file; deleting the node also removes its class file, and a class this tool did not write (no `// aria-netlogic:` marker) is refused unless you pass `force: true` - a shipped library class belongs to a composite, and a node under `UI/Components/` is refused outright.
5. `action: "build"` compiles the solution and returns the diagnostics a Studio engineer would read. Stop the emulator first when it reports the assembly is locked.
6. `action: "run"` with `method` runs a design-time `[ExportMethod]` exactly as right-click Execute does. It answers `not-loaded` when the class compiles but Studio has not rebuilt: ask the engineer to build in Studio, then run again.

Read `engineering_reference` page `netlogic-cheatsheet` when you need a Studio API you have not used. Say plainly that the class is only live after Studio builds it - `dotnet build` proves the C# compiles, not that Studio loaded it.
## Build a screen from what Studio ships

Before composing a screen out of builtin widget types, ask the library. `optix_library { action: "list" }`
reads the catalog the Studio install carries — Widgets, GraphicElements, StyleSheets, Keyboards, Misc,
Scripts, FeaturePreview — with no bridge and no Studio session, and answers each item with the display name
and the usage text the library ships for it. `optix_library { action: "import", library: "Widgets",
item: "AlarmIcon", dest: "UI" }` pulls that item and the types it owns into the loaded project: it needs
`allowWrites`, a bridge that advertises `template_library: true` in `optix_status` (a copied starter needs
`optix_bridge_arm` first), and an import is **not** reversible as a batch, so read the node back with
`optix_read` before any retry. Imports land under `UI/Components/<Library>` (the folder chain is created
when it is missing), so the project's own objects and the imported types stay separable. `optix_screen`
with `library_items` takes that further in one call: it imports each named composite once, instantiates it
under the screen and places it in a card slot. A bare `Rectangle`/`Label`/`Panel` composition is the
fallback, not the first answer.

Before hand-building a pattern the product already demonstrates, read the corpus: `engineering_reference`
searches `optix-navigation-patterns` (the window's loader owns navigation, not each screen),
`optix-widget-patterns` (composite before primitives) and `optix-design-resources` (which official sample
project to open for a nav shell, gauge, alarm grid, style sheet or NetLogic snippet), and cite the page.

## Draft a screen, then check it

`optix_screen` builds a whole screen as one `optix_edit` batch — header band, title, content surface,
footer, up to four cards with labelled rows, up to four navigation buttons — from the same scaffold the
View side uses, and it refuses rather than squeezes: a display too small for the scaffold, a body with
no room under the header and footer, or a card too small to read are refusals, not warnings. Leave
`dry_run` on: the draft is validated against the live model in one call, including each lamp expression,
before anything is written. The navigation bar is drawn in the start window, beside the `PanelLoader` —
a button created inside a panel resolves its loader path to the design-time object and the runtime then
refuses the click — and each button is named for the panel it opens (`Nav_<target>`) so drafting a second
screen adds its buttons to the shared bar instead of replacing the first screen's. Navigation is wired
only when the live model names one loader; without it the tool reports the exact `wire_event` it left
pending, with the relative pointer path and the absolute-value clearing the runtime needs.

Then run `optix_design_check` on the screen. It reports touch targets under 44 px, controls with no text
of their own, text below 4.5:1 against the object it actually sits on, a screen nothing navigates to, a
screen whose controls carry no event handler, a screen whose size is not the window's canvas, sibling
screens built from the same hand-made child set, and behaviour living inside the composition. Read its
`unchecked` list as part of the answer: a colour the bridge did not report is not a passing colour.

Finish by looking. `optix_preview` and `optix_screenshot` are the only step that sees the rendered screen;
a clean `optix_design_check` proves geometry, not legibility. The shared screen grammar, the palette and
the rule-to-tool map are in `docs/reference/hmi-design.md`.

## Lay out the model the way an OPC UA client expects

A screen is only as good as the tree behind it. `optix_model` builds and judges that tree with one
convention: `Model/<Plant>/<Area>/<Line>/<Equipment>/<Signal>`, equipment types under `Model/Types`,
equipment as instances of those types, and signal names PascalCase, forty characters at most.

- `action: "plan"` answers with the ordered operations and the folder tree it would create, without
  writing. Read it back to the operator before applying: the plant, the area and the equipment names are
  theirs to choose, and the spec needs all three (`spec.plant`, `spec.area`, `spec.lines[].equipment`).
- `action: "apply"` submits that plan through the same strictly validated batch `optix_edit` uses (it
  needs `allowWrites`), skips paths that already exist, and reports what it created.
- `action: "check"` reads the live `Model` tree and reports `OPTIX-MDL-01`..`06` with a `structured` or
  `needs-work` verdict: a signal outside the hierarchy, an analog value with no `EngineeringUnits`, a
  signal with no `Description`, a name that breaks the convention, a folder holding more than twelve
  variables, and equipment folders with no `ObjectType` behind them.

Two limits are measured, not guessed, and the tool says both in its report. Studio 1.8.1 writes only
`DisplayName` as a node attribute, so units, range and description travel as child String variables
(`EngineeringUnits`, `EURange`, `Description`) — not as UA properties; and a type's members are copied
onto each instance, because the bridge writes members with `ModellingRule` None and a None member is not
instantiated. Both are reported as `metadata` and `inheritance: "copied"` in the result, and the fix
belongs in the bridge, not in a workaround. An existing flat model is reported by `check`, never rewritten.

## Review the project before calling it released

`optix_production_check` is the release review: it reads the whole `UI` tree in one call and answers with
a verdict — `ready`, `review` or `not_ready` — plus findings that each name the node and the fix. It
catches what a per-screen geometry check cannot see: a handler whose `ObjectPointer` still holds the
absolute design-time NodeId (the click is delivered, nothing switches, and the runtime log says
`No behaviour or observer found that handles the method`), a navigation argument pointing at a screen that
is not there, a screen the operator cannot reach from the panel the loader starts on, presentation engines
left on the built-in starting user or the stock style sheet, and screens outside the screen folder. The
shell bar counts as navigation for every panel, because it sits in the start window. `repair: true` clears
the absolute pointer value of every handler the first rule reports; it needs `allowWrites` and writes only
that value. Run `optix_design_check` on each screen after it, and click the buttons in the runtime: a
verdict of `ready` says these rules did not fire, not that an operator saw the application.

The order that survives the runtime — model, NetLogic class, screens, command buttons, save/build/run,
operator click, release review — is written down as `optix-application-recipe` in
`engineering_reference`, with the measured failure each step avoids.

## Author and verify

- `optix_edit` applies one typed batch; run it with `dry_run` first and read the validation result.
- `optix_action` creates NetLogic, ensures a web engine, adds a translation, converts an instance to a
  type, or invokes an exported method. Invocation needs a session-safe bridge and `allowInvoke`.
- `optix_preview` and `optix_screenshot` read the emulator page. By default the plugin starts its own
  Chrome or Edge for this; input can change runtime values, so state that before using it.
- `optix_emulator` with `action: status` says whether anything serves the preview URL and which
  runtime executable the machine holds; `start` runs that runtime against the project folder and
  `stop` ends only a runtime this tool started, never one the engineer opened from Studio. Starting a
  process needs `allowInvoke`, and it is the only scripted route to the emulator — say so rather than
  implying Studio was asked to run the project.
- `optix_ocr` reads text rendered on the canvas — labels a web page exposes no DOM for — through the
  host Tesseract. It is registered only when the row names an `ocrExecutable`.
- `optix_ocr_setup` reports whether that Tesseract and its language data are on the machine, and with
  `install: true` installs it through winget. It never installs a Python service or an OCR daemon. If
  Tesseract is already present it says so and names the path to put in `ocrExecutable`, which is a
  config change, not an install. Ask before running the install: it downloads software.
- `optix_template` discovers the packaged Optix IPC and OptixPanel starter projects. With
  `destination` it scaffolds one: copies the starter into a new or empty directory, renames it, writes
  the screen box you pass as `width`/`height`, and replaces the older bridge the starter carries with
  this bundle's. Never copy a starter with filesystem tools instead: the two steps that matter - the
  rename and the bridge - are what that call exists for.

## Start from nothing, or join a project that is already running

**The IDE is not yours to drive.** Two actions in Studio belong to the engineer and to nobody else:
opening the project, and right-clicking `StudioMCPBridge` → `StartBridge` after a build. Never launch
`FTOptixStudio.exe`, never click or type in Studio, never ask for a screenshot of it, and never stall
waiting on it. Your side of that line is everything around it: writing the project files, reading and
writing the live model through the bridge, and starting or stopping the runtime with `optix_emulator`.
The bridge is the contract - when it answers, Studio is already open and the engineer is available.

### A. New project, no Studio open yet

1. `optix_template` without `destination` and ask the manifest's `questions` **before** scaffolding.
   Each answer is baked into files that are painful to re-edit later: **runtime** (OptixPanel device or
   a PC in a browser - it picks the template), **screen size** (the operator's real box in pixels; a
   panel target and a widescreen monitor differ, and every screen drafted afterwards inherits this
   canvas), **project name**, **destination** (the workspace root or an empty folder), and **what it
   talks to** (Logix, OPC UA, MQTT, or nothing yet - the templates ship those folders empty). Ask even
   when the request sounds finished: "make me an Optix app" does not carry a screen size.
2. Call it again with `template`, `destination`, `name`, `width` and `height`. `width` and `height`
   are not optional - the tool refuses without them rather than guessing. The copy lands in
   `<destination>/<name>`, so the folder is named after the project and Studio does not warn that the
   project name and its folder disagree; a destination that already carries the name is used as the
   project folder itself. Report the path the tool returned and the canvas it got.
3. Hand the two Studio actions to the engineer in one short message and stop: which `.optix` file to
   open, that the build must succeed, and that the `StudioMCPBridge` NetLogic wants `StartBridge`.
   Name the one dialog they will meet: the first `StartBridge` raises Studio's NetLogic security
   warning (the bridge references System.Net.Sockets, System.IO and friends) and binds only after
   `Proceed`; ticking "Do not show this warning again" stops it recurring. Then wait for their
   confirmation - do not poll Studio, do not retry `optix_status` in a loop.
4. When they say it is up, `optix_status` must answer with a bridge version and a project. If it does
   not, the three things to check are, in order: the project in Studio is the copy you scaffolded, the
   build succeeded, and `StartBridge` was chosen on the node. Say which one to look at.

### B. Existing project that already has the bridge

Nothing to write. Find the project directory, ask the engineer to open it and run `StartBridge` if it
is not already running, then work through the bridge as usual.

### C. Existing project with no bridge

1. `optix_bridge_arm` with `confirm: false`: the report names the NetSolution project, whether a bridge
   file is already there, its version, and whether the `StudioMCPBridge` NetLogic node exists.
2. Close that project in Studio before confirming, if it is open there: the write must not race Studio's
   own save. The call refuses when a running bridge already answers for the same project name.
3. `confirm: true` writes this bundle's bridge (a bridge file it replaces is copied first), adds the
   `StudioMCPBridge` NetLogic node to `Nodes/NetLogic/NetLogic.yaml` when the project has none, and
   registers that node file in the project's `.optix` list when it is missing there - Studio loads only
   the node files the project lists. A node that is already declared and listed is left byte for byte
   alone. Every write is copied under `ProjectFiles/.dsh-backups/arm-<stamp>` with a `manifest.json`,
   and the report's `changed_files` is what it touched.
4. If the result looks wrong, `optix_bridge_arm` with `restore: true` puts every file back from the
   newest backup and removes the files that run created. Say so rather than deleting by hand.
5. Then the same two Studio actions as A.3, and the same wait.

### D. Once the bridge answers

Read before you write (`optix_status`, then `optix_read`), draft and check screens, run
`optix_production_check` before calling anything released, and use `optix_emulator` to start or stop
the runtime - never Studio's own toolbar. One measured constraint to state plainly: the runtime loads
the **saved** project, so a change made through the bridge appears in the emulator only after the
engineer saves in Studio (Ctrl+S). Ask for that save when a visual check is the point; do not pretend
the preview shows unsaved edits.

A successful model change does not save Studio and does not prove rendering. Say what was applied, what
was only validated, and what the engineer has to do next.
## Reporting

Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
completeness: it names what the call cannot establish — rendering, runtime behaviour, the installed
Optix version, and anything outside the loaded project.
