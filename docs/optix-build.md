# Optix NetLogic builds: references, compile checks and the solution

Studio compiles a project's C# itself when the engineer builds, and it writes
`ProjectFiles/NetSolution/bin/<Project>.dll` — the copy the runtime loads. `optix_build` answers the
two questions the bridge cannot: *will this compile* and *did the last build carry my change*.

Measured on this machine (Studio 1.8.1.27, system SDK 8.0.424):

- `ProjectFiles/NetSolution` builds with the system `dotnet` once a `<Project>.references` file
  names the Optix assemblies by absolute path.
- A copy of that folder compiled to `Build succeeded. 0 Warning(s) 0 Error(s)` outside Studio,
  so a check does not need Studio at all, and does not need the project folder to be writable.
- The `dotnet.exe` bundled with Studio (`Bindings\Net\5.0.1.46\Win32_x64\dotnet`) is a runtime
  with no SDK; it cannot build, so the check refuses by name rather than failing obscurely.

## `action status`

Reads the build artefacts without running anything:

- `state: never_built` — no `bin/<Project>.dll`; Studio has not built since the folder was made.
- `state: stale` — the DLL is older than the newest `.cs`; the runtime is serving the earlier code.
- `state: built` — the DLL is at least as new as every source file.

It also reports the newest source, the artefact's size and time, and how many references exist and
how many of their hint paths no longer resolve.

## `action check`

Copies `ProjectFiles/NetSolution` to a fresh `%TEMP%\dsh-optix-build-*` folder — skipping `bin/`,
`obj/`, `.vs/` and `node_modules/` — and runs `dotnet build <sln|csproj> -v m --nologo` there. The
copy is deleted afterwards unless `keep` is set. The project folder never gains a `bin/`, an `obj/`
or a generated file, which is what makes the check safe to run while an engineer is looking at the
folder.

The result is the compiler's, not the plugin's: `ok`, `exit_code`, `errors`, `warnings`, `tail` (the
last twelve lines), plus two classifications the log alone does not make obvious — `locked`
(`MSB3026`/`MSB3027`, a file another process holds) and `stale_object` (`CS2001`/`MSB3491`, a
missing intermediate file). A missing SDK is an error with `code: "dotnet_sdk_missing"`, not a
false "compiles".

A green check means the C# compiles. It does **not** mean Studio built it: the runtime loads what
Studio's build wrote, and only `action build`, or the build the engineer runs on the solution Studio opens
through its main toolbar (**Open .NET Solution**), writes that — Studio 1.8.1.27 documents `Ctrl+S` and
`F5` and no build keystroke.

## `action references`

Rewrites `<Project>.references` from the installed Studio: the newest version of every module's
`<Module>/<version>/Any/*.dll`, plus `UAManagedCore.dll` and `UAManagedCoreCommon.dll` from the
newest Windows binding. On Studio 1.8.1.27 that is 41 module assemblies and 2 binding assemblies —
the 43 references a Studio-generated file carries.

- An existing file whose every hint path still resolves is left alone (`action: unchanged`); pass
  `force` to rewrite it from this install.
- A file with an assembly missing — what a Studio upgrade leaves behind — is reported as
  `rewritten_after_upgrade`.
- With no Studio install the action refuses by name: let Studio generate the file by building once
  with the project open, or install Studio.

The file is written as `<Reference><HintPath>…</HintPath><Private>False</Private></Reference>` with
forward slashes, because that is the shape Studio writes and the shape a diff against a
Studio-generated file can be read in.

## `action init`

Scaffolds the solution a project created outside Studio has neither of:

- `<Project>.csproj` — `net8.0`, `AppendTargetFrameworkToOutputPath false`,
  `CopyLocalLockFileAssemblies true`, `OutputPath bin\` for both configurations, and an
  `<Import Project="<Project>.references"/>`.
- `<Project>.sln` — one project entry with a GUID derived from the project name, so two runs write
  the same file.
- `<Project>.references` — as above.

Existing `.cs` files are never touched. A csproj that already exists is refused with `action:
replace` unless `force` is passed.

## `action build`

Runs the same `dotnet build` in place, writing `bin/<Project>.dll`, and then reports `build_state`
so the answer says whether the artefact Studio will load now carries the current sources. When the
build fails because the file is locked, the result names `optix_emulator action stop` — the runtime
holds `bin/<Project>.dll` open while it serves.

## Order of operations

1. `optix_build action status` — does a build exist, and is it current?
2. `optix_build action references` — only when the project has no references file, or one whose
   paths no longer resolve.
3. `optix_build action init` — only when the project has no csproj/sln at all.
4. `optix_build action check` — after editing C#, before opening Studio. Never writes the project.
5. Save with `optix_save` (or the engineer's own `Ctrl+S`), then build: `optix_build action build` with
   the emulator stopped, or the solution opened from Studio's main toolbar (**Open .NET Solution**) built
   there.
6. `optix_build action status` — prove the artefact is newer than the source, then start the
   emulator with `optix_emulator`.

The check is the cheap gate; Studio's build is the one the runtime trusts; `status` is what says the
two agree.
