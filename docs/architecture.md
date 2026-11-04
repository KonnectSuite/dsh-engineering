# Architecture

How the engineering bundle composes, what each row owns, and how the packaged artifact is built.
The [README](../README.md) owns the product overview; this page owns the internal contract.

## Repository layout

```
package.json              bundle manifest: dsh.bundle.patch, dsh.client, dependencies, peer range
cordis.patch.yml          the loader layer: the inserted rows (inserts only)
lib/index.js              host half: an entry that registers nothing (see "Client faces")
lib/client.js             the bundle's one browser half: ladder + ME display previews (generated)
scripts/build-client.mjs  builds lib/client.js from the two committed face bundles
packages/l5x              host tools (read, references, checks, drafts, studio, controller, live),
                          the rockwell-l5x skill, the PLC trend client face
packages/viewer           ladder viewer: the committed face bundle lib/client.js
packages/ftview           host tools (read, edit, studio), the factorytalk-view skill
packages/ftview-viewer    ME display preview: the committed face bundle lib/client.js
scripts/gen-tool-reference.ts   generated tool reference and inventory
test/                     patch, docs, tool-reference, manifest and client-face tests
```

The three host components are vendored into `vendor/`, so the published package is self-contained:
its only dependency is the Optix component. The two face packages are build inputs, not
dependencies — their built bundles are folded into `lib/client.js`.

## Row model

The patch inserts six rows with stable ids (four product rows and two support rows). Ids are the contract: a profile, a patch or the Plugins
page addresses a row by id, so the implementation behind a row can be rebuilt without resetting the
user's enabled state.

| id | package entry | mounts | config (default) |
|---|---|---|---|
| `l5x` | `entries/l5x.js` | read, `rockwell-l5x` guidance, drafts, SDK, live | `editing` on, `studio` on, `live` on, `allowWrites` on |
| `ftview` | `entries/ftview.js` | read, guidance, edits; optionally the Studio handoff | `edit` on, `studio` on |
| `mwi` | `entries/mwi.js` | session, read, verify, guidance, edits | `edit` on |
| `viewers` | `@aryacode/dsh-engineering` (its own client face) | ladder + ME display previews | — |
| `optix` | `entries/optix.js` | Optix Studio reads, authoring, preview and the NetLogic reader | `allowWrites`, `allowDestructive`, `allowInvoke`, `preview` on, `netlogic` on |

A product row is an `entries/*.js` composite: it mounts the vendored parts (`ctx.plugin(part)`) so the
Plugins page shows one switch per product, and exposes the optional parts as its `Config` schema, which
the page renders as the row's config form. Every optional surface defaults on; the config form turns
off what a profile does not need.

