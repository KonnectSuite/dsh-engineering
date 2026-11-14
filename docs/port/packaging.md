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

**0.94.1 release record (2026-11-14).** Built from `fix(optix): ask for the screen box and keep a
new project out of the workspace root` (`f3005c4`) plus the `Release 0.94.1` bump (`e769a10`), tagged
`v0.94.1`. Two defects an operator hit on the first real scaffold: `optix_template` copied a 1920x1080
starter without asking the display size, and it unpacked the copy straight into the workspace folder, so
Studio opened `...\Optix Demo\AryaNewHMIProject_IPC.optix` and warned `423 - The current project name
'AryaNewHMIProject_IPC' does not match the project folder name 'Optix Demo'`. `width`/`height` are now
required with `destination` and refused when missing, and the copy lands in `<destination>/<name>` unless
the destination already carries the project name. Release evidence: the packed tool refused a scaffold with
no canvas and then produced `workspace-installed/PanelApp/PanelApp.optix` (58 files, 800x480, bridge 1.0.9)
from the installed bundle; `test/optix-scaffold.spec.mjs` grew to 6 tests; `pnpm test` 50 files passed
(37,324 ms); `pnpm docs:tools` 158 tools; `pnpm -r build` + `pnpm assemble` clean; `pnpm publish`
→ `0.94.1`; `scripts/verify-release.mjs --wait 300` answered ok for the registry tarball the moment the
edge caught up (no `409 previously staged` this time, because the publish was not retried); the market
`release-plugin.mjs` recorded the registry bytes (`sha256 e708f5c541dc…`) rather than this machine's pack
(`a4fde89272cf…`), which is the documented immutability rule, and the catalogue and `latest` both read
`0.94.1`.

**0.94.0 release record (2026-11-14).** Built from `feat(optix): scaffold a project, arm one that has
no bridge, and keep the IDE in the engineer's hands` (`6a2abb2`) plus the `Release 0.94.0` bump
(`11a3a35`), tagged `v0.94.0`. Root suite **50 files green** (`pnpm test`, 23,431 ms), `pnpm -r build` +
`assemble` (eight components) deterministic, published `2026-11-14T18:09:25Z`: 4.0 MB, 787 files, npm
serves it as `latest` and the catalogue records the registry copy (`sha256 cfefa597640d…`, this
machine's repack `0d64715cd519…` — the prepack rebuild means two packs of the same tree never match,
so the registry copy is what the catalogue carries). Release evidence calls the tools that changed:
`optix_template` scaffolded `…\Projects\LineDemo` (34 files, bridge 1.0.9, 1920×1080), the engineer
opened/built/`StartBridge`-ed it, then `optix_edit`/`optix_screen` created four tags, a `PanelLoader`
and two screens (126 and 106 ops, `optix_design_check` 0 findings each, `optix_production_check`
`review` with only the two `PROD-04` built-in-user warnings), `optix_emulator` started the runtime and
the rendered app switched panels on a click
(`docs/port/optix-live-proof/15-linedemo-overview-runtime.png`, `16-linedemo-controls-runtime.png`).
One measured wrinkle for the next release: `npm view` served `0.93.0` for about ninety seconds after
the publish finished, and a second `npm publish` during that window answers `409 … previously staged
version` — that message means "already published, the edge has not caught up", not "waiting for
approval"; `scripts/verify-release.mjs --wait` is the way to confirm, and the market script skips the
publish once it sees the registry copy.
**0.93.0 release record (2026-11-13).** Built from `feat(ecad): make the row a review-and-view row,
not a CAD editor` (`bf16673`), tagged `v0.93.0`. Root suite 19 specs green (166 tests) and the ECAD
package 21 specs green (182 pass, 4 skipped — the AryaCAD fixture skips rather than fakes, because the
application is GPL-3.0 and this bundle MIT), `pnpm docs:check` clean (**158 tools**, down from 174:
the ECAD row registers twelve, not sixteen), and `pnpm -r build` + `assemble` (eight components)
deterministic. **Two ECAD specs were deliberately not run:** `dwg.spec.mjs` and `corpus.spec.mjs` push
the whole 34-sheet print corpus through the `acadrust` converter, which aborts intermittently with
`memory access out of bounds` — the retry wrapper at `packages/ecad/src/dwg/index.ts` documents it, and
the batch died on it twice — so the DWG round trip is unverified for this release. The published
tarball is 3.9 MB / 774 files, sha256
`db6c1da91afb96ecfcfe19641c492160e1097dfbb3a036648407c347e3658d35`. The market script's own repack
again did not match (`5990d2af37d4…`) for the same manifest-normalisation reason, and it records the
registry copy. The registry held the version staged for **nine minutes** — `npm view` answered for the
exact version only after 540 s, against 0.92.0's five and a half — so a waiting release is normal, not
a failure. One thing this release ships unverified: the live AryaCAD MCP bridge. The overlay, an
`ecad_capabilities` answer of `mounted`, and one edit round-tripped through `ocs_save_verified` into
`ecad_compare` have not been run against a real instance; `docs/port/ecad.md` says so plainly.

