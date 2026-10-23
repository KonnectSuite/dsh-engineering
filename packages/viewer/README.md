# dsh-engineering-l5x-viewer

The L5X ladder viewer, folded into the `dsh-engineering` bundle.

## Provenance

The client source is copied from `@deepseek-ai/dsh-client-ui-logix-project-viewer` **0.2.1-rc.2** in the AryaAI repository (`packages/client/ui-logix-project-viewer`). Its built closure-factory artifact is vendored at `lib/client.js` with one change: the module-loader banner id is rewritten from the standalone package name to `dsh-engineering-l5x-viewer`, so the bundle's client module system serves and registers it under this package name.

The host half (`src/index.ts`, `lib/index.js`) is a no-op entry; this package exists for its client face.

## Rebuilding the client

The source is kept for maintenance, but this repository does not yet build it: the client needs the harness client packages, the CSS-module transform and the module-table externals that AryaAI's `packages/client/tsdown.client.ts` provides. Until that build is ported, regenerate `lib/client.js` in the AryaAI workspace and rewrite the banner id.

## Tests

The viewer's own suite (registration, model, body rendering, inspection) lives with the AryaAI source and passes there: 4 files, 10 tests. This package does not duplicate those tests yet.
