# AGENTS.md — dsh-engineering

## Documentation rule

A change is not finished until the documentation it invalidates is updated in the same commit.

- **Fix the stale fact where it lives.** A table, diagram, roadmap entry, or command that no longer matches the code is corrected in the same change. Do not defer it to a follow-up.
- **Diagrams are part of the contract.** When the patch, the policy, or the package set changes, update the diagram before merging.
- **Current state only.** Describe what the bundle does now. History belongs to `CHANGELOG.md`, not the README.
- **One home per fact.** README owns what the bundle is and how it composes; `CHANGELOG.md` owns releases; `cordis.patch.yml` comments own why a row is shaped the way it is; `package.json` owns the distribution contract; `docs/reference/tools.md` owns the tool inventory.
- **Locales move together.** A UI string change updates `locale/en.json` and `locale/zh.json` in the same change.
- **Known gaps stay honest.** Anything unverified is listed under Known gaps rather than implied as working.
- **The tool reference is generated.** Never hand-edit `docs/reference/tools.md` or `tools.json`; run `pnpm docs:tools` after changing a tool. `pnpm test` fails when they are stale.

## Doc map

| File | Owns |
|---|---|
| `README.md` | Purpose, the component table and defaults, composition diagrams, policy table, install, tools summary, requirements, safety, documentation map, known gaps |
| `docs/architecture.md` | Row model, service injection, configuration, policy wiring, client faces, distribution, compatibility |
| `docs/examples.md` | End-to-end sessions for L5X and FactoryTalk View, with call shapes and reporting reminders |
| `docs/reference/tools.md` | Every registered tool, its description and parameters (generated) |
| `docs/reference/tools.json` | The machine-readable tool and group inventory used by the policy test (generated) |
| `CHANGELOG.md` | Released and unreleased changes, one entry per version |
| `cordis.patch.yml` | The composed behavior, with comments explaining why each entry has its shape |
| `package.json` | Name, version, bundle patch path, dependencies, peer compatibility |
| `scripts/gen-tool-reference.ts` | The generator for the reference and inventory |
| `test/patch.spec.mjs` | Invariants of the patch file itself |
| `test/docs.spec.mjs` | The prose-to-patch agreement: skills, prefixes, row ids, version heading, locale parity |
| `test/tool-reference.spec.mjs` | The reference freshness, policy coverage and unique tool names |
| `docs/port/*.md` | Port decisions and measurements, kept as design history |

## Documentation is checked

`pnpm test` fails when documentation drifts from the code:

- a skill or prefix declared in `cordis.patch.yml` is missing from the README policy table,
- a row id declared in the patch is missing from the README,
- the `package.json` version has no `## [version]` heading in the changelog,
- the English and Chinese locale files disagree on keys,
- the declared bundle patch path does not exist,
- a registered tool is not governed by a skill capability,
- a capability names a tool the bundle does not register,
- `docs/reference/tools.md` or `tools.json` is stale.

When one of these fails, fix the documentation — not the test — unless the documented behavior itself is what changed.

## Contract, upgrade and release rules

- **Test the host contract with the host's services.** Declare only the services the bundle uses, and test one real composition that mounts it through a profile with the harness's own `fs`, `tools` and `skills`. A fake is a double, not the contract: mirrors must return what the host returns (`fs.resolve` yields an `FsTarget`, not a string). A string-returning fake hid the target change and shipped a broken ACD export.
- **Test the upgrade path.** A profile with an older local copy of the bundle or a component must not keep loading it after the installer updates the payload. Cover N-1 → N, assert the components resolve from the installed payload, and prune stale copies; a leftover package shadows the payload even when resolution prefers the installation.
- **Release evidence calls a changed tool.** The packaged smoke must exercise at least one tool whose behavior changed, end to end, and the release body records the command and result. A boot smoke and a green unit suite do not prove a tool works.
- **Every documented switch or command is checked.** Generated inventories and policy coverage are mandatory; a README claim without a test is a defect.
- **Tag the release commit.** Create `vX.Y.Z` in this repository at the commit the bundle was built from; artifacts live on the download host, but the tag is what maps payload to source.
- **Withholding is documented.** If this bundle stays private or out of the market index, the README records that decision and the reason.

Retirement includes packaging scripts and their tests, generated catalogs and profile-local packages; follow `docs/port/retirement.md`.

## Commands

```sh
pnpm install
pnpm test          # patch, docs agreement, tool reference and policy coverage
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
```

## Scope

This repository owns the engineering bundle, its policy layer, and the engineering product packages. AryaCode owns the product catalog, the installer payload, and the profile migrations that make this bundle built-in.
