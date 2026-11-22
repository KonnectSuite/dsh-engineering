# MotionWorks IEC

`@aryacode/dsh-engineering` ships 24 tools that drive the MotionWorks IEC 3 Pro IDE itself: find a
workspace project, open it with one verified backup, read its object model and POU code, edit declarations
and Structured Text or IL bodies, compile with the vendor engine, read its diagnostics, and verify what
changed.

This is the one product in the bundle that works a **live IDE** rather than an export. The component is a
beta product: the supported version is the MotionWorks IEC 3 Pro 3.x line (`3.0.3–3.7.5`), and the IDE
must be installed, licensed and running for any operation that touches it. Live evidence against a
staged copy of a real project was recorded on 2026-10-23, but it has not been re-verified on this host,
which has no IDE; here the compile, live and profile paths answer `NOT_INSTALLED`.

## What it is

| Fact | Value |
| --- | --- |
| Component id | `mwi` — *MotionWorks IEC* |
| Capability class | `live-ide` (it reads and writes a running IDE and the project it has open) |
| Stability | beta, since `v0.4.4` |
| Tools | 24 in the `mw_` namespace — 7 session, 7 read, 3 verify, 7 edit |
| Package / entry | `packages/mwi` → `entries/mwi.js` and its read, verify and edit rows |
| Skill | `motionworks-iec` (`packages/mwi/SKILL.md`, 8,000-character budget) |
| Probe | `mw_ide_status` |
| Evidence gate | `mw_compile` — the vendor engine's own verdict, not the tool's |
| Switches | `workspace`, `edit` |

The session model is the important part. A project is opened **once** per chat, and the tools that follow
use the handle that open returned: there is no second open, no direct attach to whatever the IDE happens
to have in front, and no window automation. Every IDE operation goes through the vendor's own automation
surface — a COM server reached from 32-bit PowerShell, plus a Python read engine for the object model.

Reading a POU returns its `text_body_sha256`, and every edit tool that rewrites a body requires that hash
back. That is the guard against editing a body something else changed in between.

## What you need

| Requirement | Version the repository records | Needed for | Optional |
| --- | --- | --- | --- |
| MotionWorks IEC 3 Pro | 3.0.3–3.7.5 (3.x line) | every session, read, edit and compile operation | no |
| A licensed IDE, or the vendor trial | — | opening and saving a real project; the trial prompt is answered by the engineer | no |
| Windows | — | the 32-bit PowerShell COM bridge and the vendor automation components | no |
| A 32-bit PowerShell and the installed vendor automation components | installed with the IDE | the bridge | no |
| Python 3 | any 3.x | the read engine that returns the object model; the bundle looks for its host's interpreter first and `MW_PYTHON` overrides it | no, for reads — a missing interpreter answers `PYTHON_UNAVAILABLE` with that fix |
| A computer-use companion | — | the three desktop-only operations the bundle does not carry: an IDE dialog, the trial prompt, a screenshot | yes |

The component's recorded verification is the MotionWorks IEC 3 Pro 3.x line (`3.0.3–3.7.5`), live on
2026-10-23, against a **staged copy** of a real project. That evidence was recorded on a host with the
IDE; this host has no MotionWorks install, so the compile, live and profile paths are not re-verified
here and answer `NOT_INSTALLED` rather than claiming a result. The figures below come from that staged
copy, and the path that writes a real workspace project was not what was measured. The staged copy is
the default for that reason.

## First session

Open a project the safe way first: stage a copy, then work on the copy. When the copy has answered every
question, the same calls run against the real project.

| Step | Call | What you see |
| --- | --- | --- |
| 1. Find it | `mw_project_find` | every `.mwt` in the workspace with its expanded directory, whether a staged copy exists and whether a pre-edit backup exists. Call this before opening anything |
| 2. Look before starting | `mw_ide_status` | whether the IDE is running, which project is open, the automation version, the active view, the compile state and any blocking dialog |
| 3. Stage a copy | `mw_project_stage {source}` | a `.mwt` under `.motionworks/stage` — a copy the IDE opens instead of the real files |
| 4. Open it | `mw_project_open {path}` | the IDE opens the project; a direct open first writes and verifies one complete backup under `<workspace>/.motionworks/attached/`; the answer names the project and the handle |
| 5. Orient | `mw_project_overview` then `mw_list {kind: "pou"}` | languages, POU, variable, type and task counts, readiness and validation findings; then the names and paging for one kind |
| 6. Read the code | `mw_get {kind: "pou", name: ...}` | declarations, the body, and the `text_body_sha256` an edit will need |
| 7. Review before editing | `mw_review` | workflow blockers, native validation, unsupported constructs, and optionally a program review for one POU or a proposed body |
| 8. Compile and read | `mw_compile {mode: "build"}` then `mw_diagnostics` | the vendor engine's verdict and compile state, then the Errors, Warnings or Build pane text — the only place the exact vendor message exists |

