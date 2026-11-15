# The FactoryTalk Optix workflow

How a request becomes a working screen. This is the same seven-phase loop the `factorytalk-optix`
skill carries, written out for a person: what the agent does, what stays with the engineer, and what
each phase may and may not claim.

The shape is deliberate. Two of the seven phases need a human, because FactoryTalk Optix keeps two
things inside Studio that no external process can do: compiling the project, and saving it. Everything
else runs through this bundle's tools.

## The loop

| Phase | The agent | The engineer |
| --- | --- | --- |
| **0 Brief** | reads the published standards, asks the questions a copy cannot undo | answers |
| **1 Scaffold** | `optix_template` writes the project copy | — |
| **2 Open and arm** | nothing to do; the files are on disk | opens the `.optix`, builds, starts the bridge |
| **3 Connect** | `optix_status`, then `optix_read` once the bridge answers | — |
| **4 Author** | `optix_edit` / `optix_screen` / `optix_model` / `optix_script`, then the static checks | — |
| **5 Persist** | reads `needs_save`, then verifies the save on disk | saves, then builds (emulator stopped) — or asks the agent for the two keystrokes |
| **6 Look** | `optix_emulator` start, `optix_preview` / `optix_screenshot`, proves the change | — |
| **7 Release** | `optix_production_check`, then states coverage | deploys from Studio's Deploy dialog |

An existing project starts at phase 3. A request for a house template or a team standard is a design
deliverable: it writes the standard first (phase 0 extended into a document) and only then scaffolds.

## Phase 0 — the brief, before any host read

A new build starts from the brief, the packaged starters and the published standards — not from what is
installed, open or on disk (`CRAFT-ORD-01`). The agent reads the standards pages from
`engineering_reference` (`hmi-isa101-baseline`, `hmi-screen-architecture`, `hmi-standards-precedence`,
`hmi-rockwell-process-style-guide`, `optix-application-recipe`, `optix-navigation-patterns`,
`optix-widget-patterns`, `optix-design-resources`), then `optix_template {}` for the two starters and
their questions. Five answers are baked into files and are painful to change later:

| Question | Why it cannot be guessed |
| --- | --- |
| **Runtime** — OptixPanel device or a PC in a browser | it picks the starter |
| **Screen size** in pixels | every screen drafted afterwards inherits this canvas |
| **Project name** | it is written into the project files and the folder |
| **Destination** | the copy lands in `<destination>/<name>` |
| **What it talks to** — Logix, OPC UA, MQTT, nothing yet | the templates ship those folders empty |

## Phase 2 — the two actions that belong to the engineer

The bridge is a C# NetLogic class (`StudioMCPBridge`) inside the project. Only Studio can compile it and
only the engineer's right-click can start it:

1. Open the `.optix` file in Studio.
2. Build the solution (Ctrl+Shift+B).
3. Right-click the `StudioMCPBridge` NetLogic node → **StartBridge**.

The first `StartBridge` raises Studio's NetLogic security warning (the bridge references
`System.Net.Sockets`, `System.IO` and friends); it binds only after **Proceed**. Ticking "Do not show
this warning again" stops it recurring.

The agent waits for the engineer's word. It does not poll, does not open Studio, and does not click
anything: a screenshot of the IDE is not a step in this workflow.

## The three states, and why they are confused

| State | Who sees it | How it gets there |
| --- | --- | --- |
| **Live model** | `optix_read`, and every `optix_edit` changes it | the bridge, inside Studio |
| **Saved project** | the runtime | Studio's Save (Ctrl+S) or Build (Ctrl+Shift+B) |
| **Rendered screen** | `optix_preview`, `optix_screenshot` | a runtime serving the Web presentation engine's URL |