**0.92.0 release record (2026-11-12).** Built from `Release 0.92.0` (`917d948`), tagged `v0.92.0`.
Root suite 47 specs green — four new Optix specs (`optix-chain` 20 tests, `optix-arm` 7,
`optix-template` and `optix-emulator` 7) — `pnpm docs:check` clean (174 tools), and `assemble`
(eight components) deterministic. The Optix row grew from 9 tools to 12, so the recorded default-on
ceiling is 150 tools. Published with `pnpm publish --no-git-checks --access public`, whose `prepack`
rebuilds the three faces and the vendor tree, so the tarball cannot carry a stale client bundle. The
published tarball is 4.0 MB / 772 files, sha256
`82e59f39ee8bceced9d592f7ad256cad0c28f68cf5b4a641888d930210ff50ad`. The packaged-bytes smoke
extracted that tarball and called the new Optix code **from the published bytes**: the runtime
discovery found the real `FTOptixRuntime.exe` under the Studio install, `emulatorStatus` reported the
project's web engine serving `200`, and a chain probe returned `next: ""` with the browser launchable
and Tesseract plus its `eng.traineddata` present — the whole preview chain satisfied on a machine with
no help from the repository build. Two release mechanics notes: the registry again held the version
staged (about five and a half minutes before `npm view` answered `latest = 0.92.0`), and this time the
market script's own repack did **not** match the registry bytes (`3a854c2a7060…` against
`82e59f39ee8b…`) because `pnpm publish` normalises the manifest inside the tarball; the script records
the registry copy, which is the copy the catalogue must point at. The registry now serves 0.92.0 as
`latest`; the market `catalog` branch records the same tarball and sha256, and `arya-release-status`
reports the plugin in sync across repo, npm and catalogue.

**0.91.0 release record (2026-11-12).** Built from `Release 0.91.0` (`9356b3d`), tagged `v0.91.0`.
Root suite 43 specs green (the default-on schema ceiling moved to 127,423 with the measured 122,522
characters), l5x vitest 573 passed — new `copy-format` 7 tests and `io-alias-tags` 4 tests — and
`pnpm --filter @aryacode/dsh-engineering-l5x typecheck` plus `pnpm docs:check` (162 tools) clean;
`pnpm -r build` + `assemble` (eight components) deterministic. The published tarball is 4.0 MB /
14.5 MB unpacked / 766 files, sha256 `71a9b6c26b2ca56e0467d61dd7ca9d21f8a947e5903ba55d1146d7f26c766bad`.
The registry held the version in a staged state for about five minutes after `npm publish` printed
"being processed": `npm view` still answered `latest = 0.90.0`, so the first `release-plugin` run found
nothing published and its own publish attempt was refused with `E409 … Cannot publish over previously
staged version`. Run the market step only once the registry serves the version. The registry now serves
0.91.0 as `latest`; the market `catalog` branch records the same tarball and sha256, and
`arya-release-status` reports the plugin in sync across repo, npm and catalogue.

