# dsh-engineering-mwi

MotionWorks IEC 3 Pro tools, redesigned for the `dsh-engineering` bundle. The product works on a
**staged copy** of a workspace project and drives the running IDE through the existing 32-bit COM
bridge; the tool surface is new.

This package is not mounted yet. The legacy `dsh-tool-motionworks-iec` remains the shipped surface
until the redesign flips in Phase 5. The migration design and phase order are in
[docs/port/mwi.md](../../docs/port/mwi.md).

## Planned rows

| Row | Default | Tools |
|---|---|---|
| `mwi-session` | on | 7 — find, status, start, stage, open, worksheet open, close |
| `mwi-read` | on | 7 — overview, list, get, search, references, review, help |
| `mwi-verify` | on | 3 — compile, diagnostics, verify |
| `mwi-edit` | off | 7 — edit code/variables/structure, insert block, transfer POU, validate, apply |
| `mwi-skill` | on | the `motionworks-iec` guidance |

## Phase 0 scope

- The shared tool core: described parameters, the `{ schema, render }` output declaration, the
  `summary`/`data`/`coverage`/`next` envelope, and recoverable failures.
- The typed bridge boundary (`src/core/bridge.ts`); the PowerShell transport lands with the session
  row.
- The rewritten `SKILL.md` and its registration (`mwi-skill`), Windows-gated.
- Contract tests for the core and the skill.

The session, read, verify and edit entries land in Phases 1-4; this package exports only `./skill`
until then.

## Structure

```
SKILL.md          the redesigned guidance
bridge/           the COM bridge asset (copied in Phase 1)
src/core/         params, result, errors, tool, bridge boundary
src/skill.ts      the skill registration
test/             core and skill contracts
```

## Requirements

Windows, MotionWorks IEC 3 Pro (licensed or trial), Python 3 for the read engine, Windows 32-bit
PowerShell for the COM bridge, and a computer-use companion for desktop-only operations.

## Develop

```sh
pnpm install
pnpm run build
pnpm test
```
