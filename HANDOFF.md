# Handoff

State of the bundle for the next person who picks it up. The rules live in
[AGENTS.md](AGENTS.md); this page is the record of where it stands.

## Right now

| | |
|---|---|
| Branch | `Overhaul` — the public-repo and documentation overhaul, unreleased |
| Last release | **0.101.0**, published 2026-11-18 from `f81d7a2` |
| Release tag | `v0.101.0` (on the remote, at the release commit) |
| npm tarball | `https://registry.npmjs.org/@aryacode/dsh-engineering/-/dsh-engineering-0.101.0.tgz` |
| npm shasum (sha1) | `c5e31782ec2e24e244eb759e66f87f8266afb916` |
| npm integrity (sha512) | `sha512-K/+ku6pMYw+t20UGqa5LqjWiCHiUJYuOi4N4D8NmFnUGgJrlc64vHKZyAFBn8meB4stTbCeUtvqNrJPoSTo/fA==` |
| Tarball size | 921 files, 20,107,077 bytes unpacked |
| Market | `@aryacode/dsh-engineering` in `dsh-arya-market`, `releases[0]` = 0.101.0 |
| Stable branch | `main` at `4769ffc` "docs: record the single-branch consolidation" |

Nothing on `Overhaul` is committed, bumped, tagged or published. The release gate is
`pnpm test`; it is green on the branch (`78` spec files in about 34 s) plus
`pnpm check:package`.

The overhaul build itself is packed, installed into the Dev profile and activated there, so the next
step is the release, not another build:

| | |
|---|---|
| Overhaul tarball | `artifacts/aryacode-dsh-engineering-0.101.0.tgz` — 4.8 MB packed, 18.6 MB unpacked, 918 files |
| Overhaul shasum (sha1) | `d162fc6fea74ad029e66a048ac5bd38a45906e7a` |
| Dev profile install | `%LOCALAPPDATA%\AryaCode-dev\home\profiles\desktop` — 0.101.0 from that tarball |
| Dev activation | `live` via its bundle patch, `diagnostics.findings` empty (see below) |

## What the overhaul changes

- **One public surface.** The README is rewritten for a person who has never installed the bundle: what
  each of the ten rows adds, what it needs installed, where it appears, one paste-ready prompt per
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
| The suite | `pnpm test` — 78 spec files, one child process each |
| The tarball contract | `pnpm check:package` — "the tarball is conforming", 17.7 MiB in 915 files |
| What npm would receive | `npm pack --pack-destination artifacts` — 4.8 MB packed, 918 files, 18.6 MB unpacked, shasum `d162fc6f…` |
| The Dev profile install | the packed tarball unpacked over `…\AryaCode-dev\home\profiles\desktop\node_modules\@aryacode\dsh-engineering` (`0.101.0`, `cordis.patch.yml` and `vendor/optix/skills/` present). `pnpm add` cannot run there: the profile pins `@deepseek-ai/dsh-host-webserver@>=0.2.1 <0.3.0-0` and the registry publishes no release in that range, so the install is a file swap over the existing tree |
| The docs agree with the code | `test/docs.spec.mjs`, `test/components.spec.mjs` (row ids, counts, switches, maturity, budgets, owned documents) |
| The tool reference is current | `pnpm docs:check` |
| The catalogue still matches npm | `node ../dsh-arya-market/scripts/check-catalogue-parity.mjs` |
| The Dev activation | `GET /dsh-market/installed` on the Dev host: `installed` resolves to the overhaul tarball, `activation.state` = `live` ("live via its bundle patch"), `diagnostics.findings` = 0 |
| The rendered rows | [docs/images/dev-components.png](docs/images/dev-components.png) — the Plugins page reports `Components 10 total · 8 running · 2 off`; `ecad` and `plc5` are the two that ship off |
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

## Picking it up

1. `git switch Overhaul`, `pnpm install`, `pnpm -r build`.
2. `pnpm test` (needs a full-access shell: the runner spawns a child process per spec).
3. Read [AGENTS.md](AGENTS.md) before changing behaviour; docs are updated in the same change.
4. Install into the Dev home when the release is being tested —
   [docs/development/packaging.md](docs/development/packaging.md) and the release section of
   [AGENTS.md](AGENTS.md) carry the exact commands.
