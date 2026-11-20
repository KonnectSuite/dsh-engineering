# Handoff

State of the bundle for the next person who picks it up. The rules live in
[AGENTS.md](AGENTS.md); this page is the record of where it stands.

## Right now

| | |
|---|---|
| Branch | `main` — the preset retirement shipped as **0.103.0** |
| Last release | **0.103.0**, published 2026-11-20 from `9841f1f` (retirement commit `5d55c6b`) |
| Release tag | `v0.103.0` (on the remote, at the release commit) |
| GitHub release | `https://github.com/KonnectSuite/dsh-engineering/releases/tag/v0.103.0` — created by `release.yml` from the tag, body is the changelog section |
| npm tarball | `https://registry.npmjs.org/@aryacode/dsh-engineering/-/dsh-engineering-0.103.0.tgz` |
| npm shasum (sha1) | `92a84b5b64350ed389041e5e497a50143658b770` |
| npm sha256 (what the catalogue records) | `2e9d14720d7d1c21bca2e9d566d7db8b479959287c8b12ab0424b5d591032419` |
| Tarball size | 896 files, 18,480,029 bytes unpacked (4,763,737 packed) |
| Market | `releases[0]` = 0.103.0 in `dsh-arya-market` branch `catalog`, commit `3c96506`; 44 releases; `check-catalogue-parity.mjs` green |
| CI | `ci.yml` green on `9841f1f`; `release.yml` published the tag's release from the same commit |

Nothing is pending on `main` beyond 0.103.0. Two things are known gaps rather than
work in progress: the two Plugins-page figures in `docs/getting-started.md` were
captured on the 0.102.0 install — ten rows, `ecad` and `plc5` off — and still show
the `preset` row that this release removed, so both need a re-shoot; and the
retirement is proved by the suite, the packaging gate and the payload listing
(`tar -tzf` on the published tarball names no `lib/preset.js` and no path under
`presets/arya-*`; the one `presets/` file it does carry is `presets/billion-context.js`,
which this release keeps on purpose), not on a host — no Dev AryaCode boot has yet
composed a profile without the `engineering-preset` row.

Measured on this machine: `pnpm test` 77 spec files in about 34 s, `pnpm check:package`
17.6 MiB in 893 files (limit 64 MiB), `npm pack --ignore-scripts` 4.7 MB packed, 896 files,
18.5 MB unpacked.

## What the overhaul changes

- **One public surface.** The README is rewritten for a person who has never installed the bundle: what
  each of the nine rows adds, what it needs installed, where it appears, one paste-ready prompt per
  product, the switch table, safety, known limits, and a documentation map whose links work on npmjs
  (absolute GitHub URLs, because npm renders the README without the rest of the repository).
- **A documentation tree with one home per fact**: `docs/getting-started.md` (first session),
  `docs/index.md` (the map), `docs/products/**` (one page per product), `docs/reference/**`
  (components, tools, HMI design, standards checks), `docs/capabilities.md` (the evidence), and
  `docs/port/**` kept as design history.
- **A packaging contract** (`scripts/check-package.mjs`, `test/package.spec.mjs`): identity fields, the
  `dsh` block, every path a mount needs actually shipped by `files`, each row's export target present,
  dependency hygiene, and the unpacked size against the market's 64 MiB cap.
- **Publication-ready identity** in `package.json`: new description (also the Plugins-page and repository
  text), extended keywords, `author`, `publishConfig.access: public`, `NOTICE.md` shipped, `prepack`
  builds the workspace first, `@deepseek-ai/schemastery` declared once, `esbuild` declared.
- **Changelog headings are `## 0.101.0 — 2026-11-18`**, the form the market's release parser reads. The
  old bracketed form silently degraded every market release body to "Published 0.101.0.".
- **GitHub scaffolding**: issue forms, pull-request template, `CONTRIBUTING.md`, `SECURITY.md`, a CI
  workflow (Windows matrix) and a release workflow that turns a `v*` tag into a GitHub Release whose
  body is that version's changelog section.
- **Repository hygiene**: generated previews and harness output (`artifacts/**`, `.l5x-preview/**`) are
  untracked and ignored; the scaffolded Optix template no longer carries SQLite journals;
  `scripts/assemble.mjs` reports a failed copy instead of swallowing it.

## Verified, and how

