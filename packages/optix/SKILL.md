---
name: factorytalk-optix
description: FactoryTalk Optix Studio engineering — author a project or a house template from the published standards, or work in the loaded project through the Studio bridge: inspect and author nodes, validate expressions, write and review NetLogic C#, and start from one of the two packaged starters.
whenToUse: The user asks about FactoryTalk Optix — project structure, nodes, variables, aliases, expressions, NetLogic C#, alarms, trends, recipes, OPC UA, the emulator preview, or a new Optix house template or standard for a team. Route FactoryTalk View ME elsewhere.
---

# FactoryTalk Optix engineering

A new build starts from the brief, our packaged templates and `engineering_reference` — not from what is
installed, open or on disk; the host is read only when the operator points at it, or when the work is
inside an existing project (`CRAFT-ORD-01`).

## Start here — a new build, a template, or a standard

The first tool call is `optix_template {}` and the first thing you produce is the brief. Do not read
this repository, do not grep for prior attempts, do not survey the machine, and do not write a plan
before the brief exists: the tools carry the procedure and the standards corpus, and `CRAFT-ORD-01`
says the host is not the source.

1. `optix_template {}` returns both starters and the five questions.
2. Ask all five in one `ask_user_question`: runtime target, canvas in pixels, project name, destination
   folder, what the line talks to.
3. `optix_template` with the answers writes the project; there is nothing to open yet.
4. Hand the engineer three actions and wait: open the `.optix`, Build (`Ctrl+Shift+B`), then
   right-click `StudioMCPBridge` → StartBridge.
5. When the bridge answers, the starter already carries the operator shell's four screens (`Home`,
   `Alarms`, `Diagnostics`, `Settings`). Mount the first one with `optix_screen`, plan the bar with
   `optix_nav { action: "plan" }` and apply it, read the screen back with `optix_design_check`, then
   save and look with `optix_emulator` and `optix_screenshot`.

A build is a scaffold, one screen and a rendered look inside five minutes. If no screen exists yet and
you have been reading files for a while, stop and say what blocked you.

If the `optix_*` tools are not in your tool list at all, the Optix row is switched off in this profile:
say that in one line and stop. Never rebuild the tools by importing the plugin's `lib/` from Node, and
never drive Studio to fake the surface.

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
- **No editor and no shell on project files.** `optix_project` is the only way this skill writes the
  project tree, and `optix_build` the only way it touches the solution. Never edit `Nodes/*.yaml` or the
  `.optix` file with a text editor, a PowerShell one-liner or a script — not even with Studio closed.
  Those writes skip the gate that proves the file an edit is based on is still the file on disk, the
  backup that makes an apply undoable, and the validation that the result still loads. A project Studio
  has open belongs to the bridge, and the file channel refuses it by name rather than racing it.

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

## The file channel, when the bridge is the wrong tool

Two authoring channels, and they are alternatives rather than a pipeline:

- `optix_edit` / `optix_action` — the live model inside Studio. Correct for anything the runtime must
  show after one save. It is refused when the bridge is offline.
- `optix_project` — the files themselves. Correct for scaffolding, renaming a project, adding a whole
  subtree, editing NetLogic sources, or repairing a project whose Studio session cannot be reused.
  `optix_build` is the same channel's build side: references, solution scaffold, an out-of-tree
  compile check, and the artefact state.

`optix_project` refuses while Studio has the project open (`project_open_in_studio`), while the bridge
holds unflushed changes (`bridge_state_unflushed`), or while another write runs (`write_in_progress`).
`force` clears a plan whose file changed on disk (`file_changed_on_disk`) and nothing else — losing a
Studio session's work is not a trade this tool offers.

Use it in this order and say which step you are in:

1. `check` — the tree the `- File:` registrations describe, with findings. The four an edit breaks are
   `file_missing`, `duplicate_name`, `reference_without_target` and `file_unregistered`.
2. `stage` — replay the operations in memory and report `writable` and per-file hashes. Nothing is
   written; a plan touching more than 400 files, or a file outside the writable set, is refused.
