# Architecture

`@aryacode/dsh-engineering` is one npm package that gives DeepSeek Harness (AryaCode) six products
and two support components: nine rows in the bundle patch, 199 registered tools and eight skills,
plus one browser bundle and one Remote service. This page owns the internal contract — the file
layout, the row model, what an entry may declare, how `vendor/` and `lib/client.js` are produced, and
what the packaged artifact contains.

## Where each fact lives

| Fact | Owner |
|---|---|
| What the bundle is, the component table, installation | [README](../README.md) |
| Row model, entry contract, configuration, client faces, Typert, vendor step, distribution | this page |
| What a component is, capability classes, manifest fields, maturity, budget, growth policy | [Component contract](reference/components.md) |
| Every registered tool, its description and parameters (generated) | [Tool reference](reference/tools.md) |
| A product's own surfaces, calls and limits | [Products](products/README.md) |
| Build order, the vendor step, what the tarball ships | [Packaging](development/packaging.md) |
| What an image proves, and the call behind each figure | [Capabilities](capabilities.md) |
| What retirement removes; why one package | [Retirement](development/retirement.md), [One package](handoff-one-package.md) |

## Repository layout

```
package.json                    bundle manifest: dsh.bundle.patch, dsh.client, dsh.engines, dependencies
cordis.patch.yml                the loader layer: nine inserted rows, inserts only
components.json                 the component manifest: posture, maturity, tools, skill, docs, budgets
entries/                        one composite entry per row, plus config.js and netlogic.js
lib/index.js                    the host half the `viewers` row mounts: registers the drawing (`ecad`) Remote service
lib/client.js                   the bundle's one browser half: ladder, ME display, DXF/DWG drawing, settings
lib/typert.host.js              the Typert Remote artifact, rendered by the client build; src/remote/
                                holds the wire contract and the Cordis service its endpoints dispatch to
packages/{l5x,viewer}           L5X host tools, the rockwell-l5x skill, CIP workers, Studio bridge, ladder face
packages/{ftview,ftview-viewer} FactoryTalk View host tools and skill; ME display preview face
packages/ecad                   the DXF/DWG engine, DWG converter and the drawing pane (viewer payload)
packages/{mwi,resources}        MotionWorks host tools and skill; standards corpus, index and profile
packages/{migration,plc5,slc}    legacy assessment/lint/compare/resolver/report; RSLogix 5 and RSLogix 500 headless readers
packages/optix                  the published Optix build, tracked as source: no source here
presets/                        billion-context: the bili compaction gate adapter
scripts/{build-client,assemble}.mjs  fold the four faces into lib/client.js and render the Typert
                                artifact; copy eight built components, plus the drawing viewer payload,
                                into the gitignored vendor/ tree
vendor/                         build output: eight components plus the drawing viewer payload, written by `pnpm assemble`, gitignored
```

`lib/client.js` is committed and a test fails when it is stale; `vendor/` is generated and ignored.
`packages/optix/lib` is the one exception to "`lib/` is build output": the Optix component is
vendored as a published build, so its tree is the source of truth for that row.

## Row model

The patch inserts nine rows with stable ids — six product rows, two support-component rows and one
surface row:

| id | entry | mounts | config (default) | tools |
|---|---|---|---|---|
| `l5x` | `entries/l5x.js` | read, `l5x_docs`, `rockwell-l5x`, drafts, Studio SDK, live EtherNet/IP | `editing` on, `studio` on, `live` on, `allowWrites` on, `allowedAddresses` empty | 55 |
| `ftview` | `entries/ftview.js` | read, `ftview_docs`, guidance, staged edits, Studio handoff | `edit` on, `studio` on | 52 |
| `mwi` | `entries/mwi.js` | session, read, verify, guidance, edits | `workspace` empty, `edit` on | 24 |
| `viewers` | package root (`lib/index.js`) | the three document previews, the settings pages, the drawing Remote service | — | 0 |
| `engineering-resources` | `entries/resources.js` | the corpus and house-style tools, `engineering-standards` | `reference` on | 2 |
| `migration` | `entries/migration.js` | assessment, `.L5K` lint, comparison, marker resolution, report, plan, `migration_docs` | one flag per tool, all on | 8 |
| `plc5` | `entries/plc5.js` | `.RSP` reader, ladder text, search, I/O census, chassis, data files, processor, six text readers, `plc5_docs`. **Ships off**; writes nothing | — | 15 |
| `slc` | `entries/slc.js` | RSLogix 500 text reads, I/O census, database, processor, `slc500_docs`. **Ships off**; writes nothing | — | 10 |
| `optix` | `entries/optix.js` | the prebuilt Studio engine (reads, authoring, preview, NetLogic) and the NetLogic reader | `allowWrites`, `allowDestructive`, `allowInvoke`, `preview`, `netlogic` on; `bridgeUrls` `http://127.0.0.1:8768` | 32 |

