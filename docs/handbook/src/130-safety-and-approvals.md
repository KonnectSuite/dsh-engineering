---
title: Safety, approvals, and where work happens
order: 130
purpose: The write gate, the approval rules, the backup tree, and the rule that keeps the installed app untouched.
audience: Operators, approvers and reviewers
---

## The default is read

Every product starts read-only. Reading a project, rendering a display, searching installed help and reading a saved project file are all safe in the sense that they write nothing. A write happens only when a tool named for writing is called, and only when its gate is open.

Read-only rows (PLC-5, SLC 500) are read-only by construction: no write tool, no write switch. A profile cannot add a capability the build does not carry.

## The write gate

A write path passes through these controls in order:

1. **A draft, not an overwrite.** Draft tools write a new artifact beside the source and refuse to replace an existing one. Output paths that already exist are refused unless the tool explicitly allows an overwrite.
2. **An explicit apply or save.** The draft must be applied or saved by its own tool call; nothing writes on the way past.
3. **Per-call approval.** A gated write asks for approval for this call. When the session policy cannot ask - a non-interactive run, for example - the call returns `APPROVAL_UNAVAILABLE` and nothing is written. Approval design assumes a person sees what is about to happen.
4. **A verify step.** Where the product has a vendor engine, the result is verified by that engine, not by the bundle: an SDK build, a re-export, a MotionWorks compile, an Optix build. A read-back check catches a write that landed differently.

## The installed app is not a workspace

The bundle runs inside AryaCode. It never edits the installed application under `%LOCALAPPDATA%\Programs\AryaCode`, it never edits the `app.asar`, and it never rewrites a profile's `package.json` to work around a bug. Development and testing happen on a Dev AryaCode home, never on the installed instance.

When a fix seems to need a change to the installed shell, that is the signal the change belongs upstream in the harness, not here.

## The backup tree

One place holds undo material: `<workspace>/backups/<product>/<subject>/<UTC stamp>/`, with `backup-manifest.json` listing every file and its SHA-256. MotionWorks keeps its attached-project records under `.motionworks/attached/records/` because the IDE owns that layout; migration and PLC-5 write nothing and therefore back up nothing.

## Vendor bytes and the network

Vendor help pages and vendor sample projects are never committed. Fixtures are either synthetic, authored by the repository, or generated on the owner's machine and kept local. The bundle makes no network call in a normal session; the only network use is a live-controller or bridge connection the user configured, and a network block in the drill suite proves the rest still works.

## When in doubt

If a call would change anything a person cares about - a controller, a live project, a shared file - stop and ask. The bundle's job is to make that decision visible, not to make it quietly.