3. `apply` — the gates run again, the previous bytes are copied to `ProjectFiles/.dsh-backups/<id>/`,
   and every file is written or none is: an apply rolls itself back.
4. `diff`, then `restore` — a backup is the undo of that apply, and only of that apply.
5. `optix_build action check` — when the edit touched C#, compile a copy before asking for a save. It
   never writes `bin/`, `obj/` or the project.

A registration resolves relative to the directory of the chapter that names it, and the chapter's own
root node is the node that registration becomes: never nest a `- File:` entry under a node, because it
is then neither a node nor a registration and Studio silently never loads it. `set_project_name`
rewrites the name in every place it appears, including the absolute `Authentication.DefaultUserFolder`
pointer — that pointer is why a hand rename silently breaks login.

## The loop

Every request that ends in a working screen walks the same seven phases. Say which phase you are in:
it is how the engineer knows what you are doing and what is theirs.

| Phase | You | The engineer |
| --- | --- | --- |
| **0 Brief** | read the standards, then ask what a copy cannot undo: runtime target, canvas size, project name, destination, what it talks to | answers |
| **1 Scaffold** | `optix_template` with those answers | — |
| **2 Open and arm** | nothing; the files are on disk. `optix_build action init` first only when the scaffold has no solution. `optix_docs` when a name is unsure | open the `.optix`, build, start the bridge |
| **3 Connect** | `optix_status`, then `optix_read` once it answers | — |
| **4 Author** | `optix_edit` / `optix_screen` / `optix_nav` / `optix_model` / `optix_script`, then the static checks | — |
| **5 Persist** | read `needs_save`, ask, then verify the save on disk | save (Ctrl+S) then build (Ctrl+Shift+B), emulator stopped |
| **6 Look** | `optix_emulator` start, `optix_preview`/`optix_screenshot`, `optix_nav verify` for a bar, prove the thing changed | — |
| **7 Release** | `optix_production_check`, `optix_nav reconcile`, then state coverage | deploy in Studio's Deploy dialog |

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

## The screen has a language before it has a layout

Every colour, radius, border and font size on a screen should come from one place: the design language
the project is built in. Optix provides the mechanism â€” a `StyleSheet` object bound on the presentation
engine â€” and `optix_ui` authors it. The default is `modern`; `isa101`, `isa101-hc`, `modern-dark`,
`material-dark`, `minimal-light` and `kiosk` are selected by name when a brief asks for them (a process
HMI under ISA-101, a wall display, a gloved-hand panel).

1. `optix_ui { action: "languages" }` when the brief names a standard, or when you need to know what a
   language carries before choosing it.
2. `optix_ui { action: "theme", mode: "plan", language }` â€” the answer names the sheet node, every
   token and every named style, and how many engine pointer writes bind it. Nothing is written.
3. `optix_ui { action: "theme", mode: "apply" }` with writes allowed. It validates strictly, dispatches
   one operation at a time, and **reads both engines back**: `engine_refs_verified` is the only claim
   that the runtime will draw with this language.
4. Save and Build in Studio, restart the emulator, then `optix_ui { action: "audit" }`.

A `NodeId` property is written on the pointer node's `Value` child, never by naming the property on the
owning node: the engine's own `StyleSheet` property accepts the write and keeps the sheet it already had
(measured on bridge 1.0.9). The value is spelled **project-relative** (`UI/<Sheet>`); the
`/Objects/<Project>/UI/<Sheet>` spelling is refused by `validate_ops` with
`bad_value: NodeId value must be a resolvable node path`, whether or not the sheet exists. A theme that
reports `applied_unverified` has not landed, whatever the operations said.

Screens built by `optix_screen` read the same language, so it is not a skin painted on at the end: the
layout density, the type scale and the target sizes come from it, and `isa101` is judged by ISA-101
rules rather than by `modern` ones. Switching a finished project is one apply call, not a rebuild.

## A designed screen is a blueprint, not coordinates