**0.90.0 release record (2026-11-09).** Built from `Release 0.90.0` (`ff812c8`), tagged `v0.90.0`.
Root suite 43 specs green (the tool reference now names 162 tools, and `components.json` carries eight
components), plc5 vitest 17 passed / 1 skipped (census, container, `rslogix5` and the eight tool
definitions); `pnpm -r build` + `assemble` (eight components) deterministic. The published tarball is
3.8 MB / 14.4 MB unpacked / 766 files, sha256 `b34f5a17450c0d3e07ff195ffeaef1ea92c67950924baddedcda8bdf7044a0de`;
the packaged-bytes smoke extracted the published tarball and mounted its `vendor/plc5` row: the eight
`plc5_*` tools registered, `plc5_capabilities` answered honestly on this host (`com_server: false`, the
"RSLogix 5 is not usable on this machine" summary), `plc5_open` on a missing path refused with
`FILE_MISSING` and the "Pass an existing .RSP project path" fix, and the packaged `rslogix-5` skill
exported its body and path. The registry serves 0.90.0 as `latest`; the market `catalog` branch records
the same tarball and sha256.

**0.89.0 release record (2026-11-08).** Built from `Release 0.89.0` (`5ba019a`), tagged `v0.89.0`.
Root suite 43 specs green, ftview vitest 319/319 (new: alarm drafts 10 tests, component package 5
tests); `pnpm -r build` + `assemble` (seven components) deterministic. The published tarball is
3.8 MB / 14.3 MB unpacked / 750 files, sha256 `723d8564c0a6b134b12c5f75557e1eb7a2cdb5ff0f04cbe7062115359ab76e2e`;
the packaged-bytes smoke extracted the published tarball, installed its runtime dependencies, and ran
the alarm drafting flow end-to-end (`ftview_draft_alarm_add` staged, `ftview_validate` reported
`Alarms/Alarms.xml` with the `ALARM_PLACEHOLDER_LABEL` finding riding along, `ftview_apply` wrote the
wizard-numbered T2/M2 rows and the backup-first alarm import steps into `IMPORT.md`) and
`ftview_component_package` on a real export folder (list file with `<category>/<component>` rows,
copies, and the `SEAddComponent CC019_Main ME / "…" overwrite` command returned; `Main:2` refused with
`COMPONENT_PACKAGE_FAILED` and the forbidden-characters fix). The registry serves 0.89.0 as `latest`;
the market `catalog` branch records the same tarball and sha256.

**0.88.0 release record (2026-11-08).** Built from `Release 0.88.0` (`55a273a`), tagged `v0.88.0`.
Root suite 43 specs green, migration vitest 67/67 (9 new tests: candidates, wizard-defaults audit,
`.SLC` accept, bounded payload, `wizard_artifact` open item), l5x vitest 562/562; `pnpm -r build` +
`assemble` (seven components) deterministic. The published tarball is 3.9 MB / 13.6 MB unpacked /
748 files, sha256 `1300c487d63fa8351189a35f06eabc91a0aed3222e796f8870f256fd070a6380`; the
packaged-bytes smoke extracted the published tarball and called `migration_report` on a `.SLC`
legacy side (no error, 3 rungs read, rows capped at 2 of 5 totals, no non-finite numbers in the
JSON, report written) and `migration_assess` on an imported `.L5X` (wizard-defaults audit fired
all six rules with one blocking `MODULE_NAME_ILLEGAL`), plus a wrong-extension probe refused with
the `.RSS, .ACH, .RSP or .SLC` message. The registry serves 0.88.0 as `latest`; the market
`catalog` branch records the same tarball and sha256.

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
