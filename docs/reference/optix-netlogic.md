# NetLogic authoring: `optix_script`

A FactoryTalk Optix NetLogic is two writes that have to agree:

- a **node** under the project tree whose BrowseName equals the C# class name, and
- a **`.cs` file** in `ProjectFiles\NetSolution`, which the project's SDK-style `.csproj` globs on the next build.

The bridge can create the node (`POST /bridge/model/netlogic`) but it has no route that writes files and no route that builds. `optix_script` performs the node write through the bridge and the file write on disk, then compiles with `dotnet build` and reports what Studio would report.

## Design-time and runtime are behaviour, not node kinds

Only one node type exists (`FTOptix.NetLogic`). What separates the two is what the class does:

| | Runtime NetLogic | Design-time NetLogic |
|---|---|---|
| How it runs | Studio fires `Start()`/`Stop()` when the node's parent is loaded in the runtime | Studio never fires `Start()`; the engineer's right-click Execute, or `optix_script action "run"`, calls one `[ExportMethod]` |
| Typical use | machine behaviour, periodic tasks, tag maths | authoring helpers, generators, one-shot fixes |
| Template | `blank` (Start/Stop), `periodic` (cached handles, `PeriodicTask`, try/catch, dispose) or `observer` (subscribe in `Start`, unsubscribe in `Stop`) | `blank` (`[ExportMethod] Ping()`) |
| Verification | emulator + a rendered screen | `action: "run"` with a method name |

A class must derive `BaseNetLogic` (or `BaseNetLogic` plus an exported method for design-time work) and its name must equal the node BrowseName. Studio's project does not store a reference to the file; the binding is by name.

## Actions

| Action | Writes | What it answers |
|---|---|---|
| `list` | nothing | every `.cs` class, its kind, `Start`/`Stop`, exported methods, sha256, and the live node path it pairs with; `nodes_without_file` for nodes whose class is gone |
| `read` | nothing | the class code plus that same metadata |
| `review` | nothing | the practice review (`clean`/`review`/`block`) with findings, and optionally the build diagnostics |
| `add` | node + `.cs` | the created node result, the practice review, and the build diagnostics |
| `edit` | `.cs` | the new sha256, the practice review and the build diagnostics; refuses a stale `expect_sha256` |
| `delete` | node + `.cs` | what was deleted; the node delete also removes the class file |
| `build` | nothing | `ok`, `errors`, `warnings`, `locked`, `staleObject` from `dotnet build` |
| `run` | nothing | the bridge's `node/invoke` result, or `status: "not-loaded"` with the reason |

## Practice review (`OPTIX-NL-03` … `OPTIX-NL-12`)

A class compiles long before it behaves, and the failures that reach an operator are silent: a timer that stopped at the first exception, an observer that outlived its page, a model lookup per tick, a class bound to no node. `review` reads the source and answers `clean` / `review` / `block`:

| Rule | Severity | What it catches |
|---|---|---|
| `OPTIX-NL-03` | critical | `PeriodicTask` created without a `Dispose()` in `Stop()` |
| `OPTIX-NL-04` | warning | periodic tick without `try/catch` (one exception ends the timer) |
| `OPTIX-NL-05` | warning | `Project.Current` read from inside the tick instead of `Start()` |
| `OPTIX-NL-06` | critical | blocking call: `Thread.Sleep`, `.Wait()`, `.Result`, `GetAwaiter().GetResult()`, `async void` |
| `OPTIX-NL-07` | warning | empty `catch` block |
| `OPTIX-NL-08` | warning | event `+=` without a matching `-=` in `Stop()` |
| `OPTIX-NL-09` | warning | design-time class starting background work Studio never runs |
| `OPTIX-NL-10` | critical | class name differs from the NetLogic node name |
| `OPTIX-NL-11` | info | class logs nothing, so runtime output cannot explain it |
| `OPTIX-NL-12` | info | node path hard-coded as a string literal |

`add` and `edit` run the same review and **refuse code rated `block`** unless `force: true`, so a class that breaks the documented lifecycle does not reach the project. `lint: false` skips the review. The rules, with the reasoning and the cheat-sheet page each comes from, are in the `optix-netlogic-practices` reference page; the static review does not replace the runtime check (a value changing on a bound screen is the only proof the class is loaded and running).

## Where the project is

The bridge cannot report the project folder: `Project.GetProjectPath()` probes members Studio 1.8.1 does not expose and then falls back to the process working directory, which is the Studio install folder. `optix_script` therefore:

1. uses `project_root` when you pass one,
2. otherwise searches `~/Documents/Rockwell Automation/FactoryTalk Optix/Projects`, `~/Desktop` and `~/AryaCode/KonnectSuite` (depth 4, `AppData` and `node_modules` skipped) for a folder containing exactly one `.optix`, and
3. refuses with the candidate list when several projects match, rather than guessing.

Pass `project_root` when the project lives anywhere else.

## The marker

Every class this tool writes starts with `// aria-netlogic: kind=… name=… created=…`. `delete` refuses a file without that marker unless `force: true`, because the NetSolution also holds the logic of imported template-library composites (`AlarmBannerLogic`, `AlarmGridLogic`, …) and those belong to their composite. A node under `UI/Components/` is refused outright: delete the composite instead.

## What it will not do

- **Build inside Studio.** There is no bridge route for it. `dotnet build` proves the C# compiles; Studio still has its own copy loaded until an engineer builds the solution there (Build > Build Solution, or Ctrl+Shift+K/T). `action: "run"` reports `not-loaded` in exactly that case, with the file path, instead of a raw bridge exception.
- **Edit a running project's assembly.** While the emulator runs it holds `bin\<project>.dll` open, so the copy step fails with `MSB3026`/`MSB3027`. The build result carries `locked: true`; stop the emulator, build, start it again.
- **Invent a class name.** The node and the class are refused when they disagree, because Optix binds by BrowseName and a mismatched pair silently does nothing.
- **Recover a stale object tree silently.** A build killed mid-flight leaves `obj\` inconsistent and MSBuild then reports `CS2001`/`MSB3030` against its own generated files. The tool retries once with `-t:Rebuild` and reports `recovered`.

## Reading the answers

`compile.ok` is the only statement about the C#; `status: "completed"` on `add` means the file and node exist, not that Studio loaded the class. `next` always says which of the two happened. When `run` answers `not-loaded`, the class is on disk and compiles - the fix is a Studio build, then run again.
