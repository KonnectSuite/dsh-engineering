# NetLogic C#

A FactoryTalk Optix NetLogic is two writes that have to agree: a **node** whose BrowseName equals the C#
class name, and a **`.cs` file** under `ProjectFiles\NetSolution`, which the project's SDK-style
`.csproj` globs on the next build. `optix_script` owns both sides, reviews the source against the
`OPTIX-NL-*` practice rules, compiles it with `dotnet build`, and reports what Studio would report.
`optix_netlogic` serves the pinned Rockwell cheat-sheet snapshot so the code is written from a measured
idiom instead of from memory, and `optix_docs` serves the documentation installed beside Studio when
what you need is an API name or a menu path.

This page covers the lifecycle contract the rules encode, the six templates, pointers, the build and run
loop, what each rule prevents, and the two readers you consult before writing a line.

## Two writes, and the name that binds them

Only one node type exists, `FTOptix.NetLogic`. Studio's project does not store a reference to the class
file: the binding is by **name**, so the node's BrowseName and the C# class name have to match, and a
mismatched pair silently does nothing. That is why `add` and `edit` refuse a class whose name differs
from the node it would bind to (`OPTIX-NL-10`).

| Half | Where it lives | Who writes it |
| --- | --- | --- |
| the node | the project tree, commonly under `UI/NetLogic` | the bridge (`POST /bridge/model/netlogic`), driven by `optix_script` |
| the class | `ProjectFiles\NetSolution\<Name>.cs` | `optix_script`, on disk |

The bridge can create the node. It has no route that writes files and no route that builds, which is why
`optix_script` performs the node write through the bridge and the file write on disk, then compiles with
`dotnet build`.

Every class the tool writes starts with a marker comment:

```csharp
// aria-netlogic: kind=runtime name=LineStats created=2026-11-16T14:02:11Z
```

`delete` refuses a file without that marker unless `force: true`, because the NetSolution also holds the
logic of imported template-library composites (`AlarmBannerLogic`, `AlarmGridLogic`, …) and those belong
to their composite. A node under `UI/Components/` is refused outright: delete the composite instead.

Where runtime code goes matters. A runtime NetLogic belongs under `UI/NetLogic` or beside the screen it
serves — never in the root `NetLogic` folder, which holds the bridge. An engineer looking for "the
script" under `NetLogic` finds only the bridge.

## Design-time and runtime are behaviour, not node kinds

| | Runtime NetLogic | Design-time NetLogic |
| --- | --- | --- |
| How it runs | Studio fires `Start()`/`Stop()` when the node's parent is loaded in the runtime | Studio never fires `Start()`; the engineer's right-click **Execute**, or `optix_script action "run"`, calls one `[ExportMethod]` |
| Typical use | machine behaviour, periodic tasks, tag maths, panel switching | authoring helpers, generators, one-shot fixes, fixtures |
| Template | `blank` (Start/Stop), `periodic` (cached handles, `PeriodicTask`, try/catch, dispose) or `observer` (subscribe in `Start`, unsubscribe in `Stop`) | `blank` (`[ExportMethod] Ping()`) or `fixture` |
| Verification | emulator plus a rendered screen that shows the value move | `action: "run"` with a method name |

A class must derive `BaseNetLogic` — or derive it and export a method for design-time work — and its
name must equal the node BrowseName.

## The lifecycle contract

The failures that reach an operator are silent: a timer that stopped at the first exception, an observer
that outlived its page, a model lookup per tick, a class bound to no node. `optix_script review` reads
the source and answers `clean`, `review` or `block`:

| Rule | Severity | What it catches | What it prevents |
| --- | --- | --- | --- |
| `OPTIX-NL-03` | critical | `PeriodicTask` created without a `Dispose()` in `Stop()` | a timer that keeps firing after the page is gone |
| `OPTIX-NL-04` | warning | a periodic tick without `try/catch` | one exception ending the timer for the whole session while the screen keeps its last value |
| `OPTIX-NL-05` | warning | `Project.Current` read from inside the tick instead of `Start()` | a model walk on the timer thread, every tick |
| `OPTIX-NL-06` | critical | a blocking call: `Thread.Sleep`, `.Wait()`, `.Result`, `GetAwaiter().GetResult()`, `async void` | a frozen runtime thread |
| `OPTIX-NL-07` | warning | an empty `catch` block | a failure swallowed with no evidence |
| `OPTIX-NL-08` | warning | event `+=` without a matching `-=` in `Stop()` | a handler firing after its page is unloaded |
| `OPTIX-NL-09` | warning | a design-time class starting background work Studio never runs | work designed to happen that never happens |
| `OPTIX-NL-10` | critical | the class name differs from the NetLogic node name | a class that compiles and never runs |
| `OPTIX-NL-11` | info | the class logs nothing | runtime output that cannot explain itself |
| `OPTIX-NL-12` | info | a node path hard-coded as a string literal | code that breaks on a rename |
| `OPTIX-NL-13` | warning | `SetImageContent` called where it cannot work yet — in an `[ExportMethod]`, or in `Start()` before the drawing is loaded | a swap that does nothing, or throws before the image exists |
| `OPTIX-NL-14` | warning | a pointer value cast to `NodeId` with no null or `NodeId.Empty` check | a cast that throws, or an unset pointer that makes `Start()` succeed and the class do nothing |
| `OPTIX-NL-15` | warning | a fixture that writes a variable and never puts the original back | a value the operator now sees, left behind by a test |

`add` and `edit` run the same review and **refuse code rated `block`** unless `force: true`, so a class
that breaks the documented lifecycle does not reach the project. `lint: false` skips the review, and
`force: true` writes code the review blocks — fix it instead. The rules, with the reasoning and the
cheat-sheet page each comes from, are in the `engineering_reference` page `optix-netlogic-practices`.

Three of them are worth stating in plain words because they are the ones that look like success:

- A tick that throws **stops ticking for the session** while the screen keeps the last value it wrote.
  The screen looks right and frozen; only the log says why.
- A node resolved **inside** the tick walks the model on the timer thread. Cache the handle in `Start()`.
- An observer that is not unsubscribed keeps firing after the page that owned it is gone.

The static review does not replace the runtime check. A value changing on a bound screen is the only
proof the class is loaded and running.

## Templates

`optix_script { action: "add", name, kind, template, parent }` writes one of six templates, each the
measured Rockwell idiom reduced to the smallest class that still shows it. `kind` is `runtime` or
`design`; a template that does not fit the kind is refused rather than guessed.

| Template | Kind | Shape | Source of the idiom |
| --- | --- | --- | --- |
| `blank` | runtime or design | `Start()`/`Stop()` for runtime; `[ExportMethod] Ping()` for design | the smallest compiling class |
| `periodic` | runtime | node handles cached in `Start`, a `PeriodicTask`, `try/catch` in the tick, `Log.Error`, `Dispose()` in `Stop` | the safe shape the review expects |
| `observer` | runtime | subscribes in `Start`, unsubscribes in `Stop` | the `VariableChange` pattern |
| `nav` | runtime | a class bound **inside** a `PanelLoader`: caches `Owner as PanelLoader` in `Start()`, exports `Open(string screenPath)` which resolves `Project.Current.Get<ScreenType>(screenPath)` and calls `loader.ChangePanel(screen)` | `Optix_Sample_PanelLoaderChangePanelNetLogic`, `Optix_Template_NavigationButtons` |
| `login` | runtime | exports `PerformLogin(string username, string password, out bool loginResult)`; reads the `Users` alias, calls `user.PasswordVariable.RemoteRead()` then `Session.ChangeUser(username, password)` | `Optix_Template_NavigationButtons` `LoginButtonLogic.cs` |
| `fixture` | design | exports `RunFixture()`: resolves its `Target` pointer, writes the target's value, puts the original back, and returns the result as a JSON string | the way to prove a pointer and a datatype without starting the runtime |

`nav` and `login` are runtime only — a design-time class is a set of `[ExportMethod]` helpers and does
not own background work — and both pass `optix_script review` with zero critical findings. Neither
contains an absolute `/Objects/` path: the loader comes from `Owner`, the users from an alias, so a
rename does not break them.

A `fixture` is the cheapest probe for a wiring question: it exercises the pointer on a live project in
one right-click, with no emulator and no screen.

## Pointers