Where a screen is not a scaffold but a design, describe it and let the kit place it. `optix_ui` owns
this: `action: "components"` answers with the components the active language draws with, and
`action: "screen"` compiles a `pattern` plus its regions into validated operations on a 12-column grid.
There is no coordinate to get wrong: a body that cannot fit is refused (`layout_overflow`,
`layout_too_narrow`) rather than drawn overlapping, and `chrome: "none"` leaves the header and footer to
a window shell.

1. `optix_ui { action: "components", language }` - and, if the brief is a real design, read
   [`docs/optix-kit.md`](../../docs/optix-kit.md) for the blueprint shape before writing one.
2. `optix_ui { action: "screen", project, screen, pattern: "overview", mode: "plan", blueprint }`.
   The answer carries the canvas, the operations, the components and the validation.
3. The same call with `mode: "apply"` (writes allowed) - it validates the whole batch `strict: true`
   first, then dispatches one operation at a time and reports `partial`/`indeterminate` honestly.
4. Save and Build in Studio, restart the emulator, look at the screen. A blueprint that applied is not
   a screen that reads well; the look is judged on the served preview, not on the operation count.

Two measured rules the kit already obeys, that any hand-written screen must obey too: a colour is a
`#RRGGBB` string (`validate_ops` refuses `0xRRGGBBAA`), and a node name that a legacy scaffold already
uses (`Card1`) collides - `already_exists` is reported before anything is written. `pattern` is
`overview` or `blank` today; the navigation rail and the dialogs arrive with
`optix_ui action: "shell"|"dialog"` in the same P-series, so do not hand-draw them in the meantime.

## The window is a frame, and the shell draws it

A screen is not the application. Before the screens read well, the window needs the four bands an
operator expects - a header (brand, title, clock, who is logged in), a navigation rail, a content host
and a status strip - identical on every screen. `optix_ui { action: "shell" }` draws that frame around
the start window, and the rail is a **native `NavigationPanel`**, not a row of buttons: one
`NavigationPanelItem` per screen under `<rail>/Panels`, each with a `Title` and a `Panel` pointer, and
the panel's `AttachedPanelLoader` pointing at the content host.

1. `optix_ui { action: "shell", project, mode: "plan" }` - read the canvas, the band rectangles, the
   rail targets it found under `UI/Screens`, and the phases.
2. The same call with `mode: "apply"` (writes allowed). It runs four phases - `chrome`, `rail`,
   `attach`, `pointers` - validating each against the model the previous one left behind, because
   Studio creates a panel's `Panels` collection with the panel and a `NodeId` property has no pointer
   child until it is written. A refused phase names itself; nothing after it is written.
3. A second apply is a repair, not a duplicate: a band or rail item that already exists is restated,
   not created again.
4. Save and Build in Studio, restart the emulator, then prove a tab: see below.

Optional `screens` (defaults to every `Screen` under `UI/Screens`), `loader` (reuse an existing panel
loader), `rail_width` (160-280 px), `language`.

## Destructive commands ask first

A dialog is a `Dialog` object type opened by Studio's own `UICommands.OpenDialog` and closed by
`UICommands.CloseDialog` - no NetLogic, no absolute pointer in a property. `optix_ui { action: "dialog" }`
writes it in five phases (`folder`, `type`, `content`, `wire`, `trigger`), and a second apply restates the
wording and the boxes instead of creating a second button.

1. `optix_ui { action: "dialog", project, mode: "plan", name: "ConfirmDelete", title: "...", message: "...",
   confirm_label: "Delete", cancel_label: "Keep", destructive: true, trigger_screen, trigger_name }`.
2. The same call with `mode: "apply"`. The trigger button's `OpenDialog` argument is the
   **`/Objects/<Project>/…`** path; that is the one place a dialog is named that way.
3. Save and Build in Studio, restart the emulator, click the trigger. Do not report a dialog as working
   from the operations that wrote it.

## Navigation is a bar and a proof