**Why not `cordis:group`.** The patch format supports group rows (`name: cordis:group`, `group: true`,
children in `config`), but the Plugins page does not render them: it skips them outright
(`plugin-manager/src/index.ts`, *"Group rows are containers without a plugin inventory entry; their
children carry the switches"*), and the config schema couples `group: true` with `disabled: true`.
Group switches are therefore a shell feature; collapsing rows is the bundle-side equivalent.

Rows are still split by cost: the L5X read surface is eager, while drafts, SDK builds and live reads
are opt-in because each adds schemas a read-only profile never uses. FactoryTalk View is small enough
that its edits and Studio handoff default on. MotionWorks IEC keeps session, read and verify eager and
its seven edit tools opt-in, because those schemas are the largest in the bundle.

Each plugin defines `inject`, so a row that needs a service the profile does not provide fails to
mount instead of running degraded:

| Entry | Injects |
|---|---|
| `entries/l5x` (row `l5x`) | `tools`, `fs` |
| `entries/ftview` (row `ftview`) | `tools`, `fs` |
| `entries/mwi` (row `mwi`) | `tools` |
| `dsh-engineering-l5x` | `tools`, `fs` |
| `dsh-engineering-l5x/editing` | `tools`, `l5xProjects` (provided by the read entry) |
| `dsh-engineering-l5x/studio` | `tools`, `l5xProjects` |
| `dsh-engineering-l5x/live` | `tools`, `l5xProjects` |
| `dsh-engineering-l5x/skill` | `skills` |
| `dsh-engineering-ftview` | `tools`, `fs` |
| `dsh-engineering-ftview/edit` | `tools`, `fs`, `ftviewViews` (provided by the read entry) |
| `dsh-engineering-ftview/studio` | `tools`, `fs`, `ftviewViews` |
| `dsh-engineering-ftview/skill` | `skills` |
| `dsh-engineering-mwi` | `tools` |
| `dsh-engineering-mwi/read` | `tools` |
| `dsh-engineering-mwi/verify` | `tools` |
| `dsh-engineering-mwi/edit` | `tools` |
| `dsh-engineering-mwi/skill` | `skills` |
| `@aryacode/dsh-tool-ft-optix` | `tools` |
| `l5x` trend card | `slots`, `locale`, `remote` |
| `viewers` client face | `slots`, `locale`, `documentPreviews`, `remote`, `remote.workspaceFiles` |

The read entries provide their handle services (`l5xProjects`, `ftviewViews`) so a draft reuses the
open export instead of reading it twice. A chat's handles are scoped to that chat.

## Switches

A row is a plugin, so a disabled row is an unloaded plugin and its tool schemas leave the request. That
is the whole switch mechanism in this product line. The optional surfaces ship on by default, and the
row's config form can turn them off, so a read-only or low-context profile does not pay for them.

A row is inserted with `disabled: true` when a component ships off by default: the row is still listed,
and enabling it writes the profile overlay, so an unloaded plugin is the whole switch either way.
`components.json` records a context budget for the default-on surface; a component that would exceed it
ships off until the ceiling is raised with its measurement. Both checks are in
[components](reference/components.md).

The patch **only inserts**. An entry that targets another bundle's row (`- id: something-else`) is a
hard failure when that row is absent — `dsh: [...] patch: entry "..." not found` — and the bundle then
refuses to apply. 0.4.0 and 0.4.1 shipped exactly that and were uninstallable; `test/patch.spec.mjs`
now rejects any non-insert entry.

**No capability policy.** Earlier releases carried a per-skill tool filter (`policyOnly`, `toolPolicy`,
`capabilities`) inherited from AryaAI. That filter lives in AryaAI's fork of
`@deepseek-ai/dsh-tool-skill`; the AryaCode line's copy has no such config, so the layer could only ever
be skipped (older harness) or fail composition (current harness). If the filter ships here, it belongs
in its own bundle mount, not in this patch.

The generated inventory (`docs/reference/tools.json`) is the machine-readable list of registered tools.
`test/tool-reference.spec.mjs` fails when the committed reference is stale.

## Configuration

Every host entry accepts a validated config from the profile or a patch:

| Entry | Options | Defaults |
|---|---|---|
| `l5x-read` | `maxFileBytes` | 64 MiB |
| `l5x-editing` | `maxFileBytes`, `maxDraftOperations` | 64 MiB, 200 |
| `l5x-studio` | `maxFileBytes` | 64 MiB |
| `l5x` → live | `live`, `allowWrites`, `allowedAddresses`; then the live entry's `enabled`, intervals, `maxTags`, `maxSamples`, `maxBatchTags` | false, false, empty; true, 50 ms, 200 ms, 16, 1200, 64 |
| `ftview-read` | `maxFiles` | 2000 |
| `ftview-edit` | `maxDraftOperations` | 100 |
| `ftview-studio` | `searchRoots` | the two Rockwell Programs folders |

Example override in a profile patch:

```yaml
- id: l5x-live
  config:
    maxTags: 8
```

The controller tools take no separate config; approval policy comes from the session, and the
entry's availability comes from the row.

## EtherNet/IP surface

The L5X row's `live` option mounts one entry (`vendor/l5x/lib/live.js`) that owns every direct controller
path. Two workers keep a controller problem off the host:

- `poll-worker.mjs` streams sweeps for `poll_live_tags` and the trend job.
- `cip-worker.mjs` runs one transaction per worker — batch read, clock, write, clock write, discovery —
  and emits exactly one reply. `lib/engine/cip-transaction.ts` owns the deadline, the concurrency bound
  and strict decoding of every reply, so a hung socket is terminated and a malformed reply cannot be
  read as a value.

Reads are approval-free. Writes exist only in this entry and are supervised twice over:

| Gate | Where | Result when it fails |
|---|---|---|
| `allowWrites` row config | `entries/l5x.js` forwards it into the live entry | `WRITES_DISABLED` |
| Per-call human approval | `requireHumanApproval` (the same seam `download_project` uses) | `APPROVAL_UNAVAILABLE` / `APPROVAL_DENIED` |
| Declaration and value validation | `engine/cip-request.ts`, before any socket | `UNSUPPORTED_WRITE_TAG` / `INVALID_WRITE` |
| Readback comparison | the tool, after the write | `WRITE_NOT_VERIFIED` |

`allowedAddresses` narrows every direct path to an explicit IPv4 allowlist. The driver's `write_cip`
escape hatch and `TagGroup` writes are unused by design: a raw CIP write would bypass all four gates.

## Client faces

A package registers exactly **one** client bundle, keyed by the package name the Shell resolves from
the mounted row. A second registration under another id is never asked for, and the failure presents
as a plugin that loaded and drew nothing rather than as an error — so `@aryacode/dsh-engineering`
carries both engineering previews in its single `./client` bundle:

- the ladder viewer renders rungs for an L5X routine opened from the workspace;
- the ME display preview draws an exported display instead of its XML.

`scripts/build-client.mjs` produces that bundle from the two face bundles in `packages/viewer/lib`
and `packages/ftview-viewer/lib`, which `scripts/build-viewer-face.mjs` and
`scripts/build-ftview-face.mjs` build from this repository's own sources first (`npm run build:client`
runs all three in that order). Each face body is copied verbatim into its own closure inside the one
registration — both declare their own `React` binding, document-preview id, stylesheet text and
helpers — and the merged plugin exports the union of the two faces' `inject` lists and an `apply`
that runs both. Nothing is re-authored, retransformed or re-hashed.

