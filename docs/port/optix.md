# FactoryTalk Optix port

## What the old plugin was

`@aryacode/dsh-tool-ft-optix` was a standalone tool plugin: nine Optix tools, the in-Studio C#
bridge, two starter projects and the NetLogic reader. It is no longer published — the public registry
answers `E404` for that name — and it has no source checkout anywhere: the tree that shipped is the
tree that ran.

## Why this one is vendored, not ported

Optix is the one component in this repository with no source. Commit `a730d54` states it plainly:
*the published tree is what we maintain, and its `lib/` is therefore the thing that has to be in
git*. The `packages/*/lib/` ignore rule is negated for that one tree; every other component keeps a
gitignored `lib/` that `pnpm build` rebuilds from `src/`. So the file an agent edits here is
[`packages/optix/lib/index.js`](../../packages/optix/lib/index.js) itself, and
`pnpm assemble` copies the whole folder to `vendor/optix/`, which is where the bundle's
[`entries/optix.js`](../../entries/optix.js) loads it from. `vendor/` is gitignored: a stale vendor
tree is the usual reason an Optix change appears to do nothing.

## The bridge is upstream code, pinned

[`packages/optix/bridge/source.json`](../../packages/optix/bridge/source.json) pins
`StudioMCPBridge.cs` to a commit of [asqi-carter/ftx-mcp](https://github.com/asqi-carter/ftx-mcp)
(MIT, `localChanges: []`). The bundle mounts the bridge as an Optix library loaded inside Studio and
talks to its loopback HTTP surface directly. It does **not** run upstream's MCP server, its Python
service, its `setup.ps1`, its venv or its scheduled tasks.

That distinction is the whole point of the port. Upstream's setup path installs Pillow into a venv,
Tesseract through `winget`, needs a .NET SDK for `build_check`, a Chrome it can drive, and Node for
`npx mcp-remote`. On an offline plant machine that is five things to explain and a Python footprint
to defend. The bundle needs Node, which it already has.

## The preview chain

Reading the emulator is four links, and the plugin owns only one of them:

| Link | Who sets it | What it looks like when it is missing |
|---|---|---|
| `preview` on the row | the profile's plugin configuration | the preview tools are not registered at all |
| browser | `browser: launch` (default) starts Chrome or Edge; `attach` connects to one you started with `--remote-debugging-port` | `optix_status` names the missing install or the dead CDP port |
| the emulator | the project's **Web presentation engine** node, served on `previewUrl` (default `http://127.0.0.1:8081/`) while the project runs — in Studio, or through `optix_emulator` | `Nothing serves http://127.0.0.1:8081/` |
| OCR | `ocrExecutable` on the row, plus a host Tesseract and its `.traineddata` | `optix_ocr` is not registered; `optix_ocr_setup` says why |

`optix_status` returns the whole chain in `preview_chain` and names the first unmet link in `next`,
so a missing link is reported instead of hiding behind a tool error. `optix_action` with
`ensure_web_engine` creates the Web presentation engine a project lacks — port, protocol,
`MaxNumberOfConnections`, `StartingUser`, `AllowedLocalSources` and `StartWindow` included, because a
fresh engine left at Studio's defaults serves nothing.

## Running the emulator without Studio

The Optix CLI documented in the pinned cheat sheet has an `export` verb and no run verb, so there is
no documented command line for the emulator. There is an executable, and it was read on a machine
with Studio 1.7.4.32 installed:

```text
%PROGRAMFILES%\Rockwell Automation\FactoryTalk Optix\Studio <version>\FTOptixRuntime\<version>\Win32_x64\FTOptixRuntime.exe
FTOptixRuntime [options] [<project_file>]     -c console log · -n no logfile · -l LEVEL · -s SIZE · -r NUM
```

`optix_emulator` discovers that path, starts it against the project's `.optix` file, and reads the
preview URL back: on the machine tested, the runtime serving the shipped IPC starter project made
`http://127.0.0.1:8081/` answer `200` with `<title>FactoryTalkOptix HMI</title>`. `action: stop` ends
only a runtime the tool started; a runtime the engineer opened from Studio is stopped in Studio. This
is the route the field session was missing — it is not Studio driving a run action, and the report
says so.

## What no tool can do

- **Start the bridge.** `StartBridge` is an `[ExportMethod]` on a NetLogic node, right-clicked inside
  Studio. It cannot be reached from outside, because reaching it would need the bridge. Studio's own
  design-time tree exposes those methods only through a right-click, and its toolbar buttons carry no
  UIA names, so the click is not reliably automatable either.
- **Arm a project that has no bridge.** `optix_bridge_arm` writes the shipped
  `StudioMCPBridge.cs` into the project's `ProjectFiles/NetSolution` — the NetSolution project is
  SDK-style, so a `.cs` file beside it compiles — and copies whatever the project already held to
  `ProjectFiles/.dsh-backups`. Then it stops, and says so: Studio compiles, the engineer adds the
  `StudioMCPBridge` NetLogic node if the project has none, and the engineer right-clicks StartBridge.
- **Compile the project.** Compilation happens in Studio. A bridge that answers is proof it compiled;
  nothing else is.

## Locale

`packages/optix/locale/` carries only the row's title and description. Tool output is English, as it
is for every component here.