A screen that never changes when a button is clicked is the failure this skill exists to stop: the
button exists, its handler compiles, the design checks pass, and the runtime does nothing. The cause is
where the button sits. A button **inside** a panel resolves its handler against the design tree, the
runtime instantiates the UI per session, and the click answers `No behaviour or observer found that
handles the method 'ChangePanel'`. A button **beside** the loader, as a child of the window, resolves
the same way in both trees — which is what Rockwell's own navigation template does, with a *relative*
`@NodeId` pointer rather than an absolute design-time one.

Use `optix_nav`, never hand-drawn coordinates:

1. `optix_nav { action: "plan", targets: [{ label, screen }] }` — the bar rectangle comes from the
   window's own `Width`/`Height`, buttons sit at most six to a row at 44 px, and the answer names the
   screens that do not exist yet and how many buttons need wiring.
2. Create the missing screens with `optix_screen`, then plan again.
3. `optix_nav { action: "apply" }` with writes allowed. It creates only what is missing, wires only
   buttons with no handler, and clears the absolute pointer value the runtime would otherwise resolve
   first (`OPTIX-PROD-01`). A second apply is a no-op, not a second handler.
4. Save and Build in Studio, then `optix_emulator { action: "restart" }`.
5. `optix_nav { action: "verify", project_root }` — it opens a headless browser at the window's size,
   clicks every button in the served preview, and accepts two runtime proofs: the loader's `Panel` read
   back through the bridge, or the served page naming the target on a line that was not on screen
   before the click. Bridge 1.0.9 renders a `NodeId` property as `(Null)`, so on some projects the page
   text is the only evidence available. A repaint alone is reported as `repaint_only` and never counted.

Never report navigation as working from operations alone. "Wired" means the model holds a handler;
"works" means a click put the target screen on the display, and only `verify` says that.

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

Two of the snapshot's pages are ours, not upstream's, and they are the routing layer:

- `optix_netlogic { slug: "index-by-task" }` maps a task ("react to a tag change", "log to a file",
  "write a recipe", "start a background job") to the upstream page that answers it, and indexes all
  fifty-one pages with a line each. Start here when the request names a behaviour rather than an API.
- `optix_netlogic { slug: "api-namespaces" }` lists the namespaces and the members that matter
  (`FTOptix.HMIProject`, `UAManagedCore`, `OpcUa`, `FTOptix.NetLogic`, `FTOptix.UI`, `FTOptix.Core`,
  `FTOptix.Alarm`, `FTOptix.Recipe`) with `Project.Current.Get<T>`, `Owner.Get<T>`,
  `LogicObject.GetVariable/GetAlias/SetAlias`, `InformationModel.MakeVariable<T>`, `IUAVariable` links and
  the `VariableChange` pattern. Use it to get a `using` line and a type right before writing code.

Ten behaviours, and the page that answers each - one `optix_netlogic` call, not a search:

| the request | the page |
| --- | --- |
| an alarm, an alarm banner, ack or shelve | `alarming.md` |
| a trend, a history read, a sparkline's data | `trends.md` |
| read or write a PLC tag | `plc-tags.md` |
| log a user in, a session, an idle timeout | `users-groups.md` + `sessions.md` |
| load, save or validate a recipe | `recipes.md` |
| open a popup, a confirmation dialog | `dialog-boxes.md` |
| fill or refresh a grid or a list | `datagrids.md` |
| animate a colour or an opacity | `ui-animations.md` + `advanced-svg.md` |
| walk the model, query nodes | `queries.md` |
| a timer or a background job | `async-tasks.md` / `threading.md` |

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

## Ask this build what a type carries

`optix_schema` answers from a catalog generated out of the installed Help, not from memory: 565 object
types, 102 variable types and 110 enums for Studio 1.8.1.27, shipped with the plugin so it answers with no
bridge and no Studio session. `{ action: "type", name: "AdvancedSVGImage" }` gives the super type, every
property with its datatype and whether it is inherited, the methods with their arguments, the events, and
the types it may contain; `{ action: "enum", name: "ImageFillModeEnum" }` lists the values; `{ action:
"children", name: "PanelLoader" }` names what belongs inside; `{ action: "find", query: "width" }` searches
types, enums and properties, and folds a property that dozens of types share into one row with an owner
count. Read it before writing a property name: a refusal from `optix_edit` carries the closest matches, but
the schema is the cheaper answer, and `optix_schema { action: "refresh" }` diffs the shipped catalog against
the running bridge's own dump when the Studio version moved.

