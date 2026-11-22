# Contributing

This repository is the AryaCode engineering bundle: one package that mounts a row per toolchain -
Studio 5000 L5X, FactoryTalk View ME, FactoryTalk Optix, MotionWorks IEC, RSLogix 5 program reads,
and SLC 500 / PLC-5 to Logix migration. It is MIT licensed. Contributions
are accepted under the same terms.

Read `AGENTS.md` first; it is the binding rule set for this repository and this file only explains
how to work inside it. The documentation map is `docs/index.md`.

## Requirements

- Node.js `^22.19.0 || >=24.0.0` (the `engines` field in `package.json`). CI uses Node 24.
- pnpm. The lockfile is pnpm version 9; pnpm 10 and later read it. CI uses the version named in
  `package.json`'s `packageManager` field, and falls back to pnpm 10 while that field is absent.
- Git, on Windows, Linux or macOS for editing. The bundle targets all three, but CI runs on
  `windows-latest` only: every product it drives — Studio 5000, FactoryTalk View ME, FactoryTalk Optix,
  MotionWorks IEC, RSLogix 5 — is a Windows product, so a Linux job would test a configuration nobody runs.

On Windows the test suite starts one child process per spec file, so it needs an unrestricted
spawn. Run it from a normal terminal, or from AryaCode with the `danger-full-access` file policy.
Do not wrap `pnpm test` in a sandbox of your own and do not split it into per-file steps: the
runner owns that order.

## Build and test locally

```sh
pnpm install
pnpm -r build       # packages/*/lib is gitignored build output, and several checks read it
pnpm test           # the whole suite: one child process per spec file
pnpm docs:check     # fail when the generated tool reference or print CSS is stale
pnpm check:package  # what the tarball would ship, and how big it is, without publishing
pnpm docs:tools     # regenerate docs/reference/tools.md and tools.json after a tool change
```

`pnpm -r build` comes before the checks because `packages/*/lib` is not committed. `pnpm test` also
enforces the agreements this repository relies on: the generated tool reference, the component
manifest against `cordis.patch.yml`, the package contract, the English and Chinese locale files,
and the prose that names a row or a tool.

Two rules about that output:

- Never hand-edit `docs/reference/tools.md` or `docs/reference/tools.json`. They are generated;
  run `pnpm docs:tools` and commit the result. `pnpm test` fails while they are stale.
- Do not commit build output, a packed tarball or `.l5x-preview/`. They are gitignored on purpose.

## Branch and pull request

Branch off `main`, keep one concern per pull request, and open it against `main`. CI runs
`.github/workflows/ci.yml` on every push and every pull request, on `windows-latest`; a pull request is
not merged while a check is red.

Three things are part of the change, not a follow-up:

- **Documentation.** A change updates the documentation it invalidates in the same pull request.
  One fact has one home: the README owns what the bundle is and how it composes, `docs/` owns the
  detail, the comments in `cordis.patch.yml` own why a row is shaped the way it is, `package.json`
  owns the distribution contract, and the generated tool reference owns the tool inventory.
- **A changelog entry.** Stage it under `## [Unreleased]` in `CHANGELOG.md`, in Added, Changed or
  Fixed, in the present tense the existing entries use. Say what changed and, when there is a
  measurement, give the number.
- **Locales.** A user-visible string changes `locale/en.json` and `locale/zh.json` together.

Do not bump the version, do not create a tag and do not publish. A release is a batch the owner
asks for; a change staged today ships with the next batch.

Write a commit subject that says what changed, and put the reason in the body. Keep the branch to
the change: no unrelated reformatting, no dependency bump that the change does not need.

## Adding a component

The checklist lives in `docs/reference/components.md`, under "Adding a component". It covers the
whole set: a package under `packages/<id>`, an entry and an export in the root `package.json`, a
patch row plus its entry in `test/patch.spec.mjs`, a skill with a budget, a capability probe when
the work needs something outside the files, an evidence gate, the `components.json` entry with its
maturity fields, a README row, a document under `docs/`, fixtures from a real export, and the
suite run that pins the remaining counts.

Two things it states plainly and are easy to miss: never edit `packages/l5x` to host another
product, and a new component enters as `beta` or `experimental` with a `stabilityNote` saying what
is not proved yet. Only a later release that leaves the evidence behind moves it to `stable`.

## Testing against the host

Never modify the installed AryaCode: `%LOCALAPPDATA%\Programs\AryaCode` (payload, `app.asar`,
runtime) and `~/.aryacode` (profiles, `node_modules`, `userData`) are the user's live product. Do
not patch them, do not edit a profile's `package.json` to work around a bug, and do not stop or
reinstall that instance.

Test on Dev AryaCode instead, with its home at `%LOCALAPPDATA%\AryaCode-dev\home`: pack the bundle
(`pnpm pack`), install that tarball into the Dev profile, compose the profile, then boot Dev
AryaCode. The suite and the packaging check prove the code; only a boot proves the composition.

If a fix seems to need a change inside the installed copy, it belongs upstream in
`KonnectSuite/AryaCode`, verified on Dev AryaCode and shipped as a harness patch - not as a local
edit here.

## Releases

Releases ship in batches, only on the owner's request, and the steps are in
`docs/development/packaging.md`: bump the version, move the `## [Unreleased]` entries under it, run
`pnpm test`, `pnpm -r build`, `pnpm assemble`, `pnpm publish`, tag `vX.Y.Z`, then record the version
in the market catalogue. npm is the artefact host, so no GitHub release asset is attached.

The tag also runs `.github/workflows/release.yml`, which turns the changelog section for that
version into a GitHub Release marked latest. Publishing to npm is not part of that workflow: it
happens from the owner's machine, because npm trusted publishing is bound to one repository and one
workflow.

## Reporting a problem

Bugs and feature requests use the issue forms. Security problems are reported privately, as
`SECURITY.md` describes; do not open a public issue for one.
