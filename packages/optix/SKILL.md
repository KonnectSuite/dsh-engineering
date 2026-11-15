---
name: factorytalk-optix
description: FactoryTalk Optix Studio engineering — author a project or a house template from the published standards, or work in the loaded project through the Studio bridge: inspect and author nodes, validate expressions, write and review NetLogic C#, and start from one of the two packaged starters.
whenToUse: The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, the emulator preview, or a new Optix house template or standard for a team. Route FactoryTalk View ME elsewhere.
---

# FactoryTalk Optix engineering

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is
installed, open or on disk; the host is read only when the operator points at it, or when the work is
inside an existing project (`CRAFT-ORD-01`).

## Boundary

The project lives in FactoryTalk Optix Studio. `optix_status` finds the Studio bridge; the bridge runs
inside Studio and must be started there (StartBridge). Nothing here deploys to a panel or changes
runtime values unless a tool says it does, and every authoring call is validated against the live
model first.

The rows are switches. `allowWrites`, `allowDestructive` and `allowInvoke` gate what
`optix_edit` and `optix_action` may do, and whether the emulator may be started or stopped. If a tool
is missing, that switch is off in this profile.

### You have no other hands

This skill covers FactoryTalk Optix through these tools and nothing else. Every other way of getting
the job done is out of bounds, however much faster it looks:

- **No desktop automation, with one measured exception.** Never drive Studio, the emulator window or a
  browser by click, keystroke, key chord or window focus — not to start the emulator, not to look at it,
  not to navigate Studio. The exception is Save and Build: when the engineer asks you to press them
  instead of doing it themselves, send exactly two keystrokes to the already-open Studio window
  (`Ctrl+S`, then `Ctrl+Shift+B`) and nothing else — no clicks, no menus, no dialogs, no launching
  Studio. Offer the handoff first and take it only on the engineer's word, then verify it on disk: a
  keystroke you delivered is not a save that landed.
- **No process handling.** Never `Start-Process`, `Stop-Process`, `taskkill`, or launch
  `FTOptixRuntime.exe` yourself. `optix_emulator` is the only way to run, restart, stop and inspect the
  runtime, and it is the only thing that knows which runtime belongs to which project.
- **No talking to the bridge by hand.** No `curl` or `Invoke-RestMethod` against `/bridge/*`, and no
  importing `lib/index.js` to call a tool function directly. Use the registered tool, or report that
  no tool does the job.
- **No side doors into the project.** Do not edit `Nodes/*.yaml` or the `.optix` file to make something
  appear in the live model: a project Studio has open belongs to the bridge.

A tool that cannot do what the task needs is a finding to report — "this needs X and no tool does X" —
never a licence to improvise. Two things genuinely belong to the engineer: opening the project in
Studio, and right-clicking `StudioMCPBridge` → StartBridge after a build. Ask for them and wait for
the answer.

### Which state you are looking at

Three different things are called "the project", and confusing them is the most common way a run
reports success it does not have.

- **The live model** — what `optix_read` sees and every `optix_edit` changes, inside Studio.
- **The saved project** — what the runtime loads. This plugin cannot save: no tool and no bridge route
  exists for it, and `UAManagedCore` carries no save member at all (measured: not one `Save`, `IsDirty`
  or `Persist` symbol in `UAManagedCore.dll`). Persistence comes from Studio's own **Save** (Ctrl+S) or
  **Build** (Ctrl+Shift+B) — by the engineer's hand, or by two keystrokes when they ask you to press them
  (the exception above). Both write bridge edits: measured on the reference machine, a Build wrote the
  whole bridge-authored screen to `Nodes/**`, and a later Ctrl+S wrote a re-bound `Panel` link on its own.
  `optix_status` counts the authoring calls made since the last save and reports `needs_save`;
  `optix_screenshot` repeats it in one line. After the save, call `optix_status` with `saved: true` to
  clear the count — but clear it on evidence, not on a reply: `optix_emulator` with `action: "status"`
  reports `disk` (the newest write under `Nodes/` and the project file) and `saved_after_edit`, which is
  `false` while the newest file on disk is older than the first pending bridge change. A first build on
  the reference machine took minutes, not seconds, so an early disk check reads as "nothing saved" while
  the build is still running: confirm Studio's Output pane says the solution built before judging the
  disk. When `saved_after_edit` is `false`, say what you measured and ask for **File > Save** by name.