A class that hard-codes a node path breaks on the first rename. `optix_script` takes a `pointers` array
and creates `NodeId`-typed pointer variables on the NetLogic node, pointed at project nodes, so the class
holds no path in its source:

```json
{
  "action": "add",
  "name": "LineStats",
  "kind": "runtime",
  "template": "periodic",
  "parent": "UI/NetLogic",
  "pointers": [
    { "name": "Target", "target": "Model/Smt/LineSpeed" },
    { "name": "HistoryStore", "target": "DataStores/HistoryStore" }
  ]
}
```

The class reads the pointer with `LogicObject.GetVariable("Target")`. `target` is a project-relative node
path, not an absolute `/Objects/...` path and not a node id.

The datatype has to be `NodeId`. A pointer created as `NodePointer` keeps `DataType` `BaseDataType` and
stores the path as a `String`, and the runtime then kills the node at boot with an
`InvalidCastException` in `Start()`. A pointer that fails is reported in the result rather than silently
skipped. The `fixture` template exists to prove exactly this kind of wiring before anything depends on
it.

## Actions

| Action | Writes | What it answers |
| --- | --- | --- |
| `list` | nothing | every `.cs` class, its kind, whether it has `Start`/`Stop`, its exported methods, its sha256, the live node path it pairs with, and `nodes_without_file` for nodes whose class is gone |
| `read` | nothing | the class source plus that same metadata |
| `review` | nothing | the practice review (`clean`/`review`/`block`) with findings, and optionally the build diagnostics |
| `add` | node + `.cs` | the created node result, the practice review, and the build diagnostics |
| `edit` | `.cs` | the new sha256, the practice review and the build diagnostics; refuses a stale `expect_sha256` |
| `delete` | node + `.cs` | what was deleted; deleting the node also removes its class file |
| `build` | nothing | `ok`, `errors`, `warnings`, `locked`, `staleObject` from `dotnet build` |
| `run` | nothing | the bridge's `node/invoke` result, or `status: "not-loaded"` with the reason |

`edit` replaces the whole file and is guarded by the sha256 you read, so a concurrent change is refused
instead of overwritten. `add` and `edit` build by default (`build: false` skips the compile) because a
class that does not compile is not a class.

## Where the project is

The bridge cannot report the project folder: `Project.GetProjectPath()` probes members Studio 1.8.1 does
not expose and then falls back to the process working directory, which is the Studio install folder. So
`optix_script` resolves it in this order:

1. `project_root` when you pass one;
2. otherwise a search of `~/Documents/Rockwell Automation/FactoryTalk Optix/Projects`, `~/Desktop` and
   `~/AryaCode/KonnectSuite` (depth 4, `AppData` and `node_modules` skipped) for a folder containing
   exactly one `.optix`;
3. otherwise it refuses with the candidate list rather than guessing.

Pass `project_root` when the project lives anywhere else.

## From a file to a class the runtime is running

Four states, and the tools can only prove the first two:

| State | What proves it | What it does not prove |
| --- | --- | --- |
| the class exists | `add`/`list` report the file at `ProjectFiles\NetSolution\<Name>.cs` | the C# compiles |
| the C# compiles | `compile.ok: true` from `dotnet build` | Studio loaded it |
| Studio loaded it | an engineer's build in Studio with the runtime stopped; `run` stops answering `not-loaded` | that it does anything useful |
| the runtime is running it | a bound value on a screen changes, seen in `optix_screenshot` | correct behaviour beyond that value |

The measured loop, in this order, because each step depends on the previous one:

1. `optix_script { action: "add", name, parent: "UI/NetLogic", kind: "runtime" }` — node and class,
   reviewed and compiled.
2. Stop the runtime if it is up (`optix_emulator { action: "stop" }`), then save with `optix_save` and
   build the solution. Studio 1.8.1.27 documents no build keystroke: `optix_build action build` with the
   runtime stopped, or the solution opened from Studio's main toolbar (**Open .NET Solution**) built
   there. The build is what loads the class into Studio's NetLogic assembly. With the emulator running
   the build fails on `MSB3061` (the DLL is locked).
3. `optix_status { saved: true }` clears the pending count once the save is confirmed on disk, then
   `optix_emulator { action: "start" }` and `optix_screenshot`.
