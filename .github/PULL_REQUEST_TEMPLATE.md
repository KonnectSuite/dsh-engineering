<!-- What changed, and why. Link the issue it closes when there is one. -->

## What changed

## Why

## Checklist

- [ ] The documentation this change invalidates is updated in the same pull request: README, `docs/`, and the comment in `cordis.patch.yml` that owns the row
- [ ] `CHANGELOG.md` has an entry under `## [Unreleased]`, in Added, Changed or Fixed
- [ ] `pnpm test` passes
- [ ] Generated files are regenerated, not hand-edited: `pnpm docs:tools` after a tool change, `pnpm docs:figures` after a change a figure shows
- [ ] Locale files move together: `locale/en.json` and `locale/zh.json` are both updated here
- [ ] `pnpm check:package` passes when the change touches `package.json`, `files` or the assembled tarball
- [ ] A new or changed component is recorded in `components.json` with its maturity fields, as `docs/reference/components.md` describes
- [ ] No version bump, tag or publish: a release is a batch on the owner's request
- [ ] Nothing in the installed AryaCode is modified (`%LOCALAPPDATA%\Programs\AryaCode`, `~/.aryacode`); testing happens on Dev AryaCode

## How it was tested

<!-- The command, the export or project it ran against, and the result. "It builds" is not evidence that a tool works. -->
