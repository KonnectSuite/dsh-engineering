# Getting started

This bundle gives AryaCode four engineering products behind one install: **Studio 5000 L5X**,
**FactoryTalk View ME**, **MotionWorks IEC** and **FactoryTalk Optix**. Each product is a *row* you can
switch on or off, and each registers a **skill** (how the agent should work) plus **tools** (what it can
do). You do not call tools yourself: you say what you want in the chat, and the agent picks the skill and
the tools.

This page is the shortest path from "just installed" to a finished job. The per-product detail lives in
the skills and in [Examples](examples.md).

## 1. Check what you have

You need AryaCode plus whichever vendor software the job touches. Nothing else is required for reading
exports.

| Product | What the agent can do without vendor software | Vendor software it needs for the rest |
|---|---|---|
| Studio 5000 L5X | Read an `.L5X`, review logic, run checks, stage edits into a new `.L5X` | Studio 5000 + Logix Designer SDK for builds; a controller for online work |
| FactoryTalk View ME | Read an export folder, check displays and tags, stage display edits | FactoryTalk View ME Studio to export the application and to import changes |
| MotionWorks IEC | Find projects, read saved code and variables | MotionWorks IEC 3 Pro running for live reads, edits and compile |
| FactoryTalk Optix | Read a project through the Studio bridge, author objects and variables | FactoryTalk Optix Studio open with the project loaded |

## 2. Install and confirm

Install **Engineering** from the market (**Plugins → Arya Plugin Market → Engineering**), or add
`@aryacode/dsh-engineering` to the profile bundle list. After it loads, the Engineering card lists four
rows: `l5x`, `ftview`, `mwi`, `optix`. All are on by default; turn one off if the machine has no vendor
software for it.

Confirm the skills are present by asking for one of these in a new chat:

- *"What can you do with a Studio 5000 L5X file?"*
- *"List the FactoryTalk View ME applications on this machine."*

If the answer is "I do not have tools for that", the row is disabled or the bundle is not loaded.

## 3. The loop every product follows

1. **Point at the work.** A workspace folder with the export, project or ACD, or an application name for
   FactoryTalk View ME.
2. **Read before writing.** Overview, structure, references, checks. The agent should quote what it read.
3. **Act in a copy.** L5X and FactoryTalk View write a **new** file or folder and never touch the source;
   MotionWorks edits the saved project after taking a verified backup.
4. **Verify.** Re-read the written file or run the vendor engine (SDK build, ME re-export, MWI compile).
   "Done" means the check passed, not that a file was written.
5. **Hand off or download.** Some steps are deliberately human: importing displays in Studio, creating a
   runtime file, downloading to a controller or terminal. The agent must say which ones.

## 4. First sessions, per product

### Studio 5000 L5X

> Open `C:\Projects\Line\Line.L5X`, give me the overview and run the checks.

Then, for a change:

> Add a seal-in rung for `StartPB`/`StopPB` driving `SystemRunning` in `MainProgram/MainRoutine`, rung 7.

The agent composes the rung with the instruction catalog (`list_instructions`, `compose_rung`), stages
it, validates the whole draft, and applies to a new `.L5X`. With Studio 5000 and the SDK installed, ask
for a build; with a controller, ask for a supervised download.

### FactoryTalk View ME

> List the ME applications. Export `Carpenter_EPS_Laminator001` to `C:\Exports\Laminator` and open it.

Then:

> Create a display called "Arya Overview" with a heading, a start button bound to `SystemRunning`, and a
> numeric display for `LineSpeed`. Validate it and write the import package.

The agent exports through the vendor engine (no Studio window needed), authors against the installed
`Gfx-ME` schema, and writes a folder containing the changed displays plus
`Displays/BatchImport_<app>.xml`. **You** import that list in Studio, then:

> Verify the import against my draft.

`ftview_verify_import` re-exports and compares object by object.

### MotionWorks IEC

> Find the MotionWorks projects in this workspace.

> Open `BottomCutterS5.mwt` and show me the tasks and POUs.

> In `MainProgram`, change the ramp time from 200 to 150 ms and compile.

The agent starts the IDE, takes a backup under `backups/motionworks/`, edits the saved project, compiles
and reads the diagnostics.

### FactoryTalk Optix

> What Optix project is loaded? Give me the map.

> Add a NetLogic script `LineStats` and bind `LineSpeed` to the label on `MainScreen`.

The agent reads the live model through the Studio bridge, applies typed edits, and can validate
expressions and read NetLogic guidance from the pinned cheat-sheet snapshot.

## 5. What the bundle will not pretend

- **FactoryTalk View import and runtime creation are Studio steps.** The bundle exports, authors,
  validates and verifies; it does not import into Studio or build a `.mer`. The export also does not
  include the HMI tag CSV — export that separately if tag bindings matter.
- **MotionWorks needs its IDE running.** Without it, the row is read-only over saved files.
- **Optix needs the Studio bridge.** Disk files can be stale while Studio is open; the bridge is the
  truth.
- **L5X builds need Studio 5000 and the SDK**, and no surface can prove that online logic matches the
  export or that the machine is safe. Coverage fields say what was not established.

## 6. Where to read next

| Question | Document |
|---|---|
| Which tool does what, with every parameter | [Tool reference](reference/tools.md) |
| A full session with call shapes and results | [Examples](examples.md) |
| How the rows, services and client faces fit | [Architecture](architecture.md) |
| What changed in a release | [Changelog](../CHANGELOG.md) |
| How the agent should behave for one product | The product's skill (loaded automatically in chat) |
