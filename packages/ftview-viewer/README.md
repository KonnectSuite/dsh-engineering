# dsh-engineering-ftview-viewer

The FactoryTalk View ME display preview client face of the `dsh-engineering` bundle.

The host half is a no-op entry; the package exists for its `dsh.client` module. It renders an
exported ME display at its exported geometry from the document XML, and falls back to the raw source
for XML that is not a display export. It claims `.xml` document previews and registers a Better
Sidebar file viewer, and is mounted by the `ftview-viewer` row.

The viewer is independent of the FactoryTalk View tools rows: switching `ftview-read` or
`ftview-edit` off does not remove it.

## Provenance

The client bundle was carried over from the retired `dsh-tool-factorytalk-view` plugin (`client.js`)
with its module-loader id and internal document slot key rewritten to
`dsh-engineering-ftview-viewer`, so the bundle serves and registers the preview under this package
name.

## Tests

The preview has no tests of its own in this repository. Its behavior was covered by the retired
plugin's published client; this package re-registers it under the bundle name.
