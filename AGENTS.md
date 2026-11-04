# AGENTS.md — dsh-engineering

## Documentation rule

A change is not finished until the documentation it invalidates is updated in the same commit.

- **Fix the stale fact where it lives.** A table, diagram, roadmap entry, or command that no longer matches the code is corrected in the same change. Do not defer it to a follow-up.
- **Diagrams are part of the contract.** When the patch, the row set, or the package set changes, update the diagram before merging.
- **Current state only.** Describe what the bundle does now. History belongs to `CHANGELOG.md`, not the README.
- **One home per fact.** README owns what the bundle is and how it composes; `CHANGELOG.md` owns releases; `cordis.patch.yml` comments own why a row is shaped the way it is; `package.json` owns the distribution contract; `docs/reference/tools.md` owns the tool inventory.
- **Locales move together.** A UI string change updates `locale/en.json` and `locale/zh.json` in the same change.
- **Known gaps stay honest.** Anything unverified is listed under Known gaps rather than implied as working.
- **The tool reference is generated.** Never hand-edit `docs/reference/tools.md` or `tools.json`; run `pnpm docs:tools` after changing a tool. `pnpm test` fails when they are stale.

## Doc map

| File | Owns |
|---|---|
| `README.md` | Purpose, the component table and defaults, composition diagrams, the switch table, install, tools summary, requirements, safety, documentation map, known gaps |
| `docs/architecture.md` | Row model, service injection, configuration, row switches, client faces, distribution, compatibility |
| `docs/examples.md` | End-to-end sessions for L5X and FactoryTalk View, with call shapes and reporting reminders |
| `docs/capabilities.md` | The figures: which call produced each one, and what an image cannot prove |
| `docs/reference/tools.md` | Every registered tool, its description and parameters (generated) |
| `docs/reference/tools.json` | The machine-readable tool and group inventory (generated) |
| `components.json` | The component manifest: kind, capability class, default posture, tool namespace, row, entry, package, tools, skill and its budget, probe, evidence gate, owning documents, and the default-on context budget |
| `docs/reference/components.md` | What a component is, the capability classes, the manifest fields, the context budget, the checklist for adding one and the growth policy |
| `docs/reference/migration.md` | The migration row: the two tools, the formats, the lint rules, the five-step workflow and its limits |
| `CHANGELOG.md` | Released and unreleased changes, one entry per version |
| `cordis.patch.yml` | The composed behavior, with comments explaining why each entry has its shape |
| `package.json` | Name, version, bundle patch path, dependencies, peer compatibility |
| `scripts/gen-tool-reference.ts` | The generator for the reference and inventory |
| `test/patch.spec.mjs` | Invariants of the patch file itself |
| `test/docs.spec.mjs` | The prose-to-patch agreement: row ids, switches, version heading, locale parity, registry-only and vendored dependencies |
| `test/tool-reference.spec.mjs` | The reference freshness, tool count and unique tool names |
| `test/components.spec.mjs` | The component manifest against the patch rows, tool inventory, skill budgets, namespaces, context budget, README counts and owning documents |
| `docs/port/*.md` | Port decisions and measurements, kept as design history |

## Documentation is checked

`pnpm test` fails when documentation drifts from the code:

- a row declared in `cordis.patch.yml` is missing from the README switch table,
- a row id declared in the patch is missing from the README,
- the `package.json` version has no `## [version]` heading in the changelog,
- the English and Chinese locale files disagree on keys,
- the declared bundle patch path does not exist,
- a dependency, optional dependency or peer is a URL, git or workspace spec,
- the committed `lib/client.js` is stale against the faces it is built from,
- `docs/reference/tools.md` or `tools.json` is stale,
- `components.json` disagrees with the patch rows, a tool count, a skill budget or body, a tool name cited by a skill, a README table number or a document a component owns,
- a component's `default` posture disagrees with its patch row's `disabled`, a tool name leaves its component's namespace, or the default-on surface exceeds the recorded context budget.

When one of these fails, fix the documentation — not the test — unless the documented behavior itself is what changed.

## Contract, upgrade and release rules

- **Test the host contract with the host's services.** Declare only the services the bundle uses, and test one real composition that mounts it through a profile with the harness's own `fs`, `tools` and `skills`. A fake is a double, not the contract: mirrors must return what the host returns (`fs.resolve` yields an `FsTarget`, not a string). A string-returning fake hid the target change and shipped a broken ACD export.
- **Test the upgrade path.** A profile with an older local copy of the bundle or a component must not keep loading it after the installer updates the payload. Cover N-1 → N, assert the components resolve from the installed payload, and prune stale copies; a leftover package shadows the payload even when resolution prefers the installation.
- **Release evidence calls a changed tool.** The packaged smoke must exercise at least one tool whose behavior changed, end to end, and the release body records the command and result. A boot smoke and a green unit suite do not prove a tool works.
- **Every documented switch or command is checked.** Generated inventories are mandatory; a README claim without a test is a defect.
- **Tag the release commit.** Create `vX.Y.Z` in this repository at the commit the bundle was built from; artifacts live on the download host, but the tag is what maps payload to source.
- **One version per batch, not per change.** Every change stages under `## [Unreleased]`; a batch ships as one version. The one-bundle model is only cheaper than separate plugins while each release carries a batch — a publish per change turns into an approval request per change, which the owner rejected explicitly.
- **Withholding is documented.** If this bundle stays private or out of the market index, the README records that decision and the reason.

Retirement includes packaging scripts and their tests, generated catalogs and profile-local packages; follow `docs/port/retirement.md`.

## Commands

```sh
pnpm install
pnpm test          # patch, docs agreement, tool reference, dependencies, client face
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
```

## Scope

This repository owns the engineering bundle, its rows, and the engineering product packages. AryaCode owns the product catalog, the installer payload, and the profile migrations that make this bundle built-in.

## Change policy (binding)

- **Never change the installed AryaCode.** `%LOCALAPPDATA%\Programs\AryaCode` (payload, `app.asar`, runtime) and `~/.aryacode` (profiles, `node_modules`, `userData`) are the user's live product. Read them; do not write to them, patch them, or edit a profile's `package.json` to work around a bug. Do not stop, uninstall, or launch a second instance against that profile.
- **Release in batches, and only on request.** Commit and test each change locally with its `CHANGELOG.md` entry under `## [Unreleased]`; do not bump, tag, publish or touch the catalog until the owner says ship. Then release once: bump the version, move the unreleased entries under it, `pnpm test`, `pnpm -r build`, `pnpm assemble`, `pnpm publish`, tag `vX.Y.Z`, and record the version in the market catalog. A publish only *stages* the version, so a release per change turns into an approval request per change — the owner rejected that pattern explicitly. `lib/` is gitignored build output, and `scripts/assemble.mjs` refuses a component whose `lib/` is older than its `src/`. npm is the artefact host — the catalog points at `registry.npmjs.org`, so no GitHub release asset is created. Published versions are immutable — never repack or overwrite one.
- **Test on Dev AryaCode**, `%LOCALAPPDATA%\AryaCode-dev\home`, never on the installed instance: install the tarball there, compose the profile, then boot.
- **Harness fixes are not this repository's.** If a change requires editing the shell or a `@deepseek-ai` package, it belongs in `KonnectSuite/AryaCode`, verified on Dev AryaCode, and shipped as a harness patch release — not as a local edit here or in the installed app.
- **No in-place rescue.** If a fix seems to need touching the installed copy, that is the signal the change belongs upstream. Say so and take the release path.
