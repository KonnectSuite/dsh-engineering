# AGENTS.md â€” dsh-engineering

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
| `README.md` | Purpose, the component table with defaults and maturity, the switch table, install, where it appears, requirements, safety, skills, known limits, documentation map |
| `docs/index.md` | The documentation map: every page, by task and by product |
| `docs/getting-started.md` | The first session: per-product requirements, install, the shared five-step loop, a paste-ready prompt per product |
| `docs/architecture.md` | Row model, service injection, configuration, row switches, client faces, distribution, compatibility |
| `docs/products/*.md` | One page per product: what it adds, what it needs installed, the order to work in, and where it stops. `docs/products/optix/` holds the Optix pages |
| `docs/examples.md` | End-to-end sessions for L5X and FactoryTalk View, with call shapes and reporting reminders |
| `docs/capabilities.md` | The figures: which call produced each one, and what an image cannot prove |
| `docs/reference/tools.md` | Every registered tool, its description and parameters (generated) |
| `docs/reference/tools.json` | The machine-readable tool and group inventory (generated) |
| `components.json` | The component manifest: kind, capability class, default posture, maturity (stability, since, requirements, recorded verification), tool namespace, row, entry, package, tools, skill and its budget, probe, evidence gate, owning documents, and the default-on context budget |
| `docs/reference/components.md` | What a component is, the capability classes, the manifest fields, maturity, the context budget, the checklist for adding one and the growth policy |
| `docs/reference/hmi-design.md` | The shared screen grammar for both HMI products: the loop, the layout rules, the palette and the rule-to-tool map |
| `CHANGELOG.md` | Released and unreleased changes, one entry per version |
| `cordis.patch.yml` | The composed behavior, with comments explaining why each entry has its shape |
| `package.json` | Name, version, bundle patch path, dependencies, peer compatibility |
| `scripts/gen-tool-reference.ts` | The generator for the reference and inventory |
| `test/patch.spec.mjs` | Invariants of the patch file itself |
| `test/docs.spec.mjs` | The prose-to-patch agreement: row ids, switches, version heading, locale parity, registry-only and vendored dependencies |
| `test/tool-reference.spec.mjs` | The reference freshness, tool count and unique tool names |
| `test/components.spec.mjs` | The component manifest against the patch rows, tool inventory, skill budgets, namespaces, maturity, context budget, README counts and owning documents |
| `scripts/check-package.mjs` | The packaging contract: identity fields, the `dsh` block, what `files` actually ships, every row's export target, dependency hygiene, every bare import the node-side payload makes, and the unpacked size |
| `test/package.spec.mjs` | That contract as a test, plus the licence notices and the products the description promises |
| `NOTICE.md` | Third-party notices: the embedded acadrust/ACadSharp, the Optix bridge, the upstream snapshots and every dependency licence |
| `docs/development/packaging.md` | Build order, the vendor step, what the tarball ships and the packaging gate |
| `docs/development/retirement.md` | How a component leaves: rows, packages, entries, tests and documents together |
| `docs/development/handbook.md` | The handbook source model (Markdown in `docs/handbook/src/`), the DOCX/HTML/PDF formats, the `--check` and how to add a page |
| `docs/development/scaffold.md` | The copyable component skeleton in `packages/_scaffold/` and why it is never mounted |
| `docs/reference/knowledge.md` | The docs-tool contract: one source many compiled copies, the five actions, envelopes, BM25 constants, revision rules and licensing posture |
| `docs/decisions/knowledge-plane.md` · `docs/decisions/verification-evidence.md` | Why the knowledge library is a source library with synced copies; the three-state gate evidence rule (`pass`/`fail`/`not-runnable`) and its substitute-evidence table |
| `packages/_scaffold/**` | A compilable component skeleton; not a component, not in the patch, never assembled |
| `docs/port/*.md` | Port decisions and measurements, kept as design history (`packaging-record.md` is the pre-registry packing record; `optix-template-library-handoff.md` is the Optix lane handoff) |
| `HANDOFF.md` | The current state: version, commit, tarball digest, what was verified and how, known gaps, how to pick the work up |
| `CONTRIBUTING.md` Â· `SECURITY.md` | How to contribute and how to report a vulnerability privately |
| `.github/workflows/ci.yml` | The gate on every push and pull request: install, build, `docs:check`, `check:package`, the suite |
| `.github/workflows/release.yml` | A `v*` tag becomes a GitHub Release whose body is that version's changelog section |

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
- a component's `default` posture disagrees with its patch row's `disabled`, a tool name leaves its component's namespace, or the default-on surface exceeds the recorded context budget,
- a component's maturity is unstated or malformed: a stability outside `stable`/`beta`/`experimental`, a `since` that names no changelog release, a `stable` component with no recorded verification, or a `beta` one that does not say what is not proved yet,
- the tarball needs a path at mount time that `files` does not ship, a row's export target is missing, `publishConfig.access` is not `public`, or the unpacked payload outgrows the market's cap.

