---
id: optix-application-recipe
title: Build an Optix application in the order that survives the runtime
domain: optix
level: practitioner
basis: [measured on Studio 1.8.1 with the bridge, 2026-11-14]
tags: [recipe, workflow, model, netlogic, screens, navigation, runtime, production]
applies_to: [optix]
rules: [OPTIX-RCP-01, OPTIX-RCP-02, OPTIX-RCP-03, OPTIX-RCP-04, OPTIX-RCP-05, OPTIX-RCP-06]
---

# Build an Optix application in the order that survives the runtime

Every step below was executed against a live Studio 1.8.1 project through the bridge on
2026-11-14 and checked in the Web presentation engine at `http://127.0.0.1:8081`. Build in this
order because each step depends on what the previous one created, and because the failures this
order avoids are invisible in the designer.

## 1. Model first (OPTIX-RCP-01)

Create the tag tree before any screen. A screen binding to a path that does not exist yet cannot
be caught by the batch validator: `optix_edit` validates shape, not existence, so the live bind
refuses at apply time with `source_not_variable` and the batch stops half-applied.

- Folders and tags: `optix_edit` `create_folder` and `create_variable` under `Model/<Area>`.
- Seed the operator-facing defaults (a setpoint, a mode) with `set_property`, so a cold start
  shows a sensible number instead of zero.
- A folder's tags are reported as the folder node's `properties`, not as children; a tree walk
  that only follows `children` will report an empty model.

## 2. Machine behaviour as a NetLogic class (OPTIX-RCP-02)

The bridge creates the node; the class comes from the NetSolution.

- `optix_action` `create_netlogic` with `parent` and `name` creates a NetLogic node. The node
  carries no code reference: Optix binds it to the C# class **whose name equals the node's Browse
  name**, and the SDK-style `.csproj` globs every `.cs` in `ProjectFiles/NetSolution`, so adding
  the file and building is the whole deployment.
- Put the node under the object whose tags it reads when it uses `Owner`; otherwise resolve tags
  with `Project.Current.GetVariable("Model/Line/Start")` so the logic is independent of placement.
- Use `new PeriodicTask(Tick, 200, LogicObject)` in `Start()` and dispose it in `Stop()`; write
  every output each tick so the runtime never shows a stale value.
- Guard the start: if a required tag is missing, log an error and return rather than throwing in a
  periodic task.

## 3. Screens with the shell bar (OPTIX-RCP-03)

Draft screens in the order that lets the wiring land, or accept the deferred wiring.

- `optix_screen` draws the bar in the start window beside the `PanelLoader`, names each button
  `Nav_<target>` and wires it with a path relative to the loader. That relative pointer is the
  only shape that resolves after the runtime instantiates the session.
- A navigation target that does not exist yet costs the wiring, not the screen: the tool reports
  the exact `wire_event` ops as pending. Draft the destination first when the order is yours to
  choose, otherwise apply the pending ops once the destination exists.
- The bar is shared: a second screen adds its own button instead of replacing the first.

## 4. Operator controls by command, not by custom code (OPTIX-RCP-04)

A button that sets or toggles a tag needs no NetLogic: wire it with `command: "SetVariable"`
(or `ToggleVariable`) plus `variable` and `value`. The command resolves through the builtin
`VariableCommands` singleton, which exists in every session, so it is immune to the design-time
pointer trap that breaks a method-path handler. Reserve method-path wiring for calls on the
application's own objects.

## 5. Save, build, run — in that order (OPTIX-RCP-05)

The running emulator deploys the **saved** project and the **built** assembly.

- Save from Studio (Ctrl+S) and confirm the project file's timestamp moved; a press that reports
  success does not prove the write, and a modal dialog swallows it silently.
- Build the NetSolution (`dotnet build AryaNewHMIProject_IPC.csproj` in `ProjectFiles/NetSolution`)
  so a new NetLogic class is in `bin`. Studio's own build fails silently behind a toast.
- Restart the runtime so it deploys the new copy, then confirm the presentation engine answers.

## 6. Verify like an operator, then review like an engineer (OPTIX-RCP-06)

Reading tags through the bridge proves the design, never the run: the runtime keeps its own
per-session values. Verify by clicking in the runtime and reading the screen text, then run the
release review.

- Click each navigation button and each command button in the browser and read the panel text
  back. A handler that exists is not a handler that fired.
- `optix_production_check` returns a release verdict: absolute design-time pointers, dead
  navigation targets, screens unreachable from the loader's start panel, engines left on the
  built-in user or the stock style sheet. `repair: true` clears the pointer values it reports.
- `optix_design_check` per screen covers what the project review cannot see: touch-target size,
  missing captions, contrast, canvas size.

## What this order buys

The measured failures this recipe avoids, all of which looked fine in the designer: a model that
did not exist when the screen bound to it, a button whose handler names a design-time object and
therefore fails in every session, a navigation bar that replaced itself instead of growing, a
NetLogic class that was never compiled into the running assembly, and an emulator started on the
save before the last one.
