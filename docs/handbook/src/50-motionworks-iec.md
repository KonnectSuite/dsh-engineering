---
title: MotionWorks IEC
order: 50
purpose: Explain the IDE-bound MotionWorks workflow, its backup rule, and the honest state of verification on this host.
audience: Engineers with a MotionWorks IEC installation
---

## The product row

MotionWorks IEC is a 24-tool live-IDE row. It reads and edits a project through the MotionWorks automation bridge: one session is opened per chat and the rest of the calls carry its handle. It never automates windows; a handful of desktop-only actions are handed to a computer-use companion with a stated step.

The row needs MotionWorks IEC 3 Pro on the 3.x line (`3.0.3–3.7.5`), a licensed IDE that is running, Windows, 32-bit PowerShell with the vendor automation components, and a Python 3 interpreter (`MW_PYTHON` overrides the one it finds; without one the call returns `PYTHON_UNAVAILABLE`).

## The staged copy rule

MotionWorks edits a real project in place once saved, so the row never starts there:

1. `mw_project_find` finds the project; `mw_ide_status` reports the IDE.
2. `mw_project_stage` writes a copy under `.motionworks/stage` and the session works on the copy.
3. `mw_project_open` takes one verified backup of a real project under the shared backup tree before opening it.
4. Edits go through `mw_edit_code`, which returns the body hash, then `mw_validate`, `mw_compile`, `mw_diagnostics` and `mw_verify` against a baseline. `mw_apply` saves the open project in place, with the backup as the undo.

The compile verdict is the vendor engine's, not a runtime test. Downloading to a controller is not part of this row.

## The verification gap on this machine

This host has no MotionWorks IEC installation with a reachable IDE bridge. The repository records live evidence for the 3.x line (`3.0.3–3.7.5`) against a staged copy of a real project on 2026-10-23, but that evidence cannot be reproduced here: on this machine the compile, live-IDE and profile paths are **unproved**. They are fixture-tested only - the automation contract, the session handling and the backup rules have tests, but no project has been edited on a running IDE on this host.

Treat every MotionWorks claim in this handbook as a claim about tested code, not about a project this machine edited. The capability page states the same in `docs/capabilities.md`.

## What this row will not claim

- That other MotionWorks IEC versions, controller families, downloads or a real-workspace write path work: none of those were measured.
- That a compile proves a program runs: the vendor engine accepts it; runtime needs a controller.
- That the IDE can be skipped: it must be running, licensed, and connected to the bridge.
- That the bundle supplies a house style for MotionWorks: it does not in this release.