The face builds carry the two transforms AryaCode's client toolchain used to supply: a CSS-module
transform (a scoped class map plus a one-shot `<style data-plugin-css=…>`) and the workspace-address
helpers, vendored at `packages/viewer/src/client/vendor/workspace-path.ts` because the harness package
that provided them is not published. React, react-dom and the client primitives stay external, as the
Shell provides them.

Two consequences worth stating:

- **One row mounts both previews.** The Shell only scans the client face of packages a mounted row
  resolves to, so the `viewers` row names this package's root, and `lib/index.js` exists to be that
  mount point. Its `apply` registers nothing.
- **The bundle package root is a plugin entry.** `exports["."]` is `lib/index.js`; the patch is
  reached through `dsh.bundle.patch`, not through the package root.

Client faces add no model context, so context cost is unaffected. The tool rows stay independent:
switching `l5x-read` or `ftview-read` off removes schemas and guidance and leaves the previews
mounted.

## Distribution

The bundle is packed as one self-contained tarball; its one dependency is the Optix component from the
registry (`@aryacode/dsh-tool-ft-optix`, a plain version range):

```
dsh-engineering-<version>.tgz
  ├── cordis.patch.yml        the rows (inserts only)
  ├── lib/client.js           both previews, one registration
  ├── lib/index.js            the host half the `viewers` row mounts
  └── vendor/{l5x,ftview,mwi} the vendored components and their assets
```

No `@aryacode/*` package is a dependency, so a profile installs one thing and toggles rows inside it.
The release procedure is in [packaging](port/packaging.md).

## Backups

Every product backs up into one workspace tree, so a backup means the same place in every skill:

```
<workspace>/backups/<product>/<subject>/<UTC stamp>/
    backup-manifest.json      every copied file: relative path + SHA-256
    <the copy>
```

| Product | Folder | Subject | Taken |
|---|---|---|---|
| MotionWorks IEC | `motionworks` | project name | on `mw_project_open`, once per project, and before an edit that finds none |
| Studio 5000 | `l5x` | project name | on request; drafts and SDK builds already write new files |
| FactoryTalk View | `ftview` | export folder name | on request; `ftview_apply` already writes a new folder |
| FactoryTalk Optix | `optix` | project name | on request, as a manual Studio export into that folder |

The manifest is `{ "files": [ { "path": "<relative path>", "sha256": "<hex>" }, … ] }`, the same shape
MotionWorks writes; a restore re-hashes each file before using the copy.

MotionWorks is the one product whose backup is a *contract*: its identity record under
`<workspace>/.motionworks/attached/records/` names the copy, and the shipped bridge
(`Get-DirectIdentity`) and the read-only engine (`assert_direct_attached`) refuse a real project without
it. Both guards accept a record written before 0.4.21 that points at the old
`.motionworks/attached/backups` root, so existing workspaces keep working without a migration.

Optix has no skill and no file tooling in this bundle — its tree is the prebuilt component — so its row
has the location but not an automated action; a backup there is a Studio project export copied into the
same tree.

Never write `<workspace>/_backups` or the pre-0.4.21 `<workspace>/backups/<project>/<stamp>/` layout.
They are read-only history: `_backups` predates this bundle, and the `<project>` layout was MotionWorks
0.4.13–0.4.20.

## Compatibility

The bundle is pinned to the DSH `0.2.x` line: `@deepseek-ai/dsh-tool-skill` `^0.2.0-rc.2` and
Cordis `~4.0.4` (peer). A profile on another line refuses the bundle at boot rather than composing
it partially.

## Verification

```sh
pnpm test          # patch invariants, docs agreement, tool reference, client face
pnpm build:client  # build both faces from source, then lib/client.js
pnpm e2e:ladder    # render the built ladder face in headless Chrome and assert on the DOM
pnpm e2e:routines  # the same judgement for every routine of one export
pnpm e2e:actions   # click and key through the pane and assert it answers
pnpm docs:tools    # regenerate docs/reference/tools.md and tools.json
pnpm docs:check    # fail when the generated reference is stale
```

`test/patch.spec.mjs` parses `cordis.patch.yml` and asserts the exact inserted rows, the skill and
prefix wiring, and that eager exposure is preserved. `test/docs.spec.mjs` fails when the README
switches section, row ids or changelog heading drift from the patch or manifest.
`test/client-face.spec.mjs` fails when the committed `lib/client.js` is stale, when its registration
id stops matching the package name, when a face stops materializing, or when `apply` stops mounting
either preview.

`packages/viewer/test/render/suite.mjs` is the ladder face's end-to-end evidence: it mounts the built
`packages/viewer/lib/client.js` in headless Chrome, opens a routine the way a reader does and measures
the rendered document — no clipped text, one label per instruction, no label escaping its cell, no
overlapping labels, no instruction comment overprinting its neighbour, no index used as a pin name, and
every recorded exported value on screen. It needs Chrome or Edge installed and is kept out of
`pnpm test` for that reason.

Two companion runs cover what a case table cannot. `packages/viewer/test/render/routines.mjs` opens
every routine the organiser lists in one export — 256 routines across the CT9, CT10, CT8, Slitter,
PLC-5-migrated and Century fixtures at the time of writing — so a shape that only occurs in one
unscheduled program or one migrated routine is judged too. `packages/viewer/test/render/interactions.mjs`
drives the pane instead of only reading it: a click focuses an instruction, arrow keys walk the rung, a
rung number selects its rung, the source view shows the exported NeutralText, the organiser filter
narrows the tree, the tag table opens and sends a tag to the offline watch pane, the bottom panes
switch, and the console stays silent throughout.
