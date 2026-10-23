# AGENTS.md — dsh-engineering

## Documentation rule

A change is not finished until the documentation it invalidates is updated in the same commit.

- **Fix the stale fact where it lives.** A table, diagram, roadmap entry, or command that no longer matches the code is corrected in the same change. Do not defer it to a follow-up.
- **Diagrams are part of the contract.** When the patch, the policy, or the package set changes, update the diagram before merging.
- **Current state only.** Describe what the bundle does now. History belongs to `CHANGELOG.md`, not the README.
- **One home per fact.** README owns what the bundle is and how it composes; `CHANGELOG.md` owns releases; `cordis.patch.yml` comments own why a row is shaped the way it is; `package.json` owns the distribution contract.
- **Locales move together.** A UI string change updates `locale/en.json` and `locale/zh.json` in the same change.
- **Known gaps stay honest.** Anything unverified is listed under Known gaps rather than implied as working.

## Doc map

| File | Owns |
|---|---|
| `README.md` | Purpose, status, composition diagrams, policy table, install, classification, target composition, retirement plan, roadmap, known gaps |
| `CHANGELOG.md` | Released and unreleased changes, one entry per version |
| `cordis.patch.yml` | The composed behavior, with comments explaining why each entry has its shape |
| `package.json` | Name, version, bundle patch path, peer compatibility |
| `test/patch.spec.mjs` | Invariants of the patch file itself |
| `test/docs.spec.mjs` | The prose-to-patch agreement: skills, prefixes, row ids, version heading, locale parity |

## Documentation is checked

`pnpm test` fails when documentation drifts from the code:

- a skill or prefix declared in `cordis.patch.yml` is missing from the README policy table,
- a row id declared in the patch is missing from the README,
- the `package.json` version has no `## [version]` heading in the changelog,
- the English and Chinese locale files disagree on keys,
- the declared bundle patch path does not exist.

When one of these fails, fix the documentation — not the test — unless the documented behavior itself is what changed.

## Commands

```sh
pnpm install
pnpm test
```

## Scope

This repository owns the engineering bundle, its policy layer, and (after the port) the engineering product packages. AryaAI owns the product catalog, the installer payload, and the profile migrations that make this bundle built-in.