Ids are the contract: profiles, patches and the Plugins page address a row by id, so a row's
implementation can be rebuilt without resetting the user's enabled state. A **product row** is a
composite that mounts the whole surface (`ctx.plugin(part)`) and exposes its optional parts as the
`Config` schema the page renders; a **support component** mounts one part. `viewers` carries no tools.

**Every optional surface ships on.** L5X drafts, Studio SDK and live reads default on and a read-only
profile turns them off, and MotionWorks edits default on. A fresh install therefore mounts 174 tools,
the recorded budget in
[components.json](../components.json) — though a mounted tool is not a declared one; see
[conditional admission](#conditional-admission) below.

**Why not `cordis:group`.** The Plugins page skips group rows outright
(`plugin-manager/src/index.ts`: *"Group rows are containers without a plugin inventory entry; their
children carry the switches"*), and the schema couples `group: true` with `disabled: true`; one
composite entry per product is the bundle-side equivalent.

**A service that outlives its row.** The drawing Remote service is mounted by the package-root
`viewers` row and keeps reading the legacy `ecadPolicy` service and `ecad` row config when an older
profile still provides them; the drawing face and the service therefore mount without a product row.

## The entry contract

An entry is a Cordis plugin module. `entries/l5x.js` is the shape the others follow:

```js
export const name = 'engineering-l5x'
export const inject = ['tools', 'fs']
export const Config = z.object({ /* schemastery fields, mostly .volatile() */ })
export function apply(ctx, config = {}) {
  mount(ctx, 'l5x', read) // entries/activation.js: the gate rides on every registration
  mount(ctx, 'l5x', skill)
  /* mount or dispose the optional parts from the switches */
  ctx.on('loader/volatile-update', sync) // re-read a switch the user just flipped
}
```

- **`name`** is the plugin id in a composition, not the row id; **`inject`** declares the services the
  entry needs, so a row needing a service the profile lacks fails to mount instead of degrading.
- **`Config`** is a `@deepseek-ai/schemastery` schema and is what the row page renders. A field
  marked `.volatile()` reaches `apply` as a live reference (`{ get() }`), not as its value, so
  `config.edit` is not `true`; `entries/config.js` owns the resolvers (`resolve`, `flag`, `list`,
  `text`) and every entry goes through them. Reading a volatile field directly once made every
  switch look off, so a row mounted its read surface and never its edit surface.
- **`apply`** mounts sub-fibers with `ctx.plugin(part)` and keeps the disposable so a switch can
  unmount the part again.
- **`loader/volatile-update`** is emitted when only volatile config changed: the loader commits the
  new values into the live references and does **not** re-run `apply`. An entry whose switches mount
  or unmount parts listens and re-syncs: the L5X row drafts, Studio and live; MotionWorks edits; Optix
  the prebuilt plugin and the NetLogic reader.

Every tool entry declares `tools` and `fs`; a skill part declares `skills`; a draft or Studio part also
declares the read part's handle service (`l5xProjects`, `ftviewViews`) so it reuses the open export
instead of reading it twice, and a chat's handles are scoped to that chat. The `viewers` client face
declares the seven `@deepseek-ai` packages in `package.json`.

## Configuration

| Entry | Options | Defaults |
|---|---|---|
| `l5x` | `editing`, `studio`, `live`, `allowWrites`, `allowedAddresses` | true, true, true, true, empty |
| live entry (mounted by `l5x`) | `enabled`, `minIntervalMs`, `defaultIntervalMs`, `maxTags`, `maxSamples`, `maxBatchTags` | true, 50, 200, 16, 1200, 64 |
| `ftview` | `edit`, `studio` | true, true |
| `mwi` | `workspace`, `edit` | empty, true |
| `optix` | bridge URLs and token, `allowWrites`, `allowDestructive`, `allowInvoke`, `preview`, `netlogic`, browser selection, preview URL, OCR paths, request limits | loopback bridge, all switches on, launch a browser |
| `migration`, `plc5`, `engineering-resources` | one flag per tool (`assess`, `lint`, `compare`, `resolve`, `report`, `plan`; `capabilities`, `open`, `ladder`, `find`, `ioCensus`, `ioConfig`, `dataRead`, `processor`; `reference`) | all true |

A profile or patch override names the row id and merges its `config`; the Plugins page renders the
same schema as a form. The controller tools take no separate config: approval policy comes from the
session.

## The component manifest

[`components.json`](../components.json) is the machine-readable contract behind the README table, the
docs and the tests. Its top level is `catalog`, `contextBudget`, `skillPolicy`, `maturityPolicy` and
`components`; each component records its `kind`, `capability`, `default` posture with the matching
`row`, `entry`, `package`, `tools`, `skill`, `probe`, `gate`, `docs`, maturity and `vendor`. The field
list and its rules are in [components](reference/components.md); `test/components.spec.mjs` fails when
the manifest disagrees with the patch rows, a tool count, a skill budget, a README number, or a
document it owns.

**Every component is currently `beta`**: it works and is documented, but its tool set or a result may
change between releases, and `stabilityNote` says what is not proved yet. `since` is the first release
whose patch carried the row id, not the last change.

Three budgets come from it. `contextBudget.defaultOnTools` = **174** is the exact default-on tool
surface: one more default-on tool fails the suite until the count is raised with its measurement, or the
component ships off. `defaultOnSchemaCharacters` = **136828** is the ceiling for what a fully activated
default-on surface sends, and `defaultOnCatalogCharacters` = **1650** is the ceiling for what an idle
session sends — the skill catalog, not the schemas.
`skillPolicy.defaultBudget` = **8000** characters is the ceiling for a skill body, because a skill is
injected into the request when it is invoked; depth belongs on `docs/` pages and is linked.

## Conditional admission

Registering a tool is not declaring it. `@deepseek-ai/dsh-tools` accepts
`register(definition, { when })` and evaluates that condition once per model step; `false` keeps the tool
out of the tool list, the PTC bindings and dispatch, and the row pays nothing for it that step.
`entries/activation.js` is the bundle's only gate: `mount()` and `apply()` wrap the context a part is
given so every `tools.register` it makes carries the condition for its row.

The condition is open when the session has loaded a skill that names one of the row's tools, or when the
request header it already sent declares one. That table is `COMPONENTS` in the same module:

| Row | Prefixes | Skills that admit it |
|---|---|---|
| `l5x` | `l5x_` | `rockwell-l5x`, `engineering-standards`, `legacy-to-logix-migration` |
| `ftview` | `ftview_` | `factorytalk-view`, `engineering-standards` |
| `mwi` | `mw_` | `motionworks-iec`, `engineering-standards` |
| `optix` | `optix_` | `factorytalk-optix` |
| `migration` | `migration_`, `l5k_`, `slc_` | `legacy-to-logix-migration`, `rslogix-500` |
| `engineering-resources` | `engineering_` | any of the eight (the resource tools are named by every skill) |
| `plc5` | `plc5_` | `rslogix-5` |
| `slc` | `slc500_` | `rslogix-500` |

A skill is in a row's list exactly when its prose names one of that row's tools, and
`test/activation.spec.mjs` derives the table from `docs/reference/tools.json` and the SKILL.md bodies, so
prose and gate cannot drift. Three consequences are deliberate:

- **One step of latency.** The host seals admission before a step's tool calls run, so the step that
  loads a skill still sees the old surface; the next step sees the row. A cached prefix therefore stays
  warm while the surface changes.
- **Resume is covered by the header.** `session.requestHeader()` carries the last request's tool names,
  so a resumed session keeps the surface it had; an agent that carries only `run_code` (PTC) reloads the
  skill.
- **The switch stays the row.** There is no per-skill filter in the host — the older
  `@deepseek-ai/dsh-tool-skill` config is not on this line — and the row remains what a profile disables.
  A project skill that reuses a bundle skill's name admits that row, because the name is the key.

The gate fails open when there is no agent (an executor test, a scripted caller) and fails closed when
its own predicate throws, so a broken condition hides a row rather than failing step preparation. On a
harness older than `0.2.2-alpha.2` the second argument to `register` is ignored, every schema is sent as
before, and nothing breaks.

## Switches

A row is a plugin, so a disabled row is an unloaded plugin and its tool schemas leave the request —
that is the whole switch mechanism in this product line. A row is inserted `disabled: true` when a
component ships off (`plc5`, `slc`); the row is still listed, and enabling it writes the profile
overlay.

The patch **only inserts**. An entry that targets another bundle's row is a hard failure when that
row is absent (`dsh: [...] patch: entry "..." not found`) and the bundle refuses to apply; 0.4.0 and
0.4.1 shipped exactly that and were uninstallable, and `test/patch.spec.mjs` now rejects non-inserts.

**No capability policy.** Earlier releases carried a per-skill tool filter (`policyOnly`,
`toolPolicy`, `capabilities`) inherited from a different harness. That filter lives in that fork of
`@deepseek-ai/dsh-tool-skill`; the DeepSeek Harness (AryaCode) line's copy has no such config, so the
layer could only ever be skipped on an older harness or fail composition on the current one. The
replacement is [conditional admission](#conditional-admission): the same intent, but the condition is
evaluated by the host per step and no harness config is involved.

## The EtherNet/IP surface

The L5X row's `live` switch mounts `vendor/l5x/lib/live.js`, which owns every direct controller path.
Two workers keep a controller problem off the host: `poll-worker.mjs` streams sweeps for
`l5x_poll_live_tags` and the trend job, and `cip-worker.mjs` runs one transaction per worker and emits one
reply. The engine's transaction module owns the deadline, the concurrency bound and strict decoding of
a reply, so a hung socket is terminated and a malformed reply cannot be read as a value.

Reads are approval-free. Writes exist only in this entry and are supervised four times over:

| Gate | Where | Result when it fails |
|---|---|---|
| `allowWrites` row config | `entries/l5x.js` forwards it into the live entry | `WRITES_DISABLED` |
| Per-call human approval | the same approval seam `l5x_download_project` uses | `APPROVAL_UNAVAILABLE` / `APPROVAL_DENIED` |
| Declaration and value validation | before any socket is opened | `UNSUPPORTED_WRITE_TAG` / `INVALID_WRITE` |
| Readback comparison | the tool, after the write | `WRITE_NOT_VERIFIED` |

`allowedAddresses` narrows every direct path to an explicit IPv4 allowlist. The driver's raw
`write_cip` escape hatch and `TagGroup` writes are unused by design — a raw CIP write would bypass all
four gates. The calls are in [Live controllers](live-controller.md) and [L5X](products/l5x.md).

## Client faces

A package registers exactly **one** client bundle, keyed by the package name the Shell resolves from
the mounted row; a second registration under another id is never asked for and fails silently. Every
engineering face ships in the single `./client` bundle:

- the **ladder** face renders rungs for an L5X routine opened from the workspace;
- the **FactoryTalk View** face draws an exported display instead of its XML;
- the **DXF/DWG drawing** face is a read-only drawing pane: drag to pan, wheel zoom at the cursor,
  layout tabs, a layer panel with entity counts, text search, a coverage and conversion badge, print
  through the host dialog, and SVG/PNG export of the current sheet. The former ECAD product row and
  its tool set are retired; this face and its Remote service stay. Its CAD editing surface was retired
  in 0.93.0 — authoring belongs to AryaCAD Electrical through the owner's own MCP row, and the Remote
  contract dropped `apply` with it (`ECAD_CONTRACT_VERSION` 1 → 2, so face and service ship together);
- the **settings** face renders the rows' forms.

`scripts/build-client.mjs` produces the bundle from the four committed face files —
`packages/viewer/lib/client.js`, `packages/ftview-viewer/lib/client.js`, `packages/ecad/lib/client.js`
and `scripts/faces/settings.js`. Each body is sliced verbatim into its own closure inside the one
registration (`window.__ModuleLoader__.load({ id: '@aryacode/dsh-engineering', factory })`), each keeps
its own `React` binding, document-preview id, stylesheet text and helpers, and the merged plugin
exports the union of the faces' `inject` lists and an `apply` that runs each. The build fails loudly
when a face artifact is missing rather than shipping a bundle whose tab draws nothing. The three
preview faces are built by `scripts/build-{viewer,ftview,ecad}-face.mjs`; `pnpm build:client` runs
those three and this script in that order.

Two consequences: the Shell only scans the client face of packages a mounted row resolves to, so the
`viewers` row names this package's root and `lib/index.js` exists to be that mount point (product rows
mount subpaths and carry no browser half); and adding a preview is adding a face, not a row. A preview
needing its own release becomes its own package whose row names that exact package root.

## Typert Remote face

The bundle is also a Typert contributor. `package.json` exports `"./typert"` (`lib/typert.host.js`);
while the `viewers` row is mounted the Host's typert loader resolves the row's package root, reads that
export, validates the `TYPERT` manifest and registers its invocations in `ctx.typert`, so the Gateway
can dispatch an endpoint to the Cordis service the descriptor names — no `@deepseek-ai` package has to
know about it.

`src/remote/ecad-contract.js` is the one source of the wire facts: `scripts/build-client.mjs` renders
`lib/typert.host.js` from it and the ECAD face imports the same module, so endpoints, parameter order,
wire names and codec modes cannot drift between the two halves. The service is
`src/remote/ecad-service.js`, imported by `lib/index.js`; it binds its Gateway link with
`bindTypertRemote` (the Gateway refuses a service without that visible binding), and a descriptor's
`service` is the Cordis service key, not a package name.

| Endpoint | What it does |
|---|---|
| `ecad/open` | Reads one workspace DXF, builds its render model, writes `.ecad/previews/<hash>.json`; returns the model path, source hash and a summary. |
| `ecad/sheets` | Lists the workspace DXF drawings, enriched from `.ecad/index.json` when an agent has scanned the set. |
| `ecad/capabilities` | Reports the contract version, write state, engine limits and whether the DWG converter shipped. |

The engine is imported lazily on the first call; the service reads through the Host `fs` service,
writes with the session's sandbox policy, and keeps its cache under `.ecad/` in the workspace.

## The vendor step

Each component is published from this repository as its own package and vendored back in.
`scripts/assemble.mjs` refuses a component whose `packages/<name>/lib` is missing or older than its
newest source file; deletes and recreates `vendor/`; copies a fixed entry list per component — `lib`,
`assets`, `bin`, the Studio bridge, the MotionWorks engine, the corpus and its index, the skills, the
workers, the notices, the locale files — into `vendor/<name>/`; and prints
`assembled N components and M viewer payloads into vendor/` (eight components in the order `l5x`,
`ftview`, `mwi`, `resources`, `optix`, `migration`, `plc5`, `slc`, plus the drawing viewer payload `ecad`).

`vendor/` is build output: gitignored, rebuilt by `prepack`. Why separate trees instead of one
flattened `lib/`: a skill module resolves `../SKILL.md` from its own package root, and the Studio
bridge and the MotionWorks engine resolve asset folders relatively, so `vendor/<name>/` keeps those
paths true with no source edits.

## Distribution

The bundle is one self-contained tarball: the pack ships the patch, `entries/`, `lib/`, `src/remote/`,
`presets/`, `locale/` and `vendor/`, and `package.json` declares no `@aryacode/*` dependency. A profile
installs one thing and toggles rows inside it; a dependency that is a URL, a git spec or a
`workspace:` range fails `test/docs.spec.mjs`.

```
dsh-engineering-<version>.tgz
  ├── cordis.patch.yml        the nine rows (inserts only)
  ├── lib/                    client.js, index.js, typert.host.js
  ├── entries/                one entry per row, plus config.js and netlogic.js
  ├── presets/                the billion-context compaction gate adapter
  └── vendor/<component>/     eight component trees plus the drawing viewer payload
```

Measured on the 0.101.0 registry copy: 4,828,998 bytes packed, 921 files, 20,107,077 bytes unpacked;
`pnpm check:package` reports both figures, and the release procedure and packaging gate are in
[Packaging](development/packaging.md).

A split into an add-on bundle is allowed only for licensing or IP, a different host line, a heavy
optional payload most users will not install, or an independent cadence — and then as its own patch,
its own namespaced rows and its own manifest, never a second product plugin over this bundle. The rule
and its rationale are in [components](reference/components.md#growth-policy).

## Backups

Every product that edits in place backs up into one workspace tree, so "the backup" means one place:

```
<workspace>/backups/<product>/<subject>/<UTC stamp>/
    backup-manifest.json      every copied file: relative path + SHA-256
    <the copy>
```

| Product | Folder | Subject | Taken |
|---|---|---|---|
| Studio 5000 | `l5x` | project name | on request; drafts and SDK builds already write new files |
| FactoryTalk View | `ftview` | export folder name | on request; `ftview_apply` already writes a new folder |
| MotionWorks IEC | `motionworks` | project name | on `mw_project_open`, once per project, and before an edit that finds none |
| FactoryTalk Optix | `optix` | project name | on request, as a manual Studio project export copied into that folder |

The manifest is `{ "files": [ { "path": "<relative path>", "sha256": "<hex>" }, … ] }`, the shape
MotionWorks writes too; a restore re-hashes each file before using the copy. MotionWorks is the one
product whose backup is a *contract*: its identity record under
`<workspace>/.motionworks/attached/records/` names the copy, and the bridge and the read-only engine
refuse a real project without it.

The migration row writes only a new report and the PLC-5 row writes nothing, so neither takes a
backup. Never write `<workspace>/_backups` or the pre-0.4.21 `<workspace>/backups/<project>/<stamp>/`
layout: they are read-only history.

## Compatibility and verification

The bundle is pinned to the DeepSeek Harness `0.2.x` line: `dsh.engines.dsh` is
`^0.2.1-rc.3 || ^0.2.2-alpha.2`, `@deepseek-ai/dsh-tool-skill` is a `^0.2.0-rc.2` peer and Cordis
`~4.0.4` (peer); a profile on another line refuses the bundle at boot rather than composing it
partially, and it runs on Node `^22.19.0` or `>=24.0.0`.

```sh
pnpm test          # patch invariants, docs agreement, tool reference, components, client face
pnpm build:client  # build the three preview faces from source, then lib/client.js
pnpm e2e:ladder    # render the built ladder face in headless Chrome and assert on the DOM
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
pnpm check:package # what the tarball ships and how big it is, without publishing
```

`test/patch.spec.mjs` asserts the exact inserted rows, the skill and prefix wiring, and that eager
exposure is preserved. `test/docs.spec.mjs` fails when the README switches section, row ids or
changelog heading drift from the patch or the manifest. `test/components.spec.mjs` checks the manifest
against the patch, the tool inventory, skill budgets and README counts. `test/client-face.spec.mjs`
fails when the committed `lib/client.js` is stale, its registration id stops matching the package
name, a face stops materializing, or `apply` stops mounting a preview.

`packages/viewer/test/render/suite.mjs` is the ladder face's end-to-end evidence: it mounts the built
face in headless Chrome, opens a routine the way a reader does and measures the rendered document — no
clipped text, one label per instruction, no label escaping its cell, no overlapping labels, and every
recorded exported value on screen. It needs Chrome or Edge and is kept out of `pnpm test`.
`routines.mjs` (`pnpm e2e:routines`) runs the same judgement over every routine one export lists, and
`interactions.mjs` (`pnpm e2e:actions`) drives the pane — a click focuses an instruction, arrow keys
walk the rung, the organiser filter narrows the tree — and the evidence behind the figures is in
[Capabilities](capabilities.md).
