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

## Build a screen from what Studio ships

Before composing a screen out of builtin widget types, ask the library. `optix_library { action: "list" }`
reads the catalog the Studio install carries — Widgets, GraphicElements, StyleSheets, Keyboards, Misc,
Scripts, FeaturePreview — with no bridge and no Studio session, and answers each item with the display name
and the usage text the library ships for it. `optix_library { action: "import", library: "Widgets",
item: "AlarmIcon", dest: "UI" }` pulls that item and the types it owns into the loaded project: it needs
`allowWrites`, a bridge that advertises `template_library: true` in `optix_status` (a copied starter needs
`optix_bridge_arm` first), and an import is **not** reversible as a batch, so read the node back with
`optix_read` before any retry. A bare `Rectangle`/`Label`/`Panel` composition is the fallback, not the
first answer.

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
- `optix_template` discovers the packaged Optix IPC and OptixPanel starter projects. Copy the chosen
  project with filesystem tools, never overwrite an existing project, and keep the template's name.

## Starting from a template

`optix_template` returns the manifest, and the manifest carries `questions`. Ask them before copying
anything, because each one is baked into files you would otherwise have to re-edit:

- **Which runtime** — an OptixPanel device or a PC in a browser. It picks the template, and the deploy
  path and the emulator differ; an edit does not convert one into the other.
- **Screen size** — `MainWindow` `Width`/`Height` in `Nodes/UI/UI.yaml` is the box every screen is laid
  out against (1280×800 shipped). Ask the panel's real size; the device reports its own resolution
  read-only, so the project cannot answer.
- **Keep or rename the project** — the shipped name is carried by the `.optix` file, the root
  `Nodes/<name>.yaml`, the `.csproj`/`.sln`/`.code-workspace` and DynamicLinks such as
  `/Objects/<name>@BrowseName`. A rename is a set of coordinated edits, not a folder rename.
- **Where the copy goes** — an empty directory, named, because Studio opens the `.optix` by absolute
  path and the copy must never land on an existing project.
- **What it talks to** — a Logix controller, OPC UA, MQTT, or nothing yet. The templates ship those
  folders empty, so the connection is authored; the answer decides which node comes first and what the
  screens bind to.

Then copy, and state what you did not do: Studio opens the project, compiles NetSolution, and the
engineer runs StartBridge.

A successful model change does not save Studio and does not prove rendering. Say what was applied, what
was only validated, and what a human must check in Studio.

## Reporting

Every result carries `summary`, `data`, `next` and `coverage`. Read `coverage` before claiming
completeness: it names what the call cannot establish — rendering, runtime behaviour, the installed
Optix version, and anything outside the loaded project.