- **The rendered screen** — what `optix_preview` and `optix_screenshot` see, which is the saved
  project as the Web presentation engine draws it, or nothing at all if no runtime serves its URL.

The preview tools need the project's **Web presentation engine** serving its URL and a browser to read
it. Nothing serves it until the project runs: the Studio CLI has no run verb, so `optix_emulator` with
`action: start` launches the installed `FTOptixRuntime.exe` against the project folder (needs
`allowInvoke`), waits for the URL to answer, and returns the runtime's own log when it does not.
`action: restart` is stop-then-start, so the emulator picks up the newest saved build; `action: logs`
returns that log with a named diagnosis (`port_in_use`, `file_locked`, `licensing`, `exception`,
`missing_file`) and the hint that goes with it; when the runtime starts cleanly but the log carries a fact
rather than a fault, the same calls return `notice` instead — `demo_mode` means the machine has no Optix
entitlement, the runtime says so and closes itself after 120 minutes while the preview works normally. A
notice is not a defect: name it once, then keep working. `action: stop` ends every runtime holding that
project, including one started outside this plugin, and `force` also takes the one holding the port.
`action: status` also answers the persistence question from the files themselves: `disk` carries the
newest write under `Nodes/` with its path and the project file's size, and `saved_after_edit` says
whether that write is newer than the first pending bridge change. The browser side needs no hand-holding: by default the
plugin starts Chrome or Edge itself (`browser: launch`); `browser: attach` connects to one you started.
`optix_status` answers the preview question rather than leaving you to guess: its `preview_chain`
reports the switch, the browser mode and whether a browser is available, whether the emulator serves
its URL, how many tabs match it, and whether the OCR executable and language data are installed — and
its `next` names the one link to fix first. Read `next` and tell the engineer what is missing; do not
retry a preview tool against a dead link.

## The loop

Every request that ends in a working screen walks the same seven phases. Say which phase you are in:
it is how the engineer knows what you are doing and what is theirs.

| Phase | You | The engineer |
| --- | --- | --- |
| **0 Brief** | read the standards, then ask what a copy cannot undo: runtime target, canvas size, project name, destination, what it talks to | answers |
| **1 Scaffold** | `optix_template` with those answers | — |
| **2 Open and arm** | nothing; the files are on disk | open the `.optix`, build, start the bridge |
| **3 Connect** | `optix_status`, then `optix_read` once it answers | — |
| **4 Author** | `optix_edit` / `optix_screen` / `optix_model` / `optix_script`, then the static checks | — |
| **5 Persist** | read `needs_save`, ask, then verify the save on disk | save (Ctrl+S) then build (Ctrl+Shift+B), emulator stopped |
| **6 Look** | `optix_emulator` start, `optix_preview`/`optix_screenshot`, prove the thing changed | — |
| **7 Release** | `optix_production_check`, then state coverage | deploy in Studio's Deploy dialog |

An existing project starts at phase 3; a request for a template or a standard is workflow E, which
writes the standard before it scaffolds anything. Phases 0–2 are workflows A, B and C below.

**Phase 5 is the one that goes wrong.** Nothing in this plugin saves the project, so a visual check
taken before the save shows the previous build — and a build taken while the emulator runs fails on
`MSB3061` (the runtime holds `bin/<project>.dll` open) and saves nothing. So the order inside phase 5 is
fixed: stop the runtime if it is up, then save, then build, then start again. When `needs_save.pending`
is zero, say so and skip the handoff; do not ask for a save that changes nothing. When the engineer asks
you to press the two keystrokes yourself, that is the exception above — two keys, nothing else.

