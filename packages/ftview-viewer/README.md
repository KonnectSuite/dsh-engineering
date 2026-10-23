# dsh-engineering-ftview-viewer

The FactoryTalk View ME display preview, folded into the `dsh-engineering` bundle.

## Provenance

The client bundle is copied from `dsh-tool-factorytalk-view` **0.3.0**
(`client.js`) with its module-loader id and its internal document slot key
rewritten to `dsh-engineering-ftview-viewer`, so this bundle serves and
registers the preview under its own package name. The host half is a no-op
entry; the package exists for its client face.

The preview renders an exported ME display at its exported geometry from the
document XML, and falls back to the raw source for XML that is not a display
export. It claims `.xml` document previews and also registers a Better Sidebar
file viewer.

## Mounting

The bundle row `ftview-viewer` is inserted `disabled: true` until the old
`dsh-tool-factorytalk-view` plugin is retired, because both claim `.xml`
previews. Enabling the row is the last step of that retirement.

## Tests

The preview has no tests of its own in this repository. Its behavior is covered
by the old plugin's published client and was visually verified there; this
package only re-registers it under the bundle name.
