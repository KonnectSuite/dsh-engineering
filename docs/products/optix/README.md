# FactoryTalk Optix

`@aryacode/dsh-engineering` ships 32 tools that read and author a loaded FactoryTalk Optix Studio
project through a bridge NetLogic class inside Studio, design operator screens from a blueprint, write
and compile NetLogic C#, draw driveable SVG artwork, and run the emulator so a change can be looked at.
The component is a beta product: the tool set is real and measured against Studio 1.8.1.27, and it
still changes between releases.

The tools are registered under the `optix_` namespace and need no plugin development: they are mounted
by this bundle's `optix` row, which is on by default. They are vendored, not built here — the shipped
`lib/` is the source, and every authoring call is gated on `optix_read` reading the change back.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `optix` — *FactoryTalk Optix* |
| Capability class | `live-ide` (it reads and writes a running IDE, not an exported file) |
| Stability | beta, since `v0.3.0` |
| Tools | 32 in the `optix_` namespace; an authoring call is gated on `optix_read` |
| Package / entry | `packages/optix` → `entries/optix.js` |
| Skill | `factorytalk-optix` (`packages/optix/SKILL.md`) |
| Probe | `optix_status` |
| Evidence gate | `optix_read` — an authoring call is accepted only once the live model reads back the change |
| Switches | the row's parts `authoring`, `destructive`, `invoke`, `preview` and `netlogic`, all on by default; beneath them the plugin's own `bridgeUrls`, `allowWrites`, `allowDestructive`, `allowInvoke`, `allowPreviewInput` and `ocr` settings |

Two of those switches decide what kind of session you can have. With `allowWrites` off the tools still
read the model and plan a change, but nothing is written; with the bridge off (no Studio, no
`StartBridge`) there is no live model at all, and `optix_status` says so in one line instead of hiding it
behind a tool error.

The component is beta for a stated reason: `optix_screen`, `optix_ui`, `optix_nav` and `optix_model`
are recent additions, and no capture of the Studio bridge exists on every host — the bridge answering is
the only proof the live channel works on the machine in front of you.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| FactoryTalk Optix Studio | 1.8.1 | the Studio bridge: reads, authoring, build and preview | no |
| .NET 8 SDK | 8.0 | `optix_build` compile checks outside Studio | yes |
| Tesseract | any host install | `optix_ocr` reading text off the preview canvas | yes |
| A browser | Chrome or Edge | reading the served preview; the plugin starts one by default | yes |
| Windows | — | the bridge, the save keystroke and the emulator | no |

The component's recorded verification is: *Studio 1.8.1.27 with the system .NET 8 SDK on a live
project, and Studio 1.7.4.32 for the emulator*. The .NET SDK is genuinely optional — `optix_build`'s
offline check refuses with `dotnet_sdk_missing` rather than pretending the code compiles, and Studio's
own build still works without it.

Studio's bundled `dotnet` is a **runtime** (`Bindings\Net\5.0.1.46\Win32_x64\dotnet`), not an SDK, so
it cannot satisfy a compile check. Install the SDK, or let Studio build and read the artefact with
`optix_build action status`.

`optix_emulator` starts the runtime executable directly, because the documented Studio CLI has an
`export` verb and no run verb. The path shape it discovers:

```text
%PROGRAMFILES%\Rockwell Automation\FactoryTalk Optix\Studio <version>\FTOptixRuntime\<version>\Win32_x64\FTOptixRuntime.exe
```

Tesseract is only worth installing when a value on the canvas has no DOM text to read. `optix_ocr_setup`
reports what is on the host, and installs it through `winget` on request; ask before running that,
because it downloads software.

## The bridge

The bridge is a C# NetLogic class, `StudioMCPBridge`, loaded inside Studio. It opens a loopback HTTP
surface that the plugin talks to; the bundle does **not** run upstream's MCP server, its Python service,
its `setup.ps1`, its venv or its scheduled tasks. What the bundle needs is Node, which it already has —
that is the whole reason the bridge is vendored as a pinned C# file rather than installed as a service.

| Step | Who does it | How |
| --- | --- | --- |
| Put the bridge source in the project | the tools | `optix_bridge_arm` writes the shipped `StudioMCPBridge.cs` into `ProjectFiles/NetSolution` and copies whatever the project held to `ProjectFiles/.dsh-backups` |
| Compile it | Studio | the NetSolution project is SDK-style, so a `.cs` beside it compiles on the next build |
| Declare the NetLogic node | the tool, when absent | `optix_bridge_arm` adds `StudioMCPBridge` to `Nodes/NetLogic/NetLogic.yaml` and registers that chapter in the `.optix` file when it is missing |
| Start it | **the engineer** | right-click the `StudioMCPBridge` node → **StartBridge** |
| Answer the security warning | the engineer | the first `StartBridge` raises Studio's NetLogic warning (the bridge references `System.Net.Sockets`, `System.IO` and friends); it binds only after **Proceed**. Ticking *Do not show this warning again* stops it recurring |