Verify the save instead of believing it. `optix_emulator { action: "status", project }` reports `disk`
(newest write under `Nodes/`, its path, the project file's size) and `saved_after_edit`. If that is
`false`, the save did not reach the files yet: nothing the runtime loads has changed, so a start now
renders the old build. Say exactly that, with the timestamp you measured, and ask for **File > Save** by
name rather than repeating Ctrl+S — a keystroke cannot be confirmed from here, a file timestamp can. A
first build measured minutes on the reference machine (a 23:01:46 build was still absent from `Nodes/**`
when checked a minute later), so re-read the disk before concluding anything, and never report "the save
did not work" from a single early check.

**Phase 6 is proof, not decoration.** A screenshot is evidence only when it shows the change you made:
the caption you wrote, the value that moved, the screen the button reached. Say what you looked at and
what it showed, and name anything the picture cannot settle — behaviour with no visible effect, an
alarm that never fired, a runtime event with no on-screen result.

A freshly scaffolded starter screenshots as one flat colour, and that is the correct picture: the
templates ship a window (`UI/MainWindow`, the canvas you asked for, caption linked to the project name)
with no screen inside it — a window shows only its own children. `optix_screen` therefore **mounts**
what it draws: unless the window already holds a loader, one batch also creates a `PanelLoader` across
the canvas and binds its `Panel` pointer to the new screen by literal `raw_path` (a screen is an
`ObjectType`, not a variable, so `source_path` is refused — `source_not_variable`), which is why the
screen can appear in the render at all. Pass `mount: false` only when something else already mounts it,
and `mount_name` to name the loader.

The link must be **project-absolute**: `/Objects/<Project>/UI/Screens/<Screen>`. A bare
`UI/Screens/<Screen>` resolves against the loader's own parent (`UI/MainWindow`), where no such node
exists — Studio paints the property red and the render stays blank, which cost this project two saved
builds to find. Measured with an offline probe on a saved project: the pointer as a `DynamicLink` child
holding `/Objects/<project>/...` renders exactly like a resolved static value (same pixels), so the
bridge's form and Studio's form are interchangeable — the absolute path is the whole difference. Studio's
Save keeps the `DynamicLink` form in `Nodes/UI/UI.yaml` rather than flattening it, which is normal.

One colour means the runtime, the web engine and the browser all work and nothing has been drawn yet —
it is not a broken preview, and it is not evidence that a screen exists. Content appears once a screen is
drawn, mounted *and saved*; check the render for content only after `saved_after_edit` is `true`.

## What kind of request is this?

Decide before the first tool call. The wrong first move is how a build spends twenty minutes on the
machine before it starts on the design.

| The request | The first move | The host |
| --- | --- | --- |
| A new build, template or standard, nothing named | `engineering_reference` pages (tool calls, one `id` each), then `optix_template {}` (our two starters and their questions), then the brief | not read |
| "Match what we already have", "use our project", or a project is named | `engineering_profile`, then `optix_status` | read, bounded to that project |
| Work inside a known project — a screen, a tag, a NetLogic | `optix_status`, then `optix_read` | read, that project only |
| A real host fact — is Studio installed, does a runtime exist | ask, or one bounded check with the reason stated | one command, never a sweep |

For a new build, the standards are `engineering_reference` pages: `hmi-isa101-baseline`,
`hmi-screen-architecture`, `hmi-standards-precedence`, `hmi-rockwell-process-style-guide`,
`optix-application-recipe`, `optix-navigation-patterns`, `optix-widget-patterns` and
`optix-design-resources`. Read them before writing anything, cite the rule IDs you followed, and follow
workflow E below for a template or standard request.

### When a project is in play

1. `optix_status` — is Studio reachable, which project is loaded, which capabilities are on, what the
   preview chain is missing, and how many authoring changes are waiting for a save (`needs_save`). Its
   answer to `Bridge unavailable` is a ranked diagnosis, not a shrug: whether Studio is running at all,
   whether anything listens on the bridge port, and which of the two the engineer must fix. Work
   through `causes` in order and quote `next`; never start Studio yourself.
   When `next` names the emulator link, `optix_emulator` with `action: status` shows whether a runtime
   exists on the machine, and which runtimes belong to other projects, before anything is started. A
   project that has never been bridged holds no bridge source at all: `optix_bridge_arm` with
   `confirm: false` shows what would be written into `ProjectFiles/NetSolution`; with `confirm: true` it
   writes the bridge this bundle ships after copying any file the project already held. Ask before
   writing into an engineer's project directory, and say plainly that Studio still compiles the class and
   the engineer still right-clicks StartBridge — neither is automatable from outside Studio.
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
2. `action: "add"` with `name`, `kind` (`runtime` or `design`) and `template` (`blank`, or `periodic` / `observer` for runtime work) creates the node through the bridge, writes a compiling class and runs `dotnet build`. The `periodic` template is already the safe shape: node handles cached in `Start`, `try/catch` in the tick, `Log.Error`, and `Dispose()` in `Stop`. A class whose name differs from the node is refused, because Optix binds by name.
3. `action: "edit"` replaces the whole class. Pass the `sha256` you read so a concurrent change is refused instead of overwritten.
4. `action: "delete"` removes the node and the file; deleting the node also removes its class file, and a class this tool did not write (no `// aria-netlogic:` marker) is refused unless you pass `force: true` - a shipped library class belongs to a composite, and a node under `UI/Components/` is refused outright.
5. `action: "build"` compiles the solution and returns the diagnostics a Studio engineer would read. Stop the emulator first when it reports the assembly is locked.
6. `action: "run"` with `method` runs a design-time `[ExportMethod]` exactly as right-click Execute does. It answers `not-loaded` when the class compiles but Studio has not rebuilt: ask the engineer to build in Studio, then run again.
7. `action: "review"` (also run automatically by `add` and `edit`) checks the source against `OPTIX-NL-03`..`12` and answers `clean`, `review` or `block`: dispose what `Start` created, no blocking call, no model lookup in the tick, a `try/catch` around a tick, a `-=` for every `+=`, no background work in a design class, the class name equal to the node name, and something logged. Code rated `block` is refused unless `force: true` - fix it instead of forcing it, and read `engineering_reference` page `optix-netlogic-practices` when the finding is not obvious.

Three practices the rules encode, and why they matter: a periodic tick that throws stops ticking for the session while the screen keeps its last value (the "looks right, frozen" failure); a node resolved inside the tick walks the model on the timer thread; an observer that is not unsubscribed keeps firing after the page is gone. Prove the class at runtime - a bound value changing on screen is the only evidence it is loaded and running.

Read `engineering_reference` page `netlogic-cheatsheet` when you need a Studio API you have not used. Say plainly that the class is only live after Studio builds it - `dotnet build` proves the C# compiles, not that Studio loaded it.

### Where runtime code goes, and the loop that proves it runs

A runtime NetLogic belongs under `UI/NetLogic` (or beside the screen it serves), never in the root
`NetLogic` folder - that folder holds the bridge itself, and an engineer looking for "the script" under
`NetLogic` will not find one there. The class file is always
`ProjectFiles\NetSolution\<Name>.cs`; the node is the thing the project tree shows.

Measured loop, in this order, because each step depends on the previous one (phase 4 into 5 into 6):

1. `optix_script { action: "add", name, parent: "UI/NetLogic", kind: "runtime" }` - node and class, reviewed
   and compiled by `dotnet build`.
2. Stop the runtime if it is up (`optix_emulator { action: "stop" }`), then save and build in Studio
   (**Build > Build Solution**, Ctrl+Shift+B) — the engineer's hand, or two keystrokes when they ask you
   to press them. The build is what loads the class into Studio's NetLogic assembly and writes both the
   .cs edits and the node to the project files. With the emulator running the build fails on `MSB3061`
   (the DLL is locked) and nothing saves.
3. `optix_status { saved: true }` clears the pending count once the save is confirmed on disk;
   `optix_emulator { action: "start" }` then, and `optix_screenshot`.
4. Prove it: a bound value on the screen changes because the class wrote it. `optix_script { action: "run" }`
   answers `not-loaded` until step 2 happened, which is a fact about Studio, not about your C#.
5. If step 3 shows no change, `optix_emulator { action: "logs" }` before anything else: the runtime says why it
   stopped in its own words, and `restart` is the retry once the build is in.

Two runtime facts that cost a whole demo to learn:

- **A `PanelLoader`'s `Panel` pointer can carry a `DynamicLink`, and the runtime resolves the link before the
  pointer value.** Writing `Panel` then sees no change because the link still names the old screen; clear the
  `DynamicLink` value (empty string) before pointing `Panel` at another screen, then build as in step 2.
- **Code that switches panels must name the loader and the screen explicitly**
  (`loader.ChangePanel(screen.NodeId, NodeId.Empty)`) and must not rely on an absolute design-time path: a panel
  is instantiated inside the loader, so a path that resolves in the designer resolves to nothing at runtime.

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

Decide first which layer of the standard you are applying: the operator's explicit instruction, the
project's own theme and existing screens, the vendor guidance for the platform (on a Rockwell plant,
`hmi-rockwell-process-style-guide` — four display levels, template header and button bars, the fixed
palette and Rockwell's touch geometry), or the product-neutral baseline (`hmi-isa101-baseline`,
`hmi-screen-architecture`, and `hmi-standards-precedence` for the order). A deliberate house style wins
over the baseline; record the waiver instead of bending the screen quietly.

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
pending, with the relative pointer path and the absolute-value clearing the runtime needs. A button that
navigates to the screen being drafted is wired in the same batch: that path is the batch's own output,
so it is never probed as a missing target (measured live 2026-11-14, where a self-navigating second
screen drew a `DETAIL` button that did nothing until it was wired by hand). Each bar button also carries
its own `BackgroundColor` and `TextColor` from the palette: a `Button` with no fill takes the style
sheet's grey and its white label measures 1.4:1 against it, which is what the shell bar was rendering
before the draft wrote the fill.

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
- `optix_emulator` is the only way the runtime is run. `action: status` says whether anything serves the
  preview URL, which runtime the machine holds, and which runtimes belong to other projects;
  `start` launches that runtime against the project folder and returns only once the preview answers, or
  returns the runtime's log and a named diagnosis when it does not; `stop` ends every runtime holding
  that project, including one started outside this plugin; `restart` is start-after-stop for a new build;
  `logs` returns the log's tail with the diagnosis. Starting and stopping need `allowInvoke`. Say that the
  runtime was started this way rather than implying Studio was asked to run the project.
