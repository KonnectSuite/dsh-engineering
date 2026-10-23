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
   `AryaAI/packages/boot/app-boot/src/product-plugins.ts`. Removing the entry stops new
   profiles selecting it; it does nothing else.
2. **Installation dependency** — `apps/cli/package.json` in AryaAI. This manifest is what
   the installer packages, so a dependency left here keeps the plugin installed, listed,
   and shipped even while nothing selects it.
3. **Authored-plugin inventory** — `scripts/release/arya-plugins.json`. While the entry
   remains, the market keeps offering the retired plugin.
4. **Package source** — delete the workspace package under `packages/**` when the bundle
   replaces it, together with its tsconfig aggregate references, tests, docs rows, and
   any viewer registration or bundle patch row.
5. **Profiles** — remove the bundle and dependency entries from each existing profile
   (dev home and installed), plus any patch rows targeting ids the package declared.
6. **Market catalog** — regenerate and publish the catalog without the entry, and verify
   the published URL no longer contains it.

## Verification

- `rg` over the repository finds no reference to the package name outside historical notes.
- The installer's package set (`desktop-packages.json`, `dsh/package.json`) does not list it.
- The Plugins page shows the replacement bundle only; no retired card, no "Built in" row,
  no Problem row.
- A fresh profile and an upgraded profile both compose without the package.

Record the evidence in the retirement change: the commands and the observed output.
