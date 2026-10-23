# dsh-engineering-mwi

MotionWorks IEC 3 Pro tools, redesigned for the `dsh-engineering` bundle. The product works on a
**staged copy** of a workspace project and drives the running IDE through the existing 32-bit COM
bridge; the tool surface is new.

This package is **not mounted yet**. The legacy `dsh-tool-motionworks-iec` remains the shipped
surface until the redesign flips in Phase 5. The migration design and phase order are in
[docs/port/mwi.md](../../docs/port/mwi.md).

## Rows and progress

| Row | Default | Tools | Status |
|---|---|---|---|
| `mwi-session` | on | 7 | implemented and live-verified |
| `mwi-read` | on | 7 | next |
| `mwi-verify` | on | 3 | planned |
| `mwi-edit` | off | 7 | planned |
| `mwi-skill` | on | the `motionworks-iec` guidance | implemented |

Session tools: `mw_project_find`, `mw_ide_status`, `mw_project_stage`, `mw_project_open`,
`mw_ide_start`, `mw_worksheet_open`, `mw_project_close`.

## Live evidence

Verified against MotionWorks IEC 3 Pro 1.19 on 2026-10-23 with a copy of a real project in a temporary
workspace:

1. `stage` copied the project, bound the wrapper to the staged directory and wrote its identity.
2. `start` launched the IDE and answered the trial prompt (`posted_bm_click`).
3. `status` reported the staged project open, `in_stage: true`.
4. `worksheet` opened `Global_Variables` and verified the active editor and unchanged modified state.
5. `close` reported `closed: true`, and the next status reported the IDE not running.

## Structure

```
SKILL.md          the redesigned guidance
bridge/           the 32-bit PowerShell COM bridge
code/             the Python engine (wrapper binding, saved-model reads, validation)
src/core/         params, result, errors, tool, bridge, PowerShell transport, code engine
src/session/      workspace, stage, runtime
src/tools/        session row (read/verify/edit rows next)
test/             contract tests and the live fixtures
```

## Requirements

Windows, MotionWorks IEC 3 Pro (licensed or trial), Python 3 for the code engine, Windows 32-bit
PowerShell for the COM bridge, and a computer-use companion for desktop-only operations.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