- `optix_ocr` reads text rendered on the canvas — labels a web page exposes no DOM for — through the
  host Tesseract. It is registered only when the row names an `ocrExecutable`.
- `optix_ocr_setup` reports whether that Tesseract and its language data are on the machine, and with
  `install: true` installs it through winget. It never installs a Python service or an OCR daemon. If
  Tesseract is already present it says so and names the path to put in `ocrExecutable`, which is a
  config change, not an install. Ask before running the install: it downloads software.
- `optix_template` is our two packaged starters (Optix IPC and OptixPanel), chosen between rather than
  surveyed. With no `template` it returns both manifests and their `questions` and writes nothing — that
  is the call a new template request opens with. With `destination` it scaffolds the starter you name:
  copies it into a new or empty directory, renames it, writes the screen box you pass as `width`/`height`,
  and replaces the older bridge the starter carries with this bundle's. Never copy a starter with
  filesystem tools instead: the two steps that matter - the rename and the bridge - are what that call
  exists for.

## Start from nothing, or join a project that is already running

A request for a template or a standard is workflow **E**, not A: read the published standards and ask the
brief before anything is scaffolded. A, B and C are about getting a bridge and a project into a state
where the tools can work; E is about deciding what the project should contain.

**The IDE is not yours to drive** — the full rule is under *You have no other hands* above. Two actions in
Studio belong to the engineer and to nobody else: opening the project, and right-clicking
`StudioMCPBridge` → `StartBridge` after a build. Never launch `FTOptixStudio.exe`, never click or type in
Studio, never ask for a screenshot of it, and never stall waiting on it. Your side of that line is
everything around it: writing the project files, reading and writing the live model through the bridge, and
starting or stopping the runtime with `optix_emulator`. The bridge is the contract - when it answers, Studio
is already open and the engineer is available.