When one of these fails, fix the documentation â€” not the test â€” unless the documented behavior itself is what changed.

## Contract, upgrade and release rules

- **Test the host contract with the host's services.** Declare only the services the bundle uses, and test one real composition that mounts it through a profile with the harness's own `fs`, `tools` and `skills`. A fake is a double, not the contract: mirrors must return what the host returns (`fs.resolve` yields an `FsTarget`, not a string). A string-returning fake hid the target change and shipped a broken ACD export.
- **Test the upgrade path.** A profile with an older local copy of the bundle or a component must not keep loading it after the installer updates the payload. Cover N-1 â†’ N, assert the components resolve from the installed payload, and prune stale copies; a leftover package shadows the payload even when resolution prefers the installation.
- **Release evidence calls a changed tool.** The packaged smoke must exercise at least one tool whose behavior changed, end to end, and the release body records the command and result. A boot smoke and a green unit suite do not prove a tool works.
- **Every documented switch or command is checked.** Generated inventories are mandatory; a README claim without a test is a defect.
- **Tag the release commit.** Create `vX.Y.Z` in this repository at the commit the bundle was built from; artifacts live on the download host, but the tag is what maps payload to source.
- **One version per batch, not per change.** Every change stages under `## [Unreleased]`; a batch ships as one version. The one-bundle model is only cheaper than separate plugins while each release carries a batch â€” a publish per change turns into an approval request per change, which the owner rejected explicitly.
- **Withholding is documented.** If this bundle stays private or out of the market index, the README records that decision and the reason.

Retirement includes packaging scripts and their tests, generated catalogs and profile-local packages; follow `docs/development/retirement.md`.

## Commands

```sh
pnpm install
pnpm test          # patch, docs agreement, packaging, tool reference, dependencies, client face
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
pnpm check:package # what the tarball ships and how big it is, without publishing
```

## Scope

This repository owns the engineering bundle, its rows, and the engineering product packages. AryaCode owns the product catalog, the installer payload, and the profile migrations that make this bundle built-in.

## Client UI (binding)

A client face is part of the app, and the owner judges it that way. Every face â€” new or edited â€” follows the host's visual and interaction standards:

- **Use the host theme.** Read the harness `docs/web-styling.md` and its `--dsw-*` tokens before choosing a colour, radius, depth or type scale; use the tokens (with fallbacks), never a new palette, literal brand colours, a component library, Tailwind or emoji icons.
- **Both themes.** Light and dark come from tokens: no hardcoded backgrounds, text or borders, and state never depends on colour alone.
- **Match the neighbours.** The existing engineering faces (ladder viewer, FactoryTalk View display preview) set the type, spacing, divider, badge and empty-state conventions; a new face must look like the same product.
- **Use the host's chrome.** Document tabs, toolbar actions, loading and error states go through the document-preview slots and the shell's own document chrome, not a custom header bar inside the body.
- **Interaction quality.** Accessible focus rings, keyboard paths, hover/active/disabled states, 24 px minimum targets, no layout shift while loading, and long lists scroll in their own container.
- **Localized copy.** Every user-visible string lives in the locale dictionary, English and Chinese together; no hardcoded UI copy.