The first session on the measured project produced an overview of 1 POU, 76 globals, 201 types and 5 task
rows, then a POU read, a search, a reference walk, a review with 0 blockers, and a help search — the whole
read side working before a single write.

An edit session adds one step at a time, each with a precondition:

```text
mw_edit_code { pou, body, expected_body_sha256 }   # or exact find/replace changes
mw_validate                                        # workflow blockers and native validation
mw_compile { mode: "build" }                       # the vendor engine, not the tool
mw_diagnostics { pane: "Errors" }                  # exact messages when it fails
mw_verify { mode: "baseline" }                     # capture saved source + compile state
mw_apply                                           # save through the IDE
```

`mw_verify {mode: "compare", baseline_id}` then reports which source files were added, removed or changed
since the baseline. That is the proof of a change, not the write returning.

## What it does

| Group | Tools | What it is for |
| --- | --- | --- |
| Session | `mw_project_find`, `mw_ide_status`, `mw_ide_start`, `mw_project_stage`, `mw_project_open`, `mw_worksheet_open`, `mw_project_close` | find projects, start or attach to the IDE, open a project or a copy with a verified backup, open one worksheet and verify it is the active view, close with approval |
| Read | `mw_project_overview`, `mw_list`, `mw_get`, `mw_search`, `mw_references`, `mw_review`, `mw_help` | project and component summaries; paginated listings; one POU, type, task, block interface or the EtherNet/IP map; literal search; where a symbol appears; a static review; the installed help, manuals, Yaskawa references and ST patterns |
| Verify | `mw_compile`, `mw_diagnostics`, `mw_verify` | Make, Build or read the compile state; the output panes as text; a saved-source and compile-state baseline, and the comparison against it |
| Edit | `mw_edit_code`, `mw_edit_variables`, `mw_edit_structure`, `mw_insert_block`, `mw_transfer_pou`, `mw_validate`, `mw_apply` | replace one ST or IL body; add, change or delete one declaration; create, copy, rename, delete, convert or assign a POU or a task; insert a function-block instance and its call; export or import one POU as a package; validate; save |

Every tool reports `summary`, `data`, `coverage` and `next`, and every error carries a `code`, a `message`
and a `fix`. `coverage` is where a read says what it could not establish — a program review that did not
reach every routine, or a project whose model the spreadsheet-style readers cannot fully enumerate.

The edit group is the only one that changes a project, and every tool in it takes its guard with it:
`mw_edit_code` requires the body hash, `mw_insert_block` requires the body hash, `mw_edit_variables`
requires the complete seven-field declaration on an edit and an explicit approval plus a reference review
on a delete, `mw_edit_structure` requires approval and a reference review for a delete or a rename, and
`mw_transfer_pou` consumes its export token on one import attempt.

## Limits

- The measured scope is one project — a staged copy of a real one — on the MotionWorks IEC 3 Pro 3.x
  line (`3.0.3–3.7.5`). Other
  IDE versions, other controller families and a download to real hardware are unmeasured.
- The compile verdict is the vendor engine's. It is not a runtime test: the bundle never downloads, starts,
  stops or observes a controller.
- The IDE must be running for any operation on it. `mw_ide_start` starts it with one project or attaches to
  the one already running; it does not silently open a second instance.
- The setup is Windows-only and depends on the vendor's 32-bit automation components being installed. A
  missing registration is reported by the bridge, not worked around.
- Three operations are desktop-only and belong to a computer-use companion, not this bundle: an IDE dialog
  that blocks a call, the vendor trial prompt, and a screenshot of the IDE. The bundle says so instead of
  scripting a window.
- A house-style profile for MotionWorks IEC is not implemented in this release (see
  [Engineering resources](resources.md)); `mw_review` and `mw_compile` are the available judgements.
- `mw_help` searches what is installed on the host. A manual that is not installed is not found, and the
  answer does not pretend otherwise.

## Safety

| Path | What it writes | What it needs |
| --- | --- | --- |
| `mw_project_open` on a real project | one verified backup under `<workspace>/.motionworks/attached/`, then the IDE opens the project | `user_approved` when another project is open; the backup is taken before the open |
| `mw_project_stage` | a copy under `.motionworks/stage` | the source must be inside the workspace |
| Edit tools | the project the IDE has open, through the vendor automation surface | `edit` switch; the body hash or declaration precondition each tool documents; approval and reference review for delete, rename and close |
| `mw_apply` | saves the open project; a workspace project is written in place and its verified pre-edit backup stays under `<workspace>/backups/` | `edit` switch |
| `mw_transfer_pou` import | the project | a package token from an export in this chat, plus a dependency review |

The safe order is stage, open the copy, work, verify, then decide whether to open the real project. Nothing
in this row writes to a controller, and nothing downloads to hardware.

## Where to go next

- [Tool reference](../reference/tools.md) — every `mw_*` tool with its parameters.
- [Capabilities](../capabilities.md) — the calls behind the counts in this page.
- [Engineering resources](resources.md) — the corpus `mw_review` findings can be cited against.
- [Documentation map](../index.md) — every page, by task and by product.
