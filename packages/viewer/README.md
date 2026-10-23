# dsh-engineering-l5x-viewer

The L5X ladder viewer client face of the `dsh-engineering` bundle.

The host half is a no-op entry; the package exists for its `dsh.client` module. It renders ladder
rungs for an L5X export opened from the workspace, in the right sidebar file pane, and is mounted by
the `l5x-viewer` row. The viewer is independent of the L5X tools rows: switching `l5x-read` or
`l5x-editing` off does not remove it.

## Provenance

The client source was carried over from the retired AryaAI ladder viewer
(`packages/client/ui-logix-project-viewer`). Its built closure-factory artifact is vendored at
`lib/client.js` with the module-loader banner id rewritten to `dsh-engineering-l5x-viewer`, so the
bundle's client module system serves it under this package name. The source is kept for maintenance.

## Rebuilding the client

This repository does not build the client: it needs the harness client packages, the CSS-module
transform and the module-table externals that AryaAI's `packages/client/tsdown.client.ts` provides.
Until that build is ported, regenerate `lib/client.js` in the AryaAI workspace and rewrite the
banner id.

## Tests

The viewer's own suite (registration, model, body rendering, inspection) lives with the AryaAI source;
this package does not duplicate it.
