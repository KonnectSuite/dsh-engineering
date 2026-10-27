# dsh-engineering-mwi

MotionWorks IEC 3 Pro tools, redesigned for the `dsh-engineering` bundle. The product edits the
**real workspace project**: `mw_project_open` writes one complete hash-verified backup under
`<workspace>/backups/motionworks/<project>/<stamp>/` first, then drives the running IDE through the
existing 32-bit COM bridge. A project the IDE already has open is attached (backup recorded) instead of
reloaded, so unsaved editor changes survive. `mw_project_stage` remains as an optional sandbox.

`<workspace>/backups/<product>/<subject>/<stamp>/` is the one tree every engineering product writes
under, so a backup is one place whichever surface the user is in. MotionWorks is the product whose
backup is also a contract: the shipped bridge (`Get-DirectIdentity`) and the read-only engine
(`assert_direct_attached`) refuse a real project unless an identity record names a copy in that tree,
with a manifest whose SHA-256 matches. Records written before 0.4.21 that point at
`.motionworks/attached/backups` stay valid.

## Rows

| Row | Default | Tools | Status |
|---|---|---|---|
| `mwi-session` | on | 7 | implemented and live-verified |
| `mwi-read` | on | 7 | implemented and live-verified |
| `mwi-verify` | on | 3 | implemented and live-verified |
| `mwi-edit` | on | 7 | implemented; direct-edit path live-verified |
| `mwi-skill` | on | the `motionworks-iec` guidance | implemented |

Read tools: `mw_project_overview`, `mw_list`, `mw_get`, `mw_search`, `mw_references`, `mw_review`, `mw_help`.

Session tools: `mw_project_find`, `mw_ide_status`, `mw_project_stage`, `mw_project_open`,
`mw_ide_start`, `mw_worksheet_open`, `mw_project_close`.

Edit tools: `mw_edit_code`, `mw_edit_variables`, `mw_edit_structure`, `mw_insert_block`,
`mw_transfer_pou`, `mw_validate`, `mw_apply`.

## Live evidence

Verified against MotionWorks IEC 3 Pro 1.19 with a copy of a real project in a temporary workspace:

1. `open` writes `backups/motionworks/<project>/<stamp>/` with `backup-manifest.json` and
   `.motionworks/attached/records/<id>.json`, verified before the IDE is asked to open anything, and
   reuses that backup on later attaches.
2. A project already open in the IDE is attached without an `OpenProject` call: `mw_project_open`
   reports `already_open` and the verified backup path.
3. `start` launches the IDE on the real `.mwt`; `status` reports it open.
4. `worksheet` opens `Global_Variables` and verifies the active editor and unchanged modified state.
5. `edit` tools write through the native IDE API; `apply` saves the project in place, and an edit
   refused for a missing backup takes one before retrying.
6. `close` reports `closed: true`, and the next status reports the IDE not running.

The staged flow (`stage` then `open` the copy) still works when a sandbox is wanted.

## What the guarded read proves

`mw_get` for a POU returns the `text_body_sha256` of the exact body it returns. Passing it to
`mw_edit_code` is optional: when it is omitted, the tool hashes the current saved body itself, so the
documented read-then-edit flow works either way.

The identity check confirms the manifest digest and that every recorded member exists. Per-file hashes
are recorded for a restore and for the copy-time check; they are not recomputed on every guarded call.

## Structure

```
SKILL.md          the redesigned guidance
bridge/           the 32-bit PowerShell COM bridge
code/             the Python engine (wrapper binding, saved-model reads, validation)
src/core/         params, result, errors, tool, bridge, PowerShell transport, code engine
src/session/      workspace, stage, backup, runtime
src/tools/        session, read, verify and edit rows
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