The refresh is honest about what it can and cannot see. Studio's runtime dump carries one property per type
with its CLR datatype, so the diff reports `added` (a type the Help does not document), `changed` (a
property the Help does not document) and `datatype_drift` (the Help names the UA datatype, the runtime
reports the CLR one — `Width` is `Size` in the reference and `Single` at runtime, which is expected and is
not a defect). On Studio 1.8.1.27 the measured numbers are 2 added, 94 changed and 748 drifted.

## Look it up in the help Rockwell shipped

The plugin carries an index of the documentation installed beside Studio — 2,591 pages on 1.8.1.27,
one 1,354 KiB JSON, no service and no model. `optix_docs { action: "search", query: "Session" }` ranks
pages by title, headings and snippet and returns a line-sized snippet each; `{ action: "read", id }`
returns one page as text, straight from the install. Use it for an API name, a member list, a menu
path or a property's stated meaning before asking the bridge or guessing: one search is cheaper than
one wrong insert, and the page is evidence you can cite.

It is evidence for documented behaviour, not for the project in front of you — the model, the bound
tags and the live values come from `optix_read`, `optix_schema` and the bridge. Two gaps are worth
knowing because they are measured: **`ChangePanel` is not in the installed help at all** (a search
returns zero pages), which is exactly why navigation has `optix_nav` and the sample projects behind
it, and template-library types such as `NavButton` are documented by the library that ships them, not
by the Help folder. `{ action: "status" }` reports the Studio version the index was built from and
says when an upgrade has made it stale; `node scripts/gen-optix-help.mjs` rebuilds it.


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

`optix_design_check` also judges the four things a screen can get wrong on its own: `OPTIX-IMG-01` an
`AdvancedSVGImage` with no element property bound (artwork that can never change), `OPTIX-STYLE-01` a control
setting a colour that is not in the palette while the style sheet styles its type, `OPTIX-LAYOUT-01` a child
drawn outside the box it belongs to, and `OPTIX-DATA-01` a label showing a model number that has a recorded
unit but no formatter. Geometry is absolute on the canvas, so "outside its parent" is measured against the
parent's rectangle, not against a local offset.

## Draw part of the picture from SVG

`optix_svg` is the one tool for artwork an operator reads as data. Start with
`{ action: "inspect", source: "<path>" }`: it reports whether the drawing is controllable at all, and it
refuses to pretend. FactoryTalk Optix can change an SVG element's colour, opacity, stroke width and dash
array only when the file is SVG 1.2 Tiny, carries an `id` on the element, and declares that element's paint
as a hexadecimal value in an attribute or inline CSS — anything else draws correctly and never animates.
The inspection answers `conformant`, lists `controlable` elements with the properties each one really
supports, and returns a `repairs` list naming the exact change (`fill="#30A46C"` for a `url(#…)`, a rename
for two ids that would collide as property names) so the fix can be made in the source rather than worked
around. Files with no `id`, gradients, filters, `foreignObject`, `script` or animation elements are
reported, not silently accepted.

