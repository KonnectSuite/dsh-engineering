# Retiring a legacy plugin

Retiring a plugin is not a catalogue edit. A retired plugin is **fully unmounted,
uninstalled, and gone**: no entry in any layer that can list, install, ship, publish,
or mount it. A partial retirement is a defect, even when the plugin no longer appears
in a new profile.

This rule exists because a product entry was once removed while the installation kept
shipping the package, so the Plugins page still listed the retired plugin as "Built in".

## Checklist

Remove **all** of the following, in the same change:

1. **Product catalogue** — `PRODUCT_PLUGINS` in
   `AryaCode/packages/boot/app-boot/src/product-plugins.ts`. Removing the entry stops new
   profiles selecting it; it does nothing else.
2. **Installation dependency** — `apps/cli/package.json` in AryaCode. This manifest is what
   the installer packages, so a dependency left here keeps the plugin installed, listed,
   and shipped even while nothing selects it.
3. **Authored-plugin inventory** — `scripts/release/arya-plugins.json`. While the entry
   remains, the market keeps offering the retired plugin.
4. **Package source** — delete the workspace package under `packages/**` when the bundle
   replaces it, together with its tsconfig aggregate references, tests, docs rows, and
   any viewer registration or bundle patch row.
5. **Packaging scripts and their tests** — pack lists, payload copies, source-commit
   metadata, and stage tests that name the package. These run only during a release, so
   a stale entry fails at the last step of the installer build.
6. **Generated artifacts** — regenerate every catalog that derives from the package set:
   config catalog, module graph, tool catalog (and its anchor metadata), client slot
   catalog, plugin-package reference, dependency catalog, third-party notices, tsconfig
   paths and the lockfile. A hand-edited catalog drifts from its generator and fails the
   next regeneration.
7. **Profiles** — remove the bundle and dependency entries from each existing profile
   (dev home and installed), plus any patch rows targeting ids the package declared.
   Remove stale profile-local copies from `node_modules` and reconcile the profile
   lockfile; a leftover package shadows the payload even when the bundle is gone.
8. **Market catalog and release assets** — regenerate and publish the catalog without the
   entry, delete the retired tarballs and source metadata from the bundled-plugin
   directory, and verify the published catalog URL no longer contains it.

## Verification

- `rg` over the repository finds no reference to the package name outside historical notes.
- The installer's package set (`desktop-packages.json`, `dsh/package.json`) does not list it.
- A full packaging build passes; a source-only build does not run the packaging pack list.
- The Plugins page shows the replacement bundle only; no retired card, no "Built in" row,
  no Problem row.
- A fresh profile and an upgraded profile both compose without the package, and neither
  resolves a stale profile-local copy.
- The published market catalog does not list it.

Record the evidence in the retirement change: the commands and the observed output.


## MotionWorks IEC retirement record

`dsh-tool-motionworks-iec` 0.7.0 is retired by engineering bundle 0.2.0. Removed in the same change:

- `PRODUCT_PLUGINS` entry in `packages/boot/app-boot/src/product-plugins.ts`.
- `apps/cli/package.json` dependency pin and the `dsh-tool-motionworks-iec-0.7.0.tgz` payload with its source record.
- `scripts/release/arya-plugins.json` entry, so Plugin Market no longer offers it.
- Plugins page scope in `ui-settings-plugin-inventory`, its test fixture, and the third-party notice row.
- README and PRODUCT claims now name `dsh-engineering` 0.2.0 and the redesign.
- The older `dsh-motionworks-iec-use` bundle stays in `RETIRED_BUNDLES` and in the installation-owned tuple fingerprints; it is removed from a profile, not shipped.