4. Prove it: a bound value on the screen changes because the class wrote it. `action: "run"` answers
   `not-loaded` until step 2 happened, which is a fact about Studio, not about your C#.
5. If step 3 shows no change, `optix_emulator { action: "logs" }` before anything else: the runtime says
   why it stopped in its own words, and `restart` is the retry once the build is in.

A **loaded** class only picks up new code after Studio restarts; a newly added bridge route answers
`404 unknown route` until it does. And bridge-side writes are persisted by the Studio build, not by
Ctrl+S alone.

Two runtime facts that cost a whole demo to learn:

- A `PanelLoader`'s `Panel` pointer can carry a `DynamicLink`, and the runtime resolves the link
  **before** the pointer value. Clear the link's value (empty string) before pointing `Panel` at another
  screen, then build as above.
- Code that switches panels must name the loader and the screen explicitly:
  `loader.ChangePanel(screen.NodeId, NodeId.Empty)`, with both nodes resolved by name. An absolute
  design-time path resolves to nothing at runtime, because a panel is instantiated inside the loader.

## `optix_build`: references, compile checks and the solution

Studio compiles the project's C# itself when the engineer builds, and it writes
`ProjectFiles/NetSolution/bin/<Project>.dll` — the copy the runtime loads. `optix_build` answers the two
questions the bridge cannot: *will this compile* and *did the last build carry my change*. Measured on
Studio 1.8.1.27 with the system SDK 8.0.424, `ProjectFiles/NetSolution` builds with the system `dotnet`
once a `<Project>.references` file names the Optix assemblies by absolute path.