| What | Evidence |
|---|---|
| The suite | `pnpm test` — 77 spec files, one child process each |
| The tarball contract | `pnpm check:package` — "the tarball is conforming", 17.6 MiB in 893 files |
| What npm received | the published 0.103.0 tarball, downloaded from the registry — 4,763,737 B packed, 18,480,029 B unpacked per `dist.unpackedSize`, sha1 `92a84b5b…`, sha256 `2e9d1472…` equal to what the `catalog` branch records. A fresh `npm pack --ignore-scripts --dry-run` on this tree gives 896 files / 18.5 MB with a **different** shasum (`c6944f63…`): the payload is not byte-reproducible, so the catalogue records the registry copy |
| The Dev profile install | the packed tarball unpacked over `…\AryaCode-dev\home\profiles\desktop\node_modules\@aryacode\dsh-engineering` (`0.101.0`, `cordis.patch.yml` and `vendor/optix/skills/` present). `pnpm add` cannot run there: the profile pins `@deepseek-ai/dsh-host-webserver@>=0.2.1 <0.3.0-0` and the registry publishes no release in that range, so the install is a file swap over the existing tree |
| The docs agree with the code | `test/docs.spec.mjs`, `test/components.spec.mjs` (row ids, counts, switches, maturity, budgets, owned documents) |
| The tool reference is current | `pnpm docs:check` |
| The catalogue still matches npm | `node ../dsh-arya-market/scripts/check-catalogue-parity.mjs` |
| The Dev activation | `GET /dsh-market/installed` on the Dev host: `installed` resolves to the overhaul tarball, `activation.state` = `live` ("live via its bundle patch"), `diagnostics.findings` = 0 |
| The rendered rows | [docs/images/dev-components.png](docs/images/dev-components.png) — the Plugins page reports `Components 10 total · 8 running · 2 off`; `ecad` and `plc5` are the two that ship off. That figure is from the 0.102.0 install, which still carried the `preset` row |
| The README on the surface | [docs/images/dev-components-rows.png](docs/images/dev-components-rows.png) — the plugin page renders the installed build's README ("Where it appears") |

The Dev host was started from `C:\Users\KNPhu\AryaCode\KonnectSuite\AryaCode` (branch `rebrand/identity`,
`@deepseek-ai/dsh-root` 0.2.2-alpha.3) with `ARYACODE_HOME`/`DSH_HOME` pointing at
`%LOCALAPPDATA%\AryaCode-dev\home`. Its Electron **desktop** window cannot start inside an agent
sandbox — the GPU process fails (`error_code=18`) and the renderer exits `launch-failed`; launching
`electron.exe` directly with `--disable-gpu --disable-gpu-sandbox` starts the host and serves the Web
presentation, which is what the evidence above was taken from. Still unproved: the desktop window
itself, and one tool per product exercised end to end. Both need a shell outside the agent sandbox.

## Known gaps

- Every component is `beta`; each one records in `components.json` (`stabilityNote`) what is not proved.
- The vendored Optix tools (32) are not in the generated reference, because their source is not in this
  repository; the Optix pages document them.
- `CHANGELOG.md` still carries pre-overhaul mojibake in historical entries; `scripts/repair-encoding.mjs`
  declines the file ("not a mis-decoding this can undo"), so it is left as written rather than mangled.
- The GitHub Releases before this overhaul (v0.1.0–v0.3.0, 0.73.0) have no changelog body; only releases
  cut from a `v*` tag after this workflow exists will.
- `docs/images/dev-components.png` and `docs/images/dev-components-rows.png` are from the 0.102.0 install
  and still show the `preset` row; both need a re-shoot on a Dev host running the current payload.
- The preset removal is proved by the suite and the packaging gate, not on a host: no Dev AryaCode boot has
  yet composed a profile without the `engineering-preset` row.

## Picking it up

1. `git switch main`, `pnpm install`, `pnpm -r build`.
2. `pnpm test` (needs a full-access shell: the runner spawns a child process per spec).
3. Read [AGENTS.md](AGENTS.md) before changing behaviour; docs are updated in the same change.
4. Install into the Dev home when the release is being tested —
   [docs/development/packaging.md](docs/development/packaging.md) and the release section of
   [AGENTS.md](AGENTS.md) carry the exact commands.