`optix_bridge_arm` with `confirm: false` is a plan: it reports the NetSolution project, whether a bridge
file is already there, its version, and whether the node exists. With `confirm: true` every write is
copied under `ProjectFiles/.dsh-backups/arm-<stamp>` with a `manifest.json`, the report lists
`changed_files`, and `restore: true` puts every file back and removes the files the run created. It
refuses while a running bridge already answers for the same project name, and it asks you to close the
project in Studio first, because the write must not race Studio's own save.

Two things no tool can do, and no amount of retrying changes it: **compile the class** and **run
StartBridge**. Both happen inside Studio's own UI. A bridge that answers is proof it compiled; nothing
else is.

## Three states, and why they get confused

| State | Who sees it | How it gets there |
| --- | --- | --- |
| Live model | `optix_read`, and every `optix_edit` changes it | the bridge, inside Studio |
| Saved project | the runtime | `optix_save`, or the engineer's Ctrl+S |
| Rendered screen | `optix_preview`, `optix_screenshot` | a runtime serving the Web presentation engine's URL |

The runtime loads the **saved** project, so a change made through the bridge appears in the emulator
only after the project is saved, and a C# change additionally needs a build. `optix_status` counts the
authoring calls made since the last save and reports `needs_save`;
`optix_emulator { action: "status" }` reports `disk` (the newest write under `Nodes/`) and
`saved_after_edit`, which stays `false` while every file on disk is older than the first pending bridge
change.

A save is not a build: measured 2026-11-18, a save that moved 29 sources under
`ProjectFiles/NetSolution` left `bin/<Project>.dll` at its older timestamp. A screenshot is of the saved
build, so it can be one save behind the live model.

## First session

Every request that ends in a working screen walks the same seven phases. Two of them belong to the
engineer, because Optix keeps compiling and saving inside Studio.

| Phase | The tools | You |
| --- | --- | --- |
| 0 Brief | `engineering_reference` (standards), then `optix_template {}` for the starters and their questions | answer the five questions |
| 1 Scaffold | `optix_template` with `template`, `destination`, `name`, `width`, `height` | — |
| 2 Open and arm | nothing; the files are on disk | open the `.optix`, build, right-click StartBridge |
| 3 Connect | `optix_status`, then `optix_read` | — |
| 4 Author | `optix_edit`, `optix_ui`, `optix_screen`, `optix_nav`, `optix_model`, `optix_script`, then the static checks | — |
| 5 Persist | `optix_save`, then verify the save on disk | save; build only when C# changed |
| 6 Look | `optix_emulator`, `optix_preview`, `optix_screenshot`, `optix_render_check` | — |
| 7 Release | `optix_production_check` | deploy from Studio's Deploy dialog |

A first session, in the order that survives the runtime:

```text
optix_status                     # the bridge, the project, the switches, the preview chain
optix_read { action: "map" }     # what the project holds, overview depth
optix_read { action: "node", path: "UI/MainWindow" }
optix_screen { ... dry_run: true }               # draft and validate against the live model
optix_screen { ... dry_run: false }              # draw it, and mount it in the start window
optix_design_check { screen }                    # geometry, contrast, targets, navigation
optix_save                                       # one Ctrl+S, proven on disk
optix_emulator { action: "start" }               # only once the save is proven
optix_screenshot                                 # the saved build, as the Web engine draws it
optix_production_check                           # the release gate
```

If the `optix_*` tools are not in the tool list at all, the row is switched off in this profile — say
that in one line and stop. Never rebuild the surface by importing the plugin's `lib/` from Node, and
never drive Studio to fake it.

## The tool groups at a glance

| Group | Tools | What they are for |
| --- | --- | --- |
| Session | `optix_status`, `optix_bridge_arm` | is the bridge up, which project, what is missing; put the bridge into a project that has none |
| Read and research | `optix_read`, `optix_schema`, `optix_docs` | the live model, this Studio build's object catalog, and the documentation installed beside Studio |
| Author the model | `optix_edit`, `optix_action`, `optix_model`, `optix_validate_expression`, `optix_invoke` | typed batches, single actions, the OPC UA model, expressions, and calling a method on a live node |
| Screens | `optix_screen`, `optix_ui`, `optix_nav`, `optix_library`, `optix_design_check`, `optix_render_check` | draft a screen, theme and shell it, prove the bar, import a vendor widget, judge model and render |
| Artwork | `optix_svg` | conformance, placement and binding of `AdvancedSVGImage` |
| NetLogic | `optix_script`, `optix_netlogic` | write, edit, review, build and run C#; read the pinned cheat-sheet snapshot |
| Files and build | `optix_project`, `optix_build` | the file channel when Studio must stay closed; references, solution, compile check, artefact state |
| Preview | `optix_emulator`, `optix_preview`, `optix_screenshot`, `optix_ocr`, `optix_ocr_setup` | run, read, capture and OCR the emulator |
| Persist and release | `optix_save`, `optix_production_check` | prove the save on disk; the release gate |
| Starters and playbooks | `optix_template`, `optix_list_skills`, `optix_get_skill`, `optix_logs` | the three packaged starters, the topic playbooks, and both logs |

Tools answer with JSON, and most answers end with a `next` line naming the step that follows. Where an
answer carries `coverage`, read it before claiming completeness: it names what the call cannot establish
— rendering, runtime behaviour, the installed Optix version, anything outside the loaded project.

