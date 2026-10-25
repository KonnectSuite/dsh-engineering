# Packaging and release

> **Distribution status.** AryaCode installs plugins from the registry, not from the installer. The
> bundle is a meta-package whose `dependencies` pin the component versions, so it must be published
> with **`pnpm publish`** — `npm publish` cannot rewrite `workspace:*` specs and fails. Publish the
> component packages before the bundle, then verify the published `dependencies` carry real versions
> (`0.1.2`, `0.2.0`, …) and never `workspace:*`.
>
> The sections below describe the installer-pinned layout that AryaCode replaced; they remain as the
> record of how the bundle was packed before it moved to the registry.
## Artifacts

Seven tarballs make up a release:

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

The bundle declares its six component packages as **URL dependencies** pointing
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

The four package assets are parts of the bundle, not separately managed plugins.
Each declares `"dsh": { "component": true }`, and the Harness plugin inventory omits
such packages, so the Plugins page lists the Engineering bundle alone rather than
its components. A component also carries no product entry of its own; the bundle
patch is the only composition surface.

## Release steps

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

- A clean profile with `nodeLinker: hoisted` installed the bundle from its
  tarball and resolved all five packages at top level; `SKILL.md` and both
  `lib/client.js` files were present.
- A freshly initialized Web profile lists `dsh-engineering` in
  `dsh.profile.bundles` and `dsh --dump-config` composes every engineering row
  under `# == dsh-engineering`.
- `product-plugins.spec.ts` and `profile.spec.ts` pass in AryaCode (53 tests).
