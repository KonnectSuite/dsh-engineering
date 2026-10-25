# Packaging and release

> **Distribution status.** AryaCode installs plugins from the registry. Since 0.3.1
> `@aryacode/dsh-engineering` is **one self-contained package**: the three host components are
> vendored into `vendor/`, both previews ship as its own `lib/client.js`, and its only dependency is
> the Optix component's release tarball. A profile installs one package and toggles rows inside it.
> Publish with **`pnpm publish`** — `npm publish` cannot rewrite `workspace:*` specs and fails — then
> verify the published `dependencies` carry real versions, never `workspace:*`.
>
> The sections below describe the installer-pinned multi-tarball layout that AryaCode replaced; they
> remain as the record of how the bundle was packed before it moved to the registry.

## Current release

```sh
pnpm install
pnpm --filter @aryacode/dsh-engineering-l5x build
pnpm --filter @aryacode/dsh-engineering-ftview build
pnpm --filter @aryacode/dsh-engineering-mwi build
pnpm test                     # including the client face: id, both faces, drift
pnpm build:client             # lib/client.js from both committed face bundles
pnpm assemble                 # vendor/ from the three built components
pnpm pack                     # one tarball: cordis.patch.yml, lib/, vendor/, locale/

npm view @aryacode/dsh-engineering@<version> dependencies   # one entry: the Optix tarball
```

`prepack` runs `build:client` and `assemble`, so a packed tarball cannot carry a stale client bundle
or a missing vendor tree. Inspect the tarball before publishing: `lib/client.js`, `lib/index.js`,
`vendor/*/SKILL.md`, `vendor/l5x/studio-bridge/*.csproj` and `vendor/mwi/code/engine/**` must all be
present.

## History: seven tarballs before 0.3.0

Seven tarballs made up a release:

| Package | Role |
|---|---|
| `dsh-engineering` | the bundle: `cordis.patch.yml` with the tool-exposure policy and the entry rows |
| `dsh-engineering-l5x` | L5X read, editing, studio, live entries and the event handler |
| `dsh-engineering-l5x-viewer` | the folded L5X ladder viewer client face |
| `dsh-engineering-ftview` | FactoryTalk View read, editing and studio entries |
| `dsh-engineering-ftview-viewer` | the folded FTView display preview client face |
| `dsh-engineering-mwi` | MotionWorks IEC session, read, verify and edit entries, the COM bridge and the saved-model engine |
| `@aryacode/dsh-tool-ft-optix` | FactoryTalk Optix Studio discovery, live authoring, preview and OCR |

## Where they are hosted

The repository is private, so GitHub release assets here are not anonymously
fetchable. Releases are published on the public site repository
`KonnectSuite/KonnectSuite.github.io` under the tag `plugins-v<version>`, which
serves the assets without authentication.

Before 0.3.1, the bundle declared its six component packages as **URL dependencies** pointing
at those assets:

```
https://github.com/KonnectSuite/KonnectSuite.github.io/releases/download/plugins-v0.1.0/<name>-0.1.0.tgz
```

pnpm calls these "exotic" subdependencies. Installing the bundle therefore
requires `blockExoticSubdeps: false`:

- the AryaCode workspace sets it in `pnpm-workspace.yaml`, because `apps/cli`
  depends on the packed bundle;
- new profile templates set it in `PROFILE_PNPM_WORKSPACE`, documented in
  `packages/boot/app-boot/src/profile.ts`.

## Component packages

The component packages are parts of the bundle, not separately managed plugins — vendored into
`vendor/` since 0.3.0, and previously separate tarballs.
Each declares `"dsh": { "component": true }`, and the Harness plugin inventory omits
such packages, so the Plugins page lists the Engineering bundle alone rather than
its components. A component also carries no product entry of its own; the bundle
patch is the only composition surface.

## Release steps

The steps in this section are the **pre-0.3.0 record**; use "Current release" above. They built and
published six component tarballs before the components were vendored.

1. Build and pack:

   ```sh
   pnpm --filter dsh-engineering-l5x run build
   pnpm --filter dsh-engineering-ftview run build
   pnpm --filter dsh-engineering-l5x-viewer run build
   pnpm --filter dsh-engineering-ftview-viewer run build
   pnpm --filter dsh-engineering-mwi run build
   pnpm pack --pack-destination dist/<version>            # from each package dir
   pnpm --filter dsh-engineering pack --pack-destination dist/<version>
   ```

2. Publish the five assets on the public site repository:

   ```sh
   gh release create plugins-v<version> --repo KonnectSuite/KonnectSuite.github.io \
     --title "Engineering plugins <version>" --notes-file <notes> \
     dist/<version>/*.tgz
   ```

3. Pin the bundle into the installer:

   ```sh
   # AryaCode checkout
   pnpm run release:sync-installer-plugins
   pnpm install
   ```

   This packs `dsh-engineering` into `apps/desktop/bundled-plugins`, records its
   source commit, and pins `apps/cli` to that tarball. `PRODUCT_PLUGINS` lists
   the bundle with `distribution: 'installer'`, so new Web profiles include it.

## Verification performed

Checked on the 0.3.1 package before publishing:

- `pnpm pack` produced one tarball carrying `lib/client.js` (both faces), `lib/index.js`,
  `cordis.patch.yml`, `vendor/*/SKILL.md`, `vendor/l5x/studio-bridge/*.csproj` and
  `vendor/mwi/code/engine/**`.
- `test/client-face.spec.mjs` materialized the registered factory and mounted both previews against a
  recording client context — the check that catches a face which loads and draws nothing.
- `dsh.client.inject` on the package equals the union of the two retired viewers' lists.
- `dependencies` carries no `@aryacode/*` entry; the Optix tarball is the only one.

Recorded from the pre-0.3.0 multi-tarball layout:

- A clean profile with `nodeLinker: hoisted` installed the bundle from its
  tarball and resolved all five packages at top level; `SKILL.md` and all component bundles were
  present.
- A freshly initialized Web profile lists `dsh-engineering` in
  `dsh.profile.bundles` and `dsh --dump-config` composes every engineering row
  under `# == dsh-engineering`.
- `product-plugins.spec.ts` and `profile.spec.ts` pass in AryaCode (53 tests).
