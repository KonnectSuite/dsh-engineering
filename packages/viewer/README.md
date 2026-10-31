# dsh-engineering-l5x-viewer

The L5X ladder viewer client face of the `dsh-engineering` bundle.

The host half is a no-op entry; the package exists for its `dsh.client` module. It renders ladder
rungs for an L5X export opened from the workspace, in the right sidebar file pane, and is mounted by
the `l5x-viewer` row. The viewer is independent of the L5X tools rows: switching `l5x-read` or
`l5x-editing` off does not remove it.

## Provenance

The client source was carried over from the retired AryaCode ladder viewer
(`packages/client/ui-logix-project-viewer`). The source is now built here: `scripts/build-viewer-face.mjs`
produces `lib/client.js` as a closure-factory artifact with the module-loader banner id
`dsh-engineering-l5x-viewer`, so the bundle's client module system serves it under this package name.
`lib/client.js` is a committed build artifact - commit the rebuilt file with the source change that
caused it, and never hand-edit it.

## Rebuilding the client

```sh
node scripts/build-viewer-face.mjs   # packages/viewer/src/client -> packages/viewer/lib/client.js
node scripts/build-client.mjs        # both faces + the settings pages -> one bundle registration
```

`scripts/build-viewer-face.mjs` uses the repository's own esbuild and supplies the two transforms the
AryaCode workspace used to supply: a CSS-module transform (each `*.module.css` becomes a scoped class
map plus a one-shot `<style data-plugin-css="dsh-engineering-l5x-viewer/<file>.css">`) and the
workspace-path utility, vendored at `src/client/vendor/workspace-path.ts` because the harness package
that used to provide it is not published. React, react-dom and the client primitives stay external -
the shell provides them.

## Tests

`node packages/viewer/test/render/suite.mjs` (`npm run e2e:ladder`) renders this package's built
`lib/client.js` in a real headless Chrome against the exports under `_e2e/out/`, measures the DOM, and
fails on a render defect a reader would notice: clipped text, a label escaping its cell, two labels
overlapping, an instruction painting two tag labels, an instruction comment overprinting its
neighbour, an index used as a pin name, or a recorded exported value that never reaches the screen.

Three more entry points cover what the case table cannot:

- `npm run e2e:routines` (`test/render/routines.mjs`) opens *every* routine the organiser lists in one
  export and judges each, so a ladder shape that only occurs in one unscheduled program or one
  migrated routine cannot slip through. `--file`, `--limit`, `--shots` and `--width` are accepted.
- `npm run e2e:actions` (`test/render/interactions.mjs`) drives the pane the way an engineer does:
  click focuses an instruction, arrow keys walk the rung, a rung number selects its rung, the source
  view shows the exported NeutralText, the organiser filter narrows the tree, the tag table opens and
  sends a tag to the offline watch pane, an operand menu opens where the pointer was and watches its
  tag, a rung opens its own menu and watching it adds every tag the rung touches, the bottom panes
  switch, a routine row, a program row and a module row each open their own menu, and no console output appears.
- `npm run e2e:instructions` (`test/render/instructions.mjs`) generates an export with one rung per
  catalogued instruction and renders it, so an instruction the composer offers cannot be drawn without a label.
- `test/render/e2e.mjs` renders one routine and writes a screenshot; `test/render/diag.mjs` dumps the
  measurement; `test/render/probe.mjs` dumps one instruction's computed style.

The harness needs Chrome or Edge installed; it downloads nothing.