## Limits

- **Nothing in this bundle creates an empty `.optix`.** A house template is a standard document applied
  to a `optix_template` starter copy, or a project the engineer creates in Studio and these tools fill.
- **Nothing saves the project but a keystroke.** Studio exposes no save API to a NetLogic bridge:
  `UAManagedCore` carries no `Save`, `IsDirty` or `Persist` symbol at all. `optix_save` sends exactly
  one Ctrl+S and reports success only when a watched file moved.
- **Nothing builds inside Studio.** `optix_build` proves the C# compiles, outside Studio, in a scratch
  copy; the artefact the runtime loads is written by Studio's own build or by `optix_build action build`.
- **The preview renders the saved project**, never the live model, so an unsaved change is invisible to
  `optix_screenshot` and to `optix_render_check`.
- **A fresh starter screenshots as one flat colour.** The templates ship a window with no screen inside
  it; that picture means the runtime, the web engine and the browser all work and nothing has been drawn
  yet. It is not a broken preview, and it is not evidence that a screen exists.
- **A button inside a panel does not navigate.** The runtime instantiates the UI per session, so a
  handler inside a panel resolves to a different object and the click answers `No behaviour or observer
  found that handles the method 'ChangePanel'`. Navigation lives in the window, beside the loader, with a
  relative pointer.
- **The Studio Help is incomplete where it matters**: `ChangePanel` is documented nowhere in it.
  Navigation is proved by `optix_nav verify` against a running runtime, not by a page.
- **The bridge has no save route and no build route**, and no design-time NetLogic can reach either.
- **Demo mode is a notice, not a fault.** On a machine with no Optix entitlement the runtime log says
  `Standard entitlement not found` and closes itself after 120 minutes while the preview works; the
  emulator tools return `notice.kind: "demo_mode"`.
- **No capture of the Studio bridge exists on this host**, which is why the component's stability is
  beta and why `optix_status` is the first call of every session.

## Safety

These tools write into a live IDE model, sometimes into a running machine's HMI project. The rules that
keep that safe are the tools' own:

- **Every write is validated before it is sent**, and the gate is `optix_read`: an authoring call is
  accepted only when the live model reads the change back. A batch that does not validate writes nothing.
- **`dry_run` is the default posture**: `optix_edit` and `optix_screen` default to `dry_run: true`,
  `optix_ui` defaults to `mode: "plan"` and `optix_model` to `action: "plan"`; `optix_svg inspect` and
  `optix_project action check` write nothing at all.
- **The write switches are explicit.** `allowWrites` gates authoring, `allowDestructive` gates a delete
  or a conversion, `allowInvoke` gates invoking a method and starting or stopping the runtime. A missing
  tool means that switch is off in this profile.
- **The project file channel refuses a live Studio session** (`project_open_in_studio`), refuses while
  the bridge holds unflushed changes (`bridge_state_unflushed`), and refuses a second concurrent writer
  (`write_in_progress`). `force` clears a stale file hash and nothing else.
- **A file apply is all or nothing**: the previous bytes are copied to
  `ProjectFiles/.dsh-backups/<backupId>/` first, and a failure restores every file already written.
- **Destructive commands get a dialog.** `optix_ui { action: "dialog" }` writes a confirm dialog, and the
  design review's `VIEW-DLG-01` rule reports a destructive command that has no dialog in front of it — as
  unproven, because only a click after Save and Build settles it.
- **The only desktop action is the save.** `optix_save` raises the already-open Studio window, confirms
  Studio own the foreground, sends one Ctrl+S and nothing else — no clicks, no menus, no launching
  Studio. When another window holds the foreground it answers `foreground_refused` and the engineer's own
  Ctrl+S is the route.
- **No process handling, ever**: `optix_emulator` is the only way the runtime is started or stopped, and
  it is the only thing that knows which runtime belongs to which project.
- **Never hand-edit the project files.** `optix_project` is the only writer of `Nodes/**` and the `.optix`
  file, and it keeps a backup of every apply.

## Next steps

| Page | What it covers |
| --- | --- |
| [NetLogic](./netlogic.md) | the lifecycle contract, the six templates, pointers, build and run, the `OPTIX-NL-*` rules, the cheat-sheet reader, and the installed-Help reader |
| [Screens](./screens.md) | design languages, the grid and its breakpoints, the `optix_ui` kit, the six patterns, `optix_screen`, `optix_nav`, and both screen judges |
| [Project](./project.md) | `optix_status`, `optix_read`, `optix_edit` batches, `optix_schema`, the OPC UA model, the file channel, saving, building, the emulator and the logs |
| [Artwork](./artwork.md) | `AdvancedSVGImage`, the three conformance conditions, `optix_svg`, and the rules that make a drawing animate |
| [Production](./production.md) | `optix_production_check` and `OPTIX-PROD-01..05`, the design rubric, the template library and vendor components, and the verification recipe |

How the component sits inside the bundle: [Architecture](../../architecture.md) ·
[Tool reference](../../reference/tools.md) · [Component manifest](../../reference/components.md).
