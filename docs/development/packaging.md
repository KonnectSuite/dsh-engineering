# Packaging and release

What the tarball contains, how it is built, and how a version reaches npm and the plugin market. The
distribution model itself (one package, one row per product, vendored components) is explained in
[architecture.md](../architecture.md).

## What ships

`package.json` `files` is the whole answer:

| Path | Why it ships |
|---|---|
| `cordis.patch.yml` | The bundle patch a profile mounts: nine rows, each naming an export of this package |
| `entries/**/*` | One entry module per row — the plugin the row mounts |
| `lib/**/*` | The package root (`index.js`, `typert.host.js`) and the one `client.js` browser bundle |
| `src/remote/**/*` | The drawing Remote service the viewer calls |
| `vendor/**/*` | The eight assembled component trees, including each component's `SKILL.md`, plus the drawing viewer payload |
| `locale/*.json` | The English and Chinese UI strings |
| `presets/**/*` | The billion-context compaction gate adapter |
| `README.md`, `LICENSE`, `NOTICE.md` | The public face and the third-party notices |

Nothing else: `test/`, `scripts/`, `docs/`, `tmp/` and `artifacts/` are repository state, not payload.
`pnpm check:package` proves it — every path a mount needs at run time is matched by `files` and exists on
disk, every row's export target is present, and the unpacked size is reported against the market's
64 MiB cap (21.6 MiB today, dominated by `vendor/ecad/assets/acadrust.wasm`).

It also reads every bare import the node-side payload makes — `entries/`, `lib/`, `presets/` and
`vendor/`, minus the browser faces — and reports one the manifest does not declare. A copy that happens to
resolve because the host hoisted it is not a declared dependency: the vendored Optix build output needed
`@deepseek-ai/dsh-tools` and `@deepseek-ai/dsh-subprocess` that way. Both are now peer dependencies (the
host provides them) plus a dev dependency at the version this repository resolves.

## Build order

```sh
pnpm install
pnpm -r build          # each workspace package's lib/ (gitignored build output)
pnpm build:client      # lib/client.js from the four faces (committed; the suite fails when stale)
pnpm assemble          # vendor/ from the eight components' build output, plus the drawing viewer payload
pnpm test              # patch, docs agreement, packaging, tool reference, dependencies, client face
pnpm check:package     # what npm would receive, and how big it is
```

`prepack` runs the build, the client bundle and the assemble step, so a tarball cannot carry a stale
client bundle or a missing vendor tree. `scripts/assemble.mjs` refuses a component whose `lib/` is older
than its `src/` and names a copy that fails instead of skipping it silently.

`packages/optix` is the exception: it has no source in this repository, so its `lib/` is tracked and is
the source of truth (`.gitignore` keeps `!packages/optix/lib/`).

## Release

Release in batches, only on request. The full sequence, with the measured npm lag and the market step, is
in [AGENTS.md](../../AGENTS.md) under *Contract, upgrade and release rules* and *Releasing: the market
step is not optional*.

A version is released when all four are true: `npm view @aryacode/dsh-engineering@<version> version`
answers, the tarball downloads, the market's `data/arya-plugins.json` lists it with the registry's
`sha256`, and `check-catalogue-parity.mjs` is green. A GitHub Release is cut by
`.github/workflows/release.yml` from the `v<version>` tag, with that version's changelog section as its
body.

## Verifying a release on this machine

```sh
npm view @aryacode/dsh-engineering@<version> version dist.fileCount dist.unpackedSize dist.shasum
node scripts/verify-release.mjs --wait 600          # tarball downloads and its files match the manifest
node ../dsh-arya-market/scripts/release-plugin.mjs --skip-build --skip-tests
node ../dsh-arya-market/scripts/check-catalogue-parity.mjs
```

The pre-registry packing history — the multi-tarball layout the installer used before 0.4.0 — is kept as
[packaging-record.md](../port/packaging-record.md).