`optix_status` counts the authoring calls made since the last save and reports `needs_save`;
`optix_screenshot` repeats it in one line. After the save, `optix_status` with `saved: true` clears the
count — but a reply is not evidence, so the save is checked on disk instead:
`optix_emulator { action: "status", project }` reports `disk` (the newest write under `Nodes/`, its path,
the project file's size) and `saved_after_edit`, which stays `false` while every file on disk is older
than the first pending bridge change. Nothing in this bundle can save the project: the bridge has no save
route, and `UAManagedCore.dll` carries no `Save`, `IsDirty` or `Persist` symbol at all, so no design-time
NetLogic can reach a save either. Both of Studio's own actions do write bridge edits — measured on the
reference machine, a Build wrote a whole bridge-authored screen to `Nodes/**` and a later Ctrl+S wrote a
re-bound `Panel` link by itself. When `saved_after_edit` is `false`, say what was measured and ask for
**File > Save** by name; a first build measured minutes, so re-read the disk before concluding that a
save failed.

The one sanctioned reason for the agent to touch the desktop is that handoff: when the engineer asks the
agent to press Save and Build rather than do it themselves, it may send exactly two keystrokes
(`Ctrl+S`, then `Ctrl+Shift+B`) to the already-open Studio window — no clicks, no menus, no launching
Studio, and the emulator still only ever through `optix_emulator`. The handoff is offered first and taken
only on the engineer's word, and it is verified on disk like any other save.

## Phase 5 — the order that works

Measured failures, in the order they bite:

1. **A build while the emulator runs** fails on `MSB3061`: the runtime holds `bin/<project>.dll` open.
   Nothing saves. So stop the runtime first.
2. **A save alone is not a build.** Bridge-side edits persist on save, but the compiled NetLogic
   assembly only reloads on a build; `optix_script { action: "run" }` answers `not-loaded` until then.
3. **A screenshot taken before a save** shows the previous build. It is not evidence of the change you
   just made.
4. **A save is verified from the files, not from the keystroke.** The classes call the node API directly,
   so the project can hold a whole tree of changes while Studio's own dirty flag shows nothing; the save
   itself works (measured: a Build wrote the screen, a later Ctrl+S wrote the re-bound `Panel` link), but
   only the timestamps under `Nodes/` prove it landed. A first build took minutes.
5. **A screen nothing mounts is a screen no render shows.** The templates ship `UI/MainWindow` with no
   children, so `optix_screen` also creates a `PanelLoader` across the canvas and binds its `Panel`
   pointer to the new screen by literal `raw_path` (a screen is an `ObjectType`, so `source_path` is
   refused with `source_not_variable`). `mount: false` when something else already mounts it,
   `mount_name` to name the loader.
6. **The mount link must be project-absolute.** `/Objects/<Project>/UI/Screens/<Screen>` renders; a bare
   `UI/Screens/<Screen>` resolves against the loader's parent, shows red in Studio and renders blank. An
   offline probe on a saved project measured the `DynamicLink` child holding the absolute path rendering
   identically to a resolved static value, so the bridge's form is not the problem — the path is.

## Phase 6 — proof, not decoration

`optix_emulator` is the only sanctioned way to run the project. It launches the installed
`FTOptixRuntime.exe` against the `.optix` file and returns only once the preview URL answers — or returns
the runtime's own log with a named diagnosis:

| Diagnosis | What it means | What to do |
| --- | --- | --- |
| `port_in_use` | another runtime already holds the preview port | `optix_emulator { action: "stop" }`, then start |
| `file_locked` | the DLL is held by a running runtime | stop, then start |
| `licensing` | the runtime refused to start | report it; the license is the engineer's |
| `exception` | the runtime crashed on load | read the log tail, fix the project, restart |
| `missing_file` | the project or its dependencies are gone | re-scaffold or repair the copy |

A runtime can also start successfully and still carry a fact worth naming. On a machine with no
FactoryTalk Optix entitlement, the log says `Standard entitlement not found`, then `Demo mode started.
FactoryTalk Optix Runtime will be closed in 120 minutes`, and the preview still answers on 8081. That is a
**notice**, not a failure: `start`, `status` and `logs` return `notice.kind: "demo_mode"` and the run is
fine until the two hours are up. Do not diagnose it as a project defect, and do not spend the session
chasing a licence — report it once, then work.

A screenshot is evidence only when it shows the change: the caption written, the value that moved, the
screen the button reached. Anything with no visible result — an alarm that never fired, a handler with
no on-screen effect — is named as not proven rather than implied.

**A fresh starter screenshots as one flat colour, and that is correct.** Both packaged templates ship a
window — `UI/MainWindow`, canvas from the `width`/`height` you passed, `Caption` linked to the project
`BrowseName` — and four screens the operator shell opens on (`Home`, `Alarms`, `Diagnostics`, `Settings`)
that nothing has mounted in the window yet. A 1920×1080 white PNG with one distinct colour is the honest
render of that project; it means the runtime, the engine and the browser are all working. Content appears
once phase 4 has mounted a screen with `optix_screen` and planned the bar with `optix_nav`. Do not report a
blank render as a broken preview, and do not scaffold a starter and then claim a screen was built.

The runtime also resolves a `PanelLoader`'s `DynamicLink` before its `Panel` pointer, and a button
created inside a panel resolves its loader path to the design-time object. Both were measured live and
are handled by `optix_screen`, which draws the navigation bar in the start window, names buttons
`Nav_<target>`, wires them relative and clears the absolute pointer.

Two things about that bar were measured on the LineHMI project on 2026-11-14 and are now part of the
draft. A button that navigates to the screen the same batch creates is wired in that batch: the path is
the batch's own output, so probing it first found it "missing", which both left the button dead and
dropped the loader from the batch — the second screen's `DETAIL` button drew and did nothing. And every
bar button carries its own `BackgroundColor` and `TextColor`: a `Button` with no fill takes the style
sheet's grey, and its white label measured 1.4:1 on it, so the shell bar was the one part of the screen
that ignored the palette.

## Phase 7 — what a verdict means

`optix_production_check` answers `ready`, `review` or `not_ready` from five rules: an event handler
still holding an absolute design-time NodeId (`OPTIX-PROD-01`, the measured cause of a navigation button
that clicks but never switches), navigation to a screen that is not there, a screen the operator cannot
reach, a presentation engine left on engineering defaults, and a screen outside the screen folder.
`ready` says those rules did not fire. It does not say an operator saw the application.

Every result carries `coverage`, which names what the call cannot establish: rendering, runtime
behaviour, the installed Optix version, anything outside the loaded project. Read it before claiming
completeness.

## Phase 4b — caption, artwork and the data a screen owns

Three things a screen must get right that geometry alone cannot judge.

**A type's real contract.** `optix_schema` answers from a catalog generated out of the installed Help
(565 object types, 102 variable types, 110 enums for Studio 1.8.1.27), so a property name is checked
before it is written instead of learned from a refusal. `action: "refresh"` diffs that catalog against the
running bridge's own dump; it reports `added`, `changed` and `datatype_drift` separately, because the Help
names the UA datatype where the runtime reports the CLR one (`Width` is `Size` in the reference, `Single`
at runtime) and calling that a change would bury the two types and 94 properties that really are new.

**Artwork that changes with the process.** `optix_svg { action: "inspect" }` says whether a drawing can be
driven at all: Optix changes an element's colour, opacity, stroke width and dash array only when the file
is SVG 1.2 Tiny, the element carries an `id`, and its paint is hexagonal; everything else renders and never
moves. `add` writes the file into `<project>/ProjectFiles/imgs/` and creates the image with a `%PROJECTDIR%` path
(the Web engine refuses paths outside the project), and `bind` creates the element property under the
image's `SVGElementProperties` collection — named explicitly, because an auto-routed create comes back as a
warning that a strict batch refuses.

**Variables on the object that owns them.** A value an operator edits or reads belongs on the faceplate,
label or model object that shows it, never directly in `UI` (which cannot hold variables). `optix_edit`
with `create_variable` writes a plain value, and `kind: "analog"` with `units` and `range` writes the
engineering metadata as child variables; `array` or `dims` declares a shape, `display_name` gives the
operator words without changing the path. The rules are in `optix-variables-and-properties`.

`optix_design_check` gains four rules for exactly these: `OPTIX-IMG-01` (an image with nothing bound),
`OPTIX-STYLE-01` (a literal colour outside the palette on a styled type), `OPTIX-LAYOUT-01` (a child drawn
outside its parent), `OPTIX-DATA-01` (a label showing a model number with a recorded unit but no
formatter).

## Tools by phase

| Phase | Tools |
| --- | --- |
| Brief | `engineering_reference`, `engineering_profile`, `optix_template {}` |
| Scaffold | `optix_template` with `template`, `destination`, `name`, `width`, `height`; `optix_project` and `optix_build` when a starter or a standard has to be written from files |
| Connect | `optix_status`, `optix_bridge_arm`, `optix_read`, `optix_validate_expression` |
| Author | `optix_edit`, `optix_screen`, `optix_model`, `optix_script`, `optix_action`, `optix_library`, `optix_netlogic`, `optix_design_check`, `optix_schema`, `optix_svg`, `optix_project` (file channel), `optix_build` (references, solution, compile check) |
| Persist | `optix_status` (`needs_save`, `saved: true`), `optix_emulator { action: "status" }` (`disk`, `saved_after_edit`), `optix_build { action: "status" }` |
| Look | `optix_emulator` (`status`, `start`, `restart`, `logs`, `stop`), `optix_preview`, `optix_screenshot`, `optix_ocr` |
| Release | `optix_production_check`, `optix_project { action: "check" }`, `optix_build { action: "check" }` |

## What this workflow does not do

- It never opens, clicks or types in Studio. Two actions are the engineer's; everything else is a tool.
- It never launches `FTOptixRuntime.exe`, `Start-Process` or `Stop-Process`: `optix_emulator` owns the
  runtime, because it is the only thing that knows which runtime belongs to which project.
- It never talks to the bridge by hand (`curl` against `/bridge/*`), and never imports the plugin's
  `lib/` to call a tool function directly.
- It never edits a project file with a text editor, a shell one-liner or a script: the file channel is
  `optix_project`, which refuses while Studio has the project open and keeps a backup of every apply.
- It does not claim a build, a save or a deployment happened. Those are the engineer's, or Studio's.
