---
title: FactoryTalk Optix and NetLogic
order: 60
purpose: Work on a live Optix model through the Studio bridge, dry-run first, and never mistake a saved project for a build.
audience: Optix engineers
---

## The product row

FactoryTalk Optix is a 32-tool live-IDE row. Its bridge is a small C# NetLogic class that the bundle writes into the Studio project and the engineer loads in Studio. The bridge answers on loopback HTTP; the bundle does not run the upstream MCP server. `optix_bridge_arm` writes the bridge into `ProjectFiles/NetSolution` and backs up the previous files first.

The row needs Optix Studio 1.8.1 (the repository records 1.8.1.27), a running Studio with the project open, and - for the bridge only - the .NET 8 SDK. The bundled dotnet is a runtime; it cannot compile the bridge. Tesseract is optional, for OCR of screenshots, and Chrome or Edge is needed for preview.

## Two things no tool does

No tool can compile the bridge class, and no tool can run StartBridge. Both are Studio actions: the engineer opens the `.optix`, builds the project, right-clicks StartBridge and answers the Studio security prompt with Proceed. Until then the bridge tools report that the bridge is not reachable.

That is deliberate. The bundle's tests do not pretend to replace a vendor IDE step.

## Three states, and save is not build

Optix has three states and the row keeps them apart:

- **live model** - the model Studio has open, read through the bridge;
- **saved project** - what is on disk after `optix_save`, which alone raises the Studio window for one Ctrl+S and refuses if the foreground cannot be taken;
- **rendered screen** - `optix_preview`/`optix_screenshot` render what the saved project says, not what an unsaved buffer says.

A save is not a build. Measured on 2026-11-18, a save moved 29 sources while the compiled DLL's timestamp stayed older; an unchanged build can mean the build did not run, not that the change is equivalent.

## The seven phases

Brief, scaffold, open and arm, connect, author, persist, look and release. Tools are grouped the same way: session (`optix_status`, `optix_bridge_arm`), read and research, authoring and screens, NetLogic scripts, project and build, preview, and release. `optix_read` is the evidence gate: it reports what the bridge sees before a claim is made.

Writes default to `dry_run`; the switches `allowWrites`, `allowDestructive` and `allowInvoke` gate the real ones. The file channel refuses to write while a live session has unflushed changes, and it refuses a second writer. An apply is all-or-nothing and keeps `.dsh-backups`.

## What this row will not claim

- That an empty `.optix` can be created: none of the tools does that; start from a template.
- That the project can be built from the bundle: build is Studio's.
- That a saved project is a running screen: the emulator preview is a preview.
- That screenshots prove behavior: an image cannot prove a click works.
