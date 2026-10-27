# dsh-engineering-mwi

MotionWorks IEC 3 Pro tools, redesigned for the `dsh-engineering` bundle. The product edits the
**real workspace project**: `mw_project_open` writes one complete hash-verified backup under
`<workspace>/backups/<project>/<timestamp>` first, then drives the running IDE through the existing
32-bit COM bridge. `mw_project_stage` remains as an optional sandbox.

This package is **not mounted yet**. The legacy `dsh-tool-motionworks-iec` remains the shipped
surface until the redesign flips in Phase 5. The migration design and phase order are in
[docs/port/mwi.md](../../docs/port/mwi.md).

## Rows and progress

| Row | Default | Tools | Status |
|---|---|---|---|
| `mwi-session` | on | 7 | implemented and live-verified |
| `mwi-read` | on | 7 | implemented and live-verified |
| `mwi-verify` | on | 3 | next |
| `mwi-edit` | off | 7 | implemented; direct-edit path under verification |
| `mwi-skill` | on | the `motionworks-iec` guidance | implemented |

Read tools: `mw_project_overview`, `mw_list`, `mw_get`, `mw_search`, `mw_references`, `mw_review`, `mw_help`.

Session tools: `mw_project_find`, `mw_ide_status`, `mw_project_stage`, `mw_project_open`,
`mw_ide_start`, `mw_worksheet_open`, `mw_project_close`.

## Live evidence

Verified against MotionWorks IEC 3 Pro 1.19 with a copy of a real project in a temporary workspace:

1. `open` writes `<workspace>/backups/<project>/<timestamp>/` with `backup-manifest.json`, verifies
   every copied file's SHA-256, and reuses that backup on later attaches.
2. `start` launches the IDE on the real `.mwt`; `status` reports it open.
3. `worksheet` opens `Global_Variables` and verifies the active editor and unchanged modified state.
4. `edit` tools write through the native IDE API; `apply` saves the project in place.
5. `close` reports `closed: true`, and the next status reports the IDE not running.

The staged flow (`stage` then `open` the copy) still works when a sandbox is wanted.

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