### A. New project, no Studio open yet

1. `optix_template {}` — with no `template` it answers with both starters and their `questions`; ask those
   answers **before** scaffolding.
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

Read before you write (`optix_status`, then `optix_read`), draft and check screens, and run
`optix_production_check` before calling anything released. From then on the loop above is the workflow:
author in the live model, hand over the save and build, then run the emulator and look.

The runtime is only ever started and stopped by `optix_emulator`, never by Studio's toolbar and never by
launching the executable yourself. Its `start` waits for the preview and `logs` says why a runtime died,
so a failed look is diagnosable without touching the desktop. Three measured constraints to state plainly:

- the runtime loads the **saved** project, so a change made through the bridge appears in the emulator
  only after the engineer saves in Studio (Ctrl+S) and builds (Ctrl+Shift+B) - `needs_save` is the signal;
- a build taken while the emulator runs fails on `MSB3061` and saves nothing, so stop first;
- a screenshot is of the saved build, so it can be one save behind the live model: say which one you looked at.

A successful model change does not save Studio and does not prove rendering. Say what was applied, what
was only validated, and what the engineer has to do next.

### E. Author a house template or standard

"A template we can start from", "our standard", "something consistent across the team" — that is a design
deliverable, not a reason to look at the machine.

1. Read the standards first, with no host calls. They are `engineering_reference` **tool calls** — one page
   per `id`, never a file to look for: `hmi-isa101-baseline`, `hmi-screen-architecture`,
   `hmi-standards-precedence`, `hmi-rockwell-process-style-guide`, `optix-application-recipe`,
   `optix-navigation-patterns`, `optix-widget-patterns`, `optix-design-resources`.
