# Packaging and release

> **Distribution status.** AryaCode installs plugins from the registry. Since 0.4.0
> `@aryacode/dsh-engineering` is **one self-contained package**: the three host components are
> vendored into `vendor/`, both previews ship as its own `lib/client.js`, and its only dependency is
> the Optix component from the registry, as a plain version range. A profile installs one package and
> toggles rows inside it. Publish with **`pnpm publish`** — `npm publish` cannot rewrite `workspace:*`
> specs and fails — then verify the published `dependencies` carry real versions, never `workspace:*`
> and never a URL.
>
> The sections below describe the installer-pinned multi-tarball layout that AryaCode replaced; they
> remain as the record of how the bundle was packed before it moved to the registry.

## Current release

```sh
pnpm install
pnpm --filter @aryacode/dsh-engineering-l5x build
pnpm --filter @aryacode/dsh-engineering-ftview build
pnpm --filter @aryacode/dsh-engineering-mwi build
node node_modules/typescript/bin/tsc -p packages/ecad/tsconfig.json   # ECAD engine, tools and DWG bridge
pnpm test                     # patch, docs, tool reference, dependencies, client face
pnpm build:client             # lib/client.js from the committed face bundles (three faces)
pnpm assemble                 # vendor/ from the four component trees plus the ECAD wasm asset
pnpm pack                     # one tarball: cordis.patch.yml, entries/, lib/, vendor/, locale/

pnpm publish --no-git-checks --access public     # npm is the artefact host
npm view @aryacode/dsh-engineering@<version> dependencies   # four libraries, no plugin

# then, in the dsh-arya-market clone: record the version the registry now serves
node scripts/publish-arya-catalog.mjs --pull
node scripts/publish-arya-release.mjs --source KonnectSuite/dsh-engineering --npm <version>
node scripts/publish-arya-catalog.mjs --push

git tag -a v<version> -m "Engineering bundle <version>"      # provenance, in this repo
git push origin main --tags
```

`prepack` runs `build:client` and `assemble`, so a packed tarball cannot carry a stale client bundle
or a missing vendor tree. Inspect the tarball before publishing: `lib/client.js`, `entries/*.js`,
`vendor/optix/lib/index.js`, `vendor/l5x/cip-worker.mjs`, `vendor/l5x/studio-bridge/*.csproj`,
`vendor/mwi/code/engine/**` and `vendor/ecad/assets/acadrust.wasm` must all be present. The packaged
smoke calls a real ECAD tool from the tarball (see the release body) so the bundled engine, DOM
shim and DWG converter are exercised from the published bytes, not from the repository build.

**0.87.1 release record (2026-11-05).** Built from `Release 0.87.1` (`a434f10`), tagged `v0.87.1`.
Removed the ECAD composer status bar: the face no longer registers `conversation.input.dock`. Root
suite 42 files / 398 tests green, ECAD typecheck and `docs:check` current, build deterministic. The
published tarball is 3.9 MB / 14.2 MB unpacked / 743 files,
sha256 `1bce93497af675a21c62e68f1c4bb497a7ccb88090cf1d0234023e041ea3219b`; the packaged
`lib/client.js` contains the focus-mode control and no `ecad-sheet-set` registration, and the
packaged L5X tree still carries `l5x_compose_logic` and the no-project skill guidance. The market
`catalog` branch records the same tarball and sha256.

**0.87.0 release record (2026-11-04).** Built from `Release 0.87.0` (`51a2baa`), tagged `v0.87.0`.
Root suite 42 files / 398 tests, eight package typechecks, L5X 562/562, ftview 304 passed / 3 skipped,
mwi 64/64, migration 60/60, `docs:check` and `resources:check` current. `pnpm -r build` + `assemble`
were deterministic; the packed tarball is 3.9 MB / 14.2 MB unpacked / 743 files,
sha256 `ab691ac915b3b5d5ce4f13f604696a2f42dd0e02ba78aaf12c0b152b0f21e9f6`. The packaged-bytes smoke
extracted the published tarball and called `l5x_compose_logic`, which registered 17 tools and returned
`[XIC(Start),XIC(Run)]XIO(Stop)OTE(Run);` with `Start`/`Stop`/`Run` BOOL declarations, coverage marked
unverified and **no file written**. The registry serves 0.87.0 as `latest`; the market
`catalog` branch records the same tarball and sha256.

**One host for every entry.** The catalog points at `registry.npmjs.org` tarballs; the market repo
holds the catalog JSON and nothing else. A GitHub release asset is not part of this flow — the
`--tarball` mode of `publish-arya-release.mjs` still exists for packages that cannot be published to
the registry, but no Arya entry uses it. Because npm publishing is staged, publish first and record the
catalog entry after the version is visible in `npm view`.

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

Before 0.4.0, the bundle declared its six component packages as **URL dependencies** pointing
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

Checked on the 0.4.0 package before publishing:

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