| Action | What it does |
| --- | --- |
| `status` | reads the artefact without running anything: `never_built` (no `bin/<Project>.dll`), `stale` (the DLL is older than the newest `.cs`, so the runtime is serving earlier code), or `built`; plus the newest source, the artefact's size and time, and how many references no longer resolve |
| `check` | copies `ProjectFiles/NetSolution` to a fresh `%TEMP%\dsh-optix-build-*` folder, skipping `bin/`, `obj/`, `.vs/` and `node_modules/`, and runs `dotnet build <sln|csproj> -v m --nologo` there. The project folder never gains `bin/`, `obj/` or a generated file |
| `references` | rewrites `<Project>.references` from the installed Studio: the newest version of every module's `<Module>/<version>/Any/*.dll` plus `UAManagedCore.dll` and `UAManagedCoreCommon.dll` from the newest Windows binding — 41 module assemblies and 2 binding assemblies on 1.8.1.27, the 43 references a Studio-generated file carries |
| `init` | scaffolds `<Project>.csproj` (`net8.0`, `AppendTargetFrameworkToOutputPath false`, `CopyLocalLockFileAssemblies true`, `OutputPath bin\`, an `<Import Project="<Project>.references"/>`), `<Project>.sln` and `<Project>.references` for a project created outside Studio; existing `.cs` files are never touched |
| `build` | runs the same `dotnet build` in place, writing `bin/<Project>.dll`, then reports `build_state` so the answer says whether the artefact Studio will load carries the current sources |

`check` returns the compiler's verdict, not the plugin's: `ok`, `exit_code`, `errors`, `warnings`, the
last twelve lines as `tail`, plus `locked` (`MSB3026`/`MSB3027`, a file another process holds) and
`stale_object` (`CS2001`/`MSB3491`, a missing intermediate file). A missing SDK is
`code: "dotnet_sdk_missing"`, not a false "compiles". A clean `check` proves the C# compiles. It does not
mean Studio built it: the runtime loads what Studio's build wrote, and only `action build` or Studio's own
build writes that.

Order of operations:

1. `optix_build action status` — does a build exist, and is it current?
2. `action references` — only when the project has no references file, or one whose hint paths no longer
   resolve. An existing file whose every path resolves is left alone (`action: unchanged`); a file with a
   missing assembly — what a Studio upgrade leaves behind — is `rewritten_after_upgrade`.
3. `action init` — only when the project has no csproj or sln at all.
4. `action check` — after editing C#, before opening Studio. It never writes the project.
5. Save with `optix_save`, then build: `action build` with the emulator stopped, or Studio's own build.
6. `action status` — prove the artefact is newer than the source, then start the emulator.

The check is the cheap gate; Studio's build is the one the runtime trusts; `status` is what says the two
agree.

## The pinned cheat-sheet: `optix_netlogic`

The bundle ships a pinned snapshot of Rockwell's
[NetLogic cheat sheet](https://github.com/FactoryTalk-Optix/NetLogic_CheatSheet) — 51 pages, about
700 KB of C#, committed and never fetched at runtime. The repository states plainly that its snippets may
use non-public APIs, may break a project, and must not be used in production as-is; every page result
carries that disclaimer, its `risk` flag, and the upstream commit it came from.

| Call | What it returns |
| --- | --- |
| `optix_netlogic {}` | the table of contents — slug, title, section, risk, topics, one line each (under about 1.5k tokens) |
| `optix_netlogic { query: "sessions" }` | ranked hits over title, topics and symbols (exact symbol match first, then prefix, then body text), with a one-line reason each — not whole pages |
| `optix_netlogic { slug: "netlogic-lifecycle" }` | that page verbatim with its risk, source path, upstream commit and the disclaimer |

The tool will not return more than one page per call, so a request cannot quietly add 200k of C# to the
conversation; one page is typically 2–6k tokens. `risk` is `normal` (the repository presents it as
guidance), `advanced` (the page itself warns about low-level or non-public behaviour) or `unsupported`
(listed in the repository's Advanced section, which says those features are not officially supported and
may change). Quote the risk with the snippet, adapt it to the loaded project, and treat compilation and
runtime behaviour as unverified until Studio compiles it.

Two of the snapshot's pages are the bundle's own routing layer, not upstream's:

- `optix_netlogic { slug: "index-by-task" }` maps a task to the page that answers it and indexes all 51
  pages with a line each. Start here when the request names a behaviour rather than an API.
- `optix_netlogic { slug: "api-namespaces" }` lists the namespaces and members that matter —
  `FTOptix.HMIProject`, `UAManagedCore`, `OpcUa`, `FTOptix.NetLogic`, `FTOptix.UI`, `FTOptix.Core`,
  `FTOptix.Alarm`, `FTOptix.Recipe` — with `Project.Current.Get<T>`, `Owner.Get<T>`,
  `LogicObject.GetVariable/GetAlias/SetAlias`, `InformationModel.MakeVariable<T>` and the
  `VariableChange` pattern, so a `using` line and a type are right before the code is written.

Ten behaviours and the page that answers each — one call, not a search:

| The request | The page |
| --- | --- |
| an alarm, an alarm banner, ack or shelve | `alarming.md` |
| a trend, a history read, a sparkline's data | `trends.md` |
| read or write a PLC tag | `plc-tags.md` |
| log a user in, a session, an idle timeout | `users-groups.md` and `sessions.md` |
| load, save or validate a recipe | `recipes.md` |
| open a popup, a confirmation dialog | `dialog-boxes.md` |
| fill or refresh a grid or a list | `datagrids.md` |
| animate a colour or an opacity | `ui-animations.md` and `advanced-svg.md` |
| walk the model, query nodes | `queries.md` |
| a timer or a background job | `async-tasks.md` and `threading.md` |

## Look it up before you write

Two readers answer "what is this API" and "what does this build actually carry", with no guesswork.

**The documentation installed beside Studio.** `optix_docs` indexes it: 2,591 HTML pages on 1.8.1.27,
266 MB generated by DITA under `<Studio>\Help\en`, shipped as one 1,354 KiB JSON with the Studio version
it was built from (`studioVersion: "1.8.1.27"`). It reads the full page from the install when asked, so
what makes it cheap is the index, not a copy of the pages.

```text
optix_docs { action: "search", query: "Session" }   # ranked pages, a snippet each
optix_docs { action: "read", id: "<page id>" }      # one page as text, straight from the install
optix_docs { action: "status" }                     # page count, Studio version, staleness
```

`search` tokenises the query, requires at least one token in the title, headings, id or snippet, and
ranks: an exact title phrase is worth 100, a title token 25, an id token 6, a heading 8, a snippet 2,
plus 20 when every token matched. The page named after the thing asked about wins, which is almost always
the right page. `read` returns headings, paragraphs and list items with the site chrome cut away (the
extractor starts at `#wh_topic_body`), so "Jump to main content" and the footer never become
documentation. `status` compares the indexed Studio version with the installed `IDEVersion.txt` and says
when an upgrade made the index stale — a search that quietly describes the previous release is worse than
one that admits it. `node scripts/gen-optix-help.mjs` rebuilds it; `--check` fails when stale.

The gaps are worth knowing because they are measured:

- **`ChangePanel` is not in the installed help at all.** A search for it returns zero pages on 1.8.1.27,
  even though it is the method every panel switch calls. That is why navigation has its own tool
  (`optix_nav`), its own corpus page and its own proof.
- The help names UA data types where the runtime reports CLR types; `optix_schema` records that split as
  `datatype_drift` instead of hiding it.
- Template-library types (`NavButton`, `AlarmManagerButtonIcon`, …) are documented by the library that
  ships them, not by the Help folder, so "type not found" is not a claim that the type does not exist.

The help is evidence for **Rockwell's documented behaviour**: an API name, a member list, a menu path, a
property's stated meaning. It is not evidence about the project in front of you — the model, the bound
tags and the current values come from `optix_read`, `optix_schema` and the bridge.

**The object model of this Studio build.** `optix_schema` answers from a catalog generated out of the
installed Help — 565 object types, 102 variable types and 110 enums for Studio 1.8.1.27, shipped with the
plugin, so it answers with no bridge and no Studio session. `{ action: "type", name }` gives the super
type, every property with its datatype and whether it is inherited, the methods with their arguments, the
events and the types it may contain; `enum` lists an enum's values with their numbers; `children` names
what may be created inside a type; `find` searches types, enums and properties and folds a property
dozens of types share into one row with an owner count. `action: "refresh"` diffs the shipped catalog
against the running bridge's own dump and reports `added`, `changed` and `datatype_drift` separately —
on 1.8.1.27 the measured numbers are 2 added, 94 changed and 748 drifted, and the drift is the Help naming
the UA datatype where the runtime reports the CLR one (`Width` is `Size` in the reference and `Single` at
runtime).

For a NetLogic, `type` also answers the CLR type to name in C# (`clrType`), which is the difference
between a `using FTOptix.UI;` that compiles and one that does not. `dotnet build` remains the authority.

## Vendor components and their logic

Imported template-library composites ship their own C# classes — `AlarmBannerLogic`, `AlarmGridLogic`
and so on — and those classes are **not** NetLogic nodes this bundle created: they arrive with the
composite, live in `ProjectFiles/NetSolution`, and have to be in the assembly the runtime loads. Two
consequences for NetLogic work:

- An import copies the `.cs` file, but the runtime loads `bin/<Project>.dll`. Until the solution is
  rebuilt, a session that opens the composite's panel logs
  `User-defined logic type 'AlarmGridLogic' is missing in the .NET assembly`, and the composite does
  nothing.
- `optix_script delete` refuses a class it did not write — no `// aria-netlogic:` marker — unless
  `force: true`, and refuses a node under `UI/Components/` outright. The class belongs to the composite,
  so delete the composite instead.

The vendor widgets themselves (alarm banner, alarm grid, trend, recipe editor, login form, gauge) are
placed through the adapters table and `optix_library`; see [Production](./production.md) for the
catalogue, the import gate and the release checks that use them.

## What it will not do

- **Build inside Studio.** There is no bridge route for it. `dotnet build` proves the C# compiles; Studio
  still has its own copy loaded until an engineer builds there, or `optix_build action build` writes the
  artefact.
- **Edit a running project's assembly.** While the emulator runs it holds `bin\<project>.dll` open, so the
  copy step fails with `MSB3026`/`MSB3027`. The build result carries `locked: true`; stop the emulator,
  build, start it again.
- **Invent a class name.** The node and the class are refused when they disagree, because Optix binds by
  BrowseName and a mismatched pair silently does nothing.
- **Recover a stale object tree silently.** A build killed mid-flight leaves `obj\` inconsistent and
  MSBuild then reports `CS2001`/`MSB3030` against its own generated files. The tool retries once with
  `-t:Rebuild` and reports `recovered`.
- **Unstick a foreground refusal.** When another window owns the foreground, a save does not happen; the
  engineer's own Ctrl+S does, and `saved_after_edit` proves it on disk.