2. `optix_template {}` — our two starters and their questions, nothing written. The starters are the
   shell; the standard is what goes inside and on top of them.
3. Ask the template brief: runtime target(s) and canvas(es), display levels and the navigation shell,
   palette and style sheet, tag and model naming and hierarchy (`optix_model`), alarm strategy, NetLogic
   patterns (`optix_script` templates), startup and logout, and the deliverable — standard document,
   starter-based project, or both — and where each one lives.
4. State the measured constraint before writing anything: nothing in this bundle creates an empty
   `.optix`. A house template is a standard document applied to a starter copy, or a project the engineer
   creates in Studio that these tools then fill. Do not promise a from-nothing project.
5. Write the standard into the workspace as Markdown: the levels, the shell, the palette, the tag
   convention, the alarm rules, the screen patterns, and the reference page each rule comes from.
6. If the brief asks for the project too, scaffold the chosen starter with the brief's answers (A.2) and
   then apply the standard with `optix_*` — style sheet, shell bar, `optix_model` hierarchy, screens,
   NetLogic templates.
7. Close on `optix_production_check`, then hand the engineer the two Studio actions (compile,
   StartBridge). Say which parts of the standard a check enforces and which are judgement.

## Reporting

Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
completeness: it names what the call cannot establish — rendering, runtime behaviour, the installed
Optix version, and anything outside the loaded project.