`{ action: "add", screen, name, source }` puts the drawing into the project at
`<project>/ProjectFiles/imgs/<name>.svg`, creates the `AdvancedSVGImage` on the screen, and writes `Path` as
`%PROJECTDIR%/imgs/<name>.svg` — the resource URI the Web presentation engine requires, because it refuses
any path outside the project folder. The file goes under `ProjectFiles` because that is the folder the engine
serves as `/projectfiles/imgs/...`; a copy in `<project>/imgs` answers 404 and the image renders blank
(measured 2026-11-15, which is why `add` writes there).
Then `{ action: "bind", node, id, property, value }` (a literal, or `source_path` for a dynamic link, or
`bool_colours: { on, off }` for a boolean, which becomes the expression `if({0}, 0xFF<on>, 0xFF<off>)` with
the tag as its source - the ARGB form a colour needs, proven red-to-green on a live render) creates the
`AdvancedSVGImageElementProperty` under the image's
`SVGElementProperties` collection — passed explicitly, because a create that the bridge would auto-route
into a collection comes back as a warning and a strict batch refuses it — and writes `ID`, `Property` and
`Value`. `{ action: "list", screen }` reads back which images exist and which parts each one drives. The
element-property names are derived (`Conveyor` + `Color` → `Conveyor_Color`), so the bind appends rather
than duplicating, and the node read-back shows the value the runtime will use.


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

Three limits are measured, not guessed, and the tool says each in its report. Studio 1.8.1 writes only
`DisplayName` as a node attribute, so units, range and description travel as child variables —
`EngineeringUnits` as a `LocalizedText`, `Description` as a `String`, and the range as an empty `EURange`
`Range` node with `EURangeLow` and `EURangeHigh` Floats beside it, because a `Range` value cannot be
assigned through the bridge and a variable of `AnalogItemType` cannot be created at all (it takes a
datatype, and a VariableType name is refused). A type's members are also copied onto each instance,
because the bridge writes members with `ModellingRule` None and a None member is not instantiated. Both
are reported as `metadata` and `inheritance: "copied"` in the result, and the fix belongs in the bridge,
not in a workaround. An existing flat model is reported by `check`, never rewritten.

### Variables on a component

Any object can carry a variable, and that is how a screen keeps state: a setpoint on the faceplate that
edits it, a lamp's current colour, a value an instance must not share. Studio offers four kinds — Variable,
Analog variable, Node pointer, Alias — and `optix_edit` writes them on the object that owns the value:
`{ op: "create_variable", parent, name, datatype }` for a plain value, plus `kind: "analog"` with `units`
and `range: [low, high]` for a number an operator reads, `array` (a length) or `dims` for a shape,
`display_name` for the operator's words (the `BrowseName` in the path never changes), and
`create_alias`/`create_object` for parameterising one screen type across many panels. The `UI` folder
itself cannot contain variables, so a value with no owner is a sign the composition is wrong. Rules and
the four-kinds table: `optix-variables-and-properties`.


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

## What "done" means here

A change is done when the evidence exists, not when the operation returned `applied`. Before saying an
application is ready, these five have to be true, and each one names the call that proves it:

1. **The buttons work.** If the application has a navigation bar, `optix_nav { action: "verify" }` must
   return `status: "verified"` — every button clicked, the loader's `Panel` read back as that button's
   screen. A repaint is not a pass; a bar that was only planned is not wired.
2. **The release review is clean.** `optix_production_check` returns `ready`, or every remaining finding
   is stated with the node and why it is accepted. `optix_design_check` runs on each screen that changed.
3. **The sources compile.** `optix_build { action: "check" }` exits 0. If the NetLogic classes changed,
   `optix_build { action: "status" }` afterwards must not say `stale` once Studio has rebuilt.
4. **A save was proven, not assumed.** `optix_status` reports no unflushed bridge changes, and the file
   on disk carries the edit — the runtime shows the saved project, so a screenshot taken before the save
   shows the previous build.
5. **The claims are sourced.** An API name, a member or a menu path comes from `optix_docs` or
   `optix_schema`, a runtime behaviour from a click or a log line, and a project fact from `optix_read`.
   "Should work" is not evidence; name the call that showed it.

When one of the five cannot be shown (no bridge, no preview, no SDK), report that as the gap and stop
short of "ready". The rest of the work can still be correct — it is just not yet proven.

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
   project folder itself. Report the path the tool returned and the canvas it got. Both starters ship an
   operator shell's four screens (`Home`, `Alarms`, `Diagnostics`, `Settings`) — the loader and the bar
   are still created in phase 4 by `optix_screen` and `optix_nav`, because those are the calls that also
   prove the buttons work.
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