## Change policy (binding)

- **Never change the installed AryaCode.** `%LOCALAPPDATA%\Programs\AryaCode` (payload, `app.asar`, runtime) and `~/.aryacode` (profiles, `node_modules`, `userData`) are the user's live product. Read them; do not write to them, patch them, or edit a profile's `package.json` to work around a bug. Do not stop, uninstall, or launch a second instance against that profile.
- **Release in batches, and only on request.** Commit and test each change locally with its `CHANGELOG.md` entry under `## [Unreleased]`; do not bump, tag, publish or touch the catalog until the owner says ship. Then release once: bump the version, move the unreleased entries under it, `pnpm test`, `pnpm -r build`, `pnpm assemble`, `pnpm publish`, tag `vX.Y.Z`, and record the version in the market catalog. A published version becomes readable on the registry minutes later, not at once (measured: about four
  to ten minutes for this package), so a release per change still costs a verification loop per change â€” the owner rejected that pattern explicitly. `lib/` is gitignored build output, and `scripts/assemble.mjs` refuses a component whose `lib/` is older than its `src/`. npm is the artefact host â€” the catalog points at `registry.npmjs.org`, so no GitHub release asset is created. Published versions are immutable â€” never repack or overwrite one.
- **Test on Dev AryaCode**, `%LOCALAPPDATA%\AryaCode-dev\home`, never on the installed instance: install the tarball there, compose the profile, then boot.
- **Harness fixes are not this repository's.** If a change requires editing the shell or a `@deepseek-ai` package, it belongs in `KonnectSuite/AryaCode`, verified on Dev AryaCode, and shipped as a harness patch release â€” not as a local edit here or in the installed app.
- **No in-place rescue.** If a fix seems to need touching the installed copy, that is the signal the change belongs upstream. Say so and take the release path.

## Releasing: the market step is not optional

This repository releases in batches, only on request, through its own pipeline
(`pnpm -r build`, `pnpm assemble`, `pnpm publish`, tag `vX.Y.Z`) â€” see the change
policy above. The catalogue step comes after it and has no substitute: a version on npm
that the market does not list is not released, it is hidden, because the market answers
from `releases[0]`.

    node ../dsh-arya-market/scripts/release-plugin.mjs --skip-build --skip-tests

`--skip-build --skip-tests` because the pipeline above already built, tested and
published the archive; the command then verifies the four conditions (npm serves the
version, the `catalog` branch lists it, the recorded `sha256` is the hash npm serves,
`check-catalogue-parity.mjs` is green) and writes the catalogue entry. Never hand-edit
`data/arya-plugins.json`.

### What a publish looks like while the registry catches up

Measured on this release. `npm publish` printed `Published package ... 0.95.0`, and for about four
minutes `npm view @aryacode/dsh-engineering@0.95.0 version` answered 404 while a second publish
answered `409 Conflict - Cannot publish over previously staged version "0.95.0"`. Both readings are
the lag, not a release waiting for a human: the version went live with no approval, and the tarball
URL answered 404 a little longer than the packument did. So:

- after `pnpm publish`, wait and re-check `npm view <name>@<version> version`; do not bump the
  version and do not ask the owner to approve anything at npmjs.com;
- a 409 is not permission to bump. Versions are immutable, so the needless second publish of the
  same tree is exactly what 0.95.1 is to 0.95.0;
- run the catalogue step only once `npm view` answers and the tarball downloads. It records the
  registry copy's sha256, so a fresh local pack whose digest differs (pnpm and npm pack the same
  tree to different bytes) is expected and is not an error.
