# The migration plan: eight stages, five decisions

`migration_plan` keeps the resumable state of a migration in `.migration/plan.json`.
The plan is what makes a long conversion survivable: it records what was decided, what
was found, what is still open, and which stage the work is in. It is user data, not
this corpus, and it is the one place timestamps are appropriate.

## Schema and location

- File: `.migration/plan.json` by default, under the workspace.
- Schema: 1.
- It records the five decisions, the eight stages, the exception list, and the
  questions still open.

The tool's actions are `create`, `read`, `answer`, `stage`, and `exception`. `create`
writes the file; `answer` records a decision; `stage` moves a stage between `pending`,
`active`, `done`, and `blocked`; `exception` adds or updates a plan exception with its
resolution. Reading is always safe; writing needs a workspace the caller can write.

## The eight stages

| Stage | Purpose | Blocking signal |
| --- | --- | --- |
| `intake` | Interview the engineer and record the decisions. | Missing decisions. |
| `assess` | Read the legacy project headlessly. | Unaccepted risk list, vendor missing for the live read. |
| `convert` | Run the wizard and keep the `.L5K`. | No saved wizard output. |
| `lint` | Lint the `.L5K` and repair a copy. | Error-severity lint findings. |
| `import` | Import into Studio and export the `.L5X`. | Import failure. |
| `compare` | Compare the legacy structure with the export. | Unresolved `RUNG_LOST`/`ROUTINE_MISSING`. |
| `engineer` | Resolve exceptions and prove each rewrite. | Unresolved markers, indirect sites, placeholders. |
| `commission` | Commission, then baseline source, ACD and `.L5X`. | No baseline. |

Each stage has a status and can carry notes. A stage marked `blocked` should say what
blocks it in the notes; the plan tool never guesses.

## The five decisions

| Decision | Allowed values | Why it matters |
| --- | --- | --- |
| `target_cpu` | The controller family and catalog number chosen. | Fixes I/O bus, memory, and available instructions. |
| `target_revision` | Integer 1 through 40. | 37+ can be proved by offline build; below that only import is provable. |
| `io_strategy` | Keep the chassis behind a bridge, or replace the modules. | Determines whether module configuration and addresses are rewritten. |
| `hmi_scope` | Which screens stay, move, or retire. | A legacy HMI reading the data table will not follow tags. |
| `acceptance` | `offline_build`, `sequence_test`, or `golden_part`. | Defines what "done" means before the work starts. |

`answer` records one decision at a time. An invalid decision value fails with
`INVALID_DECISION` and names the accepted values. A migration with unanswered
decisions is not ready for the convert stage.

## Exceptions

A plan exception is an open engineering item, not a bug:

- `id` — stable short identifier,
- `kind` — the category (`wizard_artifact`, `indirect_address`, `legacy_instruction`,
  `module_replacement`, `sfc_routine`, `manual_rewrite`),
- `description` — the site and what it is,
- `rationale` — why the chosen resolution is right,
- `status` — `open`, `accepted`, or `fixed`.

`fixed` without a rationale is a deletion in disguise. The plan keeps the history so a
reviewer can see each item's path from open to fixed.

## Plan gates

- No stage beyond `assess` while a decision is unanswered.
- No stage beyond `lint` while an error-severity lint finding remains.
- No stage beyond `compare` while `RUNG_LOST` or `ROUTINE_MISSING` is unresolved.
- No stage beyond `engineer` while a marker, placeholder, or indirect site is open.
- No `commission` before the acceptance evidence is recorded.

If the file is missing, the tool reports `PLAN_MISSING` with the default path and the
create action. If it exists but cannot be parsed, `PLAN_UNREADABLE`; if it cannot be
written, `PLAN_UNWRITABLE`. The plan is local JSON created by the bundle's own tools;
the tool never overwrites a plan it cannot read.

## Picking the work up

At the start of a session, call `migration_plan` with the `read` action before anything
else. The plan says which stage is active and which exceptions are still open, and it
is the only state that survives the conversation. A long migration that lives only in
chat history is not resumable.
